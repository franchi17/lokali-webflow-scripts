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
        note.textContent = 'You’re claiming a founding spot. Pick Pro or Featured below to lock in today’s rate for as long as you stay. Nothing is charged until billing starts.';
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

  // #263 (F 2026-11-24 "Yes, Pro free and Featured half price"; "I don't like the
  // violet with the green"): one band under the plans for registered charities.
  // All green (brand guide soft green), no violet. Prices are applied by hand
  // after F checks the charity letter, so the button opens an email, not checkout.
  var NP_MAIL = 'mailto:hello@golokali.com?subject=' + encodeURIComponent('Nonprofit pricing') +
    '&body=' + encodeURIComponent('Hi Lokali,\n\nWe are a registered charity and would like nonprofit pricing.\n\nOrganization name:\nOur Lokali storefront (if we have one):\n\nI have attached our charity letter (the IRS 501(c)(3) letter).\n\nThank you!');
  function mountNonprofitBand() {
    if (document.getElementById('lok-nonprofit-band')) return;
    // The page has one .pricing-tier-wrapper per plan card; the band goes after
    // the smallest block that holds ALL of them (never between two cards).
    var tiers = document.querySelectorAll('.pricing-tier-wrapper');
    if (!tiers.length) return;
    var tier = tiers[0];
    while (tier && tier.parentNode) {
      var all = true;
      for (var k = 0; k < tiers.length; k++) if (!tier.contains(tiers[k])) { all = false; break; }
      if (all) break;
      tier = tier.parentNode;
    }
    if (!tier || !tier.parentNode || tier === document.body) return;
    var G = '#17634A';
    var band = document.createElement('section');
    band.id = 'lok-nonprofit-band';
    band.setAttribute('aria-labelledby', 'lok-np-h');
    band.style.cssText = 'box-sizing:border-box;max-width:980px;margin:28px auto 8px;background:#E0F5EB;border-radius:16px;' +
      'padding:22px 24px;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;font-family:"Plus Jakarta Sans",sans-serif;color:' + G + ';';
    band.innerHTML = // static markup only, no vendor data
      '<span aria-hidden="true" style="flex:none;width:40px;height:40px;border-radius:12px;background:#fff;display:inline-flex;align-items:center;justify-content:center;">' +
        '<svg viewBox="0 0 512 512" width="18" height="18"><path fill="' + G + '" d="M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z"/></svg>' +
      '</span>' +
      '<div style="flex:1 1 260px;min-width:0;">' +
        '<h3 id="lok-np-h" style="margin:0 0 4px;font:700 18px/1.3 \'Plus Jakarta Sans\',sans-serif;color:' + G + ';">Running a nonprofit?</h3>' +
        '<p style="margin:0 0 14px;font:400 15px/1.6 \'Plus Jakarta Sans\',sans-serif;color:' + G + ';">Registered charities get Pro for free, and Featured at half price. Send us your charity letter and we\u2019ll set it up.</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px;">' +
          '<div style="background:#fff;border-radius:12px;padding:10px 16px;min-width:140px;"><div style="font-size:13px;">Pro</div><div><s style="font-size:13px;opacity:.7;">$20</s> <b style="font-size:20px;font-weight:700;">Free</b></div></div>' +
          '<div style="background:#fff;border-radius:12px;padding:10px 16px;min-width:140px;"><div style="font-size:13px;">Featured</div><div><s style="font-size:13px;opacity:.7;">$50</s> <b style="font-size:20px;font-weight:700;">$25</b><span style="font-size:13px;">/mo</span></div></div>' +
        '</div>' +
        '<a id="lok-np-apply" href="' + NP_MAIL + '" style="display:inline-block;background:' + G + ';color:#fff;text-decoration:none;border-radius:999px;padding:11px 20px;min-height:44px;box-sizing:border-box;font:600 14px/22px \'Plus Jakarta Sans\',sans-serif;">Apply as a nonprofit</a>' +
      '</div>';
    tier.parentNode.insertBefore(band, tier.nextSibling);
    var a = document.getElementById('lok-np-apply');
    if (a) a.addEventListener('click', function () {
      try { if (typeof window.gtag === 'function') window.gtag('event', 'nonprofit_apply_click', { source: 'pricing' }); } catch (e) {}
    });
  }

  function init() {
    initAnchorFeedback();
    mountNonprofitBand();
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
                : 'The payment page didn\u2019t open, and nothing was charged. Please try again in a minute.';
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
