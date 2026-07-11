/*
  Lokali — Auth-aware header nav (anti-flash), role-aware avatar menu.

  Signed out: the native Webflow "Login" link is left untouched.
  Signed in:  the "Login" link is replaced with an avatar + name that opens a
  dropdown menu. Items depend on role (one identity, both capabilities):
    - vendor   → My Dashboard, My Account, Sign out
    - customer → My Account, Sign out
  On the mobile panel (#lok-mnav-panel) the same items render as a stacked list.

  Role/name come from GET {AUTH_BASE}/account using the Xano token in
  localStorage['LOKALI_AUTH_TOKEN'] (Xano mode; shared across the origin so it
  works on every page — no dependency on api-client being loaded here), or from
  window.LokaliAuth in Supabase mode. The last result is cached in
  localStorage['LOKALI_ACCT_CACHE'] so the menu paints instantly on the next
  page, before the network call returns.

  ANTI-FLASH: load in the <head> (Scripts API "header"). For users we already
  know are signed in, it synchronously hides the static "Login" link until the
  avatar replaces it, so "Login" never flashes. A failsafe timeout always
  reveals everything so a swap that never happens can't leave a link hidden.

  Self-contained, idempotent. Pairs with lokali-mobile-nav.js.
*/
(function () {
  'use strict';

  // Vendor signup intent (#57 QA find): since the role default flipped to
  // CUSTOMER (2026-07-01), any signup missing a stashed intent mints a
  // customer — but only pricing CTAs were stashing 'vendor'. Delegate here
  // (header script = every page): a click on ANY control whose text reads
  // like a vendor signup stashes the intent the auth sync reads. Non-link
  // controls (e.g. the homepage "Join as a Vendor" div) also get routed.
  document.addEventListener('click', function (e) {
    var el = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!el || el.nodeType !== 1 || !el.closest) return;
    var hit = null, node = el;
    for (var i = 0; node && node !== document.body && i < 6; i++, node = node.parentElement) {
      var t = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (t.length < 40 && (/^open (a|your|my) storefront$/.test(t) || t === 'sell on lokali' || t === 'become a vendor' || t === 'sign up to be a vendor' || t === 'join as a vendor' || t.indexOf('list your business') === 0)) { hit = node; break; }
    }
    if (!hit) return;
    try { sessionStorage.setItem('lokali_signup_intent', 'vendor'); } catch (err) {}
    // #66: a signed-in person already HAS an account — "Become a Vendor" must not
    // send them to /sign-up, which bounces an authenticated user to the homepage
    // (dead end). Route them to the account hub's "Open your storefront" card
    // instead. (Vendors already have this CTA hidden; a customer opens a
    // storefront and is promoted server-side.)
    if (token()) {
      e.preventDefault();
      var c = getCache();
      window.location.href = (c && c.role === 'vendor') ? DASH_URL : (ACCOUNT_URL + '#storefront');
      return;
    }
    // Signed OUT: real links (header "Become a Vendor" -> /sign-up) proceed
    // normally with the intent stashed; non-link controls get routed manually.
    var a = hit.closest('a[href]');
    var href = a ? (a.getAttribute('href') || '') : '';
    if (!a || href === '#' || href === '') {
      e.preventDefault();
      window.location.href = '/sign-up';
    }
  }, true);

  var TOKEN_KEY = 'LOKALI_AUTH_TOKEN';
  var CACHE_KEY = 'LOKALI_ACCT_CACHE';
  var AUTH_BASE = (typeof window !== 'undefined' && window.LOKALI_AUTH_BASE) ||
                  'https://x8ki-letl-twmt.n7.xano.io/api:mp2-aEJM';
  var DASH_URL    = '/vendor-dashboard/dashboard';
  var ACCOUNT_URL = '/account';
  var LOGIN_URL   = '/login';
  var SCOPES   = '.header-wrapper, #lok-mnav-panel';
  var HIDE_CSS = '.header-wrapper a[href$="/login"], #lok-mnav-panel a[href$="/login"]';

  // Supabase-backend mode (dormant until cutover): there is no Xano token —
  // supabase-js owns the session. "Signed in" at parse time = the acct cache
  // that lokali-auth.js writes after each auth-sync (same instant-paint
  // behavior the Xano token gave us; the cache was already the paint source).
  var SUPA_MODE = (typeof window !== 'undefined' && window.LOKALI_BACKEND === 'supabase');

  function token() {
    if (SUPA_MODE) return getCache() ? 'supabase' : null;
    try { var t = localStorage.getItem(TOKEN_KEY); return (t && t.length > 20) ? t : null; }
    catch (e) { return null; }
  }
  function getCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }
  function setCache(o) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(o)); } catch (e) {} }
  function clearAll() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) {} }

  if (!token()) return; // signed out → leave the native "Login" link alone

  var acct = getCache();   // {role, first_name, last_name} or null
  var revealed = false;

  // ── anti-flash hide rule ───────────────────────────────────────────────
  var hideStyle = null;
  function injectHide() {
    if (hideStyle) return;
    var el = document.createElement('style');
    el.id = 'lok-auth-hide';
    el.textContent = HIDE_CSS + '{visibility:hidden!important;}';
    (document.head || document.documentElement).appendChild(el);
    hideStyle = el;
  }
  function removeHide() {
    if (hideStyle && hideStyle.parentNode) hideStyle.parentNode.removeChild(hideStyle);
    hideStyle = null;
  }

  function injectCSS() {
    if (document.getElementById('lok-acct-styles')) return;
    var s = document.createElement('style');
    s.id = 'lok-acct-styles';
    s.textContent = [
      ".lok-acct{position:relative;display:inline-flex;align-items:center;font-family:'Plus Jakarta Sans',-apple-system,sans-serif;}",
      ".lok-acct-trigger{display:inline-flex;align-items:center;gap:8px;cursor:pointer;background:none;border:none;padding:4px 8px 4px 4px;border-radius:100px;font-family:inherit;transition:background .12s;}",
      ".lok-acct-trigger:hover{background:rgba(96,2,238,.06);}",
      ".lok-acct-av{width:30px;height:30px;border-radius:50%;background:#F0E6FF;color:#6002EE;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-transform:uppercase;}",
      ".lok-acct-name{font-size:13px;font-weight:500;color:#1A1829;white-space:nowrap;}",
      ".lok-acct-caret{width:14px;height:14px;flex-shrink:0;color:#8E8BA6;transition:transform .15s;}",
      ".lok-acct.open .lok-acct-caret{transform:rotate(180deg);}",
      ".lok-acct-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:190px;background:#fff;border:.5px solid #EEEDF6;border-radius:12px;box-shadow:0 12px 32px rgba(26,24,41,.14);padding:6px;display:none;z-index:1000;}",
      ".lok-acct.open .lok-acct-menu{display:block;}",
      ".lok-acct-menu a,.lok-acct-menu button{display:block;width:100%;text-align:left;padding:9px 12px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:500;color:#1A1829;background:none;border:none;cursor:pointer;text-decoration:none;box-sizing:border-box;}",
      ".lok-acct-menu a:hover,.lok-acct-menu button:hover{background:#F7F6FC;color:#6002EE;}",
      ".lok-acct-sep{height:.5px;background:#EEEDF6;margin:6px 4px;}",
      ".lok-acct-menu .lok-acct-signout{color:#8E8BA6;}",
      // #66 Phase 2 — identity switcher rows.
      ".lok-acct-menu{min-width:210px;}",
      ".lok-acct-cap{font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#B3B1C6;padding:6px 12px 3px;}",
      ".lok-acct-menu a.lok-idsw{display:flex;align-items:center;gap:10px;padding:8px 10px;}",
      ".lok-acct-menu a.lok-idsw:hover{background:#F7F6FC;}",
      ".lok-idsw-ic{width:30px;height:30px;border-radius:8px;background:#F0E6FF;color:#6002EE;display:flex;align-items:center;justify-content:center;flex-shrink:0;}",
      ".lok-idsw-ic svg{width:16px;height:16px;}",
      ".lok-idsw-txt{display:flex;flex-direction:column;min-width:0;line-height:1.25;}",
      ".lok-idsw-name{font-size:13px;font-weight:600;color:#1A1829;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;}",
      ".lok-idsw-sub{font-size:11px;font-weight:500;color:#8E8BA6;}",
      ".lok-idsw.is-current .lok-idsw-ic{background:#6002EE;color:#fff;}",
      ".lok-idsw.is-current .lok-idsw-name{color:#6002EE;}",
      // Shopping row = orange (shopper), overriding the violet default above.
      ".lok-idsw--shop .lok-idsw-ic{background:#FFF0E1;color:#FF8D00;}",
      ".lok-idsw--shop.is-current .lok-idsw-ic{background:#FF8D00;color:#fff;}",
      ".lok-idsw--shop.is-current .lok-idsw-name{color:#FF8D00;}",
      ".lok-idsw-dot{margin-left:auto;width:7px;height:7px;border-radius:50%;background:#2BB673;flex-shrink:0;}",
      "#lok-mnav-panel .lok-idsw-name{max-width:none;}",
      // mobile panel: render the menu inline (no trigger, no dropdown chrome)
      "#lok-mnav-panel .lok-acct{display:block;width:100%;}",
      "#lok-mnav-panel .lok-acct-trigger{display:none;}",
      "#lok-mnav-panel .lok-acct-menu{display:block;position:static;border:none;box-shadow:none;padding:0;min-width:0;}",
      "#lok-mnav-panel .lok-acct-menu a,#lok-mnav-panel .lok-acct-menu button{padding:12px 0;font-size:15px;}"
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ── helpers ────────────────────────────────────────────────────────────
  function pathOf(href) {
    try { return new URL(href, window.location.origin).pathname.replace(/\/+$/, ''); }
    catch (e) { return (href || '').replace(/[?#].*$/, '').replace(/\/+$/, ''); }
  }
  function isLoginLink(a) {
    if (pathOf(a.getAttribute('href') || '') === LOGIN_URL) return true;
    var txt = (a.textContent || '').trim().toLowerCase();
    return txt === 'login' || txt === 'log in' || txt === 'sign in';
  }
  function initialsOf(a) {
    var f = (a && a.first_name || '').trim(), l = (a && a.last_name || '').trim();
    var s = ((f[0] || '') + (l[0] || '')).trim();
    return s || (f[0] || '');
  }
  function caretSVG() {
    return '<svg class="lok-acct-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // #66 Phase 2 — identity-switcher icons (storefront vs. person).
  var IC_STORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9"/><path d="M3 9a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 003 0"/><path d="M9 20v-6h6v6"/></svg>';
  // Shopping = Font Awesome (free solid) cart-shopping. Fill-based (not stroke),
  // and coloured orange via the .lok-idsw--shop CSS — orange = shopper, purple =
  // storefront, the site-wide identity colour code.
  var IC_SHOP = '<svg viewBox="0 0 576 512" fill="currentColor"><path d="M0 24C0 10.7 10.7 0 24 0L69.5 0c22 0 41.5 12.8 50.6 32l411 0c26.3 0 45.5 25 38.6 50.4l-41 152.3c-8.5 31.4-37 53.3-69.5 53.3l-288.5 0 5.4 28.5c2.2 11.3 12.1 19.5 23.6 19.5L488 488c13.3 0 24 10.7 24 24s-10.7 24-24 24l-288.3 0c-34.6 0-64.3-24.6-70.7-58.5L77.4 54.5c-.7-3.8-4-6.5-7.9-6.5L24 48C10.7 48 0 37.3 0 24zM128 464a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm336-48a48 48 0 1 1 0 96 48 48 0 1 1 0-96z"/></svg>';

  function idRow(href, icon, name, sub, current, shop) {
    return '<a href="' + href + '" role="menuitem" class="lok-idsw' + (shop ? ' lok-idsw--shop' : '') + (current ? ' is-current' : '') + '">' +
      '<span class="lok-idsw-ic">' + icon + '</span>' +
      '<span class="lok-idsw-txt"><span class="lok-idsw-name">' + esc(name) + '</span>' +
      '<span class="lok-idsw-sub">' + esc(sub) + '</span></span>' +
      (current ? '<span class="lok-idsw-dot" title="You’re here"></span>' : '') +
    '</a>';
  }

  function menuItemsHTML(a) {
    var role = a && a.role;
    var html = '';
    // #66 Phase 2 — a person who owns a storefront gets an identity switcher, not
    // two look-alike links: their Storefront (the business) ↔ their Shopping space
    // (saves/reviews/account). One login, one session — pure navigation. People
    // without a storefront just see "My Account" (nothing to switch between).
    if (role === 'vendor') {
      var path = (window.location.pathname || '').replace(/\/+$/, '');
      var inStore = path.indexOf('/vendor-dashboard') === 0;
      var store = (a && a.business_name || '').trim() || 'My storefront';
      var person = (a && a.first_name || '').trim();
      html += '<div class="lok-acct-cap">Switch to</div>';
      html += idRow(DASH_URL, IC_STORE, store, 'Storefront', inStore, false);
      html += idRow(ACCOUNT_URL, IC_SHOP, person || 'Shopping', person ? 'Shopping' : 'Saves & reviews', !inStore, true);
    } else {
      html += '<a href="' + ACCOUNT_URL + '" role="menuitem">My Account</a>';
    }
    html += '<div class="lok-acct-sep"></div>';
    html += '<button type="button" class="lok-acct-signout" role="menuitem">Sign out</button>';
    return html;
  }

  // Hide the header "Become a Vendor" CTA once we know the user is already a
  // vendor (it's redundant for them). Customers still see it. Scoped to the
  // header + mobile nav only — footer "For Vendors" links are left alone.
  function hideBecomeVendorForVendor() {
    if (!acct || acct.role !== 'vendor') return;
    var scopes = document.querySelectorAll(SCOPES);
    for (var s = 0; s < scopes.length; s++) {
      var links = scopes[s].querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var href = pathOf(a.getAttribute('href') || '');
        var txt = (a.textContent || '').trim().toLowerCase();
        if (href === '/sign-up' || txt === 'become a vendor' || /^open (a|your|my) storefront$/.test(txt)) {
          a.style.setProperty('display', 'none', 'important');
          a.setAttribute('data-lok-bv-hidden', '1');
        }
      }
    }
  }

  function buildAcctEl() {
    var wrap = document.createElement('div');
    wrap.className = 'lok-acct';
    wrap.setAttribute('data-lok-acct', '1');
    wrap.innerHTML =
      '<button type="button" class="lok-acct-trigger" aria-haspopup="true" aria-expanded="false">' +
        '<span class="lok-acct-av"></span><span class="lok-acct-name"></span>' + caretSVG() +
      '</button>' +
      '<div class="lok-acct-menu" role="menu"></div>';
    var trigger = wrap.querySelector('.lok-acct-trigger');
    trigger.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var open = wrap.classList.toggle('open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    wrap.addEventListener('click', function (e) {
      var so = e.target.closest && e.target.closest('.lok-acct-signout');
      if (so) { e.preventDefault(); signOut(); }
    });
    return wrap;
  }

  function fillAcctEl(wrap, a) {
    var av = wrap.querySelector('.lok-acct-av');
    var nm = wrap.querySelector('.lok-acct-name');
    var menu = wrap.querySelector('.lok-acct-menu');
    if (av) av.textContent = initialsOf(a);
    if (nm) {
      var first = (a && a.first_name || '').trim();
      nm.textContent = first;
      nm.style.display = first ? '' : 'none';
    }
    if (menu) menu.innerHTML = menuItemsHTML(a);
  }

  function signOut() {
    clearAll();
    function go() { window.location.href = LOGIN_URL; }
    try {
      if (window.LokaliAuth && typeof window.LokaliAuth.signOut === 'function') {
        window.LokaliAuth.signOut().then(go).catch(go);
        return;
      }
    } catch (e) {}
    go();
  }

  // Replace the "Login" link inside each scope with the account menu (once),
  // or refresh the existing menu's contents. Idempotent.
  // Insert the account menu once per scope (where a Login link exists). Must NOT
  // mutate when the menu already exists, or the MutationObserver that calls this
  // would re-fire on its own writes and loop. Refilling is done by refreshExisting().
  function render() {
    var scopes = document.querySelectorAll(SCOPES);
    for (var s = 0; s < scopes.length; s++) {
      var scope = scopes[s];
      if (scope.querySelector('.lok-acct[data-lok-acct="1"]')) continue; // already inserted
      var links = scope.querySelectorAll('a'), login = null;
      for (var i = 0; i < links.length; i++) { if (isLoginLink(links[i])) { login = links[i]; break; } }
      if (!login) continue;
      var el = buildAcctEl();
      fillAcctEl(el, acct); // el is detached here → no observer churn
      login.parentNode.insertBefore(el, login);
      login.style.display = 'none';
      login.setAttribute('data-lok-auth-hidden', '1');
    }
    hideBecomeVendorForVendor();
  }

  // Refill already-inserted menus with the current acct (initials/name/items).
  function refreshExisting() {
    var els = document.querySelectorAll('.lok-acct[data-lok-acct="1"]');
    for (var i = 0; i < els.length; i++) fillAcctEl(els[i], acct);
  }

  // close the dropdown on outside click / Escape
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.lok-acct')) return;
    var opens = document.querySelectorAll('.lok-acct.open');
    for (var i = 0; i < opens.length; i++) opens[i].classList.remove('open');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var opens = document.querySelectorAll('.lok-acct.open');
    for (var i = 0; i < opens.length; i++) opens[i].classList.remove('open');
  });

  function fetchAccount() {
    var t = token();
    if (!t) return Promise.resolve(null);
    if (SUPA_MODE) {
      // Refresh role/name from LokaliAuth once it boots (role comes from the
      // acct cache → get_my_role() RPC via lokali-auth.js). If auth is up with
      // NO session the cache is stale (signed out in another tab) — clear it
      // and reset once.
      return new Promise(function (resolve) {
        var tries = 0;
        (function poll() {
          var A = window.LokaliAuth;
          if (A) {
            A.ready.then(function () {
              if (A.isSignedIn()) {
                try { sessionStorage.removeItem('LOKALI_NAV_RESET'); } catch (e) {}
                var u = A.user() || {};
                var meta = u.user_metadata || {};
                var cached = getCache() || {};
                A.fetchRole().then(function (role) {
                  resolve({
                    role: role || cached.role || null,
                    first_name: meta.first_name || cached.first_name || '',
                    last_name: meta.last_name || cached.last_name || '',
                    business_name: cached.business_name || ''  // #66 P2 switcher label
                  });
                });
                return;
              }
              clearAll();
              try {
                if (!sessionStorage.getItem('LOKALI_NAV_RESET')) {
                  sessionStorage.setItem('LOKALI_NAV_RESET', '1');
                  window.location.reload();
                }
              } catch (e) {}
              resolve(null);
            });
            return;
          }
          if (++tries > 40) return resolve(getCache()); // LokaliAuth never booted — keep the cached paint
          setTimeout(poll, 250);
        })();
      });
    }
    return fetch(AUTH_BASE + '/account', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ── boot ────────────────────────────────────────────────────────────────
  injectHide();
  injectCSS();

  var mo = null;
  if (window.MutationObserver) {
    mo = new MutationObserver(function () { render(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  function ready() { render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

  // #66 Phase 2 — the switcher labels the storefront row with the business name.
  // The acct cache doesn't carry it (role/name only), so a vendor with no cached
  // business_name gets it once via vendors.me(), then it's cached for instant
  // paint next time. Best-effort; the row falls back to "My storefront" meanwhile.
  function ensureStoreName() {
    if (!acct || acct.role !== 'vendor' || (acct.business_name || '').trim()) return;
    var A = window.LokaliAPI;
    if (!A || !A.vendors || !A.vendors.me) return;
    A.vendors.me().then(function (res) {
      var v = res && !res.error && res.data && (res.data.vendor || res.data);
      var bn = v && (v.business_name || v.name);
      if (bn) { acct.business_name = String(bn); setCache(acct); refreshExisting(); }
    }).catch(function () {});
  }

  // Refresh role/name from the server and re-render (updates cache for next load).
  fetchAccount().then(function (a) {
    if (a && (a.role || a.first_name)) { acct = a; setCache(a); render(); refreshExisting(); hideBecomeVendorForVendor(); }
    ensureStoreName();
  });

  // Failsafe: stop observing, final pass, reveal anything still hidden.
  setTimeout(function () {
    if (mo) mo.disconnect();
    render();
    removeHide();
    revealed = true;
  }, 4000);
})();
