/*!
 * lokali-billing.js — vendor plan upgrade / billing (Stripe).
 *
 * Pairs with the Vercel endpoints in my-clerk-app/app/api/lokali/billing/*:
 *   POST /billing/checkout  -> { url }   (hosted Stripe Checkout)
 *   POST /billing/portal    -> { url }   (Stripe Customer Portal: manage/cancel/switch)
 * Auth = the Clerk session JWT (same token lokali-clerk-auth.js uses), NOT the Xano token.
 *
 * Reads the current plan via LokaliAPI.plans.getMyBilling() to render UI state.
 * Entitlement itself is granted server-side by the Stripe webhook — this script is UI only.
 *
 * ── Webflow wiring (add these attributes/IDs in the Designer) ──────────────────
 * UPGRADE BUTTONS:  add  data-lokali-checkout  +  data-plan="pro|featured|spotlight"
 *                   (interval comes from the toggle below; or hard-set data-interval="year")
 *                   Spotlight button: data-plan="spotlight" data-interval="once".
 * MANAGE BUTTON:    add  data-lokali-portal  (opens Stripe Customer Portal).
 * INTERVAL TOGGLE:  a checkbox/switch with  data-lokali-interval-toggle  (checked = annual),
 *                   OR two radios/buttons with  data-lokali-interval="month|year".
 * PRICE SWAP (opt): elements with  data-lokali-price="month"  or  data-lokali-price="year"
 *                   are shown/hidden to match the toggle.
 * PLAN STATE (opt):
 *   - #plan-upgrade-banner  (or [data-lokali-upgrade-banner]) — shown only on Free plan.
 *   - [data-lokali-plan-card="free|pro|featured"] — the active one gets class "is-current-plan"
 *     and its [data-lokali-current-badge] child is shown.
 *   - [data-lokali-plan-name]   -> filled with "Free|Pro|Featured"
 *   - [data-lokali-renewal]     -> filled with the renewal date (or hidden if none)
 *   - [data-lokali-plan-status] -> filled with status (e.g. "Past due") when not active
 *
 * ── Config (set before this script if your URLs differ) ────────────────────────
 *   window.LOKALI_BILLING_BASE = 'https://lokali-api.vercel.app/api/lokali';
 */
