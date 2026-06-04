/**
 * Lokali — The Market (public vendor browse page).
 *
 * Powers /the-market: fetches vendors from Xano and RENDERS THE CARDS ITSELF
 * (builds the markup + injects the CSS), so it does not depend on a Webflow
 * card element/component. Also drives search / category / neighborhood / toggle
 * filters, sorting, active-filter chips, sidebar counts, and the mobile drawer.
 *
 * Load AFTER lokali-api-client.js. No auth required (public list endpoints).
 *
 * Contract (must exist in Webflow — light-DOM elements, NOT a code component):
 *   #browse-search                text input
 *   #browse-location              <select> (script populates options)
 *   #browse-result-count          <strong> (hero "N vendors found")
 *   #browse-grid-count            <strong> ("Showing N vendors")
 *   #browse-vendor-grid           an EMPTY div — the script fills it with cards
 *   #browse-empty-state           optional hidden empty state (sibling or child of the grid)
 *   #browse-active-filters        empty strip for chips
 *   [data-lokali-category-filter] wrapper; each .filter-item has [data-category-slug] + a .filter-count-pill
 *   #browse-toggle-new / -founding / -verified   the .toggle-switch elements
 *   #sort-match / #sort-new / #sort-az            desktop sort rows
 *   #browse-mobile-sort           mobile <select>
 *   #browse-mobile-filter-btn / #browse-filter-backdrop / #browse-sidebar / #browse-close-filters  (drawer)
 *
 * Optional window overrides (set before this script):
 *   window.LOKALI_BROWSE_PROFILE_BASE  default '/vendors/'  (card click target prefix)
 *   window.LOKALI_VERIFIED_FIELD       vendor field for the Verified flag (default 'is_verified')
 *   window.LOKALI_SPOTLIGHT_FIELD      vendor field for the Spotlight flag (default 'is_spotlight')
 *   window.LOKALI_BROWSE_PER_PAGE      default 100 (page size when fetching a neighborhood)
 */
