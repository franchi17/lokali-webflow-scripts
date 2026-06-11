
(function () {
  'use strict';

  var MAX_RETRIES = 20;
  var RETRY_MS = 300;
  var DEBOUNCE_MS = 250;
  var MIN_CHARS = 3;
  var REGION_CODES = ['us'];

  function findAddressInput() {
    var ids = ['address', 'input-address', 'business-address'];
    var el = null;
    for (var i = 0; i < ids.length; i++) {
      el = document.getElementById(ids[i]);
      if (el) break;
    }
    var input = el && el.tagName === 'INPUT' ? el : (el ? el.querySelector('input') : null);
    if (!input) {
      var wrapper = document.querySelector('[data-lokali-address]');
      if (wrapper) input = wrapper.querySelector('input');
    }
    return input || null;
  }

  // ---------------------------------------------------------------------------
  // Places API (New): AutocompleteSuggestion + a lightweight dropdown attached
  // to the existing input. Used for projects created after March 2025, which
  // are only entitled to "Places API (New)" and cannot use the legacy
  // google.maps.places.Autocomplete widget.
  // ---------------------------------------------------------------------------
  function attachNewAutocomplete(input) {
    var places = google.maps.places;
    var sessionToken = null;
    var dropdown = null;
    var items = [];
    var activeIndex = -1;
    var debounceTimer = null;
    var hadSuccess = false; // a new-API request has succeeded at least once
    var usingLegacy = false; // fell back to the legacy widget

    // The presence of AutocompleteSuggestion/Place in the JS library does not
    // guarantee the key's project has "Places API (New)" enabled. If the first
    // request is rejected with a permission/not-enabled error, fall back to the
    // legacy widget for keys that only have the legacy Places API.
    function isPermissionError(err) {
      var msg = (err && (err.message || err.toString())) || '';
      return /denied|not enabled|not authorized|unauthorized|permission|forbidden|api key/i.test(msg);
    }

    function fallbackToLegacy() {
      usingLegacy = true;
      hideDropdown();
      if (!google.maps.places.Autocomplete) return;
      try {
        attachLegacyAutocomplete(input);
      } catch (e) {
        console.warn('Lokali: legacy autocomplete fallback failed', e);
      }
    }

    function ensureToken() {
      if (!sessionToken) sessionToken = new places.AutocompleteSessionToken();
      return sessionToken;
    }

    function ensureDropdown() {
      if (dropdown) return dropdown;
      dropdown = document.createElement('div');
      dropdown.className = 'lok-ac-dropdown';
      dropdown.setAttribute('role', 'listbox');
      dropdown.style.cssText =
        'position:absolute;z-index:99999;background:#fff;border:1px solid rgba(0,0,0,0.15);' +
        'border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.12);overflow:hidden;display:none;' +
        'font-size:14px;line-height:1.4;box-sizing:border-box;';
      document.body.appendChild(dropdown);
      return dropdown;
    }

    function positionDropdown() {
      if (!dropdown) return;
      var r = input.getBoundingClientRect();
      dropdown.style.left = (r.left + window.scrollX) + 'px';
      dropdown.style.top = (r.bottom + window.scrollY + 4) + 'px';
      dropdown.style.width = r.width + 'px';
    }

    function hideDropdown() {
      if (dropdown) dropdown.style.display = 'none';
      activeIndex = -1;
    }

    function setActive(i) {
      for (var idx = 0; idx < items.length; idx++) {
        items[idx].row.style.background = (idx === i) ? '#f0f4ff' : '#fff';
      }
      activeIndex = i;
    }

    function selectPrediction(pred, fallbackText) {
      hideDropdown();
      sessionToken = null; // a session ends once a place is selected
      function commit(value) {
        input.value = value || fallbackText || input.value;
        // Notify any listeners (not 'input', to avoid re-triggering the search).
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      try {
        var place = pred.toPlace();
        place.fetchFields({ fields: ['formattedAddress'] })
          .then(function () { commit(place.formattedAddress); })
          .catch(function () { commit(fallbackText); });
      } catch (e) {
        commit(fallbackText);
      }
    }

    function renderSuggestions(suggestions) {
      ensureDropdown();
      dropdown.innerHTML = '';
      items = [];
      if (!suggestions || !suggestions.length) { hideDropdown(); return; }
      for (var i = 0; i < suggestions.length; i++) {
        var pred = suggestions[i].placePrediction;
        if (!pred) continue;
        var text = (pred.text && pred.text.text) ? pred.text.text : '';
        var row = document.createElement('div');
        row.className = 'lok-ac-item';
        row.setAttribute('role', 'option');
        row.style.cssText =
          'padding:10px 12px;cursor:pointer;color:#1a1a1a;white-space:nowrap;' +
          'overflow:hidden;text-overflow:ellipsis;background:#fff;';
        row.textContent = text;
        (function (p, t, rowEl, index) {
          rowEl.addEventListener('mousedown', function (e) {
            e.preventDefault(); // keep focus on the input
            selectPrediction(p, t);
          });
          rowEl.addEventListener('mouseenter', function () { setActive(index); });
        })(pred, text, row, items.length);
        dropdown.appendChild(row);
        items.push({ row: row, pred: pred, text: text });
      }
      if (!items.length) { hideDropdown(); return; }
      positionDropdown();
      dropdown.style.display = 'block';
    }

    function fetchSuggestions(query) {
      var request = {
        input: query,
        sessionToken: ensureToken(),
        includedRegionCodes: REGION_CODES
      };
      places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
        .then(function (res) {
          hadSuccess = true;
          if (input.value.trim() !== query) return; // stale response
          renderSuggestions(res && res.suggestions);
        })
        .catch(function (err) {
          console.warn('Lokali: autocomplete fetch error', err);
          // If the new API was never reachable and this looks like the key
          // lacking "Places API (New)", switch to the legacy widget.
          if (!hadSuccess && !usingLegacy && isPermissionError(err)) {
            fallbackToLegacy();
            return;
          }
          hideDropdown();
        });
    }

    input.setAttribute('autocomplete', 'off');

    input.addEventListener('input', function () {
      if (usingLegacy) return; // legacy widget now owns this input
      var q = input.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (q.length < MIN_CHARS) { hideDropdown(); return; }
      debounceTimer = setTimeout(function () { fetchSuggestions(q); }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function (e) {
      if (!dropdown || dropdown.style.display === 'none' || !items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((activeIndex + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((activeIndex - 1 + items.length) % items.length);
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && items[activeIndex]) {
          e.preventDefault();
          selectPrediction(items[activeIndex].pred, items[activeIndex].text);
        }
      } else if (e.key === 'Escape') {
        hideDropdown();
      }
    });

    input.addEventListener('blur', function () { setTimeout(hideDropdown, 150); });
    window.addEventListener('scroll', positionDropdown, true);
    window.addEventListener('resize', positionDropdown);
  }

  // ---------------------------------------------------------------------------
  // Legacy fallback: google.maps.places.Autocomplete. Only works on projects
  // that still have access to the legacy Places API.
  // ---------------------------------------------------------------------------
  function attachLegacyAutocomplete(input) {
    var autocomplete = new google.maps.places.Autocomplete(input, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['formatted_address']
    });
    autocomplete.addListener('place_changed', function () {
      var place = autocomplete.getPlace();
      if (place.formatted_address) {
        input.value = place.formatted_address;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  window.initLokaliAutocomplete = function (retryCount) {
    retryCount = retryCount || 0;

    var input = findAddressInput();
    if (!input) {
      if (retryCount < MAX_RETRIES) {
        setTimeout(function () { window.initLokaliAutocomplete(retryCount + 1); }, RETRY_MS);
      } else {
        console.warn('Lokali: address input not found (#address, #input-address, or [data-lokali-address] input)');
      }
      return;
    }

    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
      if (retryCount < MAX_RETRIES) {
        setTimeout(function () { window.initLokaliAutocomplete(retryCount + 1); }, RETRY_MS);
      } else {
        console.warn('Lokali: Google Maps API not loaded yet');
      }
      return;
    }

    // Guard against repeated initialization (callers may invoke this more than once).
    if (input.getAttribute('data-lok-ac') === '1') return;
    input.setAttribute('data-lok-ac', '1');

    try {
      if (google.maps.places.AutocompleteSuggestion && google.maps.places.Place) {
        attachNewAutocomplete(input); // Places API (New)
      } else if (google.maps.places.Autocomplete) {
        attachLegacyAutocomplete(input); // legacy Places API
      } else {
        console.warn('Lokali: no Places autocomplete API available');
      }
    } catch (err) {
      console.warn('Lokali: Autocomplete init error', err);
    }
  };
})();
