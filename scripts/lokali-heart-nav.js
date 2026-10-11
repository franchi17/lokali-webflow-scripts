/**
 * lokali-heart-nav.js — shoppers can find the account (2026-10-11).
 *
 * Site-wide (footer loader). Three small things, all additive:
 *   1. A heart in the header, beside Login / the account chip, on every page.
 *      Signed out: opens the create-account overlay ("Follow the makers you
 *      like"). Signed in: a link to /account#following with a count badge of
 *      the vendors this person follows.
 *   2. Home page, signed out only: one shopper line under the hero buttons
 *      ("Follow the makers you like ... Create an account").
 *   3. Desktop nav: "For customers" as its own item after "The Market" (F
 *      2026-10-11: out of the Features dropdown). The phone panel gets the
 *      same row from lokali-mobile-nav.js.
 *
 * Signed-in state = the LOKALI_ACCT_CACHE that lokali-auth.js writes (same
 * source lokali-auth-nav.js paints from). The follow count comes from the
 * favorites API (a "save" IS a follow, #185). No new endpoints.
 *
 * Depends on (all optional, degrade to a plain link): window.LokaliAuth
 * (openSignUp), window.LokaliAPI (favorites GET), window.gtag.
 */
(function () {
  'use strict';
  if (window.__lokHeartNav) return;
  window.__lokHeartNav = true;

  var CACHE_KEY = 'LOKALI_ACCT_CACHE';
  var FOLLOWING_URL = '/account#following';
  var SIGNUP_INTENT_KEY = 'lokali_signup_intent';
  var FONT = "'Plus Jakarta Sans',-apple-system,'Segoe UI',sans-serif";
  var HEART = 'M244 84L255.1 96L267.1 84.02C300.6 51.37 347 36.51 392.6 44.1C461.5 55.58 512 115.2 512 185.1V190.9C512 232.4 494.8 272.1 464.4 300.4L283.7 469.1C276.2 476.1 266.3 480 256 480C245.7 480 235.8 476.1 228.3 469.1L47.59 300.4C17.23 272.1 0 232.4 0 190.9V185.1C0 115.2 50.52 55.58 119.4 44.1C164.1 36.51 211.4 51.37 244 84zM255.1 163.9L210.1 117.1C188.4 96.28 157.6 86.4 127.3 91.44C81.55 99.07 48 138.7 48 185.1V190.9C48 219.1 59.71 246.1 80.34 265.3L256 429.3L431.7 265.3C452.3 246.1 464 219.1 464 190.9V185.1C464 138.7 430.4 99.07 384.7 91.44C354.4 86.4 323.6 96.28 301.9 117.1L255.1 163.9z';
  var HEART_SOLID = 'M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z';

  function acct() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }
  function signedIn() { return !!acct(); }
  function isHome() { return (location.pathname || '/').replace(/\/+$/, '') === ''; }
  function ga(name, params) { try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {} }
  function svg(path, size) {
    return '<svg viewBox="0 0 512 512" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false"><path fill="currentColor" d="' + path + '"/></svg>';
  }

  function injectCSS() {
    if (document.getElementById('lok-heart-nav-css')) return;
    var s = document.createElement('style');
    s.id = 'lok-heart-nav-css';
    s.textContent = [
      '#lok-heart-nav{position:relative;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;flex:0 0 auto;',
      'border:none;background:none;padding:0;margin:0 2px;border-radius:50%;color:#6002EE;cursor:pointer;text-decoration:none;font-family:' + FONT + ';}',
      '#lok-heart-nav:hover{background:rgba(96,2,238,.07);}',
      '#lok-heart-nav:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
      '#lok-heart-nav svg{display:block;}',
      '#lok-heart-nav .lok-heart-cnt{position:absolute;top:4px;right:2px;min-width:17px;height:17px;border-radius:100px;background:#FF8D00;color:#fff;',
      'font-size:10.5px;font-weight:800;line-height:17px;text-align:center;padding:0 4px;box-sizing:border-box;}',
      '#lok-heart-nav .lok-heart-cnt:empty{display:none;}',
      // Tooltip for the signed-out heart (hover and keyboard focus); never on touch.
      // Brand pink (F 2026-10-11: the Leads wait-badge pair, #B1006A on #FDE7F3), centred
      // under the heart. No ink surfaces.
      '#lok-heart-nav .lok-heart-tip{position:absolute;top:calc(100% + 6px);left:50%;right:auto;transform:translateX(-50%);background:#FDE7F3;color:#B1006A;border:1px solid #F7CDE4;font-size:12px;font-weight:600;',
      'white-space:nowrap;border-radius:8px;padding:6px 10px;opacity:0;pointer-events:none;transition:opacity .12s;z-index:5;}',
      '@media (hover:hover){#lok-heart-nav:hover .lok-heart-tip,#lok-heart-nav:focus-visible .lok-heart-tip{opacity:1;}}',
      // Phone row 1 is tight (logo + pill + Login + burger): 36px heart, no margin.
      '@media (max-width:767px){#lok-heart-nav{width:36px;height:36px;margin:0;}#lok-heart-nav .lok-heart-cnt{top:0;right:-2px;}}',
      // Home hero line.
      '#lok-home-shop{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:18px;font-family:' + FONT + ';font-size:14.5px;line-height:1.5;color:#4A4761;}',
      '#lok-home-shop svg{color:#6002EE;vertical-align:-2px;margin-right:2px;}',
      '#lok-home-shop a{color:#6002EE;font-weight:700;text-decoration:underline;text-underline-offset:3px;}',
      '@media (max-width:767px){#lok-home-shop{justify-content:center;text-align:center;font-size:14px;}}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── 1. header heart ───────────────────────────────────────────────────
  function stampCustomerIntent() { try { sessionStorage.setItem(SIGNUP_INTENT_KEY, 'customer:' + Date.now()); } catch (e) {} }
  function openSignup(source) {
    ga('account_prompt', { source: source });
    stampCustomerIntent();
    try { sessionStorage.setItem('lokali_prompt_source', source); } catch (e) {}
    var A = window.LokaliAuth;
    if (A && typeof A.openSignUp === 'function') { A.openSignUp({ intent: 'customer', follow: { generic: true }, source: source }); return; }
    window.location.href = '/sign-up';
  }

  function buildHeart() {
    var on = signedIn();
    var el = document.createElement(on ? 'a' : 'button');
    el.id = 'lok-heart-nav';
    if (on) {
      el.href = FOLLOWING_URL;
      el.setAttribute('aria-label', 'Vendors you follow');
      el.title = 'Vendors you follow';
      el.innerHTML = svg(HEART, 20) + '<span class="lok-heart-cnt" aria-hidden="true"></span>';
    } else {
      el.type = 'button';
      el.setAttribute('aria-label', 'Follow vendors you like. Create an account.');
      el.innerHTML = svg(HEART, 20) + '<span class="lok-heart-tip" aria-hidden="true">Follow vendors you like</span>';
      el.addEventListener('click', function (e) { e.preventDefault(); openSignup('header_heart'); });
    }
    return el;
  }

  // Count of followed vendors for the badge (signed in only). Cached for the
  // next page paint; refreshed in the background.
  var COUNT_KEY = 'lokali_follow_count';
  function paintCount(n) {
    var c = document.querySelector('#lok-heart-nav .lok-heart-cnt');
    if (!c) return;
    c.textContent = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
    var a = document.getElementById('lok-heart-nav');
    if (a) a.setAttribute('aria-label', n > 0 ? 'Vendors you follow: ' + n : 'Vendors you follow');
  }
  function refreshCount() {
    try { var cached = parseInt(localStorage.getItem(COUNT_KEY), 10); if (cached >= 0) paintCount(cached); } catch (e) {}
    var tries = 0;
    (function poll() {
      var A = window.LokaliAPI;
      if (!(A && A.request && A.getToken && A.getToken())) { if (++tries < 40) setTimeout(poll, 250); return; }
      A.request('favorites', 'GET', '/favorites', null, true).then(function (res) {
        var rows = res && res.data;
        if (!Array.isArray(rows)) return;
        paintCount(rows.length);
        try { localStorage.setItem(COUNT_KEY, String(rows.length)); } catch (e) {}
      }).catch(function () {});
    })();
  }

  function mountHeart() {
    if (document.getElementById('lok-heart-nav')) return true;
    var right = document.querySelector('.header-right-side');
    if (!right) return false;
    // Anchor: the Login link (signed out) or the account chip (signed in); the
    // heart sits just before it. Fallback: before the hamburger.
    var anchor = null, links = right.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      var h = (links[i].getAttribute('href') || '').replace(/[?#].*$/, '').replace(/\/+$/, '');
      if (h === '/login' || /^(login|log in|sign in)$/i.test((links[i].textContent || '').trim())) { anchor = links[i]; break; }
    }
    anchor = right.querySelector('.lok-acct') || anchor || right.querySelector('.hamburger-menu-wrapper, .w-nav-button');
    var heart = buildHeart();
    if (anchor && anchor.parentNode === right) right.insertBefore(heart, anchor); else right.appendChild(heart);
    if (signedIn()) refreshCount();
    return true;
  }

  // ── 2. home hero line (signed out) ────────────────────────────────────
  function mountHomeLine() {
    if (!isHome() || signedIn() || document.getElementById('lok-home-shop')) return;
    // The header carries a hidden .buttons-row too; take the hero's (the visible one).
    var rows = document.querySelectorAll('.buttons-row'), row = null;
    for (var i = 0; i < rows.length; i++) { if (rows[i].closest('.hero') && rows[i].offsetParent) { row = rows[i]; break; } }
    if (!row || !row.parentNode) return;
    var p = document.createElement('p');
    p.id = 'lok-home-shop';
    p.innerHTML = '<span>' + svg(HEART_SOLID, 14) + ' Follow the makers you like and hear where they’ll be each week. <a href="/sign-up">Create an account</a></span>';
    p.querySelector('a').addEventListener('click', function (e) {
      if (!(window.LokaliAuth && typeof window.LokaliAuth.openSignUp === 'function')) { stampCustomerIntent(); return; }
      e.preventDefault(); openSignup('home_line');
    });
    row.parentNode.insertBefore(p, row.nextSibling);
  }

  // ── 3. desktop nav: "For customers" after "The Market" ────────────────
  // The list is <li> items with the link inside. Clone the Market <li>, point
  // it at /for-customers. If the seven-item header no longer fits (signed-in
  // headers are ~250px wider), take it back out and put "For customers" into
  // the Features panel instead (lokali-resources-nav.js keeps only For vendors
  // there since this release), so the page is always one click away.
  function mountNavItem() {
    if (document.getElementById('lok-nav-customers')) return;
    var list = document.querySelector('.header-nav-menu-list');
    if (!list) return;
    var market = null, as = list.querySelectorAll('a.header-nav-link');
    for (var i = 0; i < as.length; i++) {
      if ((as[i].getAttribute('href') || '').replace(/\/+$/, '') === '/the-market') { market = as[i]; break; }
    }
    var li = market && market.closest('li');
    if (!li || li.parentNode !== list) return;
    var clone = li.cloneNode(true);
    var a = clone.querySelector('a.header-nav-link') || clone.querySelector('a');
    if (!a) return;
    var here = (location.pathname || '').replace(/\/+$/, '') === '/for-customers';
    a.id = 'lok-nav-customers';
    a.href = '/for-customers';
    a.textContent = 'For customers';
    a.classList.toggle('w--current', here);
    if (here) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    list.insertBefore(clone, li.nextSibling);
    fitNavItem(clone);
  }
  function fitNavItem(clone) {
    var check = function () {
      if (!clone.parentNode) return;
      // Measure the LINKS (the <li> boxes carry spacing) against the logo and the
      // first visible thing in the right-hand group, the way lokali-mobile-nav's
      // own search fit does. That fit has already run (resize dispatched below),
      // so the search field is icon-only by now if the row needed the room.
      if (!clone.offsetParent) return; // nav hidden (hamburger widths): nothing to fit
      var links = clone.parentNode.querySelectorAll('.header-nav-link, .lok-res-trig');
      var left = Infinity, edge = 0;
      for (var i = 0; i < links.length; i++) {
        var r = links[i].getBoundingClientRect();
        if (!r.width || !links[i].offsetParent) continue;
        if (r.left < left) left = r.left;
        if (r.right > edge) edge = r.right;
      }
      if (!isFinite(left)) return;
      // The logo LINK box is 60px wider than the logo image; the image is the edge.
      var logo = document.querySelector('.header-logo-link img, .header-logo, .header-logo-link'), right = document.querySelector('.header-right-side');
      var rightLeft = Infinity;
      if (right) {
        var kids = right.children;
        for (var k = 0; k < kids.length; k++) {
          var kid = kids[k];
          // The header search form's box reaches well left of its magnifier (the
          // field itself is what mobile-nav shows or hides); the magnifier is the
          // visible edge, so measure that.
          if (kid.id === 'lok-hdr-search' && kid.querySelector('button')) kid = kid.querySelector('button');
          var kr = kid.getBoundingClientRect();
          if (kr.width && kid.offsetParent && kr.left < rightLeft) rightLeft = kr.left;
        }
      }
      var tight = left < 0 ||
        (logo && left < logo.getBoundingClientRect().right + 16) ||
        edge > rightLeft - 12;
      if (!tight) return;
      clone.parentNode.removeChild(clone);
      var panel = document.querySelector('.lok-dd-feat:not(.mob) .lok-res-panel');
      if (panel && !panel.querySelector('a[href="/for-customers"]')) {
        var a = document.createElement('a');
        a.href = '/for-customers'; a.textContent = 'For customers';
        panel.insertBefore(a, panel.firstChild);
      }
    };
    // lokali-mobile-nav.js refits the header on resize (search field to icon-only,
    // tighter nav spacing when the links collide). Ask for that refit first and
    // measure after it has run, or a header that WOULD fit gets judged too tight.
    var refitThen = function (ms) {
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
      setTimeout(check, ms);
    };
    refitThen(350);
    window.addEventListener('load', function () { refitThen(100); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { refitThen(100); });
    setTimeout(function () { refitThen(100); }, 1800); // after auth-nav swaps Login for the wider account chip
  }

  function init() {
    injectCSS();
    // mountNavItem() retired 2026-10-11 (F: 'this menu is too cramped'): 'For customers' lives
    // in the Features panel on desktop (lokali-resources-nav.js) and as its own row on phones.
    // mountHomeLine() retired 2026-10-11 (F: 'I don't want this line on the home page').
    if (!mountHeart()) {
      // Header can render late on some pages; retry briefly.
      var n = 0, iv = setInterval(function () { if (mountHeart() || ++n > 20) clearInterval(iv); }, 250);
    }
    // After a sign-up or sign-in in the overlay the page usually reloads; if it
    // does not, swap the heart to its signed-in form.
    window.addEventListener('lokali:authed', function () {
      var old = document.getElementById('lok-heart-nav');
      if (old && old.tagName === 'BUTTON' && signedIn()) { old.parentNode.replaceChild(buildHeart(), old); refreshCount(); }
      var line = document.getElementById('lok-home-shop'); if (line) line.remove();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
