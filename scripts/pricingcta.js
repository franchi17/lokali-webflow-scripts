/*
  Lokali — Pricing plan CTA routing.
  Wires every pricing-card button (`[data-plan]`) on the /pricing page so clicking it
  sends the visitor to the Clerk signup at /sign-up. The chosen plan (and billing
  interval for paid tiers) is carried along as query params.

  Billing note: as of now there is no Stripe billing wired up, so ?plan / &interval are
  inert — they do nothing until checkout exists. They're kept so that, once billing is
  added, signup can read them and auto-prompt the right upgrade after the account is made.
  Until then every plan simply lands on /sign-up (new vendors default to the free tier).

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
        var url = SIGNUP_PATH + '?plan=' + encodeURIComponent(plan);
        if (plan !== 'free') {
          var fixed = btn.getAttribute('data-interval');
          url += '&interval=' + (fixed || currentInterval());
        }
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
