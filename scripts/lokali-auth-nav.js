/*
  Lokali — Auth-aware header nav (anti-flash).
  When a vendor is signed in, the header "Login" link becomes "My Dashboard" and points
  at the vendor dashboard. When signed out, the native Webflow "Login" link is left
  untouched.

  Logged-in detection is dependency-free: after a Clerk sign-in, lokali-clerk-auth.js
  syncs the Clerk session to Xano and stores a per-user token in
  localStorage['LOKALI_AUTH_TOKEN'] (cleared on sign-out). Because localStorage is
  shared across the whole origin, this signal is available on every public page —
  including pages where the Clerk SDK itself isn't loaded. If Clerk *is* present we
  also honor window.Clerk.isSignedIn as a fallback/override.

  ANTI-FLASH: load this in the <head> (Scripts API "header" location). For users we
  already know are signed in, it synchronously injects a style that hides the static
  "Login" link until we've rewritten it — so "Login" never paints before "My
  Dashboard". Signed-out users get no hide rule, so their "Login" link shows with no
  flash. A failsafe timeout always reveals everything, so a swap that never happens
  can't leave a link hidden.

  At launch every authenticated account is a vendor and the destination is the vendor
  dashboard, so "has a token" == "vendor" here. If customer accounts are added later,
  gate on a cached role instead (see isLoggedInVendor()).

  Self-contained, idempotent, no dependencies. Pairs with lokali-mobile-nav.js (whose
  generated panel links are also swapped).
*/
(function () {
  'use strict';

  var TOKEN_KEY  = 'LOKALI_AUTH_TOKEN';
  var DASH_LABEL = 'My Dashboard';
  var DASH_URL   = '/vendor-dashboard/dashboard'; // matches AFTER_SIGN_IN_PATH in lokali-clerk-auth.js

  // Containers we are willing to rewrite a "Login" link inside.
  // .header-wrapper = desktop header; #lok-mnav-panel = the mobile panel built by lokali-mobile-nav.js
  var SCOPES = '.header-wrapper, #lok-mnav-panel';
  // CSS selector for the static login links we hide pre-swap (href-based, so the rule
  // stops matching the instant we repoint the link at the dashboard).
  var HIDE_CSS = '.header-wrapper a[href$="/login"], #lok-mnav-panel a[href$="/login"]';

  function isLoggedInVendor() {
    // Primary signal: a synced Xano token persisted by lokali-clerk-auth.js.
    try {
      var t = localStorage.getItem(TOKEN_KEY);
      if (t && t.length > 20) return true;
    } catch (e) {}
    // Fallback: Clerk session, when the SDK happens to be on the page.
    try {
      if (window.Clerk && window.Clerk.isSignedIn) return true;
    } catch (e2) {}
    return false;
  }

  // ── Anti-flash hide rule ───────────────────────────────────────────────
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

  function pathOf(href) {
    try { return new URL(href, window.location.origin).pathname.replace(/\/+$/, ''); }
    catch (e) { return (href || '').replace(/[?#].*$/, '').replace(/\/+$/, ''); }
  }

  // Is this anchor the "Login" nav link? Match by destination OR visible text so we
  // don't depend on a specific Webflow id/class.
  function isLoginLink(a) {
    if (a.getAttribute('data-lok-auth-swapped') === '1') return false;
    if (pathOf(a.getAttribute('href') || '') === '/login') return true;
    var txt = (a.textContent || '').trim().toLowerCase();
    return txt === 'login' || txt === 'log in' || txt === 'sign in';
  }

  function swapToDashboard(a) {
    a.setAttribute('href', DASH_URL);
    // Replace just the visible label, leaving any icon spans (none on Login today) intact.
    var changed = false;
    for (var i = 0; i < a.childNodes.length; i++) {
      var n = a.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) { n.nodeValue = DASH_LABEL; changed = true; break; }
    }
    if (!changed) a.textContent = DASH_LABEL;
    a.style.visibility = 'visible'; // beat the hide rule even before href un-matches it
    a.setAttribute('data-lok-auth-swapped', '1');
  }

  function run() {
    var scopeEls = document.querySelectorAll(SCOPES);
    for (var s = 0; s < scopeEls.length; s++) {
      var links = scopeEls[s].querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        if (isLoginLink(links[i])) swapToDashboard(links[i]);
      }
    }
  }

  if (!isLoggedInVendor()) return; // signed out → leave the native "Login" link alone

  // Hide the static login link up front so it never paints as "Login".
  injectHide();

  // Swap as soon as nodes appear. The observer fires while the body is still parsing,
  // so the header link is rewritten before (or as) it paints. The mobile panel is
  // built later by lokali-mobile-nav.js and is caught the same way.
  var mo = null;
  if (window.MutationObserver) {
    mo = new MutationObserver(run);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function ready() { run(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

  // Failsafe: after a short window the header + mobile panel exist; stop observing,
  // do a final pass, and remove the hide rule so nothing can stay hidden.
  setTimeout(function () {
    if (mo) mo.disconnect();
    run();
    removeHide();
  }, 4000);
})();
