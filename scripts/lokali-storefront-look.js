/* lokali-storefront-look.js: the "portfolio" storefront layout (F 2026-11-20).
 *
 * Designed for vendors with big catalogues (Featured plan) and galleries.
 * Mockups: docs/mockups/gallery-portfolio/mockup-paperloom.html (+ phone views).
 *
 * How it works: an ADD-ON layered over lokali-vendor-listing.js. The listing
 * script renders the normal storefront first; this file then builds the new
 * page around it and MOVES the existing live parts it reuses (reviews,
 * services, payment links, share, neighbor pairing) instead of copying them,
 * so their behaviour, lead tracking and inquiry modal stay exactly as they are.
 * Contact buttons proxy-click the real hidden controls for the same reason.
 *
 * Who sees it (F 2026-11-24, patch_gallery_all_plans.sql): a storefront whose
 * owner chose Gallery (vendors.storefront_look), on ANY plan. What differs by plan:
 *   - cover: Free 1 photo, Pro up to 5 rotating, Featured up to 15; no portfolio
 *     photo = a plain lavender band with the name (no product-photo stand-in);
 *   - collections / artists / art details: Featured only (unchanged);
 *   - any storefront with ?look=portfolio in the address (preview / testing).
 * ?look=classic always shows the normal storefront.
 * The hand-kept ON_FOR list is gone: owners switch on their Products page.
 *
 * Safety: every vendor-typed value goes in through textContent or a property,
 * never innerHTML. Images only from http(s) URLs. Fails closed: if anything
 * it needs is missing it leaves the normal storefront untouched.
 */
