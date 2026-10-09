/*!
 * lokali-billing.js — vendor plan upgrade / billing (Stripe).
 *
 * Pairs with the Vercel endpoints in my-clerk-app/app/api/lokali/billing/*:
 *   POST /billing/checkout         -> { url }  (hosted Stripe Checkout; #88 adds spotlight_start)
 *   POST /billing/portal           -> { url }  (Stripe Customer Portal: manage/cancel/switch)
 *   POST /billing/spotlight-cancel -> { ok, refunded }  (#88 self-cancel ≥7d before start)
 * Auth = the Supabase access token (via LokaliAuth.token()).
 *
 * #88 Spotlight (injected UI, no Webflow work): a "Spotlight" card on
 * /vendor-dashboard/settings (tier picker + date availability + own bookings/
 * waitlist via RLS reads) and two add-on cards on /pricing linking to it.
 *
 * Reads the current plan via LokaliAPI.plans.getMyBilling() to render UI state.
 * Entitlement itself is granted server-side by the Stripe webhook — this script is UI only.
 *
 * 2026-10-02 in-app plan picker: on /vendor-dashboard* every <a href="/pricing">
 * (no hash, or #plans) opens window.LokaliUpgrade.open() instead, a modal with the
 * current plan, Pro/Featured cards, a Monthly/Yearly toggle and one button straight
 * to checkout (or the Stripe portal for a downgrade). #upgrade in the URL opens it
 * too. Add data-lokali-no-upgrade-modal to a link to opt it out.
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

  // Base derived from LOKALI_AUTH_SYNC_URL (canonical), overridable directly
  // (same derivation as lokali-supabase-client.js). CLEAN-C23: the legacy
  // LOKALI_CLERK_SYNC_URL branch was removed 2026-09-16.
  var BILLING_BASE =
    (window.LOKALI_BILLING_BASE ||
      (window.LOKALI_AUTH_SYNC_URL
        ? String(window.LOKALI_AUTH_SYNC_URL).replace(/\/(auth-sync|clerk-sync)\/?$/, '')
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
        var reqErr = new Error(r.data.error || ('Request failed (' + r.status + ')'));
        reqErr.code = r.data.code || ''; // e.g. 'prelaunch' (Spotlight purchases closed)
        throw reqErr;
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
              : 'Sorry, we could not start checkout. Please try again.';
            // Spotlight purchases closed server-side: say it in our words, with no
            // launch date (F 2026-09-21), whatever the deployed route's text says.
            if (err && err.code === 'prelaunch' && (plan === 'spotlight' || plan === 'spotlight_home')) msg = SPOT_NOT_OPEN_MSG;
            alert(msg);
          });
      });
    });
  }

  // A comped vendor (paid plan, billing_provider 'internal') has no Stripe
  // subscription, so the portal would open empty. Their Settings link starts a
  // checkout for the plan they are already on instead (see renderCompedSetup).
  function startSetupCheckout(btn) {
    var plan = btn.getAttribute('data-lokali-setup-plan');
    var interval = btn.getAttribute('data-interval') === 'year' ? 'year' : 'month';
    setButtonBusy(btn, true);
    postForRedirect(CHECKOUT_URL, { plan: plan, interval: interval })
      .catch(function (err) {
        setButtonBusy(btn, false);
        console.error('[lokali-billing] setup checkout failed', err);
        var msg = err && err.message && !/^Request failed/.test(err.message)
          ? err.message
          : 'Sorry, we could not start checkout. Please try again.';
        alert(msg);
      });
  }

  function bindPortalButtons() {
    $all('[data-lokali-portal]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (btn.hasAttribute('data-lokali-setup-plan')) { startSetupCheckout(btn); return; }
        setButtonBusy(btn, true);
        postForRedirect(PORTAL_URL, {})
          .catch(function (err) {
            setButtonBusy(btn, false);
            console.error('[lokali-billing] portal failed', err);
            alert('Sorry, we could not open billing management. Please try again.');
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

    // Legacy rows carried epoch ms; tolerate seconds too (values < ~2001 in ms terms).
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

    // Bridge comp = entitled paid plan, no Stripe subscription behind it, and
    // tagged comp_kind 'until_billing' (patch_mias_table_featured_comp.sql).
    // Untagged and 'forever' comps (friends and family) are NOT asked for a card.
    var comped = entitled && (plan === 'pro' || plan === 'featured') &&
      b.billing_provider === 'internal' && b.comp_kind === 'until_billing';
    renderCompedSetup(comped ? plan : null);

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

  // Settings "Plan and billing" row for a comped vendor: the portal link becomes
  // two checkout links (monthly / yearly) for their current plan, with a note
  // saying why. Idempotent; lokali-settings-page.js leaves a link carrying
  // data-lokali-setup-plan alone, so load order between the two does not matter.
  var SETUP_NOTE = 'Your plan is on us for now. Add a card to keep it going. ' +
    'Stripe shows the date billing starts before you confirm, and nothing is charged before then.';
  function renderCompedSetup(plan) {
    if (!/^\/vendor-dashboard\/settings/.test(window.location.pathname)) return;
    var link = document.querySelector('.div-block-158.stripe a[data-lokali-portal]') ||
      document.querySelector('.div-block-158.stripe a');
    if (!link || !link.parentNode) return;
    var yearly = link.parentNode.querySelector('[data-lokali-setup-yearly]');
    if (!plan) {
      if (link.hasAttribute('data-lokali-setup-plan')) {
        link.removeAttribute('data-lokali-setup-plan');
        link.removeAttribute('data-interval');
        (link.querySelector('.text-link') || link).textContent = 'Manage billing';
      }
      if (yearly) yearly.parentNode.removeChild(yearly);
      return;
    }
    link.setAttribute('data-lokali-setup-plan', plan);
    link.setAttribute('data-interval', 'month');
    (link.querySelector('.text-link') || link).textContent = 'Set up monthly billing';
    var note = link.parentNode.querySelector('.lok-set-billnote');
    if (!note) {
      note = document.createElement('div');
      note.className = 'settings-lokali-text lok-set-billnote';
      link.parentNode.insertBefore(note, link);
    }
    note.textContent = SETUP_NOTE;
    if (!yearly) {
      yearly = link.cloneNode(true);
      yearly.removeAttribute('id');
      yearly.removeAttribute('data-lokali-portal');
      yearly.setAttribute('data-lokali-setup-yearly', '');
      yearly.setAttribute('href', '#');
      yearly.style.marginLeft = '16px';
      yearly.addEventListener('click', function (e) { e.preventDefault(); startSetupCheckout(yearly); });
      link.parentNode.insertBefore(yearly, link.nextSibling);
    }
    yearly.setAttribute('data-lokali-setup-plan', plan);
    yearly.setAttribute('data-interval', 'year');
    (yearly.querySelector('.text-link') || yearly).textContent = 'Set up yearly billing';
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
      // #88 — a Spotlight purchase lands via the same webhook: refresh the
      // card's bookings + availability cache too, or the just-paid window
      // keeps rendering as open (inviting a double booking).
      if (document.getElementById('lokali-spotlight')) {
        spotState.busyByTier = {};
        spotLoadLists();
        if (spotState.entitled !== false) renderSpotCal();
      }
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
      blurb: 'Two weeks at the top of your category on The Market, exclusive to one vendor per category at a time.'
    },
    homepage: {
      plan: 'spotlight_home', price: '$150', name: 'Homepage Spotlight',
      blurb: 'Two weeks as one of three “Meet the vendor” cards on the Lokali homepage, plus a shoutout in The Neighborhood Edit, our newsletter.'
    }
  };
  // Windows may not START before public launch (decision 2026-07-20). String
  // compare works on YYYY-MM-DD; inert once launch passes (today > floor).
  var SPOT_FLOOR = '2026-10-01';
  // F 2026-09-21: there is no "October 1 launch". Spotlight is a one-time CHARGE and
  // nobody is charged yet, so the checkout route refuses it while
  // founding_config.prelaunch_open is true. The note below follows THAT, not a date:
  // flip this to true in the same release that flips prelaunch_open (the old banner
  // keyed off SPOT_FLOOR and would have vanished on Oct 1 with booking still closed).
  var SPOT_BOOKING_OPEN = false;
  // F 2026-09-21: Spotlight is HIDDEN for now ("introduce that later when we actually
  // feel it makes sense"). 0 bookings and 0 waitlist rows existed when this was set.
  // false = the Settings card is never mounted; nothing else is removed (SQL, checkout,
  // homepage / Market slots and the admin queue all stay and render nothing without a
  // booking). To bring it back: set this true, restore the content listed in TODO #192,
  // and decide SPOT_BOOKING_OPEN above.
  var SPOT_ENABLED = false;
  var SPOT_NOT_OPEN_MSG = 'Spotlight booking is not open yet. You can look at dates now, and we will let you know when booking opens. You will not be charged for anything before then.';
  var spotState = {
    tier: 'category', me: null, windowDays: 14, cutoffDays: 7,
    // Calendar picker state: viewed month (Date at day 1), per-tier busy cache
    // ({busy:[{s,e} ms], cap}), and the selected start date ('YYYY-MM-DD').
    calMonth: null, busyByTier: {}, sel: null
  };

  function sbClient() {
    return window.LokaliSupabaseReady
      ? window.LokaliSupabaseReady
      : Promise.reject(new Error('supabase client not loaded'));
  }
  function spotDay(d) {
    // All spotlight windows are anchored to UTC midnights ('YYYY-MM-DD' starts
    // parse as UTC server-side) — format in UTC or local/DST offsets shift the
    // shown date by a day (e.g. a Nov-2 end displaying as Nov 1 across the
    // DST fall-back).
    return new Date(d).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
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
      '.lk-spot-tier.is-on{border-color:var(--lokali-primary,#6002ee);background:var(--system--purple-50,#eee6ff);}' +
      '.lk-spot-tier .t-price{font-weight:700;font-size:20px;color:#231D3F;}' +
      '.lk-spot-tier .t-name{font-weight:600;font-size:14px;color:#231D3F;margin-top:2px;}' +
      '.lk-spot-tier .t-blurb{font-size:12.5px;color:#6B6580;line-height:1.5;margin-top:4px;}' +
      '.lk-spot-mtv{background:#FBEFD6;color:#9A6B00;border-radius:10px;padding:10px 14px;font-size:13px;line-height:1.5;margin:0 0 12px;}' +
      '.lk-spot-mtv a{color:#9A6B00;font-weight:600;}' +
      '.lk-spot-form{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:2px 0 10px;}' +
      '.lk-spot-form label{font-size:13px;font-weight:600;color:#231D3F;}' +
      '.lk-spot-form input[type=date]{border:1.5px solid #E4E1EF;border-radius:10px;padding:8px 10px;font-family:inherit;font-size:14px;color:#231D3F;background:#fff;}' +
      '.lk-spot-btn{display:inline-block;border:0;border-radius:999px;padding:9px 20px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;background:var(--system--primary-700,#3d00e0);color:#fff;text-decoration:none;line-height:1.2;}' +
      '.lk-spot-btn:hover{background:var(--system--primary-900,#0000d6);}' +
      '.lk-spot-btn.orange{background:var(--system--orange-500,#ff8d00);}' +
      '.lk-spot-btn.orange:hover{background:#e07c00;}' +
      '.lk-spot-btn.ghost{background:#fff;color:var(--system--primary-700,#3d00e0);border:1.5px solid var(--system--primary-700,#3d00e0);}' +
      '.lk-spot-btn.ghost:hover{background:var(--system--purple-50,#eee6ff);}' +
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
      '.lk-spot-chip.booked{background:var(--system--purple-50,#eee6ff);color:var(--lokali-primary,#6002ee);}' +
      '.lk-spot-chip.notified{background:#FBEFD6;color:#9A6B00;}' +
      '.lk-spot-link{background:none;border:0;padding:0;font-family:inherit;font-size:13px;font-weight:600;color:#E0245E;cursor:pointer;}' +
      '#lk-spot-pricing{max-width:1060px;margin:8px auto 48px;padding:0 20px;}' +
      '#lk-spot-pricing .sp-head{text-align:center;font-size:26px;font-weight:700;color:#231D3F;margin:26px 0 4px;}' +
      '#lk-spot-pricing .sp-sub{text-align:center;color:#6B6580;font-size:15px;margin:0 0 22px;}' +
      '.lk-spotcards{display:grid;grid-template-columns:1fr 1fr;gap:18px;}' +
      '@media(max-width:760px){.lk-spotcards{grid-template-columns:1fr;}}' +
      '.lk-spotcard{background:#fff;border:1.5px solid #E4E1EF;border-radius:18px;padding:26px 26px 24px;box-shadow:0 10px 28px rgba(60,47,110,.06);}' +
      // Card name matches the Webflow tier headers (.pricing-hard-header:
      // uppercase, unbold, 14px) so the add-on cards read like the plan cards
      // above them; the 14px gap gives the name room above the price (was
      // 6px, set on the price). Color is --dusk rather than the tier headers'
      // --slate — Francesca's call 2026-07-21, slate read too faint; --dusk is
      // the same token .price-body uses for the tagline under each plan price.
      '.lk-spotcard .c-name{font-weight:400;font-size:14px;text-transform:uppercase;color:var(--dusk,#4A4761);margin:0 0 14px;}' +
      '.lk-spotcard .c-price{font-weight:700;font-size:30px;color:var(--lokali-primary,#6002ee);margin:0 0 2px;}' +
      '.lk-spotcard .c-per{color:#6B6580;font-size:13px;margin-bottom:12px;}' +
      '.lk-spotcard ul{list-style:none;padding:0;margin:0 0 16px;}' +
      '.lk-spotcard li{position:relative;padding:5px 0 5px 26px;color:#3C3550;font-size:14px;line-height:1.45;}' +
      '.lk-spotcard li:before{content:"✓";position:absolute;left:0;top:4px;width:18px;height:18px;border-radius:50%;background:var(--system--purple-50,#eee6ff);color:var(--system--primary-700,#3d00e0);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;}' +
      '.lk-spot-closed{display:block;margin-top:6px;font-size:13px;color:#6E6A85;}' +
      '.lk-spot-prelaunch{background:var(--system--orange-50,#fff2df);color:#8a5200;border-radius:10px;padding:10px 14px;font-size:13px;line-height:1.5;margin:0 0 12px;}' +
      '.lk-cal{max-width:420px;margin:2px 0 10px;}' +
      '.lk-cal-tier{font-size:12px;font-weight:700;letter-spacing:.03em;color:var(--lokali-primary,#6002ee);margin:0 0 6px;text-transform:uppercase;}' +
      '.lk-cal-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px;}' +
      '.lk-cal-title{font-size:14px;font-weight:700;color:#231D3F;}' +
      '.lk-cal-nav{background:#fff;border:1.5px solid #E4E1EF;border-radius:8px;width:30px;height:30px;font-family:inherit;font-size:15px;color:var(--system--primary-700,#3d00e0);cursor:pointer;line-height:1;}' +
      '.lk-cal-nav:hover{border-color:var(--system--primary-700,#3d00e0);}' +
      '.lk-cal-nav[disabled]{opacity:.3;pointer-events:none;}' +
      '.lk-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}' +
      '.lk-cal-dow{font-size:10.5px;font-weight:700;color:#A9A3BC;text-align:center;text-transform:uppercase;padding:2px 0;}' +
      '.lk-cal-day{aspect-ratio:1;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#231D3F;background:#fff;border:1px solid #E4E1EF;cursor:pointer;}' +
      '.lk-cal-day:hover{border-color:var(--system--primary-700,#3d00e0);}' +
      '.lk-cal-day.busy{background:#F1EFF7;border-color:transparent;color:#A9A3BC;}' +
      '.lk-cal-day.na{background:transparent;border-color:transparent;color:#C9C4DA;pointer-events:none;}' +
      '.lk-cal-day.dim{visibility:hidden;pointer-events:none;}' +
      '.lk-cal-day.off{background:transparent;border-color:transparent;color:#D6D2E4;pointer-events:none;}' +
      '.lk-cal-day.sel{background:var(--system--primary-700,#3d00e0);border-color:var(--system--primary-700,#3d00e0);color:#fff;font-weight:700;}' +
      '.lk-cal-legend{display:flex;gap:16px;margin-top:8px;font-size:12px;color:#6B6580;}' +
      '.lk-cal-legend span{display:inline-flex;align-items:center;gap:6px;}' +
      '.lk-cal-dot{width:11px;height:11px;border-radius:4px;display:inline-block;}' +
      '.lk-cal-dot.open{background:#fff;border:1px solid #E4E1EF;}' +
      '.lk-cal-dot.busy{background:#F1EFF7;}' +
      '.lk-spot-upsell{background:var(--system--purple-50,#eee6ff);color:#3C3550;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.55;}' +
      '.lk-spot-upsell a{color:var(--system--primary-700,#3d00e0);font-weight:700;}' +
      '.lk-spot-tiers.locked{opacity:.55;pointer-events:none;}';
    var tag = document.createElement('style');
    tag.id = 'lk-spot-css';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ---- Availability calendar (vendors see open vs taken, no guessing) --------
  // A month grid like the #71 availability view: a day is SELECTABLE when a
  // 14-day window STARTING there still has capacity (fewer than `cap`
  // overlapping booked/active windows); taken start-dates render muted but
  // stay clickable to join the waitlist for exactly that date.
  //
  // Day math runs in UTC-midnight space ON PURPOSE: a picked 'YYYY-MM-DD'
  // start is parsed as UTC midnight server-side, so booked windows sit on UTC
  // midnights — local-midnight math would smear each busy window across an
  // extra local day and mark the abutting (actually bookable) day as taken.
  function spotCalBounds() {
    var minStr = spotTodayStr() < SPOT_FLOOR ? SPOT_FLOOR : spotTodayStr();
    return {
      minStr: minStr,
      minMs: Date.parse(minStr + 'T00:00:00Z'),
      maxMs: Date.now() + 180 * DAY_MS
    };
  }

  function spotFetchBusy(tier) {
    if (spotState.busyByTier[tier]) return Promise.resolve(spotState.busyByTier[tier]);
    var b = spotCalBounds();
    return sbClient().then(function (c) {
      return c.rpc('spotlight_availability', {
        p_tier: tier,
        p_from: new Date(b.minMs).toISOString(),
        p_to: new Date(b.maxMs + spotState.windowDays * DAY_MS).toISOString()
      });
    }).then(function (res) {
      if (res.error) throw res.error;
      var d = res.data || {};
      if (d.ok === false) throw new Error(d.reason || 'unavailable');
      var info = {
        cap: d.cap || 1,
        busy: (d.busy || []).map(function (w) {
          return { s: new Date(w.starts_at).getTime(), e: new Date(w.ends_at).getTime() };
        })
      };
      spotState.busyByTier[tier] = info;
      return info;
    });
  }

  function spotDayOpen(dayMs, info) {
    var end = dayMs + spotState.windowDays * DAY_MS, n = 0;
    for (var i = 0; i < info.busy.length; i++) {
      if (info.busy[i].s < end && info.busy[i].e > dayMs) n++;
    }
    return n < info.cap;
  }

  function spotSelectDay(dateStr, open) {
    spotState.sel = dateStr;
    var out = document.getElementById('lk-spot-result');
    if (!out) return;
    var start = new Date(dateStr + 'T00:00:00Z');
    // Windows end EXCLUSIVE — show the last included day, or back-to-back
    // bookings read as overlapping on the shared boundary date.
    var lastDay = new Date(start.getTime() + (spotState.windowDays - 1) * DAY_MS);
    var tier = spotState.tier;
    if (open && !SPOT_BOOKING_OPEN) {
      // Booking is closed server-side: show the dates are free, but no Book button
      // that could only fail.
      out.innerHTML =
        '<span class="ok">✓ ' + spotRange(start, lastDay) + ' is available</span>' +
        '<span class="lk-spot-closed">Booking is not open yet. We will let you know when it opens.</span>';
    } else if (open) {
      out.innerHTML =
        '<span class="ok">✓ ' + spotRange(start, lastDay) + ' is available</span>' +
        '<button type="button" class="lk-spot-btn" id="lk-spot-book">Book for ' +
        SPOT_TIERS[tier].price + '</button>';
      document.getElementById('lk-spot-book').addEventListener('click', function () {
        var btn = this;
        setButtonBusy(btn, true);
        postForRedirect(CHECKOUT_URL, {
          plan: SPOT_TIERS[tier].plan, interval: 'once',
          spotlight_start: dateStr
        }).catch(function (err) {
          setButtonBusy(btn, false);
          var msg = err && err.message && !/^Request failed/.test(err.message)
            ? err.message
            : 'Sorry, we could not start checkout. Please try again.';
          if (err && err.code === 'prelaunch') msg = SPOT_NOT_OPEN_MSG;
          alert(msg);
        });
      });
    } else {
      out.innerHTML =
        '<span class="full">' + spotRange(start, lastDay) + ' is taken.</span>' +
        '<button type="button" class="lk-spot-btn ghost" id="lk-spot-join">Join the waitlist for ' +
        spotDay(start) + '</button>';
      document.getElementById('lk-spot-join').addEventListener('click', function () {
        spotJoinWaitlist(dateStr, this);
      });
    }
  }

  function renderSpotCal() {
    var host = document.getElementById('lk-spot-cal');
    if (!host) return;
    var tier = spotState.tier;
    var info = spotState.busyByTier[tier];
    if (!info) {
      host.innerHTML = '<div class="lk-spot-intro">Loading availability…</div>';
      spotFetchBusy(tier).then(renderSpotCal).catch(function (err) {
        console.warn('[lokali-billing] spotlight availability failed', err);
        host.innerHTML = '<div class="lk-spot-intro">Could not load availability. Refresh to try again.</div>';
      });
      return;
    }

    var b = spotCalBounds();
    if (!spotState.calMonth) {
      // Derive from the YYYY-MM-DD string, not the UTC ms (a local getter on
      // Oct-1-UTC-midnight would land in September for US timezones).
      spotState.calMonth = new Date(Number(b.minStr.slice(0, 4)), Number(b.minStr.slice(5, 7)) - 1, 1);
    }
    var view = spotState.calMonth;
    var vy = view.getFullYear(), vm = view.getMonth();
    var monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    var firstDow = new Date(Date.UTC(vy, vm, 1)).getUTCDay();
    var daysIn = new Date(Date.UTC(vy, vm + 1, 0)).getUTCDate();
    var minMonthMs = (function (d) { return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); })(new Date(b.minMs));
    var prevOk = Date.UTC(vy, vm, 1) > minMonthMs;
    var nextOk = Date.UTC(vy, vm + 1, 1) <= b.maxMs;

    var h =
      // Which tier this calendar belongs to — the tiers are separate placements
      // with separate availability, so the active one is named explicitly.
      '<div class="lk-cal-tier">' + SPOT_TIERS[tier].name + ' availability</div>' +
      '<div class="lk-cal-head">' +
        '<button type="button" class="lk-cal-nav" id="lk-cal-prev"' + (prevOk ? '' : ' disabled') + '>‹</button>' +
        '<div class="lk-cal-title">' + monthLabel + '</div>' +
        '<button type="button" class="lk-cal-nav" id="lk-cal-next"' + (nextOk ? '' : ' disabled') + '>›</button>' +
      '</div><div class="lk-cal-grid">';
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function (d) {
      h += '<div class="lk-cal-dow">' + d + '</div>';
    });
    for (var pad = 0; pad < firstDow; pad++) h += '<div class="lk-cal-day dim"></div>';
    for (var day = 1; day <= daysIn; day++) {
      var ms = Date.UTC(vy, vm, day);
      var str = vy + '-' + String(vm + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      if (ms < b.minMs || ms > b.maxMs) {
        h += '<div class="lk-cal-day off">' + day + '</div>';
      } else if (new Date(ms).getUTCDay() !== 1) {
        // Windows start on Mondays only (round-4 rule) — other days are inert.
        h += '<div class="lk-cal-day na">' + day + '</div>';
      } else {
        var open = spotDayOpen(ms, info);
        var sel = spotState.sel === str;
        var cls = 'lk-cal-day' + (open ? '' : ' busy') + (sel ? ' sel' : '');
        h += '<div class="' + cls + '" data-cal-day="' + str + '" data-cal-open="' + (open ? '1' : '0') + '"' +
          ' role="button" tabindex="0" aria-pressed="' + sel + '"' +
          ' aria-label="Monday ' + spotDay(ms) + (open ? ', available' : ', taken (join the waitlist)') + '"' +
          ' title="' + (open ? 'Start here' : 'Taken. Click to join the waitlist') + '">' + day + '</div>';
      }
    }
    h += '</div>' +
      '<div class="lk-cal-legend">' +
        '<span><i class="lk-cal-dot open"></i>Open Monday</span>' +
        '<span><i class="lk-cal-dot busy"></i>Taken (waitlist)</span>' +
      '</div>';
    host.innerHTML = h;

    var prev = document.getElementById('lk-cal-prev');
    var next = document.getElementById('lk-cal-next');
    if (prev) prev.addEventListener('click', function () {
      spotState.calMonth = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      renderSpotCal();
    });
    if (next) next.addEventListener('click', function () {
      spotState.calMonth = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      renderSpotCal();
    });
    $all('[data-cal-day]').forEach(function (el) {
      function choose() {
        spotSelectDay(el.getAttribute('data-cal-day'), el.getAttribute('data-cal-open') === '1');
        renderSpotCal();
      }
      el.addEventListener('click', choose);
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        var str = el.getAttribute('data-cal-day');
        choose();
        // The re-render replaced the node — put focus back on the same day.
        var again = document.querySelector('[data-cal-day="' + str + '"]');
        if (again) again.focus();
      });
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
          alert('Could not join the waitlist. Please try again.');
        }
        return;
      }
      btn.outerHTML = '<span class="ok">✓ On the waitlist. We’ll email you if those dates open up.</span>';
      spotLoadLists();
    });
  }

  function spotCancelBooking(bookingId, priceLabel, btn) {
    if (!confirm('Cancel this Spotlight? You’ll get a full ' + priceLabel + ' refund.')) return;
    setButtonBusy(btn, true);
    postJSON(SPOT_CANCEL_URL, { booking_id: bookingId }).then(function (r) {
      setButtonBusy(btn, false);
      if (!r.ok) {
        alert((r.data && r.data.error) || 'Could not cancel. Please try again.');
        return;
      }
      alert(r.data.refunded
        ? 'Canceled. Your refund is on its way (it can take a few business days to appear).'
        : 'Canceled. The refund needs a manual check on our side. If it hasn’t appeared in a few days, contact us.');
      spotLoadLists();
    }).catch(function (err) {
      setButtonBusy(btn, false);
      console.warn('[lokali-billing] spotlight cancel failed', err);
      alert('Could not cancel. Please try again.');
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
            // ends_at is exclusive — display the last included day.
            '<div class="r-sub">' + spotRange(b.starts_at, new Date(new Date(b.ends_at).getTime() - DAY_MS)) + '</div></div>' +
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
            '<div class="r-sub">around ' + spotDay(row.desired_start + 'T00:00:00Z') + '</div></div>' +
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
    if (!SPOT_ENABLED) return;
    if (!/^\/vendor-dashboard\/settings/.test(window.location.pathname)) return;
    if (document.getElementById('lokali-spotlight')) return;
    // Spotlight belongs with the plan: after the Get Verified card when it is there,
    // else after the plan section, else (old markup) after the first card. Anchoring
    // on the FIRST card made the position depend on whether this ran before or after
    // the settings-page regroup (2026-09-21).
    var planEl = document.getElementById('settings-current-plan');
    var anchor = document.getElementById('lok-verify-section') ||
      (planEl && planEl.closest ? planEl.closest('section') : null) ||
      document.querySelector('.section-12');
    if (!anchor) return;
    injectSpotStyles();

    var sec = document.createElement('section');
    var cardLook = document.querySelector('.section-12');
    sec.className = cardLook ? cardLook.className.replace(/\blok-set-sec\b/, '').trim() : anchor.className;   // native settings-card look
    sec.id = 'lokali-spotlight';
    sec.innerHTML =
      '<div class="form-heading-div">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="flex:none"><path d="M12 2l2.2 6.2L20 10l-5.8 1.8L12 18l-2.2-6.2L4 10l5.8-1.8L12 2z" fill="#6d5bd0"/><path d="M18.5 15l1 2.7 2.5.8-2.5.8-1 2.7-1-2.7-2.5-.8 2.5-.8 1-2.7z" fill="#F1A33C"/></svg>' +
        '<div class="section-heading">Spotlight</div>' +
      '</div>' +
      '<div class="lk-spot-intro">A one-time, two-week boost for Pro &amp; Featured vendors. Windows ' +
        'start on Mondays; pick yours, pay once, done. The two tiers are separate placements with ' +
        'their own calendars, and booking one doesn’t include the other (want both? book both).</div>' +
      '<div id="lk-spot-mine"></div>' +
      '<div class="lk-spot-tiers">' +
        Object.keys(SPOT_TIERS).map(function (k) {
          var t = SPOT_TIERS[k];
          return '<div class="lk-spot-tier' + (k === spotState.tier ? ' is-on' : '') + '" data-spot-tier="' + k + '"' +
            ' role="button" tabindex="0" aria-pressed="' + (k === spotState.tier) + '" aria-label="' + t.name + ', ' + t.price + '">' +
            '<div class="t-price">' + t.price + '</div><div class="t-name">' + t.name + '</div>' +
            '<div class="t-blurb">' + t.blurb + '</div></div>';
        }).join('') +
      '</div>' +
      '<div class="lk-spot-mtv" id="lk-spot-mtv" style="display:none">The Homepage Spotlight is all about ' +
        'the person behind the business, so fill in your Meet-the-Vendor info (name, photo, and a short bio) ' +
        'on <a href="/vendor-dashboard/profile">your profile</a> first.</div>' +
      (!SPOT_BOOKING_OPEN
        ? '<div class="lk-spot-prelaunch"><strong>Spotlight booking is not open yet.</strong> You can look at dates now, ' +
          'and we will let you know when booking opens.</div>'
        : '') +
      '<div class="lk-cal" id="lk-spot-cal"></div>' +
      '<div class="lk-spot-result" id="lk-spot-result"></div>' +
      '<div id="lk-spot-wait"></div>';
    anchor.insertAdjacentElement('afterend', sec);

    $all('[data-spot-tier]').forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
      el.addEventListener('click', function () {
        spotState.tier = el.getAttribute('data-spot-tier');
        $all('[data-spot-tier]').forEach(function (o) {
          o.classList.toggle('is-on', o === el);
          o.setAttribute('aria-pressed', o === el ? 'true' : 'false');
        });
        var out = document.getElementById('lk-spot-result');
        if (out) out.innerHTML = '';
        spotState.sel = null;
        spotUpdateMtvHint();
        // Plan-gated vendors have the upsell where the calendar would be.
        if (spotState.entitled !== false) renderSpotCal();
      });
    });

    if (window.LokaliAPI && window.LokaliAPI.vendors && window.LokaliAPI.vendors.me) {
      window.LokaliAPI.vendors.me().then(function (res) {
        spotState.me = (res && (res.data || res)) || null;
        spotUpdateMtvHint();
      }).catch(function () {});
    }

    // Paid-plan gate (round 4): Free vendors see the tiers as a teaser but get
    // an upgrade prompt instead of the booking calendar. The server enforces
    // the real gate — a billing-read failure fails OPEN so a hiccup can't
    // hide booking from an entitled vendor.
    var billingP = (window.LokaliAPI && window.LokaliAPI.plans && window.LokaliAPI.plans.getMyBilling)
      ? window.LokaliAPI.plans.getMyBilling().catch(function () { return null; })
      : Promise.resolve(null);
    billingP.then(function (res) {
      var b = (res && (res.data || res)) || {};
      var plan = String(b.plan || 'free').toLowerCase();
      var status = String(b.plan_status || '').toLowerCase();
      var entitled = (plan === 'pro' || plan === 'featured') &&
        (status === '' || status === 'active' || status === 'trialing');
      spotState.entitled = res ? entitled : true; // no billing read -> fail open
      if (res && !entitled) {
        var cal = document.getElementById('lk-spot-cal');
        if (cal) {
          cal.innerHTML = '';
          cal.className = 'lk-spot-upsell';
          cal.innerHTML = 'Spotlight is a <strong>Pro &amp; Featured</strong> perk. ' +
            '<a href="/pricing">Upgrade your plan</a> to book a two-week boost.';
        }
        var tiers = sec.querySelector('.lk-spot-tiers');
        if (tiers) tiers.classList.add('locked');
      } else {
        renderSpotCal();
      }
    });
    spotLoadLists();

    if (window.location.hash === '#lokali-spotlight') {
      setTimeout(function () { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 400);
    }
  }

  // ---- /pricing add-on cards ----------------------------------------------------
  function initPricingSpotlightCards() {
    if (!SPOT_ENABLED) return; // Spotlight hidden for now (F 2026-09-21), see SPOT_ENABLED
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
      '<div class="sp-sub">One-time, two-week boosts for Pro &amp; Featured vendors: two separate placements, book either or both.</div>' +
      '<div class="lk-spotcards">' +
        '<div class="lk-spotcard">' +
          '<div class="c-name">✦ Category Spotlight</div>' +
          '<div class="c-price">$75</div><div class="c-per">one time · 14 days · Pro &amp; Featured plans</div>' +
          '<ul><li>Top of your category on The Market</li>' +
          '<li>✦ Spotlight badge on your card</li>' +
          '<li>Exclusive: one vendor per category at a time</li>' +
          '<li>Two-week window of your choice, starting on a Monday</li></ul>' +
          '<a class="lk-spot-btn" href="/vendor-dashboard/settings#lokali-spotlight">Book a Spotlight</a>' +
        '</div>' +
        '<div class="lk-spotcard">' +
          '<div class="c-name">✦ Homepage Spotlight</div>' +
          '<div class="c-price">$150</div><div class="c-per">one time · 14 days · Pro &amp; Featured plans</div>' +
          '<ul><li>A “Meet the vendor” card on the Lokali homepage</li>' +
          '<li>You and your story, front and center</li>' +
          '<li>A shoutout in <strong>The Neighborhood Edit</strong>, the Lokali newsletter</li>' +
          '<li>Only 3 vendors at a time, site-wide</li>' +
          '<li>Two-week window of your choice, starting on a Monday</li></ul>' +
          '<a class="lk-spot-btn orange" href="/vendor-dashboard/settings#lokali-spotlight">Book a Spotlight</a>' +
        '</div>' +
      '</div>';
    host.insertAdjacentElement('afterend', sec);
  }

  // ── In-app plan picker (2026-10-02) ──────────────────────────────────────────
  // F: "Make it easy and less confusing for businesses to upgrade. Right now it
  // takes them to the pricing page, which is confusing because the copy doesn't
  // change." Every dashboard Upgrade link is a plain <a href="/pricing">; on
  // /vendor-dashboard* a capture-phase click listener (bindUpgradeIntercept)
  // turns those into this modal: current plan, the plans above it with price +
  // highlights, a Monthly/Yearly toggle, and ONE button per plan that goes
  // straight to payment via LokaliBilling.checkout(). Links to a pricing
  // SECTION (#compare, #faq, #versus) pass through untouched. Public surface:
  // window.LokaliUpgrade.open(opts) / close().
  //
  // Facts below mirror the live /pricing table (via welcome-guide-embed.html,
  // 2026-09-20) and docs/lokali-vendor-billing-stripe-guide.md section 2.1.
  // No em dashes, no emoji (FA check SVG only), Plus Jakarta Sans set explicitly.
  var UP_RANK = { free: 0, pro: 1, featured: 2 };
  var UP_PRICES = {
    pro: { month: 20, year: 192 },
    featured: { month: 50, year: 480 }
  };
  var UP_HIGHLIGHTS = {
    pro: [
      'Elevated place in your category',
      'Your own web address, golokali.com/your-name',
      '5 photos per listing and a 5-photo portfolio',
      'Verified badge and replies to reviews',
      'Booking link, promo button and a monthly report'
    ],
    featured: [
      'Everything in Pro',
      'Top of your category',
      '10 photos per listing and a 15-photo portfolio',
      'Calendar on your page, plus a waitlist',
      'Catalog import, showcase banner and your logo on your QR code'
    ]
  };
  var UP_CHECK_SVG = '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M470.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L192 338.7 425.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>';
  var UP_CLOSE_SVG = '<svg viewBox="0 0 384 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3l105.4 105.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256l105.3-105.4z"/></svg>';
  var UP_GENERIC_ERR = 'Sorry, we could not start checkout. Please try again.';
  var UP_PORTAL_ERR = 'Sorry, we could not open billing management. Please try again.';

  // Palette = the values lokali-inquiry.js already uses (violet #6002EE / #4D02BE,
  // text #1A1530, muted #6B6680, border #E2E0EC); soft lavender tints, no ink.
  var UP_CSS = [
    '#lok-up-overlay{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(26,21,48,.45);font-family:"Plus Jakarta Sans",sans-serif;-webkit-font-smoothing:antialiased;}',
    '#lok-up-overlay.is-open{display:flex;}',
    '#lok-up-card{position:relative;box-sizing:border-box;width:100%;max-width:760px;max-height:92vh;overflow:auto;padding:28px 28px 22px;border-radius:16px;background:#fff;color:#1A1530;font-family:"Plus Jakarta Sans",sans-serif;box-shadow:0 20px 60px rgba(26,21,48,.28);}',
    '#lok-up-card *{box-sizing:border-box;font-family:inherit;}',
    '#lok-up-title{margin:0 0 4px;padding-right:44px;font-size:22px;line-height:1.25;font-weight:700;color:#1A1530;}',
    '#lok-up-sub{margin:0 0 18px;font-size:14px;line-height:1.5;color:#4A4761;}',
    '#lok-up-close{position:absolute;top:14px;right:14px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:0;border-radius:10px;background:transparent;color:#4A4761;cursor:pointer;}',
    '#lok-up-close:hover{background:#F2F1F9;}',
    '#lok-up-close svg{width:16px;height:16px;}',
    '#lok-up-close:focus-visible,.lok-up-btn:focus-visible,.lok-up-seg button:focus-visible,#lok-up-compare:focus-visible,#lok-up-manage:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
    '.lok-up-seg{display:inline-flex;align-items:center;gap:4px;margin:0 0 18px;padding:4px;border-radius:12px;background:#F2F1F9;}',
    '.lok-up-seg button{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 16px;border:0;border-radius:9px;background:transparent;color:#4A4761;font-size:14px;font-weight:600;cursor:pointer;}',
    '.lok-up-seg button[aria-pressed="true"]{background:#6002EE;color:#fff;}',
    '.lok-up-seg .lok-up-save{font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:#EDE5FF;color:#4D02BE;}',
    '.lok-up-seg button[aria-pressed="true"] .lok-up-save{background:rgba(255,255,255,.2);color:#fff;}',
    '#lok-up-error{display:none;margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#FEF3F2;color:#C0392B;font-size:13px;line-height:1.45;}',
    '#lok-up-error.is-on{display:block;}',
    '.lok-up-freerow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:12px 16px;border:1px solid #E2E0EC;border-radius:12px;background:#FAF9FD;font-size:14px;color:#4A4761;}',
    '.lok-up-freerow strong{color:#1A1530;font-weight:700;}',
    '.lok-up-cards{display:grid;grid-template-columns:1fr;gap:14px;}',
    '@media (min-width:640px){.lok-up-cards{grid-template-columns:1fr 1fr;}}',
    '.lok-up-plan{position:relative;display:flex;flex-direction:column;padding:20px 18px 18px;border:1px solid #E2E0EC;border-radius:14px;background:#fff;}',
    '.lok-up-plan.is-reco{border-color:#6002EE;background:#F7F3FF;box-shadow:0 0 0 1px #6002EE inset;}',
    '.lok-up-plan.is-current{background:#FAF9FD;}',
    '.lok-up-chip{position:absolute;top:-11px;left:16px;padding:3px 10px;border-radius:999px;background:#6002EE;color:#fff;font-size:11.5px;font-weight:700;letter-spacing:.2px;}',
    '.lok-up-name{margin:0 0 6px;font-size:17px;font-weight:700;color:#1A1530;}',
    '.lok-up-price{display:flex;align-items:baseline;gap:4px;margin:0;color:#1A1530;}',
    '.lok-up-price b{font-size:30px;line-height:1;font-weight:800;}',
    '.lok-up-price span{font-size:14px;color:#4A4761;}',
    '.lok-up-billed{margin:4px 0 0;min-height:18px;font-size:12.5px;color:#6B6680;}',
    '.lok-up-list{list-style:none;margin:14px 0 18px;padding:0;display:grid;gap:8px;flex:1;}',
    '.lok-up-list li{display:flex;align-items:flex-start;gap:9px;font-size:13.5px;line-height:1.4;color:#1A1530;}',
    '.lok-up-list svg{flex:none;width:14px;height:14px;margin-top:3px;color:#6002EE;}',
    '.lok-up-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;padding:10px 16px;border:0;border-radius:10px;background:#6002EE;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s;}',
    '.lok-up-btn:hover{background:#4D02BE;}',
    '.lok-up-btn.is-second{background:#fff;color:#4D02BE;border:1.5px solid #6002EE;}',
    '.lok-up-btn.is-second:hover{background:#F7F3FF;}',
    '.lok-up-btn[disabled]{cursor:default;background:#F2F1F9;color:#6B6680;border:1px solid #E2E0EC;}',
    '.lok-up-btn[aria-busy="true"]{opacity:.7;cursor:progress;}',
    '.lok-up-foot{margin:18px 0 0;padding-top:14px;border-top:1px solid #E2E0EC;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;font-size:13px;color:#4A4761;}',
    '.lok-up-foot a{color:#4D02BE;font-weight:600;text-decoration:underline;text-underline-offset:2px;}',
    '#lok-up-manage{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1.5px solid #6002EE;border-radius:10px;background:#fff;color:#4D02BE;font-size:14px;font-weight:600;cursor:pointer;}',
    '#lok-up-manage:hover{background:#F7F3FF;}',
    '#lok-up-loading{padding:24px 0;font-size:14px;color:#6B6680;}',
    // Phone: a full-width sheet rising from the bottom, 16px gutters, cards stacked.
    '@media (max-width:639px){#lok-up-overlay{align-items:flex-end;padding:0;}#lok-up-card{max-width:none;max-height:94vh;border-radius:16px 16px 0 0;padding:22px 16px calc(16px + env(safe-area-inset-bottom));}#lok-up-title{font-size:20px;}.lok-up-foot{flex-direction:column;align-items:stretch;text-align:center;}}'
  ].join('');

  var upState = { overlay: null, lastFocus: null, interval: 'month', billing: null, busy: false, source: '' };

  function injectUpgradeStyles() {
    if (document.getElementById('lok-up-styles')) return;
    var s = document.createElement('style');
    s.id = 'lok-up-styles';
    s.textContent = UP_CSS;
    document.head.appendChild(s);
  }

  function upAll(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function upEsc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function upFocusables() {
    var card = upState.overlay && upState.overlay.querySelector('#lok-up-card');
    if (!card) return [];
    var els = card.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
    var vis = [];
    for (var i = 0; i < els.length; i++) {
      if (els[i].offsetParent !== null && els[i].tabIndex !== -1) vis.push(els[i]);
    }
    return vis;
  }

  function buildUpgradeOverlay() {
    if (upState.overlay) return upState.overlay;
    injectUpgradeStyles();
    var overlay = document.createElement('div');
    overlay.id = 'lok-up-overlay';
    overlay.innerHTML =
      '<div id="lok-up-card" role="dialog" aria-modal="true" aria-labelledby="lok-up-title">' +
        '<h2 id="lok-up-title">Choose your plan</h2>' +
        '<p id="lok-up-sub"></p>' +
        '<div id="lok-up-body"><div id="lok-up-loading">Loading your plan...</div></div>' +
        '<button id="lok-up-close" type="button" aria-label="Close">' + UP_CLOSE_SVG + '</button>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeUpgrade(); });
    overlay.querySelector('#lok-up-close').addEventListener('click', closeUpgrade);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeUpgrade();
    });
    // aria-modal promises focus cannot leave the card: wrap Tab within it.
    overlay.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var vis = upFocusables();
      if (!vis.length) return;
      var first = vis[0], last = vis[vis.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    });
    upState.overlay = overlay;
    return overlay;
  }

  function upShowError(msg) {
    var el = upState.overlay && upState.overlay.querySelector('#lok-up-error');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-on', !!msg); // role=alert announces it
  }

  function upPeriodEndText(b) {
    var ts = b && b.current_period_end;
    if (!ts) return '';
    if (ts < 1e12) ts = ts * 1000;
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // "You're on Free." / "You're on Pro, billed monthly." / comped + trial variants.
  function upSubtitle(b) {
    var plan = (b.plan || 'free').toLowerCase();
    var label = PLAN_LABELS[plan] || 'Free';
    var status = (b.plan_status || '').toLowerCase();
    var when = upPeriodEndText(b);
    if (plan === 'free' || !UP_RANK[plan]) return 'You’re on Free.';
    var top = plan === 'featured' ? ', our top plan' : '';
    var comped = b.billing_provider === 'internal' &&
      (b.comp_kind === 'until_billing' || b.comp_kind === 'forever');
    if (comped) {
      if (b.comp_kind === 'forever') return 'Your ' + label + ' plan is on us, for good.';
      return 'Your ' + label + ' plan is on us' + (when ? ' until ' + when : ' for now') + '.';
    }
    if (status === 'trialing' && when) {
      return 'You’re on ' + label + top + '. Your free trial runs until ' + when + '.';
    }
    var iv = b.plan_interval === 'year' ? 'yearly' : (b.plan_interval === 'month' ? 'monthly' : '');
    if (b.cancel_at_period_end && when) {
      return 'You’re on ' + label + top + '. It ends on ' + when + '.';
    }
    return 'You’re on ' + label + top + (iv ? ', billed ' + iv : '') + '.';
  }

  function upPriceHtml(plan, interval) {
    var p = UP_PRICES[plan];
    if (interval === 'year') {
      return '<p class="lok-up-price"><b>$' + (p.year / 12) + '</b><span>/mo</span></p>' +
        '<p class="lok-up-billed">billed $' + p.year + ' a year</p>';
    }
    return '<p class="lok-up-price"><b>$' + p.month + '</b><span>/mo</span></p>' +
      '<p class="lok-up-billed">billed monthly</p>';
  }

  function upCardHtml(plan, current, interval, reco) {
    var rank = UP_RANK[plan], cur = UP_RANK[current] || 0;
    var label = PLAN_LABELS[plan];
    var btn;
    if (rank === cur) {
      btn = '<button class="lok-up-btn" type="button" disabled>Current plan</button>';
    } else if (rank > cur) {
      var verb = cur === 0 ? 'Get ' : 'Upgrade to ';
      btn = '<button class="lok-up-btn" type="button" data-lok-up-plan="' + plan + '">' + verb + label + '</button>';
    } else {
      btn = '<button class="lok-up-btn is-second" type="button" data-lok-up-switch="' + plan + '">Switch to ' + label + '</button>';
    }
    var items = UP_HIGHLIGHTS[plan].map(function (t) {
      return '<li>' + UP_CHECK_SVG + '<span>' + upEsc(t) + '</span></li>';
    }).join('');
    return '<div class="lok-up-plan' + (reco ? ' is-reco' : '') + (rank === cur ? ' is-current' : '') + '" data-lok-up-card="' + plan + '">' +
      (reco ? '<span class="lok-up-chip">Recommended</span>' : '') +
      '<h3 class="lok-up-name">' + label + '</h3>' +
      '<div class="lok-up-pricewrap">' + upPriceHtml(plan, interval) + '</div>' +
      '<ul class="lok-up-list">' + items + '</ul>' +
      btn +
    '</div>';
  }

  function renderUpgrade() {
    var overlay = upState.overlay;
    var b = upState.billing || {};
    var plan = (b.plan || 'free').toLowerCase();
    if (!UP_RANK[plan]) plan = 'free';
    var status = (b.plan_status || '').toLowerCase();
    // A lapsed paid plan (not active/trialing/past_due) reads as Free elsewhere.
    if (plan !== 'free' && status && status !== 'active' && status !== 'trialing' && status !== 'past_due' && status !== 'paused') plan = 'free';
    var iv = upState.interval;
    var stripeBilled = plan !== 'free' && b.billing_provider && b.billing_provider !== 'internal';

    overlay.querySelector('#lok-up-sub').textContent = upSubtitle(b);

    var html = '';
    html += '<div class="lok-up-seg" role="group" aria-label="Billing period">' +
      '<button type="button" data-lok-up-iv="month" aria-pressed="' + (iv === 'month') + '">Monthly</button>' +
      '<button type="button" data-lok-up-iv="year" aria-pressed="' + (iv === 'year') + '">Yearly <span class="lok-up-save">2 months free</span></button>' +
    '</div>';
    html += '<div id="lok-up-error" role="alert"></div>';
    if (plan === 'free') {
      html += '<div class="lok-up-freerow"><span><strong>Free</strong>, what you have now</span><span>$0</span></div>';
    }
    html += '<div class="lok-up-cards">' +
      upCardHtml('pro', plan, iv, plan === 'free') +
      upCardHtml('featured', plan, iv, plan === 'pro') +
    '</div>';
    html += '<div class="lok-up-foot">' +
      '<span>Nothing is charged before January 1, 2027. Cancel anytime. ' +
        '<a id="lok-up-compare" href="/pricing#compare">Compare every feature</a></span>' +
      (stripeBilled ? '<button id="lok-up-manage" type="button">Manage billing</button>' : '') +
    '</div>';

    var body = overlay.querySelector('#lok-up-body');
    body.innerHTML = html;

    upAll('[data-lok-up-iv]', body).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (upState.busy) return;
        upState.interval = btn.getAttribute('data-lok-up-iv') === 'year' ? 'year' : 'month';
        renderUpgrade();
        var again = body.querySelector('[data-lok-up-iv="' + upState.interval + '"]');
        if (again) again.focus();
      });
    });
    upAll('[data-lok-up-plan]', body).forEach(function (btn) {
      btn.addEventListener('click', function () { upStartCheckout(btn, btn.getAttribute('data-lok-up-plan')); });
    });
    upAll('[data-lok-up-switch]', body).forEach(function (btn) {
      btn.addEventListener('click', function () { upOpenPortal(btn, 'Opening billing...'); });
    });
    var manage = body.querySelector('#lok-up-manage');
    if (manage) manage.addEventListener('click', function () { upOpenPortal(manage, 'Opening billing...'); });
  }

  function upSetBusy(btn, busyText) {
    upState.busy = true;
    upAll('.lok-up-btn, #lok-up-manage, [data-lok-up-iv]', upState.overlay).forEach(function (el) {
      if (el !== btn) el.disabled = true;
    });
    btn.dataset.lokUpPrev = btn.textContent;
    btn.textContent = busyText;
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
  }

  function upClearBusy() {
    upState.busy = false;
    renderUpgrade(); // restores every button from state
  }

  function upErrorMessage(err, fallback) {
    return err && err.message && !/^Request failed/.test(err.message) ? err.message : fallback;
  }

  function upStartCheckout(btn, plan) {
    if (upState.busy) return;
    var interval = upState.interval;
    upShowError('');
    upSetBusy(btn, 'Opening secure checkout...');
    // Same GA4 funnel event pricingcta.js fires (#110); source tells them apart.
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'begin_checkout', { plan: plan, interval: interval, source: 'upgrade_modal' });
      }
    } catch (e) {}
    window.LokaliBilling.checkout(plan, interval).catch(function (err) {
      console.error('[lokali-billing] upgrade modal checkout failed', err);
      upClearBusy();
      upShowError(upErrorMessage(err, UP_GENERIC_ERR));
      if (err && err.code === 'already_on_plan' && window.LokaliAPI && window.LokaliAPI.plans &&
          window.LokaliAPI.plans.invalidateBilling) {
        window.LokaliAPI.plans.invalidateBilling(); // our cached plan was stale
      }
    });
  }

  function upOpenPortal(btn, busyText) {
    if (upState.busy) return;
    upShowError('');
    upSetBusy(btn, busyText);
    window.LokaliBilling.portal().catch(function (err) {
      console.error('[lokali-billing] upgrade modal portal failed', err);
      upClearBusy();
      upShowError(UP_PORTAL_ERR);
    });
  }

  function openUpgrade(opts) {
    opts = opts || {};
    var overlay = buildUpgradeOverlay();
    if (overlay.classList.contains('is-open')) return;
    upState.lastFocus = document.activeElement;
    upState.source = opts.source || '';
    upState.busy = false;
    upState.billing = null;
    overlay.querySelector('#lok-up-sub').textContent = '';
    overlay.querySelector('#lok-up-body').innerHTML = '<div id="lok-up-loading">Loading your plan...</div>';
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    overlay.querySelector('#lok-up-close').focus();

    var api = window.LokaliAPI && window.LokaliAPI.plans && window.LokaliAPI.plans.getMyBilling
      ? window.LokaliAPI.plans.getMyBilling()
      : Promise.reject(new Error('plans api unavailable'));
    api.then(function (res) {
      var data = (res && (res.data || res)) || {};
      upState.billing = data;
      var paidIv = data.plan_interval === 'year' ? 'year' : 'month';
      upState.interval = opts.interval === 'year' || opts.interval === 'month'
        ? opts.interval
        : ((data.plan || 'free') !== 'free' ? paidIv : 'month');
      if (!overlay.classList.contains('is-open')) return;
      renderUpgrade();
      var first = upFocusables()[0];
      if (first) first.focus();
    }).catch(function (err) {
      console.warn('[lokali-billing] upgrade modal: plan lookup failed', err);
      if (!overlay.classList.contains('is-open')) return;
      overlay.querySelector('#lok-up-body').innerHTML =
        '<div id="lok-up-error" role="alert" class="is-on">We could not load your plan just now. ' +
        '<a id="lok-up-compare" href="/pricing#compare">See every plan on the pricing page</a>.</div>';
    });
  }

  function closeUpgrade() {
    var overlay = upState.overlay;
    if (!overlay || !overlay.classList.contains('is-open')) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    var lf = upState.lastFocus;
    upState.lastFocus = null;
    if (lf && typeof lf.focus === 'function' && document.contains(lf)) {
      try { lf.focus(); } catch (e) {}
    }
  }

  // An <a> that points at the pricing page's PLANS (no hash, "#" or "#plans"):
  // the modal replaces it. Section links (#compare, #faq, #versus) pass through.
  function upIsPlansLink(a) {
    if (!a || a.hasAttribute('data-lokali-no-upgrade-modal')) return false;
    var u;
    try { u = new URL(a.getAttribute('href') || '', window.location.href); } catch (e) { return false; }
    if (u.origin !== window.location.origin) return false;
    if (!/^\/pricing\/?$/.test(u.pathname)) return false;
    var h = (u.hash || '').toLowerCase();
    return h === '' || h === '#' || h === '#plans';
  }

  function upIsVendor() {
    var A = window.LokaliAuth;
    return !!(A && typeof A.role === 'function' && A.role() === 'vendor');
  }

  // Capture phase on purpose: lokali-settings-page.js binds its own click handler
  // on #settings-view-plans that sets window.location, and a bubble-phase listener
  // would run after the navigation had already started. Stopping propagation here
  // keeps that element handler from firing at all.
  function bindUpgradeIntercept() {
    if (!/^\/vendor-dashboard(\/|$)/.test(window.location.pathname)) return;
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var t = e.target;
      var a = t && t.closest ? t.closest('a[href]') : null;
      if (!a || !upIsPlansLink(a) || !upIsVendor()) return;
      e.preventDefault();
      e.stopPropagation();
      var src = a.id || a.className || 'link';
      openUpgrade({ source: String(src).split(' ')[0] });
    }, true);
  }

  // #upgrade in the URL opens the picker (e.g. from an email or a dashboard link);
  // waits briefly for the role stamp since the acct cache may still be cold.
  function openUpgradeFromHash() {
    if (window.location.hash !== '#upgrade') return;
    if (!/^\/vendor-dashboard(\/|$)/.test(window.location.pathname)) return;
    var waited = 0;
    var iv = setInterval(function () {
      waited += 250;
      if (upIsVendor()) { clearInterval(iv); openUpgrade({ source: 'hash' }); return; }
      if (waited >= 10000) clearInterval(iv);
    }, 250);
  }

  window.LokaliUpgrade = { open: openUpgrade, close: closeUpgrade };

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
    bindUpgradeIntercept();        // dashboard Upgrade links -> in-app plan picker
    waitForDeps(function () {
      // Resume runs on ANY page — a fresh signup can land anywhere.
      resumePendingCheckout();
      initSpotlightSettingsCard(); // #88 — needs LokaliAPI/Auth for state
      if (ON_BILLING_PAGE) {
        loadBilling();
        handleReturnFromStripe();
      }
      openUpgradeFromHash();       // /vendor-dashboard/...#upgrade opens the picker
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
