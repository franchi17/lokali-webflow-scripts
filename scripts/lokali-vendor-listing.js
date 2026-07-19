/**
 * Lokali — public Vendor Listing page hydration + interactivity.
 *
 * Load AFTER scripts/lokali-api-client.js (needs window.LokaliAPI).
 * Drives the page built in Webflow with vl-* classes / ids and data-vl-* hooks.
 *
 * Responsibilities:
 *   1. Tab switching (data-vl-tab -> data-vl-panel) + Save-vendor toggle.
 *   2. Resolve the vendor id from the URL (?id= / ?v= / /vendor(s)/{id} / [data-lokali-vendor-id]).
 *   3. Fetch vendor + services + products (+ categories/locations for labels) from Xano.
 *   4. Populate hero, badges, area pills, contact channels, Instagram, avatar, About, card grids.
 *
 * Routing note: Xano currently exposes only `vendor/id/{id}` (no get-by-slug),
 * so this resolves a numeric id. When a `vendor/slug/{slug}` endpoint exists,
 * extend resolveVendorId() + fetchVendor() to accept a slug.
 */
(function () {
  'use strict';

  var currentVendorId = null; // set during hydrate(); used to build detail-page links
  var currentVendorSlug = null; // set during hydrate(); used to build clean item/about URLs
  var openAboutOnLoad = false; // true when the URL is /{slug}/about — open the About tab once loaded

  // #76 one-page remodel (Airbnb-style single scroll) — DEFAULT ON since
  // v1.4.166 (flipped by Francesca 2026-07-18 after live review). ?onepage=0
  // (or window.LOKALI_VL_ONEPAGE=false) forces the legacy tab layout for
  // debugging/rollback. In this mode the tab handlers below become
  // scroll-to-section, panels all render stacked, and the contact column
  // becomes a sticky card (see onepageLayout()).
  var ONEPAGE = !/[?&]onepage=0/.test(window.location.search) && window.LOKALI_VL_ONEPAGE !== false;

  // Website/Instagram link-row layout now lives in PILL_CSS (.vl-link-chip);
  // the chips flex so a lone survivor (vendor has only one of the two) goes
  // full width instead of sitting in half a grid cell.

  // ---- tiny DOM helpers -------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function setText(id, val) { var el = document.getElementById(id); if (el) el.textContent = (val == null || val === '') ? el.textContent : String(val); }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
  function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }
  function ce(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0].charAt(0) + p[1].charAt(0)).toUpperCase();
  }
  // profile_photo from Xano is often a relative /vault/... path — prepend the Xano file base.
  function photoUrl(p) {
    if (!p || typeof p !== 'string') return '';
    p = p.trim();
    // Block javascript:/data: schemes, protocol-relative //host, and chars that
    // could break out of an attribute/CSS url(). Allow http(s) + relative paths.
    if (!p || /[\s"'<>`\\]/.test(p) || /^(?:javascript|data|vbscript):/i.test(p)) return '';
    if (/^https?:\/\//.test(p)) return p;
    if (p.indexOf('//') === 0) return '';
    var base = window.LOKALI_FILE_BASE || 'https://x8ki-letl-twmt.n7.xano.io';
    return base.replace(/\/$/, '') + (p.charAt(0) === '/' ? '' : '/') + p;
  }

  // ---- category pill styling (mirrors The Market vendor card) -----------
  // bg/text = pill colors; url = the same masked category icon used on the card.
  // Keyed by Xano category id (matches lokali-browse.js CAT_BY_ID).
  var ASSET = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/';
  var CAT_BY_ID = {
    1: { bg: '#FFF8E6', text: '#8A5A00', url: ASSET + '6a186b061a80eb9ba75f0d0a_scissors-solid.png' }, // Handcrafted
    2: { bg: '#F0F0F8', text: '#4A4761', url: ASSET + '6a18f6d4b01673d30ca9bcb8_briefcase.svg' },       // Business
    3: { bg: '#FEF3F2', text: '#C0392B', url: ASSET + '6a18f2524e31974a75003735_hair%20dryer.svg' },    // Beauty
    4: { bg: '#E6F1FB', text: '#1A5C9A', url: ASSET + '6a18f6d4f1bbd4795f5345bc_backpack.svg' },        // Children
    5: { bg: '#F3EBFF', text: '#6002EE', url: ASSET + '6a18f6d414c76bb968f180db_balloon.svg' },         // Events
    6: { bg: '#FFF3EA', text: '#FF6B00', url: ASSET + '6a186b067365d964abee8918_utensils-solid.png' },  // Food
    7: { bg: '#EAFAF2', text: '#1D6A45', url: ASSET + '6a186b06cfcb6c4d6d1e1cf7_heart-regular.png' },    // Wellness
    8: { bg: '#F7F6FC', text: '#4A4761', url: ASSET + '6a186b06a37dcea6514f15f9_house-regular.png' }     // Home
  };

  // Self-contained masked icon: recolors any silhouette PNG/SVG to `color`.
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

  // Injected once: turns #vl-category into a card-style pill, aligns the hero
  // badges with the vendor-card palette on The Market, restyles the
  // website/Instagram links as contact-family chips, and gives #vl-save the
  // market heart language. Appended after the Webflow stylesheet, so these
  // single-class rules win the cascade at equal specificity.
  var PILL_CSS = [
    "#vl-category.vl-cat-pill{display:inline-flex;align-items:center;gap:5px;border-radius:100px;padding:3px 10px;font-size:11px;font-weight:500;line-height:1.2;}",
    // Badges — market-card hues at the pale tint level of the Call/WhatsApp
    // buttons (#F0F4FF / #EDFAF3); both sit together on one row under the name.
    ".vl-badge-row{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px;}",
    ".vl-badge-row .vl-badge{margin:0;}",
    ".vl-badge.vl-badge-founding{background:#FDF6DF;color:#9A6B00;border:.5px solid #EFDFA8;}",
    ".vl-badge.vl-badge-verified{background:#EEF3FF;color:#1730C9;border:.5px solid #C9D6F8;}",
    ".vl-badge.vl-badge-featured{background:#FAE4FC;color:#D602EE;border:.5px solid rgba(214,2,238,.3);}",
    ".vl-avatar.vl-avatar-initials{display:flex;align-items:center;justify-content:center;}",
    ".vl-avatar-txt{color:#6002EE;font-weight:600;font-size:30px;letter-spacing:.5px;font-family:'Plus Jakarta Sans',sans-serif;line-height:1;}",
    // Contact buttons: subtle lift on hover + visible keyboard focus.
    ".vl-ch{transition:transform .12s,box-shadow .12s;}",
    ".vl-ch:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(26,24,41,.08);}",
    ".vl-ch:focus-visible,.vl-meta-link:focus-visible,.vl-save:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}",
    // Website/Instagram: profile links under the vendor's meta (Instagram-bio
    // style — icon + domain/@handle in brand violet), NOT in the contact
    // column, so they clearly read as links rather than outreach buttons.
    ".vl-links-row{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:12px;}",
    ".vl-meta-link{display:inline-flex;align-items:center;gap:5px;color:#6002EE;font-size:12.5px;font-weight:600;text-decoration:none;min-width:0;}",
    // Optical centering: lowercase-heavy labels (domains, @handles) carry their
    // visual weight below the geometric midline, so a mathematically centered
    // icon reads high — nudge it down half a pixel.
    ".vl-meta-link>span:not(.vl-link-label){transform:translateY(.5px);}",
    ".vl-meta-link:hover .vl-link-label{text-decoration:underline;}",
    ".vl-meta-link .vl-link-label{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    // Share + Save: one row of half-width buttons under the contact stack —
    // same action family (about the vendor, not contacting them). The share
    // button is injected into #lokali-share-detail by lokali-share.js.
    // Grid (not flex): equal 1fr columns regardless of label widths.
    ".vl-actions-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;}",
    ".vl-actions-row #lokali-share-detail{display:flex;min-width:0;}",
    ".vl-actions-row #lokali-share-detail .lk-share{flex:1;justify-content:center;padding:8px 10px;}",
    ".vl-actions-row #vl-save{min-width:0;padding:8px 10px;}",
    // Save button — mirrors the market heart (lokali-favorites.js): white base,
    // outline heart; saved = violet tint + filled #6002EE heart.
    ".vl-save{background-color:#fff;border:.5px solid #EEEDF6;color:#1A1829;font-size:13px;font-weight:600;padding:8px 14px;grid-column-gap:7px;grid-row-gap:7px;transition:background .12s,border-color .12s,transform .12s;}",
    ".vl-save:hover{border-color:#D4AAFD;}",
    ".vl-save svg{width:15px;height:15px;display:block;}",
    ".vl-save .vl-heart{fill:none;stroke:#6B6880;stroke-width:1.8;transition:fill .12s,stroke .12s;}",
    ".vl-save.vl-save-on{background-color:#F3EBFF;border-color:#D4AAFD;color:#6002EE;}",
    ".vl-save.vl-save-on .vl-heart{fill:#6002EE;stroke:#6002EE;}",
    // Desktop: the action column must have a DEFINITE width — it was
    // content-sized, which makes the Share/Save row's width:100% circular and
    // the browser then sizes the two buttons by content instead of 50/50.
    "@media (min-width:768px){",
    ".vl-hero-right{width:184px;align-items:stretch;}",
    "}",
    // Mobile: Webflow already stacks the hero; tighten the tall button pile
    // into a 2×2 contact grid, save full width, ≥44px tap targets.
    "@media (max-width:767px){",
    ".vl-channels{display:grid !important;grid-template-columns:1fr 1fr;gap:8px;min-width:0;width:100%;}",
    ".vl-ch,.vl-save,.vl-actions-row .lk-share{min-height:44px;}",
    ".vl-ch,.vl-save,.vl-actions-row .lk-share{font-size:14px;}",
    ".vl-meta-link{font-size:13.5px;min-height:32px;}",
    ".vl-hero-right{width:100%;align-items:stretch;}",
    "}"
  ].join('');
  function injectStyles() {
    if (document.getElementById('vl-pill-styles')) return;
    var s = document.createElement('style'); s.id = 'vl-pill-styles'; s.textContent = PILL_CSS;
    document.head.appendChild(s);
  }

  // ---- hero chrome (badges / link chips / save button markup) ------------
  // The hero is static Webflow DOM, so these swaps run once at init, before
  // any data arrives; initContact() later only sets hrefs / hides the anchors.
  var ICON_CROWN = ASSET + '69f4dbb3533f0ee2046ab0fb_crown-solid.png';      // = market card founding badge
  var ICON_GLOBE = ASSET + '69f8b5e89bc57b40690cbc77_globe-solid.png';
  var ICON_IG    = ASSET + '69f8b5e8a4030414bb433441_instagram-brands-solid.png';
  var HEART_PATH = 'M12 20.5l-1.4-1.27C5.6 14.86 2.5 12.07 2.5 8.6 2.5 6.1 4.5 4.1 7 4.1c1.5 0 2.95.7 3.9 1.81C11.85 4.8 13.3 4.1 14.8 4.1c2.5 0 4.5 2 4.5 4.5 0 3.47-3.1 6.26-8.1 10.63L12 20.5z'; // same heart as the market cards

  function styleHeroChrome() {
    // Founding badge: star SVG → the crown used on the market cards.
    var fb = document.getElementById('vl-badge-founding');
    if (fb) {
      var star = fb.querySelector('svg');
      if (star) fb.replaceChild(maskIcon(ICON_CROWN, '#9A6B00', 11), star);
    }
    // Badges: out of the name row (where >1 badge wraps messily around the
    // name) onto their own single row directly under it.
    var vb = document.getElementById('vl-badge-verified');
    var nameRow = document.querySelector('.vl-name-row');
    if (nameRow && (fb || vb)) {
      var brow = ce('div', 'vl-badge-row');
      if (fb) brow.appendChild(fb);
      if (vb) brow.appendChild(vb);
      nameRow.parentNode.insertBefore(brow, nameRow.nextSibling);
    }
    // Website/Instagram: out of the contact column, into an Instagram-bio
    // style link row at the bottom of the vendor meta. initContact() later
    // fills the labels with the real domain / @handle and hides absentees.
    function makeMetaLink(id, iconUrl, fallbackLabel) {
      var a = document.getElementById(id);
      if (!a) return null;
      a.className = 'vl-meta-link'; // drop the w-node grid classes
      a.innerHTML = '';
      a.appendChild(maskIcon(iconUrl, '#6002EE', 13));
      var lbl = ce('span', 'vl-link-label');
      lbl.textContent = fallbackLabel;
      a.appendChild(lbl);
      return a;
    }
    var webA = makeMetaLink('vl-website', ICON_GLOBE, 'Website');
    var igA = makeMetaLink('vl-ig', ICON_IG, 'Instagram');
    var meta = document.querySelector('.vl-meta');
    if (meta && (webA || igA)) {
      var lrow = ce('div', 'vl-links-row');
      lrow.id = 'vl-links-row';
      if (webA) lrow.appendChild(webA);
      if (igA) lrow.appendChild(igA);
      meta.appendChild(lrow);
    }
    // The old 2-cell grid the links lived in is now empty — drop it.
    var oldRow = document.querySelector('.div-block-179');
    if (oldRow && oldRow.parentNode) oldRow.parentNode.removeChild(oldRow);
    // "Part of the Lokali community since …" duplicates the About tab's
    // Member-since row — hide it here to declutter the hero.
    var since = document.getElementById('vl-since');
    if (since && since.closest) {
      var srow = since.closest('.vl-meta-row');
      if (srow) srow.style.display = 'none';
    }
    // Save button: rebuild content as market heart + label. Short "Save"
    // label (same as the market's inline heart) so it fits the shared row.
    var btn = document.getElementById('vl-save');
    if (btn) {
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="vl-heart" d="' + HEART_PATH + '"/></svg><span class="vl-save-label">Save</span>';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'Save vendor');
    }
    // Share + Save side by side: wrap the share mount (lokali-share.js fills
    // it) and the save button in one flex row at the foot of the action column.
    var shareAnchor = document.getElementById('lokali-share-detail');
    if (btn && shareAnchor && btn.parentNode) {
      var arow = ce('div', 'vl-actions-row');
      btn.parentNode.insertBefore(arow, btn);
      arow.appendChild(shareAnchor);
      arow.appendChild(btn);
    }
  }

  // Restyle the hero category text as the colored pill from the vendor card.
  function styleCategoryPill(catId) {
    var el = document.getElementById('vl-category');
    var style = (catId != null) ? CAT_BY_ID[catId] : null;
    if (!el || !style) return;
    el.classList.add('vl-cat-pill');
    el.style.background = style.bg;
    el.style.color = style.text;
    var row = el.parentNode; // hide the generic meta-row icon; the pill carries its own
    if (row) { var ic = row.querySelector('svg.vl-ic'); if (ic) ic.style.display = 'none'; }
    el.insertBefore(maskIcon(style.url, style.text, 13), el.firstChild);
  }

  // ---- 1. interactivity -------------------------------------------------
  // In ONEPAGE mode "activating a tab" means scrolling to its stacked section —
  // this keeps the /{slug}/about and #reviews deep links working unchanged.
  function activateTab(name) {
    if (ONEPAGE) { onepageScrollTo(name); return; }
    $all('[data-vl-tab]').forEach(function (t) { t.classList.toggle('vl-stab-active', t.getAttribute('data-vl-tab') === name); });
    // Inactive panels carry a Webflow combo class (inline-div-5/6/7) that sets display:none.
    // Setting display:'' would just revert to that rule, so force the active panel to 'block'.
    $all('[data-vl-panel]').forEach(function (p) {
      p.style.display = (p.getAttribute('data-vl-panel') === name) ? 'block' : 'none';
    });
  }
  // Show/hide a whole tab (+ its panel). Used to hide Services/Products when a vendor has none.
  function setTabVisible(name, vis) {
    if (ONEPAGE) { onepageSectionVisible(name, vis); return; }
    $all('[data-vl-tab="' + name + '"]').forEach(function (t) { show(t, vis); });
    if (!vis) $all('[data-vl-panel="' + name + '"]').forEach(function (p) { show(p, false); });
  }
  // If the active tab got hidden (or none is active), activate the first still-visible tab.
  function ensureActiveTab() {
    if (ONEPAGE) return; // stacked sections — nothing to activate
    var visible = $all('[data-vl-tab]').filter(function (t) { return t.style.display !== 'none'; });
    if (visible.filter(function (t) { return t.classList.contains('vl-stab-active'); })[0]) return;
    if (visible[0]) activateTab(visible[0].getAttribute('data-vl-tab'));
  }
  function initTabs() {
    if (ONEPAGE) return; // nav links are anchors built in onepageLayout()
    $all('[data-vl-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { activateTab(tab.getAttribute('data-vl-tab')); });
    });
  }

  // ---- #76 one-page layout (Airbnb-style single scroll) ------------------
  // Runs once at init in ONEPAGE mode, before hydrate(): restructures the
  // existing Webflow DOM (no markup changes in Webflow needed) —
  //   • #vl-portfolio moves above the hero and becomes the photo-grid hero
  //     (desktop grid; on mobile it keeps the existing swipe strip + pips)
  //   • the tab row hides; a sticky anchor nav takes its place
  //   • every panel renders stacked inside a section wrapper with a heading
  //   • .vl-hero-right (message/contact/share/save) moves into a sticky card;
  //     payment links mount into the card instead of the About section
  //   • the mailto Email button + Instagram link are dropped (decisions 07-17)
  //   • mobile: the card relocates inline after Services + a fixed bottom bar
  //     ("Send a message" / "Call") proxies the real controls
  // label = nav text; heading (optional) = the in-section h2 when it differs.
  var OP_HEART = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#6002EE" aria-hidden="true" style="vertical-align:-3px;margin-right:8px;"><path d="M12 20.5l-1.4-1.27C5.6 14.86 2.5 12.07 2.5 8.6 2.5 6.1 4.5 4.1 7 4.1c1.5 0 2.95.7 3.9 1.81C11.85 4.8 13.3 4.1 14.8 4.1c2.5 0 4.5 2 4.5 4.5 0 3.47-3.1 6.26-8.1 10.63L12 20.5z"/></svg>';
  var OP_SECTIONS = [
    { name: 'services', label: 'Services' },
    { name: 'products', label: 'Products' },
    { name: 'reviews',  label: 'Reviews', headingHtml: OP_HEART + 'Recommended by neighbors' },
    { name: 'about',    label: 'About the vendor' }
  ];
  var OP_CSS = [
    // stacked panels: beat the Webflow combo classes (inline-div-5/6/7) that
    // display:none the non-default panels; section-level hiding uses the
    // wrapper's inline style, which this rule doesn't touch.
    'html.vl-op .vl-panel{display:block !important;}',
    'html.vl-op .vl-tabs{display:none !important;}',
    'html.vl-op #vl-ig{display:none !important;}',        // vendors funnel via Lokali, not IG
    'html.vl-op #vl-ch-email{display:none !important;}',  // "Send a message" replaces mailto
    // sticky section nav — hidden while the top of the page (hero/header) is
    // in view, fades in once you scroll past it (Airbnb behavior; sentinel
    // observer in onepageLayout toggles .vl-op-nav-on).
    // --vl-op-top = the fixed Webflow header's height (measured at init; the
    // nav/rail/anchors must clear it or they slide underneath — 2026-07-19 fix).
    '#vl-op-nav{position:sticky;top:var(--vl-op-top,0px);z-index:40;background:#FFFFFF;display:flex;gap:26px;overflow-x:auto;border-bottom:1px solid #EEEDF6;margin-top:6px;}',
    '#vl-op-nav.vl-op-nav-auto{visibility:hidden;opacity:0;transition:opacity .18s;}',
    '#vl-op-nav.vl-op-nav-auto.vl-op-nav-on{visibility:visible;opacity:1;}',
    '#vl-op-nav a{padding:14px 2px;font:600 14px/1.2 "Plus Jakarta Sans",sans-serif;color:#6B6880;text-decoration:none;border-bottom:2px solid transparent;white-space:nowrap;}',
    '#vl-op-nav a:hover,#vl-op-nav a.vl-op-active{color:#1A1829;border-bottom-color:#6002EE;}',
    // two-column body
    '.vl-op-grid{display:grid;grid-template-columns:minmax(0,1fr) 332px;gap:44px;align-items:start;}',
    '.vl-op-main{min-width:0;}',
    '.vl-op-sec{padding:28px 0;border-bottom:1px solid #EEEDF6;scroll-margin-top:calc(var(--vl-op-top,0px) + 62px);}',
    '.vl-op-sec:last-child{border-bottom:none;}',
    '.vl-op-h{font:700 20px/1.3 "Plus Jakarta Sans",sans-serif;color:#1A1829;margin:0 0 16px;}',
    '.vl-op-count{color:#6B6880;font-weight:600;font-size:14px;margin-left:7px;}',
    // sticky contact card
    '.vl-op-rail{position:sticky;top:calc(var(--vl-op-top,0px) + 12px);min-width:0;}',
    '.vl-op-card{background:#fff;border:.5px solid #EEEDF6;border-radius:18px;box-shadow:0 8px 28px rgba(26,24,41,.07);padding:20px;}',
    '.vl-op-card-lead{font:700 16px/1.3 "Plus Jakarta Sans",sans-serif;color:#1A1829;margin-bottom:12px;}',
    'html.vl-op .vl-op-card .vl-hero-right{width:100% !important;align-items:stretch;display:flex;flex-direction:column;gap:10px;}',
    // instant channels: primary message button (injected by lokali-inquiry.js)
    // full-width on top, Text/WhatsApp/Call sharing one compact row below.
    'html.vl-op .vl-op-card .vl-channels{display:flex !important;flex-direction:row !important;flex-wrap:wrap;gap:8px;width:100%;min-width:0;}',
    'html.vl-op .vl-op-card .vl-channels #lok-inq-btn{flex:1 1 100%;margin:0 0 2px;}',
    'html.vl-op .vl-op-card .vl-ch{flex:1 1 0;min-width:0;justify-content:center;}',
    'html.vl-op .vl-op-card #vl-op-pay:empty{display:none;}',
    'html.vl-op .vl-op-card #vl-op-pay{border-top:1px solid #EEEDF6;margin-top:12px;padding-top:2px;}',
    // photo-grid hero (desktop only — mobile keeps the swipe strip)
    '@media (min-width:768px){',
    'html.vl-op #vl-portfolio{margin:16px 0 4px;}',
    'html.vl-op #vl-portfolio .vd-gallery{display:grid !important;grid-template-columns:2fr 1fr 1fr;grid-auto-rows:178px;gap:8px;border-radius:18px;overflow:hidden;width:100%;}',
    'html.vl-op #vl-portfolio .vd-frame{width:auto !important;height:100% !important;min-width:0 !important;margin:0 !important;border-radius:0 !important;}',
    'html.vl-op #vl-portfolio .vd-frame img{width:100% !important;height:100% !important;object-fit:cover;display:block;}',
    'html.vl-op #vl-portfolio[data-op-count="5"] .vd-frame:first-child,html.vl-op #vl-portfolio[data-op-count="3"] .vd-frame:first-child{grid-row:1/3;}',
    'html.vl-op #vl-portfolio[data-op-count="3"] .vd-gallery{grid-template-columns:2fr 1fr;}',
    'html.vl-op #vl-portfolio[data-op-count="4"] .vd-gallery{grid-template-columns:1fr 1fr;grid-auto-rows:158px;}',
    'html.vl-op #vl-portfolio[data-op-count="2"] .vd-gallery{grid-template-columns:1fr 1fr;grid-auto-rows:230px;}',
    'html.vl-op #vl-portfolio[data-op-count="1"] .vd-gallery{grid-template-columns:1fr;grid-auto-rows:300px;}',
    'html.vl-op #vl-portfolio .vd-pips{display:none !important;}',
    '#vl-op-bar{display:none;}',
    '}',
    // ── mockup-fidelity pass (2026-07-19 gap closure) ──────────────────────
    // The Webflow .vl-page container is ~820px; the approved mockup is a
    // 1120px canvas — the single biggest "feels cramped" gap. Widen in
    // one-page mode only (tab mode untouched).
    'html.vl-op .vl-page{max-width:1120px !important;width:100% !important;padding-left:24px;padding-right:24px;box-sizing:border-box;margin-left:auto;margin-right:auto;}',
    // Title block: smaller inline logo, category/areas as icon+text lines
    // (mockup shows plain lines, not pills).
    'html.vl-op .vl-avatar{width:64px !important;height:64px !important;min-width:64px !important;}',
    'html.vl-op .vl-avatar-txt{font-size:22px !important;}',
    'html.vl-op #vl-category.vl-cat-pill{background:transparent !important;border:none !important;padding:0 !important;font-size:14.5px;font-weight:700;}',
    'html.vl-op .vl-area-pill{background:transparent !important;border:none !important;padding:0 !important;margin:0 !important;font-size:14.5px;font-weight:600;color:#6B6880;}',
    'html.vl-op .vl-area-pill:not(:last-child):after{content:"\\00a0\\00b7\\00a0";color:#B9B6C9;}',
    'html.vl-op #vl-areas{gap:0 !important;display:inline-flex;flex-wrap:wrap;}',
    // Services: full-width horizontal cards (image left), per the mockup.
    'html.vl-op [data-vl-panel="services"] .vl-grid{display:flex !important;flex-direction:column;gap:16px;width:100%;}',
    'html.vl-op [data-vl-panel="services"] .vl-card{display:grid !important;grid-template-columns:190px 1fr;width:100% !important;max-width:none !important;border-radius:16px;overflow:hidden;align-items:stretch;}',
    'html.vl-op [data-vl-panel="services"] .vl-card-img{width:100% !important;height:100% !important;min-height:150px;border-radius:0 !important;}',
    'html.vl-op [data-vl-panel="services"] .vl-card-img img{width:100%;height:100%;object-fit:cover;display:block;}',
    'html.vl-op [data-vl-panel="services"] .vl-card-body{padding:16px 18px;display:flex;flex-direction:column;}',
    // Products: keep vertical cards but let them breathe in a 2-up grid.
    'html.vl-op [data-vl-panel="products"] .vl-grid{display:grid !important;grid-template-columns:1fr 1fr;gap:16px;width:100%;}',
    'html.vl-op [data-vl-panel="products"] .vl-card{width:100% !important;max-width:none !important;}',
    // Highlights (icon rows above Meet the vendor)
    '.vl-op-hl{display:flex;gap:14px;align-items:flex-start;padding:9px 0;font-family:"Plus Jakarta Sans",sans-serif;}',
    '.vl-op-hl-ico{width:38px;height:38px;border-radius:11px;background:#F1EEFB;display:flex;align-items:center;justify-content:center;flex:none;}',
    '.vl-op-hl b{display:block;font-size:15px;color:#1A1829;}',
    '.vl-op-hl span{color:#6B6880;font-size:13.5px;}',
    // Reviews: violet-tinted empty state per the mockup
    'html.vl-op .vl-rev-empty{background:#F1EEFB !important;border:none !important;}',
    // "More about" host card + bio grid (renders when Meet-the-Vendor is filled)
    '.vl-meet-grid{display:grid;grid-template-columns:280px minmax(0,1fr);gap:28px;align-items:start;font-family:"Plus Jakarta Sans",sans-serif;margin-bottom:14px;}',
    '.vl-host-card{background:#fff;border:.5px solid #EEEDF6;border-radius:20px;box-shadow:0 10px 30px rgba(26,24,41,.08);padding:26px;text-align:center;}',
    '.vl-host-card .vl-host-nm{font-weight:700;font-size:18px;color:#1A1829;}',
    '.vl-host-card .vl-host-rl{color:#6B6880;font-size:13px;margin-bottom:14px;}',
    '.vl-host-stats{border-top:1px solid #EEEDF6;text-align:left;padding-top:12px;}',
    '.vl-host-st{display:flex;justify-content:space-between;gap:10px;padding:6px 0;font-size:13.5px;color:#6B6880;font-weight:600;}',
    '.vl-host-st b{color:#1A1829;font-weight:700;text-align:right;}',
    '.vl-meet-bio{color:#565170;font-size:15px;line-height:1.6;white-space:pre-line;}',
    // "Ways to pay" chips in the card (labeled pills, not bare icon circles)
    '.vl-op-pay-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid #E4DFF6;background:#fff;border-radius:12px;padding:9px 14px;font:600 13.5px "Plus Jakarta Sans",sans-serif;color:#5F51B8;text-decoration:none;cursor:pointer;position:relative;transition:background .12s;}',
    '.vl-op-pay-chip:hover{background:#F3EBFF;}',
    '.vl-op-pay-chip svg{display:block;width:15px;height:15px;}',
    // mobile
    '@media (max-width:767px){',
    '.vl-op-grid{grid-template-columns:1fr;gap:0;}',
    '.vl-op-rail{position:static;}',
    '.vl-op-card{margin:6px 0 22px;}',
    'html.vl-op [data-vl-panel="services"] .vl-card{grid-template-columns:1fr;}',
    'html.vl-op [data-vl-panel="services"] .vl-card-img{min-height:170px;}',
    'html.vl-op [data-vl-panel="products"] .vl-grid{grid-template-columns:1fr;}',
    '.vl-meet-grid{grid-template-columns:1fr;}',
    'html.vl-op body{padding-bottom:76px;}',
    '#vl-op-bar{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;gap:10px;background:#fff;border-top:1px solid #EEEDF6;padding:10px 14px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -6px 20px rgba(26,24,41,.08);}',
    '#vl-op-bar button,#vl-op-bar a{font-family:"Plus Jakarta Sans",sans-serif;font-weight:600;font-size:15px;border-radius:10px;min-height:46px;display:flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;}',
    '#vl-op-bar .vl-op-bar-msg{flex:1;background:#6002EE;color:#fff;border:0;}',
    '#vl-op-bar .vl-op-bar-call{flex:0 0 108px;background:#fff;color:#1A1829;border:1px solid #EEEDF6;}',
    '}'
  ].join('');

  function onepageLayout() {
    document.documentElement.classList.add('vl-op');
    if (!document.getElementById('vl-op-styles')) {
      var st = document.createElement('style'); st.id = 'vl-op-styles'; st.textContent = OP_CSS;
      document.head.appendChild(st);
    }
    var page = document.querySelector('.vl-page');
    var sections = document.querySelector('.vl-sections');
    if (!page || !sections) return;

    // photo hero: portfolio section moves above the title hero (it stays
    // display:none until loadPortfolio() confirms photos — a vendor without
    // photos simply starts at the name, per the free-vendor design).
    var port = document.getElementById('vl-portfolio');
    var hero = document.querySelector('.vl-hero');
    if (port && hero && hero.parentNode) hero.parentNode.insertBefore(port, hero);
    var plabel = port && port.querySelector('.vl-portfolio-label');
    if (plabel) plabel.style.display = 'none';

    // sticky nav + two-column grid
    var nav = ce('div'); nav.id = 'vl-op-nav';
    var grid = ce('div', 'vl-op-grid');
    var main = ce('div', 'vl-op-main');
    var rail = ce('div', 'vl-op-rail');
    // Sentinel right above the nav: while it's on screen (= the page top /
    // main header area is visible) the nav hides; scroll past it → nav shows.
    // Driven by a plain scroll listener — the earlier IntersectionObserver
    // version silently never fired on the live page (2026-07-19 fix).
    var navSentinel = ce('div');
    navSentinel.style.cssText = 'height:1px;margin:0;padding:0;';
    sections.appendChild(navSentinel);
    sections.appendChild(nav);
    nav.classList.add('vl-op-nav-auto');
    sections.appendChild(grid);
    grid.appendChild(main); grid.appendChild(rail);

    OP_SECTIONS.forEach(function (s) {
      var panel = $('[data-vl-panel="' + s.name + '"]');
      if (!panel) return;
      var sec = ce('section', 'vl-op-sec');
      sec.id = 'vl-op-sec-' + s.name;
      var h = ce('h2', 'vl-op-h');
      if (s.headingHtml) h.innerHTML = s.headingHtml; // static markup only (OP_HEART)
      else h.textContent = s.label;
      var cnt = document.getElementById('vl-count-' + s.name);
      if (cnt) { // keep the live count element — renderers keep updating it by id
        var cs = ce('span', 'vl-op-count');
        cs.appendChild(cnt);
        h.appendChild(cs);
      }
      sec.appendChild(h);
      sec.appendChild(panel);
      main.appendChild(sec);
      var a = ce('a');
      a.id = 'vl-op-nav-' + s.name;
      a.href = '#vl-op-sec-' + s.name;
      a.textContent = s.label;
      a.addEventListener('click', function (ev) { ev.preventDefault(); onepageScrollTo(s.name); });
      nav.appendChild(a);
    });

    // sticky contact card = the hero's action column + a heading + a pay slot
    var right = document.querySelector('.vl-hero-right');
    var card = ce('div', 'vl-op-card');
    var lead = ce('div', 'vl-op-card-lead'); lead.textContent = 'Get in touch';
    card.appendChild(lead);
    if (right) card.appendChild(right);
    var pay = ce('div'); pay.id = 'vl-op-pay';
    card.appendChild(pay);
    rail.appendChild(card);

    buildOpBar();
    placeOpCard();
    // The Webflow header is position:fixed — expose its height as a CSS var so
    // the sticky nav/rail/anchor offsets clear it (0 if the header ever changes).
    opSetTop();
    var t = null;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { placeOpCard(); setOpTop(); }, 150); });
    initOpNavScroll(navSentinel, nav);
    watchAvailability(main, nav);
    loadInquiryScript();
  }

  // "Send a message" = lokali-inquiry.js (button + modal → dashboard Leads +
  // vendor email). That script was never added to the Webflow footer, so the
  // one-page layout loads it itself from wherever THIS script was served
  // (jsDelivr @v1.4 in prod) — no manual Webflow paste needed.
  function loadInquiryScript() {
    if (document.getElementById('lok-inq-loader')) return;
    var mine = $all('script').filter(function (s) { return /lokali-vendor-listing\.js/.test(s.src || ''); })[0];
    if (!mine || !mine.src) return;
    var s = document.createElement('script');
    s.id = 'lok-inq-loader';
    s.src = mine.src.replace(/lokali-vendor-listing\.js.*$/, 'lokali-inquiry.js');
    s.defer = true;
    document.body.appendChild(s);
  }

  function onepageScrollTo(name) {
    var sec = document.getElementById('vl-op-sec-' + name);
    if (sec && sec.style.display !== 'none') sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function onepageSectionVisible(name, vis) {
    show(document.getElementById('vl-op-sec-' + name), vis);
    show(document.getElementById('vl-op-nav-' + name), vis);
  }

  // Mobile: the contact card sits inline right after Services (Airbnb-style
  // "seen the offer → get in touch"); desktop puts it back in the sticky rail.
  function placeOpCard() {
    var card = document.querySelector('.vl-op-card');
    var rail = document.querySelector('.vl-op-rail');
    var main = document.querySelector('.vl-op-main');
    if (!card || !rail || !main) return;
    if (window.matchMedia('(max-width:767px)').matches) {
      var svc = document.getElementById('vl-op-sec-services');
      if (svc && svc.parentNode === main && card.previousElementSibling !== svc) main.insertBefore(card, svc.nextSibling);
    } else if (card.parentNode !== rail) {
      rail.appendChild(card);
    }
  }

  // Fixed bottom bar (mobile): proxies the REAL controls so lead tracking and
  // the inquiry modal behave identically. Call hides when the vendor has no
  // phone (synced from initContact via syncOpBar()).
  function buildOpBar() {
    var bar = ce('div'); bar.id = 'vl-op-bar';
    var msg = ce('button', 'vl-op-bar-msg');
    msg.type = 'button';
    msg.textContent = 'Send a message';
    msg.addEventListener('click', function () {
      var b = document.getElementById('lok-inq-btn');
      if (b) b.click();
    });
    var call = ce('a', 'vl-op-bar-call');
    call.textContent = 'Call';
    call.addEventListener('click', function (ev) {
      ev.preventDefault();
      var c = document.getElementById('vl-ch-call');
      if (c && c.href) c.click(); // real anchor → tel: nav + lead event
    });
    bar.appendChild(msg); bar.appendChild(call);
    document.body.appendChild(bar);
  }
  function syncOpBar() {
    if (!ONEPAGE) return;
    var c = document.getElementById('vl-ch-call');
    show(document.querySelector('.vl-op-bar-call'), !!(c && c.style.display !== 'none' && c.getAttribute('href')));
    // no inquiry mount (script missing) → no message button either
    var msgBtn = document.querySelector('.vl-op-bar-msg');
    if (msgBtn && !document.getElementById('lok-inq-btn')) {
      // check again shortly — lokali-inquiry.js mounts off the vendor-loaded event
      setTimeout(function () { show(msgBtn, !!document.getElementById('lok-inq-btn')); }, 1200);
    }
  }

  // Nav show/hide + active-link highlight, driven by ONE passive scroll
  // listener (deterministic everywhere — IO delivery proved unreliable live).
  // Reads the nav's own links each pass, so dynamically added sections
  // (Availability) join automatically.
  // The Webflow header flips to position:fixed only after scrolling (scroll
  // interaction), so its height is re-measured on every throttled scroll pass —
  // the sticky nav/rail/anchors read it via the --vl-op-top CSS var.
  function opSetTop() {
    var hdr = document.querySelector('.header-wrapper');
    var fixed = hdr && getComputedStyle(hdr).position === 'fixed';
    document.documentElement.style.setProperty('--vl-op-top', (fixed ? hdr.offsetHeight : 0) + 'px');
  }

  function initOpNavScroll(sentinel, nav) {
    var queued = false;
    function update() {
      queued = false;
      opSetTop();
      nav.classList.toggle('vl-op-nav-on', sentinel.getBoundingClientRect().top < 0);
      var mark = window.innerHeight * 0.35;
      var as = nav.querySelectorAll('a[id^="vl-op-nav-"]');
      var activeId = null;
      for (var i = 0; i < as.length; i++) {
        if (as[i].style.display === 'none') continue;
        var sec = document.getElementById(as[i].id.replace('vl-op-nav-', 'vl-op-sec-'));
        if (!sec || sec.style.display === 'none') continue;
        if (sec.getBoundingClientRect().top <= mark) activeId = as[i].id;
      }
      for (var j = 0; j < as.length; j++) as[j].classList.toggle('vl-op-active', as[j].id === activeId);
    }
    function onScroll() {
      if (queued) return;
      queued = true;
      setTimeout(update, 60);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  // ---- highlights (icon rows above Meet the vendor / Services) -----------
  // Rows come from real, verifiable flags only. The ★ Featured row from the
  // early mockup is intentionally absent (#86 removed the Featured badge).
  var OP_CHECK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E7D5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var ICON_BOLT = ASSET + '6a1d92f83a64390307583b8e_bolt-solid.png';
  function opAddHighlight(row) {
    var main = document.querySelector('.vl-op-main');
    if (!main) return;
    var sec = document.getElementById('vl-op-sec-highlights');
    if (!sec) {
      sec = ce('section', 'vl-op-sec');
      sec.id = 'vl-op-sec-highlights';
      main.insertBefore(sec, main.firstChild);
    }
    if (sec.querySelector('[data-hl="' + row.key + '"]')) return;
    var el = ce('div', 'vl-op-hl');
    el.setAttribute('data-hl', row.key);
    var ico = ce('div', 'vl-op-hl-ico');
    if (row.svg) ico.innerHTML = row.svg;            // static markup only
    else if (row.url) ico.appendChild(maskIcon(row.url, row.tint, 18));
    var txt = ce('div');
    var b = ce('b'); b.textContent = row.t; txt.appendChild(b);
    var s = ce('span'); s.textContent = row.s; txt.appendChild(s);
    el.appendChild(ico); el.appendChild(txt);
    sec.appendChild(el);
  }
  function renderHighlights(v) {
    if (v.is_founding_member) {
      var yr = v.created_at ? new Date(v.created_at).getFullYear() : null;
      opAddHighlight({ key: 'founding', url: ICON_CROWN, tint: '#9A6B00', t: 'Founding vendor', s: 'Part of the Lokali community' + (yr ? ' since ' + yr : '') });
    }
    if (v.is_verified || v.identity_status === 'verified') {
      opAddHighlight({ key: 'verified', svg: OP_CHECK_SVG, t: 'Identity verified', s: 'Business identity confirmed by Lokali' });
    }
    // 'Books online' joins via watchAvailability() when the calendar mounts.
  }

  // ---- availability section adoption -------------------------------------
  // lokali-availability.js self-mounts (only for enabled Pro/Featured vendors)
  // into #lokali-availability or a self-made tab panel. In one-page mode,
  // adopt whatever it rendered into a proper stacked section with a heading +
  // nav link (before Reviews) + a "Books online" highlight row.
  function watchAvailability(main, nav) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var el = document.getElementById('lokali-availability');
      if (el && el.children.length) {
        clearInterval(iv);
        if (document.getElementById('vl-op-sec-availability')) return;
        var sec = ce('section', 'vl-op-sec');
        sec.id = 'vl-op-sec-availability';
        var h = ce('h2', 'vl-op-h');
        h.textContent = 'Availability & hours';
        sec.appendChild(h);
        // adopt the widget (and drop any stray self-made tab panel wrapper)
        var strayPanel = el.closest ? el.closest('[data-vl-panel="availability"]') : null;
        sec.appendChild(el);
        if (strayPanel && strayPanel.parentNode && !strayPanel.children.length) strayPanel.parentNode.removeChild(strayPanel);
        var reviews = document.getElementById('vl-op-sec-reviews');
        if (reviews && reviews.parentNode === main) main.insertBefore(sec, reviews);
        else main.appendChild(sec);
        var a = ce('a');
        a.id = 'vl-op-nav-availability';
        a.href = '#vl-op-sec-availability';
        a.textContent = 'Availability';
        a.addEventListener('click', function (ev) { ev.preventDefault(); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        var revLink = document.getElementById('vl-op-nav-reviews');
        if (revLink && revLink.parentNode === nav) nav.insertBefore(a, revLink);
        else nav.appendChild(a);
        opAddHighlight({ key: 'books', url: ICON_BOLT, tint: '#5F51B8', t: 'Books online', s: 'Check live availability and request a date' });
      } else if (tries > 40) {
        clearInterval(iv); // ~20s — vendor isn't on the availability feature
      }
    }, 500);
  }

  // ---- save / favorites: wire the designed #vl-save button to the Favorites API.
  // Reflects state on the button (class 'vl-save-on' + '.vl-save-label' text).
  // Signed-out: stash the pending vendor + a customer signup intent and open the
  // LokaliAuth sign-up overlay; lokali-favorites.js (listening on 'lokali:authed')
  // completes the save once the account exists — so the keys below are shared.
  function vlSetSaveUI(saved) {
    var btn = document.getElementById('vl-save');
    if (!btn) return;
    btn.classList.toggle('vl-save-on', !!saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.title = saved ? 'Saved' : 'Save vendor';
    var label = btn.querySelector('.vl-save-label');
    if (label) { label.textContent = saved ? 'Saved' : 'Save'; return; }
    // No label span — update the button's own text node, preserving the icon.
    var nodes = btn.childNodes;
    for (var i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].nodeType === 3 && nodes[i].nodeValue && nodes[i].nodeValue.trim()) {
        nodes[i].nodeValue = saved ? 'Saved' : 'Save vendor';
        return;
      }
    }
  }

  // Numeric vendor id for the Favorites API (never the slug). Prefer the resolved
  // currentVendorId; fall back to the hero data attribute / ?id=.
  function vlSaveVendorId() {
    if (currentVendorId != null && /^[0-9]+$/.test(String(currentVendorId))) return Number(currentVendorId);
    var el = document.querySelector('[data-lokali-vendor-id]');
    var a = el && el.getAttribute('data-lokali-vendor-id');
    if (a && /^[0-9]+$/.test(a.trim())) return Number(a.trim());
    var qp = new URLSearchParams(window.location.search || '').get('id');
    if (qp && /^[0-9]+$/.test(qp.trim())) return Number(qp.trim());
    return null;
  }

  function vlHasToken() { var A = window.LokaliAPI; return !!(A && A.getToken && A.getToken()); }

  function initSave() {
    var btn = document.getElementById('vl-save');
    if (!btn || btn.__lokaliSaveWired) return;
    btn.__lokaliSaveWired = true;
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      var API = window.LokaliAPI;
      var vid = vlSaveVendorId();
      if (!API || !vid) return;
      if (!vlHasToken()) {
        try { sessionStorage.setItem('lokali_pending_fav', String(vid)); } catch (e) {}
        try { sessionStorage.setItem('lokali_signup_intent', 'customer'); } catch (e) {}
        if (window.LokaliAuth && typeof window.LokaliAuth.openSignUp === 'function') window.LokaliAuth.openSignUp();
        else window.location.href = '/sign-up';
        return;
      }
      var was = btn.classList.contains('vl-save-on');
      var next = !was;
      vlSetSaveUI(next); // optimistic
      var p = next
        ? API.request('favorites', 'POST', '/favorites', { vendors_id: vid }, true)
        : API.request('favorites', 'DELETE', '/favorites/' + encodeURIComponent(vid), null, true);
      p.then(function (res) { if (res && res.error) vlSetSaveUI(was); })
       .catch(function () { vlSetSaveUI(was); });
    });
    // Reflect the save once the customer finishes a sign-up-to-save flow.
    window.addEventListener('lokali:authed', function () { setTimeout(refreshSaveState, 400); });
  }

  // Initial saved/unsaved state once we know the numeric id + have a token.
  function refreshSaveState() {
    var btn = document.getElementById('vl-save');
    var API = window.LokaliAPI;
    if (!btn || !API || !vlHasToken()) return;
    var vid = vlSaveVendorId();
    if (!vid) return;
    API.request('favorites', 'GET', '/favorites', null, true).then(function (res) {
      var rows = (res && res.data) || [];
      var saved = Array.isArray(rows) && rows.some(function (r) { return r && Number(r.vendors_id) === Number(vid); });
      vlSetSaveUI(saved);
    }).catch(function () {});
  }

  // ---- 2. vendor id resolution -----------------------------------------
  // Top-level Webflow paths that are real pages, never vendor slugs. The Worker
  // already serves real pages first; this is a belt-and-suspenders guard so the
  // /vendor template never mistakes its own path (or a sibling page) for a slug.
  var RESERVED_ROOT_SLUGS = [
    'vendor', 'vendors', 'about', 'pricing', 'the-market', 'login', 'sign-up',
    'vendor-dashboard', 'vendor-resources', 'vendor-signup', 'contact-us', 'blog',
    'search', 'product', 'product-detail', 'service', 'services', 'products',
    'locations', 'categories', 'category', 'checkout', 'order-confirmation',
    '401', '404', 'template-pages'
  ];

  function resolveVendorId() {
    if (window.LOKALI_PUBLIC_VENDOR_ID != null && window.LOKALI_PUBLIC_VENDOR_ID !== '') {
      return String(window.LOKALI_PUBLIC_VENDOR_ID);
    }
    var params = new URLSearchParams(window.location.search || '');
    var qp = params.get('id') || params.get('v') || params.get('vendor');
    if (qp) return qp.trim();
    var el = document.querySelector('[data-lokali-vendor-id]');
    if (el && el.getAttribute('data-lokali-vendor-id')) {
      var a = el.getAttribute('data-lokali-vendor-id').trim();
      if (a) return a;
    }
    var m = (window.location.pathname || '').match(/\/vendors?\/([^\/?#]+)/i);
    if (m && m[1]) return decodeURIComponent(m[1]);
    // Root-level clean URL: golokali.com/{slug} (the Cloudflare Worker rewrites
    // the /vendor template onto the clean path). Take the first path segment as
    // the slug, unless it's the template's own path or another reserved word.
    var segs = (window.location.pathname || '').split('/').filter(Boolean);
    if (segs.length === 1) {
      var first = decodeURIComponent(segs[0]).toLowerCase();
      if (RESERVED_ROOT_SLUGS.indexOf(first) === -1) return first;
    }
    // Clean About URL: golokali.com/{slug}/about (Worker serves the /vendor
    // template here too). Resolve the vendor and flag the About tab to open.
    if (segs.length === 2 && decodeURIComponent(segs[1]).toLowerCase() === 'about') {
      var vslug = decodeURIComponent(segs[0]).toLowerCase();
      if (RESERVED_ROOT_SLUGS.indexOf(vslug) === -1) { openAboutOnLoad = true; return vslug; }
    }
    return null;
  }

  // ---- helpers to read varied API field shapes --------------------------
  function unwrap(res) { return (res && res.data != null) ? res.data : res; }
  function asArray(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.items)) return raw.items;
      if (Array.isArray(raw.records)) return raw.records;
      if (Array.isArray(raw.data)) return raw.data;
    }
    return [];
  }
  function imgUrl(v) {
    var s = '';
    if (typeof v === 'string') s = v;
    else if (v && typeof v === 'object') s = v.url || v.path || '';
    if (!s || typeof s !== 'string') return '';
    s = s.trim();
    if (!s || /[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    return s;
  }

  // ---- price formatting -------------------------------------------------
  function cents(n) {
    var num = Number(n);
    if (!isFinite(num)) return '';
    return '$' + (num % 100 === 0 ? (num / 100).toFixed(0) : (num / 100).toFixed(2));
  }
  function servicePrice(s) {
    var t = (s.price_type || '').toLowerCase();
    if (t === 'quote' || t === 'get_a_quote' || s.is_quote_based) return { text: 'Get a quote', quote: true };
    if (s.price_min_cents != null && s.price_max_cents != null && s.price_min_cents !== s.price_max_cents) {
      return { text: cents(s.price_min_cents) + '–' + cents(s.price_max_cents), quote: false };
    }
    if (s.price_min_cents != null) return { text: 'From ' + cents(s.price_min_cents), quote: false };
    if (s.price_cents != null) return { text: (t === 'from' || t === 'starting' ? 'From ' : '') + cents(s.price_cents), quote: false };
    if (s.price_note) return { text: s.price_note, quote: true };
    return { text: 'Get a quote', quote: true };
  }
  function productPrice(p) {
    if (p.is_quote_based) return { text: 'Get a quote', quote: true };
    if (p.price != null && p.price !== '') {
      var num = Number(p.price);
      return { text: isFinite(num) ? '$' + num : String(p.price), quote: false };
    }
    if (p.price_note) return { text: p.price_note, quote: true };
    return { text: 'Get a quote', quote: true };
  }

  // ---- card rendering ---------------------------------------------------
  // Clean item URL when we have both the vendor slug and the item slug:
  //   /{vendorSlug}/services/{itemSlug}  ·  /{vendorSlug}/products/{itemSlug}
  // Otherwise fall back to the legacy ?id= detail-page link (still works).
  function itemHref(kind, item) {
    if (currentVendorSlug && item.slug) {
      return '/' + currentVendorSlug + '/' + kind + '/' + encodeURIComponent(item.slug);
    }
    var page = kind === 'services' ? '/service' : '/product-detail';
    return item.id != null
      ? (page + '?id=' + item.id + (currentVendorId != null ? '&vendor=' + currentVendorId : ''))
      : '#';
  }

  var IMG_TINTS = ['#FFF1E6', '#F3EBFF', '#EAFAF2', '#FEF9E6'];
  function cardEl(opts) {
    var a = document.createElement('a');
    a.className = 'vl-card';
    a.href = opts.href || '#';
    var priceClass = 'vl-card-price' + (opts.quote ? ' vl-card-price-quote' : '');
    var ctaClass = 'vl-card-cta' + (opts.orange ? ' vl-card-cta-orange' : '');
    a.innerHTML = '<div class="vl-card-img" style="background:' + opts.tint + ';"></div>' +
      '<div class="vl-card-body"><div class="vl-card-top">' +
      '<div class="vl-card-name"></div>' +
      '<div class="' + priceClass + '"></div></div>' +
      '<div class="vl-card-desc"></div>' +
      '<div class="vl-card-foot"><span class="' + ctaClass + '">' + (opts.cta || 'Inquire') + '</span></div></div>';
    // Build the image via properties (never interpolate vendor free-text into an
    // attribute string) so a crafted item title can't break out into stored XSS.
    if (opts.image) {
      var imgEl = document.createElement('img');
      imgEl.src = opts.image;
      imgEl.alt = opts.name || '';
      a.querySelector('.vl-card-img').appendChild(imgEl);
    }
    a.querySelector('.vl-card-name').textContent = opts.name || 'Untitled';
    a.querySelector('.vl-card-price').textContent = opts.price || '';
    a.querySelector('.vl-card-desc').textContent = opts.desc || '';
    return a;
  }

  function renderServices(list, ok) {
    // ok===false means the fetch failed — never hide the tab on a failure, only on a confirmed-empty success.
    if (ok === false) { console.warn('[lokali-vendor-listing] services fetch failed — keeping Services tab'); ensureActiveTab(); return; }
    var grid = document.getElementById('vl-services-grid');
    var empty = document.getElementById('vl-services-empty');
    var countEl = document.getElementById('vl-count-services'); if (countEl) countEl.textContent = String(list.length);
    setTabVisible('services', list.length > 0); // hide the tab entirely when there are no services
    if (!grid) { ensureActiveTab(); return; }
    grid.innerHTML = '';
    if (!list.length) { show(grid, false); show(empty, true); ensureActiveTab(); return; }
    show(grid, true); show(empty, false);
    list.forEach(function (s, i) {
      var p = servicePrice(s);
      grid.appendChild(cardEl({
        name: s.service_name || s.name,
        desc: s.service_description || s.description || '',
        price: p.text, quote: p.quote,
        image: imgUrl(s.image_url || s.image),
        tint: IMG_TINTS[i % IMG_TINTS.length],
        cta: p.quote ? 'Request quote' : 'Inquire',
        href: itemHref('services', s)
      }));
    });
    ensureActiveTab();
  }

  function renderProducts(list, ok) {
    if (ok === false) { console.warn('[lokali-vendor-listing] products fetch failed — keeping Products tab'); ensureActiveTab(); return; } // fetch failed — leave the tab as-is
    var grid = document.getElementById('vl-products-grid');
    var empty = document.getElementById('vl-products-empty');
    var countEl = document.getElementById('vl-count-products'); if (countEl) countEl.textContent = String(list.length);
    setTabVisible('products', list.length > 0); // hide the tab entirely when there are no products
    if (!grid) { ensureActiveTab(); return; }
    grid.innerHTML = '';
    if (!list.length) { show(grid, false); show(empty, true); ensureActiveTab(); return; }
    show(grid, true); show(empty, false);
    list.forEach(function (p, i) {
      var pr = productPrice(p);
      grid.appendChild(cardEl({
        name: p.product_name || p.name,
        desc: p.product_description || p.description || '',
        price: pr.text, quote: pr.quote,
        image: imgUrl(p.image_url || p.image),
        tint: IMG_TINTS[(i + 1) % IMG_TINTS.length],
        cta: 'Order', orange: true,
        href: itemHref('products', p)
      }));
    });
    ensureActiveTab();
  }

  // ---- click-to-enlarge lightbox (#63) ----------------------------------
  // Self-contained (no external lib). Lazily builds a full-screen overlay the
  // first time a photo is clicked. Dismiss on ✕ / Esc / backdrop click; prev/next
  // (arrows + ← → keys) when there's more than one photo. The <img> src is always
  // set via the property from a known photo URL (never innerHTML) — SEC-001 safe.
  var _lbApi = null;
  function ensureLightbox() {
    if (_lbApi) return _lbApi;
    var FONT = '"Plus Jakarta Sans",system-ui,sans-serif';
    var st = document.createElement('style');
    st.textContent = [
      '.lok-lb{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(20,16,40,.9);}',
      '.lok-lb.lok-lb-open{display:flex;}',
      '.lok-lb-img{max-width:92vw;max-height:88vh;border-radius:10px;box-shadow:0 16px 60px rgba(0,0,0,.55);user-select:none;-webkit-user-drag:none;}',
      '.lok-lb-btn{position:absolute;background:rgba(255,255,255,.16);border:none;color:#fff;cursor:pointer;border-radius:50%;width:44px;height:44px;font:400 24px/1 ' + FONT + ';display:flex;align-items:center;justify-content:center;transition:background .15s;}',
      '.lok-lb-btn:hover{background:rgba(255,255,255,.3);}',
      '.lok-lb-close{top:18px;right:18px;}',
      '.lok-lb-prev{left:18px;top:50%;transform:translateY(-50%);}',
      '.lok-lb-next{right:18px;top:50%;transform:translateY(-50%);}',
      '.lok-lb-count{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:#fff;font:600 13px/1 ' + FONT + ';background:rgba(255,255,255,.16);border-radius:100px;padding:7px 14px;}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
    var mkBtn = function (cls, txt, label) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'lok-lb-btn ' + cls;
      b.textContent = txt; b.setAttribute('aria-label', label); return b;
    };
    var ov = document.createElement('div'); ov.className = 'lok-lb'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    var img = document.createElement('img'); img.className = 'lok-lb-img'; img.alt = '';
    var close = mkBtn('lok-lb-close', '✕', 'Close');
    var prev = mkBtn('lok-lb-prev', '‹', 'Previous photo');
    var next = mkBtn('lok-lb-next', '›', 'Next photo');
    var count = document.createElement('div'); count.className = 'lok-lb-count';
    ov.appendChild(img); ov.appendChild(close); ov.appendChild(prev); ov.appendChild(next); ov.appendChild(count);
    document.body.appendChild(ov);
    var urls = [], idx = 0;
    var render = function () {
      img.src = urls[idx] || '';
      var multi = urls.length > 1;
      count.textContent = (idx + 1) + ' / ' + urls.length;
      prev.style.display = next.style.display = count.style.display = multi ? '' : 'none';
    };
    var go = function (d) { if (!urls.length) return; idx = (idx + d + urls.length) % urls.length; render(); };
    var closeIt = function () { ov.classList.remove('lok-lb-open'); img.removeAttribute('src'); document.body.style.overflow = ''; };
    close.addEventListener('click', closeIt);
    prev.addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
    next.addEventListener('click', function (e) { e.stopPropagation(); go(1); });
    img.addEventListener('click', function (e) { e.stopPropagation(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) closeIt(); });
    document.addEventListener('keydown', function (e) {
      if (!ov.classList.contains('lok-lb-open')) return;
      if (e.key === 'Escape') closeIt();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    });
    _lbApi = { open: function (list, start) {
      urls = (list || []).filter(Boolean); if (!urls.length) return;
      idx = Math.max(0, Math.min(start || 0, urls.length - 1));
      render(); ov.classList.add('lok-lb-open'); document.body.style.overflow = 'hidden';
    } };
    return _lbApi;
  }
  function openLightbox(urls, start) { ensureLightbox().open(urls, start); }

  // ---- portfolio gallery (Pro/Featured plans, max 5) --------------------
  var PORTFOLIO_MAX = 5;
  var PORTFOLIO_PLANS = ['pro', 'featured'];

  // null = unknown (no plan field on the public vendor) -> defer to server (empty list hides it)
  function planEligible(v) {
    var tier = (v.plan_tier || v.plan || v.plan_name || v.subscription_tier || v.tier || v.plan_slug || '');
    tier = String(tier).toLowerCase();
    if (!tier) return null;
    return PORTFOLIO_PLANS.some(function (p) { return tier.indexOf(p) >= 0; });
  }

  function wireStrip(strip, pips) {
    if (!strip) return;
    var pipEls = pips ? pips.querySelectorAll('.vd-pip') : [];
    strip.addEventListener('scroll', function () {
      if (!pipEls.length) return;
      var idx = Math.round(strip.scrollLeft / strip.offsetWidth);
      for (var i = 0; i < pipEls.length; i++) pipEls[i].classList.toggle('vd-pip-active', i === idx);
    }, { passive: true });
    var down = false, sx = 0, ss = 0;
    strip.addEventListener('mousedown', function (e) { down = true; sx = e.pageX; ss = strip.scrollLeft; strip.__lokDragged = false; });
    strip.addEventListener('mouseleave', function () { down = false; });
    strip.addEventListener('mouseup', function () { down = false; });
    strip.addEventListener('mousemove', function (e) { if (!down) return; e.preventDefault(); if (Math.abs(e.pageX - sx) > 6) strip.__lokDragged = true; strip.scrollLeft = ss - (e.pageX - sx); });
  }

  function loadPortfolio(vendorId, vendor) {
    var section = document.getElementById('vl-portfolio');
    if (!section || !vendorId || !window.LokaliAPI) return;
    if (planEligible(vendor) === false) return; // explicitly ineligible plan
    window.LokaliAPI.request('vendors', 'GET',
      'vendor/id/' + encodeURIComponent(vendorId) + '/portfolio/photos/list', null, false
    ).then(function (res) {
      var photos = asArray(unwrap(res))
        .filter(function (p) { return p && p.is_active !== false && imgUrl(p.image_url || p.image); })
        .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
        .slice(0, PORTFOLIO_MAX);
      if (!photos.length) return; // server enforces plan gating; empty => stay hidden
      var strip = document.getElementById('vl-portfolio-strip');
      var pips = document.getElementById('vl-portfolio-pips');
      if (!strip) return;
      strip.innerHTML = ''; if (pips) pips.innerHTML = '';
      var urls = photos.map(function (p) { return imgUrl(p.image_url || p.image); });
      photos.forEach(function (p, i) {
        var f = document.createElement('div');
        f.className = 'vd-frame ' + (i === 0 ? 'vd-frame-main' : 'vd-frame-peek');
        var img = document.createElement('img'); img.src = imgUrl(p.image_url || p.image); img.alt = '';
        img.style.cursor = 'zoom-in';
        // Click to enlarge — but ignore the click that ends a drag-scroll (#63).
        f.addEventListener('click', function () {
          if (strip.__lokDragged) { strip.__lokDragged = false; return; }
          openLightbox(urls, i);
        });
        f.appendChild(img); strip.appendChild(f);
        if (pips) { var pip = document.createElement('span'); pip.className = 'vd-pip' + (i === 0 ? ' vd-pip-active' : ''); pips.appendChild(pip); }
      });
      if (photos.length < 2 && pips) pips.style.display = 'none';
      wireStrip(strip, pips);
      // ONEPAGE photo-grid hero: the desktop grid template is keyed off how
      // many photos there are (5 = Airbnb big+4, 3 = big+2, etc. — see OP_CSS).
      section.setAttribute('data-op-count', String(photos.length));
      section.style.display = '';
    });
  }

  // ---- contact channels -------------------------------------------------
  // Log a direct-contact click as a lead event (fire-and-forget; the
  // tel:/sms:/mailto:/wa.me navigation proceeds untouched).
  function trackChannel(el, type) {
    if (!el) return;
    el.addEventListener('click', function () {
      if (window.LokaliAPI && window.LokaliAPI.leads && currentVendorId != null) {
        window.LokaliAPI.leads.trackEvent(currentVendorId, type, 'listing');
      }
    });
  }

  function initContact(v) {
    var name = v.business_name || 'this vendor';
    var email = v.contact_email;
    var phone = digits(v.phone_number);
    var foundCopy = "Hi " + name + ", I found you on Lokali and I'd love to learn more about your services.";

    var emailEl = document.getElementById('vl-ch-email');
    if (emailEl) {
      if (email) {
        emailEl.href = 'mailto:' + email +
          '?subject=' + encodeURIComponent('I found you on Lokali — inquiry') +
          '&body=' + encodeURIComponent(foundCopy);
      } else { show(emailEl, false); }
    }
    var smsEl = document.getElementById('vl-ch-sms');
    if (smsEl) {
      if (phone && v.text_messages) { smsEl.href = 'sms:+1' + phone + '?body=' + encodeURIComponent(foundCopy); }
      else { show(smsEl, false); }
    }
    var waEl = document.getElementById('vl-ch-whatsapp');
    if (waEl) {
      if (phone && v.whatsapp_messages) { waEl.href = 'https://wa.me/1' + phone + '?text=' + encodeURIComponent(foundCopy); }
      else { show(waEl, false); }
    }
    var callEl = document.getElementById('vl-ch-call');
    if (callEl) {
      // #76c: phone_calls===false means the vendor unticked "Customers can call
      // me" — missing/null (pre-patch rows) keeps the legacy always-show.
      if (phone && v.phone_calls !== false) { callEl.href = 'tel:+1' + phone; }
      else { show(callEl, false); }
    }
    // Label helper for the meta links (set by styleHeroChrome); falls back to
    // the static "Website"/"Instagram" text when there's no span to fill.
    function setLinkLabel(el, text) {
      var lbl = el && el.querySelector && el.querySelector('.vl-link-label');
      if (lbl && text) lbl.textContent = text;
    }
    var igEl = document.getElementById('vl-ig');
    var handle = v.instagram_handle || v.instagram;
    if (igEl) {
      if (handle) {
        var clean = String(handle).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
        igEl.href = 'https://instagram.com/' + clean;
        igEl.target = '_blank';
        igEl.rel = 'noopener';
        setLinkLabel(igEl, '@' + clean);
      } else { show(igEl, false); }
    }
    var webBtn = document.getElementById('vl-website');
    if (webBtn) {
      if (v.website_url) {
        var wbu = v.website_url;
        webBtn.href = /^https?:\/\//i.test(wbu) ? wbu : 'https://' + wbu;
        webBtn.target = '_blank';
        webBtn.rel = 'noopener';
        // Instagram-bio style: show the bare domain, not a generic "Website".
        var domain = String(wbu).replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
        setLinkLabel(webBtn, domain);
      } else { show(webBtn, false); }
    }
    // Neither link → drop the whole row (kills its top margin).
    var linksRow = document.getElementById('vl-links-row');
    if (linksRow && !v.website_url && !handle) show(linksRow, false);

    trackChannel(emailEl, 'email');
    trackChannel(smsEl, 'sms');
    trackChannel(waEl, 'whatsapp');
    trackChannel(callEl, 'call');
    trackChannel(igEl, 'instagram');
    trackChannel(webBtn, 'website');
    trackChannel(document.getElementById('vl-about-website'), 'website');
    syncOpBar(); // ONEPAGE mobile bar mirrors the real Call/message controls
  }

  // ---- hero + about population ------------------------------------------
  // #80 — slim "you're viewing your own storefront" bar at the top of the
  // page, only for the listing's owner. Idempotent; soft violet, PJS.
  function injectOwnerStorefrontBar() {
    if (document.querySelector('[data-vl-ownerbar]')) return;
    var bar = ce('div');
    bar.setAttribute('data-vl-ownerbar', '');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;' +
      'background:#F3EEFF;border-bottom:1px solid #E4DCF7;padding:10px 16px;' +
      "font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;color:#3b3654;text-align:center;";
    bar.innerHTML =
      '<span>🏪 You’re viewing your own storefront — this is what customers see.</span>' +
      '<a href="/vendor-dashboard/dashboard" style="background:#6E3CFF;color:#fff;font-weight:700;' +
      'font-size:13px;padding:7px 16px;border-radius:999px;text-decoration:none;font-family:inherit;' +
      'white-space:nowrap;">Back to my dashboard</a>';
    var page = document.querySelector('.vl-page');
    if (page && page.parentNode) page.parentNode.insertBefore(bar, page);
    else document.body.insertBefore(bar, document.body.firstChild);
  }

  // #90 publish gate — friendly "not public yet" page for direct slug hits on
  // a storefront that hasn't met the minimum bar. Never a 404: the row is
  // readable, only discovery is gated. Visitors get a soft check-back note;
  // the OWNER gets a requirements checklist + a dashboard link.
  function renderNotPublicState(v) {
    var API = window.LokaliAPI;
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    var page = document.querySelector('.vl-page') || document.querySelector('main') || document.body;
    // Hide the Webflow template content so placeholder data never shows.
    for (var i = 0; i < page.children.length; i++) page.children[i].style.display = 'none';

    var st = ce('style');
    st.textContent = [
      '.vl-np{font-family:"Plus Jakarta Sans",sans-serif;max-width:560px;margin:64px auto 96px;padding:40px 32px;',
      'background:linear-gradient(180deg,#faf7ff 0%,#fff 70%);border:1px solid #eee9fb;border-radius:20px;',
      'text-align:center;color:#3b3654;}',
      '.vl-np-emoji{font-size:40px;line-height:1;margin-bottom:14px;}',
      '.vl-np h1{font-size:26px;font-weight:800;color:#231d3f;margin:0 0 10px;font-family:inherit;}',
      '.vl-np p{font-size:16px;line-height:1.6;margin:0 0 20px;}',
      '.vl-np-list{text-align:left;margin:0 auto 22px;max-width:360px;padding:0;list-style:none;}',
      '.vl-np-list li{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:15px;}',
      '.vl-np-dot{width:22px;height:22px;border-radius:50%;flex:0 0 22px;display:flex;align-items:center;',
      'justify-content:center;font-size:13px;font-weight:700;}',
      '.vl-np-done{background:#e9f8ef;color:#1e7e46;}',
      '.vl-np-todo{background:#fdeee2;color:#c05621;}',
      '.vl-np-btn{display:inline-block;background:#6E3CFF;color:#fff;font-weight:700;font-size:15px;',
      'padding:12px 26px;border-radius:999px;text-decoration:none;font-family:inherit;}',
      '.vl-np-sub{display:block;margin-top:14px;font-size:14px;}',
      '.vl-np-sub a{color:#6E3CFF;text-decoration:underline;}'
    ].join('');
    document.head.appendChild(st);

    var card = ce('div', 'vl-np');
    function frag(html) { var d = ce('div'); d.innerHTML = html; return d; }
    // Visitor variant first — upgraded in place if the viewer owns this storefront.
    card.appendChild(frag(
      '<div class="vl-np-emoji">🌱</div>' +
      '<h1>This storefront isn’t public yet</h1>' +
      '<p>' + (v.business_name ? escapeHtml(v.business_name) : 'This vendor') +
      ' is still setting things up. Check back soon!</p>' +
      '<a class="vl-np-btn" href="/the-market">Browse local vendors</a>'
    ));
    page.appendChild(card);
    document.title = 'Coming soon — Lokali';

    // Owner variant: checklist of what's missing + dashboard link.
    if (API && API.vendors && API.vendors.me) {
      API.vendors.me().then(function (vm) {
        var mine = (vm && vm.data) || null;
        if (mine && mine.vendor) mine = mine.vendor;
        if (!mine || String(mine.id) !== String(v.id)) return;
        var catsOk = !!(v.categories_id && v.categories_id.length);
        var locsOk = !!(v.locations_id && v.locations_id.length);
        // name is always set at creation; if both fields are ok the only
        // remaining gap must be the live-listing requirement.
        function row(ok, label) {
          return '<li><span class="vl-np-dot ' + (ok ? 'vl-np-done">✓' : 'vl-np-todo">•') +
                 '</span>' + label + '</li>';
        }
        card.innerHTML =
          '<div class="vl-np-emoji">🚧</div>' +
          '<h1>Your storefront isn’t live yet</h1>' +
          '<p>Customers can’t find it on The Market until these are done:</p>' +
          '<ul class="vl-np-list">' +
          row(catsOk, 'Pick your category') +
          row(locsOk, 'Set your service area') +
          row(false, 'Add at least one service or product') +
          '</ul>' +
          '<a class="vl-np-btn" href="/vendor-dashboard/dashboard">Finish setting up</a>' +
          '<span class="vl-np-sub">It goes live automatically the moment everything’s in.</span>';
      }).catch(function () {});
    }
  }

  function populateVendor(v, labels) {
    setText('vl-name', v.business_name);
    setText('vl-tagline', v.business_tagline || '');
    var tagEl = document.getElementById('vl-tagline');
    if (tagEl && !(v.business_tagline)) show(tagEl, false);

    // avatar — show the photo, falling back to initials when there's no image (or it fails to load)
    var av = document.getElementById('vl-avatar');
    // The Webflow build left a literal <imgraw> placeholder element here — browsers
    // don't render it as an image, so swap it for a real <img> before setting src.
    if (av && av.tagName !== 'IMG') {
      var realImg = ce('img', av.className);
      realImg.id = av.id;
      realImg.alt = av.getAttribute('alt') || '';
      av.parentNode.replaceChild(realImg, av);
      av = realImg;
    }
    var circle = av ? av.parentNode : document.querySelector('.vl-avatar');
    var photo = photoUrl(v.profile_photo);
    function showInitials() {
      if (av) av.style.display = 'none';
      if (circle) {
        circle.classList.add('vl-avatar-initials');
        var txt = circle.querySelector('.vl-avatar-txt');
        if (!txt) { txt = ce('span', 'vl-avatar-txt'); circle.appendChild(txt); }
        txt.textContent = initials(v.business_name);
      }
    }
    if (av && photo) {
      av.style.display = '';
      av.addEventListener('error', showInitials);
      av.src = photo;
    } else {
      showInitials();
    }

    // badges
    show(document.getElementById('vl-badge-founding'), !!v.is_founding_member);
    // "Verified" = completed identity/business verification (a Pro/Featured perk),
    // NOT mere address geocoding. address_verified must not trigger this badge.
    show(document.getElementById('vl-badge-verified'), !!(v.is_verified || v.identity_status === 'verified'));
    // #86 (2026-07-18): the ★ Featured badge is REMOVED by decision — it read
    // as "pays more" and clashed with the founding badge. The old #73 injection
    // is gone and any static Webflow element is hidden. Placement ranking
    // (#75 plan_rank) and the server-synced is_featured column are untouched.
    show(document.getElementById('vl-badge-featured'), false);

    // category (first categories_id mapped via labels.categories)
    var catId = (Array.isArray(v.categories_id) && v.categories_id.length) ? v.categories_id[0] : null;
    var catName = '';
    if (catId != null && labels.categories) catName = labels.categories[catId] || '';
    if (catName) { setText('vl-category', catName); setText('vl-about-category', catName); }
    styleCategoryPill(catId); // colored pill + icon, matching the vendor card

    // area pills (locations_id mapped via labels.locations)
    var areas = document.getElementById('vl-areas');
    if (areas && Array.isArray(v.locations_id) && labels.locations) {
      var names = v.locations_id.map(function (id) { return labels.locations[id]; }).filter(Boolean);
      if (names.length) {
        areas.innerHTML = '';
        names.forEach(function (n) {
          var s = document.createElement('span'); s.className = 'vl-area-pill'; s.textContent = n; areas.appendChild(s);
        });
      }
    }

    // member since
    if (v.created_at) {
      var yr = new Date(v.created_at).getFullYear();
      if (yr) { setText('vl-since', 'Part of the Lokali community since ' + yr); setText('vl-about-since', yr); }
    }

    // about bio + website
    if (v.business_description) setText('vl-about-bio', v.business_description);
    var web = document.getElementById('vl-about-website');
    if (web) {
      if (v.website_url) {
        var u = v.website_url; var href = /^https?:\/\//i.test(u) ? u : 'https://' + u;
        web.href = href; web.textContent = u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
        web.target = '_blank';
      } else { web.textContent = '—'; web.removeAttribute('href'); }
    }

    renderPayLinks(v);
    initContact(v);
    if (ONEPAGE) { renderHighlights(v); renderMeetVendor(v, labels); }
    injectVendorReport(v);
    if (v.id != null) {
      var hero = document.querySelector('[data-lokali-vendor-id]');
      if (hero) hero.setAttribute('data-lokali-vendor-id', String(v.id));
    }
  }

  // ---- #76e Meet the Vendor (ONEPAGE only) -------------------------------
  // Renders ONLY when the vendor filled the optional personal fields
  // (owner_name / owner_bio / owner_photo — dashboard "Meet the Vendor" card):
  //   • a compact Airbnb-style host row as the first stacked section
  //     ("Run by {name}" + photo + Learn more → the About section)
  //   • a personal intro block (photo + bio) prepended inside About
  // All text via textContent (owner fields are vendor-typed), photo through
  // photoUrl() (scheme-sanitized).
  function renderMeetVendor(v, labels) {
    var name = (v.owner_name || '').trim();
    var bio = (v.owner_bio || '').trim();
    var langs = (v.owner_languages || '').trim();
    var photo = photoUrl(v.owner_photo);
    if (!name && !bio && !photo && !langs) return;
    if (document.getElementById('vl-op-sec-meet')) return;
    var main = document.querySelector('.vl-op-main');
    if (!main) return;

    // About section heading goes personal once we know who runs the place.
    if (name) {
      var aboutSec = document.getElementById('vl-op-sec-about');
      var aboutH = aboutSec && aboutSec.querySelector('.vl-op-h');
      if (aboutH) aboutH.textContent = 'More about ' + name + ' & the business';
    }

    function avatarEl(size) {
      var el;
      if (photo) {
        el = ce('img');
        el.src = photo; el.alt = '';
        el.style.cssText = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;flex:none;box-shadow:0 3px 10px rgba(26,24,41,.12);';
      } else {
        el = ce('div');
        el.style.cssText = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:#F3EBFF;color:#6002EE;display:flex;align-items:center;justify-content:center;font:600 ' + Math.round(size / 2.8) + 'px "Plus Jakarta Sans",sans-serif;flex:none;';
        el.textContent = initials(name || v.business_name);
      }
      return el;
    }

    // --- host row section (top) ---
    var sec = ce('section', 'vl-op-sec');
    sec.id = 'vl-op-sec-meet';
    var h = ce('h2', 'vl-op-h'); h.textContent = 'Meet the vendor';
    sec.appendChild(h);
    var row = ce('div');
    row.style.cssText = 'display:flex;align-items:center;gap:16px;font-family:"Plus Jakarta Sans",sans-serif;';
    row.appendChild(avatarEl(64));
    var txt = ce('div');
    var b = ce('div');
    b.style.cssText = 'font-weight:700;font-size:17px;color:#1A1829;';
    b.textContent = name ? 'Run by ' + name : ('Meet ' + (v.business_name || 'the vendor'));
    txt.appendChild(b);
    var subBits = [];
    if (v.is_founding_member) subBits.push('Founding vendor');
    if (v.created_at) { var yr = new Date(v.created_at).getFullYear(); if (yr) subBits.push('On Lokali since ' + yr); }
    if (langs) subBits.push('Speaks ' + langs);
    if (subBits.length) {
      var sub = ce('div');
      sub.style.cssText = 'color:#6B6880;font-weight:600;font-size:14px;';
      sub.textContent = subBits.join(' · ');
      txt.appendChild(sub);
    }
    row.appendChild(txt);
    var learn = ce('a');
    learn.href = '#vl-op-sec-about';
    learn.textContent = 'Learn more →';
    learn.style.cssText = 'margin-left:auto;font-weight:700;font-size:14px;color:#6002EE;text-decoration:none;white-space:nowrap;';
    learn.addEventListener('click', function (ev) { ev.preventDefault(); onepageScrollTo('about'); });
    row.appendChild(learn);
    sec.appendChild(row);
    main.insertBefore(sec, main.firstChild);

    // --- host card + bio inside the About section (mockup layout) ---
    var aboutPanel = $('[data-vl-panel="about"]');
    if (aboutPanel && (bio || photo || name)) {
      var block = ce('div', 'vl-meet-grid');
      block.id = 'vl-meet-about';
      var card = ce('div', 'vl-host-card');
      var av = avatarEl(88);
      av.style.margin = '0 auto 10px';
      card.appendChild(av);
      if (name) { var nm = ce('div', 'vl-host-nm'); nm.textContent = name; card.appendChild(nm); }
      var rl = ce('div', 'vl-host-rl');
      rl.textContent = v.business_name ? 'Founder, ' + v.business_name : 'The person behind the business';
      card.appendChild(rl);
      var stats = ce('div', 'vl-host-stats');
      function stat(k, val) {
        if (!val) return;
        var row = ce('div', 'vl-host-st');
        var sk = ce('span'); sk.textContent = k;
        var sv = ce('b'); sv.textContent = val;
        row.appendChild(sk); row.appendChild(sv); stats.appendChild(row);
      }
      stat('On Lokali since', v.created_at ? String(new Date(v.created_at).getFullYear()) : '');
      if (v.is_verified || v.identity_status === 'verified') stat('Identity', 'Verified');
      // Based in = the vendor's first service area (labels already resolved)
      var basedIn = '';
      if (Array.isArray(v.locations_id) && v.locations_id.length && labels && labels.locations) {
        basedIn = labels.locations[v.locations_id[0]] || '';
      }
      stat('Based in', basedIn);
      stat('Speaks', langs);
      card.appendChild(stats);
      block.appendChild(card);
      var bt = ce('div');
      if (bio) {
        var bp = ce('div', 'vl-meet-bio');
        bp.textContent = bio;
        bt.appendChild(bp);
      }
      block.appendChild(bt);
      aboutPanel.insertBefore(block, aboutPanel.firstChild);
    }
  }

  // ---- payment links (About tab) ----------------------------------------
  // Vendor-provided P2P handles → on-brand pay buttons in the About tab. Handles
  // are re-sanitized here (defense in depth) and the URL is built from a fixed
  // template — a raw handle never becomes an href. The generic link must be
  // https:// or it's dropped. Clicks log a lead_event (venmo|cashapp|paypal|other_pay).
  function _payHandle(raw) {
    if (raw == null) return '';
    var s = String(raw).trim().replace(/^[@$]/, '');
    return /^[A-Za-z0-9._-]{1,30}$/.test(s) ? s : '';
  }
  function _payHttps(raw) {
    if (!raw) return '';
    try { var u = new URL(String(raw).trim()); return u.protocol === 'https:' ? u.href : ''; }
    catch (e) { return ''; }
  }
  // Brand marks (Font Awesome 7 free, viewBox 640) as inline SVG — fill is
  // currentColor so each icon flips violet->white with its button on hover.
  // 'other' falls back to the FA dollar-sign (a generic pay link has no brand).
  var _PAY_ICONS = {
    venmo:   '<svg viewBox="0 0 640 640" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M530.5 78.8C547.9 107.5 555.8 137 555.8 174.3C555.8 293.3 453.9 447.8 371.1 556.4L182.2 556.4L106.4 104.9L271.8 89.2L311.9 410.5C349.3 349.7 395.5 254.2 395.5 189.1C395.5 153.5 389.4 129.2 379.8 109.2L530.5 78.8z"/></svg>',
    cashapp: '<svg viewBox="0 0 640 640" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M536.3 160.9C526.9 134.4 506 113.5 479.5 103.9C455.4 96 433.2 96 387.9 96L252 96C207.2 96 184.8 96 160.7 103.5C134.2 113.1 113.3 134 103.7 160.5C96 184.8 96 207.2 96 252.2L96 387.8C96 433 96 455.2 103.5 479.3C113.1 505.8 134 526.7 160.5 536.3C184.8 544 207.2 544 252.1 544L387.8 544C432.8 544 455.2 544 479.4 536.3C505.9 526.7 526.8 505.8 536.4 479.3C544.1 455 544.1 432.6 544.1 387.8L544.1 252.3C544.1 207.3 544.1 184.9 536.4 160.8zM419.1 249.4L393.3 270.5C391 272.4 387.8 272 386 269.6C372.8 253.4 352.3 244.2 329.9 244.2C304.9 244.2 289.3 255.1 289.3 270.4C288.9 283.2 301 290 338.4 298.1C385.6 308.1 407.1 327.8 407.1 360.8C407.1 402.2 373.4 432.7 320.7 436.1L315.6 460.6C315.2 462.9 313 464.7 310.5 464.7L269.9 464.7C266.5 464.7 264.1 461.5 264.8 458.3L271.2 431C245.2 423.5 224 409 211.9 391.3C210.4 389 210.8 386 213 384.3L241.2 362.3C243.5 360.4 247 361 248.7 363.4C263.6 384.3 286.7 396.7 314.4 396.7C339.4 396.7 358.2 384.5 358.2 367C358.2 353.6 348.8 347.4 317 340.8C262.8 329.1 241.2 309 241.2 275.9C241.2 237.5 273.4 208.7 322.1 204.9L327.4 179.5C327.8 177.2 330 175.4 332.5 175.4L372.4 175.4C375.6 175.4 378.2 178.4 377.5 181.6L371.3 210C392.2 216.4 409.3 227.9 420 242.2C421.7 244.3 421.3 247.5 419.1 249.2z"/></svg>',
    paypal:  '<svg viewBox="0 0 640 640" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M239.9 359.9C236.4 379.1 222.5 468.6 218.4 493.9C218.1 495.7 217.4 496.4 215.4 496.4L140.8 496.4C133.2 496.4 127.7 489.8 128.7 482.5L187.3 110.6C188.8 101 197.4 93.7 207.3 93.7C359.6 93.7 372.4 90 411.3 105.1C471.4 128.4 476.9 184.6 455.3 245.4C433.8 308 382.8 334.9 315.2 335.7C271.8 336.4 245.7 328.7 239.9 359.9zM485.6 216C483.8 214.7 483.1 214.2 482.6 217.3C480.6 228.7 477.5 239.8 473.8 250.9C433.9 364.7 323.3 354.8 269.3 354.8C263.2 354.8 259.2 358.1 258.4 364.2C235.8 504.6 231.3 533.9 231.3 533.9C230.3 541 234.8 546.8 241.9 546.8L305.4 546.8C314 546.8 321.1 540.5 322.8 531.9C323.5 526.5 321.7 538 337.2 440.6C341.8 418.6 351.5 420.9 366.5 420.9C437.5 420.9 492.9 392.1 509.4 308.6C515.9 273.8 514 237.2 485.6 216z"/></svg>',
    other:   '<svg viewBox="0 0 640 640" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M296 88C296 74.7 306.7 64 320 64C333.3 64 344 74.7 344 88L344 128L400 128C417.7 128 432 142.3 432 160C432 177.7 417.7 192 400 192L285.1 192C260.2 192 240 212.2 240 237.1C240 259.6 256.5 278.6 278.7 281.8L370.3 294.9C424.1 302.6 464 348.6 464 402.9C464 463.2 415.1 512 354.9 512L344 512L344 552C344 565.3 333.3 576 320 576C306.7 576 296 565.3 296 552L296 512L224 512C206.3 512 192 497.7 192 480C192 462.3 206.3 448 224 448L354.9 448C379.8 448 400 427.8 400 402.9C400 380.4 383.5 361.4 361.3 358.2L269.7 345.1C215.9 337.5 176 291.4 176 237.1C176 176.9 224.9 128 285.1 128L296 128L296 88z"/></svg>',
    // #77: Zelle has no official FA glyph — a bold Z in the same 20px frame.
    zelle:   '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 4h12v3.2L10.8 17H18v3H6v-3.2L13.2 7H6V4z"/></svg>'
  };
  function renderPayLinks(v) {
    var existing = document.getElementById('lok-pay-links');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var methods = [];
    var vm = _payHandle(v.venmo_username);
    if (vm) methods.push({ type: 'venmo', label: 'Venmo', href: 'https://venmo.com/u/' + vm, icon: _PAY_ICONS.venmo });
    var ca = _payHandle(v.cashapp_cashtag);
    if (ca) methods.push({ type: 'cashapp', label: 'Cash App', href: 'https://cash.app/$' + ca, icon: _PAY_ICONS.cashapp });
    var pp = _payHandle(v.paypalme_slug);
    if (pp) methods.push({ type: 'paypal', label: 'PayPal', href: 'https://paypal.me/' + pp, icon: _PAY_ICONS.paypal });
    // #77 Zelle — no link scheme exists, so the chip copies the vendor's Zelle
    // email/phone instead of navigating (charset re-checked here, defense in depth).
    var ze = String(v.zelle_contact || '').trim();
    if (!/^[A-Za-z0-9._@+\-() ]{3,80}$/.test(ze)) ze = '';
    if (ze) methods.push({ type: 'zelle', label: 'Zelle', copy: ze, icon: _PAY_ICONS.zelle });
    var other = _payHttps(v.other_pay_url);
    if (other) {
      var lbl = (v.other_pay_label && String(v.other_pay_label).trim())
        || String(other).replace(/^https:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
      methods.push({ type: 'other_pay', label: lbl, href: other, icon: _PAY_ICONS.other });
    }
    if (!methods.length) return;

    // ONEPAGE: payment buttons live in the sticky contact card ("readily
    // available to pay", decision 2026-07-17) instead of buried in About.
    if (ONEPAGE) {
      var slot = document.getElementById('vl-op-pay');
      if (slot) {
        var wrapOp = ce('div'); wrapOp.id = 'lok-pay-links';
        wrapOp.style.cssText = 'margin-top:12px;font-family:"Plus Jakarta Sans",sans-serif;';
        buildPayRow(wrapOp, v, methods);
        slot.innerHTML = '';
        slot.appendChild(wrapOp);
        return;
      }
    }

    // Its OWN row directly BELOW the Website detail. NB: .vl-about-website carries
    // class vl-detail-v, so closest('[class*="vl-detail"]') matched the link itself
    // and crammed this into the flex Website row — target .vl-detail-row instead.
    var anchor = document.getElementById('vl-about-website') || document.getElementById('vl-about-bio');
    if (!anchor) return;
    var row = (anchor.closest && anchor.closest('.vl-detail-row')) || anchor.parentNode;
    if (!row || !row.parentNode) return;

    var wrap = ce('div'); wrap.id = 'lok-pay-links';
    wrap.style.cssText = 'margin-top:14px;font-family:"Plus Jakarta Sans",sans-serif;';
    buildPayRow(wrap, v, methods);

    if (row.nextSibling) row.parentNode.insertBefore(wrap, row.nextSibling);
    else row.parentNode.appendChild(wrap);
  }

  // Shared builder for the pay row (label + brand icon buttons + disclaimer);
  // used by both mounts — the About section (tabbed) and the contact card (ONEPAGE).
  function buildPayRow(wrap, v, methods) {
    // ONEPAGE (mockup style): "Ways to pay" label above a row of labeled brand
    // chips. Tab mode keeps the original right-aligned icon circles.
    var line = ce('div');
    line.style.cssText = ONEPAGE
      ? 'display:block;'
      : 'display:flex;justify-content:space-between;align-items:center;gap:12px;';
    var k = ce('span', 'vl-detail-k');
    k.textContent = ONEPAGE ? 'Ways to pay' : ('Pay ' + (v.business_name || 'this vendor'));
    if (ONEPAGE) k.style.cssText = 'display:block;font-family:"Plus Jakarta Sans",sans-serif;font-size:14px;font-weight:700;color:#1A1829;margin-bottom:8px;';

    var btnRow = ce('div');
    btnRow.style.cssText = ONEPAGE
      ? 'display:flex;flex-wrap:wrap;gap:8px;'
      : 'display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;';
    methods.forEach(function (m) {
      var a = ce('a');
      if (m.copy) {
        a.href = '#'; // tap-to-copy (Zelle) — no navigation
      } else {
        a.href = m.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.setAttribute('aria-label', 'Pay via ' + m.label);
      a.innerHTML = m.icon; // set BEFORE appending the tooltip (innerHTML replaces children)
      var tip = null;
      if (ONEPAGE) {
        // Mockup style: labeled brand chip (icon + name). No hover tooltip —
        // the name is visible; a tip is created only for tap-to-copy feedback.
        a.className = 'vl-op-pay-chip';
        var lb = ce('span');
        lb.textContent = m.label;
        a.appendChild(lb);
        if (m.copy) {
          tip = ce('span');
          tip.textContent = m.label;
          tip.style.cssText = 'position:absolute;bottom:calc(100% + 8px);left:0;background:#6002EE;color:#fff;font-family:"Plus Jakarta Sans",sans-serif;font-size:11px;font-weight:600;padding:4px 8px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s;box-shadow:0 4px 12px rgba(38,10,80,.22);z-index:2;';
          a.appendChild(tip);
        }
      } else {
        a.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;flex:0 0 auto;color:#6002EE;background:#fff;border:1px solid #6002EE;border-radius:50%;text-decoration:none;transition:background .12s,color .12s;';
        // Hover tooltip with the app name for the recognizable brands only.
        // The generic "other" link gets NO label — its custom label is long enough
        // to cover the Website line, and the icon alone is the point (a vendor just
        // points customers to their Lokali page for the payment options).
        if (m.type !== 'other_pay') {
          tip = ce('span');
          tip.textContent = m.label;
          // Right-anchored so the rightmost icon's tooltip doesn't overflow the card.
          tip.style.cssText = 'position:absolute;bottom:calc(100% + 8px);right:0;background:#6002EE;color:#fff;font-family:"Plus Jakarta Sans",sans-serif;font-size:11px;font-weight:600;padding:4px 8px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s;box-shadow:0 4px 12px rgba(38,10,80,.22);z-index:2;';
          a.appendChild(tip);
        }
        a.addEventListener('mouseenter', function () { a.style.background = '#6002EE'; a.style.color = '#fff'; if (tip) tip.style.opacity = '1'; });
        a.addEventListener('mouseleave', function () { a.style.background = '#fff'; a.style.color = '#6002EE'; if (tip) tip.style.opacity = '0'; });
      }
      if (m.copy) {
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          var flash = function () {
            if (!tip) return;
            tip.textContent = 'Copied — pay in your bank app';
            tip.style.opacity = '1';
            setTimeout(function () { if (tip) { tip.textContent = m.label; tip.style.opacity = '0'; } }, 1800);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.copy).then(flash, flash);
          else flash();
        });
      }
      trackChannel(a, m.type);
      btnRow.appendChild(a);
    });
    line.appendChild(k);
    line.appendChild(btnRow);
    wrap.appendChild(line);

    var disc = ce('div');
    disc.textContent = "Payments go directly to the vendor. Lokali doesn't process or guarantee them.";
    disc.style.cssText = 'text-align:right;font-size:11px;color:#8E8BA6;line-height:1.4;margin-top:6px;';
    wrap.appendChild(disc);
  }

  // ---- labels (categories + locations) ----------------------------------
  function buildLabelMap(rows, idKeys, nameKeys) {
    var map = {};
    asArray(rows).forEach(function (r) {
      var id = null, nm = null;
      idKeys.forEach(function (k) { if (id == null && r[k] != null) id = r[k]; });
      nameKeys.forEach(function (k) { if (nm == null && r[k]) nm = r[k]; });
      if (id != null && nm) map[id] = nm;
    });
    return map;
  }

  // Retry wrapper for the per-vendor service/product fetches. Xano can cold-start or drop
  // the first request right after a (back-)navigation; the old code called these once with
  // no retry and no .catch, so any miss left the Webflow template's placeholder cards on
  // screen. This retries resolved-errors AND network rejections a few times with backoff,
  // then resolves to {error} so renderServices/renderProducts fall through cleanly.
  function fetchListWithRetry(fn, attempt) {
    attempt = attempt || 0;
    var MAX = 3;
    function later(next) {
      return new Promise(function (r) { setTimeout(function () { r(fetchListWithRetry(fn, next)); }, 300 * next); });
    }
    return fn().then(function (out) {
      if (out && out.error && attempt < MAX) return later(attempt + 1);
      return out;
    }, function (err) {
      if (attempt < MAX) return later(attempt + 1);
      return { error: err || true };
    });
  }

  // ---- 3/4. fetch + render ---------------------------------------------
  function hydrate() {
    if (!window.LokaliAPI) { console.warn('[lokali-vendor-listing] LokaliAPI not loaded'); return; }
    var id = resolveVendorId();
    if (!id) { console.warn('[lokali-vendor-listing] no vendor id in URL'); return; }
    var API = window.LokaliAPI;

    // Strip the Webflow template's placeholder service/product cards up front, so a slow or
    // failed fetch can never leave dummy data ("Custom birthday cakes", "Brownie gift box",
    // etc.) on screen. renderServices/renderProducts repopulate with real cards or the
    // empty state once the fetch resolves.
    ['vl-services-grid', 'vl-products-grid'].forEach(function (gid) {
      var g = document.getElementById(gid);
      if (g) g.innerHTML = '';
    });

    // Numeric → resolve by id (legacy ?id=). Non-numeric → treat as a slug and
    // resolve via GET vendor/slug/{slug} (falls back to id-lookup if the client
    // build doesn't yet have getBySlug).
    var isNumericId = /^[0-9]+$/.test(String(id));
    // Vendor identity is the critical fetch — retry it (Xano can cold-start or drop the
    // first request right after a navigation). Categories/locations are label data only:
    // wrap them so a reject can never abort the whole Promise.all and strand the hero on its
    // Webflow template placeholder ("Maria's Sweet Studio").
    var vendorFetch = fetchListWithRetry(function () {
      return (!isNumericId && API.vendors.getBySlug) ? API.vendors.getBySlug(id) : API.vendors.getById(id);
    });
    var catsFetch = (API.data.categories ? API.data.categories() : Promise.resolve({ data: [] }))
      .catch(function () { return { data: [] }; });
    var locsFetch = (API.data.locations ? API.data.locations() : Promise.resolve({ data: [] }))
      .catch(function () { return { data: [] }; });

    Promise.all([
      vendorFetch,
      catsFetch,
      locsFetch
    ]).then(function (res) {
      var v = unwrap(res[0]);
      if (v && v.vendor) v = v.vendor; // GET vendor/id/{id} returns { vendor: {...} }
      if (!v || (res[0] && res[0].error)) { console.warn('[lokali-vendor-listing] vendor fetch failed', res[0] && res[0].error); return; }
      // #90 publish gate — storefront exists but hasn't met the minimum bar
      // (category + service area + >=1 live listing). Render the friendly
      // "not public yet" state instead of the template page; the owner gets a
      // finish-setup checklist + dashboard link.
      if (v.is_publish_ready === false) { renderNotPublicState(v); return; }
      var labels = {
        categories: buildLabelMap(unwrap(res[1]), ['id', 'categories_id'], ['name', 'category_name', 'title']),
        locations: buildLabelMap(unwrap(res[2]), ['id', 'locations_id'], ['name', 'location_name', 'title'])
      };
      populateVendor(v, labels);
      document.title = (v.business_name || 'Vendor') + ' — Lokali';

      var vid = v.id != null ? v.id : id;
      currentVendorId = vid;
      refreshSaveState(); // light up the #vl-save button if this vendor is already saved
      // Slug for building clean item/about URLs. Prefer the vendor's real slug;
      // fall back to a non-numeric id used as the slug (legacy). Numeric id → no slug.
      currentVendorSlug = v.slug || (/^[0-9]+$/.test(String(id)) ? null : String(id).toLowerCase());
      // /{slug}/about deep-link: open the About tab (it's always visible).
      if (openAboutOnLoad) activateTab('about');
      // Announce the loaded vendor for companion scripts (lokali-inquiry.js
      // mounts the "Send an inquiry" button off this). Window var covers the
      // load-order race; the event covers scripts already listening.
      window.LOKALI_LOADED_VENDOR = { id: vid, name: v.business_name || '' };
      try { document.dispatchEvent(new CustomEvent('lokali:vendor-loaded', { detail: window.LOKALI_LOADED_VENDOR })); } catch (e) {}
      // Log a listing view, deduped per browser session so one visit = one row
      // (the analytics page needs impressions for the views→contacts→inquiries
      // funnel). Fire-and-forget; never blocks render.
      // A vendor previewing their OWN listing must NOT inflate their view count
      // — the metric should mean "other people looked at you". So for a
      // signed-in visitor we first resolve who they are (vendors.me is memoized,
      // one cheap call) and skip the emit when it's the owner. Anonymous
      // visitors — the common case — emit immediately, unchanged.
      try {
        var vkey = 'lok_viewed_' + vid;
        var canView = vid != null && window.LokaliAPI && window.LokaliAPI.leads &&
            typeof window.LokaliAPI.leads.trackView === 'function' &&
            !sessionStorage.getItem(vkey);
        if (canView) {
          var emitView = function () {
            sessionStorage.setItem(vkey, '1');
            window.LokaliAPI.leads.trackView(vid, 'listing');
          };
          var tok = window.LokaliAPI.getToken && window.LokaliAPI.getToken();
          if (!tok) {
            emitView();
          } else {
            // Signed in: skip only if this is the viewer's own vendor listing.
            window.LokaliAPI.vendors.me().then(function (res) {
              var mineId = res && res.data && res.data.vendor && res.data.vendor.id;
              if (mineId != null && Number(mineId) === Number(vid)) return; // owner preview — don't count
              emitView();
            }, function () { emitView(); }); // not a vendor / lookup failed — count it
          }
        }
      } catch (e) {}
      // #80 — storefront-mode banner. When a vendor lands on their OWN public
      // listing (View-my-storefront / View-my-listing buttons), the header
      // identity switcher shows "shopping", which read as being lost in the
      // wrong account. Decision 2026-07-19: say it plainly on the page — a
      // slim bar naming this as their storefront + a one-click way back.
      // vendors.me() is memoized (one cheap call); anonymous visitors skip.
      try {
        var tok80 = window.LokaliAPI.getToken && window.LokaliAPI.getToken();
        if (tok80 && window.LokaliAPI.vendors && window.LokaliAPI.vendors.me) {
          window.LokaliAPI.vendors.me().then(function (res80) {
            var mine80 = res80 && res80.data;
            if (mine80 && mine80.vendor) mine80 = mine80.vendor;
            if (!mine80 || mine80.id == null || Number(mine80.id) !== Number(vid)) return;
            injectOwnerStorefrontBar();
          }, function () {});
        }
      } catch (e) {}
      loadPortfolio(vid, v);
      fetchListWithRetry(function () { return API.services.listByVendor(vid); })
        .then(function (sres) { renderServices(asArray(unwrap(sres)), !(sres && sres.error)); });
      fetchListWithRetry(function () { return API.products.listByVendor(vid); })
        .then(function (pres) { renderProducts(asArray(unwrap(pres)), !(pres && pres.error)); });
      renderReviews(vid, v.business_name || '');
    });
  }

  // ---- reviews (public testimonials) ------------------------------------
  // Every public review passed the contact gate at create time, so each one is,
  // by definition, a "verified contact" recommendation. No star averages at
  // launch — a recommend boolean + the testimonial text. Empty state never shows
  // a zero ("Be the first to recommend"). The reviews tab is always shown.
  function injectReviewStyles() {
    if (document.getElementById('vl-rev-styles')) return;
    var s = document.createElement('style'); s.id = 'vl-rev-styles';
    var FONT = '"Plus Jakarta Sans",sans-serif';
    s.textContent = [
      '.vl-rev-summary{font:600 15px/1.4 ' + FONT + ';color:#1A1829;margin-bottom:1rem;}',
      '.vl-rev-summary strong{color:#6002EE;}',
      '.vl-rev{background:#fff;border:.5px solid #EEEDF6;border-radius:12px;padding:16px 18px;margin-bottom:12px;}',
      '.vl-rev-head{display:flex;align-items:center;gap:10px;margin-bottom:9px;}',
      '.vl-rev-av{width:38px;height:38px;border-radius:50%;background:#F3EBFF;color:#6002EE;font:600 13px/1 ' + FONT + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;text-transform:uppercase;}',
      '.vl-rev-name{font:600 14px/1.2 ' + FONT + ';color:#1A1829;}',
      '.vl-rev-verified{display:inline-flex;align-items:center;gap:4px;font:600 10.5px/1 ' + FONT + ';color:#2BB673;margin-top:3px;}',
      '.vl-rev-verified.vl-rev-contacted{color:#8E8BA6;font-weight:500;}',
      '.vl-rev-report{display:inline-block;margin-top:10px;font:500 11px/1 ' + FONT + ';color:#8E8BA6;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;}',
      '.vl-rev-report:hover{color:#C0392B;}',
      '.vl-rev-report-box{margin-top:10px;padding:10px 12px;background:#FBF7FF;border:.5px solid #E4DCF7;border-radius:8px;}',
      '.vl-rev-report-box textarea{width:100%;min-height:64px;font:400 12.5px/1.5 ' + FONT + ';color:#1A1829;border:.5px solid #C8C6D8;border-radius:6px;padding:8px;box-sizing:border-box;resize:vertical;background:#fff;}',
      '.vl-rev-report-actions{display:flex;gap:10px;margin-top:8px;align-items:center;}',
      '.vl-rev-report-send{font:600 12px/1 ' + FONT + ';color:#fff;background:#6002EE;border:none;border-radius:100px;padding:8px 16px;cursor:pointer;}',
      '.vl-rev-report-cancel{font:500 12px/1 ' + FONT + ';color:#8E8BA6;background:none;border:none;padding:0;cursor:pointer;}',
      '.vl-rev-report-done{margin-top:10px;font:600 11.5px/1.4 ' + FONT + ';color:#6002EE;}',
      '.vl-rev-reply-btn{display:inline-block;margin-top:10px;margin-right:14px;font:600 11.5px/1 ' + FONT + ';color:#6002EE;background:#F3EBFF;border:none;border-radius:100px;padding:6px 14px;cursor:pointer;}',
      '.vl-rev-reply-btn:hover{background:#E9DCFF;}',
      '.vl-vreport{margin-top:28px;padding-top:14px;border-top:.5px solid #EEEDF6;}',
      '.vl-vreport-link{font:500 11.5px/1 ' + FONT + ';color:#8E8BA6;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;}',
      '.vl-vreport-link:hover{color:#EE0290;}',
      '.vl-vreport-box{margin-top:10px;padding:12px;background:#FBF7FF;border:.5px solid #E4DCF7;border-radius:10px;max-width:480px;}',
      '.vl-vreport-box select{display:block;width:100%;font:500 12.5px/1.4 ' + FONT + ';color:#1A1829;border:.5px solid #C8C6D8;border-radius:6px;padding:8px;background:#fff;margin-bottom:8px;}',
      '.vl-vreport-box textarea{width:100%;min-height:64px;font:400 12.5px/1.5 ' + FONT + ';color:#1A1829;border:.5px solid #C8C6D8;border-radius:6px;padding:8px;box-sizing:border-box;resize:vertical;background:#fff;}',
      '.vl-vreport-note{font:400 11px/1.5 ' + FONT + ';color:#8E8BA6;margin-top:6px;}',
      '.vl-rev-pill{display:inline-flex;align-items:center;gap:5px;font:600 11px/1 ' + FONT + ';color:#2BB673;background:#E4F7EE;border-radius:100px;padding:4px 10px;margin-bottom:8px;}',
      '.vl-rev-pill.no{color:#C0392B;background:#FDECEC;}',
      '.vl-rev-body{font:400 13px/1.6 ' + FONT + ';color:#4A4761;}',
      '.vl-rev-reply{margin-top:10px;padding:10px 12px;background:#F7F6FC;border-radius:8px;border-left:2px solid #6002EE;}',
      '.vl-rev-reply-label{font:600 11px/1 ' + FONT + ';color:#6002EE;margin-bottom:4px;}',
      '.vl-rev-reply-body{font:400 12.5px/1.55 ' + FONT + ';color:#4A4761;}',
      '.vl-rev-when{font:500 11px/1 ' + FONT + ';color:#8E8BA6;margin-top:9px;}',
      '.vl-rev-empty{text-align:center;padding:2.5rem 1.5rem;border:.5px dashed #C8C6D8;border-radius:14px;background:#fff;}',
      '.vl-rev-empty-title{font:600 15px/1.3 ' + FONT + ';color:#1A1829;margin-bottom:5px;}',
      '.vl-rev-empty-sub{font:400 13px/1.5 ' + FONT + ';color:#8E8BA6;}',
      '.vl-rev-cta{display:inline-block;margin-top:14px;font:600 13px/1 ' + FONT + ';color:#6002EE;text-decoration:none;}'
    ].join('');
    document.head.appendChild(s);
  }

  function reviewWhen(v) {
    var t = (typeof v === 'number') ? v : Date.parse(v); if (!t || isNaN(t)) return '';
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var d = new Date(t); return M[d.getMonth()] + ' ' + d.getFullYear();
  }

  function reviewCard(r) {
    var card = ce('div', 'vl-rev');
    if (r.id != null) card.setAttribute('data-rev-id', String(r.id));
    var head = ce('div', 'vl-rev-head');
    var av = ce('div', 'vl-rev-av'); av.textContent = initials(r.author_name || 'A neighbor');
    head.appendChild(av);
    var who = ce('div', 'vl-rev-who');
    var nm = ce('div', 'vl-rev-name'); nm.textContent = r.author_name || 'A neighbor';
    who.appendChild(nm);
    // Two trust tiers: inquiry-sourced reviews (Lokali provably delivered the
    // message) get the green "Verified contact" check; click-sourced ones
    // (call/sms/whatsapp/email intent) get a neutral "Contacted through Lokali".
    var isVerified = r.is_verified_contact === true;
    var ver = ce('div', 'vl-rev-verified' + (isVerified ? '' : ' vl-rev-contacted'));
    if (isVerified) {
      ver.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      ver.appendChild(document.createTextNode(' Verified contact'));
    } else {
      ver.textContent = 'Contacted through Lokali';
    }
    who.appendChild(ver);
    head.appendChild(who);
    card.appendChild(head);
    var rec = !!r.is_recommended;
    var pill = ce('div', 'vl-rev-pill' + (rec ? '' : ' no'));
    pill.textContent = rec ? '👍 Recommends' : '👎 Doesn’t recommend';
    card.appendChild(pill);
    if (r.comment) { var b = ce('div', 'vl-rev-body'); b.textContent = r.comment; card.appendChild(b); }
    if (r.vendor_reply) {
      var rep = ce('div', 'vl-rev-reply');
      var rl = ce('div', 'vl-rev-reply-label'); rl.textContent = 'Response from the owner';
      var rb = ce('div', 'vl-rev-reply-body'); rb.textContent = r.vendor_reply;
      rep.appendChild(rl); rep.appendChild(rb); card.appendChild(rep);
    }
    if (r.created_at) { var w = ce('div', 'vl-rev-when'); w.textContent = reviewWhen(r.created_at); card.appendChild(w); }
    return card;
  }

  // ---- customer → vendor fraud flagging -----------------------------------
  // Quiet "Report this vendor" link at the bottom of the About panel, for
  // signed-in users who are NOT the owner (owners get the review-report flow
  // instead; anonymous visitors have the contact form). Reporting never hides
  // the listing — it queues a vendor_reports row for Lokali moderation.
  var VREPORT_CATEGORIES = [
    ['scam', 'Scam — took money / never showed'],
    ['not_real', 'Not a real business'],
    ['misleading', 'Misleading listing or photos'],
    ['inappropriate', 'Inappropriate content'],
    ['other', 'Something else']
  ];

  function injectVendorReport(v) {
    var API = window.LokaliAPI;
    if (!v || v.id == null || !API || !API.auth || !API.auth.getToken || !API.auth.getToken()) return;
    // reportVendor lives under the `reviews` group in the client (it POSTs to
    // vendor/id/{id}/report). The old `API.vendors.reportVendor` guard was
    // always falsey → this whole "Report this vendor" button never rendered on
    // live (pre-existing bug, surfaced during the 2026-07-07 Supabase audit).
    if (!API.reviews || !API.reviews.reportVendor) return;
    var mount = $('[data-vl-panel="about"]') || $('[data-vl-panel="reviews"]');
    if (!mount || mount.querySelector('.vl-vreport')) return;
    injectReviewStyles();
    var render = function () {
      if (mount.querySelector('.vl-vreport')) return;
      var wrap = ce('div', 'vl-vreport');
      var link = ce('button', 'vl-vreport-link');
      link.type = 'button';
      // Font Awesome Free "flag" (regular), fill flattened to currentColor so
      // it follows the link's gray → hover-red states.
      link.innerHTML = '<svg width="12" height="12" viewBox="0 0 640 640" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-1px;margin-right:5px;" aria-hidden="true"><path fill="currentColor" d="M144 88C144 74.7 133.3 64 120 64C106.7 64 96 74.7 96 88L96 552C96 565.3 106.7 576 120 576C133.3 576 144 565.3 144 552L144 452L224.3 431.9C265.4 421.6 308.9 426.4 346.8 445.3C391 467.4 442.3 470.1 488.5 452.7L523.2 439.7C535.7 435 544 423.1 544 409.7L544 130C544 107 519.8 92 499.2 102.3L489.6 107.1C443.3 130.3 388.8 130.3 342.5 107.1C307.4 89.5 267.1 85.1 229 94.6L144 116L144 88zM144 165.5L240.6 141.3C267.6 134.6 296.1 137.7 321 150.1C375.9 177.5 439.7 179.8 496 156.9L496 398.7L471.6 407.8C437.9 420.4 400.4 418.5 368.2 402.4C320 378.3 264.9 372.3 212.6 385.3L144 402.5L144 165.5z"/></svg>';
      link.appendChild(document.createTextNode('Report this vendor'));
      link.addEventListener('click', function () { openVendorReportBox(wrap, link, v.id); });
      wrap.appendChild(link);
      mount.appendChild(wrap);
    };
    // Hide from the listing's own vendor (server blocks self-reports anyway).
    if (API.vendors.me) {
      API.vendors.me().then(function (vm) {
        var mine = (vm && vm.data) || null;
        if (mine && mine.vendor) mine = mine.vendor;
        if (mine && String(mine.id) === String(v.id)) return;
        render();
      }).catch(render);
    } else { render(); }
  }

  function openVendorReportBox(wrap, link, vendorId) {
    if (wrap.querySelector('.vl-vreport-box')) return;
    link.style.display = 'none';
    var box = ce('div', 'vl-vreport-box');
    var sel = document.createElement('select');
    VREPORT_CATEGORIES.forEach(function (c) {
      var o = document.createElement('option'); o.value = c[0]; o.textContent = c[1]; sel.appendChild(o);
    });
    var ta = document.createElement('textarea');
    ta.placeholder = 'Tell us what happened — the more detail, the faster we can act.';
    ta.maxLength = 1000;
    var actions = ce('div', 'vl-rev-report-actions');
    var send = ce('button', 'vl-rev-report-send'); send.type = 'button'; send.textContent = 'Send report';
    var cancel = ce('button', 'vl-rev-report-cancel'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { box.remove(); link.style.display = ''; });
    send.addEventListener('click', function () {
      var reason = String(ta.value || '').trim();
      if (reason.length < 5) { ta.focus(); return; }
      send.disabled = true; send.textContent = 'Sending…';
      window.LokaliAPI.reviews.reportVendor(vendorId, sel.value, reason).then(function (res) {
        if (res && res.error) { send.disabled = false; send.textContent = 'Send report'; return; }
        var done = ce('div', 'vl-rev-report-done');
        done.textContent = 'Thank you — the Lokali team will look into this.';
        box.replaceWith(done);
      }).catch(function () { send.disabled = false; send.textContent = 'Send report'; });
    });
    actions.appendChild(send); actions.appendChild(cancel);
    var note = ce('div', 'vl-vreport-note');
    note.textContent = 'Reports are reviewed by a person — we may follow up at your account email. The listing stays visible while we check.';
    box.appendChild(sel); box.appendChild(ta); box.appendChild(actions); box.appendChild(note);
    wrap.appendChild(box);
    ta.focus();
  }

  // ---- vendor-owner review controls --------------------------------------
  // If the signed-in user OWNS this listing, each review card gets owner-only
  // controls: a "Reply" button → inline box → PATCH vendor/me/reviews/{id}/reply
  // (public "Response from the owner"), shown only while the review has no reply
  // yet; and a quiet "Report" link → POST .../report for fraudulent reviews.
  // Neither ever hides the review — replies are public, reports queue for
  // Lokali moderation. One vendors.me() resolves the owner for both.
  function maybeAddReportButtons(panel, vendorId) {
    var API = window.LokaliAPI;
    if (!API || !API.auth || !API.auth.getToken || !API.auth.getToken()) return;
    if (!API.vendors || !API.vendors.me || !API.reviews || !API.reviews.report) return;
    API.vendors.me().then(function (vm) {
      var v = (vm && vm.data) || null;
      if (v && v.vendor) v = v.vendor; // unwrap if nested
      if (!v || String(v.id) !== String(vendorId)) return; // not the owner
      var canReply = !!API.reviews.reply;
      $all('[data-rev-id]', panel).forEach(function (card) {
        // Reply — only when this review has no owner response yet.
        if (canReply && !card.querySelector('.vl-rev-reply') && !card.querySelector('.vl-rev-reply-btn')) {
          var rbtn = ce('button', 'vl-rev-reply-btn');
          rbtn.type = 'button';
          rbtn.textContent = 'Reply';
          rbtn.addEventListener('click', function () { openReplyBox(card, rbtn); });
          card.appendChild(rbtn);
        }
        if (card.querySelector('.vl-rev-report')) return;
        var btn = ce('button', 'vl-rev-report');
        btn.type = 'button';
        btn.textContent = 'Report as fraudulent';
        btn.addEventListener('click', function () { openReportBox(card, btn); });
        card.appendChild(btn);
      });
    }).catch(function () {});
  }

  // Owner-only inline reply composer on a review card. On success it drops the
  // "Response from the owner" block into the card (above the date) and removes
  // the Reply button — mirroring how reviewCard() renders a persisted reply.
  function openReplyBox(card, btn) {
    if (card.querySelector('.vl-rev-reply-box')) return;
    btn.style.display = 'none';
    var box = ce('div', 'vl-rev-report-box'); box.classList.add('vl-rev-reply-box');
    var ta = document.createElement('textarea');
    ta.placeholder = 'Write a public reply — a quick thank-you goes a long way.';
    ta.maxLength = 1000;
    var actions = ce('div', 'vl-rev-report-actions');
    var send = ce('button', 'vl-rev-report-send'); send.type = 'button'; send.textContent = 'Post reply';
    var cancel = ce('button', 'vl-rev-report-cancel'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { box.remove(); btn.style.display = ''; });
    send.addEventListener('click', function () {
      var reply = String(ta.value || '').trim();
      if (reply.length < 1) { ta.focus(); return; }
      send.disabled = true; send.textContent = 'Posting…';
      window.LokaliAPI.reviews.reply(card.getAttribute('data-rev-id'), reply).then(function (res) {
        if (res && res.error) { send.disabled = false; send.textContent = 'Post reply'; return; }
        var rep = ce('div', 'vl-rev-reply');
        var rl = ce('div', 'vl-rev-reply-label'); rl.textContent = 'Response from the owner';
        var rb = ce('div', 'vl-rev-reply-body'); rb.textContent = reply;
        rep.appendChild(rl); rep.appendChild(rb);
        var when = card.querySelector('.vl-rev-when');
        if (when) card.insertBefore(rep, when); else card.appendChild(rep);
        box.remove();
      }).catch(function () { send.disabled = false; send.textContent = 'Post reply'; });
    });
    actions.appendChild(send); actions.appendChild(cancel);
    box.appendChild(ta); box.appendChild(actions);
    card.appendChild(box);
    ta.focus();
  }

  function openReportBox(card, btn) {
    if (card.querySelector('.vl-rev-report-box')) return;
    btn.style.display = 'none';
    var box = ce('div', 'vl-rev-report-box');
    var ta = document.createElement('textarea');
    ta.placeholder = 'Why do you believe this review is fake? (e.g. never a customer, wrong business, spam)';
    ta.maxLength = 1000;
    var actions = ce('div', 'vl-rev-report-actions');
    var send = ce('button', 'vl-rev-report-send'); send.type = 'button'; send.textContent = 'Send report';
    var cancel = ce('button', 'vl-rev-report-cancel'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { box.remove(); btn.style.display = ''; });
    send.addEventListener('click', function () {
      var reason = String(ta.value || '').trim();
      if (reason.length < 5) { ta.focus(); return; }
      send.disabled = true; send.textContent = 'Sending…';
      window.LokaliAPI.reviews.report(card.getAttribute('data-rev-id'), reason).then(function (res) {
        if (res && res.error) { send.disabled = false; send.textContent = 'Send report'; return; }
        var done = ce('div', 'vl-rev-report-done');
        done.textContent = 'Flagged for review — the Lokali team will take a look. The review stays visible while we check.';
        box.replaceWith(done);
      }).catch(function () { send.disabled = false; send.textContent = 'Send report'; });
    });
    actions.appendChild(send); actions.appendChild(cancel);
    box.appendChild(ta); box.appendChild(actions);
    card.appendChild(box);
    ta.focus();
  }

  function renderReviews(vendorId, vendorName) {
    var panel = $('[data-vl-panel="reviews"]');
    if (!panel) return;
    injectReviewStyles();
    setTabVisible('reviews', true); // always shown — never-zero "be the first" design
    var API = window.LokaliAPI;
    if (!API || !API.reviews || !API.reviews.forVendor) { ensureActiveTab(); return; }
    API.reviews.forVendor(vendorId).then(function (res) {
      var data = res && res.data; var items = (data && (data.items || data)) || [];
      if (!Array.isArray(items)) items = [];
      panel.innerHTML = '';
      if (items.length) {
        var rec = items.filter(function (r) { return r.is_recommended; }).length;
        var sum = ce('div', 'vl-rev-summary');
        var strong = ce('strong'); strong.textContent = String(rec);
        sum.appendChild(strong);
        sum.appendChild(document.createTextNode(' ' + (rec === 1 ? 'neighbor recommends ' : 'neighbors recommend ') + (vendorName || 'this vendor')));
        panel.appendChild(sum);
        items.forEach(function (r) { panel.appendChild(reviewCard(r)); });
        maybeAddReportButtons(panel, vendorId);
      } else {
        var e = ce('div', 'vl-rev-empty');
        var t = ce('div', 'vl-rev-empty-title'); t.textContent = 'Be the first to recommend ' + (vendorName || 'this vendor');
        var sub = ce('div', 'vl-rev-empty-sub'); sub.textContent = 'Contacted them through Lokali? Share how it went.';
        var cta = ce('a', 'vl-rev-cta'); cta.href = '/account#reviews'; cta.textContent = 'Leave a review →';
        e.appendChild(t); e.appendChild(sub); e.appendChild(cta);
        panel.appendChild(e);
      }
      // #reviews deep-link (the review-notification email points here so the
      // owner lands straight on the Reviews tab where the Reply controls are).
      if ((window.location.hash || '').toLowerCase() === '#reviews') activateTab('reviews');
      else ensureActiveTab();
    }).catch(function () {
      if ((window.location.hash || '').toLowerCase() === '#reviews') activateTab('reviews');
      else ensureActiveTab();
    });
  }

  function init() { injectStyles(); styleHeroChrome(); if (ONEPAGE) onepageLayout(); initTabs(); initSave(); hydrate(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
