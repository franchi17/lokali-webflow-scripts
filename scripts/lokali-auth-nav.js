/*
  Lokali — Auth-aware header nav (anti-flash), role-aware avatar menu.

  Signed out: the native Webflow "Login" link is left untouched.
  Signed in:  the "Login" link is replaced with an avatar + name that opens a
  dropdown menu. Items depend on role (one identity, both capabilities):
    - vendor   → My Dashboard, My Account, Sign out
    - customer → My Account, Sign out
  On the mobile panel (#lok-mnav-panel) the same items render as a stacked list.

  Role/name come from GET {AUTH_BASE}/account using the Xano token in
  localStorage['LOKALI_AUTH_TOKEN'] (synced by lokali-clerk-auth.js, shared
  across the origin so it works on every page — no dependency on api-client or
  the Clerk SDK being loaded here). The last result is cached in
  localStorage['LOKALI_ACCT_CACHE'] so the menu paints instantly on the next
  page, before the network call returns.

  ANTI-FLASH: load in the <head> (Scripts API "header"). For users we already
  know are signed in, it synchronously hides the static "Login" link until the
  avatar replaces it, so "Login" never flashes. A failsafe timeout always
  reveals everything so a swap that never happens can't leave a link hidden.

  Self-contained, idempotent. Pairs with lokali-mobile-nav.js.
*/
(function () {
  'use strict';

  var TOKEN_KEY = 'LOKALI_AUTH_TOKEN';
  var CACHE_KEY = 'LOKALI_ACCT_CACHE';
  var AUTH_BASE = (typeof window !== 'undefined' && window.LOKALI_AUTH_BASE) ||
                  'https://x8ki-letl-twmt.n7.xano.io/api:mp2-aEJM';
  var DASH_URL    = '/vendor-dashboard/dashboard';
  var ACCOUNT_URL = '/account';
  var LOGIN_URL   = '/login';
  var SCOPES   = '.header-wrapper, #lok-mnav-panel';
  var HIDE_CSS = '.header-wrapper a[href$="/login"], #lok-mnav-panel a[href$="/login"]';

  function token() {
    try { var t = localStorage.getItem(TOKEN_KEY); return (t && t.length > 20) ? t : null; }
    catch (e) { return null; }
  }
  function getCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }
  function setCache(o) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(o)); } catch (e) {} }
  function clearAll() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) {} }

  if (!token()) return; // signed out → leave the native "Login" link alone

  var acct = getCache();   // {role, first_name, last_name} or null
  var revealed = false;

  // ── anti-flash hide rule ───────────────────────────────────────────────
  var hideStyle = null;
  function injectHide() {
    if (hideStyle) return;
    var el = document.createElement('style');
    el.id = 'lok-auth-hide';
    el.textContent = HIDE_CSS + '{visibility:hidden!important;}';
    (document.head || document.documentElement).appendChild(el);
    hideStyle = el;
  }
  function removeHide() {
    if (hideStyle && hideStyle.parentNode) hideStyle.parentNode.removeChild(hideStyle);
    hideStyle = null;
  }

  function injectCSS() {
    if (document.getElementById('lok-acct-styles')) return;
    var s = document.createElement('style');
    s.id = 'lok-acct-styles';
    s.textContent = [
      ".lok-acct{position:relative;display:inline-flex;align-items:center;font-family:'Plus Jakarta Sans',-apple-system,sans-serif;}",
      ".lok-acct-trigger{display:inline-flex;align-items:center;gap:8px;cursor:pointer;background:none;border:none;padding:4px 8px 4px 4px;border-radius:100px;font-family:inherit;transition:background .12s;}",
      ".lok-acct-trigger:hover{background:rgba(96,2,238,.06);}",
      ".lok-acct-av{width:30px;height:30px;border-radius:50%;background:#F0E6FF;color:#6002EE;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-transform:uppercase;}",
      ".lok-acct-name{font-size:13px;font-weight:500;color:#1A1829;white-space:nowrap;}",
      ".lok-acct-caret{width:14px;height:14px;flex-shrink:0;color:#8E8BA6;transition:transform .15s;}",
      ".lok-acct.open .lok-acct-caret{transform:rotate(180deg);}",
      ".lok-acct-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:190px;background:#fff;border:.5px solid #EEEDF6;border-radius:12px;box-shadow:0 12px 32px rgba(26,24,41,.14);padding:6px;display:none;z-index:1000;}",
      ".lok-acct.open .lok-acct-menu{display:block;}",
      ".lok-acct-menu a,.lok-acct-menu button{display:block;width:100%;text-align:left;padding:9px 12px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:500;color:#1A1829;background:none;border:none;cursor:pointer;text-decoration:none;box-sizing:border-box;}",
      ".lok-acct-menu a:hover,.lok-acct-menu button:hover{background:#F7F6FC;color:#6002EE;}",
      ".lok-acct-sep{height:.5px;background:#EEEDF6;margin:6px 4px;}",
      ".lok-acct-menu .lok-acct-signout{color:#8E8BA6;}",
      // mobile panel: render the menu inline (no trigger, no dropdown chrome)
      "#lok-mnav-panel .lok-acct{display:block;width:100%;}",
      "#lok-mnav-panel .lok-acct-trigger{display:none;}",
      "#lok-mnav-panel .lok-acct-menu{display:block;position:static;border:none;box-shadow:none;padding:0;min-width:0;}",
      "#lok-mnav-panel .lok-acct-menu a,#lok-mnav-panel .lok-acct-menu button{padding:12px 0;font-size:15px;}"
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ── helpers ────────────────────────────────────────────────────────────
  function pathOf(href) {
    try { return new URL(href, window.location.origin).pathname.replace(/\/+$/, ''); }
    catch (e) { return (href || '').replace(/[?#].*$/, '').replace(/\/+$/, ''); }
  }
  function isLoginLink(a) {
    if (pathOf(a.getAttribute('href') || '') === LOGIN_URL) return true;
    var txt = (a.textContent || '').trim().toLowerCase();
    return txt === 'login' || txt === 'log in' || txt === 'sign in';
  }
  function initialsOf(a) {
    var f = (a && a.first_name || '').trim(), l = (a && a.last_name || '').trim();
    var s = ((f[0] || '') + (l[0] || '')).trim();
    return s || (f[0] || '');
  }
  function caretSVG() {
    return '<svg class="lok-acct-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  }

  function menuItemsHTML(a) {
    var role = a && a.role;
    var html = '';
    // Label the two hubs by which "hat" they are, so a vendor (who has both) can
    // tell them apart: the business dashboard vs. their personal saved/reviews.
    if (role === 'vendor') {
      html += '<a href="' + DASH_URL + '" role="menuitem">Vendor Dashboard</a>';
      html += '<a href="' + ACCOUNT_URL + '" role="menuitem">My Account (Saved &amp; Reviews)</a>';
    } else {
      html += '<a href="' + ACCOUNT_URL + '" role="menuitem">My Account</a>';
    }
    html += '<div class="lok-acct-sep"></div>';
    html += '<button type="button" class="lok-acct-signout" role="menuitem">Sign out</button>';
    return html;
  }

  // Hide the header "Become a Vendor" CTA once we know the user is already a
  // vendor (it's redundant for them). Customers still see it. Scoped to the
  // header + mobile nav only — footer "For Vendors" links are left alone.
  function hideBecomeVendorForVendor() {
    if (!acct || acct.role !== 'vendor') return;
    var scopes = document.querySelectorAll(SCOPES);
    for (var s = 0; s < scopes.length; s++) {
      var links = scopes[s].querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var href = pathOf(a.getAttribute('href') || '');
        var txt = (a.textContent || '').trim().toLowerCase();
        if (href === '/sign-up' || txt === 'become a vendor') {
          a.style.setProperty('display', 'none', 'important');
          a.setAttribute('data-lok-bv-hidden', '1');
        }
      }
    }
  }

  function buildAcctEl() {
    var wrap = document.createElement('div');
    wrap.className = 'lok-acct';
    wrap.setAttribute('data-lok-acct', '1');
    wrap.innerHTML =
      '<button type="button" class="lok-acct-trigger" aria-haspopup="true" aria-expanded="false">' +
        '<span class="lok-acct-av"></span><span class="lok-acct-name"></span>' + caretSVG() +
      '</button>' +
      '<div class="lok-acct-menu" role="menu"></div>';
    var trigger = wrap.querySelector('.lok-acct-trigger');
    trigger.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var open = wrap.classList.toggle('open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    wrap.addEventListener('click', function (e) {
      var so = e.target.closest && e.target.closest('.lok-acct-signout');
      if (so) { e.preventDefault(); signOut(); }
    });
    return wrap;
  }

  function fillAcctEl(wrap, a) {
    var av = wrap.querySelector('.lok-acct-av');
    var nm = wrap.querySelector('.lok-acct-name');
    var menu = wrap.querySelector('.lok-acct-menu');
    if (av) av.textContent = initialsOf(a);
    if (nm) {
      var first = (a && a.first_name || '').trim();
      nm.textContent = first;
      nm.style.display = first ? '' : 'none';
    }
    if (menu) menu.innerHTML = menuItemsHTML(a);
  }

  function signOut() {
    clearAll();
    function go() { window.location.href = LOGIN_URL; }
    try {
      if (window.Clerk && typeof window.Clerk.signOut === 'function') {
        window.Clerk.signOut().then(go).catch(go);
        return;
      }
    } catch (e) {}
    go();
  }

  // Replace the "Login" link inside each scope with the account menu (once),
  // or refresh the existing menu's contents. Idempotent.
  // Insert the account menu once per scope (where a Login link exists). Must NOT
  // mutate when the menu already exists, or the MutationObserver that calls this
  // would re-fire on its own writes and loop. Refilling is done by refreshExisting().
  function render() {
    var scopes = document.querySelectorAll(SCOPES);
    for (var s = 0; s < scopes.length; s++) {
      var scope = scopes[s];
      if (scope.querySelector('.lok-acct[data-lok-acct="1"]')) continue; // already inserted
      var links = scope.querySelectorAll('a'), login = null;
      for (var i = 0; i < links.length; i++) { if (isLoginLink(links[i])) { login = links[i]; break; } }
      if (!login) continue;
      var el = buildAcctEl();
      fillAcctEl(el, acct); // el is detached here → no observer churn
      login.parentNode.insertBefore(el, login);
      login.style.display = 'none';
      login.setAttribute('data-lok-auth-hidden', '1');
    }
    hideBecomeVendorForVendor();
  }

  // Refill already-inserted menus with the current acct (initials/name/items).
  function refreshExisting() {
    var els = document.querySelectorAll('.lok-acct[data-lok-acct="1"]');
    for (var i = 0; i < els.length; i++) fillAcctEl(els[i], acct);
  }

  // close the dropdown on outside click / Escape
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.lok-acct')) return;
    var opens = document.querySelectorAll('.lok-acct.open');
    for (var i = 0; i < opens.length; i++) opens[i].classList.remove('open');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var opens = document.querySelectorAll('.lok-acct.open');
    for (var i = 0; i < opens.length; i++) opens[i].classList.remove('open');
  });

  function fetchAccount() {
    var t = token();
    if (!t) return Promise.resolve(null);
    return fetch(AUTH_BASE + '/account', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ── boot ────────────────────────────────────────────────────────────────
  injectHide();
  injectCSS();

  var mo = null;
  if (window.MutationObserver) {
    mo = new MutationObserver(function () { render(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  function ready() { render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

  // Refresh role/name from the server and re-render (updates cache for next load).
  fetchAccount().then(function (a) {
    if (a && (a.role || a.first_name)) { acct = a; setCache(a); render(); refreshExisting(); hideBecomeVendorForVendor(); }
  });

  // Failsafe: stop observing, final pass, reveal anything still hidden.
  setTimeout(function () {
    if (mo) mo.disconnect();
    render();
    removeHide();
    revealed = true;
  }, 4000);
})();