(function () {
  'use strict';

  var PROFILE_BASE = (typeof window.LOKALI_BROWSE_PROFILE_BASE === 'string' && window.LOKALI_BROWSE_PROFILE_BASE) || '/vendors/';
  var PER_PAGE = (typeof window.LOKALI_BROWSE_PER_PAGE === 'number' && window.LOKALI_BROWSE_PER_PAGE) || 100;
  var AREA_KEY = 'LOKALI_BROWSE_AREA';
  var NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // "new this week"

  /* Category style table keyed by Xano category id (guide §5.2). */
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

  /* Card CSS — injected once so the script's cards are fully styled without Webflow. */
  var CARD_CSS = [
    ".vcard{background:#fff;border:.5px solid #EEEDF6;border-radius:12px;padding:1.1rem 1.15rem 1rem;cursor:pointer;transition:all .15s;position:relative;overflow:hidden;font-family:'Plus Jakarta Sans',sans-serif;}",
    ".vcard:hover{border-color:#D4AAFD;box-shadow:0 4px 16px rgba(96,2,238,.08);transform:translateY(-1px);}",
    ".vcard-spotlight{border-color:rgba(96,2,238,.2);background:linear-gradient(160deg,rgba(96,2,238,.02) 0%,#fff 60%);}",
    ".vcard-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;}",
    ".vcard-avatar{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;border:.5px solid rgba(0,0,0,.06);}",
    ".vcard-meta{flex:1;min-width:0;}",
    ".vcard-name-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;}",
    ".vcard-name{font-size:14px;font-weight:600;color:#1A1829;letter-spacing:-.2px;line-height:1.2;}",
    ".vcard-area{font-size:11px;color:#8E8BA6;display:flex;align-items:center;gap:4px;}",
    ".vcard-area-dot{width:5px;height:5px;border-radius:50%;background:#C8C6D8;flex-shrink:0;}",
    ".vcard .badge{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:100px;font-size:10px;line-height:1;flex-shrink:0;font-weight:600;}",
    ".vcard .badge-founding{background:rgba(201,162,42,.12);color:#C9A22A;border:.5px solid rgba(201,162,42,.25);}",
    ".vcard .badge-new{background:#EAFAF2;color:#1D6A45;border:.5px solid rgba(29,106,69,.15);}",
    ".vcard .badge-spotlight{background:rgba(96,2,238,.08);color:#6002EE;border:.5px solid rgba(96,2,238,.15);}",
    ".vcard .badge-verified{background:#E6F1FB;color:#1565C0;border:.5px solid rgba(21,101,192,.2);}",
    ".vcard .cat-pill{display:inline-flex;align-items:center;font-size:11px;font-weight:500;border-radius:100px;padding:3px 10px;margin-bottom:8px;}",
    ".vcard .cat-food{background:#FFF3EA;color:#FF6B00;}",
    ".vcard .cat-photo{background:#F3EBFF;color:#6002EE;}",
    ".vcard .cat-wellness{background:#EAFAF2;color:#1D6A45;}",
    ".vcard .cat-beauty{background:#FEF3F2;color:#C0392B;}",
    ".vcard .cat-kids{background:#E6F1FB;color:#1A5C9A;}",
    ".vcard .cat-home{background:#F7F6FC;color:#4A4761;border:.5px solid #EEEDF6;}",
    ".vcard .cat-artisan{background:#FFF8E6;color:#8A5A00;}",
    ".vcard .cat-biz{background:#F0F0F8;color:#4A4761;}",
    ".vcard-tagline{font-size:12.5px;color:#4A4761;line-height:1.5;margin-bottom:12px;}",
    ".vcard-actions{display:flex;gap:6px;flex-wrap:wrap;}",
    ".vcard .contact-btn{font-size:11px;font-weight:500;font-family:inherit;padding:5px 10px;border-radius:6px;border:.5px solid #EEEDF6;background:#F7F6FC;color:#4A4761;cursor:pointer;transition:all .1s;display:inline-flex;align-items:center;gap:4px;}",
    ".vcard .contact-btn:hover{border-color:#6002EE;color:#6002EE;background:#F3EBFF;}"
  ].join('');

  // ── state ──
  var _allVendors = [];
  var _locationsById = {};
  var _categoriesById = {};
  var _grid = null;
  var _emptyState = null;
  var _renderedCards = [];

  var activeLocationId = 'all';
  var activeCategory = 'all';
  var activeSort = 'best_match';
  var showNewOnly = false;
  var showFoundingOnly = false;
  var showVerifiedOnly = false;
  var searchTerm = '';

  // ── tiny helpers ──
  function el(id) { return document.getElementById(id); }
  function ce(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function setText(node, txt) { if (node) node.textContent = txt; }
  function showEl(node, disp) { if (node) { node.style.display = disp || ''; node.classList.remove('w-condition-invisible'); } }
  function hideEl(node) { if (node) node.style.display = 'none'; }
  function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  function extractList(d) {
    if (!d) return [];
    if (Array.isArray(d)) return d;
    var keys = ['items', 'records', 'data', 'vendors', 'result', 'results'], i;
    for (i = 0; i < keys.length; i++) { if (Array.isArray(d[keys[i]])) return d[keys[i]]; }
    if (d.data && typeof d.data === 'object') {
      for (i = 0; i < keys.length; i++) { if (Array.isArray(d.data[keys[i]])) return d.data[keys[i]]; }
    }
    return [];
  }

  // ── vendor field accessors (schema confirmed May 2026) ──
  function vName(v)    { return v.business_name || v.businessName || 'Vendor'; }
  function vTagline(v) { return v.business_tagline || v.tagline || v.business_description || ''; }
  function vCreated(v) { var c = v.created_at; if (c == null) return 0; return typeof c === 'number' ? c : (Date.parse(c) || 0); }
  function vIsNew(v)       { var t = vCreated(v); return t > 0 && (Date.now() - t) < NEW_WINDOW_MS; }
  function vIsFounding(v)  { return v.is_founding_member === true; }
  function vIsVerified(v)  { var f = window.LOKALI_VERIFIED_FIELD; if (f && v[f] != null) return v[f] === true; return v.is_verified === true; }
  function vIsSpotlight(v) { var f = window.LOKALI_SPOTLIGHT_FIELD; if (f && v[f] != null) return v[f] === true; return v.is_spotlight === true || v.is_featured === true; }
  function vCategoryIds(v) { return Array.isArray(v.categories_id) ? v.categories_id : (v.categories_id != null ? [v.categories_id] : []); }
  function vCategoryStyle(v) {
    var ids = vCategoryIds(v);
    for (var i = 0; i < ids.length; i++) {
      if (CAT_BY_ID[ids[i]]) {
        var base = CAT_BY_ID[ids[i]], apiCat = _categoriesById[ids[i]];
        return { pill: base.pill, emoji: base.emoji, bg: base.bg, label: (apiCat && apiCat.name) || base.label };
      }
    }
    return DEFAULT_CAT;
  }
  function vAreaLabel(v) {
    var ids = Array.isArray(v.locations_id) ? v.locations_id : (v.locations_id != null ? [v.locations_id] : []);
    for (var i = 0; i < ids.length; i++) { if (_locationsById[ids[i]]) return _locationsById[ids[i]].label; }
    return '';
  }
  function vProfileHref(v) { return PROFILE_BASE + (v.slug || v.id); }

  // ── reference data ──
  function loadRefData() {
    return Promise.all([
      window.LokaliAPI.data.categories(),
      window.LokaliAPI.data.locations()
    ]).then(function (res) {
      extractList(res[0] && res[0].data).forEach(function (c) {
        var id = c.id != null ? c.id : c.category_id;
        if (id != null) _categoriesById[id] = { id: id, name: c.name || c.category_name || '' };
      });
      extractList(res[1] && res[1].data).forEach(function (l) {
        var id = l.id != null ? l.id : l.location_id;
        if (id == null) return;
        var name = l.name || l.location_name || l.title || ('Location ' + id);
        var state = l.state || l.state_code || '';
        _locationsById[id] = { id: id, name: name, label: state ? (name + ', ' + state) : name };
      });
    });
  }

  function populateLocationSelect() {
    var sel = el('browse-location');
    if (!sel) return;
    sel.innerHTML = '';
    var all = ce('option'); all.value = 'all'; all.textContent = 'All neighborhoods'; sel.appendChild(all);
    Object.keys(_locationsById).forEach(function (id) {
      var o = ce('option'); o.value = String(id); o.textContent = _locationsById[id].name; sel.appendChild(o);
    });
  }

  function resolveInitialLocation() {
    var byUrl = null;
    try { byUrl = new URLSearchParams(window.location.search).get('location_id'); } catch (e) {}
    var byStore = null;
    try { byStore = localStorage.getItem(AREA_KEY); } catch (e) {}
    var candidate = byUrl || byStore || 'all';
    if (candidate !== 'all' && !_locationsById[candidate]) candidate = 'all';
    activeLocationId = candidate;
  }

  // ── fetch ──
  function fetchVendors() {
    var loading = el('browse-loading');
    showEl(loading, 'block');
    var params = { page: 1, per_page: PER_PAGE };
    if (activeLocationId !== 'all') params.location_id = activeLocationId;
    return window.LokaliAPI.vendors.list(params).then(function (out) {
      hideEl(loading);
      _allVendors = extractList(out && out.data).filter(function (v) { return v && v.is_active !== false; });
      updateCategoryCounts();
      applyFilters();
    });
  }

  // ── sidebar counts ──
  function updateCategoryCounts() {
    var container = document.querySelector('[data-lokali-category-filter]');
    if (!container) return;
    var items = container.querySelectorAll('.filter-item[data-category-slug]');
    for (var i = 0; i < items.length; i++) {
      var slug = items[i].getAttribute('data-category-slug');
      var pill = items[i].querySelector('.filter-count-pill');
      if (!pill) continue;
      var count;
      if (slug === 'all') { count = _allVendors.length; }
      else { var catId = SLUG_TO_ID[slug]; count = _allVendors.filter(function (v) { return vCategoryIds(v).indexOf(catId) !== -1; }).length; }
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
    if (activeSort === 'a_z') { list.sort(function (a, b) { return vName(a).localeCompare(vName(b)); }); }
    else if (activeSort === 'newest') { list.sort(function (a, b) { return vCreated(b) - vCreated(a); }); }
    else { list.sort(function (a, b) { return rank(b) - rank(a) || (vCreated(b) - vCreated(a)); }); }
  }
  function rank(v) { return (vIsSpotlight(v) ? 4 : 0) + (vIsFounding(v) ? 2 : 0) + (vIsVerified(v) ? 1 : 0); }

  function renderGrid(list) {
    if (!_grid) return;
    _renderedCards.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
    _renderedCards = [];
    list.forEach(function (v) {
      var card = buildCard(v);
      if (_emptyState && _emptyState.parentNode === _grid) _grid.insertBefore(card, _emptyState);
      else _grid.appendChild(card);
      _renderedCards.push(card);
    });
    if (_emptyState) (list.length === 0 ? showEl(_emptyState, 'block') : hideEl(_emptyState));
  }

  function badge(cls, glyph, title) { var b = ce('span', 'badge ' + cls); b.textContent = glyph; b.title = title; return b; }

  function addContact(parent, href, label) {
    if (!href) return;
    var b = ce('button', 'contact-btn');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', function (ev) {
      ev.stopPropagation(); ev.preventDefault();
      if (href.indexOf('http') === 0) window.open(href, '_blank');
      else window.location.href = href;
    });
    parent.appendChild(b);
  }

  function buildCard(v) {
    var style = vCategoryStyle(v);
    var card = ce('div', 'vcard' + (vIsSpotlight(v) ? ' vcard-spotlight' : ''));

    var header = ce('div', 'vcard-header');
    var avatar = ce('div', 'vcard-avatar'); avatar.textContent = style.emoji; avatar.style.backgroundColor = style.bg;
    var meta = ce('div', 'vcard-meta');
    var nameRow = ce('div', 'vcard-name-row');
    var name = ce('span', 'vcard-name'); name.textContent = vName(v); nameRow.appendChild(name);
    if (vIsFounding(v))  nameRow.appendChild(badge('badge-founding', '★', 'Founding vendor'));
    if (vIsNew(v))       nameRow.appendChild(badge('badge-new', '●', 'New this week'));
    if (vIsVerified(v))  nameRow.appendChild(badge('badge-verified', '✓', 'Verified'));
    if (vIsSpotlight(v)) nameRow.appendChild(badge('badge-spotlight', '✦', 'Spotlight'));
    var area = ce('div', 'vcard-area');
    area.appendChild(ce('span', 'vcard-area-dot'));
    area.appendChild(document.createTextNode(' ' + vAreaLabel(v)));
    meta.appendChild(nameRow); meta.appendChild(area);
    header.appendChild(avatar); header.appendChild(meta);
    card.appendChild(header);

    var pill = ce('span', 'cat-pill ' + style.pill); pill.textContent = style.emoji + ' ' + style.label;
    card.appendChild(pill);

    var tag = ce('div', 'vcard-tagline'); tag.textContent = vTagline(v);
    card.appendChild(tag);

    var actions = ce('div', 'vcard-actions');
    addContact(actions, v.contact_email ? 'mailto:' + v.contact_email : null, '✉ Email');
    addContact(actions, v.phone_number ? 'tel:' + v.phone_number : null, '📞 Call');
    addContact(actions, (v.whatsapp_messages && v.phone_number) ? 'https://wa.me/' + digits(v.phone_number) : null, '💬 WhatsApp');
    card.appendChild(actions);

    var href = vProfileHref(v);
    card.addEventListener('click', function () { window.location.href = href; });
    return card;
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
    if (showNewOnly)      addChip(strip, 'New this week',    function () { setToggle('new', false); });
    if (showFoundingOnly) addChip(strip, 'Founding vendors', function () { setToggle('founding', false); });
    if (showVerifiedOnly) addChip(strip, 'Verified',         function () { setToggle('verified', false); });
  }
  function addChip(strip, label, onRemove) {
    var chip = ce('span', 'active-filter-chip');
    chip.appendChild(document.createTextNode(label + ' '));
    var x = ce('span', 'remove-x'); x.textContent = '×'; x.addEventListener('click', onRemove);
    chip.appendChild(x); strip.appendChild(chip);
  }
  function updateMobileIndicator() {
    var btn = el('browse-mobile-filter-btn');
    if (!btn) return;
    var has = activeCategory !== 'all' || showNewOnly || showFoundingOnly || showVerifiedOnly || activeLocationId !== 'all' || !!searchTerm;
    btn.classList.toggle('has-filters', has);
  }

  // ── setters ──
  function setLocation(idOrAll) {
    activeLocationId = idOrAll;
    var sel = el('browse-location'); if (sel) sel.value = String(idOrAll);
    try { idOrAll === 'all' ? localStorage.removeItem(AREA_KEY) : localStorage.setItem(AREA_KEY, String(idOrAll)); } catch (e) {}
    fetchVendors();
  }
  function setCategory(slug) {
    activeCategory = slug;
    var items = document.querySelectorAll('[data-lokali-category-filter] .filter-item[data-category-slug]');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', items[i].getAttribute('data-category-slug') === slug);
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
    ['sort-match', 'sort-new', 'sort-az'].forEach(function (id) { var r = el(id); if (r) r.classList.toggle('active', id === ids[sort]); });
    var msel = el('browse-mobile-sort'); if (msel && msel.value !== sort) msel.value = sort;
    applyFilters();
  }

  // ── drawer ──
  function openFilters() {
    var sb = el('browse-sidebar'), bd = el('browse-filter-backdrop');
    if (sb) sb.classList.add('open'); if (bd) bd.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeFilters() {
    var sb = el('browse-sidebar'), bd = el('browse-filter-backdrop');
    if (sb) sb.classList.remove('open'); if (bd) bd.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── events ──
  function bindEvents() {
    var search = el('browse-search');
    if (search) search.addEventListener('input', debounce(function () { searchTerm = search.value || ''; applyFilters(); }, 200));

    var loc = el('browse-location');
    if (loc) loc.addEventListener('change', function () { setLocation(loc.value); });

    var items = document.querySelectorAll('[data-lokali-category-filter] .filter-item[data-category-slug]');
    for (var i = 0; i < items.length; i++) {
      (function (item) { item.addEventListener('click', function () { setCategory(item.getAttribute('data-category-slug')); }); })(items[i]);
    }

    bindToggleRow('browse-toggle-new', 'new', function () { return showNewOnly; });
    bindToggleRow('browse-toggle-founding', 'founding', function () { return showFoundingOnly; });
    bindToggleRow('browse-toggle-verified', 'verified', function () { return showVerifiedOnly; });

    bindSortRow('sort-match', 'best_match');
    bindSortRow('sort-new', 'newest');
    bindSortRow('sort-az', 'a_z');
    var msel = el('browse-mobile-sort'); if (msel) msel.addEventListener('change', function () { setSort(msel.value); });

    var openBtn = el('browse-mobile-filter-btn'); if (openBtn) openBtn.addEventListener('click', openFilters);
    var backdrop = el('browse-filter-backdrop'); if (backdrop) backdrop.addEventListener('click', closeFilters);
    var closeX = el('browse-close-filters'); if (closeX) closeX.addEventListener('click', closeFilters);
  }
  function bindToggleRow(switchId, which, getState) {
    var sw = el(switchId); if (!sw) return;
    var row = sw.closest('.new-toggle, .founding-toggle, .verified-toggle') || sw.parentElement || sw;
    row.addEventListener('click', function () { setToggle(which, !getState()); });
  }
  function bindSortRow(rowId, sort) { var r = el(rowId); if (r) r.addEventListener('click', function () { setSort(sort); }); }

  function injectStyles() {
    if (el('lokali-browse-styles')) return;
    var s = ce('style'); s.id = 'lokali-browse-styles'; s.textContent = CARD_CSS;
    document.head.appendChild(s);
  }

  // ── init ──
  function init() {
    if (!window.LokaliAPI) { console.error('[lokali-browse] LokaliAPI not found — load lokali-api-client.js first.'); return; }
    _grid = el('browse-vendor-grid');
    if (!_grid) { console.error('[lokali-browse] #browse-vendor-grid not found.'); return; }
    _emptyState = el('browse-empty-state');

    injectStyles();
    // clear any placeholder / leftover card (incl. a Webflow code-component host), keep the empty state
    Array.prototype.slice.call(_grid.children).forEach(function (k) { if (k !== _emptyState) _grid.removeChild(k); });
    if (_emptyState) hideEl(_emptyState);

    bindEvents();

    loadRefData()
      .then(function () {
        resolveInitialLocation();
        populateLocationSelect();
        var sel = el('browse-location'); if (sel) sel.value = String(activeLocationId);
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
