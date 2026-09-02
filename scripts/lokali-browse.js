/**
 * Lokali — The Market (public vendor browse page).
 *
 * Powers /the-market. The script RENDERS BOTH the vendor cards AND the filter
 * sidebar itself (builds the markup + injects the CSS), so it does not depend on
 * Webflow elements/code-components for either. It drives search, category,
 * neighborhood, the three toggles, sorting, active-filter chips, sidebar counts,
 * and the mobile drawer.
 *
 * #96 service-aware browse (subcategory model, Francesca 2026-07-20):
 * - SUBCATS_BY_CAT is the curated specialty taxonomy (the categories-guide
 *   "Examples" pills, 8 per category; mirrored in lokali-profile-page-embed.js
 *   where vendors pick ≤3). vendors.subcategories rides the normal vendor list.
 * - Sidebar: the active category expands IN PLACE — its subcategory pills
 *   unfold under it (multi-select, OR), other categories stay one click away.
 * - Cards: the vendor's subcategory pills render under the tagline; the pill
 *   that made a search hit is promoted to the front and highlighted.
 * - Search haystack = name/tagline/description/category + subcategory labels
 *   + ACTIVE listing names (invisible recall layer, via
 *   LokaliSupabaseAPI.data.listingIndex). If the Supabase surface is absent
 *   (stale cached client), the listing-name layer silently drops out.
 *
 * Load AFTER lokali-api-client.js. No auth required (public list endpoints).
 *
 * Required mount points in Webflow (plain light-DOM elements, NOT code components —
 * EXCEPT #browse-search, which on the live page renders inside a code-island's
 * OPEN shadow root; search binds via composed input events + a shadow-root scan):
 *   #browse-search          text input (light DOM or shadow-DOM code island)
 *   #browse-location        <select> (script fills options)
 *   #browse-result-count    <strong> ("N vendors found")
 *   #browse-grid-count      <strong> ("Showing N vendors")
 *   #browse-vendor-grid     EMPTY div — script fills with cards
 *   #browse-filter-panel    EMPTY div — script fills with category list + toggles + sort
 * Optional:
 *   #browse-empty-state     hidden empty state (sibling/child of the grid)
 *   #browse-active-filters  empty strip for chips
 *   #browse-mobile-sort     mobile <select> (values best_match/newest/a_z)
 *   #browse-mobile-filter-btn / #browse-filter-backdrop / #browse-sidebar / #browse-close-filters (drawer)
 *
 * Optional window overrides (set before this script):
 *   window.LOKALI_BROWSE_PROFILE_BASE  default '/' (root-level /{slug}; vendors without a slug fall back to /vendor?id={id})
 *   window.LOKALI_VERIFIED_FIELD       vendor field for Verified flag (default 'is_verified')
 *   window.LOKALI_SPOTLIGHT_FIELD      vendor field for Spotlight flag (default 'is_spotlight')
 *   window.LOKALI_BROWSE_PER_PAGE      default 100
 */
