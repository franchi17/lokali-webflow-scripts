

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
