/*
  Lokali — header menus (nav injection): "About" panel + "For vendors" menu.

  2026-10-14 header redesign (F approved the mockup): the bar reads
  The Market · This week · About ▾ · For vendors ▾. The Designer's shared
  Header V1 component carries the three real links; this script adds

    - a hover panel under the EXISTING "About" link (Our story, How Lokali
      works). About itself still navigates on click.
    - a "For vendors" trigger right after About with every vendor-facing page:
      What you get, Pricing, Founding vendors, then Start here and Guides.
      (Replaces the old Features / Pricing / Resources trio; lokali-pricing-nav.js
      is retired, its scroll-margin rule for the /pricing anchors lives here now.)
    - a violet underline on the link for the page you are on (desktop only).

  Injected by JS (same established pattern as lokali-auth-nav.js) so the
  shared Webflow header component is never edited for menus — additive +
  reversible (remove the one footer <script> tag and the bar is back to
  three plain links). The file keeps its historic name so the footer pin and
  the loader notes stay valid.

  Responsive by design, works in BOTH nav menus:
    - Desktop list (.header-nav-menu-list, not in .w-nav-menu): a hover/click
      dropdown panel positioned under the trigger.
    - Mobile hamburger list (inside .w-nav-menu / .show-in-tablet): a tap-to-
      expand inline accordion. (Phones never render that list: lokali-mobile-nav.js
      builds its own drawer from its LINKS array. Keep the two in step.)

  Self-contained, idempotent (safe to run twice / on every page). Matches the
  redesigned nav link styling: Plus Jakarta Sans, 15px/600, dusk #4A4761,
  ink on hover, violet reserved for the current-page underline and panel hover.
*/
(function () {
  'use strict';

  var BRAND = '#6002EE';
  var INK = '#1A1829';
  var DUSK = '#4A4761';
  var FONT = "'Plus Jakarta Sans', sans-serif";

  // The panel under the existing About link (decorate: true = no new <li>).
  var ABOUT = {
    marker: 'lok-dd-about',
    anchor: 'a[href*="/about"]',
    decorate: true,
    links: [
      { href: '/about',         label: 'Our story' },
      { href: '/for-customers', label: 'How Lokali works' }
    ]
  };
  // One menu for everything vendor-facing, inserted after About.
  var VENDORS = {
    marker: 'lok-dd-vend',
    label: 'For vendors',
    href: null, // toggle-only trigger (button)
    anchor: 'a[href*="/about"]',
    links: [
      { href: '/for-vendors',      label: 'What you get' },
      { href: '/pricing',          label: 'Pricing' },
      { href: '/founding-vendors', label: 'Founding vendors' },
      { sep: true },
      // 2026-09-20 (F: "shrink it to two"): the nine vendor guides live on one landing
      // page grouped by task (/vendor-resources). Add a guide on that PAGE, not here.
      { href: '/start',            label: 'Starting a business? Start here' },
      { href: '/vendor-resources', label: 'Guides for vendors' }
    ]
  };
  var MENUS = [ABOUT, VENDORS];

  function injectStyles() {
    if (document.getElementById('lok-res-styles')) return;
    var css =
      // /pricing anchor targets clear the fixed header on jump (the plan cards'
      // CTA and the guides still link to #plans / #compare). Was in pricing-nav.
      '#plans,#compare,#versus,#faq{scroll-margin-top:96px;}' +
      // This week gate (see twGate): hidden until html.lok-tw. The footer row and
      // the header item are <li>s, so hide the row, not just the link, where
      // :has() exists (the header li keeps Middle's 26px padding-right: with only
      // the link hidden, The Market -> About was a double 52px gap, F 2026-10-25).
      'html:not(.lok-tw) .header-nav-menu-list a[href="/this-week"],html:not(.lok-tw) #lok-mnav-panel a[href="/this-week"],' +
      'html:not(.lok-tw) .header-nav-menu-list li:has(> a[href="/this-week"]),' +
      'html:not(.lok-tw) .lok-ft a[href="/this-week"],html:not(.lok-tw) .lok-ft li:has(> a[href="/this-week"]){display:none !important;}' +
      // Vertical alignment of the whole desktop nav row: Webflow NavbarLinks
      // ride vertical-align:top while plain links and our injected triggers sit
      // on the baseline, ~2px lower. Normalize all of them to the NavbarLink
      // position (measured: every label at the same pixel afterwards).
      '.header-nav-menu-list a.header-nav-link:not(.w-nav-link){vertical-align:top;}' +
      '.lok-res-li:not(.mob) > .lok-res-trig{position:relative;top:-2px;}' +
      '.lok-res-li{position:relative;}' +
      '.lok-res-trig{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-family:' + FONT + ';' +
        'font-size:15px;font-weight:600;color:' + DUSK + ';background:none;border:none;padding:0;margin:0;line-height:inherit;text-decoration:none;' +
        'white-space:nowrap;transition:color .15s;}' +
      '.lok-res-li:not(.mob):hover > .lok-res-trig,.lok-res-li.open > .lok-res-trig{color:' + INK + ';}' +
      // Decorated About link: the caret sits inside the real link.
      '.header-nav-link .lok-res-car{margin-left:6px;}' +
      // translate BEFORE rotate = pure-vertical nudge (post-rotation translate
      // drifts diagonally); -1px aligns the glyph with the text centre line.
      '.lok-res-car{display:inline-block;width:7px;height:7px;border-right:1.75px solid currentColor;border-bottom:1.75px solid currentColor;' +
        'transform:translateY(-1px) rotate(45deg);transition:transform .2s;flex-shrink:0;opacity:.7;}' +
      '.header-nav-link .lok-res-car{transform:translateY(-3px) rotate(45deg);}' +
      // caret flips on desktop hover OR when pinned open (click); mobile uses .open only
      '.lok-res-li:not(.mob):hover > .lok-res-trig .lok-res-car,' +
      '.lok-res-li:not(.mob):hover > .header-nav-link .lok-res-car,' +
      '.lok-res-li.open > .lok-res-trig .lok-res-car{transform:translateY(-1px) rotate(-135deg);}' +
      '.lok-res-li:not(.mob):hover > .header-nav-link .lok-res-car{transform:translateY(0) rotate(-135deg);}' +
      // desktop floating panel — opens on pure-CSS :hover (robust; no JS event quirks) or .open
      '.lok-res-panel{position:absolute;top:100%;left:0;margin-top:14px;min-width:232px;background:#fff;border:1px solid #DEDAEE;' +
        'border-radius:14px;box-shadow:0 2px 4px rgba(40,32,90,.06),0 14px 36px rgba(40,32,90,.14);padding:8px;opacity:0;visibility:hidden;' +
        'transform:translateY(-6px);transition:opacity .16s ease,transform .16s ease,visibility .16s ease;z-index:9999;}' +
      // a hit-bridge so the cursor can cross the gap from trigger to panel without closing
      '.lok-res-li:not(.mob) > .lok-res-panel::before{content:"";position:absolute;top:-14px;left:0;right:0;height:14px;}' +
      '.lok-res-li:not(.mob):hover > .lok-res-panel,' +
      '.lok-res-li.open > .lok-res-panel{opacity:1;visibility:visible;transform:translateY(0);}' +
      '.lok-res-panel a{display:block;font-family:' + FONT + ';font-size:14px;font-weight:600;color:' + INK + ';text-decoration:none;' +
        'padding:9px 12px;border-radius:9px;white-space:nowrap;}' +
      '.lok-res-panel a:hover{background:#F3EBFF;color:' + BRAND + ';}' +
      '.lok-res-sep{height:1px;background:#EEEDF6;margin:6px 4px;}' +
      // Current page: a 2px violet rule under the label, anchored to the bar's bottom edge.
      '.header-bottom-wrapper .header-nav-link.lok-nav-cur,.header-bottom-wrapper .lok-res-trig.lok-nav-cur{color:' + INK + ';}' +
      '.header-bottom-wrapper .lok-nav-cur{position:relative;}' +
      // Sits 1px above the bar's hairline: links are 21px tall at y=23 in a 72px bar, the
      // 26px trigger starts 2px higher (measured in the harness, 2026-10-14).
      '.header-bottom-wrapper .lok-nav-cur::after{content:"";position:absolute;left:0;right:0;bottom:-26px;height:2px;border-radius:2px;background:' + BRAND + ';}' +
      '.header-bottom-wrapper .lok-res-trig.lok-nav-cur::after{bottom:-22px;}' +
      // Only the decorated link (About) carries a caret; a plain current link
      // (The Market) gets the full-width rule (F 2026-10-24: the line ran under
      // half the word).
      '.header-bottom-wrapper .header-nav-link.lok-res-link.lok-nav-cur::after{right:17px;}' + // stop short of the caret on About
      '.header-bottom-wrapper .lok-res-trig.lok-nav-cur::after{right:13px;}' +
      // mobile accordion variant (inside the hamburger menu)
      '.lok-res-li.mob .lok-res-trig{display:flex;justify-content:space-between;width:100%;}' +
      '.lok-res-li.mob .lok-res-panel{position:static;opacity:1;visibility:visible;transform:none;box-shadow:none;border:none;' +
        'background:none;padding:0 0 0 14px;margin:4px 0 0;min-width:0;max-height:0;overflow:hidden;transition:max-height .24s ease;}' +
      '.lok-res-li.mob.open .lok-res-panel{max-height:520px;}' +
      '.lok-res-li.mob .lok-res-panel a{padding:8px 6px;}';
    var s = document.createElement('style');
    s.id = 'lok-res-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function buildPanel(links) {
    var p = document.createElement('div');
    p.className = 'lok-res-panel';
    links.forEach(function (l) {
      if (l.sep) {
        var d = document.createElement('div');
        d.className = 'lok-res-sep';
        p.appendChild(d);
        return;
      }
      var a = document.createElement('a');
      a.href = l.href;
      a.textContent = l.label;
      p.appendChild(a);
    });
    return p;
  }

  function pathOf(href) {
    try { return new URL(href, location.origin).pathname.replace(/\/+$/, '') || '/'; } catch (e) { return ''; }
  }
  var HERE = location.pathname.replace(/\/+$/, '') || '/';

  // Decorate an existing link (About): caret inside the link, panel in its <li>,
  // hover-only on desktop, tap-to-expand caret on the mobile list. The link
  // keeps navigating in both.
  function decorate(ul, cfg) {
    var a = ul.querySelector(cfg.anchor);
    var li = a ? a.closest('li') : null;
    if (!li || li.classList.contains(cfg.marker)) return;
    var isMobile = !!ul.closest('.w-nav-menu, .show-in-tablet');
    li.classList.add('lok-res-li', cfg.marker);
    if (isMobile) li.classList.add('mob');
    var car = document.createElement('i');
    car.className = 'lok-res-car';
    car.setAttribute('aria-hidden', 'true');
    a.appendChild(car);
    a.classList.add('lok-res-link');
    li.appendChild(buildPanel(cfg.links));
    if (isMobile) {
      // Touch: the link keeps navigating; the caret toggles the accordion.
      car.style.padding = '12px';
      car.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        li.classList.toggle('open');
      });
    }
    // Current page underline: About for /about, and for the panel's pages.
    if (!isMobile && cfg.links.some(function (l) { return !l.sep && pathOf(l.href) === HERE; })) a.classList.add('lok-nav-cur');
  }

  function inject(ul, cfg) {
    if (!ul || ul.querySelector('.' + cfg.marker)) return;        // idempotent per list+menu
    var anchor = ul.querySelector(cfg.anchor);
    var anchorLi = anchor ? anchor.closest('li') : null;
    var isMobile = !!ul.closest('.w-nav-menu, .show-in-tablet');

    var li = document.createElement('li');
    li.className = (anchorLi ? anchorLi.className.replace(/\blok-\S+/g, '').replace(/\bmob\b/, '').trim() + ' ' : 'header-nav-list-item middle ') +
      'lok-res-li ' + cfg.marker + (isMobile ? ' mob' : '');

    // Link triggers navigate on click (desktop hover still reveals the panel);
    // null-href triggers are toggle buttons.
    var trig;
    if (cfg.href) {
      trig = document.createElement('a');
      trig.href = cfg.href;
    } else {
      trig = document.createElement('button');
      trig.setAttribute('type', 'button');
    }
    trig.className = 'lok-res-trig';
    trig.setAttribute('aria-haspopup', 'true');
    trig.setAttribute('aria-expanded', 'false');
    trig.innerHTML = cfg.label + '<i class="lok-res-car" aria-hidden="true"></i>';
    if (!isMobile && cfg.links.some(function (l) { return !l.sep && pathOf(l.href) === HERE; })) trig.classList.add('lok-nav-cur');

    var panel = buildPanel(cfg.links);
    li.appendChild(trig);
    li.appendChild(panel);

    if (anchorLi && anchorLi.parentNode === ul) ul.insertBefore(li, anchorLi.nextSibling);
    else ul.appendChild(li);

    if (cfg.href) return; // link trigger: hover-only panel, click navigates

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

  // Plain links (The Market, This week): underline the one for this page.
  function markCurrent(ul) {
    if (ul.closest('.w-nav-menu, .show-in-tablet')) return;
    var links = ul.querySelectorAll('a.header-nav-link');
    for (var i = 0; i < links.length; i++) {
      if (pathOf(links[i].getAttribute('href') || '') === HERE) links[i].classList.add('lok-nav-cur');
    }
  }

  function run() {
    var lists = document.querySelectorAll('.header-nav-menu-list');
    if (!lists.length) return false;
    injectStyles();
    Array.prototype.forEach.call(lists, function (ul) {
      MENUS.forEach(function (cfg) { if (cfg.decorate) decorate(ul, cfg); else inject(ul, cfg); });
      markCurrent(ul);
    });
    return true;
  }

  // ── This week gate (F 2026-10-14: "hide THIS WEEK until someone actually uses
  // that feature"). Every public link to /this-week (desktop header link, phone
  // menu row, footer row — all carry href="/this-week") is hidden until
  // weekend_feed() has at least TW_MIN upcoming posts; then html.lok-tw reveals
  // them. The answer is cached per tab for an hour so it costs one RPC per
  // session, not one per page. The page itself stays reachable by URL, and the
  // vendor side (Followers > Where I'll be, storefront block, Thursday email)
  // is untouched: this only decides whether the site POINTS at the page.
  var TW_MIN = 3, TW_KEY = 'lokali_tw', TW_TTL = 60 * 60 * 1000;
  function twShow() { document.documentElement.classList.add('lok-tw'); }
  function twGate() {
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(TW_KEY) || 'null'); } catch (e) {}
    if (cached && cached.t && (Date.now() - cached.t) < TW_TTL) { if (cached.on) twShow(); return; }
    var ready = window.LokaliSupabaseReady;
    if (!ready || !ready.then) return; // no client on this page: stay hidden
    ready.then(function () {
      var SB = window.LokaliSupabaseAPI;
      if (!SB || !SB.posts || !SB.posts.weekendFeed) return;
      return SB.posts.weekendFeed(9).then(function (res) {
        var now = Date.now();
        var n = (res && Array.isArray(res.data)) ? res.data.filter(function (e) {
          return e && e.vendor && e.vendor.slug && e.starts_at && Date.parse(e.ends_at || e.starts_at) >= now;
        }).length : 0;
        var on = n >= TW_MIN;
        try { sessionStorage.setItem(TW_KEY, JSON.stringify({ on: on, t: Date.now() })); } catch (e) {}
        if (on) twShow();
      });
    }).catch(function () {});
  }

  function boot() {
    twGate();
    if (run()) return;
    // The header is server-rendered, but retry briefly in case it paints late.
    var n = 0, t = setInterval(function () { if (run() || ++n > 20) clearInterval(t); }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
