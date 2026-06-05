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

  // ---- 1. interactivity -------------------------------------------------
  function initTabs() {
    var tabs = $all('[data-vl-tab]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-vl-tab');
        tabs.forEach(function (t) { t.classList.toggle('vl-stab-active', t === tab); });
        $all('[data-vl-panel]').forEach(function (p) {
          show(p, p.getAttribute('data-vl-panel') === name);
        });
      });
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

  function renderServices(list) {
    var grid = document.getElementById('vl-services-grid');
    var empty = document.getElementById('vl-services-empty');
    setText('vl-count-services', list.length);
    var countEl = document.getElementById('vl-count-services'); if (countEl) countEl.textContent = String(list.length);
    if (!grid) return;
    grid.innerHTML = '';
    if (!list.length) { show(grid, false); show(empty, true); return; }
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
  }

  function renderProducts(list) {
    var grid = document.getElementById('vl-products-grid');
    var empty = document.getElementById('vl-products-empty');
    var countEl = document.getElementById('vl-count-products'); if (countEl) countEl.textContent = String(list.length);
    if (!grid) return;
    grid.innerHTML = '';
    if (!list.length) { show(grid, false); show(empty, true); return; }
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

    // avatar
    var av = document.getElementById('vl-avatar');
    var photo = imgUrl(v.profile_photo);
    if (av && photo) av.src = photo;

    // badges
    show(document.getElementById('vl-badge-founding'), !!v.is_founding_member);
    show(document.getElementById('vl-badge-verified'), !!v.address_verified);

    // category (first categories_id mapped via labels.categories)
    var catName = '';
    if (Array.isArray(v.categories_id) && v.categories_id.length && labels.categories) {
      catName = labels.categories[v.categories_id[0]] || '';
    }
    if (catName) { setText('vl-category', catName); setText('vl-about-category', catName); }

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
      API.services.listByVendor(vid).then(function (sres) { renderServices(asArray(unwrap(sres))); });
      API.products.listByVendor(vid).then(function (pres) { renderProducts(asArray(unwrap(pres))); });
    });
  }

  function init() { initTabs(); initSave(); hydrate(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
