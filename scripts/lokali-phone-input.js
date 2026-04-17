

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
    input.setAttribute(
      'placeholder',
      placeholder || '+1 415 555 0123'
    );
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
