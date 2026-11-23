/**
 * Lokali — Homepage v3 (2026-11-22, "Shophand style" redesign, F: "Yes, build it").
 *
 * Builds the homepage on top of the Webflow page without touching the
 * Designer. Approved mockup: https://claude.ai/artifact/CoJcySrr3XVrZVzUmoyiYH
 * (v6, after F's answers and the design panel's fixes). Words:
 * docs/marketing/homepage-words-shophand-style-2026-11.md.
 *
 * Order on the page:
 *   hero (real H1 + lede, rewritten in place so the H1 element Google reads
 *   stays the same node; search pill; small Desk + business links; the
 *   rotating arch) → "Meet your neighbors" (lokali-neighbors.js, mounts right
 *   after the hero) → Shop by category → the worries (four tiles in shoppers'
 *   own words, lavender band with a scalloped top) → How it works (3 steps +
 *   the nine areas) → the Desk (lokali-desk.js fills #lok-desk-slot) → Follow
 *   → For businesses (light orange, no violet inside) → Why people trust it →
 *   Why I built Lokali (founder note) → the bold violet ending.
 * The old "What is Lokali" section (.wi-section) and the retired sections
 * (.section-3..6, .lcs-section) are hidden; the woman-owned line moves into
 * "Why people trust it".
 *
 * Photo picks live in HERO / CATS / FOLLOW_IMG / FACES below: changing one is
 * an edit here + a script release (no SQL). Vendor rows are only consulted to
 * drop a pick whose storefront is no longer published and to count storefronts.
 *
 * Deploy: Webflow REGISTERED script (`lokalihome`, page-level on Home) —
 * the Data API 406s script tags in Home's freeform code, so a version bump
 * is a re-register with the new @1.4.N URL + SRI hash (see neighbors.js).
 * Keep this file byte-identical in scripts/ and lokali-webflow-scripts/scripts/.
 */
