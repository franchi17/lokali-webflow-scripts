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

  // #166: set inside build() (needs setOpen + the drawer's search input);
  // called by the header magnifier in its <=1149px icon mode.
  var openMenuToSearch = null;

  var LINKS = [
    { label: 'About',           href: '/about' },
    { label: 'The Market',      href: '/the-market' },
    // Features = link + tap-to-expand audience pages (mirrors the desktop
    // "Features" dropdown from lokali-resources-nav.js; the label lands on
    // the /features chooser).
    { label: 'Features', href: '/features', children: [
      { label: 'For customers', href: '/for-customers' },
      { label: 'For vendors',   href: '/for-vendors' }
    ] },
    // Pricing = link + tap-to-expand anchor links into the page's key sections
    // (mirrors the desktop "Pricing" dropdown from lokali-pricing-nav.js).
    { label: 'Pricing', href: '/pricing', children: [
      { label: 'Plans',             href: '/pricing#plans' },
      { label: 'Compare plans',     href: '/pricing#compare' },
      { label: 'Why Lokali',        href: '/pricing#versus' },
      { label: 'FAQ',               href: '/pricing#faq' }
    ] },
    // Resources = a tap-to-expand accordion of the vendor-resources guides
    // (mirrors the desktop "Resources" dropdown from lokali-resources-nav.js).
    { label: 'Resources', children: [
      { label: 'Profile Photo Guide', href: '/vendor-resources/profile-photo-guide' },
      { label: 'Categories Guide',    href: '/vendor-resources/categories-guide' },
      { label: 'Product Photo Guide', href: '/vendor-resources/product-photo-guide' },
      { label: 'Service Photo Guide', href: '/vendor-resources/service-photo-guide' },
      { label: 'Availability Guide',  href: '/vendor-resources/availability-guide' },
      { label: 'Badges & Referrals',  href: '/vendor-resources/badges-guide' }
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
      // Search row: quick market search from any page. 16px input (iOS zoom
      // floor), explicit font per the Plus Jakarta Sans rule (inputs don't
      // inherit fonts), violet accents per the palette.
      '#lok-mnav-search{display:flex;gap:8px;margin:12px 0 6px;}',
      '#lok-mnav-search input{flex:1 1 auto;min-width:0;box-sizing:border-box;height:44px;padding:0 14px;',
      'font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:16px;color:#343A40;background:#fff;',
      'border:1px solid rgba(96,2,238,.25);border-radius:10px;-webkit-appearance:none;appearance:none;}',
      '#lok-mnav-search input::placeholder{color:#8E8BA6;}',
      '#lok-mnav-search input:focus{outline:none;border-color:var(--lokali-primary,#6002ee);}',
      '#lok-mnav-search button{flex:0 0 44px;height:44px;display:flex;align-items:center;justify-content:center;',
      'background:var(--lokali-primary,#6002ee);color:#fff;border:none;border-radius:10px;cursor:pointer;}',
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
      // Group-header caret (Resources) hugs the button's right edge while the
      // 44px accbtn carets (Features/Pricing) are flex-centered ~22px from the
      // edge - align all three to the same x-center (13.5px measured live:
      // all three at the same pixel).
      '#lok-mnav-panel .lok-mnav-acc .lok-mnav-car{margin-right:13.5px;}',
      // Link + caret header row (Pricing): the label navigates, the caret expands.
      '#lok-mnav-panel .lok-mnav-row{display:flex;align-items:stretch;border-bottom:1px solid rgba(15,23,42,.06);}',
      '#lok-mnav-panel .lok-mnav-row a{flex:1 1 auto;border-bottom:0;}',
      '#lok-mnav-panel .lok-mnav-accbtn{background:none;border:none;cursor:pointer;color:var(--lokali-primary,#6002ee);',
      'display:flex;align-items:center;justify-content:center;min-width:44px;padding:0 6px;}',
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
      // 2026-08-29 card redesign: the contact buttons left the card (storefront owns
      // direct contact now); the card's one link CTA gets the 44px floor instead.
      // The whole card is also clickable, so this only protects the precise tap.
      '.vcard .vcard-visit{min-height:44px;display:inline-flex;align-items:center;}',
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
      // Retune ROUND 2, 2026-08-14 (Francesca: still too spaced after the 07-31
      // pass): round 1 shrank the link padding but missed the REAL culprit — the
      // Webflow-side 11px row-gap on .lok-ft-list itself. Override it here too.
      // Now: 5px pads + 3px gap = ~27px row pitch (was ~39px), headings 6px.
      '.lok-ft-link{display:inline-block;padding:5px 0;}',
      '.lok-ft-contactlink{display:inline-block;padding:4px 0;}',
      '.lok-ft-li{line-height:1;}',
      '.lok-ft-list{row-gap:3px;}',
      '.lok-ft-h{margin-bottom:6px;}',
      '}',
      // Header decompression ≤640 (Francesca 2026-07-31: logo more to the left,
      // nav bar squished): the header container ships margin-left/right 40px on
      // top of the wrapper’s 20px padding = 60px inset. Trim to 12px on phones.
      '@media screen and (max-width:640px){',
      '.header-wrapper .container-default{margin-left:12px!important;margin-right:12px!important;}',
      // #127 (Francesca 2026-08-14): unify phone side insets. Body ran 20px, the
      // footer STACKED to 50px (lok-ft-inner 20 padding + 20 margin + .footer 10).
      // ROUND 2 same day: 16px read too thin — matched to the HEADER instead, whose
      // content sits at 32px (wrapper's 20px padding + the container's 12px margin
      // from 07-31). Everything now lines up on one 32px gutter.
      '.inner-container{padding-left:32px!important;padding-right:32px!important;}',
      // Webflow nests .inner-container (e.g. ._520px > ._700px---tablet): pad
      // only the outermost or the insets stack (16+16=32 — caught live 08-14).
      '.inner-container .inner-container{padding-left:0!important;padding-right:0!important;}',
      '.lok-ft-inner{padding-left:32px!important;padding-right:32px!important;margin-left:0!important;margin-right:0!important;}',
      '.footer{padding-left:0!important;padding-right:0!important;}',
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
      // #105(b) — the footer's recast "Resources" group label (see fixFooterResources).
      // Styled as a quiet sub-heading over the guide links, matching the footer's
      // muted label tone; explicit font per the Plus Jakarta Sans rule.
      '.lok-ft-grouplabel{display:inline-block;font-family:"Plus Jakarta Sans",sans-serif;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8E8BA6;cursor:default;padding:10px 0 2px;}',
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

    // Search bar — submits to The Market, where lokali-browse.js's deep-link
    // handler consumes ?q= into the search box and filters the first paint.
    // Plain navigation (no in-place wiring) so it works identically from every
    // public page, including /the-market itself.
    var sform = document.createElement('form');
    sform.id = 'lok-mnav-search';
    sform.setAttribute('role', 'search');
    var sinp = document.createElement('input');
    sinp.type = 'search';
    sinp.name = 'q';
    sinp.placeholder = 'Search the market…';
    sinp.setAttribute('aria-label', 'Search the market');
    sinp.autocomplete = 'off';
    var sbtn = document.createElement('button');
    sbtn.type = 'submit';
    sbtn.setAttribute('aria-label', 'Search');
    sbtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>';
    sform.appendChild(sinp);
    sform.appendChild(sbtn);
    sform.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = (sinp.value || '').trim();
      window.location.href = '/the-market' + (q ? '?q=' + encodeURIComponent(q) : '');
    });
    panel.appendChild(sform);

    LINKS.forEach(function (l) {
      if (l.children) {
        // Accordion group: a tappable header + collapsible sub-links. Two header
        // shapes: no href (Resources) = the whole row is the toggle button;
        // href (Pricing) = the label stays a normal link and only a separate
        // 44px caret button toggles, so the two taps never fight.
        var grp = document.createElement('div');
        grp.className = 'lok-mnav-grp';
        var sub = document.createElement('div');
        sub.className = 'lok-mnav-sub';
        l.children.forEach(function (c) {
          var sa = document.createElement('a');
          sa.href = c.href;
          sa.textContent = c.label;
          sub.appendChild(sa);
        });
        var hdr;
        function toggleSub(e) {
          e.preventDefault();
          var open = grp.classList.toggle('open');
          hdr.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        if (l.href) {
          var row = document.createElement('div');
          row.className = 'lok-mnav-row';
          var la = document.createElement('a');
          la.href = l.href;
          la.textContent = l.label;
          hdr = document.createElement('button');
          hdr.type = 'button';
          hdr.className = 'lok-mnav-accbtn';
          hdr.setAttribute('aria-expanded', 'false');
          hdr.setAttribute('aria-label', l.label + ' sections');
          hdr.innerHTML = '<i class="lok-mnav-car" aria-hidden="true"></i>';
          hdr.addEventListener('click', toggleSub);
          row.appendChild(la);
          row.appendChild(hdr);
          grp.appendChild(row);
        } else {
          hdr = document.createElement('button');
          hdr.type = 'button';
          hdr.className = 'lok-mnav-acc';
          hdr.setAttribute('aria-expanded', 'false');
          hdr.innerHTML = l.label + '<i class="lok-mnav-car" aria-hidden="true"></i>';
          hdr.addEventListener('click', toggleSub);
          grp.appendChild(hdr);
        }
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
        // Skip the search row: focusing its input would pop the keyboard on
        // every open, and focusing its button reads as a random highlight.
        var first = panel.querySelector('a,button:not(#lok-mnav-search button)');
        if (first) first.focus();
      } else if (panel.contains(document.activeElement)) {
        btn.focus();
      }
    }

    // #166 header magnifier -> open the drawer straight into its search field.
    // Keyboard pop is INTENTIONAL here (the user tapped "search", they want to
    // type), unlike the plain burger open above, which deliberately skips it.
    openMenuToSearch = function () {
      setOpen(true);
      try { sinp.focus(); } catch (e) {}
    };

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

    panel.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      setOpen(false);
      // Same-page #hash links (the Pricing section anchors): the drawer's
      // scroll lock (html overflow:hidden) can swallow the browser's own
      // fragment jump, so redo it once the lock is released.
      var href = a.getAttribute('href') || '';
      var hi = href.indexOf('#');
      if (hi > -1 && href.slice(0, hi).replace(/\/$/, '') === location.pathname.replace(/\/$/, '')) {
        var t = document.getElementById(href.slice(hi + 1));
        if (t) setTimeout(function () { t.scrollIntoView(); }, 50);
      }
    });
    backdrop.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.addEventListener('resize', function () {
      if (!isHamburgerVisible()) setOpen(false);
      else if (document.documentElement.classList.contains('lok-mnav-open')) position();
    });
  }

  // #105(b): the footer "For Vendors" column ships a dead `<a href="#">Resources</a>`
  // directly above the five guide links — unwired in Webflow (the header's
  // Resources dropdown is a separate, working control). A link that goes nowhere
  // reads as broken, so recast it as a non-interactive group label introducing
  // the guides. Scoped to .lok-ft + exact text match so no other anchor —
  // e.g. the homepage waitlist trigger, also href="#" by design — can be hit.
  // Fixed here (site-wide @v1.4 script) rather than in Webflow so the change
  // ships without a site publish.
  function fixFooterResources() {
    document.querySelectorAll('.lok-ft a.lok-ft-link[href="#"]').forEach(function (a) {
      if ((a.textContent || '').trim().toLowerCase() !== 'resources') return;
      var s = document.createElement('span');
      s.className = 'lok-ft-grouplabel';
      s.textContent = (a.textContent || '').trim();
      a.parentNode.replaceChild(s, a);
    });
    // Badges & Referrals guide (2026-07-31): the footer's Resources list is
    // native Webflow markup that predates the page — inject the sixth link
    // after Availability Guide, cloned from its row so the styling can never
    // drift. Script-side for the same reason as the label recast above: ships
    // without a site publish.
    var avail = document.querySelector('.lok-ft a[href*="availability-guide"]');
    if (avail && !document.querySelector('.lok-ft a[href*="badges-guide"]')) {
      var li = avail.closest('li') || avail.parentElement;
      var clone = li.cloneNode(true);
      var link = clone.querySelector('a') || clone;
      link.setAttribute('href', '/vendor-resources/badges-guide');
      link.textContent = 'Badges & Referrals';
      li.parentNode.insertBefore(clone, li.nextSibling);
    }
  }

  // #166 header search (Francesca 2026-09-01). The evidence (NN/g search
  // visibility, Baymard commerce benchmarks): a VISIBLE field beats a hidden
  // icon, top-right is where people expect it, and searchers are the highest-
  // intent visitors. Desktop >=1150px: compact input left of Login, GETs
  // /the-market?q= (lokali-browse's deep-link handler consumes it into the
  // page search). <=1149px the burger nav owns the header, so the field
  // collapses to a 44px magnifier that opens the drawer with its search field
  // focused (one tap instead of burger-then-field). Skipped on /the-market:
  // the page's own search box is already on screen and two boxes would fight.
  function buildHeaderSearch() {
    if (document.getElementById('lok-hdr-search')) return;
    if (/^\/the-market\/?$/.test(location.pathname)) return;
    var right = document.querySelector('.header-right-side');
    if (!right) return;
    if (!document.getElementById('lok-hdr-search-css')) {
      var st = document.createElement('style');
      st.id = 'lok-hdr-search-css';
      st.textContent = [
        '#lok-hdr-search{display:flex;align-items:center;position:relative;margin-right:14px;}',
        // 16px font (iOS zoom floor) + explicit Plus Jakarta Sans (inputs never inherit it).
        '#lok-hdr-search input{box-sizing:border-box;width:180px;height:42px;padding:0 40px 0 14px;',
        'font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:16px;color:#343A40;',
        'background:#F7F6FC;border:1px solid rgba(96,2,238,.18);border-radius:12px;',
        '-webkit-appearance:none;appearance:none;transition:width .18s ease,border-color .18s ease,background .18s ease;}',
        '#lok-hdr-search input::placeholder{color:#8E8BA6;}',
        '#lok-hdr-search input:focus{outline:none;width:230px;border-color:var(--lokali-primary,#6002ee);',
        // The grow can brush the last nav link near 1440px - lift it so the
        // overlap reads as a deliberate overlay, same treatment as the fly-out.
        'background:#fff;position:relative;z-index:5;box-shadow:0 4px 14px rgba(20,10,60,.10);}',
        '#lok-hdr-search button{position:absolute;right:4px;top:50%;transform:translateY(-50%);',
        'width:34px;height:34px;display:flex;align-items:center;justify-content:center;',
        'background:transparent;border:none;border-radius:10px;color:var(--lokali-primary,#6002ee);cursor:pointer;}',
        '#lok-hdr-search button:hover{background:#F3EBFF;}',
        // 1150-1349px: the middle nav links leave no room for an inline field
        // (measured overlap with "Contact us" at 1280) - magnifier only, and a
        // click flies the input out OVER the links (absolute, right-anchored).
        '@media screen and (min-width:1150px) and (max-width:1349px){',
        '#lok-hdr-search{margin-right:6px;}',
        '#lok-hdr-search input{display:none;}',
        '#lok-hdr-search button{position:static;transform:none;width:44px;height:44px;}',
        '#lok-hdr-search.lok-hs-open input{display:block;position:absolute;right:0;top:50%;',
        'transform:translateY(-50%);width:260px;background:#fff;border-color:var(--lokali-primary,#6002ee);',
        'z-index:9;box-shadow:0 6px 18px rgba(20,10,60,.12);}',
        '#lok-hdr-search.lok-hs-open button{position:absolute;right:4px;top:50%;transform:translateY(-50%);',
        'width:34px;height:34px;z-index:10;}',
        '}',
        // Burger range (matches F5 above): icon only, 44px target; the drawer field takes over.
        '@media screen and (max-width:1149px){',
        '#lok-hdr-search{margin-right:0;}',
        '#lok-hdr-search input{display:none;}',
        '#lok-hdr-search button{position:static;transform:none;width:44px;height:44px;}',
        '}'
      ].join('');
      document.head.appendChild(st);
    }
    var form = document.createElement('form');
    form.id = 'lok-hdr-search';
    form.setAttribute('role', 'search');
    var inp = document.createElement('input');
    inp.type = 'search';
    inp.name = 'q';
    inp.placeholder = 'What do you need?'; // need-first (F: people search products/services, not vendors); fits 180px untruncated
    inp.setAttribute('aria-label', 'Search the market');
    inp.autocomplete = 'off';
    var sb = document.createElement('button');
    sb.type = 'submit';
    sb.setAttribute('aria-label', 'Search');
    sb.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>';
    form.appendChild(inp);
    form.appendChild(sb);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // Icon mode (input hidden): the tap means "let me search", not "submit
      // an empty query". Burger widths hand off to the drawer's focused field;
      // the 1150-1349 squeeze expands the fly-out input in place instead.
      if (getComputedStyle(inp).display === 'none') {
        var burger = document.querySelector('.hamburger-menu-wrapper');
        if (burger && getComputedStyle(burger).display !== 'none') {
          if (openMenuToSearch) openMenuToSearch();
        } else {
          form.classList.add('lok-hs-open');
          setTimeout(function () { try { inp.focus(); } catch (e2) {} }, 0);
        }
        return;
      }
      var q = (inp.value || '').trim();
      window.location.href = '/the-market' + (q ? '?q=' + encodeURIComponent(q) : '');
    });
    // Fly-out closes like any transient control: outside click or Escape.
    // (The opening click is inside the form, so the doc listener ignores it.)
    document.addEventListener('click', function (ev) {
      if (form.classList.contains('lok-hs-open') && !form.contains(ev.target)) form.classList.remove('lok-hs-open');
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') form.classList.remove('lok-hs-open');
    });
    right.insertBefore(form, right.firstChild);
  }

  function init() {
    injectPolishCss();
    fixFooterResources();
    patchCodeIslands();
    var nav = document.querySelector('.w-nav') || document.querySelector('.header-wrapper');
    if (!nav) return;
    var btn = nav.querySelector('.w-nav-button') || nav.querySelector('.hamburger-menu-wrapper');
    if (!btn) return;
    injectCss();
    build(nav, btn);
    buildHeaderSearch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // Re-run once after Webflow finishes wiring, in case the header renders late.
  setTimeout(init, 1000);
  // Code islands (The Market search) hydrate later than DOMContentLoaded — retry the shadow patch.
  setTimeout(patchCodeIslands, 2000);
  setTimeout(patchCodeIslands, 5000);
})();
