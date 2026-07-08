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
  var MENU_CSS =
    '.lok-acct .lok-acct-menu{top:auto !important;bottom:calc(100% + 6px) !important;}' +
    '.lok-acct .lok-acct-menu .dashboard-btn{display:flex;flex-direction:row;align-items:center;gap:10px;padding:8px 12px;}' +
    '.lok-acct .lok-acct-menu .dashboard-btn .icon-div{width:28px;height:28px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;}' +
    '.lok-acct .lok-acct-menu .dashboard-btn .icon-div img{width:16px;height:16px;}' +
    // #51 — icon-bearing rows line up like the Settings row: icon box + label.
    '.lok-acct .lok-acct-menu .lok-acct-row{display:flex;align-items:center;gap:10px;}' +
    '.lok-acct .lok-acct-menu .lok-acct-row .lok-row-ic{width:28px;height:28px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;}' +
    '.lok-acct .lok-acct-menu .lok-acct-row .lok-row-ic svg{width:16px;height:16px;display:block;}';

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

  // Find the Help/contact row by destination (native markup has no hook class).
  function decorateMenuRows(wrap) {
    var menu = wrap.querySelector('.lok-acct-menu');
    if (!menu) return;
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

  // #37 — a route back to the customer side. Reuses the .lok-acct-row style
  // the native Upgrade/Help rows already carry.
  function addCustomerAccountRow(wrap) {
    var menu = wrap.querySelector('.lok-acct-menu');
    if (!menu || menu.querySelector('[data-lok-customer-row]')) return;
    var ref = menu.querySelector('.lok-acct-row:not(.lok-acct-upgrade)') || menu.querySelector('.lok-acct-row');
    var a = document.createElement('a');
    a.className = 'lok-acct-row';
    a.setAttribute('data-lok-customer-row', '1');
    a.href = '/account';
    a.textContent = 'My Customer Account';
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

  function bindToggle(wrap) {
    var chip = wrap.querySelector('.lok-acct-chip');
    var menu = wrap.querySelector('.lok-acct-menu');
    var caret = wrap.querySelector('.lok-acct-caret');
    if (!chip || !menu || chip.getAttribute('data-lok-bound')) return;
    chip.setAttribute('data-lok-bound', '1');
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
    bindToggle(wrap);
    addCustomerAccountRow(wrap);
    addManageSignInRow(wrap); // #30
    decorateMenuRows(wrap); // #51
    whenApi(function () { fetchAndHydrate(wrap, 0); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
