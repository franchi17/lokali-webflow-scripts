/**
 * Lokali — The Market (public vendor browse page).
 *
 * Powers /the-market: fetches vendors from Xano, renders cards by cloning the
 * Webflow template, and drives search / category / neighborhood / toggle filters,
 * sorting, the active-filter chips, sidebar counts, and the mobile filter drawer.
 *
 * Load AFTER lokali-api-client.js. No auth required (public list endpoints).
 *
 * Contract (must exist in Webflow — see lokali-the-market-webflow-guide.md §5):
 *   #browse-search                text input
 *   #browse-location              <select> (script populates options)
 *   #browse-result-count          <strong> (hero "N vendors found")
 *   #browse-grid-count            <strong> ("Showing N vendors")
 *   #browse-vendor-grid           grid holding ONE [data-lokali-vendor-card] template + #browse-empty-state
 *   #browse-empty-state           hidden empty state
 *   #browse-active-filters        empty strip for chips
 *   [data-lokali-category-filter] wrapper; each .filter-item has [data-category-slug] + a .filter-count-pill
 *   #browse-toggle-new / -founding / -verified   the .toggle-switch elements
 *   #sort-match / #sort-new / #sort-az            desktop sort rows
 *   #browse-mobile-sort           mobile <select>
 *   #browse-mobile-filter-btn / #browse-filter-backdrop / #browse-sidebar / #browse-close-filters  (drawer)
 *
 * Optional window overrides (set before this script):
 *   window.LOKALI_BROWSE_PROFILE_BASE  default '/vendors/'  (card click target prefix)
 *   window.LOKALI_VERIFIED_FIELD       vendor field name used for the Verified flag
 *   window.LOKALI_SPOTLIGHT_FIELD      vendor field name used for the Spotlight flag
 *   window.LOKALI_BROWSE_PER_PAGE      default 100 (page size when fetching a neighborhood)
 */
