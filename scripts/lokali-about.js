/**
 * Lokali — About page v3 (2026-11 site-consistency pass, F said "About: yes"
 * on mockup v14/v15, claude.ai/artifact/Why9i9icbjoqL6crm9baJL, 2026-11-22).
 *
 * Rebuilds /about on top of the Webflow page without touching the Designer.
 * Every heading and paragraph that stays is the page's own element, MOVED into
 * the new layout (so the HTML crawlers read is the page's own); only the cover
 * photo, the quote, icons and buttons are new.
 *   - Cover: one neighbor's own storefront photo in a 4:5 frame on pink, the
 *     headline on a white card overlapping it. The neighbor ROTATES per visit
 *     (COVERS below, F 2026-11-22: "rotate between a few neighbors but make
 *     sure the images are good and would be received well"). Owner photos
 *     only: posed, well lit, no customers or children. Every vendor photo is
 *     capped near 800px, which is why the frame is not full-bleed.
 *   - Under the cover: the opening line, three tags, a link to the letter.
 *   - "The people your neighbors actually recommend": one big quote (the
 *     three storefront cards are gone, so no single business is singled out).
 *   - What we believe: the four principles with their icons, two columns.
 *   - Built for two kinds of people, and Built for everywhere: kept, in pink.
 *   - Francesca's letter last, word for word, with her photo in a circle.
 * Colors follow docs/design/brand-guide.html (F 2026-11-22 "Yes, change the
 * rule"): About is a PINK page, so pink does every job: #FDE6F2 ground,
 * #EE0290 big words, #B0006A buttons and small words. No violet inside the
 * page (violet stays in the header), no orange anywhere.
 *
 * Cover picks live in COVERS below: changing one is an edit here + a script
 * release (no SQL). Vendor rows are only consulted to drop a pick whose
 * storefront is no longer published.
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

  // ---- the cover rotation (F 2026-11-22) -------------------------------------
  // Each owner gets a heads-up first (docs/marketing/site-consistency-2026-11/
  // about-cover-notes.md); anyone who says no comes off this list.
  var COVERS = [
    { vid: 626, slug: 'yeehatx', name: 'Jessica', biz: 'YeeHaTx', what: 'Hat maker', cap: "Jessica, YeeHaTx. Hat maker.", img: MEDIA + '626/owner/muorhpcwha06kt.jpg', pos: '50% 30%', alt: 'Jessica of YeeHaTx with her hats' },
    { vid: 539, slug: 'mias-table', name: 'Arelys', biz: "Mia's Table", what: 'Restaurant, Shenandoah', cap: "Arelys, Mia's Table. Restaurant, Shenandoah.", img: MEDIA + '539/owner/muylfkmqvv1iar.webp', pos: '60% 40%', alt: "Arelys at Mia's Table" },
    { vid: 787, slug: 'yaneliz-rosado-law-firm-pllc', name: 'Yaneliz', biz: 'Yaneliz Rosado Law Firm', what: 'Attorney', cap: "Yaneliz, attorney. Yaneliz Rosado Law Firm.", img: MEDIA + '787/owner/mv8qq0ptghh23i.jpg', pos: '50% 25%', alt: 'Yaneliz, attorney' },
    { vid: 685, slug: 'baxter-blue-woodworks', name: 'Russ', biz: 'Baxter Blue Woodworks', what: 'Woodworker', cap: "Russ, Baxter Blue Woodworks. Woodworker.", img: MEDIA + '685/profile/bbw_owner.jpg', pos: '50% 40%', alt: 'Russ of Baxter Blue Woodworks with his dog and a turned bowl' },
    { vid: 688, slug: 'aniko-lifestyle-wellness', name: 'Catherine', biz: 'ANIKO Lifestyle & Wellness', what: 'Wellness', cap: "Catherine, ANIKO Lifestyle & Wellness.", img: MEDIA + '688/owner/mv03xtkmr659cc.jpg', pos: '62% 30%', alt: 'Catherine of ANIKO Lifestyle & Wellness' },
    { vid: 722, slug: 'the-og-pour-mobile-bar', name: 'The OG Pour', biz: 'The OG Pour Mobile Bar', what: 'Mobile bar', cap: "The OG Pour. Mobile bar.", img: MEDIA + '722/owner/mvpqpszsnvpebr.jpg', pos: '50% 30%', alt: 'The OG Pour mixing drinks at an event' }
  ];
  // The nine open areas: `slug` = the alias the Market's ?area= accepts (as in lokali-home.js).
  var AREAS = { 'the woodlands': 'the-woodlands', 'woodforest': 'woodforest', 'shenandoah': 'shenandoah', 'conroe': 'conroe', 'spring': 'spring', 'tomball': 'tomball', 'katy': 'katy', 'sugar land': 'sugar-land', 'houston': 'houston' };

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

  // Copy F approved in the mockup. Swapped only while the Designer still
  // carries the old wording, so a later Designer edit always wins.
  var NEW_H1 = 'Community over platforms';
  var OLD_LEDE = 'Lokali was built for the attorney without a downtown office, the plumber who works from a truck, and the woodworker whose shop is the garage.';
  var NEW_LEDE = 'Lokali is the marketplace for local businesses and professionals near you. It was built for the attorney without a downtown office, the plumber who works from a truck, and the woodworker whose shop is the garage.';
  var PEOPLE = 'No outside advertisers. Vendors can pick a plan that helps them stand out, but no investor, sponsor or advertiser ever decides who you see.';
  // F 2026-11-22 picked version C (tea, not coffee: she doesn't drink coffee).
  var LETTER_OLD = "Lokali is woman-owned and independent, and it will stay that way. There are no outside investors setting the roadmap and no advertisers to keep happy, which is exactly why a vendor here never has to outspend anyone to be found. If a neighbor is looking for what you do, you should be easy to find. That is the whole idea, and I get to build it one storefront at a time.";
  var LETTER_NEW = "Lokali is woman-owned and runs mostly on stubbornness and tea. Whoever helps it grow, the rule stays the same: nobody buys their way to the top, so a vendor here never has to outspend anyone to be found. If a neighbor is looking for what you do, you should be easy to find. That is the whole idea, and I get to build it one storefront at a time.";
  var REWORD = {
    'No outside advertisers. No third-party algorithms deciding who gets seen. Lokali may offer ways for vendors to stand out, but those tools are built by us, for you, and they never let outside money dictate your visibility.': PEOPLE,
    'No outside advertisers. No third-party algorithms deciding who gets seen. Lokali may offer vendors ways to stand out, but we build those tools ourselves, and outside money never decides who you see.': PEOPLE
  };

  // Brand guide: pink page. pk = ground, pb = big words/shapes, pd = buttons + small words.
  var C = { ink: '#45415A', body: '#4A4761', pk: '#FDE6F2', pb: '#EE0290', pd: '#B0006A', pdk: '#8E0056', line: '#F3C6DE', edge: '#EEE7F0' };
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
      '.lok-ab .lok-wrap{max-width:1200px;margin:0 auto;padding:0 40px;}' +
      '.lok-ab.lok-sec{padding:88px 0;}' +
      '.lok-ab .lok-eye{font:800 12px/1.3 ' + F + '!important;letter-spacing:.16em!important;text-transform:uppercase!important;color:' + C.pd + '!important;margin:0 0 14px!important;}' +
      '.lok-ab .lok-h2{font-family:' + F + '!important;font-size:42px!important;line-height:1.08!important;font-weight:800!important;letter-spacing:-.03em!important;color:' + C.ink + '!important;margin:0!important;text-wrap:balance;text-transform:none!important;}' +
      '.lok-ab .lok-copy{font-family:' + F + '!important;font-size:17px!important;line-height:1.7!important;color:' + C.body + '!important;margin:0!important;font-weight:400!important;}' +
      '.lok-ab .lok-ul{color:' + C.pd + '!important;font-weight:700;text-decoration:underline!important;text-underline-offset:3px;text-decoration-thickness:1.5px;cursor:pointer;}' +
      '.lok-ab .lok-ul:hover{color:' + C.pdk + '!important;}' +
      '.lok-ab .lok-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:' + C.pd + ';color:#fff!important;font-family:' + F + ';font-weight:800;border-radius:999px;padding:16px 28px;font-size:15.5px;line-height:1.2;text-decoration:none!important;border:2px solid ' + C.pd + ';cursor:pointer;}' +
      '.lok-ab .lok-btn:hover{background:' + C.pdk + ';border-color:' + C.pdk + ';}' +
      '.lok-ab .lok-btn.lok-ghost{background:transparent;color:' + C.pd + '!important;}' +
      '.lok-ab .lok-btn.lok-ghost:hover{background:' + C.pk + ';}' +
      '.lok-ab .lok-btn:focus-visible,.lok-ab .lok-ul:focus-visible,.lok-ab a:focus-visible{outline:2px solid ' + C.pd + ';outline-offset:3px;}' +
      // cover
      '.lok-ab-cover{background:' + C.pk + ';padding:56px 0 0;}' +
      '#lok-ab-hero{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);align-items:center;}' +
      '.lok-cv-ph{grid-column:2;grid-row:1;margin:0;max-width:560px;justify-self:end;width:100%;}' +
      '.lok-cv-ph a{display:block;text-decoration:none!important;color:inherit;}' +
      '.lok-cv-img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:4px;background:#F9D3E8;}' +
      '.lok-cv-cap{margin-top:12px;font:500 13.5px/1.45 ' + F + ';color:' + C.body + ';}' +
      '.lok-cv-cap b{font:800 11px/1 ' + F + ';letter-spacing:.14em;text-transform:uppercase;color:' + C.pd + ';margin-right:8px;}' +
      '.lok-cv-cap a:hover span{text-decoration:underline;text-underline-offset:3px;}' +
      '.lok-cv-card{grid-column:1;grid-row:1;position:relative;z-index:1;margin-right:-110px;background:#fff;border-radius:6px;padding:44px 44px 46px;box-shadow:0 20px 48px rgba(176,0,106,.10);}' +
      '#lok-ab-hero h1{font-family:' + F + '!important;font-size:60px!important;line-height:1.02!important;font-weight:800!important;letter-spacing:-.035em!important;color:' + C.ink + '!important;margin:0 0 30px!important;text-wrap:balance;text-transform:none!important;}' +
      '#lok-ab-hero h1 .lok-hl{color:' + C.pb + ';}' +
      '.lok-ab-under{background:' + C.pk + ';padding:44px 0 64px;}' +
      '.lok-un{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:56px;align-items:center;}' +
      '.lok-ab .lok-lede{font-family:' + F + '!important;font-size:19px!important;line-height:1.65!important;color:' + C.body + '!important;margin:0!important;font-weight:400!important;}' +
      '.lok-tags{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0 0 18px;padding:0;}' +
      '.lok-tags li{margin:0;border:1.5px solid ' + C.line + ';border-radius:999px;padding:6px 14px;font:700 13.5px/1.3 ' + F + ';color:' + C.pd + ';background:#fff;}' +
      // the quote
      '.lok-ab-q{background:#fff;padding:96px 0 40px;text-align:center;}' +
      '.lok-ab-q .lok-eye{text-align:center;}' +
      '.lok-ab .lok-quote{margin:0 auto!important;max-width:880px;font:800 40px/1.2 ' + F + '!important;letter-spacing:-.03em!important;color:' + C.ink + '!important;text-wrap:balance;}' +
      '.lok-ab .lok-quote span{color:' + C.pb + ';}' +
      '.lok-ab .lok-q-sub{margin:18px auto 0!important;max-width:40em;font:400 17px/1.6 ' + F + '!important;color:' + C.body + '!important;}' +
      // principles
      '.lok-ab-pr{background:#fff;}' +
      '.lok-pr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:2px solid ' + C.ink + ';}' +
      '.lok-pr{padding:30px 36px 32px 0;border-bottom:1px solid ' + C.edge + ';}' +
      '.lok-pr:nth-child(odd){border-right:1px solid ' + C.edge + ';}' +
      '.lok-pr:nth-child(even){padding-left:36px;padding-right:0;}' +
      '.lok-pr-ic{width:52px;height:52px;border-radius:50%;background:' + C.pk + ';color:' + C.pd + ';display:flex;align-items:center;justify-content:center;margin-bottom:16px;}' +
      '.lok-pr-ic svg{width:21px;height:21px;}' +
      '.lok-ab .lok-pr-t{font:800 22px/1.25 ' + F + '!important;letter-spacing:-.01em!important;color:' + C.ink + '!important;margin:0!important;text-transform:none!important;}' +
      '.lok-ab .lok-pr-b{font:400 16px/1.65 ' + F + '!important;color:' + C.body + '!important;margin:8px 0 0!important;max-width:30em;}' +
      // two kinds of people
      '.lok-ab-two{background:#fff;padding-top:24px!important;}' +
      '.lok-ab-two .lok-h2{margin-bottom:30px!important;}' +
      '.lok-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;}' +
      '.lok-who{background:' + C.pk + ';border-radius:22px;padding:34px 36px 32px;display:flex;flex-direction:column;min-width:0;}' +
      '.lok-who-top{display:flex;align-items:center;gap:12px;}' +
      '.lok-who-ic{width:44px;height:44px;border-radius:50%;background:#fff;color:' + C.pd + ';display:flex;align-items:center;justify-content:center;flex:none;}' +
      '.lok-who-ic svg{width:18px;height:18px;}' +
      '.lok-who-k{font:800 12px/1.2 ' + F + ';letter-spacing:.14em;text-transform:uppercase;color:' + C.pd + ';}' +
      '.lok-ab .lok-who-h{font:800 28px/1.15 ' + F + '!important;letter-spacing:-.025em!important;color:' + C.ink + '!important;margin:20px 0 0!important;text-transform:none!important;}' +
      '.lok-ab .lok-who-p{font:400 16px/1.7 ' + F + '!important;color:' + C.body + '!important;margin:12px 0 0!important;}' +
      '.lok-chk{list-style:none!important;padding:0!important;margin:22px 0 0!important;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;}' +
      '.lok-chk li{display:flex;gap:9px;align-items:baseline;min-width:0;margin:0!important;padding:0!important;font:600 14.5px/1.4 ' + F + ';color:' + C.ink + ';}' +
      '.lok-chk li::before{display:none!important;}' +
      '.lok-chk svg{width:12px;height:12px;color:' + C.pd + ';flex:none;position:relative;top:1px;}' +
      '.lok-ab .lok-chk li>*:not(svg){font:inherit!important;color:inherit!important;margin:0!important;}' +
      '.lok-who-foot{margin-top:auto;padding-top:26px;display:flex;align-items:center;gap:12px 18px;flex-wrap:wrap;}' +
      '.lok-who-foot .lok-btn{padding:13px 22px;font-size:14.5px;}' +
      '.lok-who-foot .lok-ul{font-size:15px;}' +
      '.lok-fnd{display:flex;align-items:center;gap:20px;margin-top:24px;border:1.5px solid ' + C.line + ';border-radius:18px;padding:22px 26px;background:#fff;}' +
      '.lok-fnd-ic{width:46px;height:46px;border-radius:50%;background:' + C.pk + ';color:' + C.pd + ';display:flex;align-items:center;justify-content:center;flex:none;}' +
      '.lok-fnd-ic svg{width:18px;height:18px;}' +
      '.lok-fnd>div{flex:1;min-width:0;}' +
      '.lok-ab .lok-fnd-t{font:800 17px/1.35 ' + F + '!important;color:' + C.ink + '!important;margin:0!important;letter-spacing:0!important;text-transform:none!important;}' +
      '.lok-ab .lok-fnd-t strong{font-weight:800!important;}' +
      '.lok-ab .lok-fnd-p{font:400 14.5px/1.6 ' + F + '!important;color:' + C.body + '!important;margin:4px 0 0!important;max-width:62em;}' +
      '.lok-fnd .lok-ul{white-space:nowrap;font-size:15px;}' +
      // built for everywhere + waitlist
      '.lok-ab-where{background:' + C.pk + ';}' +
      '.lok-wh-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;align-items:start;}' +
      '.lok-wh-grid .lok-copy{margin-top:16px!important;}' +
      '.lok-ab .lok-h2 strong{font-weight:800!important;}' +
      '.lok-open{background:#fff;border-radius:22px;padding:28px 30px 30px;box-shadow:0 1px 2px rgba(176,0,106,.06),0 8px 24px rgba(176,0,106,.06);}' +
      '.lok-ab .lok-open-h{font:800 12px/1.3 ' + F + '!important;letter-spacing:.16em!important;text-transform:uppercase!important;color:' + C.pd + '!important;margin:0!important;}' +
      '.lok-areas{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}' +
      '.lok-area{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid ' + C.line + ';border-radius:999px;padding:8px 14px;font:600 14px/1.2 ' + F + ';color:' + C.ink + '!important;text-decoration:none!important;}' +
      '.lok-area svg{width:11px;height:11px;color:' + C.pd + ';}' +
      '.lok-area:hover{background:' + C.pk + ';}' +
      '.lok-ab .lok-more{font:400 14px/1.5 ' + F + '!important;color:' + C.body + '!important;margin:14px 0 0!important;}' +
      '.lok-wl{border-top:1px solid ' + C.line + ';margin-top:24px;padding-top:22px;}' +
      '.lok-ab .lok-wl-h{font:800 22px/1.25 ' + F + '!important;letter-spacing:-.02em!important;color:' + C.ink + '!important;margin:0!important;text-transform:none!important;}' +
      '.lok-ab .lok-wl-p{font:400 15px/1.65 ' + F + '!important;color:' + C.body + '!important;margin:8px 0 0!important;}' +
      '.lok-ab #wl-trigger{margin-top:18px;padding:14px 24px;font-size:15px;}' +
      // the letter
      '.lok-ab-letter{background:#fff;padding:96px 0 104px;scroll-margin-top:90px;}' +
      '.lok-letter{display:grid;grid-template-columns:260px minmax(0,1fr);gap:56px;align-items:start;max-width:1000px;margin:0 auto;}' +
      '.lok-ab .lok-lt-face{display:block;width:260px!important;height:260px!important;border-radius:50%!important;object-fit:cover;margin:0!important;max-width:none!important;box-shadow:0 0 0 8px ' + C.pk + ';}' +
      '.lok-ab .lok-lt-h{font:800 40px/1.1 ' + F + '!important;letter-spacing:-.03em!important;color:' + C.ink + '!important;margin:0!important;text-transform:none!important;}' +
      '.lok-lt-body{margin-top:24px;display:grid;gap:18px;}' +
      '.lok-ab .lok-lt-p{font:400 17px/1.8 ' + F + '!important;color:' + C.body + '!important;margin:0!important;}' +
      '.lok-ab .lok-sig{margin-top:30px;}' +
      '.lok-ab .lok-sig img{display:block;width:170px!important;height:auto!important;max-width:100%;}' +
      '.lok-ab .lok-role{font:600 14px/1.4 ' + F + '!important;color:' + C.body + '!important;margin:2px 0 0!important;letter-spacing:0!important;text-transform:none!important;}' +
      '.lok-lt-acts{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px;}' +
      // responsive
      '@media(max-width:1149px){#lok-ab-hero h1{font-size:50px!important;}.lok-cv-card{margin-right:-80px;padding:36px;}}' +
      '@media(max-width:991px){.lok-ab .lok-wrap{padding:0 24px;}.lok-ab.lok-sec,.lok-ab-letter{padding-top:56px;padding-bottom:56px;}' +
        '.lok-ab .lok-h2{font-size:30px!important;}.lok-wh-grid{grid-template-columns:1fr;gap:16px;}.lok-two{grid-template-columns:1fr;gap:14px;}' +
        '.lok-un{grid-template-columns:1fr;gap:22px;}.lok-ab .lok-quote{font-size:30px!important;}.lok-ab-q{padding:64px 0 24px;}' +
        '.lok-letter{grid-template-columns:1fr;gap:28px;}.lok-ab .lok-lt-face{width:180px!important;height:180px!important;}.lok-open{margin-top:8px;}}' +
      '@media(max-width:767px){.lok-ab .lok-wrap{padding:0 16px;}' +
        '.lok-ab-cover{padding-top:16px;}#lok-ab-hero{grid-template-columns:1fr;}.lok-cv-ph{grid-column:1;grid-row:1;max-width:none;}' +
        '.lok-cv-card{grid-column:1;grid-row:2;margin:-64px 12px 0;padding:26px 22px 28px;}#lok-ab-hero h1{font-size:36px!important;margin-bottom:22px!important;}' +
        '.lok-cv-card .lok-btn{width:100%;}.lok-ab-under{padding:28px 0 44px;}.lok-ab .lok-lede{font-size:16.5px!important;}' +
        '.lok-ab .lok-quote{font-size:25px!important;}.lok-ab .lok-q-sub{font-size:15.5px!important;}' +
        '.lok-pr-grid{grid-template-columns:1fr;}.lok-pr,.lok-pr:nth-child(even){padding:24px 0;border-right:0;}.lok-pr-ic{width:44px;height:44px;margin-bottom:12px;}.lok-pr-ic svg{width:17px;height:17px;}' +
        '.lok-ab .lok-pr-t{font-size:19px!important;}.lok-ab .lok-pr-b{font-size:15px!important;}' +
        '.lok-ab .lok-copy{font-size:15.5px!important;line-height:1.65!important;}' +
        '.lok-who{padding:24px 22px;}.lok-ab .lok-who-h{font-size:23px!important;margin-top:16px!important;}.lok-ab .lok-who-p{font-size:15px!important;line-height:1.65!important;}' +
        '.lok-chk{grid-template-columns:1fr;gap:8px;}.lok-chk li{font-size:14px;}.lok-who-foot{padding-top:20px;}' +
        '.lok-fnd{flex-direction:column;align-items:flex-start;gap:12px;padding:20px;margin-top:14px;}' +
        '.lok-open{padding:20px;}.lok-ab #wl-trigger{width:100%;}' +
        '.lok-ab .lok-lt-h{font-size:30px!important;}.lok-ab .lok-lt-face{width:150px!important;height:150px!important;box-shadow:0 0 0 6px ' + C.pk + ';}' +
        '.lok-lt-body{margin-top:18px;gap:14px;}.lok-ab .lok-lt-p{font-size:15.5px!important;line-height:1.75!important;}.lok-ab .lok-sig img{width:150px!important;}' +
        '.lok-lt-acts .lok-btn{width:100%;}}';
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
  function hideChildren(sec) {
    var kids = sec.children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.add('lok-ab-old');
  }

  // ---- the cover -------------------------------------------------------------
  function pickCover(list) {
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function fillCover(fig, c) {
    fig.textContent = '';
    if (!c) { fig.style.display = 'none'; return; }
    fig.style.display = '';
    fig.setAttribute('data-vid', String(c.vid));
    var a = el('a');
    a.href = vendorHref(c.slug);
    a.setAttribute('aria-label', 'Visit ' + c.biz + "'s storefront");
    var img = el('img', 'lok-cv-img');
    img.alt = c.alt || '';
    img.decoding = 'async';
    img.setAttribute('fetchpriority', 'high');
    if (c.pos) img.style.objectPosition = c.pos;
    imgSet(img, c.img, 800);
    a.appendChild(img);
    var cap = el('figcaption', 'lok-cv-cap');
    cap.appendChild(el('b', null, 'On the cover'));
    cap.appendChild(el('span', null, c.cap));
    a.appendChild(cap);
    fig.appendChild(a);
  }

  function mountHero(sec) {
    var h1 = sec.querySelector('h1');
    if (!h1) return false;
    var lede = sec.querySelector('p.paragraph') || sec.querySelector('p');

    var cover = el('div', 'lok-ab lok-ab-cover');
    var grid = el('div', 'lok-wrap');
    grid.id = 'lok-ab-hero';
    var fig = el('figure', 'lok-cv-ph');
    fig.id = 'lok-ab-cover';
    grid.appendChild(fig);
    var card = el('div', 'lok-cv-card');
    card.appendChild(el('p', 'lok-eye', 'Our story'));
    // New headline, only while the Designer copy is the one we replaced.
    if (oneLine(h1.textContent) === NEW_H1) {
      h1.textContent = '';
      h1.appendChild(document.createTextNode('Good work deserves '));
      h1.appendChild(el('span', 'lok-hl', 'to be found.'));
    }
    card.appendChild(h1);
    card.appendChild(link('lok-btn', 'Meet your neighbors', '/the-market'));
    grid.appendChild(card);
    cover.appendChild(grid);
    sec.appendChild(cover);
    fillCover(fig, pickCover(COVERS));

    var under = el('div', 'lok-ab lok-ab-under');
    var un = el('div', 'lok-wrap lok-un');
    if (lede) {
      if (oneLine(lede.textContent) === OLD_LEDE) lede.textContent = NEW_LEDE;
      un.appendChild(take(lede, 'lok-lede'));
    }
    var side = el('div');
    var tags = el('ul', 'lok-tags');
    ['Woman-owned', 'Founder-led'].forEach(function (t) { tags.appendChild(el('li', null, t)); });
    side.appendChild(tags);
    side.appendChild(link('lok-ul', "Read Francesca's letter", '#lok-ab-letter'));
    un.appendChild(side);
    under.appendChild(un);
    sec.appendChild(under);
    return true;
  }

  // ---- the people your neighbors recommend: one big quote --------------------
  function buildQuote(lkab) {
    var top = lkab.querySelector('.lkab-h');
    var sec = el('section', 'lok-ab lok-ab-q');
    sec.id = 'lok-ab-know';
    var wrap = el('div', 'lok-wrap');
    if (top) wrap.appendChild(take(top, 'lok-eye'));
    var q = el('p', 'lok-quote');
    q.appendChild(document.createTextNode('Ask around any neighborhood and the same names come up. '));
    q.appendChild(el('span', null, 'Lokali is where those names live.'));
    wrap.appendChild(q);
    wrap.appendChild(el('p', 'lok-q-sub', "They rarely have a storefront, and they're almost never the first result online. Every storefront here belongs to a real person you can reach directly."));
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
      inner.appendChild(take(heading, 'lok-eye'));
    }
    var grid = el('div', 'lok-pr-grid');
    for (var i = 0; i < cards.length; i++) {
      var t = cards[i].querySelector('.text-block-66'), b = cards[i].querySelector('.text-block-65');
      var item = el('div', 'lok-pr');
      item.appendChild(svgSpan('lok-pr-ic', PR_ICONS[i % PR_ICONS.length]));
      var txt = el('div');
      if (t) txt.appendChild(take(t, 'lok-pr-t'));
      if (b) {
        var now = REWORD[oneLine(b.textContent)];
        if (now) b.textContent = now;
        txt.appendChild(take(b, 'lok-pr-b'));
      }
      item.appendChild(txt);
      grid.appendChild(item);
    }
    inner.appendChild(grid);
    wrap.appendChild(inner);
    hideChildren(sec);
    sec.appendChild(wrap);
  }

  // ---- built for two kinds of people ---------------------------------------
  function whoCard(src, kind) {
    var cust = kind === 'cust';
    var card = el('div', 'lok-who');
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
      foot.appendChild(link('lok-btn', 'Browse the Market', '/the-market'));
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
      trigger.className = 'lok-btn';
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
    var left = el('div');
    if (face) {
      face.removeAttribute('sizes');
      left.appendChild(take(face, 'lok-lt-face'));
    }
    letter.appendChild(left);
    var right = el('div');
    right.appendChild(el('p', 'lok-eye', 'A letter from the founder'));
    if (h) right.appendChild(take(h, 'lok-lt-h'));
    var body = el('div', 'lok-lt-body');
    for (var i = 0; i < ps.length; i++) {
      if (oneLine(ps[i].textContent) === LETTER_OLD) ps[i].textContent = LETTER_NEW;
      body.appendChild(take(ps[i], 'lok-lt-p'));
    }
    right.appendChild(body);
    if (sig) right.appendChild(take(sig, 'lok-sig'));
    if (role) right.appendChild(take(role, 'lok-role'));
    var acts = el('div', 'lok-lt-acts');
    acts.appendChild(link('lok-btn', 'Meet your neighbors', '/the-market'));
    acts.appendChild(link('lok-btn lok-ghost', 'Open my storefront', '/sign-up'));
    right.appendChild(acts);
    letter.appendChild(right);
    inner.appendChild(letter);
    wrap.appendChild(inner);
    hideChildren(sec);
    sec.appendChild(wrap);
  }

  // ---- live vendor check (non-blocking) -----------------------------------
  // If the cover's storefront is no longer published, pick again from the
  // ones that are. Any failure = page as built.
  function reconcile() {
    if (!window.LokaliSupabaseReady || !window.LokaliSupabaseReady.then) return;
    window.LokaliSupabaseReady.then(function (c) {
      return c.from('vendors').select('id').eq('is_publish_ready', true).limit(500);
    }).then(function (res) {
      if (!res || res.error || !Array.isArray(res.data) || !res.data.length) return;
      var live = {};
      res.data.forEach(function (v) { if (v && v.id != null) live[String(v.id)] = true; });
      var fig = document.getElementById('lok-ab-cover');
      if (!fig || live[fig.getAttribute('data-vid')]) return;
      fillCover(fig, pickCover(COVERS.filter(function (c) { return live[String(c.vid)]; })));
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
    document.documentElement.classList.add('lok-about2');
    mountHero(hero);
    var lkab = document.querySelector('section.lkab');
    if (lkab) buildQuote(lkab);
    var secs = document.querySelectorAll('section.section-13');
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i];
      if (s.classList.contains('lcustom-background')) buildWhere(s);
      else if (s.querySelector('.grid-8')) buildPrinciples(s);
      else if (s.querySelector('.vendors-grid')) buildTwo(s);
    }
    buildLetter(founder);
    reconcile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
