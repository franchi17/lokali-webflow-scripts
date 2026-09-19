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
  // Empty value CLEARS the node — keeping the old text left the Webflow
  // template's placeholder copy reading as real data.
  function setText(id, v) { var el = $(id); if (el) el.textContent = (v == null) ? '' : String(v); }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
  function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }
  function unwrap(res) { return (res && res.data != null) ? res.data : res; }

  // Retry a request on a transient error (rate limit / cold start /
  // network). Without this, a rate-limited fetch left the page showing the
  // Webflow TEMPLATE PLACEHOLDERS (a different demo vendor's name/category/
  // item), because the hydrators only overwrite the markup on a successful
  // response.
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
    if (/^https?:\/\//.test(s)) return s; // full URL (Supabase Storage / Webflow CDN) — the only live shape
    if (s.indexOf('//') === 0) return '';
    // A non-absolute value is a legacy Xano-era /vault/... upload path. Xano is
    // retired (XANO-DECOMM 2026-07-24) so it can no longer resolve — return no
    // image rather than a broken-host URL. Live rows store full URLs (handled above).
    return '';
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


  // ---- item page redesign (F 2026-09-19; mockup JkznYGARd6qZmwGDz2CvhL) ------
  // One template serves /service and /product-detail, so one pass covers both.
  // What it does: (1) the main button opens the Lokali message form instead of
  // a mailto (item inquiries never reached the Leads inbox, and the button did
  // nothing without a mail app); (2) desktop = two columns on the storefront's
  // 1,120px frame: 4:3 photo with EVERY thumbnail visible + description capped
  // near 66 characters on the left, a contact box that stays in view on the
  // right; (3) phones = edge-to-edge photo, a pinned Inquire / Call bar, 16px
  // gutters, a six-line description with Read more; (4) each fact said ONCE as
  // a check row (the chips and the details table said them two or three
  // times); (5) "Run by {owner}" with their photo; (6) Text / WhatsApp / Call
  // in the storefront's exact pill styles (those live in the Designer on
  // /vendor only, so they are restated here). The ground stays Snow.
  var V2_EDGE = 'border:1px solid #DEDAEE;box-shadow:0 1px 2px rgba(40,32,90,.08),0 4px 14px rgba(40,32,90,.06);';
  var V2_FONT = '"Plus Jakarta Sans",system-ui,sans-serif';
  var V2_CSS = [
    'html.vd2 .vd-page{max-width:1120px !important;width:100% !important;box-sizing:border-box;padding-left:24px;padding-right:24px;margin-left:auto;margin-right:auto;}',
    'html.vd2 .vd-wrap{background:transparent !important;border:0 !important;box-shadow:none !important;border-radius:0 !important;overflow:visible !important;padding:0 !important;}',
    'html.vd2 .vd-body{display:none !important;}', // emptied by v2Layout; its parts now live in the grid
    '.vd2-grid{display:grid;grid-template-columns:minmax(0,1fr) 348px;gap:40px;align-items:start;font-family:' + V2_FONT + ';}',
    '.vd2-main{min-width:0;}',
    '.vd2-rail{position:sticky;top:calc(var(--vd2-top,0px) + 14px);min-width:0;}',
    '.vd2-box{background:#fff;border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:14px;' + V2_EDGE + '}',
    'html.vd2 .vd-top{display:block !important;margin:0 !important;}',
    'html.vd2 .vd-name{font:800 24px/1.2 ' + V2_FONT + ' !important;color:#1A1829;margin:0 0 4px !important;}',
    'html.vd2 .vd-price{font:800 20px/1.25 ' + V2_FONT + ' !important;color:#1A1829;text-align:left !important;margin:0 !important;}',
    'html.vd2 #vd-tags,html.vd2 #vd-meta,html.vd2 .vd-divider,html.vd2 .vd-cta-label,html.vd2 #vd-pips,html.vd2 #vd-lead-chip{display:none !important;}',
    // facts: each one once
    '.vd2-facts{display:flex;flex-direction:column;gap:9px;margin:0 !important;padding:0 !important;list-style:none;}',
    '.vd2-fact{margin:0 !important;padding:0 !important;list-style:none;}',
    '.vd2-facts:empty{display:none;}',
    '.vd2-fact{display:flex;gap:10px;align-items:flex-start;font:400 13.5px/1.45 ' + V2_FONT + ';color:#4A4761;}',
    '.vd2-fact svg{flex:none;width:18px;height:18px;margin-top:1px;color:#6002EE;}',
    '.vd2-fact b{color:#1A1829;font-weight:600;}',
    // the one main button (Webflow's orange / violet variants keep their colour)
    'html.vd2 .vd-cta{display:block !important;background:transparent !important;border:0 !important;padding:0 !important;margin:0 !important;}',
    'html.vd2 .vd-cta-btn{display:flex !important;align-items:center;justify-content:center;width:100% !important;box-sizing:border-box;min-height:50px;border-radius:10px;font:600 15px/1.2 ' + V2_FONT + ';text-decoration:none;margin:0;cursor:pointer;}',
    'html.vd2 #vd-buy-btn{margin-bottom:10px !important;}',
    // pills: the storefront's exact styles (read off golokali.com 2026-09-19)
    '.vd2-ch{display:flex;gap:8px;}',
    '.vd2-ch:empty{display:none;}',
    '.vd2-pill{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:.5px solid #C8C6D8;background:#fff;color:#1A1829;font:500 14px/1 ' + V2_FONT + ';text-decoration:none;transition:transform .12s,box-shadow .12s;}',
    '.vd2-pill:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(26,24,41,.08);}',
    '.vd2-pill svg{flex:none;display:block;}',
    '.vd2-pill-wa{background:#EDFAF3;color:#1A6640;border-color:#A8DFC4;}',
    '.vd2-pill-call{background:#F0F4FF;color:#1A3099;border-color:#BDC8F5;}',
    '.vd2-note{margin:0;font:400 12.5px/1.5 ' + V2_FONT + ';color:#6E6A85;}',
    '.vd2-box a:focus-visible,.vd2-box button:focus-visible,.vd2-thumb:focus-visible,.vd2-more:focus-visible,#vd2-bar button:focus-visible,#vd2-bar a:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
    // sections in the left column
    '.vd2-sec{margin-top:30px;}',
    '.vd2-h{font:700 19px/1.3 ' + V2_FONT + ';color:#1A1829;margin:0 0 10px;}',
    'html.vd2 #vd-desc{max-width:66ch;font:400 15px/1.7 ' + V2_FONT + ';color:#4A4761;white-space:pre-line;margin:0;overflow-wrap:anywhere;}',
    // vendor block: a person, not a logo
    'html.vd2 .vd-vendor-mini{display:flex !important;align-items:center;gap:14px;flex-wrap:wrap;background:#fff;border-radius:16px;padding:16px 18px;margin:0 !important;' + V2_EDGE + '}',
    'html.vd2 .vd-mini-avatar{width:56px !important;height:56px !important;min-width:56px;border-radius:50%;overflow:hidden;flex:none;}',
    'html.vd2 .vd-mini-name{font:700 16px/1.3 ' + V2_FONT + ';color:#1A1829;}',
    'html.vd2 .vd-mini-cat{font:500 13px/1.4 ' + V2_FONT + ';color:#6E6A85;background:none !important;padding:0 !important;}',
    'html.vd2 .vd-mini-link{margin-left:auto;font:700 14px/1 ' + V2_FONT + ';color:#6002EE;text-decoration:none;white-space:nowrap;padding:12px 0;}',
    '.vd2-trust{display:inline-flex;align-items:center;gap:6px;margin-top:4px;font:600 12.5px/1.3 ' + V2_FONT + ';color:#4B2A9A;}',
    '.vd2-trust svg{width:13px;height:13px;flex:none;}',
    // gallery: one 4:3 stage; thumbnails ALL visible beside it (Baymard: hidden
    // extra photos are missed by 50-80% of shoppers)
    '.vd2-galrow{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;}',
    '.vd2-galrow.vd2-has-thumbs{grid-template-columns:68px minmax(0,1fr);}',
    '.vd2-stage{position:relative;min-width:0;}',
    'html.vd2 #vd-gallery{display:flex !important;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;gap:0 !important;width:100%;height:auto !important;aspect-ratio:4/3;border-radius:16px;border:1px solid #DEDAEE;box-sizing:border-box;padding:0 !important;margin:0 !important;background:#F3EBFF;}',
    'html.vd2 #vd-gallery::-webkit-scrollbar{display:none;}',
    'html.vd2 #vd-gallery .vd-frame{flex:0 0 100% !important;width:100% !important;min-width:0 !important;height:100% !important;margin:0 !important;border-radius:0 !important;scroll-snap-align:start;overflow:hidden;}',
    'html.vd2 #vd-gallery .vd-frame img{width:100% !important;height:100% !important;object-fit:cover;display:block;}',
    '.vd2-thumbs{display:flex;flex-direction:column;gap:8px;}',
    '.vd2-thumb{width:68px;height:68px;padding:0;border-radius:10px;border:1px solid #DEDAEE;background:#fff;overflow:hidden;cursor:pointer;flex:none;}',
    '.vd2-thumb img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.vd2-thumb[aria-current="true"]{outline:2px solid #6002EE;outline-offset:1px;}',
    '.vd2-cnt{display:none;position:absolute;right:12px;bottom:12px;background:rgba(255,255,255,.95);color:#1A1829;border-radius:999px;padding:6px 10px;font:700 11.5px/1 ' + V2_FONT + ';font-variant-numeric:tabular-nums;pointer-events:none;}',
    // More-from cards take the crisper edge too
    'html.vd2 .lok-more-card{' + V2_EDGE + '}',
    'html.vd2 .lok-more{margin-top:36px;}',
    '.vd2-more{display:none;}',
    '#vd2-bar{display:none;}',
    '@media (max-width:991px){.vd2-grid{grid-template-columns:minmax(0,1fr) 312px;gap:28px;}}',
    '@media (max-width:767px){',
    'html.vd2 .vd-bg{padding-left:0 !important;padding-right:0 !important;}',
    'html.vd2 .vd-page{padding-left:16px;padding-right:16px;}',
    '.vd2-grid{display:flex;flex-direction:column;gap:0;}',
    '.vd2-rail{position:static;order:0;margin-top:14px;}',
    '.vd2-main{display:contents;}', // lets the photo sit above the box and the text below it
    '.vd2-galrow{order:-1;margin:0 -16px;}',
    '.vd2-galrow.vd2-has-thumbs{grid-template-columns:minmax(0,1fr);}',
    '.vd2-thumbs{display:none;}',
    '.vd2-cnt{display:block;}',
    'html.vd2 #vd-gallery{border-radius:0;border-left:0;border-right:0;}',
    '.vd2-sec{order:1;margin-top:24px;}',
    '.vd2-box{padding:16px;border-radius:14px;gap:12px;}',
    'html.vd2 .vd-name{font-size:22px !important;}',
    'html.vd2 .vd-price{font-size:18px !important;}',
    // the pinned bar carries the main button on phones
    'html.vd2 .vd2-box .vd-cta{display:none !important;}',
    '.vd2-h{font-size:17px;}',
    'html.vd2 #vd-desc{font-size:14.5px;line-height:1.65;}',
    'html.vd2 #vd-desc.vd2-clamp:not(.vd2-open){display:-webkit-box !important;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;}',
    '.vd2-more{display:inline-block;background:none;border:0;padding:12px 0;min-height:44px;color:#6002EE;font:700 13.5px/1 ' + V2_FONT + ';cursor:pointer;}',
    'html.vd2 .vd-mini-link{margin-left:0;flex-basis:100%;}',
    '.lok-pgrow{margin-bottom:12px !important;}',
    'html.vd2 body{padding-bottom:76px;}',
    '#vd2-bar{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;gap:10px;background:#fff;border-top:1px solid #EEEDF6;padding:10px 14px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -6px 20px rgba(26,24,41,.08);}',
    '#vd2-bar button,#vd2-bar a{flex:1 1 0;min-width:0;font:600 15px/1.2 ' + V2_FONT + ';border-radius:10px;min-height:46px;display:flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;border:0;padding:0 10px;}',
    '#vd2-bar .vd2-bar-main{background:#6002EE;color:#fff;}',
    '#vd2-bar .vd2-bar-main.vd2-bar-orange{background:#FF6B00;}',
    '#vd2-bar .vd2-bar-side{flex:0 0 104px;background:#fff;color:#1A1829;border:1px solid #EEEDF6;}',
    '#vd2-bar .vd2-bar-buy{background:#fff;color:#1A1829;border:1px solid #DEDAEE;}',
    'html.vd2 #lok-totop{bottom:calc(84px + env(safe-area-inset-bottom)) !important;}',
    '}'
  ].join('');

  var V2_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke-width="1.6" opacity=".35"/><polyline points="16.5 9 10.8 15 7.5 11.8"/></svg>';
  var V2_ICON = { // the storefront pills' own glyphs
    sms: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    call: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 5.55 5.55l.91-.91a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11.2 14.2 15.2 10"/></svg>'
  };
  var _v2 = false;
  function v2Phone() { return window.matchMedia('(max-width:767px)').matches; }
  function v2el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  function v2Layout(isProduct) {
    var wrap = document.querySelector('.vd-wrap');
    var body = document.querySelector('.vd-body');
    var gallery = $('vd-gallery');
    if (_v2 || !wrap || !body || !gallery) return;
    _v2 = true;
    document.documentElement.classList.add('vd2');
    var st = document.createElement('style'); st.id = 'vd2-css'; st.textContent = V2_CSS;
    (document.head || document.documentElement).appendChild(st);

    var grid = v2el('div', 'vd2-grid'), main = v2el('div', 'vd2-main'), rail = v2el('div', 'vd2-rail'), box = v2el('div', 'vd2-box');
    // photo stage (+ thumbnails, added by v2Gallery once the photos are known)
    var galrow = v2el('div', 'vd2-galrow'); galrow.id = 'vd2-galrow';
    var stage = v2el('div', 'vd2-stage');
    wrap.insertBefore(grid, wrap.firstChild);
    stage.appendChild(gallery);
    var cnt = v2el('div', 'vd2-cnt'); cnt.id = 'vd2-cnt'; cnt.setAttribute('aria-hidden', 'true'); stage.appendChild(cnt);
    galrow.appendChild(stage);
    main.appendChild(galrow);
    // description
    var desc = $('vd-desc');
    if (desc) {
      var ds = v2el('section', 'vd2-sec'); ds.id = 'vd2-sec-desc';
      var dh = v2el('h2', 'vd2-h'); dh.textContent = isProduct ? 'About this product' : 'About this service';
      ds.appendChild(dh); ds.appendChild(desc); main.appendChild(ds);
    }
    // vendor
    var mini = document.querySelector('.vd-vendor-mini');
    if (mini) {
      var vs = v2el('section', 'vd2-sec'); vs.id = 'vd2-sec-vendor';
      var vh = v2el('h2', 'vd2-h'); vh.textContent = 'Meet the vendor';
      vs.appendChild(vh); vs.appendChild(mini); main.appendChild(vs);
    }
    // contact box: name + price, facts, button(s), pills, note
    var top = document.querySelector('.vd-top'); if (top) box.appendChild(top);
    var facts = v2el('ul', 'vd2-facts'); facts.id = 'vd2-facts'; box.appendChild(facts);
    var cta = document.querySelector('.vd-cta'); if (cta) box.appendChild(cta);
    var ch = v2el('div', 'vd2-ch'); ch.id = 'vd2-ch'; box.appendChild(ch);
    var note = v2el('p', 'vd2-note'); note.id = 'vd2-note'; box.appendChild(note);
    rail.appendChild(box);
    grid.appendChild(main); grid.appendChild(rail);
    // our own template line carried an em dash; the box says it better anyway
    var sub = $('vd-cta-sub'); if (sub) sub.textContent = 'Send a message and they will reply to you directly.';

    // sticky offset = the fixed site header (it only turns fixed after scrolling)
    var setTop = function () {
      var hdr = document.querySelector('.header-wrapper');
      var fixed = hdr && getComputedStyle(hdr).position === 'fixed';
      document.documentElement.style.setProperty('--vd2-top', (fixed ? hdr.offsetHeight : 0) + 'px');
    };
    var q = false;
    window.addEventListener('scroll', function () { if (q) return; q = true; setTimeout(function () { q = false; setTop(); }, 80); }, { passive: true });
    window.addEventListener('resize', setTop);
    setTop();
  }

  // facts: [{ b: 'Made to order', t: 'Lead time: 2 weeks' }, ...] — textContent only
  function v2Facts(rows) {
    var ul = $('vd2-facts'); if (!ul) return;
    ul.innerHTML = '';
    (rows || []).forEach(function (r) {
      if (!r || !r.b) return;
      var li = v2el('li', 'vd2-fact');
      li.innerHTML = V2_CHECK; // static markup only
      var s = v2el('span'); var b = v2el('b'); b.textContent = r.b; s.appendChild(b);
      if (r.t) s.appendChild(document.createTextNode(' ' + r.t));
      li.appendChild(s); ul.appendChild(li);
    });
  }

  // thumbnails + counter; the stage is the existing snap strip
  function v2Gallery(list) {
    var gallery = $('vd-gallery'), row = $('vd2-galrow'), cnt = $('vd2-cnt');
    if (!_v2 || !gallery || !row) return;
    var old = $('vd2-thumbs'); if (old) old.parentNode.removeChild(old);
    row.classList.remove('vd2-has-thumbs');
    if (cnt) cnt.style.display = 'none';
    if (!list || list.length < 2) return;
    var thumbs = v2el('div', 'vd2-thumbs'); thumbs.id = 'vd2-thumbs';
    thumbs.setAttribute('role', 'group'); thumbs.setAttribute('aria-label', 'Photos');
    var btns = [];
    list.forEach(function (src, i) {
      var b = v2el('button', 'vd2-thumb'); b.type = 'button';
      b.setAttribute('aria-label', 'Show photo ' + (i + 1) + ' of ' + list.length);
      var im = document.createElement('img'); imgSet(im, src, 240); im.alt = ''; // at most a handful of 240px tiles: no lazy-load, they must paint at once
      b.appendChild(im);
      b.addEventListener('click', function () {
        // smooth only when it can actually run (a background tab or a
        // reduced-motion setting never finishes the animation)
        var calm = document.hidden || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        var left = i * gallery.clientWidth;
        if (calm || typeof gallery.scrollTo !== 'function') { gallery.scrollLeft = left; setTimeout(sync, 0); }
        else gallery.scrollTo({ left: left, behavior: 'smooth' });
      });
      thumbs.appendChild(b); btns.push(b);
    });
    row.insertBefore(thumbs, row.firstChild);
    row.classList.add('vd2-has-thumbs');
    function sync() {
      var idx = Math.max(0, Math.min(list.length - 1, Math.round(gallery.scrollLeft / (gallery.clientWidth || 1))));
      btns.forEach(function (b, i) { if (i === idx) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      if (cnt) cnt.textContent = (idx + 1) + ' / ' + list.length;
    }
    if (cnt) cnt.style.display = '';
    gallery.addEventListener('scroll', sync, { passive: true });
    sync();
  }

  // phones: six lines + Read more (class only when rendered on a phone, CSS
  // gated to phones too, so a desktop reader never meets clamped text)
  function v2Clamp() {
    var d = $('vd-desc');
    if (!_v2 || !d || d.__vd2 || !v2Phone()) return;
    d.__vd2 = true; d.classList.add('vd2-clamp');
    (window.requestAnimationFrame || setTimeout)(function () {
      if (d.scrollHeight <= d.clientHeight + 8) { d.classList.remove('vd2-clamp'); return; }
      var b = v2el('button', 'vd2-more'); b.type = 'button'; b.textContent = 'Read more';
      b.addEventListener('click', function () { d.classList.add('vd2-open'); if (b.parentNode) b.parentNode.removeChild(b); });
      d.parentNode.insertBefore(b, d.nextSibling);
    });
  }

  // The message form is lokali-inquiry.js (the storefront's). It is not in the
  // site footer, so load it from wherever THIS script was served, then announce
  // the vendor the way the storefront does; a hidden mount keeps its own
  // "Send a message" button out of sight (ours is the page's main button).
  function v2LoadInquiry(v, vendorId) {
    if (!document.getElementById('lok-inquiry-mount')) {
      var m = v2el('div'); m.id = 'lok-inquiry-mount'; m.style.display = 'none';
      document.body.appendChild(m);
    }
    window.LOKALI_LOADED_VENDOR = { id: v.id != null ? v.id : vendorId, name: v.business_name || '', away_until: v.away_until || null, away_note: v.away_note || '', away_accepts_inquiries: v.away_accepts_inquiries !== false };
    try { document.dispatchEvent(new CustomEvent('lokali:vendor-loaded', { detail: window.LOKALI_LOADED_VENDOR })); } catch (e) {}
    if (window.LokaliInquiry || document.getElementById('lok-inq-loader')) return;
    var scripts = document.getElementsByTagName('script'), mine = null;
    for (var i = 0; i < scripts.length; i++) { if (/lokali-vendor-detail\.js/.test(scripts[i].src || '')) { mine = scripts[i]; break; } }
    if (!mine) return;
    var s = document.createElement('script');
    s.id = 'lok-inq-loader';
    s.src = mine.src.replace(/lokali-vendor-detail\.js.*$/, 'lokali-inquiry.js');
    s.defer = true;
    document.body.appendChild(s);
  }

  function v2Track(vendorId, type, isProduct) {
    try {
      if (window.LokaliAPI && window.LokaliAPI.leads && vendorId != null) window.LokaliAPI.leads.trackEvent(vendorId, type, isProduct ? 'product' : 'service');
      if (typeof window.gtag === 'function') window.gtag('event', 'lead_click', { channel: type, vendor_id: String(vendorId) });
    } catch (e) {}
  }
  function v2Digits(raw) { // same rule as the storefront's normPhone()
    var s = String(raw || '').trim(), d = digits(s);
    if (!d) return '';
    return d.length === 10 ? '1' + d : d;
  }

  // Text / WhatsApp / Call under the same vendor switches as the storefront
  function v2Channels(v, vendorId, itemName, isProduct) {
    var host = $('vd2-ch'); if (!host) return null;
    host.innerHTML = '';
    var phone = v2Digits(v.phone_number);
    if (!phone) return null;
    var copy = 'Hi ' + (v.business_name || 'there') + ", I found you on Lokali and I'm interested in " + (itemName ? '"' + itemName + '"' : (isProduct ? 'your product' : 'your service')) + '.';
    function pill(cls, label, icon, href, type, blank) {
      var a = v2el('a', 'vd2-pill ' + cls);
      a.href = href; // built from digits + a fixed template, never raw vendor text
      if (blank) { a.target = '_blank'; a.rel = 'noopener'; }
      if (icon) a.innerHTML = icon; // static markup only
      a.appendChild(document.createTextNode(label));
      a.addEventListener('click', function () { v2Track(vendorId, type, isProduct); });
      host.appendChild(a);
      return a;
    }
    if (v.text_messages) pill('vd2-pill-sms', 'Text', V2_ICON.sms, 'sms:+' + phone + '?body=' + encodeURIComponent(copy), 'sms');
    if (v.whatsapp_messages) pill('vd2-pill-wa', 'WhatsApp', '', 'https://wa.me/' + phone + '?text=' + encodeURIComponent(copy), 'whatsapp', true);
    var call = null;
    if (v.phone_calls !== false) call = pill('vd2-pill-call', 'Call', V2_ICON.call, 'tel:+' + phone, 'call');
    return call;
  }

  function v2Contact(v, vendorId, itemName, isProduct) {
    if (!_v2) return false;
    var cta = $('vd-cta-btn');
    if (!cta) return false;
    var vid = v.id != null ? v.id : vendorId;
    v2LoadInquiry(v, vid);
    var email = v.contact_email;
    cta.setAttribute('href', '#');
    cta.setAttribute('role', 'button');
    cta.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (window.LokaliInquiry && typeof window.LokaliInquiry.open === 'function') {
        window.LokaliInquiry.open(((isProduct ? 'Product: ' : 'Service: ') + (itemName || '')).slice(0, 200));
        // a head start on the message; the shopper can type over it
        setTimeout(function () {
          var ta = document.getElementById('lok-inq-msg');
          if (ta && !ta.value && itemName) ta.value = "Hi! I'm interested in " + itemName + '.';
        }, 0);
        return;
      }
      // the form script failed to load: the old mailto beats a dead button
      if (email) {
        v2Track(vid, 'email', isProduct);
        window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent('I found you on Lokali: inquiry about ' + (itemName || (isProduct ? 'your product' : 'your service')));
      }
    });
    var callPill = v2Channels(v, vid, itemName, isProduct);
    var note = $('vd2-note');
    if (note) note.textContent = 'Your message goes to ' + (v.business_name || 'the vendor') + ' through Lokali. They reply to you directly.';
    v2Bar(cta, callPill);
    return true;
  }

  // pinned bar (phones): proxies the REAL controls so tracking stays in one place
  function v2Bar(cta, callPill) {
    if (document.getElementById('vd2-bar')) return;
    var bar = v2el('div'); bar.id = 'vd2-bar';
    var buy = $('vd-buy-btn');
    if (buy) {
      var bb = v2el('button', 'vd2-bar-buy'); bb.type = 'button';
      bb.textContent = (buy.textContent || 'Buy online').trim();
      bb.addEventListener('click', function () { buy.click(); });
      bar.appendChild(bb);
    }
    var mainBtn = v2el('button', 'vd2-bar-main' + (/orange/.test(cta.className) ? ' vd2-bar-orange' : '')); mainBtn.type = 'button';
    mainBtn.textContent = (cta.textContent || 'Inquire').trim();
    mainBtn.addEventListener('click', function () { cta.click(); });
    bar.appendChild(mainBtn);
    if (callPill && !buy) {
      var cb = v2el('button', 'vd2-bar-side'); cb.type = 'button'; cb.textContent = 'Call';
      cb.addEventListener('click', function () { callPill.click(); });
      bar.appendChild(cb);
    }
    document.body.appendChild(bar);
  }

  // "Run by Monica" with her photo; business + category on the second line
  function v2Owner(v, catName) {
    if (!_v2) return;
    var owner = String(v.owner_name || '').trim().split(/\s+/)[0];
    var nameEl = $('vd-mini-name'), catEl = $('vd-mini-cat');
    if (owner && nameEl) {
      nameEl.textContent = 'Run by ' + owner;
      if (catEl) { catEl.textContent = [v.business_name, catName].filter(Boolean).join(' · '); show(catEl, true); }
      var ph = imgUrl(v.owner_photo), av = $('vd-mini-avatar-img');
      if (ph && av) { imgSet(av, ph, 240); av.alt = owner; av.style.display = 'block'; }
    }
    var link = $('vd-mini-link'); if (link) link.textContent = 'Visit the storefront →';
    if ((v.is_verified || v.identity_status === 'verified') && catEl && catEl.parentNode && !$('vd2-trust')) {
      var t = v2el('div', 'vd2-trust'); t.id = 'vd2-trust';
      t.innerHTML = V2_ICON.shield; // static markup only
      t.appendChild(document.createTextNode('Verified person'));
      catEl.parentNode.appendChild(t);
    }
  }

  // Hard failure / 404 after the retry budget: the template ships a full demo
  // item (name, price, description, gallery) that would otherwise render as
  // real — hide it and say so. backHref/backLabel default to The Market.
  function renderNotFound(msg, backHref, backLabel) {
    var root = document.querySelector('[data-vd-type]');
    if (!root || root === document.body || root === document.documentElement) {
      root = document.querySelector('main') || document.body;
    }
    for (var i = 0; i < root.children.length; i++) root.children[i].style.display = 'none';
    var deadBar = document.getElementById('vd2-bar'); if (deadBar && deadBar.parentNode) deadBar.parentNode.removeChild(deadBar);
    var card = document.createElement('div');
    card.style.cssText = 'max-width:520px;margin:64px auto 96px;padding:40px 32px;text-align:center;' +
      'background:linear-gradient(180deg,#faf7ff 0%,#fff 70%);border:1px solid #eee9fb;border-radius:20px;' +
      'color:#3b3654;font-family:"Plus Jakarta Sans",system-ui,sans-serif;';
    var h = document.createElement('h1');
    h.style.cssText = 'font-size:24px;font-weight:800;color:#231d3f;margin:0 0 10px;font-family:inherit;';
    h.textContent = msg || 'This item isn’t available';
    var p = document.createElement('p');
    p.style.cssText = 'font-size:15px;line-height:1.6;margin:0 0 20px;';
    p.textContent = 'It may have been removed, or the link is out of date.';
    var a = document.createElement('a');
    a.href = backHref || '/the-market';
    a.textContent = backLabel || 'Browse local vendors';
    a.style.cssText = 'display:inline-block;background:#6E3CFF;color:#fff;font-weight:700;font-size:15px;' +
      'padding:12px 26px;border-radius:999px;text-decoration:none;font-family:inherit;';
    card.appendChild(h); card.appendChild(p); card.appendChild(a);
    root.appendChild(card);
    document.title = 'Not found | Lokali';
  }
  // Best back-link for the id-based hydrators (?vendor= is the only context).
  function vendorBackHref(vendorParam) {
    return vendorParam ? ('/vendor?id=' + encodeURIComponent(vendorParam)) : '/the-market';
  }
  function params() { return new URLSearchParams(window.location.search || ''); }

  // ---- per-item photos (up to 5; Pro/Featured plans) --------------------
  // Public list endpoints (configurable). Plan gating (max 5) is enforced server-side
  // on upload, so Free-plan items return just their single image and the strip shows one.
  var PHOTOS_MAX = 5;
  var SERVICE_PHOTOS_PATH = (typeof window !== 'undefined' && window.LOKALI_SERVICE_PHOTOS_PATH) || 'service/id/{id}/photos/list';
  var PRODUCT_PHOTOS_PATH = (typeof window !== 'undefined' && window.LOKALI_PRODUCT_PHOTOS_PATH) || 'product/id/{id}/photos/list';

  // CLEAN-P23: avatar/strip-size variants through the Storage render endpoint
  // (helper in lokali-supabase-client.js as window.LokaliImg; absent = the full
  // object, as before). The hero gallery + lightbox keep the full object.
  function imgSet(img, url, w) {
    var I = window.LokaliImg;
    if (I && typeof I.set === 'function') I.set(img, url, w); else img.src = url;
  }

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
  var _lbHintSeen = false;   // swipe hint: once per page session, not per open
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
      '.lok-lb-count{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:#fff;font:600 13px/1 ' + FONT + ';background:rgba(255,255,255,.16);border-radius:100px;padding:7px 14px;}',
      // Mobile: a 92vw photo leaves ~15px of margin, so the 44px arrows sat ON
      // the picture — the reason the gallery read as "one photo at a time, open
      // and close each one" (Francesca, 2026-08-19). Give the photo room, drop
      // the arrows to the bottom corners beside the counter, and let SWIPE be
      // the primary gesture (wired below).
      '@media (max-width:767px){',
      '.lok-lb-img{max-width:100vw;max-height:76vh;border-radius:0;}',
      '.lok-lb-prev,.lok-lb-next{top:auto;bottom:14px;transform:none;}',
      '.lok-lb-prev{left:10px;} .lok-lb-next{right:10px;}',
      '.lok-lb-count{bottom:24px;}',
      '.lok-lb-hint{position:absolute;bottom:70px;left:50%;transform:translateX(-50%);color:#fff;opacity:.82;font:600 12px/1 ' + FONT + ';background:rgba(255,255,255,.16);border-radius:100px;padding:6px 12px;pointer-events:none;transition:opacity .4s;}',
      '}',
      '@media (min-width:768px){.lok-lb-hint{display:none;}}'
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
    // Shown once per session on touch devices, then faded — a swipe affordance
    // is invisible otherwise, which is exactly how this gallery went unnoticed.
    var hint = document.createElement('div'); hint.className = 'lok-lb-hint';
    hint.textContent = 'Swipe to see more';
    ov.appendChild(img); ov.appendChild(close); ov.appendChild(prev); ov.appendChild(next); ov.appendChild(count); ov.appendChild(hint);
    document.body.appendChild(ov);
    var urls = [], idx = 0, lbLabel = '';
    var render = function () {
      img.src = urls[idx] || '';
      var multi = urls.length > 1;
      // #97: alt mirrors the gallery's ("Label — photo N"); count is separate UI.
      img.alt = lbLabel ? (multi ? lbLabel + ', photo ' + (idx + 1) : lbLabel) : '';
      count.textContent = (idx + 1) + ' / ' + urls.length;
      prev.style.display = next.style.display = count.style.display = multi ? '' : 'none';
    };
    var go = function (d) { if (!urls.length) return; idx = (idx + d + urls.length) % urls.length; render(); };
    var closeIt = function () { ov.classList.remove('lok-lb-open'); img.removeAttribute('src'); document.body.style.overflow = ''; };

    // ---- swipe (the mobile-primary gesture) ---------------------------------
    // Horizontal drag past a threshold changes photo; a mostly-VERTICAL drag is
    // left alone so the browser's own dismiss/scroll gestures still feel normal.
    // Bound on the overlay, not the img, so the whole dark area is swipeable —
    // on a phone the photo does not fill the screen vertically.
    var tX = 0, tY = 0, tActive = false;
    ov.addEventListener('touchstart', function (e) {
      if (urls.length < 2 || !e.touches || e.touches.length !== 1) { tActive = false; return; }
      tActive = true; tX = e.touches[0].clientX; tY = e.touches[0].clientY;
      hideHint();
    }, { passive: true });
    ov.addEventListener('touchend', function (e) {
      if (!tActive) return;
      tActive = false;
      var t = (e.changedTouches && e.changedTouches[0]); if (!t) return;
      var dx = t.clientX - tX, dy = t.clientY - tY;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;  // not a horizontal swipe
      go(dx < 0 ? 1 : -1);
    }, { passive: true });

    var hintTimer = null;
    function hideHint() {
      hint.style.opacity = '0';
      if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    }
    function showHintOnce() {
      // Multi-photo only, and only where a swipe is possible at all.
      var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (!touch || urls.length < 2 || _lbHintSeen) { hint.style.display = 'none'; return; }
      hint.style.display = ''; hint.style.opacity = '.82';
      if (hintTimer) clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { hideHint(); _lbHintSeen = true; }, 2600);
    }
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
    _lbApi = { open: function (list, start, label) {
      urls = (list || []).filter(Boolean); if (!urls.length) return;
      idx = Math.max(0, Math.min(start || 0, urls.length - 1));
      lbLabel = label || '';
      render(); ov.classList.add('lok-lb-open'); document.body.style.overflow = 'hidden';
      showHintOnce();
    } };
    return _lbApi;
  }
  function openLightbox(urls, start, label) { ensureLightbox().open(urls, start, label); }

  // ---- gallery ----------------------------------------------------------
  // #97 alt text: `label` = the item name. vendor_photos rows carry no caption
  // column, so the item name (+ photo index when there are several) is the best
  // truthful alt available — derived, set via property (never interpolated
  // into markup), and photo N numbering matches the visible pips.
  function buildGallery(images, label) {
    var gallery = $('vd-gallery');
    var pips = $('vd-pips');
    if (!gallery) return;
    var list = (images || []).filter(Boolean);
    if (!list.length) return; // keep placeholder frame
    gallery.innerHTML = '';
    if (pips) pips.innerHTML = '';
    var altFor = function (i) {
      if (!label) return '';
      return list.length > 1 ? label + ', photo ' + (i + 1) : label;
    };
    list.forEach(function (src, i) {
      var f = document.createElement('div');
      f.className = 'vd-frame ' + (i === 0 ? 'vd-frame-main' : 'vd-frame-peek');
      var img = document.createElement('img');
      img.src = src; img.alt = altFor(i);
      img.style.cursor = 'zoom-in';
      // Click to enlarge — but ignore the click that ends a drag-scroll (#63).
      f.addEventListener('click', function () {
        if (gallery.__lokDragged) { gallery.__lokDragged = false; return; }
        openLightbox(list, i, label);
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
    v2Gallery(list); // redesign: every thumbnail visible beside the 4:3 stage
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
  // #174: resolves to the public vendor row (null on failure) so the
  // item-to-item nav can reuse it. The slug hydrator primes _vendorCache
  // (getBySlug and getById select the same VENDOR_PUBLIC_COLS), so that path
  // no longer pays a second vendor request.
  function fillVendor(vendorId, itemName, isProduct) {
    var back = $('vd-back'); if (back && vendorId) back.href = '/vendor?id=' + encodeURIComponent(vendorId);
    var link = $('vd-mini-link'); if (link && vendorId) link.href = '/vendor?id=' + encodeURIComponent(vendorId);
    if (!vendorId || !window.LokaliAPI) return Promise.resolve(null);
    var cached = _vendorCache[String(vendorId)];
    var vendorReq = cached
      ? Promise.resolve({ data: { vendor: cached } })
      : reqRetry(function () { return window.LokaliAPI.vendors.getById(vendorId); });
    return vendorReq.then(function (res) {
      if (res && res.error) return null; // gave up after retries — leave links as-is, don't render an error object as a vendor
      var v = unwrap(res); if (v && v.vendor) v = v.vendor; // { vendor: {...} } envelope
      if (!v || v.error != null) return null;
      _vendorCache[String(vendorId)] = v;
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
        1: 'Handmade & Custom', 2: 'Business Services', 3: 'Beauty',
        4: 'Children & Education', 5: 'Events & Entertainment', 6: 'Food',
        7: 'Health & Wellness', 8: 'Home & Property', 9: 'Professional Services'
      };
      var catId = Array.isArray(v.categories_id) ? v.categories_id[0] : v.categories_id;
      var catName = (catId != null) ? CAT_NAMES[catId] : null;
      var miniCat = $('vd-mini-cat');
      if (miniCat) {
        if (catName) { miniCat.textContent = catName; show(miniCat, true); }
        else show(miniCat, false);
      }
      // The Webflow build left a literal <imgraw> placeholder here — browsers
      // render nothing for it, so the vendor logo showed as an empty lilac
      // circle. Swap for a real <img> first (same fix vl-avatar needed).
      var av = $('vd-mini-avatar-img');
      if (av && av.tagName !== 'IMG') {
        var realAv = document.createElement('img');
        realAv.id = av.id;
        realAv.className = av.className || '';
        realAv.alt = av.getAttribute('alt') || '';
        realAv.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;';
        av.parentNode.replaceChild(realAv, av);
        av = realAv;
      }
      var photo = imgUrl(v.profile_photo);
      if (av && photo) imgSet(av, photo, 240); // CLEAN-P23
      else if (av) av.style.display = 'none';
      // CTA -> mailto
      v2Owner(v, catName);
      var cta = $('vd-cta-btn');
      // Redesign 2026-09-19: the button opens the Lokali message form (Leads
      // inbox) instead of a mailto. The mailto below is the legacy path, kept
      // for the day the redesigned layout cannot mount.
      if (v2Contact(v, vendorId, itemName, isProduct)) return v;
      if (cta && v.contact_email) {
        var subj = 'I found you on Lokali: inquiry about ' + (itemName || (isProduct ? 'your product' : 'your service'));
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
      return v;
    });
  }

  // #172: per-product external checkout ("Buy on Etsy" / "Buy online").
  // Lokali processes no payments, so a vendor whose checkout lives on Etsy,
  // Shopify or their own site pastes the listing URL into the product form.
  // The button is a deep clone of the Inquire CTA (identical styling, no
  // template edit), inserted BEFORE it so buying is the primary action and
  // Inquire stays for custom orders. The href is re-validated here (https
  // only) even though SQL shape-checks it; the click logs a 'buy_link' lead
  // event, which Insights groups with the payment clicks — never a contact
  // lead and never a review-gate event.
  var BUY_HOST_LABELS = { 'etsy.com': 'Etsy', 'amazon.com': 'Amazon', 'ebay.com': 'eBay', 'faire.com': 'Faire' };
  function buyHostLabel(u) {
    var host = String(u.hostname || '').replace(/^www\./, '').toLowerCase();
    var keys = Object.keys(BUY_HOST_LABELS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (host === k || host.slice(-(k.length + 1)) === '.' + k) return BUY_HOST_LABELS[k];
    }
    return '';
  }
  function mountBuyLink(p, vendorId) {
    try {
      if (document.getElementById('vd-buy-btn')) return;
      var raw = p && p.buy_url;
      if (!raw) return;
      var u;
      try { u = new URL(String(raw).trim()); } catch (e) { return; }
      if (u.protocol !== 'https:') return;
      var cta = $('vd-cta-btn');
      if (!cta || !cta.parentNode) return;
      var btn = cta.cloneNode(true);
      btn.id = 'vd-buy-btn';
      btn.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
      // Set the label on the innermost single child so a link-block's own
      // typography wrapper survives; a plain button just gets its text.
      var textHost = btn;
      while (textHost.children && textHost.children.length === 1) textHost = textHost.children[0];
      var brand = buyHostLabel(u);
      var label = brand ? 'Buy on ' + brand : 'Buy online';
      textHost.textContent = label;
      btn.href = u.href;               // property, never string-built markup
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.setAttribute('aria-label', label + ' (opens in a new tab)');
      btn.style.marginBottom = '10px';
      cta.parentNode.insertBefore(btn, cta);
      btn.addEventListener('click', function () {
        if (window.LokaliAPI && window.LokaliAPI.leads && vendorId != null) {
          window.LokaliAPI.leads.trackEvent(vendorId, 'buy_link', 'product');
        }
      });
    } catch (e) {}
  }

  // ---- #174 item-to-item browsing ---------------------------------------
  // A shopper on one item could only leave through the back link, so
  // comparing two of a vendor's listings meant a round trip through the
  // storefront every time. Two additions, both PLAIN LINKS (every item keeps
  // its own URL, canonical, JSON-LD, sitemap entry and deduped view event;
  // nothing is swapped in place):
  //   1. a Prev/Next pager in the back-link row, within ONE kind, in the
  //      storefront's order (hand-picked items first, then the list's own
  //      sort_order; the list arrives ordered from the client, so only the
  //      stable picks-first pass is repeated here), no wrap-around, the end
  //      buttons disabled;
  //   2. a "More from {business}" strip below the item card: both kinds,
  //      current item excluded, same kind first, the first NAV_STRIP_MAX
  //      cards plus a "See all N listings" link to the storefront.
  // The sibling list of the current kind is already fetched by the slug and
  // ?vendor= hydrators (cached in _listCache), so only the other kind costs a
  // request. No swipe gesture: the photo gallery owns horizontal swipe here.
  var NAV_STRIP_MAX = 8;
  var NAV_TINTS = ['#FFF1E6', '#F3EBFF', '#EAFAF2', '#FEF9E6']; // the storefront card tints
  var _vendorCache = {};                                 // vendor id -> public vendor row
  var _listCache = { services: null, products: null };   // this vendor's public lists
  var _navCssDone = false;

  function vendorList(kind, vendorId) {
    if (_listCache[kind]) return Promise.resolve(_listCache[kind]);
    var api = window.LokaliAPI && window.LokaliAPI[kind];
    if (!api || typeof api.listByVendor !== 'function') return Promise.resolve(null);
    return reqRetry(function () { return api.listByVendor(vendorId); }).then(function (res) {
      if (!res || res.error) return null;
      var rows = asArray(unwrap(res));
      _listCache[kind] = rows;
      return rows;
    }).catch(function () { return null; });
  }
  // Storefront order: hand-picked items lead (stable sort), drag order within.
  function storefrontOrder(rows) {
    return (rows || []).filter(Boolean).slice().sort(function (a, b) {
      return (b.is_featured_pick === true ? 1 : 0) - (a.is_featured_pick === true ? 1 : 0);
    });
  }
  function navItemName(kind, it) {
    var nm = kind === 'services' ? (it.service_name || it.name) : (it.product_name || it.name);
    return String(nm || '').trim();
  }
  // Price wording mirrors lokali-vendor-listing.js servicePrice()/productPrice().
  function navPriceText(kind, it) {
    if (kind === 'services') {
      var t = String(it.price_type || '').toLowerCase();
      if (t === 'quote' || t === 'get_a_quote' || it.is_quote_based) return 'Get a quote';
      if (it.price_min_cents != null && it.price_max_cents != null && it.price_min_cents !== it.price_max_cents) {
        return cents(it.price_min_cents) + '–' + cents(it.price_max_cents);
      }
      if (it.price_min_cents != null) return 'From ' + cents(it.price_min_cents);
      if (it.price_cents != null) return (t === 'from' || t === 'starting' ? 'From ' : '') + cents(it.price_cents);
      if (it.price_note) return String(it.price_note);
      return 'Get a quote';
    }
    if (it.is_quote_based) return 'Get a quote';
    if (it.price != null && it.price !== '') { var n = Number(it.price); return isFinite(n) ? '$' + n : String(it.price); }
    if (it.price_note) return String(it.price_note);
    return 'Get a quote';
  }
  // Clean item URL when both slugs are known, else the legacy ?id= link: the
  // same fallback the storefront's itemHref() uses. Always set as a property.
  function navHref(kind, it, vendor, vendorId) {
    var vslug = vendor && vendor.slug;
    if (vslug && it.slug) return '/' + encodeURIComponent(vslug) + '/' + kind + '/' + encodeURIComponent(it.slug);
    if (it.id == null) return '';
    return (kind === 'services' ? '/service' : '/product-detail') + '?id=' + encodeURIComponent(it.id) +
      (vendorId != null ? '&vendor=' + encodeURIComponent(vendorId) : '');
  }
  function storefrontHref(vendor, vendorId) {
    if (vendor && vendor.slug) return '/' + encodeURIComponent(vendor.slug);
    return vendorId != null ? '/vendor?id=' + encodeURIComponent(vendorId) : '/the-market';
  }
  // Chevron drawn like the page's own back-link arrow (stroke polyline), so
  // the pager reads as part of the template. No glyphs, no emoji.
  function chevronSvg(left) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var pl = document.createElementNS(NS, 'polyline');
    pl.setAttribute('points', left ? '15 18 9 12 15 6' : '9 18 15 12 9 6');
    svg.appendChild(pl);
    return svg;
  }
  function ensureNavCss() {
    if (_navCssDone) return; _navCssDone = true;
    var FONT = '"Plus Jakarta Sans",system-ui,sans-serif';
    var st = document.createElement('style');
    st.id = 'lok-nav-css';
    st.textContent = [
      // pager row: back link left, pager right (wraps on narrow screens)
      '.lok-pgrow{display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;margin:0 0 20px;font-family:' + FONT + ';}',
      '.lok-pgrow>.vd-back{margin:0 !important;}',
      '.lok-pager{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font:600 13px/1 ' + FONT + ';color:#4A4761;}',
      '.lok-pg-btn{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:999px;background:#F3EBFF;color:#6002EE;text-decoration:none;font:700 13px/1 ' + FONT + ';transition:background .12s;}',
      'a.lok-pg-btn:hover{background:#E9DCFF;color:#6002EE;}',
      '.lok-pg-btn svg{display:block;width:16px;height:16px;flex:none;}',
      '.lok-pg-off{background:#F7F6FC;color:#B9B6C9;cursor:default;}',
      '.lok-pg-name{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.lok-pg-off .lok-pg-name{display:none;}',
      '.lok-pg-count{padding:0 4px;color:#6E6A85;font-weight:600;white-space:nowrap;}',
      // strip
      '.lok-more{margin:28px 0 8px;font-family:' + FONT + ';}',
      '.lok-more-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;}',
      '.lok-more-head h2{margin:0;font:700 20px/1.3 ' + FONT + ';color:#1A1829;}',
      '.lok-more-all{font:700 13px/1 ' + FONT + ';color:#6002EE;text-decoration:none;white-space:nowrap;background:#F3EBFF;border-radius:999px;padding:9px 14px;transition:background .12s;}',
      '.lok-more-all:hover{background:#E9DCFF;color:#6002EE;}',
      '.lok-more-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}',
      '.lok-more-card{display:block;background:#fff;border:.5px solid #EEEDF6;border-radius:16px;overflow:hidden;text-decoration:none;color:#1A1829;transition:box-shadow .15s,transform .15s;}',
      '.lok-more-card:hover{box-shadow:0 10px 26px rgba(26,24,41,.10);transform:translateY(-2px);}',
      '.lok-more-img{position:relative;aspect-ratio:4/3;overflow:hidden;}',
      '.lok-more-img img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.lok-more-kind{position:absolute;top:8px;left:8px;font:700 11px/1 ' + FONT + ';letter-spacing:.2px;color:#6002EE;background:rgba(255,255,255,.94);border-radius:999px;padding:5px 9px;}',
      '.lok-more-kind-products{color:#C05621;}',
      '.lok-more-body{padding:10px 12px 12px;}',
      '.lok-more-name{font:600 14px/1.3 ' + FONT + ';color:#1A1829;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
      '.lok-more-price{margin-top:4px;font:600 12.5px/1.3 ' + FONT + ';color:#6E6A85;}',
      '@media (min-width:768px) and (max-width:1023px){.lok-more-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}',
      // phones: arrows only in the pager; the strip becomes a snap scroller
      '@media (max-width:767px){',
      '.lok-pg-name{display:none;}',
      '.lok-pg-btn{width:36px;min-height:36px;padding:0;justify-content:center;}',
      '.lok-more-head h2{font-size:18px;}',
      '.lok-more-grid{display:flex;overflow-x:auto;gap:12px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:6px;}',
      '.lok-more-grid::-webkit-scrollbar{display:none;}',
      '.lok-more-card{flex:0 0 62%;scroll-snap-align:start;}',
      '}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }
  function pagerBtn(dir, target, kind, vendor, vendorId) {
    var isPrev = dir === 'prev';
    var word = kind === 'services' ? 'service' : 'product';
    var nm = target ? navItemName(kind, target) : '';
    var el = document.createElement(target ? 'a' : 'span');
    el.className = 'lok-pg-btn lok-pg-' + dir + (target ? '' : ' lok-pg-off');
    if (target) {
      el.href = navHref(kind, target, vendor, vendorId);
      el.setAttribute('aria-label', (isPrev ? 'Previous ' : 'Next ') + word + (nm ? ': ' + nm : ''));
      if (nm) el.title = nm;
    } else {
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('aria-label', (isPrev ? 'No previous ' : 'No next ') + word);
    }
    var label = document.createElement('span'); label.className = 'lok-pg-name'; label.textContent = nm;
    if (isPrev) { el.appendChild(chevronSvg(true)); el.appendChild(label); }
    else { el.appendChild(label); el.appendChild(chevronSvg(false)); }
    return el;
  }
  function mountPager(kind, rows, currentId, vendor, vendorId) {
    if (document.getElementById('lok-pager')) return;
    if (!rows || rows.length < 2) return;
    var idx = -1;
    for (var i = 0; i < rows.length; i++) { if (String(rows[i].id) === String(currentId)) { idx = i; break; } }
    if (idx < 0) return; // e.g. the owner previewing an inactive item
    var back = $('vd-back');
    var host = back && back.parentNode;
    if (!host) return;
    ensureNavCss();
    // One row: back link left, pager right. The back link keeps its id, so
    // fillVendor still upgrades its href to the clean slug URL afterwards.
    var row = document.createElement('div'); row.id = 'lok-pager-row'; row.className = 'lok-pgrow';
    host.insertBefore(row, back); row.appendChild(back);
    var nav = document.createElement('nav'); nav.id = 'lok-pager'; nav.className = 'lok-pager';
    nav.setAttribute('aria-label', kind === 'services' ? "Browse this vendor's services" : "Browse this vendor's products");
    nav.appendChild(pagerBtn('prev', rows[idx - 1] || null, kind, vendor, vendorId));
    var count = document.createElement('span'); count.className = 'lok-pg-count';
    count.textContent = (kind === 'services' ? 'Service ' : 'Product ') + (idx + 1) + ' of ' + rows.length;
    nav.appendChild(count);
    nav.appendChild(pagerBtn('next', rows[idx + 1] || null, kind, vendor, vendorId));
    row.appendChild(nav);
  }
  function stripCard(entry, i, hasBoth, vendor, vendorId) {
    var kind = entry.kind, it = entry.it;
    var a = document.createElement('a');
    a.className = 'lok-more-card';
    a.href = navHref(kind, it, vendor, vendorId);
    var img = document.createElement('div'); img.className = 'lok-more-img';
    img.style.background = NAV_TINTS[i % NAV_TINTS.length];
    var nm = navItemName(kind, it) || 'Untitled';
    var src = imgUrl(it.image_url || it.image);
    if (src) {
      var im = document.createElement('img');
      im.loading = 'lazy'; imgSet(im, src, 480); im.alt = nm; // #97: the item name is the alt; CLEAN-P23: strip-size variant
      if (it.image_focus_x != null && it.image_focus_y != null) { // #149 focal point
        im.style.objectPosition = it.image_focus_x + '% ' + it.image_focus_y + '%';
      }
      img.appendChild(im);
    }
    if (hasBoth) {
      var k = document.createElement('span'); k.className = 'lok-more-kind lok-more-kind-' + kind;
      k.textContent = kind === 'services' ? 'Service' : 'Product';
      img.appendChild(k);
    }
    var body = document.createElement('div'); body.className = 'lok-more-body';
    var name = document.createElement('div'); name.className = 'lok-more-name'; name.textContent = nm;
    var price = document.createElement('div'); price.className = 'lok-more-price'; price.textContent = navPriceText(kind, it);
    body.appendChild(name); body.appendChild(price);
    a.appendChild(img); a.appendChild(body);
    return a;
  }
  function mountStrip(kind, same, other, currentId, vendor, vendorId) {
    if (document.getElementById('lok-more')) return;
    same = same || []; other = other || [];
    var otherKind = kind === 'services' ? 'products' : 'services';
    var list = [];
    same.forEach(function (it) { if (String(it.id) !== String(currentId)) list.push({ kind: kind, it: it }); });
    other.forEach(function (it) { list.push({ kind: otherKind, it: it }); });
    if (!list.length) return;
    var card = document.querySelector('.vd-wrap');
    var host = card ? card.parentNode : (document.querySelector('.vd-page') || document.querySelector('[data-vd-type]'));
    if (!host) return;
    ensureNavCss();
    var total = same.length + other.length; // everything the storefront lists, this item included
    var hasBoth = same.length > 0 && other.length > 0;
    var sec = document.createElement('section'); sec.id = 'lok-more'; sec.className = 'lok-more';
    sec.setAttribute('aria-labelledby', 'lok-more-h');
    var head = document.createElement('div'); head.className = 'lok-more-head';
    var h = document.createElement('h2'); h.id = 'lok-more-h';
    var biz = vendor && vendor.business_name ? String(vendor.business_name).trim() : '';
    h.textContent = biz ? 'More from ' + biz : 'More from this vendor';
    var all = document.createElement('a'); all.className = 'lok-more-all';
    all.href = storefrontHref(vendor, vendorId);
    all.textContent = 'See all ' + total + (total === 1 ? ' listing' : ' listings');
    head.appendChild(h); head.appendChild(all);
    var grid = document.createElement('div'); grid.className = 'lok-more-grid';
    list.slice(0, NAV_STRIP_MAX).forEach(function (entry, i) { grid.appendChild(stripCard(entry, i, hasBoth, vendor, vendorId)); });
    sec.appendChild(head); sec.appendChild(grid);
    if (card && card.nextSibling) host.insertBefore(sec, card.nextSibling); else host.appendChild(sec);
  }
  function mountItemNav(kind, currentId, vendorId, vendorP) {
    try {
      if (currentId == null || vendorId == null || !window.LokaliAPI) return;
      var otherKind = kind === 'services' ? 'products' : 'services';
      var vendorSafe = (vendorP && typeof vendorP.then === 'function')
        ? vendorP.then(null, function () { return null; })
        : Promise.resolve(null);
      Promise.all([vendorSafe, vendorList(kind, vendorId), vendorList(otherKind, vendorId)]).then(function (r) {
        var vendor = r[0] || null;
        var same = storefrontOrder(r[1]);
        var other = storefrontOrder(r[2]);
        mountPager(kind, same, currentId, vendor, vendorId);
        mountStrip(kind, same, other, currentId, vendor, vendorId);
      }).then(null, function (e) { console.warn('[vd] item nav failed', e); });
    } catch (e) {}
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
      if (res && res.error) { console.warn('[vd] service load failed', res.error); renderNotFound('This service isn’t available', vendorBackHref(vendorParam), vendorParam ? 'Back to the vendor' : null); return; }
      var s = unwrap(res); if (!s || s.error != null) { console.warn('[vd] service not found'); renderNotFound('This service isn’t available', vendorBackHref(vendorParam), vendorParam ? 'Back to the vendor' : null); return; }
      var name = s.service_name || s.name || '';
      setText('vd-name', name);
      document.title = name + ' | Lokali';
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
      (function () { // each fact once, as a check row beside the button
        var rows = [];
        if (s.remote) rows.push({ b: 'Available remotely' });
        if (s.duration_minutes != null) rows.push({ b: 'Duration:', t: $('vd-meta-v1') ? $('vd-meta-v1').textContent : '' });
        if (sLead) rows.push({ b: 'Lead time:', t: sLead });
        var areasEl = $('vd-areas');
        if (areasEl) {
          var names = [];
          for (var ai = 0; ai < areasEl.children.length; ai++) { var nm = (areasEl.children[ai].textContent || '').trim(); if (nm) names.push(nm); }
          if (!names.length && (areasEl.textContent || '').trim()) names.push(areasEl.textContent.trim());
          if (names.length) rows.push({ b: 'Serves:', t: names.join(', ') });
        }
        v2Facts(rows);
        v2Clamp();
      })();
      fetchPhotos('services', SERVICE_PHOTOS_PATH, (s.id != null ? s.id : id), imgUrl(s.image_url || s.image))
        .then(function (imgs) { buildGallery(imgs, name); }); // #97: item name = alt
      renderVideo(s.video_url);
      var vid = vendorParam || s.vendors_id || s.vendor_id;
      emitItemView(vid, 'service', s.id != null ? s.id : id);
      var vendorP = fillVendor(vid, name, false);
      mountItemNav('services', s.id != null ? s.id : id, vid, vendorP); // #174
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
      if (!p) { console.warn('[vd] product not found'); renderNotFound('This product isn’t available', vendorBackHref(vendorParam), vendorParam ? 'Back to the vendor' : null); return; }
      var name = p.product_name || p.name || '';
      setText('vd-name', name);
      document.title = name + ' | Lokali';
      setText('vd-desc', p.product_description || p.description || '');
      var priceEl = $('vd-price');
      if (priceEl) {
        if (p.is_quote_based) { priceEl.textContent = 'Get a quote'; priceEl.classList.add('vd-price-quote'); }
        else if (p.price != null && p.price !== '') { var n = Number(p.price); priceEl.textContent = isFinite(n) ? '$' + n : String(p.price); }
        else if (p.price_note) { priceEl.textContent = p.price_note; priceEl.classList.add('vd-price-quote'); }
      }
      show($('vd-tag-custom'), !!p.is_custom);
      show($('vd-tag-shipping'), !!p.shipping_offered);
      // pickup_only ONLY — shipping_offered was lighting the pickup tag for
      // shipping-only products, contradicting the fulfilment meta row below.
      show($('vd-tag-pickup'), !!p.pickup_only);
      // "Delivery available" (2026-09-01): the template has no delivery chip —
      // clone the pickup chip so styling stays identical, once per page.
      (function () {
        var chip = $('vd-tag-delivery');
        if (!chip) {
          var src = $('vd-tag-pickup') || $('vd-tag-shipping');
          if (!src) return;
          chip = src.cloneNode(true);
          chip.id = 'vd-tag-delivery';
          chip.textContent = 'Local delivery';
          src.insertAdjacentElement('afterend', chip);
        }
        show(chip, !!p.delivery_offered);
      })();
      // #78: the template ships a "Lead time / 5–7 days" placeholder in this row.
      // Fill it from the vendor's own words (falling back to the legacy numeric
      // turnaround), or hide the row entirely so the placeholder never reads as data.
      var pLead = leadText(p);
      if (pLead) { setText('vd-meta-k1', 'Lead time'); setText('vd-meta-v1', pLead); }
      else hideMetaRow('vd-meta-k1');
      // Fulfilment line composes all three flags (delivery added 2026-09-01):
      // "Shipping & local pickup", "Shipping, local pickup & local delivery", …
      var fulfilParts = [];
      if (p.shipping_offered)  fulfilParts.push('shipping');
      if (p.pickup_only)       fulfilParts.push('local pickup');
      if (p.delivery_offered)  fulfilParts.push('local delivery');
      var fulfil = fulfilParts.length
        ? (fulfilParts.length > 1
            ? fulfilParts.slice(0, -1).join(', ') + ' & ' + fulfilParts[fulfilParts.length - 1]
            : fulfilParts[0])
        : '—';
      fulfil = fulfil.charAt(0).toUpperCase() + fulfil.slice(1);
      setText('vd-meta-v2', fulfil);
      setText('vd-meta-v3', p.is_custom ? 'Made to order' : 'Standard');
      (function () { // each fact once, as a check row beside the button
        var rows = [];
        if (p.is_custom) rows.push({ b: 'Made to order' });
        if (pLead) rows.push({ b: 'Lead time:', t: pLead });
        if (fulfilParts.length) rows.push({ b: 'How you get it:', t: fulfil });
        v2Facts(rows);
        v2Clamp();
      })();
      fetchPhotos('products', PRODUCT_PHOTOS_PATH, (p.id != null ? p.id : id), imgUrl(p.image_url || p.image))
        .then(function (imgs) { buildGallery(imgs, name); }); // #97: item name = alt
      renderVideo(p.video_url);
      var vid = vendorParam || p.vendors_id || p.vendor_id;
      emitItemView(vid, 'product', p.id != null ? p.id : id);
      mountBuyLink(p, vid); // #172 (before fillVendor: the phone bar mirrors it)
      var vendorP = fillVendor(vid, name, true);
      mountItemNav('products', p.id != null ? p.id : id, vid, vendorP); // #174
    };
    if (vendorParam) {
      reqRetry(function () { return window.LokaliAPI.products.listByVendor(vendorParam); }).then(function (res) {
        if (res && res.error) { console.warn('[vd] product load failed', res.error); renderNotFound('This product isn’t available', vendorBackHref(vendorParam), 'Back to the vendor'); return; }
        var rows = asArray(unwrap(res));
        _listCache.products = rows; // #174: the sibling list is already here
        var found = rows.filter(function (x) { return String(x.id) === String(id); })[0];
        done(found);
      });
    } else {
      // last resort: owner endpoint (works only if logged in as owner)
      reqRetry(function () { return window.LokaliAPI.products.getById(id); }).then(function (res) {
        if (res && res.error) { console.warn('[vd] product load failed', res.error); renderNotFound('This product isn’t available', null, null); return; }
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
    var itemMsg = isProduct ? 'This product isn’t available' : 'This service isn’t available';
    reqRetry(function () { return window.LokaliAPI.vendors.getBySlug(info.vendorSlug); }).then(function (res) {
      if (res && res.error) { console.warn('[vd] vendor slug load failed', res.error); renderNotFound('This vendor isn’t available', null, null); return; }
      var v = unwrap(res); if (v && v.vendor) v = v.vendor;
      if (!v || v.error != null || v.id == null) { console.warn('[vd] vendor not found for slug', info.vendorSlug); renderNotFound('This vendor isn’t available', null, null); return; }
      _vendorCache[String(v.id)] = v; // #174: fillVendor reuses this row instead of refetching by id
      var listFn = isProduct ? window.LokaliAPI.products.listByVendor : window.LokaliAPI.services.listByVendor;
      reqRetry(function () { return listFn(v.id); }).then(function (lres) {
        if (lres && lres.error) { console.warn('[vd] item list load failed', lres.error); renderNotFound(itemMsg, '/' + info.vendorSlug, 'Back to the vendor'); return; }
        var rows = asArray(unwrap(lres));
        _listCache[info.kind] = rows; // #174: the sibling list is already here
        var match = rows.filter(function (x) { return x && String(x.slug) === String(info.itemSlug); })[0];
        if (!match || match.id == null) { console.warn('[vd] item not found for slug', info.itemSlug); renderNotFound(itemMsg, '/' + info.vendorSlug, 'Back to the vendor'); return; }
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
    try { v2Layout(info ? info.kind === 'products' : pageType() === 'product'); } catch (e) { console.warn('[vd] v2 layout failed', e); }
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
