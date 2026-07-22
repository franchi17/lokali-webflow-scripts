/*
  Lokali — sticky header (desktop) + back-to-top button (mobile).

  Desktop (>=992px): pins the shared Webflow header (.header-wrapper.w-nav) to
  the top of the viewport once the page scrolls, with a soft shadow. Uses
  position:fixed + an equal-height placeholder (NOT position:sticky — sticky
  silently breaks under ancestor overflow rules, fixed never does) so content
  doesn't jump when the header detaches.

  Mobile (<992px): the header is left alone (screen space is precious); instead
  a floating back-to-top button fades in after ~600px of scrolling.

  Additive + reversible (same pattern as lokali-resources-nav.js): load
  site-wide from the footer; remove the <script> tag to undo everything.
  Dropdowns inside the header (Resources, account menu) keep working — they're
  positioned relative to elements inside the fixed header.
*/
(function () {
  'use strict';

  var BRAND = '#6002ee';
  var DESK = window.matchMedia('(min-width: 992px)');

  function injectCss() {
    if (document.getElementById('lok-stick-css')) return;
    var s = document.createElement('style');
    s.id = 'lok-stick-css';
    s.textContent =
      '.lok-stick-fixed{position:fixed!important;top:0;left:0;right:0;z-index:950;' +
        'background:#fff;box-shadow:0 6px 22px rgba(26,24,41,.08);}' +
      // White circle + violet arrow: the old brand-violet fill vanished against
      // the vendor page's violet Send-a-message bar (Francesca 2026-07-20).
      // z-index must sit BELOW every overlay/backdrop (Market filter drawer
      // 199/200, mobile nav 9997/9998) so an open drawer covers the button.
      '#lok-totop{position:fixed;right:16px;bottom:18px;z-index:150;width:44px;height:44px;border-radius:50%;' +
        'background:#fff;color:' + BRAND + ';border:1.5px solid #E4DFF6;cursor:pointer;display:flex;align-items:center;' +
        'justify-content:center;box-shadow:0 8px 22px rgba(38,10,80,.22);opacity:0;visibility:hidden;' +
        'transform:translateY(8px);transition:opacity .2s ease,transform .2s ease,visibility .2s ease;}' +
      '#lok-totop.show{opacity:1;visibility:visible;transform:translateY(0);}' +
      // Vendor one-page (<768px) pins a fixed contact bar to the bottom — ride
      // above it (bar = 10+46+10 padding/button + the device safe-area inset).
      '@media (max-width:767px){html.vl-op #lok-totop{bottom:calc(84px + env(safe-area-inset-bottom));}}' +
      '@media (min-width:992px){#lok-totop{display:none;}}';
    document.head.appendChild(s);
  }

  function init() {
    var header = document.querySelector('.header-wrapper.w-nav');
    if (!header || document.getElementById('lok-stick-ph')) return;
    injectCss();

    // Placeholder that holds the header's space while it's fixed (no jump).
    var ph = document.createElement('div');
    ph.id = 'lok-stick-ph';
    ph.style.display = 'none';
    header.parentNode.insertBefore(ph, header.nextSibling);

    var stuck = false;
    function stick() {
      if (stuck) return;
      ph.style.height = header.offsetHeight + 'px';
      ph.style.display = 'block';
      header.classList.add('lok-stick-fixed');
      stuck = true;
    }
    function unstick() {
      if (!stuck) return;
      header.classList.remove('lok-stick-fixed');
      ph.style.display = 'none';
      stuck = false;
    }

    // Back-to-top (mobile only via CSS media query).
    var top = document.createElement('button');
    top.id = 'lok-totop';
    top.setAttribute('aria-label', 'Back to top');
    top.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    document.body.appendChild(top);
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // No rAF throttle: the work is two class toggles (cheap), and a rAF-gated
    // handler can deadlock if the first event fires while the tab is hidden
    // (rAF never runs there, leaving the gate stuck closed).
    function onScroll() {
      var y = window.scrollY || document.documentElement.scrollTop;
      if (DESK.matches && y > 4) stick(); else unstick();
      top.classList.toggle('show', !DESK.matches && y > 600);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (DESK.addEventListener) DESK.addEventListener('change', onScroll);
    onScroll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
