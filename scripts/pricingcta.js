/*
  Lokali — Pricing plan CTA routing.
  Wires every pricing-card button (`[data-plan]`) on the /pricing page so clicking it
  sends the visitor to the Clerk signup at /sign-up. The chosen plan (and billing
  interval for paid tiers) is carried along as query params.

  Billing: signed-in VENDORS clicking a paid plan go straight to Stripe Checkout via
  lokali-billing.js (window.LokaliBilling, loaded site-wide); a signed-in vendor
  clicking Free goes to their dashboard. Everyone else lands on /sign-up with
  ?plan / &interval carried along so post-signup upgrade prompting stays possible.
  The Clerk/role check happens at CLICK time (Clerk loads async, site-wide).

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

  function init() {
    document.querySelectorAll('[data-plan]').forEach(function (btn) {
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', function () {
        var plan = btn.getAttribute('data-plan');
        var interval = btn.getAttribute('data-interval') || currentInterval();

        var user = window.Clerk && window.Clerk.user;
        var role = user && user.publicMetadata && user.publicMetadata.role;
        if (role === 'vendor') {
          if (plan === 'free') { window.location.href = '/vendor-dashboard/dashboard'; return; }
          if (window.LokaliBilling && typeof window.LokaliBilling.checkout === 'function') {
            btn.style.opacity = '0.6';
            btn.style.pointerEvents = 'none';
            window.LokaliBilling.checkout(plan, interval).catch(function (err) {
              btn.style.opacity = '';
              btn.style.pointerEvents = '';
              console.error('[pricingcta] checkout failed', err);
              alert('Sorry — could not start checkout. Please try again.');
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
            sessionStorage.setItem('lokali_signup_intent', 'vendor');
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
