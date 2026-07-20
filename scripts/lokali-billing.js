/*!
 * lokali-billing.js — vendor plan upgrade / billing (Stripe).
 *
 * Pairs with the Vercel endpoints in my-clerk-app/app/api/lokali/billing/*:
 *   POST /billing/checkout         -> { url }  (hosted Stripe Checkout; #88 adds spotlight_start)
 *   POST /billing/portal           -> { url }  (Stripe Customer Portal: manage/cancel/switch)
 *   POST /billing/spotlight-cancel -> { ok, refunded }  (#88 self-cancel ≥7d before start)
 * Auth = the Supabase access token (via LokaliAuth.token()), NOT the Xano token.
 *
 * #88 Spotlight (injected UI, no Webflow work): a "Spotlight" card on
 * /vendor-dashboard/settings (tier picker + date availability + own bookings/
 * waitlist via RLS reads) and two add-on cards on /pricing linking to it.
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

  // Base derived from LOKALI_AUTH_SYNC_URL (canonical) or the legacy
  // LOKALI_CLERK_SYNC_URL, overridable directly (same derivation as
  // lokali-supabase-client.js).
  var BILLING_BASE =
    (window.LOKALI_BILLING_BASE ||
      (window.LOKALI_AUTH_SYNC_URL
        ? String(window.LOKALI_AUTH_SYNC_URL).replace(/\/(auth-sync|clerk-sync)\/?$/, '')
        : window.LOKALI_CLERK_SYNC_URL
          ? String(window.LOKALI_CLERK_SYNC_URL).replace(/\/(auth-sync|clerk-sync)\/?$/, '')
          : 'https://lokali-api.vercel.app/api/lokali')).replace(/\/$/, '');

  var CHECKOUT_URL = BILLING_BASE + '/billing/checkout';
  var PORTAL_URL = BILLING_BASE + '/billing/portal';
  var SPOT_CANCEL_URL = BILLING_BASE + '/billing/spotlight-cancel';

  var PLAN_LABELS = { free: 'Free', pro: 'Pro', featured: 'Featured' };

  // Only fetch plan state where it's rendered — the script may load site-wide.
  var ON_BILLING_PAGE = /^\/(vendor-dashboard|pricing)(\/|$)/.test(window.location.pathname);

  // ── helpers ──────────────────────────────────────────────────────────────────
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function authToken() {
    var A = window.LokaliAuth;
    if (!A || typeof A.token !== 'function') {
      return Promise.reject(new Error('No auth session'));
    }
    return A.token();
  }

  function postJSON(url, body) {
    return authToken().then(function (jwt) {
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
        return { ok: res.ok, status: res.status, data: data || {} };
      });
    });
  }

  function postForRedirect(url, body) {
    return postJSON(url, body).then(function (r) {
      if (!r.ok || !r.data.url) {
        throw new Error(r.data.error || ('Request failed (' + r.status + ')'));
      }
      window.location.assign(r.data.url);
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
          (plan === 'spotlight' || plan === 'spotlight_home' ? 'once' : currentInterval());
        setButtonBusy(btn, true);
        postForRedirect(CHECKOUT_URL, { plan: plan, interval: interval })
          .catch(function (err) {
            setButtonBusy(btn, false);
            console.error('[lokali-billing] checkout failed', err);
            // Server-sent messages (e.g. the pre-launch "you won't be charged
            // yet" notice) are user-facing; only network/5xx get the generic.
            var msg = err && err.message && !/^Request failed/.test(err.message)
              ? err.message
              : 'Sorry — could not start checkout. Please try again.';
            alert(msg);
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
    var cancelPending = b.cancel_at_period_end === true; // 41g — portal cancel scheduled

    // Xano returns epoch ms; tolerate seconds too (values < ~2001 in ms terms).
    var ts = b.current_period_end;
    if (ts && ts < 1e12) ts = ts * 1000;
    var when = ts ? new Date(ts) : null;
    var whenText = when
      ? when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '';

    // Upgrade banner (Free only).
    var banner = document.getElementById('plan-upgrade-banner') ||
      document.querySelector('[data-lokali-upgrade-banner]');
    if (banner) banner.style.display = isFree ? '' : 'none';

    // #47 — the "Pro & Featured only" chips (.plan-badge) on gated settings
    // rows: HIDE them once the vendor is on an entitled paid plan (active or
    // trialing — they have the features, the label is noise). On Free (or a
    // lapsed paid plan, which readers treat as free) the chip STAYS as the
    // explanation and the row's toggle is greyed out + locked so a Free
    // vendor can't flip a switch that does nothing.
    var entitled = !isFree && (status === '' || status === 'active' || status === 'trialing');
    $all('.plan-badge').forEach(function (chip) {
      chip.style.display = entitled ? 'none' : '';
      // Find the settings row this chip belongs to (nearest ancestor that
      // also contains the toggle) and lock/unlock its switch.
      var row = chip.parentElement;
      while (row && row !== document.body && !row.querySelector('.lk-toggle')) row = row.parentElement;
      if (!row || row === document.body) return;
      var toggle = row.querySelector('.lk-toggle');
      var input = toggle && toggle.querySelector('input');
      if (!toggle) return;
      if (entitled) {
        toggle.style.opacity = '';
        toggle.style.pointerEvents = '';
        if (input) input.disabled = false;
      } else {
        toggle.style.opacity = '0.4';
        toggle.style.pointerEvents = 'none';
        if (input) input.disabled = true;
      }
    });

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

    // Renewal date (with a pending cancel this is the END date, not a renewal).
    var renewalEls = $all('[data-lokali-renewal]');
    if (renewalEls.length) {
      renewalEls.forEach(function (el) {
        if (when && !isFree) {
          el.textContent = cancelPending ? 'Ends ' + whenText : whenText;
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      });
    }

    // Status note: pending cancellation (41g) or a non-active status (past_due…).
    $all('[data-lokali-plan-status]').forEach(function (el) {
      if (cancelPending && !isFree) {
        el.textContent = whenText ? 'Cancels on ' + whenText : 'Cancellation pending';
        el.style.display = '';
      } else if (status && status !== 'active' && status !== 'trialing' && !isFree) {
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
      // The client memoizes getMyBilling; drop the cache each poll so we
      // actually re-fetch and catch the webhook flipping the plan.
      if (window.LokaliAPI && window.LokaliAPI.plans && window.LokaliAPI.plans.invalidateBilling) {
        window.LokaliAPI.plans.invalidateBilling();
      }
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
  // Upgrade on /pricing; after the signup completes, this picks the stash up
  // ONCE and sends the brand-new vendor straight into that Stripe Checkout.
  // It waits for a signed-in session WITH a known role (the role lands in the
  // acct cache when the first auth-sync roundtrip finishes) so the server-side
  // vendor-role stamp has landed before calling the role-gated checkout route.
  // Any failure degrades silently — the user just stays on the page they landed
  // on, upgradeable later from /pricing or Settings.
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
      var A = window.LokaliAuth;
      var signedIn = !!(A && typeof A.isSignedIn === 'function' && A.isSignedIn());
      var role = (signedIn && typeof A.role === 'function') ? A.role() : null;
      if (!signedIn || !role) return; // role = auth-sync finished (role stamp landed)
      clearInterval(iv);

      var pending = readPendingPlan();
      if (!pending) return;
      clearPendingPlan(); // one shot — never re-fire, even if checkout fails

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

  // ── #88 Spotlight booking — Settings card + /pricing add-on cards ──────────────
  // Two one-time tiers, both 14-day vendor-picked windows:
  //   category ($75, plan "spotlight")       — top of your category, exclusive
  //   homepage ($150, plan "spotlight_home") — one of 3 "Meet the vendor" cards
  // Booking is created by the Stripe webhook (admin_book_spotlight); this UI
  // reads availability via the spotlight_availability RPC, starts checkout with
  // a spotlight_start, lists the vendor's own bookings/waitlist rows (RLS), and
  // cancels via POST /billing/spotlight-cancel (full refund ≥7d before start).
  var DAY_MS = 86400000;
  var SPOT_TIERS = {
    category: {
      plan: 'spotlight', price: '$75', name: 'Category Spotlight',
      blurb: 'Two weeks at the top of your category on The Market — exclusive, one vendor per category at a time.'
    },
    homepage: {
      plan: 'spotlight_home', price: '$150', name: 'Homepage Spotlight',
      blurb: 'Two weeks as one of three “Meet the vendor” cards on the Lokali homepage — personal, front and center.'
    }
  };
  var spotState = { tier: 'category', me: null, windowDays: 14, cutoffDays: 7 };

  function sbClient() {
    return window.LokaliSupabaseReady
      ? window.LokaliSupabaseReady
      : Promise.reject(new Error('supabase client not loaded'));
  }
  function spotDay(d) {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function spotRange(a, b) { return spotDay(a) + ' – ' + spotDay(b); }
  function spotTodayStr() {
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  }

  function injectSpotStyles() {
    if (document.getElementById('lk-spot-css')) return;
    var css =
      '#lokali-spotlight,#lk-spot-pricing{font-family:"Plus Jakarta Sans",system-ui,sans-serif;}' +
      '.lk-spot-intro{color:#6B6580;font-size:14px;line-height:1.55;margin:4px 0 14px;}' +
      '.lk-spot-tiers{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:6px 0 12px;}' +
      '@media(max-width:640px){.lk-spot-tiers{grid-template-columns:1fr;}}' +
      '.lk-spot-tier{border:1.5px solid #E4E1EF;border-radius:14px;padding:14px 16px;cursor:pointer;background:#fff;transition:border-color .15s,background .15s;}' +
      '.lk-spot-tier.is-on{border-color:#6d5bd0;background:#F5F2FC;}' +
      '.lk-spot-tier .t-price{font-weight:700;font-size:20px;color:#231D3F;}' +
      '.lk-spot-tier .t-name{font-weight:600;font-size:14px;color:#231D3F;margin-top:2px;}' +
      '.lk-spot-tier .t-blurb{font-size:12.5px;color:#6B6580;line-height:1.5;margin-top:4px;}' +
      '.lk-spot-mtv{background:#FBEFD6;color:#9A6B00;border-radius:10px;padding:10px 14px;font-size:13px;line-height:1.5;margin:0 0 12px;}' +
      '.lk-spot-mtv a{color:#9A6B00;font-weight:600;}' +
      '.lk-spot-form{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:2px 0 10px;}' +
      '.lk-spot-form label{font-size:13px;font-weight:600;color:#231D3F;}' +
      '.lk-spot-form input[type=date]{border:1.5px solid #E4E1EF;border-radius:10px;padding:8px 10px;font-family:inherit;font-size:14px;color:#231D3F;background:#fff;}' +
      '.lk-spot-btn{display:inline-block;border:0;border-radius:999px;padding:9px 20px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;background:#6d5bd0;color:#fff;text-decoration:none;line-height:1.2;}' +
      '.lk-spot-btn:hover{background:#5d4bc0;}' +
      '.lk-spot-btn.ghost{background:#fff;color:#6d5bd0;border:1.5px solid #6d5bd0;}' +
      '.lk-spot-btn.ghost:hover{background:#F5F2FC;}' +
      '.lk-spot-btn[disabled]{opacity:.5;pointer-events:none;}' +
      '.lk-spot-result{font-size:14px;margin:4px 0 10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;}' +
      '.lk-spot-result .ok{color:#047857;font-weight:600;}' +
      '.lk-spot-result .full{color:#E0245E;font-weight:600;}' +
      '.lk-spot-rows{margin:10px 0 4px;}' +
      '.lk-spot-rows h4{font-size:13px;font-weight:700;color:#231D3F;letter-spacing:.02em;margin:14px 0 6px;text-transform:uppercase;}' +
      '.lk-spot-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #EFEDF6;font-size:14px;color:#231D3F;flex-wrap:wrap;}' +
      '.lk-spot-row .r-sub{color:#6B6580;font-size:12.5px;}' +
      '.lk-spot-chip{display:inline-block;border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:700;}' +
      '.lk-spot-chip.live{background:#E3F4EC;color:#047857;}' +
      '.lk-spot-chip.booked{background:#ECE8F8;color:#6d5bd0;}' +
      '.lk-spot-chip.notified{background:#FBEFD6;color:#9A6B00;}' +
      '.lk-spot-link{background:none;border:0;padding:0;font-family:inherit;font-size:13px;font-weight:600;color:#E0245E;cursor:pointer;}' +
      '#lk-spot-pricing{max-width:1060px;margin:8px auto 48px;padding:0 20px;}' +
      '#lk-spot-pricing .sp-head{text-align:center;font-size:26px;font-weight:700;color:#231D3F;margin:26px 0 4px;}' +
      '#lk-spot-pricing .sp-sub{text-align:center;color:#6B6580;font-size:15px;margin:0 0 22px;}' +
      '.lk-spotcards{display:grid;grid-template-columns:1fr 1fr;gap:18px;}' +
      '@media(max-width:760px){.lk-spotcards{grid-template-columns:1fr;}}' +
      '.lk-spotcard{background:#fff;border:1.5px solid #E4E1EF;border-radius:18px;padding:26px 26px 24px;box-shadow:0 10px 28px rgba(60,47,110,.06);}' +
      '.lk-spotcard .c-name{font-weight:700;font-size:17px;color:#231D3F;}' +
      '.lk-spotcard .c-price{font-weight:800;font-size:30px;color:#6d5bd0;margin:6px 0 2px;}' +
      '.lk-spotcard .c-per{color:#6B6580;font-size:13px;margin-bottom:12px;}' +
      '.lk-spotcard ul{list-style:none;padding:0;margin:0 0 16px;}' +
      '.lk-spotcard li{position:relative;padding:5px 0 5px 26px;color:#3C3550;font-size:14px;line-height:1.45;}' +
      '.lk-spotcard li:before{content:"✓";position:absolute;left:0;top:4px;width:18px;height:18px;border-radius:50%;background:#ECE8F8;color:#6d5bd0;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;}';
    var tag = document.createElement('style');
    tag.id = 'lk-spot-css';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ---- Settings page card -------------------------------------------------------
  function spotStartParam(dateStr) {
    // Today -> "now" (a literal midnight would already be in the past).
    return dateStr === spotTodayStr() ? 'now' : dateStr;
  }

  function spotCheckAvailability() {
    var input = document.getElementById('lk-spot-date');
    var out = document.getElementById('lk-spot-result');
    if (!input || !out) return;
    var dateStr = input.value;
    if (!dateStr) { out.innerHTML = '<span class="full">Pick a start date first.</span>'; return; }
    var start = dateStr === spotTodayStr() ? new Date() : new Date(dateStr + 'T00:00:00');
    var end = new Date(start.getTime() + spotState.windowDays * DAY_MS);
    if (start.getTime() > Date.now() + 180 * DAY_MS) {
      out.innerHTML = '<span class="full">Windows can be booked up to 180 days out.</span>';
      return;
    }
    out.textContent = 'Checking…';
    var tier = spotState.tier;
    sbClient().then(function (c) {
      return c.rpc('spotlight_availability', {
        p_tier: tier, p_from: start.toISOString(), p_to: end.toISOString()
      });
    }).then(function (res) {
      if (res.error) throw res.error;
      var d = res.data || {};
      if (d.ok === false) throw new Error(d.reason || 'unavailable');
      var busy = (d.busy || []).filter(function (b) {
        return new Date(b.starts_at) < end && new Date(b.ends_at) > start;
      });
      var full = busy.length >= (d.cap || 1);
      if (!full) {
        out.innerHTML =
          '<span class="ok">✓ Available — ' + spotRange(start, end) + '</span>' +
          '<button type="button" class="lk-spot-btn" id="lk-spot-book">Book for ' +
          SPOT_TIERS[tier].price + '</button>';
        document.getElementById('lk-spot-book').addEventListener('click', function () {
          var btn = this;
          setButtonBusy(btn, true);
          postForRedirect(CHECKOUT_URL, {
            plan: SPOT_TIERS[tier].plan, interval: 'once',
            spotlight_start: spotStartParam(dateStr)
          }).catch(function (err) {
            setButtonBusy(btn, false);
            var msg = err && err.message && !/^Request failed/.test(err.message)
              ? err.message
              : 'Sorry — could not start checkout. Please try again.';
            alert(msg);
          });
        });
      } else {
        out.innerHTML =
          '<span class="full">Those dates are taken.</span>' +
          '<button type="button" class="lk-spot-btn ghost" id="lk-spot-join">Join the waitlist for ' +
          spotDay(start) + '</button>';
        document.getElementById('lk-spot-join').addEventListener('click', function () {
          spotJoinWaitlist(dateStr, this);
        });
      }
    }).catch(function (err) {
      console.warn('[lokali-billing] spotlight availability failed', err);
      out.innerHTML = '<span class="full">Could not check availability — please try again.</span>';
    });
  }

  function spotJoinWaitlist(dateStr, btn) {
    var me = spotState.me;
    if (!me || !me.id) { alert('Please refresh and try again.'); return; }
    setButtonBusy(btn, true);
    sbClient().then(function (c) {
      return c.from('spotlight_waitlist').insert({
        vendors_id: me.id,
        tier: spotState.tier,
        category_id: spotState.tier === 'category'
          ? ((me.categories_id && me.categories_id[0]) || null)
          : null,
        desired_start: dateStr
      });
    }).then(function (res) {
      setButtonBusy(btn, false);
      if (res.error) {
        if (String(res.error.code) === '23505') {
          alert('You’re already on the waitlist for that date.');
        } else {
          console.warn('[lokali-billing] waitlist join failed', res.error);
          alert('Could not join the waitlist — please try again.');
        }
        return;
      }
      btn.outerHTML = '<span class="ok">✓ On the waitlist — we’ll email you if those dates open up.</span>';
      spotLoadLists();
    });
  }

  function spotCancelBooking(bookingId, priceLabel, btn) {
    if (!confirm('Cancel this Spotlight? You’ll get a full ' + priceLabel + ' refund.')) return;
    setButtonBusy(btn, true);
    postJSON(SPOT_CANCEL_URL, { booking_id: bookingId }).then(function (r) {
      setButtonBusy(btn, false);
      if (!r.ok) {
        alert((r.data && r.data.error) || 'Could not cancel — please try again.');
        return;
      }
      alert(r.data.refunded
        ? 'Canceled — your refund is on its way (it can take a few business days to appear).'
        : 'Canceled. The refund needs a manual check on our side — if it hasn’t appeared in a few days, contact us.');
      spotLoadLists();
    }).catch(function (err) {
      setButtonBusy(btn, false);
      console.warn('[lokali-billing] spotlight cancel failed', err);
      alert('Could not cancel — please try again.');
    });
  }

  function spotLoadLists() {
    var mineHost = document.getElementById('lk-spot-mine');
    var waitHost = document.getElementById('lk-spot-wait');
    if (!mineHost || !waitHost) return;
    sbClient().then(function (c) {
      return Promise.all([
        c.from('spotlight_bookings').select('id,tier,starts_at,ends_at,status')
          .in('status', ['booked', 'active']).order('starts_at'),
        c.from('spotlight_waitlist').select('id,tier,desired_start,notified_at')
          .order('desired_start')
      ]);
    }).then(function (rs) {
      var bookings = (rs[0] && rs[0].data) || [];
      var waits = (rs[1] && rs[1].data) || [];

      var h = '';
      if (bookings.length) {
        h += '<h4>Your Spotlights</h4>';
        bookings.forEach(function (b) {
          var t = SPOT_TIERS[b.tier] || SPOT_TIERS.category;
          var live = b.status === 'active';
          var cancelable = !live &&
            new Date(b.starts_at).getTime() >= Date.now() + spotState.cutoffDays * DAY_MS;
          h += '<div class="lk-spot-row"><div><div>' + t.name + '</div>' +
            '<div class="r-sub">' + spotRange(b.starts_at, b.ends_at) + '</div></div>' +
            '<div style="display:flex;gap:10px;align-items:center">' +
            '<span class="lk-spot-chip ' + (live ? 'live' : 'booked') + '">' + (live ? 'Live now' : 'Booked') + '</span>' +
            (cancelable
              ? '<button type="button" class="lk-spot-link" data-spot-cancel="' + b.id +
                '" data-spot-price="' + t.price + '">Cancel</button>'
              : '') +
            '</div></div>';
        });
      }
      mineHost.innerHTML = h ? '<div class="lk-spot-rows">' + h + '</div>' : '';
      $all('[data-spot-cancel]').forEach(function (el) {
        el.addEventListener('click', function () {
          spotCancelBooking(Number(el.getAttribute('data-spot-cancel')), el.getAttribute('data-spot-price'), el);
        });
      });

      var w = '';
      if (waits.length) {
        w += '<h4>Your waitlist spots</h4>';
        waits.forEach(function (row) {
          var t = SPOT_TIERS[row.tier] || SPOT_TIERS.category;
          w += '<div class="lk-spot-row"><div><div>' + t.name + '</div>' +
            '<div class="r-sub">around ' + spotDay(row.desired_start + 'T00:00:00') + '</div></div>' +
            '<div style="display:flex;gap:10px;align-items:center">' +
            (row.notified_at ? '<span class="lk-spot-chip notified">Emailed</span>' : '') +
            '<button type="button" class="lk-spot-link" data-spot-leave="' + row.id + '">Leave</button>' +
            '</div></div>';
        });
      }
      waitHost.innerHTML = w ? '<div class="lk-spot-rows">' + w + '</div>' : '';
      $all('[data-spot-leave]').forEach(function (el) {
        el.addEventListener('click', function () {
          sbClient().then(function (c) {
            return c.from('spotlight_waitlist').delete().eq('id', Number(el.getAttribute('data-spot-leave')));
          }).then(function () { spotLoadLists(); });
        });
      });
    }).catch(function (err) {
      console.warn('[lokali-billing] spotlight lists failed', err);
    });
  }

  function spotUpdateMtvHint() {
    var hint = document.getElementById('lk-spot-mtv');
    if (!hint) return;
    var me = spotState.me || {};
    var bioOk = String(me.owner_bio || '').trim().length >= 40;
    var missing = !(me.owner_name && String(me.owner_name).trim()) ||
      !(me.owner_photo && String(me.owner_photo).trim()) || !bioOk;
    hint.style.display = (spotState.tier === 'homepage' && missing) ? '' : 'none';
  }

  function initSpotlightSettingsCard() {
    if (!/^\/vendor-dashboard\/settings/.test(window.location.pathname)) return;
    if (document.getElementById('lokali-spotlight')) return;
    var anchor = document.querySelector('.section-12');
    if (!anchor) return;
    injectSpotStyles();

    var sec = document.createElement('section');
    sec.className = anchor.className;   // native settings-card look
    sec.id = 'lokali-spotlight';
    sec.innerHTML =
      '<div class="form-heading-div">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="flex:none"><path d="M12 2l2.2 6.2L20 10l-5.8 1.8L12 18l-2.2-6.2L4 10l5.8-1.8L12 2z" fill="#6d5bd0"/><path d="M18.5 15l1 2.7 2.5.8-2.5.8-1 2.7-1-2.7-2.5-.8 2.5-.8 1-2.7z" fill="#F1A33C"/></svg>' +
        '<div class="section-heading">Spotlight</div>' +
      '</div>' +
      '<div class="lk-spot-intro">A one-time, two-week boost — pick your dates, pay once, done. ' +
        'No subscription needed.</div>' +
      '<div id="lk-spot-mine"></div>' +
      '<div class="lk-spot-tiers">' +
        Object.keys(SPOT_TIERS).map(function (k) {
          var t = SPOT_TIERS[k];
          return '<div class="lk-spot-tier' + (k === spotState.tier ? ' is-on' : '') + '" data-spot-tier="' + k + '">' +
            '<div class="t-price">' + t.price + '</div><div class="t-name">' + t.name + '</div>' +
            '<div class="t-blurb">' + t.blurb + '</div></div>';
        }).join('') +
      '</div>' +
      '<div class="lk-spot-mtv" id="lk-spot-mtv" style="display:none">The Homepage Spotlight is all about ' +
        'the person behind the business — fill in your Meet-the-Vendor info (name, photo, and a short bio) ' +
        'on <a href="/vendor-dashboard/profile">your profile</a> first.</div>' +
      '<div class="lk-spot-form">' +
        '<label for="lk-spot-date">Start date</label>' +
        '<input type="date" id="lk-spot-date" min="' + spotTodayStr() + '">' +
        '<button type="button" class="lk-spot-btn ghost" id="lk-spot-check">Check availability</button>' +
      '</div>' +
      '<div class="lk-spot-result" id="lk-spot-result"></div>' +
      '<div id="lk-spot-wait"></div>';
    anchor.insertAdjacentElement('afterend', sec);

    $all('[data-spot-tier]').forEach(function (el) {
      el.addEventListener('click', function () {
        spotState.tier = el.getAttribute('data-spot-tier');
        $all('[data-spot-tier]').forEach(function (o) {
          o.classList.toggle('is-on', o === el);
        });
        var out = document.getElementById('lk-spot-result');
        if (out) out.innerHTML = '';
        spotUpdateMtvHint();
      });
    });
    document.getElementById('lk-spot-check').addEventListener('click', spotCheckAvailability);

    if (window.LokaliAPI && window.LokaliAPI.vendors && window.LokaliAPI.vendors.me) {
      window.LokaliAPI.vendors.me().then(function (res) {
        spotState.me = (res && (res.data || res)) || null;
        spotUpdateMtvHint();
      }).catch(function () {});
    }
    spotLoadLists();

    if (window.location.hash === '#lokali-spotlight') {
      setTimeout(function () { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 400);
    }
  }

  // ---- /pricing add-on cards ----------------------------------------------------
  function initPricingSpotlightCards() {
    if (!/^\/pricing(\/|$)/.test(window.location.pathname)) return;
    if (document.getElementById('lk-spot-pricing')) return;
    var wrap = document.querySelector('.pricing-tier-wrapper');
    if (!wrap) return;
    var host = wrap.closest('section') || wrap.parentElement;
    injectSpotStyles();

    var sec = document.createElement('section');
    sec.id = 'lk-spot-pricing';
    sec.innerHTML =
      '<div class="sp-head">Spotlight add-ons</div>' +
      '<div class="sp-sub">One-time, two-week boosts on top of any plan — including Free.</div>' +
      '<div class="lk-spotcards">' +
        '<div class="lk-spotcard">' +
          '<div class="c-name">✦ Category Spotlight</div>' +
          '<div class="c-price">$75</div><div class="c-per">one time · 14 days</div>' +
          '<ul><li>Top of your category on The Market</li>' +
          '<li>✦ Spotlight badge on your card</li>' +
          '<li>Exclusive — one vendor per category at a time</li>' +
          '<li>Pick the two-week window that suits you</li></ul>' +
          '<a class="lk-spot-btn" href="/vendor-dashboard/settings#lokali-spotlight">Book a Spotlight</a>' +
        '</div>' +
        '<div class="lk-spotcard">' +
          '<div class="c-name">✦ Homepage Spotlight</div>' +
          '<div class="c-price">$150</div><div class="c-per">one time · 14 days</div>' +
          '<ul><li>A “Meet the vendor” card on the Lokali homepage</li>' +
          '<li>You and your story — front and center</li>' +
          '<li>Only 3 vendors at a time, site-wide</li>' +
          '<li>Pick the two-week window that suits you</li></ul>' +
          '<a class="lk-spot-btn" href="/vendor-dashboard/settings#lokali-spotlight">Book a Spotlight</a>' +
        '</div>' +
      '</div>';
    host.insertAdjacentElement('afterend', sec);
  }

  // ── boot ────────────────────────────────────────────────────────────────────────
  function waitForDeps(cb) {
    var checks = 0;
    var iv = setInterval(function () {
      checks++;
      if (window.LokaliAuth && window.LokaliAPI) { clearInterval(iv); cb(); }
      if (checks > 100) clearInterval(iv);
    }, 100);
  }

  function init() {
    bindIntervalControls();
    bindCheckoutButtons();
    tagSettingsPortalLink();
    bindPortalButtons();
    initPricingSpotlightCards();   // #88 — static cards, no auth needed
    waitForDeps(function () {
      // Resume runs on ANY page — a fresh signup can land anywhere.
      resumePendingCheckout();
      initSpotlightSettingsCard(); // #88 — needs LokaliAPI/Auth for state
      if (ON_BILLING_PAGE) {
        loadBilling();
        handleReturnFromStripe();
      }
    });
  }

  // Small public surface so other scripts (pricingcta.js) can start a checkout
  // or open the portal without duplicating the auth/fetch plumbing.
  window.LokaliBilling = {
    checkout: function (plan, interval, extra) {
      var body = { plan: plan, interval: interval };
      if (extra && typeof extra === 'object') {
        Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
      }
      return postForRedirect(CHECKOUT_URL, body);
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
