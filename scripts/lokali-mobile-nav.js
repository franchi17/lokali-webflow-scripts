/*
  Lokali — Mobile nav fix.
  The Webflow header's native hamburger toggle is broken: the nav menu was wrapped in a
  custom `.show-in-tablet` div (not a direct child of the navbar) so Webflow's built-in
  open/close no longer fires, and the built-in `.w-nav-menu` still holds stale Localfinder
  template links (Home / Professionals / Blog / Home-V1…). This script ignores that broken
  menu, builds a clean mobile panel that mirrors the real Lokali nav, and wires the existing
  hamburger button to open/close it.

  Load SITEWIDE (Project Settings → Custom Code → Footer, or a sitewide <script> tag) so it
  runs on every public page. Self-contained: injects its own CSS, no dependencies.

  To change the menu, edit LINKS below.
*/
(function () {
  'use strict';

  var LINKS = [
    { label: 'About',           href: '/about' },
    { label: 'The Market',      href: '/the-market' },
    { label: 'Pricing',         href: '/pricing' },
    // Resources = a tap-to-expand accordion of the vendor-resources guides
    // (mirrors the desktop "Resources" dropdown from lokali-resources-nav.js).
    { label: 'Resources', children: [
      { label: 'Profile Photo Guide', href: '/vendor-resources/profile-photo-guide' },
      { label: 'Categories Guide',    href: '/vendor-resources/categories-guide' },
      { label: 'Product Photo Guide', href: '/vendor-resources/product-photo-guide' },
      { label: 'Service Photo Guide', href: '/vendor-resources/service-photo-guide' },
      { label: 'Availability Guide',  href: '/vendor-resources/availability-guide' }
    ] },
    { label: 'Contact us',      href: '/contact-us' },
    { label: 'Login',           href: '/login' },
    { label: 'Become a Vendor', href: '/sign-up', cta: true }
  ];

  function injectCss() {
    if (document.getElementById('lok-mnav-css')) return;
    var s = document.createElement('style');
    s.id = 'lok-mnav-css';
    s.textContent = [
      '#lok-mnav-panel{position:fixed;left:0;right:0;z-index:9998;display:none;flex-direction:column;',
      'background:var(--snow,#F7F6FC);box-shadow:0 16px 30px rgba(15,23,42,.14);',
      'padding:8px 20px 20px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;',
      'border-top:1px solid rgba(15,23,42,.06);box-sizing:border-box;',
      'max-height:calc(100vh - var(--lok-h,96px));overflow-y:auto;-webkit-overflow-scrolling:touch;}',
      '#lok-mnav-backdrop{position:fixed;inset:0;z-index:9997;display:none;background:rgba(15,23,42,.35);}',
      'html.lok-mnav-open #lok-mnav-panel{display:flex;}',
      'html.lok-mnav-open #lok-mnav-backdrop{display:block;}',
      'html.lok-mnav-open{overflow:hidden;}',
      '#lok-mnav-panel a{display:block;width:100%;box-sizing:border-box;padding:15px 6px;font-size:17px;',
      'font-weight:500;line-height:1.2;color:var(--lokali-primary,#6002ee);text-decoration:none;',
      'border-bottom:1px solid rgba(15,23,42,.06);}',
      '#lok-mnav-panel a.lok-cta{margin-top:14px;text-align:center;background:var(--lokali-primary,#6002ee);',
      'color:#fff;border-radius:10px;border-bottom:0;font-weight:600;padding:14px 6px;}',
      // Resources accordion: header row matches the other links; caret flips; sub-links
      // reveal indented with a smooth max-height transition.
      '#lok-mnav-panel .lok-mnav-acc{display:flex;align-items:center;justify-content:space-between;width:100%;',
      'box-sizing:border-box;padding:15px 6px;font-family:inherit;font-size:17px;font-weight:500;line-height:1.2;',
      'color:var(--lokali-primary,#6002ee);background:none;border:none;border-bottom:1px solid rgba(15,23,42,.06);',
      'cursor:pointer;text-align:left;}',
      '#lok-mnav-panel .lok-mnav-car{width:9px;height:9px;border-right:2px solid currentColor;',
      'border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .2s;flex-shrink:0;margin-right:4px;}',
      '#lok-mnav-panel .lok-mnav-grp.open .lok-mnav-car{transform:rotate(-135deg);}',
      '#lok-mnav-panel .lok-mnav-sub{max-height:0;overflow:hidden;transition:max-height .25s ease;}',
      '#lok-mnav-panel .lok-mnav-grp.open .lok-mnav-sub{max-height:360px;}',
      '#lok-mnav-panel .lok-mnav-sub a{padding-left:20px;font-size:15px;}',
      // Hamburger -> X morph while the menu is open (two-bar hamburger; bars ~15px apart).
      // The original bars are driven by Webflow IX2 (Web Animations API) which overrides
      // even inline !important, so we hide them and render our own morphing icon instead.
      '.hamburger-menu-wrapper .hamburger-menu-bar{display:none!important;}',
      // Only force the hamburger visible at the breakpoint where Webflow shows it (<=991px).
      // Without the media-query scope this !important rule overrode Webflow's desktop
      // display:none and the burger leaked onto desktop beside the full nav.
      '@media screen and (max-width:991px){.hamburger-menu-wrapper{display:flex!important;align-items:center;justify-content:center;}}',
      '.lok-burger{position:relative;width:30px;height:18px;flex:0 0 auto;}',
      '.lok-burger span{position:absolute;left:0;right:0;height:3px;border-radius:20px;',
      'background:#343A40;transition:transform .25s ease,top .25s ease;}',
      '.lok-burger span:first-child{top:3px;}',
      '.lok-burger span:last-child{top:12px;}',
      'html.lok-mnav-open .lok-burger span:first-child{top:7.5px;transform:rotate(45deg);}',
      'html.lok-mnav-open .lok-burger span:last-child{top:7.5px;transform:rotate(-45deg);}'
    ].join('');
    document.head.appendChild(s);
  }

  function build(nav, btn) {
    if (document.getElementById('lok-mnav-panel')) return;

    // Our own hamburger/X icon (Webflow's IX2-managed bars are hidden via CSS).
    if (!btn.querySelector('.lok-burger')) {
      var icon = document.createElement('div');
      icon.className = 'lok-burger';
      icon.appendChild(document.createElement('span'));
      icon.appendChild(document.createElement('span'));
      btn.appendChild(icon);
    }

    var panel = document.createElement('nav');
    panel.id = 'lok-mnav-panel';
    panel.setAttribute('aria-label', 'Mobile navigation');
    LINKS.forEach(function (l) {
      if (l.children) {
        // Accordion group (Resources): a tappable header + collapsible sub-links.
        var grp = document.createElement('div');
        grp.className = 'lok-mnav-grp';
        var hdr = document.createElement('button');
        hdr.type = 'button';
        hdr.className = 'lok-mnav-acc';
        hdr.setAttribute('aria-expanded', 'false');
        hdr.innerHTML = l.label + '<i class="lok-mnav-car" aria-hidden="true"></i>';
        var sub = document.createElement('div');
        sub.className = 'lok-mnav-sub';
        l.children.forEach(function (c) {
          var sa = document.createElement('a');
          sa.href = c.href;
          sa.textContent = c.label;
          sub.appendChild(sa);
        });
        hdr.addEventListener('click', function (e) {
          e.preventDefault();
          var open = grp.classList.toggle('open');
          hdr.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        grp.appendChild(hdr);
        grp.appendChild(sub);
        panel.appendChild(grp);
        return;
      }
      var a = document.createElement('a');
      a.href = l.href;
      a.textContent = l.label;
      if (l.cta) a.className = 'lok-cta';
      panel.appendChild(a);
    });

    var backdrop = document.createElement('div');
    backdrop.id = 'lok-mnav-backdrop';

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    function position() {
      var bottom = Math.round(nav.getBoundingClientRect().bottom);
      if (bottom < 0) bottom = 0;
      document.documentElement.style.setProperty('--lok-h', bottom + 'px');
      panel.style.top = bottom + 'px';
    }

    function setOpen(open) {
      if (open) position();
      document.documentElement.classList.toggle('lok-mnav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('w--open', open);
    }

    function isHamburgerVisible() {
      return getComputedStyle(btn).display !== 'none';
    }

    // Capture phase + stopPropagation so we run before (and instead of) Webflow's dead handler.
    btn.addEventListener('click', function (e) {
      if (!isHamburgerVisible()) return; // desktop: let the normal nav be
      e.preventDefault();
      e.stopPropagation();
      setOpen(!document.documentElement.classList.contains('lok-mnav-open'));
    }, true);

    panel.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    backdrop.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.addEventListener('resize', function () {
      if (!isHamburgerVisible()) setOpen(false);
      else if (document.documentElement.classList.contains('lok-mnav-open')) position();
    });
  }

  function init() {
    var nav = document.querySelector('.w-nav') || document.querySelector('.header-wrapper');
    if (!nav) return;
    var btn = nav.querySelector('.w-nav-button') || nav.querySelector('.hamburger-menu-wrapper');
    if (!btn) return;
    injectCss();
    build(nav, btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // Re-run once after Webflow finishes wiring, in case the header renders late.
  setTimeout(init, 1000);
})();
