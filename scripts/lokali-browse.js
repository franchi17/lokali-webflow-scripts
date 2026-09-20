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
 *   + subcategory KEYWORDS (#151 step 2: curated synonyms from the table), and
 *   hits are RANKED by where they land (#151 step 3): name/subcategory >
 *   listing names > description, paid tier breaking ties within a band.
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
    1: { slug: 'handcrafted', label: 'Handmade & Custom', bg: '#FFF8E6', text: '#8A5A00' },
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
    1: [ // Handmade & Custom (Artisans & Makers)
      { slug: 'handmade-jewelry',     label: 'Handmade jewelry' },
      { slug: 'candles-soap',         label: 'Candles & soap' },
      { slug: 'art-prints',           label: 'Art prints & paintings' },
      { slug: 'pottery-ceramics',     label: 'Pottery & ceramics' },
      { slug: 'woodworking',          label: 'Woodworking' },
      { slug: 'custom-embroidery',    label: 'Custom embroidery' },
      { slug: 'floral-arrangements',  label: 'Floral arrangements' },
      // 2026-08-19 (F): 'sewn-goods' retired — nobody searches the craft, they
      // search the product. 2026-09-02 (F): 'clothing' retired in turn for
      // 'dresses' (patch_retire_clothing_cups_subcats.sql) — Quori & Lace
      // sells dresses, and the product beats the category here too.
      { slug: 'dresses',              label: 'Dresses' }
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
        SUBCATS_BY_CAT[catId].forEach(function (s) { SUBCAT_BY_SLUG[s.slug] = { label: s.label, catId: parseInt(catId, 10), keywords: s.keywords || [] }; });
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
        // #151: keywords = curated synonyms per subcategory (text[]; '{}' until
        // curated). Only the live table carries them; the baked fallback has none.
        (byCat[r.category_id] = byCat[r.category_id] || []).push({ slug: r.slug, label: r.label, keywords: Array.isArray(r.keywords) ? r.keywords : [] });
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
    { slug: 'handcrafted', label: 'Handmade & Custom', url: ASSET + '6a186b061a80eb9ba75f0d0a_scissors-solid.png' },
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
    { sort: 'best_match', id: 'sort-match', label: 'Featured first',   url: ASSET + '6a1d92f85db0d873ff20900a_sort-solid.png' },
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
    // "About The Market" block (Designer classes): its columns are fixed at 280px,
    // but with 32px page + 44px block padding the space is only 207px at 375 and
    // 152px at 320, so the copy was CLIPPED on ordinary phones and pushed the page
    // sideways at 320 (measured 2026-09-19). Columns may now shrink to the space,
    // and phones give the block its padding back.
    '.mkt-about-cols{grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr)) !important;}',
    '.mkt-about-col{min-width:0;}',
    '@media (max-width:767px){.mkt-about{padding-left:20px !important;padding-right:20px !important;}.mkt-about-p,.mkt-about-h3{overflow-wrap:anywhere;}}',
    // the two bottom CTA cards hold a 293px width; at 320px that ran 20px off the screen
    '@media (max-width:359px){.bottom-cta-card-cta-card-light,.bottom-cta-card-cta-card-dark{min-width:0 !important;width:100% !important;max-width:100% !important;box-sizing:border-box;}}',
    // ── card ──
    // Card redesign 2026-08-29 (Francesca's Direction A): image-led cover (the
    // vendor's WORK, never the logo — the avatar carries identity), tagline in
    // the vendor's voice, need-first offerings line, one Visit-storefront CTA.
    // Contact buttons moved to the storefront; the card's job is earning the click.
    // Card edges 2026-09-18 (F: 'the cards get lost'): 1px #DEDAEE + a tight contact
    // shadow. The old .5px #EEEDF6 drew at half strength on 1x screens and the .05
    // violet blur sat below what the eye notices, so white-background covers had
    // no top edge. prefers-contrast users get a 3:1 edge (block below).
    ".vcard{background:#fff;border:1px solid #DEDAEE;border-radius:14px;padding:0;cursor:pointer;transition:all .15s;position:relative;overflow:hidden;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 1px 2px rgba(40,32,90,.08),0 4px 14px rgba(40,32,90,.06);}",
    ".vcard:hover{border-color:#D4AAFD;box-shadow:0 2px 4px rgba(40,32,90,.08),0 10px 24px rgba(96,2,238,.10);transform:translateY(-1px);}",
    "@media (prefers-contrast:more){.vcard{border-color:#837E9B;}}",
    // Gutter wider than the card's 14px inner padding so spacing separates cards too.
    "#browse-vendor-grid{gap:20px;}",
    ".browse-sidebar{border:1px solid #E4E2F0;}",
    ".vcard-spotlight{border-color:rgba(96,2,238,.2);}",
    // #179 ground + compact hero (F 2026-09-18). #F2F1F9 = F's grey nudged so the
    // muted #6E6A85 keeps AA (4.61:1; #EEEDF6 = 4.45) - the band Apple/Facebook
    // put behind white cards. The hero keeps the eyebrow + H1 only, on the same
    // ground (no white band); subline + the duplicate 'N vendors found' go at
    // every size. The hero search box hides only where a header field replaces
    // it (classes set by lokali-mobile-nav.js, so an old nav pin changes nothing).
    // .section-18 too: .browse-body is a 1040px box, so without it the grey stops
    // short and the page shows white flanks beside it on wide screens.
    ".browse-body,.browse-hero,.section-18{background:#F2F1F9;}",
    // Title lines up with the grid below (body = 1040 box - 2x32 padding = 976).
    ".browse-hero .browse-hero-inner{max-width:976px;}",
    ".browse-hero{border-bottom:0;padding-top:28px;padding-bottom:0;}",
    ".browse-body{padding-top:18px;}",
    // Wide desktops (F 2026-09-18: "a lot of space on the left and right"): the
    // 1040px Designer box grows to 1424 (hero inner keeps its 32px inset) and the
    // vendor grid takes a third column so cards hold their ~350px size instead
    // of ballooning. Tiles/new-this-week rows are fr grids and just stretch.
    "@media screen and (min-width:1440px){.browse-body{max-width:1424px;}.browse-hero .browse-hero-inner{max-width:1360px;}#browse-vendor-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}",
    ".browse-hero .browse-hero-sub,.browse-hero .result-meta{display:none;}",
    "html.lk-hood-moved .browse-hero .form-block-7{display:none;}",
    "@media screen and (max-width:767px){html.lok-row2 .browse-hero .search-bar{display:none;}.browse-hero{padding-top:20px;}.browse-body{padding-top:14px;}}",
    "@media screen and (min-width:1380px){html.lok-mkt-hs .browse-hero .search-bar{display:none;}}",
    // Neighborhood picker: lilac fill + violet text (F). #E6DBFD is the lightest
    // lilac that clears 3x the visibility threshold on the ground.
    "#lk-hood-side{margin-bottom:1.5rem;}",
    "#lk-hood-side .lk-filter-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#6E6A85;margin-bottom:.6rem;}",
    // select#id beats the generic select rules further down (2 ids vs 1).
    "#lk-hood-side select#location-select,#lk-hood-side select#browse-location{width:100%;margin:0;padding:0 32px 0 12px;background-position:right 12px center;text-overflow:ellipsis;}",
    "@media screen and (min-width:1150px){#lk-hood-side select#location-select,#lk-hood-side select#browse-location{font-size:14px;min-height:42px;}}",
    "@media screen and (max-width:991px){#browse-mobile-sort{gap:8px;}#browse-mobile-sort>select#location-select,#browse-mobile-sort>select#browse-location{flex:1 1 0;min-width:0;width:auto;margin:0;}#browse-mobile-filter-btn{flex:0 0 auto;white-space:nowrap;}}",
    "@media screen and (max-width:767px){#lk-sort-wrap{display:none!important;}#browse-mobile-sort>select#location-select,#browse-mobile-sort>select#browse-location{padding:0 32px 0 12px;background-position:right 12px center;text-overflow:ellipsis;}.browse-hero .text-block-116{font-size:21px;line-height:1.25;}}",
    // Cover: real photo when the vendor has one (gallery -> service -> product,
    // resolved by the adapter), else the branded gradient + initials mark.
    // 116px -> 165px (F 2026-09-01: photos were too squat to read); mobile's
    // full-width single-column card gets 200px in the 767px block below.
    ".vcard-cover{height:165px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#E9E1FA 0%,#F9E7DC 55%,#FDF3EC 100%);}",
    ".vcard-cover-img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;transition:opacity .65s ease;}",
    // Hairline under the cover: a white product photo keeps an edge above the text.
    ".vcard-cover::after{content:'';position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -1px 0 rgba(40,32,90,.08);}",
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
    ".vcard .cat-pill{position:absolute;top:10px;left:10px;z-index:2;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;border-radius:100px;padding:3.5px 11px;box-shadow:0 1px 4px rgba(0,0,0,.08);}",
    ".vcard-body{padding:14px 16px 15px;}",
    ".vcard-name-row{display:flex;align-items:center;gap:7px;margin-bottom:5px;flex-wrap:wrap;}",
    // Circle, not rounded square — the profile page promises vendors a round
    // logo, and the storefront renders it round (Francesca 2026-08-13).
    ".vcard-avatar{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;border:1.5px solid #F0E9FB;overflow:hidden;}",
    ".vcard-avatar-initials{background:#F3EBFF;color:#6002EE;letter-spacing:.5px;}",
    ".vcard-avatar-img{width:100%;height:100%;object-fit:cover;display:block;}",
    // .vcard-name is a real <a> (keyboard/SR path into the profile) — kill link chrome.
    ".vcard-name{font-size:15.5px;font-weight:700;color:#1A1829;letter-spacing:-.3px;line-height:1.2;text-decoration:none;}",
    // Status chips sit inline after the name, labeled (an unlabeled 22px icon
    // circle was undecodable for first-time visitors). Same palette as the old badges.
    ".vcard .name-chip{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;border-radius:100px;padding:2px 7px;line-height:1.3;flex-shrink:0;}",
    ".vcard .chip-verified{background:#D2DEFF;color:#1730C9;}",
    ".vcard .chip-new{background:#C6F2DB;color:#11744A;}",
    ".vcard .chip-spotlight{background:#E2D2FF;color:#5A00E0;}",
    // Away chip (v1.4.444 shipped it without a rule, so it inherited nothing).
    ".vcard .chip-away{background:#FFF2DF;color:#B8471B;}",
    // Second pill row (2026-09-17): one trust pill + one fulfilment chip.
    ".vcard-signals{display:flex;flex-wrap:wrap;gap:6px;margin:1px 0 7px;}",
    ".sig-pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;border-radius:100px;padding:3px 9px;line-height:1.3;}",
    ".sig-ico{display:inline-flex;width:11px;height:11px;}.sig-ico svg{width:11px;height:11px;display:block;}",
    ".sig-trust{background:#FDE8EF;color:#B3184E;}",
    ".sig-get{background:#F3F2F8;color:#4A4761;}",
    // Start-here band above the grid (occasions / new this week / neighbors' picks).
    // Only on the default landing view; hidden as soon as the shopper narrows.
    "#lk-start{display:none;font-family:'Plus Jakarta Sans',sans-serif;margin:0 0 22px;}",
    // Occasion bar (2026-09-18): names the shortcut above the results with a
    // 44px Clear button; tinted with the tile the shopper tapped.
    "#lk-occ-bar{display:none;align-items:center;gap:12px;font-family:'Plus Jakarta Sans',sans-serif;border-radius:14px;padding:10px 10px 10px 12px;margin:0 0 16px;outline:none;}",
    "#lk-occ-bar.show{display:flex;}",
    ".lk-occ-ico{width:36px;height:36px;border-radius:10px;background:#fff;display:inline-flex;align-items:center;justify-content:center;flex:none;}",
    ".lk-occ-ico svg{width:16px;height:16px;}",
    ".lk-occ-txt{display:flex;flex-direction:column;min-width:0;flex:1 1 auto;}",
    ".lk-occ-t{font-size:15px;font-weight:700;color:#1A1829;line-height:1.25;white-space:normal;overflow-wrap:break-word;}",
    // Narrow phones: the name wraps rather than truncating, and the decorative
    // icon steps aside so every name fits in two lines at 320px.
    "@media screen and (max-width:400px){#lk-occ-bar .lk-occ-ico{display:none;}#lk-occ-bar{padding-left:14px;}}",
    ".lk-occ-n{font-size:12.5px;color:#4A4761;line-height:1.35;}",
    ".lk-occ-clear{display:inline-flex;align-items:center;gap:7px;flex:none;min-height:44px;padding:0 16px;border-radius:100px;border:1px solid #E4D6FF;background:#fff;color:#6002EE;font:700 13.5px/1 'Plus Jakarta Sans',sans-serif;cursor:pointer;}",
    ".lk-occ-clear:hover{background:#F3EBFF;}",
    ".lk-occ-clear:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}",
    ".lk-occ-x{display:inline-flex;width:12px;height:12px;}.lk-occ-x svg{width:12px;height:12px;display:block;}",
    "#lk-start.show{display:block;}",
    ".lk-st-sec{margin-bottom:20px;}",
    ".lk-st-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px;}",
    ".lk-st-h{font-size:17px;font-weight:800;color:#1A1829;margin:0;letter-spacing:-.2px;}",
    ".lk-st-sub{font-size:12.5px;color:#6E6A85;}",
    ".lk-st-link{font-size:12.5px;font-weight:600;color:#6002EE;background:none;border:0;padding:0;cursor:pointer;font-family:inherit;white-space:nowrap;}",
    ".lk-st-tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;}",
    ".lk-st-tile{display:flex;flex-direction:column;gap:7px;padding:13px 13px 12px;border-radius:13px;border:0;text-align:left;cursor:pointer;font-family:inherit;min-height:44px;}",
    ".lk-st-tile-ico{width:30px;height:30px;border-radius:9px;background:#fff;display:inline-flex;align-items:center;justify-content:center;}",
    ".lk-st-tile-ico svg{width:14px;height:14px;}",
    ".lk-st-tile-t{font-size:13.5px;font-weight:700;color:#1A1829;line-height:1.25;}",
    ".lk-st-tile-s{font-size:11.5px;color:#4A4761;line-height:1.35;}",
    ".lk-st-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}",
    ".lk-st-mini{display:flex;gap:10px;align-items:center;padding:10px 12px;background:#fff;border:1px solid #DEDAEE;border-radius:12px;text-decoration:none;min-width:0;box-shadow:0 1px 2px rgba(40,32,90,.08);}",
    ".lk-st-mini .vcard-avatar{width:40px;height:40px;font-size:13px;}",
    ".lk-st-mini-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}",
    ".lk-st-mini-n{font-size:13.5px;font-weight:700;color:#1A1829;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".lk-st-mini-c{font-size:11.5px;color:#6E6A85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".lk-st-mini-s{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;}",
    ".lk-st-mini-s .sig-ico svg{width:10px;height:10px;}",
    ".lk-st-mini-s.saved{color:#B3184E;}.lk-st-mini-s.new{color:#11744A;}",
    "@media screen and (max-width:991px){.lk-st-tiles{grid-template-columns:repeat(3,minmax(0,1fr));}.lk-st-row{grid-template-columns:repeat(2,minmax(0,1fr));}}",
    "@media screen and (max-width:560px){.lk-st-tiles{grid-template-columns:repeat(2,minmax(0,1fr));}.lk-st-row{grid-template-columns:minmax(0,1fr);}.lk-st-head{flex-wrap:wrap;}}",
    // #179 follow-up (F 2026-09-18): on phones the band stacked 3 rows of tiles +
    // 4 full-width minis (~700px) between the filters and the first vendor. Each
    // group becomes ONE swipeable row that bleeds to the screen edge, so the next
    // item peeks in as the scroll cue (same pattern as the category chips).
    "@media screen and (max-width:560px){",
    ".lk-st-tiles,.lk-st-row{display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;scroll-snap-type:x proximity;scroll-padding-left:32px;margin:0 -32px;padding:2px 32px 4px;}",
    ".lk-st-tiles::-webkit-scrollbar,.lk-st-row::-webkit-scrollbar{display:none;}",
    ".lk-st-tile{flex:0 0 148px;scroll-snap-align:start;}",
    ".lk-st-mini{flex:0 0 236px;scroll-snap-align:start;}",
    ".lk-st-sec{margin-bottom:16px;}",
    "}",
    // #96 offerings — need-first: shoppers search for a service, not a business,
    // so this is the strongest text after the name. `.match` = the label that
    // made this card a search hit (promoted to front, violet).
    ".vcard-offerline{font-size:12.5px;font-weight:600;color:#33304A;line-height:1.45;margin-bottom:5px;}",
    ".vcard-offer-more{color:#6E6A85;font-weight:500;white-space:nowrap;}",
    ".vcard-offerline .match{color:#6002EE;}",
    // Clamped: a vendor with no tagline falls back to the business description,
    // which is storefront-length (Delightful Designs put ~120 words on one card,
    // F 2026-09-16). cardHook() caps the text; the clamp is the visual guard.
    ".vcard-tagline{font-size:12.5px;color:#6B6880;line-height:1.5;margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;}",
    // #162d person-first: the human behind the business, right under the name.
    ".vcard-by{font-size:12px;color:#6E6A85;line-height:1.3;margin:-2px 0 6px 33px;}",
    ".vcard-by b{font-weight:600;color:#4B4666;}",
    ".vcard-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;}",
    ".vcard-foot-meta{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#6E6A85;min-width:0;flex-wrap:wrap;}",
    ".vcard-visit{font-size:12.5px;font-weight:700;color:#6002EE;text-decoration:none;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;}",
    // #96 sidebar subcategory pills — unfold under the ACTIVE category row
    // (expand-in-place accordion; other categories stay visible/clickable).
    "#browse-filter-panel .lk-subcat-row{display:flex;flex-wrap:wrap;gap:5px;padding:8px 4px 10px 14px;}",
    // text-align:left — <button> defaults to center, which reads as ragged/odd on the
    // labels long enough to wrap in the narrow sidebar ("Bookkeeping & accounting").
    "#browse-filter-panel .subcat-pill{font-family:inherit;-webkit-appearance:none;appearance:none;font-size:11px;font-weight:500;background:#fff;border:1px solid #E4E2F0;color:#6B6880;border-radius:100px;padding:4px 11px;cursor:pointer;user-select:none;transition:all .12s;line-height:1.3;text-align:left;}",
    "#browse-filter-panel .subcat-pill:hover{border-color:#6002EE;color:#6002EE;}",
    "#browse-filter-panel .subcat-pill.on{background:#6002EE;border-color:#6002EE;color:#fff;font-weight:600;}",
    // ── filter panel ──
    "#browse-filter-panel{font-family:'Plus Jakarta Sans',sans-serif;}",
    "#browse-filter-panel .lk-filter-section{margin-bottom:1.5rem;}",
    "#browse-filter-panel .lk-filter-section:last-child{margin-bottom:0;}",
    "#browse-filter-panel .lk-filter-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#6E6A85;margin-bottom:.6rem;}",
    // .filter-item / .lk-toggle are real <button>s (keyboard path) — reset UA button chrome.
    "#browse-filter-panel .filter-item{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;font-family:inherit;-webkit-appearance:none;appearance:none;text-align:left;padding:7px 10px;border-radius:8px;font-size:13.5px;line-height:1.45;color:#4A4761;cursor:pointer;transition:all .1s;margin-bottom:2px;user-select:none;}",
    "#browse-filter-panel .filter-item:hover{background:#F7F6FC;color:#1A1829;}",
    "#browse-filter-panel .filter-item.active{background:#F3EBFF;color:#6002EE;font-weight:600;}",
    "#browse-filter-panel .fi-left{display:flex;align-items:center;gap:8px;}",
    "#browse-filter-panel .lk-glyph-icon{font-size:13px;font-weight:700;width:16px;text-align:center;display:inline-block;flex-shrink:0;}",
    "#browse-filter-panel .filter-count-pill{font-size:11px;font-weight:600;background:#EEEDF6;color:#6E6A85;border-radius:100px;padding:1px 7px;min-width:22px;text-align:center;}",
    "#browse-filter-panel .filter-item.active .filter-count-pill{background:rgba(96,2,238,.12);color:#6002EE;}",
    "#browse-filter-panel .lk-divider{height:.5px;background:#EEEDF6;margin:1rem 0;}",
    "#browse-filter-panel .lk-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;font-family:inherit;-webkit-appearance:none;appearance:none;text-align:left;padding:6px 0;cursor:pointer;user-select:none;}",
    "#browse-filter-panel .lk-toggle-label{font-size:13.5px;line-height:1.45;color:#4A4761;display:flex;align-items:flex-start;gap:6px;}",
    "#browse-filter-panel .lk-tg-ic{font-size:12px;font-weight:700;}",
    "#browse-filter-panel .toggle-switch{width:32px;height:18px;border-radius:100px;background:#C8C6D8;position:relative;transition:background .18s;flex-shrink:0;}",
    "#browse-filter-panel .toggle-switch.on{background:#1D6A45;}",
    "#browse-filter-panel .toggle-switch::after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;top:2px;left:2px;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.18);}",
    "#browse-filter-panel .toggle-switch.on::after{left:16px;}",
    // #107(d) recruitment empty-state CTA (injected node — Webflow has no style
    // for it, so font is set explicitly per the Plus Jakarta Sans rule; brand
    // primary-700 violet; 44px min-height per the tap-target floor).
    ".browse-empty-cta{display:inline-flex;align-items:center;justify-content:center;margin-top:16px;padding:12px 22px;min-height:44px;box-sizing:border-box;background:#3d00e0;color:#fff;border-radius:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:15.5px;font-weight:600;text-decoration:none;transition:background .15s;}",
    ".browse-empty-cta:hover{background:#3100b3;color:#fff;}",
    // Active-filter chips (no Webflow styles exist for them) — pill matching the
    // sidebar's .filter-item.active; the × is a real button with a 32px hit area.
    ".active-filter-chip{display:inline-flex;align-items:center;font-family:'Plus Jakarta Sans',sans-serif;font-size:12.5px;font-weight:500;background:#E6DBFD;color:#6002EE;border:1px solid #C4A8F7;border-radius:100px;padding:2px 2px 2px 12px;min-height:28px;box-sizing:border-box;margin:2px 6px 2px 0;}",
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
    "font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15.5px;font-weight:600;color:#343A40;",
    "background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 6l5 5 5-5' fill='none' stroke='%236002EE' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");",
    "background-repeat:no-repeat;background-position:right 14px center;background-size:13px;cursor:pointer;",
    "transition:border-color .15s ease,box-shadow .15s ease;}",
    "select#browse-sort,select#browse-mobile-sort{background-color:#fff;}",
    "select#location-select,select#browse-location{background-color:#E6DBFD;border-color:#C4A8F7;color:#6002EE;}",
    "select#browse-sort:hover,select#browse-mobile-sort:hover{border-color:#C9BFEA;}",
    "select#location-select:hover,select#browse-location:hover{border-color:#A883F3;}",
    "select#browse-sort:focus,select#location-select:focus,select#browse-location:focus,select#browse-mobile-sort:focus{outline:none;border-color:#6002EE;box-shadow:0 0 0 3px rgba(96,2,238,.12);}",
    "select#browse-sort::-ms-expand,select#location-select::-ms-expand{display:none;}",
    // The sort control matches its external "Sort by" label (F: dropdown font
    // read too big next to it); the neighborhoods select keeps the hero size.
    // Applies >=1150px only: below that the #98 iOS rule floors ALL form
    // controls at 16px !important (sub-16px fields make Safari zoom-lock the
    // page on tap), and that accessibility floor deliberately wins.
    "@media screen and (min-width:1150px){select#browse-sort{font-size:13.5px;min-height:42px;}}",
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
    ".section-18{margin-right:0;}",
    "#browse-loading{display:none;text-align:center;padding:36px 0;font-family:'Plus Jakarta Sans',sans-serif;font-size:13.5px;color:#6B6880;}",
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
  var _trustByVendor = {};    // shopper trust signals (2026-09-17): vendor id -> vendor_trust_stats row

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
  // Card hook = tagline, else the description cut to card length. Descriptions
  // are written for the storefront: strip URLs (an unbroken link token widens
  // the card) and cap at a word boundary, same shape as lokali-neighbors.js.
  // vTagline() stays uncapped for the search haystack.
  function cardHook(v) {
    var hook = String(v.business_tagline || v.tagline || '').trim();
    if (!hook) {
      hook = String(vDescription(v) || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
      if (hook.length > 140) {
        hook = hook.slice(0, 140);
        var sp = hook.lastIndexOf(' ');
        if (sp > 80) hook = hook.slice(0, sp);
        hook = hook.replace(/[\s,;:.]+$/, '') + '\u2026';
      }
    }
    return hook;
  }
  function vListingNames(v) { return (v.id != null && _listingsByVendor[v.id]) || []; }
  function vSubcats(v) { return Array.isArray(v.subcategories) ? v.subcategories : []; }
  function vSubcatLabels(v) {
    var out = [];
    vSubcats(v).forEach(function (s) { if (SUBCAT_BY_SLUG[s]) out.push(SUBCAT_BY_SLUG[s].label); });
    return out;
  }
  // #151: the synonyms behind the vendor's subcategories ("cpa", "taxes" for
  // Bookkeeping). Searchable, never rendered.
  function vSubcatKeywords(v) {
    var out = [];
    vSubcats(v).forEach(function (s) {
      var m = SUBCAT_BY_SLUG[s];
      if (m && m.keywords && m.keywords.length) out = out.concat(m.keywords);
    });
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
  // CLEAN-P23: card-size variant through the Storage render endpoint. The helper
  // lives in lokali-supabase-client.js (window.LokaliImg); if it is absent the
  // full object loads exactly as before.
  function imgSet(img, url, w) {
    var I = window.LokaliImg;
    if (I && typeof I.set === 'function') I.set(img, url, w); else img.src = url;
  }
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

    if (out.category || out.search) _occ = null; // an explicit link is not a tile tap
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
      _vendorsReady = true;
      applyFilters();
      fetchCovers();
      fetchTrustStats();
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

  // ── shopper trust signals (F 2026-09-17, "build 1, 2 and 4") ─────────────
  // One batched anon RPC (vendor_trust_stats, patch_vendor_trust_stats.sql)
  // returns AGGREGATES only per public vendor: saves (floored to 0 under three),
  // approved recommendations, a replies-within-a-day flag (>=5 replies in 90
  // days, median under 24h; never a duration) and the fulfilment roll-up of the
  // vendor's ACTIVE listings. Non-critical by design: a stale cached adapter or
  // a pre-SQL tag leaves every card without the second pill row and hides
  // Neighbors' picks. Chunked at the RPC's 60-id cap.
  function fetchTrustStats() {
    try {
      var api = window.LokaliAPI && window.LokaliAPI.vendors;
      if (!api || typeof api.trustStats !== 'function') return;
      var ids = _allVendors.map(function (v) { return v.id; }).filter(function (x) { return x != null; });
      if (!ids.length) return;
      var chunks = [];
      for (var i = 0; i < ids.length; i += 60) chunks.push(ids.slice(i, i + 60));
      Promise.all(chunks.map(function (ch) { return api.trustStats(ch); })).then(function (outs) {
        var map = {}, any = false;
        outs.forEach(function (out) {
          var st = out && out.data && out.data.stats;
          if (!st || (out && out.error)) return;
          Object.keys(st).forEach(function (k) { map[k] = st[k]; any = true; });
        });
        if (!any) return;
        _trustByVendor = map;
        if (_allVendors.length) applyFilters();
      }).catch(function () {});
    } catch (e) {}
  }
  function vTrust(v) { return (v && v.id != null && _trustByVendor[String(v.id)]) || null; }
  // Inline FA Free 6 glyphs (house rule: no emoji, no third-party icon fonts).
  var SIG_SVG = {
    heart:  '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z"/></svg>',
    clock:  '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120V256c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2V120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"/></svg>',
    box:    '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M50.7 58.5L0 160H208V32H93.7C75.5 32 58.9 42.3 50.7 58.5zM240 160H448L397.3 58.5C389.1 42.3 372.5 32 354.3 32H240V160zm208 32H0V416c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192z"/></svg>',
    truck:  '<svg viewBox="0 0 640 512" aria-hidden="true"><path fill="currentColor" d="M48 0C21.5 0 0 21.5 0 48V368c0 26.5 21.5 48 48 48H64c0 53 43 96 96 96s96-43 96-96H384c0 53 43 96 96 96s96-43 96-96h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V288 256 237.3c0-17-6.7-33.3-18.7-45.3L512 114.7c-12-12-28.3-18.7-45.3-18.7H416V48c0-26.5-21.5-48-48-48H48zM416 160h50.7L544 237.3V256H416V160zM112 416a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm368-48a48 48 0 1 1 0 96 48 48 0 1 1 0-96z"/></svg>',
    bag:    '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M160 112c0-35.3 28.7-64 64-64s64 28.7 64 64v48H160V112zm-48 48H48c-26.5 0-48 21.5-48 48V416c0 53 43 96 96 96H352c53 0 96-43 96-96V208c0-26.5-21.5-48-48-48H336V112C336 50.1 285.9 0 224 0S112 50.1 112 112v48zm24 48a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm152 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z"/></svg>',
    laptop: '<svg viewBox="0 0 640 512" aria-hidden="true"><path fill="currentColor" d="M128 32C92.7 32 64 60.7 64 96V352h64V96H512V352h64V96c0-35.3-28.7-64-64-64H128zM19.2 384C8.6 384 0 392.6 0 403.2C0 445.6 34.4 480 76.8 480H563.2c42.4 0 76.8-34.4 76.8-76.8c0-10.6-8.6-19.2-19.2-19.2H19.2z"/></svg>',
    bolt:   '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288H175.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-17.3-20.7-30.6-20.7H272.5L349.4 44.6z"/></svg>'
  };
  function sigPill(cls, icon, text, title) {
    var p = ce('span', 'sig-pill ' + cls);
    var i = ce('span', 'sig-ico'); i.innerHTML = SIG_SVG[icon] || ''; // static markup only
    p.appendChild(i);
    p.appendChild(document.createTextNode(text));
    if (title) p.title = title;
    return p;
  }
  // Pill budget (F 2026-09-16): at most ONE trust pill (recommendations beat
  // reply time) and ONE fulfilment chip (the first that applies) per card; the
  // identity pill (Verified beats New) lives in the name row. Everything else
  // is on the storefront. Nothing renders without an earned, non-zero input.
  function signalRow(v) {
    var t = vTrust(v);
    if (!t) return null;
    var row = ce('div', 'vcard-signals');
    var recs = Number(t.recs) || 0;
    if (recs > 0) row.appendChild(sigPill('sig-trust', 'heart', 'Recommended by ' + recs + (recs === 1 ? ' neighbor' : ' neighbors'), 'Recommendations from shoppers who contacted this vendor through Lokali'));
    else if (t.reply_fast === true) row.appendChild(sigPill('sig-trust', 'clock', 'Replies within a day', 'Median first reply over the last 90 days'));
    if (t.ships === true)         row.appendChild(sigPill('sig-get', 'box', 'Ships', 'Ships orders'));
    else if (t.delivers === true) row.appendChild(sigPill('sig-get', 'truck', 'Delivers locally', 'Local delivery'));
    else if (t.pickup === true)   row.appendChild(sigPill('sig-get', 'bag', 'Pickup', 'Pickup available'));
    else if (t.remote === true)   row.appendChild(sigPill('sig-get', 'laptop', 'Works remotely', 'Available remotely'));
    return row.childNodes.length ? row : null;
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
      // CLEAN-P23: card-size variant. src is set BEFORE the listeners below on
      // purpose — load/error fire asynchronously, and the helper's own fallback
      // listener must be registered ahead of the skip-on-error one.
      imgSet(img, safeImgUrl(p.url), 640);
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
  // #151 step 3 relevance. Three nested haystacks, best band wins:
  //   h1 = name + tagline + category + subcategory labels + subcategory KEYWORDS
  //   h2 = h1 + active listing names
  //   h3 = h2 + description
  // 6/5 = phrase/all-tokens in h1, 4/3 = needs listings, 2/1 = needs the
  // description, 0 = no match. A vendor whose NAME or specialty says "cpa"
  // outranks one who mentions it in paragraph three; the default sort then
  // breaks ties by paid tier (rank()), then newest arrival.
  function searchScore(h1, h2, h3, q, toks) {
    // Phrase = the query as typed, or the kept tokens re-joined ("insurance
    // near me" → "insurance") so stop-words don't demote an exact hit.
    var p2 = toks.join(' ');
    function phrase(h) { return h.indexOf(q) !== -1 || h.indexOf(p2) !== -1; }
    function all(h) { for (var i = 0; i < toks.length; i++) { if (!hayHasToken(h, toks[i])) return false; } return true; }
    if (phrase(h1)) return 6;
    if (all(h1)) return 5;
    if (phrase(h2)) return 4;
    if (all(h2)) return 3;
    if (phrase(h3)) return 2;
    if (all(h3)) return 1;
    return 0;
  }
  var _searchScores = {};

  // ── filter + sort + render cards ──
  // Away mode chip helper: 'Sep 29' for a future vendors.away_until, else ''.
  function vAwayLabel(v) {
    var d = v && v.away_until ? String(v.away_until).slice(0, 10) : '';
    if (!d) return '';
    var t = new Date(); var today = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
    if (d < today) return '';
    var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  var _lastVisibleIds = [];   // demand signals: what the last filter pass matched
  // #180 phase 2: tell the visit stream which storefronts this pass listed (top
  // 24, in order), so "shown on The Market but never opened" becomes measurable.
  // Settled (1.5s) and deduped: typing or toggling filters does not spam it, and
  // an unchanged list is not re-sent. Search passes are reported by gaSearch.
  var _shownKey = '', _shownTimer = null;
  function reportMarketShown() {
    clearTimeout(_shownTimer);
    _shownTimer = setTimeout(function () {
      try {
        if (String(searchTerm || '').trim().length >= 2) return;
        var ids = _lastVisibleIds.slice(0, 24), key = ids.join(',');
        if (!ids.length || key === _shownKey) return;
        _shownKey = key;
        var L = window.LokaliAPI && window.LokaliAPI.leads;
        if (L && typeof L.trackVisit === 'function') L.trackVisit('market', { results: _lastVisibleIds.length, vendorIds: ids });
      } catch (e) {}
    }, 1500);
  }
  function applyFilters() {
    // A shortcut lives only while its own filter is still applied: editing the
    // search or picking another category turns it into an ordinary filter state.
    if (_occ && !occMatches(_occ)) {
      var droppedK = _occ.k;
      _occ = null;
      var hsD = occHistoryState();
      if (hsD && hsD.lkMarket === 'occ' && hsD.occ === droppedK) {
        occMarkEntry('cleared');                 // a Back/Forward reload never re-applies it
        if (_occPushedHere) _occAbandoned = true;
      }
    }
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
      var occTerms = _occ && _occ.terms;
      if (q || occTerms) {
        // #96: search covers what vendors OFFER — subcategory labels, active
        // listing names, and the full description — not just
        // name/tagline/category label. Fields join on '\n' (a trimmed query
        // can never contain one) so a phrase can't falsely match across the
        // boundary of two adjacent fields/names.
        // #151: people search by PRODUCT ("business insurance"), and the old
        // whole-phrase indexOf only matched those two words ADJACENT and in
        // order. Every token must appear somewhere (any order, any field,
        // light stem/prefix tolerance), and WHERE it lands sets the band.
        var h1 = [vName(v), vTagline(v), vCategoryStyle(v).label]
          .concat(vSubcatLabels(v)).concat(vSubcatKeywords(v)).join('\n').toLowerCase();
        var h2 = h1 + '\n' + vListingNames(v).join('\n').toLowerCase();
        var h3 = h2 + '\n' + String(vDescription(v) || '').toLowerCase();
        var sc = 0;
        if (q) { sc = searchScore(h1, h2, h3, q, toks); if (!sc) return false; }
        if (occTerms) {
          // Any word wins; its best band ranks the card (a typed search, when
          // present, stays the primary rank).
          var best = 0;
          for (var oi = 0; oi < occTerms.length && best < 6; oi++) {
            var ot = occTerms[oi];
            best = Math.max(best, searchScore(h1, h2, h3, ot, searchTokens(ot)));
          }
          if (!best) return false;
          if (!q) sc = best;
        }
        _searchScores[String(v.id)] = sc;
      }
      return true;
    });
    sortVendors(visible);
    _lastVisibleIds = visible.map(function (v) { return v.id; });
    reportMarketShown();
    renderGrid(visible);
    try { renderStartHere(); } catch (e) {}
    try { renderOccasionBar(visible.length); } catch (e) {}
    updateCounts(visible.length);
    updateActiveFilters();
    updateMobileIndicator();
    persistState();
  }

  // ── start-here band (F 2026-09-17, mockup D "Occasions and what's new") ──
  // Three entry points above the grid on the DEFAULT view only (no search, no
  // category, no toggles; the neighborhood may be set): occasion tiles that
  // deep-link INTO the existing search/category filters (no new taxonomy —
  // each tile is a query the #151 synonyms already answer, or a category),
  // "New this week" (published_at within 7 days) and "Neighbors' picks"
  // (saves >= 3 from vendor_trust_stats; the floor is server-side). A strip
  // with nothing to show is omitted, never a skeleton.
  var OCCASIONS = [
    // terms = the tile matches a vendor when ANY of these words matches, with
    // the Market's own search rules (tags + their synonyms, listing names,
    // description). F 2026-09-18 "do option 3": 'party' alone missed the home
    // bakers, whose synonyms say "birthday cake". Avoid words the light stemmer
    // turns noisy: 'shower' -> 'show', 'dress' -> 'dres' (matches "address"),
    // 'entertainer' -> 'entertain' (matches the whole Events & Entertainment
    // category label).
    { k: 'party',    t: 'Birthdays & parties',  s: 'toppers, cakes, decor, entertainment', terms: ['party', 'birthday', 'cake', 'balloon'], bg: '#F9E4C8', fg: '#9A4A00', ico: 'cake' },
    { k: 'wedding',  t: 'Weddings & showers',   s: 'dresses, videography, favors',        terms: ['wedding', 'bridal', 'engagement', 'baby shower', 'bridal shower', 'gown'], bg: '#E6DBFD', fg: '#4B00B5', ico: 'ring' },
    { k: 'gifts',    t: 'Holiday gifts',        s: 'handmade, custom, made to order',     cat: 'handcrafted', bg: '#F7D3E0', fg: '#9B1C4B', ico: 'gift' },
    { k: 'home',     t: 'Home refresh',         s: 'painting, cleaning, decorating',      cat: 'home',        bg: '#D3EBDB', fg: '#1E6B3A', ico: 'house' },
    { k: 'school',   t: 'Back to school',       s: 'tutoring, lessons, childcare',        cat: 'children',    bg: '#D0E0FA', fg: '#1E4B9B', ico: 'cap' },
    { k: 'business', t: 'Starting a business',  s: 'plans, websites, bookkeeping',        cat: 'business',    bg: '#DDDAEC', fg: '#4A4761', ico: 'briefcase' }
  ];
  // "See everything new" in the band is the same kind of shortcut: it gets the
  // same bar, Clear button and Back-gesture behavior as the occasion tiles.
  var NEW_SHORTCUT = { k: 'new', t: 'New this week', toggle: 'new', bg: '#CFECDC', fg: '#11744A', ico: 'bolt' };
  function occByKey(k) {
    if (k === NEW_SHORTCUT.k) return NEW_SHORTCUT;
    for (var i = 0; i < OCCASIONS.length; i++) if (OCCASIONS[i].k === k) return OCCASIONS[i];
    return null;
  }
  var OCC_SVG = {
    cake: '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M86.4 5.5L61.8 47.5C58 53.9 56 61.2 56 68.7c0 25 20.3 45.3 45.3 45.3H112c25 0 45.3-20.3 45.3-45.3c0-7.5-2-14.8-5.8-21.2L126.9 5.5C124.5 2.1 120.6 0 116.5 0S108.5 2.1 106.1 5.5L86.4 5.5zM224 0c-2.4 0-4.8 .7-6.9 2l-19.7 41.5C193.6 50 192 57.7 192 65.5c0 25 20.3 45.3 45.3 45.3H240c25 0 45.3-20.3 45.3-45.3c0-7.8-1.6-15.5-5.4-22L260.9 2c-2.1-1.3-4.5-2-6.9-2H224zM331.5 5.5L306.9 47.5c-3.8 6.4-5.8 13.7-5.8 21.2c0 25 20.3 45.3 45.3 45.3H352c25 0 45.3-20.3 45.3-45.3c0-7.5-2-14.8-5.8-21.2L366.9 5.5C364.5 2.1 360.6 0 356.5 0s-8 2.1-10.4 5.5zM96 144c0-8.8-7.2-16-16-16s-16 7.2-16 16v48c-35.3 0-64 28.7-64 64v64c0 8.8 7.2 16 16 16s16-7.2 16-16V256c0-17.7 14.3-32 32-32H384c17.7 0 32 14.3 32 32v64c0 8.8 7.2 16 16 16s16-7.2 16-16V256c0-35.3-28.7-64-64-64V144c0-8.8-7.2-16-16-16s-16 7.2-16 16v48H240V144c0-8.8-7.2-16-16-16s-16 7.2-16 16v48H96V144zM0 400c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V352H0v48z"/></svg>',
    ring: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M64 208c0 31.6 12.5 60.3 32.8 81.4c-3.7-10.6-5.8-22.1-5.8-34c0-53 43-96 96-96h48v-32H128C92.7 127.4 64 165.1 64 208zM256 96c-70.7 0-128 57.3-128 128s57.3 128 128 128s128-57.3 128-128S326.7 96 256 96zm0 208c-44.2 0-80-35.8-80-80s35.8-80 80-80s80 35.8 80 80s-35.8 80-80 80zm128-96h-48v32h48c53 0 96 43 96 96c0 11.9-2.1 23.4-5.8 34c20.3-21.1 32.8-49.8 32.8-81.4c0-42.9-28.7-80.6-64-80.6z"/></svg>',
    gift: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M190.5 68.8L225.3 128H224 152c-22.1 0-40-17.9-40-40s17.9-40 40-40h2.2c14.9 0 28.8 7.9 36.3 20.8zM64 88c0 14.4 3.5 28 9.6 40H32c-17.7 0-32 14.3-32 32v64c0 17.7 14.3 32 32 32H480c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32H438.4c6.1-12 9.6-25.6 9.6-40c0-48.6-39.4-88-88-88h-2.2c-31.9 0-61.5 16.9-77.7 44.4L256 85.5l-24.1-41C215.7 16.9 186.1 0 154.2 0H152C103.4 0 64 39.4 64 88zm288 0c0 22.1-17.9 40-40 40H288h-1.3l34.8-59.2C329.1 55.9 342.9 48 357.8 48H360c22.1 0 40 17.9 40 40zM32 288V464c0 26.5 21.5 48 48 48H224V288H32zM288 512H432c26.5 0 48-21.5 48-48V288H288V512z"/></svg>',
    house: '<svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M575.8 255.5c0 18-15 32.1-32 32.1h-32l.7 160.2c0 2.7-.2 5.4-.5 8.1V472c0 22.1-17.9 40-40 40H456c-1.1 0-2.2 0-3.3-.1c-1.4 .1-2.8 .1-4.2 .1H416 392c-22.1 0-40-17.9-40-40V448 384c0-17.7-14.3-32-32-32H256c-17.7 0-32 14.3-32 32v64 24c0 22.1-17.9 40-40 40H160 128.1c-1.5 0-3-.1-4.5-.2c-1.2 .1-2.4 .2-3.6 .2H104c-22.1 0-40-17.9-40-40V360c0-.9 0-1.9 .1-2.8V287.6H32c-18 0-32-14-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 12 15 11 24z"/></svg>',
    cap: '<svg viewBox="0 0 640 512" aria-hidden="true"><path fill="currentColor" d="M320 32c-8.1 0-16.1 1.4-23.7 4.1L15.8 137.4C6.3 140.9 0 149.9 0 160s6.3 19.1 15.8 22.6l57.9 20.9C57.3 229.3 48 259.8 48 291.9v28.1c0 28.4-10.8 57.7-22.3 80.8c-6.5 13-13.9 25.8-22.5 37.6C0 442.7-.9 448.3 .9 453.4s6 8.9 11.2 10.2l64 16c4.2 1.1 8.7 .3 12.4-2s6.3-6.1 7.1-10.4c8.6-42.8 4.3-81.2-2.1-108.7C90.3 344.3 86 329.8 80 316.5V291.9c0-30.2 10.2-58.7 27.9-81.5c12.9-15.5 29.6-28 49.2-35.7l157-61.7c8.2-3.2 17.5 .8 20.7 9s-.8 17.5-9 20.7l-157 61.7c-12.4 4.9-23.3 12.4-32.2 21.6l159.6 57.6c7.6 2.7 15.6 4.1 23.7 4.1s16.1-1.4 23.7-4.1L624.2 182.6c9.5-3.4 15.8-12.5 15.8-22.6s-6.3-19.1-15.8-22.6L343.7 36.1C336.1 33.4 328.1 32 320 32zM128 408c0 35.3 86 72 192 72s192-36.7 192-72L496.7 262.6 354.5 314c-11.1 4-22.8 6-34.5 6s-23.5-2-34.5-6L143.3 262.6 128 408z"/></svg>',
    briefcase: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M184 48H328c4.4 0 8 3.6 8 8V96H176V56c0-4.4 3.6-8 8-8zm-56 8V96H64C28.7 96 0 124.7 0 160v96H192 320 512V160c0-35.3-28.7-64-64-64H384V56c0-30.9-25.1-56-56-56H184c-30.9 0-56 25.1-56 56zM512 288H320v32c0 17.7-14.3 32-32 32H224c-17.7 0-32-14.3-32-32V288H0V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V288z"/></svg>'
  };
  var _startEl = null;
  function isDefaultView() {
    return !searchTerm.trim() && !(_occ && _occ.terms) && activeCategory === 'all' && !activeSubcats.length &&
      !showNewOnly && !showFoundingOnly && !showVerifiedOnly;
  }
  // ── occasion bar + way back (F 2026-09-18: "allow people to clear the
  // occasion search on phones and go back to the main market page") ──────
  // Tapping a tile scrolled the shopper past the search box, and nothing near
  // the results said what was applied or how to undo it (search terms never get
  // an applied-filter chip, the search island has no clear button, the "All"
  // chip only resets category, and the phone's Back gesture LEFT the Market).
  // Now: (1) a bar right above the results names the shortcut in the tile's
  // own colors with a 44px Clear button (applied filters shown where the
  // results are, with a direct way to remove them); (2) the tap adds a history
  // entry, so Back returns to the main Market instead of leaving it. The tiles
  // only exist on the default view, so "undo the shortcut" and "back to the
  // main Market" are the same state: every filter off, neighborhood and sort
  // kept. History entries carry { lkMarket: 'base' | 'occ' | 'cleared' }.
  var _occ = null;               // the active shortcut (null = none)
  var _occPushedHere = false;    // THIS document pushed the 'occ' entry (history.back() stays same-document)
  var _occClearViaBack = false;  // Clear button asked for history.back()
  var _occBarEl = null;
  var _occAbandoned = false;    // the shortcut was undone by another control while on the 'occ' entry this document pushed
  var _vendorsReady = false;    // first vendor load rendered (popstate before that only adjusts state)
  var _refSynced = false;       // init's syncFilterUI ran (the location map exists)
  function occMatches(o) {
    if (!o) return false;
    if (o.terms) return true;          // its own filter; typing in the search box narrows it
    if (o.q) return searchTerm.trim().toLowerCase() === o.q;
    if (o.cat) return activeCategory === o.cat;
    if (o.toggle === 'new') return showNewOnly === true;
    return false;
  }
  function occSetFilters(o) {           // state only — the caller renders
    if (o.q) searchTerm = o.q;
    else if (o.cat) { if (o.cat !== activeCategory) { activeSubcats = []; _rawRestoredSubcats = null; } activeCategory = o.cat; }
    else if (o.toggle === 'new') showNewOnly = true;
  }
  function clearFiltersToMarket() {    // state only: the default view, neighborhood + sort kept
    _occ = null;
    searchTerm = ''; activeCategory = 'all'; activeSubcats = []; _rawRestoredSubcats = null;
    showNewOnly = false; showFoundingOnly = false; showVerifiedOnly = false;
  }
  function occHistoryState() { var st = null; try { st = window.history.state; } catch (e) {} return st && typeof st === 'object' ? st : null; }
  function occMarkEntry(mark, key) {
    try {
      var st = occHistoryState(), next = {};
      if (st) for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k)) next[k] = st[k];
      next.lkMarket = mark;
      if (key) next.occ = key; else delete next.occ;
      window.history.replaceState(next, '');
    } catch (e) {}
  }
  function prefersReducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  // Desktop pins the site header (lokali-sticky-nav.js, >=992px), so a plain
  // scrollIntoView parks the target UNDER it; phones leave the header alone.
  function headerOffset() {
    var h = document.querySelector('.header-wrapper.w-nav');
    var desk = false; try { desk = window.matchMedia('(min-width: 992px)').matches; } catch (e) {}
    return (desk && h ? h.getBoundingClientRect().height : 0) + 12;
  }
  function scrollToNode(node, smooth) {
    if (!node) return;
    var y = node.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0) - headerOffset();
    y = Math.max(0, Math.round(y));
    try { window.scrollTo({ top: y, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' }); }
    catch (e) { window.scrollTo(0, y); }
  }
  function focusQuietly(node) { if (!node || !node.focus) return; try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); } }
  function applyOccasion(o, fromHistory) {
    if (!o) return;
    if (!fromHistory) {
      try { if (typeof window.gtag === 'function') window.gtag('event', 'market_occasion', { occasion: o.t }); } catch (e) {}
      // #110 category engagement: category tiles still count as a category view.
      try { if (o.cat && typeof window.gtag === 'function') window.gtag('event', 'market_filter', { category: o.cat }); } catch (e) {}
    }
    _occ = o;
    _occAbandoned = false;
    occSetFilters(o);
    syncFilterUI();   // sidebar category, toggles, search box (shadow DOM), subcat row
    applyFilters();   // grid + bar + band + persisted state
    if (!fromHistory) {
      // The tile tap reads as "going to a results page", so give it an entry:
      // the current one is marked as the way back, the new one names the shortcut.
      // Already on a shortcut entry (one left by hand, or restored after a
      // reload)? Reuse it: the entry behind it is the main Market already, and
      // stacking another one would leave a Back press that does nothing.
      try {
        var hsA = occHistoryState();
        if (hsA && (hsA.lkMarket === 'occ' || hsA.lkMarket === 'cleared')) occMarkEntry('occ', o.k);
        else { occMarkEntry('base'); window.history.pushState({ lkMarket: 'occ', occ: o.k }, ''); _occPushedHere = true; }
      } catch (e) {}
    }
    scrollToNode(_occBarEl, !fromHistory);
    focusQuietly(_occBarEl);
  }
  // Back to the main Market. method: 'button' | 'back'. `defer` = we are inside
  // a popstate, where the browser may still apply the entry's saved scroll
  // position; land after it so the tiles are what the shopper sees.
  function returnToMarket(method, smooth, defer) {
    var prev = _occ;
    _occAbandoned = false;
    clearFiltersToMarket();
    syncFilterUI();
    applyFilters();
    try { if (prev && typeof window.gtag === 'function') window.gtag('event', 'market_occasion_clear', { occasion: prev.t, method: method }); } catch (e) {}
    var land = function () {
      var shown = _startEl && _startEl.classList.contains('show');
      scrollToNode(shown ? _startEl : _grid, smooth);
      // The tapped tile (or the New link); the first tile if that section is gone.
      if (shown && prev) focusQuietly(_startEl.querySelector('[data-occ="' + prev.k + '"]') || _startEl.querySelector('.lk-st-tile'));
    };
    if (defer) setTimeout(function () { (window.requestAnimationFrame || setTimeout)(land); }, 0);
    else land();
  }
  function clearOccasion() {
    if (_occClearViaBack) return;   // a Clear-driven Back is in flight; a second back() would leave the Market
    var st = occHistoryState();
    // Same-document back: pops the entry the tile pushed, so the stack stays
    // clean and the Back gesture afterwards leaves the Market as expected.
    if (_occPushedHere && st && st.lkMarket === 'occ') {
      _occClearViaBack = true;
      window.history.back();
      // Safety net: if no popstate arrives, clear in place (and mark the entry
      // only if the Back really did not happen, so the 'base' entry keeps its mark).
      setTimeout(function () {
        if (!_occClearViaBack) return;
        _occClearViaBack = false;
        var cur = occHistoryState();
        returnToMarket('button', true, false);
        if (cur && cur.lkMarket === 'occ') occMarkEntry('cleared');
      }, 1000);
      return;
    }
    // This page was loaded AT the shortcut entry (a reload, or Back from a
    // storefront that missed the page cache). Clear in place for instant
    // feedback, mark the entry so Forward never re-applies it, then step back
    // over it: the entry behind a shortcut entry is always the main Market.
    returnToMarket('button', true, false);
    if (st && st.lkMarket === 'occ') {
      occMarkEntry('cleared');
      try { window.history.back(); } catch (e) {}
    }
  }
  function onMarketPopState(e) {
    var st = e && e.state;
    if (!st || typeof st !== 'object' || !st.lkMarket) return;   // not ours
    var viaButton = _occClearViaBack;
    _occClearViaBack = false;
    if (!_vendorsReady) {
      // Still loading: adjust state only. The first vendor render paints it,
      // and syncFilterUI waits for the location map so the neighborhood survives.
      if (st.lkMarket === 'base') clearFiltersToMarket();
      else if (st.lkMarket === 'occ') { var o0 = occByKey(st.occ); if (o0) { clearFiltersToMarket(); _occ = o0; occSetFilters(o0); } }
      if (_refSynced) syncFilterUI();
      persistState();
      return;
    }
    if (st.lkMarket === 'base') {
      if (!isDefaultView() || _occ) returnToMarket(viaButton ? 'button' : 'back', viaButton, true);
      // The shopper already undid the shortcut by hand, so this entry shows the
      // same main Market: keep going, one Back gesture should leave.
      else if (_occAbandoned && !viaButton) { _occAbandoned = false; try { window.history.back(); } catch (err) {} }
    } else if (st.lkMarket === 'occ') {
      var o = occByKey(st.occ);
      if (o) { clearFiltersToMarket(); applyOccasion(o, true); }
    }
  }
  // Cross-document arrivals (the page was discarded between entries, e.g. a
  // reload at the shortcut entry and then Back): the remembered sessionStorage
  // view would otherwise re-show the shortcut the shopper just backed out of.
  // Only BACK/FORWARD arrivals are reconciled; a reload or a link keeps the
  // remembered view exactly as before this feature.
  function reconcileHistoryOnLoad() {
    var st = occHistoryState();
    if (!st || !st.lkMarket) return;
    var nav = '';
    try { var ne = window.performance && window.performance.getEntriesByType ? window.performance.getEntriesByType('navigation') : null; nav = (ne && ne[0] && ne[0].type) || ''; } catch (e) {}
    if (nav !== 'back_forward') return;
    if (st.lkMarket === 'base' && _occ) clearFiltersToMarket();
    // A remembered view that already carries this shortcut (plus any extra
    // filters the shopper added) is authoritative; only re-apply it when the
    // session no longer has it (Forward after backing out, with a reload).
    else if (st.lkMarket === 'occ' && !(_occ && _occ.k === st.occ)) { var o = occByKey(st.occ); if (o) { clearFiltersToMarket(); _occ = o; occSetFilters(o); } }
  }
  var XMARK_SVG = '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>';
  function renderOccasionBar(count) {
    if (!_grid || !_grid.parentNode) return;
    if (!_occBarEl) {
      _occBarEl = ce('div'); _occBarEl.id = 'lk-occ-bar';
      _occBarEl.setAttribute('tabindex', '-1');
      _occBarEl.setAttribute('role', 'region');
      if (_startEl && _startEl.parentNode) _startEl.parentNode.insertBefore(_occBarEl, _startEl.nextSibling);
      else _grid.parentNode.insertBefore(_occBarEl, el('browse-loading') || _grid);
    }
    if (!_occ) { _occBarEl.classList.remove('show'); _occBarEl.innerHTML = ''; return; }
    var o = _occ;
    _occBarEl.innerHTML = '';
    _occBarEl.style.background = o.bg;
    _occBarEl.setAttribute('aria-label', o.t);
    var ic = ce('span', 'lk-occ-ico'); ic.style.color = o.fg; ic.innerHTML = OCC_SVG[o.ico] || SIG_SVG[o.ico] || ''; // static markup only
    _occBarEl.appendChild(ic);
    var tx = ce('div', 'lk-occ-txt');
    var t = ce('span', 'lk-occ-t'); t.textContent = o.t; tx.appendChild(t);
    var n = ce('span', 'lk-occ-n'); n.textContent = count === 1 ? '1 vendor' : (count + ' vendors'); tx.appendChild(n);
    _occBarEl.appendChild(tx);
    var b = ce('button', 'lk-occ-clear'); b.type = 'button';
    b.setAttribute('aria-label', 'Clear ' + o.t + ' and show the whole Market');
    var bx = ce('span', 'lk-occ-x'); bx.innerHTML = XMARK_SVG; b.appendChild(bx);
    b.appendChild(document.createTextNode('Clear'));
    b.addEventListener('click', clearOccasion);
    _occBarEl.appendChild(b);
    _occBarEl.classList.add('show');
  }
  function miniCard(v, kind, text) {
    var a = ce('a', 'lk-st-mini'); a.href = vProfileHref(v);
    a.appendChild(buildAvatar(v));
    var txt = ce('div', 'lk-st-mini-txt');
    var n = ce('span', 'lk-st-mini-n'); n.textContent = vName(v); txt.appendChild(n);
    var c = ce('span', 'lk-st-mini-c'); c.textContent = vCategoryStyle(v).label || ''; txt.appendChild(c);
    var s = ce('span', 'lk-st-mini-s ' + kind);
    var i = ce('span', 'sig-ico'); i.innerHTML = SIG_SVG[kind === 'saved' ? 'heart' : 'bolt']; s.appendChild(i);
    s.appendChild(document.createTextNode(text)); txt.appendChild(s);
    a.appendChild(txt);
    return a;
  }
  function stSection(title, sub, linkText, onLink) {
    var sec = ce('section', 'lk-st-sec');
    var head = ce('div', 'lk-st-head');
    var h = ce('h2', 'lk-st-h'); h.textContent = title; head.appendChild(h);
    if (linkText) {
      var b = ce('button', 'lk-st-link'); b.type = 'button'; b.textContent = linkText;
      b.addEventListener('click', onLink); head.appendChild(b);
    } else if (sub) { var sp = ce('span', 'lk-st-sub'); sp.textContent = sub; head.appendChild(sp); }
    sec.appendChild(head);
    return sec;
  }
  function renderStartHere() {
    if (!_grid || !_grid.parentNode) return;
    if (!_startEl) {
      _startEl = ce('div'); _startEl.id = 'lk-start';
      var anchor = _occBarEl || el('browse-loading') || _grid;
      _grid.parentNode.insertBefore(_startEl, anchor);
    }
    if (!isDefaultView() || !_allVendors.length) { _startEl.classList.remove('show'); return; }
    _startEl.innerHTML = '';
    // 1. occasions
    var occ = stSection("What's the occasion?", 'Shortcuts across categories', null, null);
    var tiles = ce('div', 'lk-st-tiles');
    OCCASIONS.forEach(function (o) {
      var t = ce('button', 'lk-st-tile'); t.type = 'button'; t.setAttribute('data-occ', o.k);
      t.style.background = o.bg; t.style.color = o.fg;
      var ic = ce('span', 'lk-st-tile-ico'); ic.innerHTML = OCC_SVG[o.ico] || ''; ic.style.color = o.fg; t.appendChild(ic);
      var tt = ce('span', 'lk-st-tile-t'); tt.textContent = o.t; t.appendChild(tt);
      var ts = ce('span', 'lk-st-tile-s'); ts.textContent = o.s; t.appendChild(ts);
      t.addEventListener('click', function () { applyOccasion(o); });
      tiles.appendChild(t);
    });
    occ.appendChild(tiles); _startEl.appendChild(occ);
    // 2. new this week (respects the neighborhood pick)
    var locId = activeLocationId === 'all' ? null : String(activeLocationId);
    var fresh = _allVendors.filter(function (v) {
      return vIsNew(v) && (locId == null || vLocationIds(v).map(String).indexOf(locId) !== -1);
    }).sort(function (a, b) { return vCreated(b) - vCreated(a); });
    if (fresh.length) {
      var nw = stSection('New this week', null, 'See everything new →', function () { applyOccasion(NEW_SHORTCUT); });
      var nwLink = nw.querySelector('.lk-st-link'); if (nwLink) nwLink.setAttribute('data-occ', NEW_SHORTCUT.k);
      var row = ce('div', 'lk-st-row');
      fresh.slice(0, 4).forEach(function (v) { row.appendChild(miniCard(v, 'new', 'Just opened')); });
      nw.appendChild(row); _startEl.appendChild(nw);
    }
    // 3. neighbors' picks (saves floor is server-side; zero rows = no section)
    var picks = _allVendors.filter(function (v) { var t = vTrust(v); return t && Number(t.saves) >= 3; })
      .sort(function (a, b) { return Number(vTrust(b).saves) - Number(vTrust(a).saves); });
    if (picks.length) {
      var pk = stSection("Neighbors' picks", 'Most saved storefronts', null, null);
      var prow = ce('div', 'lk-st-row');
      picks.slice(0, 4).forEach(function (v) {
        var n = Number(vTrust(v).saves);
        prow.appendChild(miniCard(v, 'saved', 'Saved by ' + n + ' neighbors'));
      });
      pk.appendChild(prow); _startEl.appendChild(pk);
    }
    _startEl.classList.add('show');
  }

  // ── filter/sort memory (sessionStorage) ──
  function persistState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        c: activeCategory, l: activeLocationId, s: activeSort,
        // Persist the RAW restored list while it's still authoritative — else
        // an interim baked-only sanitize would permanently drop a DB-only pick.
        sc: _rawRestoredSubcats || activeSubcats,
        n: showNewOnly, f: showFoundingOnly, v: showVerifiedOnly, q: searchTerm,
        o: _occ ? _occ.k : null
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
    _occ = s.o ? occByKey(s.o) : null; // validated against the filters on the first render
    // Sessions saved by v1.4.450 kept the tile's single word in the search box
    // ('party' / 'wedding'); the word list now carries it, so drop the echo.
    if (_occ && _occ.terms && searchTerm && _occ.terms.indexOf(searchTerm.trim().toLowerCase()) !== -1) searchTerm = '';
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
  // #179: the header's search fields (lokali-mobile-nav.js: phone row 2, inline
  // field >=1380px) drive this page live too. They carry data-lk-market-search
  // (not the id, which must stay unique) and every box mirrors the term.
  function allSearchInputs() {
    var out = [].slice.call(document.querySelectorAll('input[data-lk-market-search]'));
    var main = findSearchInput(); if (main) out.push(main);
    return out;
  }
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
    allSearchInputs().forEach(function (b) { if (b.value !== searchTerm) b.value = searchTerm; });
    if (search) return;
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
    // Default = "Featured first" (F 2026-09-02): exactly the pricing-page
    // promise - Featured > Pro > Free via rank()'s dominant tier band - with
    // spotlight/founding/verified only breaking ties INSIDE a tier, then
    // newest arrival. A search phrase hit still outranks everything.
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
    return !searchTerm && !(_occ && _occ.terms) && !showNewOnly && !showFoundingOnly && !showVerifiedOnly;
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
      var img = ce('img', 'vcard-avatar-img'); imgSet(img, photo, 240); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; // below-the-fold avatars were the Market's only eager images (12 on 09-19)
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
      var cimg = ce('img', 'vcard-cover-img'); imgSet(cimg, covUrl, 640); cimg.alt = ''; cimg.loading = 'lazy';
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
    // ONE identity pill (F 2026-09-16 pill budget): Verified beats New.
    if (vIsVerified(v))  nameRow.appendChild(nameChip('chip-verified', '✓ Verified', null, null, 'Verified'));
    else if (vIsNew(v))  nameRow.appendChild(nameChip('chip-new', 'New', ICON_BULLHORN, '#11744A', 'New this week'));
    // Away mode (2026-09-17): a quiet dated chip, no greying, no ranking change.
    if (vAwayLabel(v))   nameRow.appendChild(nameChip('chip-away', 'Back ' + vAwayLabel(v), null, '#B8471B', 'Away until ' + vAwayLabel(v)));
    if (vIsSpotlight(v)) nameRow.appendChild(nameChip('chip-spotlight', '✦ Spotlight', null, null, 'Spotlight'));
    body.appendChild(nameRow);
    // ── #162d "by {first name}": people hire people. Renders only when the
    // vendor filled the Meet-the-Vendor name (owner_name, anon-granted since
    // #76); first token only, so "Maria Elena Ruiz" reads as "by Maria".
    var ownerFirst = String(v.owner_name || '').trim().split(/\s+/)[0] || '';
    if (ownerFirst) {
      var by = ce('div', 'vcard-by');
      by.appendChild(document.createTextNode('by '));
      var bn = ce('b'); bn.textContent = ownerFirst; by.appendChild(bn);
      body.appendChild(by);
    }

    // ── #96 offerings line — need-first: shoppers search for a service, not a
    // business, so this is the strongest text after the name. When the current
    // search matched a subcategory label, promote it to the front and highlight
    // it so the visitor sees WHY the card is in the results.
    var subLabels = vSubcatLabels(v);
    if (subLabels.length) {
      var q = searchTerm.toLowerCase().trim();
      var matchIdx = -1;
      // A typed search explains the card; with none, the occasion's words do
      // (Bakeamania under Birthdays & parties highlights "Home-based baker").
      var qList = q ? [q] : ((_occ && _occ.terms) ? _occ.terms : []);
      for (var qi = 0; qi < qList.length && matchIdx === -1; qi++) {
        var qq = qList[qi];
        // #151: phrase hit preferred, else any token hit (same tolerance as the filter).
        var qt = searchTokens(qq);
        for (var ni = 0; ni < subLabels.length && matchIdx === -1; ni++) {
          if (subLabels[ni].toLowerCase().indexOf(qq) !== -1) matchIdx = ni;
        }
        // #151 step 2: a keyword hit ("cpa" → Bookkeeping) promotes and
        // highlights that pill too, so the synonym explains the result.
        var subKw = vSubcats(v).filter(function (s) { return !!SUBCAT_BY_SLUG[s]; })
          .map(function (s) { return (SUBCAT_BY_SLUG[s].keywords || []).join('\n').toLowerCase(); });
        for (ni = 0; ni < subLabels.length && matchIdx === -1; ni++) {
          var lab = subLabels[ni].toLowerCase() + '\n' + (subKw[ni] || '');
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

    // ── trust + fulfilment pills (2026-09-17): one of each, earned only.
    var sig = signalRow(v); if (sig) body.appendChild(sig);

    var tag = ce('div', 'vcard-tagline'); tag.textContent = cardHook(v); body.appendChild(tag);

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

  function updateCounts(n) {
    setCount(el('browse-result-count'), n);
    setCount(el('browse-grid-count'), n);
  }
  // The noun ("vendors found" / "Showing N vendors") is Webflow-baked static
  // text in the text node right after each <strong>; agree it with the number
  // so a single hit reads "1 vendor found", not "1 vendors found". Only the
  // adjacent text node is touched and only the word itself is swapped, so the
  // baked whitespace and wording survive. The "…"/0 empty-state paths leave the
  // plural alone on purpose.
  function setCount(node, n) {
    if (!node) return;
    setText(node, String(n));
    var sib = node.nextSibling;
    if (!sib || sib.nodeType !== 3) return;
    var word = (n === 1) ? 'vendor' : 'vendors';
    var txt = sib.nodeValue.replace(/\bvendors?\b/, word);
    if (txt !== sib.nodeValue) sib.nodeValue = txt;
  }

  // ── active filter chips ──
  function updateActiveFilters() {
    var strip = el('browse-active-filters');
    if (!strip) return;
    strip.innerHTML = '';
    if (activeLocationId !== 'all' && _locationsById[activeLocationId]) addChip(strip, _locationsById[activeLocationId].name, function () { setLocation('all'); });
    var occOwnsCat = !!(_occ && _occ.cat && _occ.cat === activeCategory);
    var occOwnsNew = !!(_occ && _occ.toggle === 'new');
    if (activeCategory !== 'all' && !occOwnsCat) { var c = CAT_BY_ID[SLUG_TO_ID[activeCategory]]; addChip(strip, c ? c.label : activeCategory, function () { setCategory('all'); }); }
    activeSubcats.forEach(function (sl) { // #96
      var sc = SUBCAT_BY_SLUG[sl];
      addChip(strip, sc ? sc.label : sl, function () { toggleSubcat(sl); });
    });
    if (showNewOnly && !occOwnsNew) addChip(strip, 'New this week', function () { setToggle('new', false); });
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
    btn.classList.toggle('has-filters', activeCategory !== 'all' || activeSubcats.length > 0 || showNewOnly || showFoundingOnly || showVerifiedOnly || activeLocationId !== 'all' || !!searchTerm || !!(_occ && _occ.terms));
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

  // #179 (F 2026-09-18): the neighborhood picker leaves the hero. <=991px it
  // leads the Filter row (location is the first thing a local shopper sets, so
  // it stays visible instead of hiding in the drawer); >=992px it is the first
  // control of the sidebar. The <select> node itself moves, so its change
  // listener and the Webflow-filled options ride along. Sits BESIDE
  // #browse-filter-panel, never inside: renderFilterPanel() wipes that mount.
  function placeHoodPicker(loc) {
    if (!loc) return;
    var row = el('browse-mobile-sort'), panel = el('browse-filter-panel');
    if (row && row.tagName === 'SELECT') row = row.parentNode;
    var side = null;
    if (panel && panel.parentNode) {
      side = ce('div'); side.id = 'lk-hood-side';
      var lab = ce('div', 'lk-filter-label'); lab.textContent = 'Neighborhood';
      side.appendChild(lab);
      panel.parentNode.insertBefore(side, panel);
    }
    loc.setAttribute('aria-label', 'Neighborhood');
    var fbtn = el('browse-mobile-filter-btn');
    var ftxt = fbtn ? fbtn.querySelector('div:not([class*=image]),span') : null;
    var ftxt0 = ftxt ? ftxt.textContent : '';
    var wide = window.matchMedia('(min-width: 992px)'), phone = window.matchMedia('(max-width: 767px)');
    function place() {
      if (wide.matches && side) { if (loc.parentNode !== side) side.appendChild(loc); }
      else if (row) { if (loc.parentNode !== row) row.insertBefore(loc, row.firstChild); }
      // Phones fit two controls in the row: Sort lives in the drawer (it always
      // has), so the button says what it opens.
      if (ftxt) ftxt.textContent = phone.matches ? 'Filter & sort' : ftxt0;
    }
    place();
    [wide, phone].forEach(function (m) { if (m.addEventListener) m.addEventListener('change', place); else if (m.addListener) m.addListener(place); });
    document.documentElement.classList.add('lk-hood-moved');
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
      // Demand signals (2026-09-17): the settled term + active filters + what it
      // matched, counted anonymously (log_market_search bounds and floors it;
      // vendors read the aggregate on Analytics). Best-effort, never awaited.
      try {
        var S = window.LokaliSupabaseAPI;
        if (S && S.marketing && typeof S.marketing.logSearch === 'function') {
          var catId = activeCategory === 'all' ? null : (SLUG_TO_ID[activeCategory] || null);
          var locId = activeLocationId === 'all' ? null : activeLocationId;
          S.marketing.logSearch(term, catId, locId, _lastVisibleIds.length, _lastVisibleIds.slice(0, 50)).catch(function () {});
        }
        var L = window.LokaliAPI && window.LokaliAPI.leads;
        if (L && typeof L.trackVisit === 'function') L.trackVisit('search', { term: term, results: _lastVisibleIds.length, vendorIds: _lastVisibleIds.slice(0, 24) });
      } catch (e) {}
    }, 800);
    document.addEventListener('input', function (e) {
      var t = (e.composedPath && e.composedPath()[0]) || e.target;
      if (!t || (t.id !== 'browse-search' && !(t.hasAttribute && t.hasAttribute('data-lk-market-search')))) return;
      searchTerm = t.value || '';
      allSearchInputs().forEach(function (b) { if (b !== t && b.value !== searchTerm) b.value = searchTerm; });
      applySearch();
      gaSearch();
    }, true);
    var loc = locSelectEl();
    if (loc) loc.addEventListener('change', function () { setLocation(loc.value); });
    placeHoodPicker(loc);
    var msel = sortSelectEl(); if (msel) msel.addEventListener('change', function () { setSort(msel.value); });
    // F 2026-09-02: "Sort" moves OUT of the dropdown - the Webflow options are
    // authored as "Sort: Newest" etc.; strip the prefix so the control reads
    // just the value, and put a quiet external "Sort by" label before it
    // (kept as the accessible name too).
    if (msel) {
      for (var oi = 0; oi < msel.options.length; oi++) {
        msel.options[oi].textContent = msel.options[oi].textContent
          .replace(/^\s*Sort:\s*/i, '')
          // "Best Match" is meaningless without a query (F 2026-09-02); the
          // default is the tier-first curated order = "Recommended".
          // F 2026-09-02: the default sort IS the pricing-page promise
          // (Featured "Top of search results" > Pro "Elevated" > Free
          // "Standard"), so it's labeled by the mechanic - "Featured first" -
          // not an editorial "Best Match"/"Recommended".
          .replace(/^(Best\s*Match|Recommended)$/i, 'Featured first');
      }
      msel.setAttribute('aria-label', 'Sort by');
      // Label sits to the LEFT of the dropdown on one line (F): wrap both in a
      // flex group so the surrounding row's own wrapping can't stack them.
      if (!document.getElementById('lk-sort-wrap')) {
        var swrap = ce('div'); swrap.id = 'lk-sort-wrap';
        swrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0;';
        var slab = ce('span'); slab.id = 'lk-sort-label'; slab.textContent = 'Sort by';
        slab.setAttribute('aria-hidden', 'true');
        slab.style.cssText = "flex:0 0 auto;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13.5px;font-weight:600;color:#6E6A85;white-space:nowrap;";
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
        reconcileHistoryOnLoad();   // occasion shortcut: Back/Forward arrivals after the page was discarded
        if (!restored && !deep.location) resolveInitialLocation(); // else saved/URL default
        populateLocationSelect();
        syncFilterUI();
        _refSynced = true;
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
  window.addEventListener('popstate', onMarketPopState);
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
