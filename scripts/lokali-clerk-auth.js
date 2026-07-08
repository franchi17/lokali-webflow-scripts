(function () {
  'use strict';

  (function injectClerkLayoutStyles() {
    var id = 'lokali-clerk-auth-layout';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent =
      // column: the sign-up mount stacks the role-gate note ABOVE the widget
      // (row put them side by side).
      '#clerk-sign-in, #clerk-sign-up { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; padding: 2rem 1rem; box-sizing: border-box; }' +
      '#clerk-sign-in > *, #clerk-sign-up > * { max-width: 100%; }';
    document.head.appendChild(s);
  })();

  // ──────────────────────────────────────────────
  // CONFIG — sync URL points at the Lokali API proxy on Vercel, which verifies
  // the Clerk JWT and calls Xano with the private sync secret (server-side only).
  // To override (e.g. for staging), set window.LOKALI_CLERK_SYNC_URL before loading.
  // ──────────────────────────────────────────────
  var CLERK_SYNC_URL = window.LOKALI_CLERK_SYNC_URL || 'https://lokali-api.vercel.app/api/lokali/clerk-sync';
  var AFTER_SIGN_IN_PATH = '/vendor-dashboard/dashboard';
  // Customers are NOT pushed into the vendor dashboard. If they signed up from a
  // dedicated auth page we send them home; if they signed up inline (sign-up-to-save
  // via a Clerk modal on a browse/detail page) they stay put and the 'lokali:authed'
  // event lets the favorites/reviews script finish the pending action.
  var CUSTOMER_AFTER_SIGN_IN_PATH = window.LOKALI_CUSTOMER_AFTER_SIGN_IN_PATH || '/';
  var SIGN_IN_PATH = '/login';
  // Set by the sign-up-to-save flow before opening the Clerk modal: 'customer' | 'vendor'.
  var SIGNUP_INTENT_KEY = 'lokali_signup_intent';

  /** Optional: set before this script to match your Webflow slugs, e.g.
   *  window.LOKALI_CLERK_AUTH_PATH_PREFIXES = ['/sign-up', '/signup', '/login'];
   */
  var _syncing = false;
  var _mountUserWaitTries = 0;
  var MOUNT_USER_WAIT_MAX = 80;

  // Two cooldown windows:
  //  - SUCCESS cooldown (long): once we have a Xano token, don't resync on every nav.
  //  - ATTEMPT cooldown (short): after ANY attempt (success OR fail), don't fire another
  //    /clerk-sync for a few seconds. Prevents a failed 429 from being immediately retried
  //    by the next page load and chewing through Xano's 10 req / 20s budget.
  var SYNC_COOLDOWN_KEY = 'lokali_clerk_sync_cooldown';      // success timestamp
  var SYNC_ATTEMPT_KEY  = 'lokali_clerk_sync_attempt';       // last attempt timestamp
  var SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 min: success window (token still valid)
  var SYNC_ATTEMPT_MS  = 8000;          // 8s: minimum gap between attempts

  function inSyncCooldown() {
    try {
      var t = parseInt(sessionStorage.getItem(SYNC_COOLDOWN_KEY) || '0', 10);
      return t && (Date.now() - t) < SYNC_COOLDOWN_MS;
    } catch (e) { return false; }
  }
  function inAttemptCooldown() {
    try {
      var t = parseInt(sessionStorage.getItem(SYNC_ATTEMPT_KEY) || '0', 10);
      return t && (Date.now() - t) < SYNC_ATTEMPT_MS;
    } catch (e) { return false; }
  }
  function markAttempt() {
    try { sessionStorage.setItem(SYNC_ATTEMPT_KEY, String(Date.now())); } catch (e) {}
  }
  function markSynced() {
    try {
      sessionStorage.setItem(SYNC_COOLDOWN_KEY, String(Date.now()));
      sessionStorage.setItem(SYNC_ATTEMPT_KEY, String(Date.now()));
    } catch (e) {}
  }
  function clearSyncCooldown() {
    try {
      sessionStorage.removeItem(SYNC_COOLDOWN_KEY);
      sessionStorage.removeItem(SYNC_ATTEMPT_KEY);
    } catch (e) {}
  }

  // Signup intent: 'customer' or 'vendor'. Read once on first sync (Xano stamps
  // role set-once), then cleared. Absent intent → Xano defaults to vendor.
  function getSignupIntent() {
    try {
      var v = (sessionStorage.getItem(SIGNUP_INTENT_KEY) || '').trim().toLowerCase();
      return (v === 'customer' || v === 'vendor') ? v : '';
    } catch (e) { return ''; }
  }
  function clearSignupIntent() {
    try { sessionStorage.removeItem(SIGNUP_INTENT_KEY); } catch (e) {}
  }

  // ── Supabase-mode helpers ─────────────────────────────────────────────────
  // Under LOKALI_BACKEND=supabase there is no Xano token; "provisioned" means
  // clerk-sync has stamped publicMetadata.role on the Clerk user. The adapter's
  // getToken() intentionally returns a truthy sentinel for ANY signed-in Clerk
  // user (so page-load guards don't bounce Clerk's slow boot) — so it can NOT
  // be the "already provisioned" signal here: using it made syncClerkUser
  // unreachable and left new signups unprovisioned + crash-looping between
  // /login and the dashboard (2026-07-08).
  function supaMode() {
    return window.LOKALI_BACKEND === 'supabase';
  }
  function clerkRole() {
    try {
      var u = window.Clerk && window.Clerk.user;
      return (u && u.publicMetadata && u.publicMetadata.role) || '';
    } catch (e) { return ''; }
  }
  function cachedRole() {
    try {
      var c = JSON.parse(localStorage.getItem('LOKALI_ACCT_CACHE') || 'null');
      return (c && c.role) || '';
    } catch (e) { return ''; }
  }
  function writeAcctCache(role) {
    try {
      var u = (window.Clerk && window.Clerk.user) || null;
      localStorage.setItem('LOKALI_ACCT_CACHE', JSON.stringify({
        role: role || null,
        first_name: (u && u.firstName) || '',
        last_name: (u && u.lastName) || ''
      }));
    } catch (e) {}
  }
  // Circuit breaker: never issue more than a few auth redirects per tab per
  // half-minute. A guard regression once bounced /login ↔ /vendor-dashboard
  // ~7×/sec and hard-crashed the tab; with this, any future bug degrades to
  // "stops redirecting" instead of a dead tab.
  var REDIRECT_LOG_KEY = 'lokali_auth_redirects';
  function redirectBudgetOk() {
    try {
      var now = Date.now();
      var log = JSON.parse(sessionStorage.getItem(REDIRECT_LOG_KEY) || '[]')
        .filter(function (t) { return now - t < 30000; });
      if (log.length >= 4) {
        console.warn('[Lokali] auth redirect suppressed (loop breaker)');
        return false;
      }
      log.push(now);
      sessionStorage.setItem(REDIRECT_LOG_KEY, JSON.stringify(log));
      return true;
    } catch (e) { return true; }
  }

  // Resolve the signed-in user's role.
  // Supabase mode: role truth is Clerk publicMetadata (stamped server-side by
  // clerk-sync). The acct cache is checked first because a just-completed sync
  // writes the server-returned role there before Clerk's cached user object
  // reflects the new metadata; a reload() picks it up otherwise. Resolves NULL
  // for a signed-in-but-unprovisioned user — callers must not route into
  // guarded pages on null (routing there is what crash-looped).
  function fetchRole() {
    if (supaMode()) {
      var r = cachedRole() || clerkRole();
      if (r) return Promise.resolve(r);
      try {
        return window.Clerk.user.reload()
          .then(function () { return clerkRole() || null; })
          .catch(function () { return null; });
      } catch (e) { return Promise.resolve(null); }
    }
    // Xano mode: resolve from the backend; defaults to 'vendor' on any failure
    // so existing vendor routing is never degraded.
    try {
      return window.LokaliAPI.request('auth', 'GET', '/me', null, true)
        .then(function (res) {
          var role = res && res.data && res.data.user && res.data.user.role;
          return role || 'vendor';
        })
        .catch(function () { return 'vendor'; });
    } catch (e) {
      return Promise.resolve('vendor');
    }
  }

  // Route after a successful Clerk→backend sync. Vendors go to the dashboard;
  // customers are never forced there. Emits 'lokali:authed' with the role so
  // page scripts (favorites, reviews) can react to inline sign-up-to-save.
  // A null role (signed in, provisioning incomplete) routes NOWHERE.
  function routeAfterAuth() {
    fetchRole().then(function (role) {
      if (!role) return; // unprovisioned — never push into guarded pages
      if (supaMode()) writeAcctCache(role);
      try {
        window.dispatchEvent(new CustomEvent('lokali:authed', { detail: { role: role } }));
      } catch (e) {}
      if (role === 'vendor') {
        if ((isAuthPage() || isHomePath()) && redirectBudgetOk()) window.location.href = AFTER_SIGN_IN_PATH;
      } else {
        // customer: only redirect away from a dedicated auth page; otherwise stay.
        if (isAuthPage() && redirectBudgetOk()) window.location.href = CUSTOMER_AFTER_SIGN_IN_PATH;
      }
    });
  }

  function waitForDeps(cb) {
    var checks = 0;
    var interval = setInterval(function () {
      checks++;
      if (window.Clerk && window.LokaliAPI) {
        clearInterval(interval);
        cb();
      }
      if (checks > 100) clearInterval(interval);
    }, 100);
  }

  function syncClerkUser(user) {
    if (_syncing) return Promise.resolve(null);
    var existingTok = window.LokaliAPI && window.LokaliAPI.getToken && window.LokaliAPI.getToken();
    // If we already have a Xano token and a successful sync happened recently, reuse it.
    if (existingTok && inSyncCooldown()) return Promise.resolve(existingTok);
    // Even with no token, throttle attempts to avoid hammering Xano's rate limit
    // when /clerk-sync 429s. Returns whatever we have (likely null) — caller code
    // should NOT redirect on null.
    if (inAttemptCooldown()) return Promise.resolve(existingTok);
    if (!CLERK_SYNC_URL) {
      console.error('[Lokali] Set LOKALI_CLERK_SYNC_URL (your clerk-sync proxy) before lokali-clerk-auth.js');
      return Promise.resolve(null);
    }
    _syncing = true;
    markAttempt();

    var session = window.Clerk && window.Clerk.session;
    if (!session || typeof session.getToken !== 'function') {
      _syncing = false;
      return Promise.resolve(null);
    }

    var intent = getSignupIntent();

    return session.getToken().then(function (sessionJwt) {
      if (!sessionJwt) return null;
      return fetch(CLERK_SYNC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + sessionJwt
        },
        body: JSON.stringify(intent ? { intended_role: intent } : {})
      }).then(function (res) { return res.json(); });
    }).then(function (data) {
      _syncing = false;
      if (data == null) return null;
      var token = (typeof data === 'string' && data.length > 20)
        ? data
        : (data && (data.authToken || data.auth_token)) || null;
      if (token && window.LokaliAPI) {
        window.LokaliAPI.setToken(token);
        markSynced();
        // Role is now stamped in Xano; the intent has served its purpose.
        clearSignupIntent();
      } else if (data && data.ok === true && data.backend === 'supabase') {
        // Supabase backend: the sync provisions the user server-side and
        // returns {ok, role, backend} with NO token — the browser talks to
        // Supabase with its Clerk JWT directly. Persist the acct cache that
        // lokali-auth-nav.js paints from (its Xano-token signal is gone).
        markSynced();
        clearSignupIntent();
        try {
          var u = (window.Clerk && window.Clerk.user) || null;
          localStorage.setItem('LOKALI_ACCT_CACHE', JSON.stringify({
            role: data.role || (u && u.publicMetadata && u.publicMetadata.role) || null,
            first_name: (u && u.firstName) || '',
            last_name: (u && u.lastName) || ''
          }));
        } catch (e) {}
        return 'supabase-ok';
      }
      return token;
    }).catch(function (err) {
      _syncing = false;
      console.error('[Lokali] Clerk sync failed:', err);
      return null;
    });
  }

  function authPathPrefixes() {
    if (window.LOKALI_CLERK_AUTH_PATH_PREFIXES && window.LOKALI_CLERK_AUTH_PATH_PREFIXES.length) {
      return window.LOKALI_CLERK_AUTH_PATH_PREFIXES;
    }
    return ['/sign-up', '/signup', '/login', '/sign-in', '/register'];
  }

  function isAuthPage() {
    var path = (window.location.pathname || '/').toLowerCase();
    var list = authPathPrefixes();
    for (var i = 0; i < list.length; i++) {
      var p = String(list[i]).toLowerCase();
      if (!p) continue;
      if (p[0] !== '/') p = '/' + p;
      if (path === p || path.indexOf(p + '/') === 0 || path.indexOf(p + '?') === 0) return true;
    }
    return false;
  }

  function isDashboardPath() {
    var path = window.location.pathname || '/';
    return path.indexOf('/vendor-dashboard') === 0;
  }

  function isHomePath() {
    var path = window.location.pathname || '/';
    return path === '/' || path === '';
  }

  function handleAuthState() {
    if (!window.Clerk.isSignedIn) {
      window.LokaliAPI.clearToken();
      clearSyncCooldown();
      // Signed out: a stale acct cache would keep painting the account menu
      // and let the dashboard guards wave through an anonymous visitor.
      try { localStorage.removeItem('LOKALI_ACCT_CACHE'); } catch (e) {}
      return;
    }

    var user = window.Clerk.user;
    if (!user) return;

    // "Already provisioned" signal. Xano: the minted token. Supabase: the role
    // clerk-sync stamped on Clerk publicMetadata — NOT the adapter's getToken()
    // sentinel, which is truthy for every signed-in Clerk user and would make
    // the sync branch unreachable (new signups were never provisioned and
    // crash-looped between /login and the dashboard, 2026-07-08).
    var existing;
    if (supaMode()) {
      existing = clerkRole() || null;
      // Heal the synchronous signed-in signal the page-load guards read
      // (requireAuth checks the acct cache before Clerk has booted).
      if (existing) writeAcctCache(existing);
    } else {
      existing = window.LokaliAPI.getToken();
    }

    // Trigger a sync in three situations (all gated by NOT provisioned yet,
    // which is what prevents the request loop on every page navigation):
    //  1) Auth page — user just signed in/up via Clerk widget.
    //  2) Dashboard page — script needs a token for API calls.
    //  3) Home page — Clerk's after-sign-up fallback often lands here; we sync once
    //     then forward to the dashboard. Subsequent home visits do NOT re-sync
    //     because `existing` will be set.
    // Sync on auth/dashboard/home pages (existing behavior) OR whenever a
    // sign-up-to-save intent is pending — the latter fires on a browse/detail
    // page, where we must still provision so the pending save can run.
    if (!existing && (isAuthPage() || isDashboardPath() || isHomePath() || getSignupIntent())) {
      syncClerkUser(user).then(function (token) {
        if (token) routeAfterAuth();
      });
    } else if (existing && isAuthPage()) {
      routeAfterAuth();
    }
  }

  // ── Sign-up role gate ──────────────────────────────────────────────────────
  // Role is SET-ONCE at provisioning, and clerk-sync can only stamp the right
  // one if a signup intent is stashed. The CTA flows stash it ("Become a
  // Vendor" → vendor, sign-up-to-save → customer), but anyone reaching
  // /sign-up cold — typed URL, or the "Sign up" link at the bottom of the
  // /login widget — has NO intent and would get the server default silently.
  // So with no intent we ask first, stash the answer, then mount the widget.
  function renderRoleChooser(signUpEl) {
    if (signUpEl.getAttribute('data-lok-role-gate') === '1') return;
    signUpEl.setAttribute('data-lok-role-gate', '1');

    if (!document.getElementById('lok-role-gate-css')) {
      var css = document.createElement('style');
      css.id = 'lok-role-gate-css';
      css.textContent =
        '.lok-role-gate{max-width:420px;margin:0 auto;padding:8px 0;font-family:inherit;}' +
        '.lok-role-gate h3{margin:0 0 6px;font-size:22px;color:#231D3F;text-align:center;}' +
        '.lok-role-gate p{margin:0 0 18px;font-size:14px;color:#6B6580;text-align:center;}' +
        '.lok-role-gate .lok-role-cards{display:flex;flex-direction:column;gap:12px;}' +
        '.lok-role-card{display:block;width:100%;text-align:left;background:#fff;' +
          'border:1.5px solid #ECE8F8;border-radius:14px;padding:16px 18px;cursor:pointer;' +
          'font-family:inherit;transition:border-color .15s,background .15s,transform .15s;}' +
        '.lok-role-card:hover{border-color:#D4AAFD;background:#F9F5FF;transform:translateY(-1px);}' +
        '.lok-role-card:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}' +
        '.lok-role-card .lok-role-title{display:block;font-size:16px;font-weight:700;color:#231D3F;margin-bottom:3px;}' +
        '.lok-role-icon{width:18px;height:18px;margin-right:9px;vertical-align:-2px;display:inline-block;}' +
        '.lok-role-card .lok-role-desc{display:block;font-size:13px;color:#6B6580;line-height:1.45;}' +
        '.lok-role-gate .lok-role-login{margin-top:16px;font-size:13px;text-align:center;color:#6B6580;}' +
        '.lok-role-gate .lok-role-login a{color:#6002EE;font-weight:600;text-decoration:none;}' +
        '.lok-role-note{max-width:420px;margin:0 auto 4px;font-size:13px;color:#6B6580;text-align:center;}' +
        '.lok-role-note a{color:#6002EE;font-weight:600;text-decoration:none;cursor:pointer;}';
      document.head.appendChild(css);
    }

    var wrap = document.createElement('div');
    wrap.className = 'lok-role-gate';
    var h = document.createElement('h3');
    h.textContent = 'How will you use Lokali?';
    var sub = document.createElement('p');
    sub.textContent = 'This sets up the right account for you.';
    var cards = document.createElement('div');
    cards.className = 'lok-role-cards';

    // Font Awesome 6 solid icons, inlined as SVG (no FA dependency on the
    // page): bag-shopping for the customer card, shop for the vendor card.
    function faIcon(viewBox, pathD, color) {
      var NS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', viewBox);
      svg.setAttribute('class', 'lok-role-icon');
      svg.setAttribute('aria-hidden', 'true');
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', pathD);
      p.setAttribute('fill', color);
      svg.appendChild(p);
      return svg;
    }
    var FA_BAG = 'M160 112c0-35.3 28.7-64 64-64s64 28.7 64 64l0 48-128 0 0-48zm-48 48l-64 0c-26.5 0-48 21.5-48 48L0 464c0 26.5 21.5 48 48 48l352 0c26.5 0 48-21.5 48-48l0-256c0-26.5-21.5-48-48-48l-64 0 0-48C336 50.1 285.9 0 224 0S112 50.1 112 112l0 48zm24 48a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm152 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z';
    var FA_SHOP = 'M36.8 192l566.3 0c20.3 0 36.8-16.5 36.8-36.8c0-7.3-2.2-14.4-6.2-20.4L558.2 21.4C549.3 8 534.4 0 518.3 0L121.7 0c-16 0-31 8-39.9 21.4L6.2 134.7c-4 6.1-6.2 13.2-6.2 20.4C0 175.5 16.5 192 36.8 192zM64 224l0 160 0 80c0 26.5 21.5 48 48 48l224 0c26.5 0 48-21.5 48-48l0-80 0-160-64 0 0 160-192 0 0-160-64 0zm448 0l0 256c0 17.7 14.3 32 32 32s32-14.3 32-32l0-256-64 0z';

    function card(icon, title, desc, role) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lok-role-card';
      var t = document.createElement('span');
      t.className = 'lok-role-title';
      t.appendChild(icon);
      t.appendChild(document.createTextNode(title));
      var d = document.createElement('span');
      d.className = 'lok-role-desc';
      d.textContent = desc;
      b.appendChild(t);
      b.appendChild(d);
      b.addEventListener('click', function () {
        try { sessionStorage.setItem(SIGNUP_INTENT_KEY, role); } catch (e) {}
        signUpEl.removeAttribute('data-lok-role-gate');
        signUpEl.innerHTML = '';
        mountSignUpGate(signUpEl);
      });
      return b;
    }

    cards.appendChild(card(faIcon('0 0 448 512', FA_BAG, '#FF8D00'), "I'm here to shop", 'Discover local makers, save favorites, and reach out to vendors near you.', 'customer'));
    cards.appendChild(card(faIcon('0 0 640 512', FA_SHOP, '#6002EE'), "I'm a vendor", 'List my business and get found by nearby customers. Free to start.', 'vendor'));

    var login = document.createElement('div');
    login.className = 'lok-role-login';
    login.appendChild(document.createTextNode('Already have an account? '));
    var loginA = document.createElement('a');
    loginA.href = SIGN_IN_PATH;
    loginA.textContent = 'Log in';
    login.appendChild(loginA);

    wrap.appendChild(h);
    wrap.appendChild(sub);
    wrap.appendChild(cards);
    wrap.appendChild(login);
    signUpEl.appendChild(wrap);
  }

  function mountSignUpGate(signUpEl) {
    var intent = getSignupIntent();
    if (!intent) { renderRoleChooser(signUpEl); return; }
    if (signUpEl.getAttribute('data-lok-mounted') === '1') return;
    signUpEl.setAttribute('data-lok-mounted', '1');
    // Small "signing up as X — change" note so a mis-click is recoverable
    // (role is set-once server-side, so this is the last chance to switch).
    var note = document.createElement('div');
    note.className = 'lok-role-note';
    note.appendChild(document.createTextNode(
      intent === 'vendor' ? 'Signing up as a vendor. ' : 'Signing up as a customer. '));
    var change = document.createElement('a');
    change.textContent = 'Change';
    change.addEventListener('click', function () {
      clearSignupIntent();
      window.location.reload();
    });
    note.appendChild(change);
    signUpEl.appendChild(note);
    var mountPoint = document.createElement('div');
    signUpEl.appendChild(mountPoint);
    // signInUrl: keep the widget's "Sign in" footer link on OUR /login page —
    // the instance default sends users to the Clerk-hosted Account Portal
    // (accounts.golokali.com), leaving the site entirely.
    window.Clerk.mountSignUp(mountPoint, { signInUrl: SIGN_IN_PATH });
  }

  function mountClerkUI() {
    var signInEl = document.getElementById('clerk-sign-in');
    var signUpEl = document.getElementById('clerk-sign-up');
    var userBtnEl = document.getElementById('clerk-user-button');

    if (window.Clerk.isSignedIn && !window.Clerk.user) {
      if (_mountUserWaitTries < MOUNT_USER_WAIT_MAX) {
        _mountUserWaitTries++;
        setTimeout(mountClerkUI, 50);
      }
      return;
    }
    _mountUserWaitTries = 0;

    if (window.Clerk.isSignedIn) {
      if (signInEl) signInEl.style.display = 'none';
      if (signUpEl) signUpEl.style.display = 'none';
      if (userBtnEl) window.Clerk.mountUserButton(userBtnEl);
    } else {
      if (userBtnEl) userBtnEl.style.display = 'none';
      // signUpUrl: the widget's "Sign up" footer link must land on OUR
      // /sign-up (where the role gate lives) — the instance default points at
      // the Clerk-hosted portal (accounts.golokali.com/sign-up), which
      // bypasses the role chooser so the account gets the default role.
      if (signInEl) window.Clerk.mountSignIn(signInEl, { signUpUrl: '/sign-up' });
      if (signUpEl) mountSignUpGate(signUpEl);
    }
  }

  var XANO401_RECYCLE_KEY = 'lokali_xano401_recycle';

  window.LokaliClerk = {
    signOut: function () {
      try {
        sessionStorage.removeItem(XANO401_RECYCLE_KEY);
      } catch (e) {}
      window.LokaliAPI.clearToken();
      window.Clerk.signOut().then(function () {
        window.location.href = SIGN_IN_PATH;
      });
    },

    /**
     * Called by dashboard scripts when Xano returns 401. If Clerk still has a session,
     * try one Clerk→Xano re-sync + reload (fixes stale tokens). If that already ran
     * this session, return false so the caller can send the user to login.
     */
    onXano401: function () {
      if (!window.Clerk || !window.Clerk.isSignedIn || !window.Clerk.user) {
        return false;
      }
      try {
        if (sessionStorage.getItem(XANO401_RECYCLE_KEY) === '1') {
          sessionStorage.removeItem(XANO401_RECYCLE_KEY);
          return false;
        }
        sessionStorage.setItem(XANO401_RECYCLE_KEY, '1');
      } catch (e) {
        return false;
      }
      syncClerkUser(window.Clerk.user).then(function (t) {
        if (t) {
          window.location.reload();
        } else {
          try {
            sessionStorage.removeItem(XANO401_RECYCLE_KEY);
          } catch (e2) {}
          window.LokaliAPI.clearToken();
          window.location.href = SIGN_IN_PATH;
        }
      });
      return true;
    }
  };

  waitForDeps(function () {
    window.Clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      // Brand ALL Clerk UI (sign-in/up widgets + the openUserProfile "Manage
      // sign-in" modal) with Plus Jakarta Sans — the site font, already loaded
      // site-wide — instead of Clerk's default sans. Global default; individual
      // open/mount calls inherit it, so no per-call appearance is needed.
      appearance: { variables: { fontFamily: "'Plus Jakarta Sans', sans-serif" } }
    }).then(function () {
      handleAuthState();
      mountClerkUI();

      // Only re-run handleAuthState when the signed-in flag actually flips —
      // Clerk's listener fires on many internal changes (token refresh, UI
      // mount, focus events) and would otherwise trigger an infinite sync loop.
      var lastSignedIn = !!window.Clerk.isSignedIn;
      var lastUserId = (window.Clerk.user && window.Clerk.user.id) || null;
      window.Clerk.addListener(function () {
        var nowSignedIn = !!window.Clerk.isSignedIn;
        var nowUserId = (window.Clerk.user && window.Clerk.user.id) || null;
        var changed = nowSignedIn !== lastSignedIn || nowUserId !== lastUserId;
        lastSignedIn = nowSignedIn;
        lastUserId = nowUserId;
        if (changed) {
          handleAuthState();
          mountClerkUI();
        }
      });
    });
  });

})();
