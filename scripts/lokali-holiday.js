/* lokali-holiday.js \u2014 the holiday gift page (F 2026-11-11 "build the form and the holiday page").
 *
 * ONE Webflow page, /holiday, with a mount <div id="lokali-holiday">. Two views:
 *   /holiday          shoppers: approved gifts from live storefronts, soonest order-by date first,
 *                     each card opens the vendor's storefront (the order happens with the vendor).
 *   /holiday?add=1    vendors: the "Add my gift" form. Only the storefront itself can add a
 *                     gift (SEC-123, 2026-11-12): the button in F's invitation email carries
 *                     a personal key in the URL fragment (#k=...), read once and removed from
 *                     the address bar; without it the vendor signs in. The form never sends a
 *                     storefront id: the server reads it from the key or the session.
 *
 * Data: /api/lokali/holiday-gift on lokali-api (GET feed; POST {who:true} names the storefront; POST the form).
 * Nothing a vendor submits is public until F approves it from her alert email. No Supabase
 * client and no sign-in needed here, so this file has no dependency on the other scripts.
 * Colors (F 2026-11-11: "make the holiday page green and red too"): evergreen #1F5B3A + berry
 * #B3263E on a soft green-white ground, for this page only; the site chrome around it stays violet.
 * Mockups: docs/mockups/this-week-and-holiday-pages-2026-11-11.html (screen 3) and
 * docs/mockups/holiday-gift-form-2026-11-11.html.
 */
