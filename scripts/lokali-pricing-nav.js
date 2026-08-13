/*
  Lokali — Pricing header dropdown (nav injection).

  Adds a dropdown of anchor links to the key /pricing sections under the
  EXISTING "Pricing" nav item. Same established pattern as
  lokali-resources-nav.js: injected by JS so the shared Webflow header
  component is never edited — additive + trivially reversible (remove the one
  footer <script> tag and it's gone).

  Responsive by design, works in BOTH nav menus:
    - Desktop list (.header-nav-menu-list, not in .w-nav-menu): pure-CSS hover
      panel under the Pricing link; the link itself still navigates on click.
    - Mobile hamburger list (inside .w-nav-menu / .show-in-tablet): a 44px
      caret button next to the Pricing link toggles an inline accordion (tap
      the caret to expand, tap "Pricing" to go to the page).

  Anchor targets on /pricing: #plans, #compare, #versus, #faq (ids set in the
  Designer on the section wrappers). scroll-margin-top keeps headings clear of
  the fixed header; same-page clicks smooth-scroll.

  Load site-wide via the footer:
    <script src="https://cdn.jsdelivr.net/gh/franchi17/lokali-webflow-scripts@v1.4/scripts/lokali-pricing-nav.js"></script>

  Self-contained, idempotent (safe to run twice / on every page). Matches the
  live nav link styling: Plus Jakarta Sans, brand violet #6002EE.
*/
(function () {
  'use strict';

  var BRAND = '#6002EE';
  var FONT = "'Plus Jakarta Sans', sans-serif";
  // Page order. Keep labels short — they wrap on mobile otherwise.
  var LINKS = [
    { href: '/pricing#plans',   label: 'Plans' },
    { href: '/pricing#compare', label: 'Compare plans' },
    { href: '/pricing#versus',  label: 'Why Lokali' },
    { href: '/pricing#faq',     label: 'FAQ' }
  ];

  function injectStyles() {
    if (document.getElementById('lok-pri-styles')) return;
    var css =
      // anchor targets clear the fixed header on jump (any entry path, incl. the #plans CTA)
      '#plans,#compare,#versus,#faq{scroll-margin-top:96px;}' +
      '.lok-pri-li{position:relative;}' +
      // translate BEFORE rotate = pure-vertical nudge; -3px compensates the
      // baseline-aligned inline-block sitting ~2px below the text center-line
      // (the flex-centered 44px mobile button needs only -1px, overridden below).
      '.lok-pri-car{display:inline-block;width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;' +
        'transform:translateY(-3px) rotate(45deg);transition:transform .2s;flex-shrink:0;margin-left:6px;}' +
      '.lok-pri-li:not(.mob):hover .lok-pri-car,' +
      '.lok-pri-li.open .lok-pri-car{transform:translateY(-3px) rotate(-135deg);}' +
      // desktop floating panel — opens on pure-CSS :hover (robust; no JS event quirks)
      '.lok-pri-panel{position:absolute;top:100%;left:0;margin-top:12px;min-width:190px;background:#fff;border:1px solid #ECE8F6;' +
        'border-radius:14px;box-shadow:0 14px 34px rgba(60,45,120,.16);padding:8px;opacity:0;visibility:hidden;' +
        'transform:translateY(-6px);transition:opacity .16s ease,transform .16s ease,visibility .16s ease;z-index:9999;}' +
      // a hit-bridge so the cursor can cross the gap from trigger to panel without closing
      '.lok-pri-li:not(.mob) > .lok-pri-panel::before{content:"";position:absolute;top:-12px;left:0;right:0;height:12px;}' +
      '.lok-pri-li:not(.mob):hover > .lok-pri-panel,' +
      '.lok-pri-li.open > .lok-pri-panel{opacity:1;visibility:visible;transform:translateY(0);}' +
      '.lok-pri-panel a{display:block;font-family:' + FONT + ';font-size:14px;font-weight:500;color:#45415A;text-decoration:none;' +
        'padding:9px 12px;border-radius:9px;white-space:nowrap;}' +
      '.lok-pri-panel a:hover{background:#F4F1FB;color:' + BRAND + ';}' +
      // mobile accordion variant (inside the hamburger menu): link + caret button on one row
      '.lok-pri-li.mob{display:flex;flex-wrap:wrap;align-items:center;}' +
      '.lok-pri-li.mob > a{flex:1 1 auto;}' +
      '.lok-pri-btn{display:none;background:none;border:none;padding:0;margin:0;cursor:pointer;color:' + BRAND + ';' +
        'width:44px;height:44px;align-items:center;justify-content:center;flex:0 0 auto;}' +
      '.lok-pri-li.mob .lok-pri-btn{display:inline-flex;}' +
      '.lok-pri-li.mob .lok-pri-btn .lok-pri-car{margin-left:0;transform:translateY(-1px) rotate(45deg);}' +
      '.lok-pri-li.mob.open .lok-pri-btn .lok-pri-car{transform:translateY(-1px) rotate(-135deg);}' +
      '.lok-pri-li.mob .lok-pri-panel{position:static;opacity:1;visibility:visible;transform:none;box-shadow:none;border:none;' +
        'background:none;padding:0 0 0 14px;margin:0;min-width:0;flex-basis:100%;max-height:0;overflow:hidden;transition:max-height .24s ease;}' +
      '.lok-pri-li.mob.open .lok-pri-panel{max-height:260px;margin-top:4px;}' +
      '.lok-pri-li.mob .lok-pri-panel a{padding:10px 6px;}';
    var s = document.createElement('style');
    s.id = 'lok-pri-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function smoothScrollIfSamePage(e) {
    // Only intercept when we're already on /pricing — cross-page navigation is
    // left to the browser (lands on the id via scroll-margin-top).
    if (window.location.pathname.replace(/\/$/, '') !== '/pricing') return;
    var hash = this.getAttribute('href').split('#')[1];
    var target = hash && document.getElementById(hash);
    if (!target) return;
    e.preventDefault();
    var startY = window.scrollY;
    target.scrollIntoView({ behavior: 'smooth' });
    // Some browsers/embeds silently drop smooth scrolling — if nothing moved,
    // jump instantly so the link always works.
    setTimeout(function () {
      if (Math.abs(window.scrollY - startY) < 10) target.scrollIntoView();
    }, 250);
    if (history.pushState) history.pushState(null, '', '#' + hash);
  }

  function buildPanel() {
    var p = document.createElement('div');
    p.className = 'lok-pri-panel';
    LINKS.forEach(function (l) {
      var a = document.createElement('a');
      a.href = l.href;
      a.textContent = l.label;
      a.addEventListener('click', smoothScrollIfSamePage);
      p.appendChild(a);
    });
    return p;
  }

  function inject(ul) {
    var pricing = ul && ul.querySelector('a[href*="/pricing"]');
    var li = pricing ? pricing.closest('li') : null;
    if (!li || li.classList.contains('lok-pri-li')) return;       // idempotent per list
    var isMobile = !!ul.closest('.w-nav-menu, .show-in-tablet');

    li.classList.add('lok-pri-li');
    if (isMobile) li.classList.add('mob');

    var panel = buildPanel();

    if (isMobile) {
      // Touch: the link keeps navigating; a separate 44px caret button toggles
      // the accordion so the two taps never fight.
      var btn = document.createElement('button');
      btn.className = 'lok-pri-btn';
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-haspopup', 'true');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Pricing sections');
      btn.innerHTML = '<i class="lok-pri-car" aria-hidden="true"></i>';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var open = !li.classList.contains('open');
        li.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      pricing.insertAdjacentElement('afterend', btn);
    } else {
      // Desktop: caret inside the link (hover opens the panel via CSS).
      var car = document.createElement('i');
      car.className = 'lok-pri-car';
      car.setAttribute('aria-hidden', 'true');
      pricing.appendChild(car);
    }

    li.appendChild(panel);
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
