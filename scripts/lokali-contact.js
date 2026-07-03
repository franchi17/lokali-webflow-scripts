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

  // #46 — the live topic <select> option for city requests. A plain contact
  // email is a dead end for these; the site-wide waitlist modal
  // (lokali-waitlist.js, any [data-lokali-waitlist] element opens it) captures
  // a Maps-standardized city into the waitlist table + Brevo CITY instead.
  var EXPANSION_TOPIC = 'bring lokali to my city';

  function $(id) { return document.getElementById(id); }

  // Small always-visible pointer under the topic field.
  function injectWaitlistHint(form) {
    if ($('cf-wl-hint')) return;
    var topicEl = $('cf-topic');
    var field = topicEl && topicEl.closest ? topicEl.closest('.lok-cf-field') : null;
    var hint = document.createElement('p');
    hint.id = 'cf-wl-hint';
    hint.style.cssText = 'font-size:13.5px;line-height:1.45;color:#5d5470;margin:7px 2px 0;';
    hint.innerHTML = 'Requesting a new city? <a href="#" data-lokali-waitlist '
      + 'style="color:#7a56ee;font-weight:600;text-decoration:underline;">Use the city waitlist &rarr;</a>';
    if (field) field.appendChild(hint);
    else form.insertBefore(hint, form.firstChild);
  }

  // Prominent callout when the visitor picks the expansion topic.
  function toggleWaitlistCallout(form) {
    var topicEl = $('cf-topic');
    var on = !!topicEl && topicEl.value.trim().toLowerCase() === EXPANSION_TOPIC;
    var box = $('cf-wl-callout');
    if (!on) { if (box) box.style.display = 'none'; return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'cf-wl-callout';
      box.style.cssText = 'margin:12px 0 4px;padding:14px 16px;border:1.5px solid #ddd2fa;'
        + 'border-radius:12px;background:linear-gradient(135deg,#f6f2ff,#fff6ef);'
        + 'font-size:14px;color:#3d3357;line-height:1.55;';
      box.innerHTML = '<strong style="color:#5a3fc0;">Fastest way to bring Lokali to your city:</strong> '
        + 'join the city waitlist. Every request shapes our expansion map, and we’ll email you the moment we launch near you.'
        + '<div style="margin-top:10px;">'
        + '<a href="#" data-lokali-waitlist style="display:inline-block;padding:9px 16px;border-radius:10px;'
        + 'background:linear-gradient(90deg,#8B6CF0,#A45FE8);color:#fff;font-weight:700;font-size:14px;'
        + 'text-decoration:none;box-shadow:0 6px 16px rgba(139,108,240,.3);">Join the city waitlist &rarr;</a>'
        + '<span style="margin-left:10px;color:#8a819d;font-size:12.5px;">(or send the form — we read both)</span>'
        + '</div>';
      var field = topicEl.closest ? topicEl.closest('.lok-cf-field') : null;
      if (field && field.parentNode) field.parentNode.insertBefore(box, field.nextSibling);
      else form.insertBefore(box, form.firstChild);
    }
    box.style.display = '';
  }

  function init() {
    var form = $(FORM_ID);
    if (!form) return; // not on the contact page

    // #46 — route "request a new city" through the structured waitlist flow.
    injectWaitlistHint(form);
    var topicEl = $('cf-topic');
    if (topicEl) topicEl.addEventListener('change', function () { toggleWaitlistCallout(form); });

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
