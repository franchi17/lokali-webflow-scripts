/*
  Lokali Dashboard — Mobile top bar + slide-in menu (SITE-WIDE, v7 — jsDelivr).

  Converted from the old inline footer embed (dashboard-mobile-nav.html) into a
  hosted script so it can be loaded via a one-line <script src> tag and updated
  without re-pasting into Webflow's character-limited Footer Code box.

  ROOT CAUSE this version fixes: Webflow's mobile CSS makes the WRAPPER
  (.div-block-27) the off-canvas drawer (position:fixed; transform:translateX(-100%)),
  while the sidebar (.section-11) inside it is itself position:fixed. Toggling
  .section-11 (earlier versions) never worked because its parent stayed off-screen.
  Fix: force .section-11 to be a normal in-flow child filling the wrapper, make the
  wrapper the explicit drawer, and slide the WRAPPER.

  On <992px: fixed header bar (56px) blended into the page background with a
  hamburger on the RIGHT, content padded down, drawer slides in from the left with a
  dark overlay; the sidebar becomes a flex column so the account chip + its
  Settings/expansion menu pin to the BOTTOM of the drawer. On desktop all inline
  styles are stripped so the normal layout returns. Gives up after ~6s on pages
  without .section-11 (e.g. The Market).

  PLACEMENT: Site Settings → Custom Code → Footer Code, as a single tag:
    <script defer src="https://cdn.jsdelivr.net/gh/franchi17/lokali-webflow-scripts@v1.4/scripts/lokali-dashboard-mobile-nav.js"></script>
  Self-contained: injects its own CSS, no dependencies.
*/
(function () {
  'use strict';

  var BAR = 56, tries = 0, sidebar, panel, content, ov, isOpen = false;
  var mq = window.matchMedia('(max-width: 991px)');

  function injectCss() {
    if (document.getElementById('lok-dash-mnav-css')) return;
    var s = document.createElement('style');
    s.id = 'lok-dash-mnav-css';
    s.textContent = [
      '@media (max-width:991px){#lok-topbar{display:flex !important;}}',
      '@media (min-width:992px){#lok-topbar,#lok-overlay{display:none !important;}}',
      // Bar blends into the page background (set from body bg in JS) so it reads
      // as natural top padding, not a floating white slab. Hamburger on the RIGHT.
      '#lok-topbar{position:fixed;top:0;left:0;width:100%;height:56px;z-index:2500;',
      'display:none;align-items:center;justify-content:flex-end;padding:0 14px;',
      'box-sizing:border-box;background:#F7F6FC;}',
      // Mobile only: sidebar becomes a flex column filling the drawer so the account
      // chip + its Settings/expansion menu pin to the BOTTOM instead of stacking
      // right under the last nav row (Availability).
      '@media (max-width:991px){.section-11 .div-block-29{margin-top:auto !important;}}',
      '#lok-ham{width:40px;height:40px;border:none;border-radius:9px;padding:0;',
      'background:#6E3CFF;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
      '#lok-ham svg{width:22px;height:22px;}',
      '#lok-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);',
      'z-index:1500;opacity:0;transition:opacity .3s ease;display:none;}',
      '#lok-overlay.lok-show{display:block;opacity:1;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── Mobile page-layout fixes (2026-07-12 audit) ───────────────────────────
  // Injected ONLY once the .section-11 sidebar is found, so these generic
  // Webflow auto-classes can't leak onto public pages that might reuse them.
  //
  // Audit findings at 375px (measured on the published pages):
  //  - dashboard/profile/settings: .div-block-39 is a flex child sized by its
  //    content (width:auto, flex-basis auto) inside .div-block-38 — its
  //    min-content forced it to 392–397px, dragging every card past the right
  //    edge (left gutter fine, right edge clipped). Fix: stack the wrapper and
  //    hard-cap 39 at 100%.
  //  - dashboard: the 3 KPI stat cards (.div-block-41 > .div-block-42) are
  //    flex-nowrap → squeezed/clipped. Let them wrap; ~140px basis gives 2-up
  //    where it fits and stacks otherwise.
  //  - services/products: .main-content-area has margin-left:8px but NO right
  //    gutter — "Add product"/filter bar sat flush against the right edge.
  //    Replace with symmetric 16px padding.
  //  - belt & braces: media + form controls never exceed their column.
  function injectPageFixCss() {
    if (document.getElementById('lok-dash-pagefix-css')) return;
    var s = document.createElement('style');
    s.id = 'lok-dash-pagefix-css';
    s.textContent = [
      '@media (max-width:991px){',
      // Body is white behind the snow content on these pages — that's the
      // "white band around the hamburger". Paint it snow so the top bar and
      // any gap above the content blend into one surface.
      'body{background-color:#F7F6FC !important;}',
      // Clear the fixed 56px top bar. findContent()\'s inline padding misses on
      // some pages (and .div-block-38\'s block display lets the heading margin
      // collapse up under the bar) — this CSS covers every page\'s outermost
      // content wrapper; the inline style, when set, targets the same element
      // so the two never stack.
      'body > .div-block-38,body > .div-block-39,body > .main-content-area{padding-top:56px !important;}',
      '.div-block-38{display:block !important;}',
      '.div-block-39{width:100% !important;max-width:100% !important;min-width:0 !important;box-sizing:border-box !important;',
      // One gutter everywhere: Webflow gives this wrapper 10px sides while
      // services/products get 16px — unify at 16px.
      'padding-left:16px !important;padding-right:16px !important;}',
      // KPI stat cards: stack full-width (2-up left one card orphaned wide).
      '.div-block-41{flex-wrap:wrap !important;}',
      '.div-block-42{flex:1 1 100% !important;min-width:0 !important;}',
      '.div-block-49{flex-wrap:wrap !important;}',
      // Share-your-listing row: URL + copy/share buttons overflowed to ~616px.
      '.div-block-43{flex-wrap:wrap !important;row-gap:8px;}',
      '.div-block-43 *{min-width:0;}',
      '.text-block-96{overflow-wrap:anywhere;}',
      // Share Profile button: arrow sat flush against the rounded edge.
      '.link-block-9{padding:12px 18px !important;gap:10px !important;justify-content:center !important;}',
      // Quick Actions: 2x2 grid reads cramped on a phone — stack.
      '.div-block-169{grid-template-columns:1fr !important;}',
      // Services/products filter bar: the sort select "floated above" the
      // pills because Webflow's .w-form default margin-bottom:15px lifts it
      // off the row's center line. Zero the margins and give the sort its
      // own full-width row under the pills.
      '.filter-bar .form-block-2{margin:0 !important;flex:1 1 100% !important;}',
      '.filter-bar{row-gap:10px !important;}',
      // Profile page photo section: guide card + upload column sat side by
      // side, scrunching the guide into a 2-word-per-line strip. Stack with
      // the photo + Upload button FIRST, guide full-width below.
      '.div-block-127{flex-direction:column-reverse !important;gap:16px !important;}',
      '.div-block-127 > *{width:100% !important;min-width:0 !important;box-sizing:border-box !important;}',
      '.main-content-area{margin-left:0 !important;margin-right:0 !important;',
      'padding-left:16px !important;padding-right:16px !important;box-sizing:border-box !important;width:100% !important;}',
      // Services/products add-edit form: the JS-injected photo gallery + showcase
      // video blocks (lokali-*-final.js, SRI-pinned so not editable on the fly)
      // can be forced wide by their grid cell, and .form-view{overflow:hidden}
      // then CLIPS the video hint mid-sentence. Cap the injected hosts against
      // the viewport (their left offset is card 16px + grid margin 20px ≈ 37px,
      // so 100vw - 64px keeps them inside the card) and let the hint wrap.
      '#lok-product-gallery,#lok-product-video,#lok-service-gallery,#lok-service-video{',
      'max-width:calc(100vw - 64px) !important;min-width:0 !important;box-sizing:border-box !important;}',
      '#lok-product-video-hint,#lok-service-video-hint{white-space:normal !important;overflow-wrap:anywhere;}',
      // #98 pass 2 (2026-07-21): the SERVICES add/edit form grid carries a FIXED 682px
      // desktop track (grid-template-columns:682px) that Webflow never overrides at
      // smaller breakpoints — every field wrapper inherited 682px and the right half of
      // each input/textarea clipped under .form-view{overflow:hidden}. Products is fine
      // (its .product-form-grid is already 1fr); only ._2-columns is broken. Collapse the
      // track and stretch the items. (#services-dashboard is the content container id on
      // BOTH services + products pages — template id reuse — which is harmless here.)
      // margin:0 — the grid carries a 20px desktop margin-left; combined with width:100%
      // it shifted the whole column 20px right and the card clipped the overhang ("everything
      // smooshed to the right / cut off", Francesca 2026-07-21). Symmetric 20px PADDING
      // replaces it: same inset as desktop (card 858 vs grid 818 there), fields land at
      // 301px — identical to the products form.
      '#services-dashboard ._2-columns{grid-template-columns:minmax(0,1fr) !important;width:100% !important;box-sizing:border-box !important;',
      'margin-left:0 !important;margin-right:0 !important;padding-left:20px !important;padding-right:20px !important;}',
      // The whole services/products content container carries white-space:nowrap (Webflow
      // style on .container-11/#services-dashboard) — every long hint line inherits it and
      // gets CUT at phone width (the Specialty "Pick the one that fits…" line, the
      // "New specialties are reviewed first…" line, etc.). Desktop is wide enough to hide
      // it; reset at mobile so text wraps like text.
      '#services-dashboard{white-space:normal !important;}',
      // Specialty + lead-time pills are <button>s built with inline styles in the
      // SRI-pinned *-final.js (no text-align set), so they inherit the button default
      // of center — visibly off once a long label wraps at phone width. Patched from
      // here rather than re-registering the pinned scripts; the inline cssText sets no
      // text-align, so a plain external rule wins without !important.
      '#services-dashboard [data-subcat-slug],#services-dashboard [data-lead-presets] button{text-align:left;}',
      '#services-dashboard ._2-columns > *{width:auto !important;min-width:0 !important;max-width:100% !important;justify-self:stretch !important;}',
      '.div-block-39 img,.div-block-39 svg,.main-content-area img,.main-content-area svg{max-width:100%;}',
      '.div-block-39 input,.div-block-39 textarea,.div-block-39 select,',
      '.main-content-area input,.main-content-area textarea,.main-content-area select{max-width:100%;}',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  // Fill the drawer as a flex column so the account chip (.div-block-29, which
  // gets margin-top:auto in the mobile CSS above) sinks to the bottom.
  // padding-bottom keeps the account chip / Settings menu clear of iOS
  // Safari's bottom URL bar and the home indicator.
  var SB = { 'position':'static','transform':'none','width':'100%','height':'100%','min-height':'100%','top':'auto','left':'auto','display':'flex','flex-direction':'column','padding-bottom':'24px' };
  var DRAWER = {
    'position':'fixed','top':BAR+'px','left':'0','width':'260px','max-width':'85vw',
    'height':'calc(100% - '+BAR+'px)','z-index':'2000','overflow-y':'auto','background':'#fff',
    'box-sizing':'border-box','transition':'transform .3s ease',
    'padding-bottom':'env(safe-area-inset-bottom, 0px)'
  };

  function findContent() {
    var kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i], c = (e.className || '').toString();
      if (c.indexOf('block-27') === -1 && e.id !== 'lok-topbar' && e.id !== 'lok-overlay'
          && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 300) return e;
    }
    return null;
  }
  function drawerBase() {
    Object.keys(SB).forEach(function (k) { sidebar.style.setProperty(k, SB[k], 'important'); });
    Object.keys(DRAWER).forEach(function (k) { panel.style.setProperty(k, DRAWER[k], 'important'); });
    // iOS Safari: plain 100% ignores the collapsing bottom URL bar, which then
    // covers the drawer's bottom rows (Settings was unreachable). 100dvh tracks
    // the real visible viewport; browsers without dvh ignore this line and keep
    // the calc(100% - BAR) already applied above.
    panel.style.setProperty('height', 'calc(100dvh - ' + BAR + 'px)', 'important');
  }
  // Guarded on the breakpoint (#67 round 4): these fire from sidebar-link
  // clicks too, and unguarded they stamped the drawer transform onto the
  // wrapper on DESKTOP — a transformed ancestor un-pins the position:fixed
  // rail (containing-block change), floating it mid-page.
  function setOpen()  { if (!mq.matches) return; panel.style.setProperty('transform','translateX(0)','important');    isOpen = true;  if (ov) ov.classList.add('lok-show'); }
  function setClosed(){ if (!mq.matches) { isOpen = false; if (ov) ov.classList.remove('lok-show'); return; } panel.style.setProperty('transform','translateX(-100%)','important'); isOpen = false; if (ov) ov.classList.remove('lok-show'); }
  function enterMobile() {
    if (content) content.style.setProperty('padding-top', BAR + 'px', 'important');
    drawerBase();
    if (!isOpen) setClosed();
  }
  function exitMobile() {
    if (content) content.style.removeProperty('padding-top');
    Object.keys(SB).forEach(function (k) { sidebar.style.removeProperty(k); });
    Object.keys(DRAWER).forEach(function (k) { panel.style.removeProperty(k); });
    panel.style.removeProperty('transform');
    isOpen = false; if (ov) ov.classList.remove('lok-show');
  }
  function applyMode() { if (mq.matches) enterMobile(); else exitMobile(); }

  function init() {
    injectCss();
    sidebar = document.querySelector('.section-11');
    if (!sidebar) { if (tries++ < 20) setTimeout(init, 300); return; }
    injectPageFixCss(); // dashboard pages only — gated on the sidebar existing
    panel = sidebar.parentElement;
    if (document.getElementById('lok-topbar')) return;
    content = findContent();

    var bar = document.createElement('div'); bar.id = 'lok-topbar';
    // Match the bar to the page background so it disappears into the page
    // instead of reading as a white slab.
    var pageBg = getComputedStyle(document.body).backgroundColor;
    if (!pageBg || pageBg === 'transparent' || pageBg === 'rgba(0, 0, 0, 0)') pageBg = getComputedStyle(document.documentElement).backgroundColor;
    if (!pageBg || pageBg === 'transparent' || pageBg === 'rgba(0, 0, 0, 0)') pageBg = '#F7F6FC';
    bar.style.background = pageBg;
    var btn = document.createElement('button'); btn.id = 'lok-ham'; btn.setAttribute('aria-label', 'Menu');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    bar.appendChild(btn); document.body.appendChild(bar);

    ov = document.createElement('div'); ov.id = 'lok-overlay'; document.body.appendChild(ov);

    btn.addEventListener('click', function () { isOpen ? setClosed() : setOpen(); });
    ov.addEventListener('click', setClosed);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setClosed(); });
    sidebar.addEventListener('click', function (e) { if (e.target.closest('a')) setClosed(); });

    if (mq.addEventListener) mq.addEventListener('change', applyMode); else mq.addListener(applyMode);
    applyMode();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
