/*
  Lokali — Auth-aware header nav.
  When a vendor is signed in, the header "Login" link becomes "Dashboard" and points
  at the vendor dashboard. When signed out, the native Webflow "Login" link is left
  untouched.

  Logged-in detection is dependency-free: after a Clerk sign-in, lokali-clerk-auth.js
  syncs the Clerk session to Xano and stores a per-user token in
  localStorage['LOKALI_AUTH_TOKEN'] (cleared on sign-out). Because localStorage is
  shared across the whole origin, this signal is available on every public page —
  including pages where the Clerk SDK itself isn't loaded. If Clerk *is* present we
  also honor window.Clerk.isSignedIn as a fallback/override.

  At launch every authenticated account is a vendor and the destination is the vendor
  dashboard, so "has a token" == "vendor" here. If customer accounts are added later,
  gate on a cached role instead (see isLoggedInVendor()).

  Load SITEWIDE (Project Settings → Custom Code → Footer) so it runs on every public
  page. Self-contained, idempotent, no dependencies. Pairs with lokali-mobile-nav.js
  (whose generated panel links are also swapped).
*/
(function () {
  'use strict';

  var TOKEN_KEY  = 'LOKALI_AUTH_TOKEN';
  var DASH_LABEL = 'My Dashboard';
  var DASH_URL   = '/vendor-dashboard/dashboard'; // matches AFTER_SIGN_IN_PATH in lokali-clerk-auth.js

  // Containers we are willing to rewrite a "Login" link inside.
  // .header-wrapper = desktop header; #lok-mnav-panel = the mobile panel built by lokali-mobile-nav.js
  var SCOPES = '.header-wrapper, #lok-mnav-panel';

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
    a.setAttribute('data-lok-auth-swapped', '1');
  }

  function run() {
    if (!isLoggedInVendor()) return;
    var scopeEls = document.querySelectorAll(SCOPES);
    for (var s = 0; s < scopeEls.length; s++) {
      var links = scopeEls[s].querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        if (isLoginLink(links[i])) swapToDashboard(links[i]);
      }
    }
  }

  function init() {
    run();
    // The header can render late and the mobile panel is built by lokali-mobile-nav.js
    // after us. Watch for added nodes and re-run (cheap; stops doing work once swapped).
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { run(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      // Stop observing after a short window — by then header + mobile panel exist.
      setTimeout(function () { mo.disconnect(); run(); }, 4000);
    } else {
      setTimeout(run, 1000);
      setTimeout(run, 2500);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
