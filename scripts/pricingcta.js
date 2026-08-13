/*
  Lokali — Pricing plan CTA routing.
  Wires every pricing-card button (`[data-plan]`) on the /pricing page so clicking it
  sends the visitor to the signup at /sign-up. The chosen plan (and billing
  interval for paid tiers) is carried along as query params.

  Billing: signed-in VENDORS clicking a paid plan go straight to Stripe Checkout via
  lokali-billing.js (window.LokaliBilling, loaded site-wide); a signed-in vendor
  clicking Free goes to their dashboard. Everyone else lands on /sign-up with
  ?plan / &interval carried along so post-signup upgrade prompting stays possible.
  The auth/role check happens at CLICK time (LokaliAuth loads async, site-wide).

  Replaces the old Webflow-hosted pricingcta-0.0.1.js, which pointed at the legacy
  /vendor-signup page. Reads the Annual/Monthly state from #billing-toggle[data-period]
  (set by billingtoggle.js) the same way the original did.

  Load on the /pricing page (Footer custom code) via jsDelivr. Self-contained, no deps.
*/
(function () {
  'use strict';

  var SIGNUP_PATH = '/sign-up';

  function currentInterval() {
    var toggle = document.getElementById('billing-toggle');
    return (toggle && toggle.getAttribute('data-period') === 'annual') ? 'year' : 'month';
  }

  // Vendor feedback 2026-08-13: "Claim a founding spot →" is an anchor to
  // #plans, which sits back up near the top of the page — the instant jump
  // read as "it scrolled me to the top and nothing happened" and got filed
  // as a bug. Scroll smoothly instead, land clear of the fixed header, and
  // for the founders CTA say what to do next and pulse the two plans that
  // carry a founding spot.
  function initAnchorFeedback() {
    var reduceMotion = false;
    try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    function showFoundingNote(plansSec) {
      var note = document.getElementById('lok-founding-note');
      if (!note) {
        note = document.createElement('div');
        note.id = 'lok-founding-note';
        note.style.cssText = 'margin:0 18px 18px;background:#F3EBFF;border:1px solid #D4AAFD;color:#3C1D66;' +
          'border-radius:12px;padding:12px 18px;font:600 15px/1.5 "Plus Jakarta Sans",sans-serif;text-align:center;' +
          'opacity:0;transition:opacity .35s;';
        note.textContent = 'You’re claiming a founding spot — pick Pro or Featured below to lock in your founding rate (first 3 months free).';
        plansSec.insertBefore(note, plansSec.firstChild);
      }
      requestAnimationFrame(function () { note.style.opacity = '1'; });
      if (reduceMotion) return;
      ['pro', 'featured'].forEach(function (plan) {
        var btn = document.querySelector('[data-plan="' + plan + '"]');
        var card = btn && btn.closest ? btn.closest('.pricing-card') : null;
        if (!card) return;
        card.style.transition = 'box-shadow .4s';
        card.style.boxShadow = '0 0 0 3px #B98CFF, 0 12px 30px rgba(96,2,238,.18)';
        setTimeout(function () { card.style.boxShadow = ''; }, 2600);
      });
    }

    document.querySelectorAll('a[href="#plans"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var plans = document.getElementById('plans');
        if (!plans) return; // no target — keep default anchor behavior
        // Block the default hash-jump AND the delegated handlers that fight
        // over this click (observed live 2026-08-13: the un-prevented click
        // either teleports with no cue or, mid-race, doesn't move at all).
        e.preventDefault();
        e.stopPropagation();
        // Insert the note BEFORE measuring — it grows the section, and the
        // scroll target should land the visitor right on the explainer.
        if (/founding/i.test(a.textContent || '')) showFoundingNote(plans);
        // Land clear of the header (lokali-sticky-nav pins it fixed on scroll,
        // ~106px on desktop — measure, don't guess) plus a little breathing room.
        var header = document.querySelector('.header-wrapper.w-nav');
        var headerOffset = (header ? header.offsetHeight : 0) + 14;
        var targetY = Math.max(0, plans.getBoundingClientRect().top + window.pageYOffset - headerOffset);
        if (reduceMotion) window.scrollTo(0, targetY);
        else window.scrollTo({ top: targetY, behavior: 'smooth' });
      });
    });
  }

  function init() {
    initAnchorFeedback();
    document.querySelectorAll('[data-plan]').forEach(function (btn) {
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', function () {
        var plan = btn.getAttribute('data-plan');
        var interval = btn.getAttribute('data-interval') || currentInterval();

        var A = window.LokaliAuth;
        var signedIn = !!(A && typeof A.isSignedIn === 'function' && A.isSignedIn());
        var role = (signedIn && typeof A.role === 'function') ? A.role() : null;
        if (role === 'vendor') {
          if (plan === 'free') { window.location.href = '/vendor-dashboard/dashboard'; return; }
          if (window.LokaliBilling && typeof window.LokaliBilling.checkout === 'function') {
            // #110 GA4: funnel event — fires only when checkout actually starts.
            try { if (typeof window.gtag === 'function') window.gtag('event', 'begin_checkout', { plan: plan, interval: interval, source: 'pricing' }); } catch (e) {}
            btn.style.opacity = '0.6';
            btn.style.pointerEvents = 'none';
            window.LokaliBilling.checkout(plan, interval).catch(function (err) {
              btn.style.opacity = '';
              btn.style.pointerEvents = '';
              console.error('[pricingcta] checkout failed', err);
              // Server-sent messages (e.g. the pre-launch "you won't be charged
              // yet" notice) are user-facing; only network/5xx get the generic.
              var msg = err && err.message && !/^Request failed/.test(err.message)
                ? err.message
                : 'Sorry — could not start checkout. Please try again.';
              alert(msg);
            });
            return;
          }
        }

        // Anonymous visitor chose a paid plan: stash it so lokali-billing.js can
        // resume this exact checkout right after their account is created
        // (30-min shelf life), and mark the signup as vendor-intent.
        if (plan !== 'free') {
          try {
            sessionStorage.setItem('lokali_pending_plan',
              JSON.stringify({ plan: plan, interval: interval, ts: Date.now() }));
            sessionStorage.setItem('lokali_signup_intent', 'vendor:' + Date.now()); // timestamped (#101 — intent expires)
          } catch (e) {}
        }

        var url = SIGNUP_PATH + '?plan=' + encodeURIComponent(plan);
        if (plan !== 'free') url += '&interval=' + interval;
        window.location.href = url;
      });
    });
  }

  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
