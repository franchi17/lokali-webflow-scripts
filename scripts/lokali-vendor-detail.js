/**
 * Lokali — Service / Product detail page hydration + gallery.
 *
 * Load AFTER scripts/lokali-api-client.js. Used on BOTH the Service Detail (/service)
 * and Product Detail (/product-detail) pages — it reads data-vd-type ("service"|"product")
 * from the [data-vd-type] root to decide which API to call.
 *
 * URL params:
 *   ?id=<itemId>           required (service id or product id)
 *   ?vendor=<vendorId>     recommended (needed for product lookup, used for back-link)
 *
 * Services: GET services/{id} is public. Products: GET products/{id} is owner-only,
 * so products are resolved from the public list products?vendor_id=<vendor> and matched by id.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function setText(id, v) { var el = $(id); if (el && v != null && v !== '') el.textContent = String(v); }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
  function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }
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
  function cents(n) { var x = Number(n); if (!isFinite(x)) return ''; return '$' + (x % 100 === 0 ? (x / 100).toFixed(0) : (x / 100).toFixed(2)); }

  function pageType() {
    var el = document.querySelector('[data-vd-type]');
    return el ? el.getAttribute('data-vd-type') : null;
  }
  function params() { return new URLSearchParams(window.location.search || ''); }

  // ---- per-item photos (up to 5; Pro/Featured plans) --------------------
  // Public list endpoints (configurable). Plan gating (max 5) is enforced server-side
  // on upload, so Free-plan items return just their single image and the strip shows one.
  var PHOTOS_MAX = 5;
  var SERVICE_PHOTOS_PATH = (typeof window !== 'undefined' && window.LOKALI_SERVICE_PHOTOS_PATH) || 'service/id/{id}/photos/list';
  var PRODUCT_PHOTOS_PATH = (typeof window !== 'undefined' && window.LOKALI_PRODUCT_PHOTOS_PATH) || 'product/id/{id}/photos/list';

  function fetchPhotos(base, pathTpl, id, fallback) {
    var fb = fallback ? [fallback] : [];
    if (!id || !window.LokaliAPI) return Promise.resolve(fb);
    var path = pathTpl.replace('{id}', encodeURIComponent(id));
    return window.LokaliAPI.request(base, 'GET', path, null, false).then(function (res) {
      if (!res || res.error) return fb; // endpoint missing/not built yet -> fall back to single image
      var arr = asArray(unwrap(res))
        .filter(function (p) { return p && p.is_active !== false && imgUrl(p.image_url || p.image); })
        .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
        .map(function (p) { return imgUrl(p.image_url || p.image); })
        .slice(0, PHOTOS_MAX);
      return arr.length ? arr : fb;
    }).catch(function () { return fb; });
  }

  // ---- gallery ----------------------------------------------------------
  function buildGallery(images) {
    var gallery = $('vd-gallery');
    var pips = $('vd-pips');
    if (!gallery) return;
    var list = (images || []).filter(Boolean);
    if (!list.length) return; // keep placeholder frame
    gallery.innerHTML = '';
    if (pips) pips.innerHTML = '';
    list.forEach(function (src, i) {
      var f = document.createElement('div');
      f.className = 'vd-frame ' + (i === 0 ? 'vd-frame-main' : 'vd-frame-peek');
      var img = document.createElement('img');
      img.src = src; img.alt = '';
      f.appendChild(img);
      gallery.appendChild(f);
      if (pips) {
        var p = document.createElement('span');
        p.className = 'vd-pip' + (i === 0 ? ' vd-pip-active' : '');
        pips.appendChild(p);
      }
    });
    if (pips) pips.style.display = list.length < 2 ? 'none' : '';
    wireGallery(gallery, pips);
  }

  function wireGallery(strip, pips) {
    if (!strip) return;
    var pipEls = pips ? pips.querySelectorAll('.vd-pip') : [];
    strip.addEventListener('scroll', function () {
      if (!pipEls.length) return;
      var idx = Math.round(strip.scrollLeft / strip.offsetWidth);
      for (var i = 0; i < pipEls.length; i++) pipEls[i].classList.toggle('vd-pip-active', i === idx);
    }, { passive: true });
    var down = false, startX = 0, startScroll = 0;
    strip.addEventListener('mousedown', function (e) { down = true; startX = e.pageX; startScroll = strip.scrollLeft; });
    strip.addEventListener('mouseleave', function () { down = false; });
    strip.addEventListener('mouseup', function () { down = false; });
    strip.addEventListener('mousemove', function (e) { if (!down) return; e.preventDefault(); strip.scrollLeft = startScroll - (e.pageX - startX); });
  }

  // ---- vendor mini-card + back link + CTA -------------------------------
  function fillVendor(vendorId, itemName, isProduct) {
    var back = $('vd-back'); if (back && vendorId) back.href = '/vendor?id=' + encodeURIComponent(vendorId);
    var link = $('vd-mini-link'); if (link && vendorId) link.href = '/vendor?id=' + encodeURIComponent(vendorId);
    if (!vendorId || !window.LokaliAPI) return;
    window.LokaliAPI.vendors.getById(vendorId).then(function (res) {
      var v = unwrap(res); if (v && v.vendor) v = v.vendor; // { vendor: {...} } envelope
      if (!v) return;
      setText('vd-mini-name', v.business_name);
      var av = $('vd-mini-avatar-img'); var photo = imgUrl(v.profile_photo); if (av && photo) av.src = photo;
      // CTA -> mailto
      var cta = $('vd-cta-btn');
      if (cta && v.contact_email) {
        var subj = 'I found you on Lokali — inquiry about ' + (itemName || (isProduct ? 'your product' : 'your service'));
        var body = "Hi " + (v.business_name || 'there') + ", I found your listing on Lokali and I'm interested in " +
          (itemName ? ('"' + itemName + '"') : (isProduct ? 'ordering this product' : 'this service')) + '.';
        cta.href = 'mailto:' + v.contact_email + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
      }
    });
  }

  // ---- service ----------------------------------------------------------
  function hydrateService(id, vendorParam) {
    window.LokaliAPI.services.getById(id).then(function (res) {
      var s = unwrap(res); if (!s) { console.warn('[vd] service not found'); return; }
      var name = s.service_name || s.name || '';
      setText('vd-name', name);
      document.title = name + ' — Lokali';
      setText('vd-desc', s.service_description || s.description || '');
      // price
      var priceEl = $('vd-price');
      var t = (s.price_type || '').toLowerCase();
      if (priceEl) {
        if (t === 'quote' || s.is_quote_based) { priceEl.textContent = 'Get a quote'; priceEl.classList.add('vd-price-quote'); }
        else if (s.price_min_cents != null) priceEl.textContent = 'From ' + cents(s.price_min_cents);
        else if (s.price_cents != null) priceEl.textContent = (t === 'from' || t === 'starting' ? 'From ' : '') + cents(s.price_cents);
        else if (s.price_note) { priceEl.textContent = s.price_note; priceEl.classList.add('vd-price-quote'); }
      }
      // remote tag
      show($('vd-tag-remote'), !!s.remote);
      // meta: duration / price
      if (s.duration_minutes != null) {
        var m = Number(s.duration_minutes);
        var dur = m >= 60 ? (Math.round((m / 60) * 10) / 10) + ' hr' + (m >= 120 ? 's' : '') : m + ' min';
        setText('vd-meta-k1', 'Duration'); setText('vd-meta-v1', dur);
      }
      var v2 = $('vd-meta-v2'); if (v2 && priceEl) v2.textContent = priceEl.textContent;
      fetchPhotos('services', SERVICE_PHOTOS_PATH, (s.id != null ? s.id : id), imgUrl(s.image_url || s.image)).then(buildGallery);
      var vid = vendorParam || s.vendors_id || s.vendor_id;
      fillVendor(vid, name, false);
    });
  }

  // ---- product ----------------------------------------------------------
  function hydrateProduct(id, vendorParam) {
    // products/{id} is owner-only; resolve from public vendor list.
    var done = function (p) {
      if (!p) { console.warn('[vd] product not found'); return; }
      var name = p.product_name || p.name || '';
      setText('vd-name', name);
      document.title = name + ' — Lokali';
      setText('vd-desc', p.product_description || p.description || '');
      var priceEl = $('vd-price');
      if (priceEl) {
        if (p.is_quote_based) { priceEl.textContent = 'Get a quote'; priceEl.classList.add('vd-price-quote'); }
        else if (p.price != null && p.price !== '') { var n = Number(p.price); priceEl.textContent = isFinite(n) ? '$' + n : String(p.price); }
        else if (p.price_note) { priceEl.textContent = p.price_note; priceEl.classList.add('vd-price-quote'); }
      }
      show($('vd-tag-custom'), !!p.is_custom);
      show($('vd-tag-shipping'), !!p.shipping_offered);
      show($('vd-tag-pickup'), !!p.pickup_only || !!p.shipping_offered);
      if (p.turnaround_days != null) setText('vd-meta-v1', p.turnaround_days + ' days');
      var fulfil = p.shipping_offered && p.pickup_only ? 'Shipping & local pickup' : (p.shipping_offered ? 'Shipping' : (p.pickup_only ? 'Local pickup' : '—'));
      setText('vd-meta-v2', fulfil);
      setText('vd-meta-v3', p.is_custom ? 'Made to order' : 'Standard');
      fetchPhotos('products', PRODUCT_PHOTOS_PATH, (p.id != null ? p.id : id), imgUrl(p.image_url || p.image)).then(buildGallery);
      var vid = vendorParam || p.vendors_id || p.vendor_id;
      fillVendor(vid, name, true);
    };
    if (vendorParam) {
      window.LokaliAPI.products.listByVendor(vendorParam).then(function (res) {
        var found = asArray(unwrap(res)).filter(function (x) { return String(x.id) === String(id); })[0];
        done(found);
      });
    } else {
      // last resort: owner endpoint (works only if logged in as owner)
      window.LokaliAPI.products.getById(id).then(function (res) { done(unwrap(res)); });
    }
  }

  function init() {
    if (!window.LokaliAPI) { console.warn('[lokali-vendor-detail] LokaliAPI not loaded'); return; }
    var type = pageType();
    var p = params();
    var id = p.get('id');
    var vendor = p.get('vendor');
    if (!id) { console.warn('[lokali-vendor-detail] no id in URL'); return; }
    if (type === 'product') hydrateProduct(id, vendor);
    else hydrateService(id, vendor);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
