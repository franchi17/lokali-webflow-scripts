/**
 * Lokali — public Vendor Listing page hydration + interactivity.
 *
 * Load AFTER scripts/lokali-api-client.js (needs window.LokaliAPI).
 * Drives the page built in Webflow with vl-* classes / ids and data-vl-* hooks.
 *
 * Responsibilities:
 *   1. Tab switching (data-vl-tab -> data-vl-panel) + Save-vendor toggle.
 *   2. Resolve the vendor id from the URL (?id= / ?v= / /vendor(s)/{id} / [data-lokali-vendor-id]).
 *   3. Fetch vendor + services + products (+ categories/locations for labels) from Xano.
 *   4. Populate hero, badges, area pills, contact channels, Instagram, avatar, About, card grids.
 *
 * Routing note: Xano currently exposes only `vendor/id/{id}` (no get-by-slug),
 * so this resolves a numeric id. When a `vendor/slug/{slug}` endpoint exists,
 * extend resolveVendorId() + fetchVendor() to accept a slug.
 */
(function () {
  'use strict';

  var currentVendorId = null; // set during hydrate(); used to build detail-page links
  var currentVendorSlug = null; // set during hydrate(); used to build clean item/about URLs
  var openAboutOnLoad = false; // true when the URL is /{slug}/about — open the About tab once loaded

  // #52 — the website/Instagram chips under the contact CTA floated ~80px
  // apart (loose, unintentional). Pull them into one tight centered row.
  (function injectLinkRowCss() {
    if (document.getElementById('lok-vl-linkrow-css')) return;
    var st = document.createElement('style');
    st.id = 'lok-vl-linkrow-css';
    st.textContent = '.div-block-179{display:flex !important;justify-content:center !important;align-items:center !important;gap:12px !important;}';
    (document.head || document.documentElement).appendChild(st);
  })();

  // ---- tiny DOM helpers -------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function setText(id, val) { var el = document.getElementById(id); if (el) el.textContent = (val == null || val === '') ? el.textContent : String(val); }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
  function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }
  function ce(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0].charAt(0) + p[1].charAt(0)).toUpperCase();
  }
  // profile_photo from Xano is often a relative /vault/... path — prepend the Xano file base.
  function photoUrl(p) {
    if (!p || typeof p !== 'string') return '';
    p = p.trim();
    // Block javascript:/data: schemes, protocol-relative //host, and chars that
    // could break out of an attribute/CSS url(). Allow http(s) + relative paths.
    if (!p || /[\s"'<>`\\]/.test(p) || /^(?:javascript|data|vbscript):/i.test(p)) return '';
    if (/^https?:\/\//.test(p)) return p;
    if (p.indexOf('//') === 0) return '';
    var base = window.LOKALI_FILE_BASE || 'https://x8ki-letl-twmt.n7.xano.io';
    return base.replace(/\/$/, '') + (p.charAt(0) === '/' ? '' : '/') + p;
  }

  // ---- category pill styling (mirrors The Market vendor card) -----------
  // bg/text = pill colors; url = the same masked category icon used on the card.
  // Keyed by Xano category id (matches lokali-browse.js CAT_BY_ID).
  var ASSET = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/';
  var CAT_BY_ID = {
    1: { bg: '#FFF8E6', text: '#8A5A00', url: ASSET + '6a186b061a80eb9ba75f0d0a_scissors-solid.png' }, // Handcrafted
    2: { bg: '#F0F0F8', text: '#4A4761', url: ASSET + '6a18f6d4b01673d30ca9bcb8_briefcase.svg' },       // Business
    3: { bg: '#FEF3F2', text: '#C0392B', url: ASSET + '6a18f2524e31974a75003735_hair%20dryer.svg' },    // Beauty
    4: { bg: '#E6F1FB', text: '#1A5C9A', url: ASSET + '6a18f6d4f1bbd4795f5345bc_backpack.svg' },        // Children
    5: { bg: '#F3EBFF', text: '#6002EE', url: ASSET + '6a18f6d414c76bb968f180db_balloon.svg' },         // Events
    6: { bg: '#FFF3EA', text: '#FF6B00', url: ASSET + '6a186b067365d964abee8918_utensils-solid.png' },  // Food
    7: { bg: '#EAFAF2', text: '#1D6A45', url: ASSET + '6a186b06cfcb6c4d6d1e1cf7_heart-regular.png' },    // Wellness
    8: { bg: '#F7F6FC', text: '#4A4761', url: ASSET + '6a186b06a37dcea6514f15f9_house-regular.png' }     // Home
  };

  // Self-contained masked icon: recolors any silhouette PNG/SVG to `color`.
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

  // Injected once: turns #vl-category into a card-style pill and aligns the
  // founding/verified badge colors with the vendor card on The Market.
  var PILL_CSS = [
    "#vl-category.vl-cat-pill{display:inline-flex;align-items:center;gap:5px;border-radius:100px;padding:3px 10px;font-size:11px;font-weight:500;line-height:1.2;}",
    ".vl-badge.vl-badge-founding{background:rgba(201,162,42,.22);color:#C9A22A;border:.5px solid rgba(201,162,42,.45);}",
    ".vl-badge.vl-badge-verified{background:rgba(0,0,228,.16);color:#0000E4;border:.5px solid rgba(0,0,228,.4);}",
    ".vl-avatar.vl-avatar-initials{display:flex;align-items:center;justify-content:center;}",
    ".vl-avatar-txt{color:#6002EE;font-weight:600;font-size:30px;letter-spacing:.5px;font-family:'Plus Jakarta Sans',sans-serif;line-height:1;}",
    // Saved state for the #vl-save button: violet-tinted, filled heart, "Saved".
    ".vl-save.vl-save-on{background-color:#F3EBFF;border-color:#6002EE;color:#6002EE;}",
    ".vl-save.vl-save-on svg,.vl-save.vl-save-on svg path{fill:currentColor;}"
  ].join('');
  function injectStyles() {
    if (document.getElementById('vl-pill-styles')) return;
    var s = document.createElement('style'); s.id = 'vl-pill-styles'; s.textContent = PILL_CSS;
    document.head.appendChild(s);
  }

  // Restyle the hero category text as the colored pill from the vendor card.
  function styleCategoryPill(catId) {
    var el = document.getElementById('vl-category');
    var style = (catId != null) ? CAT_BY_ID[catId] : null;
    if (!el || !style) return;
    el.classList.add('vl-cat-pill');
    el.style.background = style.bg;
    el.style.color = style.text;
    var row = el.parentNode; // hide the generic meta-row icon; the pill carries its own
    if (row) { var ic = row.querySelector('svg.vl-ic'); if (ic) ic.style.display = 'none'; }
    el.insertBefore(maskIcon(style.url, style.text, 13), el.firstChild);
  }

  // ---- 1. interactivity -------------------------------------------------
  function activateTab(name) {
    $all('[data-vl-tab]').forEach(function (t) { t.classList.toggle('vl-stab-active', t.getAttribute('data-vl-tab') === name); });
    // Inactive panels carry a Webflow combo class (inline-div-5/6/7) that sets display:none.
    // Setting display:'' would just revert to that rule, so force the active panel to 'block'.
    $all('[data-vl-panel]').forEach(function (p) {
      p.style.display = (p.getAttribute('data-vl-panel') === name) ? 'block' : 'none';
    });
  }
  // Show/hide a whole tab (+ its panel). Used to hide Services/Products when a vendor has none.
  function setTabVisible(name, vis) {
    $all('[data-vl-tab="' + name + '"]').forEach(function (t) { show(t, vis); });
    if (!vis) $all('[data-vl-panel="' + name + '"]').forEach(function (p) { show(p, false); });
  }
  // If the active tab got hidden (or none is active), activate the first still-visible tab.
  function ensureActiveTab() {
    var visible = $all('[data-vl-tab]').filter(function (t) { return t.style.display !== 'none'; });
    if (visible.filter(function (t) { return t.classList.contains('vl-stab-active'); })[0]) return;
    if (visible[0]) activateTab(visible[0].getAttribute('data-vl-tab'));
  }
  function initTabs() {
    $all('[data-vl-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { activateTab(tab.getAttribute('data-vl-tab')); });
    });
  }

  // ---- save / favorites: wire the designed #vl-save button to the Favorites API.
  // Reflects state on the button (class 'vl-save-on' + '.vl-save-label' text).
  // Signed-out: stash the pending vendor + a customer signup intent and open the
  // Clerk sign-up modal; lokali-favorites.js (listening on 'lokali:authed')
  // completes the save once the account exists — so the keys below are shared.
  function vlSetSaveUI(saved) {
    var btn = document.getElementById('vl-save');
    if (!btn) return;
    btn.classList.toggle('vl-save-on', !!saved);
    var label = btn.querySelector('.vl-save-label');
    if (label) { label.textContent = saved ? 'Saved' : 'Save vendor'; return; }
    // No label span — update the button's own text node, preserving the icon.
    var nodes = btn.childNodes;
    for (var i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].nodeType === 3 && nodes[i].nodeValue && nodes[i].nodeValue.trim()) {
        nodes[i].nodeValue = saved ? 'Saved' : 'Save vendor';
        return;
      }
    }
  }

  // Numeric vendor id for the Favorites API (never the slug). Prefer the resolved
  // currentVendorId; fall back to the hero data attribute / ?id=.
  function vlSaveVendorId() {
    if (currentVendorId != null && /^[0-9]+$/.test(String(currentVendorId))) return Number(currentVendorId);
    var el = document.querySelector('[data-lokali-vendor-id]');
    var a = el && el.getAttribute('data-lokali-vendor-id');
    if (a && /^[0-9]+$/.test(a.trim())) return Number(a.trim());
    var qp = new URLSearchParams(window.location.search || '').get('id');
    if (qp && /^[0-9]+$/.test(qp.trim())) return Number(qp.trim());
    return null;
  }

  function vlHasToken() { var A = window.LokaliAPI; return !!(A && A.getToken && A.getToken()); }

  function initSave() {
    var btn = document.getElementById('vl-save');
    if (!btn || btn.__lokaliSaveWired) return;
    btn.__lokaliSaveWired = true;
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      var API = window.LokaliAPI;
      var vid = vlSaveVendorId();
      if (!API || !vid) return;
      if (!vlHasToken()) {
        try { sessionStorage.setItem('lokali_pending_fav', String(vid)); } catch (e) {}
        try { sessionStorage.setItem('lokali_signup_intent', 'customer'); } catch (e) {}
        if (window.Clerk && typeof window.Clerk.openSignUp === 'function') window.Clerk.openSignUp({});
        else window.location.href = '/sign-up';
        return;
      }
      var was = btn.classList.contains('vl-save-on');
      var next = !was;
      vlSetSaveUI(next); // optimistic
      var p = next
        ? API.request('favorites', 'POST', '/favorites', { vendors_id: vid }, true)
        : API.request('favorites', 'DELETE', '/favorites/' + encodeURIComponent(vid), null, true);
      p.then(function (res) { if (res && res.error) vlSetSaveUI(was); })
       .catch(function () { vlSetSaveUI(was); });
    });
    // Reflect the save once the customer finishes a sign-up-to-save flow.
    window.addEventListener('lokali:authed', function () { setTimeout(refreshSaveState, 400); });
  }

  // Initial saved/unsaved state once we know the numeric id + have a token.
  function refreshSaveState() {
    var btn = document.getElementById('vl-save');
    var API = window.LokaliAPI;
    if (!btn || !API || !vlHasToken()) return;
    var vid = vlSaveVendorId();
    if (!vid) return;
    API.request('favorites', 'GET', '/favorites', null, true).then(function (res) {
      var rows = (res && res.data) || [];
      var saved = Array.isArray(rows) && rows.some(function (r) { return r && Number(r.vendors_id) === Number(vid); });
      vlSetSaveUI(saved);
    }).catch(function () {});
  }

  // ---- 2. vendor id resolution -----------------------------------------
  // Top-level Webflow paths that are real pages, never vendor slugs. The Worker
  // already serves real pages first; this is a belt-and-suspenders guard so the
  // /vendor template never mistakes its own path (or a sibling page) for a slug.
  var RESERVED_ROOT_SLUGS = [
    'vendor', 'vendors', 'about', 'pricing', 'the-market', 'login', 'sign-up',
    'vendor-dashboard', 'vendor-resources', 'vendor-signup', 'contact-us', 'blog',
    'search', 'product', 'product-detail', 'service', 'services', 'products',
    'locations', 'categories', 'category', 'checkout', 'order-confirmation',
    '401', '404', 'template-pages'
  ];

  function resolveVendorId() {
    if (window.LOKALI_PUBLIC_VENDOR_ID != null && window.LOKALI_PUBLIC_VENDOR_ID !== '') {
      return String(window.LOKALI_PUBLIC_VENDOR_ID);
    }
    var params = new URLSearchParams(window.location.search || '');
    var qp = params.get('id') || params.get('v') || params.get('vendor');
    if (qp) return qp.trim();
    var el = document.querySelector('[data-lokali-vendor-id]');
    if (el && el.getAttribute('data-lokali-vendor-id')) {
      var a = el.getAttribute('data-lokali-vendor-id').trim();
      if (a) return a;
    }
    var m = (window.location.pathname || '').match(/\/vendors?\/([^\/?#]+)/i);
    if (m && m[1]) return decodeURIComponent(m[1]);
    // Root-level clean URL: golokali.com/{slug} (the Cloudflare Worker rewrites
    // the /vendor template onto the clean path). Take the first path segment as
    // the slug, unless it's the template's own path or another reserved word.
    var segs = (window.location.pathname || '').split('/').filter(Boolean);
    if (segs.length === 1) {
      var first = decodeURIComponent(segs[0]).toLowerCase();
      if (RESERVED_ROOT_SLUGS.indexOf(first) === -1) return first;
    }
    // Clean About URL: golokali.com/{slug}/about (Worker serves the /vendor
    // template here too). Resolve the vendor and flag the About tab to open.
    if (segs.length === 2 && decodeURIComponent(segs[1]).toLowerCase() === 'about') {
      var vslug = decodeURIComponent(segs[0]).toLowerCase();
      if (RESERVED_ROOT_SLUGS.indexOf(vslug) === -1) { openAboutOnLoad = true; return vslug; }
    }
    return null;
  }

  // ---- helpers to read varied API field shapes --------------------------
  function unwrap(res) { return (res && res.data != null) ? res.data : res; }
  function asArray(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.items)) return raw.items;
      if (Array.isArray(raw.records)) return raw.records;
      if (Array.isArray(raw.data)) return raw.data;
    }
    return [];
  }
  function imgUrl(v) {
    var s = '';
    if (typeof v === 'string') s = v;
    else if (v && typeof v === 'object') s = v.url || v.path || '';
    if (!s || typeof s !== 'string') return '';
    s = s.trim();
    if (!s || /[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    return s;
  }

  // ---- price formatting -------------------------------------------------
  function cents(n) {
    var num = Number(n);
    if (!isFinite(num)) return '';
    return '$' + (num % 100 === 0 ? (num / 100).toFixed(0) : (num / 100).toFixed(2));
  }
  function servicePrice(s) {
    var t = (s.price_type || '').toLowerCase();
    if (t === 'quote' || t === 'get_a_quote' || s.is_quote_based) return { text: 'Get a quote', quote: true };
    if (s.price_min_cents != null && s.price_max_cents != null && s.price_min_cents !== s.price_max_cents) {
      return { text: cents(s.price_min_cents) + '–' + cents(s.price_max_cents), quote: false };
    }
    if (s.price_min_cents != null) return { text: 'From ' + cents(s.price_min_cents), quote: false };
    if (s.price_cents != null) return { text: (t === 'from' || t === 'starting' ? 'From ' : '') + cents(s.price_cents), quote: false };
    if (s.price_note) return { text: s.price_note, quote: true };
    return { text: 'Get a quote', quote: true };
  }
  function productPrice(p) {
    if (p.is_quote_based) return { text: 'Get a quote', quote: true };
    if (p.price != null && p.price !== '') {
      var num = Number(p.price);
      return { text: isFinite(num) ? '$' + num : String(p.price), quote: false };
    }
    if (p.price_note) return { text: p.price_note, quote: true };
    return { text: 'Get a quote', quote: true };
  }

  // ---- card rendering ---------------------------------------------------
  // Clean item URL when we have both the vendor slug and the item slug:
  //   /{vendorSlug}/services/{itemSlug}  ·  /{vendorSlug}/products/{itemSlug}
  // Otherwise fall back to the legacy ?id= detail-page link (still works).
  function itemHref(kind, item) {
    if (currentVendorSlug && item.slug) {
      return '/' + currentVendorSlug + '/' + kind + '/' + encodeURIComponent(item.slug);
    }
    var page = kind === 'services' ? '/service' : '/product-detail';
    return item.id != null
      ? (page + '?id=' + item.id + (currentVendorId != null ? '&vendor=' + currentVendorId : ''))
      : '#';
  }

  var IMG_TINTS = ['#FFF1E6', '#F3EBFF', '#EAFAF2', '#FEF9E6'];
  function cardEl(opts) {
    var a = document.createElement('a');
    a.className = 'vl-card';
    a.href = opts.href || '#';
    var priceClass = 'vl-card-price' + (opts.quote ? ' vl-card-price-quote' : '');
    var ctaClass = 'vl-card-cta' + (opts.orange ? ' vl-card-cta-orange' : '');
    a.innerHTML = '<div class="vl-card-img" style="background:' + opts.tint + ';"></div>' +
      '<div class="vl-card-body"><div class="vl-card-top">' +
      '<div class="vl-card-name"></div>' +
      '<div class="' + priceClass + '"></div></div>' +
      '<div class="vl-card-desc"></div>' +
      '<div class="vl-card-foot"><span class="' + ctaClass + '">' + (opts.cta || 'Inquire') + '</span></div></div>';
    // Build the image via properties (never interpolate vendor free-text into an
    // attribute string) so a crafted item title can't break out into stored XSS.
    if (opts.image) {
      var imgEl = document.createElement('img');
      imgEl.src = opts.image;
      imgEl.alt = opts.name || '';
      a.querySelector('.vl-card-img').appendChild(imgEl);
    }
    a.querySelector('.vl-card-name').textContent = opts.name || 'Untitled';
    a.querySelector('.vl-card-price').textContent = opts.price || '';
    a.querySelector('.vl-card-desc').textContent = opts.desc || '';
    return a;
  }

  function renderServices(list, ok) {
    // ok===false means the fetch failed — never hide the tab on a failure, only on a confirmed-empty success.
    if (ok === false) { console.warn('[lokali-vendor-listing] services fetch failed — keeping Services tab'); ensureActiveTab(); return; }
    var grid = document.getElementById('vl-services-grid');
    var empty = document.getElementById('vl-services-empty');
    var countEl = document.getElementById('vl-count-services'); if (countEl) countEl.textContent = String(list.length);
    setTabVisible('services', list.length > 0); // hide the tab entirely when there are no services
    if (!grid) { ensureActiveTab(); return; }
    grid.innerHTML = '';
    if (!list.length) { show(grid, false); show(empty, true); ensureActiveTab(); return; }
    show(grid, true); show(empty, false);
    list.forEach(function (s, i) {
      var p = servicePrice(s);
      grid.appendChild(cardEl({
        name: s.service_name || s.name,
        desc: s.service_description || s.description || '',
        price: p.text, quote: p.quote,
        image: imgUrl(s.image_url || s.image),
        tint: IMG_TINTS[i % IMG_TINTS.length],
        cta: p.quote ? 'Request quote' : 'Inquire',
        href: itemHref('services', s)
      }));
    });
    ensureActiveTab();
  }

  function renderProducts(list, ok) {
    if (ok === false) { console.warn('[lokali-vendor-listing] products fetch failed — keeping Products tab'); ensureActiveTab(); return; } // fetch failed — leave the tab as-is
    var grid = document.getElementById('vl-products-grid');
    var empty = document.getElementById('vl-products-empty');
    var countEl = document.getElementById('vl-count-products'); if (countEl) countEl.textContent = String(list.length);
    setTabVisible('products', list.length > 0); // hide the tab entirely when there are no products
    if (!grid) { ensureActiveTab(); return; }
    grid.innerHTML = '';
    if (!list.length) { show(grid, false); show(empty, true); ensureActiveTab(); return; }
    show(grid, true); show(empty, false);
    list.forEach(function (p, i) {
      var pr = productPrice(p);
      grid.appendChild(cardEl({
        name: p.product_name || p.name,
        desc: p.product_description || p.description || '',
        price: pr.text, quote: pr.quote,
        image: imgUrl(p.image_url || p.image),
        tint: IMG_TINTS[(i + 1) % IMG_TINTS.length],
        cta: 'Order', orange: true,
        href: itemHref('products', p)
      }));
    });
    ensureActiveTab();
  }

  // ---- portfolio gallery (Pro/Featured plans, max 5) --------------------
  var PORTFOLIO_MAX = 5;
  var PORTFOLIO_PLANS = ['pro', 'featured'];

  // null = unknown (no plan field on the public vendor) -> defer to server (empty list hides it)
  function planEligible(v) {
    var tier = (v.plan_tier || v.plan || v.plan_name || v.subscription_tier || v.tier || v.plan_slug || '');
    tier = String(tier).toLowerCase();
    if (!tier) return null;
    return PORTFOLIO_PLANS.some(function (p) { return tier.indexOf(p) >= 0; });
  }

  function wireStrip(strip, pips) {
    if (!strip) return;
    var pipEls = pips ? pips.querySelectorAll('.vd-pip') : [];
    strip.addEventListener('scroll', function () {
      if (!pipEls.length) return;
      var idx = Math.round(strip.scrollLeft / strip.offsetWidth);
      for (var i = 0; i < pipEls.length; i++) pipEls[i].classList.toggle('vd-pip-active', i === idx);
    }, { passive: true });
    var down = false, sx = 0, ss = 0;
    strip.addEventListener('mousedown', function (e) { down = true; sx = e.pageX; ss = strip.scrollLeft; });
    strip.addEventListener('mouseleave', function () { down = false; });
    strip.addEventListener('mouseup', function () { down = false; });
    strip.addEventListener('mousemove', function (e) { if (!down) return; e.preventDefault(); strip.scrollLeft = ss - (e.pageX - sx); });
  }

  function loadPortfolio(vendorId, vendor) {
    var section = document.getElementById('vl-portfolio');
    if (!section || !vendorId || !window.LokaliAPI) return;
    if (planEligible(vendor) === false) return; // explicitly ineligible plan
    window.LokaliAPI.request('vendors', 'GET',
      'vendor/id/' + encodeURIComponent(vendorId) + '/portfolio/photos/list', null, false
    ).then(function (res) {
      var photos = asArray(unwrap(res))
        .filter(function (p) { return p && p.is_active !== false && imgUrl(p.image_url || p.image); })
        .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
        .slice(0, PORTFOLIO_MAX);
      if (!photos.length) return; // server enforces plan gating; empty => stay hidden
      var strip = document.getElementById('vl-portfolio-strip');
      var pips = document.getElementById('vl-portfolio-pips');
      if (!strip) return;
      strip.innerHTML = ''; if (pips) pips.innerHTML = '';
      photos.forEach(function (p, i) {
        var f = document.createElement('div');
        f.className = 'vd-frame ' + (i === 0 ? 'vd-frame-main' : 'vd-frame-peek');
        var img = document.createElement('img'); img.src = imgUrl(p.image_url || p.image); img.alt = '';
        f.appendChild(img); strip.appendChild(f);
        if (pips) { var pip = document.createElement('span'); pip.className = 'vd-pip' + (i === 0 ? ' vd-pip-active' : ''); pips.appendChild(pip); }
      });
      if (photos.length < 2 && pips) pips.style.display = 'none';
      wireStrip(strip, pips);
      section.style.display = '';
    });
  }

  // ---- contact channels -------------------------------------------------
  // Log a direct-contact click as a lead event (fire-and-forget; the
  // tel:/sms:/mailto:/wa.me navigation proceeds untouched).
  function trackChannel(el, type) {
    if (!el) return;
    el.addEventListener('click', function () {
      if (window.LokaliAPI && window.LokaliAPI.leads && currentVendorId != null) {
        window.LokaliAPI.leads.trackEvent(currentVendorId, type, 'listing');
      }
    });
  }

  function initContact(v) {
    var name = v.business_name || 'this vendor';
    var email = v.contact_email;
    var phone = digits(v.phone_number);
    var foundCopy = "Hi " + name + ", I found you on Lokali and I'd love to learn more about your services.";

    var emailEl = document.getElementById('vl-ch-email');
    if (emailEl) {
      if (email) {
        emailEl.href = 'mailto:' + email +
          '?subject=' + encodeURIComponent('I found you on Lokali — inquiry') +
          '&body=' + encodeURIComponent(foundCopy);
      } else { show(emailEl, false); }
    }
    var smsEl = document.getElementById('vl-ch-sms');
    if (smsEl) {
      if (phone && v.text_messages) { smsEl.href = 'sms:+1' + phone + '?body=' + encodeURIComponent(foundCopy); }
      else { show(smsEl, false); }
    }
    var waEl = document.getElementById('vl-ch-whatsapp');
    if (waEl) {
      if (phone && v.whatsapp_messages) { waEl.href = 'https://wa.me/1' + phone + '?text=' + encodeURIComponent(foundCopy); }
      else { show(waEl, false); }
    }
    var callEl = document.getElementById('vl-ch-call');
    if (callEl) {
      if (phone) { callEl.href = 'tel:+1' + phone; }
      else { show(callEl, false); }
    }
    var igEl = document.getElementById('vl-ig');
    if (igEl) {
      var handle = v.instagram_handle || v.instagram;
      if (handle) {
        var clean = String(handle).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
        igEl.href = 'https://instagram.com/' + clean;
      } else { show(igEl, false); }
    }
    var webBtn = document.getElementById('vl-website');
    if (webBtn) {
      if (v.website_url) {
        var wbu = v.website_url;
        webBtn.href = /^https?:\/\//i.test(wbu) ? wbu : 'https://' + wbu;
        webBtn.target = '_blank';
        webBtn.rel = 'noopener';
      } else { show(webBtn, false); }
    }

    trackChannel(emailEl, 'email');
    trackChannel(smsEl, 'sms');
    trackChannel(waEl, 'whatsapp');
    trackChannel(callEl, 'call');
    trackChannel(igEl, 'instagram');
    trackChannel(webBtn, 'website');
    trackChannel(document.getElementById('vl-about-website'), 'website');
  }

  // ---- hero + about population ------------------------------------------
  function populateVendor(v, labels) {
    setText('vl-name', v.business_name);
    setText('vl-tagline', v.business_tagline || '');
    var tagEl = document.getElementById('vl-tagline');
    if (tagEl && !(v.business_tagline)) show(tagEl, false);

    // avatar — show the photo, falling back to initials when there's no image (or it fails to load)
    var av = document.getElementById('vl-avatar');
    // The Webflow build left a literal <imgraw> placeholder element here — browsers
    // don't render it as an image, so swap it for a real <img> before setting src.
    if (av && av.tagName !== 'IMG') {
      var realImg = ce('img', av.className);
      realImg.id = av.id;
      realImg.alt = av.getAttribute('alt') || '';
      av.parentNode.replaceChild(realImg, av);
      av = realImg;
    }
    var circle = av ? av.parentNode : document.querySelector('.vl-avatar');
    var photo = photoUrl(v.profile_photo);
    function showInitials() {
      if (av) av.style.display = 'none';
      if (circle) {
        circle.classList.add('vl-avatar-initials');
        var txt = circle.querySelector('.vl-avatar-txt');
        if (!txt) { txt = ce('span', 'vl-avatar-txt'); circle.appendChild(txt); }
        txt.textContent = initials(v.business_name);
      }
    }
    if (av && photo) {
      av.style.display = '';
      av.addEventListener('error', showInitials);
      av.src = photo;
    } else {
      showInitials();
    }

    // badges
    show(document.getElementById('vl-badge-founding'), !!v.is_founding_member);
    // "Verified" = completed identity/business verification (a Pro/Featured perk),
    // NOT mere address geocoding. address_verified must not trigger this badge.
    show(document.getElementById('vl-badge-verified'), !!(v.is_verified || v.identity_status === 'verified'));

    // category (first categories_id mapped via labels.categories)
    var catId = (Array.isArray(v.categories_id) && v.categories_id.length) ? v.categories_id[0] : null;
    var catName = '';
    if (catId != null && labels.categories) catName = labels.categories[catId] || '';
    if (catName) { setText('vl-category', catName); setText('vl-about-category', catName); }
    styleCategoryPill(catId); // colored pill + icon, matching the vendor card

    // area pills (locations_id mapped via labels.locations)
    var areas = document.getElementById('vl-areas');
    if (areas && Array.isArray(v.locations_id) && labels.locations) {
      var names = v.locations_id.map(function (id) { return labels.locations[id]; }).filter(Boolean);
      if (names.length) {
        areas.innerHTML = '';
        names.forEach(function (n) {
          var s = document.createElement('span'); s.className = 'vl-area-pill'; s.textContent = n; areas.appendChild(s);
        });
      }
    }

    // member since
    if (v.created_at) {
      var yr = new Date(v.created_at).getFullYear();
      if (yr) { setText('vl-since', 'Part of the Lokali community since ' + yr); setText('vl-about-since', yr); }
    }

    // about bio + website
    if (v.business_description) setText('vl-about-bio', v.business_description);
    var web = document.getElementById('vl-about-website');
    if (web) {
      if (v.website_url) {
        var u = v.website_url; var href = /^https?:\/\//i.test(u) ? u : 'https://' + u;
        web.href = href; web.textContent = u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
        web.target = '_blank';
      } else { web.textContent = '—'; web.removeAttribute('href'); }
    }

    initContact(v);
    injectVendorReport(v);
    if (v.id != null) {
      var hero = document.querySelector('[data-lokali-vendor-id]');
      if (hero) hero.setAttribute('data-lokali-vendor-id', String(v.id));
    }
  }

  // ---- labels (categories + locations) ----------------------------------
  function buildLabelMap(rows, idKeys, nameKeys) {
    var map = {};
    asArray(rows).forEach(function (r) {
      var id = null, nm = null;
      idKeys.forEach(function (k) { if (id == null && r[k] != null) id = r[k]; });
      nameKeys.forEach(function (k) { if (nm == null && r[k]) nm = r[k]; });
      if (id != null && nm) map[id] = nm;
    });
    return map;
  }

  // Retry wrapper for the per-vendor service/product fetches. Xano can cold-start or drop
  // the first request right after a (back-)navigation; the old code called these once with
  // no retry and no .catch, so any miss left the Webflow template's placeholder cards on
  // screen. This retries resolved-errors AND network rejections a few times with backoff,
  // then resolves to {error} so renderServices/renderProducts fall through cleanly.
  function fetchListWithRetry(fn, attempt) {
    attempt = attempt || 0;
    var MAX = 3;
    function later(next) {
      return new Promise(function (r) { setTimeout(function () { r(fetchListWithRetry(fn, next)); }, 300 * next); });
    }
    return fn().then(function (out) {
      if (out && out.error && attempt < MAX) return later(attempt + 1);
      return out;
    }, function (err) {
      if (attempt < MAX) return later(attempt + 1);
      return { error: err || true };
    });
  }

  // ---- 3/4. fetch + render ---------------------------------------------
  function hydrate() {
    if (!window.LokaliAPI) { console.warn('[lokali-vendor-listing] LokaliAPI not loaded'); return; }
    var id = resolveVendorId();
    if (!id) { console.warn('[lokali-vendor-listing] no vendor id in URL'); return; }
    var API = window.LokaliAPI;

    // Strip the Webflow template's placeholder service/product cards up front, so a slow or
    // failed fetch can never leave dummy data ("Custom birthday cakes", "Brownie gift box",
    // etc.) on screen. renderServices/renderProducts repopulate with real cards or the
    // empty state once the fetch resolves.
    ['vl-services-grid', 'vl-products-grid'].forEach(function (gid) {
      var g = document.getElementById(gid);
      if (g) g.innerHTML = '';
    });

    // Numeric → resolve by id (legacy ?id=). Non-numeric → treat as a slug and
    // resolve via GET vendor/slug/{slug} (falls back to id-lookup if the client
    // build doesn't yet have getBySlug).
    var isNumericId = /^[0-9]+$/.test(String(id));
    // Vendor identity is the critical fetch — retry it (Xano can cold-start or drop the
    // first request right after a navigation). Categories/locations are label data only:
    // wrap them so a reject can never abort the whole Promise.all and strand the hero on its
    // Webflow template placeholder ("Maria's Sweet Studio").
    var vendorFetch = fetchListWithRetry(function () {
      return (!isNumericId && API.vendors.getBySlug) ? API.vendors.getBySlug(id) : API.vendors.getById(id);
    });
    var catsFetch = (API.data.categories ? API.data.categories() : Promise.resolve({ data: [] }))
      .catch(function () { return { data: [] }; });
    var locsFetch = (API.data.locations ? API.data.locations() : Promise.resolve({ data: [] }))
      .catch(function () { return { data: [] }; });

    Promise.all([
      vendorFetch,
      catsFetch,
      locsFetch
    ]).then(function (res) {
      var v = unwrap(res[0]);
      if (v && v.vendor) v = v.vendor; // GET vendor/id/{id} returns { vendor: {...} }
      if (!v || (res[0] && res[0].error)) { console.warn('[lokali-vendor-listing] vendor fetch failed', res[0] && res[0].error); return; }
      var labels = {
        categories: buildLabelMap(unwrap(res[1]), ['id', 'categories_id'], ['name', 'category_name', 'title']),
        locations: buildLabelMap(unwrap(res[2]), ['id', 'locations_id'], ['name', 'location_name', 'title'])
      };
      populateVendor(v, labels);
      document.title = (v.business_name || 'Vendor') + ' — Lokali';

      var vid = v.id != null ? v.id : id;
      currentVendorId = vid;
      refreshSaveState(); // light up the #vl-save button if this vendor is already saved
      // Slug for building clean item/about URLs. Prefer the vendor's real slug;
      // fall back to a non-numeric id used as the slug (legacy). Numeric id → no slug.
      currentVendorSlug = v.slug || (/^[0-9]+$/.test(String(id)) ? null : String(id).toLowerCase());
      // /{slug}/about deep-link: open the About tab (it's always visible).
      if (openAboutOnLoad) activateTab('about');
      // Announce the loaded vendor for companion scripts (lokali-inquiry.js
      // mounts the "Send an inquiry" button off this). Window var covers the
      // load-order race; the event covers scripts already listening.
      window.LOKALI_LOADED_VENDOR = { id: vid, name: v.business_name || '' };
      try { document.dispatchEvent(new CustomEvent('lokali:vendor-loaded', { detail: window.LOKALI_LOADED_VENDOR })); } catch (e) {}
      // Log a listing view, deduped per browser session so one visit = one row
      // (the analytics page needs impressions for the views→contacts→inquiries
      // funnel). Fire-and-forget; never blocks render.
      // A vendor previewing their OWN listing must NOT inflate their view count
      // — the metric should mean "other people looked at you". So for a
      // signed-in visitor we first resolve who they are (vendors.me is memoized,
      // one cheap call) and skip the emit when it's the owner. Anonymous
      // visitors — the common case — emit immediately, unchanged.
      try {
        var vkey = 'lok_viewed_' + vid;
        var canView = vid != null && window.LokaliAPI && window.LokaliAPI.leads &&
            typeof window.LokaliAPI.leads.trackView === 'function' &&
            !sessionStorage.getItem(vkey);
        if (canView) {
          var emitView = function () {
            sessionStorage.setItem(vkey, '1');
            window.LokaliAPI.leads.trackView(vid, 'listing');
          };
          var tok = window.LokaliAPI.getToken && window.LokaliAPI.getToken();
          if (!tok) {
            emitView();
          } else {
            // Signed in: skip only if this is the viewer's own vendor listing.
            window.LokaliAPI.vendors.me().then(function (res) {
              var mineId = res && res.data && res.data.vendor && res.data.vendor.id;
              if (mineId != null && Number(mineId) === Number(vid)) return; // owner preview — don't count
              emitView();
            }, function () { emitView(); }); // not a vendor / lookup failed — count it
          }
        }
      } catch (e) {}
      loadPortfolio(vid, v);
      fetchListWithRetry(function () { return API.services.listByVendor(vid); })
        .then(function (sres) { renderServices(asArray(unwrap(sres)), !(sres && sres.error)); });
      fetchListWithRetry(function () { return API.products.listByVendor(vid); })
        .then(function (pres) { renderProducts(asArray(unwrap(pres)), !(pres && pres.error)); });
      renderReviews(vid, v.business_name || '');
    });
  }

  // ---- reviews (public testimonials) ------------------------------------
  // Every public review passed the contact gate at create time, so each one is,
  // by definition, a "verified contact" recommendation. No star averages at
  // launch — a recommend boolean + the testimonial text. Empty state never shows
  // a zero ("Be the first to recommend"). The reviews tab is always shown.
  function injectReviewStyles() {
    if (document.getElementById('vl-rev-styles')) return;
    var s = document.createElement('style'); s.id = 'vl-rev-styles';
    var FONT = '"Plus Jakarta Sans",sans-serif';
    s.textContent = [
      '.vl-rev-summary{font:600 15px/1.4 ' + FONT + ';color:#1A1829;margin-bottom:1rem;}',
      '.vl-rev-summary strong{color:#6002EE;}',
      '.vl-rev{background:#fff;border:.5px solid #EEEDF6;border-radius:12px;padding:16px 18px;margin-bottom:12px;}',
      '.vl-rev-head{display:flex;align-items:center;gap:10px;margin-bottom:9px;}',
      '.vl-rev-av{width:38px;height:38px;border-radius:50%;background:#F3EBFF;color:#6002EE;font:600 13px/1 ' + FONT + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;text-transform:uppercase;}',
      '.vl-rev-name{font:600 14px/1.2 ' + FONT + ';color:#1A1829;}',
      '.vl-rev-verified{display:inline-flex;align-items:center;gap:4px;font:600 10.5px/1 ' + FONT + ';color:#2BB673;margin-top:3px;}',
      '.vl-rev-verified.vl-rev-contacted{color:#8E8BA6;font-weight:500;}',
      '.vl-rev-report{display:inline-block;margin-top:10px;font:500 11px/1 ' + FONT + ';color:#8E8BA6;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;}',
      '.vl-rev-report:hover{color:#C0392B;}',
      '.vl-rev-report-box{margin-top:10px;padding:10px 12px;background:#FBF7FF;border:.5px solid #E4DCF7;border-radius:8px;}',
      '.vl-rev-report-box textarea{width:100%;min-height:64px;font:400 12.5px/1.5 ' + FONT + ';color:#1A1829;border:.5px solid #C8C6D8;border-radius:6px;padding:8px;box-sizing:border-box;resize:vertical;background:#fff;}',
      '.vl-rev-report-actions{display:flex;gap:10px;margin-top:8px;align-items:center;}',
      '.vl-rev-report-send{font:600 12px/1 ' + FONT + ';color:#fff;background:#6002EE;border:none;border-radius:100px;padding:8px 16px;cursor:pointer;}',
      '.vl-rev-report-cancel{font:500 12px/1 ' + FONT + ';color:#8E8BA6;background:none;border:none;padding:0;cursor:pointer;}',
      '.vl-rev-report-done{margin-top:10px;font:600 11.5px/1.4 ' + FONT + ';color:#6002EE;}',
      '.vl-rev-reply-btn{display:inline-block;margin-top:10px;margin-right:14px;font:600 11.5px/1 ' + FONT + ';color:#6002EE;background:#F3EBFF;border:none;border-radius:100px;padding:6px 14px;cursor:pointer;}',
      '.vl-rev-reply-btn:hover{background:#E9DCFF;}',
      '.vl-vreport{margin-top:28px;padding-top:14px;border-top:.5px solid #EEEDF6;}',
      '.vl-vreport-link{font:500 11.5px/1 ' + FONT + ';color:#8E8BA6;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;}',
      '.vl-vreport-link:hover{color:#EE0290;}',
      '.vl-vreport-box{margin-top:10px;padding:12px;background:#FBF7FF;border:.5px solid #E4DCF7;border-radius:10px;max-width:480px;}',
      '.vl-vreport-box select{display:block;width:100%;font:500 12.5px/1.4 ' + FONT + ';color:#1A1829;border:.5px solid #C8C6D8;border-radius:6px;padding:8px;background:#fff;margin-bottom:8px;}',
      '.vl-vreport-box textarea{width:100%;min-height:64px;font:400 12.5px/1.5 ' + FONT + ';color:#1A1829;border:.5px solid #C8C6D8;border-radius:6px;padding:8px;box-sizing:border-box;resize:vertical;background:#fff;}',
      '.vl-vreport-note{font:400 11px/1.5 ' + FONT + ';color:#8E8BA6;margin-top:6px;}',
      '.vl-rev-pill{display:inline-flex;align-items:center;gap:5px;font:600 11px/1 ' + FONT + ';color:#2BB673;background:#E4F7EE;border-radius:100px;padding:4px 10px;margin-bottom:8px;}',
      '.vl-rev-pill.no{color:#C0392B;background:#FDECEC;}',
      '.vl-rev-body{font:400 13px/1.6 ' + FONT + ';color:#4A4761;}',
      '.vl-rev-reply{margin-top:10px;padding:10px 12px;background:#F7F6FC;border-radius:8px;border-left:2px solid #6002EE;}',
      '.vl-rev-reply-label{font:600 11px/1 ' + FONT + ';color:#6002EE;margin-bottom:4px;}',
      '.vl-rev-reply-body{font:400 12.5px/1.55 ' + FONT + ';color:#4A4761;}',
      '.vl-rev-when{font:500 11px/1 ' + FONT + ';color:#8E8BA6;margin-top:9px;}',
      '.vl-rev-empty{text-align:center;padding:2.5rem 1.5rem;border:.5px dashed #C8C6D8;border-radius:14px;background:#fff;}',
      '.vl-rev-empty-title{font:600 15px/1.3 ' + FONT + ';color:#1A1829;margin-bottom:5px;}',
      '.vl-rev-empty-sub{font:400 13px/1.5 ' + FONT + ';color:#8E8BA6;}',
      '.vl-rev-cta{display:inline-block;margin-top:14px;font:600 13px/1 ' + FONT + ';color:#6002EE;text-decoration:none;}'
    ].join('');
    document.head.appendChild(s);
  }

  function reviewWhen(v) {
    var t = (typeof v === 'number') ? v : Date.parse(v); if (!t || isNaN(t)) return '';
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var d = new Date(t); return M[d.getMonth()] + ' ' + d.getFullYear();
  }

  function reviewCard(r) {
    var card = ce('div', 'vl-rev');
    if (r.id != null) card.setAttribute('data-rev-id', String(r.id));
    var head = ce('div', 'vl-rev-head');
    var av = ce('div', 'vl-rev-av'); av.textContent = initials(r.author_name || 'A neighbor');
    head.appendChild(av);
    var who = ce('div', 'vl-rev-who');
    var nm = ce('div', 'vl-rev-name'); nm.textContent = r.author_name || 'A neighbor';
    who.appendChild(nm);
    // Two trust tiers: inquiry-sourced reviews (Lokali provably delivered the
    // message) get the green "Verified contact" check; click-sourced ones
    // (call/sms/whatsapp/email intent) get a neutral "Contacted through Lokali".
    var isVerified = r.is_verified_contact === true;
    var ver = ce('div', 'vl-rev-verified' + (isVerified ? '' : ' vl-rev-contacted'));
    if (isVerified) {
      ver.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      ver.appendChild(document.createTextNode(' Verified contact'));
    } else {
      ver.textContent = 'Contacted through Lokali';
    }
    who.appendChild(ver);
    head.appendChild(who);
    card.appendChild(head);
    var rec = !!r.is_recommended;
    var pill = ce('div', 'vl-rev-pill' + (rec ? '' : ' no'));
    pill.textContent = rec ? '👍 Recommends' : '👎 Doesn’t recommend';
    card.appendChild(pill);
    if (r.comment) { var b = ce('div', 'vl-rev-body'); b.textContent = r.comment; card.appendChild(b); }
    if (r.vendor_reply) {
      var rep = ce('div', 'vl-rev-reply');
      var rl = ce('div', 'vl-rev-reply-label'); rl.textContent = 'Response from the owner';
      var rb = ce('div', 'vl-rev-reply-body'); rb.textContent = r.vendor_reply;
      rep.appendChild(rl); rep.appendChild(rb); card.appendChild(rep);
    }
    if (r.created_at) { var w = ce('div', 'vl-rev-when'); w.textContent = reviewWhen(r.created_at); card.appendChild(w); }
    return card;
  }

  // ---- customer → vendor fraud flagging -----------------------------------
  // Quiet "Report this vendor" link at the bottom of the About panel, for
  // signed-in users who are NOT the owner (owners get the review-report flow
  // instead; anonymous visitors have the contact form). Reporting never hides
  // the listing — it queues a vendor_reports row for Lokali moderation.
  var VREPORT_CATEGORIES = [
    ['scam', 'Scam — took money / never showed'],
    ['not_real', 'Not a real business'],
    ['misleading', 'Misleading listing or photos'],
    ['inappropriate', 'Inappropriate content'],
    ['other', 'Something else']
  ];

  function injectVendorReport(v) {
    var API = window.LokaliAPI;
    if (!v || v.id == null || !API || !API.auth || !API.auth.getToken || !API.auth.getToken()) return;
    if (!API.vendors || !API.vendors.reportVendor) return;
    var mount = $('[data-vl-panel="about"]') || $('[data-vl-panel="reviews"]');
    if (!mount || mount.querySelector('.vl-vreport')) return;
    injectReviewStyles();
    var render = function () {
      if (mount.querySelector('.vl-vreport')) return;
      var wrap = ce('div', 'vl-vreport');
      var link = ce('button', 'vl-vreport-link');
      link.type = 'button';
      // Font Awesome Free "flag" (regular), fill flattened to currentColor so
      // it follows the link's gray → hover-red states.
      link.innerHTML = '<svg width="12" height="12" viewBox="0 0 640 640" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-1px;margin-right:5px;" aria-hidden="true"><path fill="currentColor" d="M144 88C144 74.7 133.3 64 120 64C106.7 64 96 74.7 96 88L96 552C96 565.3 106.7 576 120 576C133.3 576 144 565.3 144 552L144 452L224.3 431.9C265.4 421.6 308.9 426.4 346.8 445.3C391 467.4 442.3 470.1 488.5 452.7L523.2 439.7C535.7 435 544 423.1 544 409.7L544 130C544 107 519.8 92 499.2 102.3L489.6 107.1C443.3 130.3 388.8 130.3 342.5 107.1C307.4 89.5 267.1 85.1 229 94.6L144 116L144 88zM144 165.5L240.6 141.3C267.6 134.6 296.1 137.7 321 150.1C375.9 177.5 439.7 179.8 496 156.9L496 398.7L471.6 407.8C437.9 420.4 400.4 418.5 368.2 402.4C320 378.3 264.9 372.3 212.6 385.3L144 402.5L144 165.5z"/></svg>';
      link.appendChild(document.createTextNode('Report this vendor'));
      link.addEventListener('click', function () { openVendorReportBox(wrap, link, v.id); });
      wrap.appendChild(link);
      mount.appendChild(wrap);
    };
    // Hide from the listing's own vendor (server blocks self-reports anyway).
    if (API.vendors.me) {
      API.vendors.me().then(function (vm) {
        var mine = (vm && vm.data) || null;
        if (mine && mine.vendor) mine = mine.vendor;
        if (mine && String(mine.id) === String(v.id)) return;
        render();
      }).catch(render);
    } else { render(); }
  }

  function openVendorReportBox(wrap, link, vendorId) {
    if (wrap.querySelector('.vl-vreport-box')) return;
    link.style.display = 'none';
    var box = ce('div', 'vl-vreport-box');
    var sel = document.createElement('select');
    VREPORT_CATEGORIES.forEach(function (c) {
      var o = document.createElement('option'); o.value = c[0]; o.textContent = c[1]; sel.appendChild(o);
    });
    var ta = document.createElement('textarea');
    ta.placeholder = 'Tell us what happened — the more detail, the faster we can act.';
    ta.maxLength = 1000;
    var actions = ce('div', 'vl-rev-report-actions');
    var send = ce('button', 'vl-rev-report-send'); send.type = 'button'; send.textContent = 'Send report';
    var cancel = ce('button', 'vl-rev-report-cancel'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { box.remove(); link.style.display = ''; });
    send.addEventListener('click', function () {
      var reason = String(ta.value || '').trim();
      if (reason.length < 5) { ta.focus(); return; }
      send.disabled = true; send.textContent = 'Sending…';
      window.LokaliAPI.vendors.reportVendor(vendorId, sel.value, reason).then(function (res) {
        if (res && res.error) { send.disabled = false; send.textContent = 'Send report'; return; }
        var done = ce('div', 'vl-rev-report-done');
        done.textContent = 'Thank you — the Lokali team will look into this.';
        box.replaceWith(done);
      }).catch(function () { send.disabled = false; send.textContent = 'Send report'; });
    });
    actions.appendChild(send); actions.appendChild(cancel);
    var note = ce('div', 'vl-vreport-note');
    note.textContent = 'Reports are reviewed by a person — we may follow up at your account email. The listing stays visible while we check.';
    box.appendChild(sel); box.appendChild(ta); box.appendChild(actions); box.appendChild(note);
    wrap.appendChild(box);
    ta.focus();
  }

  // ---- vendor-owner review controls --------------------------------------
  // If the signed-in user OWNS this listing, each review card gets owner-only
  // controls: a "Reply" button → inline box → PATCH vendor/me/reviews/{id}/reply
  // (public "Response from the owner"), shown only while the review has no reply
  // yet; and a quiet "Report" link → POST .../report for fraudulent reviews.
  // Neither ever hides the review — replies are public, reports queue for
  // Lokali moderation. One vendors.me() resolves the owner for both.
  function maybeAddReportButtons(panel, vendorId) {
    var API = window.LokaliAPI;
    if (!API || !API.auth || !API.auth.getToken || !API.auth.getToken()) return;
    if (!API.vendors || !API.vendors.me || !API.reviews || !API.reviews.report) return;
    API.vendors.me().then(function (vm) {
      var v = (vm && vm.data) || null;
      if (v && v.vendor) v = v.vendor; // unwrap if nested
      if (!v || String(v.id) !== String(vendorId)) return; // not the owner
      var canReply = !!API.reviews.reply;
      $all('[data-rev-id]', panel).forEach(function (card) {
        // Reply — only when this review has no owner response yet.
        if (canReply && !card.querySelector('.vl-rev-reply') && !card.querySelector('.vl-rev-reply-btn')) {
          var rbtn = ce('button', 'vl-rev-reply-btn');
          rbtn.type = 'button';
          rbtn.textContent = 'Reply';
          rbtn.addEventListener('click', function () { openReplyBox(card, rbtn); });
          card.appendChild(rbtn);
        }
        if (card.querySelector('.vl-rev-report')) return;
        var btn = ce('button', 'vl-rev-report');
        btn.type = 'button';
        btn.textContent = 'Report as fraudulent';
        btn.addEventListener('click', function () { openReportBox(card, btn); });
        card.appendChild(btn);
      });
    }).catch(function () {});
  }

  // Owner-only inline reply composer on a review card. On success it drops the
  // "Response from the owner" block into the card (above the date) and removes
  // the Reply button — mirroring how reviewCard() renders a persisted reply.
  function openReplyBox(card, btn) {
    if (card.querySelector('.vl-rev-reply-box')) return;
    btn.style.display = 'none';
    var box = ce('div', 'vl-rev-report-box'); box.classList.add('vl-rev-reply-box');
    var ta = document.createElement('textarea');
    ta.placeholder = 'Write a public reply — a quick thank-you goes a long way.';
    ta.maxLength = 1000;
    var actions = ce('div', 'vl-rev-report-actions');
    var send = ce('button', 'vl-rev-report-send'); send.type = 'button'; send.textContent = 'Post reply';
    var cancel = ce('button', 'vl-rev-report-cancel'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { box.remove(); btn.style.display = ''; });
    send.addEventListener('click', function () {
      var reply = String(ta.value || '').trim();
      if (reply.length < 1) { ta.focus(); return; }
      send.disabled = true; send.textContent = 'Posting…';
      window.LokaliAPI.reviews.reply(card.getAttribute('data-rev-id'), reply).then(function (res) {
        if (res && res.error) { send.disabled = false; send.textContent = 'Post reply'; return; }
        var rep = ce('div', 'vl-rev-reply');
        var rl = ce('div', 'vl-rev-reply-label'); rl.textContent = 'Response from the owner';
        var rb = ce('div', 'vl-rev-reply-body'); rb.textContent = reply;
        rep.appendChild(rl); rep.appendChild(rb);
        var when = card.querySelector('.vl-rev-when');
        if (when) card.insertBefore(rep, when); else card.appendChild(rep);
        box.remove();
      }).catch(function () { send.disabled = false; send.textContent = 'Post reply'; });
    });
    actions.appendChild(send); actions.appendChild(cancel);
    box.appendChild(ta); box.appendChild(actions);
    card.appendChild(box);
    ta.focus();
  }

  function openReportBox(card, btn) {
    if (card.querySelector('.vl-rev-report-box')) return;
    btn.style.display = 'none';
    var box = ce('div', 'vl-rev-report-box');
    var ta = document.createElement('textarea');
    ta.placeholder = 'Why do you believe this review is fake? (e.g. never a customer, wrong business, spam)';
    ta.maxLength = 1000;
    var actions = ce('div', 'vl-rev-report-actions');
    var send = ce('button', 'vl-rev-report-send'); send.type = 'button'; send.textContent = 'Send report';
    var cancel = ce('button', 'vl-rev-report-cancel'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { box.remove(); btn.style.display = ''; });
    send.addEventListener('click', function () {
      var reason = String(ta.value || '').trim();
      if (reason.length < 5) { ta.focus(); return; }
      send.disabled = true; send.textContent = 'Sending…';
      window.LokaliAPI.reviews.report(card.getAttribute('data-rev-id'), reason).then(function (res) {
        if (res && res.error) { send.disabled = false; send.textContent = 'Send report'; return; }
        var done = ce('div', 'vl-rev-report-done');
        done.textContent = 'Flagged for review — the Lokali team will take a look. The review stays visible while we check.';
        box.replaceWith(done);
      }).catch(function () { send.disabled = false; send.textContent = 'Send report'; });
    });
    actions.appendChild(send); actions.appendChild(cancel);
    box.appendChild(ta); box.appendChild(actions);
    card.appendChild(box);
    ta.focus();
  }

  function renderReviews(vendorId, vendorName) {
    var panel = $('[data-vl-panel="reviews"]');
    if (!panel) return;
    injectReviewStyles();
    setTabVisible('reviews', true); // always shown — never-zero "be the first" design
    var API = window.LokaliAPI;
    if (!API || !API.reviews || !API.reviews.forVendor) { ensureActiveTab(); return; }
    API.reviews.forVendor(vendorId).then(function (res) {
      var data = res && res.data; var items = (data && (data.items || data)) || [];
      if (!Array.isArray(items)) items = [];
      panel.innerHTML = '';
      if (items.length) {
        var rec = items.filter(function (r) { return r.is_recommended; }).length;
        var sum = ce('div', 'vl-rev-summary');
        var strong = ce('strong'); strong.textContent = String(rec);
        sum.appendChild(strong);
        sum.appendChild(document.createTextNode(' ' + (rec === 1 ? 'neighbor recommends ' : 'neighbors recommend ') + (vendorName || 'this vendor')));
        panel.appendChild(sum);
        items.forEach(function (r) { panel.appendChild(reviewCard(r)); });
        maybeAddReportButtons(panel, vendorId);
      } else {
        var e = ce('div', 'vl-rev-empty');
        var t = ce('div', 'vl-rev-empty-title'); t.textContent = 'Be the first to recommend ' + (vendorName || 'this vendor');
        var sub = ce('div', 'vl-rev-empty-sub'); sub.textContent = 'Contacted them through Lokali? Share how it went.';
        var cta = ce('a', 'vl-rev-cta'); cta.href = '/account#reviews'; cta.textContent = 'Leave a review →';
        e.appendChild(t); e.appendChild(sub); e.appendChild(cta);
        panel.appendChild(e);
      }
      // #reviews deep-link (the review-notification email points here so the
      // owner lands straight on the Reviews tab where the Reply controls are).
      if ((window.location.hash || '').toLowerCase() === '#reviews') activateTab('reviews');
      else ensureActiveTab();
    }).catch(function () {
      if ((window.location.hash || '').toLowerCase() === '#reviews') activateTab('reviews');
      else ensureActiveTab();
    });
  }

  function init() { injectStyles(); initTabs(); initSave(); hydrate(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
