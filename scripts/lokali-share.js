/**
 * lokali-share.js — word-of-mouth share tracking front-end.
 *
 * Three surfaces, all driven by this one script:
 *   1. Share button on a vendor listing: a button you place with
 *      id="lokali-share-detail" (vendor id resolved from the ?id= URL param, the
 *      element's data-vendor-id, or window.LOKALI_VENDOR_ID). On click (authed)
 *      it mints an opaque ?via= link via the Shares API, then opens the native
 *      share sheet / copies the link. The vendor's own Share & Grow links can
 *      reuse the same button/endpoint — origin is computed server-side, so the
 *      vendor sharing their own profile is correctly stamped origin="vendor"
 *      and excluded from the neighbor count.
 *   2. Landing detection: on ANY page, if the URL carries ?via={code}, log the
 *      landing once per session (anonymous lokali_sid) — non-blocking, the page
 *      renders regardless of whether the call succeeds.
 *   3. Free-tier teaser: an element with id="lokali-share-teaser" on Dashboard
 *      Home renders "shared by N neighbors" + an upgrade nudge, shown only to
 *      vendors NOT on a paid tier (paid tiers see the full Shares KPI in
 *      analytics instead).
 *
 * Auth: customer sharing requires sign-in (an anonymous share can't be
 * attributed, so we never mint one). If not signed in, clicking Share stashes
 * the pending vendor, stamps a customer signup intent, and opens the LokaliAuth
 * sign-up overlay; on `lokali:authed` we finish by minting + copying the link.
 *
 * Depends on: the API client (window.LokaliAPI, with the 'shares' base)
 * and, for the sign-up-to-share path, lokali-auth.js.
 */
