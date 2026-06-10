/*!
 * lokali-verification.js — vendor identity verification (Stripe Identity).
 *
 * Pairs with the Vercel endpoint in my-clerk-app/app/api/lokali/verification/*:
 *   POST /verification/start -> { url }   (hosted Stripe Identity: gov ID + selfie)
 * Auth = the Clerk session JWT (same token lokali-clerk-auth.js uses), NOT the Xano token.
 *
 * Reads identity_status via LokaliAPI.vendors.me() to render UI state.
 * The badge itself is granted server-side by the Stripe webhook — this script is UI only.
 *
 * ── Webflow wiring (add these attributes in the Designer) ──────────────────────
 * VERIFY BUTTON:  add  data-lokali-verify  — starts the Stripe Identity flow.
 * VERIFY CARD:    add  data-lokali-verify-card  — hidden once the vendor is verified.
 * STATUS TEXT:    add  data-lokali-verify-status  — filled with a friendly status line.
 * BADGE:          add  data-lokali-verified-badge — shown only when verified.
 *
 * Optional per-state visibility: any element with data-lokali-verify-show="<states>"
 * (comma list of unverified|pending|verified|failed) is shown only in those states,
 * e.g. a "Try again" note with data-lokali-verify-show="failed".
 *
 * ── Config (set before this script if your URLs differ) ────────────────────────
 *   window.LOKALI_BILLING_BASE = 'https://lokali-api.vercel.app/api/lokali';
 *   (shared with lokali-billing.js — both talk to the same Vercel app)
 */
(function () {
  'use strict';

  var API_BASE =
    (window.LOKALI_BILLING_BASE ||
      (window.LOKALI_CLERK_SYNC_URL
        ? window.LOKALI_CLERK_SYNC_URL.replace(/\/clerk-sync\/?$/, '')
        : 'https://lokali-api.vercel.app/api/lokali')).replace(/\/$/, '');

  var START_URL = API_BASE + '/verification/start';

  var STATUS_LABELS = {
    unverified: 'Not verified',
    pending: 'Verification in progress…',
    verified: 'Verified',
    failed: "We couldn't verify your ID — please try again"
  };

  // ── helpers ──────────────────────────────────────────────────────────────────
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function clerkToken() {
    var session = window.Clerk && window.Clerk.session;
    if (!session || typeof session.getToken !== 'function') {
      return Promise.reject(new Error('No Clerk session'));
    }
    return session.getToken();
  }

  function postForRedirect(url, body) {
    return clerkToken().then(function (jwt) {
      if (!jwt) throw new Error('Not signed in');
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + jwt
        },
        body: JSON.stringify(body || {})
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data || !data.url) {
          throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
        }
        window.location.assign(data.url);
      });
    });
  }

  function setButtonBusy(btn, busy) {
    if (!btn) return;
    if (busy) {
      btn.setAttribute('aria-busy', 'true');
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.6';
    } else {
      btn.removeAttribute('aria-busy');
      btn.style.pointerEvents = '';
      btn.style.opacity = '';
    }
  }

  // ── verify button ──────────────────────────────────────────────────────────────
  function bindVerifyButtons() {
    $all('[data-lokali-verify]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        setButtonBusy(btn, true);
        postForRedirect(START_URL, {})
          .catch(function (err) {
            setButtonBusy(btn, false);
            console.error('[lokali-verification] start failed', err);
            alert('Sorry — could not start verification. Please try again.');
          });
      });
    });
  }

  // ── render verification state ──────────────────────────────────────────────────
  function renderStatus(status) {
    status = (status || 'unverified').toLowerCase();
    if (!STATUS_LABELS[status]) status = 'unverified';
    var isVerified = status === 'verified';

    // The "Get Verified" card disappears once verified.
    $all('[data-lokali-verify-card]').forEach(function (el) {
      el.style.display = isVerified ? 'none' : '';
    });

    // Dashboard badge.
    $all('[data-lokali-verified-badge]').forEach(function (el) {
      el.style.display = isVerified ? '' : 'none';
    });

    // Status line.
    $all('[data-lokali-verify-status]').forEach(function (el) {
      el.textContent = STATUS_LABELS[status];
    });

    // The button reads "Try again" after a failure; hidden while pending.
    $all('[data-lokali-verify]').forEach(function (btn) {
      btn.style.display = (status === 'pending' || isVerified) ? 'none' : '';
      if (status === 'failed') btn.textContent = 'Try again';
    });

    // Per-state visibility helpers.
    $all('[data-lokali-verify-show]').forEach(function (el) {
      var states = (el.getAttribute('data-lokali-verify-show') || '')
        .split(',').map(function (s) { return s.trim().toLowerCase(); });
      el.style.display = states.indexOf(status) !== -1 ? '' : 'none';
    });

    return status;
  }

  function loadStatus() {
    if (!(window.LokaliAPI && window.LokaliAPI.vendors && window.LokaliAPI.vendors.me)) {
      return Promise.resolve(null);
    }
    return window.LokaliAPI.vendors.me().then(function (res) {
      var data = (res && (res.data || res)) || {};
      return renderStatus(data.identity_status);
    }).catch(function (err) {
      console.warn('[lokali-verification] vendors.me failed', err);
      return null;
    });
  }

  // After returning from Stripe (?status=done) the webhook may land a moment later —
  // re-poll a few times so the badge appears without a manual refresh. ?status=done is
  // UX only; the webhook is the sole grant of the badge.
  function handleReturnFromStripe() {
    var status = new URLSearchParams(window.location.search).get('status');
    if (status !== 'done') return;
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      loadStatus().then(function (s) {
        if (s === 'verified' || s === 'failed') clearInterval(iv);
      });
      if (tries >= 8) clearInterval(iv);
    }, 1500);
  }

  // ── boot ────────────────────────────────────────────────────────────────────────
  function waitForDeps(cb) {
    var checks = 0;
    var iv = setInterval(function () {
      checks++;
      if (window.Clerk && window.LokaliAPI) { clearInterval(iv); cb(); }
      if (checks > 100) clearInterval(iv);
    }, 100);
  }

  function init() {
    bindVerifyButtons();
    waitForDeps(function () {
      loadStatus();
      handleReturnFromStripe();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