(function () {
  'use strict';
  if (!/^\/holiday(\/|$)/.test(String(window.location.pathname || ''))) return;

  var ENDPOINT = (function () {
    var base = window.LOKALI_VERCEL_API_BASE ||
      (window.LOKALI_AUTH_SYNC_URL ? String(window.LOKALI_AUTH_SYNC_URL).replace(/\/(auth-sync|clerk-sync)\/?$/, '') : '');
    if (base) return base.replace(/\/$/, '') + '/holiday-gift';
    return 'https://lokali-api.vercel.app/api/lokali/holiday-gift';
  })();
  var LAST_DAY = '2026-12-24';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var KIND_HINT = { product: 'Holiday candle trio, boxed', gift_card: '$50 gift card', session: 'Spa afternoon for four' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function initials(n) { return String(n || '?').replace(/^The\s+/i, '').split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase() || '?'; }
  function shortDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) : ''; }
  function money(cents) { var d = cents / 100; return '$' + (d % 1 === 0 ? String(d) : d.toFixed(2)); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  // The personal key from the email button. Kept in memory only; the fragment is cleared so
  // it is not left in the address bar, the history entry or a copied link.
  var GIFT_KEY = (function () {
    try {
      var m = /(?:^#|&)k=([A-Za-z0-9_\-.%]{20,300})(?:&|$)/.exec(String(window.location.hash || ''));
      if (!m) return '';
      var k = decodeURIComponent(m[1]);
      if (window.history && history.replaceState) history.replaceState(null, '', window.location.pathname + window.location.search);
      return /^[A-Za-z0-9_\-.]{20,300}$/.test(k) ? k : '';
    } catch (e) { return ''; }
  })();
  function isAdd() { try { return !!GIFT_KEY || new URLSearchParams(window.location.search).has('add') || window.location.hash === '#add'; } catch (e) { return false; } }

  /* Festive, for every tradition (F 2026-11-11: "pretty, festive, open to all faiths"): winter
   * greenery colors, gold sparkles, snow and a wrapped-gift ribbon. No symbol of any one holiday. */
  /* ICONS are taken as published, never redrawn (F 2026-11-11: "I want it to look precise"):
   *   check, tag, snowflake      = Font Awesome Free 7.3.1 solid (fontawesome.com/license/free, icons CC BY 4.0)
   *   four-point sparkle         = Phosphor Icons 2.1.1 "star-four" fill (MIT)
   *   (the gold bow of 11-11 was replaced by the hero photo on 2026-11-13) */
  var IC = {
    check: ['0 0 448 512', 'M434.8 70.1c14.3 10.4 17.5 30.4 7.1 44.7l-256 352c-5.5 7.6-14 12.3-23.4 13.1s-18.5-2.7-25.1-9.3l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l101.5 101.5 234-321.7c10.4-14.3 30.4-17.5 44.7-7.1z'],
    tag: ['0 0 512 512', 'M32.5 96l0 149.5c0 17 6.7 33.3 18.7 45.3l192 192c25 25 65.5 25 90.5 0L483.2 333.3c25-25 25-65.5 0-90.5l-192-192C279.2 38.7 263 32 246 32L96.5 32c-35.3 0-64 28.7-64 64zm112 16a32 32 0 1 1 0 64 32 32 0 1 1 0-64z'],
    snow: ['0 0 512 512', 'M288.2 0c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 62.1-15-15c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l49 49 0 70.6-61.2-35.3-17.9-66.9c-3.4-12.8-16.6-20.4-29.4-17S95.3 98 98.7 110.8l5.5 20.5-53.7-31C35.2 91.5 15.6 96.7 6.8 112s-3.6 34.9 11.7 43.7l53.7 31-20.5 5.5c-12.8 3.4-20.4 16.6-17 29.4s16.6 20.4 29.4 17l66.9-17.9 61.2 35.3-61.2 35.3-66.9-17.9c-12.8-3.4-26 4.2-29.4 17s4.2 26 17 29.4l20.5 5.5-53.7 31C3.2 365.1-2 384.7 6.8 400s28.4 20.6 43.7 11.7l53.7-31-5.5 20.5c-3.4 12.8 4.2 26 17 29.4s26-4.2 29.4-17l17.9-66.9 61.2-35.3 0 70.6-49 49c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l15-15 0 62.1c0 17.7 14.3 32 32 32s32-14.3 32-32l0-62.1 15 15c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-49-49 0-70.6 61.2 35.3 17.9 66.9c3.4 12.8 16.6 20.4 29.4 17s20.4-16.6 17-29.4l-5.5-20.5 53.7 31c15.3 8.8 34.9 3.6 43.7-11.7s3.6-34.9-11.7-43.7l-53.7-31 20.5-5.5c12.8-3.4 20.4-16.6 17-29.4s-16.6-20.4-29.4-17l-66.9 17.9-61.2-35.3 61.2-35.3 66.9 17.9c12.8 3.4 26-4.2 29.4-17s-4.2-26-17-29.4l-20.5-5.5 53.7-31c15.3-8.8 20.6-28.4 11.7-43.7s-28.4-20.5-43.7-11.7l-53.7 31 5.5-20.5c3.4-12.8-4.2-26-17-29.4s-26 4.2-29.4 17l-17.9 66.9-61.2 35.3 0-70.6 49-49c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-15 15 0-62.1z'],
    star: ['0 0 256 256', 'M240,128a15.79,15.79,0,0,1-10.5,15l-63.44,23.07L143,229.5a16,16,0,0,1-30,0L89.94,166.06,26.5,143a16,16,0,0,1,0-30L89.94,89.94,113,26.5a16,16,0,0,1,30,0l23.07,63.44L229.5,113A15.79,15.79,0,0,1,240,128Z']
  };
  function ic(name) { return '<svg class="lkh-ic" viewBox="' + IC[name][0] + '" aria-hidden="true"><path fill="currentColor" d="' + IC[name][1] + '"/></svg>'; }
  /* Background tile: gold sparkles and pale snowflakes, placed from the same published shapes. */
  var SPARKLE = (function () {
    function at(name, x, y, size, fill, op) {
      var k = size / parseFloat(IC[name][0].split(' ')[2]);
      return "<path transform='translate(" + x + ' ' + y + ') scale(' + k.toFixed(4) + ")' fill='" + fill + "' fill-opacity='" + op + "' d='" + IC[name][1] + "'/>";
    }
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='260' height='150'>" +
      at('star', 16, 10, 26, '#F2C860', 1) + at('star', 188, 88, 16, '#F2C860', 1) + at('star', 112, 14, 11, '#F2C860', 1) + at('star', 64, 118, 10, '#F2C860', .9) +
      at('snow', 74, 62, 11, '#ffffff', .6) + at('snow', 154, 34, 9, '#ffffff', .55) + at('snow', 224, 22, 12, '#ffffff', .6) + at('snow', 14, 104, 9, '#ffffff', .5) + at('snow', 126, 114, 11, '#ffffff', .55) + at('snow', 236, 124, 8, '#ffffff', .5) +
      '</svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  })();
  // Hero photo (F 2026-11-13: "make the holiday page also have that picture like we did in the
  // email"): the same Unsplash free-licence photo (Mel Poole) as the invitation, pinned to the
  // commit that added it. The words sit on the photo's upper part (the dark green wall) as REAL
  // text over a soft shade, so they stay readable, selectable and translatable. The gold bow
  // and ribbon are gone: the photo has its own. The form view (narrow wrap) uses a short strip
  // of the same photo so the form is not pushed down the page.
  var HERO_IMG = 'https://cdn.jsdelivr.net/gh/franchi17/lokali-webflow-scripts@d652be3252f8c0cdf14e8cb23044cfcfc65b88a4/assets/holiday-page-hero.jpg';
  function hero(eyebrow, title, lede) {
    return '<div class="lkh-hero">' + '<span class="lkh-eyebrow">' + eyebrow + '</span><h1>' + title + '</h1><p class="lkh-lede">' + lede + '</p></div>';
  }

  var styled = false;
  function css() {
    if (styled) return; styled = true;
    if (!document.querySelector('link[href*="Plus+Jakarta+Sans"]')) {
      var l = document.createElement('link'); l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(l);
    }
    var s = document.createElement('style');
    s.textContent = [
      '.lkh,.lkh *{box-sizing:border-box;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;}',
      '.lkh{background:#F5FAF6;color:#4A4761;font-size:16px;line-height:1.55;padding:44px 16px 64px;}',
      '.lkh-wrap{max-width:960px;margin:0 auto;}',
      '.lkh-wrap.narrow{max-width:880px;}',
      '.lkh-eyebrow{display:block;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#1F5B3A;margin:0 0 8px;}',
      '.lkh h1{font-size:34px;line-height:1.15;font-weight:800;color:#1A1829;letter-spacing:-.02em;margin:0 0 10px;}',
      '.lkh-lede{max-width:56ch;margin:0 0 26px;}',
      '.lkh-hero{position:relative;overflow:hidden;border-radius:24px;background:#22483B url(' + HERO_IMG + ') center bottom/cover no-repeat;color:#fff;padding:40px 36px 0;margin:0 0 26px;height:clamp(380px,60vw,580px);}',
      '.lkh-hero::before{content:"";position:absolute;left:0;right:0;top:0;height:62%;background:linear-gradient(180deg,rgba(18,48,36,.78),rgba(18,48,36,0));}',
      '.lkh-hero > *{position:relative;}',
      '.lkh-wrap.narrow .lkh-hero{height:auto;padding:36px 44% 34px 36px;background:linear-gradient(90deg,#1F5B3A 0%,rgba(31,91,58,.97) 44%,rgba(31,91,58,0) 72%),#22483B url(' + HERO_IMG + ') right 78%/cover no-repeat;}',
      '.lkh-wrap.narrow .lkh-hero::before{display:none;}',
      '.lkh-hero .lkh-eyebrow{color:#F2C860;}',
      '.lkh .lkh-hero h1{color:#fff;font-size:40px;}',
      '.lkh-hero .lkh-lede{color:#E9F4EC;margin:0;font-size:17px;}',
      '.lkh-hero .lkh-link{color:#F2C860;}',
      '.lkh-ic{width:1em;height:1em;flex:none;display:inline-block;vertical-align:-.125em;}',
      '.lkh-sub{display:flex;align-items:center;gap:12px;margin:6px 0 16px;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#1F5B3A;}',
      '.lkh-sub::before,.lkh-sub::after{content:"";flex:1;height:1px;background:#CFE0D5;}',
      '.lkh-sub .lkh-ic{color:#D9A534;font-size:14px;}',
      '.lkh-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px;}',
      '.lkh-chip{font-size:14px;font-weight:600;padding:9px 16px;border-radius:999px;border:1px solid #D3E3D9;background:#fff;color:#4A4761;cursor:pointer;min-height:40px;}',
      '.lkh-chip[aria-pressed="true"]{background:#1F5B3A;border-color:#1F5B3A;color:#fff;}',
      '.lkh-chip:focus-visible,.lkh-btn:focus-visible,.lkh-gift:focus-visible,.lkh-opt:focus-visible{outline:3px solid #8FBFA4;outline-offset:2px;}',
      '.lkh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;}',
      '.lkh-gift{display:flex;flex-direction:column;background:#fff;border:1px solid #D3E3D9;border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;min-width:0;transition:border-color .15s,transform .15s;}',
      'a.lkh-gift:hover{border-color:#8FBFA4;transform:translateY(-2px);}',
      '.lkh-ph{position:relative;aspect-ratio:4/3;background:' + SPARKLE + ' 0 0/200px 115px,#DDEDE3;display:flex;align-items:center;justify-content:center;color:#1F5B3A;font-weight:800;font-size:34px;overflow:hidden;}',
      '.lkh-ph img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.lkh-gb{padding:14px 16px 16px;display:flex;flex-direction:column;gap:4px;flex:1;}',
      '.lkh-who{font-size:13px;color:#6B6880;overflow-wrap:anywhere;}',
      '.lkh-title{font-size:16px;font-weight:700;color:#1A1829;overflow-wrap:anywhere;}',
      '.lkh-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:10px;}',
      '.lkh-price{font-weight:700;color:#1A1829;font-variant-numeric:tabular-nums;}',
      '.lkh-pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:5px 11px 5px 9px;border-radius:999px;background:#FBF0D2;color:#7A5A0C;white-space:nowrap;}',
      '.lkh-gift{box-shadow:0 1px 0 rgba(31,91,58,.04);}',
      'a.lkh-gift:hover{box-shadow:0 12px 28px rgba(31,91,58,.14);}',
      '.lkh-gift .lkh-ph::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:#F2C860;}',
      '.lkh-pill.soon{background:#B3263E;color:#fff;}',
      '.lkh-ghost{color:#6B6880;font-weight:500;}',
      '.lkh-band{background:#FBF3DF;border:1px solid #F0E2B8;border-radius:16px;padding:20px 22px;display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;justify-content:space-between;margin-top:28px;}',
      '.lkh-band p{margin:0;flex:1 1 260px;min-width:0;color:#1A1829;font-weight:700;}',
      '.lkh-band p span{display:block;font-weight:400;color:#4A4761;font-size:15px;}',
      '.lkh-btn{display:inline-block;font-size:15px;font-weight:700;padding:13px 22px;border-radius:999px;border:1px solid #1F5B3A;background:#1F5B3A;color:#fff;text-decoration:none;cursor:pointer;white-space:nowrap;}',
      '.lkh-btn.ghost{background:#fff;color:#1F5B3A;}',
      '.lkh-btn[disabled]{opacity:.6;cursor:default;}',
      '.lkh-empty{background:#fff;border:1px solid #D3E3D9;border-radius:16px;padding:32px 24px;text-align:center;}',
      '.lkh-empty h2{font-size:22px;font-weight:800;color:#1A1829;margin:0 0 8px;}',
      '.lkh-empty p{margin:0 auto 18px;max-width:46ch;}',
      '.lkh-empty .lkh-btn{margin:4px;}',
      '.lkh-fine{font-size:14px;color:#6B6880;margin:22px 0 0;}',
      '.lkh-fine a,.lkh-link{color:#1F5B3A;font-weight:700;}',
      /* form view */
      '.lkh-card{background:#fff;border:1px solid #D3E3D9;border-radius:20px;padding:28px 26px;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:32px;align-items:start;}',
      '.lkh-form{display:flex;flex-direction:column;gap:18px;min-width:0;}',
      '.lkh-field{display:flex;flex-direction:column;gap:6px;position:relative;}',
      '.lkh-field label,.lkh-lab{font-weight:700;color:#1A1829;font-size:15px;}',
      '.lkh-field small{font-size:13px;color:#6B6880;}',
      '.lkh input[type=text],.lkh input[type=date]{font-size:16px;font-weight:500;color:#1A1829;background:#fff;border:1px solid #D3E3D9;border-radius:12px;padding:12px 14px;width:100%;min-height:48px;margin:0;}',
      '.lkh input[type=text]:focus,.lkh input[type=date]:focus{outline:3px solid #8FBFA4;outline-offset:1px;border-color:#1F5B3A;}',
      '.lkh-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;}',
      '.lkh-pricebox{position:relative;}',
      '.lkh-pricebox span{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#6B6880;font-weight:600;}',
      '.lkh .lkh-pricebox input{padding-left:28px;}',
      '.lkh-list{position:absolute;top:100%;left:0;right:0;margin-top:6px;background:#fff;border:1px solid #D3E3D9;border-radius:14px;padding:6px;z-index:20;box-shadow:0 10px 30px rgba(31,91,58,.14);display:flex;flex-direction:column;max-height:280px;overflow-y:auto;}',
      '.lkh-opt{display:flex;gap:10px;align-items:center;padding:10px;border-radius:10px;border:0;background:none;font-size:15px;font-weight:600;color:#1A1829;text-align:left;cursor:pointer;width:100%;}',
      '.lkh-opt:hover,.lkh-opt.on{background:#E3F1E8;}',
      '.lkh-opt i,.lkh-who i{width:30px;height:30px;border-radius:9px;background:#E3F1E8;color:#1F5B3A;font-style:normal;font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center;flex:none;}',
      '.lkh-opt.on i,.lkh-opt:hover i{background:#fff;}',
      '.lkh-opt mark{background:none;color:#1F5B3A;font-weight:800;padding:0;}',
      '.lkh-none{padding:10px;font-size:14px;color:#6B6880;}',
      '.lkh-picked{font-size:14px;color:#1F5B3A;font-weight:700;}',
      '.lkh-err{color:#B3263E;font-size:14px;font-weight:600;}',
      '.lkh-note{font-size:14px;color:#6B6880;margin:0;}',
      '.lkh-side{display:flex;flex-direction:column;gap:10px;min-width:0;position:sticky;top:96px;}',
      '.lkh-side .lkh-who{display:flex;gap:10px;align-items:center;}',
      '.lkh-done{background:#E3F1E8;border-radius:16px;padding:26px 24px;}',
      '.lkh-done h2{font-size:24px;font-weight:800;color:#1A1829;margin:0 0 8px;}',
      '.lkh-done p{margin:0 0 16px;max-width:52ch;}',
      '.lkh-done .lkh-btn{margin:0 8px 8px 0;}',
      '.lkh-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;}',
      '.lkh [hidden]{display:none!important;}',
      '@media (max-width:720px){.lkh{padding:28px 16px 48px;}.lkh h1{font-size:27px;}.lkh .lkh-hero h1{font-size:28px;}.lkh-hero{padding:26px 22px 0;border-radius:20px;height:auto;aspect-ratio:1/1;}.lkh-wrap:not(.narrow) .lkh-hero .lkh-lede{display:none;}.lkh-wrap.narrow .lkh-hero{aspect-ratio:auto;padding:26px 22px 26px;background:linear-gradient(180deg,rgba(31,91,58,.97) 0%,rgba(31,91,58,.9) 55%,rgba(31,91,58,.5) 100%),#22483B url(' + HERO_IMG + ') center bottom/cover no-repeat;}.lkh-sub{letter-spacing:.06em;font-size:12px;}.lkh-card{grid-template-columns:1fr;padding:22px 18px;gap:24px;}.lkh-side{position:static;}.lkh-two{grid-template-columns:1fr;}.lkh-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;}}',
      '@media (prefers-reduced-motion:reduce){.lkh-gift{transition:none;}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ---------- shopper view ---------- */
  var FILTERS = [
    { k: 'all', label: 'All gifts', test: function () { return true; } },
    { k: 'product', label: 'Things to wrap', test: function (g) { return g.kind === 'product'; } },
    { k: 'gift_card', label: 'Gift cards', test: function (g) { return g.kind === 'gift_card'; } },
    { k: 'session', label: 'Something to do', test: function (g) { return g.kind === 'session'; } },
    { k: 'u25', label: 'Under $25', test: function (g) { return g.price_cents < 2500; } }
  ];

  function giftCard(g) {
    var v = g.vendor || {};
    var days = Math.round((Date.parse(g.order_by + 'T00:00:00') - Date.parse(todayIso() + 'T00:00:00')) / 86400000);
    var soon = days <= 3;
    var when = days <= 0 ? 'Order today' : 'Order by ' + shortDate(g.order_by);
    var ph = v.photo ? '<img src="' + esc(v.photo) + '" alt="" loading="lazy">' : esc(initials(v.name));
    return '<a class="lkh-gift" href="/' + encodeURIComponent(v.slug || '') + '">' +
      '<span class="lkh-ph">' + ph + '</span>' +
      '<span class="lkh-gb"><span class="lkh-who">' + esc(v.name) + '</span>' +
      '<span class="lkh-title">' + esc(g.title) + '</span>' +
      '<span class="lkh-meta"><span class="lkh-price">' + esc(money(g.price_cents)) + '</span>' +
      '<span class="lkh-pill' + (soon ? ' soon' : '') + '">' + ic('tag') + esc(when) + '</span></span></span></a>';
  }

  function renderShop(mount, gifts) {
    var head = hero('Holiday 2026 \u00b7 The Woodlands and nearby', 'Gifts from your neighbors',
      'Made, baked and booked a few streets from you, for every table and every tradition this season.');
    var foot = '<p class="lkh-fine">Sell locally? <a href="/holiday?add=1">Add your gift</a>. It\'s free.</p>';
    if (!gifts.length) {
      mount.innerHTML = '<div class="lkh"><div class="lkh-wrap">' + head +
        '<div class="lkh-empty"><h2>The gifts are on their way</h2>' +
        '<p>Vendors are adding theirs this week. Until then, meet everyone on The Market.</p>' +
        '<a class="lkh-btn" href="/the-market">Browse The Market</a><a class="lkh-btn ghost" href="/holiday?add=1">I\'m a vendor, add my gift</a></div>' +
        '</div></div>';
      return;
    }
    var used = FILTERS.filter(function (f) { return f.k === 'all' || gifts.some(f.test); });
    var chips = used.length > 2 ? '<div class="lkh-chips" role="group" aria-label="Filter gifts">' + used.map(function (f, i) {
      return '<button type="button" class="lkh-chip" data-f="' + f.k + '" aria-pressed="' + (i === 0 ? 'true' : 'false') + '">' + esc(f.label) + '</button>';
    }).join('') + '</div>' : '';
    mount.innerHTML = '<div class="lkh"><div class="lkh-wrap">' + head + chips +
      '<div class="lkh-sub">' + ic('star') + 'Sorted by the last day to order' + ic('star') + '</div><div class="lkh-grid" id="lkh-grid"></div>' +
      '<div class="lkh-band"><p>Not sure what to get?<span>Tell us who it\'s for and your budget. A real person replies with two or three neighbors.</span></p>' +
      '<a class="lkh-btn" href="/contact-us">Ask a neighbor</a></div>' + foot + '</div></div>';
    var grid = document.getElementById('lkh-grid');
    function draw(k) {
      var f = FILTERS.filter(function (x) { return x.k === k; })[0] || FILTERS[0];
      grid.innerHTML = gifts.filter(f.test).map(giftCard).join('');
    }
    draw('all');
    var box = mount.querySelector('.lkh-chips');
    if (box) box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.lkh-chip') : null; if (!b) return;
      Array.prototype.forEach.call(box.querySelectorAll('.lkh-chip'), function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
      draw(b.getAttribute('data-f'));
    });
  }

  function bootShop(mount) {
    fetch(ENDPOINT, { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : { gifts: [] }; })
      .then(function (d) {
        var gifts = (d && Array.isArray(d.gifts)) ? d.gifts.filter(function (g) { return g && g.vendor && g.vendor.slug && g.title && g.order_by; }) : [];
        renderShop(mount, gifts);
      })
      .catch(function () { renderShop(mount, []); });
  }

  /* ---------- vendor form ---------- */
  function authToken() { try { var A = window.LokaliAuth; return (A && A.token && A.token()) || ''; } catch (e) { return ''; } }
  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var t = GIFT_KEY ? '' : authToken();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }
  function gate(mount, title, text, btnLabel, btnHref) {
    mount.innerHTML = '<div class="lkh"><div class="lkh-wrap narrow">' +
      hero('Holiday 2026 \u00b7 for Lokali vendors', 'Add your gift to the holiday page', 'One gift, one minute. <a class="lkh-link" href="/holiday">See the page</a>') +
      '<div class="lkh-empty"><h2 id="lkh-gate-h"></h2><p id="lkh-gate-p"></p>' +
      (btnLabel ? '<div><a class="lkh-btn" id="lkh-gate-b"></a></div>' : '') + '</div></div></div>';
    document.getElementById('lkh-gate-h').textContent = title;
    document.getElementById('lkh-gate-p').textContent = text;
    if (btnLabel) { var b = document.getElementById('lkh-gate-b'); b.textContent = btnLabel; b.href = btnHref; }
  }
  function askWho() {
    return fetch(ENDPOINT, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ who: true, k: GIFT_KEY || undefined }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, d: d || {} }; }); });
  }
  function bootForm(mount) {
    if (todayIso() > LAST_DAY) { renderForm(mount, null); return; }
    gate(mount, 'One moment\u2026', 'Finding your storefront.');
    var A = window.LokaliAuth;
    var known = (!GIFT_KEY && A && A.ready && typeof A.ready.then === 'function') ? A.ready : Promise.resolve();
    var go = function () {
      if (!GIFT_KEY && !authToken()) {
        gate(mount, 'Sign in to add your gift', 'Use the \u201cAdd my gift\u201d button in Francesca\u2019s email, or sign in to your Lokali storefront and come back to this page.', 'Sign in', '/login');
        window.addEventListener('lokali:authed', function () { bootForm(mount); }, { once: true });
        return;
      }
      askWho().then(function (res) {
        var name = res.d && res.d.vendor && res.d.vendor.name;
        if (res.status === 200 && res.d.ok === true && name) { renderForm(mount, { name: String(name) }); return; }
        var why = res.d && res.d.error;
        if (why === 'not_live') gate(mount, 'Your storefront isn\u2019t live yet', 'Finish your storefront first, then come back to add your gift.', 'Open my dashboard', '/vendor-dashboard');
        else if (why === 'rate_limited') gate(mount, 'Please try again in a little while', 'That was a lot of tries in a short time.');
        else if (GIFT_KEY) gate(mount, 'This link didn\u2019t work', 'Open the \u201cAdd my gift\u201d button in Francesca\u2019s email again, or sign in to your storefront.', 'Sign in', '/login');
        else gate(mount, 'We couldn\u2019t find a storefront on this account', 'Only Lokali storefronts can add a gift. Sign in with your storefront\u2019s account, or reply to Francesca\u2019s email.', 'Browse The Market', '/the-market');
      }).catch(function () { gate(mount, 'That didn\u2019t load', 'Check your connection and open the page again.'); });
    };
    known.then(go, go);
  }
  function renderForm(mount, who) {
    var today = todayIso();
    var closed = today > LAST_DAY;
    if (closed) {
      mount.innerHTML = '<div class="lkh"><div class="lkh-wrap narrow">' + hero('Holiday 2026', 'The holiday page is closed for this year', 'Thank you to everyone who added a gift. See you next season.') + '<a class="lkh-btn" href="/the-market">Browse The Market</a></div></div>';
      return;
    }
    var defDate = today < '2026-12-15' ? '2026-12-15' : LAST_DAY;
    mount.innerHTML = '<div class="lkh"><div class="lkh-wrap narrow">' +
      hero('Holiday 2026 \u00b7 for Lokali vendors', 'Add your gift to the holiday page',
        'One gift, one minute. It\'s free, and it\'s up to you. <a class="lkh-link" href="/holiday">See the page</a>') +
      '<div class="lkh-card" id="lkh-card">' +
      '<form class="lkh-form" id="lkh-form" novalidate autocomplete="off">' +
        '<div class="lkh-field"><label for="lkh-name">Your business</label>' +
          '<input type="text" id="lkh-name" readonly aria-readonly="true" value="">' +
          '<div class="lkh-picked" id="lkh-picked">' + ic('check') + ' This gift goes on your storefront</div></div>' +
        '<div class="lkh-field"><span class="lkh-lab" id="lkh-kind-lab">What kind of gift is it?</span>' +
          '<div class="lkh-chips" id="lkh-kind" role="group" aria-labelledby="lkh-kind-lab" style="margin:0">' +
            '<button type="button" class="lkh-chip" data-k="product" aria-pressed="true">A product</button>' +
            '<button type="button" class="lkh-chip" data-k="gift_card" aria-pressed="false">A gift card</button>' +
            '<button type="button" class="lkh-chip" data-k="session" aria-pressed="false">A booked session</button></div></div>' +
        '<div class="lkh-field"><label for="lkh-gift">The gift</label>' +
          '<input type="text" id="lkh-gift" maxlength="60" placeholder="' + esc(KIND_HINT.product) + '">' +
          '<small>A few words, the way you\'d say it at your table.</small></div>' +
        '<div class="lkh-two">' +
          '<div class="lkh-field"><label for="lkh-price">Price</label><div class="lkh-pricebox"><span>$</span><input type="text" id="lkh-price" inputmode="decimal" placeholder="58"></div></div>' +
          '<div class="lkh-field"><label for="lkh-date">Last day to order</label><input type="date" id="lkh-date" min="' + today + '" max="' + LAST_DAY + '" value="' + defDate + '"></div></div>' +
        '<p class="lkh-note">The photo comes from your storefront, so there\'s nothing to upload.</p>' +
        '<input class="lkh-hp" type="text" id="lkh-website" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<div class="lkh-err" id="lkh-err" hidden></div>' +
        '<div><button class="lkh-btn" id="lkh-send" type="submit">Add my gift</button></div>' +
      '</form>' +
      '<aside class="lkh-side" id="lkh-side"><span class="lkh-eyebrow" style="margin:0">How shoppers will see it</span>' +
        '<div class="lkh-gift"><span class="lkh-gb">' +
          '<span class="lkh-who"><i id="lkh-pv-i">?</i><span id="lkh-pv-who" class="lkh-ghost">Your business</span></span>' +
          '<span class="lkh-title lkh-ghost" id="lkh-pv-gift">Your gift</span>' +
          '<span class="lkh-meta"><span class="lkh-price" id="lkh-pv-amt">$ \u2014</span><span class="lkh-pill" id="lkh-pv-date"></span></span></span></div>' +
        '<p class="lkh-note">It fills in as you type. Your storefront photo is added on the page.</p></aside>' +
      '</div>' +
      '<div class="lkh-done" id="lkh-done" hidden><h2 id="lkh-done-h"></h2><p id="lkh-done-p"></p>' +
        '<button class="lkh-btn ghost" id="lkh-again" type="button">Add another gift</button><a class="lkh-btn" href="/holiday">See the holiday page</a></div>' +
      '</div></div>';

    function $(id) { return document.getElementById(id); }
    var nameIn = $('lkh-name');
    var picked = who, kind = 'product', sending = false;
    nameIn.value = who.name;

    $('lkh-kind').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.lkh-chip') : null; if (!b) return;
      kind = b.getAttribute('data-k');
      Array.prototype.forEach.call(this.querySelectorAll('.lkh-chip'), function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
      $('lkh-gift').placeholder = KIND_HINT[kind];
    });

    function priceVal() { return $('lkh-price').value.replace(/[$,\s]/g, ''); }
    function preview() {
      var g = $('lkh-gift').value.trim(), p = priceVal(), d = $('lkh-date').value;
      $('lkh-pv-who').textContent = picked ? picked.name : 'Your business';
      $('lkh-pv-who').className = picked ? '' : 'lkh-ghost';
      $('lkh-pv-i').textContent = picked ? initials(picked.name) : '?';
      $('lkh-pv-gift').textContent = g || 'Your gift';
      $('lkh-pv-gift').className = 'lkh-title' + (g ? '' : ' lkh-ghost');
      $('lkh-pv-amt').textContent = /^\d+(\.\d{1,2})?$/.test(p) ? '$' + p : '$ \u2014';
      $('lkh-pv-date').innerHTML = ic('tag') + esc(d ? 'Order by ' + shortDate(d) : 'Order by \u2026');
    }
    $('lkh-price').addEventListener('input', function () { var c = this.value.replace(/[^0-9.]/g, ''); if (c !== this.value) this.value = c; });
    ['lkh-gift', 'lkh-price', 'lkh-date'].forEach(function (id) { $(id).addEventListener('input', preview); });
    preview();

    var MSG = {
      link_required: 'This page lost track of your storefront. Open the button in Francesca\'s email again, or sign in.',
      not_live: 'Your storefront isn\'t live on Lokali yet. Finish it first, then add your gift.',
      invalid_title: 'Give the gift a short name, 2 to 60 characters.',
      invalid_price: 'Enter the price as a number, like 58 or 22.50.',
      invalid_date: 'Pick a last day to order between today and December 24.',
      too_many: 'This storefront already has three gifts on the list. Reply to Francesca\'s email to swap one.',
      rate_limited: 'That\'s a lot of tries in a short time. Please try again in an hour.'
    };
    function fail(msg) { var e = $('lkh-err'); e.textContent = msg; e.hidden = false; }

    $('lkh-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;
      $('lkh-err').hidden = true;
      var title = $('lkh-gift').value.trim().replace(/\s+/g, ' '), price = priceVal(), date = $('lkh-date').value;
      if (title.length < 2) { fail(MSG.invalid_title); $('lkh-gift').focus(); return; }
      if (!/^\d{1,4}(\.\d{1,2})?$/.test(price) || parseFloat(price) < 1) { fail(MSG.invalid_price); $('lkh-price').focus(); return; }
      if (!date || date < today || date > LAST_DAY) { fail(MSG.invalid_date); $('lkh-date').focus(); return; }
      sending = true;
      var btn = $('lkh-send'); btn.disabled = true; btn.textContent = 'Sending\u2026';
      function reset() { sending = false; btn.disabled = false; btn.textContent = 'Add my gift'; }
      fetch(ENDPOINT, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ k: GIFT_KEY || undefined, kind: kind, title: title, price: price, order_by: date, website: $('lkh-website').value })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          reset();
          if (!res.ok || !res.d || res.d.ok !== true) { fail(MSG[res.d && res.d.error] || 'That didn\'t go through. Please try again in a moment.'); return; }
          $('lkh-card').hidden = true;
          $('lkh-done-h').textContent = 'Thank you, ' + picked.name + '.';
          $('lkh-done-p').textContent = 'We have \u201c' + title + '\u201d. Francesca looks at every gift before it goes up, usually within a day. You\'ll get an email when it\'s on the holiday page.';
          $('lkh-done').hidden = false;
          try { $('lkh-done').scrollIntoView({ block: 'center' }); } catch (x) { /* older browsers */ }
        })
        .catch(function () { reset(); fail('That didn\'t go through. Check your connection and try again.'); });
    });
    $('lkh-again').addEventListener('click', function () {
      $('lkh-gift').value = ''; $('lkh-price').value = ''; preview();
      $('lkh-done').hidden = true; $('lkh-card').hidden = false; $('lkh-gift').focus();
    });
  }

  function boot() {
    var mount = document.getElementById('lokali-holiday');
    if (!mount || mount.getAttribute('data-lkh') === '1') return;
    mount.setAttribute('data-lkh', '1');
    css();
    if (isAdd()) bootForm(mount); else bootShop(mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
