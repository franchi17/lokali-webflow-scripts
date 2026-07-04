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
          // #48: the server refuses unpaid/free plans with a human-readable
          // reason — surface it instead of the generic line.
          var m = err && err.message ? String(err.message) : '';
          alert(/plan|payment/i.test(m) ? m : 'Sorry — could not start verification. Please try again.');
        });
    });
  }

  // Verification is a paid perk. Whether the vendor is on Pro/Featured decides whether
  // they see the "Get Verified" button or the upsell. Cached once billing resolves so
  // renderStatus() can re-run (e.g. return-from-Stripe polling) without re-fetching.
  // Four states so we NEVER nag a paying vendor: 'pro' (paid + active) | 'trial'
  // (Pro/Featured but no successful payment yet — founding free trial; #48: the
  // server refuses to start verification until the first real charge, so show why
  // instead of a dead button) | 'free' | 'unknown'. Only a confirmed 'free' shows
  // the upsell; 'unknown' (billing still loading / cold-start failure) keeps the
  // button, so a Pro/Featured vendor can't be misrendered as Free — the server
  // gate enforces payment regardless.
  var _planState = 'unknown';

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
  function renderStatus(status, planState) {
    status = (status || 'unverified').toLowerCase();
    if (!STATUS_LABELS[status]) status = 'unverified';
    var isVerified = status === 'verified';
    if (planState === 'pro' || planState === 'trial' || planState === 'free' || planState === 'unknown') _planState = planState;
    else planState = _planState;
    var confirmedFree = planState === 'free';
    var trialLocked = planState === 'trial' && !isVerified && status !== 'pending';

    // The "Get Verified" card disappears once verified (only if the wrapper opts in;
    // the settings card omits this so it can keep showing the earned badge).
    $all('[data-lokali-verify-card]').forEach(function (el) {
      el.style.display = isVerified ? 'none' : '';
    });

    // Verified badge — shown only when verified. Safe on dashboard + settings.
    $all('[data-lokali-verified-badge]').forEach(function (el) {
      el.style.display = isVerified ? '' : 'none';
    });

    // Status line. Trial-locked vendors get the WHY instead of "Not verified".
    $all('[data-lokali-verify-status]').forEach(function (el) {
      el.textContent = trialLocked
        ? 'Unlocks after your first plan payment'
        : STATUS_LABELS[status];
    });

    // The button: shown when actionable (not verified/pending) AND the vendor is not
    // confirmed Free or trial-locked. 'unknown' still shows it — optimistic, so a
    // cold-start billing miss never hides the button from a paying vendor (#48: the
    // server enforces payment anyway).
    $all('[data-lokali-verify]').forEach(function (btn) {
      var actionable = !(status === 'pending' || isVerified);
      btn.style.display = (actionable && !confirmedFree && !trialLocked) ? '' : 'none';
      if (status === 'failed') btn.textContent = 'Try again';
    });

    // Upsell (Free vendors, not yet verified): shown ONLY on a confirmed Free plan.
    $all('[data-lokali-verify-upsell]').forEach(function (el) {
      el.style.display = (!isVerified && confirmedFree) ? '' : 'none';
    });

    // Per-state visibility helpers.
    $all('[data-lokali-verify-show]').forEach(function (el) {
      var states = (el.getAttribute('data-lokali-verify-show') || '')
        .split(',').map(function (s) { return s.trim().toLowerCase(); });
      el.style.display = states.indexOf(status) !== -1 ? '' : 'none';
    });

    return status;
  }

  // A real billing response always carries a plan indicator; an empty/errored one
  // (Xano free-tier cold start) does not. Only trust a response that has one.
  function hasPlanInfo(d) {
    return !!(d && (d.plan || d.plan_code || d.plan_name ||
      (d.subscription && d.subscription.plan_code)));
  }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Resolve the vendor's plan → 'pro' | 'free' | 'unknown'. Retries a definitive
  // billing read (cold starts 401/empty until Xano wakes). Returns 'unknown' only if
  // every attempt fails — and 'unknown' keeps the button shown, so a paying vendor is
  // never downgraded to the upsell by a transient miss.
  function fetchPlanState(attempt) {
    attempt = attempt || 0;
    var api = window.LokaliAPI;
    if (!(api && api.plans && typeof api.plans.getMyBilling === 'function')) {
      return Promise.resolve('unknown');
    }
    function retryOrUnknown() {
      if (attempt >= 8) return 'unknown';
      return delay(800).then(function () { return fetchPlanState(attempt + 1); });
    }
    return api.plans.getMyBilling().then(function (res) {
      if (res && !res.error && res.data && hasPlanInfo(res.data)) {
        if (!planIsPro(res.data)) return 'free';
        // Paid plan — but a founding trial hasn't PAID yet (#48). billing_GET
        // only ever reports 'active'|'trialing' for a live sub, so anything
        // that isn't explicitly 'trialing' stays optimistic 'pro'.
        var st = String(res.data.plan_status
          || (res.data.subscription && res.data.subscription.status) || '').toLowerCase();
        return st === 'trialing' ? 'trial' : 'pro';
      }
      return retryOrUnknown();
    }).catch(retryOrUnknown);
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
      fetchPlanState()
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
  // Wait for the XANO AUTH TOKEN, not just Clerk/LokaliAPI. The token is minted by
  // lokali-clerk-auth.js only after the Clerk→Xano sync; until it exists, vendor.me
  // and getMyBilling 401 — which would misrender a paying vendor as Free. On a cold
  // start the sync can take several seconds, so wait up to ~18s, then render anyway.
  function waitForDeps(cb) {
    var checks = 0;
    var iv = setInterval(function () {
      checks++;
      var tok = window.LokaliAPI && window.LokaliAPI.getToken && window.LokaliAPI.getToken();
      if (window.Clerk && window.LokaliAPI && tok) { clearInterval(iv); cb(); }
      else if (checks > 180) { clearInterval(iv); cb(); }
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
