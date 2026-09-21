/**
 * Lokali — vendor dashboard sidebar account chip.
 *
 * The chip STRUCTURE is built natively in the Webflow "Vendor Dashboard Sidebar"
 * component (editable in the Designer). This script:
 *   - fills the avatar / business name / plan (plan comes from the BILLING
 *     endpoint — the vendor row itself carries no plan field)
 *   - toggles the expand/collapse menu, and forces it to open UPWARD (the chip
 *     sits at the bottom of the viewport; the native menu opened downward and
 *     rendered entirely below the fold — bug #36)
 *   - hides the "Upgrade" row for top-tier vendors
 *   - regroups the main nav (Dashboard / YOUR STOREFRONT / GROW), badges unread
 *     leads, marks the storefront row as external, locks (not hides) Marketing
 *     on Free — F 2026-09-17, mockup tab F
 *   - appends a "My Customer Account" row -> /account (bug #37: there was no
 *     way back from the vendor dashboard to the customer side)
 *   - retries once if the first fetch fails (transient rate limit)
 *
 * Native element hooks (classes, set in Webflow):
 *   .lok-acct (wrapper, gets .open) · .lok-acct-chip (click target)
 *   .lok-acct-av · .lok-acct-name · .lok-acct-plan · .lok-acct-upgrade
 *
 * Load site-wide (footer), after lokali-api-client.js. See the maintainer guide.
 */
