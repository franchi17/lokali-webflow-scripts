/**
 * Lokali — vendor dashboard sidebar account chip (HYDRATION ONLY).
 *
 * The chip STRUCTURE is built natively in the Webflow "Vendor Dashboard Sidebar"
 * component (editable in the Designer). This script only:
 *   - fills the avatar / business name / plan from vendors.me()
 *   - toggles the expand/collapse menu
 *   - hides the "Upgrade" row for top-tier vendors
 * It does NOT inject DOM. No-op anywhere `.lok-acct` isn't present.
 *
 * Native element hooks (classes, set in Webflow):
 *   .lok-acct (wrapper, gets .open) · .lok-acct-chip (click target)
 *   .lok-acct-av · .lok-acct-name · .lok-acct-plan · .lok-acct-upgrade
 *
 * Load site-wide (footer), after lokali-api-client.js. See the maintainer guide.
 */
(function () {
  'use strict';

  var XANO_ORIGIN = 'https://x8ki-letl-twmt.n7.xano.io';

  function planLabel(v) {
    var p = String((v && (v.plan || v.tier || v.plan_name || v.subscription_tier || v.plan_tier)) || '').toLowerCase();
    if (p.indexOf('featured') >= 0 || p.indexOf('spotlight') >= 0) return { label: 'Featured', top: true };
    if (p.indexOf('pro') >= 0) return { label: 'Pro plan', top: false };
    if (v && v.is_founding_member) return { label: 'Founding member', top: false };
    return { label: 'Free plan', top: false };
  }
  function photoUrl(v) {
    var s = v && (v.profile_photo || v.photo || v.logo);
    if (!s || typeof s !== 'string') return '';
    s = s.trim();
    if (/[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    if (s.charAt(0) === '/') return XANO_ORIGIN + s;
    return /^https?:\/\//i.test(s) ? s : '';
  }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(function (p) { return /^[a-z0-9]/i.test(p); });
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function setText(elm, t) { if (elm) elm.textContent = t; }

  function hydrate(wrap, data) {
    var v = (data && data.vendor) ? data.vendor : (data || {});
    var name = (v.business_name || v.name) || 'Your business';
    var plan = planLabel(v);
    var photo = photoUrl(v);

    setText(wrap.querySelector('.lok-acct-name'), name);
    setText(wrap.querySelector('.lok-acct-plan'), plan.label);

    var av = wrap.querySelector('.lok-acct-av');
    if (av) {
      av.textContent = initials(name);
      if (photo) {
        var img = document.createElement('img');
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;border-radius:inherit;object-fit:cover;display:block;';
        img.onload = function () { av.textContent = ''; av.appendChild(img); };
        img.onerror = function () { /* keep initials */ };
        img.src = photo;
      }
    }

    // Hide the upgrade row for top-tier vendors.
    if (plan.top) {
      var up = wrap.querySelector('.lok-acct-upgrade');
      if (up) up.style.display = 'none';
    }
  }

  function bindToggle(wrap) {
    var chip = wrap.querySelector('.lok-acct-chip');
    var menu = wrap.querySelector('.lok-acct-menu');
    var caret = wrap.querySelector('.lok-acct-caret');
    if (!chip || !menu || chip.getAttribute('data-lok-bound')) return;
    chip.setAttribute('data-lok-bound', '1');
    var open = false;
    function set(o) { open = o; menu.style.display = o ? 'block' : 'none'; if (caret) caret.style.transform = o ? 'rotate(180deg)' : ''; }
    set(false); // start closed regardless of the Designer default
    chip.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); set(!open); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  }

  function whenApi(cb, tries) {
    tries = tries || 0;
    if (window.LokaliAPI && window.LokaliAPI.vendors) return cb();
    if (tries > 40) return;
    setTimeout(function () { whenApi(cb, tries + 1); }, 250);
  }

  function init() {
    // Target ONLY the native dashboard-sidebar chip. The header account menu
    // (lokali-auth-nav.js) reuses the same .lok-acct/.lok-acct-name classes but
    // marks its wrapper with data-lok-acct="1" — exclude it, or this would
    // overwrite the header name with the vendor business_name ("Your business").
    var wrap = document.querySelector('.lok-acct:not([data-lok-acct])');
    if (!wrap) return; // native chip not on this page
    bindToggle(wrap);
    whenApi(function () {
      window.LokaliAPI.vendors.me().then(function (res) {
        hydrate(wrap, (res && !res.error && res.data) ? res.data : null);
      }).catch(function () {});
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
