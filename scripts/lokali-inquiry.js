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
          '<p class="lok-inq-sub">Send your question or request — they’ll reply to you directly.</p>' +
          '<div id="lok-inq-error"></div>' +
          '<div class="lok-inq-field"><label for="lok-inq-name">Your name</label>' +
            '<input id="lok-inq-name" type="text" autocomplete="name" maxlength="100"/></div>' +
          '<div class="lok-inq-field"><label for="lok-inq-email">Email</label>' +
            '<input id="lok-inq-email" type="email" autocomplete="email" maxlength="200"/></div>' +
          '<div class="lok-inq-field"><label for="lok-inq-phone">Phone (optional)</label>' +
            '<input id="lok-inq-phone" type="tel" autocomplete="tel" maxlength="30"/></div>' +
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
    overlay.querySelector('#lok-inq-cancel').addEventListener('click', close);
    overlay.querySelector('#lok-inq-close').addEventListener('click', close);
    overlay.querySelector('#lok-inq-form').addEventListener('submit', submit);
    return overlay;
  }

  function open(context) {
    if (!vendor) return;
    injectStyles();
    if (!modal) modal = buildModal();
    modal.setAttribute('data-context', context || '');
    modal.querySelector('#lok-inq-vname').textContent = vendor.name || 'this vendor';
    modal.querySelector('#lok-inq-form').style.display = '';
    modal.querySelector('#lok-inq-done').style.display = 'none';
    modal.querySelector('#lok-inq-error').style.display = 'none';
    modal.style.display = 'flex';
    var first = modal.querySelector('#lok-inq-name');
    if (first) first.focus();
  }

  function close() {
    if (modal) modal.style.display = 'none';
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
      website: modal.querySelector('#lok-inq-website').value
    }).then(function (res) {
      btn.disabled = false;
      btn.textContent = 'Send message';
      if (res && res.error) {
        showError(res.error === 'Request failed' ? 'Something went wrong — please try again.' : res.error);
        return;
      }
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

  function setVendor(v) {
    if (!v || v.id == null) return;
    vendor = { id: v.id, name: v.name || '' };
    mountButton();
  }

  document.addEventListener('lokali:vendor-loaded', function (e) { setVendor(e.detail); });
  function init() { if (window.LOKALI_LOADED_VENDOR) setVendor(window.LOKALI_LOADED_VENDOR); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.LokaliInquiry = { open: open, close: close };
})();
