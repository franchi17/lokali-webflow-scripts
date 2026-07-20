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

  // Retry a request on a transient error (Xano free-tier 429 / cold start /
  // network). Without this, a rate-limited fetch left the page showing the
  // Webflow TEMPLATE PLACEHOLDERS (a different demo vendor's name/category/
  // item), because the hydrators only overwrite the markup on a successful
  // response. Real fix for the underlying limit is the paid Xano tier.
  function reqRetry(makeReq, tries) {
    tries = tries || 4;
    return makeReq().then(function (res) {
      var transient = res && res.error &&
        /rate|429|whoa|requests per|timeout|network|cold/i.test(String(res.error));
      if (transient && tries > 1) {
        return new Promise(function (r) { setTimeout(r, 1600); })
          .then(function () { return reqRetry(makeReq, tries - 1); });
      }
      return res;
    });
  }
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
    // Block javascript:/data: schemes + attribute/CSS-breakout chars.
    if (!s || /[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    if (/^https?:\/\//.test(s)) return s;
    if (s.indexOf('//') === 0) return '';
    // Relative path (Xano-era /vault/... uploads): resolve against the file
    // base like lokali-vendor-listing.js photoUrl() does — returned as-is it
    // resolved against golokali.com and 404'd (vendor avatar showed as an
    // empty circle on service/product pages).
    var base = window.LOKALI_FILE_BASE || 'https://x8ki-letl-twmt.n7.xano.io';
    return base.replace(/\/$/, '') + (s.charAt(0) === '/' ? '' : '/') + s;
  }
  function cents(n) { var x = Number(n); if (!isFinite(x)) return ''; return '$' + (x % 100 === 0 ? (x / 100).toFixed(0) : (x / 100).toFixed(2)); }
  // Hide the .vd-meta-row containing the given key element (placeholder rows
  // the template pre-fills with sample text, e.g. "Lead time / 5–7 days").
  function hideMetaRow(keyId) {
    var k = $(keyId);
    var row = k && k.closest ? k.closest('.vd-meta-row') : null;
    if (row) row.style.display = 'none';
    else if (k) { k.style.display = 'none'; var val = $(keyId.replace('-k', '-v')); if (val) val.style.display = 'none'; }
  }

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

  // ---- click-to-enlarge lightbox (#63) ----------------------------------
  // Self-contained (no external lib). Lazily builds a full-screen overlay the
  // first time a photo is clicked. Dismiss on ✕ / Esc / backdrop click; prev/next
  // (arrows + ← → keys) when there's more than one photo. The <img> src is always
  // set via the property from a known photo URL (never innerHTML) — SEC-001 safe.
  var _lbApi = null;
  function ensureLightbox() {
    if (_lbApi) return _lbApi;
    var FONT = '"Plus Jakarta Sans",system-ui,sans-serif';
    var st = document.createElement('style');
    st.textContent = [
      '.lok-lb{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(20,16,40,.9);}',
      '.lok-lb.lok-lb-open{display:flex;}',
      '.lok-lb-img{max-width:92vw;max-height:88vh;border-radius:10px;box-shadow:0 16px 60px rgba(0,0,0,.55);user-select:none;-webkit-user-drag:none;}',
      '.lok-lb-btn{position:absolute;background:rgba(255,255,255,.16);border:none;color:#fff;cursor:pointer;border-radius:50%;width:44px;height:44px;font:400 24px/1 ' + FONT + ';display:flex;align-items:center;justify-content:center;transition:background .15s;}',
      '.lok-lb-btn:hover{background:rgba(255,255,255,.3);}',
      '.lok-lb-close{top:18px;right:18px;}',
      '.lok-lb-prev{left:18px;top:50%;transform:translateY(-50%);}',
      '.lok-lb-next{right:18px;top:50%;transform:translateY(-50%);}',
      '.lok-lb-count{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:#fff;font:600 13px/1 ' + FONT + ';background:rgba(255,255,255,.16);border-radius:100px;padding:7px 14px;}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
    var mkBtn = function (cls, txt, label) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'lok-lb-btn ' + cls;
      b.textContent = txt; b.setAttribute('aria-label', label); return b;
    };
    var ov = document.createElement('div'); ov.className = 'lok-lb'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    var img = document.createElement('img'); img.className = 'lok-lb-img'; img.alt = '';
    var close = mkBtn('lok-lb-close', '✕', 'Close');
    var prev = mkBtn('lok-lb-prev', '‹', 'Previous photo');
    var next = mkBtn('lok-lb-next', '›', 'Next photo');
    var count = document.createElement('div'); count.className = 'lok-lb-count';
    ov.appendChild(img); ov.appendChild(close); ov.appendChild(prev); ov.appendChild(next); ov.appendChild(count);
    document.body.appendChild(ov);
    var urls = [], idx = 0;
    var render = function () {
      img.src = urls[idx] || '';
      var multi = urls.length > 1;
      count.textContent = (idx + 1) + ' / ' + urls.length;
      prev.style.display = next.style.display = count.style.display = multi ? '' : 'none';
    };
    var go = function (d) { if (!urls.length) return; idx = (idx + d + urls.length) % urls.length; render(); };
    var closeIt = function () { ov.classList.remove('lok-lb-open'); img.removeAttribute('src'); document.body.style.overflow = ''; };
    close.addEventListener('click', closeIt);
    prev.addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
    next.addEventListener('click', function (e) { e.stopPropagation(); go(1); });
    img.addEventListener('click', function (e) { e.stopPropagation(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) closeIt(); });
    document.addEventListener('keydown', function (e) {
      if (!ov.classList.contains('lok-lb-open')) return;
      if (e.key === 'Escape') closeIt();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    });
    _lbApi = { open: function (list, start) {
      urls = (list || []).filter(Boolean); if (!urls.length) return;
      idx = Math.max(0, Math.min(start || 0, urls.length - 1));
      render(); ov.classList.add('lok-lb-open'); document.body.style.overflow = 'hidden';
    } };
    return _lbApi;
  }
  function openLightbox(urls, start) { ensureLightbox().open(urls, start); }

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
      img.style.cursor = 'zoom-in';
      // Click to enlarge — but ignore the click that ends a drag-scroll (#63).
      f.addEventListener('click', function () {
        if (gallery.__lokDragged) { gallery.__lokDragged = false; return; }
        openLightbox(list, i);
      });
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
    strip.addEventListener('mousedown', function (e) { down = true; startX = e.pageX; startScroll = strip.scrollLeft; strip.__lokDragged = false; });
    strip.addEventListener('mouseleave', function () { down = false; });
    strip.addEventListener('mouseup', function () { down = false; });
    strip.addEventListener('mousemove', function (e) { if (!down) return; e.preventDefault(); if (Math.abs(e.pageX - startX) > 6) strip.__lokDragged = true; strip.scrollLeft = startScroll - (e.pageX - startX); });
  }

  // ---- showcase video (YouTube / Vimeo) ---------------------------------
  // SECURITY: parse the vendor-supplied URL down to a host from a fixed allowlist
  // + a strictly-formatted id, then build the iframe src ONLY from that parsed id.
  // The raw URL is never interpolated into markup, so a crafted value can't inject.
  function parseVideo(url) {
    if (!url || typeof url !== 'string') return null;
    var u;
    try { u = new URL(url.trim()); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    var host = u.hostname.replace(/^www\./, '').toLowerCase();
    var YT = /^[A-Za-z0-9_-]{11}$/;
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      var v = u.searchParams.get('v');
      if (v && YT.test(v)) return { host: 'youtube', id: v };
      var m = u.pathname.match(/^\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
      return m ? { host: 'youtube', id: m[1] } : null;
    }
    if (host === 'youtu.be') {
      var m2 = u.pathname.match(/^\/([A-Za-z0-9_-]{11})/);
      return m2 ? { host: 'youtube', id: m2[1] } : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      var m3 = u.pathname.match(/\/(?:video\/)?(\d{6,12})(?:$|[/?#])/);
      return m3 ? { host: 'vimeo', id: m3[1] } : null;
    }
    return null;
  }

  function embedSrc(v) {
    if (!v) return null;
    if (v.host === 'youtube') return 'https://www.youtube-nocookie.com/embed/' + v.id;
    if (v.host === 'vimeo') return 'https://player.vimeo.com/video/' + v.id;
    return null;
  }

  function renderVideo(rawUrl) {
    var src = embedSrc(parseVideo(rawUrl));
    if (!src) return;                       // no/invalid video → render nothing
    if (document.getElementById('vd-video')) return; // guard against double-insert
    var anchor = $('vd-gallery');
    var parent = anchor ? anchor.parentNode : (document.querySelector('[data-vd-type]') || document.body);
    if (!parent) return;
    var wrap = document.createElement('div');
    wrap.id = 'vd-video';
    wrap.style.cssText = 'margin-top:18px;';
    var ratio = document.createElement('div');
    ratio.style.cssText = 'position:relative;width:100%;padding-top:56.25%;border-radius:14px;overflow:hidden;background:#000;';
    var iframe = document.createElement('iframe');
    iframe.src = src;                       // built only from the parsed id + allowlisted host
    iframe.title = 'Showcase video';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:0;';
    ratio.appendChild(iframe);
    wrap.appendChild(ratio);
    if (anchor && anchor.nextSibling) parent.insertBefore(wrap, anchor.nextSibling);
    else parent.appendChild(wrap);
  }

  // ---- vendor mini-card + back link + CTA -------------------------------
  function fillVendor(vendorId, itemName, isProduct) {
    var back = $('vd-back'); if (back && vendorId) back.href = '/vendor?id=' + encodeURIComponent(vendorId);
    var link = $('vd-mini-link'); if (link && vendorId) link.href = '/vendor?id=' + encodeURIComponent(vendorId);
    if (!vendorId || !window.LokaliAPI) return;
    reqRetry(function () { return window.LokaliAPI.vendors.getById(vendorId); }).then(function (res) {
      if (res && res.error) return; // gave up after retries — leave links as-is, don't render an error object as a vendor
      var v = unwrap(res); if (v && v.vendor) v = v.vendor; // { vendor: {...} } envelope
      if (!v || v.error != null) return;
      // Upgrade the back/mini links to the clean root URL once we know the slug
      // (the ?id= hrefs set above keep working as a fallback in the meantime).
      if (v.slug) {
        if (back) back.href = '/' + v.slug;
        if (link) link.href = '/' + v.slug;
      }
      setText('vd-mini-name', v.business_name);
      // Real category. The template shipped #vd-mini-cat with a hardcoded
      // "Food & Catering" placeholder that nothing overwrote, so every vendor's
      // card showed that regardless of their actual category. The vendor
      // endpoint returns categories_id (not the name), so map it locally —
      // these are Lokali's fixed top-level categories (mirror the categories
      // table); hide the line if the id can't be resolved rather than show a
      // wrong label.
      var CAT_NAMES = {
        1: 'Handcrafted Goods', 2: 'Business Services', 3: 'Beauty',
        4: 'Children & Education', 5: 'Events', 6: 'Food',
        7: 'Health & Wellness', 8: 'Home Services'
      };
      var catId = Array.isArray(v.categories_id) ? v.categories_id[0] : v.categories_id;
      var catName = (catId != null) ? CAT_NAMES[catId] : null;
      var miniCat = $('vd-mini-cat');
      if (miniCat) {
        if (catName) { miniCat.textContent = catName; show(miniCat, true); }
        else show(miniCat, false);
      }
      var av = $('vd-mini-avatar-img'); var photo = imgUrl(v.profile_photo); if (av && photo) av.src = photo;
      // CTA -> mailto
      var cta = $('vd-cta-btn');
      if (cta && v.contact_email) {
        var subj = 'I found you on Lokali — inquiry about ' + (itemName || (isProduct ? 'your product' : 'your service'));
        var body = "Hi " + (v.business_name || 'there') + ", I found your listing on Lokali and I'm interested in " +
          (itemName ? ('"' + itemName + '"') : (isProduct ? 'ordering this product' : 'this service')) + '.';
        cta.href = 'mailto:' + v.contact_email + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
        // Log the contact click as a lead event (fire-and-forget; mailto still opens).
        cta.addEventListener('click', function () {
          if (window.LokaliAPI && window.LokaliAPI.leads) {
            window.LokaliAPI.leads.trackEvent(v.id != null ? v.id : vendorId, 'email', isProduct ? 'product' : 'service');
          }
        });
      }
    });
  }

  // Log a service/product view (deduped per browser session) so the analytics
  // page can rank top items. Fire-and-forget; needs the vendor id + item id.
  function emitItemView(vendorId, source, itemId) {
    try {
      if (vendorId == null || itemId == null) return;
      if (!window.LokaliAPI || !window.LokaliAPI.leads || typeof window.LokaliAPI.leads.trackView !== 'function') return;
      var key = 'lok_viewed_' + source + '_' + itemId;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      window.LokaliAPI.leads.trackView(vendorId, source, itemId);
    } catch (e) {}
  }

  // ---- service ----------------------------------------------------------
  function hydrateService(id, vendorParam) {
    reqRetry(function () { return window.LokaliAPI.services.getById(id); }).then(function (res) {
      if (res && res.error) { console.warn('[vd] service load failed', res.error); return; }
      var s = unwrap(res); if (!s || s.error != null) { console.warn('[vd] service not found'); return; }
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
      var sLead = leadText(s);
      if (s.duration_minutes != null) {
        var m = Number(s.duration_minutes);
        var dur = m >= 60 ? (Math.round((m / 60) * 10) / 10) + ' hr' + (m >= 120 ? 's' : '') : m + ' min';
        setText('vd-meta-k1', 'Duration'); setText('vd-meta-v1', dur);
        // #78: duration owns the row, so the lead time rides under the
        // description as a quiet pill (same look as the listing cards).
        if (sLead) leadChipUnderDesc(sLead);
      } else if (sLead) {
        // #78: no duration — the template's "Lead time / 5–7 days" placeholder
        // row finally gets real data instead of being hidden.
        setText('vd-meta-k1', 'Lead time'); setText('vd-meta-v1', sLead);
      } else {
        // The template ships "Lead time / 5–7 days" placeholder text in this
        // row; with neither value set it showed as real data (same trap as the
        // old "Food & Catering" mini-card placeholder). Hide the whole row.
        hideMetaRow('vd-meta-k1');
      }
      var v2 = $('vd-meta-v2'); if (v2 && priceEl) v2.textContent = priceEl.textContent;
      fetchPhotos('services', SERVICE_PHOTOS_PATH, (s.id != null ? s.id : id), imgUrl(s.image_url || s.image)).then(buildGallery);
      renderVideo(s.video_url);
      var vid = vendorParam || s.vendors_id || s.vendor_id;
      emitItemView(vid, 'service', s.id != null ? s.id : id);
      fillVendor(vid, name, false);
    });
  }

  // #78: lead-time pill under the description (services with a duration —
  // the meta row is taken). textContent only: vendor free text, never markup.
  function leadChipUnderDesc(text) {
    var desc = $('vd-desc');
    if (!desc || !desc.parentNode || document.getElementById('vd-lead-chip')) return;
    var chip = document.createElement('div');
    chip.id = 'vd-lead-chip';
    chip.textContent = text;
    chip.style.cssText = 'display:inline-flex;align-items:center;margin-top:10px;font-size:13px;line-height:1.3;color:#5A4A7A;background:#F1ECFC;border-radius:999px;padding:5px 12px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;';
    desc.insertAdjacentElement('afterend', chip);
  }

  // #78: free-text lead_time wins; a legacy numeric products.turnaround_days
  // still renders as "N days" so nothing a vendor typed before disappears.
  function leadText(item) {
    if (!item) return '';
    var lt = item.lead_time;
    if (lt != null && String(lt).trim()) return String(lt).trim();
    var td = item.turnaround_days;
    if (td != null && td !== '' && !isNaN(Number(td))) {
      var n = Number(td);
      return n + (n === 1 ? ' day' : ' days');
    }
    return '';
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
      // #78: the template ships a "Lead time / 5–7 days" placeholder in this row.
      // Fill it from the vendor's own words (falling back to the legacy numeric
      // turnaround), or hide the row entirely so the placeholder never reads as data.
      var pLead = leadText(p);
      if (pLead) { setText('vd-meta-k1', 'Lead time'); setText('vd-meta-v1', pLead); }
      else hideMetaRow('vd-meta-k1');
      var fulfil = p.shipping_offered && p.pickup_only ? 'Shipping & local pickup' : (p.shipping_offered ? 'Shipping' : (p.pickup_only ? 'Local pickup' : '—'));
      setText('vd-meta-v2', fulfil);
      setText('vd-meta-v3', p.is_custom ? 'Made to order' : 'Standard');
      fetchPhotos('products', PRODUCT_PHOTOS_PATH, (p.id != null ? p.id : id), imgUrl(p.image_url || p.image)).then(buildGallery);
      renderVideo(p.video_url);
      var vid = vendorParam || p.vendors_id || p.vendor_id;
      emitItemView(vid, 'product', p.id != null ? p.id : id);
      fillVendor(vid, name, true);
    };
    if (vendorParam) {
      reqRetry(function () { return window.LokaliAPI.products.listByVendor(vendorParam); }).then(function (res) {
        if (res && res.error) { console.warn('[vd] product load failed', res.error); return; }
        var found = asArray(unwrap(res)).filter(function (x) { return String(x.id) === String(id); })[0];
        done(found);
      });
    } else {
      // last resort: owner endpoint (works only if logged in as owner)
      reqRetry(function () { return window.LokaliAPI.products.getById(id); }).then(function (res) {
        if (res && res.error) { console.warn('[vd] product load failed', res.error); return; }
        done(unwrap(res));
      });
    }
  }

  // Clean URL: /{vendorSlug}/services/{itemSlug} or /{vendorSlug}/products/{itemSlug}
  // (the Cloudflare Worker serves the /service or /product-detail template here).
  // Returns { vendorSlug, kind:'services'|'products', itemSlug } or null.
  function pathItem() {
    var segs = (window.location.pathname || '').split('/').filter(Boolean);
    if (segs.length !== 3) return null;
    var kind = decodeURIComponent(segs[1]).toLowerCase();
    if (kind !== 'services' && kind !== 'products') return null;
    return { vendorSlug: decodeURIComponent(segs[0]).toLowerCase(), kind: kind, itemSlug: decodeURIComponent(segs[2]) };
  }

  // Resolve a clean-URL item: vendor by slug → list that vendor's items → match by
  // slug → hand off to the existing id-based hydrators (which fill vendor + gallery).
  function hydrateFromSlug(info) {
    var isProduct = info.kind === 'products';
    reqRetry(function () { return window.LokaliAPI.vendors.getBySlug(info.vendorSlug); }).then(function (res) {
      if (res && res.error) { console.warn('[vd] vendor slug load failed', res.error); return; }
      var v = unwrap(res); if (v && v.vendor) v = v.vendor;
      if (!v || v.error != null || v.id == null) { console.warn('[vd] vendor not found for slug', info.vendorSlug); return; }
      var listFn = isProduct ? window.LokaliAPI.products.listByVendor : window.LokaliAPI.services.listByVendor;
      reqRetry(function () { return listFn(v.id); }).then(function (lres) {
        if (lres && lres.error) { console.warn('[vd] item list load failed', lres.error); return; }
        var match = asArray(unwrap(lres)).filter(function (x) { return x && String(x.slug) === String(info.itemSlug); })[0];
        if (!match || match.id == null) { console.warn('[vd] item not found for slug', info.itemSlug); return; }
        if (isProduct) hydrateProduct(match.id, v.id);
        else hydrateService(match.id, v.id);
      });
    });
  }

  function init() {
    // The category tag is business-wide, not per-service/product — remove the
    // static mockup leftover (it showed the wrong hardcoded category anyway).
    var catTag = $('vd-tag-cat');
    if (catTag) {
      var catWrap = catTag.parentNode && catTag.parentNode.classList && catTag.parentNode.classList.contains('vd-tag') ? catTag.parentNode : catTag;
      show(catWrap, false);
    }
    if (!window.LokaliAPI) { console.warn('[lokali-vendor-detail] LokaliAPI not loaded'); return; }
    // Prefer the clean URL; fall back to the legacy ?id=&vendor= query params.
    var info = pathItem();
    if (info) { hydrateFromSlug(info); return; }
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
