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
 *   - appends a "My Customer Account" row -> /account (bug #37: there was no
 *     way back from the vendor dashboard to the customer side)
 *   - retries once if the first fetch fails (Xano free-tier rate limit)
 *
 * Native element hooks (classes, set in Webflow):
 *   .lok-acct (wrapper, gets .open) · .lok-acct-chip (click target)
 *   .lok-acct-av · .lok-acct-name · .lok-acct-plan · .lok-acct-upgrade
 *
 * Load site-wide (footer), after lokali-api-client.js. See the maintainer guide.
 */
(function () {
  'use strict';

  var XANO_ORIGIN = 'https://x8ki-letl-twmt.n7.xano.io';

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
    '.lok-acct .lok-acct-chip .lok-acct-plan{font-family:\'Plus Jakarta Sans\',sans-serif;font-size:11.5px;font-weight:500;color:#8A8AA0;}' +
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
    '.section-11 .dashboard-btn.w--current,.section-11 .dashboard-btn.w--current strong.dashboard-menu{color:#6002EE;}';

  // #67 — a real chevron instead of the native "⌄" text glyph (which sat on
  // the text baseline and read as floating/misaligned).
  var CARET_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  // #51 — 16px stroke icons (currentColor, so they inherit each row's text
  // color) for the rows that shipped without one; sized to match Settings.
  var ROW_ICONS = {
    upgrade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.9 6.26L21 9.27l-4.5 4.38L17.8 20 12 16.77 6.2 20l1.3-6.35L3 9.27l6.1-1.01z"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    customer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    signin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-4.5 4.5L19 4l3 3-4.5 4.5M11.39 11.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5"/></svg>'
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
    addRowIcon(menu.querySelector('[data-lok-customer-row]'), 'customer');
    addRowIcon(menu.querySelector('[data-lok-signin-row]'), 'signin');
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
    if (v && v.is_founding_member) return { label: 'Founding member', top: false };
    return { label: 'Free plan', top: false };
  }
  function photoUrl(v) {
    var s = v && (v.profile_photo || v.photo || v.logo);
    if (!s || typeof s !== 'string') return '';
    s = s.trim();
    if (/[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    if (s.charAt(0) === '/') return XANO_ORIGIN + s;
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
  }

  // The person-shopping label for the switch row: "Francesca — shopping" when we
  // know the first name (from the acct cache), else a plain "Switch to shopping".
  function readCache() {
    try { return JSON.parse(localStorage.getItem('LOKALI_ACCT_CACHE') || 'null'); } catch (e) { return null; }
  }
  function personShoppingLabel() {
    var c = readCache();
    var f = (c && c.first_name || '').trim();
    return f ? (f + ' — shopping') : 'Switch to shopping';
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

  // #30 — vendors can change how they sign in (password, email addresses)
  // without leaving the dashboard. Opens the LokaliAuth account panel — the
  // same one customers get from the /account "Manage sign-in" button. The
  // auth controller (lokali-auth.js) is loaded site-wide; if it's still
  // booting when clicked, wait briefly.
  function openAccountPanel(tries) {
    var a = window.LokaliAuth;
    if (a && typeof a.openAccountPanel === 'function') { a.openAccountPanel(); return; }
    if ((tries || 0) < 20) setTimeout(function () { openAccountPanel((tries || 0) + 1); }, 250);
  }

  function addManageSignInRow(wrap) {
    var menu = wrap.querySelector('.lok-acct-menu');
    if (!menu || menu.querySelector('[data-lok-signin-row]')) return;
    var a = document.createElement('a');
    a.className = 'lok-acct-row';
    a.setAttribute('data-lok-signin-row', '1');
    a.href = '#';
    a.textContent = 'Manage sign-in';
    a.addEventListener('click', function (e) { e.preventDefault(); openAccountPanel(0); });
    var ref = menu.querySelector('[data-lok-customer-row]');
    if (ref && ref.nextSibling) ref.parentNode.insertBefore(a, ref.nextSibling);
    else if (ref) ref.parentNode.appendChild(a);
    else menu.appendChild(a);
  }

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

  function init() {
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
    addManageSignInRow(wrap); // #30
    decorateMenuRows(wrap); // #51
    whenApi(function () { fetchAndHydrate(wrap, 0); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
