/*!
 * lokali-verification.js — vendor identity verification (Stripe Identity).
 *
 * Pairs with the Vercel endpoint in my-clerk-app/app/api/lokali/verification/*:
 *   POST /verification/start -> { url }   (hosted Stripe Identity: gov ID + selfie)
 * Auth = the Clerk session JWT (same token lokali-clerk-auth.js uses), NOT the Xano token.
 *
 * Reads identity_status via LokaliAPI.vendors.me() AND the plan via
 * LokaliAPI.plans.getMyBilling() to render UI state. Verification is a PRO/FEATURED
 * perk: the "Get Verified" button only shows for paid vendors; Free vendors see an
 * upsell. The badge itself is granted server-side by the Stripe webhook — this
 * script is UI only.
 *
 * ── Webflow wiring (add these attributes in the Designer) ──────────────────────
 * VERIFY BUTTON:  add  data-lokali-verify  — starts the flow. Shown only for Pro/Featured
 *                 vendors who aren't yet verified/pending. Hidden for Free.
 * UPSELL:         add  data-lokali-verify-upsell — shown only to Free (not-verified) vendors,
 *                 e.g. an <a href="/pricing">Upgrade to Pro to get verified →</a>.
 * VERIFY CARD:    add  data-lokali-verify-card  — hidden once the vendor is verified.
 *                 (Optional. Omit it if you want the card to persist and show the badge.)
 * STATUS TEXT:    add  data-lokali-verify-status  — filled with a friendly status line.
 * BADGE:          add  data-lokali-verified-badge — shown only when verified (safe to place
 *                 on BOTH the dashboard home and settings; it renders wherever it appears).
 *
 * Optional per-state visibility: any element with data-lokali-verify-show="<states>"
 * (comma list of unverified|pending|verified|failed) is shown only in those states,
 * e.g. a "You're verified" note with data-lokali-verify-show="verified".
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
  // Delegated at the document level so a card injected AFTER this script loads (the
  // settings/dashboard embeds mount their card via a small inline script) still works —
  // no per-element binding, no ordering race.
  function bindVerifyButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-lokali-verify]') : null;
      if (!btn) return;
      e.preventDefault();
      if (btn.getAttribute('aria-busy') === 'true') return;
      setButtonBusy(btn, true);
      postForRedirect(START_URL, {})
        .catch(function (err) {
          setButtonBusy(btn, false);
          console.error('[lokali-verification] start failed', err);
          alert('Sorry — could not start verification. Please try again.');
        });
    });
  }

  // Verification is a paid perk. Whether the vendor is on Pro/Featured decides whether
  // they see the "Get Verified" button or the upsell. Cached once billing resolves so
  // renderStatus() can re-run (e.g. return-from-Stripe polling) without re-fetching.
  var _isPro = false;

  function planIsPro(billingData) {
    var b = billingData || {};
    var plan = b.plan_code
      || (b.plan && typeof b.plan === 'object' ? b.plan.code : b.plan)
      || (b.subscription && b.subscription.plan_code)
      || b.plan_name || 'free';
    plan = String(plan).toLowerCase();
    return plan === 'pro' || plan === 'featured';
  }

  // ── render verification state ──────────────────────────────────────────────────
  function renderStatus(status, isPro) {
    status = (status || 'unverified').toLowerCase();
    if (!STATUS_LABELS[status]) status = 'unverified';
    var isVerified = status === 'verified';
    if (typeof isPro === 'boolean') _isPro = isPro; else isPro = _isPro;

    // The "Get Verified" card disappears once verified (only if the wrapper opts in;
    // the settings card omits this so it can keep showing the earned badge).
    $all('[data-lokali-verify-card]').forEach(function (el) {
      el.style.display = isVerified ? 'none' : '';
    });

    // Verified badge — shown only when verified. Safe on dashboard + settings.
    $all('[data-lokali-verified-badge]').forEach(function (el) {
      el.style.display = isVerified ? '' : 'none';
    });

    // Status line.
    $all('[data-lokali-verify-status]').forEach(function (el) {
      el.textContent = STATUS_LABELS[status];
    });

    // The button: only for Pro/Featured, only when actionable (not verified, not
    // pending). Reads "Try again" after a failure. Free vendors never see it.
    $all('[data-lokali-verify]').forEach(function (btn) {
      var actionable = !(status === 'pending' || isVerified);
      btn.style.display = (actionable && isPro) ? '' : 'none';
      if (status === 'failed') btn.textContent = 'Try again';
    });

    // Upsell (Free vendors, not yet verified): "Upgrade to Pro to get verified".
    $all('[data-lokali-verify-upsell]').forEach(function (el) {
      el.style.display = (!isVerified && !isPro) ? '' : 'none';
    });

    // Per-state visibility helpers.
    $all('[data-lokali-verify-show]').forEach(function (el) {
      var states = (el.getAttribute('data-lokali-verify-show') || '')
        .split(',').map(function (s) { return s.trim().toLowerCase(); });
      el.style.display = states.indexOf(status) !== -1 ? '' : 'none';
    });

    return status;
  }

  function fetchIsPro() {
    var api = window.LokaliAPI;
    if (!(api && api.plans && typeof api.plans.getMyBilling === 'function')) {
      return Promise.resolve(false);
    }
    return api.plans.getMyBilling().then(function (res) {
      if (!res || res.error || !res.data) return false;
      return planIsPro(res.data);
    }).catch(function () { return false; });
  }

  function loadStatus() {
    var api = window.LokaliAPI;
    if (!(api && api.vendors && api.vendors.me)) {
      return Promise.resolve(null);
    }
    return Promise.all([
      api.vendors.me()
        .then(function (res) { return (res && (res.data || res)) || {}; })
        .catch(function (err) {
          console.warn('[lokali-verification] vendors.me failed', err);
          return {};
        }),
      fetchIsPro()
    ]).then(function (out) {
      return renderStatus(out[0].identity_status, out[1]);
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

  // Re-render on demand — the settings/dashboard embeds call this right after they
  // mount their card so state paints immediately (no wait for the deps poll below).
  // Safe before deps load: loadStatus() no-ops until LokaliAPI is ready.
  window.LokaliVerification = window.LokaliVerification || { refresh: loadStatus };

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