(function () {
  'use strict';

  // #36 + polish: open the menu ABOVE the chip, and lay the native
  // .dashboard-btn rows out horizontally (icon beside label, not stacked).
  // #67 — one type ramp for EVERY row. Natively the menu mixes two row kinds:
  // .dashboard-btn (Settings/Logout, bold <strong> labels) and .lok-acct-row
  // (Upgrade/Help + our injected rows, plain anchors, no padding) — which is
  // exactly the font-size/weight inconsistency Francesca flagged. Both kinds
  // now share the same font, size, weight, color, padding, radius and hover.
  var MENU_CSS =
    '.lok-acct .lok-acct-menu{top:auto !important;bottom:calc(100% + 6px) !important;' +
      'background:#fff;border:1px solid #ECECF4;border-radius:12px;' +
      'box-shadow:0 12px 32px rgba(38,10,80,0.12);padding:6px;left:0;right:0;min-width:0;width:auto;}' +
    '.lok-acct .lok-acct-menu .dashboard-btn,' +
    '.lok-acct .lok-acct-menu .lok-acct-row{' +
      'display:flex;flex-direction:row;align-items:center;gap:8px;padding:9px 10px;' +
      "font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:600;" +
      'color:#44445A;line-height:1.2;text-decoration:none;border-radius:8px;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .12s ease,color .12s ease;}' +
    // Neutralize the native bold <strong> so Settings/Logout match the rest.
    '.lok-acct .lok-acct-menu .dashboard-btn strong.dashboard-menu{' +
      "font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:600;}" +
    '.lok-acct .lok-acct-menu .dashboard-btn:hover,' +
    '.lok-acct .lok-acct-menu .lok-acct-row:hover{background:#F3EBFF;color:#6002EE;}' +
    '.lok-acct .lok-acct-menu .dashboard-btn .icon-div{width:24px;height:24px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;}' +
    '.lok-acct .lok-acct-menu .dashboard-btn .icon-div img{width:16px;height:16px;}' +
    // #51 — icon-bearing rows line up like the Settings row: icon box + label.
    '.lok-acct .lok-acct-menu .lok-acct-row .lok-row-ic{width:24px;height:24px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;}' +
    '.lok-acct .lok-acct-menu .lok-acct-row .lok-row-ic svg{width:16px;height:16px;display:block;}' +
    // #67 — quiet divider before Logout.
    '.lok-acct .lok-acct-menu #button-logout{border-top:1px solid #EFEFF5;margin-top:6px;padding-top:10px;border-radius:0 0 8px 8px;}' +
    // #67 — chip layout: caret right-aligned and vertically centered against
    // the whole chip (it used to hug the name/plan column — "mis-placed").
    '.lok-acct .lok-acct-chip{display:flex;align-items:center;gap:10px;cursor:pointer;}' +
    '.lok-acct .lok-acct-chip .lok-acct-meta{flex:1 1 auto;min-width:0;}' +
    '.lok-acct .lok-acct-chip .lok-acct-name{font-family:\'Plus Jakarta Sans\',sans-serif;font-size:13.5px;font-weight:700;color:#2E2E3F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.lok-acct .lok-acct-chip .lok-acct-plan{font-family:\'Plus Jakarta Sans\',sans-serif;font-size:12px;font-weight:500;color:#6E6A85;}' + // 2026-09-21: was 11.5px #8A8AA0 = 3.37:1
    '.lok-acct .lok-acct-caret{margin-left:auto;flex:0 0 auto;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#6B6B80;transition:transform .18s ease,background .12s ease,color .12s ease;}' +
    '.lok-acct .lok-acct-caret svg{width:14px;height:14px;display:block;}' +
    '.lok-acct .lok-acct-chip:hover .lok-acct-caret{background:#F3EBFF;color:#6002EE;}' +
    // #67 round 2 (Francesca 2026-07-09) — page-layout fixes, safe here because
    // this CSS is only injected on pages that have the sidebar chip:
    // (1) The sidebar's in-flow wrapper (.div-block-27, 186px) still occupied
    //     layout width even though the actual sidebar (.section-11) is
    //     position:fixed AND the v1.4.21 fix already offsets the body by
    //     230px — a doubled offset that left ~186px of dead space and made
    //     the left rail read "way too wide". Collapse the wrapper; the fixed
    //     sidebar child is unaffected by its parent's width.
    '.div-block-27{width:0 !important;min-width:0 !important;flex:0 0 0 !important;}' +
    // (2) The KPI-card row sat at the exact pixel the page heading ends —
    //     give the "Good to see you" header breathing room.
    '.div-block-41{margin-top:20px !important;}' +
    // #67 round 5 — (3) unify the content offset. lokali-dashboard.js pads the
    // body 200px (stale: the rail was once 200 wide; it's 230 now), so on
    // every page except dashboard-home (whose page embed pads 230) content
    // started 30px UNDER the rail with ~10px visible gap. One value, all pages.
    '@media (min-width:992px){body{padding-left:230px !important;}}' +
    // (4) current-page nav row: Webflow stamps w--current but styles nothing —
    // give it the solid pressed state so vendors can see where they are.
    '.section-11 .dashboard-btn.w--current{background:#F3EBFF;border-radius:8px;}' +
    '.section-11 .dashboard-btn.w--current,.section-11 .dashboard-btn.w--current strong.dashboard-menu{color:#6002EE;}' +
    // Slimmer main-nav rows (container = .div-block-28, NOT the account dropdown).
    // Each row was 52px — a 40px icon box (holding a 20px icon) plus 6px top/bottom
    // padding — so the hover + pressed pills read as chunky blocks. Trim the
    // padding and the oversized icon box → ~36px pills, plus a 5px gap between rows
    // so adjacent hover/pressed pills have clear breathing room (Francesca).
    '.div-block-28 .dashboard-btn{padding-top:4px;padding-bottom:4px;margin-bottom:5px;}' +
    '.div-block-28 .dashboard-btn .icon-div{height:28px;}';

  // #67 — a real chevron instead of the native "⌄" text glyph (which sat on
  // the text baseline and read as floating/misaligned).
  var CARET_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  // #51 — 16px stroke icons (currentColor, so they inherit each row's text
  // color) for the rows that shipped without one; sized to match Settings.
  var ROW_ICONS = {
    upgrade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.9 6.26L21 9.27l-4.5 4.38L17.8 20 12 16.77 6.2 20l1.3-6.35L3 9.27l6.1-1.01z"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    // #66 — shopping side of the identity switcher: outline cart-shopping,
    // stroke to match the other menu-row icons (no special colour here — see the
    // menu CSS; the row icon inherits the row's neutral/hover colour like the rest).
    shopping: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>'
  };

  function addRowIcon(row, key) {
    if (!row || row.querySelector('.lok-row-ic')) return;
    var ic = document.createElement('span');
    ic.className = 'lok-row-ic';
    ic.innerHTML = ROW_ICONS[key] || '';
    row.insertBefore(ic, row.firstChild);
  }

  // #67(a) — the native row says "Upgrade to Featured", but a vendor could go
  // to Pro OR Featured, so don't hard-code the tier. Swaps only the label
  // text node, preserving the injected icon span.
  function setRowLabel(row, label) {
    if (!row) return;
    for (var i = 0; i < row.childNodes.length; i++) {
      var n = row.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) { n.nodeValue = label; return; }
    }
  }

  // Find the Help/contact row by destination (native markup has no hook class).
  function decorateMenuRows(wrap) {
    var menu = wrap.querySelector('.lok-acct-menu');
    if (!menu) return;
    setRowLabel(menu.querySelector('.lok-acct-upgrade'), 'Upgrade'); // #67(a)
    addRowIcon(menu.querySelector('.lok-acct-upgrade'), 'upgrade');
    addRowIcon(menu.querySelector('[data-lok-customer-row]'), 'shopping');
    Array.prototype.slice.call(menu.querySelectorAll('a.lok-acct-row')).forEach(function (a) {
      var href = (a.getAttribute('href') || '').toLowerCase();
      if (href.indexOf('contact') >= 0) addRowIcon(a, 'help');
    });
  }

  function injectCss() {
    if (document.getElementById('lok-acct-css')) return;
    var st = document.createElement('style');
    st.id = 'lok-acct-css';
    st.textContent = MENU_CSS;
    document.head.appendChild(st);
  }

  // Plan label from the flat billing payload (vendor/me/billing). The vendor
  // row is only consulted for the founding fallback when billing is missing.
  function planLabel(billing, v) {
    var p = String((billing && (billing.plan || billing.plan_code)) || '').toLowerCase();
    if (p.indexOf('featured') >= 0) return { label: 'Featured', top: true };
    if (p.indexOf('pro') >= 0) return { label: 'Pro plan', top: false };
    if (v && v.is_founding_member) return { label: 'Founding vendor', top: false };
    return { label: 'Free plan', top: false };
  }
  function photoUrl(v) {
    var s = v && (v.profile_photo || v.photo || v.logo);
    if (!s || typeof s !== 'string') return '';
    s = s.trim();
    if (/[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    // Full URL (Supabase Storage / Webflow CDN) only — a leading-slash relative
    // path is a legacy Xano-era /vault upload that can no longer resolve
    // (XANO-DECOMM 2026-07-24), so the chip keeps its initials avatar.
    return /^https?:\/\//i.test(s) ? s : '';
  }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(function (p) { return /^[a-z0-9]/i.test(p); });
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function setText(elm, t) { if (elm) elm.textContent = t; }

  function hydrate(wrap, data, billing) {
    var v = (data && data.vendor) ? data.vendor : (data || {});
    var name = (v.business_name || v.name) || 'Your business';
    var plan = planLabel(billing, v);
    var photo = photoUrl(v);

    if (v.business_name) cacheStoreName(v.business_name); // #66 P2 → header switcher
    setText(wrap.querySelector('.lok-acct-name'), name);
    setText(wrap.querySelector('.lok-acct-plan'), plan.label);

    var av = wrap.querySelector('.lok-acct-av');
    if (av) {
      av.textContent = initials(name);
      if (photo) {
        var img = document.createElement('img');
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;border-radius:inherit;object-fit:cover;display:block;';
        img.onload = function () { av.textContent = ''; av.appendChild(img); };
        img.onerror = function () { /* keep initials */ };
        img.src = photo;
      }
    }

    // Hide the upgrade row for top-tier vendors.
    var up = wrap.querySelector('.lok-acct-upgrade');
    if (up) up.style.display = plan.top ? 'none' : '';

    // Marketing tab is paid-only (Francesca 2026-08-17: "Free don't get it").
    // The sidebar rows are static Webflow markup on every dashboard page, so
    // the hide lives here, next to the plan facts. Hide ONLY on a positively
    // known free plan — when billing is missing (transient fetch failure) the
    // tab stays, per the services-final doctrine of never downgrading a paid
    // vendor mid-session; a Free vendor who clicks through just meets the
    // upsell card. Defensive: no-op until the Designer adds the
    // /vendor-dashboard/marketing row.
    // F 2026-09-17 (menu regroup): the row is no longer HIDDEN on Free — a
    // hidden tab cannot sell itself. It stays visible with a 'Featured' lock
    // pill (Featured-first rollout) and still links to the Marketing page,
    // whose upsell card is the honest landing for a Free vendor.
    document.querySelectorAll('.section-11 a[href*="/vendor-dashboard/marketing"]').forEach(function (a) {
      var row = a.closest('.dashboard-btn') || a;
      row.style.display = '';
      var pill = row.querySelector('.lok-nav-lock');
      // F 2026-09-20: Free vendors now get real tools on this page (storefront
      // QR + review link), so a 'Featured' lock on the row is no longer true.
      // The pill is never added; a stale one is cleared.
      if (pill) pill.parentNode.removeChild(pill);
    });
  }

  // The person-shopping label for the switch row: "Francesca — shopping" when we
  // know the first name (from the acct cache), else a plain "Switch to shopping".
  function readCache() {
    try { return JSON.parse(localStorage.getItem('LOKALI_ACCT_CACHE') || 'null'); } catch (e) { return null; }
  }
  function personShoppingLabel() {
    var c = readCache();
    var f = (c && c.first_name || '').trim();
    return f ? (f + ' · shopping') : 'Switch to shopping';
  }
  // Persist the storefront (business) name into the acct cache so the HEADER
  // identity switcher (lokali-auth-nav.js) can label the storefront row without
  // its own fetch. #66 Phase 2.
  function cacheStoreName(name) {
    if (!name) return;
    try {
      var c = readCache() || {};
      if (c.business_name !== name) { c.business_name = name; localStorage.setItem('LOKALI_ACCT_CACHE', JSON.stringify(c)); }
    } catch (e) {}
  }

  // #37 / #66 Phase 2 — the route to the person's SHOPPING space. Was framed as
  // "My Customer Account"; now it's the person side of the identity switcher.
  // Reuses the .lok-acct-row style the native Upgrade/Help rows carry.
  function addCustomerAccountRow(wrap) {
    var menu = wrap.querySelector('.lok-acct-menu');
    if (!menu || menu.querySelector('[data-lok-customer-row]')) return;
    var ref = menu.querySelector('.lok-acct-row:not(.lok-acct-upgrade)') || menu.querySelector('.lok-acct-row');
    var a = document.createElement('a');
    a.className = 'lok-acct-row';
    a.setAttribute('data-lok-customer-row', '1');
    a.href = '/account';
    a.textContent = personShoppingLabel();
    if (ref && ref.nextSibling) ref.parentNode.insertBefore(a, ref.nextSibling);
    else if (ref) ref.parentNode.appendChild(a);
    else menu.appendChild(a);
  }

  // 2026-09-20 (F: "shouldn't the manage sign in live on the settings tab?"): the
  // chip's 'Manage sign-in' row (#30) is gone. It opened the same LokaliAuth account
  // panel as 'Change email' / 'Change password' under Settings > You, and Settings is
  // now one tap away in the main list, so the chip holds only plan and identity rows.

  // #67 round 4 — the mobile-nav footer embed's setClosed() fires on ANY
  // sidebar-link click WITHOUT checking the breakpoint, leaving an inline
  // 'transform: translateX(-100%) !important' on the sidebar wrapper
  // (.div-block-27) on DESKTOP. A transformed ancestor becomes the containing
  // block for position:fixed children, so the rail un-pins from the viewport
  // and floats mid-page (pre-existing bug; the round-2 width collapse turned
  // its former subtle 44px nudge into a full overlap). Strip the transform on
  // desktop — and keep stripping, since the embed re-adds it on every click.
  // (Inline !important can't be beaten from a stylesheet, hence JS.)
  function killStrayDrawerTransform() {
    var w = document.querySelector('.div-block-27');
    if (!w || w.__lokTransformGuard) return;
    w.__lokTransformGuard = true;
    var mqDesk = window.matchMedia('(min-width: 992px)');
    function strip() {
      if (mqDesk.matches && w.style.transform) w.style.removeProperty('transform');
    }
    strip();
    new MutationObserver(strip).observe(w, { attributes: true, attributeFilter: ['style'] });
    if (mqDesk.addEventListener) mqDesk.addEventListener('change', strip);
    else if (mqDesk.addListener) mqDesk.addListener(strip);
  }

  function bindToggle(wrap) {
    var chip = wrap.querySelector('.lok-acct-chip');
    var menu = wrap.querySelector('.lok-acct-menu');
    var caret = wrap.querySelector('.lok-acct-caret');
    if (!chip || !menu || chip.getAttribute('data-lok-bound')) return;
    chip.setAttribute('data-lok-bound', '1');
    if (caret) caret.innerHTML = CARET_SVG; // #67(b) — replace the "⌄" glyph
    var open = false;
    function set(o) { open = o; menu.style.display = o ? 'block' : 'none'; if (caret) caret.style.transform = o ? 'rotate(180deg)' : ''; }
    set(false); // start closed regardless of the Designer default
    chip.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); set(!open); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  }

  function whenApi(cb, tries) {
    tries = tries || 0;
    if (window.LokaliAPI && window.LokaliAPI.vendors) return cb();
    if (tries > 40) return;
    setTimeout(function () { whenApi(cb, tries + 1); }, 250);
  }

  function fetchAndHydrate(wrap, attempt) {
    var billingP = (window.LokaliAPI.plans && window.LokaliAPI.plans.getMyBilling)
      ? window.LokaliAPI.plans.getMyBilling().catch(function () { return null; })
      : Promise.resolve(null);
    Promise.all([window.LokaliAPI.vendors.me(), billingP]).then(function (rs) {
      var meRes = rs[0];
      var billing = rs[1] && !rs[1].error ? (rs[1].data || rs[1]) : null;
      if ((!meRes || meRes.error || !meRes.data) && attempt < 1) {
        // Likely the free-tier rate limit — one quiet retry after a beat.
        setTimeout(function () { fetchAndHydrate(wrap, attempt + 1); }, 3000);
        return;
      }
      hydrate(wrap, (meRes && !meRes.error && meRes.data) ? meRes.data : null, billing);
    }).catch(function () {
      if (attempt < 1) setTimeout(function () { fetchAndHydrate(wrap, attempt + 1); }, 3000);
    });
  }

  // #76: person-first naming — the sidebar's native "My Listing" item reads
  // "My Storefront" (Francesca 2026-07-19). Static Webflow markup on every
  // dashboard page, so the rename lives here (this script loads on them all).
  // F 2026-09-17 (menu regroup): 'View storefront' — the row leaves the
  // dashboard (lokali-dashboard.js rewrites it to the live /{slug} URL and
  // opens a new tab), so the label says so and carries an external mark.
  function renameMyListing() {
    var items = document.querySelectorAll('strong.dashboard-menu');
    for (var i = 0; i < items.length; i++) {
      var t = (items[i].textContent || '').trim();
      if (t === 'My Listing' || t === 'My Storefront') items[i].textContent = 'View storefront';
    }
  }

  // F 2026-09-17 (MENU REGROUP, mockup tab F): the flat nine-item list becomes
  //   Dashboard
  //   YOUR STOREFRONT  Profile · Services · Products · Availability · View storefront ↗
  //   GROW             Leads (unread badge) · Analytics · Marketing (Featured pill on Free)
  // Supersedes the 2026-08-29 "sink read-only rows to the bottom" rule: that was
  // a code distinction (read-only vs edit), not a vendor one — Leads is the
  // reason most vendors open the dashboard. Rows are MOVED, never rebuilt, so
  // Webflow's w--current highlight and every href keep working; the mobile
  // drawer slides this same DOM, so one regroup covers both surfaces.
  // Matched by href where stable and by label where the href is runtime-
  // rewritten (the storefront link becomes the live /{slug} URL). Idempotent.
  var NAV_CSS =
    '.lok-nav-grp{font-family:\'Plus Jakarta Sans\',sans-serif;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6E6A85;padding:14px 8px 5px;line-height:1;}' +
    // Rows span the sidebar (Webflow lays them out shrink-to-fit, which put the
    // badge right after the word and squeezed the Marketing row); one type ramp
    // for every row — the Availability/Leads rows carry a plain .text-block-17
    // instead of strong.dashboard-menu and rendered a size larger.
    '.div-block-28{align-items:stretch!important;}' +
    // 2026-09-20: with Settings, Help and Contact in the list it is ~650px tall;
    // on a 768px-high laptop the account chip fell below the fixed sidebar's
    // edge, out of reach. The LIST scrolls, the chip stays pinned. Desktop only:
    // the phone drawer already scrolls as a whole (lokali-dashboard-mobile-nav.js).
    '@media (min-width:992px){.section-11 .div-block-28{flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:thin;}' +
      '.section-11 .div-block-29{flex:0 0 auto;}}' +
    // Short laptop screens: tighten the rhythm so the whole list fits without a
    // scrollbar (which would steal width and clip 'View storefront').
    '@media (min-width:992px) and (max-height:820px){.div-block-28 .dashboard-btn{margin-bottom:2px !important;}.lok-nav-grp{padding-top:8px;}}' +
    '.div-block-28 .dashboard-btn{position:relative;width:100%;box-sizing:border-box;display:flex;align-items:center;}' +
    '.div-block-28 .dashboard-btn .text-block-17{flex:1 1 auto;min-width:0;font-family:\'Plus Jakarta Sans\',sans-serif;font-size:16px;font-weight:500;color:#1A1829;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.div-block-28 .dashboard-btn strong.dashboard-menu{font-size:16px;font-weight:500;}' +
    '.section-11 .dashboard-btn.w--current .text-block-17{color:#6002EE;}' +
    '.lok-nav-badge{margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:100px;background:#6002EE;color:#fff;' +
      'font-family:\'Plus Jakarta Sans\',sans-serif;font-size:11.5px;font-weight:700;line-height:20px;text-align:center;flex:0 0 auto;}' +
    '.lok-nav-lock{margin-left:auto;display:inline-flex;align-items:center;gap:3px;font-family:\'Plus Jakarta Sans\',sans-serif;font-size:10px;font-weight:700;' +
      'color:#6E6A85;background:#EEEDF6;border-radius:100px;padding:2px 6px;flex:0 0 auto;line-height:1.4;}' +
    '.div-block-28 .dashboard-btn strong.dashboard-menu{margin-right:6px;}' +
    '.div-block-28 .dashboard-btn .icon-div{flex:0 0 auto;}' +
    '.div-block-28 .dashboard-btn .text-block-17 strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.lok-nav-ext{display:inline-block;width:11px;height:11px;margin-left:6px;vertical-align:-1px;color:#8E8BA6;}' +
    '.lok-nav-ext svg{width:11px;height:11px;fill:currentColor;display:block;}' +
    // Mobile: the hamburger (built by lokali-dashboard-mobile-nav.js) gets a dot
    // while Leads has unread — the drawer is closed, so the badge alone is unseen.
    // The bubble carries the NUMBER (F 2026-09-17: a bare dot said nothing about what
    // it was or how to clear it) and the hamburger's aria-label / title explain it.
    '#lok-ham{position:relative;}' +
    '#lok-ham .lok-ham-n{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:100px;background:#FF8D00;color:#fff;' +
      'font-family:\'Plus Jakarta Sans\',sans-serif;font-size:11px;font-weight:800;line-height:18px;text-align:center;border:2px solid #F7F6FC;box-sizing:content-box;pointer-events:none;}';
  // Font Awesome Free 6 solid 'arrow-up-right-from-square' (CC BY 4.0).
  var EXT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"/></svg>';

  function navRows() {
    var dash = document.querySelector('a[href="/vendor-dashboard/dashboard"]');
    if (!dash || !dash.parentNode) return null;
    var parent = dash.parentNode;
    var out = { parent: parent, dashboard: dash };
    var anchors = parent.querySelectorAll('a');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (a.parentNode !== parent || a === dash) continue;
      var t = (a.textContent || '').trim();
      var href = a.getAttribute('href') || '';
      if (href.indexOf('/vendor-dashboard/profile') === 0) out.profile = a;
      else if (href.indexOf('/vendor-dashboard/services') === 0) out.services = a;
      else if (href.indexOf('/vendor-dashboard/products') === 0) out.products = a;
      else if (href.indexOf('/vendor-dashboard/availability') === 0) out.availability = a;
      else if (href.indexOf('/vendor-dashboard/marketing') === 0) out.marketing = a;
      else if (href.indexOf('/vendor-dashboard/followers') === 0) out.followers = a;
      else if (href.indexOf('/vendor-dashboard/settings') === 0) out.settings = a;
      else if (a.getAttribute('data-lok-contact')) out.contact = a;
      else if (href.indexOf('/vendor-dashboard/analytics') === 0 || t === 'Analytics') out.analytics = a;
      else if (href.indexOf('/vendor-dashboard/leads') === 0 || t === 'Leads') out.leads = a;
      else if (href.indexOf('view-listing') >= 0 || /^(View storefront|My Storefront|My Listing)$/.test(t)) out.storefront = a;
    }
    // Followers (2026-09-20): the row does not exist in the Webflow menu, and this
    // script could only reorder rows that do. Build it once, in the menu's own
    // markup (dashboard-btn > icon-div + text-block-17 > strong.dashboard-menu), so
    // every existing rule styles it. Icon = the Save heart: saving IS following.
    if (!out.followers && out.leads) {
      var f = document.createElement('a');
      f.href = '/vendor-dashboard/followers';
      f.className = 'dashboard-btn w-inline-block';
      var on = /^\/vendor-dashboard\/followers(\/|$)/.test(String(window.location.pathname || ''));
      if (on) { f.className += ' w--current'; f.setAttribute('aria-current', 'page'); }
      f.innerHTML = '<div class="icon-div"><svg class="dashboard-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="width:18px;height:18px;display:block;">' +
        '<path fill="' + (on ? '#6002EE' : '#1A1829') + '" d="M12 20.5l-1.4-1.27C5.6 14.86 2.5 12.07 2.5 8.6 2.5 6.1 4.5 4.1 7 4.1c1.5 0 2.95.7 3.9 1.81C11.85 4.8 13.3 4.1 14.8 4.1c2.5 0 4.5 2 4.5 4.5 0 3.47-3.1 6.26-8.1 10.63L12 20.5z"/></svg></div>' +
        '<div class="text-block-17"><strong class="dashboard-menu">Followers</strong></div>';
      parent.insertBefore(f, out.leads.nextSibling);
      out.followers = f;
    }
    // Help and guides (2026-09-20): one row that opens the guides landing page in
    // a NEW tab, so a vendor mid-edit never loses unsaved work. Same build-it-here
    // approach as Followers. Icon: Font Awesome Free 6 'graduation-cap' (CC BY 4.0),
    // the same glyph lokali-browse.js uses.
    if (!out.help && out.dashboard) {
      var existingHelp = parent.querySelector('a[data-lok-help]');
      if (existingHelp) out.help = existingHelp;
      else {
        var h = document.createElement('a');
        h.href = '/vendor-resources';
        h.target = '_blank';
        h.rel = 'noopener';
        h.className = 'dashboard-btn w-inline-block';
        h.setAttribute('data-lok-help', '1');
        h.innerHTML = '<div class="icon-div"><svg class="dashboard-icon" viewBox="0 0 640 512" aria-hidden="true" focusable="false" style="width:18px;height:18px;display:block;">' +
          '<path fill="#1A1829" d="M320 32c-8.1 0-16.1 1.4-23.7 4.1L15.8 137.4C6.3 140.9 0 149.9 0 160s6.3 19.1 15.8 22.6l57.9 20.9C57.3 229.3 48 259.8 48 291.9v28.1c0 28.4-10.8 57.7-22.3 80.8c-6.5 13-13.9 25.8-22.5 37.6C0 442.7-.9 448.3 .9 453.4s6 8.9 11.2 10.2l64 16c4.2 1.1 8.7 .3 12.4-2s6.3-6.1 7.1-10.4c8.6-42.8 4.3-81.2-2.1-108.7C90.3 344.3 86 329.8 80 316.5V291.9c0-30.2 10.2-58.7 27.9-81.5c12.9-15.5 29.6-28 49.2-35.7l157-61.7c8.2-3.2 17.5 .8 20.7 9s-.8 17.5-9 20.7l-157 61.7c-12.4 4.9-23.3 12.4-32.2 21.6l159.6 57.6c7.6 2.7 15.6 4.1 23.7 4.1s16.1-1.4 23.7-4.1L624.2 182.6c9.5-3.4 15.8-12.5 15.8-22.6s-6.3-19.1-15.8-22.6L343.7 36.1C336.1 33.4 328.1 32 320 32zM128 408c0 35.3 86 72 192 72s192-36.7 192-72L496.7 262.6 354.5 314c-11.1 4-22.8 6-34.5 6s-23.5-2-34.5-6L143.3 262.6 128 408z"/></svg></div>' +
          '<div class="text-block-17"><strong class="dashboard-menu">Help and guides</strong></div>';
        parent.appendChild(h);
        out.help = h;
      }
    }
    // Settings (F 2026-09-20, settings analysis): the row lived ONLY inside the
    // account chip at the sidebar foot (phone = menu, then your name, then
    // Settings), while seven scripts and emails send vendors to it. The NATIVE
    // row is moved into the main list, never rebuilt, so Webflow's w--current
    // and its icon come along; groupMenuItems() places it.
    if (!out.settings) {
      var chipSettings = document.querySelector('.lok-acct:not([data-lok-acct]) .lok-acct-menu a[href^="/vendor-dashboard/settings"]');
      if (chipSettings) out.settings = chipSettings;
    }
    // Contact us: leaves the chip with Settings and joins the Help group, so the
    // chip holds only plan and identity rows. Built here like Followers; the
    // chip's own 'Help & contact' row is hidden once this one exists.
    if (!out.contact && out.dashboard) {
      var c = document.createElement('a');
      c.href = '/contact-us';
      c.className = 'dashboard-btn w-inline-block';
      c.setAttribute('data-lok-contact', '1');
      c.innerHTML = '<div class="icon-div"><svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="#1A1829" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width:18px;height:18px;display:block;">' +
        '<path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"/><polyline points="22 6 12 13 2 6"/></svg></div>' +
        '<div class="text-block-17"><strong class="dashboard-menu">Contact us</strong></div>';
      parent.appendChild(c);
      out.contact = c;
    }
    return out;
  }

  function groupMenuItems() {
    var r = navRows();
    if (!r) return;
    if (!document.getElementById('lok-nav-css')) {
      var st = document.createElement('style'); st.id = 'lok-nav-css'; st.textContent = NAV_CSS;
      document.head.appendChild(st);
    }
    var parent = r.parent;
    function label(key, text) {
      var el = parent.querySelector('.lok-nav-grp[data-grp="' + key + '"]');
      if (!el) {
        el = document.createElement('div'); el.className = 'lok-nav-grp'; el.setAttribute('data-grp', key);
        el.textContent = text;
      }
      parent.appendChild(el);
    }
    function move(a) { if (a) parent.appendChild(a); }
    // Order is the append order; every node is moved, never cloned.
    move(r.dashboard);
    label('store', 'Your storefront');
    move(r.profile); move(r.services); move(r.products); move(r.availability); move(r.storefront);
    label('grow', 'Grow');
    move(r.leads); move(r.followers); move(r.analytics); move(r.marketing);
    if (r.settings) { label('account', 'Your account'); move(r.settings); }
    if (r.help || r.contact) { label('help', 'Help'); move(r.help); move(r.contact); } // last, under its own label so it does not read as a Grow tool
    if (r.contact) {
      var chipHelp = document.querySelectorAll('.lok-acct:not([data-lok-acct]) .lok-acct-menu a.lok-acct-row[href*="contact"]');
      for (var ch = 0; ch < chipHelp.length; ch++) chipHelp[ch].style.display = 'none';
    }
    // External mark on the storefront row (its href is rewritten to the live
    // storefront by lokali-dashboard.js, which also sets target=_blank).
    if (r.storefront && !r.storefront.querySelector('.lok-nav-ext')) {
      var lbl = r.storefront.querySelector('strong.dashboard-menu') || r.storefront.querySelector('.text-block-17');
      if (lbl) {
        var ext = document.createElement('span'); ext.className = 'lok-nav-ext'; ext.innerHTML = EXT_SVG;
        lbl.appendChild(ext);
      }
      r.storefront.setAttribute('rel', 'noopener');
    }
  }

  // Unread-leads badge on the Leads row (+ a dot on the mobile hamburger).
  // Same figure the dashboard home's Leads tile shows (leads.analytics totals.unread).
  function setUnreadBadge(n) {
    var r = navRows(); if (!r || !r.leads) return;
    var b = r.leads.querySelector('.lok-nav-badge');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'lok-nav-badge'; r.leads.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n);
      b.setAttribute('aria-label', n + (n === 1 ? ' lead needs' : ' leads need') + ' a reply');
      b.setAttribute('title', 'Needs a reply');
    } else if (b) b.parentNode.removeChild(b);
    var tries = 0;
    (function mark() {
      var ham = document.getElementById('lok-ham');
      if (!ham) { if (tries++ < 20) setTimeout(mark, 500); return; }
      var bub = ham.querySelector('.lok-ham-n');
      if (n > 0) {
        if (!bub) { bub = document.createElement('span'); bub.className = 'lok-ham-n'; bub.setAttribute('aria-hidden', 'true'); ham.appendChild(bub); }
        bub.textContent = n > 99 ? '99+' : String(n);
        ham.setAttribute('aria-label', 'Menu, ' + n + (n === 1 ? ' lead needs' : ' leads need') + ' a reply');
        ham.setAttribute('title', n + (n === 1 ? ' lead needs' : ' leads need') + ' a reply. Reply or close it on Leads to clear this.');
      } else {
        if (bub) bub.parentNode.removeChild(bub);
        ham.setAttribute('aria-label', 'Menu'); ham.removeAttribute('title');
      }
    })();
  }
  function fetchUnread() {
    var A = window.LokaliAPI;
    if (!A || !A.leads || !A.leads.analytics) return;
    try {
      A.leads.analytics().then(function (res) {
        var d = res && !res.error ? (res.data != null ? res.data : res) : null;
        var n = d && d.totals ? Number(d.totals.unread) || 0 : 0;
        setUnreadBadge(n);
      }).catch(function () {});
    } catch (e) {}
  }

  function init() {
    renameMyListing(); // runs page-wide even when the chip below is absent
    groupMenuItems();
    whenApi(fetchUnread);
    // Target ONLY the native dashboard-sidebar chip. The header account menu
    // (lokali-auth-nav.js) reuses the same .lok-acct/.lok-acct-name classes but
    // marks its wrapper with data-lok-acct="1" — exclude it, or this would
    // overwrite the header name with the vendor business_name ("Your business").
    var wrap = document.querySelector('.lok-acct:not([data-lok-acct])');
    if (!wrap) return; // native chip not on this page
    injectCss();
    killStrayDrawerTransform(); // #67 round 4
    bindToggle(wrap);
    addCustomerAccountRow(wrap);
    decorateMenuRows(wrap); // #51
    whenApi(function () { fetchAndHydrate(wrap, 0); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
