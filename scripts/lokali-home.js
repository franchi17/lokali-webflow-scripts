/**
 * Lokali — Homepage v2 (2026-10 redesign, approved mockup v4 final).
 *
 * Builds the new homepage on top of the Webflow page without touching the
 * Designer: the hero keeps its real H1 and lede (moved, not rebuilt, so the
 * page HTML Google reads is unchanged) and gains a one-piece search bar, a
 * trust line and an arched vendor photo that rotates through F's picks; a
 * "Shop by category" section (F's picked photos, each credited to the
 * storefront; light orange since 2026-10-14, to match the About page) is
 * inserted before "What is Lokali"; that section is restyled
 * (centered, cards hidden, the three How-it-works steps and the six areas
 * folded in, the woman-owned line moved here); a violet "Follow the
 * storefronts you love" block and a short vendor invite close the page.
 * How It Works (.section-3), Starting in The Woodlands (.section-4), Be in
 * the Know (.section-5), You Belong Here (.section-6) and the category
 * marquee (.lcs-section) are hidden (retired by F 2026-10-14; the Designer
 * cleanup is a separate task).
 *
 * "Meet your neighbors" is lokali-neighbors.js (it now mounts right after
 * the hero). Photo picks live in HERO / CATS below: changing one is an edit
 * here + a script release (no SQL). Vendor rows are only consulted to drop a
 * pick whose storefront is no longer published and to count storefronts.
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

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      // retired sections (F 2026-10-14) + the old hero grid
      '.section-3,.section-4,.section-5,.section-6,.lcs-section{display:none!important;}' +
      'html.lok-home2 .section.hero.v18>div:not(#lok-hero){display:none!important;}' +
      'html.lok-home2 .section.hero.v18{background:#F3EBFF!important;padding:72px 0 76px!important;min-height:0!important;}' +
      // shared
      '.lok-wrap{max-width:1240px;margin:0 auto;padding:0 40px;font-family:"Plus Jakarta Sans",sans-serif;}' +
      '.lok-ul{color:#6002EE!important;font-weight:700;text-decoration:underline!important;text-underline-offset:3px;text-decoration-thickness:1.5px;}' +
      '.lok-ul:hover{color:#4B02BB!important;}' +
      '.lok-cap{font-size:13px;color:#4A4761;}' +
      '.lok-cap b,.lok-cap a{color:#6002EE;font-weight:700;text-decoration:none;}' +
      // hero
      '#lok-hero{display:grid;grid-template-columns:1.05fr .95fr;grid-template-areas:"txt fig" "trust fig";column-gap:64px;row-gap:0;align-items:center;}' +
      '#lok-hero>*{min-width:0;}' +
      '.lok-hero-txt{grid-area:txt;align-self:end;}' +
      '#lok-hero .lok-trust{grid-area:trust;align-self:start;}' +
      '#lok-hero .lok-arch{grid-area:fig;}' +
      '#lok-hero h1{font-family:"Plus Jakarta Sans",sans-serif!important;font-size:68px!important;line-height:1.02!important;font-weight:800!important;letter-spacing:-.035em!important;color:#1A1829!important;margin:0!important;text-wrap:balance;}' +
      '#lok-hero h1 .lok-v{color:#6002EE;}' +
      '#lok-hero .lok-lede{font-family:"Plus Jakarta Sans",sans-serif!important;font-size:19px!important;line-height:1.6!important;color:#4A4761!important;margin:22px 0 30px!important;max-width:28em;}' +
      '.lok-hs{display:flex;align-items:center;gap:10px;background:#fff;border-radius:999px;box-shadow:0 1px 2px rgba(40,32,90,.06),0 10px 30px rgba(96,2,238,.10);padding:6px 6px 6px 22px;height:64px;max-width:600px;margin:0;}' +
      '.lok-hs-ic{color:#6002EE;width:17px;height:17px;flex:none;display:inline-flex;}' +
      '.lok-hs-ic svg{width:100%;height:100%;}' +
      '.lok-hs input[type=search]{flex:1;min-width:0;border:0;outline:0;background:transparent;font:600 16px/1.2 "Plus Jakarta Sans",sans-serif;color:#1A1829;padding:0;margin:0;height:40px;-webkit-appearance:none;appearance:none;box-shadow:none;}' +
      '.lok-hs input[type=search]::placeholder{color:#1A1829;opacity:1;}' +
      '.lok-hs input[type=search]::-webkit-search-decoration,.lok-hs input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none;}' +
      '.lok-hs-area{position:relative;display:inline-flex;align-items:center;gap:7px;background:#F3EBFF;border-radius:999px;padding:0 12px 0 13px;height:40px;flex:none;color:#1A1829;cursor:pointer;margin:0;}' +
      '.lok-hs-area .lok-hs-ic{width:12px;height:12px;}' +
      '.lok-hs-area .lok-hs-chev{width:9px;height:9px;color:#6E6A85;}' +
      '.lok-hs-area select{-webkit-appearance:none;appearance:none;border:0;outline:0;background:transparent;font:700 13.5px/1 "Plus Jakarta Sans",sans-serif;color:#1A1829;padding:0;margin:0;height:40px;max-width:150px;cursor:pointer;}' +
      '.lok-hs-area:focus-within{box-shadow:0 0 0 2px #C9B3F2;}' +
      '.lok-hs-go{width:52px;height:52px;border-radius:50%;background:#6002EE;color:#fff;border:0;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer;padding:0;}' +
      '.lok-hs-go svg{width:17px;height:17px;}' +
      '.lok-hs-go:hover{background:#4B02BB;}' +
      '.lok-hs-go:focus-visible,.lok-hs input:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}' +
      '.lok-trust{display:flex;flex-wrap:wrap;gap:6px 14px;list-style:none;margin:20px 0 0;padding:0;font:600 13.5px/1.5 "Plus Jakarta Sans",sans-serif;color:#4A4761;max-width:600px;justify-content:center;}' +
      '.lok-trust li{display:inline-flex;align-items:center;gap:7px;margin:0;}' +
      '.lok-trust li::before{content:"";width:6px;height:6px;border-radius:50%;background:#6002EE;flex:none;}' +
      '.lok-arch{max-width:450px;width:100%;margin:0 0 0 auto;justify-self:end;}' +
      '.lok-slides{position:relative;aspect-ratio:4/5;border-radius:999px 999px 6px 6px;overflow:hidden;background:#E9E0FB;}' +
      '.lok-slides img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 25%;opacity:0;transition:opacity .9s ease;}' +
      '.lok-slides img.on{opacity:1;}' +
      '.lok-arch .lok-cap{margin:12px 0 0;text-align:center;min-height:1.4em;transition:opacity .4s;}' +
      '.lok-arch .lok-cap.fade{opacity:0;}' +
      '.lok-dots{display:flex;justify-content:center;gap:6px;margin-top:10px;}' +
      '.lok-dots i{width:6px;height:6px;border-radius:50%;background:#D9CCF5;display:block;}' +
      '.lok-dots i.on{background:#6002EE;}' +
      // category tiles
      // F 2026-10-14: Shop by category is light orange (matches the About page); orange accents inside, no violet on it
      '.lok-cats{background:#FFF7EC;padding:84px 0;font-family:"Plus Jakarta Sans",sans-serif;}' +
      '.lok-cats .lok-ul{color:#FF8D00!important;}.lok-cats .lok-ul:hover{color:#F07F00!important;}.lok-cats .lok-cap b{color:#FF8D00;}' +
      '.lok-sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:30px;flex-wrap:wrap;}' +
      '.lok-sec-head h2{font-size:38px;line-height:1.1;font-weight:800;letter-spacing:-.025em;color:#1A1829;margin:0;}' +
      '.lok-sec-head .lok-ul{font-size:15px;white-space:nowrap;}' +
      '.lok-cat-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:34px 20px;}' +
      '.lok-cat{display:flex;flex-direction:column;min-width:0;text-decoration:none;color:inherit;}' +
      '.lok-cat-img{position:relative;display:block;aspect-ratio:1/1;border-radius:16px;overflow:hidden;background:#FFF2DF;}' +
      '.lok-cat-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease;}' +
      '.lok-cat:hover .lok-cat-img img{transform:scale(1.04);}' +
      '.lok-cat-t{font-size:16px;font-weight:800;margin-top:12px;line-height:1.25;letter-spacing:-.005em;color:#1A1829;}' +
      '.lok-cat .lok-cap{margin-top:3px;font-size:12.5px;min-height:1.4em;}' +
      '.lok-cat-all .lok-cat-img{background:#fff;display:flex;flex-direction:column;justify-content:flex-end;padding:22px;box-shadow:0 1px 2px rgba(120,60,10,.06),0 8px 24px rgba(120,60,10,.06);}' +
      '.lok-cat-all .lok-big{font-size:24px;font-weight:800;line-height:1.1;letter-spacing:-.02em;color:#FF8D00;}' +
      '.lok-cat-all .lok-sm{font-size:14px;font-weight:600;margin-top:6px;color:#4A4761;}' +
      '.lok-cat-all .lok-arr{position:absolute;right:18px;top:18px;width:44px;height:44px;border-radius:50%;background:#FF8D00;color:#fff;display:flex;align-items:center;justify-content:center;}' +
      '.lok-cat-all .lok-arr svg{width:15px;height:15px;}' +
      // "What is Lokali" restyle
      '.wi-section.lok-v2{background:#fff!important;padding:84px 0!important;}' +
      '.wi-section.lok-v2 .wi-container{max-width:1240px!important;margin:0 auto!important;padding:0 40px!important;}' +
      '.wi-section.lok-v2 .wi-eyebrow,.wi-section.lok-v2 .wi-cards{display:none!important;}' +
      '.wi-section.lok-v2 .lok-how-top{max-width:680px;margin:0 auto;text-align:center;}' +
      '.wi-section.lok-v2 .wi-heading{font-family:"Plus Jakarta Sans",sans-serif!important;font-size:40px!important;line-height:1.1!important;font-weight:800!important;letter-spacing:-.03em!important;color:#1A1829!important;margin:0!important;text-wrap:balance;}' +
      '.wi-section.lok-v2 .wi-intro{font-family:"Plus Jakarta Sans",sans-serif!important;font-size:17px!important;line-height:1.7!important;color:#4A4761!important;margin:16px 0 0!important;max-width:none!important;}' +
      '.wi-section.lok-v2 .hero-compare-link{display:inline-block;margin-top:16px!important;font-size:15px!important;}' +
      '.wi-section.lok-v2 .lok-owned{font-family:"Plus Jakarta Sans",sans-serif;font-size:14px;color:#6E6A85;margin:18px 0 0;line-height:1.5;}' +
      '.lok-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px;margin:56px 0 0;list-style:none;padding:0;font-family:"Plus Jakarta Sans",sans-serif;text-align:left;}' +
      '.lok-steps li{border-top:1px solid #D9CCF5;padding-top:24px;min-width:0;margin:0;}' +
      '.lok-num{font-size:56px;line-height:1;font-weight:800;letter-spacing:-.04em;color:#B79CF2;}' +
      '.lok-steps h3{font-size:21px;font-weight:800;letter-spacing:-.01em;margin:14px 0 0;line-height:1.25;color:#1A1829;}' +
      '.lok-steps p{font-size:15px;color:#4A4761;margin:8px 0 0;line-height:1.6;}' +
      '.lok-areas{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px;}' +
      '.lok-area{display:inline-flex;align-items:center;gap:6px;background:#F3EBFF;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:600;color:#1A1829;text-decoration:none;}' +
      '.lok-area svg{width:11px;height:11px;color:#6002EE;}' +
      '.lok-area:hover{background:#E2D4FF;}' +
      '.lok-ask{display:inline-block;margin-top:12px;font-size:13.5px;}' +
      // follow block
      '.lok-fol{background:#6002EE;color:#fff;padding:72px 0;font-family:"Plus Jakarta Sans",sans-serif;}' +
      '.lok-fol-grid{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;}' +
      '.lok-fol-grid>*{min-width:0;}' +
      '.lok-heart{width:52px;height:52px;border-radius:50%;background:#fff;color:#6002EE;display:flex;align-items:center;justify-content:center;}' +
      '.lok-heart svg{width:21px;height:21px;}' +
      '.lok-fol h2{color:#fff;font-size:46px;line-height:1.06;font-weight:800;letter-spacing:-.03em;margin:24px 0 0;text-wrap:balance;}' +
      '.lok-fol p{color:#F1EAFF;font-size:17px;line-height:1.65;margin:16px 0 0;max-width:30em;}' +
      '.lok-wbtn{display:inline-flex;align-items:center;background:#fff;color:#6002EE!important;font-weight:800;border-radius:999px;padding:17px 30px;font-size:15.5px;margin-top:28px;text-decoration:none;}' +
      '.lok-wbtn:hover{background:#F3EBFF;}' +
      '.lok-fol-pic{display:flex;flex-direction:column;align-items:center;}' +
      '.lok-fol-pic img{display:block;width:420px;max-width:100%;aspect-ratio:7/8;object-fit:cover;border-radius:999px 999px 18px 18px;background:#4B02BB;}' +
      '.lok-fol-pic .lok-cap{color:#E2D4FF;margin:14px 0 0;}' +
      '.lok-fol-pic .lok-cap a{color:#fff;}' +
      // vendor invite
      '.lok-sell{background:#fff;padding:80px 0 88px;text-align:center;font-family:"Plus Jakarta Sans",sans-serif;}' +
      '.lok-sell-in{max-width:620px;margin:0 auto;}' +
      '.lok-sell h2{font-size:38px;font-weight:800;letter-spacing:-.03em;line-height:1.1;color:#1A1829;margin:0;text-wrap:balance;}' +
      '.lok-sell h2 .lok-v{color:#6002EE;}' +
      '.lok-sell p{font-size:17px;color:#4A4761;margin:14px 0 0;line-height:1.6;}' +
      '.lok-faces{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:22px;flex-wrap:wrap;}' +
      '.lok-stack{display:flex;flex:none;}' +
      '.lok-stack img{width:36px;height:36px;border-radius:50%;object-fit:cover;border:3px solid #fff;margin-left:-9px;box-shadow:0 1px 3px rgba(40,32,90,.15);background:#F3EBFF;}' +
      '.lok-stack img:first-child{margin-left:0;}' +
      '.lok-faces span{font-size:14px;font-weight:600;color:#4A4761;}' +
      '.lok-sell-act{margin-top:26px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;}' +
      '.lok-btn{display:inline-flex;align-items:center;justify-content:center;background:#6002EE;color:#fff!important;font-weight:800;border-radius:999px;padding:17px 30px;font-size:15.5px;text-decoration:none;}' +
      '.lok-btn:hover{background:#4B02BB;}' +
      '.lok-sell small{font-size:13.5px;color:#4A4761;font-weight:600;}' +
      // responsive
      '@media(max-width:1149px){.lok-cat-grid{grid-template-columns:repeat(4,minmax(0,1fr));}' +
        '#lok-hero{grid-template-columns:1fr;grid-template-areas:"txt" "fig" "trust";text-align:center;}' + // one column: the search pill needs the width
        '#lok-hero h1{font-size:54px!important;}#lok-hero .lok-lede{margin:18px auto 0!important;}.lok-hs{margin:26px auto 0;}' +
        '.lok-arch{margin:30px auto 0;justify-self:center;}#lok-hero .lok-trust{margin:22px auto 0;}}' +
      '@media(max-width:991px){.lok-wrap,.wi-section.lok-v2 .wi-container{padding:0 24px!important;}.lok-cat-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:26px 16px;}' +
        '.lok-steps{grid-template-columns:1fr;gap:0;margin-top:30px;}.lok-steps li{padding:22px 0 24px;}.lok-num{font-size:44px;}.lok-steps h3{font-size:19px;}' +
        '.lok-fol-grid{grid-template-columns:1fr;gap:36px;text-align:center;}.lok-fol p{margin-left:auto;margin-right:auto;}.lok-heart{margin:0 auto;}.lok-fol-pic img{width:300px;}' +
        '.lok-cats,.lok-fol,.lok-sell,html.lok-home2 .section.hero.v18,.wi-section.lok-v2{padding-top:48px!important;padding-bottom:48px!important;}' +
        '.lok-sec-head h2{font-size:30px;}.wi-section.lok-v2 .wi-heading{font-size:30px!important;}.lok-fol h2{font-size:32px;}.lok-sell h2{font-size:30px;}}' +
      '@media(max-width:767px){' +
        '#lok-hero h1{font-size:40px!important;}#lok-hero .lok-lede{font-size:16px!important;margin:14px auto 0!important;}' +
        '.lok-hs{display:none;}' + // the two-row phone header already carries the search box (#179)
        '.lok-arch{margin:26px auto 0;justify-self:center;}#lok-hero .lok-trust{margin-top:22px;font-size:12.5px;gap:6px 12px;}' +
        '.lok-wrap,.wi-section.lok-v2 .wi-container{padding:0 16px!important;}.lok-cat-grid{grid-template-columns:1fr 1fr;gap:24px 12px;}.lok-cat-img{border-radius:14px;}.lok-cat-t{font-size:14.5px;margin-top:9px;}.lok-cat .lok-cap{font-size:12px;}' +
        '.lok-cat-all .lok-cat-img{padding:14px;}.lok-cat-all .lok-big{font-size:18px;}.lok-cat-all .lok-sm{font-size:12.5px;}.lok-cat-all .lok-arr{width:34px;height:34px;right:12px;top:12px;}.lok-cat-all .lok-arr svg{width:12px;height:12px;}' +
        '.wi-section.lok-v2 .lok-how-top{text-align:left;margin:0;}.lok-sell .lok-btn{width:100%;}}' +
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

  function buildTrust() {
    var ul = el('ul', 'lok-trust');
    ['Verified people', 'Reviews from real customers', 'Message them directly'].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    return ul;
  }

  function mountHero(hero) {
    var h1 = hero.querySelector('h1');
    var lede = hero.querySelector('p.mg-bottom-24px') || (h1 && h1.nextElementSibling && h1.nextElementSibling.tagName === 'P' ? h1.nextElementSibling : null);
    if (!h1) return null;
    var owned = hero.querySelector('.text-block-130'); // the woman-owned line, moves to "What is Lokali"

    var grid = el('div');
    grid.id = 'lok-hero';
    grid.className = 'lok-wrap';
    var txt = el('div', 'lok-hero-txt');
    // Two-tone headline, only while the Designer copy is the one we styled for.
    if (h1.textContent.replace(/\s+/g, ' ').trim() === 'Find the people behind the work.') {
      h1.textContent = '';
      h1.appendChild(document.createTextNode('Find the people'));
      h1.appendChild(el('br'));
      h1.appendChild(el('span', 'lok-v', 'behind the work.'));
    }
    txt.appendChild(h1);
    if (lede) { lede.classList.add('lok-lede'); txt.appendChild(lede); }
    txt.appendChild(buildSearch());
    grid.appendChild(txt);
    grid.appendChild(buildTrust());
    grid.appendChild(buildArch(HERO));
    hero.appendChild(grid);
    document.documentElement.classList.add('lok-home2');
    return owned;
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
      img.alt = '';
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
    var allTile = el('a', 'lok-cat lok-cat-all');
    allTile.href = '/the-market';
    var ab = el('span', 'lok-cat-img');
    ab.appendChild(svgSpan('lok-arr', I_ARROW));
    ab.appendChild(el('span', 'lok-big', 'Every storefront'));
    ab.appendChild(el('span', 'lok-sm', 'All categories, all areas'));
    allTile.appendChild(ab);
    allTile.appendChild(el('span', 'lok-cat-t', 'The whole Market'));
    allTile.appendChild(el('span', 'lok-cap', ' '));
    grid.appendChild(allTile);
    wrap.appendChild(grid);
    sec.appendChild(wrap);
    return sec;
  }

  // ---- "What is Lokali" + steps -------------------------------------------
  function restyleWi(wi, owned) {
    wi.classList.add('lok-v2');
    var cont = wi.querySelector('.wi-container') || wi;
    var top = el('div', 'lok-how-top');
    var heading = cont.querySelector('.wi-heading'), intro = cont.querySelector('.wi-intro'), link = cont.querySelector('.hero-compare-link');
    if (heading) top.appendChild(heading);
    if (intro) top.appendChild(intro);
    if (link) { link.classList.add('lok-ul'); top.appendChild(link); }
    if (owned) { owned.className = 'lok-owned'; top.appendChild(owned); }
    cont.insertBefore(top, cont.firstChild);

    var ol = el('ol', 'lok-steps');
    function step(num, title, text) {
      var li = el('li');
      li.appendChild(el('div', 'lok-num', num));
      li.appendChild(el('h3', null, title));
      li.appendChild(el('p', null, text));
      return li;
    }
    var s1 = step('01', 'Pick your area', 'Our vendors already reach nine areas around The Woodlands and Greater Houston.');
    var areas = el('div', 'lok-areas');
    AREAS.forEach(function (a) {
      var chip = el('a', 'lok-area');
      chip.href = '/the-market?area=' + encodeURIComponent(a.slug);
      chip.innerHTML = I_PIN; // static SVG
      chip.appendChild(document.createTextNode(a.name));
      areas.appendChild(chip);
    });
    s1.appendChild(areas);
    var ask = el('a', 'lok-ul lok-ask', "Don't see your neighborhood? Let us know");
    ask.href = '/contact-us';
    s1.appendChild(ask);
    ol.appendChild(s1);
    ol.appendChild(step('02', 'Find the person behind the work', 'Search or browse by category. Every storefront shows who runs it, in their own words.'));
    ol.appendChild(step('03', 'Reach out directly', 'Send a message, text or call the person behind the business. No algorithms, just humans.'));
    cont.appendChild(ol);
  }

  // ---- follow block + vendor invite ---------------------------------------
  function buildFollow() {
    var sec = el('section', 'lok-fol');
    sec.id = 'lok-follow';
    var wrap = el('div', 'lok-wrap lok-fol-grid');
    var txt = el('div');
    txt.appendChild(svgSpan('lok-heart', I_HEART));
    txt.appendChild(el('h2', null, 'Follow the storefronts you love'));
    txt.appendChild(el('p', null, "Tap Follow on any storefront. When they post where they'll be, a market, a pop-up, a tasting, you get it in one email on Thursday morning. Nothing else, and you can unfollow any time."));
    var btn = el('a', 'lok-wbtn', 'Find storefronts to follow');
    btn.href = '/the-market';
    txt.appendChild(btn);
    wrap.appendChild(txt);
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
    sec.appendChild(wrap);
    return sec;
  }

  function buildSell() {
    var sec = el('section', 'lok-sell');
    sec.id = 'lok-sell';
    var wrap = el('div', 'lok-wrap');
    var inner = el('div', 'lok-sell-in');
    var h2 = el('h2');
    h2.appendChild(document.createTextNode('Have a business?'));
    h2.appendChild(el('br'));
    h2.appendChild(el('span', 'lok-v', 'Your neighbors are looking.'));
    inner.appendChild(h2);
    inner.appendChild(el('p', null, 'Open a storefront in minutes. No shop needed, and you list a service area, not your home address.'));
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
    inner.appendChild(faces);
    var act = el('div', 'lok-sell-act');
    var btn = el('a', 'lok-btn', 'Open your storefront');
    btn.href = '/sign-up';
    act.appendChild(btn);
    act.appendChild(el('small', null, 'Start free.'));
    inner.appendChild(act);
    wrap.appendChild(inner);
    sec.appendChild(wrap);
    return sec;
  }

  // ---- live vendor check (non-blocking) -----------------------------------
  // Drops a hero slide or a tile credit whose storefront is no longer
  // published, and fills in the "N more" count. Any failure = page as built.
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
      var tiles = document.querySelectorAll('.lok-cat[data-vid]');
      for (var i = 0; i < tiles.length; i++) {
        if (!live[tiles[i].getAttribute('data-vid')]) {
          var img = tiles[i].querySelector('img'), cap = tiles[i].querySelector('.lok-cap');
          if (img && img.parentNode) img.parentNode.removeChild(img);
          if (cap) cap.textContent = ' ';
        }
      }
      // Hero slides of unpublished storefronts are skipped by the rotation
      // (and the first one swapped) only when at least one pick is still live.
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
    var owned = mountHero(hero);
    wi.parentNode.insertBefore(buildCats(), wi);
    restyleWi(wi, owned);
    var sell = buildSell();
    wi.parentNode.insertBefore(sell, wi.nextSibling);
    wi.parentNode.insertBefore(buildFollow(), sell);
    reconcile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
