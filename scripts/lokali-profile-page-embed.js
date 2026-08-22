/*
  Lokali — Vendor Profile page logic (/vendor-dashboard/profile)
  Hosted version of the former inline "profile-page-body-embed.html" paste.
  Ships via jsDelivr from lokali-webflow-scripts; load with ONE tag on the
  profile page AFTER the sitewide bundle:
    lokali-api-client.js → lokali-clerk-auth.js → lokali-dashboard.js
  Contains (in order): injected page styles (field colors + service-area toggle pills),
  LokaliPhoneInput, LokaliProfilePage. No markup needed in the page beyond the
  existing form elements/IDs.
*/
(function () {
  function injectStyle(id, css) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style");
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
  injectStyle("lokali-profile-field-colors", "  .w-input, .w-select, .lokali-phone-number, #textarea-description {\n    color: #1A1829;\n  }\n  .w-input::placeholder, .w-select::placeholder,\n  .lokali-phone-number::placeholder, #textarea-description::placeholder {\n    color: #8E8BA6;\n  }");
  // Feedback 2026-08-13 (Francesca, mobile pass): the Designer's .div-block-128
  // is column+center+margin-left:40px, which reads as "the logo is right-aligned"
  // on a phone -> make it a row (logo left, upload button right); the Webflow
  // .grid keeps two ~120px columns at phone widths -> single column; and the
  // page's inherited 26px line-height is too airy on 13-14px description text.
  injectStyle("lokali-profile-mobile-polish",
    "  @media (max-width: 991px) {\n" +
    "    .div-block-128 {\n" +
    "      flex-flow: row !important;\n" +
    "      align-items: center !important;\n" +
    "      justify-content: space-between !important;\n" +
    "      margin-left: 0 !important;\n" +
    "      width: 100%;\n" +
    "      gap: 12px;\n" +
    "    }\n" +
    "    .div-block-128 .image-placeholder { margin: 0 !important; }\n" +
    "  }\n" +
    "  @media (max-width: 767px) {\n" +
    "    /* Webflow's .grid is grid-auto-flow:column — items spawn IMPLICIT side\n" +
    "       columns, so grid-template-columns alone can't collapse it. */\n" +
    "    #wf-form-Business-Profile .w-layout-grid.grid {\n" +
    "      grid-template-columns: 1fr !important;\n" +
    "      grid-auto-flow: row !important;\n" +
    "    }\n" +
    "  }\n" +
    "  .subheader { line-height: 1.5 !important; }\n" +
    "  #wf-form-Business-Profile .input-heading { line-height: 1.5; }\n" +
    "  /* breathing room under the phone input and between the contact checkboxes */\n" +
    "  #wf-form-Business-Profile .lokali-phone { margin-bottom: 12px; }\n" +
    "  #wf-form-Business-Profile .checkbox-form { margin-bottom: 9px; }");
  injectStyle("lokali-locations-ui-style", "  .location-multi {\n    font-family: \"Plus Jakarta Sans\", system-ui, -apple-system, sans-serif;\n    background: #eee6ff;\n    padding: 12px 14px;\n    border-radius: 8px;\n    box-sizing: border-box;\n  }\n  .location-hint {\n    font-size: 13px;\n    color: #5A5570;\n    margin: 0 0 10px;\n    line-height: 1.4;\n  }\n  .location-pills {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 8px;\n  }\n  .location-pill {\n    font-family: inherit;\n    -webkit-appearance: none;\n    appearance: none;\n    display: inline-flex;\n    align-items: center;\n    gap: 7px;\n    background: #fff;\n    color: #5A5570;\n    border: 1px solid #C9BDE8;\n    border-radius: 999px;\n    padding: 8px 14px;\n    font-size: 14px;\n    line-height: 1.3;\n    cursor: pointer;\n    user-select: none;\n    transition: background .12s, border-color .12s, color .12s;\n  }\n  .location-pill:hover {\n    border-color: #6002ee;\n    color: #6002ee;\n  }\n  .location-pill.is-on {\n    background: #6002EE;\n    border-color: #6002EE;\n    color: #fff;\n    font-weight: 600;\n  }\n  .location-pill.is-on:hover {\n    background: #4a01c7;\n    border-color: #4a01c7;\n    color: #fff;\n  }\n  .location-pill .lp-g {\n    font-weight: 700;\n    font-size: 13px;\n    line-height: 1;\n  }\n  .location-count {\n    font-size: 12.5px;\n    color: #6B6787;\n    margin: 10px 0 0;\n  }\n  .category-pills {\n    font-family: \"Plus Jakarta Sans\", system-ui, -apple-system, sans-serif;\n    background: #eee6ff;\n    padding: 12px 14px;\n    border-radius: 8px;\n    box-sizing: border-box;\n  }\n  .category-hint {\n    font-size: 13px;\n    color: #5A5570;\n    margin: 0 0 10px;\n    line-height: 1.4;\n  }\n  .category-pill-row {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 8px;\n  }\n  .category-pill {\n    font-family: inherit;\n    -webkit-appearance: none;\n    appearance: none;\n    display: inline-flex;\n    align-items: center;\n    gap: 8px;\n    background: #fff;\n    color: #5A5570;\n    border: 1px solid #C9BDE8;\n    border-radius: 999px;\n    padding: 8px 14px;\n    font-size: 14px;\n    line-height: 1.3;\n    cursor: pointer;\n    user-select: none;\n    transition: background .12s, border-color .12s, color .12s;\n  }\n  .category-pill:hover {\n    border-color: #6002ee;\n    color: #6002ee;\n  }\n  .category-pill.is-on {\n    background: #6002EE;\n    border-color: #6002EE;\n    color: #fff;\n    font-weight: 600;\n  }\n  .category-pill .cp-ic {\n    width: 16px;\n    height: 16px;\n    flex-shrink: 0;\n    background-color: currentColor;\n    -webkit-mask-position: center;\n    -webkit-mask-repeat: no-repeat;\n    -webkit-mask-size: contain;\n    mask-position: center;\n    mask-repeat: no-repeat;\n    mask-size: contain;\n  }");
})();


var LokaliPhoneInput = (function () {
  'use strict';

  // Countries offered by the dial-code select. `nat` = the national digit
  // counts accepted for that country (an array: Brazilian mobiles are 11
  // digits, its landlines 10). US is first, so it stays the default and
  // nothing changes for the vendors who just type ten digits.
  //
  // WHY THE SELECT EXISTS (2026-08-15): a bare 10-digit national number is
  // ambiguous between the US and Mexico — both are 10 digits — so the old
  // "10 digits => +1" rule silently rewrote Woodlands vendors' Mexican
  // WhatsApp numbers into US numbers, breaking every wa.me/sms:/tel: link
  // built from them. Digits alone cannot resolve it; the vendor has to tell
  // us which country. Hence the select. (Read-side heals in vendor-listing's
  // normPhone / browse's phoneDigits are UNCHANGED — see the #103 canon note
  // in getNumber below.)
  var COUNTRIES = [
    { iso: 'US', name: 'United States', dial: '1',   nat: [10] },
    // 11 = the legacy WhatsApp mobile form '+52 1 NNNNNNNNNN'. WhatsApp
    // dropped the extra 1 in 2019 but plenty of saved contacts still carry it,
    // so accept both rather than pushing those numbers into 'Other'.
    { iso: 'MX', name: 'Mexico',        dial: '52',  nat: [10, 11] },
    { iso: 'CA', name: 'Canada',        dial: '1',   nat: [10] },
    { iso: 'AR', name: 'Argentina',     dial: '54',  nat: [10] },
    { iso: 'BR', name: 'Brazil',        dial: '55',  nat: [10, 11] },
    { iso: 'CL', name: 'Chile',         dial: '56',  nat: [9] },
    { iso: 'CO', name: 'Colombia',      dial: '57',  nat: [10] },
    { iso: 'CR', name: 'Costa Rica',    dial: '506', nat: [8] },
    { iso: 'EC', name: 'Ecuador',       dial: '593', nat: [9] },
    { iso: 'SV', name: 'El Salvador',   dial: '503', nat: [8] },
    { iso: 'GT', name: 'Guatemala',     dial: '502', nat: [8] },
    { iso: 'HN', name: 'Honduras',      dial: '504', nat: [8] },
    { iso: 'NI', name: 'Nicaragua',     dial: '505', nat: [8] },
    { iso: 'PE', name: 'Peru',          dial: '51',  nat: [9] },
    { iso: 'ES', name: 'Spain',         dial: '34',  nat: [9] },
    { iso: 'VE', name: 'Venezuela',     dial: '58',  nat: [10] }
  ];

  // Longest dial code first, so '+502' is never mis-read as '+5'.
  var BY_DIAL_LEN = COUNTRIES.slice().sort(function (a, b) {
    return b.dial.length - a.dial.length;
  });

  function digitsOnly(value) {
    return (value || '').replace(/\D/g, '');
  }

  function byIso(iso) {
    for (var i = 0; i < COUNTRIES.length; i++) {
      if (COUNTRIES[i].iso === iso) return COUNTRIES[i];
    }
    return null;
  }

  function fits(country, nationalLen) {
    for (var i = 0; i < country.nat.length; i++) {
      if (country.nat[i] === nationalLen) return true;
    }
    return false;
  }

  // Split a stored E.164 digit string into { iso, national }. Matching is by
  // dial code AND exact total length, which is what keeps +1 and +52 apart:
  // a US number is 1 + 10 = 11 digits and always starts '1'; a Mexican one is
  // 52 + 10 = 12 and always starts '52'. Returns null when nothing matches —
  // the caller then keeps the number whole rather than losing digits to a
  // guess.
  function splitE164(d) {
    for (var i = 0; i < BY_DIAL_LEN.length; i++) {
      var c = BY_DIAL_LEN[i];
      if (d.indexOf(c.dial) === 0 && fits(c, d.length - c.dial.length)) {
        return { iso: c.iso, national: d.slice(c.dial.length) };
      }
    }
    return null;
  }

  function injectStyle() {
    if (document.getElementById('lokali-phone-input-css')) return;
    var s = document.createElement('style');
    s.id = 'lokali-phone-input-css';
    // Self-contained on purpose: lokali-phone-input.css is delivered by a
    // Webflow page tag, so the widget cannot assume it is present. Both carry
    // identical rules, so load order does not matter.
    s.textContent =
      '.lokali-phone{display:flex;gap:8px;align-items:stretch;width:100%;max-width:100%;box-sizing:border-box;}' +
      '.lokali-phone-country{flex:0 0 auto;width:190px;max-width:48%;padding:8px 28px 8px 10px;' +
        'border:1px solid #ccc;border-radius:4px;background-color:#fff;color:#1A1829;' +
        'font-family:"Plus Jakarta Sans",system-ui,-apple-system,sans-serif;font-size:14px;' +
        'box-sizing:border-box;cursor:pointer;-webkit-appearance:none;appearance:none;' +
        'background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath fill=\'none\' stroke=\'%235A5570\' stroke-width=\'1.6\' stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'M1 1.5 6 6.5 11 1.5\'/%3E%3C/svg%3E");' +
        'background-repeat:no-repeat;background-position:right 10px center;}' +
      '.lokali-phone-country:focus{outline:none;border-color:#6002EE;box-shadow:0 0 0 3px rgba(96,2,238,.15);}' +
      '.lokali-phone-number{flex:1 1 auto;min-width:0;display:block;width:auto;max-width:100%;' +
        'padding:8px 12px;border:1px solid #ccc;border-radius:4px;' +
        'font-family:"Plus Jakarta Sans",system-ui,-apple-system,sans-serif;font-size:14px;' +
        'box-sizing:border-box;}' +
      '.lokali-phone-number:focus{outline:none;border-color:#6002EE;box-shadow:0 0 0 3px rgba(96,2,238,.15);}' +
      /* iOS zoom floor: inputs stay >=16px below the tablet breakpoint */
      '@media (max-width:991px){.lokali-phone-country,.lokali-phone-number{font-size:16px;}' +
        '.lokali-phone-country{width:156px;}}';
    document.head.appendChild(s);
  }

  function create(containerOrInputId) {
    var el;
    if (typeof containerOrInputId === 'string') {
      el = document.getElementById(containerOrInputId) || document.querySelector('[data-lokali-phone]');
    } else {
      el = containerOrInputId;
    }
    if (!el) return null;

    injectStyle();

    var existingInput = el.tagName === 'INPUT' ? el : el.querySelector('input');
    var parent = existingInput ? existingInput.parentNode : el;
    var placeholder = existingInput ? (existingInput.getAttribute('placeholder') || '') : '';
    var preferredId = (existingInput && existingInput.id) ? existingInput.id : 'input-phone';

    var wrapper = document.createElement('div');
    wrapper.className = 'lokali-phone';

    var select = document.createElement('select');
    select.className = 'lokali-phone-country';
    select.setAttribute('aria-label', 'Country dialling code');
    var i, opt;
    for (i = 0; i < COUNTRIES.length; i++) {
      opt = document.createElement('option');
      opt.value = COUNTRIES[i].iso;
      opt.textContent = COUNTRIES[i].name + ' (+' + COUNTRIES[i].dial + ')';
      select.appendChild(opt);
    }
    // Escape hatch: any country not listed above is still storable — the
    // vendor types the full +number and we keep it verbatim.
    opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Other — type +code';
    select.appendChild(opt);

    var input = document.createElement('input');
    input.type = 'tel';
    input.className = 'lokali-phone-number';
    input.id = preferredId;
    input.setAttribute('inputmode', 'tel');
    input.setAttribute('autocomplete', 'tel');
    if (existingInput && existingInput.name) input.name = existingInput.name;

    if (el && el.tagName !== 'INPUT' && el.id) {
      el.removeAttribute('id');
    }

    wrapper.appendChild(select);
    wrapper.appendChild(input);

    if (existingInput && existingInput.parentNode) {
      existingInput.parentNode.replaceChild(wrapper, existingInput);
    } else {
      parent.innerHTML = '';
      parent.appendChild(wrapper);
    }

    function currentCountry() {
      return select.value ? byIso(select.value) : null;
    }

    // The hint has to track the country: '415 555 0123' is actively misleading
    // once the vendor has picked Mexico.
    function syncPlaceholder() {
      var c = currentCountry();
      if (!c) { input.setAttribute('placeholder', '+34 600 000 000'); return; }
      if (c.dial === '1') { input.setAttribute('placeholder', '415 555 0123'); return; }
      var n = c.nat[0], parts = [], k;
      for (k = 0; k < n; k += 3) parts.push(new Array(Math.min(3, n - k) + 1).join('0'));
      input.setAttribute('placeholder', parts.join(' '));
    }
    if (placeholder) input.setAttribute('placeholder', placeholder);
    else syncPlaceholder();
    select.addEventListener('change', function () {
      if (!placeholder) syncPlaceholder();
    });

    function getNumber() {
      var raw = String(input.value || '').trim();
      var d = digitsOnly(raw);
      if (!d) return '';
      // #103 CANON — DO NOT REGRESS: a leading '+' followed by exactly 10
      // digits is a NANP national number, not a country code. The pre-#103
      // widget stored '+' + the raw 10 national digits, and US vendors type
      // '+' out of habit. Heal 10-digit first, THEN trust the '+'.
      if (raw.charAt(0) === '+') {
        return (d.length === 10) ? '+1' + d : '+' + d;
      }
      var c = currentCountry();
      if (!c) return '+' + d;
      // Tolerate the dial code typed into the field without a '+'
      // (e.g. Mexico selected and "525512345678" pasted in).
      if (d.indexOf(c.dial) === 0 && fits(c, d.length - c.dial.length)) return '+' + d;
      return '+' + c.dial + d;
    }

    function setNumber(e164) {
      var d = digitsOnly(e164);
      if (!d) { select.value = 'US'; input.value = ''; if (!placeholder) syncPlaceholder(); return; }
      // Legacy heal (#103 canon): pre-E.164 rows stored '+' + the raw 10
      // national digits, so a bare 10-digit value is ALWAYS NANP.
      if (d.length === 10) {
        select.value = 'US';
        input.value = d;
        if (!placeholder) syncPlaceholder();
        return;
      }
      var parts = splitE164(d);
      if (parts) {
        select.value = parts.iso;
        input.value = parts.national;
      } else {
        // Unknown dial code — show it whole so no digits are lost, and let
        // getNumber() round-trip it verbatim via the '+' branch.
        select.value = '';
        input.value = '+' + d;
      }
      if (!placeholder) syncPlaceholder();
    }

    function isValidNumber() {
      var raw = String(input.value || '').trim();
      var d = digitsOnly(raw);
      if (!d) return true;                                  // empty = optional
      if (raw.charAt(0) === '+') return d.length >= 10 && d.length <= 15;
      var c = currentCountry();
      if (!c) return d.length >= 10 && d.length <= 15;
      // The national number, or the same number with its dial code typed in.
      return fits(c, d.length) ||
             (d.indexOf(c.dial) === 0 && fits(c, d.length - c.dial.length));
    }

    return {
      getNumber: getNumber,
      setNumber: setNumber,
      isValidNumber: isValidNumber,
      input: input,
      select: select
    };
  }

  return { create: create, COUNTRIES: COUNTRIES };
})();

