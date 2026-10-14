/**
 * Lokali — About page v2 (2026-10 redesign, approved mockup v6:
 * claude.ai/artifact/NWaVHKWWE9EVJetxcHDFEw).
 *
 * Rebuilds /about on top of the Webflow page without touching the Designer.
 * Every heading and paragraph is the page's own element, MOVED into the new
 * layout (so the HTML Google and AI crawlers read is unchanged); only the
 * faces, the three storefront cards, icons and buttons are new.
 *   - Hero: light orange, two-tone "Community / over platforms.", the line
 *     under it, three facts, a Market button, a link to Francesca's letter,
 *     and seven owners' faces in a circle (one in the middle, six around).
 *   - "The people your neighbors actually recommend" (the #162 embed): same
 *     two paragraphs; the three storefronts become photo cards.
 *   - Principles: a calm two-by-two list with icons ("What we believe").
 *   - Built for two kinds of people: vendor card lavender, customer card
 *     light orange, one founding strip.
 *   - Built for everywhere: light orange, area chips, and the waitlist button
 *     (#wl-trigger, which lokali-waitlist.js opens) in one white card.
 *   - Francesca's letter last, in a reading column.
 * Orange sections carry orange buttons and links; violet stays on the vendor
 * side (F 2026-09-20: no orange beside violet in one element).
 *
 * Photo picks live in FACES / RESERVE / CARDS below (F's picker doc
 * picks/current v23, 2026-10-14 18:56Z): changing one is an edit here + a
 * script release (no SQL). Vendor rows are only consulted to drop a pick
 * whose storefront is no longer published.
 *
 * Deploy: Webflow REGISTERED script (`lokaliabout`, page-level on /about),
 * same as lokali-home.js: a version bump is a re-register with the new
 * @1.4.N URL + SRI hash.
 * Keep this file byte-identical in scripts/ and lokali-webflow-scripts/scripts/.
 */