(function () {
  'use strict';

  var PENDING_SHARE_KEY = 'lokali_pending_share'; // vendor id to share after sign-up
  var SIGNUP_INTENT_KEY = 'lokali_signup_intent'; // read by lokali-auth.js
  var SID_KEY = 'lokali_sid';                     // anonymous first-party landing-dedup id
  var RESOLVED_KEY = 'lokali_via_resolved';       // codes already resolved this session
  var SHARE_ANCHOR_ID = 'lokali-share-detail';
  var TEASER_ID = 'lokali-share-teaser';

  // ── helpers ────────────────────────────────────────────────
  function api() { return window.LokaliAPI; }
  function hasToken() { var a = api(); return !!(a && a.getToken && a.getToken()); }

  function setPendingShare(id) { try { sessionStorage.setItem(PENDING_SHARE_KEY, String(id)); } catch (e) {} }
  function getPendingShare() { try { return sessionStorage.getItem(PENDING_SHARE_KEY); } catch (e) { return null; } }
  function clearPendingShare() { try { sessionStorage.removeItem(PENDING_SHARE_KEY); } catch (e) {} }
  function stampCustomerIntent() { try { sessionStorage.setItem(SIGNUP_INTENT_KEY, 'customer:' + Date.now()); } catch (e) {} } // timestamped (#101 — intent expires)

  // Stable anonymous session id (localStorage). NOT a user id, NOT cross-site —
  // used solely to dedup landings. Derived from the same UUID-ish primitive.
  function getSid() {
    try {
      var sid = localStorage.getItem(SID_KEY);
      if (!sid) {
        sid = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
        localStorage.setItem(SID_KEY, sid);
      }
      return sid;
    } catch (e) {
      return 's_' + Date.now().toString(36);
    }
  }

  function injectCSS() {
    if (document.getElementById('lokali-share-styles')) return;
    var s = document.createElement('style');
    s.id = 'lokali-share-styles';
    s.textContent = [
      ".lk-share{display:inline-flex;align-items:center;gap:7px;cursor:pointer;padding:8px 14px;border-radius:8px;border:.5px solid #EEEDF6;background:#fff;font:600 13px/1 'Plus Jakarta Sans',sans-serif;color:#1A1829;transition:background .12s, border-color .12s, transform .12s;}",
      ".lk-share:hover{border-color:#D4AAFD;color:#6002EE;transform:translateY(-1px);}",
      ".lk-share svg{width:16px;height:16px;display:block;}",
      ".lk-share.is-busy{opacity:.55;pointer-events:none;}",
      ".lk-share-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:#6002EE;color:#fff;font:500 13px/1 'Plus Jakarta Sans',sans-serif;padding:11px 18px;border-radius:10px;box-shadow:0 8px 28px rgba(96,2,238,.28);opacity:0;transition:all .28s ease;z-index:9999;pointer-events:none;}",
      ".lk-share-toast.show{transform:translateX(-50%) translateY(0);opacity:1;}",
      ".lk-share-teaser{font:500 13px/1.5 'Plus Jakarta Sans',sans-serif;color:#4A4761;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}",
      ".lk-share-teaser strong{color:#1A1829;font-weight:600;}",
      ".lk-share-teaser a{color:#6002EE;font-weight:600;text-decoration:none;}",
      ".lk-share-teaser a:hover{text-decoration:underline;}"
    ].join('');
    document.head.appendChild(s);
  }

  function shareSVG() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>';
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'lk-share-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 320); }, 2400);
  }

  // ── vendor id resolution (mirrors lokali-favorites.js) ─────
  function resolveVendorId(anchor) {
    if (anchor && anchor.getAttribute('data-vendor-id')) return anchor.getAttribute('data-vendor-id');
    if (typeof window.LOKALI_VENDOR_ID !== 'undefined' && window.LOKALI_VENDOR_ID) return window.LOKALI_VENDOR_ID;
    try {
      var p = new URLSearchParams(window.location.search).get('id');
      if (p) return p;
    } catch (e) {}
    // Clean slug URLs (/{slug}) have no ?id= — lokali-vendor-listing.js
    // announces the resolved vendor via this window var + the
    // 'lokali:vendor-loaded' event (which re-runs decorateShareButton below).
    var lv = window.LOKALI_LOADED_VENDOR;
    if (lv && lv.id != null) return lv.id;
    return null;
  }

  // ── mint + share ───────────────────────────────────────────
  // Opens the native share sheet when available; otherwise copies the link.
  // channel is best-effort: "copy_link" when we fall back to clipboard.
  // noNative: navigator.share requires transient user activation — the
  // sign-up-to-share completion runs off 'lokali:authed' (no gesture), where
  // the sheet would reject silently, so that path goes straight to copy.
  function deliverShare(shareUrl, vendorName, noNative) {
    var title = vendorName ? (vendorName + ' on Lokali') : 'Check out this local vendor on Lokali';
    if (navigator.share && !noNative) {
      navigator.share({ title: title, url: shareUrl }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(function () { toast('Link copied'); }).catch(function () { promptCopy(shareUrl); });
      return;
    }
    promptCopy(shareUrl);
  }

  function promptCopy(shareUrl) {
    try { window.prompt('Copy this link to share:', shareUrl); } catch (e) {}
  }

  function mintAndShare(vendorId, btn, noNative) {
    if (btn) btn.classList.add('is-busy');
    // navigator.share routes to whatever app the user picks (we can't know it);
    // stamp channel only when we know it (clipboard fallback → copy_link).
    var channel = (navigator.share && !noNative) ? null : 'copy_link';
    return api().share.create(Number(vendorId), channel).then(function (res) {
      if (btn) btn.classList.remove('is-busy');
      if (res && res.error) { toast('Could not create a share link'); return; }
      var url = res && res.data && res.data.share_url;
      if (!url) { toast('Could not create a share link'); return; }
      var name = (btn && btn.getAttribute('data-vendor-name')) || (typeof window.LOKALI_VENDOR_NAME === 'string' ? window.LOKALI_VENDOR_NAME : '');
      deliverShare(url, name, noNative);
    }).catch(function () {
      if (btn) btn.classList.remove('is-busy');
      toast('Could not create a share link');
    });
  }

  function onShareClick(vendorId, btn, ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (hasToken()) { mintAndShare(vendorId, btn); return; }
    // Not signed in → an anonymous share can't be attributed; sign up first.
    setPendingShare(vendorId);
    stampCustomerIntent();
    openAuthModal();
  }

  function openAuthModal() {
    if (window.LokaliAuth && typeof window.LokaliAuth.openSignUp === 'function') {
      window.LokaliAuth.openSignUp();
    } else if (window.LokaliAuth && typeof window.LokaliAuth.openSignIn === 'function') {
      window.LokaliAuth.openSignIn();
    } else {
      window.location.href = '/sign-up';
    }
  }

  // ── surface 1: share button ────────────────────────────────
  function decorateShareButton() {
    var anchor = document.getElementById(SHARE_ANCHOR_ID);
    if (!anchor) return;
    var vid = resolveVendorId(anchor);
    if (!vid) return;
    if (anchor.querySelector('.lk-share')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lk-share';
    btn.setAttribute('data-vendor-id', String(vid));
    var nm = anchor.getAttribute('data-vendor-name') ||
      (window.LOKALI_LOADED_VENDOR && window.LOKALI_LOADED_VENDOR.name) || '';
    if (nm) btn.setAttribute('data-vendor-name', nm);
    btn.innerHTML = shareSVG() + '<span>Share</span>';
    btn.addEventListener('click', function (ev) { onShareClick(vid, btn, ev); });
    anchor.appendChild(btn);
  }

  // ── surface 2: landing detection (?via=) ───────────────────
  function detectLanding() {
    var code = null;
    try { code = new URLSearchParams(window.location.search).get('via'); } catch (e) {}
    if (!code) return;
    // Once per session per code (the server also dedups by code+session).
    var done = {};
    try { done = JSON.parse(sessionStorage.getItem(RESOLVED_KEY) || '{}'); } catch (e) {}
    if (done[code]) return;
    done[code] = 1;
    try { sessionStorage.setItem(RESOLVED_KEY, JSON.stringify(done)); } catch (e) {}
    // Fire-and-forget; never blocks the page.
    try { api().share.resolve(code, getSid()); } catch (e) {}
  }

  // ── surface 3: Free-tier teaser ────────────────────────────
  function isPaidTier(vendor) {
    if (!vendor) return false;
    var p = String(vendor.plan || vendor.tier || vendor.plan_name || vendor.subscription_tier || vendor.plan_tier || '').toLowerCase();
    return p.indexOf('pro') >= 0 || p.indexOf('featured') >= 0 || p.indexOf('essential') >= 0 || p.indexOf('spotlight') >= 0;
  }

  function renderTeaser() {
    var mount = document.getElementById(TEASER_ID);
    if (!mount || !hasToken()) return;
    // Need the vendor's plan to decide whether to show the teaser (paid tiers
    // get the full KPI in analytics instead).
    api().vendors.me().then(function (vm) {
      var vendor = (vm && vm.data) || null;
      if (vendor && vendor.vendor) vendor = vendor.vendor; // unwrap if nested
      if (isPaidTier(vendor)) { mount.innerHTML = ''; return; }
      api().share.count().then(function (res) {
        var n = (res && res.data && res.data.unique_sharers) || 0;
        if (n <= 0) { mount.innerHTML = ''; return; } // never show a zero
        var who = n === 1 ? '1 neighbor has' : n + ' neighbors have';
        mount.className = 'lk-share-teaser';
        mount.innerHTML = '<span>💬 <strong>' + who + '</strong> shared your profile.</span>' +
          '<a href="/pricing">Upgrade to Pro to see your full reach →</a>';
      }).catch(function () {});
    }).catch(function () {});
  }

  // ── sign-up-to-share completion ────────────────────────────
  function completePendingShare() {
    var pending = getPendingShare();
    if (!pending || !hasToken()) return;
    clearPendingShare();
    mintAndShare(Number(pending), null, true); // no user gesture here — skip the native sheet
  }

  // ── init ───────────────────────────────────────────────────
  function init() {
    injectCSS();
    window.addEventListener('lokali:authed', function () { completePendingShare(); });
    // Slug-routed listing pages resolve their vendor asynchronously; mount the
    // button once the listing announces it (no-op if already decorated).
    document.addEventListener('lokali:vendor-loaded', function () { decorateShareButton(); });
    detectLanding();
    decorateShareButton();
    renderTeaser();
  }

  function whenReady(cb) {
    var tries = 0;
    (function poll() {
      if (window.LokaliAPI && window.LokaliAPI.share) { cb(); return; }
      if (tries++ > 100) return;
      setTimeout(poll, 100);
    })();
  }

  function start() { whenReady(init); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Small public surface for debugging / manual triggers (e.g. Share & Grow).
  window.LokaliShare = {
    share: function (vendorId, channel) {
      if (!hasToken()) { onShareClick(vendorId, null); return; }
      return api().share.create(Number(vendorId), channel || null).then(function (res) {
        var url = res && res.data && res.data.share_url;
        if (url) deliverShare(url, '');
        return res;
      });
    }
  };
})();