(function () {
  'use strict';

  // #57 QA — the page's code-island "List your business free →" anchor ships
  // with href="#" (dead). It lives in an OPEN shadow root, so resolve the real
  // target via composedPath, stash the vendor signup intent (same key
  // pricingcta.js uses; the clerk-sync role stamp reads it), and route to
  // /sign-up. Delegated so it works whenever the island hydrates.
  document.addEventListener('click', function (e) {
    var el = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!el || el.nodeType !== 1 || !el.closest) return;
    var a = el.closest('a[href="#"], a[href=""]');
    if (!a) return;
    var txt = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (txt.indexOf('list your business') !== 0) return;
    e.preventDefault();
    try { sessionStorage.setItem('lokali_signup_intent', 'vendor:' + Date.now()); } catch (err) {} // timestamped (#101 — intent expires)
    window.location.href = '/sign-up';
  }, true);

  var PROFILE_BASE = (typeof window.LOKALI_BROWSE_PROFILE_BASE === 'string' && window.LOKALI_BROWSE_PROFILE_BASE) || '/';
  var PER_PAGE = (typeof window.LOKALI_BROWSE_PER_PAGE === 'number' && window.LOKALI_BROWSE_PER_PAGE) || 100;
  var AREA_KEY = 'LOKALI_BROWSE_AREA';
  // Remembers the visitor's filters + sort for this browser session, so the "Back to The Market"
  // link on a vendor page returns them to the same filtered view.
  var STATE_KEY = 'LOKALI_BROWSE_STATE';
  var NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  // label = short sidebar label; bg/text = card pill colors (icon is masked to `text`).
  var CAT_BY_ID = {
    1: { slug: 'handcrafted', label: 'Handcrafted Goods', bg: '#FFF8E6', text: '#8A5A00' },
    2: { slug: 'business',    label: 'Business',          bg: '#F6EEF5', text: '#7A3B6D' },
    3: { slug: 'beauty',      label: 'Beauty',            bg: '#FEF3F2', text: '#C0392B' },
    4: { slug: 'children',    label: 'Children',          bg: '#E6F1FB', text: '#1A5C9A' },
    5: { slug: 'events',      label: 'Events & Entertainment',            bg: '#F3EBFF', text: '#6002EE' },
    6: { slug: 'food',        label: 'Food',              bg: '#FFF3EA', text: '#FF6B00' },
    7: { slug: 'wellness',    label: 'Wellness',          bg: '#EAFAF2', text: '#1D6A45' },
    8: { slug: 'home',        label: 'Home & Property',              bg: '#E7F4F2', text: '#1F6E66' },
    // #152 2026-08-22 — legal / tax / insurance / financial planning (patch_professional_services_category.sql)
    9: { slug: 'professional', label: 'Professional Services', bg: '#EEF3F8', text: '#2C5470' }
  };

  // #96 — curated subcategory taxonomy, keyed by category id. Source of truth
  // for labels = the categories-guide "Examples" pills (Francesca-approved
  // 2026-07-20). DB stores slugs; unknown/deactivated slugs are inert.
  // ⚠️ This is only the FALLBACK — the live `subcategory` table wins (fetched
  // below), which is why a taxonomy change is SQL-first, then ship this.
  // (Corrected 2026-08-13: an older note here claimed this list is mirrored in
  // lokali-profile-page-embed.js. It isn't — that file has no subcategory list
  // at all, and the listing forms read the live table directly.)
  var SUBCATS_BY_CAT = {
    1: [ // Handcrafted Goods (Artisans & Makers)
      { slug: 'handmade-jewelry',     label: 'Handmade jewelry' },
      { slug: 'candles-soap',         label: 'Candles & soap' },
      { slug: 'art-prints',           label: 'Art prints & paintings' },
      { slug: 'pottery-ceramics',     label: 'Pottery & ceramics' },
      { slug: 'woodworking',          label: 'Woodworking' },
      { slug: 'custom-embroidery',    label: 'Custom embroidery' },
      { slug: 'floral-arrangements',  label: 'Floral arrangements' },
      // 2026-08-19 (F): 'sewn-goods' retired — nobody searches the craft, they
      // search the product. 'clothing' takes its slot (patch_retire_dresses_fashion.sql).
      { slug: 'clothing',             label: 'Clothing' }
    ],
    2: [ // Business
      { slug: 'bookkeeping',          label: 'Bookkeeping & accounting' },
      { slug: 'marketing',            label: 'Marketing & social media' },
      { slug: 'graphic-design',       label: 'Graphic design' },
      { slug: 'virtual-assistance',   label: 'Virtual assistance' },
      { slug: 'web-design',           label: 'Web design & development' }, // #152: notary moved to 9
      { slug: 'consulting',           label: 'Consulting' },
      { slug: 'it-support',           label: 'IT & tech support' },
      { slug: 'copywriting',          label: 'Copywriting' }
    ],
    3: [ // Beauty
      { slug: 'hair-styling',         label: 'Hair styling & coloring' },
      { slug: 'lash-extensions',      label: 'Lash extensions' },
      { slug: 'nails',                label: 'Nails & manicures' },
      { slug: 'esthetics',            label: 'Esthetics & facials' },
      { slug: 'makeup',               label: 'Makeup artistry' },
      { slug: 'brow-shaping',         label: 'Brow shaping' },
      { slug: 'spray-tanning',        label: 'Spray tanning' },
      { slug: 'mobile-beauty',        label: 'Mobile beauty services' }
    ],
    4: [ // Children
      { slug: 'tutoring',             label: 'Tutoring' },
      { slug: 'music-lessons',        label: 'Music lessons' },
      { slug: 'after-school',         label: 'After-school programs' },
      { slug: 'childcare',            label: 'Childcare & nannying' },
      { slug: 'kids-art-classes',     label: 'Art classes for kids' },
      { slug: 'sports-coaching',      label: 'Sports coaching' },
      { slug: 'language-instruction', label: 'Language instruction' },
      { slug: 'learning-support',     label: 'Learning support' }
    ],
    5: [ // Events
      { slug: 'wedding-photography',  label: 'Wedding photography' },
      { slug: 'event-planning',       label: 'Event planning' },
      { slug: 'family-portraits',     label: 'Family portraits' },
      { slug: 'party-rentals',        label: 'Party rentals' },
      { slug: 'djs-entertainers',     label: 'DJs & entertainers' },
      { slug: 'photo-booths',         label: 'Photo booths' },
      { slug: 'videography',          label: 'Videography' },
      { slug: 'balloon-decor',        label: 'Balloon & décor styling' }
    ],
    6: [ // Food
      { slug: 'catering-meal-prep',   label: 'Catering & meal prep' },
      { slug: 'home-baker',           label: 'Home-based baker' },
      { slug: 'personal-chefs',       label: 'Personal chefs' },
      { slug: 'food-trucks',          label: 'Food trucks' },
      { slug: 'specialty-food',       label: 'Specialty & dietary food' },
      { slug: 'meal-delivery',        label: 'Meal delivery' },
      { slug: 'charcuterie',          label: 'Charcuterie & grazing boards' },
      { slug: 'cultural-cuisine',     label: 'Cultural cuisine' }
    ],
    7: [ // Wellness
      { slug: 'personal-training',    label: 'Personal training' },
      { slug: 'yoga-pilates',         label: 'Yoga & pilates' },
      { slug: 'massage-therapy',      label: 'Massage therapy' },
      { slug: 'nutrition-coaching',   label: 'Nutrition coaching' },
      { slug: 'life-coaching',        label: 'Life coaching' },
      { slug: 'reiki-energy',         label: 'Reiki & energy work' },
      { slug: 'acupuncture',          label: 'Acupuncture' },
      { slug: 'mental-wellness',      label: 'Mental wellness support' }
    ],
    8: [ // Home & Property (#118 — property roles lead, then the trades;
         // 'painting' + 'home-organization' retired to keep the 8-pill grid)
      { slug: 'real-estate-agents',   label: 'Real estate agents' },
      { slug: 'mortgage-lending',     label: 'Mortgage & lending' },
      { slug: 'cleaning',             label: 'Cleaning services' },
      { slug: 'landscaping',          label: 'Landscaping & lawn care' },
      { slug: 'handyman',             label: 'Handyman & repairs' },
      { slug: 'pool-maintenance',     label: 'Pool maintenance' },
      { slug: 'interior-decorating',  label: 'Interior decorating & staging' },
      { slug: 'pest-control',         label: 'Pest control' }
    ],
    9: [ // Professional Services (#152)
      { slug: 'family-law',           label: 'Family law' },
      { slug: 'estate-planning',      label: 'Estate planning & wills' },
      { slug: 'tax-preparation',      label: 'Tax preparation & CPAs' },
      { slug: 'financial-planning',   label: 'Financial planning' },
      { slug: 'insurance',            label: 'Insurance agents' },
      { slug: 'notary',               label: 'Notary services' },
      { slug: 'immigration-law',      label: 'Immigration law' },
      { slug: 'real-estate-law',      label: 'Real-estate attorneys' }
    ]
  };
  var SUBCAT_BY_SLUG = {}; // slug -> { label, catId }
  function rebuildSubcatIndex() {
    SUBCAT_BY_SLUG = {};
    for (var cid in SUBCATS_BY_CAT) if (SUBCATS_BY_CAT.hasOwnProperty(cid)) {
      (function (catId) {
        SUBCATS_BY_CAT[catId].forEach(function (s) { SUBCAT_BY_SLUG[s.slug] = { label: s.label, catId: parseInt(catId, 10) }; });
      })(cid);
    }
  }
  rebuildSubcatIndex();

  // #96-SUGGEST — the live taxonomy comes from the `subcategory` TABLE (so an
  // approved vendor suggestion is a pill everywhere on next load, no script
  // ship); the baked-in SUBCATS_BY_CAT above is the fallback when the fetch
  // fails or the Supabase surface is absent (stale cached client). Restored session
  // picks are re-sanitized once the live list lands — a DB-only slug (approved
  // after this script shipped) must survive the restore.
  var _taxonomyLoaded = false;
  function fetchSubcatTaxonomy(attempt) {
    attempt = attempt || 0;
    var sapi = window.LokaliSupabaseAPI;
    if (!sapi || !sapi.subcategories || typeof sapi.subcategories.list !== 'function') return;
    sapi.subcategories.list().then(function (out) {
      if (!out || out.error || !Array.isArray(out.data)) {
        if (attempt < 2) setTimeout(function () { fetchSubcatTaxonomy(attempt + 1); }, 1500 * (attempt + 1));
        return;
      }
      var byCat = {};
      out.data.forEach(function (r) {
        if (!r || r.category_id == null || !r.slug || !r.label) return;
        (byCat[r.category_id] = byCat[r.category_id] || []).push({ slug: r.slug, label: r.label });
      });
      if (!Object.keys(byCat).length) return; // empty/short read — keep the baked fallback
      SUBCATS_BY_CAT = byCat;
      rebuildSubcatIndex();
      _taxonomyLoaded = true;
      // Re-validate picks against the swapped list: restored picks re-sanitize
      // from the RAW list (a DB-only slug now validates); live user picks are
      // filtered so a slug the DB dropped can't linger as an invisible filter.
      if (_rawRestoredSubcats) {
        sanitizeRestoredSubcats();
      } else if (activeSubcats.length) {
        var catId = SLUG_TO_ID[activeCategory];
        activeSubcats = activeSubcats.filter(function (sl) {
          return SUBCAT_BY_SLUG[sl] && SUBCAT_BY_SLUG[sl].catId === catId;
        });
      }
      renderSubcatRow();
      if (_allVendors.length) applyFilters();
    }).catch(function () {
      if (attempt < 2) setTimeout(function () { fetchSubcatTaxonomy(attempt + 1); }, 1500 * (attempt + 1));
    });
  }

  var SLUG_TO_ID = {};
  (function () { for (var id in CAT_BY_ID) if (CAT_BY_ID.hasOwnProperty(id)) SLUG_TO_ID[CAT_BY_ID[id].slug] = parseInt(id, 10); })();
  SLUG_TO_ID.artisan = SLUG_TO_ID.handcrafted;
  SLUG_TO_ID.biz     = SLUG_TO_ID.business;
  SLUG_TO_ID.kids    = SLUG_TO_ID.children;
  SLUG_TO_ID.photo   = SLUG_TO_ID.events;

  // Sidebar lists. Icons are Webflow-hosted assets, recolored to match the design
  // via CSS mask (so PNG/SVG and any source color all render in the brand color).
  var ICON_VIOLET = '#6002EE';
  var ASSET = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/';
  var CATEGORY_LIST = [
    { slug: 'all',         label: 'All categories',    url: ASSET + '6a1af18050966f1b31aac321_star-regular.png' },
    { slug: 'beauty',      label: 'Beauty',            url: ASSET + '6a18f2524e31974a75003735_hair%20dryer.svg' },
    { slug: 'business',    label: 'Business',          url: ASSET + '6a18f6d4b01673d30ca9bcb8_briefcase.svg' },
    { slug: 'children',    label: 'Children',          url: ASSET + '6a18f6d4f1bbd4795f5345bc_backpack.svg' },
    { slug: 'events',      label: 'Events & Entertainment',            url: ASSET + '6a18f6d414c76bb968f180db_balloon.svg' },
    { slug: 'food',        label: 'Food',              url: ASSET + '6a186b067365d964abee8918_utensils-solid.png' },
    { slug: 'handcrafted', label: 'Handcrafted Goods', url: ASSET + '6a186b061a80eb9ba75f0d0a_scissors-solid.png' },
    { slug: 'home',        label: 'Home & Property',              url: ASSET + '6a186b06a37dcea6514f15f9_house-regular.png' },
    { slug: 'professional', label: 'Professional Services', url: ASSET + '6a89a66cb52c25150db94d06_user-tie-solid.svg' }, // #152 Font Awesome user-tie
    { slug: 'wellness',    label: 'Wellness',          url: ASSET + '6a186b06cfcb6c4d6d1e1cf7_heart-regular.png' }
  ];
  var TOGGLE_LIST = [
    { key: 'new',      id: 'browse-toggle-new',      label: 'New this week',         color: '#1D6A45', url: ASSET + '6a1af53c6b8fa6046c223ce9_bullhorn-solid.png' },
    { key: 'founding', id: 'browse-toggle-founding', label: 'Founding vendors only', color: '#C9A22A', url: ASSET + '69f4dbb3533f0ee2046ab0fb_crown-solid.png' },
    { key: 'verified', id: 'browse-toggle-verified', label: 'Verified only',         color: '#0000E4', glyph: '✓' }
  ];
  var SORT_LIST = [
    { sort: 'best_match', id: 'sort-match', label: 'Best match',   url: ASSET + '6a1d92f85db0d873ff20900a_sort-solid.png' },
    { sort: 'newest',     id: 'sort-new',  label: 'Newest first',  url: ASSET + '6a1d92f83a64390307583b8e_bolt-solid.png' },
    { sort: 'a_z',        id: 'sort-az',   label: 'A → Z',         url: ASSET + '6a1d92f86dcb45f8402fe0ea_arrow-down-a-z-solid.png' }
  ];

  // Card icons (Webflow assets).
  var ICON_PIN      = ASSET + '6a1d9d9c67a9d9957b19c578_map-pin-solid.png';
  // (Envelope/phone/WhatsApp/comments icon constants removed 2026-08-29 with the
  // card contact buttons — the storefront owns direct-contact UI now.)
  var ICON_CROWN    = ASSET + '69f4dbb3533f0ee2046ab0fb_crown-solid.png';     // founding badge (matches sidebar)
  var ICON_BULLHORN = ASSET + '6a1af53c6b8fa6046c223ce9_bullhorn-solid.png';  // new badge (matches sidebar)

  // category slug -> sidebar icon URL (reused on the card pill)
  var SLUG_TO_URL = {};
  CATEGORY_LIST.forEach(function (c) { SLUG_TO_URL[c.slug] = c.url; });

  /* Card + filter-panel CSS — injected once so the script's UI is fully styled. */
  var CSS = [
    // ── card ──
    // Card redesign 2026-08-29 (Francesca's Direction A): image-led cover (the
    // vendor's WORK, never the logo — the avatar carries identity), tagline in
    // the vendor's voice, need-first offerings line, one Visit-storefront CTA.
    // Contact buttons moved to the storefront; the card's job is earning the click.
    ".vcard{background:#fff;border:.5px solid #EEEDF6;border-radius:14px;padding:0;cursor:pointer;transition:all .15s;position:relative;overflow:hidden;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(96,2,238,.05);}",
    ".vcard:hover{border-color:#D4AAFD;box-shadow:0 4px 16px rgba(96,2,238,.10);transform:translateY(-1px);}",
    ".vcard-spotlight{border-color:rgba(96,2,238,.2);}",
    // Cover: real photo when the vendor has one (gallery -> service -> product,
    // resolved by the adapter), else the branded gradient + initials mark.
    // 116px -> 165px (F 2026-09-01: photos were too squat to read); mobile's
    // full-width single-column card gets 200px in the 767px block below.
    ".vcard-cover{height:165px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#E9E1FA 0%,#F9E7DC 55%,#FDF3EC 100%);}",
    ".vcard-cover-img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;transition:opacity .65s ease;}",
    ".vcard-cover-mark{font-size:32px;font-weight:800;color:rgba(96,2,238,.16);letter-spacing:2px;user-select:none;}",
    // Portfolio carousel (Pro/Featured, F 2026-09-01): crossfading cover layers
    // + quiet position dots. Dots sit under the pill/heart z-wise and stay tiny.
    ".vcard-cover-dots{position:absolute;bottom:7px;left:50%;transform:translateX(-50%);display:flex;gap:4px;z-index:2;pointer-events:none;}",
    ".vcard-cover-dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 0 3px rgba(0,0,0,.35);transition:background .3s;}",
    ".vcard-cover-dot.on{background:#fff;}",
    // Desktop/trackpad carousel arrows: hover-revealed, hidden entirely on
    // touch devices (their gesture is the swipe). tabindex=-1 keeps the many
    // per-card buttons out of keyboard tab order — the storefront link is the
    // keyboard path, same convention as the whole-card click.
    ".vcard-cover-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:26px;height:26px;border:none;border-radius:50%;background:rgba(26,24,41,.55);color:#fff;font:600 15px/1 'Plus Jakarta Sans',sans-serif;display:none;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .2s,background .15s;padding:0;}",
    ".vcard-cover-nav:hover{background:rgba(26,24,41,.8);}",
    ".vcard-cover-nav.prev{left:8px;}",
    ".vcard-cover-nav.next{right:8px;}",
    "@media (hover:hover) and (pointer:fine){.vcard-cover-nav{display:flex;}.vcard-cover:hover .vcard-cover-nav{opacity:1;}}",
    // Category pill rides the cover — solid category tint + icon so it reads over photos.
    ".vcard .cat-pill{position:absolute;top:10px;left:10px;z-index:2;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;border-radius:100px;padding:3.5px 11px;box-shadow:0 1px 4px rgba(0,0,0,.08);}",
    ".vcard-body{padding:14px 16px 15px;}",
    ".vcard-name-row{display:flex;align-items:center;gap:7px;margin-bottom:5px;flex-wrap:wrap;}",
    // Circle, not rounded square — the profile page promises vendors a round
    // logo, and the storefront renders it round (Francesca 2026-08-13).
    ".vcard-avatar{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;flex-shrink:0;border:1.5px solid #F0E9FB;overflow:hidden;}",
    ".vcard-avatar-initials{background:#F3EBFF;color:#6002EE;letter-spacing:.5px;}",
    ".vcard-avatar-img{width:100%;height:100%;object-fit:cover;display:block;}",
    // .vcard-name is a real <a> (keyboard/SR path into the profile) — kill link chrome.
    ".vcard-name{font-size:15.5px;font-weight:700;color:#1A1829;letter-spacing:-.3px;line-height:1.2;text-decoration:none;}",
    // Status chips sit inline after the name, labeled (an unlabeled 22px icon
    // circle was undecodable for first-time visitors). Same palette as the old badges.
    ".vcard .name-chip{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;border-radius:100px;padding:2px 7px;line-height:1.3;flex-shrink:0;}",
    ".vcard .chip-verified{background:#D2DEFF;color:#1730C9;}",
    ".vcard .chip-new{background:#C6F2DB;color:#11744A;}",
    ".vcard .chip-spotlight{background:#E2D2FF;color:#5A00E0;}",
    // #96 offerings — need-first: shoppers search for a service, not a business,
    // so this is the strongest text after the name. `.match` = the label that
    // made this card a search hit (promoted to front, violet).
    ".vcard-offerline{font-size:12.5px;font-weight:600;color:#33304A;line-height:1.45;margin-bottom:5px;}",
    ".vcard-offer-more{color:#6E6A85;font-weight:500;white-space:nowrap;}",
    ".vcard-offerline .match{color:#6002EE;}",
    ".vcard-tagline{font-size:12px;color:#6B6880;line-height:1.5;margin-bottom:12px;}",
    ".vcard-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;}",
    ".vcard-foot-meta{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:#6E6A85;min-width:0;flex-wrap:wrap;}",
    ".vcard-visit{font-size:12px;font-weight:700;color:#6002EE;text-decoration:none;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;}",
    // #96 sidebar subcategory pills — unfold under the ACTIVE category row
    // (expand-in-place accordion; other categories stay visible/clickable).
    "#browse-filter-panel .lk-subcat-row{display:flex;flex-wrap:wrap;gap:5px;padding:8px 4px 10px 14px;}",
    // text-align:left — <button> defaults to center, which reads as ragged/odd on the
    // labels long enough to wrap in the narrow sidebar ("Bookkeeping & accounting").
    "#browse-filter-panel .subcat-pill{font-family:inherit;-webkit-appearance:none;appearance:none;font-size:11.5px;font-weight:500;background:#fff;border:1px solid #E4E2F0;color:#6B6880;border-radius:100px;padding:4px 11px;cursor:pointer;user-select:none;transition:all .12s;line-height:1.3;text-align:left;}",
    "#browse-filter-panel .subcat-pill:hover{border-color:#6002EE;color:#6002EE;}",
    "#browse-filter-panel .subcat-pill.on{background:#6002EE;border-color:#6002EE;color:#fff;font-weight:600;}",
    // ── filter panel ──
    "#browse-filter-panel{font-family:'Plus Jakarta Sans',sans-serif;}",
    "#browse-filter-panel .lk-filter-section{margin-bottom:1.5rem;}",
    "#browse-filter-panel .lk-filter-section:last-child{margin-bottom:0;}",
    "#browse-filter-panel .lk-filter-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#6E6A85;margin-bottom:.6rem;}",
    // .filter-item / .lk-toggle are real <button>s (keyboard path) — reset UA button chrome.
    "#browse-filter-panel .filter-item{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;font-family:inherit;-webkit-appearance:none;appearance:none;text-align:left;padding:7px 10px;border-radius:8px;font-size:13px;line-height:1.45;color:#4A4761;cursor:pointer;transition:all .1s;margin-bottom:2px;user-select:none;}",
    "#browse-filter-panel .filter-item:hover{background:#F7F6FC;color:#1A1829;}",
    "#browse-filter-panel .filter-item.active{background:#F3EBFF;color:#6002EE;font-weight:600;}",
    "#browse-filter-panel .fi-left{display:flex;align-items:center;gap:8px;}",
    "#browse-filter-panel .lk-glyph-icon{font-size:13px;font-weight:700;width:16px;text-align:center;display:inline-block;flex-shrink:0;}",
    "#browse-filter-panel .filter-count-pill{font-size:10px;font-weight:600;background:#EEEDF6;color:#6E6A85;border-radius:100px;padding:1px 7px;min-width:22px;text-align:center;}",
    "#browse-filter-panel .filter-item.active .filter-count-pill{background:rgba(96,2,238,.12);color:#6002EE;}",
    "#browse-filter-panel .lk-divider{height:.5px;background:#EEEDF6;margin:1rem 0;}",
    "#browse-filter-panel .lk-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;font-family:inherit;-webkit-appearance:none;appearance:none;text-align:left;padding:6px 0;cursor:pointer;user-select:none;}",
    "#browse-filter-panel .lk-toggle-label{font-size:13px;line-height:1.45;color:#4A4761;display:flex;align-items:flex-start;gap:6px;}",
    "#browse-filter-panel .lk-tg-ic{font-size:12px;font-weight:700;}",
    "#browse-filter-panel .toggle-switch{width:32px;height:18px;border-radius:100px;background:#C8C6D8;position:relative;transition:background .18s;flex-shrink:0;}",
    "#browse-filter-panel .toggle-switch.on{background:#1D6A45;}",
    "#browse-filter-panel .toggle-switch::after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;top:2px;left:2px;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.18);}",
    "#browse-filter-panel .toggle-switch.on::after{left:16px;}",
    // #107(d) recruitment empty-state CTA (injected node — Webflow has no style
    // for it, so font is set explicitly per the Plus Jakarta Sans rule; brand
    // primary-700 violet; 44px min-height per the tap-target floor).
    ".browse-empty-cta{display:inline-flex;align-items:center;justify-content:center;margin-top:16px;padding:12px 22px;min-height:44px;box-sizing:border-box;background:#3d00e0;color:#fff;border-radius:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:600;text-decoration:none;transition:background .15s;}",
    ".browse-empty-cta:hover{background:#3100b3;color:#fff;}",
    // Active-filter chips (no Webflow styles exist for them) — pill matching the
    // sidebar's .filter-item.active; the × is a real button with a 32px hit area.
    ".active-filter-chip{display:inline-flex;align-items:center;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:500;background:#F3EBFF;color:#6002EE;border:1px solid #E4D6FF;border-radius:100px;padding:2px 2px 2px 12px;min-height:28px;box-sizing:border-box;margin:2px 6px 2px 0;}",
    ".active-filter-chip .remove-x{-webkit-appearance:none;appearance:none;background:none;border:none;font-family:inherit;font-size:15px;line-height:1;color:#6002EE;cursor:pointer;padding:0;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;}",
    ".active-filter-chip .remove-x:hover{background:rgba(96,2,238,.1);}",
    // Mobile Filter button 'filters active' cue (.has-filters set in JS).
    "#browse-mobile-filter-btn.has-filters{border-color:#6002EE;color:#6002EE;}",
    "#browse-mobile-filter-btn.has-filters::after{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF8D00;margin-left:6px;vertical-align:middle;}",
    // Elegant dropdowns (F 2026-09-02: native selects "look very basic"). The
    // CLOSED control is fully custom - OS chrome off, brand font, soft border,
    // violet chevron, real focus ring - while the OPEN menu stays native (the
    // OS picker is the best select interaction on touch, per Baymard). The
    // neighborhoods select keeps its soft-gray fill to match the search box;
    // the sort select is white like the cards it sits above.
    // Tag-qualified: #browse-mobile-sort is a DIV wrapper in the live markup (legacy name), a bare id match painted a chevron on the row container.
    "select#browse-sort,select#location-select,select#browse-location,select#browse-mobile-sort{-webkit-appearance:none;appearance:none;",
    "border:1px solid #E4E2F0;border-radius:12px;min-height:46px;padding:0 40px 0 14px;",
    "font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15px;font-weight:600;color:#343A40;",
    "background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 6l5 5 5-5' fill='none' stroke='%236002EE' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");",
    "background-repeat:no-repeat;background-position:right 14px center;background-size:13px;cursor:pointer;",
    "transition:border-color .15s ease,box-shadow .15s ease;}",
    "select#browse-sort,select#browse-mobile-sort{background-color:#fff;}",
    "select#location-select,select#browse-location{background-color:#F7F6FC;}",
    "select#browse-sort:hover,select#location-select:hover,select#browse-location:hover,select#browse-mobile-sort:hover{border-color:#C9BFEA;}",
    "select#browse-sort:focus,select#location-select:focus,select#browse-location:focus,select#browse-mobile-sort:focus{outline:none;border-color:#6002EE;box-shadow:0 0 0 3px rgba(96,2,238,.12);}",
    "select#browse-sort::-ms-expand,select#location-select::-ms-expand{display:none;}",
    // Mobile category chips (F 2026-09-02): the sidebar hides behind the Filter
    // button on small screens, so the primary facet gets its own always-visible
    // scrollable row (exposed filters get measurably more use than hidden ones).
    // Count sits in its OWN badge with a real gap - never tight against the
    // label. 44px tap height per the #98 mobile floor; the strip only exists
    // <=991px where the sidebar is a drawer.
    "#lk-cat-chips{display:none;}",
    "@media screen and (max-width:991px){",
    "#lk-cat-chips{display:flex;gap:8px;overflow-x:auto;padding:12px 2px 2px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}",
    "#lk-cat-chips::-webkit-scrollbar{display:none;}",
    ".lk-cat-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;",
    "border-radius:100px;border:1px solid #E4E2F0;background:#fff;color:#4A4761;",
    "font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;}",
    ".lk-cat-chip-n{font-size:11px;font-weight:700;background:#EEEDF6;color:#6E6A85;border-radius:100px;padding:2px 8px;line-height:1.4;}",
    ".lk-cat-chip.active{background:#6002EE;border-color:#6002EE;color:#fff;}",
    ".lk-cat-chip.active .lk-cat-chip-n{background:rgba(255,255,255,.22);color:#fff;}",
    "}",
    // Injected loading state (#browse-loading — no such mount exists in the Webflow page).
    "#browse-loading{display:none;text-align:center;padding:36px 0;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;color:#6B6880;}",
    ".lk-browse-spin{display:inline-block;vertical-align:-4px;margin-right:10px;width:18px;height:18px;border:2.5px solid #E4E2F0;border-top-color:#6002EE;border-radius:50%;animation:lkbrspin .8s linear infinite;}",
    "@keyframes lkbrspin{to{transform:rotate(360deg)}}",
    // Mobile: vendor cards were stuck at 2 columns (Webflow grid is `1fr 1fr` with no
    // responsive override) — too cramped on phones. Drop to a single column at ≤767px.
    "@media screen and (max-width:767px){#browse-vendor-grid{grid-template-columns:1fr;} .vcard-cover{height:200px;}}",
    // Mobile (≤991px): the filter sidebar had no drawer CSS, so it sat inline and clipped
    // the vendor cards. Collapse the [sidebar | content] layout to one column and turn the
    // sidebar into an off-canvas slide-in drawer (the Filter button toggles `.open` via JS).
    // v1.4.354: minmax(0,1fr), NOT 1fr — a bare 1fr track's minimum is the
    // children's min-content, so the cards' intrinsic ~369px beat the ~306px
    // grid box on phones and every card hung out past the right edge (same
    // trap as the v1.4.352 dashboard fix). min-width:0 on the children lets
    // their content shrink with the track.
    "@media screen and (max-width:991px){" +
      ".grid-template-columns{grid-template-columns:minmax(0,1fr)!important;}" +
      ".grid-template-columns>*{min-width:0;}" +
      "#browse-sidebar{display:block!important;position:fixed!important;top:0;left:0;height:100vh;width:86vw;max-width:340px;z-index:200;transform:translateX(-100%);transition:transform .25s ease;overflow-y:auto;-webkit-overflow-scrolling:touch;border-radius:0;margin:0;box-shadow:2px 0 16px rgba(0,0,0,.12);}" +
      "#browse-sidebar.open{transform:translateX(0);}" +
      "#browse-filter-backdrop.open{display:block;}" +
    "}"
  ].join('');

  // ── state ──
  var _allVendors = [];
  var _locationsById = {};
  var _locSlugToId = {}; // CAT-LINK: location slug ('the-woodlands-tx') -> id string
  var _categoriesById = {};
  var _grid = null;
  var _emptyState = null;
  var _renderedCards = [];
  var _listingsByVendor = {}; // #96: vendor id -> active listing names (services first)
  var _coversByVendor = {};   // card redesign: vendor id -> {url, fx, fy} (adapter vendors.covers)

  var activeLocationId = 'all';
  var activeCategory = 'all';
  var activeSubcats = []; // #96: selected subcategory slugs (OR filter; cleared on category change)
  var _rawRestoredSubcats = null; // #96: raw restored picks, re-sanitized when the live taxonomy lands

  function sanitizeRestoredSubcats() {
    if (!_rawRestoredSubcats) return;
    activeSubcats = [];
    var catId = SLUG_TO_ID[activeCategory];
    _rawRestoredSubcats.forEach(function (sl) {
      if (typeof sl === 'string' && SUBCAT_BY_SLUG[sl] && SUBCAT_BY_SLUG[sl].catId === catId &&
          activeSubcats.indexOf(sl) === -1) activeSubcats.push(sl);
    });
  }
  var activeSort = 'best_match';
  var showNewOnly = false;
  var showFoundingOnly = false;
  var showVerifiedOnly = false;
  var searchTerm = '';

  // ── helpers ──
  function el(id) { return document.getElementById(id); }
  function ce(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function setText(node, txt) { if (node) node.textContent = txt; }
  function showEl(node, disp) { if (node) { node.style.display = disp || ''; node.classList.remove('w-condition-invisible'); } }
  function hideEl(node) { if (node) node.style.display = 'none'; }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  function extractList(d) {
    if (!d) return [];
    if (Array.isArray(d)) return d;
    var keys = ['items', 'records', 'data', 'vendors', 'result', 'results'], i;
    for (i = 0; i < keys.length; i++) if (Array.isArray(d[keys[i]])) return d[keys[i]];
    if (d.data && typeof d.data === 'object') for (i = 0; i < keys.length; i++) if (Array.isArray(d.data[keys[i]])) return d.data[keys[i]];
    return [];
  }

  // ── vendor accessors ──
  function vName(v)    { return v.business_name || v.businessName || 'Vendor'; }
  function vTagline(v) { return v.business_tagline || v.tagline || v.business_description || ''; }
  function vDescription(v) { return v.business_description || ''; }
  function vListingNames(v) { return (v.id != null && _listingsByVendor[v.id]) || []; }
  function vSubcats(v) { return Array.isArray(v.subcategories) ? v.subcategories : []; }
  function vSubcatLabels(v) {
    var out = [];
    vSubcats(v).forEach(function (s) { if (SUBCAT_BY_SLUG[s]) out.push(SUBCAT_BY_SLUG[s].label); });
    return out;
  }
  // "Newest" = newest ARRIVAL in the Market, not newest account (F 2026-09-02:
  // Paperloom/Rowdy signed up in July but went live 09-01 and must sort first).
  // published_at = first-went-live stamp (patch_published_at.sql); created_at
  // stays the fallback so an unshipped/old column can't zero the sort.
  function vCreated(v) { var c = (v.published_at != null ? v.published_at : v.created_at); if (c == null) return 0; return typeof c === 'number' ? c : (Date.parse(c) || 0); }
  function vIsNew(v)       { var t = vCreated(v); return t > 0 && (Date.now() - t) < NEW_WINDOW_MS; }
  function vIsFounding(v)  { return v.is_founding_member === true; }
  function vIsVerified(v)  { var f = window.LOKALI_VERIFIED_FIELD; if (f && v[f] != null) return v[f] === true; return v.is_verified === true; }
  function vIsSpotlight(v) { var f = window.LOKALI_SPOTLIGHT_FIELD; if (f && v[f] != null) return v[f] === true; return v.is_spotlight === true; }
  // Featured = the paid TIER (server-synced is_featured), distinct from the
  // time-boxed Spotlight rotation above. (#73)
  function vIsFeatured(v)  { return v.is_featured === true; }
  // Paid-tier band (server-synced plan_rank: Free 0 / Pro 1 / Featured 2).
  function vTier(v)        { return typeof v.plan_rank === 'number' ? v.plan_rank : 0; }
  function vCategoryIds(v) { return Array.isArray(v.categories_id) ? v.categories_id : (v.categories_id != null ? [v.categories_id] : []); }
  function vLocationIds(v) { return Array.isArray(v.locations_id) ? v.locations_id : (v.locations_id != null ? [v.locations_id] : []); }
  // The Webflow page uses #location-select and #browse-sort; older markup used #browse-location
  // and #browse-mobile-sort. Resolve whichever exists (the sort must be the <select>, not the wrapper).
  function locSelectEl() { return el('browse-location') || el('location-select'); }
  function sortSelectEl() {
    var e = el('browse-sort'); if (e && e.tagName === 'SELECT') return e;
    var m = el('browse-mobile-sort'); if (m && m.tagName === 'SELECT') return m;
    return e || null;
  }
  function vCategoryStyle(v) {
    var ids = vCategoryIds(v);
    for (var i = 0; i < ids.length; i++) {
      if (CAT_BY_ID[ids[i]]) {
        var b = CAT_BY_ID[ids[i]];
        return { known: true, slug: b.slug, url: SLUG_TO_URL[b.slug], label: b.label, bg: b.bg, text: b.text };
      }
    }
    return { known: false, slug: '', url: null, label: '', bg: '', text: '' };
  }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0].charAt(0) + p[1].charAt(0)).toUpperCase();
  }
  function safeImgUrl(p) {
    if (!p || typeof p !== 'string') return '';
    p = p.trim();
    // Block javascript:/data: schemes, protocol-relative //host, breakout chars.
    if (!p || /[\s"'<>`\\]/.test(p) || /^(?:javascript|data|vbscript):/i.test(p)) return '';
    if (/^https?:\/\//.test(p)) return p; // full URL (Supabase Storage / Webflow CDN) — the only live shape
    // A non-absolute value is a legacy Xano-era /vault path (or //host). Xano is
    // retired (XANO-DECOMM 2026-07-24) so it can no longer resolve — return no
    // image rather than a broken-host URL. Live rows store full URLs (handled above).
    return '';
  }
  function vPhotoUrl(v) { return safeImgUrl(v.profile_photo); }
  function vAreaLabel(v) {
    var ids = Array.isArray(v.locations_id) ? v.locations_id : (v.locations_id != null ? [v.locations_id] : []);
    for (var i = 0; i < ids.length; i++) if (_locationsById[ids[i]]) return _locationsById[ids[i]].label;
    return '';
  }
  // Slug-style base ('.../'): link to the clean root URL /{slug} (served by the
  // Cloudflare Worker). A vendor without a slug can't be resolved at the root, so
  // fall back to the legacy /vendor?id={id} link rather than emitting a dead /{id}.
  function vProfileHref(v) {
    var slugStyle = PROFILE_BASE.charAt(PROFILE_BASE.length - 1) === '/';
    if (slugStyle) return v.slug ? (PROFILE_BASE + v.slug) : ('/vendor?id=' + v.id);
    return PROFILE_BASE + v.id;
  }

  // ── reference data ──
  function loadRefData() {
    return Promise.all([window.LokaliAPI.data.categories(), window.LokaliAPI.data.locations()]).then(function (res) {
      extractList(res[0] && res[0].data).forEach(function (c) {
        var id = c.id != null ? c.id : c.category_id;
        if (id != null) _categoriesById[id] = { id: id, name: c.name || c.category_name || '' };
      });
      extractList(res[1] && res[1].data).forEach(function (l) {
        var id = l.id != null ? l.id : l.location_id;
        if (id == null) return;
        var name = l.name || l.location_name || l.title || ('Location ' + id);
        var state = l.state || l.state_code || '';
        _locationsById[id] = { id: id, name: name, label: state ? (name + ', ' + state) : name };
        // CAT-LINK — index several spellings so ?area= is forgiving of shared/
        // typed links and of the Webflow-CMS-vs-Supabase slug drift (the homepage
        // neighborhood cards are a CMS collection whose slugs differ, e.g.
        // 'the-woodlands' vs the Supabase 'the-woodlands-tx'). We register:
        //   the exact slug ('the-woodlands-tx'),
        //   the slug minus a trailing 2-letter state suffix ('the-woodlands'),
        //   the name normalized to a slug ('The Woodlands' -> 'the-woodlands').
        // First writer wins is fine — every alias points at the same id.
        var addAlias = function (raw) {
          var k = String(raw == null ? '' : raw).trim().toLowerCase();
          if (k && !_locSlugToId[k]) _locSlugToId[k] = String(id);
        };
        var lslug = String(l.slug || l.location_slug || '').trim().toLowerCase();
        if (lslug) {
          addAlias(lslug);
          addAlias(lslug.replace(/-[a-z]{2}$/, '')); // drop trailing state suffix
        }
        addAlias(String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
      });
    });
  }

  function populateLocationSelect() {
    var sel = locSelectEl();
    if (!sel) return;
    if (!Object.keys(_locationsById).length) return; // keep existing options if locations didn't load
    sel.innerHTML = '';
    var all = ce('option'); all.value = 'all'; all.textContent = 'All neighborhoods'; sel.appendChild(all);
    Object.keys(_locationsById).forEach(function (id) {
      var o = ce('option'); o.value = String(id); o.textContent = _locationsById[id].name; sel.appendChild(o);
    });
  }

  function resolveInitialLocation() {
    var byUrl = null, byStore = null;
    try { byUrl = new URLSearchParams(window.location.search).get('location_id'); } catch (e) {}
    try { byStore = localStorage.getItem(AREA_KEY); } catch (e) {}
    var candidate = byUrl || byStore || 'all';
    if (candidate !== 'all' && !_locationsById[candidate]) candidate = 'all';
    activeLocationId = candidate;
  }

  // CAT-LINK — one-shot deep link into a filtered Market from an external entry
  // point (homepage neighborhood cards, the category strip, a shared URL):
  //   /the-market?area=<location-slug>[&category=<category-slug>]
  // (?location_id=<id> is still honored for back-compat.)
  //
  // It OVERRIDES both restored session state and the #44 saved-area default — an
  // explicit link must win, or a returning visitor's stale session would swallow
  // the click that brought them here. Runs after loadRefData (needs the location
  // slug map) and before fetchVendors, so the first paint is already filtered.
  //
  // The consumed params are then STRIPPED from the address bar. That is the fix
  // for the precedence trap: once the page is interactive, persisted session
  // state is the single source of truth, so a later in-page filter change +
  // reload must not silently re-apply a now-stale URL. The link stays valid as a
  // bookmark (a fresh navigation re-reads it); it just doesn't linger mid-session.
  function applyDeepLink() {
    var out = { location: false, category: false, search: false };
    var qs;
    try { qs = new URLSearchParams(window.location.search); } catch (e) { return out; }

    // Neighborhood: ?area=<slug> preferred; legacy ?location_id=<id> still works.
    var areaSlug = qs.get('area');
    var locId = null;
    if (areaSlug) {
      locId = _locSlugToId[String(areaSlug).trim().toLowerCase()] || null;
    } else {
      var raw = qs.get('location_id');
      if (raw != null && _locationsById[raw]) locId = String(raw);
    }
    if (locId) {
      activeLocationId = locId;
      // NOTE: deliberately NOT written to localStorage AREA_KEY. The deep link
      // scopes to THIS session (persistState below → sessionStorage, restored on
      // in-session navigation), but must not permanently overwrite the visitor's
      // saved neighborhood or suppress their #44 account-region default — a
      // shared/marketing link someone texts you shouldn't silently hijack your
      // home area forever. An explicit dropdown pick (setLocation) still persists.
      // Within this load the area is safe regardless: applyRegionDefault is gated
      // on !deep.location, and its own `activeLocationId!=='all'` guard blocks it.
      out.location = true;
    }

    // Category: ?category=<slug> (aliases like artisan/biz/kids/photo accepted).
    var catSlug = qs.get('category');
    if (catSlug) {
      catSlug = String(catSlug).trim().toLowerCase();
      if (SLUG_TO_ID[catSlug]) {
        var canon = CAT_BY_ID[SLUG_TO_ID[catSlug]].slug; // canonicalize aliases
        // Same rule as setCategory: subcat picks belong to one category, so a
        // category change must drop any restored picks (a foreign subcat slug
        // would filter the grid to zero).
        if (canon !== activeCategory) { activeSubcats = []; _rawRestoredSubcats = null; }
        activeCategory = canon;
        out.category = true;
      }
    }

    // Search: ?q=<term> — the mobile menu's search bar (lokali-mobile-nav.js)
    // navigates here with it; any external link works too. Same precedence as
    // area/category: the explicit link wins over a restored session term, and
    // syncFilterUI → syncSearchBox reflects it into the (shadow-DOM) input.
    var qTerm = qs.get('q');
    if (qTerm != null && qTerm.trim()) {
      searchTerm = qTerm.trim();
      out.search = true;
    }

    if (out.location || out.category || out.search) {
      persistState(); // the deep-linked view becomes the remembered view
      try {
        qs.delete('area'); qs.delete('location_id'); qs.delete('category'); qs.delete('q');
        var rest = qs.toString();
        var url = window.location.pathname + (rest ? '?' + rest : '') + window.location.hash;
        window.history.replaceState(null, '', url);
      } catch (e) {}
    }
    return out;
  }

  // #44 — soft-default the neighborhood to the signed-in user's saved
  // "Your area" (account.region) when they've never chosen one explicitly.
  // Eligibility is checked directly (dropdown at 'all' + no ?location_id= +
  // no stored explicit pick) rather than via the restore path — restored
  // session state always carries l:'all' for a user who never touched the
  // filter, and must not suppress the default. Runs async after ref data so
  // it never blocks the grid, applies only if the dropdown is still untouched
  // when the lookup lands, and is NOT persisted — any explicit pick
  // (including "All neighborhoods", which setLocation now stores) wins.
  function applyRegionDefault(attempt) {
    attempt = attempt || 0;
    if (activeLocationId !== 'all') return;
    var byUrl = null, byStore = null;
    try { byUrl = new URLSearchParams(window.location.search).get('location_id'); } catch (e) {}
    try { byStore = localStorage.getItem(AREA_KEY); } catch (e) {}
    if (byUrl != null || byStore != null) return; // explicit choice exists somewhere
    // Signed-in detection: Supabase-era pages carry no legacy token — mirror
    // auth-nav and treat a parseable LOKALI_ACCT_CACHE as the signal (the
    // old token key is checked only for ancient still-cached sessions).
    var signedIn = false;
    try { signedIn = !!JSON.parse(localStorage.getItem('LOKALI_ACCT_CACHE') || 'null'); } catch (e) {}
    if (!signedIn) { try { signedIn = !!localStorage.getItem('LOKALI_AUTH_TOKEN'); } catch (e) {} }
    if (!signedIn) return; // signed out — no account to read
    if (!(window.LokaliAPI.account && window.LokaliAPI.account.get)) return;
    window.LokaliAPI.account.get().then(function (res) {
      // The page-load burst regularly trips the free-tier rate limit — retry a
      // couple of times instead of silently dropping the default.
      if (!res || res.error || !res.data) {
        if (attempt < 2) setTimeout(function () { applyRegionDefault(attempt + 1); }, 4000 * (attempt + 1));
        return;
      }
      var region = String(res.data.region || '').trim().toLowerCase();
      if (!region) return;
      if (activeLocationId !== 'all') return; // user picked one meanwhile
      var ids = Object.keys(_locationsById);
      for (var i = 0; i < ids.length; i++) {
        var nm = String(_locationsById[ids[i]].name || '').trim().toLowerCase();
        if (nm && (nm === region || region.indexOf(nm) !== -1 || nm.indexOf(region) !== -1)) {
          activeLocationId = String(ids[i]);
          var sel = locSelectEl(); if (sel) sel.value = activeLocationId;
          applyFilters(); // client-side narrow — no re-fetch
          return;
        }
      }
    }).catch(function () {});
  }

  // ── fetch ──
  // The vendor list is the page's core payload. LokaliAPI never rejects: a transient
  // network/connection failure (common when a freshly-navigated page fires the fetch
  // before the backend connection is warm — e.g. clicking "Back to The Market") resolves
  // with { data:null, error, status:0 }, which would silently render a blank grid
  // showing "0" until the visitor refreshed. So retry a FAILED call a few times before
  // giving up, and only fall through to an empty grid when the request truly succeeds.
  var FETCH_MAX_ATTEMPTS = 5;
  function fetchVendors(attempt) {
    attempt = attempt || 0;
    var loading = el('browse-loading');
    showEl(loading, 'block');
    // Location is filtered client-side (historical: the legacy ?location_id= filter returned nothing), so
    // always load the full active set and let applyFilters() narrow by neighborhood.
    var params = { page: 1, per_page: PER_PAGE };
    // Retry both resolved-errors AND network rejections with backoff: the first fetch
    // after a navigation can transiently fail, and the old code only retried resolved-errors (a thrown
    // fetch fell straight through to a silent "0 vendors" that survived a manual refresh).
    function retryOrGiveUp() {
      if (attempt < FETCH_MAX_ATTEMPTS) {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(fetchVendors(attempt + 1)); }, 300 * (attempt + 1));
        });
      }
      hideEl(loading);
      // Fetch FAILED — this is not a recruitment surface; keep the stock copy.
      if (_renderedCards.length === 0) showEmpty(false);
    }
    return window.LokaliAPI.vendors.list(params).then(function (out) {
      if (out && out.error) return retryOrGiveUp();
      hideEl(loading);
      // is_active guard is deliberately tolerant: rows without the column (the
      // adapter's VENDOR_LIST_COLS may not select it yet) count as active —
      // only an explicit false is excluded. #74 three-place gotcha applies.
      _allVendors = extractList(out && out.data).filter(function (v) { return v && v.is_active !== false; });
      // #96 — if the payload has no subcategories key (stale cached adapter /
      // stale cached client), drop any restored picks (INCLUDING the raw restore
      // list — a late taxonomy fetch must not resurrect them) and remove the
      // pill row so the filter can't silently blank the grid.
      if (!subcatDataPresent()) { activeSubcats = []; _rawRestoredSubcats = null; }
      renderSubcatRow();
      updateCategoryCounts();
      applyFilters();
      fetchCovers();
    }, function (err) {
      console.warn('[lokali-browse] vendors fetch rejected (attempt ' + attempt + '):', err);
      return retryOrGiveUp();
    });
  }

  // Card covers (redesign 2026-08-29): one batched adapter call resolving each
  // vendor's cover image (first gallery photo -> first service photo -> first
  // product photo; never the logo). Non-critical by design: a stale cached
  // adapter (no vendors.covers yet) or a failed fetch leaves every card on the
  // branded gradient fallback. First paint renders immediately with fallbacks;
  // the grid re-renders once covers land.
  function fetchCovers() {
    try {
      var api = window.LokaliAPI && window.LokaliAPI.vendors;
      if (!api || typeof api.covers !== 'function') return;
      var ids = _allVendors.map(function (v) { return v.id; }).filter(function (x) { return x != null; });
      if (!ids.length) return;
      api.covers(ids).then(function (out) {
        var map = out && out.data && out.data.covers;
        if (out && out.error || !map || typeof map !== 'object') return;
        if (!Object.keys(map).length) return; // nothing to show — skip the re-render
        _coversByVendor = map;
        if (_allVendors.length) applyFilters();
      }).catch(function () {});
    } catch (e) {}
  }

  // ── portfolio carousel (F 2026-09-01, Pro/Featured only) ─────────────────
  // Slow crossfade through the vendor's cover candidates (adapter covers().list,
  // pin first, capped at 6). One timer per rotating card, self-cleaning: the
  // tick clears itself once the card leaves the DOM (every applyFilters()
  // rebuild). Advance preloads the next photo and fades only after it loads,
  // so the gradient never flashes through; a broken URL is skipped on the next
  // tick. Paused while hovered, while the card is offscreen (IntersectionObserver)
  // and while the tab is hidden — battery over spectacle. Periods carry a
  // per-card random offset so a grid of cards never flips in lockstep.
  var COVER_ROLL_MS = 3800;
  function startCoverRoll(cover, firstImg, photos) {
    var idx = 0, hover = false, visible = true, busy = false, cur = firstImg;
    var dots = ce('div', 'vcard-cover-dots');
    var dotEls = photos.map(function (_, i) {
      var d = ce('span', 'vcard-cover-dot' + (i === 0 ? ' on' : ''));
      dots.appendChild(d);
      return d;
    });
    cover.appendChild(dots);
    cover.addEventListener('mouseenter', function () { hover = true; });
    cover.addEventListener('mouseleave', function () { hover = false; });
    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) {
        visible = !!(es[0] && es[0].isIntersecting);
      }, { threshold: 0.15 });
      io.observe(cover);
    }
    function go(dir) {
      if (busy) return;
      busy = true;
      var next = (idx + dir + photos.length) % photos.length;
      var p = photos[next];
      var img = ce('img', 'vcard-cover-img');
      img.alt = '';
      img.style.opacity = '0';
      if (typeof p.fx === 'number' && typeof p.fy === 'number') img.style.objectPosition = p.fx + '% ' + p.fy + '%';
      img.addEventListener('load', function () {
        if (!cover.isConnected) { busy = false; return; }
        if (cur && cur.parentNode === cover) cur.insertAdjacentElement('afterend', img);
        else cover.appendChild(img);
        requestAnimationFrame(function () { img.style.opacity = '1'; });
        var old = cur;
        cur = img;
        idx = next;
        for (var i = 0; i < dotEls.length; i++) dotEls[i].className = 'vcard-cover-dot' + (i === idx ? ' on' : '');
        setTimeout(function () {
          if (old && old.parentNode) old.parentNode.removeChild(old);
          busy = false;
        }, 700);
      });
      img.addEventListener('error', function () { idx = next; busy = false; }); // skip a dead URL, move on next tick
      img.src = safeImgUrl(p.url);
    }
    // Touch swipe (F 2026-09-01: "people are going to want to do that
    // naturally"). Passive listeners with the decision at touchend, so
    // vertical page scrolling is never blocked: only a clearly horizontal
    // move (>34px, dominating dy) flips a photo. A swipe swallows the one
    // click that follows it — the whole card is a storefront link, and a
    // flip must not navigate. Manual control also parks the auto-rotation
    // for a few seconds so it doesn't fight the thumb.
    var holdUntil = 0, tx = null, ty = null, swiped = false;
    cover.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      tx = e.touches[0].clientX; ty = e.touches[0].clientY;
    }, { passive: true });
    cover.addEventListener('touchend', function (e) {
      if (tx == null) return;
      var t0 = e.changedTouches && e.changedTouches[0];
      var dx = t0 ? t0.clientX - tx : 0, dy = t0 ? t0.clientY - ty : 0;
      tx = ty = null;
      if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        swiped = true;
        holdUntil = Date.now() + 6500;
        go(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
    cover.addEventListener('click', function (ev) {
      if (swiped) { swiped = false; ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    // Desktop/trackpad: hover-revealed prev/next arrows (CSS keeps them off
    // touch devices, where the swipe above is the gesture). stopPropagation
    // so an arrow click never opens the storefront.
    function navBtn(cls, glyph, dir, label) {
      var b = ce('button', 'vcard-cover-nav ' + cls);
      b.type = 'button';
      b.tabIndex = -1;
      b.setAttribute('aria-label', label);
      b.textContent = glyph;
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        holdUntil = Date.now() + 6500;
        go(dir);
      });
      cover.appendChild(b);
    }
    navBtn('prev', '‹', -1, 'Previous photo');
    navBtn('next', '›', 1, 'Next photo');
    var t = setInterval(function () {
      if (!cover.isConnected) { clearInterval(t); if (io) io.disconnect(); return; }
      if (hover || !visible || document.hidden || Date.now() < holdUntil) return;
      go(1);
    }, COVER_ROLL_MS + Math.floor(Math.random() * 1400));
  }

  // #96 — load the public listing-name index (active service/product names for
  // every vendor, one paginated query pair). This is the INVISIBLE recall
  // layer of search — nothing renders from it; it just lets "charcuterie
  // board" find the vendor whose product is named that even when no
  // subcategory says so. Non-critical by design: if the Supabase surface is
  // absent (stale cached client) or the fetch fails, search degrades to
  // name/tagline/description/subcategories. Re-applies filters when it lands
  // so a search typed before the index arrived picks up listing matches.
  function fetchListingIndex() {
    var sapi = window.LokaliSupabaseAPI;
    if (!sapi || !sapi.data || typeof sapi.data.listingIndex !== 'function') return;
    sapi.data.listingIndex().then(function (out) {
      if (!out || out.error || !Array.isArray(out.data)) return;
      var map = {};
      out.data.forEach(function (r) {
        var name = r && typeof r.name === 'string' ? r.name.trim() : '';
        if (!name || r.vendors_id == null) return;
        (map[r.vendors_id] = map[r.vendors_id] || []).push(name);
      });
      _listingsByVendor = map;
      if (_allVendors.length) applyFilters();
    }).catch(function () {});
  }

  // Self-contained masked icon: recolors any silhouette PNG/SVG to `color`. Works anywhere.
  function maskIcon(url, color, size) {
    var s = ce('span');
    s.style.display = 'inline-block';
    s.style.flexShrink = '0';
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.backgroundColor = color;
    var m = 'url("' + url + '") center / contain no-repeat';
    s.style.webkitMask = m;
    s.style.mask = m;
    return s;
  }
  function glyphIcon(glyph, color) {
    var s = ce('span', 'lk-glyph-icon'); s.textContent = glyph; s.style.color = color; return s;
  }

  // ── render the filter sidebar (category list + toggles + sort) ──
  function renderFilterPanel() {
    var mount = el('browse-filter-panel');
    if (!mount) { console.warn('[lokali-browse] #browse-filter-panel not found — filters disabled. Add an empty div with that ID.'); return; }
    mount.innerHTML = '';

    // Category
    var cs = ce('div', 'lk-filter-section');
    var cl = ce('div', 'lk-filter-label'); cl.textContent = 'Category'; cs.appendChild(cl);
    CATEGORY_LIST.forEach(function (c) {
      var item = ce('button', 'filter-item' + (c.slug === activeCategory ? ' active' : ''));
      item.type = 'button';
      item.setAttribute('data-category-slug', c.slug);
      var left = ce('div', 'fi-left');
      left.appendChild(maskIcon(c.url, ICON_VIOLET, 18));
      left.appendChild(document.createTextNode(c.label));
      var pill = ce('span', 'filter-count-pill'); pill.textContent = '0';
      item.appendChild(left); item.appendChild(pill);
      item.addEventListener('click', function () { setCategory(c.slug); });
      cs.appendChild(item);
    });
    mount.appendChild(cs);
    renderSubcatRow(); // #96 — unfold pills under the (restored) active category
    mount.appendChild(ce('div', 'lk-divider'));

    // Filter by (toggles)
    var fs = ce('div', 'lk-filter-section');
    var fl = ce('div', 'lk-filter-label'); fl.textContent = 'Filter by'; fs.appendChild(fl);
    TOGGLE_LIST.forEach(function (t) {
      var row = ce('button', 'lk-toggle');
      row.type = 'button';
      row.setAttribute('role', 'switch');
      var on0 = t.key === 'new' ? showNewOnly : (t.key === 'founding' ? showFoundingOnly : showVerifiedOnly);
      row.setAttribute('aria-checked', on0 ? 'true' : 'false');
      var label = ce('span', 'lk-toggle-label');
      label.appendChild(t.url ? maskIcon(t.url, t.color, 16) : glyphIcon(t.glyph, t.color));
      label.appendChild(document.createTextNode(t.label));
      var sw = ce('span', 'toggle-switch'); sw.id = t.id;
      row.appendChild(label); row.appendChild(sw);
      row.addEventListener('click', function () {
        var cur = t.key === 'new' ? showNewOnly : (t.key === 'founding' ? showFoundingOnly : showVerifiedOnly);
        setToggle(t.key, !cur);
      });
      fs.appendChild(row);
    });
    mount.appendChild(fs);
    mount.appendChild(ce('div', 'lk-divider'));

    // Sort
    var ss = ce('div', 'lk-filter-section');
    var sl = ce('div', 'lk-filter-label'); sl.textContent = 'Sort'; ss.appendChild(sl);
    SORT_LIST.forEach(function (s) {
      var item = ce('button', 'filter-item' + (s.sort === activeSort ? ' active' : ''));
      item.type = 'button';
      item.id = s.id;
      var left = ce('div', 'fi-left');
      left.appendChild(maskIcon(s.url, ICON_VIOLET, 16));
      left.appendChild(document.createTextNode(s.label));
      item.appendChild(left);
      item.addEventListener('click', function () { setSort(s.sort); });
      ss.appendChild(item);
    });
    mount.appendChild(ss);
  }

  // #96 — feature-detect: does the loaded vendor payload actually CARRY the
  // subcategories column? A stale cached adapter (old VENDOR_LIST_COLS, up to
  // 7 days of @v1.4 browser cache) delivers rows WITHOUT
  // the key — rendering selectable pills then would filter every vendor out
  // ("0 vendors found" with no explanation). Key-present-but-null still counts
  // as supported (vendors who just haven't picked yet).
  function subcatDataPresent() {
    for (var i = 0; i < _allVendors.length; i++) {
      var v = _allVendors[i];
      if (v && typeof v === 'object' && ('subcategories' in v)) return true;
    }
    return false;
  }

  // #96 — the expand-in-place accordion: one pill row lives directly under the
  // ACTIVE category's sidebar item (all categories stay visible + one-click
  // switchable). Rebuilt on category change; pill on/off toggles in place.
  // Suppressed (and any stale row removed) once vendors have loaded without
  // the subcategories key — see subcatDataPresent.
  function renderSubcatRow() {
    var old = document.querySelector('#browse-filter-panel .lk-subcat-row');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (_allVendors.length && !subcatDataPresent()) return;
    var catId = SLUG_TO_ID[activeCategory];
    var subs = catId != null && SUBCATS_BY_CAT[catId];
    if (!subs || !subs.length) return;
    // Alphabetical, and only specialties an actual vendor in this category
    // carries (Francesca 2026-07-20) — a pill with zero matches is a dead-end
    // filter. A currently-selected pill stays visible so it can be un-toggled.
    if (_allVendors.length) {
      var have = {};
      _allVendors.forEach(function (v) {
        if (!v || !Array.isArray(v.subcategories)) return;
        var cids = Array.isArray(v.categories_id) ? v.categories_id : [v.categories_id];
        if (cids.indexOf(catId) === -1) return;
        v.subcategories.forEach(function (sl) { have[sl] = true; });
      });
      subs = subs.filter(function (s) { return have[s.slug] || activeSubcats.indexOf(s.slug) !== -1; });
    }
    subs = subs.slice().sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); });
    if (!subs.length) return;
    var item = document.querySelector('#browse-filter-panel .filter-item[data-category-slug="' + activeCategory + '"]');
    if (!item) return;
    var row = ce('div', 'lk-subcat-row');
    subs.forEach(function (s) {
      var pill = ce('button', 'subcat-pill' + (activeSubcats.indexOf(s.slug) !== -1 ? ' on' : ''));
      pill.type = 'button';
      pill.textContent = s.label;
      pill.setAttribute('data-subcat-slug', s.slug);
      pill.setAttribute('aria-pressed', activeSubcats.indexOf(s.slug) !== -1 ? 'true' : 'false');
      pill.addEventListener('click', function () { toggleSubcat(s.slug); });
      row.appendChild(pill);
    });
    item.parentNode.insertBefore(row, item.nextSibling);
  }

  function toggleSubcat(slug) {
    _rawRestoredSubcats = null; // user is driving now — no late-restore overwrite
    var i = activeSubcats.indexOf(slug);
    if (i === -1) activeSubcats.push(slug); else activeSubcats.splice(i, 1);
    var pill = document.querySelector('#browse-filter-panel .subcat-pill[data-subcat-slug="' + slug + '"]');
    if (pill) {
      var on = activeSubcats.indexOf(slug) !== -1;
      pill.classList.toggle('on', on);
      pill.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    applyFilters();
  }

  function updateCategoryCounts() {
    var items = document.querySelectorAll('#browse-filter-panel .filter-item[data-category-slug]');
    for (var i = 0; i < items.length; i++) {
      var slug = items[i].getAttribute('data-category-slug');
      var pill = items[i].querySelector('.filter-count-pill');
      if (!pill) continue;
      var count;
      if (slug === 'all') count = _allVendors.length;
      else { var catId = SLUG_TO_ID[slug]; count = _allVendors.filter(function (v) { return vCategoryIds(v).indexOf(catId) !== -1; }).length; }
      pill.textContent = String(count);
      // Empty categories HIDE instead of advertising a dead-end "0" (F
      // 2026-09-02; same emptiness concern that made #118 a rename). The row
      // returns by itself when the category's first vendor goes live. The
      // active category stays visible even at 0 so a deep link / stale filter
      // can still be seen and cleared rather than pointing at a vanished row.
      items[i].style.display = (count === 0 && slug !== 'all' && slug !== activeCategory) ? 'none' : '';
    }
  }

  // ── #151 search matching ──
  // Tokenized: "business insurance" → ['business','insurance'], every token must
  // hit the haystack somewhere (any order, any field). Stop-words and stray
  // punctuation are dropped only when something meaningful remains, so
  // "bakery near me" searches for "bakery", not for "near" and "me".
  var SEARCH_STOP = { 'a':1, 'an':1, 'and':1, 'the':1, 'for':1, 'of':1, 'in':1, 'to':1, 'with':1, 'or':1, 'near':1, 'me':1, 'my':1, 'local':1, '&':1, '-':1, '+':1 };
  function searchTokens(q) {
    if (!q) return [];
    var raw = q.split(/\s+/).filter(Boolean);
    var kept = raw.filter(function (t) { return !SEARCH_STOP[t]; });
    return kept.length ? kept : raw;
  }
  // Light stem: "baking"/"bakers"/"bakeries" → "bak"/"baker" so a product word
  // finds the craft word and vice versa. Stems shorter than 3 chars are ignored
  // (too noisy). indexOf gives prefix tolerance for free ("insur" → "insurance").
  function stemToken(t) {
    var st = t.replace(/(ing|ies|ers|er|es|s)$/, '');
    return st.length >= 3 ? st : t;
  }
  function hayHasToken(hay, t) {
    if (hay.indexOf(t) !== -1) return true;
    var st = stemToken(t);
    return st !== t && hay.indexOf(st) !== -1;
  }
  // 0 = no match; 1 = every token matched; 2 = the whole phrase matched
  // verbatim (ranks first under the default sort).
  function searchScore(hay, q, toks) {
    // Phrase = the query as typed, or the kept tokens re-joined ("insurance
    // near me" → "insurance") so stop-words don't demote an exact hit.
    if (hay.indexOf(q) !== -1 || hay.indexOf(toks.join(' ')) !== -1) return 2;
    for (var i = 0; i < toks.length; i++) { if (!hayHasToken(hay, toks[i])) return 0; }
    return 1;
  }
  var _searchScores = {};

  // ── filter + sort + render cards ──
  function applyFilters() {
    var q = searchTerm.toLowerCase().trim();
    var toks = searchTokens(q);
    _searchScores = {};
    var catId = activeCategory === 'all' ? null : SLUG_TO_ID[activeCategory];
    var locId = activeLocationId === 'all' ? null : String(activeLocationId);
    var visible = _allVendors.filter(function (v) {
      if (catId != null && vCategoryIds(v).indexOf(catId) === -1) return false;
      // #96 subcategory pills: OR within the selection — any overlap keeps the vendor.
      if (activeSubcats.length) {
        var subs = vSubcats(v), hit = false;
        for (var si = 0; si < activeSubcats.length; si++) {
          if (subs.indexOf(activeSubcats[si]) !== -1) { hit = true; break; }
        }
        if (!hit) return false;
      }
      if (locId != null && vLocationIds(v).map(String).indexOf(locId) === -1) return false;
      if (showNewOnly && !vIsNew(v)) return false;
      if (showFoundingOnly && !vIsFounding(v)) return false;
      if (showVerifiedOnly && !vIsVerified(v)) return false;
      if (q) {
        // #96: search covers what vendors OFFER — subcategory labels, active
        // listing names, and the full description — not just
        // name/tagline/category label. Fields join on '\n' (a trimmed query
        // can never contain one) so a phrase can't falsely match across the
        // boundary of two adjacent fields/names.
        var hay = [vName(v), vTagline(v), vDescription(v), vCategoryStyle(v).label]
          .concat(vSubcatLabels(v)).concat(vListingNames(v)).join('\n').toLowerCase();
        // #151: people search by PRODUCT ("business insurance"), and the old
        // whole-phrase indexOf only matched those two words ADJACENT and in
        // order. Now every token must appear somewhere (any order, any field,
        // light stem/prefix tolerance); the exact phrase still ranks first.
        var sc = searchScore(hay, q, toks);
        if (!sc) return false;
        _searchScores[String(v.id)] = sc;
      }
      return true;
    });
    sortVendors(visible);
    renderGrid(visible);
    updateCounts(visible.length);
    updateActiveFilters();
    updateMobileIndicator();
    persistState();
  }

  // ── filter/sort memory (sessionStorage) ──
  function persistState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        c: activeCategory, l: activeLocationId, s: activeSort,
        // Persist the RAW restored list while it's still authoritative — else
        // an interim baked-only sanitize would permanently drop a DB-only pick.
        sc: _rawRestoredSubcats || activeSubcats,
        n: showNewOnly, f: showFoundingOnly, v: showVerifiedOnly, q: searchTerm
      }));
    } catch (e) {}
  }
  function restoreState() {
    var s;
    try { s = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s) return false;
    if (s.c) activeCategory = s.c;
    if (s.l) activeLocationId = s.l;
    if (s.s) activeSort = s.s;
    showNewOnly = !!s.n; showFoundingOnly = !!s.f; showVerifiedOnly = !!s.v;
    searchTerm = s.q || '';
    // #96 — restore subcategory picks, sanitized to real slugs OF the restored
    // category (a stale/foreign slug would silently filter everything out).
    // The raw list is kept so the sanitize can re-run when the LIVE taxonomy
    // arrives (fetchSubcatTaxonomy) — dropped on any user interaction.
    _rawRestoredSubcats = Array.isArray(s.sc) ? s.sc : null;
    sanitizeRestoredSubcats();
    return true;
  }
  // The toggle row (the switch span's parent) carries role=switch + aria-checked.
  function syncSwitchAria(sw, on) {
    var row = sw.parentNode;
    if (row && row.getAttribute && row.getAttribute('role') === 'switch') row.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  // The live page renders #browse-search inside a code-island's OPEN shadow
  // root — getElementById can't see it, but shadowRoot scans can. Light-DOM
  // markup (older pages) resolves first.
  function findSearchInput() {
    var direct = el('browse-search');
    if (direct) return direct;
    var islands = document.querySelectorAll('code-island');
    for (var i = 0; i < islands.length; i++) {
      var root = islands[i].shadowRoot;
      if (!root) continue;
      var inp = root.getElementById ? root.getElementById('browse-search') : root.querySelector('#browse-search');
      if (inp) return inp;
    }
    return null;
  }
  // Islands hydrate late — retry briefly so a session-restored search term
  // lands in the input once it exists.
  function syncSearchBox(attempt) {
    var search = findSearchInput();
    if (search) { if (search.value !== searchTerm) search.value = searchTerm; return; }
    if (searchTerm && attempt < 5) setTimeout(function () { syncSearchBox(attempt + 1); }, 1000);
  }
  // Webflow-owned div controls: add button semantics + Enter/Space activation.
  function wireButton(node, fn) {
    if (!node) return;
    node.addEventListener('click', fn);
    if (node.tagName === 'BUTTON' || (node.tagName === 'A' && node.hasAttribute('href'))) return; // already keyboard-native
    if (!node.getAttribute('role')) node.setAttribute('role', 'button');
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '0');
    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); fn(); }
    });
  }

  // Reflect the (restored) state into controls that renderFilterPanel doesn't pre-set.
  function syncFilterUI() {
    if (activeLocationId !== 'all' && !_locationsById[activeLocationId]) activeLocationId = 'all';
    TOGGLE_LIST.forEach(function (t) {
      var on = t.key === 'new' ? showNewOnly : (t.key === 'founding' ? showFoundingOnly : showVerifiedOnly);
      var sw = el(t.id); if (sw) { sw.classList.toggle('on', on); syncSwitchAria(sw, on); }
    });
    syncSearchBox(0); // shadow-DOM aware; retries while the island hydrates
    var sel = locSelectEl(); if (sel) sel.value = String(activeLocationId);
    var msel = sortSelectEl(); if (msel) msel.value = activeSort;
    // Reflect the active category into the panel. renderFilterPanel() sets this
    // at build time, but a CAT-LINK deep link changes activeCategory afterward,
    // so re-toggle the items and rebuild the subcat row to match.
    var citems = document.querySelectorAll('#browse-filter-panel .filter-item[data-category-slug]');
    for (var ci = 0; ci < citems.length; ci++) {
      citems[ci].classList.toggle('active', citems[ci].getAttribute('data-category-slug') === activeCategory);
    }
    if (citems.length) renderSubcatRow();
  }

  function sortVendors(list) {
    if (activeSort === 'a_z') list.sort(function (a, b) { return vName(a).localeCompare(vName(b)); });
    else if (activeSort === 'newest') list.sort(function (a, b) { return vCreated(b) - vCreated(a); });
    // #151: under the default sort an exact-phrase hit outranks an all-tokens
    // hit; tier rank still orders everything within each band. A-Z / Newest
    // are the visitor's explicit choice and stay literal.
    else list.sort(function (a, b) { return sscore(b) - sscore(a) || rank(b) - rank(a) || (vCreated(b) - vCreated(a)); });
  }
  function sscore(v) { return _searchScores[String(v.id)] || 0; }
  // Paid tier is the dominant band — Featured > Pro > Free outright (×8 clears
  // the max 4+2+1=7 of the signals below, which break ties within a band).
  function rank(v) { return vTier(v) * 8 + (vIsSpotlight(v) ? 4 : 0) + (vIsFounding(v) ? 2 : 0) + (vIsVerified(v) ? 1 : 0); }

  function renderGrid(list) {
    if (!_grid) return;
    _renderedCards.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
    _renderedCards = [];
    list.forEach(function (v) {
      var card = buildCard(v);
      if (_emptyState && _emptyState.parentNode === _grid) _grid.insertBefore(card, _emptyState);
      else _grid.appendChild(card);
      _renderedCards.push(card);
    });
    if (list.length === 0) showEmpty(structuralEmpty());
    else if (_emptyState) hideEl(_emptyState);
  }

  // #107(d): pre-launch, most categories genuinely have no vendors yet — and the
  // stock empty state ("No vendors found — try adjusting your filters") reads as
  // FAILURE copy one click from the homepage CTA. When the emptiness is
  // STRUCTURAL (plain browsing: no search term, no toggle filters), reframe it
  // as a founding-vendor recruitment surface instead. A search/toggle miss — and
  // any fetch failure — keeps the original Webflow copy, where "adjust your
  // filters" is genuinely the right advice. Deliberately NO launch date in the
  // copy (Francesca 2026-07-27: seeding may not land by Oct 1).
  // The newsletter code-island is a SIBLING of #browse-empty-state, never inside
  // it, so these targeted text swaps can't touch the live Brevo capture.
  var _emptyOrig = null; // original Webflow title/sub, captured before first rewrite
  function structuralEmpty() {
    return !searchTerm && !showNewOnly && !showFoundingOnly && !showVerifiedOnly;
  }
  function categoryLabel() {
    if (activeCategory === 'all') return '';
    for (var i = 0; i < CATEGORY_LIST.length; i++) {
      if (CATEGORY_LIST[i].slug === activeCategory) return CATEGORY_LIST[i].label;
    }
    return '';
  }
  function showEmpty(recruit) {
    if (!_emptyState) return;
    var title = _emptyState.querySelector('.browse-empty-title');
    var sub = _emptyState.querySelector('.browse-empty-sub');
    var cta = _emptyState.querySelector('.browse-empty-cta');
    if (title && sub && !_emptyOrig) _emptyOrig = { title: title.textContent, sub: sub.textContent };
    if (recruit && title && sub) {
      var cat = categoryLabel();
      title.textContent = cat
        ? cat + ' in your neighborhood is still unclaimed'
        : 'This corner of the market is still unclaimed';
      sub.textContent = 'Founding vendors are claiming their spots now. Be the ' +
        (cat ? 'first ' + cat + ' vendor' : 'one your neighbors find first') +
        (cat ? ' your neighbors find here.' : '.');
      if (!cta) {
        cta = ce('a', 'browse-empty-cta');
        cta.href = '/sign-up';
        cta.textContent = 'Become a founding vendor →';
        // Same timestamped intent stash as the island CTA above (#101 — expires).
        cta.addEventListener('click', function () {
          try { sessionStorage.setItem('lokali_signup_intent', 'vendor:' + Date.now()); } catch (err) {}
        });
        _emptyState.appendChild(cta);
      }
    } else {
      if (_emptyOrig && title && sub) { title.textContent = _emptyOrig.title; sub.textContent = _emptyOrig.sub; }
      if (cta && cta.parentNode) cta.parentNode.removeChild(cta);
    }
    showEl(_emptyState, 'block');
  }

  // Labeled inline status chip (name row). Replaced the old icon-only 22px
  // badge circles 2026-08-29 — unlabeled crown/check were undecodable for
  // first-time visitors, so trust signals went unread.
  function nameChip(cls, label, iconUrl, iconColor, title) {
    var c = ce('span', 'name-chip ' + cls); c.title = title || label;
    if (iconUrl) c.appendChild(maskIcon(iconUrl, iconColor, 10));
    c.appendChild(document.createTextNode(iconUrl ? ' ' + label : label));
    return c;
  }
  // NOTE 2026-08-29: the card's Email/Call/Text/WhatsApp buttons (and their
  // trackContact lead events) moved to the storefront with the redesign — the
  // card's one job is earning the storefront click. The storefront's own
  // trackChannel() keeps logging lead events / review-gate credit as before.

  function buildAvatar(v) {
    var avatar = ce('div', 'vcard-avatar');
    var photo = vPhotoUrl(v);
    var fillInitials = function () {
      avatar.className = 'vcard-avatar vcard-avatar-initials';
      avatar.textContent = initials(vName(v));
    };
    if (photo) {
      // #97: alt DELIBERATELY empty — the business name is the card's visible
      // title right next to this avatar, so a non-empty alt would make screen
      // readers announce every vendor twice. Decorative-adjacent-text rule.
      var img = ce('img', 'vcard-avatar-img'); img.src = photo; img.alt = '';
      img.addEventListener('error', function () { if (img.parentNode) avatar.removeChild(img); fillInitials(); });
      avatar.appendChild(img);
    } else {
      fillInitials();
    }
    return avatar;
  }

  function buildCard(v) {
    var style = vCategoryStyle(v);
    var href = vProfileHref(v);
    var card = ce('div', 'vcard' + (vIsSpotlight(v) ? ' vcard-spotlight' : ''));
    // Expose the vendor id so lokali-favorites.js can attach a save/heart control
    // without coupling favorites logic into this renderer (its absolute top-right
    // heart lands on the cover).
    if (v.id != null) card.dataset.vendorId = v.id;

    // ── cover: the vendor's WORK (adapter-resolved gallery/service/product
    // photo), never the logo — the avatar next to the name carries identity.
    // No cover yet (or stale cached adapter) = branded gradient + initials mark,
    // so no card ever looks broken.
    var cover = ce('div', 'vcard-cover');
    var cov = v.id != null ? _coversByVendor[v.id] : null;
    var covUrl = cov ? safeImgUrl(cov.url) : '';
    var mark = ce('span', 'vcard-cover-mark'); mark.textContent = initials(vName(v));
    cover.appendChild(mark);
    if (covUrl) {
      // alt deliberately empty (#97 rule): decorative-adjacent to the visible name.
      var cimg = ce('img', 'vcard-cover-img'); cimg.src = covUrl; cimg.alt = ''; cimg.loading = 'lazy';
      // #149b: gallery covers reuse the vendor's drag-set focal point.
      if (typeof cov.fx === 'number' && typeof cov.fy === 'number') cimg.style.objectPosition = cov.fx + '% ' + cov.fy + '%';
      // Broken image -> the gradient + mark underneath simply shows through.
      cimg.addEventListener('error', function () { if (cimg.parentNode) cover.removeChild(cimg); });
      cover.appendChild(cimg);
      // ── portfolio carousel (F 2026-09-01): Pro/Featured cards slow-rotate
      // through the vendor's cover candidates so the market gives a feel for
      // the whole portfolio. Free stays a single cover; reduced-motion users
      // get the static first photo.
      if (vTier(v) >= 1 && cov.list && cov.list.length > 1 &&
          !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        startCoverRoll(cover, cimg, cov.list);
      }
    }
    if (style.known) {
      var pill = ce('span', 'cat-pill');
      pill.style.background = style.bg;
      pill.style.color = style.text;
      if (style.url) pill.appendChild(maskIcon(style.url, style.text, 12));
      pill.appendChild(document.createTextNode(' ' + style.label));
      cover.appendChild(pill);
    }
    card.appendChild(cover);

    var body = ce('div', 'vcard-body');

    // ── name row: small avatar (identity), name link, labeled status chips.
    var nameRow = ce('div', 'vcard-name-row');
    nameRow.appendChild(buildAvatar(v));
    // Real link = the keyboard/screen-reader path into the profile (the
    // whole-card click below is a pointer convenience on top of it).
    var name = ce('a', 'vcard-name'); name.textContent = vName(v); name.href = href;
    name.addEventListener('click', function (ev) { ev.stopPropagation(); }); // native link wins (incl. cmd-click)
    nameRow.appendChild(name);
    // #86 (2026-07-18): ★ Featured badge REMOVED by decision — it mostly
    // signaled "pays more". Placement ranking (#75 plan_rank) is untouched.
    // Founding moved to the quiet foot line; Verified/New/Spotlight stay here.
    if (vIsVerified(v))  nameRow.appendChild(nameChip('chip-verified', '✓ Verified', null, null, 'Verified'));
    if (vIsNew(v))       nameRow.appendChild(nameChip('chip-new', 'New', ICON_BULLHORN, '#11744A', 'New this week'));
    if (vIsSpotlight(v)) nameRow.appendChild(nameChip('chip-spotlight', '✦ Spotlight', null, null, 'Spotlight'));
    body.appendChild(nameRow);

    // ── #96 offerings line — need-first: shoppers search for a service, not a
    // business, so this is the strongest text after the name. When the current
    // search matched a subcategory label, promote it to the front and highlight
    // it so the visitor sees WHY the card is in the results.
    var subLabels = vSubcatLabels(v);
    if (subLabels.length) {
      var q = searchTerm.toLowerCase().trim();
      var matchIdx = -1;
      if (q) {
        // #151: phrase hit preferred, else any token hit (same tolerance as the filter).
        var qt = searchTokens(q);
        for (var ni = 0; ni < subLabels.length && matchIdx === -1; ni++) {
          if (subLabels[ni].toLowerCase().indexOf(q) !== -1) matchIdx = ni;
        }
        for (ni = 0; ni < subLabels.length && matchIdx === -1; ni++) {
          var lab = subLabels[ni].toLowerCase();
          for (var ti = 0; ti < qt.length; ti++) { if (hayHasToken(lab, qt[ti])) { matchIdx = ni; break; } }
        }
      }
      var ordered = subLabels.slice();
      if (matchIdx > 0) { ordered.splice(matchIdx, 1); ordered.unshift(subLabels[matchIdx]); }
      var offerLine = ce('div', 'vcard-offerline');
      ordered.slice(0, 3).forEach(function (nm, i) {
        if (i > 0) offerLine.appendChild(document.createTextNode(' · '));
        var piece = ce('span', matchIdx !== -1 && i === 0 ? 'match' : '');
        piece.textContent = nm;
        offerLine.appendChild(piece);
      });
      // A vendor with more tags than fit was silently truncated (misleading for
      // multi-line shops like Paperloom, F 2026-09-01) — say how much more there is.
      if (ordered.length > 3) {
        offerLine.appendChild(document.createTextNode(' '));
        var more = ce('span', 'vcard-offer-more');
        more.textContent = '+' + (ordered.length - 3) + ' more';
        offerLine.appendChild(more);
      }
      body.appendChild(offerLine);
    }

    var tag = ce('div', 'vcard-tagline'); tag.textContent = vTagline(v); body.appendChild(tag);

    // ── foot: quiet metadata left (founding + town), single CTA right.
    // Contact buttons moved to the storefront with the redesign — see nameChip's
    // sibling note above.
    var foot = ce('div', 'vcard-foot');
    var footMeta = ce('span', 'vcard-foot-meta');
    if (vIsFounding(v)) {
      footMeta.appendChild(maskIcon(ICON_CROWN, '#C99A1F', 11));
      footMeta.appendChild(document.createTextNode(' Founding'));
    }
    // Town only ("The Woodlands", not "The Woodlands, Texas") — every open city
    // is Texas today, and the shorter label keeps the foot line quiet.
    var town = vAreaLabel(v).split(',')[0].trim();
    if (town) {
      if (footMeta.childNodes.length) footMeta.appendChild(document.createTextNode(' · '));
      footMeta.appendChild(maskIcon(ICON_PIN, '#6E6A85', 10));
      footMeta.appendChild(document.createTextNode(' ' + town));
    }
    foot.appendChild(footMeta);
    var visit = ce('a', 'vcard-visit'); visit.href = href;
    visit.textContent = 'Visit storefront →';
    visit.addEventListener('click', function (ev) { ev.stopPropagation(); }); // native link wins
    foot.appendChild(visit);
    body.appendChild(foot);
    card.appendChild(body);

    card.addEventListener('click', function () { window.location.href = href; });
    return card;
  }

  function updateCounts(n) { setText(el('browse-result-count'), String(n)); setText(el('browse-grid-count'), String(n)); }

  // ── active filter chips ──
  function updateActiveFilters() {
    var strip = el('browse-active-filters');
    if (!strip) return;
    strip.innerHTML = '';
    if (activeLocationId !== 'all' && _locationsById[activeLocationId]) addChip(strip, _locationsById[activeLocationId].name, function () { setLocation('all'); });
    if (activeCategory !== 'all') { var c = CAT_BY_ID[SLUG_TO_ID[activeCategory]]; addChip(strip, c ? c.label : activeCategory, function () { setCategory('all'); }); }
    activeSubcats.forEach(function (sl) { // #96
      var sc = SUBCAT_BY_SLUG[sl];
      addChip(strip, sc ? sc.label : sl, function () { toggleSubcat(sl); });
    });
    if (showNewOnly)      addChip(strip, 'New this week',    function () { setToggle('new', false); });
    if (showFoundingOnly) addChip(strip, 'Founding vendors', function () { setToggle('founding', false); });
    if (showVerifiedOnly) addChip(strip, 'Verified',         function () { setToggle('verified', false); });
  }
  function addChip(strip, label, onRemove) {
    var chip = ce('span', 'active-filter-chip');
    chip.appendChild(document.createTextNode(label));
    var x = ce('button', 'remove-x'); x.type = 'button'; x.textContent = '×';
    x.setAttribute('aria-label', 'Remove ' + label + ' filter');
    x.addEventListener('click', onRemove);
    chip.appendChild(x); strip.appendChild(chip);
  }
  // Mobile chip strip: rebuilt on every filter pass (<=10 nodes, cheap).
  // Lives right under the Filter/Sort row; clicks reuse setCategory so the
  // sidebar, subcat pills, URL state and GA event all stay in one code path.
  var _chipLastActive = null;
  function renderCategoryChips() {
    var btn = el('browse-mobile-filter-btn');
    if (!btn || !btn.parentElement || !btn.parentElement.parentElement) return;
    var strip = el('lk-cat-chips');
    if (!strip) {
      strip = ce('div'); strip.id = 'lk-cat-chips';
      strip.setAttribute('role', 'group');
      strip.setAttribute('aria-label', 'Filter by category');
      var row = btn.parentElement;
      row.parentElement.insertBefore(strip, row.nextSibling);
    }
    var entries = [{ slug: 'all', label: 'All', count: _allVendors.length }];
    CATEGORY_LIST.forEach(function (c) {
      if (c.slug === 'all') return;
      var id = SLUG_TO_ID[c.slug];
      var n = _allVendors.filter(function (v) { return vCategoryIds(v).indexOf(id) !== -1; }).length;
      // Same emptiness rule as the sidebar: zero-count categories don't render
      // (dead-end taps advertise a thin market); the active one always does.
      if (n > 0 || c.slug === activeCategory) entries.push({ slug: c.slug, label: c.label, count: n });
    });
    // All first, then fullest categories first - the busiest shelves lead.
    entries = [entries[0]].concat(entries.slice(1).sort(function (a, b) {
      return b.count - a.count || a.label.localeCompare(b.label);
    }));
    strip.textContent = '';
    entries.forEach(function (en) {
      var b = ce('button', 'lk-cat-chip' + (en.slug === activeCategory ? ' active' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', en.slug === activeCategory ? 'true' : 'false');
      var t = ce('span'); t.textContent = en.label;
      var n = ce('span', 'lk-cat-chip-n'); n.textContent = String(en.count);
      b.appendChild(t); b.appendChild(n);
      b.addEventListener('click', function () { setCategory(en.slug); });
      strip.appendChild(b);
    });
    // Bring the active chip into view only when the SELECTION changed - never
    // fight a horizontal scroll the visitor is doing themselves.
    if (activeCategory !== _chipLastActive) {
      _chipLastActive = activeCategory;
      var act = strip.querySelector('.lk-cat-chip.active');
      if (act && act.scrollIntoView) { try { act.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) {} }
    }
  }

  function updateMobileIndicator() {
    renderCategoryChips();
    var btn = el('browse-mobile-filter-btn');
    if (!btn) return;
    btn.classList.toggle('has-filters', activeCategory !== 'all' || activeSubcats.length > 0 || showNewOnly || showFoundingOnly || showVerifiedOnly || activeLocationId !== 'all' || !!searchTerm);
  }

  // ── setters ──
  function setLocation(idOrAll) {
    activeLocationId = idOrAll;
    var sel = locSelectEl(); if (sel) sel.value = String(idOrAll);
    // Store 'all' explicitly (don't remove the key): an explicit "All
    // neighborhoods" pick must also suppress the #44 account-region default
    // on future visits — a removed key would let it snap back.
    try { localStorage.setItem(AREA_KEY, String(idOrAll)); } catch (e) {}
    applyFilters(); // client-side neighborhood filter (no re-fetch)
  }
  function setCategory(slug) {
    // #110 GA4: category engagement ('all' reset not tracked).
    try { if (slug && slug !== 'all' && typeof window.gtag === 'function') window.gtag('event', 'market_filter', { category: slug }); } catch (e) {}
    if (slug !== activeCategory) { activeSubcats = []; _rawRestoredSubcats = null; } // #96 — picks belong to one category
    activeCategory = slug;
    var items = document.querySelectorAll('#browse-filter-panel .filter-item[data-category-slug]');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', items[i].getAttribute('data-category-slug') === slug);
    renderSubcatRow();
    applyFilters();
  }
  function setToggle(which, on) {
    var sw;
    if (which === 'new')      { showNewOnly = on;      sw = el('browse-toggle-new'); }
    if (which === 'founding') { showFoundingOnly = on; sw = el('browse-toggle-founding'); }
    if (which === 'verified') { showVerifiedOnly = on; sw = el('browse-toggle-verified'); }
    if (sw) { sw.classList.toggle('on', on); syncSwitchAria(sw, on); }
    applyFilters();
  }
  function setSort(sort) {
    activeSort = sort;
    var ids = { best_match: 'sort-match', newest: 'sort-new', a_z: 'sort-az' };
    SORT_LIST.forEach(function (s) { var r = el(s.id); if (r) r.classList.toggle('active', s.id === ids[sort]); });
    var msel = sortSelectEl(); if (msel && msel.value !== sort) msel.value = sort;
    applyFilters();
  }

  // ── drawer ──
  function openFilters() {
    var sb = el('browse-sidebar'), bd = el('browse-filter-backdrop');
    if (sb) sb.classList.add('open'); if (bd) bd.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeFilters() {
    var sb = el('browse-sidebar'), bd = el('browse-filter-backdrop');
    if (sb) sb.classList.remove('open'); if (bd) bd.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── events (search/location/mobile/drawer; category/toggle/sort bound during render) ──
  function bindEvents() {
    // Search binds at the DOCUMENT level, not on the element: the live input
    // sits inside a code-island's open shadow root (getElementById === null),
    // but composed input events cross open shadow boundaries — composedPath
    // resolves the real target. Same island pattern as the CTA handler up top.
    var applySearch = debounce(applyFilters, 200);
    // #110 GA4: search terms, settle-debounced (800ms) + deduped + capped at 50
    // chars — one event per settled term, not one per keystroke.
    var _gaLastTerm = '';
    var gaSearch = debounce(function () {
      var term = String(searchTerm || '').trim().slice(0, 50);
      if (term.length < 2 || term === _gaLastTerm) return;
      _gaLastTerm = term;
      try { if (typeof window.gtag === 'function') window.gtag('event', 'market_search', { term: term }); } catch (e) {}
    }, 800);
    document.addEventListener('input', function (e) {
      var t = (e.composedPath && e.composedPath()[0]) || e.target;
      if (!t || t.id !== 'browse-search') return;
      searchTerm = t.value || '';
      applySearch();
      gaSearch();
    }, true);
    var loc = locSelectEl();
    if (loc) loc.addEventListener('change', function () { setLocation(loc.value); });
    var msel = sortSelectEl(); if (msel) msel.addEventListener('change', function () { setSort(msel.value); });
    // F 2026-09-02: "Sort" moves OUT of the dropdown - the Webflow options are
    // authored as "Sort: Newest" etc.; strip the prefix so the control reads
    // just the value, and put a quiet external "Sort by" label before it
    // (kept as the accessible name too).
    if (msel) {
      for (var oi = 0; oi < msel.options.length; oi++) {
        msel.options[oi].textContent = msel.options[oi].textContent.replace(/^\s*Sort:\s*/i, '');
      }
      msel.setAttribute('aria-label', 'Sort by');
      // Label sits to the LEFT of the dropdown on one line (F): wrap both in a
      // flex group so the surrounding row's own wrapping can't stack them.
      if (!document.getElementById('lk-sort-wrap')) {
        var swrap = ce('div'); swrap.id = 'lk-sort-wrap';
        swrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0;';
        var slab = ce('span'); slab.id = 'lk-sort-label'; slab.textContent = 'Sort by';
        slab.setAttribute('aria-hidden', 'true');
        slab.style.cssText = "flex:0 0 auto;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:600;color:#6E6A85;white-space:nowrap;";
        msel.parentNode.insertBefore(swrap, msel);
        swrap.appendChild(slab);
        swrap.appendChild(msel);
        msel.style.flex = '1 1 auto';
        msel.style.minWidth = '0';
      }
    }
    wireButton(el('browse-mobile-filter-btn'), openFilters);
    var backdrop = el('browse-filter-backdrop'); if (backdrop) backdrop.addEventListener('click', closeFilters);
    wireButton(el('browse-close-filters'), closeFilters);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var sb = el('browse-sidebar');
      if (sb && sb.classList.contains('open')) closeFilters();
    });
  }

  function injectStyles() {
    if (el('lokali-browse-styles')) return;
    var s = ce('style'); s.id = 'lokali-browse-styles'; s.textContent = CSS; document.head.appendChild(s);
  }

  // The Webflow page never shipped a #browse-loading mount — inject the element
  // fetchVendors() drives (shown through the retry/backoff window, hidden on load).
  function ensureLoadingEl() {
    if (el('browse-loading') || !_grid || !_grid.parentNode) return;
    var d = ce('div');
    d.id = 'browse-loading';
    d.appendChild(ce('span', 'lk-browse-spin'));
    d.appendChild(document.createTextNode('Loading vendors…'));
    _grid.parentNode.insertBefore(d, _grid);
  }

  // ── init ──
  function init() {
    if (!window.LokaliAPI) { console.error('[lokali-browse] LokaliAPI not found — load lokali-api-client.js first.'); return; }
    _grid = el('browse-vendor-grid');
    if (!_grid) { console.error('[lokali-browse] #browse-vendor-grid not found.'); return; }
    _emptyState = el('browse-empty-state');

    injectStyles();
    ensureLoadingEl();
    // Hand-off from the page-head pre-script guard (the-market head CSS hides
    // the Webflow-baked "No vendors found"/"0 vendors" and spins a pure-CSS
    // loader until this script boots) — from here the script owns presentation.
    document.body.classList.add('lk-browse-ready');
    // Blank the Webflow-baked "0" counts until the first real result lands —
    // "0 vendors found" over an empty grid reads as an empty marketplace.
    setText(el('browse-result-count'), '…'); setText(el('browse-grid-count'), '…');
    Array.prototype.slice.call(_grid.children).forEach(function (k) { if (k !== _emptyState) _grid.removeChild(k); });
    if (_emptyState) hideEl(_emptyState);

    // Restore the visitor's saved filters/sort BEFORE rendering, so the panel reflects them.
    var restored = restoreState();
    renderFilterPanel();
    bindEvents();
    fetchListingIndex();   // #96 — parallel with ref data + vendors; fire-and-forget
    fetchSubcatTaxonomy(); // #96-SUGGEST — live taxonomy; baked list is the fallback

    // Reference data (categories/locations) is non-critical: a failure must never block the
    // vendor grid. Previously a rejected loadRefData() skipped fetchVendors() entirely and
    // showed an empty market. Swallow its error so the chain always reaches fetchVendors();
    // the filters just degrade gracefully without the ref labels.
    loadRefData()
      .catch(function (err) { console.warn('[lokali-browse] ref data load failed, continuing:', err); })
      .then(function () {
        var deep = applyDeepLink(); // CAT-LINK — external filtered entry; wins over session + default
        if (!restored && !deep.location) resolveInitialLocation(); // else saved/URL default
        populateLocationSelect();
        syncFilterUI();
        if (!deep.location) applyRegionDefault(); // #44 — but never override an explicit deep-linked area
        return fetchVendors();
      })
      .catch(function (err) {
        console.error('[lokali-browse] vendor load failed:', err);
        showEmpty(false); // load failure ≠ "unclaimed spot" — stock copy only
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Safety net for the back/forward cache (bfcache): if a visitor left The Market
  // while it was empty (e.g. mid-load) and then returns via the browser Back button,
  // the page is restored from a snapshot and init() does NOT re-run — leaving a blank,
  // vendor-less grid. Re-fetch on bfcache restore whenever no cards are showing.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    if (!window.LokaliAPI || !_grid) return;
    if (_renderedCards.length === 0) fetchVendors();
    // #96 — the listing-name index and taxonomy can also have been lost
    // mid-load (in-flight fetches don't survive entering the bfcache);
    // refetch whichever is missing.
    if (!Object.keys(_listingsByVendor).length) fetchListingIndex();
    if (!_taxonomyLoaded) fetchSubcatTaxonomy();
  });
})();