(function () {
  'use strict';
  if (window.__lkpLook) return;
  window.__lkpLook = true;

  var q = location.search || '';
  if (/[?&]look=classic\b/.test(q)) return;
  var FORCED = /[?&]look=portfolio\b/.test(q);

  var F = '"Plus Jakarta Sans",sans-serif';
  var MOBILE = window.matchMedia('(max-width: 767px)');
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- small helpers ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function ce(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    return /^https?:\/\//i.test(u) ? u : '';
  }
  function unwrap(res) {
    if (!res) return null;
    if (res.error) return null;
    return res.data !== undefined ? res.data : res;
  }
  function fmtDollars(n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function svg(path, size) {
    var s = size || 20;
    var w = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    w.setAttribute('viewBox', '0 0 24 24'); w.setAttribute('width', s); w.setAttribute('height', s);
    w.setAttribute('fill', 'none'); w.setAttribute('stroke', 'currentColor'); w.setAttribute('stroke-width', '1.9');
    w.setAttribute('stroke-linecap', 'round'); w.setAttribute('stroke-linejoin', 'round'); w.setAttribute('aria-hidden', 'true');
    w.innerHTML = path; // constant icon markup only, never data
    return w;
  }
  var IC = {
    text: '<path d="M4 5h16v11H8l-4 4z"/>',
    wa: '<path d="M5 19l1.3-3.6A8 8 0 1 1 9.6 18.6z"/><path d="M9.5 9.5c.5 2 2 3.5 4 4"/>',
    call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
  };

  // ---------- styles ----------
  var CSS = [
    'html.lkp-on .vl-bg{display:none !important;}',
    '#lkp{font-family:' + F + ';color:#1A1829;background:#fff;}',
    '#lkp *{box-sizing:border-box;}',
    '#lkp a{text-decoration:none;color:inherit;}',
    '#lkp button{font-family:' + F + ';cursor:pointer;}',
    '.lkp-wrap{max-width:1160px;margin:0 auto;padding:0 32px;}',
    // cover
    '.lkp-cover{position:relative;height:min(64vh,540px);min-height:380px;overflow:hidden;background:#F3EBFF;}',
    '.lkp-cover .lkp-sl{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .9s ease;}',
    '.lkp-cover .lkp-sl.on{opacity:1;}',
    '.lkp-scrim{position:absolute;inset:0;background:linear-gradient(rgba(30,28,40,0) 45%,rgba(30,28,40,.55));}',
    '.lkp-ctx{position:absolute;left:0;right:0;bottom:40px;}',
    // no cover photo: a plain lavender band with the name (F 2026-11-24)
    '.lkp-cover.lkp-plain{height:auto;min-height:0;padding:64px 0 48px;background:#F3EBFF;}',
    '.lkp-plain .lkp-ctx{position:static;}',
    '.lkp-plain h1{color:#1A1829 !important;}.lkp-plain .lkp-tag{color:#3B3850 !important;}.lkp-plain .lkp-meta{color:#5E5A73 !important;}',
    '.lkp-plain .lkp-b{background:#6002EE !important;border-color:#6002EE !important;color:#fff !important;}',
    '.lkp-plain .lkp-b.gh{background:#fff !important;color:#4A1FB8 !important;border-color:#CFC4F0 !important;}',
    '.lkp-plain .lkp-rec{color:#4A1FB8;background:#fff;}',
    '.lkp-logo{width:56px;height:56px;border-radius:14px;background:#fff;overflow:hidden;margin-bottom:14px;display:flex;align-items:center;justify-content:center;font:700 18px ' + F + ';color:#4A1FB8;}',
    '.lkp-logo img{width:100%;height:100%;object-fit:cover;}',
    '.lkp-cover h1{font:700 clamp(34px,5vw,56px)/1.04 ' + F + ';color:#fff;margin:0;letter-spacing:-1px;}',
    '.lkp-tag{font:500 18px/1.45 ' + F + ';color:#fff;margin:10px 0 0;max-width:620px;}',
    '.lkp-meta{font:500 14px/1.4 ' + F + ';color:#E9DDFF;margin-top:6px;}',
    '.lkp-btns{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;}',
    '.lkp-b{font:600 14px/1 ' + F + ';padding:13px 22px;border-radius:999px;background:#fff;color:#4A1FB8;border:1.5px solid #fff;}',
    '.lkp-b.gh{background:transparent;color:#fff;}',
    '.lkp-rec{display:inline-flex;align-items:center;gap:6px;font:600 13px ' + F + ';color:#fff;background:rgba(255,255,255,.16);border-radius:999px;padding:6px 12px;margin-top:12px;}',
    '.lkp-fav{position:absolute;top:22px;right:max(32px,calc((100vw - 1100px)/2));z-index:3;width:48px;height:48px;border-radius:50%;border:0;background:rgba(255,255,255,.94);color:#6002EE;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(38,24,82,.18);}',
    '.lkp-fav.on svg{fill:#6002EE;}',
    '.lkp-nav{position:absolute;right:max(32px,calc((100vw - 1100px)/2));bottom:44px;display:flex;align-items:center;gap:12px;z-index:2;}',
    '.lkp-ar{width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#4A1FB8;display:flex;align-items:center;justify-content:center;}',
    '.lkp-dots{display:flex;gap:6px;}',
    '.lkp-dots button{width:7px;height:7px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.55);}',
    '.lkp-dots button.on{background:#fff;width:20px;border-radius:999px;}',
    // sticky bar
    '.lkp-bar{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.97);border-bottom:1px solid #E7E2F3;}',
    '.lkp-bar .lkp-wrap{display:flex;align-items:center;height:58px;gap:4px;}',
    '.lkp-bnm{font:700 15px ' + F + ';margin-right:16px;white-space:nowrap;}',
    '.lkp-tab{font:600 14px ' + F + ';color:#6B6880;padding:9px 14px;border-radius:999px;white-space:nowrap;}',
    '.lkp-tab.on{background:#F3EBFF;color:#6002EE;}',
    '.lkp-sp{flex:1;}',
    '.lkp-pill{font:600 13.5px/1 ' + F + ';padding:11px 18px;border-radius:999px;border:0;background:#6002EE;color:#fff;white-space:nowrap;}',
    // sections
    '.lkp-sec{padding-top:60px;}',
    '.lkp-sh{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:6px;}',
    '.lkp-sh h2{font:700 30px/1.15 ' + F + ';margin:0;letter-spacing:-.4px;color:#1A1829;}',
    '.lkp-cnt{font:600 13px ' + F + ';color:#6B6880;white-space:nowrap;}',
    '.lkp-lede{font:400 15.5px/1.6 ' + F + ';color:#6B6880;margin:0 0 20px;max-width:640px;}',
    // filters
    '.lkp-fbar{display:none;}',
    '.lkp-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:26px;}',
    '.lkp-chip{display:inline-flex;align-items:center;gap:6px;font:600 13.5px ' + F + ';padding:8px 14px;border:1px solid #E7E2F3;border-radius:999px;color:#3B3850;background:#fff;}',
    '.lkp-chip small{font:500 12px ' + F + ';color:#6B6880;}',
    '.lkp-chip.on{border-color:#6002EE;color:#6002EE;background:#F3EBFF;}',
    '.lkp-chip.more{display:none;color:#6002EE;border-style:dashed;}',
    '.lkp-chip.xx{display:none;}.lkp-chip.more.wide{display:inline-flex;}.lkp-mp{display:none;}',
    '.lkp-sheet-bg.wide{align-items:center;justify-content:center;}.lkp-sheet-bg.wide .lkp-sheet{max-width:460px;border-radius:22px;}.lkp-sheet-bg.wide .lkp-grab{display:none;}',
    // grid
    '.lkp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 26px;}',
    '.lkp-card{display:block;}',
    '.lkp-im{position:relative;aspect-ratio:4/5;background:#F3EBFF;overflow:hidden;border-radius:6px;}',
    '.lkp-im img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease;}',
    '.lkp-card:hover .lkp-im img{transform:scale(1.03);}',
    '.lkp-tg{position:absolute;top:12px;left:12px;font:600 11.5px ' + F + ';padding:5px 10px;border-radius:999px;background:#fff;color:#5A4A7A;}',
    '.lkp-card.sold img{opacity:.55;}',
    '.lkp-card h3{font:600 16px/1.3 ' + F + ';margin:14px 0 2px;color:#1A1829;}',
    '.lkp-by{font:500 13.5px ' + F + ';color:#6002EE;}',
    '.lkp-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:6px;}',
    '.lkp-pr{font:700 15px ' + F + ';color:#1A1829;}',
    '.lkp-pr.q{font-weight:600;color:#6002EE;}',
    '.lkp-sz{font:500 12.5px ' + F + ';color:#6B6880;text-align:right;}',
    '.lkp-more{display:block;width:100%;text-align:center;font:600 14px ' + F + ';color:#6002EE;background:#F3EBFF;border:0;border-radius:12px;padding:14px;margin-top:36px;}',
    '.lkp-none{font:500 15px ' + F + ';color:#6B6880;padding:30px 0;}',
    // moved legacy sections: quiet their old headings/frames
    '#lkp .vl-op-sec{border:0 !important;padding:0 !important;margin:0 !important;}',
    '#lkp .vl-op-sec > .vl-op-h{display:none !important;}',
    '#lkp #vl-pair-sec{margin-top:60px;}',
    // contact card beside the work, in view while scrolling (F 2026-11-24)
    '.lkp-two{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:48px;align-items:stretch;}',
    '.lkp-side{padding-top:60px;}',
    '.lkp-two .lkp-grid{grid-template-columns:repeat(2,minmax(0,1fr));}',
    '.lkp-two .lkp-about{grid-template-columns:1fr;}',
    '@media (max-width:959px){.lkp-two{grid-template-columns:1fr;gap:0;}.lkp-side{display:none;}.lkp-two .lkp-card2{position:static;}}',
    '@media (min-width:768px) and (max-width:959px){.lkp-two .lkp-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}',
    // about
    '.lkp-about{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:56px;align-items:start;margin-top:18px;}',
    '.lkp-inside{display:grid;grid-template-columns:2fr 1fr;grid-template-rows:150px 150px;gap:8px;margin-bottom:26px;}',
    '.lkp-inside div{background:#F3EBFF;border-radius:6px;overflow:hidden;}',
    '.lkp-inside div:first-child{grid-row:span 2;}',
    '.lkp-inside img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.lkp-story{font:400 16px/1.7 ' + F + ';color:#3B3850;white-space:pre-line;}',
    '.lkp-owner{display:flex;gap:16px;align-items:flex-start;background:#F7F6FC;border-radius:16px;padding:20px;margin-top:24px;}',
    '.lkp-owner img,.lkp-av0{width:64px;height:64px;border-radius:50%;object-fit:cover;flex:none;}',
    '.lkp-av0{background:#F3EBFF;color:#6002EE;display:flex;align-items:center;justify-content:center;font:700 20px ' + F + ';}',
    '.lkp-oq{font:500 15px/1.6 ' + F + ';color:#3B3850;margin:0 0 8px;white-space:pre-line;}',
    '.lkp-ow{font:600 14px ' + F + ';}.lkp-ow span{font-weight:500;color:#6B6880;}',
    // contact card
    '.lkp-card2{border:1px solid #E7E2F3;border-radius:18px;padding:22px;background:#fff;position:sticky;top:78px;}',
    '.lkp-who{display:flex;gap:12px;align-items:center;margin-bottom:16px;}',
    '.lkp-who img,.lkp-who .lkp-av0{width:52px;height:52px;font-size:17px;border-radius:50%;object-fit:cover;flex:none;}',
    '.lkp-wn{font:700 18px ' + F + ';}.lkp-wr{font:500 13px/1.4 ' + F + ';color:#6B6880;}',
    '.lkp-cta{display:block;width:100%;text-align:center;font:600 15px ' + F + ';padding:14px;border-radius:12px;border:0;background:#6002EE;color:#fff;}',
    '.lkp-hint{font:500 13px/1.5 ' + F + ';color:#6B6880;margin:10px 2px 14px;text-align:center;}',
    '.lkp-ways{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;}',
    '.lkp-ways button{display:flex;flex-direction:column;align-items:center;gap:5px;padding:11px 0 9px;border:0;border-radius:12px;background:#F7F6FC;color:#4A1FB8;font:600 12px ' + F + ';}',
    '.lkp-cs{margin-top:18px;padding-top:16px;border-top:1px solid #E7E2F3;}',
    '.lkp-ch{display:flex;align-items:center;gap:6px;font:700 14px ' + F + ';margin-bottom:10px;color:#1A1829;}.lkp-ch svg{color:#6002EE;}',
    '.lkp-areas{display:flex;flex-wrap:wrap;gap:6px;}',
    '.lkp-areas span{font:500 13px ' + F + ';padding:6px 11px;border-radius:999px;border:1px solid #E7E2F3;color:#3B3850;}',
    '.lkp-areas .home{background:#F3EBFF;border-color:#F3EBFF;color:#4A1FB8;font-weight:600;}',
    '.lkp-areas small{font-weight:500;color:#6B6880;margin-left:3px;}',
    '.lkp-card2 #lok-pay-links{margin-top:0 !important;}',
    '.lkp-links{display:flex;flex-direction:column;gap:8px;}',
    '.lkp-links a{display:flex;align-items:center;gap:8px;font:600 14px ' + F + ';color:#6002EE !important;}',
    '.lkp-share{margin-top:14px;}',
    '.lkp-share #lokali-share-detail{display:flex;}',
    '.lkp-share #lokali-share-detail .lk-share{flex:1;justify-content:center;}',
    '.lkp-small{margin-top:14px;text-align:center;font:500 12px ' + F + ';color:#6B6880;}',
    // phone filter sheet
    '.lkp-sheet-bg{position:fixed;inset:0;background:rgba(38,24,82,.45);z-index:2000;display:flex;align-items:flex-end;}',
    '.lkp-sheet{background:#fff;width:100%;border-radius:22px 22px 0 0;padding:10px 18px calc(18px + env(safe-area-inset-bottom));max-height:88vh;overflow:auto;font-family:' + F + ';}',
    '.lkp-grab{width:40px;height:4px;border-radius:4px;background:#DCD6EC;margin:0 auto 12px;}',
    '.lkp-st{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}',
    '.lkp-st b{font:700 18px ' + F + ';color:#1A1829;}',
    '.lkp-st button{border:0;background:none;color:#6B6880;padding:6px;}',
    '.lkp-shh{font:700 13px ' + F + ';color:#6B6880;margin:14px 0 6px;}',
    '.lkp-opt{display:flex;align-items:center;gap:10px;width:100%;padding:13px 2px;border:0;border-bottom:1px solid #E7E2F3;background:none;font:500 15px ' + F + ';color:#1A1829;text-align:left;}',
    '.lkp-opt span{flex:1;}.lkp-opt small{font:500 13px ' + F + ';color:#6B6880;}',
    '.lkp-opt i{width:22px;height:22px;border-radius:50%;border:2px solid #CFC8E3;flex:none;}',
    '.lkp-opt.on i{border:7px solid #6002EE;}',
    '.lkp-sorts{display:flex;gap:8px;flex-wrap:wrap;}',
    '.lkp-sorts button{font:600 13px ' + F + ';padding:9px 14px;border-radius:999px;border:1px solid #E7E2F3;background:#fff;color:#3B3850;}',
    '.lkp-sorts button.on{background:#F3EBFF;border-color:#6002EE;color:#6002EE;}',
    '.lkp-sheet .lkp-cta{margin-top:18px;}',
    // phones
    '@media (max-width:767px){',
    '.lkp-wrap{padding:0 16px;}',
    '.lkp-cover{height:auto;min-height:0;padding-top:300px;background:#fff;}',
    '.lkp-cover .lkp-sl{height:300px;bottom:auto;}',
    '.lkp-scrim{display:none;}',
    '.lkp-ctx{position:static;padding:0 0 24px;}',
    '.lkp-logo{margin-top:-30px;position:relative;box-shadow:0 2px 10px rgba(38,24,82,.15);width:48px;height:48px;}',
    '.lkp-cover h1{color:#1A1829;font-size:32px;}',
    '.lkp-cover.lkp-plain{padding:28px 0 0;background:#F3EBFF;}',
    '.lkp-plain .lkp-logo{margin-top:0;}',
    '.lkp-tag{color:#3B3850;font-size:15.5px;}',
    '.lkp-meta{color:#6B6880;}',
    '.lkp-b{background:#6002EE;border-color:#6002EE;color:#fff;}',
    '.lkp-b.gh{background:#fff;color:#6002EE;border-color:#6002EE;}',
    '.lkp-rec{background:#F3EBFF;color:#4A1FB8;}',
    '.lkp-fav{top:14px;right:14px;width:42px;height:42px;}',
    '.lkp-nav{right:14px;bottom:auto;top:262px;}',
    '.lkp-ar{display:none;}',
    '.lkp-bnm,.lkp-bar .lkp-pill{display:none;}',
    '.lkp-bar .lkp-wrap{height:52px;gap:2px;overflow:hidden;}',
    '.lkp-tab{padding:8px 12px;font-size:13.5px;}',
    '.lkp-sec{padding-top:44px;}',
    '.lkp-sh h2{font-size:24px;}',
    '.lkp-fbar{display:flex;margin:0 0 12px;}',
    '.lkp-fbtn{display:flex;align-items:center;gap:8px;font:600 14px ' + F + ';color:#4A1FB8;border:1.5px solid #6002EE;border-radius:999px;padding:10px 18px;background:#fff;}',
    '.lkp-chips{margin-bottom:22px;}',
    '.lkp-chip{padding:8px 13px;font-size:13px;}',
    '.lkp-chip.x{display:none;}.lkp-chip.more{display:inline-flex;}.lkp-mw{display:none;}.lkp-mp{display:inline;}',
    '.lkp-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:26px 12px;}',
    '.lkp-card h3{font-size:14px;margin-top:10px;}',
    '.lkp-by{font-size:12.5px;}',
    '.lkp-row{flex-direction:column;align-items:flex-start;gap:2px;}',
    '.lkp-sz{text-align:left;}',
    '.lkp-about{grid-template-columns:1fr;gap:28px;}',
    '.lkp-inside{grid-template-rows:110px 110px;}',
    '.lkp-card2{position:static;}',
    '}'
  ].join('\n');

  // ---------- wait for the normal storefront to finish its first render ----------
  function waitFor(test, timeoutMs) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        var v; try { v = test(); } catch (e) { v = null; }
        if (v) return resolve(v);
        if (Date.now() - t0 > timeoutMs) return resolve(null);
        setTimeout(tick, 150);
      })();
    });
  }

  waitFor(function () {
    var v = window.LOKALI_LOADED_VENDOR;
    return v && v.id != null && document.getElementById('vl-op-sec-products') && document.querySelector('.vl-op-main') ? v : null;
  }, 20000).then(function (lv) {
    if (!lv) return;
    var vid = Number(lv.id);
    (FORCED ? Promise.resolve(true) : chosen(vid)).then(function (on) {
      if (!on) return;
      return start(vid);
    }).catch(function (e) {
      // Fail closed: show the normal storefront again.
      document.documentElement.classList.remove('lkp-on');
      var host = document.getElementById('lkp'); if (host) host.parentNode.removeChild(host);
      if (window.console) console.warn('[lokali-storefront-look] fell back to the normal storefront', e);
    });
  });

  // Did the owner choose Gallery? (Every plan may, since 2026-11-24.)
  function chosen(vid) {
    return client().then(function (c) {
      return c.from('vendors').select('storefront_look,plan_rank').eq('id', vid).maybeSingle();
    }).then(function (res) {
      var v = unwrap(res);
      return !!(v && v.storefront_look === 'gallery');
    }, function () { return false; });
  }

  function client() {
    return Promise.resolve(window.LokaliSupabaseReady).then(function (c) { if (!c || !c.from) throw new Error('no client'); return c; });
  }

  function start(vid) {
    return client().then(function (c) {
      var SB = window.LokaliSupabaseAPI || {};
      return Promise.all([
        c.from('vendors').select('id,business_name,business_description,business_tagline,locations_id,profile_photo,owner_name,owner_bio,owner_photo,owner_languages,created_at,slug,is_founding_member,is_verified,plan_rank').eq('id', vid).maybeSingle(),
        c.from('products').select('*').eq('vendors_id', vid).order('sort_order', { ascending: true }).order('id', { ascending: true }),
        c.from('locations').select('id,location_name'),
        SB.subcategories && SB.subcategories.list ? Promise.resolve(SB.subcategories.list()).catch(function () { return null; }) : null,
        loadGroups(c, SB, vid),
        coverPhotos(c, vid)
      ]);
    }).then(function (r) {
      var v = unwrap(r[0]);
      if (!v) throw new Error('vendor not readable');
      var products = (unwrap(r[1]) || []).filter(function (p) { return p && p.is_active !== false; });
      var locs = {}; (unwrap(r[2]) || []).forEach(function (l) { locs[l.id] = l.location_name; });
      var subs = {}; (unwrap(r[3]) || []).forEach(function (s) { if (s && s.slug && !subs[s.slug]) subs[s.slug] = s.label; });
      var g = r[4] || {};
      var photos = r[5] || [];
      build(v, products, locs, subs, g, photos);
    });
  }

  // The owner's collections, their word, what shoppers narrow by, and which
  // listings sit in each (a listing can sit in several). Needs
  // patch_gallery_page_setup.sql; before it, falls back to one collection per
  // listing (products.artist_id) and every collection shown.
  function loadGroups(c, SB, vid) {
    var empty = { artists: [], label: 'collections', browseBy: 'collections', links: null };
    var arts = c.from('vendor_artists').select('id,name,origin,bio,photo_url,sort_order,is_hidden')
      .eq('vendors_id', vid).is('deleted_at', null).order('sort_order').order('id').limit(60)
      .then(function (res) {
        if (res && !res.error) return res.data || [];
        return (SB.artists && SB.artists.forVendor) ? Promise.resolve(SB.artists.forVendor(vid)).then(function (r2) { return unwrap(r2) || []; }) : [];
      });
    var prefs = c.from('vendor_collection_prefs').select('label,browse_by').eq('vendors_id', vid).maybeSingle()
      .then(function (res) {
        if (res && !res.error) return res.data || {};
        return c.from('vendor_collection_prefs').select('label').eq('vendors_id', vid).maybeSingle()
          .then(function (r2) { return (r2 && !r2.error && r2.data) || {}; });
      });
    var links = c.from('product_collections').select('product_id,collection_id').eq('vendors_id', vid).limit(5000)
      .then(function (res) { return (res && !res.error) ? (res.data || []) : null; });
    return Promise.all([arts, prefs, links]).then(function (r) {
      var p = r[1] || {};
      return {
        artists: (r[0] || []).filter(function (a) { return a && a.id != null && String(a.name || '').trim(); }),
        label: (p.label === 'artists' || p.label === 'makers') ? p.label : 'collections',
        browseBy: p.browse_by === 'kinds' ? 'kinds' : 'collections',
        links: r[2]
      };
    }, function () { return empty; });
  }

  // Photos the normal page already loaded (plan caps already applied there).
  // Cover photos straight from vendor_photos (the public read rule already
  // limits a Free storefront to its first photo). Falls back to reading the
  // normal page's portfolio strip if the read fails. Each item: {u, x, y}.
  function coverPhotos(c, vid) {
    return Promise.resolve(c.from('vendor_photos').select('id,image_url,sort_order,image_focus_x,image_focus_y')
      .eq('vendors_id', vid).eq('is_active', true)
      .order('sort_order', { ascending: true }).order('id', { ascending: true }))
      .then(function (res) {
        if (!res || res.error) throw new Error('photos');
        return (res.data || []).map(function (r) {
          var u = safeUrl(r.image_url);
          return u ? { u: u, x: r.image_focus_x, y: r.image_focus_y } : null;
        }).filter(Boolean);
      })
      .catch(function () {
        return waitFor(function () { return portfolioUrls().length ? portfolioUrls() : null; }, 3000)
          .then(function (l) { return (l || []).map(function (u) { return { u: u }; }); });
      });
  }
  function portfolioUrls() {
    var seen = {}, out = [];
    $all('#vl-portfolio-strip img').forEach(function (im) {
      var u = safeUrl(im.currentSrc || im.src);
      var key = u.split('?')[0];
      if (u && !seen[key]) { seen[key] = 1; out.push(u); }
    });
    return out;
  }

  // Smaller image copies through the site's shared helper (same as the normal page).
  function setImg(img, url, w) {
    var I = window.LokaliImg;
    if (I && typeof I.set === 'function') I.set(img, url, w); else img.src = url;
  }

  function initials(s) {
    return String(s || '').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || 'L';
  }
  function avatar(url, name) {
    var u = safeUrl(url);
    if (u) { var im = ce('img'); im.src = u; im.alt = name || ''; im.loading = 'lazy'; return im; }
    return ce('div', 'lkp-av0', initials(name));
  }
  function proxyClick(id) {
    var el = document.getElementById(id);
    if (el) el.click();
  }
  function scrollToId(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var y = el.getBoundingClientRect().top + window.pageYOffset - 70;
    window.scrollTo({ top: y, behavior: REDUCED.matches ? 'auto' : 'smooth' });
  }

  function build(v, products, locs, subs, G, photos) {
    var name = v.business_name || (window.LOKALI_LOADED_VENDOR && window.LOKALI_LOADED_VENDOR.name) || '';
    var owner = String(v.owner_name || '').trim();
    var vendorSlug = v.slug || '';
    var areas = (Array.isArray(v.locations_id) ? v.locations_id : []).map(function (id) { return locs[id]; }).filter(Boolean);
    // Collections are a Featured perk. "Art" presentation (by-line, medium and
    // size, Sold / One of a kind) only when the owner calls them Artists.
    var featured = Number(v.plan_rank) === 2;
    var artists = featured ? (G.artists || []) : [];
    var artistById = {}; artists.forEach(function (a) { artistById[a.id] = a; });
    var gallery = artists.length > 0 && (G.label === 'artists' || G.label === 'makers');
    var linksOf = {};
    if (G.links) G.links.forEach(function (l) { (linksOf[l.product_id] = linksOf[l.product_id] || []).push(l.collection_id); });
    function collectionsOf(p) {
      var ids = G.links ? (linksOf[p.id] || []) : (p.artist_id != null ? [p.artist_id] : []);
      return ids.filter(function (id) { return artistById[id]; });
    }
    var shownArtists = artists.filter(function (a) {
      return !a.is_hidden && products.some(function (p) { return collectionsOf(p).indexOf(a.id) >= 0; });
    });
    var byCollections = G.browseBy !== 'kinds' && shownArtists.length > 0;

    var st = ce('style'); st.id = 'lkp-css'; st.textContent = CSS; document.head.appendChild(st);
    var host = ce('div'); host.id = 'lkp';
    var bg = $('.vl-bg');
    if (!bg || !bg.parentNode) throw new Error('page frame missing');
    bg.parentNode.insertBefore(host, bg);

    // ===== cover =====
    var cover = ce('section', 'lkp-cover');
    // Cover photos by plan: Free 1, Pro 5, Featured 15 (the owner viewing their
    // own page can read every row, so cap here too).
    var rank = Number(v.plan_rank) || 0;
    var slides = photos.slice(0, rank >= 2 ? 15 : rank === 1 ? 5 : 1);
    slides.forEach(function (ph, i) {
      var im = ce('img', 'lkp-sl' + (i === 0 ? ' on' : ''));
      im.alt = i === 0 ? name + ' work' : ''; if (i > 1) im.loading = 'lazy'; setImg(im, ph.u, 1600);
      if (ph.x != null && ph.y != null) im.style.objectPosition = ph.x + '% ' + ph.y + '%';
      cover.appendChild(im);
    });
    if (slides.length) cover.appendChild(ce('div', 'lkp-scrim'));
    else cover.classList.add('lkp-plain');
    var fav = ce('button', 'lkp-fav'); fav.type = 'button';
    fav.setAttribute('aria-label', 'Follow ' + name); fav.title = 'Follow ' + name;
    fav.appendChild(svg(IC.heart, 22));
    fav.addEventListener('click', function () {
      var real = $('#lokali-fav-detail button, #lokali-fav-detail a, #lokali-fav-detail [role="button"]');
      if (real) real.click();
      setTimeout(syncFav, 400);
    });
    function syncFav() {
      var real = $('#lokali-fav-detail [aria-pressed], #lokali-fav-detail .is-active, #lokali-fav-detail .active');
      var on = !!(real && (real.getAttribute('aria-pressed') === 'true' || /\b(is-)?active\b/.test(real.className)));
      fav.classList.toggle('on', on);
    }
    if ($('#lokali-fav-detail')) { cover.appendChild(fav); setTimeout(syncFav, 1200); }

    var ctx = ce('div', 'lkp-ctx'); var cw = ce('div', 'lkp-wrap'); ctx.appendChild(cw);
    var logo = ce('div', 'lkp-logo');
    var lu = safeUrl(v.profile_photo);
    if (lu) { var li = ce('img'); li.src = lu; li.alt = name + ' logo'; logo.appendChild(li); } else logo.textContent = initials(name);
    cw.appendChild(logo);
    cw.appendChild(ce('h1', null, name));
    if (v.business_tagline) cw.appendChild(ce('p', 'lkp-tag', String(v.business_tagline).trim()));
    var metaBits = [];
    if (areas.length) metaBits.push('Based in ' + areas[0] + (areas.length > 1 ? ', serves ' + areas.length + ' towns' : ''));
    if (metaBits.length) cw.appendChild(ce('div', 'lkp-meta', metaBits.join(' · ')));
    var quoteMostly = products.length && products.filter(function (p) { return p.is_quote_based || p.price == null || p.price === ''; }).length > products.length / 2;
    var ctaWord = quoteMostly ? 'Ask for a quote' : 'Send a message';
    var btns = ce('div', 'lkp-btns');
    var bWork = ce('button', 'lkp-b', gallery ? 'See the art' : 'See the work'); bWork.type = 'button';
    bWork.addEventListener('click', function () { scrollToId('lkp-work'); });
    var bMsg = ce('button', 'lkp-b gh', ctaWord); bMsg.type = 'button';
    bMsg.addEventListener('click', function () { proxyClick('lok-inq-btn'); });
    btns.appendChild(bWork);
    btns.appendChild(bMsg);
    cw.appendChild(btns);
    var rec = ce('div', 'lkp-rec'); rec.style.display = 'none';
    cw.appendChild(rec);
    cover.appendChild(ctx);

    if (slides.length > 1) {
      var nav = ce('div', 'lkp-nav');
      var prev = ce('button', 'lkp-ar'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous photo'); prev.appendChild(svg(IC.left, 18));
      var next = ce('button', 'lkp-ar'); next.type = 'button'; next.setAttribute('aria-label', 'Next photo'); next.appendChild(svg(IC.right, 18));
      var dots = ce('div', 'lkp-dots');
      slides.forEach(function (_, i) {
        var d = ce('button', i === 0 ? 'on' : ''); d.type = 'button'; d.setAttribute('aria-label', 'Photo ' + (i + 1));
        d.addEventListener('click', function () { go(i); restart(); });
        dots.appendChild(d);
      });
      nav.appendChild(prev); nav.appendChild(dots); nav.appendChild(next);
      cover.appendChild(nav);
      var cur = 0, timer = null;
      var imgs = $all('.lkp-sl', cover), dotEls = $all('button', dots);
      function go(i) {
        cur = (i + slides.length) % slides.length;
        imgs.forEach(function (im, k) { im.classList.toggle('on', k === cur); });
        dotEls.forEach(function (d, k) { d.classList.toggle('on', k === cur); });
      }
      function restart() {
        if (timer) clearInterval(timer);
        if (!REDUCED.matches) timer = setInterval(function () { if (!document.hidden) go(cur + 1); }, 5000);
      }
      prev.addEventListener('click', function () { go(cur - 1); restart(); });
      next.addEventListener('click', function () { go(cur + 1); restart(); });
      cover.addEventListener('mouseenter', function () { if (timer) clearInterval(timer); });
      cover.addEventListener('mouseleave', restart);
      var tx = null;
      cover.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
      cover.addEventListener('touchend', function (e) {
        if (tx == null) return;
        var dx = e.changedTouches[0].clientX - tx; tx = null;
        if (Math.abs(dx) > 40) { go(cur + (dx < 0 ? 1 : -1)); restart(); }
      }, { passive: true });
      restart();
    }
    host.appendChild(cover);

    // ===== sticky bar =====
    var bar = ce('div', 'lkp-bar'); var bw = ce('div', 'lkp-wrap'); bar.appendChild(bw);
    bw.appendChild(ce('span', 'lkp-bnm', name));
    var tabsSpec = [];
    function addTab(label, id) {
      var t = ce('a', 'lkp-tab', label); t.href = '#' + id;
      t.addEventListener('click', function (e) { e.preventDefault(); scrollToId(id); });
      t.setAttribute('data-for', id);
      bw.appendChild(t); tabsSpec.push(t);
      return t;
    }
    var sp = ce('span', 'lkp-sp');
    var barMsg = ce('button', 'lkp-pill', ctaWord); barMsg.type = 'button';
    barMsg.addEventListener('click', function () { proxyClick('lok-inq-btn'); });
    host.appendChild(bar);

    var outer = ce('div', 'lkp-wrap lkp-two'); host.appendChild(outer);
    var wrap = ce('div'); outer.appendChild(wrap);
    var side = ce('aside', 'lkp-side'); outer.appendChild(side);

    // ===== showcase of the week (Featured), if the normal page drew one =====
    var showcase = document.getElementById('vl-op-sec-showcase');
    if (showcase) { var scS = ce('section', 'lkp-sec'); scS.appendChild(showcase); wrap.appendChild(scS); }

    // ===== the work =====
    var work = ce('section', 'lkp-sec'); work.id = 'lkp-work';
    var sh = ce('div', 'lkp-sh');
    sh.appendChild(ce('h2', null, gallery ? 'The art' : 'The work'));
    var cnt = ce('span', 'lkp-cnt'); sh.appendChild(cnt);
    work.appendChild(sh);
    work.appendChild(ce('p', 'lkp-lede', byCollections
      ? (gallery ? 'Pick an artist to see only their work.' : 'Pick a collection to narrow things down.')
      : (quoteMostly ? 'Everything is made to order. Pick what you need and ask for a quote.' : 'Pick a kind to narrow things down.')));
    var fbar = ce('div', 'lkp-fbar');
    var fbtn = ce('button', 'lkp-fbtn'); fbtn.type = 'button'; fbtn.appendChild(svg(IC.filter, 18)); fbtn.appendChild(document.createTextNode('Filter and sort'));
    fbar.appendChild(fbtn);
    var chips = ce('div', 'lkp-chips');
    var grid = ce('div', 'lkp-grid');
    var moreBtn = ce('button', 'lkp-more'); moreBtn.type = 'button';
    work.appendChild(fbar); work.appendChild(chips); work.appendChild(grid); work.appendChild(moreBtn);
    wrap.appendChild(work);

    // groups: the owner's collections (their order, hidden ones left out) when
    // they browse by collections; otherwise the listing's kind, leaving out
    // kinds with a single listing so the row stays tidy (F 2026-11-21). A
    // listing can sit in several collections.
    function groupsOf(p) {
      if (byCollections) return collectionsOf(p).map(function (id) { return 'a' + id; });
      return p.subcategory ? ['s' + p.subcategory] : [];
    }
    function groupLabel(g) {
      if (g.charAt(0) === 'a') return (artistById[g.slice(1)] || {}).name || 'Collection';
      var slug = g.slice(1);
      return subs[slug] || slug.replace(/-/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
    }
    var counts = {};
    products.forEach(function (p) { groupsOf(p).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; }); });
    var groups = byCollections
      ? shownArtists.map(function (a) { return 'a' + a.id; }).filter(function (g) { return counts[g]; })
      : Object.keys(counts).filter(function (g) { return counts[g] >= 2; })
          .sort(function (a, b) { return counts[b] - counts[a] || groupLabel(a).localeCompare(groupLabel(b)); });
    var hasFilters = groups.length >= 2;
    var state = { group: '', sort: 'picks', shown: 0 };
    var PAGE_FIRST = 12, PAGE_MORE = 24;
    var hasPrices = products.some(function (p) { return !p.is_quote_based && p.price != null && p.price !== '' && isFinite(Number(p.price)); });

    function drawChips() {
      chips.innerHTML = '';
      if (!hasFilters) { chips.style.display = 'none'; fbar.style.display = 'none'; return; }
      function chip(label, n, g, idx) {
        var b = ce('button', 'lkp-chip' + (state.group === g ? ' on' : '') + (idx >= 3 && g !== state.group ? ' x' : '') + (idx >= 7 && g !== state.group ? ' xx' : ''));
        b.type = 'button';
        b.appendChild(document.createTextNode(label + ' '));
        b.appendChild(ce('small', null, String(n)));
        b.setAttribute('aria-pressed', state.group === g ? 'true' : 'false');
        b.addEventListener('click', function () { state.group = g; render(true); });
        chips.appendChild(b);
      }
      chip(gallery && byCollections ? (G.label === 'makers' ? 'All makers' : 'All artists') : 'All', products.length, '', 0);
      groups.forEach(function (g, i) { chip(groupLabel(g), counts[g], g, i + 1); });
      var hiddenPhone = Math.max(0, groups.length - 2), hiddenWide = Math.max(0, groups.length - 6);
      if (hiddenPhone > 0) {
        var m = ce('button', 'lkp-chip more' + (hiddenWide > 0 ? ' wide' : ''), ''); m.type = 'button';
        m.appendChild(ce('span', 'lkp-mw', '+ ' + hiddenWide + ' more'));
        m.appendChild(ce('span', 'lkp-mp', '+ ' + hiddenPhone + ' more'));
        m.addEventListener('click', openSheet);
        chips.appendChild(m);
      }
    }
    function sorted(list) {
      var l = list.slice();
      if (state.sort === 'picks') l.sort(function (a, b) { return (b.is_featured_pick === true ? 1 : 0) - (a.is_featured_pick === true ? 1 : 0); });
      else if (state.sort === 'new') l.sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
      else if (state.sort === 'az') l.sort(function (a, b) { return String(a.product_name || '').localeCompare(String(b.product_name || '')); });
      else if (state.sort === 'low') l.sort(function (a, b) { return priceNum(a) - priceNum(b); });
      return l;
    }
    function priceNum(p) { var n = Number(p.price); return (!p.is_quote_based && p.price != null && p.price !== '' && isFinite(n)) ? n : 1e12; }
    function current() { return sorted(products.filter(function (p) { return !state.group || groupsOf(p).indexOf(state.group) >= 0; })); }
    function href(p) {
      if (vendorSlug && p.slug) return '/' + encodeURIComponent(vendorSlug) + '/products/' + encodeURIComponent(p.slug);
      return '/product-detail?id=' + encodeURIComponent(p.id) + '&vendor=' + encodeURIComponent(v.id);
    }
    function card(p) {
      var a = ce('a', 'lkp-card'); a.href = href(p);
      var stock = (p.stock_quantity == null || p.stock_quantity === '') ? null : Number(p.stock_quantity);
      var sold = gallery && stock === 0;
      if (sold) a.className += ' sold';
      var im = ce('div', 'lkp-im');
      var u = safeUrl(p.image_url);
      if (u) {
        var i = ce('img'); i.alt = p.product_name || ''; i.loading = 'lazy'; i.decoding = 'async'; setImg(i, u, 640);
        if (p.image_focus_x != null && p.image_focus_y != null) i.style.objectPosition = Number(p.image_focus_x) + '% ' + Number(p.image_focus_y) + '%';
        im.appendChild(i);
      }
      var tag = sold ? 'Sold' : (gallery && stock === 1 ? 'One of a kind' : (p.is_featured_pick === true ? 'Our pick' : ''));
      if (tag) im.appendChild(ce('span', 'lkp-tg', tag));
      a.appendChild(im);
      a.appendChild(ce('h3', null, p.product_name || 'Untitled'));
      if (gallery) {
        var by = collectionsOf(p).filter(function (id) { return !artistById[id].is_hidden; }).map(function (id) { return artistById[id].name; });
        if (by.length) a.appendChild(ce('div', 'lkp-by', by.join(' & ')));
      }
      var row = ce('div', 'lkp-row');
      var n = Number(p.price), pr;
      if (sold) pr = ce('span', 'lkp-pr q', 'Found a home');
      else if (!p.is_quote_based && p.price != null && p.price !== '' && isFinite(n)) pr = ce('span', 'lkp-pr', fmtDollars(n));
      else pr = ce('span', 'lkp-pr q', p.price_note ? String(p.price_note) : 'Ask for a quote');
      row.appendChild(pr);
      var bits = [];
      if (gallery && p.medium) bits.push(String(p.medium).trim());
      if (gallery && p.dimensions) bits.push(String(p.dimensions).trim());
      var lead = p.lead_time ? String(p.lead_time).trim() : (p.turnaround_days ? p.turnaround_days + ' days' : '');
      if (!bits.length && lead && !sold) bits.push('Ready in ' + lead.replace(/^about /i, 'about '));
      if (bits.length) row.appendChild(ce('span', 'lkp-sz', bits.join(' · ')));
      a.appendChild(row);
      return a;
    }
    function render(reset) {
      var list = current();
      if (reset) { grid.innerHTML = ''; state.shown = 0; drawChips(); }
      cnt.textContent = list.length + (list.length === 1 ? ' piece' : ' pieces') + (gallery && byCollections ? ' · ' + shownArtists.length + (shownArtists.length === 1 ? ' artist' : ' artists') : '');
      if (!list.length) { grid.innerHTML = ''; grid.appendChild(ce('div', 'lkp-none', 'Nothing here yet.')); moreBtn.style.display = 'none'; return; }
      var end = Math.min(list.length, state.shown + (state.shown ? PAGE_MORE : PAGE_FIRST));
      if (!state.shown && list.length <= PAGE_FIRST + 2) end = list.length;
      var frag = document.createDocumentFragment();
      for (var k = state.shown; k < end; k++) frag.appendChild(card(list[k]));
      grid.appendChild(frag);
      state.shown = end;
      var left = list.length - end;
      moreBtn.style.display = left > 0 ? '' : 'none';
      moreBtn.textContent = 'Show ' + Math.min(left, PAGE_MORE) + ' more (' + end + ' of ' + list.length + ' shown)';
    }
    moreBtn.addEventListener('click', function () { render(false); });

    // phone filter sheet
    var sheetBg = null;
    function openSheet() {
      if (sheetBg) return;
      var pick = { group: state.group, sort: state.sort };
      sheetBg = ce('div', 'lkp-sheet-bg' + (MOBILE.matches ? '' : ' wide'));
      var sheet = ce('div', 'lkp-sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Filter and sort');
      sheet.appendChild(ce('div', 'lkp-grab'));
      var top = ce('div', 'lkp-st'); top.appendChild(ce('b', null, 'Filter and sort'));
      var x = ce('button'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.appendChild(svg(IC.close, 20)); x.addEventListener('click', closeSheet);
      top.appendChild(x); sheet.appendChild(top);
      sheet.appendChild(ce('div', 'lkp-shh', byCollections ? (gallery ? 'Artist' : 'Collection') : 'What are you looking for?'));
      var opts = [];
      function opt(label, n, g) {
        var b = ce('button', 'lkp-opt' + (pick.group === g ? ' on' : '')); b.type = 'button';
        b.appendChild(ce('span', null, label)); b.appendChild(ce('small', null, String(n))); b.appendChild(ce('i'));
        b.addEventListener('click', function () { pick.group = g; opts.forEach(function (o) { o.el.classList.toggle('on', o.g === g); }); updateGo(); });
        opts.push({ el: b, g: g }); sheet.appendChild(b);
      }
      opt(gallery && byCollections ? (G.label === 'makers' ? 'All makers' : 'All artists') : 'All pieces', products.length, '');
      groups.forEach(function (g) { opt(groupLabel(g), counts[g], g); });
      sheet.appendChild(ce('div', 'lkp-shh', 'Sort by'));
      var sorts = ce('div', 'lkp-sorts');
      var sortDefs = [['picks', 'Our picks first'], ['new', 'Newest']].concat(hasPrices ? [['low', 'Price, low to high']] : []).concat([['az', 'A to Z']]);
      sortDefs.forEach(function (d) {
        var b = ce('button', pick.sort === d[0] ? 'on' : '', d[1]); b.type = 'button';
        b.addEventListener('click', function () { pick.sort = d[0]; $all('button', sorts).forEach(function (o) { o.classList.toggle('on', o === b); }); });
        sorts.appendChild(b);
      });
      sheet.appendChild(sorts);
      var go = ce('button', 'lkp-cta'); go.type = 'button';
      function updateGo() { var n = pick.group ? counts[pick.group] : products.length; go.textContent = 'Show ' + n + (n === 1 ? ' piece' : ' pieces'); }
      updateGo();
      go.addEventListener('click', function () { state.group = pick.group; state.sort = pick.sort; closeSheet(); render(true); scrollToId('lkp-work'); });
      sheet.appendChild(go);
      sheetBg.appendChild(sheet);
      sheetBg.addEventListener('click', function (e) { if (e.target === sheetBg) closeSheet(); });
      document.addEventListener('keydown', escClose);
      document.body.appendChild(sheetBg);
      document.documentElement.style.overflow = 'hidden';
      x.focus();
    }
    function escClose(e) { if (e.key === 'Escape') closeSheet(); }
    function closeSheet() {
      if (!sheetBg) return;
      sheetBg.parentNode.removeChild(sheetBg); sheetBg = null;
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', escClose);
      fbtn.focus();
    }
    fbtn.addEventListener('click', openSheet);
    if (!products.length) { work.style.display = 'none'; }
    else render(true);

    // ===== book: services + availability, moved from the normal page =====
    var services = document.getElementById('vl-op-sec-services');
    var avail = document.getElementById('vl-op-sec-availability');
    var svcCount = services ? $all('#vl-services-grid > *', services).length : 0;
    var book = null;
    if ((services && svcCount && services.style.display !== 'none') || (avail && avail.style.display !== 'none')) {
      book = ce('section', 'lkp-sec'); book.id = 'lkp-book';
      var bh = ce('div', 'lkp-sh'); bh.appendChild(ce('h2', null, 'Book'));
      if (svcCount) bh.appendChild(ce('span', 'lkp-cnt', svcCount + (svcCount === 1 ? ' service' : ' services')));
      book.appendChild(bh);
      if (avail) book.appendChild(avail);
      if (services && svcCount) book.appendChild(services);
      wrap.appendChild(book);
    }

    // ===== reviews: moved up, right after the work =====
    var reviews = document.getElementById('vl-op-sec-reviews');
    var revSec = null;
    if (reviews) {
      revSec = ce('section', 'lkp-sec'); revSec.id = 'lkp-reviews';
      var rh = ce('div', 'lkp-sh'); rh.appendChild(ce('h2', null, 'What neighbors say'));
      revSec.appendChild(rh);
      revSec.appendChild(reviews);
      wrap.appendChild(revSec);
      var syncRec = function () {
        var n = $all('.vl-rev', reviews).filter(function (r) { return r.offsetParent !== null || r.getClientRects().length; }).length;
        if (n > 0) { rec.textContent = ''; rec.appendChild(svg(IC.heart, 14)); rec.appendChild(document.createTextNode(' Recommended by ' + n + (n === 1 ? ' neighbor' : ' neighbors'))); rec.style.display = ''; }
      };
      syncRec(); new MutationObserver(syncRec).observe(reviews, { childList: true, subtree: true });
    }

    // ===== about + contact =====
    var about = ce('section', 'lkp-sec'); about.id = 'lkp-about';
    var ah = ce('div', 'lkp-sh'); ah.appendChild(ce('h2', null, 'About ' + name)); about.appendChild(ah);
    var grid2 = ce('div', 'lkp-about'); about.appendChild(grid2);
    var left = ce('div'); grid2.appendChild(left);
    var inside = slides.slice(1, 4).map(function (ph) { return ph.u; });
    if (inside.length === 3) {
      var ins = ce('div', 'lkp-inside');
      inside.forEach(function (u) { var d = ce('div'); var im = ce('img'); im.alt = ''; im.loading = 'lazy'; setImg(im, u, 800); d.appendChild(im); ins.appendChild(d); });
      left.appendChild(ins);
    }
    var desc = String(v.business_description || '').trim();
    if (desc) left.appendChild(ce('div', 'lkp-story', desc.replace(/\n{3,}/g, '\n\n')));
    var bio = String(v.owner_bio || '').trim();
    if (owner || bio) {
      var ow = ce('div', 'lkp-owner');
      ow.appendChild(avatar(v.owner_photo, owner || name));
      var ot = ce('div');
      if (bio) ot.appendChild(ce('p', 'lkp-oq', bio));
      var whoLine = ce('div', 'lkp-ow', owner || name);
      if (owner) whoLine.appendChild(ce('span', null, ' · ' + name));
      ot.appendChild(whoLine);
      ow.appendChild(ot);
      left.appendChild(ow);
    }

    var cc = ce('div', 'lkp-card2');
    // wide screens: card in the side column, following the scroll; narrower screens
    // keep it in About (phones already have the follow-along Send a message bar)
    var narrow = window.matchMedia ? window.matchMedia('(max-width:959px)') : null;
    function placeCard() { (narrow && narrow.matches ? grid2 : side).appendChild(cc); }
    placeCard();
    if (narrow) { if (narrow.addEventListener) narrow.addEventListener('change', placeCard); else if (narrow.addListener) narrow.addListener(placeCard); }
    var who = ce('div', 'lkp-who');
    who.appendChild(avatar(v.owner_photo || v.profile_photo, owner || name));
    var wt = ce('div');
    wt.appendChild(ce('div', 'lkp-wn', owner ? 'Talk to ' + owner : 'Get in touch'));
    var langs = String(v.owner_languages || '').trim();
    var wrBits = []; if (owner) wrBits.push(name); if (langs) wrBits.push('Speaks ' + langs.replace(/,\s*([^,]+)$/, ' and $1'));
    if (wrBits.length) wt.appendChild(ce('div', 'lkp-wr', wrBits.join(' · ')));
    who.appendChild(wt); cc.appendChild(who);
    var cta = ce('button', 'lkp-cta', ctaWord); cta.type = 'button';
    cta.addEventListener('click', function () { proxyClick('lok-inq-btn'); });
    cc.appendChild(cta);
    var leads = {}; products.forEach(function (p) { var l = String(p.lead_time || '').trim(); if (l) leads[l] = (leads[l] || 0) + 1; });
    var topLead = Object.keys(leads).sort(function (a, b) { return leads[b] - leads[a]; })[0];
    if (topLead && leads[topLead] > products.length / 2) cc.appendChild(ce('p', 'lkp-hint', 'Most pieces are ready in ' + topLead.charAt(0).toLowerCase() + topLead.slice(1) + '.'));
    else cc.appendChild(ce('div', null)).style.height = '12px';
    var ways = ce('div', 'lkp-ways');
    [['vl-ch-sms', 'Text', IC.text], ['vl-ch-whatsapp', 'WhatsApp', IC.wa], ['vl-ch-call', 'Call', IC.call], ['vl-ch-email', 'Email', IC.mail]].forEach(function (w) {
      var real = document.getElementById(w[0]);
      if (!real || !real.getAttribute('href') || real.style.display === 'none') return;
      var b = ce('button'); b.type = 'button'; b.appendChild(svg(w[2], 20)); b.appendChild(document.createTextNode(w[1]));
      b.addEventListener('click', function () { real.click(); });
      ways.appendChild(b);
    });
    if (ways.children.length) { ways.style.gridTemplateColumns = 'repeat(' + ways.children.length + ',minmax(0,1fr))'; cc.appendChild(ways); }
    if (areas.length) {
      var as = ce('div', 'lkp-cs');
      var ahh = ce('div', 'lkp-ch'); ahh.appendChild(svg(IC.pin, 16)); ahh.appendChild(document.createTextNode(owner ? 'Where ' + owner + ' serves' : 'Where they serve')); as.appendChild(ahh);
      var al = ce('div', 'lkp-areas');
      areas.forEach(function (a, i) {
        var s = ce('span', i === 0 ? 'home' : '', a);
        if (i === 0 && areas.length > 1) s.appendChild(ce('small', null, 'based here'));
        al.appendChild(s);
      });
      as.appendChild(al); cc.appendChild(as);
    }
    var paySec = ce('div', 'lkp-cs');
    paySec.style.display = 'none'; cc.appendChild(paySec);
    var linkSec = ce('div', 'lkp-cs'); linkSec.style.display = 'none';
    var links = ce('div', 'lkp-links'); linkSec.appendChild(links); cc.appendChild(linkSec);
    $all('#vl-links-row a').forEach(function (a) {
      if (!a.getAttribute('href') || a.style.display === 'none' || a.id === 'vl-ig') return;
      var p = ce('a'); p.href = a.href; p.target = '_blank'; p.rel = 'noopener';
      p.appendChild(svg(IC.link, 16)); p.appendChild(document.createTextNode((a.textContent || 'Website').trim() || 'Website'));
      p.addEventListener('click', function (e) { e.preventDefault(); a.click(); });
      links.appendChild(p); linkSec.style.display = '';
    });
    var shareBox = ce('div', 'lkp-share'); cc.appendChild(shareBox);
    var small = [];
    if (v.is_verified) small.push('Verified person');
    if (v.is_founding_member) small.push('Founding vendor');
    if (v.created_at) { var yr = new Date(v.created_at).getFullYear(); if (yr) small.push('On Lokali since ' + yr); }
    if (small.length) cc.appendChild(ce('div', 'lkp-small', small.join(' · ')));
    wrap.appendChild(about);

    // late arrivals from other scripts: payment links + share button
    var tries = 0;
    (function adopt() {
      var pay = document.getElementById('lok-pay-links');
      if (pay && pay.parentNode !== paySec) {
        paySec.appendChild(pay); paySec.style.display = '';
      }
      var share = document.getElementById('lokali-share-detail');
      if (share && share.parentNode !== shareBox && share.children.length) shareBox.appendChild(share);
      if (++tries < 40 && (!pay || !share || !share.children.length)) setTimeout(adopt, 250);
    })();

    // ===== neighbor pairing stays last =====
    var pair = document.getElementById('vl-pair-sec');
    if (pair) wrap.appendChild(pair);
    wrap.appendChild(ce('div')).style.height = '60px';

    // ===== tabs (only for sections that exist) =====
    if (products.length) addTab(gallery ? 'Art' : 'Work', 'lkp-work');
    if (book) addTab('Book', 'lkp-book');
    if (revSec) addTab('Reviews', 'lkp-reviews');
    addTab('About', 'lkp-about');
    bw.appendChild(sp);
    bw.appendChild(barMsg);
    function spy() {
      var y = window.pageYOffset + 120, curT = tabsSpec[0];
      tabsSpec.forEach(function (t) {
        var el = document.getElementById(t.getAttribute('data-for'));
        if (el && el.getBoundingClientRect().top + window.pageYOffset <= y) curT = t;
      });
      tabsSpec.forEach(function (t) { t.classList.toggle('on', t === curT); });
    }
    window.addEventListener('scroll', spy, { passive: true }); spy();

    document.documentElement.classList.add('lkp-on');
  }
})();
