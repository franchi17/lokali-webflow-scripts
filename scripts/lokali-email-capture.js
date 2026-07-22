/**
 * Lokali — Homepage email capture ("Sign up to be a Vendor" / newsletter box).
 *
 * Hooks the Webflow form #wf-form-Newsletter on golokali.com and POSTs the
 * email to the Xano /email/interest endpoint, which upserts the person into
 * the Brevo "Vendor Interest" list. No secret ever lives in this browser file —
 * the Brevo API key stays server-side in Xano (per the Brevo brief).
 *
 * Why this exists even though the form is a Webflow form:
 *   - The Webflow form is method="get" + has Cloudflare Turnstile, i.e. it would
 *     otherwise submit to Webflow Forms (and could put the email in a query
 *     string). We intercept in the CAPTURE phase and stopImmediatePropagation,
 *     so Webflow's own handler never runs and the email is POSTed as JSON to
 *     Xano instead — never a query string.
 *
 * Self-contained: no dependency on lokali-api-client.js (the homepage is a
 * marketing page that doesn't load it). Mirrors the shipped lokali-contact.js
 * pattern. Keep this file byte-identical in scripts/ and lokali-webflow-scripts/.
 *
 * Deploy: jsDelivr from lokali-webflow-scripts, on the homepage (or site-wide —
 * it self-guards via `if (!form) return`, so it no-ops everywhere else).
 */