(function () {
  'use strict';

  var STYLE_ID = 'lok-home-style';
  var MEDIA = 'https://api.golokali.com/storage/v1/object/public/vendor-media/';

  // ---- F's picks (2026-10-14) ----------------------------------------------
  // Hero: portrait photos with a person in them, rotated in this order.
  var HERO = [
    { vid: 627, slug: 'agash', name: 'Agash', owner: '', town: 'Tomball',
      img: MEDIA + '627/portfolio/murb222ndyubmc.webp', alt: 'A polka-dot dress by Agash' },
    { vid: 578, slug: 'the-fairytale-spa-woodland', name: 'The Fairytale Spa Woodlands', owner: 'Cristina', town: 'Spring',
      img: MEDIA + '578/portfolio/mue4v369frpnyh.webp', alt: 'Cristina of The Fairytale Spa with a young guest' },
    { vid: 685, slug: 'baxter-blue-woodworks', name: 'Baxter Blue Woodworks', owner: 'Russ', town: 'Conroe',
      img: 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/6acbb8dce04c53f33d9fb8a2_ne-landing-russ.jpg', alt: 'Russ of Baxter Blue Woodworks holding a turned wooden bowl, his dog on his lap' },
    { vid: 673, slug: 'baby-pima', name: 'Baby Pima', owner: 'Sofia', town: 'Spring',
      img: MEDIA + '673/portfolio/muvlpqm170bcji.webp', alt: 'A baby in a pima cotton outfit by Baby Pima' }
  ];
  // Category tiles: F's saved picks (artifact picker, 2026-10-14 17:46Z).
  var CATS = [
    { slug: 'handcrafted',  label: 'Handmade & Custom',       vid: 447, from: 'Cherry Dot Store',          img: MEDIA + '447/portfolio/mu02wb0q2pgvfs.webp', pos: '50% 50%' },
    { slug: 'home',         label: 'Home & Property',         vid: 431, from: 'Madrone Painting LLC',      img: MEDIA + '431/portfolio/mu04wxycnnez00.webp', pos: '40% 50%' },
    { slug: 'events',       label: 'Events & Entertainment',  vid: 578, from: 'The Fairytale Spa Woodlands', img: MEDIA + '578/portfolio/mue4uyxcm7y9ip.webp', pos: '50% 40%' },
    { slug: 'fashion',      label: 'Clothing & Accessories',  vid: 286, from: 'Quori and Lace',            img: MEDIA + '286/portfolio/mt93l791x3pzbrv2.jpg', pos: '50% 30%' },
    { slug: 'food',         label: 'Food',                    vid: 539, from: "Mia's Table",              img: MEDIA + '539/portfolio/mubhlk7f3n0n3w.avif', pos: '50% 50%' },
    { slug: 'children',     label: 'Children',                vid: 610, from: 'Engaged Minds Academy',     img: MEDIA + '610/service/muiez549uibmuv.webp', pos: '50% 40%' },
    { slug: 'business',     label: 'Business',                vid: 260, from: 'Laso Business Consulting',  img: MEDIA + '260/service/svc-b33d4144a2.jpg',   pos: '50% 50%' },
    { slug: 'professional', label: 'Professional Services',   vid: 672, from: 'The Fitzpatrick Group',     img: MEDIA + '672/service/mux09frtbzqy9t.webp',  pos: '50% 25%' },
    // F 2026-11-10: Beauty added (Sunless Daze, the first live Beauty vendor). Photo = her 'The 8 hour' tan cover, the blue-dress shot (F: the wedding photo 'looks like a wedding photographer')
    { slug: 'beauty',       label: 'Beauty',                  vid: 821, from: 'Sunless Daze',              img: MEDIA + '821/service/mw1c33h2ttenkt.webp',  pos: '85% 50%' },
    { slug: 'wellness',     label: 'Wellness',                vid: 688, from: 'ANIKO Lifestyle & Wellness', img: MEDIA + '688/service/mv06fj6sz6s6e3.jpg',   pos: '50% 50%' }
  ];
  // The nine open areas, in the order the city cards use (Conroe + Shenandoah
  // 2026-10-11, Sugar Land 2026-10-15). `id` = the Supabase locations row the
  // Market saves in localStorage (LOKALI_BROWSE_AREA), `slug` = the alias the
  // Market's ?area= accepts (see lokali-browse CAT-LINK).
  var AREAS = [
    { id: '1',  slug: 'the-woodlands', name: 'The Woodlands' },
    { id: '2',  slug: 'woodforest',    name: 'Woodforest' },
    { id: '40', slug: 'shenandoah',    name: 'Shenandoah' },
    { id: '4',  slug: 'conroe',        name: 'Conroe' },
    { id: '33', slug: 'spring',        name: 'Spring' },
    { id: '32', slug: 'tomball',       name: 'Tomball' },
    { id: '34', slug: 'katy',          name: 'Katy' },
    { id: '41', slug: 'sugar-land',    name: 'Sugar Land' },
    { id: '3',  slug: 'houston',       name: 'Houston' }
  ];
  var AREA_KEY = 'LOKALI_BROWSE_AREA';
  // Follow block photo (Delightful Designs' fall porch, the Neighborhood Edit arch).
  var FOLLOW_IMG = { vid: 430, slug: 'delightful-designs', from: 'Delightful Designs', town: 'Katy',
    img: MEDIA + '430/service/mu1rhkbagola0c.webp' };
  // Vendor invite face stack (owner photos; a failed load just drops the face).
  var FACES = [
    { vid: 685, img: MEDIA + '685/profile/bbw_owner.jpg' },
    { vid: 539, img: MEDIA + '539/owner/muylfkmqvv1iar.webp' },
    { vid: 672, img: MEDIA + '672/kamelascarbeck.webp' },
    { vid: 250, img: MEDIA + '250/owner/mstklj2a9qvkxxv2.jpg' },
    { vid: 688, img: MEDIA + '688/owner/mv03xtkmr659cc.jpg' }
  ];
  var ROTATE_MS = 4000; // F 2026-10-23: "every 3-5 seconds" (was 7000)

  // ---- icons (Font Awesome Free 6.7.2, inline, no emoji) ------------------
  var I_SEARCH = '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>';
  var I_PIN = '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>';
  var I_CHEV = '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>';
  var I_ARROW = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>';
  var I_HEART = '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z"/></svg>';

  // Founder note photo: the same picture as the About page (F 2026-11-22).
  var FOUNDER_IMG = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/6ace7bd4e6c66ad637d7db88_francesca.webp';
  var AREA_COUNT = 9; // shown in "Why people trust it"; keep in step with AREAS

  // The four worries, in shoppers' own words (docs/marketing/
  // voice-of-customer-reddit-facebook-2026-10.md, sections 2.3 to 2.6).
  var WORRIES = [
    { cls: 'w1', q: 'Ghosted after asking for a quote', s: 'Heard from shoppers everywhere',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V10a8 8 0 0 0-8-8z"/></svg>' },
    { cls: 'w2', q: 'Everyone in the group recommends themselves', s: 'Every local group, every week',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/></svg>' },
    { cls: 'w3', q: 'Five stars, but are they real?', s: 'Nobody trusts perfect scores',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>' },
    { cls: 'w4', q: 'I didn’t even know they were here', s: 'The best people aren’t on any map',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>' }
  ];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var F = '"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif';
    var css =
      // retired sections + the old "What is Lokali" + the old hero grid
      '.section-3,.section-4,.section-5,.section-6,.lcs-section{display:none!important;}' +
      'html.lok-home3 .wi-section{display:none!important;}' +
      'html.lok-home3 .section.hero.v18>div:not(#lok-hero){display:none!important;}' +
      // F 2026-11-22: the hero needs its own band, so it is lavender with a scalloped white bottom edge
      'html.lok-home3 .section.hero.v18{background:#F3EBFF!important;padding:56px 0 100px!important;min-height:0!important;position:relative;}' +
      '.lok-hero-wave{position:absolute;left:0;right:0;bottom:-1px;display:block;width:100%;height:28px;}' +
      // shared
      '.lok-wrap{max-width:1240px;margin:0 auto;padding:0 40px;font-family:' + F + ';}' +
      '.lok-ul{color:#6002EE!important;font-weight:700;text-decoration:underline!important;text-underline-offset:3px;text-decoration-thickness:1.5px;}' +
      '.lok-ul:hover{color:#4B02BB!important;}' +
      '.lok-cap{font-size:13px;color:#4A4761;}' +
      '.lok-cap b,.lok-cap a{color:#6002EE;font-weight:700;text-decoration:none;}' +
      '.lok-band{padding:88px 0;font-family:' + F + ';color:#1A1829;}' +
      '.lok-center{text-align:center;}' +
      '.lok-eye{font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#6002EE;margin:0 0 12px;}' +
      '.lok-h2{font-family:' + F + ';font-size:46px;line-height:1.08;font-weight:800;letter-spacing:-.03em;color:#1A1829;margin:0;text-wrap:balance;}' +
      '.lok-sub{font-size:18px;line-height:1.6;color:#4A4761;margin:16px 0 0;max-width:60ch;}' +
      '.lok-center .lok-sub{margin-left:auto;margin-right:auto;}' +
      '.lok-btn{display:inline-flex;align-items:center;justify-content:center;background:#6002EE;color:#fff!important;font-weight:800;border-radius:999px;padding:16px 28px;font-size:15.5px;text-decoration:none!important;border:2px solid transparent;font-family:' + F + ';}' +
      '.lok-btn:hover{background:#4B02BB;}' +
      '.lok-btn:focus-visible,.lok-wbtn:focus-visible,.lok-obtn:focus-visible{outline:3px solid #6002EE;outline-offset:3px;}' +
      // hero
      '#lok-hero{display:grid;grid-template-columns:1.05fr .95fr;grid-template-areas:"txt fig";column-gap:64px;align-items:center;}' +
      '#lok-hero>*{min-width:0;}' +
      '.lok-hero-txt{grid-area:txt;}' +
      '#lok-hero .lok-arch{grid-area:fig;}' +
      '#lok-hero h1{font-family:' + F + '!important;font-size:72px!important;line-height:1.02!important;font-weight:800!important;letter-spacing:-.04em!important;color:#1A1829!important;margin:0!important;text-wrap:balance;}' +
      '#lok-hero h1 .lok-v{color:#6002EE;display:block;}' +
      '#lok-hero .lok-lede{font-family:' + F + '!important;font-size:19px!important;line-height:1.6!important;color:#4A4761!important;margin:22px 0 28px!important;max-width:30em;}' +
      '.lok-hs{display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #D9CCF5;border-radius:999px;padding:6px 6px 6px 22px;height:64px;max-width:600px;margin:0;}' +
      '.lok-hs:focus-within{border-color:#6002EE;}' +
      '.lok-hs-ic{color:#6002EE;width:17px;height:17px;flex:none;display:inline-flex;}' +
      '.lok-hs-ic svg{width:100%;height:100%;}' +
      '.lok-hs input[type=search]{flex:1;min-width:0;border:0;outline:0;background:transparent;font:600 16px/1.2 ' + F + ';color:#1A1829;padding:0;margin:0;height:40px;-webkit-appearance:none;appearance:none;box-shadow:none;}' +
      '.lok-hs input[type=search]::placeholder{color:#1A1829;opacity:1;}' +
      '.lok-hs input[type=search]::-webkit-search-decoration,.lok-hs input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none;}' +
      '.lok-hs-area{position:relative;display:inline-flex;align-items:center;gap:7px;background:#F3EBFF;border-radius:999px;padding:0 12px 0 13px;height:40px;flex:none;color:#1A1829;cursor:pointer;margin:0;}' +
      '.lok-hs-area .lok-hs-ic{width:12px;height:12px;}' +
      '.lok-hs-area .lok-hs-chev{width:9px;height:9px;color:#6E6A85;}' +
      '.lok-hs-area select{-webkit-appearance:none;appearance:none;border:0;outline:0;background:transparent;font:700 13.5px/1 ' + F + ';color:#1A1829;padding:0;margin:0;height:40px;max-width:150px;cursor:pointer;}' +
      '.lok-hs-area:focus-within{box-shadow:0 0 0 2px #C9B3F2;}' +
      '.lok-hs-go{width:48px;height:48px;border-radius:50%;background:#6002EE;color:#fff;border:0;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer;padding:0;}' +
      '.lok-hs-go svg{width:17px;height:17px;}' +
      '.lok-hs-go:hover{background:#4B02BB;}' +
      '.lok-hs-go:focus-visible,.lok-hs input:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}' +
      '.lok-hero-links{margin:16px 0 0;font:500 15px/1.6 ' + F + ';color:#4A4761;}' +
      '.lok-hero-links a{color:#5A12D8;font-weight:700;text-decoration:underline;text-underline-offset:3px;}' +
      '.lok-hero-links .lok-dot{margin:0 8px;color:#B79CF2;}' +
      '.lok-arch{max-width:450px;width:100%;margin:0 0 0 auto;justify-self:end;}' +
      '.lok-slides{position:relative;aspect-ratio:4/5;border-radius:999px 999px 18px 18px;overflow:hidden;background:#E9E0FB;}' +
      '.lok-slides img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 25%;opacity:0;transition:opacity .9s ease;}' +
      '.lok-slides img.on{opacity:1;}' +
      '.lok-arch .lok-cap{margin:12px 0 0;text-align:center;min-height:1.4em;transition:opacity .4s;}' +
      '.lok-arch .lok-cap.fade{opacity:0;}' +
      '.lok-dots{display:flex;justify-content:center;gap:6px;margin-top:10px;}' +
      '.lok-dots i{width:6px;height:6px;border-radius:50%;background:#D9CCF5;display:block;}' +
      '.lok-dots i.on{background:#6002EE;}' +
      // category tiles (light orange, orange accents only)
      '.lok-cats{background:#FDE6F2;padding:84px 0;font-family:' + F + ';}' +
      '.lok-cats .lok-ul{color:#B0006A!important;}.lok-cats .lok-ul:hover{color:#8A0053!important;}.lok-cats .lok-cap b{color:#B0006A;}' + // logo pink family (F 2026-11-22): peach + orange off

      '.lok-sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:30px;flex-wrap:wrap;}' +
      '.lok-sec-head h2{font-size:38px;line-height:1.1;font-weight:800;letter-spacing:-.025em;color:#1A1829;margin:0;}' +
      '.lok-sec-head .lok-ul{font-size:15px;white-space:nowrap;}' +
      '.lok-cat-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:34px 20px;}' +
      '.lok-cat{display:flex;flex-direction:column;min-width:0;text-decoration:none;color:inherit;}' +
      '.lok-cat-img{position:relative;display:block;aspect-ratio:1/1;border-radius:16px;overflow:hidden;background:#F9CDE4;}' +
      '.lok-cat-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease;}' +
      '.lok-cat:hover .lok-cat-img img{transform:scale(1.04);}' +
      '.lok-cat-t{font-size:16px;font-weight:800;margin-top:12px;line-height:1.25;letter-spacing:-.005em;color:#1A1829;}' +
      '.lok-cat .lok-cap{margin-top:3px;font-size:12.5px;min-height:1.4em;}' +
      // the worries (lavender, scalloped top edge)
      '.lok-wave{display:block;width:100%;height:28px;margin-bottom:-1px;}' +
      '.lok-worries{background:#F3EBFF;padding-top:56px;}' +
      '.lok-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:44px;text-align:left;}' +
      '.lok-tile{border-radius:22px;padding:26px 22px 24px;display:flex;flex-direction:column;gap:18px;min-height:220px;}' +
      '.lok-tile .lok-ic{width:52px;height:60px;border-radius:999px 999px 12px 12px;background:#fff;display:grid;place-items:center;}' +
      '.lok-tile .lok-ic svg{width:26px;height:26px;}' +
      '.lok-tile q{font-size:19px;font-weight:800;line-height:1.3;quotes:"\\201C" "\\201D";}' +
      '.lok-tile small{font-size:13px;margin-top:auto;line-height:1.45;}' +
      '.lok-tile.w1{background:#FBE9F2;color:#A63D74;}.lok-tile.w2{background:#E6F0FC;color:#1D5A9E;}' +
      '.lok-tile.w3{background:#FFF4CC;color:#7A5600;}.lok-tile.w4{background:#E4F7EE;color:#1A6640;}' +
      '.lok-answer{margin:44px 0 0;font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.25;text-wrap:balance;}' +
      '.lok-answer span{color:#6002EE;}' +
      // how it works
      '.lok-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin:44px 0 0;padding:0;list-style:none;text-align:left;}' +
      '.lok-steps li{border:2px solid #D9CCF5;border-radius:22px;padding:28px;margin:0;min-width:0;}' +
      '.lok-num{width:44px;height:44px;border-radius:50%;background:#F3EBFF;color:#6002EE;font-weight:800;display:grid;place-items:center;margin-bottom:18px;}' +
      '.lok-steps h3{font-size:22px;font-weight:800;margin:0 0 8px;letter-spacing:-.01em;line-height:1.25;color:#1A1829;}' +
      '.lok-steps p{font-size:15.5px;color:#4A4761;margin:0;line-height:1.6;}' +
      '.lok-areas{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px;}' +
      '.lok-area{display:inline-flex;align-items:center;gap:6px;background:#F3EBFF;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:600;color:#1A1829;text-decoration:none;}' +
      '.lok-area svg{width:11px;height:11px;color:#6002EE;}' +
      '.lok-area:hover{background:#E2D4FF;}' +
      '.lok-ask{display:inline-block;margin-top:12px;font-size:13.5px;}' +
      // follow (white, arched photo)
      '.lok-fol-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:64px;align-items:center;}' +
      '.lok-fol-pic{display:flex;flex-direction:column;}' +
      '.lok-fol-pic img{display:block;width:100%;max-width:440px;aspect-ratio:4/5;object-fit:cover;border-radius:999px 999px 28px 28px;background:#F3EBFF;}' +
      '.lok-fol-pic .lok-cap{margin:12px 0 0;}' +
      '.lok-fol .lok-btn{margin-top:28px;}' +
      // for businesses (light orange, no violet inside)
      '.lok-door{background:#E6EFFB;}' + // sky family (F 2026-11-22): orange off the site; this band previews the For vendors page color
      '.lok-door .lok-eye{color:#1D4E9E;}' +
      '.lok-door .lok-h2 span{color:#1D4E9E;}' +
      '.lok-faces{display:flex;align-items:center;justify-content:center;gap:12px;margin:26px 0;flex-wrap:wrap;}' +
      '.lok-stack{display:flex;flex:none;}' +
      '.lok-stack img{width:44px;height:44px;border-radius:50%;object-fit:cover;border:3px solid #E6EFFB;margin-left:-12px;background:#CFDDF3;}' +
      '.lok-stack img:first-child{margin-left:0;}' +
      '.lok-faces span{font-size:15px;font-weight:600;color:#1D4E9E;}' +
      '.lok-obtn{display:inline-flex;align-items:center;justify-content:center;background:#1D4E9E;color:#fff!important;font-weight:800;border-radius:999px;padding:16px 28px;font-size:15.5px;text-decoration:none!important;}' +
      '.lok-obtn:hover{background:#163E7E;}' +
      '.lok-door small{display:block;margin-top:14px;font-size:14px;color:#1D4E9E;line-height:1.5;}' +
      // why people trust it
      '.lok-proof{background:#F3EBFF;}' +
      '.lok-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin:44px 0 0;padding:0;list-style:none;text-align:left;}' +
      '.lok-stats li{background:#fff;border-radius:22px;padding:26px 22px;margin:0;}' +
      '.lok-stats b{display:block;font-size:30px;font-weight:800;color:#6002EE;letter-spacing:-.02em;line-height:1.15;margin-bottom:8px;}' +
      '.lok-stats span{color:#4A4761;font-size:15px;}' +
      '.lok-owned{margin:28px 0 0;color:#4A4761;font-size:15px;}' +
      // founder note
      '.lok-note-in{max-width:820px;margin:0 auto;}' +
      '.lok-note-card{display:grid;grid-template-columns:120px minmax(0,1fr);gap:32px;align-items:start;}' +
      '.lok-note-arch{width:120px;height:150px;border-radius:999px 999px 18px 18px;background:#F3EBFF;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;}' +
      '.lok-note-arch img{width:120px;height:120px;display:block;object-fit:cover;}' +
      '.lok-note-card p{font-size:20px;line-height:1.65;margin:0 0 18px;color:#1A1829;}' +
      '.lok-note-card .lok-joke{font-weight:700;color:#6002EE;}' +
      '.lok-note-card .lok-sig{font-size:16px;color:#4A4761;font-weight:600;margin:0;}' +
      // the bold ending
      '.lok-end{background:#6002EE;padding:112px 0;}' +
      '.lok-end .lok-h2{color:#fff;font-size:60px;}' +
      '.lok-end .lok-sub{color:#E9DDFF;margin-bottom:34px;}' +
      '.lok-btns{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;}' +
      '.lok-wbtn{display:inline-flex;align-items:center;justify-content:center;background:#fff;color:#6002EE!important;font-weight:800;border-radius:999px;padding:16px 28px;font-size:15.5px;text-decoration:none!important;border:2px solid #fff;}' +
      '.lok-wbtn:hover{background:#F3EBFF;border-color:#F3EBFF;}' +
      '.lok-wbtn.lok-out{background:transparent;color:#fff!important;}' +
      '.lok-wbtn.lok-out:hover{background:rgba(255,255,255,.12);}' +
      '.lok-end .lok-wbtn:focus-visible{outline-color:#fff;}' +
      // responsive
      '@media(max-width:1149px){.lok-cat-grid{grid-template-columns:repeat(4,minmax(0,1fr));}' +
        '#lok-hero{grid-template-columns:1fr;grid-template-areas:"txt" "fig";text-align:center;}' +
        '#lok-hero h1{font-size:56px!important;}#lok-hero .lok-lede{margin:18px auto 0!important;}.lok-hs{margin:26px auto 0;}' +
        '.lok-arch{margin:36px auto 0;justify-self:center;}.lok-tiles{grid-template-columns:repeat(2,minmax(0,1fr));}.lok-tile{min-height:0;}}' +
      '@media(max-width:991px){.lok-wrap{padding:0 24px;}.lok-cat-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:26px 16px;}' +
        '.lok-band,.lok-cats{padding-top:56px!important;padding-bottom:56px!important;}html.lok-home3 .section.hero.v18{padding-top:40px!important;padding-bottom:76px!important;}.lok-worries{padding-top:40px!important;}.lok-end{padding:80px 0!important;}' +
        '.lok-h2{font-size:34px;}.lok-end .lok-h2{font-size:40px;}.lok-sec-head h2{font-size:30px;}.lok-answer{font-size:24px;}' +
        '.lok-steps{grid-template-columns:1fr;}.lok-fol-grid{grid-template-columns:1fr;gap:32px;}.lok-fol-pic img{max-width:360px;}' +
        '.lok-stats{grid-template-columns:1fr;}}' +
      '@media(max-width:767px){' +
        '#lok-hero h1{font-size:42px!important;}#lok-hero .lok-lede{font-size:16px!important;margin:14px auto 0!important;}' +
        '.lok-hs{display:none;}' + // the two-row phone header already carries the search box (#179)
        '.lok-arch{margin:28px auto 0;}' +
        '.lok-wrap{padding:0 16px;}.lok-cat-grid{grid-template-columns:1fr 1fr;gap:24px 12px;}.lok-cat-img{border-radius:14px;}.lok-cat-t{font-size:14.5px;margin-top:9px;}.lok-cat .lok-cap{font-size:12px;}' +
        '.lok-sub{font-size:16px;}.lok-tile q{font-size:17px;}' +
        '.lok-note-card{grid-template-columns:1fr;gap:20px;}.lok-note-card p{font-size:18px;}}' +
      '@media(max-width:480px){.lok-tiles{grid-template-columns:1fr;}.lok-btns .lok-wbtn,.lok-door .lok-obtn{width:100%;}}' +
      '@media(prefers-reduced-motion:reduce){.lok-slides img,.lok-arch .lok-cap,.lok-cat-img img{transition:none;}}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- helpers -------------------------------------------------------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svgSpan(cls, svg) { var s = el('span', cls); s.innerHTML = svg; return s; } // static SVG only
  // CLEAN-P23: ask the Storage render endpoint for a sized variant (helper
  // in lokali-supabase-client.js as window.LokaliImg; absent = the full file).
  function imgSet(img, url, w) {
    var I = window.LokaliImg;
    if (I && typeof I.set === 'function') I.set(img, url, w); else img.src = url;
  }
  function vendorHref(slug) { return '/' + encodeURIComponent(slug); }
  function reducedMotion() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  // ---- hero ----------------------------------------------------------------
  function heroCaption(p) {
    var cap = el('p', 'lok-cap');
    if (p.owner) cap.appendChild(document.createTextNode(p.owner + ', from '));
    else cap.appendChild(document.createTextNode('From '));
    var a = el('a', null, p.name);
    a.href = vendorHref(p.slug);
    cap.appendChild(a);
    cap.appendChild(document.createTextNode(', ' + p.town));
    return cap;
  }

  function buildArch(picks) {
    var fig = el('figure', 'lok-arch');
    fig.style.margin = '';
    var slides = el('div', 'lok-slides');
    var dots = el('div', 'lok-dots');
    picks.forEach(function (p, i) {
      var link = el('a');
      link.href = vendorHref(p.slug);
      link.setAttribute('aria-label', p.name);
      link.style.cssText = 'position:absolute;inset:0;display:block;';
      var img = el('img');
      img.alt = p.alt || p.name;
      img.decoding = 'async';
      if (i === 0) { img.className = 'on'; imgSet(img, p.img, 900); }
      else { img.setAttribute('data-src', p.img); }
      link.appendChild(img);
      slides.appendChild(link);
      var d = el('i'); if (i === 0) d.className = 'on'; dots.appendChild(d);
    });
    fig.appendChild(slides);
    var capWrap = el('div');
    capWrap.appendChild(heroCaption(picks[0]));
    fig.appendChild(capWrap);
    if (picks.length > 1) fig.appendChild(dots);

    if (picks.length > 1 && !reducedMotion()) {
      // Photos 2..n load after the page is up, so the hero never waits on them.
      var loadRest = function () {
        var imgs = slides.querySelectorAll('img[data-src]');
        for (var k = 0; k < imgs.length; k++) { imgSet(imgs[k], imgs[k].getAttribute('data-src'), 900); imgs[k].removeAttribute('data-src'); }
      };
      if (document.readyState === 'complete') setTimeout(loadRest, 600);
      else window.addEventListener('load', function () { setTimeout(loadRest, 600); });

      var i = 0, paused = false;
      fig.addEventListener('mouseenter', function () { paused = true; });
      fig.addEventListener('mouseleave', function () { paused = false; });
      fig.addEventListener('focusin', function () { paused = true; });
      fig.addEventListener('focusout', function () { paused = false; });
      setInterval(function () {
        if (paused || document.hidden || !fig.offsetParent) return;
        var imgs = slides.querySelectorAll('img'), ds = dots.children;
        var next = (i + 1) % picks.length;
        if (imgs[next].getAttribute('data-src')) return; // not loaded yet, try next tick
        imgs[i].classList.remove('on'); ds[i].classList.remove('on');
        i = next;
        imgs[i].classList.add('on'); ds[i].classList.add('on');
        var cap = capWrap.firstChild;
        cap.classList.add('fade');
        setTimeout(function () { capWrap.replaceChild(heroCaption(picks[i]), capWrap.firstChild); }, 380);
      }, ROTATE_MS);
    }
    return fig;
  }

  function buildSearch() {
    var form = el('form', 'lok-hs');
    form.id = 'lok-hs';
    form.action = '/the-market';
    form.method = 'get';
    form.setAttribute('role', 'search');
    form.appendChild(svgSpan('lok-hs-ic', I_SEARCH));
    var input = el('input');
    input.type = 'search';
    input.name = 'q';
    input.placeholder = 'What do you need?';
    input.setAttribute('aria-label', 'What do you need?');
    input.autocomplete = 'off';
    form.appendChild(input);

    var area = el('label', 'lok-hs-area');
    area.appendChild(svgSpan('lok-hs-ic', I_PIN));
    var sel = el('select');
    sel.name = 'area';
    sel.setAttribute('aria-label', 'Your area');
    var o0 = el('option', null, 'Choose your area'); o0.value = '';
    sel.appendChild(o0);
    var saved = null;
    try { saved = localStorage.getItem(AREA_KEY); } catch (e) {}
    AREAS.forEach(function (a) {
      var o = el('option', null, a.name); o.value = a.slug;
      if (saved && String(saved) === a.id) o.selected = true; // returning visitors see their saved area
      sel.appendChild(o);
    });
    area.appendChild(sel);
    area.appendChild(svgSpan('lok-hs-ic lok-hs-chev', I_CHEV));
    form.appendChild(area);

    var go = el('button', 'lok-hs-go');
    go.type = 'submit';
    go.setAttribute('aria-label', 'Search the Market');
    go.innerHTML = I_ARROW;
    form.appendChild(go);

    // Clean URLs: only the filled-in parts travel (the Market reads ?q= and ?area=).
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var q = String(input.value || '').trim(), a = sel.value, parts = [];
      if (q) parts.push('q=' + encodeURIComponent(q));
      if (a) parts.push('area=' + encodeURIComponent(a));
      window.location.href = '/the-market' + (parts.length ? '?' + parts.join('&') : '');
    });
    return form;
  }

  // ---- category tiles ------------------------------------------------------
  function buildCats() {
    var sec = el('section', 'lok-cats');
    sec.id = 'lok-cats';
    var wrap = el('div', 'lok-wrap');
    var head = el('div', 'lok-sec-head');
    var hw = el('div');
    hw.appendChild(el('h2', null, 'Shop by category'));
    head.appendChild(hw);
    var all = el('a', 'lok-ul', 'See every storefront');
    all.href = '/the-market';
    head.appendChild(all);
    wrap.appendChild(head);

    var grid = el('div', 'lok-cat-grid');
    CATS.forEach(function (c) {
      var a = el('a', 'lok-cat');
      a.href = '/the-market?category=' + encodeURIComponent(c.slug);
      a.setAttribute('data-vid', String(c.vid));
      var box = el('span', 'lok-cat-img');
      var img = el('img');
      img.alt = c.from + ', ' + c.label + ' on Lokali';
      img.loading = 'lazy';
      img.decoding = 'async';
      if (c.pos) img.style.objectPosition = c.pos;
      imgSet(img, c.img, 600);
      img.addEventListener('error', function () { if (img.parentNode) img.parentNode.removeChild(img); });
      box.appendChild(img);
      a.appendChild(box);
      a.appendChild(el('span', 'lok-cat-t', c.label));
      var cap = el('span', 'lok-cap');
      cap.appendChild(document.createTextNode('From '));
      cap.appendChild(el('b', null, c.from));
      a.appendChild(cap);
      grid.appendChild(a);
    });
    // F 2026-11-10: the "The whole Market" tile was retired so the ten category
    // tiles make two even rows of five; "See every storefront" (top right) stays.
    wrap.appendChild(grid);
    sec.appendChild(wrap);
    return sec;
  }

  function mountHero(hero) {
    var h1 = hero.querySelector('h1');
    var lede = hero.querySelector('p.mg-bottom-24px') || (h1 && h1.nextElementSibling && h1.nextElementSibling.tagName === 'P' ? h1.nextElementSibling : null);
    if (!h1) return;

    var grid = el('div');
    grid.id = 'lok-hero';
    grid.className = 'lok-wrap';
    var txt = el('div', 'lok-hero-txt');
    // F 2026-11-22: "Good people are closer than you think." The H1 node is
    // kept (only its words change), so the page keeps exactly one H1.
    h1.textContent = '';
    h1.appendChild(document.createTextNode('Good people are '));
    h1.appendChild(el('span', 'lok-v', 'closer than you think.'));
    txt.appendChild(h1);
    if (!lede) { lede = el('p'); }
    lede.textContent = 'Lokali is the marketplace for local businesses and professionals near you. See who runs each one, read real reviews, and reach them directly.';
    lede.classList.add('lok-lede');
    txt.appendChild(lede);
    txt.appendChild(buildSearch());
    // lokali-desk.js puts "Rather ask a person? Ring the Desk" in front of this.
    var links = el('p', 'lok-hero-links');
    links.id = 'lok-hero-links';
    links.appendChild(document.createTextNode('Have a business? '));
    var biz = el('a', null, 'Open a storefront');
    biz.href = '#lok-door';
    links.appendChild(biz);
    txt.appendChild(links);
    grid.appendChild(txt);
    grid.appendChild(buildArch(HERO));
    hero.appendChild(grid);
    var wave = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wave.setAttribute('class', 'lok-hero-wave');
    wave.setAttribute('viewBox', '0 0 1440 28');
    wave.setAttribute('preserveAspectRatio', 'none');
    wave.setAttribute('aria-hidden', 'true');
    wave.innerHTML = '<path fill="#FFFFFF" d="M0 28V14C60 14 60 0 120 0s60 14 120 14 60-14 120-14 60 14 120 14 60-14 120-14 60 14 120 14 60-14 120-14 60 14 120 14 60-14 120-14 60 14 120 14 60-14 120-14 60 14 120 14V28Z"/>';
    hero.appendChild(wave);
  }

  // ---- the worries ---------------------------------------------------------
  function buildWorries() {
    var frag = document.createDocumentFragment();
    var wave = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wave.setAttribute('class', 'lok-wave');
    wave.setAttribute('viewBox', '0 0 1440 28');
    wave.setAttribute('preserveAspectRatio', 'none');
    wave.setAttribute('aria-hidden', 'true');
    wave.innerHTML = '<path fill="#F3EBFF" d="M0 28V14C60 14 60 0 120 0s60 14 120 14 60-14 120-14 60 14 120 14 60-14 120-14 60 14 120 14 60-14 120-14 60 14 120 14 60-14 120-14 60 14 120 14 60-14 120-14 60 14 120 14V28Z"/>';
    frag.appendChild(wave);
    var sec = el('section', 'lok-band lok-worries lok-center');
    sec.id = 'lok-worries';
    var wrap = el('div', 'lok-wrap');
    wrap.appendChild(el('p', 'lok-eye', 'Sound familiar?'));
    wrap.appendChild(el('h2', 'lok-h2', 'Finding someone good shouldn’t take a 60-comment thread.'));
    wrap.appendChild(el('p', 'lok-sub', 'Most of us still ask around. It works, eventually.'));
    var tiles = el('div', 'lok-tiles');
    WORRIES.forEach(function (w) {
      var t = el('div', 'lok-tile ' + w.cls);
      t.appendChild(svgSpan('lok-ic', w.icon));
      t.appendChild(el('q', null, w.q));
      t.appendChild(el('small', null, w.s));
      tiles.appendChild(t);
    });
    wrap.appendChild(tiles);
    var ans = el('p', 'lok-answer', 'On Lokali, you skip the guessing ');
    ans.appendChild(el('span', null, 'and meet the person.'));
    wrap.appendChild(ans);
    sec.appendChild(wrap);
    frag.appendChild(sec);
    return frag;
  }

  // ---- how it works --------------------------------------------------------
  function buildHow() {
    var sec = el('section', 'lok-band lok-center');
    sec.id = 'lok-how';
    var wrap = el('div', 'lok-wrap');
    wrap.appendChild(el('p', 'lok-eye', 'How it works'));
    wrap.appendChild(el('h2', 'lok-h2', 'Meeting a neighbor takes three steps.'));
    var ol = el('ol', 'lok-steps');
    function step(num, title, text) {
      var li = el('li');
      li.appendChild(el('div', 'lok-num', num));
      li.appendChild(el('h3', null, title));
      li.appendChild(el('p', null, text));
      return li;
    }
    var s1 = step('1', 'Pick your area', 'Nine communities across Greater Houston so far, and growing.');
    var areas = el('div', 'lok-areas');
    AREAS.forEach(function (a) {
      var chip = el('a', 'lok-area');
      chip.href = '/the-market?area=' + encodeURIComponent(a.slug);
      chip.innerHTML = I_PIN; // static SVG
      chip.appendChild(document.createTextNode(a.name));
      areas.appendChild(chip);
    });
    s1.appendChild(areas);
    var ask = el('a', 'lok-ul lok-ask', "Not where you live? Tell us where you are and we'll work on bringing Lokali to you");
    ask.href = '/contact-us';
    s1.appendChild(ask);
    ol.appendChild(s1);
    ol.appendChild(step('2', 'Meet the person', 'Every storefront shows who runs it, in their own words and photos.'));
    ol.appendChild(step('3', 'Say hello', 'Message, text or call them directly. No algorithms, just humans.'));
    wrap.appendChild(ol);
    sec.appendChild(wrap);
    return sec;
  }

  // ---- follow --------------------------------------------------------------
  function buildFollow() {
    var sec = el('section', 'lok-band lok-fol');
    sec.id = 'lok-follow';
    var wrap = el('div', 'lok-wrap lok-fol-grid');
    var pic = el('div', 'lok-fol-pic');
    var link = el('a');
    link.href = vendorHref(FOLLOW_IMG.slug);
    var img = el('img');
    img.alt = 'Front steps styled with white and green pumpkins by ' + FOLLOW_IMG.from;
    img.loading = 'lazy';
    img.decoding = 'async';
    imgSet(img, FOLLOW_IMG.img, 900);
    link.appendChild(img);
    pic.appendChild(link);
    var cap = el('p', 'lok-cap');
    cap.appendChild(document.createTextNode('From '));
    var ca = el('a', null, FOLLOW_IMG.from); ca.href = vendorHref(FOLLOW_IMG.slug);
    cap.appendChild(ca);
    cap.appendChild(document.createTextNode(', ' + FOLLOW_IMG.town));
    pic.appendChild(cap);
    wrap.appendChild(pic);
    var txt = el('div');
    txt.appendChild(el('p', 'lok-eye', 'Follow'));
    txt.appendChild(el('h2', 'lok-h2', 'Never miss your favorite neighbors.'));
    txt.appendChild(el('p', 'lok-sub', 'Tap Follow on any storefront. When they’ll be at a market, a pop-up or a tasting, you’ll hear about it in one email on Thursday morning. That’s it.'));
    var btn = el('a', 'lok-btn', 'Find storefronts to follow');
    btn.href = '/the-market';
    txt.appendChild(btn);
    wrap.appendChild(txt);
    sec.appendChild(wrap);
    return sec;
  }

  // ---- for businesses ------------------------------------------------------
  function buildDoor() {
    var sec = el('section', 'lok-band lok-door lok-center');
    sec.id = 'lok-door';
    var wrap = el('div', 'lok-wrap');
    wrap.appendChild(el('p', 'lok-eye', 'For businesses'));
    var h = el('h2', 'lok-h2', 'Have a business? ');
    h.appendChild(el('span', null, 'Your neighbors are already asking about you.'));
    wrap.appendChild(h);
    wrap.appendChild(el('p', 'lok-sub', 'Open a storefront in minutes. No shop needed, and you show a service area, never your home address.'));
    var faces = el('div', 'lok-faces');
    var stack = el('span', 'lok-stack');
    FACES.forEach(function (f) {
      var img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      imgSet(img, f.img, 96);
      img.addEventListener('error', function () { if (img.parentNode) img.parentNode.removeChild(img); });
      stack.appendChild(img);
    });
    faces.appendChild(stack);
    var line = el('span', null, 'Russ, Arelys, Kamela and more already have one.');
    line.id = 'lok-sell-line';
    faces.appendChild(line);
    wrap.appendChild(faces);
    var btn = el('a', 'lok-obtn', 'Open my storefront');
    btn.href = '/sign-up';
    wrap.appendChild(btn);
    wrap.appendChild(el('small', null, 'Start free. Nobody is billed until there are enough shoppers, and you’ll get a month’s notice first.'));
    sec.appendChild(wrap);
    return sec;
  }

  // ---- why people trust it -------------------------------------------------
  function buildProof() {
    var sec = el('section', 'lok-band lok-proof lok-center');
    sec.id = 'lok-proof';
    var wrap = el('div', 'lok-wrap');
    wrap.appendChild(el('p', 'lok-eye', 'Why people trust it'));
    wrap.appendChild(el('h2', 'lok-h2', 'Built by a neighbor, for neighbors.'));
    var ul = el('ul', 'lok-stats');
    function stat(big, small, id) {
      var li = el('li');
      var b = el('b', null, big); if (id) b.id = id;
      li.appendChild(b);
      li.appendChild(el('span', null, small));
      return li;
    }
    ul.appendChild(stat('Real names', 'and a real face on every storefront'));
    ul.appendChild(stat('Real reviews', 'from real customers, under real names'));
    ul.appendChild(stat(AREA_COUNT + ' communities', 'and counting', 'lok-proof-count'));
    wrap.appendChild(ul);
    // The heading already says "built by a neighbor, for neighbors", so the line under it stays short.
    var own = el('p', 'lok-owned', 'Lokali is woman-owned and minority-owned.');
    wrap.appendChild(own);
    sec.appendChild(wrap);
    return sec;
  }

  // ---- why I built Lokali --------------------------------------------------
  function buildNote() {
    var sec = el('section', 'lok-band lok-note');
    sec.id = 'lok-note';
    var wrap = el('div', 'lok-wrap');
    var inner = el('div', 'lok-note-in');
    inner.appendChild(el('p', 'lok-eye', 'Why I built Lokali'));
    var card = el('div', 'lok-note-card');
    var arch = el('div', 'lok-note-arch');
    var img = el('img');
    img.alt = 'Francesca, founder of Lokali';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = FOUNDER_IMG;
    arch.appendChild(img);
    card.appendChild(arch);
    var body = el('div');
    body.appendChild(el('p', null, 'I always dreamed of running a business of my own, with heart. I also know how hard it is to get noticed when you’re up against billion-dollar companies. So I built Lokali: a place where anyone can make a living with a business of their own, and where their neighbors can actually find them.'));
    body.appendChild(el('p', 'lok-joke', 'I can’t promise the billionaires are nervous. But I like our odds.'));
    body.appendChild(el('p', 'lok-sig', 'Francesca, founder'));
    card.appendChild(body);
    inner.appendChild(card);
    wrap.appendChild(inner);
    sec.appendChild(wrap);
    return sec;
  }

  // ---- the bold ending -----------------------------------------------------
  function buildEnd() {
    var sec = el('section', 'lok-band lok-end lok-center');
    sec.id = 'lok-end';
    var wrap = el('div', 'lok-wrap');
    wrap.appendChild(el('h2', 'lok-h2', 'You shouldn’t need a big company to be found.'));
    wrap.appendChild(el('p', 'lok-sub', 'Every business here started with someone brave enough to try. Come meet them. Or, if that someone is you, come join them.'));
    var btns = el('div', 'lok-btns');
    var a1 = el('a', 'lok-wbtn', 'Meet your neighbors'); a1.href = '/the-market';
    var a2 = el('a', 'lok-wbtn lok-out', 'Open my storefront'); a2.href = '/sign-up';
    btns.appendChild(a1); btns.appendChild(a2);
    wrap.appendChild(btns);
    sec.appendChild(wrap);
    return sec;
  }

  // ---- live vendor check (non-blocking) -----------------------------------
  // Drops a hero slide or a tile credit whose storefront is no longer
  // published, and fills in the storefront counts. Any failure = page as built.
  function reconcile() {
    if (!window.LokaliSupabaseReady || !window.LokaliSupabaseReady.then) return;
    window.LokaliSupabaseReady.then(function (c) {
      return c.from('vendors').select('id').eq('is_publish_ready', true).limit(500);
    }).then(function (res) {
      if (!res || res.error || !Array.isArray(res.data)) return;
      var live = {};
      res.data.forEach(function (v) { if (v && v.id != null) live[String(v.id)] = true; });
      var n = res.data.length;
      var line = document.getElementById('lok-sell-line');
      if (line && n > 3) line.textContent = 'Russ, Arelys, Kamela and ' + (n - 3) + ' more already have one.';
      var cnt = document.getElementById('lok-proof-count');
      if (cnt && n > 3) {
        cnt.textContent = n + ' in ' + AREA_COUNT;
        if (cnt.nextSibling) cnt.nextSibling.textContent = 'neighbors in ' + AREA_COUNT + ' communities, and counting';
      }
      var tiles = document.querySelectorAll('.lok-cat[data-vid]');
      for (var i = 0; i < tiles.length; i++) {
        if (!live[tiles[i].getAttribute('data-vid')]) {
          var img = tiles[i].querySelector('img'), cap = tiles[i].querySelector('.lok-cap');
          if (img && img.parentNode) img.parentNode.removeChild(img);
          if (cap) cap.textContent = ' ';
        }
      }
      var gone = HERO.filter(function (p) { return !live[String(p.vid)]; });
      if (gone.length && gone.length < HERO.length) {
        var fig = document.querySelector('#lok-hero .lok-arch');
        if (fig && fig.parentNode) {
          var keep = HERO.filter(function (p) { return live[String(p.vid)]; });
          fig.parentNode.replaceChild(buildArch(keep), fig);
        }
      }
    }).catch(function (e) {
      try { console.warn('[lokali-home] vendor check skipped:', e && e.message); } catch (x) {}
    });
  }

  // ---- boot ---------------------------------------------------------------
  function start() {
    var hero = document.querySelector('section.hero.v18') || document.querySelector('section.hero');
    var wi = document.querySelector('.wi-section');
    if (!hero || !wi) return; // homepage only
    if (document.getElementById('lok-hero')) return;
    injectStyle();
    var owned = hero.querySelector('.text-block-130'); // the woman-owned line
    mountHero(hero);
    document.documentElement.classList.add('lok-home3');
    // Everything goes in before the (now hidden) "What is Lokali" section.
    // lokali-neighbors.js always mounts right after the hero, so it lands first.
    var slot = el('div');
    slot.id = 'lok-desk-slot'; // lokali-desk.js replaces this with the Desk band
    [buildCats(), buildWorries(), buildHow(), slot, buildFollow(), buildDoor(), buildProof(), buildNote(), buildEnd()]
      .forEach(function (n) { wi.parentNode.insertBefore(n, wi); });
    if (owned && owned.parentNode) owned.parentNode.removeChild(owned);
    reconcile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
