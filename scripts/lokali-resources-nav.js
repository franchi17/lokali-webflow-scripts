/*
  Lokali — "Vendor Resources" header dropdown (nav injection).

  Adds a "Vendor Resources" item to the header nav, right after Pricing, that
  reveals the vendor-resources guide pages. Injected by JS (same established
  pattern as lokali-auth-nav.js / lokali-availability.js) so the shared Webflow
  header component is never edited — additive + trivially reversible (remove the
  one footer <script> tag and it's gone).

  Responsive by design, works in BOTH nav menus:
    - Desktop list (.header-nav-menu-list, not in .w-nav-menu): a hover/click
      dropdown panel positioned under the trigger.
    - Mobile hamburger list (inside .w-nav-menu / .show-in-tablet): a tap-to-
      expand inline accordion (hover doesn't exist on touch).

  Load site-wide via the footer:
    <script src="https://cdn.jsdelivr.net/gh/franchi17/lokali-webflow-scripts@v1.4/scripts/lokali-resources-nav.js"></script>

  Self-contained, idempotent (safe to run twice / on every page). Matches the
  live nav link styling: Plus Jakarta Sans, 16px/500, brand violet #6002EE.
*/
(function () {
  'use strict';

  var BRAND = '#6002EE';
  var FONT = "'Plus Jakarta Sans', sans-serif";
  // Onboarding-ish order: set up the profile, pick categories, add photos, then
  // turn on availability. Keep labels short — they wrap on mobile otherwise.
  var LINKS = [
    { href: '/vendor-resources/profile-photo-guide', label: 'Profile Photo Guide' },
    { href: '/vendor-resources/categories-guide',    label: 'Categories Guide' },
    { href: '/vendor-resources/product-photo-guide', label: 'Product Photo Guide' },
    { href: '/vendor-resources/service-photo-guide', label: 'Service Photo Guide' },
    { href: '/vendor-resources/availability-guide',  label: 'Availability Guide' }
  ];

  function injectStyles() {
    if (document.getElementById('lok-res-styles')) return;
    var css =
      '.lok-res-li{position:relative;}' +
      '.lok-res-trig{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-family:' + FONT + ';' +
        'font-size:16px;font-weight:500;color:' + BRAND + ';background:none;border:none;padding:0;margin:0;line-height:inherit;}' +
      '.lok-res-car{display:inline-block;width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;' +
        'transform:rotate(45deg) translateY(-1px);transition:transform .2s;flex-shrink:0;}' +
      // caret flips on desktop hover OR when pinned open (click); mobile uses .open only
      '.lok-res-li:not(.mob):hover > .lok-res-trig .lok-res-car,' +
      '.lok-res-li.open > .lok-res-trig .lok-res-car{transform:rotate(-135deg) translateY(2px);}' +
      // desktop floating panel — opens on pure-CSS :hover (robust; no JS event quirks) or .open
      '.lok-res-panel{position:absolute;top:100%;left:0;margin-top:12px;min-width:230px;background:#fff;border:1px solid #ECE8F6;' +
        'border-radius:14px;box-shadow:0 14px 34px rgba(60,45,120,.16);padding:8px;opacity:0;visibility:hidden;' +
        'transform:translateY(-6px);transition:opacity .16s ease,transform .16s ease,visibility .16s ease;z-index:9999;}' +
      // a hit-bridge so the cursor can cross the gap from trigger to panel without closing
      '.lok-res-li:not(.mob) > .lok-res-panel::before{content:"";position:absolute;top:-12px;left:0;right:0;height:12px;}' +
      '.lok-res-li:not(.mob):hover > .lok-res-panel,' +
      '.lok-res-li.open > .lok-res-panel{opacity:1;visibility:visible;transform:translateY(0);}' +
      '.lok-res-panel a{display:block;font-family:' + FONT + ';font-size:14px;font-weight:500;color:#45415A;text-decoration:none;' +
        'padding:9px 12px;border-radius:9px;white-space:nowrap;}' +
      '.lok-res-panel a:hover{background:#F4F1FB;color:' + BRAND + ';}' +
      // mobile accordion variant (inside the hamburger menu)
      '.lok-res-li.mob .lok-res-trig{display:flex;justify-content:space-between;width:100%;}' +
      '.lok-res-li.mob .lok-res-panel{position:static;opacity:1;visibility:visible;transform:none;box-shadow:none;border:none;' +
        'background:none;padding:0 0 0 14px;margin:4px 0 0;min-width:0;max-height:0;overflow:hidden;transition:max-height .24s ease;}' +
      '.lok-res-li.mob.open .lok-res-panel{max-height:360px;}' +
      '.lok-res-li.mob .lok-res-panel a{padding:8px 6px;}';
    var s = document.createElement('style');
    s.id = 'lok-res-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function buildPanel() {
    var p = document.createElement('div');
    p.className = 'lok-res-panel';
    LINKS.forEach(function (l) {
      var a = document.createElement('a');
      a.href = l.href;
      a.textContent = l.label;
      p.appendChild(a);
    });
    return p;
  }

  function inject(ul) {
    if (!ul || ul.querySelector('.lok-res-li')) return;          // idempotent per list
    var pricing = ul.querySelector('a[href*="/pricing"]');
    var anchorLi = pricing ? pricing.closest('li') : null;
    var isMobile = !!ul.closest('.w-nav-menu, .show-in-tablet');

    var li = document.createElement('li');
    li.className = (anchorLi ? anchorLi.className + ' ' : 'header-nav-list-item middle ') + 'lok-res-li' + (isMobile ? ' mob' : '');

    var trig = document.createElement('button');
    trig.className = 'lok-res-trig';
    trig.setAttribute('type', 'button');
    trig.setAttribute('aria-haspopup', 'true');
    trig.setAttribute('aria-expanded', 'false');
    trig.innerHTML = 'Resources<i class="lok-res-car" aria-hidden="true"></i>';

    var panel = buildPanel();
    li.appendChild(trig);
    li.appendChild(panel);

    if (anchorLi && anchorLi.parentNode === ul) ul.insertBefore(li, anchorLi.nextSibling);
    else ul.appendChild(li);

    function setOpen(open) {
      li.classList.toggle('open', open);
      trig.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    // Desktop reveal is pure CSS :hover (see stylesheet) — bulletproof. JS only
    // handles the tap/click path: the mobile accordion, and touch/click-to-pin
    // on desktop (where :hover doesn't fire on a tap).
    trig.addEventListener('click', function (e) {
      e.preventDefault();
      setOpen(!li.classList.contains('open'));
    });
    if (!isMobile) {
      document.addEventListener('click', function (e) { if (!li.contains(e.target)) setOpen(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    }
  }

  function run() {
    var lists = document.querySelectorAll('.header-nav-menu-list');
    if (!lists.length) return false;
    injectStyles();
    Array.prototype.forEach.call(lists, inject);
    return true;
  }

  function boot() {
    if (run()) return;
    // The header is server-rendered, but retry briefly in case it paints late.
    var n = 0, t = setInterval(function () { if (run() || ++n > 20) clearInterval(t); }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
