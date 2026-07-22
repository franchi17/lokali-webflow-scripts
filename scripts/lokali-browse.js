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
 *   (Xano rollback), the listing-name layer silently drops out.
 *
 * Load AFTER lokali-api-client.js. No auth required (public list endpoints).
 *
 * Required mount points in Webflow (plain light-DOM elements, NOT code components):
 *   #browse-search          text input
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
    2: { slug: 'business',    label: 'Business',          bg: '#F0F0F8', text: '#4A4761' },
    3: { slug: 'beauty',      label: 'Beauty',            bg: '#FEF3F2', text: '#C0392B' },
    4: { slug: 'children',    label: 'Children',          bg: '#E6F1FB', text: '#1A5C9A' },
    5: { slug: 'events',      label: 'Events',            bg: '#F3EBFF', text: '#6002EE' },
    6: { slug: 'food',        label: 'Food',              bg: '#FFF3EA', text: '#FF6B00' },
    7: { slug: 'wellness',    label: 'Wellness',          bg: '#EAFAF2', text: '#1D6A45' },
    8: { slug: 'home',        label: 'Home',              bg: '#F7F6FC', text: '#4A4761' }
  };

  // #96 — curated subcategory taxonomy, keyed by category id. Source of truth
  // for labels = the categories-guide "Examples" pills (Francesca-approved
  // 2026-07-20). MIRRORED in lokali-profile-page-embed.js (the vendor picker)
  // — keep the two lists identical. DB stores slugs; unknown slugs are inert.
  var SUBCATS_BY_CAT = {
    1: [ // Handcrafted Goods (Artisans & Makers)
      { slug: 'handmade-jewelry',     label: 'Handmade jewelry' },
      { slug: 'candles-soap',         label: 'Candles & soap' },
      { slug: 'art-prints',           label: 'Art prints & paintings' },
      { slug: 'pottery-ceramics',     label: 'Pottery & ceramics' },
      { slug: 'woodworking',          label: 'Woodworking' },
      { slug: 'custom-embroidery',    label: 'Custom embroidery' },
      { slug: 'floral-arrangements',  label: 'Floral arrangements' },
      { slug: 'sewn-goods',           label: 'Sewn & stitched goods' }
    ],
    2: [ // Business
      { slug: 'bookkeeping',          label: 'Bookkeeping & accounting' },
      { slug: 'marketing',            label: 'Marketing & social media' },
      { slug: 'graphic-design',       label: 'Graphic design' },
      { slug: 'virtual-assistance',   label: 'Virtual assistance' },
      { slug: 'notary',               label: 'Notary services' },
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
    8: [ // Home
      { slug: 'cleaning',             label: 'Cleaning services' },
      { slug: 'landscaping',          label: 'Landscaping & lawn care' },
      { slug: 'handyman',             label: 'Handyman & repairs' },
      { slug: 'painting',             label: 'Painting' },
      { slug: 'pool-maintenance',     label: 'Pool maintenance' },
      { slug: 'interior-decorating',  label: 'Interior decorating' },
      { slug: 'home-organization',    label: 'Home organization' },
      { slug: 'pest-control',         label: 'Pest control' }
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
  // fails or the Supabase surface is absent (Xano rollback). Restored session
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
    { slug: 'events',      label: 'Events',            url: ASSET + '6a18f6d414c76bb968f180db_balloon.svg' },
    { slug: 'food',        label: 'Food',              url: ASSET + '6a186b067365d964abee8918_utensils-solid.png' },
    { slug: 'handcrafted', label: 'Handcrafted Goods', url: ASSET + '6a186b061a80eb9ba75f0d0a_scissors-solid.png' },
    { slug: 'home',        label: 'Home',              url: ASSET + '6a186b06a37dcea6514f15f9_house-regular.png' },
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
  var ICON_EMAIL    = ASSET + '6a1f445d6fda20928afcb0fd_envelope-regular.png';
  var ICON_CALL     = ASSET + '6a21e2bf163c5945a1c0e919_phone-solid.png';
  var ICON_WHATSAPP = ASSET + '6a1f445dfb11386d2e5502cf_whatsapp-brands-solid.png';
  var ICON_TEXT     = ASSET + '6a1f445d06bc9a07f37fb0d9_comments-regular.png';
  var ICON_CROWN    = ASSET + '69f4dbb3533f0ee2046ab0fb_crown-solid.png';     // founding badge (matches sidebar)
  var ICON_BULLHORN = ASSET + '6a1af53c6b8fa6046c223ce9_bullhorn-solid.png';  // new badge (matches sidebar)
  var AREA_GREY     = '#6B6880'; // location text — a touch darker than slate for legibility

  // category slug -> sidebar icon URL (reused on the card pill)
  var SLUG_TO_URL = {};
  CATEGORY_LIST.forEach(function (c) { SLUG_TO_URL[c.slug] = c.url; });

  /* Card + filter-panel CSS — injected once so the script's UI is fully styled. */
  var CSS = [
    // ── card ──
    ".vcard{background:#fff;border:.5px solid #EEEDF6;border-radius:12px;padding:1.1rem 1.15rem 1rem;cursor:pointer;transition:all .15s;position:relative;overflow:hidden;font-family:'Plus Jakarta Sans',sans-serif;}",
    ".vcard:hover{border-color:#D4AAFD;box-shadow:0 4px 16px rgba(96,2,238,.08);transform:translateY(-1px);}",
    ".vcard-spotlight{border-color:rgba(96,2,238,.2);background:linear-gradient(160deg,rgba(96,2,238,.02) 0%,#fff 60%);}",
    ".vcard-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;}",
    ".vcard-avatar{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;flex-shrink:0;border:.5px solid rgba(0,0,0,.06);overflow:hidden;}",
    ".vcard-avatar-initials{background:#F3EBFF;color:#6002EE;letter-spacing:.5px;}",
    ".vcard-avatar-img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".vcard-meta{flex:1;min-width:0;}",
    ".vcard-name-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;}",
    ".vcard-name{font-size:14px;font-weight:600;color:#1A1829;letter-spacing:-.2px;line-height:1.2;}",
    ".vcard-area{font-size:11px;color:#6B6880;display:flex;align-items:center;gap:4px;}",
    // Badges live on their own row under the location (out of the way of the top-right heart),
    // icon-only — a brighter/cleaner tint background with a darker icon on top.
    ".vcard-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;}",
    ".vcard .badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:100px;font-size:12px;line-height:1;flex-shrink:0;font-weight:700;}",
    ".vcard .badge-founding{background:#FBE7A0;color:#9A6B00;border:1px solid rgba(154,107,0,.32);}",
    ".vcard .badge-new{background:#C6F2DB;color:#11744A;border:1px solid rgba(17,116,74,.3);}",
    ".vcard .badge-spotlight{background:#E2D2FF;color:#5A00E0;border:1px solid rgba(90,0,224,.3);}",
    ".vcard .badge-verified{background:#D2DEFF;color:#1730C9;border:1px solid rgba(23,48,201,.3);}",
    // Featured = the paid TIER (always-on). Solid brand violet so the top tier
    // stands out from the light status pills; distinct from the Spotlight rotation.
    ".vcard .badge-featured{background:#FAE4FC;color:#D602EE;border:1px solid rgba(214,2,238,.28);}",
    ".vcard .cat-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;border-radius:100px;padding:3px 10px;margin-bottom:8px;}",
    ".vcard-tagline{font-size:12.5px;color:#4A4761;line-height:1.5;margin-bottom:12px;}",
    // #96 subcategory pills on the card — the vendor's curated specialties, so
    // a visitor can tell the painter from the plumber without opening the
    // profile. `.match` = the pill that made this card a search hit (promoted
    // to front, violet highlight).
    ".vcard-offerings{display:flex;flex-wrap:wrap;gap:4px;margin:-4px 0 12px;}",
    ".vcard .offer-chip{font-size:10.5px;font-weight:500;background:#F7F6FC;border:.5px solid #EEEDF6;color:#6B6880;border-radius:100px;padding:2px 9px;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".vcard .offer-chip.match{background:#F3EBFF;border-color:#D4AAFD;color:#6002EE;font-weight:600;}",
    // #96 sidebar subcategory pills — unfold under the ACTIVE category row
    // (expand-in-place accordion; other categories stay visible/clickable).
    "#browse-filter-panel .lk-subcat-row{display:flex;flex-wrap:wrap;gap:5px;padding:8px 4px 10px 14px;}",
    // text-align:left — <button> defaults to center, which reads as ragged/odd on the
    // labels long enough to wrap in the narrow sidebar ("Bookkeeping & accounting").
    "#browse-filter-panel .subcat-pill{font-family:inherit;-webkit-appearance:none;appearance:none;font-size:11.5px;font-weight:500;background:#fff;border:1px solid #E4E2F0;color:#6B6880;border-radius:100px;padding:4px 11px;cursor:pointer;user-select:none;transition:all .12s;line-height:1.3;text-align:left;}",
    "#browse-filter-panel .subcat-pill:hover{border-color:#6002EE;color:#6002EE;}",
    "#browse-filter-panel .subcat-pill.on{background:#6002EE;border-color:#6002EE;color:#fff;font-weight:600;}",
    ".vcard-actions{display:flex;gap:6px;flex-wrap:wrap;}",
    // Channel-branded contact buttons (colors mirror the vendor listing page).
    ".vcard .contact-btn{font-size:11px;font-weight:500;font-family:inherit;padding:5px 10px;border-radius:6px;border:.5px solid #EEEDF6;background:#F7F6FC;color:#4A4761;cursor:pointer;transition:all .1s;display:inline-flex;align-items:center;gap:4px;}",
    ".vcard .contact-btn:hover{filter:brightness(.96);}",
    ".vcard .contact-btn.cb-email{background:#6002EE;border-color:#6002EE;color:#fff;}",
    ".vcard .contact-btn.cb-call{background:#F0F4FF;border-color:#BDC8F5;color:#1A3099;}",
    ".vcard .contact-btn.cb-text{background:#fff;border-color:#C8C6D8;color:#1A1829;}",
    ".vcard .contact-btn.cb-whatsapp{background:#EDFAF3;border-color:#A8DFC4;color:#1A6640;}",
    // ── filter panel ──
    "#browse-filter-panel{font-family:'Plus Jakarta Sans',sans-serif;}",
    "#browse-filter-panel .lk-filter-section{margin-bottom:1.5rem;}",
    "#browse-filter-panel .lk-filter-section:last-child{margin-bottom:0;}",
    "#browse-filter-panel .lk-filter-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#8E8BA6;margin-bottom:.6rem;}",
    "#browse-filter-panel .filter-item{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:8px;font-size:13px;line-height:1.45;color:#4A4761;cursor:pointer;transition:all .1s;margin-bottom:2px;user-select:none;}",
    "#browse-filter-panel .filter-item:hover{background:#F7F6FC;color:#1A1829;}",
    "#browse-filter-panel .filter-item.active{background:#F3EBFF;color:#6002EE;font-weight:600;}",
    "#browse-filter-panel .fi-left{display:flex;align-items:center;gap:8px;}",
    "#browse-filter-panel .lk-glyph-icon{font-size:13px;font-weight:700;width:16px;text-align:center;display:inline-block;flex-shrink:0;}",
    "#browse-filter-panel .filter-count-pill{font-size:10px;font-weight:600;background:#EEEDF6;color:#8E8BA6;border-radius:100px;padding:1px 7px;min-width:22px;text-align:center;}",
    "#browse-filter-panel .filter-item.active .filter-count-pill{background:rgba(96,2,238,.12);color:#6002EE;}",
    "#browse-filter-panel .lk-divider{height:.5px;background:#EEEDF6;margin:1rem 0;}",
    "#browse-filter-panel .lk-toggle{display:flex;align-items:center;justify-content:space-between;padding:6px 0;cursor:pointer;user-select:none;}",
    "#browse-filter-panel .lk-toggle-label{font-size:13px;line-height:1.45;color:#4A4761;display:flex;align-items:flex-start;gap:6px;}",
    "#browse-filter-panel .lk-tg-ic{font-size:12px;font-weight:700;}",
    "#browse-filter-panel .toggle-switch{width:32px;height:18px;border-radius:100px;background:#C8C6D8;position:relative;transition:background .18s;flex-shrink:0;}",
    "#browse-filter-panel .toggle-switch.on{background:#1D6A45;}",
    "#browse-filter-panel .toggle-switch::after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;top:2px;left:2px;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.18);}",
    "#browse-filter-panel .toggle-switch.on::after{left:16px;}",
    // Mobile: vendor cards were stuck at 2 columns (Webflow grid is `1fr 1fr` with no
    // responsive override) — too cramped on phones. Drop to a single column at ≤767px.
    "@media screen and (max-width:767px){#browse-vendor-grid{grid-template-columns:1fr;}}",
    // Mobile (≤991px): the filter sidebar had no drawer CSS, so it sat inline and clipped
    // the vendor cards. Collapse the [sidebar | content] layout to one column and turn the
    // sidebar into an off-canvas slide-in drawer (the Filter button toggles `.open` via JS).
    "@media screen and (max-width:991px){" +
      ".grid-template-columns{grid-template-columns:1fr!important;}" +
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
  function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }
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
  function vCreated(v) { var c = v.created_at; if (c == null) return 0; return typeof c === 'number' ? c : (Date.parse(c) || 0); }
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
  function vPhotoUrl(v) {
    var p = v.profile_photo;
    if (!p || typeof p !== 'string') return '';
    p = p.trim();
    // Block javascript:/data: schemes, protocol-relative //host, breakout chars.
    if (!p || /[\s"'<>`\\]/.test(p) || /^(?:javascript|data|vbscript):/i.test(p)) return '';
    if (/^https?:\/\//.test(p)) return p;
    if (p.indexOf('//') === 0) return '';
    var base = window.LOKALI_FILE_BASE || 'https://x8ki-letl-twmt.n7.xano.io';
    return base.replace(/\/$/, '') + (p.charAt(0) === '/' ? '' : '/') + p;
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
    if (!Object.keys(_locationsById).length) return; // keep existing options if Xano locations didn't load
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
    var out = { location: false, category: false };
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

    if (out.location || out.category) {
      persistState(); // the deep-linked view becomes the remembered view
      try {
        qs.delete('area'); qs.delete('location_id'); qs.delete('category');
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
    var token = null;
    try { token = localStorage.getItem('LOKALI_AUTH_TOKEN'); } catch (e) {}
    if (!token) return; // signed out — no account to read
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
  // before the Xano connection is warm — e.g. clicking "Back to The Market") resolves
  // with { data:null, error, status:0 }, which would silently render a blank grid
  // showing "0" until the visitor refreshed. So retry a FAILED call a few times before
  // giving up, and only fall through to an empty grid when the request truly succeeds.
  var FETCH_MAX_ATTEMPTS = 5;
  function fetchVendors(attempt) {
    attempt = attempt || 0;
    var loading = el('browse-loading');
    showEl(loading, 'block');
    // Location is filtered client-side (Xano's ?location_id= currently returns nothing), so
    // always load the full active set and let applyFilters() narrow by neighborhood.
    var params = { page: 1, per_page: PER_PAGE };
    // Retry both resolved-errors AND network rejections with backoff: Xano can cold-start
    // for several seconds at launch, and the old code only retried resolved-errors (a thrown
    // fetch fell straight through to a silent "0 vendors" that survived a manual refresh).
    function retryOrGiveUp() {
      if (attempt < FETCH_MAX_ATTEMPTS) {
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(fetchVendors(attempt + 1)); }, 300 * (attempt + 1));
        });
      }
      hideEl(loading);
      if (_emptyState && _renderedCards.length === 0) showEl(_emptyState, 'block');
    }
    return window.LokaliAPI.vendors.list(params).then(function (out) {
      if (out && out.error) return retryOrGiveUp();
      hideEl(loading);
      _allVendors = extractList(out && out.data).filter(function (v) { return v && v.is_active !== false; });
      // #96 — if the payload has no subcategories key (stale cached adapter /
      // Xano rollback), drop any restored picks (INCLUDING the raw restore
      // list — a late taxonomy fetch must not resurrect them) and remove the
      // pill row so the filter can't silently blank the grid.
      if (!subcatDataPresent()) { activeSubcats = []; _rawRestoredSubcats = null; }
      renderSubcatRow();
      updateCategoryCounts();
      applyFilters();
    }, function (err) {
      console.warn('[lokali-browse] vendors fetch rejected (attempt ' + attempt + '):', err);
      return retryOrGiveUp();
    });
  }

  // #96 — load the public listing-name index (active service/product names for
  // every vendor, one paginated query pair). This is the INVISIBLE recall
  // layer of search — nothing renders from it; it just lets "charcuterie
  // board" find the vendor whose product is named that even when no
  // subcategory says so. Non-critical by design: if the Supabase surface is
  // absent (Xano rollback) or the fetch fails, search degrades to
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
      var item = ce('div', 'filter-item' + (c.slug === activeCategory ? ' active' : ''));
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
      var row = ce('div', 'lk-toggle');
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
      var item = ce('div', 'filter-item' + (s.sort === activeSort ? ' active' : ''));
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
  // 7 days of @v1.4 browser cache) or a Xano rollback delivers rows WITHOUT
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
    }
  }

  // ── filter + sort + render cards ──
  function applyFilters() {
    var q = searchTerm.toLowerCase().trim();
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
        if (hay.indexOf(q) === -1) return false;
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
  // Reflect the (restored) state into controls that renderFilterPanel doesn't pre-set.
  function syncFilterUI() {
    if (activeLocationId !== 'all' && !_locationsById[activeLocationId]) activeLocationId = 'all';
    TOGGLE_LIST.forEach(function (t) {
      var on = t.key === 'new' ? showNewOnly : (t.key === 'founding' ? showFoundingOnly : showVerifiedOnly);
      var sw = el(t.id); if (sw) sw.classList.toggle('on', on);
    });
    var search = el('browse-search'); if (search && search.value !== searchTerm) search.value = searchTerm;
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
    else list.sort(function (a, b) { return rank(b) - rank(a) || (vCreated(b) - vCreated(a)); });
  }
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
    if (_emptyState) (list.length === 0 ? showEl(_emptyState, 'block') : hideEl(_emptyState));
  }

  // opts: { title, url+color (masked icon) | glyph (text, colored by CSS) }
  function badge(cls, opts) {
    var b = ce('span', 'badge ' + cls); b.title = opts.title;
    if (opts.url) b.appendChild(maskIcon(opts.url, opts.color, 12));
    else b.textContent = opts.glyph;
    return b;
  }
  function addContact(parent, href, label, iconUrl, cls) {
    if (!href) return;
    var b = ce('button', 'contact-btn' + (cls ? ' ' + cls : '')); b.type = 'button';
    b.appendChild(maskIcon(iconUrl, 'currentColor', 13)); // icon follows button text color (incl. hover)
    b.appendChild(document.createTextNode(label));
    b.addEventListener('click', function (ev) {
      ev.stopPropagation(); ev.preventDefault();
      if (href.indexOf('http') === 0) window.open(href, '_blank'); else window.location.href = href;
    });
    parent.appendChild(b);
  }

  function buildAvatar(v) {
    var avatar = ce('div', 'vcard-avatar');
    var photo = vPhotoUrl(v);
    var fillInitials = function () {
      avatar.className = 'vcard-avatar vcard-avatar-initials';
      avatar.textContent = initials(vName(v));
    };
    if (photo) {
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
    var card = ce('div', 'vcard' + (vIsSpotlight(v) ? ' vcard-spotlight' : ''));
    // Expose the vendor id so lokali-favorites.js can attach a save/heart control
    // without coupling favorites logic into this renderer.
    if (v.id != null) card.dataset.vendorId = v.id;
    var header = ce('div', 'vcard-header');
    var meta = ce('div', 'vcard-meta');
    var nameRow = ce('div', 'vcard-name-row');
    var name = ce('span', 'vcard-name'); name.textContent = vName(v); nameRow.appendChild(name);
    var area = ce('div', 'vcard-area');
    area.appendChild(maskIcon(ICON_PIN, AREA_GREY, 11));
    area.appendChild(document.createTextNode(' ' + vAreaLabel(v)));
    meta.appendChild(nameRow); meta.appendChild(area);
    // Trust/status badges sit on their own row under the location — clear of the top-right
    // heart — as bright filled pills (icon + label) instead of dull pale dots.
    var badges = ce('div', 'vcard-badges');
    // #86 (2026-07-18): ★ Featured badge REMOVED by decision — it mostly
    // signaled "pays more" and clashed with the founding badge. Placement
    // ranking (#75 plan_rank) is untouched; is_featured stays server-synced.
    if (vIsFounding(v))  badges.appendChild(badge('badge-founding',  { url: ICON_CROWN,    color: '#9A6B00', title: 'Founding vendor' }));
    if (vIsNew(v))       badges.appendChild(badge('badge-new',       { url: ICON_BULLHORN, color: '#11744A', title: 'New this week' }));
    if (vIsVerified(v))  badges.appendChild(badge('badge-verified',  { glyph: '✓', title: 'Verified' }));
    if (vIsSpotlight(v)) badges.appendChild(badge('badge-spotlight', { glyph: '✦', title: 'Spotlight' }));
    if (badges.children.length) meta.appendChild(badges);
    header.appendChild(buildAvatar(v)); header.appendChild(meta);
    card.appendChild(header);

    if (style.known) {
      var pill = ce('span', 'cat-pill');
      pill.style.background = style.bg;
      pill.style.color = style.text;
      if (style.url) pill.appendChild(maskIcon(style.url, style.text, 13));
      pill.appendChild(document.createTextNode(' ' + style.label));
      card.appendChild(pill);
    }

    var tag = ce('div', 'vcard-tagline'); tag.textContent = vTagline(v); card.appendChild(tag);

    // #96 subcategory pills (max 3 by the picker's own cap). When the current
    // search matched a subcategory label, promote that pill to the front and
    // highlight it so the visitor sees WHY the card is in the results.
    var subLabels = vSubcatLabels(v);
    if (subLabels.length) {
      var q = searchTerm.toLowerCase().trim();
      var matchIdx = -1;
      if (q) {
        for (var ni = 0; ni < subLabels.length; ni++) {
          if (subLabels[ni].toLowerCase().indexOf(q) !== -1) { matchIdx = ni; break; }
        }
      }
      var ordered = subLabels.slice();
      if (matchIdx > 0) { ordered.splice(matchIdx, 1); ordered.unshift(subLabels[matchIdx]); }
      var offerings = ce('div', 'vcard-offerings');
      ordered.slice(0, 3).forEach(function (nm, i) {
        var chip = ce('span', 'offer-chip' + (matchIdx !== -1 && i === 0 ? ' match' : ''));
        chip.textContent = nm; chip.title = nm;
        offerings.appendChild(chip);
      });
      card.appendChild(offerings);
    }

    var phone = v.phone_number;
    var actions = ce('div', 'vcard-actions');
    addContact(actions, v.contact_email ? 'mailto:' + v.contact_email : null, 'Email', ICON_EMAIL, 'cb-email');
    // #76c: hide Call when the vendor unticked "Customers can call me"
    // (missing/null = legacy rows -> keep showing).
    addContact(actions, (phone && v.phone_calls !== false) ? 'tel:' + phone : null, 'Call', ICON_CALL, 'cb-call');
    addContact(actions, (v.text_messages && phone) ? 'sms:' + phone : null, 'Text', ICON_TEXT, 'cb-text');
    addContact(actions, (v.whatsapp_messages && phone) ? 'https://wa.me/' + digits(phone) : null, 'WhatsApp', ICON_WHATSAPP, 'cb-whatsapp');
    card.appendChild(actions);

    var href = vProfileHref(v);
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
    chip.appendChild(document.createTextNode(label + ' '));
    var x = ce('span', 'remove-x'); x.textContent = '×'; x.addEventListener('click', onRemove);
    chip.appendChild(x); strip.appendChild(chip);
  }
  function updateMobileIndicator() {
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
    if (sw) sw.classList.toggle('on', on);
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
    var search = el('browse-search');
    if (search) search.addEventListener('input', debounce(function () { searchTerm = search.value || ''; applyFilters(); }, 200));
    var loc = locSelectEl();
    if (loc) loc.addEventListener('change', function () { setLocation(loc.value); });
    var msel = sortSelectEl(); if (msel) msel.addEventListener('change', function () { setSort(msel.value); });
    var openBtn = el('browse-mobile-filter-btn'); if (openBtn) openBtn.addEventListener('click', openFilters);
    var backdrop = el('browse-filter-backdrop'); if (backdrop) backdrop.addEventListener('click', closeFilters);
    var closeX = el('browse-close-filters'); if (closeX) closeX.addEventListener('click', closeFilters);
  }

  function injectStyles() {
    if (el('lokali-browse-styles')) return;
    var s = ce('style'); s.id = 'lokali-browse-styles'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ── init ──
  function init() {
    if (!window.LokaliAPI) { console.error('[lokali-browse] LokaliAPI not found — load lokali-api-client.js first.'); return; }
    _grid = el('browse-vendor-grid');
    if (!_grid) { console.error('[lokali-browse] #browse-vendor-grid not found.'); return; }
    _emptyState = el('browse-empty-state');

    injectStyles();
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
        if (_emptyState) showEl(_emptyState, 'block');
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
