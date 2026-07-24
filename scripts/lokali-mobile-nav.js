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
      // Tablet/mobile: the header row's middle nav links are display:none (.hidden-on-tablet)
      // and nothing grows into that space, so Login + burger sat beside the logo instead of
      // at the right edge — auto left margin pushes the whole right-side group flush right.
      '@media screen and (max-width:991px){.header-right-side{margin-left:auto;}}',
      '.lok-burger{position:relative;width:30px;height:18px;flex:0 0 auto;}',
      '.lok-burger span{position:absolute;left:0;right:0;height:3px;border-radius:20px;',
      'background:#343A40;transition:transform .25s ease,top .25s ease;}',
      '.lok-burger span:first-child{top:3px;}',
      '.lok-burger span:last-child{top:12px;}',
      'html.lok-mnav-open .lok-burger span:first-child{top:7.5px;transform:rotate(45deg);}',
      'html.lok-mnav-open .lok-burger span:last-child{top:7.5px;transform:rotate(-45deg);}',
      // #98 F5 — 992–1149px (iPad landscape / small laptop): the desktop nav's middle grid
      // track is too narrow and the links render UNDER the Login button (measured 15px overlap
      // at 1024). Rather than fight the grid, run the burger nav through that range too.
      // Lives HERE (not in injectPolishCss) on purpose: injectCss only runs once the burger is
      // found and wired, so the desktop nav can never be hidden without a working burger.
      // The signed-in account chip is safe: auth-nav inserts it beside the Login button inside
      // .header-right-side, which stays visible (verified live at 1024 — Login remains shown).
      '@media screen and (min-width:992px) and (max-width:1149px){',
      '.header-bottom-wrapper{display:none!important;}',
      '.header-btn-hidden-on-tablet{display:none!important;}',
      '.hamburger-menu-wrapper{display:flex!important;align-items:center;justify-content:center;min-width:44px;min-height:44px;}',
      '.header-right-side{margin-left:auto;}',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  // #98 mobile/tablet polish (2026-07-21) — fixes from the site-wide responsive audit.
  // Lives here because this script already loads on every public page and injects CSS.
  function injectPolishCss() {
    if (document.getElementById('lok-98-css')) return;
    var s = document.createElement('style');
    s.id = 'lok-98-css';
    s.textContent = [
      // #98 optional-polish (2026-07-24): the touch-ergonomics rules below (F1 input floor,
      // F2 hamburger, F3 tap-target growth, F4 footer links) run to 1149px — matching the
      // range where the burger nav already takes over (see F5). iPad landscape (1024) is a
      // touch device that was keeping desktop-size targets AND still zooms on sub-16px inputs
      // in Safari, the exact device the audit flagged. 44px targets + 16px fields don't harm a
      // small-laptop window at this width; the WIDTH-SPECIFIC layout fixes (F6/F7) stay tighter.
      '@media screen and (max-width:1149px){',
      // F1 — iOS Safari zooms the whole page when a focused field is under 16px and never
      // zooms back; floor every field at 16px on touch widths (the site's fields are 12–15px).
      'input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,textarea{font-size:16px!important;}',
      // F2 — the hamburger's tap area was just its 30x18 icon; grow the hit area, not the icon.
      '.hamburger-menu-wrapper{min-width:44px;min-height:44px;}',
      // F3 — sub-40px tap targets on the conversion actions (Market cards + vendor page).
      // NOTE: the card CSS pins .contact-btn at height:37px with !important, which silently
      // ate the original padding/font-size directive (verified live 2026-07-24 — even a
      // max-specificity !important padding was inert, but min-height overrides a smaller fixed
      // height). The buttons already sit in a 44px .vcard-actions flex row, so min-height:44px
      // fills the row without shifting card layout — this is what actually grows the target.
      '.vcard .contact-btn{min-height:44px!important;box-sizing:border-box;}',
      // :not(.lk-fav-inline) — the favorites script also has an inline "Save" PILL variant
      // (auto width/height + text label); forcing that to 40x40 would clip the label.
      '.lk-fav:not(.lk-fav-inline){width:40px!important;height:40px!important;}',
      '.vl-rev-cta{padding:12px 0!important;font-size:14px!important;}',
      '.vl-op-pay-chip{min-height:44px;box-sizing:border-box;padding:10px 16px!important;}',
      '.vl-meet-learn{padding:8px 0;}',
      '.vl-detail-link{padding:6px 0;display:inline-block;}',
      'select.select-field-3,.mobile-sort-select select,#location-select{min-height:44px;}',
      '#browse-mobile-filter-btn{min-height:44px;box-sizing:border-box;}',
      // F4 — footer links were 14px-tall targets, ~20 of them stacked; pad them out.
      '.lok-ft-link{display:inline-block;padding:10px 0;}',
      '.lok-ft-contactlink{display:inline-block;padding:6px 0;}',
      '}',
      // F6 — /about: the hero background video rendered 5px wider than the page (width 380
      // at -2px left on a 375 viewport) and caused real horizontal scroll. Kept at ≤991 (a
      // small-width layout fix, NOT touch ergonomics) so extending the block above to 1149
      // can't touch the hero video at iPad-landscape widths.
      '@media screen and (max-width:991px){',
      '.div-block-5{overflow-x:clip;}',
      '.div-block-5 .w-background-video{width:100%!important;margin-left:0!important;left:0!important;}',
      '}',
      // F7 — The Market: search + neighborhood select share one row at phone width and the
      // search truncates its own placeholder; stack them full-width instead.
      '@media screen and (max-width:479px){',
      '.search-bar{flex-wrap:wrap;gap:10px;}',
      '.search-bar .form-block-7{flex:1 1 100%;margin-bottom:0;}',
      '.search-bar #location-select{width:100%;}',
      '}',
      // Desktop ≥1150px — align the header content edges (logo left; Login + storefront right)
      // with the footer's fixed 64px side margins (Francesca 2026-07-21: header buttons looked
      // indented vs the footer on wide screens — the header container capped at 1268px centered
      // while the footer runs full-width). 20px outer header padding + 44px here = 64px, exactly
      // the footer's content edge; verified pixel-equal live (both edges 64 / vw-64).
      '@media screen and (min-width:1150px){',
      '.header-wrapper .container-default{max-width:none;margin-left:44px;margin-right:44px;padding-left:0;padding-right:0;}',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  // #98 — The Market's search box is a Webflow code component rendered in shadow DOM, so the
  // 16px floor above can't reach its input; patch each island's shadow root directly. Islands
  // hydrate late, so init() retries this a couple of times.
  function patchCodeIslands() {
    var islands = document.querySelectorAll('code-island');
    if (!islands.length) return;
    islands.forEach(function (ci) {
      var root = ci.shadowRoot;
      if (!root) return;
      // Style + placeholder are guarded SEPARATELY: the island's <input> can hydrate after
      // the style lands, and the retries must still be able to apply the placeholder patch.
      if (!root.getElementById('lok-98-island-css')) {
        var st = document.createElement('style');
        st.id = 'lok-98-island-css';
        st.textContent = '@media screen and (max-width:991px){input{font-size:16px!important;}}';
        root.appendChild(st);
      }
      // The full placeholder ("Search vendors, categories, services…") truncates at phone
      // width even full-width; shorten it there. Guarded so only the search island is touched.
      // 480 matches the F7 stack breakpoint above.
      var inp = root.querySelector('input');
      if (inp && window.innerWidth < 480 && /^Search vendors,/.test(inp.placeholder || '')) {
        inp.placeholder = 'Search vendors…';
      }
    });
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
      // Focus follows the panel: first link on open, back to the button on close
      // (Escape/backdrop included) — else keyboard focus stays behind the backdrop.
      if (open) {
        var first = panel.querySelector('a,button');
        if (first) first.focus();
      } else if (panel.contains(document.activeElement)) {
        btn.focus();
      }
    }

    function isHamburgerVisible() {
      return getComputedStyle(btn).display !== 'none';
    }

    function toggle() {
      setOpen(!document.documentElement.classList.contains('lok-mnav-open'));
    }

    // Capture phase + stopPropagation so we run before (and instead of) Webflow's dead handler.
    btn.addEventListener('click', function (e) {
      if (!isHamburgerVisible()) return; // desktop: let the normal nav be
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }, true);
    // The button is a div — it never synthesizes click from Enter/Space, and
    // Webflow's own keydown drives its broken native menu. In the 992–1149px
    // range this panel is the ONLY nav, so it must be keyboard-openable.
    if (!btn.getAttribute('role')) btn.setAttribute('role', 'button');
    if (!btn.hasAttribute('tabindex')) btn.setAttribute('tabindex', '0');
    btn.addEventListener('keydown', function (e) {
      if (!isHamburgerVisible()) return;
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      e.preventDefault(); // Space must not scroll the page
      e.stopPropagation();
      toggle();
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
    injectPolishCss();
    patchCodeIslands();
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
  // Code islands (The Market search) hydrate later than DOMContentLoaded — retry the shadow patch.
  setTimeout(patchCodeIslands, 2000);
  setTimeout(patchCodeIslands, 5000);
})();
