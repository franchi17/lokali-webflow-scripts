/**
 * Lokali — Contact Us form handler (/contact-us).
 *
 * Hooks the Webflow form #lokali-contact-form, validates it, and POSTs the
 * submission to a single configurable ENDPOINT. The endpoint is where the
 * Brevo send happens — this browser file holds NO secrets (per repo README).
 *
 * ── How to connect Brevo ────────────────────────────────────────────────
 * Point ENDPOINT at ONE of these (both keep the Brevo API key server-side):
 *
 *   A) Xano (recommended — matches the rest of Lokali).
 *      Build a public POST endpoint (e.g. /contact) that:
 *        - receives { topic, name, email, city, message, page_url }
 *        - sends a Brevo transactional email to hello@golokali.com
 *        - (optional) sends an autoresponder to the submitter
 *        - (optional) upserts the person as a Brevo contact / list
 *      Set TRANSPORT = 'json'.
 *
 *   B) Brevo hosted form (no Xano, no key in browser).
 *      In Brevo, create a form, copy its "serve" URL
 *      (https://<sub>.sibforms.com/serve/<id>) into ENDPOINT, set
 *      TRANSPORT = 'form', and map our fields to your Brevo field names in
 *      FIELD_MAP below (Brevo uses UPPERCASE attribute names, e.g. EMAIL).
 *
 * Load order: standalone — no dependency on lokali-api-client.js.
 * Deploy: jsDelivr from this repo, footer/site-wide or just on /contact-us.
 */
(function () {
  'use strict';

  // ─── CONFIG ──────────────────────────────────────────────────────────────
  var ENDPOINT  = 'https://x8ki-letl-twmt.n7.xano.io/api:oYK_cDmG/contact'; // Xano POST /contact (Contact group)
  var TRANSPORT = 'json';    // 'json' for Xano/custom · 'form' for Brevo sibforms

  // Only used when TRANSPORT === 'form' (Brevo). Maps our field → Brevo attr.
  var FIELD_MAP = {
    email:   'EMAIL',
    name:    'NAME',
    city:    'CITY',
    topic:   'TOPIC',
    message: 'MESSAGE'
  };
  // ─────────────────────────────────────────────────────────────────────────

  var FORM_ID = 'lokali-contact-form';

  function $(id) { return document.getElementById(id); }

  function init() {
    var form = $(FORM_ID);
    if (!form) return; // not on the contact page

    // Spam honeypot: injected (not in Webflow) so the form stays clean.
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'company_website';
    hp.tabIndex = -1;
    hp.setAttribute('autocomplete', 'off');
    hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;height:0;width:0;opacity:0;';
    form.appendChild(hp);

    // Capture phase + stopImmediatePropagation => Webflow's own AJAX submit
    // handler never runs; we own the submission.
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleSubmit(form, hp);
    }, true);
  }

  function showMsg(which) {
    var ok = $('cf-success'), err = $('cf-error');
    if (ok)  ok.style.display  = (which === 'success') ? 'block' : 'none';
    if (err) err.style.display = (which === 'error')   ? 'block' : 'none';
  }

  function val(id) {
    var el = $(id);
    return el ? el.value.trim() : '';
  }

  function handleSubmit(form, hp) {
    showMsg(null);

    if (hp && hp.value) { return; } // bot filled the honeypot — silently drop

    var data = {
      topic:    val('cf-topic'),
      name:     val('cf-name'),
      email:    val('cf-email'),
      city:     val('cf-city'),
      message:  val('cf-message'),
      page_url: window.location.href
    };

    // Validation
    if (!data.topic)   return fail('Please choose a topic.');
    if (!data.name)    return fail('Please enter your name.');
    if (!data.email || data.email.indexOf('@') < 1) return fail('Please enter a valid email address.');
    if (data.message.length < 5) return fail('Please write a short message.');

    if (!ENDPOINT) {
      // Not wired up yet — don't pretend it sent.
      console.warn('[lokali-contact] ENDPOINT is not set. Submission not delivered.');
      return fail('This form isn’t connected yet. Please email hello@golokali.com.');
    }

    var btn = $('cf-submit');
    var btnText = btn ? btn.value : null;
    if (btn) { btn.disabled = true; if ('value' in btn) btn.value = 'Sending…'; }

    send(data).then(function (ok) {
      if (btn) { btn.disabled = false; if (btnText != null) btn.value = btnText; }
      if (ok) {
        showMsg('success');
        form.reset();
      } else {
        fail();
      }
    });

    function fail(custom) {
      if (btn) { btn.disabled = false; if (btnText != null) btn.value = btnText; }
      var err = $('cf-error');
      if (err && custom) err.textContent = custom;
      showMsg('error');
      return false;
    }
  }

  function fail(custom) {
    var err = $('cf-error');
    if (err && custom) err.textContent = custom;
    showMsg('error');
    return false;
  }

  function send(data) {
    var opts;
    if (TRANSPORT === 'form') {
      // Brevo sibforms — form-encoded, mapped field names.
      var body = new URLSearchParams();
      Object.keys(FIELD_MAP).forEach(function (k) {
        if (data[k] != null) body.append(FIELD_MAP[k], data[k]);
      });
      opts = { method: 'POST', body: body };
    } else {
      // Xano / custom — JSON.
      opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      };
    }
    return fetch(ENDPOINT, opts)
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
