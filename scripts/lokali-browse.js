/**
 * Lokali — The Market (public vendor browse page).
 *
 * Powers /the-market. The script RENDERS BOTH the vendor cards AND the filter
 * sidebar itself (builds the markup + injects the CSS), so it does not depend on
 * Webflow elements/code-components for either. It drives search, category,
 * neighborhood, the three toggles, sorting, active-filter chips, sidebar counts,
 * and the mobile drawer.
 *
 * Load AFTER lokali-api-client.js. No auth required (public list endpoints).
 *
 * Required mount points in Webflow (plain light-DOM elements, NOT code components):
 *   #browse-search          text input
 *   #browse-location        <select> (script fills options)
 *   #browse-result-count    <strong> ("N vendors found")
 *   #browse-grid-count      <strong> ("Showing N vendors")
 *   #browse-vendor-grid     EMPTY div — script fills with cards
 *   #browse-filter-panel    EMPTY div — script fills with category list + toggles + sort
 * Optional:
 *   #browse-empty-state     hidden empty state (sibling/child of the grid)
 *   #browse-active-filters  empty strip for chips
 *   #browse-mobile-sort     mobile <select> (values best_match/newest/a_z)
 *   #browse-mobile-filter-btn / #browse-filter-backdrop / #browse-sidebar / #browse-close-filters (drawer)
 *
 * Optional window overrides (set before this script):
 *   window.LOKALI_BROWSE_PROFILE_BASE  default '/vendors/'
 *   window.LOKALI_VERIFIED_FIELD       vendor field for Verified flag (default 'is_verified')
 *   window.LOKALI_SPOTLIGHT_FIELD      vendor field for Spotlight flag (default 'is_spotlight')
 *   window.LOKALI_BROWSE_PER_PAGE      default 100
 */
