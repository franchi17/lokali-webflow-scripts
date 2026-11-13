/**
 * Lokali — public "Send an inquiry" button + modal for the vendor listing page.
 *
 * Load AFTER scripts/lokali-api-client.js (needs window.LokaliAPI.leads).
 * Companion to lokali-vendor-listing.js, which announces the loaded vendor via
 * window.LOKALI_LOADED_VENDOR + the 'lokali:vendor-loaded' event.
 *
 * Self-mounting: prefers an explicit #lok-inquiry-mount element (add one in
 * Webflow to control placement); otherwise injects the button at the top of
 * the contact-channels block (before #vl-ch-email). Submissions go to the
 * public POST vendor/id/{id}/inquiry endpoint and land in the vendor's
 * dashboard Leads panel.
 */
(function () {
  'use strict';

  var vendor = null;   // { id, name } once known
  var mounted = false;
  var modal = null;
  // #251: the form for the SERVICE the box was opened from (service_inquiry_form):
  // { serviceId, phone: 'none'|'optional'|'required', hint, questions: [{q,t,req,c}] }.
  // null on the storefront and on products = the box exactly as it always was.
  var itemForm = null;

  var CSS = [
    '#lok-inq-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px 18px;margin:0 0 10px;border:0;border-radius:10px;background:#6002EE;color:#fff;font-family:"Plus Jakarta Sans",sans-serif;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s;}',
    '#lok-inq-btn:hover{background:#4D02BE;}',
    '#lok-inq-overlay{position:fixed;inset:0;background:rgba(20,16,37,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;}',
    '#lok-inq-card{background:#fff;border-radius:16px;max-width:440px;width:100%;max-height:90vh;overflow:auto;padding:28px;font-family:"Plus Jakarta Sans",sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.25);}',
    '#lok-inq-card h3{margin:0 0 4px;font-size:20px;font-weight:700;color:#1A1530;}',
    '#lok-inq-card .lok-inq-sub{margin:0 0 18px;font-size:13px;color:#6B6680;}',
    '.lok-inq-field{margin-bottom:12px;}',
    '.lok-inq-field label{display:block;font-size:12px;font-weight:600;color:#4A4761;margin-bottom:5px;}',
    '.lok-inq-field input,.lok-inq-field textarea{width:100%;box-sizing:border-box;border:1px solid #E2E0EC;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:14px;color:#1A1530;outline:none;}',
    '.lok-inq-field input:focus,.lok-inq-field textarea:focus{border-color:#6002EE;}',
    '.lok-inq-field textarea{min-height:100px;resize:vertical;}',
    '#lok-inq-error{display:none;margin:0 0 12px;padding:9px 12px;border-radius:8px;background:#FEF3F2;color:#C0392B;font-size:13px;}',
    '#lok-inq-send{width:100%;padding:13px;border:0;border-radius:10px;background:#6002EE;color:#fff;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;}',
    '#lok-inq-send:disabled{opacity:.6;cursor:default;}',
    '#lok-inq-cancel{display:block;width:100%;margin-top:8px;padding:10px;border:0;background:none;color:#6B6680;font-family:inherit;font-size:13px;cursor:pointer;}',
    '#lok-inq-done{text-align:center;padding:16px 0;}',
    '#lok-inq-done .lok-inq-check{width:52px;height:52px;border-radius:50%;background:#EAFAF2;color:#1D6A45;font-size:26px;line-height:52px;margin:0 auto 12px;}',
    '#lok-inq-done h4{margin:0 0 6px;font-size:18px;color:#1A1530;}',
    '#lok-inq-done p{margin:0;font-size:13px;color:#6B6680;}',
    // #251 vendor questions: "pick one" choices are pills, not a native select
    '.lok-inq-opt{font-weight:500;color:#8E8BA6;}',
    '.lok-inq-picks{display:flex;flex-wrap:wrap;gap:6px;}',
    '.lok-inq-pick{font-family:inherit;font-size:13px;font-weight:600;padding:8px 13px;border-radius:999px;border:1px solid #E2E0EC;background:#fff;color:#4A4761;cursor:pointer;}',
    '.lok-inq-pick[aria-pressed="true"]{background:#F3EBFF;border-color:#6002EE;color:#4A1FB8;}',
    '.lok-inq-pick:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
    // Honeypot: visually gone but still in the form for bots.
    '.lok-inq-hp{position:absolute;left:-9999px;top:-9999px;height:0;overflow:hidden;}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('lok-inq-styles')) return;
    var s = document.createElement('style');
    s.id = 'lok-inq-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildModal() {
    var overlay = document.createElement('div');
    overlay.id = 'lok-inq-overlay';
    overlay.innerHTML =
      '<div id="lok-inq-card" role="dialog" aria-modal="true" aria-label="Send a message">' +
        '<form id="lok-inq-form" novalidate>' +
          '<h3>Contact <span id="lok-inq-vname"></span></h3>' +
          '<p class="lok-inq-sub">Send your question or request. They’ll reply to you directly.</p>' +
          '<div id="lok-inq-error" aria-live="polite"></div>' +
          '<div class="lok-inq-field"><label for="lok-inq-name">Your name</label>' +
            '<input id="lok-inq-name" type="text" autocomplete="name" maxlength="100"/></div>' +
          '<div class="lok-inq-field"><label for="lok-inq-email">Email</label>' +
            '<input id="lok-inq-email" type="email" autocomplete="email" maxlength="200"/></div>' +
          '<div class="lok-inq-field" id="lok-inq-phone-field"><label for="lok-inq-phone">Phone (optional)</label>' +
            '<input id="lok-inq-phone" type="tel" autocomplete="tel" maxlength="30"/></div>' +
          '<div id="lok-inq-extra"></div>' +
          '<div class="lok-inq-field"><label for="lok-inq-msg">Message</label>' +
            '<textarea id="lok-inq-msg" maxlength="2000" placeholder="Hi! I’m interested in..."></textarea></div>' +
          '<div class="lok-inq-hp" aria-hidden="true"><label>Website<input id="lok-inq-website" type="text" tabindex="-1" autocomplete="off"/></label></div>' +
          '<button id="lok-inq-send" type="submit">Send message</button>' +
          '<button id="lok-inq-cancel" type="button">Cancel</button>' +
        '</form>' +
        '<div id="lok-inq-done" style="display:none;">' +
          '<div class="lok-inq-check">✓</div>' +
          '<h4>Message sent!</h4>' +
          '<p id="lok-inq-done-sub"></p>' +
          '<button id="lok-inq-close" type="button" style="margin-top:16px;padding:11px 28px;border:0;border-radius:10px;background:#6002EE;color:#fff;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;">Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.style.display !== 'none') close(); });
    // aria-modal promises focus can't leave the card — wrap Tab within it.
    overlay.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var card = overlay.querySelector('#lok-inq-card');
      var els = card.querySelectorAll('button, input, textarea, a[href]');
      var vis = [];
      for (var i = 0; i < els.length; i++) {
        if (els[i].offsetParent !== null && els[i].tabIndex !== -1) vis.push(els[i]);
      }
      if (!vis.length) return;
      var first = vis[0], last = vis[vis.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    overlay.querySelector('#lok-inq-cancel').addEventListener('click', close);
    overlay.querySelector('#lok-inq-close').addEventListener('click', close);
    overlay.querySelector('#lok-inq-form').addEventListener('submit', submit);
    return overlay;
  }

  // ── #102: a VENDOR's first shopping-side action gets an explicit heads-up ──
  // (Francesca 2026-07-22: never open the customer side silently). One-time
  // per browser, shared flag with lokali-favorites.js (same pattern there).
  var SHOP_NOTICE_KEY = 'lokali_shop_side_ok';
  function vendorNeedsShopNotice() {
    try {
      if (localStorage.getItem(SHOP_NOTICE_KEY) === '1') return false;
      var c = JSON.parse(localStorage.getItem('LOKALI_ACCT_CACHE') || 'null');
      return !!(c && c.role === 'vendor');
    } catch (e) { return false; }
  }
  function showShopNotice(onContinue) {
    var old = document.getElementById('lok-shop-notice');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'lok-shop-notice';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;' +
      "padding:20px;background:rgba(35,29,63,.55);font-family:'Plus Jakarta Sans',-apple-system,sans-serif;";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="background:#fff;border-radius:16px;max-width:400px;width:100%;padding:26px 24px;box-shadow:0 20px 60px rgba(35,29,63,.25);">' +
        '<h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#231D3F;font-family:inherit;">Switching you to your shopping space</h3>' +
        '<p style="margin:0 0 18px;font-size:13.5px;line-height:1.55;color:#4A4761;">You’re signed in as a vendor. Following and contacting other vendors happens on your customer side. Your storefront isn’t touched. We won’t ask again.</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button data-sn-cancel style="font-family:inherit;font-size:13px;font-weight:600;color:#4A4761;background:#fff;border:.5px solid #C8C6D8;border-radius:9px;padding:9px 16px;cursor:pointer;">Not now</button>' +
          '<button data-sn-go style="font-family:inherit;font-size:13px;font-weight:600;color:#fff;background:#6002EE;border:none;border-radius:9px;padding:9px 16px;cursor:pointer;">Continue</button>' +
        '</div>' +
      '</div>';
    // Dialog basics: Escape dismisses, and focus returns to the opener.
    var prevFocus = document.activeElement;
    function dismiss() {
      document.removeEventListener('keydown', snEsc, true);
      ov.remove();
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
    }
    ov.addEventListener('click', function (e) { if (e.target === ov) dismiss(); });
    // Escape at DOCUMENT level: a click on non-focusable card text can drop
    // focus to <body> (Safari), where an overlay-scoped listener never hears
    // the key. Removed again in dismiss().
    function snEsc(e) { if (e.key === 'Escape') dismiss(); }
    document.addEventListener('keydown', snEsc, true);
    ov.querySelector('[data-sn-cancel]').addEventListener('click', dismiss);
    ov.querySelector('[data-sn-go]').addEventListener('click', function () {
      try { localStorage.setItem(SHOP_NOTICE_KEY, '1'); } catch (e) {}
      dismiss();
      onContinue();
    });
    document.body.appendChild(ov);
    try { ov.querySelector('[data-sn-go]').focus(); } catch (e) {}
  }

  // #251: keep only what the box can draw. Everything shown later goes through
  // textContent / .value, never markup. Returns null when there is nothing to apply.
  var DEFAULT_HINT = 'Hi! I\u2019m interested in...';
  function cleanForm(f) {
    if (!f || typeof f !== 'object' || f.serviceId == null) return null;
    var phone = f.phone === 'none' || f.phone === 'required' ? f.phone : 'optional';
    var qs = [];
    var raw = Array.isArray(f.questions) ? f.questions.slice(0, 3) : [];
    for (var i = 0; i < raw.length; i++) {
      var q = raw[i] || {};
      var text = typeof q.q === 'string' ? q.q.trim().slice(0, 200) : '';
      var t = q.t === 'date' || q.t === 'pick' ? q.t : 'text';
      var c = [];
      if (t === 'pick' && Array.isArray(q.c)) {
        for (var k = 0; k < q.c.length && c.length < 6; k++) {
          var ch = typeof q.c[k] === 'string' ? q.c[k].trim().slice(0, 60) : '';
          if (ch && c.indexOf(ch) < 0) c.push(ch);
        }
      }
      // Position matters (answers[i] answers questions[i] on the server), so a
      // question that cannot be drawn keeps its slot as null instead of shifting.
      qs.push(text && (t !== 'pick' || c.length >= 2) ? { q: text, t: t, req: q.req === true, c: c } : null);
    }
    return { serviceId: f.serviceId, phone: phone, hint: typeof f.hint === 'string' ? f.hint.trim().slice(0, 200) : '', questions: qs };
  }
  function paintItemForm() {
    var f = itemForm;
    var phoneField = modal.querySelector('#lok-inq-phone-field');
    var phoneMode = f ? f.phone : 'optional';
    var away = awayInfo(), paused = !!(away && !away.accepts); // messages paused: paintAway hid the fields
    phoneField.style.display = phoneMode === 'none' || paused ? 'none' : '';
    phoneField.querySelector('label').textContent = phoneMode === 'required' ? 'Phone' : 'Phone (optional)';
    if (phoneMode === 'none') modal.querySelector('#lok-inq-phone').value = '';
    modal.querySelector('#lok-inq-msg').setAttribute('placeholder', (f && f.hint) || DEFAULT_HINT);
    var host = modal.querySelector('#lok-inq-extra');
    host.textContent = '';
    if (!f) return;
    f.questions.forEach(function (q, i) {
      if (!q) return;
      var wrap = document.createElement('div'); wrap.className = 'lok-inq-field'; wrap.setAttribute('data-q', String(i));
      var id = 'lok-inq-q' + i;
      var lab = document.createElement(q.t === 'pick' ? 'div' : 'label');
      lab.id = id + '-l';
      if (q.t !== 'pick') lab.setAttribute('for', id);
      // the modal's label rule targets <label>; a pick group's caption matches it by hand
      if (q.t === 'pick') lab.style.cssText = 'display:block;font-size:12px;font-weight:600;color:#4A4761;margin-bottom:5px;';
      lab.appendChild(document.createTextNode(q.q));
      if (!q.req) { var o = document.createElement('span'); o.className = 'lok-inq-opt'; o.textContent = ' (optional)'; lab.appendChild(o); }
      wrap.appendChild(lab);
      if (q.t === 'pick') {
        var grp = document.createElement('div'); grp.className = 'lok-inq-picks'; grp.setAttribute('role', 'group'); grp.setAttribute('aria-labelledby', id + '-l');
        q.c.forEach(function (ch) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'lok-inq-pick'; b.textContent = ch; b.setAttribute('aria-pressed', 'false');
          b.addEventListener('click', function () {
            var was = b.getAttribute('aria-pressed') === 'true';
            for (var n = 0; n < grp.children.length; n++) grp.children[n].setAttribute('aria-pressed', 'false');
            // an optional question can be un-picked; a required one keeps a choice
            b.setAttribute('aria-pressed', was && !q.req ? 'false' : 'true');
          });
          grp.appendChild(b);
        });
        wrap.appendChild(grp);
      } else {
        var inp = document.createElement('input'); inp.id = id; inp.type = q.t === 'date' ? 'date' : 'text';
        if (q.t !== 'date') inp.maxLength = 200;
        wrap.appendChild(inp);
      }
      host.appendChild(wrap);
    });
  }
  // One answer per question slot ('' = not answered), or { error } naming the
  // first required question left blank.
  function readAnswers() {
    var out = [];
    if (!itemForm) return { answers: out };
    for (var i = 0; i < itemForm.questions.length; i++) {
      var q = itemForm.questions[i], a = '';
      if (q) {
        var wrap = modal.querySelector('#lok-inq-extra [data-q="' + i + '"]');
        if (q.t === 'pick') { var on = wrap && wrap.querySelector('.lok-inq-pick[aria-pressed="true"]'); a = on ? on.textContent : ''; }
        else { var inp = wrap && wrap.querySelector('input'); a = inp ? String(inp.value || '').trim() : ''; }
        if (!a && q.req) return { error: 'Please answer: ' + q.q };
      }
      out.push(a);
    }
    return { answers: out };
  }

  // opts (#251, optional): { form } from service_inquiry_form for the service
  // the shopper is on. Leave it out anywhere else.
  function open(context, opts) {
    if (!vendor) return;
    var f = cleanForm(opts && opts.form);
    if (vendorNeedsShopNotice()) {
      showShopNotice(function () { reallyOpen(context, f); });
      return;
    }
    reallyOpen(context, f);
  }
  var lastFocus = null; // restored on close (keyboard/SR users otherwise land at document top)
  // Away mode (2026-09-17): the storefront hands the vendor's away fields over
  // with the id; a future away_until adds a note above the form, and when the
  // vendor paused messages the form is replaced by "back on <date>".
  function awayInfo() {
    if (!vendor || !vendor.away_until) return null;
    var d = String(vendor.away_until).slice(0, 10);
    var t = new Date(); var today = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
    if (d < today) return null;
    var p = d.split('-'); var when = new Date(+p[0], +p[1] - 1, +p[2]);
    return { label: when.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }), note: String(vendor.away_note || '').trim(), accepts: vendor.away_accepts_inquiries !== false };
  }
  function paintAway() {
    var a = awayInfo();
    var extra = modal.querySelector('#lok-inq-extra');
    if (extra) extra.style.display = a && !a.accepts ? 'none' : '';
    var host = modal.querySelector('#lok-inq-away');
    if (!host) {
      host = document.createElement('div'); host.id = 'lok-inq-away';
      host.style.cssText = 'display:none;background:#FFF2DF;border:1px solid #FFDDB0;border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:13px;line-height:1.5;color:#B8471B;';
      var sub = modal.querySelector('.lok-inq-sub');
      if (sub && sub.parentNode) sub.parentNode.insertBefore(host, sub.nextSibling);
    }
    var form = modal.querySelector('#lok-inq-form');
    var fields = form.querySelectorAll('.lok-inq-field, #lok-inq-send');
    if (!a) { host.style.display = 'none'; for (var i = 0; i < fields.length; i++) fields[i].style.display = ''; return; }
    host.innerHTML = '<b>Away until ' + a.label + '.</b> ' + (a.note ? a.note.replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }) : (a.accepts ? 'You can still send a message; the reply will come after that.' : 'Messages are paused until then.'));
    host.style.display = 'block';
    for (var j = 0; j < fields.length; j++) fields[j].style.display = a.accepts ? '' : 'none';
  }
  function reallyOpen(context, form) {
    if (!vendor) return;
    injectStyles();
    if (!modal) modal = buildModal();
    modal.setAttribute('data-context', context || '');
    itemForm = form || null;
    modal.querySelector('#lok-inq-vname').textContent = vendor.name || 'this vendor';
    modal.querySelector('#lok-inq-form').style.display = '';
    modal.querySelector('#lok-inq-done').style.display = 'none';
    modal.querySelector('#lok-inq-error').style.display = 'none';
    try { paintAway(); } catch (e) {}
    // after paintAway: it resets every field's display, the phone field included
    try { paintItemForm(); } catch (e) { itemForm = null; }
    lastFocus = document.activeElement;
    document.body.style.overflow = 'hidden'; // lock the page behind the overlay
    modal.style.display = 'flex';
    var first = modal.querySelector('#lok-inq-name');
    if (first) first.focus();
  }

  function close() {
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    lastFocus = null;
  }

  function showError(msg) {
    var el = modal.querySelector('#lok-inq-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function submit(e) {
    e.preventDefault();
    if (!vendor || !window.LokaliAPI || !window.LokaliAPI.leads) return;
    var name = modal.querySelector('#lok-inq-name').value.trim();
    var email = modal.querySelector('#lok-inq-email').value.trim();
    var phone = modal.querySelector('#lok-inq-phone').value.trim();
    var msg = modal.querySelector('#lok-inq-msg').value.trim();

    if (!name) return showError('Please enter your name.');
    if (!email || email.indexOf('@') < 1) return showError('Please enter a valid email address.');
    if (itemForm && itemForm.phone === 'required' && !phone) return showError('Please enter your phone number.');
    var ans = readAnswers();
    if (ans.error) return showError(ans.error);
    if (msg.length < 5) return showError('Please write a short message (at least a few words).');

    var btn = modal.querySelector('#lok-inq-send');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    window.LokaliAPI.leads.submitInquiry(vendor.id, {
      name: name,
      email: email,
      phone: phone,
      message: msg,
      context: modal.getAttribute('data-context') || '',
      source: 'listing',
      serviceId: itemForm ? itemForm.serviceId : null,
      answers: itemForm ? ans.answers : null,
      website: modal.querySelector('#lok-inq-website').value
    }).then(function (res) {
      btn.disabled = false;
      btn.textContent = 'Send message';
      if (res && res.error) {
        // The route answers 409 {ok:false, reason:'away'}; the client chain turns that into
        // the string 'HTTP 409' with no status, so read the reason (and the 409 text) too.
        var isAway = res.status === 409 || (res.data && res.data.reason === 'away') || /\baway\b|HTTP 409/i.test(String(res.error));
        // #201: the route answers 429 {reason:'rate_limited'} for every cap
        // (per IP, per vendor, across vendors, 2 per vendor per hour, blocklist).
        // Say so plainly instead of "HTTP 429", and do not invite a retry: a
        // 4th try inside the hour marks the earlier messages as spam.
        var capped = res.data && res.data.reason === 'rate_limited';
        // #251: the server re-checks the vendor's questions; say what it wants.
        var why = res.data && res.data.reason;
        if (why === 'phone_required') return showError('Please enter your phone number.');
        if (why === 'answer_required') return showError('Please answer the questions above your message.');
        if (why === 'invalid_answer') return showError('One of your answers was not accepted. Please check the questions above your message.');
        showError(isAway ? 'This vendor is away right now and not taking messages. Please check back after their return date.' :
          capped ? 'You\u2019ve reached the hourly limit for messages on Lokali. Anything you already sent has reached the vendor, and they can reply by email. Please wait an hour before sending more.' :
          (res.error === 'Request failed' ? 'Something went wrong. Please try again.' : res.error));
        return;
      }
      // #110 GA4: the highest-intent lead event (no form contents sent, id only).
      try { if (typeof window.gtag === 'function') window.gtag('event', 'inquiry_submit', { vendor_id: vendor && vendor.id != null ? String(vendor.id) : '' }); } catch (e) {}
      modal.querySelector('#lok-inq-form').style.display = 'none';
      modal.querySelector('#lok-inq-done-sub').textContent =
        (vendor.name || 'The vendor') + ' will get back to you at ' + email + '.';
      modal.querySelector('#lok-inq-done').style.display = 'block';
    });
  }

  function mountButton() {
    if (mounted || !vendor) return;
    var target = document.getElementById('lok-inquiry-mount');
    var btn = document.createElement('button');
    btn.id = 'lok-inq-btn';
    btn.type = 'button';
    btn.textContent = 'Send a message';
    btn.addEventListener('click', function () { open(''); });
    injectStyles();
    if (target) {
      target.appendChild(btn);
    } else {
      // Default placement: first item in the contact-channels block.
      var emailCh = document.getElementById('vl-ch-email');
      if (!emailCh || !emailCh.parentNode) {
        console.warn('[lokali-inquiry] no mount point (#lok-inquiry-mount or #vl-ch-email) — button not mounted');
        return;
      }
      emailCh.parentNode.insertBefore(btn, emailCh.parentNode.firstChild);
    }
    mounted = true;
  }

  // Deep link from The Market card's Email button (/{slug}?inquiry=1). The card
  // has no vendor context of its own, so instead of teaching the modal to live
  // on the grid we send the visitor to the storefront and open the form on
  // arrival — same modal, same gate, and they can see who they're writing to.
  // One-shot: vendor-loaded can fire more than once, and a reopened modal the
  // visitor just dismissed reads as a bug.
  var deepLinked = false;
  function maybeDeepLink() {
    if (deepLinked || !/[?&]inquiry=1(&|$)/.test(window.location.search)) return;
    deepLinked = true;
    // Drop the param so a refresh (or a shared URL) doesn't reopen the form.
    // Strips ONLY inquiry=1 — vendor-listing reads onepage=0 off the same query.
    try {
      var kept = window.location.search.replace(/^\?/, '').split('&').filter(function (kv) {
        return kv && kv !== 'inquiry=1';
      });
      window.history.replaceState(null, '',
        window.location.pathname + (kept.length ? '?' + kept.join('&') : '') + window.location.hash);
    } catch (e) {}
    open('market');
  }

  function setVendor(v) {
    if (!v || v.id == null) return;
    vendor = { id: v.id, name: v.name || '', away_until: v.away_until || null, away_note: v.away_note || '', away_accepts_inquiries: v.away_accepts_inquiries !== false };
    mountButton();
    maybeDeepLink();
  }

  document.addEventListener('lokali:vendor-loaded', function (e) { setVendor(e.detail); });
  function init() { if (window.LOKALI_LOADED_VENDOR) setVendor(window.LOKALI_LOADED_VENDOR); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.LokaliInquiry = { open: open, close: close };
})();
