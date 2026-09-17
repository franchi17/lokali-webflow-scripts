
(function () {
  'use strict';

  // Dashboard content must clear the fixed 200px sidebar (.section-11) on
  // desktop. Content wrappers differ per page (div-block-38/39, container-11)
  // and some center in the full width, sliding under the rail at ~1248px and
  // narrower. Reserving the rail's width as body padding-left offsets all
  // in-flow content uniformly; the fixed sidebar ignores body padding and
  // stays pinned at left:0. Scoped to >=992px (tablet/mobile collapse the nav).
  (function injectLayoutFix() {
    // Dashboard pages only — never pad the body on public pages (no sidebar).
    if (String(location.pathname || '').indexOf('/vendor-dashboard') === -1) return;
    if (document.getElementById('lok-dashboard-layout-fix')) return;
    var s = document.createElement('style');
    s.id = 'lok-dashboard-layout-fix';
    s.textContent = '@media (min-width:992px){body{padding-left:200px;}}' +
      // #49 — services/products cards render from a template with a -10px
      // inline margin, so adjacent cards read as one slab. Real separation:
      // gap + border + soft shadow (brand-light surfaces per the no-ink rule).
      '.service-card[data-service-id],.product-card[data-product-id]{' +
        'margin-bottom:16px !important;border:1px solid #ECE8F8 !important;' +
        'border-radius:14px;background:#fff;box-shadow:0 1px 5px rgba(35,29,63,.07);}' +
      // #50 — Edit/Delete were hover-revealed; always show them on desktop
      // (mobile has no hover, so reveal everywhere). Beats any IX inline style.
      '.service-card [data-action],.product-card [data-action],' +
      '.service-card .icon-btn-edit,.product-card .icon-btn-edit,' +
      '.service-card .icon-btn--delete,.product-card .icon-btn--delete{' +
        'opacity:1 !important;visibility:visible !important;}' +
      // Sidebar nav-label fix: the Leads + Availability links use
      // <div class="text-block-17"> (no font-size of its own), while the other
      // nav items use <strong class="dashboard-menu"> (16px). On services/products
      // pages an ancestor font-size (24px) cascades into the unstyled label and
      // blows it up. Pin it to match .dashboard-menu so it can't inherit the leak.
      '.dashboard-btn .text-block-17{font-size:16px !important;font-weight:500;line-height:26px;}';
    (document.head || document.documentElement).appendChild(s);
  })();

  // Role guard: the vendor dashboard is vendors-only. A signed-in CUSTOMER who
  // lands here (typed URL, stale link) is sent to their own hub at /account.
  // Uses the cached role for an instant bounce, then confirms against the server.
  // No token → left to requireAuth()/page scripts, which send to /login.
  (function roleGuard() {
    if (String(location.pathname || '').indexOf('/vendor-dashboard') === -1) return;
    var TOKEN_KEY = 'LOKALI_AUTH_TOKEN', CACHE_KEY = 'LOKALI_ACCT_CACHE';

    if (window.LOKALI_BACKEND === 'supabase') {
      // No legacy token exists — instant bounce off the cached role (written by
      // lokali-auth.js on sync), then confirm via LokaliAuth (cache →
      // get_my_role() RPC, DB truth).
      try {
        var sc = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (sc && sc.role && sc.role !== 'vendor') { window.location.replace('/account'); return; }
      } catch (e) {}
      var tries = 0;
      (function poll() {
        var A = window.LokaliAuth;
        if (A) {
          A.ready.then(function () {
            var role = A.role();
            if (role) {
              if (role !== 'vendor') window.location.replace('/account');
              return;
            }
            A.fetchRole().then(function (r) {
              if (r && r !== 'vendor') window.location.replace('/account');
            });
          });
          return;
        }
        if (++tries <= 40) setTimeout(poll, 250);
      })();
      return;
    }

    var t;
    try { t = localStorage.getItem(TOKEN_KEY); } catch (e) { t = null; }
    if (!t || t.length < 20) return; // no token → not our job (requireAuth → /login)
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.role && c.role !== 'vendor') { window.location.replace('/account'); return; }
    } catch (e) {}
    // The Xano /account role lookup is gone (XANO-DECOMM 2026-07-24). The cache
    // check above still handles the legacy-token case; Supabase-era role
    // routing lives in lokali-auth.js / the auth-nav cache, not here.
  })();


  // ─── Storefront checkup (moved here from lokali-insights.js 2026-09-17) ──
  // Shared by the dashboard home ('Your next step') and Insights ('Storefront
  // checkup'). This file is a plain sitewide tag that loads before every page
  // script, so both readers can rely on window.LokaliCheckup.
  // Field-based, not traffic-based: every check asks whether something a
  // shopper looks for EXISTS on the storefront, never how good it is or how it
  // compares to other vendors (with ~20 storefronts and a handful of views a
  // week a category benchmark would be noise; revisit once there are a few
  // hundred views a week). Pure: takes the rows the page already loads plus
  // two best-effort reads (portfolio photos, availability config) and returns
  // plain items; the plan-gated checks (gallery, booking link, Verified) are
  // simply absent for Free vendors — the upsell card below already does that
  // pitch. Exposed as window.LokaliCheckup for the node test.
  var CK_PROFILE = '/vendor-dashboard/profile';
  function buildCheckup(v, services, products, photos, cfg, billing) {
    v = v || {}; services = services || []; products = products || []; photos = photos || []; cfg = cfg || {};
    var f = (billing && billing.features) || {};
    var svc = services.filter(function (s) { return s.is_active !== false; });
    var prd = products.filter(function (p) { return p.is_active !== false; });
    var listings = svc.length + prd.length;
    var svcNoPrice = svc.filter(function (s) { return !s.price_type; }).length;
    var prdNoPrice = prd.filter(function (p) { return (p.price == null || p.price === '') && !p.is_quote_based; }).length;
    var noPrice = svcNoPrice + prdNoPrice;
    var svcNoPhoto = svc.filter(function (s) { return !s.image_url; }).length;
    var prdNoPhoto = prd.filter(function (p) { return !p.image_url; }).length;
    var noPhoto = svcNoPhoto + prdNoPhoto;
    var desc = String(v.business_description || '').trim();
    var paidWays = !!(v.venmo_username || v.cashapp_cashtag || v.paypalme_slug || v.zelle_contact || v.other_pay_url);
    var gallery = photos.filter(function (p) { return p && p.is_active !== false && (p.image_url || p.video_url); }).length;
    var paidPlan = (Number(f.max_vendor_photos) || 0) > 0 || !!f.trust_badge;
    var SVC = '/vendor-dashboard/services', PRD = '/vendor-dashboard/products';
    function n(c, w) { return c + ' ' + w + (c === 1 ? '' : 's'); }
    var items = [];
    // add(key, done, openTitle, doneTitle, why, action, href, show)
    function add(key, done, openTitle, doneTitle, why, action, href, show) {
      if (show === false) return;
      items.push({ key: key, done: !!done, title: done ? doneTitle : openTitle, why: why, action: action, href: href });
    }
    add('price', noPrice === 0,
      'Add a price to ' + (noPrice === listings ? 'your ' : '') + n(noPrice, 'listing'), 'Every listing shows a price',
      'Shoppers skip listings with no price. "Starting at" or "Ask for a quote" both count.',
      'Add prices', svcNoPrice ? SVC : PRD, listings > 0);
    add('photo', noPhoto === 0,
      'Add a photo to ' + (noPhoto === listings ? 'your ' : '') + n(noPhoto, 'listing'), 'Every listing has a photo',
      'A listing with no photo is the one nobody opens.',
      'Add photos', svcNoPhoto ? SVC : PRD, listings > 0);
    add('cover', !!v.card_photo_url,
      'Pin a cover photo for your Market card', 'Cover photo pinned',
      'Your card is the first thing shoppers see in the Market. Right now we pick a photo for you.',
      'Pick a cover', CK_PROFILE + '#lok-card-photo');
    add('depth', listings >= 2,
      listings === 0 ? 'Add your first service or product' : 'Add a second service or product', 'More than one listing',
      'One listing reads as a side project. Two or more reads as a business.',
      'Add a listing', SVC);
    add('desc', desc.length >= 80,
      desc ? 'Say more in your description' : 'Write a description', 'Description written',
      (desc ? 'Yours is one line. ' : '') + 'A couple of sentences on what you make and who it is for. Google reads this too.',
      desc ? 'Write more' : 'Write it', CK_PROFILE + '#lok-sec-about');
    add('tagline', !!(v.business_tagline || v.tagline),
      'Add a tagline', 'Tagline set',
      'One line under your name on your card and in search results.',
      'Add a tagline', CK_PROFILE + '#lok-sec-about');
    add('intro', !!v.owner_bio,
      'Introduce yourself', 'Personal intro added',
      'Personal sells. Shoppers on Lokali pick people, not logos.',
      'Write an intro', CK_PROFILE + '#lok-about-you');
    add('contact', !!(v.contact_email || v.phone_number),
      'Add a way to reach you', 'Shoppers can reach you',
      'A phone number or email so an inquiry has somewhere to land.',
      'Add contact', CK_PROFILE + '#lok-sec-business');
    add('pay', paidWays,
      'Add a way to get paid', 'Ways to get paid listed',
      'Venmo, Cash App, PayPal or Zelle. Taps on these show up as Payment clicks above.',
      'Add payment', CK_PROFILE + '#lok-pay-card');
    add('buy', prd.some(function (p) { return !!p.buy_url; }),
      'Link your online store', 'Online store linked',
      'If you sell on Etsy, Shopify or your own site, a Buy button turns a view into a sale.',
      'Add a Buy link', PRD, prd.length > 0);
    add('gallery', gallery > 0,
      'Add photos to your storefront gallery', 'Gallery has photos',
      'A photo strip across the top of your storefront. It is the first thing a visitor sees.',
      'Add gallery photos', CK_PROFILE + '#lok-portfolio-card', (Number(f.max_vendor_photos) || 0) > 0);
    add('booking', !!cfg.booking_url,
      'Add your booking link', 'Booking link added',
      'Calendly, Acuity, Square or any scheduling page. Puts a Book button on your storefront.',
      'Add booking link', '/vendor-dashboard/availability', paidPlan && svc.length > 0);
    add('verified', v.identity_status === 'verified',
      'Get Verified', 'Verified',
      'A quick ID check. The Verified badge tells a stranger you are a real person.',
      'Get Verified', '/vendor-dashboard/settings', !!f.trust_badge);
    var open = items.filter(function (i) { return !i.done; });
    var done = items.filter(function (i) { return i.done; });
    return { items: items, open: open, done: done, total: items.length, paidPlan: paidPlan };
  }
  try { window.LokaliCheckup = buildCheckup; } catch (e) {}


  // ─── Listings pages UI (2026-09-17, F-approved v2 mockup) ─────────────────
  // Shared by lokali-services-final.js and lokali-products-final.js (both
  // registered page scripts; this plain sitewide tag loads first). The Webflow
  // row template stays the data carrier: each cloned row is rebuilt here as a
  // storefront-shaped PHOTO CARD, the three filter buttons become one
  // segmented control with counts, Featured picks lead the grid via CSS
  // order (DOM order, and so drag-to-reorder + sort_order, are untouched), the
  // empty state shows the three steps to a live listing, and the form gets a
  // live "what shoppers see" preview plus sticky header and save bar.
  // Everything is idempotent and degrades to the old row when a hook is missing.
  var LUI_FONT = '"Plus Jakarta Sans",-apple-system,sans-serif';
  var LUI_CSS = [
    // grid
    '.lok-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch;}',
    // Everything in the stack that is not a card spans the row: the empty states, the hidden
    // template wrapper (hidden outright; the scripts clone its inner node, which still works)
    // and Webflow's footer row (count + upgrade link) which goes last.
    '.lok-grid>:not(.lok-gc):not(.lok-gsec):not(.lok-gspot){grid-column:1/-1;order:99;}',
    '.lok-grid>.lok-gsec{grid-column:1/-1;}',
    '.lok-grid>#service-card-template,.lok-grid>#product-card-template{display:none!important;}',
    '.lok-gsec{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0 -4px;font-family:' + LUI_FONT + ';}',
    '.lok-gsec h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8E8BA6;margin:0;}',
    '.lok-gsec span{font-size:11.5px;color:#8E8BA6;}',
    '.lok-gsec.lead{order:-3;}.lok-gsec.rest{order:-1;}',
    '.lok-gspot{order:-2;border:1.5px dashed #E5D4FD;border-radius:14px;min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;font-family:' + LUI_FONT + ';}',
    '.lok-gspot b{font-size:13px;font-weight:700;color:#6002EE;}',
    '.lok-gspot span{font-size:12px;color:#6E6A85;max-width:22ch;margin-top:4px;line-height:1.5;}',
    // card
    '.lok-gc{display:flex!important;flex-direction:column;align-items:stretch!important;background:#fff;border:.5px solid #EEEDF6;border-radius:14px;overflow:hidden;margin:0!important;padding:0!important;position:relative;transform:none!important;box-shadow:none!important;min-width:0;cursor:pointer;font-family:' + LUI_FONT + ';}',
    '.lok-gc:hover{transform:none!important;border-color:#C8C6D8;box-shadow:0 4px 18px rgba(96,2,238,.08)!important;}',
    '.lok-gc.is-pick{order:-2;}',
    '.lok-gc.is-off .lok-gc-cover,.lok-gc.is-off .lok-gc-body{opacity:.62;}',
    '.lok-gc .card-divider,.lok-gc .service-category,.lok-gc .product-category,.lok-gc .service-description,.lok-gc .product-description,.lok-gc .product-stock,.lok-gc .product-price-note,.lok-gc .remote-badge,.lok-gc .shipping-badge,.lok-gc [data-field="product-delivery-badge"],.lok-gc .status-pill{display:none!important;}',
    '.lok-gc-cover{position:relative;aspect-ratio:4/3;background:#EEEDF6 center/cover no-repeat;}',
    '.lok-gc-cover.ph{background:linear-gradient(135deg,#F3EBFF,#FFF1E3);display:flex;align-items:center;justify-content:center;color:#8E8BA6;}',
    '.lok-gc-cover.ph svg{width:26px;height:26px;}',
    '.lok-gc-corner{position:absolute;top:8px;left:8px;display:flex;gap:6px;}',
    '.lok-gc-cr{position:absolute;top:8px;right:8px;}',
    '.lok-gc-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;border-radius:100px;padding:3px 9px;line-height:1.4;white-space:nowrap;background:rgba(255,255,255,.92);}',
    '.lok-gc-chip.on{color:#1D6A45;}.lok-gc-chip.off{color:#6E6A85;}.lok-gc-chip.pick{color:#6002EE;}',
    '.lok-gc-chip svg{width:11px;height:11px;}',
    '.lok-gc .drag-handle{opacity:1!important;visibility:visible!important;width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;color:#8E8BA6;cursor:grab;margin:0;}',
    '.lok-gc .drag-handle svg{width:12px;height:12px;}',
    '.lok-gc-body{padding:12px 12px 10px;display:flex;flex-direction:column;gap:6px;flex:1;min-width:0;}',
    '.lok-gc .service-info,.lok-gc .product-info{display:block;min-width:0;}',
    '.lok-gc .service-name,.lok-gc .product-name{font-size:14px;font-weight:700;color:#1A1829;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;}',
    '.lok-gc-line{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
    '.lok-gc-top{align-items:flex-start;}',
    '.lok-gc-top .lok-gc-stat{flex-shrink:0;padding-top:1px;}',
    '.lok-gc .service-price,.lok-gc .product-price,.lok-gc .product-price-row{font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;color:#4A4761;margin:0;display:block;line-height:1.4;}',
    '.lok-gc .lok-gc-noprice{color:#8E8BA6!important;font-weight:500!important;}',
    '.lok-gc-stat{font-size:11.5px;color:#6E6A85;white-space:nowrap;}',
    '.lok-gc-stat b{color:#1A1829;font-weight:700;}',
    '.lok-gc-meta{display:flex;gap:6px;flex-wrap:wrap;}',
    '.lok-tagc{display:inline-flex;align-items:center;font-size:11px;font-weight:600;border-radius:100px;padding:2px 8px;background:#EEEDF6;color:#4A4761;white-space:nowrap;line-height:1.5;}',
    '.lok-tagc.spec{background:#F3EBFF;color:#6002EE;}.lok-tagc.warn{background:#FFF1E3;color:#9a4d00;}.lok-tagc.way{background:#E7EEFF;color:#2643B0;}',
    '.lok-gc .card-actions{opacity:1!important;visibility:visible!important;display:flex;gap:6px;margin-top:auto;padding-top:8px;border-top:.5px solid #EEEDF6;position:static;}',
    '.lok-gc .card-actions .icon-btn{height:32px;min-width:32px;padding:0 10px;border-radius:8px;border:.5px solid #EEEDF6;background:#F7F6FC;color:#4A4761;display:inline-flex;align-items:center;justify-content:center;gap:6px;font:600 12px/1 ' + LUI_FONT + ';cursor:pointer;opacity:1!important;visibility:visible!important;}',
    '.lok-gc .card-actions [data-action="edit"]{order:0;color:#6002EE;border-color:#E5D4FD;background:#fff;}',
    '.lok-gc .card-actions [data-action="feature"]{order:1;}',
    '.lok-gc .card-actions [data-action="delete"]{order:2;margin-left:auto;padding:0;width:32px;}',
    '.lok-gc .card-actions .icon-btn svg{width:12px;height:12px;flex-shrink:0;}',
    '.lok-gc-bl{white-space:nowrap;}',
    // toolbar
    '.lok-seg{display:inline-flex;align-items:center;background:#fff;border:1px solid #EEEDF6;border-radius:10px;padding:3px;gap:2px;font-family:' + LUI_FONT + ';}',
    '.lok-seg>[id^="filter-pill"]{margin:0!important;padding:0!important;background:none!important;border:none!important;height:auto!important;width:auto!important;min-width:0!important;box-shadow:none!important;display:block;}',
    '.lok-seg .lok-seg-b{font:600 12.5px/1.2 ' + LUI_FONT + '!important;color:#4A4761!important;border-radius:8px!important;padding:0 12px!important;height:32px!important;display:inline-flex!important;align-items:center;gap:6px;background:transparent!important;cursor:pointer;margin:0!important;border:none!important;letter-spacing:0!important;text-transform:none!important;}',
    '.lok-seg>.lok-seg-on .lok-seg-b,.lok-seg>.lok-seg-on.lok-seg-b{background:#6002EE!important;color:#fff!important;}',
    '.lok-seg-n{font-size:11px;font-weight:700;background:rgba(26,24,41,.08);border-radius:100px;padding:1px 6px;min-width:18px;text-align:center;line-height:1.4;}',
    '.lok-seg-on .lok-seg-n{background:rgba(255,255,255,.22);}',
    '.filter-bar select,.filter-bar .select-field{font:600 12.5px/1.2 ' + LUI_FONT + '!important;border-radius:10px!important;height:38px!important;padding:0 30px 0 12px!important;background-color:#fff!important;border:1px solid #EEEDF6!important;color:#1A1829!important;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 512 512%27><path fill=%27%234A4761%27 d=%27M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z%27/></svg>")!important;background-repeat:no-repeat!important;background-position:right 10px center!important;background-size:11px!important;margin:0!important;}',
    '.lok-order-hint{font-size:11.5px;color:#8E8BA6;font-family:' + LUI_FONT + ';}',
    // header
    '.lok-hdl{display:flex;flex-direction:column;gap:2px;}',
    '.lok-hdl .text-block-33{font-size:22px!important;font-weight:800!important;color:#1A1829!important;letter-spacing:-.01em;line-height:1.2!important;margin:0!important;font-family:' + LUI_FONT + '!important;}',
    '.lok-hdl-count{font-size:12.5px;color:#6E6A85;font-weight:500;font-family:' + LUI_FONT + ';margin:0;line-height:1.5;}',
    '#services-add-btn,#products-add-btn{background:#6002EE!important;border-color:#6002EE!important;color:#fff!important;border-radius:9px!important;font-family:' + LUI_FONT + '!important;font-weight:700!important;}',
    '#services-add-btn *,#products-add-btn *{color:#fff!important;}',
    // empty state
    '.lok-empty{display:grid;grid-template-columns:1.1fr 1fr;gap:20px;align-items:center;background:#fff;border:.5px dashed #E5D4FD;border-radius:14px;padding:22px;text-align:left;font-family:' + LUI_FONT + ';}',
    '.lok-empty h3{font-size:16px;font-weight:800;margin:0 0 8px;color:#1A1829;}',
    '.lok-steps{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px;}',
    '.lok-steps li{display:grid;grid-template-columns:24px 1fr;gap:10px;align-items:start;font-size:12.5px;color:#4A4761;line-height:1.5;}',
    '.lok-steps li i{width:24px;height:24px;border-radius:50%;background:#F3EBFF;color:#6002EE;font-style:normal;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;}',
    '.lok-steps li b{color:#1A1829;}',
    '.lok-btns{display:flex;gap:8px;flex-wrap:wrap;}',
    '.lok-btn{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:8px 14px;border-radius:9px;font:700 13px/1.2 ' + LUI_FONT + ';border:1px solid #E5D4FD;background:#fff;color:#6002EE;cursor:pointer;}',
    '.lok-btn.primary{background:#6002EE;color:#fff;border-color:#6002EE;}',
    '.lok-btn:focus-visible,.lok-gc .icon-btn:focus-visible,.lok-seg>[id^="filter-pill"]:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
    '.lok-ghosts{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
    '.lok-ghosts .lok-gc{opacity:.75;cursor:default;}',
    '.lok-ghosts .lok-gc-line span{font-size:13px!important;font-weight:500!important;color:#4A4761!important;line-height:1.4!important;}',
    '.lok-ghosts .service-name{font-size:14px!important;line-height:1.4!important;}',
    // form
    // No white bands: the header row stays in flow (F, 2026-09-17) and the sticky save bar
    // inherits the form card's own background instead of painting white over it.
    '[id$="-form-view"] .form-header{position:static;background:transparent;}',
    '.lok-form-bar{position:sticky;bottom:0;z-index:6;background:inherit;border-top:.5px solid #EEEDF6;padding:10px 0!important;display:flex!important;align-items:center;gap:10px;flex-wrap:wrap;}',
    '.lok-form-msg{font-size:12.5px;color:#6E6A85;margin-right:auto;font-family:' + LUI_FONT + ';display:none;}',
    '.lok-form-bar.dirty .lok-form-msg{display:block;}',
    '#lok-lc-preview{background:#F7F6FC;border:.5px solid #EEEDF6;border-radius:12px;padding:12px 14px;margin:12px 20px 18px;font-size:14px;line-height:1.5;display:grid;grid-template-columns:220px 1fr;gap:16px;align-items:center;font-family:' + LUI_FONT + ';}',
    '#lok-lc-preview .lab{grid-column:1/-1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8E8BA6;}',
    '#lok-lc-preview .lok-gc{cursor:default;}',
    '#lok-lc-preview .service-name{font-size:14px!important;font-weight:700!important;color:#1A1829!important;line-height:1.3!important;}',
    '#lok-lc-preview .lok-pv-price{font-size:13px!important;font-weight:500!important;color:#4A4761!important;line-height:1.4!important;}',
    '#lok-lc-preview ul{list-style:none;margin:0;padding:0;font-size:12px;color:#4A4761;}',
    '#lok-lc-preview li{display:flex;gap:8px;align-items:center;padding:3px 0;line-height:1.5;}',
    '#lok-lc-preview li svg{width:13px;height:13px;flex-shrink:0;}',
    '#lok-lc-preview li.ok svg{color:#1D6A45;}#lok-lc-preview li.todo svg{color:#8E8BA6;}',
    // Products PAGE (list, pills, empty state) in orange too, so the colour is the
    // service/product cue everywhere, not only inside the form (F 2026-09-17).
    // body.lok-pg-product is set by css() from the pathname. Small orange badges and
    // pills carry DARK text (F): white on orange 500 is ~2.4:1; the big Add button keeps
    // white like the site's other orange buttons.
    'body.lok-pg-product #products-add-btn{background:#FF8D00!important;border-color:#FF8D00!important;}',
    'body.lok-pg-product .lok-seg>.lok-seg-on .lok-seg-b,body.lok-pg-product .lok-seg>.lok-seg-on.lok-seg-b{background:#FF8D00!important;color:#1A1829!important;}',
    'body.lok-pg-product .lok-seg>.lok-seg-on .lok-seg-b *,body.lok-pg-product .lok-seg>.lok-seg-on.lok-seg-b *{color:#1A1829!important;}',
    'body.lok-pg-product .lok-empty{border-color:#FFDDB0;}',
    'body.lok-pg-product .lok-steps li i{background:#FFF2DF;color:#B8471B;}',
    'body.lok-pg-product .lok-btn{border-color:#FFDDB0;color:#B8471B;}',
    'body.lok-pg-product .lok-btn.primary{background:#FF8D00;color:#fff;border-color:#FF8D00;}',
    'body.lok-pg-product .lok-btn:focus-visible,body.lok-pg-product .lok-gc .icon-btn:focus-visible,body.lok-pg-product .lok-seg>[id^="filter-pill"]:focus-visible{outline-color:#FF8D00;}',
    'body.lok-pg-product .lok-gspot{border-color:#FFDDB0;}body.lok-pg-product .lok-gspot b{color:#B8471B;}',
    'body.lok-pg-product .lok-gc-cover.ph{background:linear-gradient(135deg,#FFF2DF,#FFE4C4);}',
    'body.lok-pg-product .lok-tagc.spec{background:#FFF2DF;color:#B8471B;}',
    'body.lok-pg-product .lok-gc-chip.pick{color:#B8471B;}',
    'body.lok-pg-product .lok-gc .card-actions [data-action="edit"]{color:#B8471B;border-color:#FFDDB0;}',
    'body.lok-pg-product #lok-import-btn:hover{border-color:#FF8D00;color:#B8471B;background:#FFF7EC;}',
    'body.lok-pg-product #lok-import-btn:focus-visible{outline-color:#FF8D00;}',
    'body.lok-pg-product #lok-import-help{color:#B8471B;}',
    '@media(max-width:991px){.lok-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.lok-gc .card-actions .icon-btn{height:44px;min-width:44px;}.lok-gc .drag-handle{width:44px;height:44px;}}',
    '@media(max-width:560px){.lok-grid{grid-template-columns:1fr;}.lok-empty,.lok-ghosts,#lok-lc-preview{grid-template-columns:1fr;}}'
  ].join('');
  var LUI_ICO = {
    photo: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M0 96C0 60.7 28.7 32 64 32H448c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96zM323.8 202.5c-4.5-6.6-11.9-10.5-19.8-10.5s-15.4 3.9-19.8 10.5l-87 127.6L170.7 297c-4.6-5.7-11.5-9-18.7-9s-14.2 3.3-18.7 9l-64 80c-5.8 7.2-6.9 17.1-2.9 25.4s12.4 13.6 21.6 13.6h96 32H424c8.9 0 17.1-4.9 21.2-12.8s3.6-17.4-1.4-24.7l-120-176zM112 192a48 48 0 1 0 0-96 48 48 0 1 0 0 96z"/></svg>',
    star: '<svg viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>',
    ok: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg>',
    todo: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M464 256A208 208 0 1 0 48 256a208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z"/></svg>'
  };
  function luiEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function luiThumb(url, w) {
    if (!url) return '';
    try {
      var L = window.LokaliImg;
      if (typeof L === 'function') return L(url, w) || url;
      if (L && typeof L.thumb === 'function') return L.thumb(url, w) || url;
    } catch (e) {}
    return url;
  }
  function luiEl(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function luiChip(text, cls) { var s = luiEl('span', 'lok-tagc' + (cls ? ' ' + cls : '')); s.textContent = text; return s; }
  function luiCoverBg(el, url) {
    el.className = 'lok-gc-cover' + (url ? '' : ' ph');
    var keep = el.querySelectorAll('.lok-gc-corner,.lok-gc-cr');
    el.innerHTML = url ? '' : LUI_ICO.photo;
    for (var i = 0; i < keep.length; i++) el.appendChild(keep[i]);
    el.style.backgroundImage = url ? 'url("' + luiThumb(url, 640).replace(/"/g, '%22') + '")' : '';
  }

  // page cue: /vendor-dashboard/products paints the list UI orange (see LUI_CSS)
  if (document.body && /^\/vendor-dashboard\/products(\/|$)/.test(String(window.location.pathname || ''))) document.body.classList.add('lok-pg-product');
  window.LokaliListingUI = {
    css: function () {
      if (/^\/vendor-dashboard\/products(\/|$)/.test(String(window.location.pathname || ''))) document.body.classList.add('lok-pg-product');
      if (document.getElementById('lok-lui-css')) return;
      var st = document.createElement('style'); st.id = 'lok-lui-css'; st.textContent = LUI_CSS;
      document.head.appendChild(st);
    },
    // Rebuild one cloned Webflow row as a photo card. o: { kind, imgUrl,
    // hasPrice, spec, lead, ways:[], live, pick, editLabel }
    card: function (card, o) {
      if (!card) return;
      o = o || {};
      this.css();
      card.classList.add('lok-gc');
      card.classList.toggle('is-pick', !!o.pick);
      card.classList.toggle('is-off', !o.live);
      var cover = card.querySelector('.lok-gc-cover');
      if (!cover) {
        cover = luiEl('div', 'lok-gc-cover');
        cover.appendChild(luiEl('div', 'lok-gc-corner'));
        cover.appendChild(luiEl('div', 'lok-gc-cr'));
        card.insertBefore(cover, card.firstChild);
      }
      luiCoverBg(cover, o.imgUrl || '');
      var corner = cover.querySelector('.lok-gc-corner');
      corner.innerHTML = (o.pick ? '<span class="lok-gc-chip pick">' + LUI_ICO.star + 'Pick</span>' : '') +
        '<span class="lok-gc-chip ' + (o.live ? 'on">Live' : 'off">Hidden') + '</span>';
      var handle = card.querySelector('.drag-handle');
      var cr = cover.querySelector('.lok-gc-cr');
      if (handle && handle.parentNode !== cr) { handle.setAttribute('title', 'Drag to reorder'); cr.appendChild(handle); }
      var body = card.querySelector('.lok-gc-body');
      if (!body) {
        body = luiEl('div', 'lok-gc-body');
        card.appendChild(body);
        // Row 1: name (left) + views (upper right). Row 2: price, lighter than the name (F, 2026-09-17).
        var top = luiEl('div', 'lok-gc-line lok-gc-top');
        var info = card.querySelector('.service-info, .product-info');
        if (info) top.appendChild(info);
        top.appendChild(luiEl('span', 'lok-gc-stat'));
        body.appendChild(top);
        var line = luiEl('div', 'lok-gc-line lok-gc-priceline');
        var price = card.querySelector('.product-price-row') || card.querySelector('.service-price, .product-price');
        if (price) line.appendChild(price);
        body.appendChild(line);
        body.appendChild(luiEl('div', 'lok-gc-meta'));
        var acts = card.querySelector('.card-actions');
        if (acts) body.appendChild(acts);
      }
      var meta = body.querySelector('.lok-gc-meta');
      meta.innerHTML = '';
      if (o.spec) meta.appendChild(luiChip(o.spec, 'spec'));
      if (!o.imgUrl) meta.appendChild(luiChip('No photo yet', 'warn'));
      if (!o.hasPrice) meta.appendChild(luiChip('No price yet', 'warn'));
      if (o.lead) meta.appendChild(luiChip(o.lead));
      (o.ways || []).forEach(function (w) { if (w) meta.appendChild(luiChip(w, 'way')); });
      var priceEl = card.querySelector('.service-price, .product-price');
      if (priceEl) {
        if (!o.hasPrice) { priceEl.textContent = 'Add a price'; priceEl.classList.add('lok-gc-noprice'); }
        else priceEl.classList.remove('lok-gc-noprice');
      }
      var stat = body.querySelector('.lok-gc-stat');
      if (stat) stat.textContent = o.live ? '' : 'Not on your storefront';
      var edit = card.querySelector('[data-action="edit"]');
      if (edit) {
        var lbl = edit.querySelector('.lok-gc-bl');
        if (!lbl) { lbl = luiEl('span', 'lok-gc-bl'); edit.appendChild(lbl); }
        lbl.textContent = (!o.imgUrl || !o.hasPrice) ? 'Finish this' : 'Edit';
      }
      var del = card.querySelector('[data-action="delete"]');
      if (del) { del.setAttribute('title', o.live ? 'Hide from your storefront' : 'Remove'); del.setAttribute('aria-label', o.live ? 'Hide from your storefront' : 'Remove'); }
    },
    // After the whole list renders. picks = number of pick cards, cap = plan cap,
    // featured = plan can pick. Section headers + empty spots ride CSS order.
    afterRender: function (stack, o) {
      if (!stack) return;
      o = o || {};
      this.css();
      stack.classList.add('lok-grid');
      var olds = stack.querySelectorAll('.lok-gsec,.lok-gspot');
      for (var i = 0; i < olds.length; i++) olds[i].parentNode.removeChild(olds[i]);
      var picks = o.picks || 0, cap = o.cap || 0;
      if (picks > 0 && o.customOrder) {
        var lead = luiEl('div', 'lok-gsec lead', '<h3>Leading your storefront</h3><span>Featured picks show first. Up to ' + cap + '.</span>');
        var rest = luiEl('div', 'lok-gsec rest', '<h3>Everything else</h3><span>In your order. Drag a card to move it.</span>');
        stack.appendChild(lead); stack.appendChild(rest);
        if (o.featured && cap > picks) {
          var left = cap - picks;
          var spot = luiEl('div', 'lok-gspot', '<b>' + left + (left === 1 ? ' more spot' : ' more spots') + '</b><span>Star any listing below and it leads your storefront.</span>');
          stack.appendChild(spot);
        }
      }
    },
    // Fill "N views" on each card from the analytics rows this vendor can read.
    paintStats: function (stack, rows, source) {
      if (!stack) return;
      var now = Date.now(), DAY = 86400000, byItem = {};
      (rows || []).forEach(function (r) {
        if (!r || r.source !== source || r.item_id == null) return;
        var t = typeof r.created_at === 'number' ? r.created_at : Date.parse(r.created_at || '');
        if (!t || now - t > 30 * DAY) return;
        byItem[String(r.item_id)] = (byItem[String(r.item_id)] || 0) + 1;
      });
      var attr = source === 'product' ? 'data-product-id' : 'data-service-id';
      var cards = stack.querySelectorAll('.lok-gc[' + attr + ']');
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i], stat = c.querySelector('.lok-gc-stat');
        if (!stat || c.classList.contains('is-off')) continue;
        var n = byItem[String(c.getAttribute(attr))] || 0;
        stat.innerHTML = '<b>' + n + '</b> ' + (n === 1 ? 'view' : 'views');
        stat.setAttribute('title', 'Last 30 days');
      }
    },
    // The three Webflow filter buttons become one segmented control.
    segmented: function (pills, counts) {
      this.css();
      var all = pills.all, live = pills.live, hidden = pills.hidden;
      if (!all || !live || !hidden) return;
      var seg = document.getElementById('lok-seg');
      if (!seg) {
        seg = luiEl('div', 'lok-seg'); seg.id = 'lok-seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Show');
        all.parentNode.insertBefore(seg, all);
        seg.appendChild(all); seg.appendChild(live); seg.appendChild(hidden);
      }
      var c = counts || {};
      // Services wraps each pill's label in an inner div; Products' pill IS the
      // label element. Paint whichever is the visual button and mark it, so a
      // re-render never paints into the count span it created last time.
      function paint(pill, label, n) {
        var inner = pill.querySelector('.lok-seg-b');
        if (!inner) {
          var kids = pill.children, i;
          for (i = 0; i < kids.length; i++) { if (!kids[i].classList.contains('lok-seg-n')) { inner = kids[i]; break; } }
          inner = inner || pill;
          inner.classList.add('lok-seg-b');
        }
        inner.innerHTML = luiEsc(label) + (n != null ? '<span class="lok-seg-n">' + n + '</span>' : '');
        pill.setAttribute('role', 'button'); pill.setAttribute('tabindex', '0');
      }
      paint(all, 'All', c.all); paint(live, 'Live', c.live); paint(hidden, 'Hidden', c.hidden);
    },
    // Count line moves under the page title; hint text shortened.
    // The count element itself stays where Webflow put it (the page scripts'
    // reorderFooterAfterStack() moves ITS ancestor after the grid on every
    // render; moving the node into the header dragged the header along,
    // caught live 2026-09-17). We mirror its text under the title instead.
    header: function (titleEl, countEl, hintEl) {
      this.css();
      if (titleEl && !titleEl.closest('.lok-hdl')) {
        var box = luiEl('div', 'lok-hdl');
        titleEl.parentNode.insertBefore(box, titleEl);
        box.appendChild(titleEl);
        box.appendChild(luiEl('div', 'lok-hdl-count'));
      }
      var mirror = titleEl && titleEl.parentNode && titleEl.parentNode.querySelector('.lok-hdl-count');
      if (mirror && countEl) { mirror.textContent = countEl.textContent || ''; countEl.style.display = 'none'; }
      if (hintEl) hintEl.classList.add('lok-order-hint');
    },
    // host: the Webflow empty-state block. o: { kind, onAdd, onImport }
    emptyState: function (host, o) {
      if (!host) return;
      o = o || {};
      this.css();
      if (host.getAttribute('data-lok-lui') === '1') return;
      host.setAttribute('data-lok-lui', '1');
      var isP = o.kind === 'product', noun = isP ? 'product' : 'service';
      host.innerHTML =
        '<div class="lok-empty"><div>' +
          '<h3>Add your first ' + noun + '</h3>' +
          '<ul class="lok-steps">' +
            '<li><i>1</i><span><b>One photo.</b> Phone photos are fine. Natural light, plain background.</span></li>' +
            '<li><i>2</i><span><b>A name and a price.</b> "Ask for a quote" counts as a price.</span></li>' +
            '<li><i>3</i><span><b>Save.</b> It is live on your storefront the moment you do. Everything else can come later.</span></li>' +
          '</ul>' +
          '<div class="lok-btns"><button type="button" class="lok-btn primary" data-lui-add>Add a ' + noun + '</button>' +
          (isP && o.onImport ? '<button type="button" class="lok-btn" data-lui-import>Import from Etsy or Shopify</button>' : '') + '</div>' +
        '</div><div class="lok-ghosts">' +
          '<div class="lok-gc"><div class="lok-gc-cover" style="background-image:linear-gradient(135deg,#d9c7f5,#f7d2b8)"><div class="lok-gc-corner"><span class="lok-gc-chip on">Live</span></div></div><div class="lok-gc-body"><div class="service-name">Your first ' + noun + '</div><div class="lok-gc-line"><span style="font-weight:700">' + (isP ? '$24' : 'from $60') + '</span></div><div class="lok-gc-meta"><span class="lok-tagc way">' + (isP ? 'Pickup' : 'About a week') + '</span></div></div></div>' +
          '<div class="lok-gc"><div class="lok-gc-cover ph">' + LUI_ICO.photo + '</div><div class="lok-gc-body"><div class="service-name" style="color:#8E8BA6">The next one</div><div class="lok-gc-line"><span class="lok-gc-noprice">Price</span></div></div></div>' +
        '</div></div>';
      host.style.background = 'transparent'; host.style.border = 'none'; host.style.padding = '0';
      var a = host.querySelector('[data-lui-add]'); if (a && o.onAdd) a.addEventListener('click', o.onAdd);
      var im = host.querySelector('[data-lui-import]'); if (im && o.onImport) im.addEventListener('click', o.onImport);
    },
    // Form: sticky save bar with a dirty message; returns nothing.
    formBar: function (formView, saveBtn) {
      if (!formView || !saveBtn || !saveBtn.parentElement) return;
      this.css();
      var bar = saveBtn.parentElement;
      if (bar.classList.contains('lok-form-bar')) return;
      bar.classList.add('lok-form-bar');
      var msg = luiEl('span', 'lok-form-msg'); msg.textContent = 'Changes are not saved yet.';
      bar.insertBefore(msg, bar.firstChild);
      formView.addEventListener('input', function () { bar.classList.add('dirty'); });
      formView.addEventListener('change', function () { bar.classList.add('dirty'); });
      saveBtn.addEventListener('click', function () { bar.classList.remove('dirty'); });
    },
    // Form: "What shoppers see" card above the fields. Returns { update(state) }.
    // state: { name, price, hasPrice, spec, lead, imgUrl, ways:[], live }
    preview: function (formView, header) {
      if (!formView) return { update: function () {}, reset: function () {} };
      this.css();
      var box = document.getElementById('lok-lc-preview');
      if (!box) {
        box = luiEl('div');
        box.id = 'lok-lc-preview';
        box.innerHTML = '<div class="lab">What shoppers see</div>' +
          '<div class="lok-gc"><div class="lok-gc-cover ph"><div class="lok-gc-corner"><span class="lok-gc-chip on">Live</span></div>' + LUI_ICO.photo + '</div>' +
          '<div class="lok-gc-body"><div class="service-name"></div><div class="lok-gc-line"><span class="lok-pv-price"></span></div><div class="lok-gc-meta"></div></div></div>' +
          '<ul></ul>';
        if (header && header.parentNode === formView) formView.insertBefore(box, header.nextSibling);
        else formView.insertBefore(box, formView.firstChild);
      }
      var cover = box.querySelector('.lok-gc-cover'), n = box.querySelector('.service-name'), p = box.querySelector('.lok-pv-price'), meta = box.querySelector('.lok-gc-meta'), ul = box.querySelector('ul'), chip = box.querySelector('.lok-gc-chip');
      return {
        update: function (s) {
          s = s || {};
          n.textContent = s.name || 'Untitled listing';
          p.textContent = s.hasPrice ? (s.price || '') : 'Add a price';
          p.style.color = s.hasPrice ? '' : '#8E8BA6';
          chip.className = 'lok-gc-chip ' + (s.live === false ? 'off' : 'on'); chip.textContent = s.live === false ? 'Hidden' : 'Live';
          luiCoverBg(cover, s.imgUrl || '');
          meta.innerHTML = '';
          if (s.spec) meta.appendChild(luiChip(s.spec, 'spec'));
          if (s.lead) meta.appendChild(luiChip(s.lead));
          (s.ways || []).forEach(function (w) { if (w) meta.appendChild(luiChip(w, 'way')); });
          var items = [[!!s.imgUrl, 'Photo'], [!!s.hasPrice, 'Price'], [!!s.spec, 'Specialty tag, so it shows in filters']];
          ul.innerHTML = items.map(function (it) { return '<li class="' + (it[0] ? 'ok' : 'todo') + '">' + (it[0] ? LUI_ICO.ok : LUI_ICO.todo) + luiEsc(it[1]) + '</li>'; }).join('');
        }
      };
    }
  };

  // ─── Listing FORM organisation (2026-09-17, F-approved form mockup v4) ────
  // The Webflow form is one grid of blocks. organize() moves those blocks
  // (and the pieces the page scripts inject: gallery, video, buy link,
  // specialty, lead time, delivery row) into numbered section cards in the
  // order shoppers read: 1 Photos, 2 Name and price, 3 Details (folded on a
  // new listing), 4 How they get it, then Live. Nodes are MOVED, never
  // rebuilt, so every id, listener and validator in the page scripts keeps
  // working. Price type becomes a segmented control that drives the hidden
  // <select>; the Live / Remote / Pickup / Delivery / Ships checkboxes are
  // styled as switches (still the native inputs). Idempotent per form view.
  var LUI_FORM_CSS = [
    '[id$="-form-view"].lok-org{background:#F1EDFB!important;border-color:#E5D4FD!important;}',
    '[id$="-form-view"].lok-org .w-layout-grid.lok-org-grid{display:none!important;}',
    '.lok-fwrap{display:flex;flex-direction:column;gap:14px;margin:0 0 6px;font-family:' + LUI_FONT + ';white-space:normal;}',
    '.lok-fs{background:#fff;border:1px solid #E4E0F2;border-radius:14px;padding:16px 18px 18px;box-shadow:0 2px 10px rgba(96,2,238,.05);}',
    '.lok-fs.need{border-color:#E5D4FD;}',
    '.lok-fs.is-collapsed{background:#FCFBFF;}',
    '.lok-fs-h{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.lok-fs-h h3{font-size:16px;font-weight:800;margin:0;display:flex;align-items:center;gap:10px;letter-spacing:-.01em;color:#1A1829;line-height:1.3;font-family:' + LUI_FONT + ';}',
    '.lok-fs-num{width:24px;height:24px;border-radius:50%;background:#6002EE;color:#fff;font-style:normal;font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}',
    '.lok-fs-num.opt{background:#EEEDF6;color:#4A4761;}',
    '.lok-fs.is-done .lok-fs-num{background:#EAFAF2;color:#1D6A45;}',
    '.lok-fs-pill{font-size:10.5px;font-weight:700;border-radius:100px;padding:2px 8px;text-transform:uppercase;letter-spacing:.06em;line-height:1.5;}',
    '.lok-fs-pill.need{color:#1D6A45;background:#EAFAF2;}',
    '.lok-fs-pill.opt{color:#4A4761;background:#EEEDF6;}',
    '.lok-fs-cnt{font-size:11.5px;font-weight:600;color:#6E6A85;white-space:nowrap;}',
    '.lok-fs-chg{font:600 12px/1.5 ' + LUI_FONT + ';color:#6002EE;background:none;border:none;padding:6px 0 6px 10px;cursor:pointer;white-space:nowrap;}',
    '.lok-fs-sum{display:none;font-size:13px;color:#4A4761;margin:6px 0 0 34px;line-height:1.5;}',
    '.lok-fs.is-collapsed .lok-fs-body{display:none;}',
    '.lok-fs.is-collapsed .lok-fs-sum{display:block;}',
    '.lok-fs.is-collapsed .lok-fs-cnt{display:none;}',
    '.lok-fs-body{margin-top:4px;}',
    '.lok-fs-body>*{margin-left:0!important;margin-right:0!important;}',
    // fold (Details on a new listing)
    '.lok-fs.details.is-folded>.lok-fs-h,.lok-fs.details.is-folded>.lok-fs-body{display:none;}',
    '.lok-fs-fold{display:none;width:100%;align-items:center;justify-content:space-between;gap:10px;background:#F3EBFF;border:1px dashed #CBB8F5;border-radius:14px;padding:14px 18px;font:700 14px/1.4 ' + LUI_FONT + ';color:#6002EE;cursor:pointer;text-align:left;}',
    '.lok-fs-fold small{font-weight:500;color:#6E6A85;font-size:12px;margin-left:8px;}',
    '.lok-fs-fold svg{width:12px;height:12px;flex-shrink:0;}',
    '.lok-fs.details.is-folded{background:transparent;border:none;box-shadow:none;padding:0;}',
    '.lok-fs.details.is-folded>.lok-fs-fold{display:flex;}',
    // Products: the WHOLE form reads orange so the colour alone says "product, not service"
    // (F 2026-09-17). Brand scale only: 500 #FF8D00 fill, 50 #FFF2DF tint, #B8471B text;
    // #FFF7EC / #FFDDB0 / #F3E6D6 are washes of the 50 for the card tint, borders and hairlines.
    // Needed (green) and done (green) stay semantic. Page-script inline styles need !important.
    '[id$="-form-view"].lok-org.lok-org-product{background:#FFF7EC!important;border-color:#FFDDB0!important;}',
    '.lok-org-product .lok-fs{border-color:#F3E6D6;box-shadow:0 2px 10px rgba(255,141,0,.06);}',
    '.lok-org-product .lok-fs.need{border-color:#FFDDB0;}',
    '.lok-org-product .lok-fs.is-collapsed{background:#FFFCF7;}',
    '.lok-org-product .lok-fs:not(.is-done) .lok-fs-num{background:#FF8D00;color:#1A1829;}',
    '.lok-org-product .lok-fs-chg{color:#B8471B;}',
    '.lok-org-product .lok-fs-fold{background:#FFF2DF;border-color:#FFDDB0;color:#B8471B;}',
    '.lok-org-product .lok-pseg{border-color:#F3E6D6;}',
    '.lok-org-product .lok-pseg button.on{background:#FF8D00;color:#1A1829;}',
    '.lok-org-product .lok-pseg button:focus-visible{outline-color:#FF8D00;}',
    '.lok-org-product .lok-sw-row{border-color:#F3E6D6;}',
    '.lok-org-product .lok-sw-row input[type="checkbox"]:checked{background:#FF8D00;}',
    '.lok-org-product .lok-sw-row input[type="checkbox"]:focus-visible{box-shadow:0 0 0 2px #fff,0 0 0 4px #FF8D00;}',
    '.lok-org-product [id$="-gallery-body"] [data-photo-idx="0"]{outline-color:#FF8D00;}',
    '.lok-org-product .lok-form-bar{border-top-color:#F3E6D6;}',
    '.lok-org-product #lok-gallery-add{border-color:#FF8D00!important;color:#FF8D00!important;}',
    '.lok-org-product .lokali-product-upload__trigger{border-color:#FF8D00!important;color:#B8471B!important;}',
    '.lok-org-product #lok-product-subcat{background:#FFF2DF!important;}',
    '.lok-org-product #lok-product-subcat select,.lok-org-product #lok-product-subcat input{border-color:#FFDDB0!important;}',
    '.lok-org-product #lok-product-subcat [data-subcat-suggest-btn]{background:#FF8D00!important;border-color:#FF8D00!important;}',
    '.lok-org-product #lok-product-subcat div[style*="border-top"]{border-top-color:#FFDDB0!important;}',
    '.lok-org-product #lok-product-subcat span[style*="#6002EE"]{color:#B8471B!important;}',
    '.lok-org-product #lok-product-buy-fill{border-color:#FFDDB0!important;color:#B8471B!important;}',
    '.lok-org-product #lok-lc-preview .lok-tagc.spec{background:#FFF2DF;color:#B8471B;}',
    '.lok-org-product #lok-lc-preview .lok-gc-cover.ph{background:linear-gradient(135deg,#FFF2DF,#FFE4C4);}',
    // segmented price control
    '.lok-pseg{display:inline-flex;flex-wrap:wrap;background:#fff;border:1px solid #EEEDF6;border-radius:10px;padding:3px;gap:2px;margin:4px 0 10px;}',
    '.lok-pseg button{font:600 12.5px/1.2 ' + LUI_FONT + ';color:#4A4761;background:transparent;border:none;border-radius:8px;padding:0 12px;height:32px;cursor:pointer;white-space:nowrap;}',
    '.lok-pseg button.on{background:#6002EE;color:#fff;}',
    '.lok-pseg button:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
    // switches: the native checkbox drawn as a toggle, label as a row
    '.lok-sw-row{display:flex!important;flex-direction:row-reverse;align-items:center;justify-content:space-between;gap:10px;border:1px solid #EEEDF6;border-radius:10px;padding:10px 12px!important;margin:0!important;background:#fff;font:600 13px/1.4 ' + LUI_FONT + ';color:#1A1829;cursor:pointer;}',
    '.lok-sw-row input[type="checkbox"]{appearance:none;-webkit-appearance:none;width:36px;height:20px;border-radius:100px;background:#D9D5EA;position:relative;margin:0!important;flex-shrink:0;cursor:pointer;border:none;outline:none;transition:background .15s;}',
    '.lok-sw-row input[type="checkbox"]::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.18);transition:left .15s;}',
    '.lok-sw-row input[type="checkbox"]:checked{background:#6002EE;}',
    '.lok-sw-row input[type="checkbox"]:checked::after{left:18px;}',
    '.lok-sw-row input[type="checkbox"]:focus-visible{box-shadow:0 0 0 2px #fff,0 0 0 4px #6002EE;}',
    '.lok-sw-row .w-form-label,.lok-sw-row span{margin:0!important;font:inherit!important;color:inherit!important;}',
    '.lok-sw-row .w-checkbox-input--inputType-custom{display:none!important;}',
    '.lok-sw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px;}',
    '.lok-sw-grid>*{grid-area:auto!important;grid-column:auto!important;grid-row:auto!important;align-self:auto!important;justify-self:stretch!important;margin:0!important;}',
    '.lok-pseg-lbl{font-size:14px;font-weight:600;color:#1A1829;margin:0 0 6px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;}',
    '.lok-sw-live{display:flex;align-items:center;justify-content:space-between;gap:12px;}',
    '.lok-sw-live-t{font:800 15px/1.3 ' + LUI_FONT + ';color:#1A1829;}',
    '.lok-sw-live-s{font:500 12px/1.5 ' + LUI_FONT + ';color:#6E6A85;margin-top:2px;}',
    '.lok-sw-live .lok-sw-row{border:none;padding:0!important;}',
    '.lok-sw-live .lok-sw-row .w-form-label,.lok-sw-live .lok-sw-row span{display:none!important;}',
    // cover tile: visible focal-point handle + label on the first gallery photo
    '[id$="-gallery-body"] [data-photo-idx="0"]{outline:2px solid #6002EE;outline-offset:2px;}',
    '[id$="-gallery-body"] img[data-photo-idx="0"]{cursor:move;}',
    '.lok-cov-tag{position:absolute;left:0;right:0;bottom:0;background:rgba(26,24,41,.6);color:#fff;font:700 9.5px/1.4 ' + LUI_FONT + ';text-align:center;padding:3px 0;letter-spacing:.04em;text-transform:uppercase;pointer-events:none;}',
    '.lok-cov-x{position:absolute;top:50%;left:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.35);pointer-events:none;}',
    '.lok-cov-x::before,.lok-cov-x::after{content:"";position:absolute;background:#fff;left:50%;top:50%;}',
    '.lok-cov-x::before{width:2px;height:6px;margin:-3px 0 0 -1px;}',
    '.lok-cov-x::after{width:6px;height:2px;margin:-1px 0 0 -3px;}',
    // form bar messages
    '.lok-form-msg-base{font:500 12.5px/1.5 ' + LUI_FONT + ';color:#6E6A85;margin-right:auto;}',
    '.lok-form-bar.dirty .lok-form-msg-base{display:none;}',
    '@media(max-width:600px){.lok-sw-grid{grid-template-columns:1fr;}.lok-fs{padding:14px 14px 16px;}}'
  ].join('');

  window.LokaliListingUI.organize = function (fv, cfg) {
    if (!fv) return { update: function () {}, reset: function () {} };
    if (fv.__lokOrg) return fv.__lokOrg;
    this.css();
    if (!document.getElementById('lok-lui-form-css')) {
      var st = document.createElement('style'); st.id = 'lok-lui-form-css'; st.textContent = LUI_FORM_CSS;
      document.head.appendChild(st);
    }
    cfg = cfg || {}; var ids = cfg.ids || {}, hosts = cfg.hosts || {};
    var isP = cfg.kind === 'product';
    var form = fv.querySelector('form'); var grid = form && form.querySelector('.w-layout-grid');
    if (!form || !grid) return { update: function () {}, reset: function () {} };
    var byId = function (id) { return id ? document.getElementById(id) : null; };
    var blockOf = function (id) { var e = byId(id); if (!e) return null; var n = e; while (n && n.parentElement !== grid) n = n.parentElement; return n; };
    var blocks = Array.prototype.slice.call(grid.children);
    var used = [];
    var take = function (node) { if (node && used.indexOf(node) < 0) { used.push(node); return node; } return null; };

    var wrap = luiEl('div', 'lok-fwrap');
    var api = {};
    function section(key, opts) {
      var s = luiEl('div', 'lok-fs ' + key + (opts.need ? ' need' : ''));
      var h = luiEl('div', 'lok-fs-h');
      var h3 = luiEl('h3');
      if (opts.num) h3.appendChild(luiEl('span', 'lok-fs-num' + (opts.need ? '' : ' opt'), String(opts.num)));
      h3.appendChild(document.createTextNode(opts.title));
      if (opts.need) h3.appendChild(luiEl('span', 'lok-fs-pill need', 'needed'));
      else if (opts.optional) h3.appendChild(luiEl('span', 'lok-fs-pill opt', 'optional'));
      h.appendChild(h3);
      var right = luiEl('div', '', '');
      right.style.cssText = 'display:flex;align-items:center;gap:6px;';
      var cnt = luiEl('span', 'lok-fs-cnt'); right.appendChild(cnt);
      var chg = document.createElement('button'); chg.type = 'button'; chg.className = 'lok-fs-chg'; chg.textContent = 'Change'; chg.style.display = 'none';
      chg.addEventListener('click', function () { s.classList.remove('is-collapsed'); chg.style.display = 'none'; });
      right.appendChild(chg);
      h.appendChild(right);
      s.appendChild(h);
      var sum = luiEl('div', 'lok-fs-sum'); s.appendChild(sum);
      var body = luiEl('div', 'lok-fs-body'); s.appendChild(body);
      if (opts.fold) {
        var fold = document.createElement('button'); fold.type = 'button'; fold.className = 'lok-fs-fold';
        fold.innerHTML = '<span>' + luiEsc(opts.fold) + '<small>' + luiEsc(opts.foldSub || '') + '</small></span><svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>';
        fold.addEventListener('click', function () { s.classList.remove('is-folded'); });
        s.insertBefore(fold, s.firstChild);
      }
      wrap.appendChild(s);
      return { el: s, body: body, cnt: cnt, sum: sum, chg: chg, collapse: function (on) { s.classList.toggle('is-collapsed', !!on); chg.style.display = on ? '' : 'none'; } };
    }

    // 1 Photos
    var S1 = section('photos', { num: 1, title: 'Photos', need: true });
    var b = take(blockOf(ids.img)); if (b) S1.body.appendChild(b);
    var gal = take(byId(hosts.gallery)); if (gal) S1.body.appendChild(gal);
    // 2 Name and price
    var S2 = section('core', { num: 2, title: 'Name and price', need: true });
    b = take(blockOf(ids.name)); if (b) S2.body.appendChild(b);
    b = take(blockOf(ids.priceType || ids.price)); if (b) S2.body.appendChild(b);
    // 3 Details (folded on add)
    // products: the description is required on save, so Details is never folded away there
    var S3 = isP
      ? section('details', { num: 3, title: 'Details', need: true })
      : section('details', { num: 3, title: 'Details', optional: true, fold: 'Add details', foldSub: 'description, specialty tag, lead time, video' });
    b = take(blockOf(ids.desc)); if (b) S3.body.appendChild(b);
    var vid = take(byId(hosts.video)); if (vid) S3.body.appendChild(vid);
    var buy = take(byId(hosts.buy)); if (buy) S3.body.appendChild(buy);
    b = take(blockOf(ids.stock)); if (b) S3.body.appendChild(b);
    b = take(blockOf(ids.turnaround)); if (b) S3.body.appendChild(b);
    // 4 How they get it
    var S4 = section('get', { num: 4, title: 'How they get it', optional: true });
    var swGrid = luiEl('div', 'lok-sw-grid'); S4.body.appendChild(swGrid);
    var swIds = isP ? [ids.pickup, ids.delivery, ids.ship] : [ids.remote];
    var swLabels = isP ? ['Pickup', 'Delivery', 'Ships'] : ['Available remotely'];
    swIds.forEach(function (id, i) {
      var inp = byId(id); if (!inp) return;
      var row = inp.closest('label') || inp.parentElement;
      var blk = take(blockOf(id));
      row.classList.add('lok-sw-row');
      var lbl = row.querySelector('.w-form-label, span'); if (lbl) lbl.textContent = swLabels[i];
      swGrid.appendChild(row);
      if (blk && blk !== row && !blk.querySelector('input,select,textarea')) blk.style.display = 'none';
    });
    if (!swGrid.children.length) S4.el.style.display = 'none';
    // Live
    var S5 = section('live', { title: '' });
    S5.el.querySelector('.lok-fs-h').style.display = 'none';
    var live = byId(ids.active);
    if (live) {
      var lrow = live.closest('label') || live.parentElement;
      take(blockOf(ids.active));
      lrow.classList.add('lok-sw-row');
      var lw = luiEl('div', 'lok-sw-live');
      lw.appendChild(luiEl('div', '', '<div class="lok-sw-live-t">Live on your storefront</div><div class="lok-sw-live-s">Turn off to hide it without deleting.</div>'));
      lw.appendChild(lrow);
      S5.body.appendChild(lw);
    }
    // headings + leftovers: anything still in the grid with no field is a Webflow section title
    blocks.forEach(function (blk) {
      if (used.indexOf(blk) >= 0 || blk.parentElement !== grid) return;
      if (!blk.querySelector('input,select,textarea')) blk.style.display = 'none';
      else S3.body.appendChild(blk); // unknown field block: keep it reachable inside Details
    });
    grid.classList.add('lok-org-grid');
    grid.insertAdjacentElement('afterend', wrap);
    fv.classList.add('lok-org'); if (isP) fv.classList.add('lok-org-product');

    // Price type → segmented control (services: <select>; products: the quote checkbox)
    var seg = null;
    if (ids.priceType && byId(ids.priceType)) {
      var sel = byId(ids.priceType);
      seg = luiEl('div', 'lok-pseg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Price type');
      Array.prototype.forEach.call(sel.options, function (o) {
        var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = String(o.textContent || '').trim().replace(/^Quote.*$/i, 'Ask for a quote'); bt.setAttribute('data-v', o.value);
        bt.addEventListener('click', function () { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.dispatchEvent(new Event('input', { bubbles: true })); paintSeg(); });
        seg.appendChild(bt);
      });
      sel.insertAdjacentElement('afterend', seg); sel.style.display = 'none';
      var paintSeg = function () { Array.prototype.forEach.call(seg.children, function (bt) { bt.classList.toggle('on', bt.getAttribute('data-v') === sel.value); }); };
      sel.addEventListener('change', paintSeg); paintSeg(); api._paintSeg = paintSeg;
    } else if (ids.quote && byId(ids.quote)) {
      var q = byId(ids.quote), qrow = q.closest('label') || q.parentElement;
      seg = luiEl('div', 'lok-pseg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Price type');
      [['Set a price', false], ['Ask for a quote', true]].forEach(function (p) {
        var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = p[0];
        bt.addEventListener('click', function () { q.checked = p[1]; q.dispatchEvent(new Event('change', { bubbles: true })); paintQ(); });
        seg.appendChild(bt);
      });
      // the price block already moved into section 2, so find it from the input upward
      var pIn = byId(ids.price), priceBlk = (pIn && pIn.closest('.lok-fs-body > *')) || qrow.parentElement;
      var segLbl = luiEl('div', 'lok-pseg-lbl', 'Price type');
      priceBlk.insertBefore(seg, priceBlk.firstChild); priceBlk.insertBefore(segLbl, seg); qrow.style.display = 'none';
      var paintQ = function () { seg.children[0].classList.toggle('on', !q.checked); seg.children[1].classList.toggle('on', !!q.checked); };
      q.addEventListener('change', paintQ); paintQ(); api._paintSeg = paintQ;
    }

    // cover tile decoration (first gallery photo): crosshair + label
    function paintCover() {
      var body = byId((hosts.gallery || '') + '-body'); if (!body) return;
      var first = body.querySelector('img[data-photo-idx="0"]'); var tile = first && first.parentElement;
      body.querySelectorAll('.lok-cov-tag,.lok-cov-x').forEach(function (n) { if (!tile || n.parentElement !== tile) n.parentElement.removeChild(n); });
      if (!tile) return;
      if (getComputedStyle(tile).position === 'static') tile.style.position = 'relative';
      if (!tile.querySelector('.lok-cov-x')) tile.appendChild(luiEl('span', 'lok-cov-x'));
      if (!tile.querySelector('.lok-cov-tag')) tile.appendChild(luiEl('span', 'lok-cov-tag', 'Cover'));
    }

    // hosts the page scripts create lazily (video, buy link) appear after
    // organize() ran: pull them into Details whenever we repaint
    function settle() {
      [hosts.video, hosts.buy].forEach(function (id) {
        var h = id && byId(id); if (!h || h.parentElement === S3.body) return;
        used.push(h); S3.body.appendChild(h);
      });
    }
    api.reset = function (editing) {
      settle();
      S3.el.classList.toggle('is-folded', !editing && !isP);
      var bar = fv.querySelector('.lok-form-bar');
      if (bar) {
        var base = bar.querySelector('.lok-form-msg-base');
        if (!base) { base = luiEl('span', 'lok-form-msg-base'); bar.insertBefore(base, bar.firstChild); }
        base.textContent = editing ? '' : (isP ? 'A photo, a name, a price and a description make it live.' : 'A photo, a name and a price make it live.');
        bar.classList.remove('dirty');
      }
      S1.collapse(false); S2.collapse(false);
      api._editing = !!editing;
      if (api._paintSeg) api._paintSeg();
      paintCover();
    };
    // s: { photos, photoCap, imgUrl, name, price, hasPrice, spec }
    api.update = function (s) {
      s = s || {}; settle();
      var photosOk = !!s.imgUrl, coreOk = !!(s.name && s.hasPrice);
      S1.el.classList.toggle('is-done', photosOk); S2.el.classList.toggle('is-done', coreOk);
      S1.cnt.textContent = s.photoCap ? (s.photos || 0) + ' of ' + s.photoCap : ((s.photos || 0) + (s.photos === 1 ? ' photo' : ' photos'));
      S1.sum.textContent = (s.photos || 0) + (s.photoCap ? ' of ' + s.photoCap : '') + ' · the first one is your cover';
      S2.sum.textContent = (s.name || 'Untitled') + (s.hasPrice ? ' · ' + s.price : '');
      if (api._editing && !api._resetDone) {
        // first paint after opening an existing listing: finished sections fold to a line
        api._resetDone = true;
        if (photosOk) S1.collapse(true);
        if (coreOk) S2.collapse(true);
      }
      paintCover();
    };
    var _reset = api.reset;
    api.reset = function (editing) { api._resetDone = false; _reset(editing); };
    fv.__lokOrg = api;
    return api;
  };

  window.LokaliDashboard = {

    requireAuth: function () {
      var token = window.LokaliAPI && window.LokaliAPI.getToken
        ? window.LokaliAPI.getToken()
        : null;
      if (!token) {
        window.location.href = '/login';
        return false;
      }
      return true;
    },

    getVendor: function () {
      if (!window.LokaliAPI || !window.LokaliAPI.vendors || !window.LokaliAPI.vendors.me) {
        return Promise.reject(new Error('LokaliAPI.vendors.me is not available'));
      }
      return window.LokaliAPI.vendors.me();
    },

    getBilling: function () {
      if (!window.LokaliAPI || !window.LokaliAPI.plans || !window.LokaliAPI.plans.getMyBilling) {
        return Promise.reject(new Error('LokaliAPI.plans.getMyBilling is not available'));
      }
      return window.LokaliAPI.plans.getMyBilling();
    },

    showSuccess: function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'block';
      setTimeout(function () { el.style.display = 'none'; }, 3000);
    },

    showError: function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'block';
    },

    hideMessage: function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'none';
    },

    disableButton: function (id, state) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.disabled = !!state;
    },

    setTextValue: function (id, value) {
      var el = document.getElementById(id);
      if (el) el.value = value || '';
    },

    setCheckboxValue: function (id, value) {
      var el = document.getElementById(id);
      if (el) el.checked = !!value;
    },

    setSelectValue: function (id, value) {
      var el = document.getElementById(id);
      if (el && value != null) el.value = String(value);
    },

    setImageSrc: function (id, src) {
      var el = document.getElementById(id);
      if (el && src) el.src = src;
    },

    preventFormSubmit: function (selector) {
      var sel = selector || '.w-form form';
      var nodes = document.querySelectorAll(sel);
      nodes.forEach(function (node) {
        var targets = node.tagName === 'FORM' ? [node] : node.querySelectorAll('form');
        Array.prototype.forEach.call(targets, function (form) {
          form.addEventListener('submit', function (e) {
            e.preventDefault();
          });
        });
      });
    },

    showLoading: function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'block';
    },

    hideLoading: function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    },

    renderList: function (containerId, items, renderFn) {
      var container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = (items && items.length)
        ? items.map(renderFn).join('')
        : '';
    },

    /**
     * Fetches the current user's preferred name (name → first_name → fallback)
     * and sets the text content of every element matching `selector`.
     * selector defaults to '[data-lokali-greeting-name]'.
     * Returns a Promise.
     */
    populateGreetingName: function (selector) {
      var sel = selector || '[data-lokali-greeting-name]';
      var tok = window.LokaliAPI && window.LokaliAPI.getToken && window.LokaliAPI.getToken();
      if (!tok) return Promise.resolve();
      return window.LokaliAPI.auth.me().then(function (res) {
        if (res.error || !res.data) return;
        var user = res.data.user || res.data;
        var name = user.name || user.preferred_name || user.first_name || '';
        if (!name) return;
        var els = document.querySelectorAll(sel);
        Array.prototype.forEach.call(els, function (el) {
          el.textContent = name;
        });
      }).catch(function () {});
    },

    /**
     * Picks a time-aware greeting and fills every [data-lokali-greeting] element
     * with the full string, e.g. "Good morning, Jane!".
     * Falls back gracefully if the user has no saved name.
     * Returns a Promise.
     */
    populateGreeting: function (selector) {
      var sel = selector || '[data-lokali-greeting]';

      var hour = new Date().getHours();
      var pools =
        hour <  12 ? ['Good morning',   'Morning'                      ] :
        hour <  17 ? ['Good afternoon', 'Welcome back',  'Hey there'   ] :
                     ['Good evening',   'Welcome back',  'Hey there'   ];
      var prefix = pools[Math.floor(Math.random() * pools.length)];

      var tok = window.LokaliAPI && window.LokaliAPI.getToken && window.LokaliAPI.getToken();
      if (!tok) {
        var els0 = document.querySelectorAll(sel);
        Array.prototype.forEach.call(els0, function (el) { el.textContent = prefix + '!'; });
        return Promise.resolve();
      }

      return window.LokaliAPI.auth.me().then(function (res) {
        var name = '';
        if (!res.error && res.data) {
          var user = res.data.user || res.data;
          name = user.name || user.preferred_name || user.first_name || '';
        }
        var text = name ? prefix + ', ' + name + '!' : prefix + '!';
        var els = document.querySelectorAll(sel);
        Array.prototype.forEach.call(els, function (el) {
          el.textContent = text;
        });
      }).catch(function () {});
    }

  };

  (function () {
    function isLoggedIn() {
      return window.LokaliAPI && window.LokaliAPI.getToken && window.LokaliAPI.getToken();
    }
    var path = window.location.pathname;
    var dashboardPrefix = '/vendor-dashboard';
    if (!isLoggedIn() && path.indexOf(dashboardPrefix) === 0) {
      window.location.href = '/login';
    }
  })();

})();

