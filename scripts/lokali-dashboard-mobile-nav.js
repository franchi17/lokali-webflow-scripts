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
      '.div-block-38{display:block !important;}',
      '.div-block-39{width:100% !important;max-width:100% !important;min-width:0 !important;box-sizing:border-box !important;}',
      '.div-block-41{flex-wrap:wrap !important;}',
      '.div-block-42{flex:1 1 140px !important;min-width:0 !important;}',
      '.div-block-49{flex-wrap:wrap !important;}',
      // Share-your-listing row: URL + copy/share buttons overflowed to ~616px.
      '.div-block-43{flex-wrap:wrap !important;row-gap:8px;}',
      '.div-block-43 *{min-width:0;}',
      '.text-block-96{overflow-wrap:anywhere;}',
      '.main-content-area{margin-left:0 !important;margin-right:0 !important;',
      'padding-left:16px !important;padding-right:16px !important;box-sizing:border-box !important;width:100% !important;}',
      '.div-block-39 img,.div-block-39 svg,.main-content-area img,.main-content-area svg{max-width:100%;}',
      '.div-block-39 input,.div-block-39 textarea,.div-block-39 select,',
      '.main-content-area input,.main-content-area textarea,.main-content-area select{max-width:100%;}',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  // Fill the drawer as a flex column so the account chip (.div-block-29, which
  // gets margin-top:auto in the mobile CSS above) sinks to the bottom.
  var SB = { 'position':'static','transform':'none','width':'100%','height':'100%','min-height':'100%','top':'auto','left':'auto','display':'flex','flex-direction':'column' };
  var DRAWER = {
    'position':'fixed','top':BAR+'px','left':'0','width':'260px','max-width':'85vw',
    'height':'calc(100% - '+BAR+'px)','z-index':'2000','overflow-y':'auto','background':'#fff',
    'box-sizing':'border-box','transition':'transform .3s ease'
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