(function () {
  'use strict';

  // ─── CONFIG ──────────────────────────────────────────────────────────────
  // Xano Contact group (api:oYK_cDmG) → POST /email/interest.
  // Supabase-backend mode (dormant until cutover): same field names, POSTed to
  // the Vercel route (/api/lokali/interest) instead of Xano. Base derived from
  // LOKALI_AUTH_SYNC_URL (canonical) or the legacy LOKALI_CLERK_SYNC_URL,
  // overridable directly (same derivation as lokali-supabase-client.js).
  var ENDPOINT = (function () {
    if (window.LOKALI_BACKEND === 'supabase') {
      var base = window.LOKALI_VERCEL_API_BASE ||
        (window.LOKALI_AUTH_SYNC_URL ? String(window.LOKALI_AUTH_SYNC_URL).replace(/\/(auth-sync|clerk-sync)\/?$/, '') :
         window.LOKALI_CLERK_SYNC_URL ? String(window.LOKALI_CLERK_SYNC_URL).replace(/\/(auth-sync|clerk-sync)\/?$/, '') : '');
      if (base) return base.replace(/\/$/, '') + '/interest';
    }
    return 'https://x8ki-letl-twmt.n7.xano.io/api:oYK_cDmG/email/interest';
  })();
  var FORM_ID  = 'wf-form-Newsletter';
  var SOURCE   = 'homepage_capture';

  // The Market "LOKALI LETTER" box: a Webflow code island (open shadow DOM)
  // that renders #browse-newsletter-email + #browse-newsletter-btn with NO
  // behavior of its own — found dead in the 2026-07-09 smoke (typed emails
  // went nowhere). Stopgap per Francesca's call: capture to the same
  // endpoint tagged source='lokali_letter' so the contacts can be
  // re-segmented in Brevo once #54 defines what the Letter actually is.
  var MARKET_SOURCE   = 'lokali_letter';
  var MARKET_INPUT_ID = 'browse-newsletter-email';
  var MARKET_BTN_ID   = 'browse-newsletter-btn';
  // ─────────────────────────────────────────────────────────────────────────

  function init() {
    var form = document.getElementById(FORM_ID);
    if (!form) return; // not on the homepage

    var wrap = form.closest ? form.closest('.w-form') : form.parentNode;

    // Spam honeypot: injected (not in Webflow) so the form markup stays clean.
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'website';
    hp.tabIndex = -1;
    hp.setAttribute('autocomplete', 'off');
    hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;height:0;width:0;opacity:0;';
    form.appendChild(hp);

    // Capture phase + stopImmediatePropagation => Webflow's own AJAX submit
    // (and its method="get" navigation) never runs; we own the submission.
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleSubmit(form, wrap, hp);
    }, true);
  }

  function emailFrom(form) {
    // The Webflow field is name="email" / id="email".
    var el = form.querySelector('input[type="email"], input[name="email"], #email');
    return el ? String(el.value || '').trim() : '';
  }

  function showDone(wrap, form) {
    if (!wrap) return;
    var done = wrap.querySelector('.w-form-done');
    var fail = wrap.querySelector('.w-form-fail');
    if (fail) fail.style.display = 'none';
    if (done) done.style.display = 'block';
    form.style.display = 'none';
  }

  function showFail(wrap) {
    if (!wrap) return;
    var fail = wrap.querySelector('.w-form-fail');
    if (fail) fail.style.display = 'block';
  }

  function handleSubmit(form, wrap, hp) {
    if (hp && hp.value) { showDone(wrap, form); return; } // bot — fake success

    var email = emailFrom(form);
    if (!email || email.indexOf('@') < 1 || email.length < 5) {
      showFail(wrap);
      return;
    }

    var btn = form.querySelector('input[type="submit"], button[type="submit"]');
    var label = btn ? (btn.value || btn.textContent) : null;
    var wait  = btn ? (btn.getAttribute('data-wait') || 'Saving…') : null;
    if (btn) { btn.disabled = true; if ('value' in btn) btn.value = wait; else btn.textContent = wait; }

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: SOURCE })
    })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; })
      .then(function (ok) {
        if (btn) { btn.disabled = false; if (label != null) { if ('value' in btn) btn.value = label; else btn.textContent = label; } }
        if (ok) { showDone(wrap, form); }
        else { showFail(wrap); }
      });
  }

  // ─── The Market island binding ────────────────────────────────────────────
  function findInIslands(id) {
    var isles = document.querySelectorAll('code-island');
    for (var i = 0; i < isles.length; i++) {
      var sr = isles[i].shadowRoot;
      var el = sr && sr.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function flashInvalid(input) {
    try {
      input.focus();
      input.style.outline = '2px solid #E0245E';
      setTimeout(function () { input.style.outline = ''; }, 1600);
    } catch (e) {}
  }

  // Islands hydrate after page load — poll briefly until the ids appear
  // (self-guards: on pages without the island this drains quietly).
  function initMarketIsland(tries) {
    var input = findInIslands(MARKET_INPUT_ID);
    var btn = findInIslands(MARKET_BTN_ID);
    if (!input || !btn) {
      if (tries > 0) setTimeout(function () { initMarketIsland(tries - 1); }, 500);
      return;
    }
    if (btn.__lokaliWired) return;
    btn.__lokaliWired = true;

    var idleLabel = btn.textContent;
    function submitIsland() {
      if (btn.disabled) return;
      var email = String(input.value || '').trim();
      if (!email || email.indexOf('@') < 1 || email.length < 5) { flashInvalid(input); return; }
      btn.disabled = true;
      btn.textContent = 'Saving…';
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: MARKET_SOURCE })
      })
        .then(function (r) { return r.ok; })
        .catch(function () { return false; })
        .then(function (ok) {
          if (ok) {
            // Terminal success state: keep the button disabled.
            btn.textContent = 'Subscribed ✓';
            input.value = '';
            input.disabled = true;
          } else {
            // Delivery failed — the address may be fine, so no invalid flash;
            // the button is the only feedback channel in this island.
            btn.disabled = false;
            btn.textContent = 'Try again';
            setTimeout(function () {
              if (!btn.disabled && btn.textContent === 'Try again') btn.textContent = idleLabel;
            }, 2600);
          }
        });
    }

    btn.addEventListener('click', submitIsland);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitIsland(); }
    });
  }

  function boot() {
    init();
    initMarketIsland(30); // ~15s hydration window
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