(function () {
  'use strict';

  var PROFILE_BASE = (typeof window.LOKALI_BROWSE_PROFILE_BASE === 'string' && window.LOKALI_BROWSE_PROFILE_BASE) || '/vendors/';
  var PER_PAGE = (typeof window.LOKALI_BROWSE_PER_PAGE === 'number' && window.LOKALI_BROWSE_PER_PAGE) || 100;
  var AREA_KEY = 'LOKALI_BROWSE_AREA';
  var NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // "new this week"

  /* Category style table keyed by Xano category id (guide §5.2).
     pill = card pill class, emoji + bg used for the avatar. */
  var CAT_BY_ID = {
    1: { slug: 'handcrafted', pill: 'cat-artisan',  emoji: '🎨', bg: '#FFF8E6', label: 'Handcrafted Goods' },
    2: { slug: 'business',    pill: 'cat-biz',      emoji: '💼', bg: '#F0F0F8', label: 'Business' },
    3: { slug: 'beauty',      pill: 'cat-beauty',   emoji: '💄', bg: '#FEF3F2', label: 'Beauty' },
    4: { slug: 'children',    pill: 'cat-kids',     emoji: '📚', bg: '#E6F1FB', label: 'Children' },
    5: { slug: 'events',      pill: 'cat-photo',    emoji: '📸', bg: '#F3EBFF', label: 'Events' },
    6: { slug: 'food',        pill: 'cat-food',     emoji: '🍽️', bg: '#FFF3EA', label: 'Food' },
    7: { slug: 'wellness',    pill: 'cat-wellness', emoji: '🧘', bg: '#EAFAF2', label: 'Wellness' },
    8: { slug: 'home',        pill: 'cat-home',     emoji: '🏡', bg: '#F7F6FC', label: 'Home' }
  };
  var DEFAULT_CAT = { slug: 'other', pill: 'cat-biz', emoji: '•', bg: '#F0F0F8', label: 'Vendor' };

  var SLUG_TO_ID = {};
  (function () {
    for (var id in CAT_BY_ID) { if (CAT_BY_ID.hasOwnProperty(id)) SLUG_TO_ID[CAT_BY_ID[id].slug] = parseInt(id, 10); }
  })();
  // tolerate the mockup's short demo slugs as aliases of the canonical ones
  SLUG_TO_ID.artisan = SLUG_TO_ID.handcrafted;
  SLUG_TO_ID.biz     = SLUG_TO_ID.business;
  SLUG_TO_ID.kids    = SLUG_TO_ID.children;
  SLUG_TO_ID.photo   = SLUG_TO_ID.events;

  // ── state ──
  var _allVendors = [];          // vendors for the selected neighborhood
  var _locationsById = {};       // id -> { id, label, name }
  var _categoriesById = {};      // id -> { id, name } from API (for pill labels)
  var _cardTemplate = null;      // cloned card node (template removed from DOM)
  var _grid = null;
  var _emptyState = null;
  var _renderedCards = [];

  var activeLocationId = 'all';  // 'all' or numeric id
  var activeCategory = 'all';    // slug
  var activeSort = 'best_match'; // best_match | newest | a_z
  var showNewOnly = false;
  var showFoundingOnly = false;
  var showVerifiedOnly = false;
  var searchTerm = '';

  // ── tiny helpers ──
  function el(id) { return document.getElementById(id); }
  function setText(node, txt) { if (node) node.textContent = txt; }
  function showEl(node, disp) { if (node) { node.style.display = disp || ''; node.classList.remove('w-condition-invisible'); } }
  function hideEl(node) { if (node) node.style.display = 'none'; }
  function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function extractList(d) {
    if (!d) return [];
    if (Array.isArray(d)) return d;
    var keys = ['items', 'records', 'data', 'vendors', 'result', 'results'];
    var i;
    for (i = 0; i < keys.length; i++) { if (Array.isArray(d[keys[i]])) return d[keys[i]]; }
    if (d.data && typeof d.data === 'object') {
      for (i = 0; i < keys.length; i++) { if (Array.isArray(d.data[keys[i]])) return d.data[keys[i]]; }
    }
    return [];
  }

  // ── vendor field accessors (schema confirmed May 2026) ──
  function vName(v)    { return v.business_name || v.businessName || 'Vendor'; }
  function vTagline(v) { return v.business_tagline || v.tagline || v.business_description || ''; }
  function vCreated(v) {
    var c = v.created_at;
    if (c == null) return 0;
    return typeof c === 'number' ? c : (Date.parse(c) || 0);
  }
  function vIsNew(v)       { var t = vCreated(v); return t > 0 && (Date.now() - t) < NEW_WINDOW_MS; }
  function vIsFounding(v)  { return v.is_founding_member === true; }
  function vIsVerified(v) {
    var f = window.LOKALI_VERIFIED_FIELD;
    if (f && v[f] != null) return v[f] === true;
    return v.is_verified === true; // paid "Verified" tier — selective, NOT is_approved (every listed vendor is approved)
  }
  function vIsSpotlight(v) {
    var f = window.LOKALI_SPOTLIGHT_FIELD;
    if (f && v[f] != null) return v[f] === true;
    return v.is_spotlight === true || v.is_featured === true;
  }
  function vCategoryStyle(v) {
    var ids = Array.isArray(v.categories_id) ? v.categories_id : (v.categories_id != null ? [v.categories_id] : []);
    for (var i = 0; i < ids.length; i++) {
      if (CAT_BY_ID[ids[i]]) {
        var base = CAT_BY_ID[ids[i]];
        var apiCat = _categoriesById[ids[i]];
        return { pill: base.pill, emoji: base.emoji, bg: base.bg, label: (apiCat && apiCat.name) || base.label };
      }
    }
    return DEFAULT_CAT;
  }
  function vCategoryIds(v) {
    return Array.isArray(v.categories_id) ? v.categories_id : (v.categories_id != null ? [v.categories_id] : []);
  }
  function vAreaLabel(v) {
    var ids = Array.isArray(v.locations_id) ? v.locations_id : (v.locations_id != null ? [v.locations_id] : []);
    for (var i = 0; i < ids.length; i++) {
      if (_locationsById[ids[i]]) return _locationsById[ids[i]].label;
    }
    return '';
  }
  function vProfileHref(v) { return PROFILE_BASE + (v.slug || v.id); }

  // ── load reference data (categories + locations) ──
  function loadRefData() {
    return Promise.all([
      window.LokaliAPI.data.categories(),
      window.LokaliAPI.data.locations()
    ]).then(function (res) {
      var cats = extractList(res[0] && res[0].data);
      cats.forEach(function (c) {
        var id = c.id != null ? c.id : c.category_id;
        if (id != null) _categoriesById[id] = { id: id, name: c.name || c.category_name || '' };
      });

      var locs = extractList(res[1] && res[1].data);
      locs.forEach(function (l) {
        var id = l.id != null ? l.id : l.location_id;
        if (id == null) return;
        var name = l.name || l.location_name || l.title || ('Location ' + id);
        var state = l.state || l.state_code || '';
        _locationsById[id] = { id: id, name: name, label: state ? (name + ', ' + state) : name };
      });
    });
  }

  // ── populate the neighborhood <select> from locations ──
  function populateLocationSelect() {
    var sel = el('browse-location');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = '';
    var all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'All neighborhoods';
    sel.appendChild(all);
    Object.keys(_locationsById).forEach(function (id) {
      var o = document.createElement('option');
      o.value = String(id);
      o.textContent = _locationsById[id].name;
      sel.appendChild(o);
    });
    // restore selection if still valid
    sel.value = current && (current === 'all' || _locationsById[current]) ? current : String(activeLocationId);
  }

  function resolveInitialLocation() {
    var byUrl = null;
    try {
      var qs = new URLSearchParams(window.location.search);
      byUrl = qs.get('location_id');
    } catch (e) {}
    var byStore = null;
    try { byStore = localStorage.getItem(AREA_KEY); } catch (e) {}
    var candidate = byUrl || byStore || 'all';
    if (candidate !== 'all' && !_locationsById[candidate]) candidate = 'all';
    activeLocationId = candidate;
  }

  // ── fetch vendors for the active neighborhood ──
  function fetchVendors() {
    var loading = el('browse-loading');
    showEl(loading, 'block');
    var params = { page: 1, per_page: PER_PAGE };
    if (activeLocationId !== 'all') params.location_id = activeLocationId;

    return window.LokaliAPI.vendors.list(params).then(function (out) {
      hideEl(loading);
      var list = extractList(out && out.data);
      // defensive: only active vendors
      _allVendors = list.filter(function (v) { return v && v.is_active !== false; });
      updateCategoryCounts();
      applyFilters();
    });
  }

  // ── sidebar category count pills ──
  function updateCategoryCounts() {
    var container = document.querySelector('[data-lokali-category-filter]');
    if (!container) return;
    var items = container.querySelectorAll('.filter-item[data-category-slug]');
    for (var i = 0; i < items.length; i++) {
      var slug = items[i].getAttribute('data-category-slug');
      var pill = items[i].querySelector('.filter-count-pill');
      if (!pill) continue;
      var count;
      if (slug === 'all') {
        count = _allVendors.length;
      } else {
        var catId = SLUG_TO_ID[slug];
        count = _allVendors.filter(function (v) { return vCategoryIds(v).indexOf(catId) !== -1; }).length;
      }
      pill.textContent = String(count);
    }
  }

  // ── filter + sort + render ──
  function applyFilters() {
    var q = searchTerm.toLowerCase().trim();
    var catId = activeCategory === 'all' ? null : SLUG_TO_ID[activeCategory];

    var visible = _allVendors.filter(function (v) {
      if (catId != null && vCategoryIds(v).indexOf(catId) === -1) return false;
      if (showNewOnly && !vIsNew(v)) return false;
      if (showFoundingOnly && !vIsFounding(v)) return false;
      if (showVerifiedOnly && !vIsVerified(v)) return false;
      if (q) {
        var hay = (vName(v) + ' ' + vTagline(v) + ' ' + vCategoryStyle(v).label).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    sortVendors(visible);
    renderGrid(visible);
    updateCounts(visible.length);
    updateActiveFilters();
    updateMobileIndicator();
  }

  function sortVendors(list) {
    if (activeSort === 'a_z') {
      list.sort(function (a, b) { return vName(a).localeCompare(vName(b)); });
    } else if (activeSort === 'newest') {
      list.sort(function (a, b) { return vCreated(b) - vCreated(a); });
    } else { // best_match: spotlight > founding > verified > newest
      list.sort(function (a, b) {
        return rank(b) - rank(a) || (vCreated(b) - vCreated(a));
      });
    }
  }
  function rank(v) {
    return (vIsSpotlight(v) ? 4 : 0) + (vIsFounding(v) ? 2 : 0) + (vIsVerified(v) ? 1 : 0);
  }

  function renderGrid(list) {
    if (!_grid || !_cardTemplate) return;
    // remove previously rendered cards
    _renderedCards.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
    _renderedCards = [];

    list.forEach(function (v) {
      var card = buildCard(v);
      if (_emptyState) _grid.insertBefore(card, _emptyState);
      else _grid.appendChild(card);
      _renderedCards.push(card);
    });

    if (_emptyState) (list.length === 0 ? showEl(_emptyState, 'block') : hideEl(_emptyState));
  }

  function buildCard(v) {
    var card = _cardTemplate.cloneNode(true);
    var style = vCategoryStyle(v);

    // avatar
    var avatar = card.querySelector('[data-lokali-vendor-avatar]');
    if (avatar) { avatar.textContent = style.emoji; try { avatar.style.backgroundColor = style.bg; } catch (e) {} }

    // name + tagline
    setText(card.querySelector('[data-lokali-vendor-name]'), vName(v));
    setText(card.querySelector('[data-lokali-vendor-tagline]'), vTagline(v));

    // area (preserve the dot span if present)
    setAreaText(card.querySelector('[data-lokali-vendor-area]'), vAreaLabel(v));

    // category pill
    var pill = card.querySelector('[data-lokali-vendor-category]');
    if (pill) { pill.className = 'cat-pill ' + style.pill; pill.textContent = style.emoji + ' ' + style.label; }

    // badges
    toggleBadge(card.querySelector('[data-lokali-vendor-founding]'),  vIsFounding(v));
    toggleBadge(card.querySelector('[data-lokali-vendor-new]'),       vIsNew(v));
    toggleBadge(card.querySelector('[data-lokali-vendor-verified]'),  vIsVerified(v));
    var spot = vIsSpotlight(v);
    toggleBadge(card.querySelector('[data-lokali-vendor-spotlight]'), spot);
    if (spot) card.classList.add('vcard-spotlight');

    // contact buttons
    bindContact(card.querySelector('[data-lokali-vendor-email]'),    v.contact_email ? 'mailto:' + v.contact_email : null);
    bindContact(card.querySelector('[data-lokali-vendor-call]'),     v.phone_number ? 'tel:' + v.phone_number : null);
    bindContact(card.querySelector('[data-lokali-vendor-whatsapp]'), (v.whatsapp_messages && v.phone_number) ? 'https://wa.me/' + digits(v.phone_number) : null);

    // card click → profile
    var href = vProfileHref(v);
    var link = card.querySelector('[data-lokali-vendor-link]') || card;
    link.style.cursor = 'pointer';
    link.addEventListener('click', function () { window.location.href = href; });

    return card;
  }

  function setAreaText(node, txt) {
    if (!node) return;
    var dot = node.querySelector('.vcard-area-dot');
    node.textContent = '';
    if (dot) { node.appendChild(dot); node.appendChild(document.createTextNode(' ' + txt)); }
    else { node.textContent = txt; }
  }

  function toggleBadge(node, on) {
    if (!node) return;
    if (on) showEl(node, 'inline-flex'); else hideEl(node);
  }

  function bindContact(node, href) {
    if (!node) return;
    if (!href) { hideEl(node); return; }
    showEl(node, 'inline-flex');
    node.onclick = function (ev) {
      ev.stopPropagation(); // don't trigger card navigation
      ev.preventDefault();  // don't submit/jump if it's a <button>/<a>
      if (href.indexOf('http') === 0) window.open(href, '_blank');
      else window.location.href = href;
    };
  }

  function updateCounts(n) {
    setText(el('browse-result-count'), String(n));
    setText(el('browse-grid-count'), String(n));
  }

  // ── active filter chips ──
  function updateActiveFilters() {
    var strip = el('browse-active-filters');
    if (!strip) return;
    strip.innerHTML = '';

    if (activeLocationId !== 'all' && _locationsById[activeLocationId]) {
      addChip(strip, _locationsById[activeLocationId].name, function () { setLocation('all'); });
    }
    if (activeCategory !== 'all') {
      var cs = CAT_BY_ID[SLUG_TO_ID[activeCategory]];
      addChip(strip, cs ? cs.label : activeCategory, function () { setCategory('all'); });
    }
    if (showNewOnly)      addChip(strip, 'New this week',     function () { setToggle('new', false); });
    if (showFoundingOnly) addChip(strip, 'Founding vendors',  function () { setToggle('founding', false); });
    if (showVerifiedOnly) addChip(strip, 'Verified',          function () { setToggle('verified', false); });
  }

  function addChip(strip, label, onRemove) {
    var chip = document.createElement('span');
    chip.className = 'active-filter-chip';
    chip.appendChild(document.createTextNode(label + ' '));
    var x = document.createElement('span');
    x.className = 'remove-x';
    x.textContent = '×';
    x.addEventListener('click', onRemove);
    chip.appendChild(x);
    strip.appendChild(chip);
  }

  function updateMobileIndicator() {
    var btn = el('browse-mobile-filter-btn');
    if (!btn) return;
    var has = activeCategory !== 'all' || showNewOnly || showFoundingOnly || showVerifiedOnly ||
              activeLocationId !== 'all' || !!searchTerm;
    btn.classList.toggle('has-filters', has);
  }

  // ── filter setters ──
  function setLocation(idOrAll) {
    activeLocationId = idOrAll;
    var sel = el('browse-location');
    if (sel) sel.value = String(idOrAll);
    try { idOrAll === 'all' ? localStorage.removeItem(AREA_KEY) : localStorage.setItem(AREA_KEY, String(idOrAll)); } catch (e) {}
    fetchVendors(); // neighborhood change = refetch
  }

  function setCategory(slug) {
    activeCategory = slug;
    var items = document.querySelectorAll('[data-lokali-category-filter] .filter-item[data-category-slug]');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', items[i].getAttribute('data-category-slug') === slug);
    }
    applyFilters();
  }

  function setToggle(which, on) {
    var sw;
    if (which === 'new')      { showNewOnly = on;      sw = el('browse-toggle-new'); }
    if (which === 'founding') { showFoundingOnly = on; sw = el('browse-toggle-founding'); }
    if (which === 'verified') { showVerifiedOnly = on; sw = el('browse-toggle-verified'); }
    if (sw) sw.classList.toggle('on', on);
    applyFilters();
  }

  function setSort(sort) {
    activeSort = sort;
    var ids = { best_match: 'sort-match', newest: 'sort-new', a_z: 'sort-az' };
    ['sort-match', 'sort-new', 'sort-az'].forEach(function (id) {
      var row = el(id);
      if (row) row.classList.toggle('active', id === ids[sort]);
    });
    var msel = el('browse-mobile-sort');
    if (msel && msel.value !== sort) msel.value = sort;
    applyFilters();
  }

  // ── drawer ──
  function openFilters() {
    var sb = el('browse-sidebar'), bd = el('browse-filter-backdrop');
    if (sb) sb.classList.add('open');
    if (bd) bd.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeFilters() {
    var sb = el('browse-sidebar'), bd = el('browse-filter-backdrop');
    if (sb) sb.classList.remove('open');
    if (bd) bd.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── wire up events ──
  function bindEvents() {
    var search = el('browse-search');
    if (search) {
      search.addEventListener('input', debounce(function () {
        searchTerm = search.value || '';
        applyFilters();
      }, 200));
    }

    var loc = el('browse-location');
    if (loc) loc.addEventListener('change', function () { setLocation(loc.value); });

    var items = document.querySelectorAll('[data-lokali-category-filter] .filter-item[data-category-slug]');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        item.addEventListener('click', function () { setCategory(item.getAttribute('data-category-slug')); });
      })(items[i]);
    }

    bindToggleRow('browse-toggle-new', 'new', function () { return showNewOnly; });
    bindToggleRow('browse-toggle-founding', 'founding', function () { return showFoundingOnly; });
    bindToggleRow('browse-toggle-verified', 'verified', function () { return showVerifiedOnly; });

    bindSortRow('sort-match', 'best_match');
    bindSortRow('sort-new', 'newest');
    bindSortRow('sort-az', 'a_z');

    var msel = el('browse-mobile-sort');
    if (msel) msel.addEventListener('change', function () { setSort(msel.value); });

    // drawer
    var openBtn = el('browse-mobile-filter-btn');
    var backdrop = el('browse-filter-backdrop');
    var closeX = el('browse-close-filters');
    if (openBtn) openBtn.addEventListener('click', openFilters);
    if (backdrop) backdrop.addEventListener('click', closeFilters);
    if (closeX) closeX.addEventListener('click', closeFilters);
  }

  function bindToggleRow(switchId, which, getState) {
    var sw = el(switchId);
    if (!sw) return;
    var row = sw.closest('.new-toggle, .founding-toggle, .verified-toggle') || sw.parentElement || sw;
    row.addEventListener('click', function () { setToggle(which, !getState()); });
  }

  function bindSortRow(rowId, sort) {
    var row = el(rowId);
    if (row) row.addEventListener('click', function () { setSort(sort); });
  }

  // ── init ──
  function init() {
    if (!window.LokaliAPI) {
      console.error('[lokali-browse] LokaliAPI not found — load lokali-api-client.js first.');
      return;
    }
    _grid = el('browse-vendor-grid');
    _emptyState = el('browse-empty-state');
    if (!_grid) { console.error('[lokali-browse] #browse-vendor-grid not found.'); return; }

    // capture the first card as the template, then remove ALL template/placeholder cards
    var first = _grid.querySelector('[data-lokali-vendor-card]');
    if (!first) { console.error('[lokali-browse] no [data-lokali-vendor-card] template in the grid.'); return; }
    _cardTemplate = first.cloneNode(true);
    var placeholders = _grid.querySelectorAll('[data-lokali-vendor-card]');
    for (var i = 0; i < placeholders.length; i++) {
      if (placeholders[i].parentNode) placeholders[i].parentNode.removeChild(placeholders[i]);
    }
    if (_emptyState) hideEl(_emptyState);

    bindEvents();

    loadRefData()
      .then(function () {
        resolveInitialLocation();
        populateLocationSelect();
        var sel = el('browse-location');
        if (sel) sel.value = String(activeLocationId);
        return fetchVendors();
      })
      .catch(function (err) {
        console.error('[lokali-browse] init failed:', err);
        if (_emptyState) showEl(_emptyState, 'block');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
