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
  injectStyle("lokali-subcat-ui-style", "  .subcat-block {\n    border-top: 1px solid #DCD2F2;\n    margin-top: 12px;\n    padding-top: 12px;\n  }\n  .subcat-hint {\n    margin-bottom: 10px;\n  }\n  .category-pill.subcat-pick {\n    padding: 6px 12px;\n    font-size: 13px;\n  }\n  .subcat-count {\n    font-size: 12.5px;\n    color: #6B6787;\n    margin: 10px 0 0;\n  }\n  .subcat-suggest {\n    border-top: 1px dashed #DCD2F2;\n    margin-top: 12px;\n    padding-top: 12px;\n  }\n  .subcat-suggest-label {\n    font-size: 13px;\n    color: #5A5570;\n    margin: 0 0 8px;\n  }\n  .subcat-suggest-row {\n    display: flex;\n    gap: 6px;\n  }\n  .subcat-suggest-input {\n    flex: 1;\n    font-family: inherit;\n    font-size: 13px;\n    padding: 8px 12px;\n    border: 1px solid #C9BDE8;\n    border-radius: 8px;\n    background: #fff;\n    color: #1A1829;\n    min-width: 0;\n  }\n  .subcat-suggest-input::placeholder {\n    color: #8E8BA6;\n  }\n  .subcat-suggest-btn {\n    font-family: inherit;\n    -webkit-appearance: none;\n    appearance: none;\n    font-size: 13px;\n    font-weight: 600;\n    padding: 8px 16px;\n    border-radius: 8px;\n    border: 1px solid #6002EE;\n    background: #6002EE;\n    color: #fff;\n    cursor: pointer;\n  }\n  .subcat-suggest-btn:hover {\n    background: #4a01c7;\n    border-color: #4a01c7;\n  }\n  .subcat-suggest-hint {\n    font-size: 12.5px;\n    color: #6B6787;\n    margin: 8px 0 0;\n    line-height: 1.45;\n  }\n  .subcat-suggest-link {\n    color: #6002EE;\n    font-weight: 600;\n    cursor: pointer;\n    text-decoration: underline;\n  }\n  .subcat-suggest-pending {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 6px;\n    margin-top: 8px;\n  }\n  .subcat-pending-chip {\n    font-size: 12px;\n    padding: 4px 12px;\n    border-radius: 999px;\n    background: #FBF3D9;\n    color: #8A6A00;\n    border: 1px solid #E8D48A;\n  }");
  injectStyle("lokali-profile-field-colors","  .w-input, .w-select, .lokali-phone-number, #textarea-description {\n    color: #1A1829;\n  }\n  .w-input::placeholder, .w-select::placeholder,\n  .lokali-phone-number::placeholder, #textarea-description::placeholder {\n    color: #8E8BA6;\n  }");
  injectStyle("lokali-locations-ui-style", "  .location-multi {\n    font-family: \"Plus Jakarta Sans\", system-ui, -apple-system, sans-serif;\n    background: #eee6ff;\n    padding: 12px 14px;\n    border-radius: 8px;\n    box-sizing: border-box;\n  }\n  .location-hint {\n    font-size: 13px;\n    color: #5A5570;\n    margin: 0 0 10px;\n    line-height: 1.4;\n  }\n  .location-pills {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 8px;\n  }\n  .location-pill {\n    font-family: inherit;\n    -webkit-appearance: none;\n    appearance: none;\n    display: inline-flex;\n    align-items: center;\n    gap: 7px;\n    background: #fff;\n    color: #5A5570;\n    border: 1px solid #C9BDE8;\n    border-radius: 999px;\n    padding: 8px 14px;\n    font-size: 14px;\n    line-height: 1.3;\n    cursor: pointer;\n    user-select: none;\n    transition: background .12s, border-color .12s, color .12s;\n  }\n  .location-pill:hover {\n    border-color: #6002ee;\n    color: #6002ee;\n  }\n  .location-pill.is-on {\n    background: #6002EE;\n    border-color: #6002EE;\n    color: #fff;\n    font-weight: 600;\n  }\n  .location-pill.is-on:hover {\n    background: #4a01c7;\n    border-color: #4a01c7;\n    color: #fff;\n  }\n  .location-pill .lp-g {\n    font-weight: 700;\n    font-size: 13px;\n    line-height: 1;\n  }\n  .location-count {\n    font-size: 12.5px;\n    color: #6B6787;\n    margin: 10px 0 0;\n  }\n  .category-pills {\n    font-family: \"Plus Jakarta Sans\", system-ui, -apple-system, sans-serif;\n    background: #eee6ff;\n    padding: 12px 14px;\n    border-radius: 8px;\n    box-sizing: border-box;\n  }\n  .category-hint {\n    font-size: 13px;\n    color: #5A5570;\n    margin: 0 0 10px;\n    line-height: 1.4;\n  }\n  .category-pill-row {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 8px;\n  }\n  .category-pill {\n    font-family: inherit;\n    -webkit-appearance: none;\n    appearance: none;\n    display: inline-flex;\n    align-items: center;\n    gap: 8px;\n    background: #fff;\n    color: #5A5570;\n    border: 1px solid #C9BDE8;\n    border-radius: 999px;\n    padding: 8px 14px;\n    font-size: 14px;\n    line-height: 1.3;\n    cursor: pointer;\n    user-select: none;\n    transition: background .12s, border-color .12s, color .12s;\n  }\n  .category-pill:hover {\n    border-color: #6002ee;\n    color: #6002ee;\n  }\n  .category-pill.is-on {\n    background: #6002EE;\n    border-color: #6002EE;\n    color: #fff;\n    font-weight: 600;\n  }\n  .category-pill .cp-ic {\n    width: 16px;\n    height: 16px;\n    flex-shrink: 0;\n    background-color: currentColor;\n    -webkit-mask-position: center;\n    -webkit-mask-repeat: no-repeat;\n    -webkit-mask-size: contain;\n    mask-position: center;\n    mask-repeat: no-repeat;\n    mask-size: contain;\n  }");
})();


