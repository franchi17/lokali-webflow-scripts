/*
  Lokali — Vendor Profile page logic (/vendor-dashboard/profile)
  Hosted version of the former inline "profile-page-body-embed.html" paste.
  Ships via jsDelivr from lokali-webflow-scripts; load with ONE tag on the
  profile page AFTER the sitewide bundle:
    lokali-api-client.js → lokali-clerk-auth.js → lokali-dashboard.js
  Contains (in order): injected page styles (field colors + locations chips UI),
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
  injectStyle("lokali-locations-ui-style", "  .location-multi {\n    font-family: \"Plus Jakarta Sans\", system-ui, -apple-system, sans-serif;\n    background: #eee6ff;\n    padding: 12px 14px;\n    border-radius: 8px;\n    box-sizing: border-box;\n  }\n  .location-chips {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 8px;\n    margin-bottom: 8px;\n  }\n  .location-chip {\n    display: inline-flex;\n    align-items: center;\n    gap: 6px;\n    background: #fff;\n    color: #6002ee;\n    border: 1px solid #6002ee;\n    border-radius: 999px;\n    padding: 6px 10px 6px 12px;\n    font-size: 14px;\n    line-height: 1.3;\n  }\n  .location-chip-remove {\n    font-family: inherit;\n    background: none;\n    border: none;\n    color: #6002ee;\n    cursor: pointer;\n    font-size: 18px;\n    line-height: 1;\n    padding: 0 2px;\n    opacity: 0.85;\n  }\n  .location-chip-remove:hover {\n    opacity: 1;\n    color: #4a01c7;\n  }\n  .location-input {\n    font-family: inherit;\n    width: 100%;\n    max-width: 100%;\n    box-sizing: border-box;\n    border: 1px solid #6002ee;\n    border-radius: 6px;\n    padding: 10px 12px;\n    color: #6002ee;\n    background: #fff;\n    font-size: 14px;\n  }\n  .location-input::placeholder {\n    color: rgba(96, 2, 238, 0.45);\n  }\n  .location-dropdown {\n    background: #fff;\n    border: 1px solid #6002ee;\n    border-radius: 6px;\n    margin-top: 4px;\n    max-height: 200px;\n    overflow-y: auto;\n    box-shadow: 0 4px 12px rgba(96, 2, 238, 0.12);\n  }\n  .location-option {\n    padding: 10px 12px;\n    color: #6002ee;\n    cursor: pointer;\n    font-size: 14px;\n  }\n  .location-option:hover {\n    background: #eee6ff;\n  }");
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
  var _locationChipsEl = null;
  var _locationInputEl = null;
  var _locationDropdownEl = null;
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

  // The Webflow form has no native inputs for payment handles, so we inject them
  // (heading + input pairs) right after the Instagram field, reusing the exact
  // Webflow classes so they inherit the form's styling. Idempotent.
  var _PAY_FIELDS = [
    { id: 'input-venmo',         label: 'Venmo username',      ph: 'eg. your-venmo-name (no @)' },
    { id: 'input-cashapp',       label: 'Cash App $Cashtag',   ph: 'eg. yourcashtag (no $)' },
    { id: 'input-paypal',        label: 'PayPal.Me',           ph: 'eg. yourpaypalname' },
    { id: 'input-otherpay-url',  label: 'Other payment link',  ph: 'https://…' },
    { id: 'input-otherpay-label', label: 'Label for the link (optional)', ph: 'eg. Buy Me a Coffee' }
  ];
  function _injectPaymentFields() {
    if (document.getElementById('input-venmo')) return; // already injected
    var anchor = document.getElementById('input-instagram') || document.getElementById('website');
    if (!anchor || !anchor.parentNode) return;
    var parent = anchor.parentNode;
    // Insert after the anchor input (and after any heading that follows it).
    var insertAfter = anchor;
    var frag = document.createDocumentFragment();
    var groupHeading = document.createElement('div');
    groupHeading.className = 'input-heading';
    groupHeading.textContent = 'Payment links (optional)';
    groupHeading.style.marginTop = '6px';
    frag.appendChild(groupHeading);
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
      frag.appendChild(h);
      frag.appendChild(inp);
    });
    if (insertAfter.nextSibling) parent.insertBefore(frag, insertAfter.nextSibling);
    else parent.appendChild(frag);
  }

  function populateUI() {
    if (!_vendor) return;
    _injectPaymentFields();
    _dbg('[LokaliProfile] tagline value from API:', JSON.stringify(_vendor.tagline), '| business_tagline:', JSON.stringify(_vendor.business_tagline));

    _setTextValueAnyId(['input-business-name', 'business-name', 'business_name'], _v('business_name', 'businessName'));
    _setDescriptionValue(_v('business_description', 'businessDescription'));
    _setTextValueAnyId(['input-tagline', 'tagline', 'business-tagline', 'business_tagline'], _v('tagline', 'business_tagline', 'businessTagline'));
    _setTextValueAnyId(['input-instagram', 'instagram', 'instagram-handle', 'instagram_handle', 'instagram_url'], _v('instagram_url', 'instagram_handle', 'instagram'));
    _setTextValueAnyId(['input-website', 'website', 'website_url'], _v('website_url', 'websiteUrl'));
    _setTextValueAnyId(['input-venmo'], _v('venmo_username'));
    _setTextValueAnyId(['input-cashapp'], _v('cashapp_cashtag'));
    _setTextValueAnyId(['input-paypal'], _v('paypalme_slug'));
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

  function _initLocationTokenMultiSelect() {
    var container = document.getElementById('locations-token') || document.getElementById('locations') || document.getElementById('service-areas') || document.querySelector('[data-lokali-locations]');
    if (!container) return;

    container.innerHTML = '';

    var wrapper = document.createElement('div');
    wrapper.className = 'location-multi';

    var chips = document.createElement('div');
    chips.className = 'location-chips';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'location-input';
    input.setAttribute('placeholder', 'Add locations…');
    input.setAttribute('autocomplete', 'off');

    var dropdown = document.createElement('div');
    dropdown.className = 'location-dropdown';
    dropdown.style.display = 'none';

    wrapper.appendChild(chips);
    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);
    container.appendChild(wrapper);

    _locationChipsEl = chips;
    _locationInputEl = input;
    _locationDropdownEl = dropdown;

    _renderLocationChips();

    input.addEventListener('input', function () {
      _updateLocationSuggestions(input.value || '');
    });

    input.addEventListener('focus', function () {
      _updateLocationSuggestions(input.value || '');
    });

    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  function _renderLocationChips() {
    if (!_locationChipsEl) return;
    _locationChipsEl.innerHTML = '';

    if (!_selectedLocationIds || !_selectedLocationIds.length) return;

    _selectedLocationIds.forEach(function (id) {
      var loc = null;
      if (_locations && _locations.length) {
        for (var i = 0; i < _locations.length; i++) {
          var candidate = _locations[i];
          var candId = candidate.id != null ? candidate.id : candidate.location_id;
          if (String(candId) === String(id)) {
            loc = candidate;
            break;
          }
        }
      }

      var label = loc ? _getLocationLabel(loc) : String(id);

      var chip = document.createElement('span');
      chip.className = 'location-chip';
      chip.textContent = label;

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'location-chip-remove';
      remove.textContent = '×';
      remove.addEventListener('click', function () {
        _selectedLocationIds = _selectedLocationIds.filter(function (x) {
          return String(x) !== String(id);
        });
        _renderLocationChips();
      });

      chip.appendChild(remove);
      _locationChipsEl.appendChild(chip);
    });
  }

  function _updateLocationSuggestions(query) {
    if (!_locationDropdownEl) return;

    var q = (query || '').toLowerCase();
    var suggestions = [];

    if (_locations && _locations.length) {
      for (var i = 0; i < _locations.length; i++) {
        var loc = _locations[i];
        var id = loc.id != null ? loc.id : loc.location_id;
        var label = _getLocationLabel(loc);
        if (id == null) continue;

        if (_selectedLocationIds.some(function (x) { return String(x) === String(id); })) {
          continue;
        }

        if (!q || (label && label.toLowerCase().indexOf(q) !== -1)) {
          suggestions.push({ id: id, label: label || ('Location ' + id) });
        }

        if (suggestions.length >= 10) break;
      }
    }

    _locationDropdownEl.innerHTML = '';

    if (!suggestions.length) {
      _locationDropdownEl.style.display = 'none';
      return;
    }

    suggestions.forEach(function (sugg) {
      var item = document.createElement('div');
      item.className = 'location-option';
      item.textContent = sugg.label;
      item.addEventListener('click', function () {
        var n = parseInt(sugg.id, 10);
        if (!isNaN(n) && !_selectedLocationIds.some(function (x) { return String(x) === String(n); })) {
          _selectedLocationIds.push(n);
          _renderLocationChips();
        }
        if (_locationInputEl) {
          _locationInputEl.value = '';
          _locationInputEl.focus();
        }
        _locationDropdownEl.style.display = 'none';
      });
      _locationDropdownEl.appendChild(item);
    });

    _locationDropdownEl.style.display = 'block';
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
      other_pay_url:        _getValueByAnyId(['input-otherpay-url']),
      other_pay_label:      _getValueByAnyId(['input-otherpay-label']),
      contact_email:        _getValueByAnyId(['input-contact-email', 'contact-email', 'contact_email', 'public_email']),
      phone_number:         phoneNumber,
      address:              addressValue,
      profile_photo:        profilePhoto,
      text_messages:        bool('checkbox-text-messages'),
      whatsapp_messages:    bool('checkbox-whatsapp'),
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
      other_pay_url:        payload.other_pay_url != null ? String(payload.other_pay_url) : '',
      other_pay_label:      payload.other_pay_label != null ? String(payload.other_pay_label) : '',
      contact_email:        payload.contact_email != null ? String(payload.contact_email) : '',
      phone_number:         payload.phone_number != null ? String(payload.phone_number) : '',
      address:              payload.address != null ? String(payload.address) : '',
      profile_photo:        (payload.profile_photo != null ? String(payload.profile_photo) : (payload.profilePhoto != null ? String(payload.profilePhoto) : '')),
      text_messages:        !!payload.text_messages,
      whatsapp_messages:    !!payload.whatsapp_messages,
      category_id:          payload.category_id != null ? payload.category_id : null,
      categories_id:        payload.categories_id,
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