(function () {
  'use strict';

  var STYLE_ID = 'lok-about-style';
  var MEDIA = 'https://api.golokali.com/storage/v1/object/public/vendor-media/';

  // ---- F's picks (2026-10-14) ----------------------------------------------
  // The circle: the first face sits in the middle, the rest go around it
  // clockwise from the top left. Owners' own storefront profile photos.
  var FACES = [
    { vid: 688, slug: 'aniko-lifestyle-wellness', name: 'Catherine', biz: 'ANIKO Lifestyle & Wellness', img: MEDIA + '688/owner/mv03xtkmr659cc.jpg' },
    { vid: 248, slug: 'nolasko-insurance-advisors', name: 'Carlos', biz: 'Nolasko Insurance Advisors', img: MEDIA + '248/owner/msqyvst9yb305xv2.jpg' },
    { vid: 447, slug: 'cherry-dot-store', name: 'Aleks', biz: 'Cherry Dot Store', img: MEDIA + '447/owner/mu015u9p0hdh30.webp' },
    { vid: 626, slug: 'yeehatx', name: 'Jessica', biz: 'YeeHaTx', img: MEDIA + '626/owner/muorhpcwha06kt.jpg' },
    { vid: 260, slug: 'laso-business-consulting', name: 'Ernesto', biz: 'Laso Business Consulting', img: MEDIA + '260/owner%20photo/ernestophotov2.jpg' },
    { vid: 431, slug: 'madrone-painting-llc', name: 'Chris', biz: 'Madrone Painting', img: MEDIA + '431/owner/mu74r5vvuvxyn0.webp' },
    { vid: 446, slug: 'maria-mendizabalfenix-flame-enterprises-llc', name: 'Maria', biz: 'Fenix Flame Enterprises', img: MEDIA + '446/owner/mtwh7llin2314tv2.jpg' }
  ];
  // Stand-ins, used in this order only if a pick's storefront is unpublished.
  var RESERVE = [
    { vid: 610, slug: 'engaged-minds-academy', name: 'Dominique', biz: 'Engaged Minds Academy', img: MEDIA + '610/owner/muif1hxqrmma6j.webp' },
    { vid: 286, slug: 'quori-and-lace', name: 'Gabriela', biz: 'Quori and Lace', img: MEDIA + '286/owner/mszb2p2wwd6vhb.jpeg' },
    { vid: 430, slug: 'delightful-designs', name: 'Cristina', biz: 'Delightful Designs', img: MEDIA + '430/owner/mu1rc658f6sjzo.webp' },
    { vid: 629, slug: 'prairie-view-am-extension', name: 'Alfredo', biz: 'Prairie View A&M Extension', img: MEDIA + '629/owner/muq000gkca92d5.webp' }
  ];
  // "Do you know someone who…" (the three storefronts of the #162 block).
  // Rowdy's photos are all website screenshots, so theirs sits in a drawn
  // browser window instead of being cropped (cropped lettering reads as a bug).
  var CARDS = [
    { vid: 238, slug: 'rowdy-digital', q: 'builds websites?', who: 'Matt', biz: 'Rowdy Digital', town: 'Spring', founding: true, web: true,
      face: MEDIA + '238/owner/mubphracr1are7.webp', img: MEDIA + '238/portfolio/rowdywork03.jpg', alt: 'A website Rowdy Digital built' },
    { vid: 250, slug: 'echoed-reflections-videography', q: 'films weddings and events?', who: 'Umoh', biz: 'Echoed Reflections Videography', town: 'Humble', founding: false,
      face: MEDIA + '250/owner/mstklj2a9qvkxxv2.jpg', img: MEDIA + '250/service/mstkcjvb1khaku.jpg', pos: '50% 30%', alt: 'Umoh filming guests at an event' },
    { vid: 146, slug: 'paperloom', q: 'makes party favors?', who: 'Monica', biz: 'Paperloom', town: 'Spring', founding: true,
      face: MEDIA + '146/owner/mtkez2rr257slu.webp', img: MEDIA + '146/product/mtk8d90qso2ith.webp', pos: '50% 50%', alt: 'Personalized party favor boxes by Paperloom' }
  ];
  // The six open areas: `slug` = the alias the Market's ?area= accepts (as in lokali-home.js).
  var AREAS = { 'the woodlands': 'the-woodlands', 'woodforest': 'woodforest', 'spring': 'spring', 'tomball': 'tomball', 'katy': 'katy', 'houston': 'houston' };

  // Circle geometry: center first, then clockwise from the top left (60-degree steps).
  // W/H = wall box, cy = center height, R = ring radius, D = face size, LW = label width.
  var RING = [[0, 0], [-0.5, -0.866], [0.5, -0.866], [1, 0], [0.5, 0.866], [-0.5, 0.866], [-1, 0]];
  var GEOS = [
    { min: 518, W: 518, H: 482, cy: 220, R: 184, D: 112, LW: 150, biz: true },
    { min: 336, W: 336, H: 320, cy: 148, R: 122, D: 78, LW: 92, biz: false },
    { min: 0, W: 288, H: 282, cy: 129, R: 106, D: 66, LW: 76, biz: false }
  ];

  // ---- icons (Font Awesome Free 6, inline, no emoji) ----------------------
  var I_ARROW = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>';
  var I_PIN = '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>';
  var I_CHECK = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>';
  var I_HEART = '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z"/></svg>';
  var I_STORE = '<svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M547.6 103.8L490.3 13.1C485.2 5 476.1 0 466.4 0L109.6 0C99.9 0 90.8 5 85.7 13.1L28.3 103.8c-29.6 46.8-3.4 111.9 51.9 119.4c4 .5 8.1 .8 12.1 .8c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.2 0 49.3-11.4 65.2-29c16 17.6 39.1 29 65.2 29c4.1 0 8.1-.3 12.1-.8c55.5-7.4 81.8-72.5 52.1-119.4zM499.7 254.9c0 0 0 0-.1 0c-5.3 .7-10.7 1.1-16.2 1.1c-12.4 0-24.3-1.9-35.4-5.3L448 384l-320 0 0-133.4c-11.2 3.5-23.2 5.4-35.6 5.4c-5.5 0-11-.4-16.3-1.1l-.1 0c-4.1-.6-8.1-1.3-12-2.3L64 384l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64 0-131.4c-4 1-8 1.8-12.3 2.3z"/></svg>';
  var I_CROWN = '<svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>';
  var I_SHIELD = '<svg viewBox="0 0 640 512" aria-hidden="true"><path fill="currentColor" d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c1.8 0 3.5-.2 5.3-.5c-76.3-55.1-99.8-141-103.1-200.2c-16.1-4.8-33.1-7.3-50.7-7.3l-91.4 0zm308.8-78.3l-120 48C358 277.4 352 286.2 352 296c0 63.3 25.9 168.8 134.8 214.2c5.9 2.5 12.6 2.5 18.5 0C614.1 464.8 640 359.3 640 296c0-9.8-6-18.6-15.1-22.3l-120-48c-5.7-2.3-12.1-2.3-17.8 0zM591.4 312c-3.9 47.9-27.8 116.3-95.4 150.4l0-176.1L591.4 312z"/></svg>';
  var I_USERS = '<svg viewBox="0 0 640 512" aria-hidden="true"><path fill="currentColor" d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192l42.7 0c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96c-.2 0-.4 0-.7 0L21.3 320C9.6 320 0 310.4 0 298.7zM405.3 320c-.2 0-.4 0-.7 0c26.6-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7l42.7 0C592.2 192 640 239.8 640 298.7c0 11.8-9.6 21.3-21.3 21.3l-213.3 0zM224 224a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zM128 485.3C128 411.7 187.7 352 261.3 352l117.3 0C452.3 352 512 411.7 512 485.3c0 14.7-11.9 26.7-26.7 26.7l-330.7 0c-14.7 0-26.7-11.9-26.7-26.7z"/></svg>';
  var I_HANDHEART = '<svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M163.9 136.9c-29.4-29.8-29.4-78.2 0-108s77-29.8 106.4 0l17.7 18 17.7-18c29.4-29.8 77-29.8 106.4 0s29.4 78.2 0 108L310.5 240.1c-6.2 6.3-14.3 9.4-22.5 9.4s-16.3-3.1-22.5-9.4L163.9 136.9zM568.2 336.3c13.1 17.8 9.3 42.8-8.5 55.9L433.1 485.5c-23.4 17.2-51.6 26.5-80.7 26.5L192 512 32 512c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l36.8 0 44.9-36c22.7-18.2 50.9-28 80-28l78.3 0 16 0 64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0-16 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l120.6 0 119.7-88.2c17.8-13.1 42.8-9.3 55.9 8.5zM193.6 384c0 0 0 0 0 0l-.9 0c.3 0 .6 0 .9 0z"/></svg>';
  var I_FEATHER = '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M278.5 215.6L23 471c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l57-57 68 0c49.7 0 97.9-14.4 139-41c11.1-7.2 5.5-23-7.8-23c-5.1 0-9.2-4.1-9.2-9.2c0-4.1 2.7-7.6 6.5-8.8l81-24.3c2.5-.8 4.8-2.1 6.7-4l22.4-22.4c10.1-10.1 2.9-27.3-11.3-27.3l-32.2 0c-5.1 0-9.2-4.1-9.2-9.2c0-4.1 2.7-7.6 6.5-8.8l112-33.6c4-1.2 7.4-3.9 9.3-7.7C506.4 207.6 512 184.1 512 160c0-41-16.3-80.3-45.3-109.3l-5.5-5.5C432.3 16.3 393 0 352 0s-80.3 16.3-109.3 45.3L139 149C91 197 64 262.1 64 330l0 55.3L253.6 195.8c6.2-6.2 16.4-6.2 22.6 0c5.4 5.4 6.1 13.6 2.2 19.8z"/></svg>';
  var PR_ICONS = [I_SHIELD, I_USERS, I_HANDHEART, I_FEATHER];

  var C = { ink: '#1A1829', dusk: '#4A4761', v: '#6002EE', vdk: '#4B02BB', lav: '#F3EBFF', lavLine: '#D9CCF5',
    or: '#FF8D00', or50: '#FFF2DF', orWash: '#FFF7EC', orLine: '#F4DCC0', edge: '#DEDAEE' };
  var F = '"Plus Jakarta Sans",sans-serif';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      // the page's old wrappers, emptied by the moves below
      'html.lok-about2 .section-2>.div-block-5,html.lok-about2 .lok-ab-old{display:none!important;}' +
      'html.lok-about2 .section-2,html.lok-about2 section.section-13,html.lok-about2 .founder-section{display:block!important;background:#fff!important;padding:0!important;margin:0!important;min-height:0!important;max-width:none!important;border-radius:0!important;}' +
      // shared
      '.lok-ab{font-family:' + F + ';color:' + C.ink + ';text-align:left;}' +
      '.lok-ab *{box-sizing:border-box;}' +
      '.lok-ab .lok-wrap{max-width:1240px;margin:0 auto;padding:0 40px;}' +
      '.lok-ab.lok-sec{padding:84px 0;}' +
      '.lok-ab .lok-h2{font-family:' + F + '!important;font-size:42px!important;line-height:1.08!important;font-weight:800!important;letter-spacing:-.03em!important;color:' + C.ink + '!important;margin:0!important;text-wrap:balance;text-transform:none!important;}' +
      '.lok-ab .lok-copy{font-family:' + F + '!important;font-size:17px!important;line-height:1.7!important;color:' + C.dusk + '!important;margin:0!important;font-weight:400!important;}' +
      '.lok-ab .lok-ul{color:' + C.v + '!important;font-weight:700;text-decoration:underline!important;text-underline-offset:3px;text-decoration-thickness:1.5px;}' +
      '.lok-ab .lok-ul:hover{color:' + C.vdk + '!important;}' +
      '.lok-ab .lok-ul.lok-or{color:' + C.or + '!important;}' +
      '.lok-ab .lok-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:' + C.v + ';color:#fff!important;font-family:' + F + ';font-weight:800;border-radius:999px;padding:16px 28px;font-size:15.5px;line-height:1.2;text-decoration:none!important;border:0;cursor:pointer;}' +
      '.lok-ab .lok-btn:hover{background:' + C.vdk + ';}' +
      '.lok-ab .lok-btn.lok-or{background:' + C.or + ';}' +
      '.lok-ab .lok-btn.lok-or:hover{background:#F07F00;}' +
      '.lok-ab .lok-btn:focus-visible,.lok-ab .lok-ul:focus-visible,.lok-ab a:focus-visible{outline:2px solid ' + C.v + ';outline-offset:3px;}' +
      '.lok-ab .lok-cap{font-size:13px;color:' + C.dusk + ';margin:0;}' +
      // hero
      '.lok-ab-hero{background:' + C.orWash + ';padding:72px 0 76px;}' +
      '#lok-ab-hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(530px,.95fr);column-gap:64px;align-items:center;}' +
      '#lok-ab-hero>*{min-width:0;}' +
      '#lok-ab-hero h1{font-family:' + F + '!important;font-size:68px!important;line-height:1.02!important;font-weight:800!important;letter-spacing:-.035em!important;color:' + C.ink + '!important;margin:0!important;text-wrap:balance;text-transform:none!important;}' +
      '#lok-ab-hero h1 .lok-o{color:' + C.or + ';}' +
      '#lok-ab-hero .lok-lede{font-family:' + F + '!important;font-size:19px!important;line-height:1.6!important;color:' + C.dusk + '!important;margin:22px 0 0!important;max-width:28em;font-weight:400!important;}' +
      '.lok-trust{display:flex;flex-wrap:wrap;gap:6px 14px;list-style:none;margin:22px 0 0;padding:0;font:600 13.5px/1.5 ' + F + ';color:' + C.dusk + ';}' +
      '.lok-trust li{display:inline-flex;align-items:center;gap:7px;margin:0;}' +
      '.lok-trust li::before{content:"";width:6px;height:6px;border-radius:50%;background:' + C.or + ';flex:none;}' +
      '.lok-acts{display:flex;align-items:center;gap:24px;margin-top:32px;flex-wrap:wrap;}' +
      '.lok-acts .lok-ul{font-size:15px;}' +
      // the circle of faces
      '.lok-wallfig{width:100%;margin:0;display:flex;flex-direction:column;align-items:center;}' +
      '.lok-wall{position:relative;width:518px;height:482px;--d:112px;--lw:150px;}' +
      '.lok-face{position:absolute;width:var(--lw);display:flex;flex-direction:column;align-items:center;gap:8px;text-decoration:none!important;color:inherit;outline:none;border-radius:16px;}' +
      '.lok-face .lok-ph{position:relative;display:block;border-radius:50%;transition:transform .28s cubic-bezier(.2,.8,.2,1);}' +
      '.lok-face img,.lok-face .lok-init{display:block;width:var(--d);height:var(--d);border-radius:50%;object-fit:cover;border:4px solid #fff;box-shadow:0 2px 6px rgba(120,60,10,.10),0 10px 24px rgba(120,60,10,.10);background:' + C.or50 + ';transition:border-color .2s ease,box-shadow .28s ease;}' +
      '.lok-face .lok-init{display:flex;align-items:center;justify-content:center;font:800 28px/1 ' + F + ';color:' + C.or + ';}' +
      '.lok-face .lok-go{position:absolute;right:-4px;bottom:2px;width:34px;height:34px;border-radius:50%;background:' + C.or + ';color:#fff;display:flex;align-items:center;justify-content:center;border:3px solid #fff;transform:scale(0);transition:transform .28s cubic-bezier(.2,.8,.2,1);}' +
      '.lok-face .lok-go svg{width:13px;height:13px;}' +
      '.lok-face .lok-nm{font:800 14px/1.25 ' + F + ';color:' + C.ink + ';text-align:center;max-width:var(--lw);}' +
      '.lok-face .lok-nm b{font-weight:800;text-decoration:underline;text-decoration-color:transparent;text-underline-offset:3px;text-decoration-thickness:2px;transition:text-decoration-color .2s ease;}' +
      '.lok-face .lok-nm span{display:block;font-weight:500;font-size:12px;color:' + C.dusk + ';margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:var(--lw);}' +
      '.lok-wall.lok-nobiz .lok-nm span{display:none;}.lok-wall.lok-nobiz .lok-go{display:none;}.lok-wall.lok-nobiz .lok-nm{font-size:13px;}' +
      '.lok-wall.lok-nobiz .lok-face img,.lok-wall.lok-nobiz .lok-face .lok-init{border-width:3px;}' +
      '.lok-face:hover .lok-ph,.lok-face:focus-visible .lok-ph{transform:translateY(-6px) scale(1.06);}' +
      '.lok-face:hover img,.lok-face:focus-visible img,.lok-face:hover .lok-init,.lok-face:focus-visible .lok-init{border-color:' + C.or + ';box-shadow:0 4px 10px rgba(120,60,10,.16),0 18px 34px rgba(120,60,10,.20);}' +
      '.lok-face:hover .lok-go,.lok-face:focus-visible .lok-go{transform:scale(1);}' +
      '.lok-face:hover .lok-nm b,.lok-face:focus-visible .lok-nm b{text-decoration-color:' + C.or + ';}' +
      '.lok-wallfig .lok-cap{margin-top:14px;text-align:center;}' +
      // the people your neighbors recommend
      '.lok-kn-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;align-items:start;}' +
      '.lok-kn-top .lok-copy+.lok-copy{margin-top:14px!important;}' +
      '.lok-kn-ask{font:800 20px/1.3 ' + F + ';color:' + C.v + ';margin:56px 0 20px;letter-spacing:-.01em;}' +
      // questions above their cards, sharing one bottom line, so the cards stay identical
      '.lok-kn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:24px;row-gap:14px;align-items:end;}' +
      '.lok-kn-q{font:800 22px/1.2 ' + F + ';letter-spacing:-.02em;color:' + C.ink + ';margin:0;}' +
      '.lok-kn{display:flex;flex-direction:column;align-self:stretch;min-width:0;background:#fff;border:1px solid ' + C.edge + ';border-radius:18px;box-shadow:0 1px 2px rgba(40,32,90,.08),0 4px 14px rgba(40,32,90,.06);overflow:hidden;text-decoration:none!important;color:inherit;transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s ease;}' +
      '.lok-kn:hover{transform:translateY(-4px);box-shadow:0 4px 8px rgba(40,32,90,.08),0 18px 36px rgba(96,2,238,.14);}' +
      '.lok-kn-cov{position:relative;aspect-ratio:4/3;overflow:hidden;background:#E9E0FB;}' +
      '.lok-kn-cov>img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease;}' +
      '.lok-kn:hover .lok-kn-cov img{transform:scale(1.05);}' +
      '.lok-bf{position:absolute;inset:0;background:' + C.lav + ';padding:16px 16px 0;display:flex;}' +
      '.lok-bf-win{flex:1;min-width:0;background:#fff;border-radius:10px 10px 0 0;box-shadow:0 6px 20px rgba(40,32,90,.14);overflow:hidden;display:flex;flex-direction:column;}' +
      '.lok-bf-bar{height:22px;flex:none;display:flex;align-items:center;gap:5px;padding:0 10px;background:#F7F6FC;border-bottom:1px solid #EEEDF6;}' +
      '.lok-bf-bar i{width:7px;height:7px;border-radius:50%;background:' + C.lavLine + ';display:block;}' +
      '.lok-bf-win img{flex:1;min-height:0;width:100%;object-fit:cover;object-position:50% 0;display:block;transition:transform .5s ease;}' +
      '.lok-kn-body{padding:16px 20px 18px;display:flex;flex-direction:column;flex:1;}' +
      '.lok-kn-who{display:flex;align-items:center;gap:10px;}' +
      '.lok-kn-face{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none;background:' + C.lav + ';}' +
      '.lok-kn-name{font:800 18px/1.15 ' + F + ';letter-spacing:-.015em;color:' + C.ink + ';}' +
      '.lok-kn-biz{font:600 13px/1.3 ' + F + ';color:' + C.dusk + ';margin-top:1px;}' +
      '.lok-kn-foot{display:flex;align-items:center;gap:10px;margin-top:auto;padding-top:14px;min-height:39px;flex-wrap:wrap;}' +
      '.lok-kn-foot .lok-ul{margin-left:auto;font-size:14px;display:inline-flex;align-items:center;gap:5px;}' +
      '.lok-kn-foot .lok-ul svg{width:11px;height:11px;transition:transform .25s ease;}' +
      '.lok-kn:hover .lok-kn-foot .lok-ul svg{transform:translateX(4px);}' +
      '.lok-fv{display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid #E3CD8A;color:#8A6A12;border-radius:999px;padding:4px 9px;font:800 10px/1.4 ' + F + ';letter-spacing:.07em;text-transform:uppercase;}' +
      '.lok-fv svg{width:10px;height:10px;color:#C9A227;}' +
      '.lok-ab .lok-kn-note{margin-top:30px;display:flex;gap:6px 18px;flex-wrap:wrap;align-items:baseline;font-size:14px!important;}' +
      '.lok-kn-note .lok-ul{font-size:14px;}' +
      '.lok-kn-rows{display:none;gap:12px;}' +
      '.lok-kn-row{display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;align-items:center;background:#fff;border:1px solid ' + C.edge + ';border-radius:16px;box-shadow:0 1px 2px rgba(40,32,90,.08),0 4px 14px rgba(40,32,90,.06);padding:10px 12px 10px 10px;text-decoration:none!important;color:inherit;transition:transform .15s ease;}' +
      '.lok-kn-row:active{transform:scale(.98);}' +
      '.lok-kn-row .lok-th{width:96px;height:96px;border-radius:10px;overflow:hidden;background:#E9E0FB;display:block;}' +
      '.lok-kn-row .lok-th img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.lok-kn-row .lok-q{display:block;font:800 17px/1.2 ' + F + ';letter-spacing:-.015em;color:' + C.ink + ';}' +
      '.lok-kn-row .lok-w{display:flex;align-items:center;gap:8px;margin-top:8px;font:600 13px/1.3 ' + F + ';color:' + C.dusk + ';}' +
      '.lok-kn-row .lok-w img{width:26px;height:26px;border-radius:50%;object-fit:cover;flex:none;}' +
      '.lok-kn-row .lok-ul{font-size:13px;display:inline-block;margin-top:6px;}' +
      // principles
      '.lok-ab-pr{background:' + C.lav + ';}' +
      '.lok-ab-pr .lok-h2{margin-bottom:30px!important;}' +
      '.lok-pr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 56px;}' +
      '.lok-pr{display:grid;grid-template-columns:52px minmax(0,1fr);gap:20px;border-top:1px solid ' + C.lavLine + ';padding:28px 0 34px;}' +
      '.lok-pr-ic{width:52px;height:52px;border-radius:50%;background:#fff;color:' + C.v + ';display:flex;align-items:center;justify-content:center;}' +
      '.lok-pr-ic svg{width:21px;height:21px;}' +
      '.lok-ab .lok-pr-t{font:800 21px/1.25 ' + F + '!important;letter-spacing:-.01em!important;color:' + C.ink + '!important;margin:0!important;text-transform:none!important;}' +
      '.lok-ab .lok-pr-b{font:400 15.5px/1.65 ' + F + '!important;color:' + C.dusk + '!important;margin:8px 0 0!important;}' +
      // two kinds of people
      '.lok-ab-two .lok-h2{margin-bottom:30px!important;}' +
      '.lok-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;}' +
      '.lok-who{background:' + C.lav + ';border-radius:22px;padding:34px 36px 32px;display:flex;flex-direction:column;min-width:0;}' +
      '.lok-who.lok-cust{background:' + C.or50 + ';}' +
      '.lok-who-top{display:flex;align-items:center;gap:12px;}' +
      '.lok-who-ic{width:44px;height:44px;border-radius:50%;background:#fff;color:' + C.v + ';display:flex;align-items:center;justify-content:center;flex:none;}' +
      '.lok-who-ic svg{width:18px;height:18px;}' +
      '.lok-who-k{font:700 14px/1.2 ' + F + ';color:' + C.v + ';}' +
      '.lok-cust .lok-who-ic,.lok-cust .lok-who-k,.lok-cust .lok-chk svg{color:' + C.or + ';}' +
      '.lok-ab .lok-who-h{font:800 28px/1.15 ' + F + '!important;letter-spacing:-.025em!important;color:' + C.ink + '!important;margin:20px 0 0!important;text-transform:none!important;}' +
      '.lok-ab .lok-who-p{font:400 16px/1.7 ' + F + '!important;color:' + C.dusk + '!important;margin:12px 0 0!important;}' +
      '.lok-chk{list-style:none!important;padding:0!important;margin:22px 0 0!important;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;}' +
      '.lok-chk li{display:flex;gap:9px;align-items:baseline;min-width:0;margin:0!important;padding:0!important;font:600 14.5px/1.4 ' + F + ';color:' + C.ink + ';}' +
      '.lok-chk li::before{display:none!important;}' +
      '.lok-chk svg{width:12px;height:12px;color:' + C.v + ';flex:none;position:relative;top:1px;}' +
      '.lok-ab .lok-chk li>*:not(svg){font:inherit!important;color:inherit!important;margin:0!important;}' +
      '.lok-who-foot{margin-top:auto;padding-top:26px;display:flex;align-items:center;gap:12px 18px;flex-wrap:wrap;}' +
      '.lok-who-foot .lok-btn{padding:13px 22px;font-size:14.5px;}' +
      '.lok-who-foot .lok-ul{font-size:15px;}' +
      '.lok-fnd{display:flex;align-items:center;gap:20px;margin-top:24px;border:1px solid #E3CD8A;border-radius:18px;padding:22px 26px;background:#fff;}' +
      '.lok-fnd-ic{width:46px;height:46px;border-radius:50%;background:#FBF5E2;color:#C9A227;display:flex;align-items:center;justify-content:center;flex:none;}' +
      '.lok-fnd-ic svg{width:18px;height:18px;}' +
      '.lok-fnd>div{flex:1;min-width:0;}' +
      '.lok-ab .lok-fnd-t{font:800 17px/1.35 ' + F + '!important;color:' + C.ink + '!important;margin:0!important;letter-spacing:0!important;text-transform:none!important;}' +
      '.lok-ab .lok-fnd-t strong{font-weight:800!important;}' +
      '.lok-ab .lok-fnd-p{font:400 14.5px/1.6 ' + F + '!important;color:' + C.dusk + '!important;margin:4px 0 0!important;max-width:62em;}' +
      '.lok-fnd .lok-ul{white-space:nowrap;font-size:15px;}' +
      // built for everywhere + waitlist
      '.lok-ab-where{background:' + C.orWash + ';}' +
      '.lok-wh-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;align-items:start;}' +
      '.lok-wh-grid .lok-copy{margin-top:16px!important;}' +
      '.lok-ab .lok-h2 strong{font-weight:800!important;}' +
      '.lok-open{background:#fff;border-radius:22px;padding:28px 30px 30px;box-shadow:0 1px 2px rgba(120,60,10,.06),0 8px 24px rgba(120,60,10,.06);}' +
      '.lok-ab .lok-open-h{font:800 18px/1.3 ' + F + '!important;letter-spacing:-.01em!important;color:' + C.ink + '!important;margin:0!important;text-transform:none!important;}' +
      '.lok-areas{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}' +
      '.lok-area{display:inline-flex;align-items:center;gap:6px;background:' + C.or50 + ';border-radius:999px;padding:8px 14px;font:600 14px/1.2 ' + F + ';color:' + C.ink + '!important;text-decoration:none!important;}' +
      '.lok-area svg{width:11px;height:11px;color:' + C.or + ';}' +
      '.lok-area:hover{background:#FFE6C2;}' +
      '.lok-ab .lok-more{font:400 14px/1.5 ' + F + '!important;color:' + C.dusk + '!important;margin:14px 0 0!important;}' +
      '.lok-wl{border-top:1px solid ' + C.orLine + ';margin-top:24px;padding-top:22px;}' +
      '.lok-ab .lok-wl-h{font:800 22px/1.25 ' + F + '!important;letter-spacing:-.02em!important;color:' + C.ink + '!important;margin:0!important;text-transform:none!important;}' +
      '.lok-ab .lok-wl-p{font:400 15px/1.65 ' + F + '!important;color:' + C.dusk + '!important;margin:8px 0 0!important;}' +
      '.lok-ab #wl-trigger{margin-top:18px;padding:14px 24px;font-size:15px;}' +
      // the letter
      '.lok-ab-letter{background:#fff;padding:88px 0 96px;scroll-margin-top:90px;}' +
      '.lok-letter{max-width:680px;margin:0 auto;}' +
      '.lok-lt-head{display:flex;align-items:center;gap:18px;}' +
      '.lok-ab .lok-lt-face{width:72px!important;height:72px!important;border-radius:50%!important;object-fit:cover;flex:none;margin:0!important;max-width:none!important;}' +
      '.lok-ab .lok-lt-h{font:800 42px/1.1 ' + F + '!important;letter-spacing:-.03em!important;color:' + C.ink + '!important;margin:0!important;text-transform:none!important;}' +
      '.lok-lt-body{margin-top:30px;display:grid;gap:18px;}' +
      '.lok-ab .lok-lt-p{font:400 17px/1.8 ' + F + '!important;color:' + C.dusk + '!important;margin:0!important;}' +
      '.lok-ab .lok-sig{margin-top:30px;}' +
      '.lok-ab .lok-sig img{display:block;width:170px!important;height:auto!important;max-width:100%;}' +
      '.lok-ab .lok-role{font:600 14px/1.4 ' + F + '!important;color:' + C.dusk + '!important;margin:2px 0 0!important;letter-spacing:0!important;text-transform:none!important;}' +
      // responsive
      '@media(max-width:1279px){#lok-ab-hero h1{font-size:58px!important;}}' + // keeps the full-size circle on narrow laptops
      '@media(max-width:1149px){#lok-ab-hero{grid-template-columns:1fr;text-align:center;}#lok-ab-hero h1{font-size:54px!important;}' +
        '#lok-ab-hero .lok-lede{margin:18px auto 0!important;}.lok-trust,.lok-acts{justify-content:center;}.lok-wallfig{margin-top:36px;}' +
        '.lok-kn-q{font-size:19px;}}' +
      '@media(max-width:991px){.lok-ab .lok-wrap{padding:0 24px;}.lok-ab.lok-sec,.lok-ab-hero,.lok-ab-letter{padding-top:48px;padding-bottom:48px;}' +
        '.lok-ab .lok-h2{font-size:30px!important;}.lok-kn-top,.lok-wh-grid{grid-template-columns:1fr;gap:16px;}.lok-two{grid-template-columns:1fr;gap:14px;}' +
        '.lok-open{margin-top:8px;}}' +
      '@media(max-width:767px){.lok-ab .lok-wrap{padding:0 16px;}' +
        '#lok-ab-hero h1{font-size:40px!important;}#lok-ab-hero .lok-lede{font-size:16px!important;margin:14px auto 0!important;}' +
        '.lok-wallfig{margin-top:28px;}.lok-trust{font-size:12.5px;gap:6px 12px;}.lok-acts{flex-direction:column;gap:14px;margin-top:24px;}.lok-acts .lok-btn{width:100%;}' +
        '.lok-ab .lok-copy{font-size:15.5px!important;line-height:1.65!important;}.lok-kn-ask{font-size:18px;margin:32px 0 12px;}' +
        '.lok-kn-grid{display:none;}.lok-kn-rows{display:grid;}.lok-ab .lok-kn-note{font-size:13px!important;margin-top:16px;}' +
        '.lok-pr-grid{grid-template-columns:1fr;}.lok-pr{grid-template-columns:44px minmax(0,1fr);gap:14px;padding:22px 0 24px;}.lok-pr-ic{width:44px;height:44px;}.lok-pr-ic svg{width:17px;height:17px;}' +
        '.lok-ab .lok-pr-t{font-size:18px!important;}.lok-ab .lok-pr-b{font-size:15px!important;}' +
        '.lok-who{padding:24px 22px;}.lok-ab .lok-who-h{font-size:23px!important;margin-top:16px!important;}.lok-ab .lok-who-p{font-size:15px!important;line-height:1.65!important;}' +
        '.lok-chk{grid-template-columns:1fr;gap:8px;}.lok-chk li{font-size:14px;}.lok-who-foot{padding-top:20px;}' +
        '.lok-fnd{flex-direction:column;align-items:flex-start;gap:12px;padding:20px;margin-top:14px;}' +
        '.lok-open{padding:20px;}.lok-ab #wl-trigger{width:100%;}' +
        '.lok-ab .lok-lt-h{font-size:30px!important;}.lok-ab .lok-lt-face{width:56px!important;height:56px!important;}.lok-lt-head{gap:14px;}' +
        '.lok-lt-body{margin-top:22px;gap:14px;}.lok-ab .lok-lt-p{font-size:15.5px!important;line-height:1.75!important;}.lok-ab .lok-sig img{width:150px!important;}}' +
      '@media(prefers-reduced-motion:reduce){.lok-face .lok-ph,.lok-face .lok-go,.lok-face img,.lok-kn,.lok-kn-cov img,.lok-bf-win img,.lok-kn-foot .lok-ul svg,.lok-kn-row{transition:none;}' +
        '.lok-face:hover .lok-ph,.lok-face:focus-visible .lok-ph,.lok-kn:hover,.lok-kn:hover .lok-kn-cov img,.lok-kn:hover .lok-kn-foot .lok-ul svg{transform:none;}}';
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
  // CLEAN-P23: sized variant via the Storage render endpoint (window.LokaliImg).
  function imgSet(img, url, w) {
    var I = window.LokaliImg;
    if (I && typeof I.set === 'function') I.set(img, url, w); else img.src = url;
  }
  function vendorHref(slug) { return '/' + encodeURIComponent(slug); }
  function link(cls, text, href) { var a = el('a', cls, text); a.href = href; return a; }
  // Move a Designer element into the new layout under a clean class, so its
  // text (what crawlers read) stays the page's own and its old styles drop off.
  function take(node, cls) { if (!node) return null; node.className = cls; node.removeAttribute('style'); return node; }
  function oneLine(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  // ---- hero + the circle of faces ------------------------------------------
  function faceNode(f) {
    var a = el('a', 'lok-face');
    a.href = vendorHref(f.slug);
    a.setAttribute('aria-label', 'Visit ' + f.name + "'s storefront, " + f.biz);
    a.setAttribute('data-vid', String(f.vid));
    var ph = el('span', 'lok-ph');
    var img = el('img');
    img.alt = '';
    img.decoding = 'async';
    imgSet(img, f.img, 240);
    // A blocked or missing photo becomes an initial, so the circle never has a hole.
    img.addEventListener('error', function () {
      if (!img.parentNode) return;
      img.parentNode.replaceChild(el('span', 'lok-init', f.name.charAt(0)), img);
    });
    ph.appendChild(img);
    ph.appendChild(svgSpan('lok-go', I_ARROW));
    a.appendChild(ph);
    var nm = el('span', 'lok-nm');
    nm.appendChild(el('b', null, f.name));
    nm.appendChild(el('span', null, f.biz));
    a.appendChild(nm);
    return a;
  }

  function fillWall(wall, list) {
    wall.textContent = '';
    list.slice(0, RING.length).forEach(function (f) { wall.appendChild(faceNode(f)); });
    layoutWall(wall);
  }

  function layoutWall(wall) {
    var fig = wall.closest('.lok-wallfig');
    if (!fig) return;
    var w = fig.clientWidth; // the space the circle has (the hero's right column, or the whole row)
    var g = GEOS[GEOS.length - 1];
    for (var k = 0; k < GEOS.length; k++) { if (w >= GEOS[k].min) { g = GEOS[k]; break; } }
    wall.style.width = g.W + 'px';
    wall.style.height = g.H + 'px';
    wall.style.setProperty('--d', g.D + 'px');
    wall.style.setProperty('--lw', g.LW + 'px');
    wall.classList.toggle('lok-nobiz', !g.biz);
    var faces = wall.children;
    for (var i = 0; i < faces.length; i++) {
      var r = RING[i] || RING[0];
      faces[i].style.left = (g.W / 2 + r[0] * g.R - g.LW / 2).toFixed(1) + 'px';
      faces[i].style.top = (g.cy + r[1] * g.R - g.D / 2).toFixed(1) + 'px';
    }
  }

  function mountHero(sec) {
    var h1 = sec.querySelector('h1');
    if (!h1) return false;
    var lede = sec.querySelector('p.paragraph') || sec.querySelector('p');
    var wrap = el('div', 'lok-ab lok-ab-hero');
    var grid = el('div', 'lok-wrap');
    grid.id = 'lok-ab-hero';
    var txt = el('div', 'lok-hero-txt');
    // Two-tone headline, only while the Designer copy is the one we styled for.
    if (oneLine(h1.textContent) === 'Community over platforms') {
      h1.textContent = '';
      h1.appendChild(document.createTextNode('Community'));
      h1.appendChild(el('br'));
      h1.appendChild(el('span', 'lok-o', 'over platforms.'));
    }
    txt.appendChild(h1);
    if (lede) txt.appendChild(take(lede, 'lok-lede'));
    var trust = el('ul', 'lok-trust');
    ['Woman-owned', 'Independent, no outside investors', 'Built in The Woodlands, TX'].forEach(function (t) { trust.appendChild(el('li', null, t)); });
    txt.appendChild(trust);
    var acts = el('div', 'lok-acts');
    acts.appendChild(link('lok-btn lok-or', 'Browse the Market', '/the-market'));
    acts.appendChild(link('lok-ul lok-or', "Read Francesca's story", '#lok-ab-letter'));
    txt.appendChild(acts);
    grid.appendChild(txt);

    var fig = el('div', 'lok-wallfig');
    var box = el('div');
    var wall = el('div', 'lok-wall');
    wall.id = 'lok-ab-wall';
    box.appendChild(wall);
    fig.appendChild(box);
    fig.appendChild(el('p', 'lok-cap', 'A few of the neighbors with a storefront on Lokali.'));
    grid.appendChild(fig);
    wrap.appendChild(grid);
    sec.appendChild(wrap);
    fillWall(wall, FACES);
    var queued = false;
    window.addEventListener('resize', function () {
      if (queued) return;
      queued = true;
      var run = function () { queued = false; layoutWall(wall); };
      if (window.requestAnimationFrame) window.requestAnimationFrame(run); else setTimeout(run, 16);
    });
    return true;
  }

  // ---- the people your neighbors recommend ---------------------------------
  function cardCover(c) {
    var img = el('img');
    img.alt = c.alt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    imgSet(img, c.img, 760);
    if (!c.web) {
      if (c.pos) img.style.objectPosition = c.pos;
      return img;
    }
    var bf = el('span', 'lok-bf'), win = el('span', 'lok-bf-win'), bar = el('span', 'lok-bf-bar');
    bar.appendChild(el('i')); bar.appendChild(el('i')); bar.appendChild(el('i'));
    win.appendChild(bar);
    win.appendChild(img);
    bf.appendChild(win);
    return bf;
  }

  function cardNode(c) {
    var a = el('a', 'lok-kn');
    a.href = vendorHref(c.slug);
    a.setAttribute('data-vid', String(c.vid));
    var cov = el('span', 'lok-kn-cov');
    cov.style.display = 'block';
    cov.appendChild(cardCover(c));
    a.appendChild(cov);
    var body = el('span', 'lok-kn-body');
    var who = el('span', 'lok-kn-who');
    var face = el('img', 'lok-kn-face');
    face.alt = '';
    face.loading = 'lazy';
    imgSet(face, c.face, 96);
    face.addEventListener('error', function () { face.style.visibility = 'hidden'; });
    who.appendChild(face);
    var names = el('span');
    names.appendChild(el('span', 'lok-kn-name', c.who));
    names.lastChild.style.display = 'block';
    names.appendChild(el('span', 'lok-kn-biz', c.biz + ', ' + c.town));
    names.lastChild.style.display = 'block';
    who.appendChild(names);
    body.appendChild(who);
    var foot = el('span', 'lok-kn-foot');
    if (c.founding) {
      var fv = svgSpan('lok-fv', I_CROWN);
      fv.appendChild(document.createTextNode('Founding vendor'));
      foot.appendChild(fv);
    }
    var go = el('span', 'lok-ul', 'Visit storefront');
    go.insertAdjacentHTML('beforeend', I_ARROW); // static SVG
    foot.appendChild(go);
    body.appendChild(foot);
    a.appendChild(body);
    return a;
  }

  function rowNode(c) {
    var a = el('a', 'lok-kn-row');
    a.href = vendorHref(c.slug);
    a.setAttribute('data-vid', String(c.vid));
    var th = el('span', 'lok-th');
    var img = el('img');
    img.alt = c.alt || '';
    img.loading = 'lazy';
    imgSet(img, c.img, 240);
    img.style.objectPosition = c.web ? '50% 0' : (c.pos || '50% 50%');
    th.appendChild(img);
    a.appendChild(th);
    var txt = el('span');
    txt.appendChild(el('span', 'lok-q', c.q));
    var w = el('span', 'lok-w');
    var face = el('img');
    face.alt = '';
    face.loading = 'lazy';
    imgSet(face, c.face, 64);
    w.appendChild(face);
    w.appendChild(el('span', null, c.who + ', ' + c.biz));
    txt.appendChild(w);
    txt.appendChild(el('span', 'lok-ul', 'Visit storefront'));
    a.appendChild(txt);
    return a;
  }

  function buildKnow(lkab) {
    var top = lkab.querySelector('.lkab-h');
    var paras = lkab.querySelectorAll('p');
    var sec = el('section', 'lok-ab lok-sec lok-ab-know');
    sec.id = 'lok-ab-know';
    var wrap = el('div', 'lok-wrap');
    var head = el('div', 'lok-kn-top');
    if (top) head.appendChild(take(top, 'lok-h2'));
    var copy = el('div');
    for (var i = 0; i < paras.length; i++) {
      if (paras[i].closest('.lkab-panel')) continue;
      copy.appendChild(take(paras[i], 'lok-copy'));
    }
    head.appendChild(copy);
    wrap.appendChild(head);
    wrap.appendChild(el('p', 'lok-kn-ask', 'Do you know someone who…'));
    var grid = el('div', 'lok-kn-grid');
    CARDS.forEach(function (c) {
      var q = el('p', 'lok-kn-q', c.q);
      q.setAttribute('data-vid', String(c.vid));
      grid.appendChild(q);
    });
    CARDS.forEach(function (c) { grid.appendChild(cardNode(c)); });
    wrap.appendChild(grid);
    var rows = el('div', 'lok-kn-rows');
    CARDS.forEach(function (c) { rows.appendChild(rowNode(c)); });
    wrap.appendChild(rows);
    var note = el('p', 'lok-cap lok-kn-note');
    note.appendChild(el('span', null, 'Three real storefronts on The Market right now.'));
    note.appendChild(link('lok-ul', 'See everyone in the Market', '/the-market'));
    wrap.appendChild(note);
    sec.appendChild(wrap);
    var host = lkab.closest('.w-embed') || lkab;
    host.parentNode.insertBefore(sec, host);
    host.classList.add('lok-ab-old');
  }

  // ---- principles ------------------------------------------------------------
  function buildPrinciples(sec) {
    var heading = sec.querySelector(':scope > h1, :scope > h2');
    var cards = sec.querySelectorAll('.grid-8 > div');
    if (!cards.length) return;
    var wrap = el('div', 'lok-ab lok-sec lok-ab-pr');
    var inner = el('div', 'lok-wrap');
    if (heading) {
      if (oneLine(heading.textContent) === 'Our Principles') heading.textContent = 'What we believe';
      inner.appendChild(take(heading, 'lok-h2'));
    }
    var grid = el('div', 'lok-pr-grid');
    for (var i = 0; i < cards.length; i++) {
      var t = cards[i].querySelector('.text-block-66'), b = cards[i].querySelector('.text-block-65');
      var item = el('div', 'lok-pr');
      item.appendChild(svgSpan('lok-pr-ic', PR_ICONS[i % PR_ICONS.length]));
      var txt = el('div');
      if (t) txt.appendChild(take(t, 'lok-pr-t'));
      if (b) txt.appendChild(take(b, 'lok-pr-b'));
      item.appendChild(txt);
      grid.appendChild(item);
    }
    inner.appendChild(grid);
    wrap.appendChild(inner);
    hideChildren(sec);
    sec.appendChild(wrap);
  }

  function hideChildren(sec) {
    var kids = sec.children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.add('lok-ab-old');
  }

  // ---- built for two kinds of people ---------------------------------------
  function whoCard(src, kind) {
    var cust = kind === 'cust';
    var card = el('div', 'lok-who' + (cust ? ' lok-cust' : ''));
    var top = el('div', 'lok-who-top');
    top.appendChild(svgSpan('lok-who-ic', cust ? I_HEART : I_STORE));
    top.appendChild(el('span', 'lok-who-k', cust ? 'Customers' : 'Vendors'));
    card.appendChild(top);
    var h = src.querySelector(cust ? '.text-block-66-copy' : '.grid-heading');
    var p = src.querySelector(cust ? '.text-block-69' : '.body');
    if (h) card.appendChild(take(h, 'lok-who-h'));
    if (p) card.appendChild(take(p, 'lok-who-p'));
    var ul = el('ul', 'lok-chk');
    var bullets = src.querySelectorAll('.bullet');
    for (var i = 0; i < bullets.length; i++) {
      var t = bullets[i].querySelector('div');
      if (!t) continue;
      var li = el('li');
      li.innerHTML = I_CHECK; // static SVG
      li.appendChild(take(t, 'lok-chk-t'));
      ul.appendChild(li);
    }
    card.appendChild(ul);
    var foot = el('div', 'lok-who-foot');
    if (cust) {
      foot.appendChild(link('lok-btn lok-or', 'Browse the Market', '/the-market'));
    } else {
      foot.appendChild(link('lok-btn', 'Open your storefront', '/sign-up'));
      var cmp = src.querySelector('a.about-compare-link');
      if (cmp) { cmp.textContent = 'See how we compare'; foot.appendChild(take(cmp, 'lok-ul')); }
    }
    card.appendChild(foot);
    return card;
  }

  function buildTwo(sec) {
    var heading = sec.querySelector(':scope > h1, :scope > h2');
    var ven = sec.querySelector('.vendors-grid'), cus = sec.querySelector('.customers-grid');
    if (!ven || !cus) return;
    var wrap = el('div', 'lok-ab lok-sec lok-ab-two');
    var inner = el('div', 'lok-wrap');
    if (heading) inner.appendChild(take(heading, 'lok-h2'));
    var two = el('div', 'lok-two');
    two.appendChild(whoCard(ven, 'ven'));
    two.appendChild(whoCard(cus, 'cust'));
    inner.appendChild(two);
    var fsrc = sec.querySelector('.div-block-145');
    if (fsrc) {
      var fnd = el('div', 'lok-fnd');
      fnd.appendChild(svgSpan('lok-fnd-ic', I_CROWN));
      var ft = el('div');
      var fh = fsrc.querySelector('h1, h2, h3');
      var fp = fsrc.querySelector('.text-block-78');
      if (fh) ft.appendChild(take(fh, 'lok-fnd-t'));
      if (fp) ft.appendChild(take(fp, 'lok-fnd-p'));
      fnd.appendChild(ft);
      fnd.appendChild(link('lok-ul', 'About founding vendors', '/founding-vendors'));
      inner.appendChild(fnd);
    }
    wrap.appendChild(inner);
    hideChildren(sec);
    sec.appendChild(wrap);
  }

  // ---- built for everywhere + the waitlist ---------------------------------
  function buildWhere(sec) {
    var heading = sec.querySelector(':scope > h1, :scope > h2');
    var copy = sec.querySelector(':scope > .text-block-70');
    var lis = sec.querySelectorAll('.vendors-grid li');
    var more = sec.querySelector('.vendors-grid .text-block-71');
    var wlBox = sec.querySelector('.customers-grid');
    var trigger = sec.querySelector('#wl-trigger');
    var wrap = el('div', 'lok-ab lok-sec lok-ab-where');
    var grid = el('div', 'lok-wrap lok-wh-grid');
    var left = el('div');
    if (heading) left.appendChild(take(heading, 'lok-h2'));
    if (copy) left.appendChild(take(copy, 'lok-copy'));
    grid.appendChild(left);
    var open = el('div', 'lok-open');
    open.appendChild(el('h3', 'lok-open-h', 'Open now'));
    var areas = el('div', 'lok-areas');
    for (var i = 0; i < lis.length; i++) {
      var name = oneLine(lis[i].textContent);
      if (!name) continue;
      var slug = AREAS[name.toLowerCase()];
      var chip = el('a', 'lok-area');
      chip.href = slug ? '/the-market?area=' + encodeURIComponent(slug) : '/the-market';
      chip.innerHTML = I_PIN; // static SVG
      chip.appendChild(document.createTextNode(name));
      areas.appendChild(chip);
    }
    open.appendChild(areas);
    if (more) open.appendChild(take(more, 'lok-more'));
    if (wlBox && trigger) {
      var wl = el('div', 'lok-wl');
      var wh = wlBox.querySelector('.text-block-66-copy'), wp = wlBox.querySelector('.text-block-69');
      if (wh) wl.appendChild(take(wh, 'lok-wl-h'));
      if (wp) wl.appendChild(take(wp, 'lok-wl-p'));
      // Keep the real #wl-trigger node (lokali-waitlist.js opens the form from it).
      trigger.className = 'lok-btn lok-or';
      trigger.textContent = oneLine(trigger.textContent) || 'Request your neighborhood';
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('tabindex', '0');
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
      });
      wl.appendChild(trigger);
      open.appendChild(wl);
    }
    grid.appendChild(open);
    wrap.appendChild(grid);
    hideChildren(sec);
    sec.appendChild(wrap);
  }

  // ---- the letter ------------------------------------------------------------
  function buildLetter(sec) {
    var face = sec.querySelector('img.image-31') || sec.querySelector('.div-block-199 > img');
    var h = sec.querySelector('h2');
    var ps = sec.querySelectorAll('p');
    var sig = sec.querySelector('.w-embed');
    var role = sec.querySelector('.founder-role');
    var wrap = el('div', 'lok-ab lok-ab-letter');
    wrap.id = 'lok-ab-letter';
    var inner = el('div', 'lok-wrap');
    var letter = el('div', 'lok-letter');
    var head = el('div', 'lok-lt-head');
    if (face) {
      face.removeAttribute('srcset');
      face.removeAttribute('sizes');
      head.appendChild(take(face, 'lok-lt-face'));
    }
    if (h) head.appendChild(take(h, 'lok-lt-h'));
    letter.appendChild(head);
    var body = el('div', 'lok-lt-body');
    for (var i = 0; i < ps.length; i++) body.appendChild(take(ps[i], 'lok-lt-p'));
    letter.appendChild(body);
    if (sig) letter.appendChild(take(sig, 'lok-sig'));
    if (role) letter.appendChild(take(role, 'lok-role'));
    inner.appendChild(letter);
    wrap.appendChild(inner);
    hideChildren(sec);
    sec.appendChild(wrap);
  }

  // ---- live vendor check (non-blocking) -----------------------------------
  // Swaps a face whose storefront is no longer published for the next
  // stand-in, and drops such a storefront card. Any failure = page as built.
  function reconcile() {
    if (!window.LokaliSupabaseReady || !window.LokaliSupabaseReady.then) return;
    window.LokaliSupabaseReady.then(function (c) {
      return c.from('vendors').select('id').eq('is_publish_ready', true).limit(500);
    }).then(function (res) {
      if (!res || res.error || !Array.isArray(res.data) || !res.data.length) return;
      var live = {};
      res.data.forEach(function (v) { if (v && v.id != null) live[String(v.id)] = true; });
      if (FACES.some(function (f) { return !live[String(f.vid)]; })) {
        var keep = FACES.concat(RESERVE).filter(function (f) { return live[String(f.vid)]; });
        var wall = document.getElementById('lok-ab-wall');
        if (wall && keep.length) fillWall(wall, keep);
      }
      var nodes = document.querySelectorAll('#lok-ab-know [data-vid]');
      for (var i = 0; i < nodes.length; i++) {
        if (!live[nodes[i].getAttribute('data-vid')]) nodes[i].style.display = 'none';
      }
    }).catch(function (e) {
      try { console.warn('[lokali-about] vendor check skipped:', e && e.message); } catch (x) {}
    });
  }

  // ---- boot ---------------------------------------------------------------
  function start() {
    var hero = document.querySelector('section.section-2');
    var founder = document.querySelector('section.founder-section');
    if (!hero || !founder) return; // About page only
    if (document.getElementById('lok-ab-hero') || !hero.querySelector('h1')) return;
    injectStyle();
    // The class hides the old wrappers first, so the circle measures the space it really gets.
    document.documentElement.classList.add('lok-about2');
    mountHero(hero);
    var lkab = document.querySelector('section.lkab');
    if (lkab) buildKnow(lkab);
    var secs = document.querySelectorAll('section.section-13');
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i];
      if (s.classList.contains('lcustom-background')) buildWhere(s);
      else if (s.querySelector('.grid-8')) buildPrinciples(s);
      else if (s.querySelector('.vendors-grid')) buildTwo(s);
    }
    buildLetter(founder);
    var wall = document.getElementById('lok-ab-wall');
    if (wall) {
      layoutWall(wall);
      // Web fonts can change the column widths once they land.
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layoutWall(wall); });
      window.addEventListener('load', function () { layoutWall(wall); });
    }
    reconcile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