// The legacy initVendorDashboardSidebar drawer (keyed off #hamburger-btn /
// #sidebar-close-btn) was deleted 2026-07-22: those ids exist on no published
// page, and the live mobile drawer is lokali-dashboard-mobile-nav.js \u2014 keeping
// both risked two drawer systems binding the same sidebar if Webflow ever
// reintroduced the ids.

// Wire the static "View My Listing" sidebar link to the vendor's public page.
// The Webflow template ships it with a dead href (/dashboard//view-listing → 404);
// repoint it to golokali.com/{slug} (clean URL via the Cloudflare Worker), falling
// back to /vendor?id={id} until the vendor has saved a slug. Runs on every dashboard
// page since the sidebar (and this script) is sitewide on /vendor-dashboard.
(function wireViewListingLink() {
  'use strict';

  var ORIGIN = 'https://www.golokali.com';

  function findLink() {
    var byHref = document.querySelector('a[href*="view-listing"]');
    if (byHref) return byHref;
    var links = document.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      if (/^\s*view\s*my\s*listing\s*$/i.test(links[i].textContent || '')) return links[i];
    }
    return null;
  }

  function publicListingUrl(v) {
    return v && v.slug ? (ORIGIN + '/' + v.slug) : (ORIGIN + '/vendor?id=' + (v && v.id));
  }

  var attempts = 0;

  function retry() {
    // The template href is a dead 404 until this rewrite lands, so don't give
    // up on one failed fetch (usually a transient rate limit).
    if (attempts < 3) setTimeout(run, 3000 * attempts);
  }

  function run() {
    var link = findLink();
    if (!link) return;
    if (!(window.LokaliAPI && window.LokaliAPI.vendors && window.LokaliAPI.vendors.me)) {
      setTimeout(run, 300);
      return;
    }
    attempts++;
    window.LokaliAPI.vendors.me().then(function (res) {
      if (!res || res.error || !res.data) return retry();
      var v = res.data.vendor || res.data;
      if (!v || (!v.slug && v.id == null)) return retry();
      link.setAttribute('href', publicListingUrl(v));
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
    }).catch(retry);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

// Wire the sidebar "Logout" button site-wide on the dashboard. The Webflow
// template ships #button-logout with a dead href (/dashboard/logout → 404), and
// the real click handler is inline ONLY on the dashboard home page — so on every
// OTHER dashboard page (settings/profile/services/products/analytics/leads) the
// button fell through to that 404. This script loads on all /vendor-dashboard
// pages, so bind here: prefer LokaliAuth.signOut() (full sign-out; LokaliClerk is
// its compat alias), with a token-clear + /login fallback if the auth controller
// isn't present. Idempotent (dataset flag);
// on the home page the inline handler also runs — benign, its sync redirect wins.
(function wireLogoutButton() {
  'use strict';

  function doSignOut(e) {
    if (e) e.preventDefault();
    if (window.LokaliAuth && typeof window.LokaliAuth.signOut === 'function') {
      window.LokaliAuth.signOut();
      return;
    }
    if (window.LokaliClerk && typeof window.LokaliClerk.signOut === 'function') {
      window.LokaliClerk.signOut();
      return;
    }
    try {
      if (window.LokaliAPI && window.LokaliAPI.clearToken) window.LokaliAPI.clearToken();
    } catch (err) {}
    window.location.href = '/login';
  }

  function run() {
    var btn = document.getElementById('button-logout');
    if (!btn || btn.dataset.lokaliLogoutBound) return;
    btn.dataset.lokaliLogoutBound = '1';
    btn.addEventListener('click', doSignOut);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