(function () {
  'use strict';

  var BILLING_BASE =
    (window.LOKALI_BILLING_BASE ||
      (window.LOKALI_CLERK_SYNC_URL
        ? window.LOKALI_CLERK_SYNC_URL.replace(/\/clerk-sync\/?$/, '')
        : 'https://lokali-api.vercel.app/api/lokali')).replace(/\/$/, '');

  var CHECKOUT_URL = BILLING_BASE + '/billing/checkout';
  var PORTAL_URL = BILLING_BASE + '/billing/portal';

  var PLAN_LABELS = { free: 'Free', pro: 'Pro', featured: 'Featured' };

  // Only fetch plan state where it's rendered — the script may load site-wide.
  var ON_BILLING_PAGE = /^\/(vendor-dashboard|pricing)(\/|$)/.test(window.location.pathname);

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
      btn.dataset.lokaliPrevText = btn.dataset.lokaliPrevText || btn.textContent;
      btn.setAttribute('aria-busy', 'true');
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.6';
    } else {
      btn.removeAttribute('aria-busy');
      btn.style.pointerEvents = '';
      btn.style.opacity = '';
    }
  }

  // ── interval toggle (monthly / annual) ─────────────────────────────────────────
  function currentInterval() {
    var sw = document.querySelector('[data-lokali-interval-toggle]');
    if (sw) return (sw.checked ? 'year' : 'month');
    var on = document.querySelector('[data-lokali-interval].is-active, [data-lokali-interval][aria-pressed="true"]');
    if (on) return on.getAttribute('data-lokali-interval') === 'year' ? 'year' : 'month';
    return 'month';
  }

  function applyIntervalToUI() {
    var iv = currentInterval();
    $all('[data-lokali-price]').forEach(function (el) {
      el.style.display = (el.getAttribute('data-lokali-price') === iv) ? '' : 'none';
    });
    $all('[data-lokali-interval]').forEach(function (el) {
      var active = el.getAttribute('data-lokali-interval') === iv;
      el.classList.toggle('is-active', active);
      if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', String(active));
    });
  }

  function bindIntervalControls() {
    var sw = document.querySelector('[data-lokali-interval-toggle]');
    if (sw) sw.addEventListener('change', applyIntervalToUI);
    $all('[data-lokali-interval]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (sw) sw.checked = el.getAttribute('data-lokali-interval') === 'year';
        // Mark active immediately for radio/button style toggles.
        $all('[data-lokali-interval]').forEach(function (o) { o.classList.remove('is-active'); });
        el.classList.add('is-active');
        applyIntervalToUI();
      });
    });
    applyIntervalToUI();
  }

  // ── upgrade + manage buttons ───────────────────────────────────────────────────
  function bindCheckoutButtons() {
    $all('[data-lokali-checkout]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var plan = btn.getAttribute('data-plan');
        if (!plan) { console.warn('[lokali-billing] button missing data-plan', btn); return; }
        var interval = btn.getAttribute('data-interval') ||
          (plan === 'spotlight' ? 'once' : currentInterval());
        setButtonBusy(btn, true);
        postForRedirect(CHECKOUT_URL, { plan: plan, interval: interval })
          .catch(function (err) {
            setButtonBusy(btn, false);
            console.error('[lokali-billing] checkout failed', err);
            alert('Sorry — could not start checkout. Please try again.');
          });
      });
    });
  }

  function bindPortalButtons() {
    $all('[data-lokali-portal]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        setButtonBusy(btn, true);
        postForRedirect(PORTAL_URL, {})
          .catch(function (err) {
            setButtonBusy(btn, false);
            console.error('[lokali-billing] portal failed', err);
            alert('Sorry — could not open billing management. Please try again.');
          });
      });
    });
  }

  // ── render current plan state ──────────────────────────────────────────────────
  function renderBilling(b) {
    b = b || {};
    var plan = (b.plan || 'free').toLowerCase();
    var status = (b.plan_status || '').toLowerCase();
    var isFree = plan === 'free' || !plan;

    // Upgrade banner (Free only).
    var banner = document.getElementById('plan-upgrade-banner') ||
      document.querySelector('[data-lokali-upgrade-banner]');
    if (banner) banner.style.display = isFree ? '' : 'none';

    // Highlight the active plan card.
    $all('[data-lokali-plan-card]').forEach(function (card) {
      var isCurrent = card.getAttribute('data-lokali-plan-card') === plan;
      card.classList.toggle('is-current-plan', isCurrent);
      var badge = card.querySelector('[data-lokali-current-badge]');
      if (badge) badge.style.display = isCurrent ? '' : 'none';
    });

    // Plan name text.
    $all('[data-lokali-plan-name]').forEach(function (el) {
      el.textContent = PLAN_LABELS[plan] || 'Free';
    });

    // Renewal date.
    var renewalEls = $all('[data-lokali-renewal]');
    if (renewalEls.length) {
      // Xano returns epoch ms; tolerate seconds too (values < ~2001 in ms terms).
      var ts = b.current_period_end;
      if (ts && ts < 1e12) ts = ts * 1000;
      var when = ts ? new Date(ts) : null;
      renewalEls.forEach(function (el) {
        if (when && !isFree) {
          el.textContent = when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      });
    }

    // Non-active status note (e.g. past_due).
    $all('[data-lokali-plan-status]').forEach(function (el) {
      if (status && status !== 'active' && status !== 'trialing' && !isFree) {
        el.textContent = status.replace('_', ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  }

  function loadBilling() {
    if (!(window.LokaliAPI && window.LokaliAPI.plans && window.LokaliAPI.plans.getMyBilling)) {
      return Promise.resolve(null);
    }
    return window.LokaliAPI.plans.getMyBilling().then(function (res) {
      var data = res && (res.data || res);
      renderBilling(data || {});
      return data;
    }).catch(function (err) {
      console.warn('[lokali-billing] getMyBilling failed', err);
      return null;
    });
  }

  // After returning from Stripe (?status=success) the webhook may land a moment later —
  // re-poll the plan a few times so the UI reflects the upgrade without a manual refresh.
  function handleReturnFromStripe() {
    var status = new URLSearchParams(window.location.search).get('status');
    if (status !== 'success') return;
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      loadBilling();
      if (tries >= 5) clearInterval(iv);
    }, 1500);
  }

  // ── settings page self-wire ─────────────────────────────────────────────────────
  // The Settings "Subscription & Plan" card ships with a "Click HERE" Stripe row;
  // tag it as a portal button so no Webflow attribute work is needed.
  function tagSettingsPortalLink() {
    if (!/^\/vendor-dashboard\/settings/.test(window.location.pathname)) return;
    var link = document.querySelector('.div-block-158.stripe a');
    if (link && !link.hasAttribute('data-lokali-portal')) {
      link.setAttribute('data-lokali-portal', '');
    }
  }

  // ── post-signup checkout resume ─────────────────────────────────────────────────
  // pricingcta.js stashes the chosen paid plan when an ANONYMOUS visitor clicks
  // Upgrade on /pricing; after the Clerk signup completes, this picks the stash up
  // ONCE and sends the brand-new vendor straight into that Stripe Checkout.
  // It waits for the Xano token (set when the first clerk-sync roundtrip finishes)
  // so the server-side vendor-role stamp has landed before calling the role-gated
  // checkout route. Any failure degrades silently — the user just stays on the
  // page they landed on, upgradeable later from /pricing or Settings.
  var PENDING_PLAN_KEY = 'lokali_pending_plan';
  var PENDING_MAX_AGE_MS = 30 * 60 * 1000;

  function readPendingPlan() {
    try {
      var raw = sessionStorage.getItem(PENDING_PLAN_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.plan || p.plan === 'free') return null;
      if (!p.ts || (Date.now() - p.ts) > PENDING_MAX_AGE_MS) return null;
      return p;
    } catch (e) { return null; }
  }

  function clearPendingPlan() {
    try { sessionStorage.removeItem(PENDING_PLAN_KEY); } catch (e) {}
  }

  function resumePendingCheckout() {
    if (!readPendingPlan()) return;
    var waited = 0;
    var iv = setInterval(function () {
      waited += 500;
      if (waited >= 30000) { clearInterval(iv); return; }
      var user = window.Clerk && window.Clerk.user;
      var haveToken = false;
      try { haveToken = !!localStorage.getItem('LOKALI_AUTH_TOKEN'); } catch (e) {}
      if (!user || !haveToken) return;
      clearInterval(iv);

      var pending = readPendingPlan();
      if (!pending) return;
      clearPendingPlan(); // one shot — never re-fire, even if checkout fails

      var role = user.publicMetadata && user.publicMetadata.role;
      if (role === 'customer') return; // wrong account type; drop the intent

      var body = { plan: pending.plan, interval: pending.interval || 'month' };
      postForRedirect(CHECKOUT_URL, body).catch(function () {
        // The very first sync may still be stamping the role — retry once.
        setTimeout(function () {
          postForRedirect(CHECKOUT_URL, body).catch(function (err) {
            console.warn('[lokali-billing] pending-plan resume failed; continuing normally', err);
          });
        }, 4000);
      });
    }, 500);
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
    bindIntervalControls();
    bindCheckoutButtons();
    tagSettingsPortalLink();
    bindPortalButtons();
    waitForDeps(function () {
      // Resume runs on ANY page — a fresh signup can land anywhere.
      resumePendingCheckout();
      if (ON_BILLING_PAGE) {
        loadBilling();
        handleReturnFromStripe();
      }
    });
  }

  // Small public surface so other scripts (pricingcta.js) can start a checkout
  // or open the portal without duplicating the auth/fetch plumbing.
  window.LokaliBilling = {
    checkout: function (plan, interval) {
      return postForRedirect(CHECKOUT_URL, { plan: plan, interval: interval });
    },
    portal: function () {
      return postForRedirect(PORTAL_URL, {});
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