(function () {
  'use strict';

  var PROFILE_BASE = (typeof window.LOKALI_BROWSE_PROFILE_BASE === 'string' && window.LOKALI_BROWSE_PROFILE_BASE) || '/vendors/';
  var PER_PAGE = (typeof window.LOKALI_BROWSE_PER_PAGE === 'number' && window.LOKALI_BROWSE_PER_PAGE) || 100;
  var AREA_KEY = 'LOKALI_BROWSE_AREA';
  var NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  // label = short sidebar label; bg/text = card pill colors (icon is masked to `text`).
  var CAT_BY_ID = {
    1: { slug: 'handcrafted', label: 'Handcrafted Goods', bg: '#FFF8E6', text: '#8A5A00' },
    2: { slug: 'business',    label: 'Business',          bg: '#F0F0F8', text: '#4A4761' },
    3: { slug: 'beauty',      label: 'Beauty',            bg: '#FEF3F2', text: '#C0392B' },
    4: { slug: 'children',    label: 'Children',          bg: '#E6F1FB', text: '#1A5C9A' },
    5: { slug: 'events',      label: 'Events',            bg: '#F3EBFF', text: '#6002EE' },
    6: { slug: 'food',        label: 'Food',              bg: '#FFF3EA', text: '#FF6B00' },
    7: { slug: 'wellness',    label: 'Wellness',          bg: '#EAFAF2', text: '#1D6A45' },
    8: { slug: 'home',        label: 'Home',              bg: '#F7F6FC', text: '#4A4761' }
  };

  var SLUG_TO_ID = {};
  (function () { for (var id in CAT_BY_ID) if (CAT_BY_ID.hasOwnProperty(id)) SLUG_TO_ID[CAT_BY_ID[id].slug] = parseInt(id, 10); })();
  SLUG_TO_ID.artisan = SLUG_TO_ID.handcrafted;
  SLUG_TO_ID.biz     = SLUG_TO_ID.business;
  SLUG_TO_ID.kids    = SLUG_TO_ID.children;
  SLUG_TO_ID.photo   = SLUG_TO_ID.events;

  // Sidebar lists. Icons are Webflow-hosted assets, recolored to match the design
  // via CSS mask (so PNG/SVG and any source color all render in the brand color).
  var ICON_VIOLET = '#6002EE';
  var ASSET = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/';
  var CATEGORY_LIST = [
    { slug: 'all',         label: 'All categories',    url: ASSET + '6a1af18050966f1b31aac321_star-regular.png' },
    { slug: 'beauty',      label: 'Beauty',            url: ASSET + '6a18f2524e31974a75003735_hair%20dryer.svg' },
    { slug: 'business',    label: 'Business',          url: ASSET + '6a18f6d4b01673d30ca9bcb8_briefcase.svg' },
    { slug: 'children',    label: 'Children',          url: ASSET + '6a18f6d4f1bbd4795f5345bc_backpack.svg' },
    { slug: 'events',      label: 'Events',            url: ASSET + '6a18f6d414c76bb968f180db_balloon.svg' },
    { slug: 'food',        label: 'Food',              url: ASSET + '6a186b067365d964abee8918_utensils-solid.png' },
    { slug: 'handcrafted', label: 'Handcrafted Goods', url: ASSET + '6a186b061a80eb9ba75f0d0a_scissors-solid.png' },
    { slug: 'home',        label: 'Home',              url: ASSET + '6a186b06a37dcea6514f15f9_house-regular.png' },
    { slug: 'wellness',    label: 'Wellness',          url: ASSET + '6a186b06cfcb6c4d6d1e1cf7_heart-regular.png' }
  ];
  var TOGGLE_LIST = [
    { key: 'new',      id: 'browse-toggle-new',      label: 'New this week',         color: '#1D6A45', url: ASSET + '6a1af53c6b8fa6046c223ce9_bullhorn-solid.png' },
    { key: 'founding', id: 'browse-toggle-founding', label: 'Founding vendors only', color: '#C9A22A', url: ASSET + '69f4dbb3533f0ee2046ab0fb_crown-solid.png' },
    { key: 'verified', id: 'browse-toggle-verified', label: 'Verified only',         color: '#0000E4', glyph: '✓' }
  ];
  var SORT_LIST = [
    { sort: 'best_match', id: 'sort-match', label: 'Best match',   url: ASSET + '6a1d92f85db0d873ff20900a_sort-solid.png' },
    { sort: 'newest',     id: 'sort-new',  label: 'Newest first',  url: ASSET + '6a1d92f83a64390307583b8e_bolt-solid.png' },
    { sort: 'a_z',        id: 'sort-az',   label: 'A → Z',         url: ASSET + '6a1d92f86dcb45f8402fe0ea_arrow-down-a-z-solid.png' }
  ];

  // Card icons (Webflow assets).
  var ICON_PIN      = ASSET + '6a1d9d9c67a9d9957b19c578_map-pin-solid.png';
  var ICON_EMAIL    = ASSET + '6a1f445d6fda20928afcb0fd_envelope-regular.png';
  var ICON_CALL     = ASSET + '6a21e2bf163c5945a1c0e919_phone-solid.png';
  var ICON_WHATSAPP = ASSET + '6a1f445dfb11386d2e5502cf_whatsapp-brands-solid.png';
  var ICON_TEXT     = ASSET + '6a1f445d06bc9a07f37fb0d9_comments-regular.png';
  var ICON_CROWN    = ASSET + '69f4dbb3533f0ee2046ab0fb_crown-solid.png';     // founding badge (matches sidebar)
  var ICON_BULLHORN = ASSET + '6a1af53c6b8fa6046c223ce9_bullhorn-solid.png';  // new badge (matches sidebar)
  var AREA_GREY     = '#6B6880'; // location text — a touch darker than slate for legibility

  // category slug -> sidebar icon URL (reused on the card pill)
  var SLUG_TO_URL = {};
  CATEGORY_LIST.forEach(function (c) { SLUG_TO_URL[c.slug] = c.url; });

  /* Card + filter-panel CSS — injected once so the script's UI is fully styled. */
  var CSS = [
    // ── card ──
    ".vcard{background:#fff;border:.5px solid #EEEDF6;border-radius:12px;padding:1.1rem 1.15rem 1rem;cursor:pointer;transition:all .15s;position:relative;overflow:hidden;font-family:'Plus Jakarta Sans',sans-serif;}",
    ".vcard:hover{border-color:#D4AAFD;box-shadow:0 4px 16px rgba(96,2,238,.08);transform:translateY(-1px);}",
    ".vcard-spotlight{border-color:rgba(96,2,238,.2);background:linear-gradient(160deg,rgba(96,2,238,.02) 0%,#fff 60%);}",
    ".vcard-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;}",
    ".vcard-avatar{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;flex-shrink:0;border:.5px solid rgba(0,0,0,.06);overflow:hidden;}",
    ".vcard-avatar-initials{background:#F3EBFF;color:#6002EE;letter-spacing:.5px;}",
    ".vcard-avatar-img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".vcard-meta{flex:1;min-width:0;}",
    ".vcard-name-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;}",
    ".vcard-name{font-size:14px;font-weight:600;color:#1A1829;letter-spacing:-.2px;line-height:1.2;}",
    ".vcard-area{font-size:11px;color:#6B6880;display:flex;align-items:center;gap:4px;}",
    ".vcard .badge{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:100px;font-size:12px;line-height:1;flex-shrink:0;font-weight:700;}",
    ".vcard .badge-founding{background:rgba(201,162,42,.22);color:#C9A22A;border:1px solid rgba(201,162,42,.45);}",
    ".vcard .badge-new{background:rgba(29,106,69,.18);color:#1D6A45;border:1px solid rgba(29,106,69,.35);}",
    ".vcard .badge-spotlight{background:rgba(96,2,238,.15);color:#6002EE;border:1px solid rgba(96,2,238,.35);}",
    ".vcard .badge-verified{background:rgba(0,0,228,.16);color:#0000E4;border:1px solid rgba(0,0,228,.4);}",
    ".vcard .cat-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;border-radius:100px;padding:3px 10px;margin-bottom:8px;}",
    ".vcard-tagline{font-size:12.5px;color:#4A4761;line-height:1.5;margin-bottom:12px;}",
    ".vcard-actions{display:flex;gap:6px;flex-wrap:wrap;}",
    ".vcard .contact-btn{font-size:11px;font-weight:500;font-family:inherit;padding:5px 10px;border-radius:6px;border:.5px solid #EEEDF6;background:#F7F6FC;color:#4A4761;cursor:pointer;transition:all .1s;display:inline-flex;align-items:center;gap:4px;}",
    ".vcard .contact-btn:hover{border-color:#6002EE;color:#6002EE;background:#F3EBFF;}",
    // ── filter panel ──
    "#browse-filter-panel{font-family:'Plus Jakarta Sans',sans-serif;}",
    "#browse-filter-panel .lk-filter-section{margin-bottom:1.5rem;}",
    "#browse-filter-panel .lk-filter-section:last-child{margin-bottom:0;}",
    "#browse-filter-panel .lk-filter-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#8E8BA6;margin-bottom:.6rem;}",
    "#browse-filter-panel .filter-item{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:8px;font-size:13px;line-height:1.45;color:#4A4761;cursor:pointer;transition:all .1s;margin-bottom:2px;user-select:none;}",
    "#browse-filter-panel .filter-item:hover{background:#F7F6FC;color:#1A1829;}",
    "#browse-filter-panel .filter-item.active{background:#F3EBFF;color:#6002EE;font-weight:600;}",
    "#browse-filter-panel .fi-left{display:flex;align-items:center;gap:8px;}",
    "#browse-filter-panel .lk-glyph-icon{font-size:13px;font-weight:700;width:16px;text-align:center;display:inline-block;flex-shrink:0;}",
    "#browse-filter-panel .filter-count-pill{font-size:10px;font-weight:600;background:#EEEDF6;color:#8E8BA6;border-radius:100px;padding:1px 7px;min-width:22px;text-align:center;}",
    "#browse-filter-panel .filter-item.active .filter-count-pill{background:rgba(96,2,238,.12);color:#6002EE;}",
    "#browse-filter-panel .lk-divider{height:.5px;background:#EEEDF6;margin:1rem 0;}",
    "#browse-filter-panel .lk-toggle{display:flex;align-items:center;justify-content:space-between;padding:6px 0;cursor:pointer;user-select:none;}",
    "#browse-filter-panel .lk-toggle-label{font-size:13px;line-height:1.45;color:#4A4761;display:flex;align-items:flex-start;gap:6px;}",
    "#browse-filter-panel .lk-tg-ic{font-size:12px;font-weight:700;}",
    "#browse-filter-panel .toggle-switch{width:32px;height:18px;border-radius:100px;background:#C8C6D8;position:relative;transition:background .18s;flex-shrink:0;}",
    "#browse-filter-panel .toggle-switch.on{background:#1D6A45;}",
    "#browse-filter-panel .toggle-switch::after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;top:2px;left:2px;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.18);}",
    "#browse-filter-panel .toggle-switch.on::after{left:16px;}"
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

  // ── helpers ──
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
    for (i = 0; i < keys.length; i++) if (Array.isArray(d[keys[i]])) return d[keys[i]];
    if (d.data && typeof d.data === 'object') for (i = 0; i < keys.length; i++) if (Array.isArray(d.data[keys[i]])) return d.data[keys[i]];
    return [];
  }

  // ── vendor accessors ──
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
        var b = CAT_BY_ID[ids[i]];
        return { known: true, slug: b.slug, url: SLUG_TO_URL[b.slug], label: b.label, bg: b.bg, text: b.text };
      }
    }
    return { known: false, slug: '', url: null, label: '', bg: '', text: '' };
  }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0].charAt(0) + p[1].charAt(0)).toUpperCase();
  }
  function vPhotoUrl(v) {
    var p = v.profile_photo;
    if (!p || typeof p !== 'string') return '';
    if (/^https?:\/\//.test(p)) return p;
    var base = window.LOKALI_FILE_BASE || 'https://x8ki-letl-twmt.n7.xano.io';
    return base.replace(/\/$/, '') + (p.charAt(0) === '/' ? '' : '/') + p;
  }
  function vAreaLabel(v) {
    var ids = Array.isArray(v.locations_id) ? v.locations_id : (v.locations_id != null ? [v.locations_id] : []);
    for (var i = 0; i < ids.length; i++) if (_locationsById[ids[i]]) return _locationsById[ids[i]].label;
    return '';
  }
  function vProfileHref(v) { return PROFILE_BASE + (v.slug || v.id); }

  // ── reference data ──
  function loadRefData() {
    return Promise.all([window.LokaliAPI.data.categories(), window.LokaliAPI.data.locations()]).then(function (res) {
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
    var byUrl = null, byStore = null;
    try { byUrl = new URLSearchParams(window.location.search).get('location_id'); } catch (e) {}
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

  // Self-contained masked icon: recolors any silhouette PNG/SVG to `color`. Works anywhere.
  function maskIcon(url, color, size) {
    var s = ce('span');
    s.style.display = 'inline-block';
    s.style.flexShrink = '0';
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.backgroundColor = color;
    var m = 'url("' + url + '") center / contain no-repeat';
    s.style.webkitMask = m;
    s.style.mask = m;
    return s;
  }
  function glyphIcon(glyph, color) {
    var s = ce('span', 'lk-glyph-icon'); s.textContent = glyph; s.style.color = color; return s;
  }

  // ── render the filter sidebar (category list + toggles + sort) ──
  function renderFilterPanel() {
    var mount = el('browse-filter-panel');
    if (!mount) { console.warn('[lokali-browse] #browse-filter-panel not found — filters disabled. Add an empty div with that ID.'); return; }
    mount.innerHTML = '';

    // Category
    var cs = ce('div', 'lk-filter-section');
    var cl = ce('div', 'lk-filter-label'); cl.textContent = 'Category'; cs.appendChild(cl);
    CATEGORY_LIST.forEach(function (c) {
      var item = ce('div', 'filter-item' + (c.slug === activeCategory ? ' active' : ''));
      item.setAttribute('data-category-slug', c.slug);
      var left = ce('div', 'fi-left');
      left.appendChild(maskIcon(c.url, ICON_VIOLET, 18));
      left.appendChild(document.createTextNode(c.label));
      var pill = ce('span', 'filter-count-pill'); pill.textContent = '0';
      item.appendChild(left); item.appendChild(pill);
      item.addEventListener('click', function () { setCategory(c.slug); });
      cs.appendChild(item);
    });
    mount.appendChild(cs);
    mount.appendChild(ce('div', 'lk-divider'));

    // Filter by (toggles)
    var fs = ce('div', 'lk-filter-section');
    var fl = ce('div', 'lk-filter-label'); fl.textContent = 'Filter by'; fs.appendChild(fl);
    TOGGLE_LIST.forEach(function (t) {
      var row = ce('div', 'lk-toggle');
      var label = ce('span', 'lk-toggle-label');
      label.appendChild(t.url ? maskIcon(t.url, t.color, 16) : glyphIcon(t.glyph, t.color));
      label.appendChild(document.createTextNode(t.label));
      var sw = ce('span', 'toggle-switch'); sw.id = t.id;
      row.appendChild(label); row.appendChild(sw);
      row.addEventListener('click', function () {
        var cur = t.key === 'new' ? showNewOnly : (t.key === 'founding' ? showFoundingOnly : showVerifiedOnly);
        setToggle(t.key, !cur);
      });
      fs.appendChild(row);
    });
    mount.appendChild(fs);
    mount.appendChild(ce('div', 'lk-divider'));

    // Sort
    var ss = ce('div', 'lk-filter-section');
    var sl = ce('div', 'lk-filter-label'); sl.textContent = 'Sort'; ss.appendChild(sl);
    SORT_LIST.forEach(function (s) {
      var item = ce('div', 'filter-item' + (s.sort === activeSort ? ' active' : ''));
      item.id = s.id;
      var left = ce('div', 'fi-left');
      left.appendChild(maskIcon(s.url, ICON_VIOLET, 16));
      left.appendChild(document.createTextNode(s.label));
      item.appendChild(left);
      item.addEventListener('click', function () { setSort(s.sort); });
      ss.appendChild(item);
    });
    mount.appendChild(ss);
  }

  function updateCategoryCounts() {
    var items = document.querySelectorAll('#browse-filter-panel .filter-item[data-category-slug]');
    for (var i = 0; i < items.length; i++) {
      var slug = items[i].getAttribute('data-category-slug');
      var pill = items[i].querySelector('.filter-count-pill');
      if (!pill) continue;
      var count;
      if (slug === 'all') count = _allVendors.length;
      else { var catId = SLUG_TO_ID[slug]; count = _allVendors.filter(function (v) { return vCategoryIds(v).indexOf(catId) !== -1; }).length; }
      pill.textContent = String(count);
    }
  }

  // ── filter + sort + render cards ──
  function applyFilters() {
    var q = searchTerm.toLowerCase().trim();
    var catId = activeCategory === 'all' ? null : SLUG_TO_ID[activeCategory];
    var visible = _allVendors.filter(function (v) {
      if (catId != null && vCategoryIds(v).indexOf(catId) === -1) return false;
      if (showNewOnly && !vIsNew(v)) return false;
      if (showFoundingOnly && !vIsFounding(v)) return false;
      if (showVerifiedOnly && !vIsVerified(v)) return false;
      if (q) { var hay = (vName(v) + ' ' + vTagline(v) + ' ' + vCategoryStyle(v).label).toLowerCase(); if (hay.indexOf(q) === -1) return false; }
      return true;
    });
    sortVendors(visible);
    renderGrid(visible);
    updateCounts(visible.length);
    updateActiveFilters();
    updateMobileIndicator();
  }

  function sortVendors(list) {
    if (activeSort === 'a_z') list.sort(function (a, b) { return vName(a).localeCompare(vName(b)); });
    else if (activeSort === 'newest') list.sort(function (a, b) { return vCreated(b) - vCreated(a); });
    else list.sort(function (a, b) { return rank(b) - rank(a) || (vCreated(b) - vCreated(a)); });
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

  // opts: { title, url+color (masked icon) | glyph (text, colored by CSS) }
  function badge(cls, opts) {
    var b = ce('span', 'badge ' + cls); b.title = opts.title;
    if (opts.url) b.appendChild(maskIcon(opts.url, opts.color, 12));
    else b.textContent = opts.glyph;
    return b;
  }
  function addContact(parent, href, label, iconUrl) {
    if (!href) return;
    var b = ce('button', 'contact-btn'); b.type = 'button';
    b.appendChild(maskIcon(iconUrl, 'currentColor', 13)); // icon follows button text color (incl. hover)
    b.appendChild(document.createTextNode(label));
    b.addEventListener('click', function (ev) {
      ev.stopPropagation(); ev.preventDefault();
      if (href.indexOf('http') === 0) window.open(href, '_blank'); else window.location.href = href;
    });
    parent.appendChild(b);
  }

  function buildAvatar(v) {
    var avatar = ce('div', 'vcard-avatar');
    var photo = vPhotoUrl(v);
    var fillInitials = function () {
      avatar.className = 'vcard-avatar vcard-avatar-initials';
      avatar.textContent = initials(vName(v));
    };
    if (photo) {
      var img = ce('img', 'vcard-avatar-img'); img.src = photo; img.alt = '';
      img.addEventListener('error', function () { if (img.parentNode) avatar.removeChild(img); fillInitials(); });
      avatar.appendChild(img);
    } else {
      fillInitials();
    }
    return avatar;
  }

  function buildCard(v) {
    var style = vCategoryStyle(v);
    var card = ce('div', 'vcard' + (vIsSpotlight(v) ? ' vcard-spotlight' : ''));
    var header = ce('div', 'vcard-header');
    var meta = ce('div', 'vcard-meta');
    var nameRow = ce('div', 'vcard-name-row');
    var name = ce('span', 'vcard-name'); name.textContent = vName(v); nameRow.appendChild(name);
    if (vIsFounding(v))  nameRow.appendChild(badge('badge-founding', { url: ICON_CROWN,    color: '#C9A22A', title: 'Founding vendor' }));
    if (vIsNew(v))       nameRow.appendChild(badge('badge-new',      { url: ICON_BULLHORN, color: '#1D6A45', title: 'New this week' }));
    if (vIsVerified(v))  nameRow.appendChild(badge('badge-verified', { glyph: '✓', title: 'Verified' }));
    if (vIsSpotlight(v)) nameRow.appendChild(badge('badge-spotlight', { glyph: '✦', title: 'Spotlight' }));
    var area = ce('div', 'vcard-area');
    area.appendChild(maskIcon(ICON_PIN, AREA_GREY, 11));
    area.appendChild(document.createTextNode(' ' + vAreaLabel(v)));
    meta.appendChild(nameRow); meta.appendChild(area);
    header.appendChild(buildAvatar(v)); header.appendChild(meta);
    card.appendChild(header);

    if (style.known) {
      var pill = ce('span', 'cat-pill');
      pill.style.background = style.bg;
      pill.style.color = style.text;
      if (style.url) pill.appendChild(maskIcon(style.url, style.text, 13));
      pill.appendChild(document.createTextNode(' ' + style.label));
      card.appendChild(pill);
    }

    var tag = ce('div', 'vcard-tagline'); tag.textContent = vTagline(v); card.appendChild(tag);

    var phone = v.phone_number;
    var actions = ce('div', 'vcard-actions');
    addContact(actions, v.contact_email ? 'mailto:' + v.contact_email : null, 'Email', ICON_EMAIL);
    addContact(actions, phone ? 'tel:' + phone : null, 'Call', ICON_CALL);
    addContact(actions, (v.text_messages && phone) ? 'sms:' + phone : null, 'Text', ICON_TEXT);
    addContact(actions, (v.whatsapp_messages && phone) ? 'https://wa.me/' + digits(phone) : null, 'WhatsApp', ICON_WHATSAPP);
    card.appendChild(actions);

    var href = vProfileHref(v);
    card.addEventListener('click', function () { window.location.href = href; });
    return card;
  }

  function updateCounts(n) { setText(el('browse-result-count'), String(n)); setText(el('browse-grid-count'), String(n)); }

  // ── active filter chips ──
  function updateActiveFilters() {
    var strip = el('browse-active-filters');
    if (!strip) return;
    strip.innerHTML = '';
    if (activeLocationId !== 'all' && _locationsById[activeLocationId]) addChip(strip, _locationsById[activeLocationId].name, function () { setLocation('all'); });
    if (activeCategory !== 'all') { var c = CAT_BY_ID[SLUG_TO_ID[activeCategory]]; addChip(strip, c ? c.label : activeCategory, function () { setCategory('all'); }); }
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
    btn.classList.toggle('has-filters', activeCategory !== 'all' || showNewOnly || showFoundingOnly || showVerifiedOnly || activeLocationId !== 'all' || !!searchTerm);
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
    var items = document.querySelectorAll('#browse-filter-panel .filter-item[data-category-slug]');
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
    SORT_LIST.forEach(function (s) { var r = el(s.id); if (r) r.classList.toggle('active', s.id === ids[sort]); });
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

  // ── events (search/location/mobile/drawer; category/toggle/sort bound during render) ──
  function bindEvents() {
    var search = el('browse-search');
    if (search) search.addEventListener('input', debounce(function () { searchTerm = search.value || ''; applyFilters(); }, 200));
    var loc = el('browse-location');
    if (loc) loc.addEventListener('change', function () { setLocation(loc.value); });
    var msel = el('browse-mobile-sort'); if (msel) msel.addEventListener('change', function () { setSort(msel.value); });
    var openBtn = el('browse-mobile-filter-btn'); if (openBtn) openBtn.addEventListener('click', openFilters);
    var backdrop = el('browse-filter-backdrop'); if (backdrop) backdrop.addEventListener('click', closeFilters);
    var closeX = el('browse-close-filters'); if (closeX) closeX.addEventListener('click', closeFilters);
  }

  function injectStyles() {
    if (el('lokali-browse-styles')) return;
    var s = ce('style'); s.id = 'lokali-browse-styles'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ── init ──
  function init() {
    if (!window.LokaliAPI) { console.error('[lokali-browse] LokaliAPI not found — load lokali-api-client.js first.'); return; }
    _grid = el('browse-vendor-grid');
    if (!_grid) { console.error('[lokali-browse] #browse-vendor-grid not found.'); return; }
    _emptyState = el('browse-empty-state');

    injectStyles();
    Array.prototype.slice.call(_grid.children).forEach(function (k) { if (k !== _emptyState) _grid.removeChild(k); });
    if (_emptyState) hideEl(_emptyState);

    renderFilterPanel();
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