var LokaliPhoneInput = (function () {
  'use strict';

  function digitsOnly(value) {
    return (value || '').replace(/\D/g, '');
  }

  function create(containerOrInputId) {
    var el;
    if (typeof containerOrInputId === 'string') {
      el = document.getElementById(containerOrInputId) || document.querySelector('[data-lokali-phone]');
    } else {
      el = containerOrInputId;
    }
    if (!el) return null;

    var existingInput = el.tagName === 'INPUT' ? el : el.querySelector('input');
    var parent = existingInput ? existingInput.parentNode : el;
    var placeholder = existingInput ? (existingInput.getAttribute('placeholder') || '') : '';
    var preferredId = (existingInput && existingInput.id) ? existingInput.id : 'input-phone';

    var wrapper = document.createElement('div');
    wrapper.className = 'lokali-phone';

    var input = document.createElement('input');
    input.type = 'tel';
    input.className = 'lokali-phone-number';
    input.id = preferredId;
    input.setAttribute('inputmode', 'tel');
    input.setAttribute('autocomplete', 'tel');
    input.setAttribute('placeholder', placeholder || '+1 415 555 0123');
    if (existingInput && existingInput.name) input.name = existingInput.name;

    if (el && el.tagName !== 'INPUT' && el.id) {
      el.removeAttribute('id');
    }

    wrapper.appendChild(input);

    if (existingInput && existingInput.parentNode) {
      existingInput.parentNode.replaceChild(wrapper, existingInput);
    } else {
      parent.innerHTML = '';
      parent.appendChild(wrapper);
    }

    function getNumber() {
      var d = digitsOnly(input.value);
      if (!d) return '';
      return '+' + d;
    }

    function setNumber(e164) {
      var d = digitsOnly(e164);
      input.value = d ? '+' + d : '';
    }

    function isValidNumber() {
      var d = digitsOnly(input.value);
      if (!d) return true;
      return d.length >= 10 && d.length <= 15;
    }

    return {
      getNumber: getNumber,
      setNumber: setNumber,
      isValidNumber: isValidNumber,
      input: input,
      select: null
    };
  }

  return { create: create };
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
    if (s.indexOf('/') === 0) {
      var origin = typeof window.LOKALI_XANO_ORIGIN === 'string' ? window.LOKALI_XANO_ORIGIN : 'https://x8ki-letl-twmt.n7.xano.io';
      return origin.replace(/\/$/, '') + s;
    }
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
    _fetchSubcatTaxonomy();        // #96-SUGGEST — live taxonomy (baked list = fallback)
    _loadMySubcatSuggestions();    // #96-SUGGEST — "under review" chips
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
      window.LokaliAPI.data.locations()
    ]).then(function (results) {
      var vendorRes = results[0];
      var categoriesRes = results[1];
      var locationsRes = results[2];

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
    pop.style.cssText = 'position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);z-index:60;width:250px;background:#fff;border:1px solid #EEEDF6;border-radius:12px;box-shadow:0 10px 30px rgba(26,24,41,.15);padding:14px;display:none;font-family:"Plus Jakarta Sans",sans-serif;text-align:left;text-transform:none;';
    pop.innerHTML = popHtml;
    wrap.appendChild(btn);
    wrap.appendChild(pop);
    var over = false;
    function showPop(on) { pop.style.display = on ? 'block' : 'none'; }
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
            pop.innerHTML = '';
            pop.style.width = 'min(440px, 88vw)';
            // anchor to the icon's left edge so it never clips off-screen on phones
            pop.style.left = '0';
            pop.style.transform = 'none';
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
    sub.style.cssText = 'font-size:13px;color:#6B6880;margin-bottom:6px;';
    sub.textContent = 'Everything below builds your public page — in the same order customers see it.';
    head.appendChild(sub);

    var nav = document.createElement('div');
    nav.id = 'lok-profile-nav';
    nav.style.cssText = 'position:sticky;top:0;z-index:40;background:#fff;display:flex;gap:22px;overflow-x:auto;border-bottom:1px solid #EEEDF6;margin-bottom:8px;font-family:"Plus Jakarta Sans",sans-serif;';
    [
      ['lok-portfolio-card', 'Photos', portfolio],
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
      a.style.cssText = 'padding:13px 2px;font-weight:600;font-size:14px;color:#6B6880;text-decoration:none;border-bottom:2px solid transparent;white-space:nowrap;';
      a.addEventListener('click', function (e) { e.preventDefault(); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      a.addEventListener('mouseenter', function () { a.style.color = '#1A1829'; a.style.borderBottomColor = '#6002EE'; });
      a.addEventListener('mouseleave', function () { a.style.color = '#6B6880'; a.style.borderBottomColor = 'transparent'; });
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
  }

  // ---- #76d portfolio manager ---------------------------------------------
  var _PF_MAX = 5;
  var _pfPhotos = [];
  function _injectPortfolioCard() {
    if (document.getElementById('lok-portfolio-card')) return;
    var anchorSection = document.getElementById('lok-about-you') || document.getElementById('lok-pay-card');
    if (!anchorSection || !anchorSection.parentNode) return;
    var card = _mkCard('lok-portfolio-card', _PF_ICON, 'Portfolio Photos',
      'Up to 5 photos — they become the big photo gallery at the top of your public page (shown on Pro & Featured plans). First photo = the lead image.');
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
    card.col.appendChild(pick);
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
      strip.innerHTML = '';
      _pfPhotos.forEach(function (p, i) {
        var cell = document.createElement('div');
        cell.style.cssText = 'position:relative;width:104px;';
        var img = document.createElement('img');
        img.src = p.image_url; img.alt = '';
        img.style.cssText = 'width:104px;height:78px;object-fit:cover;border-radius:8px;border:1px solid #EEEDF6;display:block;';
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
          window.LokaliSupabaseAPI.photos.remove('vendor', p.id).then(_renderPortfolio);
        }, false));
        bar.appendChild(mkBtn('›', 'Move right', function () { _pfSwap(i, i + 1); }, i === _pfPhotos.length - 1));
        cell.appendChild(bar);
        strip.appendChild(cell);
      });
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
    // #96 — hydrate saved specialty picks (see _rehydrateSubcats: pruned to
    // the current category's taxonomy, skipped once the vendor has touched
    // the pills so the delayed second populateUI pass can't revert them).
    _rehydrateSubcats();
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
    wellness:    _CAT_ICON_ASSET + '6a186b06cfcb6c4d6d1e1cf7_heart-regular.png'
  };
  var _categoryPillRowEl = null;

  // #96 — curated subcategory taxonomy, keyed by category id. MIRRORED from
  // lokali-browse.js SUBCATS_BY_CAT (labels = the categories-guide "Examples"
  // pills) — keep the two lists identical. Vendors pick up to 3; The Market
  // filters + renders card pills from the saved slugs.
  var _SUBCAT_CAP = 3;
  var _SUBCATS_BY_CAT = {
    1: [
      { slug: 'handmade-jewelry',     label: 'Handmade jewelry' },
      { slug: 'candles-soap',         label: 'Candles & soap' },
      { slug: 'art-prints',           label: 'Art prints & paintings' },
      { slug: 'pottery-ceramics',     label: 'Pottery & ceramics' },
      { slug: 'woodworking',          label: 'Woodworking' },
      { slug: 'custom-embroidery',    label: 'Custom embroidery' },
      { slug: 'floral-arrangements',  label: 'Floral arrangements' },
      { slug: 'sewn-goods',           label: 'Sewn & stitched goods' }
    ],
    2: [
      { slug: 'bookkeeping',          label: 'Bookkeeping & accounting' },
      { slug: 'marketing',            label: 'Marketing & social media' },
      { slug: 'graphic-design',       label: 'Graphic design' },
      { slug: 'virtual-assistance',   label: 'Virtual assistance' },
      { slug: 'notary',               label: 'Notary services' },
      { slug: 'consulting',           label: 'Consulting' },
      { slug: 'it-support',           label: 'IT & tech support' },
      { slug: 'copywriting',          label: 'Copywriting' }
    ],
    3: [
      { slug: 'hair-styling',         label: 'Hair styling & coloring' },
      { slug: 'lash-extensions',      label: 'Lash extensions' },
      { slug: 'nails',                label: 'Nails & manicures' },
      { slug: 'esthetics',            label: 'Esthetics & facials' },
      { slug: 'makeup',               label: 'Makeup artistry' },
      { slug: 'brow-shaping',         label: 'Brow shaping' },
      { slug: 'spray-tanning',        label: 'Spray tanning' },
      { slug: 'mobile-beauty',        label: 'Mobile beauty services' }
    ],
    4: [
      { slug: 'tutoring',             label: 'Tutoring' },
      { slug: 'music-lessons',        label: 'Music lessons' },
      { slug: 'after-school',         label: 'After-school programs' },
      { slug: 'childcare',            label: 'Childcare & nannying' },
      { slug: 'kids-art-classes',     label: 'Art classes for kids' },
      { slug: 'sports-coaching',      label: 'Sports coaching' },
      { slug: 'language-instruction', label: 'Language instruction' },
      { slug: 'learning-support',     label: 'Learning support' }
    ],
    5: [
      { slug: 'wedding-photography',  label: 'Wedding photography' },
      { slug: 'event-planning',       label: 'Event planning' },
      { slug: 'family-portraits',     label: 'Family portraits' },
      { slug: 'party-rentals',        label: 'Party rentals' },
      { slug: 'djs-entertainers',     label: 'DJs & entertainers' },
      { slug: 'photo-booths',         label: 'Photo booths' },
      { slug: 'videography',          label: 'Videography' },
      { slug: 'balloon-decor',        label: 'Balloon & décor styling' }
    ],
    6: [
      { slug: 'catering-meal-prep',   label: 'Catering & meal prep' },
      { slug: 'home-baker',           label: 'Home-based baker' },
      { slug: 'personal-chefs',       label: 'Personal chefs' },
      { slug: 'food-trucks',          label: 'Food trucks' },
      { slug: 'specialty-food',       label: 'Specialty & dietary food' },
      { slug: 'meal-delivery',        label: 'Meal delivery' },
      { slug: 'charcuterie',          label: 'Charcuterie & grazing boards' },
      { slug: 'cultural-cuisine',     label: 'Cultural cuisine' }
    ],
    7: [
      { slug: 'personal-training',    label: 'Personal training' },
      { slug: 'yoga-pilates',         label: 'Yoga & pilates' },
      { slug: 'massage-therapy',      label: 'Massage therapy' },
      { slug: 'nutrition-coaching',   label: 'Nutrition coaching' },
      { slug: 'life-coaching',        label: 'Life coaching' },
      { slug: 'reiki-energy',         label: 'Reiki & energy work' },
      { slug: 'acupuncture',          label: 'Acupuncture' },
      { slug: 'mental-wellness',      label: 'Mental wellness support' }
    ],
    8: [
      { slug: 'cleaning',             label: 'Cleaning services' },
      { slug: 'landscaping',          label: 'Landscaping & lawn care' },
      { slug: 'handyman',             label: 'Handyman & repairs' },
      { slug: 'painting',             label: 'Painting' },
      { slug: 'pool-maintenance',     label: 'Pool maintenance' },
      { slug: 'interior-decorating',  label: 'Interior decorating' },
      { slug: 'home-organization',    label: 'Home organization' },
      { slug: 'pest-control',         label: 'Pest control' }
    ]
  };
  var _selectedSubcats = [];
  var _preservedSubcats = []; // saved slugs UNKNOWN to the loaded taxonomy — kept invisibly, never silently dropped (see _rehydrateSubcats)
  var _subcatsTouched = false; // user interacted — hydration must never revert their picks
  var _subcatWrapEl = null, _subcatRowEl = null, _subcatCountEl = null;
  var _suggestInputEl = null, _suggestHintEl = null, _suggestPendingEl = null;
  var _pendingSuggestions = []; // this vendor's pending suggestions (all categories)

  function _currentCategoryId() {
    var sel = _getCategorySelect();
    if (sel && sel.value !== '') return parseInt(sel.value, 10);
    var raw = _vendor && (_vendor.categories_id || _vendor.category_id);
    var v = Array.isArray(raw) ? raw[0] : raw;
    return v != null ? Number(v) : null;
  }

  // #96 — hydrate from the vendor row, split THREE ways against the loaded
  // taxonomy (re-run when the LIVE taxonomy lands; no-op after any user
  // interaction):
  //   • in the CURRENT category's list  → selected (a normal pill)
  //   • known under ANOTHER category    → dropped — stale cross-category picks
  //     would count invisibly against the cap (bricking the picker at 3)
  //   • unknown ANYWHERE                → preserved — likely a DB-approved slug
  //     this page's taxonomy fetch missed; it stays saved (re-appended on
  //     save), is counted VISIBLY in the count line, and never silently
  //     vanishes from the vendor's Market card. Same never-drop principle as
  //     the locations picker's fallback pills.
  function _rehydrateSubcats() {
    if (_subcatsTouched || !_vendor) return;
    var catId = _currentCategoryId();
    var inCat = {};
    ((catId != null && _SUBCATS_BY_CAT[catId]) || []).forEach(function (s) { inCat[s.slug] = true; });
    var knownAnywhere = {};
    for (var cid in _SUBCATS_BY_CAT) if (_SUBCATS_BY_CAT.hasOwnProperty(cid)) {
      _SUBCATS_BY_CAT[cid].forEach(function (s) { knownAnywhere[s.slug] = true; });
    }
    _selectedSubcats = [];
    _preservedSubcats = [];
    (Array.isArray(_vendor.subcategories) ? _vendor.subcategories : []).forEach(function (s) {
      if (typeof s !== 'string' || !s) return;
      if (_selectedSubcats.length + _preservedSubcats.length >= _SUBCAT_CAP) return;
      if (inCat[s]) _selectedSubcats.push(s);
      else if (!knownAnywhere[s]) _preservedSubcats.push(s);
      // known-under-another-category: dropped on purpose
    });
  }

  // #96-SUGGEST — swap the baked taxonomy for the live `subcategory` table
  // (an approved suggestion becomes a pill with no script ship). Guarded:
  // stale client / Xano rollback keeps the baked list.
  function _fetchSubcatTaxonomy() {
    var sapi = window.LokaliSupabaseAPI;
    if (!sapi || !sapi.subcategories || typeof sapi.subcategories.list !== 'function') return;
    sapi.subcategories.list().then(function (out) {
      if (!out || out.error || !Array.isArray(out.data)) return;
      var byCat = {};
      out.data.forEach(function (r) {
        if (!r || r.category_id == null || !r.slug || !r.label) return;
        (byCat[r.category_id] = byCat[r.category_id] || []).push({ slug: r.slug, label: r.label });
      });
      if (!Object.keys(byCat).length) return;
      _SUBCATS_BY_CAT = byCat;
      _rehydrateSubcats();
      _renderSubcatPills();
    }).catch(function () {});
  }

  function _loadMySubcatSuggestions() {
    var sapi = window.LokaliSupabaseAPI;
    if (!sapi || !sapi.subcategories || typeof sapi.subcategories.mySuggestions !== 'function') return;
    sapi.subcategories.mySuggestions().then(function (out) {
      if (!out || out.error || !Array.isArray(out.data)) return;
      _pendingSuggestions = out.data.filter(function (r) { return r && r.status === 'pending'; });
      _renderSubcatPending();
    }).catch(function () {});
  }

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

      // #96 — subcategory block lives inside the same wrapper, under the
      // category row; shown only once a category is picked.
      var scWrap = document.createElement('div');
      scWrap.className = 'subcat-block';
      var scHint = document.createElement('p');
      scHint.className = 'category-hint subcat-hint';
      scHint.textContent = 'Now pick up to 3 specialties — customers filter The Market by these.';
      var scRow = document.createElement('div');
      scRow.className = 'category-pill-row';
      var scCount = document.createElement('p');
      scCount.className = 'subcat-count';
      scWrap.appendChild(scHint);
      scWrap.appendChild(scRow);
      scWrap.appendChild(scCount);

      // #96-SUGGEST — "Don't see your specialty?" (only when the client
      // carries the suggestion surface; stale cache / rollback = no box).
      if (window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.subcategories) {
        var sgWrap = document.createElement('div');
        sgWrap.className = 'subcat-suggest';
        var sgLabel = document.createElement('p');
        sgLabel.className = 'subcat-suggest-label';
        sgLabel.textContent = 'Don’t see your specialty?';
        var sgRow = document.createElement('div');
        sgRow.className = 'subcat-suggest-row';
        var sgInput = document.createElement('input');
        sgInput.type = 'text';
        sgInput.maxLength = 40;
        sgInput.placeholder = 'e.g. Power washing';
        sgInput.className = 'subcat-suggest-input';
        var sgBtn = document.createElement('button');
        sgBtn.type = 'button';
        sgBtn.className = 'subcat-suggest-btn';
        sgBtn.textContent = 'Suggest';
        sgRow.appendChild(sgInput);
        sgRow.appendChild(sgBtn);
        var sgHint = document.createElement('p');
        sgHint.className = 'subcat-suggest-hint';
        var sgPending = document.createElement('div');
        sgPending.className = 'subcat-suggest-pending';
        sgWrap.appendChild(sgLabel);
        sgWrap.appendChild(sgRow);
        sgWrap.appendChild(sgHint);
        sgWrap.appendChild(sgPending);
        scWrap.appendChild(sgWrap);
        _suggestInputEl = sgInput; _suggestHintEl = sgHint; _suggestPendingEl = sgPending;
        sgInput.addEventListener('input', _subcatTypeahead);
        sgBtn.addEventListener('click', _submitSubcatSuggestion);
        sgInput.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); _submitSubcatSuggestion(); }
        });
      }

      wrapper.appendChild(scWrap);

      sel.parentNode.insertBefore(wrapper, sel.nextSibling);
      _categoryPillRowEl = row;
      _subcatWrapEl = scWrap; _subcatRowEl = scRow; _subcatCountEl = scCount;
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
        var changed = String(sel.value) !== String(id);
        sel.value = String(id);
        if (changed) _dirty = true; // programmatic select.value fires no change event, so the guard misses category pill picks too
        // #96 — picks belong to one category: drop any that aren't in the
        // newly selected category's list (across-category slugs never overlap,
        // so a real switch clears them).
        if (changed) {
          var allowed = {};
          (_SUBCATS_BY_CAT[id] || []).forEach(function (s) { allowed[s.slug] = true; });
          _selectedSubcats = _selectedSubcats.filter(function (sl) { return allowed[sl]; });
        }
        _renderCategoryPills();
      });
      _categoryPillRowEl.appendChild(pill);
    });

    _renderSubcatPills(); // #96 — keep the specialty pills in step with the category
  }

  // #96 — the specialty pills (multi-select, capped). Same pill visuals as the
  // category picker; selected state = solid violet like .is-on.
  function _renderSubcatPills() {
    if (!_subcatWrapEl || !_subcatRowEl) return;
    var sel = _getCategorySelect();
    var catId = sel && sel.value !== '' ? parseInt(sel.value, 10) : null;
    var subs = catId != null ? _SUBCATS_BY_CAT[catId] : null;
    if (!subs || !subs.length) {
      _subcatWrapEl.style.display = 'none';
      return;
    }
    _subcatWrapEl.style.display = '';
    _subcatRowEl.innerHTML = '';
    subs.forEach(function (s) {
      var on = _selectedSubcats.indexOf(s.slug) !== -1;
      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'category-pill subcat-pick' + (on ? ' is-on' : '');
      pill.setAttribute('aria-pressed', on ? 'true' : 'false');
      var text = document.createElement('span');
      text.textContent = s.label;
      pill.appendChild(text);
      pill.addEventListener('click', function () {
        var i = _selectedSubcats.indexOf(s.slug);
        if (i !== -1) _selectedSubcats.splice(i, 1);
        else if (_preservedSubcats.length + _selectedSubcats.length < _SUBCAT_CAP) _selectedSubcats.push(s.slug);
        else { _flashSubcatCap(); return; }
        _subcatsTouched = true;
        _dirty = true; // pill clicks are BUTTONs — the input/change dirty guard never sees them
        _renderSubcatPills();
      });
      _subcatRowEl.appendChild(pill);
    });
    _updateSubcatCount(false);
    _renderSubcatPending(); // pending chips follow the visible category
  }

  function _updateSubcatCount(capped) {
    if (!_subcatCountEl) return;
    var n = _selectedSubcats.length + _preservedSubcats.length;
    var note = '';
    if (_preservedSubcats.length) {
      note = ' (includes ' + _preservedSubcats.length + ' earlier pick' +
        (_preservedSubcats.length > 1 ? 's' : '') + ' not in the current list — still live on your card).';
    } else if (n === 0) {
      note = ' — optional, but it helps customers find you.';
    } else {
      note = '.';
    }
    _subcatCountEl.textContent = capped
      ? 'That’s the limit — deselect one to switch.'
      : (n + ' of ' + _SUBCAT_CAP + ' selected' + note);
    _subcatCountEl.style.color = capped ? '#B3400F' : '#6B6787';
  }

  var _subcatCapTimer = null;
  function _flashSubcatCap() {
    _updateSubcatCount(true);
    if (_subcatCapTimer) clearTimeout(_subcatCapTimer);
    _subcatCapTimer = setTimeout(function () { _updateSubcatCount(false); }, 2200);
  }

  // ── #96-SUGGEST: suggest-a-specialty UI ────────────────────────────────────
  function _setSuggestHint(text, tone) {
    if (!_suggestHintEl) return;
    _suggestHintEl.textContent = text || '';
    _suggestHintEl.style.color = tone === 'error' ? '#B3400F' : (tone === 'ok' ? '#1A6640' : '#6B6787');
  }

  // Most "missing" specialties are wording mismatches — resolve them to the
  // standard pill before a suggestion is ever filed.
  function _subcatTypeahead() {
    if (!_suggestInputEl || !_suggestHintEl) return;
    var q = String(_suggestInputEl.value || '').trim().toLowerCase();
    _suggestHintEl.innerHTML = '';
    if (q.length < 2) return;
    var catId = _currentCategoryId();
    var subs = (catId != null && _SUBCATS_BY_CAT[catId]) || [];
    var match = null;
    for (var i = 0; i < subs.length; i++) {
      if (subs[i].label.toLowerCase().indexOf(q) !== -1) { match = subs[i]; break; }
    }
    if (!match) return;
    var already = _selectedSubcats.indexOf(match.slug) !== -1;
    _suggestHintEl.appendChild(document.createTextNode('Did you mean '));
    var link = document.createElement('span');
    link.className = 'subcat-suggest-link';
    link.textContent = match.label;
    (function (m) {
      link.addEventListener('click', function () { _selectSuggestedSlug(m.slug); });
    })(match);
    _suggestHintEl.appendChild(link);
    _suggestHintEl.appendChild(document.createTextNode(already ? '? It’s already selected above.' : '? Tap it to select.'));
    _suggestHintEl.style.color = '#6B6787';
  }

  // Select a slug from a typeahead/exists hint — ALL checks re-run at click
  // time (the hint can be stale after a category switch or pill toggles):
  // slug must exist in the CURRENT category's taxonomy, not be selected yet,
  // and fit the cap.
  function _selectSuggestedSlug(slug) {
    var catId = _currentCategoryId();
    var subs = (catId != null && _SUBCATS_BY_CAT[catId]) || [];
    var valid = false;
    for (var i = 0; i < subs.length; i++) if (subs[i].slug === slug) { valid = true; break; }
    if (!valid) { _setSuggestHint('That one isn’t in this category’s list anymore.', 'error'); return; }
    if (_selectedSubcats.indexOf(slug) !== -1) {
      if (_suggestInputEl) _suggestInputEl.value = '';
      _setSuggestHint('Already selected above.', 'ok');
      return;
    }
    if (_preservedSubcats.length + _selectedSubcats.length >= _SUBCAT_CAP) { _flashSubcatCap(); return; }
    _selectedSubcats.push(slug);
    _subcatsTouched = true;
    _dirty = true;
    _renderSubcatPills();
    if (_suggestInputEl) _suggestInputEl.value = '';
    _setSuggestHint('Selected — hit SAVE to keep it.', 'ok');
  }

  function _submitSubcatSuggestion() {
    if (!_suggestInputEl) return;
    var label = String(_suggestInputEl.value || '').replace(/\s+/g, ' ').trim();
    var catId = _currentCategoryId();
    if (catId == null) { _setSuggestHint('Pick your category first.', 'error'); return; }
    if (label.length < 3 || label.length > 40 || !/^[A-Za-z0-9&'’\-+/() ]+$/.test(label)) {
      _setSuggestHint('3–40 characters — letters, numbers and simple punctuation.', 'error');
      return;
    }
    var sapi = window.LokaliSupabaseAPI;
    if (!sapi || !sapi.subcategories) return;
    _setSuggestHint('Sending…');
    sapi.subcategories.suggest(catId, label).then(function (out) {
      var d = out && out.data;
      if (!d || out.error) { _setSuggestHint('Hit a snag — try again in a moment.', 'error'); return; }
      if (d.ok) {
        _pendingSuggestions.unshift({ category_id: catId, suggested_label: label, status: 'pending' });
        _renderSubcatPending();
        if (_suggestInputEl) _suggestInputEl.value = '';
        _setSuggestHint('Thanks! We review suggestions so filters stay consistent — you’ll see it here once it’s live.', 'ok');
        return;
      }
      if (d.reason === 'exists') {
        // The RPC hands back the existing slug — select it directly when the
        // local taxonomy knows it; on a stale (baked-fallback) taxonomy the
        // pill isn't renderable yet, so say so instead of a dead-end.
        var catId2 = _currentCategoryId();
        var known = false, list2 = (catId2 != null && _SUBCATS_BY_CAT[catId2]) || [];
        for (var ki = 0; ki < list2.length; ki++) if (list2[ki].slug === d.slug) { known = true; break; }
        if (known && d.slug) { _selectSuggestedSlug(d.slug); }
        else { _setSuggestHint('Good news — that specialty already exists. Reload this page to see the newest list and pick it.', 'ok'); }
        return;
      }
      if (d.reason === 'already_suggested') { _setSuggestHint('You already suggested this one — it’s under review.', 'error'); return; }
      if (d.reason === 'pending_limit') { _setSuggestHint('You have 3 suggestions under review — hang tight.', 'error'); return; }
      if (d.reason === 'invalid_label') { _setSuggestHint('3–40 characters — letters, numbers and simple punctuation.', 'error'); return; }
      _setSuggestHint('Couldn’t submit that — try different wording.', 'error');
    }).catch(function () { _setSuggestHint('Hit a snag — try again in a moment.', 'error'); });
  }

  function _renderSubcatPending() {
    if (!_suggestPendingEl) return;
    _suggestPendingEl.innerHTML = '';
    var catId = _currentCategoryId();
    _pendingSuggestions.forEach(function (p) {
      if (catId != null && Number(p.category_id) !== catId) return;
      var chip = document.createElement('span');
      chip.className = 'subcat-pending-chip';
      chip.textContent = p.suggested_label + ' — under review';
      _suggestPendingEl.appendChild(chip);
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

    // All active locations as toggle pills, plus any already-selected id the
    // active list no longer carries (deactivated community) so a saved pick is
    // never silently dropped — it stays visible and de-selectable.
    var entries = [];
    var seen = {};
    if (_locations && _locations.length) {
      for (var i = 0; i < _locations.length; i++) {
        var loc = _locations[i];
        var id = loc.id != null ? loc.id : loc.location_id;
        if (id == null) continue;
        entries.push({ id: id, label: _getLocationLabel(loc) || ('Location ' + id) });
        seen[String(id)] = true;
      }
    }
    _selectedLocationIds.forEach(function (id) {
      if (!seen[String(id)]) entries.push({ id: id, label: 'Location ' + id });
    });

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
    }
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
      // #96 — preserved (taxonomy-unknown) slugs ride along so a save can
      // never silently delete a DB-approved pick; [] clears on purpose.
      subcategories:        _preservedSubcats.concat(_selectedSubcats).slice(0, _SUBCAT_CAP),
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
          return 'Please enter a valid international number with country code (10–15 digits, e.g. +1 415 555 0123).';
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
      subcategories:        Array.isArray(payload.subcategories) ? payload.subcategories : undefined, // #96
      locations_id:         payload.locations_id
    };
  }

  function save() {
    var successEl = _getSuccessEl();
    var errorEl = _getErrorEl();
    if (successEl) successEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    window.LokaliDashboard.disableButton(SAVE_BTN, true);
    var payload = _getFormValues();
    var validationError = _validate(payload);
    if (validationError) {
      console.warn('[ProfilePage] Validation failed:', validationError);
      _showErrorPopup(validationError);
      window.LokaliDashboard.disableButton(SAVE_BTN, false);
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
      .then(function () { window.LokaliDashboard.disableButton(SAVE_BTN, false); });
  }

  return { init: init, loadData: loadData, populateUI: populateUI, bindEvents: bindEvents, save: save };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { LokaliProfilePage.init(); });
} else {
  LokaliProfilePage.init();
}