var LokaliProfilePage = (function () {
  'use strict';

  // Debug-gated logger: these traces dump vendor data (name, tagline, photo URL,
  // save payloads). Silent in production; set window.LOKALI_DEBUG = true to enable.
  function _dbg() {
    if (window.LOKALI_DEBUG && window.console && console.log) {
      console.log.apply(console, arguments);
    }
  }

  var SAVE_BTN   = 'profile-save-btn';
  var SAVE_BTN_BOTTOM = 'profile-save-btn-bottom';
  var SUCCESS_ID = 'profile-save-success';
  var ERROR_ID   = 'profile-save-error';

  function _getSuccessEl() {
    return document.getElementById(SUCCESS_ID) || document.querySelector('[data-lokali-profile-success]');
  }
  function _getErrorEl() {
    return document.getElementById(ERROR_ID) || document.querySelector('[data-lokali-profile-error]');
  }

  var _vendor = null;
  var _categories = null;
  var _locations = null;
  var _selectedLocationIds = [];
  var _locationPillsEl = null;
  var _locationCountEl = null;
  var _phone  = null;
  var _uploadedProfilePhotoUrl = null;

  function _getProfilePhotoPreviewEl() {
    var el = document.getElementById('profile-photo-preview') || document.getElementById('vendor-profile-photo-preview') || document.querySelector('[data-lokali-profile-photo-preview]');
    if (!el) return null;
    if (el.tagName === 'IMG') return el;
    return el.querySelector('img') || el;
  }

  function _showToast(type, message) {
    if (typeof document === 'undefined') return;
    var existing = document.getElementById('lokali-profile-toast');
    var el = existing || document.createElement('div');
    if (!existing) {
      el.id = 'lokali-profile-toast';
      el.style.position = 'fixed';
      el.style.top = '24px';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
      el.style.zIndex = '9999';
      el.style.padding = '12px 20px';
      el.style.borderRadius = '999px';
      el.style.boxShadow = '0 8px 20px rgba(15, 23, 42, 0.2)';
      el.style.fontSize = '14px';
      el.style.fontWeight = '500';
      el.style.color = '#ffffff';
      el.style.display = 'none';
      el.style.maxWidth = '90vw';
      el.style.textAlign = 'center';
      document.body.appendChild(el);
    }
    if (type === 'success') {
      el.style.background = '#047857';
    } else {
      el.style.background = '#b91c1c';
    }
    el.textContent = message || '';
    el.style.display = 'block';
    clearTimeout(el._lokaliTimer);
    el._lokaliTimer = setTimeout(function () {
      el.style.display = 'none';
    }, 5000);
  }

  function _profilePhotoDisplayUrl(url) {
    if (!url || typeof url !== 'string') return url;
    var s = url.trim();
    // Block javascript:/data: schemes, protocol-relative //host, breakout chars.
    if (!s || /[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s;
    if (s.indexOf('//') === 0) return '';
    // A leading-slash relative path is a legacy Xano-era /vault upload that can
    // no longer resolve (XANO-DECOMM 2026-07-24) — show no photo rather than a
    // broken-host URL. Live rows store full Supabase/Webflow-CDN URLs (above).
    if (s.indexOf('/') === 0) return '';
    return s;
  }

  function _setProfilePhotoPreviewSrc(src) {
    var el = document.getElementById('profile-photo-preview') || document.getElementById('vendor-profile-photo-preview') || document.querySelector('[data-lokali-profile-photo-preview]');
    if (!el || !src || !String(src).trim()) return;
    src = _profilePhotoDisplayUrl(src);
    var img = el.tagName === 'IMG' ? el : el.querySelector('img');
    if (img) {
      img.src = src;
      img.style.display = '';
      img.removeAttribute('hidden');
    }

    if (!img && el.style) {
      el.style.backgroundImage = 'url(' + encodeURI(src) + ')';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.minHeight = el.style.minHeight || '120px';
      el.style.display = el.style.display || 'block';
    }
  }

  function init() {
    _dbg('[ProfilePage] init() called');
    _dbg('[ProfilePage] LokaliAPI available:', !!window.LokaliAPI);
    _dbg('[ProfilePage] LokaliDashboard available:', !!window.LokaliDashboard);
    _dbg('[ProfilePage] Token:', window.LokaliAPI && window.LokaliAPI.getToken ? (window.LokaliAPI.getToken() ? 'present' : 'MISSING') : 'N/A');
    if (!window.LokaliDashboard.requireAuth()) {
      console.warn('[ProfilePage] Auth failed — redirecting to login');
      return;
    }
    window.LokaliDashboard.preventFormSubmit();
    _removeHtml5RequiredFromForm();
    window.LokaliDashboard.disableButton(SAVE_BTN, true);
    _initPhoneField();
    loadData()
      .then(function () {
        _dbg('[ProfilePage] loadData succeeded, _vendor:', JSON.stringify(_vendor).substring(0, 200));
        _dbg('[ProfilePage] business_name:', _vendor && _vendor.business_name);
        _dbg('[ProfilePage] Element #business-name:', document.getElementById('business-name'));
        populateUI();
        _dbg('[ProfilePage] populateUI done, #business-name value:', (document.getElementById('business-name') || {}).value);
        bindEvents();
        setTimeout(function () {
          populateUI();
          _dbg('[ProfilePage] 2nd populateUI done, #business-name value:', (document.getElementById('business-name') || {}).value);
          if (typeof window.initLokaliAutocomplete === 'function') window.initLokaliAutocomplete();
        }, 800);
        if (typeof window.initLokaliAutocomplete === 'function') {
          window.initLokaliAutocomplete();
        }
        window.LokaliDashboard.disableButton(SAVE_BTN, false);
      })
      .catch(function (err) {
        console.error('[ProfilePage] init error:', err);
        window.LokaliDashboard.showError(ERROR_ID);
        window.LokaliDashboard.disableButton(SAVE_BTN, false);
      });
  }

  function _removeHtml5RequiredFromForm() {
    var form = document.querySelector('.w-form form') || document.querySelector('form');
    if (!form) return;
    var inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
    for (var i = 0; i < inputs.length; i++) inputs[i].removeAttribute('required');
  }

  function _initPhoneField() {
    if (typeof window.LokaliPhoneInput === 'undefined') {
      console.warn('[ProfilePage] LokaliPhoneInput not available');
      return;
    }
    _phone = window.LokaliPhoneInput.create('input-phone') || window.LokaliPhoneInput.create('phone');
    if (!_phone) {
      console.warn('[ProfilePage] no element found for #input-phone, #phone, or [data-lokali-phone]');
    }
  }

  function loadData() {
    return Promise.all([
      window.LokaliAPI.vendors.me(),
      window.LokaliAPI.data.categories(),
      window.LokaliAPI.data.locations(),
      // The portfolio cap is plan-derived, and the card bakes it into its copy
      // at injection time — so it has to be known before populateUI() runs.
      // getMyBilling is memoized per page load, so this costs nothing.
      (window.LokaliAPI.plans && window.LokaliAPI.plans.getMyBilling)
        ? window.LokaliAPI.plans.getMyBilling()
        : Promise.resolve(null)
    ]).then(function (results) {
      var vendorRes = results[0];
      var categoriesRes = results[1];
      var locationsRes = results[2];
      var billingRes = results[3];

      // Only trust billing when the call actually succeeded, then cache it for
      // the session: on a transient failure we reuse the last-known-good cap so
      // a hiccup can't lock a paying vendor's gallery mid-session. With no good
      // response at all we fall through to locked, which is correct for free
      // vendors and self-heals for paid ones on the next load. (Same reasoning
      // as the services/products PLAN_CACHE_KEY guard.)
      if (billingRes && !billingRes.error && billingRes.data && billingRes.data.features) {
        var pfCap = billingRes.data.features.max_vendor_photos;
        if (typeof pfCap === 'number' && pfCap >= 0) {
          _PF_MAX = pfCap;
          try { sessionStorage.setItem(_PF_CACHE_KEY, String(pfCap)); } catch (e) {}
        }
      }
      if (_PF_MAX == null) {
        var pfCached = null;
        try { pfCached = sessionStorage.getItem(_PF_CACHE_KEY); } catch (e) {}
        _PF_MAX = pfCached != null ? Number(pfCached) : 0;
      }

      if (vendorRes.error) {
        var errMsg = String(vendorRes.error || '');
        var status = vendorRes.status;
        if (status === 401 || /expired|invalid.*token|unauthorized/i.test(errMsg)) {
          if (window.LokaliAPI && window.LokaliAPI.auth && typeof window.LokaliAPI.auth.clearToken === 'function') {
            window.LokaliAPI.auth.clearToken();
          }
          window.location.href = '/login';
          return new Promise(function () {});
        }
        return Promise.reject(new Error(vendorRes.error));
      }

      var raw = vendorRes.data || {};
      if (Array.isArray(raw) && raw.length > 0) _vendor = raw[0];
      else if (raw && raw.vendor && typeof raw.vendor === 'object') _vendor = raw.vendor;
      else _vendor = raw && typeof raw === 'object' ? raw : {};

      if (!categoriesRes.error && categoriesRes.data != null) {
        var raw = categoriesRes.data;
        _categories = Array.isArray(raw) ? raw : (raw.records || raw.items || raw.data || raw.categories || raw.response || []);
      } else {
        _categories = [];
      }

      if (!locationsRes.error && locationsRes.data != null) {
        _locations = _parseLocationsArray(locationsRes.data);
      } else {
        _locations = [];
      }

      _selectedLocationIds = [];
      if (_vendor && _vendor.locations_id != null) {
        var raw = Array.isArray(_vendor.locations_id) ? _vendor.locations_id : [_vendor.locations_id];
        raw.forEach(function (id) {
          var n = parseInt(id, 10);
          if (!isNaN(n)) _selectedLocationIds.push(n);
        });
      }
    });
  }

  function _v(key) {
    if (!_vendor) return '';
    var keys = Array.prototype.slice.call(arguments);
    for (var i = 0; i < keys.length; i++) {
      var v = _vendor[keys[i]];
      if (v != null && v !== '') return v;
    }
    return '';
  }

  function _setTextValueAnyId(ids, value) {
    var str = value != null ? String(value) : '';
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      var input = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el : (el.querySelector && (el.querySelector('input') || el.querySelector('textarea')));
      if (input) {
        input.value = str;
        // Notify native listeners (e.g. Webflow's character counter) that the
        // value changed — programmatic `.value =` doesn't fire input on its own.
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        return;
      }
    }
  }

  function _getValueByAnyId(ids) {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      var input = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el : (el.querySelector && (el.querySelector('input') || el.querySelector('textarea')));
      if (input && input.value != null) return String(input.value).trim();
    }
    return '';
  }

  // The Webflow form has no native inputs for payment handles, so we build a
  // "Payment Links" card that matches the other form sections (Business
  // Information / About Your Business) and drop it in right below the card that
  // holds the website/Instagram links. Idempotent.
  var _PAY_FIELDS = [
    { id: 'input-venmo',         label: 'Venmo username',      ph: 'eg. your-venmo-name (no @)' },
    { id: 'input-cashapp',       label: 'Cash App $Cashtag',   ph: 'eg. yourcashtag (no $)' },
    { id: 'input-paypal',        label: 'PayPal.Me',           ph: 'eg. yourpaypalname' },
    { id: 'input-zelle',         label: 'Zelle (email or U.S. mobile)', ph: 'eg. you@business.com' },
    { id: 'input-otherpay-url',  label: 'Other payment link',  ph: 'https://…' },
    { id: 'input-otherpay-label', label: 'Label for the link (optional)', ph: 'eg. Buy Me a Coffee' }
  ];
  // Font Awesome "dollar-sign" glyph as inline SVG — FA isn't loaded on the page,
  // and the other card icons are purple PNGs. Fill #6002EE (sampled from the
  // live .heading-icon) so it matches their colour exactly; the .heading-icon
  // class gives it the same size + purple badge as the others.
  var _PAY_ICON = '<svg class="heading-icon purple" width="25" height="25" viewBox="0 0 640 640" fill="#6002EE" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M296 88C296 74.7 306.7 64 320 64C333.3 64 344 74.7 344 88L344 128L400 128C417.7 128 432 142.3 432 160C432 177.7 417.7 192 400 192L285.1 192C260.2 192 240 212.2 240 237.1C240 259.6 256.5 278.6 278.7 281.8L370.3 294.9C424.1 302.6 464 348.6 464 402.9C464 463.2 415.1 512 354.9 512L344 512L344 552C344 565.3 333.3 576 320 576C306.7 576 296 565.3 296 552L296 512L224 512C206.3 512 192 497.7 192 480C192 462.3 206.3 448 224 448L354.9 448C379.8 448 400 427.8 400 402.9C400 380.4 383.5 361.4 361.3 358.2L269.7 345.1C215.9 337.5 176 291.4 176 237.1C176 176.9 224.9 128 285.1 128L296 128L296 88z"/></svg>';
  function _injectPaymentFields() {
    if (document.getElementById('lok-pay-card')) return; // already injected
    var anchor = document.getElementById('input-instagram') || document.getElementById('website');
    if (!anchor) return;
    var anchorSection = anchor.closest && (anchor.closest('section') || anchor.closest('.section-12'));
    if (!anchorSection || !anchorSection.parentNode) return;

    var section = document.createElement('section');
    section.className = 'section-12';
    section.id = 'lok-pay-card';

    var head = document.createElement('div');
    head.className = 'form-heading-div';
    head.innerHTML = _PAY_ICON + '<div class="section-heading">Payment Links</div>';
    section.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'w-layout-grid grid';
    var col = document.createElement('div');
    col.className = 'div-block-47';

    var sub = document.createElement('div');
    sub.className = 'input-heading';
    sub.textContent = 'Let customers pay you directly — enter just your username and we build the link.';
    sub.style.fontWeight = '400';
    sub.style.opacity = '.7';
    sub.style.marginBottom = '6px';
    col.appendChild(sub);

    _PAY_FIELDS.forEach(function (f) {
      var h = document.createElement('div');
      h.className = 'input-heading';
      h.textContent = f.label;
      var inp = document.createElement('input');
      inp.className = 'input-field w-input';
      inp.setAttribute('maxlength', '256');
      inp.type = 'text';
      inp.id = f.id;
      inp.placeholder = f.ph;
      inp.autocomplete = 'off';
      col.appendChild(h);
      col.appendChild(inp);
    });
    grid.appendChild(col);
    section.appendChild(grid);

    if (anchorSection.nextSibling) anchorSection.parentNode.insertBefore(section, anchorSection.nextSibling);
    else anchorSection.parentNode.appendChild(section);
  }

  // ---- unsaved-changes guard ----------------------------------------------
  // Portfolio photos and photo uploads persist INSTANTLY, but every text
  // field/checkbox needs the SAVE button — an easy trap (typed a bio, uploaded
  // photos, left the page: photos kept, bio silently lost — hit 2026-07-19).
  // Warn before leaving with unsaved edits.
  var _dirty = false;
  var _populating = false;
  function _bindDirtyGuard() {
    if (window.__lokDirtyGuard) return;
    window.__lokDirtyGuard = true;
    function mark(e) {
      if (_populating) return;
      var t = e.target;
      if (!t || t.type === 'file') return; // file pickers auto-save (photos)
      var tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') _dirty = true;
    }
    document.addEventListener('input', mark, true);
    document.addEventListener('change', mark, true);
    window.addEventListener('beforeunload', function (e) {
      if (!_dirty) return;
      e.preventDefault();
      e.returnValue = ''; // any truthy value triggers the browser's leave prompt
    });
  }

  // ---- #76 Meet the Vendor ("About you") + call checkbox + portfolio -------
  var _uploadedOwnerPhotoUrl = null;
  // FA circle-user, purple, matching the other card icons.
  var _MEET_ICON = '<svg class="heading-icon purple" width="25" height="25" viewBox="0 0 640 640" fill="#6002EE" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64zM320 128C363.1 128 398 162.9 398 206C398 249.1 363.1 284 320 284C276.9 284 242 249.1 242 206C242 162.9 276.9 128 320 128zM320 512C264.3 512 214.3 488.3 179.3 450.5C190.5 400.6 235.1 364 288 364L352 364C404.9 364 449.5 400.6 460.7 450.5C425.7 488.3 375.7 512 320 512z"/></svg>';
  var _PF_ICON = '<svg class="heading-icon purple" width="25" height="25" viewBox="0 0 640 640" fill="#6002EE" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M96 128C78.3 128 64 142.3 64 160L64 480C64 497.7 78.3 512 96 512L544 512C561.7 512 576 497.7 576 480L576 160C576 142.3 561.7 128 544 128L96 128zM128 192L512 192L512 380L420 288C407.5 275.5 387.2 275.5 374.7 288L272 390.6L233.4 352C220.9 339.5 200.6 339.5 188.1 352L128 412.1L128 192zM208 224A40 40 0 1 1 208 304A40 40 0 1 1 208 224z"/></svg>';

  function _mkCard(id, iconHtml, title, subText) {
    var section = document.createElement('section');
    section.className = 'section-12';
    section.id = id;
    var head = document.createElement('div');
    head.className = 'form-heading-div';
    head.innerHTML = iconHtml + '<div class="section-heading">' + title + '</div>';
    section.appendChild(head);
    var grid = document.createElement('div');
    grid.className = 'w-layout-grid grid';
    var col = document.createElement('div');
    col.className = 'div-block-47';
    if (subText) {
      var sub = document.createElement('div');
      sub.className = 'input-heading';
      sub.textContent = subText;
      sub.style.fontWeight = '400';
      sub.style.opacity = '.7';
      sub.style.marginBottom = '6px';
      sub.style.lineHeight = '1.5';
      col.appendChild(sub);
    }
    grid.appendChild(col);
    section.appendChild(grid);
    return { section: section, col: col };
  }
  function _mkLabeledInput(col, id, label, ph, textarea) {
    var h = document.createElement('div');
    h.className = 'input-heading';
    h.textContent = label;
    var inp = document.createElement(textarea ? 'textarea' : 'input');
    inp.className = textarea ? 'input-field text-area w-input' : 'input-field w-input';
    if (!textarea) { inp.type = 'text'; inp.setAttribute('maxlength', '256'); }
    else { inp.setAttribute('maxlength', '1200'); inp.rows = 4; }
    inp.id = id;
    inp.placeholder = ph;
    inp.autocomplete = 'off';
    col.appendChild(h);
    col.appendChild(inp);
    return inp;
  }

  // On-brand pill button for injected upload actions (the Webflow w-button
  // renders as the default blue box — never use it for injected UI).
  var _BRAND_BTN_CSS = 'display:inline-block;background:#fff;border:1px solid #D4AAFD;color:#6002EE;border-radius:10px;padding:10px 16px;font:600 14px "Plus Jakarta Sans",sans-serif;cursor:pointer;text-decoration:none;transition:background .12s,border-color .12s;';
  function _brandBtn(label) {
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = label;
    a.style.cssText = _BRAND_BTN_CSS;
    a.addEventListener('mouseenter', function () { a.style.background = '#F3EBFF'; a.style.borderColor = '#6002EE'; });
    a.addEventListener('mouseleave', function () { a.style.background = '#fff'; a.style.borderColor = '#D4AAFD'; });
    return a;
  }

  // Feedback 2026-08-13 (Francesca): an explicit ✕ so mobile readers can
  // dismiss a popover when done (tap-outside still works too). Standalone so
  // panels whose content gets rebuilt (_polishLogoSection) can re-add it.
  function _popCloseX(pop) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Close');
    b.textContent = '✕';
    b.style.cssText = 'position:absolute;top:8px;right:8px;width:22px;height:22px;border:none;background:transparent;color:#8E8BA6;font-size:12px;cursor:pointer;padding:0;line-height:1;font-family:inherit;';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); pop.style.display = 'none'; });
    pop.appendChild(b);
  }

  // Circled glyph ("i" / "?") in brand violet — hover or click opens a small
  // popover. popHtml is STATIC markup only (never user data).
  function _infoPopover(glyph, ariaLabel, popHtml) {
    var wrap = document.createElement('span');
    wrap.className = 'lok-info-wrap';
    wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;margin-left:8px;vertical-align:middle;';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', ariaLabel);
    btn.style.cssText = 'width:22px;height:22px;border-radius:50%;border:1.5px solid #6002EE;background:#fff;color:#6002EE;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;font-family:"Plus Jakarta Sans",sans-serif;font-weight:700;font-size:12px;line-height:1;';
    btn.textContent = glyph;
    var pop = document.createElement('div');
    pop.style.cssText = 'position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);z-index:60;width:min(250px,calc(100vw - 32px));background:#fff;border:1px solid #EEEDF6;border-radius:12px;box-shadow:0 10px 30px rgba(26,24,41,.15);padding:14px 30px 14px 14px;display:none;font-family:"Plus Jakarta Sans",sans-serif;text-align:left;text-transform:none;';
    pop.innerHTML = popHtml;
    _popCloseX(pop);
    wrap.appendChild(btn);
    wrap.appendChild(pop);
    var over = false;
    function showPop(on) {
      pop.style.display = on ? 'block' : 'none';
      if (!on) return;
      // Clamp inside the viewport — centered under an icon near the right
      // edge, the panel otherwise hangs off-screen on phones. showPop owns
      // positioning: reset to centered, measure, then shift into frame.
      pop.style.left = '50%';
      pop.style.transform = 'translateX(-50%)';
      var r = pop.getBoundingClientRect();
      var pad = 12;
      var shift = 0;
      if (r.right > window.innerWidth - pad) shift = (window.innerWidth - pad) - r.right;
      else if (r.left < pad) shift = pad - r.left;
      if (shift) pop.style.transform = 'translateX(calc(-50% + ' + Math.round(shift) + 'px))';
    }
    wrap.addEventListener('mouseenter', function () { over = true; showPop(true); });
    wrap.addEventListener('mouseleave', function () { over = false; setTimeout(function () { if (!over) showPop(false); }, 150); });
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); showPop(pop.style.display === 'none'); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) showPop(false); });
    return wrap;
  }
  function _photoInfoIcon() {
    return _infoPopover('i', 'Photo guidelines',
      '<div style="font-weight:700;font-size:13px;color:#1A1829;margin-bottom:6px;">Photo guidelines</div>' +
      '<div style="font-size:12.5px;color:#565170;line-height:1.6;">JPG, PNG or WEBP &middot; under 5&nbsp;MB<br>Square, at least 500&nbsp;px (1000&times;1000 ideal)<br>Bright and clear, no text overlays</div>' +
      '<a href="/vendor-resources/profile-photo-guide" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-weight:700;font-size:12.5px;color:#6002EE;text-decoration:none;">Read the full guide &rarr;</a>');
  }

  // "Public Email" -> "Business Email" + circled-? explaining where messages
  // land (backed by patch_notify_business_email.sql: inquiry/review emails go
  // here when filled, login email otherwise).
  function _polishEmailField() {
    var input = document.getElementById('input-contact-email') || document.getElementById('contact-email') ||
                document.getElementById('contact_email') || document.getElementById('public_email');
    if (!input) return;
    var h = input.previousElementSibling;
    if (h && /public\s*email|business\s*email/i.test(h.textContent || '') && !h.querySelector('.lok-info-wrap')) {
      h.textContent = 'Business Email';
      h.style.display = 'flex';
      h.style.alignItems = 'center';
      h.appendChild(_infoPopover('?', 'About Business Email',
        '<div style="font-weight:700;font-size:13px;color:#1A1829;margin-bottom:6px;">Business Email</div>' +
        '<div style="font-size:12.5px;color:#565170;line-height:1.6;">Every message a customer sends from the <b>&ldquo;Send a message&rdquo;</b> button on your page is emailed here (and it’s also saved in your Leads). Leave it empty and messages go to your login email instead.</div>'));
    }
  }

  // Rename the Webflow "Profile photo" section to "Upload your logo" and give
  // it the guidelines info icon (Francesca 2026-07-18: the round image on the
  // public page is the business logo; the personal photo lives in Meet the
  // Vendor below). 2026-07-18 follow-up: the page's big inline guide card
  // (.photo-tip-card) MOVES INTO the popover — same look, no page space; a
  // "Read the full guide" link is appended under it. Click works on mobile.
  function _polishLogoSection() {
    var heads = document.querySelectorAll('.section-heading');
    for (var i = 0; i < heads.length; i++) {
      if (/^\s*Profile photo\s*$/i.test(heads[i].textContent || '')) {
        heads[i].textContent = 'Upload your logo';
        if (heads[i].parentNode && !heads[i].parentNode.querySelector('.lok-info-wrap')) {
          var icon = _photoInfoIcon();
          var sec = heads[i].closest ? heads[i].closest('section') : null;
          var tip = sec && sec.querySelector('.photo-tip-card');
          if (tip) {
            var pop = icon.querySelector('div'); // the popover panel
            pop.innerHTML = ''; // wipes the ✕ too — re-added below
            pop.style.width = 'min(440px, 88vw)';
            // (no manual left/transform anchoring — showPop clamps on open)
            tip.style.margin = '0';
            tip.style.maxWidth = '100%';
            tip.style.border = 'none';
            tip.style.boxShadow = 'none';
            tip.style.padding = '0';
            pop.appendChild(tip);
            var full = document.createElement('a');
            full.href = '/vendor-resources/profile-photo-guide';
            full.target = '_blank';
            full.rel = 'noopener';
            full.textContent = 'Read the full guide →';
            full.style.cssText = 'display:inline-block;margin-top:10px;font-weight:700;font-size:12.5px;color:#6002EE;text-decoration:none;font-family:"Plus Jakarta Sans",sans-serif;';
            pop.appendChild(full);
            _popCloseX(pop);
          }
          heads[i].parentNode.appendChild(icon);
        }
        break;
      }
    }
  }

  function _injectAboutYouCard() {
    if (document.getElementById('lok-about-you')) return;
    var anchorSection = document.getElementById('lok-pay-card');
    if (!anchorSection || !anchorSection.parentNode) return;
    var card = _mkCard('lok-about-you', _MEET_ICON, 'Meet the Vendor',
      'Optional, but personal sells: fill this in and your public page shows a "Meet the vendor" section with your photo and story. Leave it empty and the section simply doesn’t appear.');
    // personal photo (separate from the business logo)
    var phHead = document.createElement('div');
    phHead.className = 'input-heading';
    phHead.style.cssText = 'display:flex;align-items:center;';
    phHead.appendChild(document.createTextNode('Your photo'));
    phHead.appendChild(_photoInfoIcon());
    card.col.appendChild(phHead);
    var ph = document.createElement('div');
    ph.style.cssText = 'display:flex;align-items:center;gap:14px;margin:8px 0 12px;';
    var prev = document.createElement('img');
    prev.id = 'lok-owner-photo-preview';
    prev.alt = '';
    prev.style.cssText = 'width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid #EEEDF6;display:none;';
    var pick = _brandBtn('Upload your photo');
    var file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.id = 'lok-owner-photo-file';
    file.style.display = 'none';
    pick.addEventListener('click', function (e) { e.preventDefault(); file.click(); });
    ph.appendChild(prev); ph.appendChild(pick); ph.appendChild(file);
    card.col.appendChild(ph);
    _mkLabeledInput(card.col, 'input-owner-name', 'Your first name', 'eg. Francesca');
    _mkLabeledInput(card.col, 'input-owner-bio', 'About you — a short personal intro', 'eg. Hi, I’m Francesca! I started this because…', true);
    _mkLabeledInput(card.col, 'input-owner-languages', 'Languages you speak', 'eg. English, Spanish');
    anchorSection.parentNode.insertBefore(card.section, anchorSection.nextSibling);

    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f || f.type.indexOf('image/') !== 0 || !_vendor || _vendor.id == null) { file.value = ''; return; }
      var S = window.LokaliSupabaseAPI;
      if (!S || !S.storage || !S.storage.uploadImage) return;
      var objectUrl = URL.createObjectURL(f);
      prev.src = objectUrl; prev.style.display = '';
      S.storage.uploadImage(_vendor.id, 'owner', f).then(function (res) {
        URL.revokeObjectURL(objectUrl);
        if (res.error || !res.data || !res.data.url) {
          console.error('[ProfilePage] owner photo upload error:', res.error);
          prev.style.display = _vendor.owner_photo ? '' : 'none';
          if (_vendor.owner_photo) prev.src = _vendor.owner_photo;
          return;
        }
        _uploadedOwnerPhotoUrl = res.data.url;
        prev.src = res.data.url; prev.style.display = '';
        // Unlike the logo/portfolio, the owner photo only reaches the vendor
        // row via save() — flag it dirty (the guard skips file inputs) and
        // tell the vendor, or the photo is silently lost on leave.
        _dirty = true;
        _showToast('success', 'Photo added — press SAVE to keep it.');
      });
    });
  }

  // "Can customers call you?" — cloned from the WhatsApp checkbox row so the
  // markup/styling matches the Webflow originals exactly.
  function _injectPhoneCallsCheckbox() {
    if (document.getElementById('checkbox-phone-calls')) return;
    var wa = document.getElementById('checkbox-whatsapp');
    if (!wa) return;
    var row = (wa.closest && (wa.closest('label') || wa.closest('.w-checkbox'))) || wa.parentNode;
    if (!row || !row.parentNode) return;
    var clone = row.cloneNode(true);
    var inp = clone.querySelector('input[type="checkbox"]');
    if (!inp) return;
    inp.id = 'checkbox-phone-calls';
    inp.name = 'checkbox-phone-calls';
    inp.checked = true; // default matches the DB default (existing behavior)
    var vis = clone.querySelector('.w-checkbox-input');
    if (vis) vis.classList.remove('w--redirected-checked');
    // relabel: last text-bearing span/label in the row
    var labels = clone.querySelectorAll('span, .w-form-label');
    var lbl = labels.length ? labels[labels.length - 1] : null;
    if (lbl) lbl.textContent = 'Customers can call me';
    if (clone.tagName === 'LABEL' && clone.htmlFor) clone.htmlFor = 'checkbox-phone-calls';
    row.parentNode.insertBefore(clone, row.nextSibling);
  }

  // #76b — Instagram funnels audience OFF Lokali: remove the input (the saved
  // value is preserved untouched; the public page no longer renders it).
  function _hideInstagramField() {
    var ig = document.getElementById('input-instagram') || document.getElementById('instagram');
    if (!ig) return;
    ig.style.display = 'none';
    var h = ig.previousElementSibling;
    if (h && /instagram/i.test(h.textContent || '')) h.style.display = 'none';
  }

  // ---- #76 page flow: storefront header + sticky jump-nav + reorder --------
  // The profile page had grown into one long mixed list. Reorder the sections
  // to mirror the PUBLIC page top-to-bottom (photos -> logo -> business info ->
  // meet the vendor -> payments), topped with a "Your storefront page" header,
  // a View-my-storefront button, and a sticky jump-nav. Sections are moved
  // whole within their existing container (same form), so nothing re-mounts.
  function _reorderProfileSections() {
    if (document.getElementById('lok-profile-nav')) return;
    var nameInput = document.getElementById('input-business-name') || document.getElementById('business-name');
    var biz = nameInput && nameInput.closest ? nameInput.closest('section') : null;
    if (!biz || !biz.parentNode) return;
    var container = biz.parentNode;
    function sectionByHeading(re) {
      var heads = document.querySelectorAll('.section-heading');
      for (var i = 0; i < heads.length; i++) {
        if (re.test(heads[i].textContent || '')) {
          return heads[i].closest ? heads[i].closest('section') : null;
        }
      }
      return null;
    }
    var logo = sectionByHeading(/upload your logo|profile photo/i);
    var aboutBiz = sectionByHeading(/about your business/i);
    var catsLocs = sectionByHeading(/categories\s*&\s*locations/i);
    var portfolio = document.getElementById('lok-portfolio-card');
    var aboutYou = document.getElementById('lok-about-you');
    var pay = document.getElementById('lok-pay-card');

    var head = document.createElement('div');
    head.id = 'lok-profile-head';
    head.style.cssText = 'font-family:"Plus Jakarta Sans",sans-serif;margin:0 0 4px;';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px;';
    var t = document.createElement('div');
    t.style.cssText = 'font-weight:700;font-size:18px;color:#1A1829;';
    t.textContent = 'Your storefront page';
    row.appendChild(t);
    if (_vendor && _vendor.slug) {
      var view = document.createElement('a');
      view.href = '/' + _vendor.slug;
      view.target = '_blank';
      view.rel = 'noopener';
      view.textContent = 'View my storefront →';
      // soft violet, NOT solid brand — the solid one clashed with SAVE (Francesca 2026-07-19)
      view.style.cssText = 'display:inline-block;background:#F3EBFF;color:#6002EE;border-radius:10px;padding:10px 16px;font:600 14px "Plus Jakarta Sans",sans-serif;text-decoration:none;transition:background .12s;';
      view.addEventListener('mouseenter', function () { view.style.background = '#E9DCFF'; });
      view.addEventListener('mouseleave', function () { view.style.background = '#F3EBFF'; });
      row.appendChild(view);
    }
    head.appendChild(row);
    var sub = document.createElement('div');
    sub.style.cssText = 'font-size:13px;line-height:1.5;color:#6B6880;margin-bottom:6px;';
    sub.textContent = 'Everything below builds your public page — in the same order customers see it.';
    head.appendChild(sub);
    // Feedback 2026-08-13: two save models coexist on this page (photos persist
    // instantly, text needs SAVE) and nothing said so — spell it out up front.
    var saveHint = document.createElement('div');
    saveHint.style.cssText = 'font-size:13px;line-height:1.5;color:#6B6880;margin-bottom:6px;';
    saveHint.textContent = 'Photos save automatically the moment you add them — everything else saves when you press SAVE.';
    head.appendChild(saveHint);

    var nav = document.createElement('div');
    nav.id = 'lok-profile-nav';
    // Feedback 2026-08-13 (Francesca): no white bar — sit on the page's snow
    // background (it still masks content while stuck) and make each stop a
    // quiet neutral pill button that doesn't compete with the cards.
    nav.style.cssText = 'position:sticky;top:0;z-index:40;background:#F7F6FC;display:flex;gap:8px;overflow-x:auto;padding:10px 2px;margin-bottom:8px;font-family:"Plus Jakarta Sans",sans-serif;-webkit-overflow-scrolling:touch;';
    [
      ['lok-portfolio-card', 'Gallery', portfolio],
      ['lok-sec-logo', 'Logo', logo],
      ['lok-sec-business', 'Business info', biz],
      ['lok-about-you', 'Meet the vendor', aboutYou],
      ['lok-pay-card', 'Payments', pay]
    ].forEach(function (it) {
      var sec = it[2];
      if (!sec) return;
      if (!sec.id) sec.id = it[0];
      sec.style.scrollMarginTop = '64px';
      var a = document.createElement('a');
      a.href = '#' + sec.id;
      a.textContent = it[1];
      a.style.cssText = 'flex:0 0 auto;padding:8px 14px;font-weight:600;font-size:13px;color:#5A5570;text-decoration:none;background:#fff;border:1px solid #E4DFF6;border-radius:999px;white-space:nowrap;transition:border-color .12s,color .12s;';
      a.addEventListener('click', function (e) { e.preventDefault(); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      a.addEventListener('mouseenter', function () { a.style.color = '#1A1829'; a.style.borderColor = '#C9BDE8'; });
      a.addEventListener('mouseleave', function () { a.style.color = '#5A5570'; a.style.borderColor = '#E4DFF6'; });
      nav.appendChild(a);
    });

    container.insertBefore(head, biz);
    container.insertBefore(nav, biz);
    var cursor = nav;
    // Mirror the public page: photos -> logo -> the business (info, story,
    // where) -> the person -> payments. About-Your-Business and
    // Categories & Locations ride under the "Business info" nav stop.
    [portfolio, logo, biz, aboutBiz, catsLocs, aboutYou, pay].forEach(function (sec) {
      if (!sec) return;
      container.insertBefore(sec, cursor.nextSibling);
      cursor = sec;
    });

    // Feedback 2026-08-13 (Francesca): SAVE belongs under the descriptions,
    // right above the first card — not up in the page header where it scrolls
    // away from the fields it saves. Move the existing button (same node, so
    // the id lookup in bindEvents and disable states keep working).
    var topSave = document.getElementById(SAVE_BTN);
    if (topSave) {
      var saveRow = document.createElement('div');
      saveRow.id = 'lok-save-row';
      saveRow.style.cssText = 'display:flex;justify-content:flex-start;margin:2px 0 14px;';
      topSave.style.cursor = 'pointer';
      saveRow.appendChild(topSave);
      container.insertBefore(saveRow, nav.nextSibling);
    }
  }

  // ---- #76d portfolio manager ---------------------------------------------
  // The cap is a plan entitlement: plan.max_vendor_photos, Free 0 / Pro 5 /
  // Featured 15 (enforced by the trigger at fn_limits.sql:159). null = not yet
  // resolved; loadData() fills it from billing.
  var _PF_MAX = null;
  var _PF_CACHE_KEY = 'lok_plan_portfolio_v1';
  // #117-MIN: the SAME strict parser listings use (copied from
  // lokali-vendor-detail.js) — renderers embed only the reconstructed id,
  // never the stored URL.
  function _pfParseVideo(url) {
    var u;
    try { u = new URL(String(url || '').trim()); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    var host = u.hostname.replace(/^www\./, '').toLowerCase();
    var YT = /^[A-Za-z0-9_-]{11}$/;
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      var v = u.searchParams.get('v');
      if (v && YT.test(v)) return { host: 'youtube', id: v };
      var m = u.pathname.match(/^\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
      return m ? { host: 'youtube', id: m[1] } : null;
    }
    if (host === 'youtu.be') {
      var m2 = u.pathname.match(/^\/([A-Za-z0-9_-]{11})/);
      return m2 ? { host: 'youtube', id: m2[1] } : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      var m3 = u.pathname.match(/\/(?:video\/)?(\d{6,12})(?:$|[/?#])/);
      return m3 ? { host: 'vimeo', id: m3[1] } : null;
    }
    return null;
  }
  var _pfPhotos = [];
  // #149b WYSIWYG (Francesca 2026-08-19: the listing forms' preview "makes it
  // clear now" — same treatment here). One shared card-shaped preview under
  // the thumbs shows how the ACTIVE photo crops inside the storefront's
  // portfolio frames; pressing any thumb makes it active; dragging the thumb
  // or the preview moves both, and the row saves once on release.
  var _pfActive = 0;
  function _pfPaintPreview() {
    var im = document.getElementById('lok-pf-cover-preview');
    var lab = document.getElementById('lok-pf-preview-label');
    var ph = _pfPhotos[_pfActive];
    var wrap0 = document.getElementById('lok-pf-preview-wrap');
    // #117-MIN: a VIDEO row has no crop to choose — the embed player is not
    // object-fit-cropped. Hide the preview while a video is the active tile.
    if (ph && ph.video_url && !ph.image_url) { if (wrap0) wrap0.style.display = 'none'; return; }
    if (wrap0) wrap0.style.display = '';
    if (!im || !ph) return;
    if (im.src !== ph.image_url) im.src = ph.image_url;
    im.style.objectPosition = (ph.image_focus_x != null && ph.image_focus_y != null)
      ? (ph.image_focus_x + '% ' + ph.image_focus_y + '%') : 'center';
    if (lab) lab.textContent = 'How photo ' + (_pfActive + 1) + ' of ' + _pfPhotos.length +
      ' will appear on your storefront \u2014 drag it to adjust';
    // the active thumb mirrors the same position
    var thumbs = document.querySelectorAll('img[data-pf-idx]');
    thumbs.forEach(function (t) {
      var idx = parseInt(t.getAttribute('data-pf-idx'), 10);
      var row = _pfPhotos[idx];
      if (row) t.style.objectPosition = (row.image_focus_x != null && row.image_focus_y != null)
        ? (row.image_focus_x + '% ' + row.image_focus_y + '%') : 'center';
      t.style.outline = idx === _pfActive ? '2px solid #6002EE' : 'none';
    });
  }
  function _pfWireDrag(imEl, idx) {
    imEl.setAttribute('data-pf-idx', String(idx));
    imEl.style.touchAction = 'none';
    imEl.style.cursor = 'grab';
    imEl.title = 'Drag to choose which part of the photo stays in view';
    var dragging = false, moved = false;
    function row() { return _pfPhotos[typeof idx === 'number' ? (idx === -1 ? _pfActive : idx) : _pfActive]; }
    function setFrom(e) {
      var r = imEl.getBoundingClientRect();
      var ph = row();
      if (!r.width || !r.height || !ph) return;
      ph.image_focus_x = Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
      ph.image_focus_y = Math.max(0, Math.min(100, Math.round(((e.clientY - r.top) / r.height) * 100)));
      moved = true;
      _pfPaintPreview();
    }
    imEl.addEventListener('pointerdown', function (e) {
      if (idx !== -1) _pfActive = idx;   // pressing a thumb selects it
      dragging = true; moved = false;
      try { imEl.setPointerCapture(e.pointerId); } catch (err) {}
      setFrom(e); e.preventDefault();
    });
    imEl.addEventListener('pointermove', function (e) { if (dragging) setFrom(e); });
    function done() {
      if (!dragging) return;
      dragging = false;
      var ph = row();
      if (!moved || !ph) { _pfPaintPreview(); return; }
      window.LokaliSupabaseAPI.photos.setFocus('vendor', ph.id, ph.image_focus_x, ph.image_focus_y).then(function (res2) {
        if (res2 && res2.error) { _showToast('error', 'Couldn\u2019t save the crop \u2014 try again.'); return; }
        _showToast('success', 'Crop saved \u2014 your storefront uses it right away.');
      });
    }
    imEl.addEventListener('pointerup', done);
    imEl.addEventListener('pointercancel', function () { dragging = false; });
  }
  function _injectPortfolioCard() {
    if (document.getElementById('lok-portfolio-card')) return;
    var anchorSection = document.getElementById('lok-about-you') || document.getElementById('lok-pay-card');
    if (!anchorSection || !anchorSection.parentNode) return;

    // Free has no gallery at all, so show a locked upsell rather than an upload
    // UI whose every insert the SQL trigger would reject. Same shape as the
    // services/products gallery lockout.
    if (!(_PF_MAX > 0)) {
      var locked = _mkCard('lok-portfolio-card', _PF_ICON, 'Portfolio Gallery',
        '🔒 The gallery at the top of your public page is a Pro & Featured feature — 5 items on Pro, 15 on Featured. It is the first thing a customer sees.');
      var seePlans = document.createElement('a');
      seePlans.href = '/pricing';
      seePlans.textContent = 'See plans →';
      seePlans.style.cssText = 'display:inline-block;font:600 13px/1 "Plus Jakarta Sans",sans-serif;color:#6002EE;text-decoration:none;margin-top:2px;';
      locked.col.appendChild(seePlans);
      anchorSection.parentNode.insertBefore(locked.section, anchorSection.nextSibling);
      return;
    }

    var card = _mkCard('lok-portfolio-card', _PF_ICON, 'Portfolio Gallery',
      'Up to ' + _PF_MAX + ' photos and videos — they become the big gallery at the top of your public page. First item = the lead.');
    var strip = document.createElement('div');
    strip.id = 'lok-pf-strip';
    strip.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin:10px 0;';
    card.col.appendChild(strip);
    var pick = _brandBtn('Add photo');
    pick.id = 'lok-pf-add';
    var file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.id = 'lok-pf-file';
    file.style.display = 'none';
    pick.addEventListener('click', function (e) { e.preventDefault(); file.click(); });
    // "line up the add photo and add video" (Francesca 2026-08-21): one flex
    // row, equal halves — the card column stretches lone children full-width,
    // which is why they stacked with a stray indent before.
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';
    pick.style.flex = '1';
    pick.style.textAlign = 'center';
    btnRow.appendChild(pick);
    card.col.appendChild(btnRow);
    // #117-MIN: video joins the gallery — paste a YouTube/Vimeo link. Renders
    // in the storefront strip as a muted looping tile; a video uses one of the
    // same photo slots, so the cap needs no new machinery.
    var vidBtn = _brandBtn('Add video');
    vidBtn.id = 'lok-pf-addvideo';
    vidBtn.style.flex = '1';
    vidBtn.style.textAlign = 'center';
    var vidRow = document.createElement('div');
    vidRow.id = 'lok-pf-vidrow';
    vidRow.style.cssText = 'display:none;gap:6px;margin-top:8px;white-space:normal;';
    vidRow.innerHTML =
      '<input id="lok-pf-vidurl" type="url" inputmode="url" autocomplete="off" spellcheck="false" ' +
        'placeholder="Paste a YouTube or Vimeo link" ' +
        'style="flex:1;min-width:0;font-family:\'Plus Jakarta Sans\',sans-serif;font-size:16px;padding:9px 12px;border:1px solid #E6E4F0;border-radius:10px;color:#1A1829;background:#fff;">' +
      '<button type="button" id="lok-pf-vidsave" style="font:600 13px/1 \'Plus Jakarta Sans\',sans-serif;padding:9px 16px;border-radius:10px;border:1px solid #6002EE;background:#6002EE;color:#fff;cursor:pointer;">Add</button>';
    vidBtn.addEventListener('click', function (e) {
      e.preventDefault();
      vidRow.style.display = vidRow.style.display === 'none' ? 'flex' : 'none';
      var inp0 = document.getElementById('lok-pf-vidurl');
      if (vidRow.style.display === 'flex' && inp0) inp0.focus();
    });
    btnRow.appendChild(vidBtn);
    card.col.appendChild(vidRow);
    var vidHint = document.createElement('p');
    vidHint.id = 'lok-pf-vidhint';
    vidHint.style.cssText = 'font:400 12px/1.5 "Plus Jakarta Sans",sans-serif;color:#8E8BA6;margin:6px 0 0;white-space:normal;display:none;';
    card.col.appendChild(vidHint);
    function vidSay(msg, bad) {
      vidHint.textContent = msg; vidHint.style.display = msg ? 'block' : 'none';
      vidHint.style.color = bad ? '#B1006A' : '#8E8BA6';
    }
    vidRow.addEventListener('click', function (ev) {
      if (!ev.target || ev.target.id !== 'lok-pf-vidsave') return;
      var inp = document.getElementById('lok-pf-vidurl');
      var url = inp ? String(inp.value || '').trim() : '';
      if (!_pfParseVideo(url)) { vidSay('That link doesn\u2019t look like YouTube or Vimeo \u2014 copy the full video address from your browser.', true); return; }
      if (_pfPhotos.length >= _PF_MAX) { vidSay('Your gallery is full \u2014 a video uses one of your ' + _PF_MAX + ' slots.', true); return; }
      var S = window.LokaliSupabaseAPI;
      if (!S || !S.photos || !S.photos.addVideo || !_vendor) return;
      var nextSort = _pfPhotos.length ? (Number(_pfPhotos[_pfPhotos.length - 1].sort_order) || _pfPhotos.length) + 1 : 1;
      vidSay('Adding\u2026', false);
      S.photos.addVideo('vendor', _vendor.id, url, nextSort).then(function (res) {
        if (res && res.error) { vidSay('Couldn\u2019t add that video \u2014 try again.', true); return; }
        if (inp) inp.value = '';
        vidRow.style.display = 'none';
        vidSay('', false);
        _renderPortfolio();
        _showToast('success', 'Video added \u2014 it plays silently in your gallery.');
      });
    });
    card.col.appendChild(file);
    anchorSection.parentNode.insertBefore(card.section, anchorSection.nextSibling);

    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      file.value = '';
      if (!f || f.type.indexOf('image/') !== 0 || !_vendor || _vendor.id == null) return;
      if (_pfPhotos.length >= _PF_MAX) return;
      var S = window.LokaliSupabaseAPI;
      if (!S || !S.storage || !S.photos) return;
      pick.textContent = 'Uploading…';
      S.storage.uploadImage(_vendor.id, 'portfolio', f).then(function (res) {
        if (res.error || !res.data || !res.data.url) {
          console.error('[ProfilePage] portfolio upload error:', res.error);
          pick.textContent = 'Add photo';
          return;
        }
        var nextSort = _pfPhotos.length ? (Number(_pfPhotos[_pfPhotos.length - 1].sort_order) || _pfPhotos.length) + 1 : 1;
        S.photos.add('vendor', _vendor.id, res.data.url, nextSort).then(function () {
          pick.textContent = 'Add photo';
          _renderPortfolio();
          _showToast('success', 'Photo added to your gallery — saved automatically.');
        });
      });
    });
  }
  function _renderPortfolio() {
    var strip = document.getElementById('lok-pf-strip');
    var S = window.LokaliSupabaseAPI;
    if (!strip || !S || !S.photos || !_vendor || _vendor.id == null) return;
    S.photos.list('vendor', _vendor.id).then(function (res) {
      var rows = (res && res.data) || [];
      _pfPhotos = rows.filter(function (r) { return r && r.is_active !== false; });
      _pfActive = 0;
      strip.innerHTML = '';
      _pfPhotos.forEach(function (p, i) {
        var cell = document.createElement('div');
        cell.style.cssText = 'position:relative;width:104px;';
        if (p.video_url && !p.image_url) {
          // #117-MIN: video tile. YouTube ids get a real thumbnail (public,
          // predictable URL); Vimeo gets a branded dark tile — its thumbnails
          // need an API call this card does not make.
          var pv = _pfParseVideo(p.video_url);
          var vtile = document.createElement('div');
          vtile.style.cssText = 'position:relative;width:104px;height:78px;border-radius:8px;border:1px solid #EEEDF6;background:#2B1A4A;overflow:hidden;';
          if (pv && pv.host === 'youtube') {
            var vimg = document.createElement('img');
            vimg.src = 'https://i.ytimg.com/vi/' + pv.id + '/hqdefault.jpg';
            vimg.alt = '';
            vimg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;opacity:.85;';
            vtile.appendChild(vimg);
          }
          var badge = document.createElement('div');
          badge.textContent = '\u25B6';
          badge.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;text-shadow:0 1px 6px rgba(0,0,0,.6);';
          vtile.appendChild(badge);
          cell.appendChild(vtile);
          if (i === 0) {
            var lead0 = document.createElement('div');
            lead0.textContent = 'Lead';
            lead0.style.cssText = 'position:absolute;top:4px;left:4px;background:#6002EE;color:#fff;font:600 9px/1 "Plus Jakarta Sans",sans-serif;border-radius:5px;padding:3px 6px;';
            cell.appendChild(lead0);
          }
          var bar0 = document.createElement('div');
          bar0.style.cssText = 'display:flex;justify-content:space-between;margin-top:4px;';
          function mkB(txt, title, fn, disabled) {
            var b = document.createElement('button');
            b.type = 'button'; b.textContent = txt; b.title = title;
            b.style.cssText = 'border:1px solid #EEEDF6;background:#fff;border-radius:6px;font:600 11px/1 "Plus Jakarta Sans",sans-serif;color:#1A1829;padding:4px 7px;cursor:pointer;' + (disabled ? 'opacity:.3;pointer-events:none;' : '');
            b.addEventListener('click', fn);
            return b;
          }
          bar0.appendChild(mkB('\u2039', 'Move left', function () { _pfSwap(i, i - 1); }, i === 0));
          bar0.appendChild(mkB('\u2715', 'Remove video', function () {
            window.LokaliSupabaseAPI.photos.remove('vendor', p.id).then(function () {
              _renderPortfolio();
              _showToast('success', 'Video removed \u2014 saved automatically.');
            });
          }, false));
          bar0.appendChild(mkB('\u203A', 'Move right', function () { _pfSwap(i, i + 1); }, i === _pfPhotos.length - 1));
          cell.appendChild(bar0);
          strip.appendChild(cell);
          return;   // photo path below does not apply
        }
        var img = document.createElement('img');
        img.src = p.image_url; img.alt = '';
        img.style.cssText = 'width:104px;height:78px;object-fit:cover;border-radius:8px;border:1px solid #EEEDF6;display:block;touch-action:none;cursor:grab;';
        // #149b: drag the thumb to set the focal point — the part of the photo
        // that stays in view inside the storefront's cropped portfolio frames.
        // Persisted on RELEASE (one write per drag, not per pixel); reorder is
        // unaffected, it lives on the ‹ › buttons below.
        if (p.image_focus_x != null && p.image_focus_y != null) {
          img.style.objectPosition = p.image_focus_x + '% ' + p.image_focus_y + '%';
        }
        img.title = 'Drag to choose which part of the photo stays in view';
        // The drag lives on the thumb AND on the big WYSIWYG preview below; a
        // press on either makes this photo the active one, both repaint from
        // the row, and the write happens once on release (_pfWireDrag).
        _pfWireDrag(img, i);
        cell.appendChild(img);
        if (i === 0) {
          var lead = document.createElement('div');
          lead.textContent = 'Lead';
          lead.style.cssText = 'position:absolute;top:4px;left:4px;background:#6002EE;color:#fff;font:600 9px/1 "Plus Jakarta Sans",sans-serif;border-radius:5px;padding:3px 6px;';
          cell.appendChild(lead);
        }
        var bar = document.createElement('div');
        bar.style.cssText = 'display:flex;justify-content:space-between;margin-top:4px;';
        function mkBtn(txt, title, fn, disabled) {
          var b = document.createElement('button');
          b.type = 'button'; b.textContent = txt; b.title = title;
          b.style.cssText = 'border:1px solid #EEEDF6;background:#fff;border-radius:6px;font:600 11px/1 "Plus Jakarta Sans",sans-serif;color:#1A1829;padding:4px 7px;cursor:pointer;' + (disabled ? 'opacity:.3;pointer-events:none;' : '');
          b.addEventListener('click', fn);
          return b;
        }
        bar.appendChild(mkBtn('‹', 'Move left', function () { _pfSwap(i, i - 1); }, i === 0));
        bar.appendChild(mkBtn('✕', 'Remove photo', function () {
          window.LokaliSupabaseAPI.photos.remove('vendor', p.id).then(function () {
            _renderPortfolio();
            _showToast('success', 'Photo removed — saved automatically.');
          });
        }, false));
        bar.appendChild(mkBtn('›', 'Move right', function () { _pfSwap(i, i + 1); }, i === _pfPhotos.length - 1));
        cell.appendChild(bar);
        strip.appendChild(cell);
      });
      // #149b: the shared WYSIWYG preview (see _pfPaintPreview)
      var oldPrev = document.getElementById('lok-pf-preview-wrap');
      if (oldPrev) oldPrev.remove();
      if (_pfPhotos.length) {
        var pw = document.createElement('div');
        pw.id = 'lok-pf-preview-wrap';
        pw.style.cssText = 'margin-top:14px;white-space:normal;';
        var plab = document.createElement('div');
        plab.id = 'lok-pf-preview-label';
        plab.style.cssText = 'font-size:12px;font-weight:600;color:#4A4761;margin-bottom:6px;';
        var pframe = document.createElement('div');
        pframe.style.cssText = 'width:300px;max-width:100%;height:180px;border-radius:12px;overflow:hidden;border:1px solid #EEEDF6;background:#F7F6FC;box-shadow:0 2px 8px rgba(26,24,41,.08);';
        var pimg = document.createElement('img');
        pimg.id = 'lok-pf-cover-preview';
        pimg.alt = 'Portfolio crop preview';
        pimg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        pframe.appendChild(pimg);
        pw.appendChild(plab); pw.appendChild(pframe);
        strip.parentNode.insertBefore(pw, strip.nextSibling);
        _pfWireDrag(pimg, -1);            // -1 = "the active photo"
        _pfPaintPreview();
      }
      var add = document.getElementById('lok-pf-add');
      if (add) add.style.display = _pfPhotos.length >= _PF_MAX ? 'none' : '';
    });
  }
  function _pfSwap(i, j) {
    if (j < 0 || j >= _pfPhotos.length) return;
    var a = _pfPhotos[i], b = _pfPhotos[j];
    var S = window.LokaliSupabaseAPI;
    // Normalize to index-based sort so swaps are always meaningful even when
    // legacy rows share the same sort_order.
    Promise.all([
      S.photos.setSort('vendor', a.id, j + 1),
      S.photos.setSort('vendor', b.id, i + 1)
    ]).then(_renderPortfolio);
  }

  function populateUI() {
    if (!_vendor) return;
    // _setTextValueAnyId dispatches input events while populating — don't let
    // those mark the form dirty (the timeout clears after this sync pass).
    _populating = true;
    setTimeout(function () { _populating = false; }, 0);
    _bindDirtyGuard();
    _injectPaymentFields();
    _injectAboutYouCard();
    _injectPortfolioCard();
    _injectPhoneCallsCheckbox();
    _hideInstagramField();
    _polishLogoSection();
    _polishEmailField();
    _reorderProfileSections();
    _setTextValueAnyId(['input-owner-name'], _v('owner_name'));
    _setTextValueAnyId(['input-owner-bio'], _v('owner_bio'));
    _setTextValueAnyId(['input-owner-languages'], _v('owner_languages'));
    _uploadedOwnerPhotoUrl = null;
    var ownerPrev = document.getElementById('lok-owner-photo-preview');
    if (ownerPrev) {
      if (_vendor.owner_photo) { ownerPrev.src = _vendor.owner_photo; ownerPrev.style.display = ''; }
      else { ownerPrev.style.display = 'none'; }
    }
    window.LokaliDashboard.setCheckboxValue('checkbox-phone-calls', _vendor.phone_calls !== false);
    _renderPortfolio();
    _dbg('[LokaliProfile] tagline value from API:', JSON.stringify(_vendor.tagline), '| business_tagline:', JSON.stringify(_vendor.business_tagline));

    _setTextValueAnyId(['input-business-name', 'business-name', 'business_name'], _v('business_name', 'businessName'));
    _setDescriptionValue(_v('business_description', 'businessDescription'));
    _setTextValueAnyId(['input-tagline', 'tagline', 'business-tagline', 'business_tagline'], _v('tagline', 'business_tagline', 'businessTagline'));
    _setTextValueAnyId(['input-instagram', 'instagram', 'instagram-handle', 'instagram_handle', 'instagram_url'], _v('instagram_url', 'instagram_handle', 'instagram'));
    _setTextValueAnyId(['input-website', 'website', 'website_url'], _v('website_url', 'websiteUrl'));
    _setTextValueAnyId(['input-venmo'], _v('venmo_username'));
    _setTextValueAnyId(['input-cashapp'], _v('cashapp_cashtag'));
    _setTextValueAnyId(['input-paypal'], _v('paypalme_slug'));
    _setTextValueAnyId(['input-zelle'], _v('zelle_contact'));
    _setTextValueAnyId(['input-otherpay-url'], _v('other_pay_url'));
    _setTextValueAnyId(['input-otherpay-label'], _v('other_pay_label'));
    _setTextValueAnyId(['input-contact-email', 'contact-email', 'contact_email', 'public_email'], _v('contact_email', 'contactEmail'));
    var addressVal = _v('address');
    var addressEl = _getAddressEl();
    if (addressEl && addressEl.value !== undefined) addressEl.value = addressVal;
    _setPhotoUrlValue(_v('profile_photo', 'profilePhoto'));
    var phoneVal = _v('phone_number', 'phoneNumber');
    if (_phone && phoneVal) {
      _phone.setNumber(phoneVal);
    } else {
      _setTextValueAnyId(['input-phone', 'phone'], phoneVal);
    }
    _uploadedProfilePhotoUrl = null;
    if (_vendor.profile_photo || _vendor.profilePhoto) {
      _setProfilePhotoPreviewSrc(_vendor.profile_photo || _vendor.profilePhoto);
    }
    var textMsg = _vendor.text_messages || _vendor.textMessages;
    var whatsapp = _vendor.whatsapp_messages || _vendor.whatsappMessages;
    window.LokaliDashboard.setCheckboxValue('checkbox-text-messages', !!textMsg);
    window.LokaliDashboard.setCheckboxValue('checkbox-whatsapp', !!whatsapp);

    var catRaw = _vendor.categories_id || _vendor.categoriesId || _vendor.category_id;
    var primaryCategory = Array.isArray(catRaw) ? catRaw[0] : catRaw;

    _populateCategoryDropdown();
    _initLocationTokenMultiSelect();

    if (primaryCategory != null) {
      var categorySelect = _getCategorySelect();
      if (categorySelect) categorySelect.value = String(primaryCategory);
    }
    _initCategoryPills();
  }

  function _parseLocationsArray(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.records)) return data.records;
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.data)) return data.data;
      if (Array.isArray(data.locations)) return data.locations;
      var keys = Object.keys(data);
      for (var k = 0; k < keys.length; k++) {
        if (Array.isArray(data[keys[k]])) return data[keys[k]];
      }
    }
    return [];
  }

  function _getLocationLabel(loc) {
    if (!loc) return '';
    return loc.name || loc.location_name || loc.title || loc.value || (loc.id != null ? String(loc.id) : (loc.location_id != null ? String(loc.location_id) : ''));
  }

  function _getDescriptionEl() {
    var el = document.getElementById('textarea-description') || document.getElementById('description') || document.getElementById('business-description');
    if (!el) return null;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el;
    return el.querySelector && (el.querySelector('textarea') || el.querySelector('input')) || el;
  }

  function _setDescriptionValue(value) {
    var el = _getDescriptionEl();
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) el.value = value || '';
  }

  function _getPhotoUrlEl() {
    var el = document.getElementById('photo-url') || document.getElementById('input-photo-url');
    if (!el) return null;
    if (el.tagName === 'INPUT') return el;
    return el.querySelector('input');
  }

  function _getAddressEl() {
    var el = document.getElementById('input-address') || document.getElementById('address') || document.getElementById('business-address') || document.querySelector('[data-lokali-address]');
    if (!el) return null;
    if (el.tagName === 'INPUT') return el;
    return el.querySelector && el.querySelector('input') || el;
  }

  function _setPhotoUrlValue(value) {
    var el = _getPhotoUrlEl();
    if (el) el.value = value || '';
  }

  function _getCategorySelect() {
    var el = document.getElementById('select-category') || document.getElementById('category') || document.getElementById('business-category');
    if (el && el.tagName === 'SELECT') return el;
    if (el && el.querySelector) return el.querySelector('select');
    return document.querySelector('select[name="category"]') || document.querySelector('[data-lokali-category] select');
  }

  function _populateCategoryDropdown() {
    var sel = _getCategorySelect();
    if (!sel) return;
    sel.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select category';
    sel.appendChild(placeholder);
    if (_categories && _categories.length) {
      _categories.forEach(function (cat) {
        var id = cat.id != null ? cat.id : cat.category_id;
        var label = cat.name || cat.category_name || (id != null ? String(id) : '');
        if (id == null) return;
        var opt = document.createElement('option');
        opt.value = String(id);
        opt.textContent = label || ('Category ' + id);
        sel.appendChild(opt);
      });
    }
  }

  // Category icons — same Webflow assets The Market sidebar uses (lokali-browse.js
  // CATEGORY_LIST), keyed by category.slug, so the picker matches the guide the
  // customer-facing filter shows. Rendered as CSS-mask icons following text color.
  var _CAT_ICON_ASSET = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/';
  var _CAT_ICON_BY_SLUG = {
    beauty:      _CAT_ICON_ASSET + '6a18f2524e31974a75003735_hair%20dryer.svg',
    business:    _CAT_ICON_ASSET + '6a18f6d4b01673d30ca9bcb8_briefcase.svg',
    children:    _CAT_ICON_ASSET + '6a18f6d4f1bbd4795f5345bc_backpack.svg',
    events:      _CAT_ICON_ASSET + '6a18f6d414c76bb968f180db_balloon.svg',
    food:        _CAT_ICON_ASSET + '6a186b067365d964abee8918_utensils-solid.png',
    handcrafted: _CAT_ICON_ASSET + '6a186b061a80eb9ba75f0d0a_scissors-solid.png',
    home:        _CAT_ICON_ASSET + '6a186b06a37dcea6514f15f9_house-regular.png',
    wellness:    _CAT_ICON_ASSET + '6a186b06cfcb6c4d6d1e1cf7_heart-regular.png',
    professional: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2 2 7v2h20V7L12 2zM4 11h2v7H4zm5 0h2v7H9zm4 0h2v7h-2zm5 0h2v7h-2zM2 20h20v2H2z"/></svg>') // #152 inline silhouette
  };
  var _categoryPillRowEl = null;

  // Icon-pill radio UI over the (hidden) native select — the select stays the
  // source of truth, so hydrate (select.value = saved id) and save
  // (_getFormValues reads select.value) need no changes.
  function _initCategoryPills() {
    var sel = _getCategorySelect();
    if (!sel) return;

    if (!_categoryPillRowEl || !document.body.contains(_categoryPillRowEl)) {
      sel.style.display = 'none';

      var wrapper = document.createElement('div');
      wrapper.className = 'category-pills';

      var hint = document.createElement('p');
      hint.className = 'category-hint';
      hint.textContent = 'Pick the category that fits your business best.';

      var row = document.createElement('div');
      row.className = 'category-pill-row';

      wrapper.appendChild(hint);
      wrapper.appendChild(row);
      sel.parentNode.insertBefore(wrapper, sel.nextSibling);
      _categoryPillRowEl = row;
    }

    _renderCategoryPills();
  }

  function _renderCategoryPills() {
    if (!_categoryPillRowEl) return;
    var sel = _getCategorySelect();
    if (!sel) return;

    _categoryPillRowEl.innerHTML = '';

    (_categories || []).forEach(function (cat) {
      var id = cat.id != null ? cat.id : cat.category_id;
      if (id == null) return;
      var label = cat.name || cat.category_name || ('Category ' + id);
      var slug = cat.slug || '';
      var on = String(sel.value) === String(id);

      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'category-pill' + (on ? ' is-on' : '');
      pill.setAttribute('aria-pressed', on ? 'true' : 'false');

      var iconUrl = _CAT_ICON_BY_SLUG[slug];
      if (iconUrl) {
        var ic = document.createElement('span');
        ic.className = 'cp-ic';
        ic.style.webkitMaskImage = 'url(' + iconUrl + ')';
        ic.style.maskImage = 'url(' + iconUrl + ')';
        pill.appendChild(ic);
      }

      var text = document.createElement('span');
      text.textContent = label;
      pill.appendChild(text);

      pill.addEventListener('click', function () {
        if (String(sel.value) !== String(id)) _dirty = true; // programmatic select.value fires no change event — the guard would miss category picks
        sel.value = String(id);
        _renderCategoryPills();
      });
      _categoryPillRowEl.appendChild(pill);
    });
  }

  function _initLocationTokenMultiSelect() {
    var container = document.getElementById('locations-token') || document.getElementById('locations') || document.getElementById('service-areas') || document.querySelector('[data-lokali-locations]');
    if (!container) return;

    container.innerHTML = '';

    var wrapper = document.createElement('div');
    wrapper.className = 'location-multi';

    var hint = document.createElement('p');
    hint.className = 'location-hint';
    hint.textContent = 'Tap every area you serve — pick as many as you like.';

    var pills = document.createElement('div');
    pills.className = 'location-pills';

    var count = document.createElement('p');
    count.className = 'location-count';

    wrapper.appendChild(hint);
    wrapper.appendChild(pills);
    wrapper.appendChild(count);
    container.appendChild(wrapper);

    _locationPillsEl = pills;
    _locationCountEl = count;

    _renderLocationPills();
  }

  function _isLocationSelected(id) {
    return _selectedLocationIds.some(function (x) { return String(x) === String(id); });
  }

  function _toggleLocation(id) {
    var n = parseInt(id, 10);
    if (isNaN(n)) return;
    if (_isLocationSelected(n)) {
      _selectedLocationIds = _selectedLocationIds.filter(function (x) {
        return String(x) !== String(n);
      });
    } else {
      _selectedLocationIds.push(n);
    }
    _renderLocationPills();
  }

  function _renderLocationPills() {
    if (!_locationPillsEl) return;
    _locationPillsEl.innerHTML = '';

    // All active locations as toggle pills. A selected id the active list no
    // longer carries (deactivated community, e.g. Houston paused 2026-07-27)
    // used to render as a cryptic "Location N" pill — Francesca 2026-08-13:
    // hide it instead. The id STAYS in _selectedLocationIds, so saves preserve
    // the pick and the named pill reappears if the community reactivates.
    var entries = [];
    if (_locations && _locations.length) {
      for (var i = 0; i < _locations.length; i++) {
        var loc = _locations[i];
        var id = loc.id != null ? loc.id : loc.location_id;
        if (id == null) continue;
        entries.push({ id: id, label: _getLocationLabel(loc) || ('Location ' + id) });
      }
    }

    entries.forEach(function (entry) {
      var on = _isLocationSelected(entry.id);

      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'location-pill' + (on ? ' is-on' : '');
      pill.setAttribute('aria-pressed', on ? 'true' : 'false');

      var glyph = document.createElement('span');
      glyph.className = 'lp-g';
      glyph.textContent = on ? '✓' : '+';

      var label = document.createElement('span');
      label.textContent = entry.label;

      pill.appendChild(glyph);
      pill.appendChild(label);
      pill.addEventListener('click', function () { _toggleLocation(entry.id); });
      _locationPillsEl.appendChild(pill);
    });

    if (_locationCountEl) {
      var total = entries.length;
      var chosen = _selectedLocationIds.length;
      _locationCountEl.textContent = chosen === 0
        ? 'Select at least one area so customers can find you on The Market.'
        : 'Serving ' + chosen + ' of ' + total + (total === 1 ? ' area' : ' areas');
    }
  }

  function _getUploadedPhotoUrlFromResponse(data) {
    if (!data) return null;
    var url = data.url || data.profile_photo || data.path || data.file_url || data.image_url
      || (data.record && (data.record.url || data.record.profile_photo || data.record.path || data.record.file_url || data.record.image_url))
      || (data.data && (data.data.url || data.data.profile_photo || data.data.path || data.data.file_url || data.data.image_url))
      || (data.result && (data.result.url || data.result.profile_photo || data.result.path || data.result.file_url))
      || (data.updated_vendor && (data.updated_vendor.url || data.updated_vendor.profile_photo || data.updated_vendor.path || data.updated_vendor.file_url || data.updated_vendor.image_url))
      || (data.file && (data.file.url || data.file.profile_photo || data.file.path))
      || (data.image && (data.image.url || data.image.profile_photo || data.image.path))
      || null;
    return url || null;
  }

  function bindEvents() {
    var photoInput = _getPhotoUrlEl();
    if (photoInput) {
      photoInput.addEventListener('input', function () {
        var url = photoInput.value.trim();
        if (url) _setProfilePhotoPreviewSrc(url);
      });
    }

    var fileUpload = document.getElementById('vendor-profile-photo-upload');
    if (fileUpload && window.LokaliAPI && window.LokaliAPI.vendors && window.LokaliAPI.vendors.uploadProfilePhoto) {
      fileUpload.addEventListener('change', function () {
        var file = fileUpload.files && fileUpload.files[0];
        if (!file || file.type.indexOf('image/') !== 0) {
          fileUpload.value = '';
          return;
        }
        var previewEl = _getProfilePhotoPreviewEl();
        var objectUrl = URL.createObjectURL(file);
        _setProfilePhotoPreviewSrc(objectUrl);

        window.LokaliAPI.vendors.uploadProfilePhoto(file)
          .then(function (res) {
            if (res.error) {
              console.error('[ProfilePage] photo upload error:', res.error);
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              if (previewEl && _vendor && _vendor.profile_photo) _setProfilePhotoPreviewSrc(_vendor.profile_photo);
              return;
            }
            var url = _getUploadedPhotoUrlFromResponse(res.data);
            if (url) {
              _uploadedProfilePhotoUrl = url;
              _setProfilePhotoPreviewSrc(url);
              _setPhotoUrlValue(url);
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              // Feedback 2026-08-13: uploads persist server-side instantly, but
              // nothing said so — vendors went hunting for a save button.
              _showToast('success', 'Logo uploaded — saved automatically.');
            } else {

              window.LokaliAPI.vendors.me()
                .then(function (vendorRes) {
                  if (!vendorRes.error && vendorRes.data) {
                    var raw = vendorRes.data;
                    if (Array.isArray(raw) && raw.length > 0) _vendor = raw[0];
                    else if (raw && raw.vendor && typeof raw.vendor === 'object') _vendor = raw.vendor;
                    else if (raw && typeof raw === 'object') _vendor = raw;
                    var newUrl = _vendor && (_vendor.profile_photo || _vendor.profilePhoto);
                    if (newUrl) {
                      _uploadedProfilePhotoUrl = newUrl;
                      _setProfilePhotoPreviewSrc(newUrl);
                      _setPhotoUrlValue(newUrl);
                      _showToast('success', 'Logo uploaded — saved automatically.');
                    }
                    if (typeof console !== 'undefined' && console.log) {
                      _dbg('[ProfilePage] After refetch, profile_photo:', newUrl || '(empty)');
                    }
                  }
                })
                .then(function () { if (objectUrl) URL.revokeObjectURL(objectUrl); })
                .catch(function () { if (objectUrl) URL.revokeObjectURL(objectUrl); });
            }
          })
          .catch(function (err) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            console.error('[ProfilePage] photo upload failed:', err);
            if (previewEl && _vendor && _vendor.profile_photo) _setProfilePhotoPreviewSrc(_vendor.profile_photo);
          });
        fileUpload.value = '';
      });
    }

    var saveBtn = document.getElementById(SAVE_BTN);
    if (saveBtn) {
      saveBtn.addEventListener('click', save);
      _injectBottomSave(saveBtn);
    }
  }

  // Vendor feedback 2026-08-13: the lone SAVE sits at the top of a long page —
  // after filling the last section you had to scroll all the way back up to
  // find it. Mirror it at the natural end of the form. Anchored AFTER the
  // .w-form wrapper (sections reorder/inject inside the form, so the bar can
  // never end up mid-page).
  function _injectBottomSave(topBtn) {
    if (document.getElementById(SAVE_BTN_BOTTOM)) return;
    var formWrap = topBtn.closest ? topBtn.closest('.div-block-39') : null;
    var anchor = formWrap ? formWrap.querySelector('.w-form') : null;
    if (!anchor || !anchor.parentNode) return;
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;justify-content:flex-start;margin:4px 0 28px;';
    var clone = topBtn.cloneNode(true);
    clone.id = SAVE_BTN_BOTTOM;
    clone.style.cursor = 'pointer';
    clone.addEventListener('click', save);
    bar.appendChild(clone);
    anchor.parentNode.insertBefore(bar, anchor.nextSibling);
  }

  function _getFormValues() {
    function bool(id)   { var el = document.getElementById(id); return el ? !!el.checked : false; }

    var phoneNumber = _phone ? _phone.getNumber() : _getValueByAnyId(['input-phone', 'phone']);
    var categorySelect = _getCategorySelect();
    var categoryId = categorySelect && categorySelect.value !== '' ? parseInt(categorySelect.value, 10) : null;
    var locationIds = _selectedLocationIds ? _selectedLocationIds.slice() : [];

    var descEl = _getDescriptionEl();
    var businessDescription = '';
    if (descEl && (descEl.tagName === 'TEXTAREA' || descEl.tagName === 'INPUT') && descEl.value != null) {
      businessDescription = String(descEl.value).trim();
    }

    var photoEl = _getPhotoUrlEl();
    var profilePhoto = _uploadedProfilePhotoUrl || (photoEl ? String(photoEl.value || '').trim() : '') || (_vendor && (_vendor.profile_photo || _vendor.profilePhoto) ? (_vendor.profile_photo || _vendor.profilePhoto) : '');
    if (profilePhoto == null) profilePhoto = '';

    var addressEl = _getAddressEl();
    var addressValue = addressEl && addressEl.value != null ? String(addressEl.value).trim() : '';

    var categoriesId = categoryId !== null
      ? _replaceFirst(_vendor ? _vendor.categories_id : [], categoryId)
      : (_vendor ? _vendor.categories_id : []);

    return {
      business_name:        _getValueByAnyId(['input-business-name', 'business-name', 'business_name']),
      business_description: businessDescription,
      tagline:              _getValueByAnyId(['input-tagline', 'tagline', 'business-tagline', 'business_tagline']),
      instagram_handle:     _getValueByAnyId(['input-instagram', 'instagram', 'instagram-handle', 'instagram_handle', 'instagram_url']),
      website_url:          _getValueByAnyId(['input-website', 'website', 'website_url']),
      venmo_username:       _getValueByAnyId(['input-venmo']),
      cashapp_cashtag:      _getValueByAnyId(['input-cashapp']),
      paypalme_slug:        _getValueByAnyId(['input-paypal']),
      zelle_contact:        _getValueByAnyId(['input-zelle']),
      other_pay_url:        _getValueByAnyId(['input-otherpay-url']),
      other_pay_label:      _getValueByAnyId(['input-otherpay-label']),
      contact_email:        _getValueByAnyId(['input-contact-email', 'contact-email', 'contact_email', 'public_email']),
      phone_number:         phoneNumber,
      address:              addressValue,
      profile_photo:        profilePhoto,
      // #76e Meet the Vendor (owner photo: freshly uploaded URL wins, else keep saved)
      owner_name:           _getValueByAnyId(['input-owner-name']),
      owner_bio:            _getValueByAnyId(['input-owner-bio']),
      owner_languages:      _getValueByAnyId(['input-owner-languages']),
      owner_photo:          _uploadedOwnerPhotoUrl != null ? _uploadedOwnerPhotoUrl : (_vendor && _vendor.owner_photo != null ? _vendor.owner_photo : ''),
      text_messages:        bool('checkbox-text-messages'),
      whatsapp_messages:    bool('checkbox-whatsapp'),
      // #76c — only send when the injected checkbox actually exists (a stale
      // cached embed without it must not silently flip the column to false).
      phone_calls:          document.getElementById('checkbox-phone-calls') ? bool('checkbox-phone-calls') : undefined,
      category_id:          categoryId,
      categories_id:        categoriesId,
      locations_id: (locationIds && locationIds.length)
        ? locationIds
        : (_vendor ? _vendor.locations_id : [])
    };
  }

  function _replaceFirst(arr, value) {
    var copy = Array.isArray(arr) ? arr.slice() : [];
    if (copy.length === 0) return [value];
    copy[0] = value;
    return copy;
  }

  function _validate(payload) {
    if (!payload.business_name || !payload.business_name.trim()) return 'Business name is required.';
    if (payload.contact_email && payload.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contact_email)) return 'Please enter a valid email address.';
    if (_phone) {
      var phoneEl = _phone.input || document.getElementById('input-phone') || document.getElementById('phone');
      if (phoneEl && phoneEl.value.trim() !== '') {
        if (!_phone.isValidNumber()) {
          return 'Please check your phone number — pick your country from the dropdown, then enter just the local number (e.g. United States → 415 555 0123).';
        }
      }
    }
    return null;
  }

  function _showSuccessPopup() {
    _showToast('success', 'Your profile looks great — changes saved!');
  }

  function _showErrorPopup(message) {
    _showToast('error', message || 'Hit a snag — please check your info and try again.');
  }

  function _normalizePayload(payload) {
    payload = payload || {};
    return {
      business_name:        payload.business_name != null ? String(payload.business_name) : '',
      business_description: payload.business_description != null ? String(payload.business_description) : '',
      tagline:              payload.tagline != null ? String(payload.tagline) : '',
      instagram_handle:     payload.instagram_handle != null ? String(payload.instagram_handle) : '',
      website_url:          payload.website_url != null ? String(payload.website_url) : '',
      venmo_username:       payload.venmo_username != null ? String(payload.venmo_username) : '',
      cashapp_cashtag:      payload.cashapp_cashtag != null ? String(payload.cashapp_cashtag) : '',
      paypalme_slug:        payload.paypalme_slug != null ? String(payload.paypalme_slug) : '',
      zelle_contact:        payload.zelle_contact != null ? String(payload.zelle_contact) : '',
      other_pay_url:        payload.other_pay_url != null ? String(payload.other_pay_url) : '',
      other_pay_label:      payload.other_pay_label != null ? String(payload.other_pay_label) : '',
      contact_email:        payload.contact_email != null ? String(payload.contact_email) : '',
      phone_number:         payload.phone_number != null ? String(payload.phone_number) : '',
      address:              payload.address != null ? String(payload.address) : '',
      profile_photo:        (payload.profile_photo != null ? String(payload.profile_photo) : (payload.profilePhoto != null ? String(payload.profilePhoto) : '')),
      owner_name:           payload.owner_name != null ? String(payload.owner_name) : '',
      owner_bio:            payload.owner_bio != null ? String(payload.owner_bio) : '',
      owner_languages:      payload.owner_languages != null ? String(payload.owner_languages) : '',
      owner_photo:          payload.owner_photo != null ? String(payload.owner_photo) : '',
      text_messages:        !!payload.text_messages,
      whatsapp_messages:    !!payload.whatsapp_messages,
      phone_calls:          payload.phone_calls === undefined ? undefined : !!payload.phone_calls,
      category_id:          payload.category_id != null ? payload.category_id : null,
      categories_id:        payload.categories_id,
      locations_id:         payload.locations_id
    };
  }

  // The save buttons are Webflow DIVs, so element.disabled alone doesn't stop
  // clicks — gate re-entry with a flag and dim both buttons (top + bottom).
  var _saving = false;
  function _setSaving(on) {
    _saving = on;
    [SAVE_BTN, SAVE_BTN_BOTTOM].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      b.style.opacity = on ? '0.6' : '';
      b.style.pointerEvents = on ? 'none' : '';
    });
    window.LokaliDashboard.disableButton(SAVE_BTN, on);
  }

  function save() {
    if (_saving) return;
    var successEl = _getSuccessEl();
    var errorEl = _getErrorEl();
    if (successEl) successEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    _setSaving(true);
    var payload = _getFormValues();
    var validationError = _validate(payload);
    if (validationError) {
      console.warn('[ProfilePage] Validation failed:', validationError);
      _showErrorPopup(validationError);
      _setSaving(false);
      return;
    }
    var body = _normalizePayload(payload);
    if (typeof console !== 'undefined' && console.log) {
      _dbg('[ProfilePage] Save payload profile_photo:', body.profile_photo ? body.profile_photo.substring(0, 60) + (body.profile_photo.length > 60 ? '...' : '') : '(empty)');
    }
    window.LokaliAPI.vendors.updateMe(body)
      .then(function (res) {
        if (res.error) {
          console.error('[ProfilePage] save error from API:', res.error);
          _showErrorPopup(res.error || 'Failed to save profile. Please try again.');
        } else {
          _vendor = res.data;
          if (_vendor && _vendor.profile_photo) _uploadedProfilePhotoUrl = null;
          _dirty = false; // saved — clear the leave-page warning
          _showSuccessPopup();
        }
      })
      .catch(function (err) {
        console.error('[ProfilePage] save network error:', err);
        _showErrorPopup('Network error. Please check your connection and try again.');
      })
      .then(function () { _setSaving(false); });
  }

  return { init: init, loadData: loadData, populateUI: populateUI, bindEvents: bindEvents, save: save };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { LokaliProfilePage.init(); });
} else {
  LokaliProfilePage.init();
}
