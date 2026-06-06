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
    if (/^https?:\/\//.test(p)) return p;
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
    ".vl-avatar-txt{color:#6002EE;font-weight:600;font-size:30px;letter-spacing:.5px;font-family:'Plus Jakarta Sans',sans-serif;line-height:1;}"
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

  function initSave() {
    var btn = document.getElementById('vl-save');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var on = btn.classList.toggle('vl-save-on');
      var label = btn.querySelector('.vl-save-label');
      if (label) label.textContent = on ? 'Saved' : 'Save vendor';
      // TODO: persist saved vendors (localStorage or Xano) when that feature lands.
    });
  }

  // ---- 2. vendor id resolution -----------------------------------------
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
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return v.url || v.path || '';
    return '';
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
  var IMG_TINTS = ['#FFF1E6', '#F3EBFF', '#EAFAF2', '#FEF9E6'];
  function cardEl(opts) {
    var a = document.createElement('a');
    a.className = 'vl-card';
    a.href = opts.href || '#';
    var img = '<div class="vl-card-img" style="background:' + opts.tint + ';">' +
      (opts.image ? '<img src="' + opts.image + '" alt="' + (opts.name || '') + '"/>' : '') + '</div>';
    var priceClass = 'vl-card-price' + (opts.quote ? ' vl-card-price-quote' : '');
    var ctaClass = 'vl-card-cta' + (opts.orange ? ' vl-card-cta-orange' : '');
    a.innerHTML = img +
      '<div class="vl-card-body"><div class="vl-card-top">' +
      '<div class="vl-card-name"></div>' +
      '<div class="' + priceClass + '"></div></div>' +
      '<div class="vl-card-desc"></div>' +
      '<div class="vl-card-foot"><span class="' + ctaClass + '">' + (opts.cta || 'Inquire') + '</span></div></div>';
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
        href: s.id != null ? ('/service?id=' + s.id + (currentVendorId != null ? '&vendor=' + currentVendorId : '')) : '#'
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
        href: p.id != null ? ('/product-detail?id=' + p.id + (currentVendorId != null ? '&vendor=' + currentVendorId : '')) : '#'
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
  }

  // ---- hero + about population ------------------------------------------
  function populateVendor(v, labels) {
    setText('vl-name', v.business_name);
    setText('vl-tagline', v.business_tagline || '');
    var tagEl = document.getElementById('vl-tagline');
    if (tagEl && !(v.business_tagline)) show(tagEl, false);

    // avatar — show the photo, falling back to initials when there's no image (or it fails to load)
    var av = document.getElementById('vl-avatar');
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
    show(document.getElementById('vl-badge-verified'), !!(v.address_verified || v.is_verified));

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

  // ---- 3/4. fetch + render ---------------------------------------------
  function hydrate() {
    if (!window.LokaliAPI) { console.warn('[lokali-vendor-listing] LokaliAPI not loaded'); return; }
    var id = resolveVendorId();
    if (!id) { console.warn('[lokali-vendor-listing] no vendor id in URL'); return; }
    var API = window.LokaliAPI;

    Promise.all([
      API.vendors.getById(id),
      API.data.categories ? API.data.categories() : Promise.resolve({ data: [] }),
      API.data.locations ? API.data.locations() : Promise.resolve({ data: [] })
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
      loadPortfolio(vid, v);
      API.services.listByVendor(vid).then(function (sres) { renderServices(asArray(unwrap(sres)), !(sres && sres.error)); });
      API.products.listByVendor(vid).then(function (pres) { renderProducts(asArray(unwrap(pres)), !(pres && pres.error)); });
    });
  }

  function init() { injectStyles(); initTabs(); initSave(); hydrate(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
