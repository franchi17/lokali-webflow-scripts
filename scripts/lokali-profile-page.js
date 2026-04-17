

var LokaliProfilePage = (function () {
  'use strict';

  var LOCATIONS_UI_CSS =
    '.location-multi{font-family:"Plus Jakarta Sans",system-ui,-apple-system,sans-serif;background:#eee6ff;padding:12px 14px;border-radius:8px;box-sizing:border-box}' +
    '.location-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}' +
    '.location-chip{display:inline-flex;align-items:center;gap:6px;background:#fff;color:#6002ee;border:1px solid #6002ee;border-radius:999px;padding:6px 10px 6px 12px;font-size:14px;line-height:1.3}' +
    '.location-chip-remove{font-family:inherit;background:none;border:none;color:#6002ee;cursor:pointer;font-size:18px;line-height:1;padding:0 2px;opacity:.85}' +
    '.location-chip-remove:hover{opacity:1;color:#4a01c7}' +
    '.location-input{font-family:inherit;width:100%;max-width:100%;box-sizing:border-box;border:1px solid #6002ee;border-radius:6px;padding:10px 12px;color:#6002ee;background:#fff;font-size:14px}' +
    '.location-input::placeholder{color:rgba(96,2,238,.45)}' +
    '.location-dropdown{background:#fff;border:1px solid #6002ee;border-radius:6px;margin-top:4px;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(96,2,238,.12)}' +
    '.location-option{padding:10px 12px;color:#6002ee;cursor:pointer;font-size:14px}' +
    '.location-option:hover{background:#eee6ff}';

  function _injectLocationStyles() {
    if (document.getElementById('lokali-locations-ui-style')) return;
    var s = document.createElement('style');
    s.id = 'lokali-locations-ui-style';
    s.textContent = LOCATIONS_UI_CSS;
    document.head.appendChild(s);
  }

  var SAVE_BTN   = 'profile-save-btn';
  var SUCCESS_ID = 'profile-save-success';
  var ERROR_ID   = 'profile-save-error';

  var _vendor = null;
  var _user   = null;
  var _categories = null;
  var _locations = null;
  var _selectedLocationIds = [];
  var _locationChipsEl = null;
  var _locationInputEl = null;
  var _locationDropdownEl = null;
  var _phone  = null;

  function init() {
    if (!window.LokaliDashboard.requireAuth()) return;

    _injectLocationStyles();

    window.LokaliDashboard.preventFormSubmit();
    window.LokaliDashboard.disableButton(SAVE_BTN, true);

    _initPhoneField();

    loadData()
      .then(function () {
        populateUI();
        bindEvents();
        window.LokaliDashboard.disableButton(SAVE_BTN, false);
      })
      .catch(function (err) {
        console.error('[ProfilePage] init error:', err);
        window.LokaliDashboard.showError(ERROR_ID);
        window.LokaliDashboard.disableButton(SAVE_BTN, false);
      });
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
      window.LokaliAPI.auth.me()
    ]).then(function (results) {
      var vendorRes = results[0];
      var categoriesRes = results[1];
      var locationsRes = results[2];
      var authRes = results[3];

      if (vendorRes.error) return Promise.reject(new Error(vendorRes.error));
      _vendor = vendorRes.data;

      if (!authRes.error && authRes.data) {
        _user = authRes.data.user || authRes.data;
      }

      if (!categoriesRes.error && categoriesRes.data != null) {
        _categories = Array.isArray(categoriesRes.data)
          ? categoriesRes.data
          : (categoriesRes.data.records || categoriesRes.data.items || []);
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

  function _setTextValueAnyId(ids, value) {
    var str = value != null ? String(value) : '';
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      var input = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el : (el.querySelector && (el.querySelector('input') || el.querySelector('textarea')));
      if (input) {
        input.value = str;
        return;
      }
    }
  }

  function _v(key, altKey) {
    if (!_vendor) return '';
    var v = _vendor[key];
    if (v != null && v !== '') return v;
    if (altKey) v = _vendor[altKey];
    return v != null ? v : '';
  }

  function _getUserPreferredName() {
    if (!_user) return '';
    return _user.name || _user.preferred_name || _user.first_name || '';
  }

  function populateUI() {
    if (!_vendor) return;

    _setTextValueAnyId(['input-preferred-name', 'preferred-name'], _getUserPreferredName());

    _setTextValueAnyId(['input-business-name', 'business-name', 'business_name'], _v('business_name', 'businessName'));
    _setTextValueAnyId(['textarea-description', 'description', 'business-description'], _v('business_description', 'businessDescription'));
    _setTextValueAnyId(['input-tagline', 'tagline', 'business-tagline'], _v('tagline', 'businessTagline'));
    _setTextValueAnyId(['input-website', 'website', 'website_url'], _v('website_url', 'websiteUrl'));
    _setTextValueAnyId(['input-contact-email', 'contact-email', 'contact_email', 'public_email'], _v('contact_email', 'contactEmail'));

    var addressEl = document.getElementById('input-address') || document.getElementById('address') || document.getElementById('business-address') || document.querySelector('[data-lokali-address]');
    if (addressEl) {
      var addrInput = (addressEl.tagName === 'INPUT') ? addressEl : (addressEl.querySelector && addressEl.querySelector('input')) || addressEl;
      if (addrInput && addrInput.value !== undefined) addrInput.value = _v('address') || '';
    }

    _setTextValueAnyId(['input-photo-url', 'photo-url'], _v('profile_photo', 'profilePhoto'));

    if (_phone && _vendor.phone_number) {
      _phone.setNumber(_vendor.phone_number);
    } else {
      _setTextValueAnyId(['input-phone', 'phone'], _vendor.phone_number || '');
    }

    if (_vendor.profile_photo) {
      window.LokaliDashboard.setImageSrc('profile-photo-preview', _vendor.profile_photo);
    }

    _setTextValueAnyId(['input-instagram', 'instagram'],        _v('instagram_handle', 'instagram'));
    _setTextValueAnyId(['input-booking-link', 'booking-link'], _v('booking_link', 'bookingLink'));

    var responseTimeEl = document.getElementById('select-response-time') || document.getElementById('response-time');
    if (responseTimeEl) {
      var rt = _vendor.response_time || '';
      var sel = responseTimeEl.tagName === 'SELECT' ? responseTimeEl : responseTimeEl.querySelector('select');
      if (sel) sel.value = rt;
    }

    window.LokaliDashboard.setCheckboxValue('checkbox-text-messages',       _vendor.text_messages        || false);
    window.LokaliDashboard.setCheckboxValue('checkbox-whatsapp',            _vendor.whatsapp_messages    || false);
    window.LokaliDashboard.setCheckboxValue('checkbox-custom-requests',     _vendor.accepts_custom_requests || false);
    window.LokaliDashboard.setCheckboxValue('checkbox-highlight-women',     _vendor.highlight_women_owned   || false);
    window.LokaliDashboard.setCheckboxValue('checkbox-highlight-black',     _vendor.highlight_black_owned   || false);
    window.LokaliDashboard.setCheckboxValue('checkbox-highlight-latino',    _vendor.highlight_latino_owned  || false);
    window.LokaliDashboard.setCheckboxValue('checkbox-highlight-lgbtq',     _vendor.highlight_lgbtq_owned   || false);
    window.LokaliDashboard.setCheckboxValue('checkbox-highlight-veteran',   _vendor.highlight_veteran_owned || false);
    window.LokaliDashboard.setCheckboxValue('checkbox-highlight-eco',       _vendor.highlight_eco_friendly  || false);

    var primaryCategory = Array.isArray(_vendor.categories_id) ? _vendor.categories_id[0] : _vendor.categories_id;
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

  function _getCategorySelect() {
    var el = document.getElementById('select-category');
    if (!el) return null;
    return el.tagName === 'SELECT' ? el : el.querySelector('select');
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
    var container = document.getElementById('locations-token');
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

  function bindEvents() {
    var photoInput = document.getElementById('input-photo-url') || document.getElementById('photo-url');
    if (photoInput) {
      photoInput.addEventListener('input', function () {
        var url = photoInput.value.trim();
        if (url) window.LokaliDashboard.setImageSrc('profile-photo-preview', url);
      });
    }

    var saveBtn = document.getElementById(SAVE_BTN);
    if (saveBtn) {
      saveBtn.addEventListener('click', save);
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

  function _getResponseTime() {
    var el = document.getElementById('select-response-time') || document.getElementById('response-time');
    if (!el) return '';
    var sel = el.tagName === 'SELECT' ? el : el.querySelector('select');
    return sel ? sel.value : '';
  }

  function _getFormValues() {
    function bool(id)   { var el = document.getElementById(id); return el ? !!el.checked : false; }

    var phoneNumber = _phone ? _phone.getNumber() : _getValueByAnyId(['input-phone', 'phone']);

    var categorySelect = _getCategorySelect();
    var categoryId = categorySelect && categorySelect.value !== '' ? parseInt(categorySelect.value, 10) : null;
    var locationIds = _selectedLocationIds ? _selectedLocationIds.slice() : [];

    var descEl = document.getElementById('textarea-description') || document.getElementById('description') || document.getElementById('business-description');
    var businessDescription = '';
    if (descEl) {
      var descInput = (descEl.tagName === 'TEXTAREA' || descEl.tagName === 'INPUT') ? descEl : (descEl.querySelector && (descEl.querySelector('textarea') || descEl.querySelector('input')));
      if (descInput && descInput.value != null) businessDescription = String(descInput.value).trim();
    }

    var addressEl = document.getElementById('input-address') || document.getElementById('address') || document.getElementById('business-address') || document.querySelector('[data-lokali-address]');
    var addressValue = '';
    if (addressEl) {
      var addrInput = (addressEl.tagName === 'INPUT') ? addressEl : (addressEl.querySelector && addressEl.querySelector('input')) || addressEl;
      if (addrInput && addrInput.value != null) addressValue = String(addrInput.value).trim();
    }

    return {
      preferred_name:       _getValueByAnyId(['input-preferred-name', 'preferred-name']),
      business_name:        _getValueByAnyId(['input-business-name', 'business-name', 'business_name']),
      business_description: businessDescription,
      tagline:              _getValueByAnyId(['input-tagline', 'tagline', 'business-tagline']),
      website_url:          _getValueByAnyId(['input-website', 'website', 'website_url']),
      contact_email:        _getValueByAnyId(['input-contact-email', 'contact-email', 'contact_email', 'public_email']),
      phone_number:         phoneNumber,
      address:              addressValue,
      profile_photo:        _getValueByAnyId(['input-photo-url', 'photo-url']),
      instagram_handle:          _getValueByAnyId(['input-instagram', 'instagram']),
      booking_link:              _getValueByAnyId(['input-booking-link', 'booking-link']),
      response_time:             _getResponseTime(),
      text_messages:             bool('checkbox-text-messages'),
      whatsapp_messages:         bool('checkbox-whatsapp'),
      accepts_custom_requests:   bool('checkbox-custom-requests'),
      highlight_women_owned:     bool('checkbox-highlight-women'),
      highlight_black_owned:     bool('checkbox-highlight-black'),
      highlight_latino_owned:    bool('checkbox-highlight-latino'),
      highlight_lgbtq_owned:     bool('checkbox-highlight-lgbtq'),
      highlight_veteran_owned:   bool('checkbox-highlight-veteran'),
      highlight_eco_friendly:    bool('checkbox-highlight-eco'),
      categories_id: categoryId !== null
        ? _replaceFirst(_vendor ? _vendor.categories_id : [], categoryId)
        : (_vendor ? _vendor.categories_id : []),
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
    if (!payload.business_name) return 'Business name is required.';
    if (!payload.contact_email) return 'Contact email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contact_email)) return 'Please enter a valid email address.';

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

  function save() {
    window.LokaliDashboard.hideMessage(SUCCESS_ID);
    window.LokaliDashboard.hideMessage(ERROR_ID);
    window.LokaliDashboard.disableButton(SAVE_BTN, true);

    var payload = _getFormValues();
    var validationError = _validate(payload);

    if (validationError) {
      console.warn('[ProfilePage] Validation failed:', validationError);
      window.LokaliDashboard.showError(ERROR_ID);
      window.LokaliDashboard.disableButton(SAVE_BTN, false);
      return;
    }

    var preferredName = payload.preferred_name;
    var vendorSave = window.LokaliAPI.vendors.updateMe(payload);
    var profileSave = preferredName !== ''
      ? window.LokaliAPI.auth.updateProfile({ name: preferredName })
      : Promise.resolve({ error: null });

    Promise.all([vendorSave, profileSave])
      .then(function (results) {
        var vendorRes = results[0];
        var profileRes = results[1];
        if (vendorRes.error || profileRes.error) {
          console.error('[ProfilePage] save error:', vendorRes.error || profileRes.error);
          window.LokaliDashboard.showError(ERROR_ID);
        } else {
          _vendor = vendorRes.data;
          if (profileRes.data && profileRes.data.user) _user = profileRes.data.user;
          window.LokaliDashboard.showSuccess(SUCCESS_ID);
        }
      })
      .catch(function (err) {
        console.error('[ProfilePage] save network error:', err);
        window.LokaliDashboard.showError(ERROR_ID);
      })
      .then(function () {
        window.LokaliDashboard.disableButton(SAVE_BTN, false);
      });
  }

  return { init: init, loadData: loadData, populateUI: populateUI, bindEvents: bindEvents, save: save };

})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { LokaliProfilePage.init(); });
} else {
  LokaliProfilePage.init();
}
