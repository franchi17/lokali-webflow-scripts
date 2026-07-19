/*
 * lokali-auth.js — Supabase Auth controller (successor to lokali-clerk-auth.js)
 * ---------------------------------------------------------------------------
 * Owns everything auth on golokali.com now that supabase-js owns sessions
 * (Clerk decommissioned — see docs/supabase/AUTH-MIGRATION.md, Phase D):
 *
 *   1. Renders the sign-in / sign-up / password-reset / account UI into the
 *      same mount elements the old Clerk widgets used (#clerk-sign-in,
 *      #clerk-sign-up on /login and /sign-up) — own-branded forms, no vendor
 *      widget. Also provides overlay modals for inline sign-up-to-save flows.
 *   2. Keeps the sign-up ROLE GATE (customer vs vendor chooser) — role is
 *      set-once server-side, stashed via sessionStorage `lokali_signup_intent`.
 *   3. Syncs to the backend after sign-in: POSTs the Supabase access token to
 *      the auth-sync route, which provisions app_user and returns {ok, role}.
 *      The role lands in localStorage LOKALI_ACCT_CACHE — the synchronous
 *      signed-in/role signal that lokali-auth-nav.js and the page guards read.
 *   4. Routes after auth (vendor → dashboard, customer → home from auth pages)
 *      behind the redirect circuit breaker (max 4 redirects / 30s / tab).
 *   5. Exposes window.LokaliAuth — the FROZEN contract every other script
 *      builds against — plus a window.LokaliClerk compat alias
 *      ({signOut, onXano401}) so not-yet-swept callers keep working.
 *
 * Load AFTER lokali-supabase-client.js (which creates window.LokaliSupabaseReady).
 * Emits window CustomEvent 'lokali:authed' {detail:{role}} after a confirmed
 * signed-in state with a known role (favorites/share/vendor-listing listen).
 *
 * Optional globals (set in the Webflow head before this script):
 *   LOKALI_AUTH_SYNC_URL           — auth-sync route (canonical)
 *   LOKALI_CLERK_SYNC_URL          — legacy; /clerk-sync is rewritten to /auth-sync
 *   LOKALI_TURNSTILE_SITE_KEY      — enables Cloudflare Turnstile on the forms
 *   LOKALI_CUSTOMER_AFTER_SIGN_IN_PATH, LOKALI_AUTH_PATH_PREFIXES
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────────
  // CONFIG
  // ──────────────────────────────────────────────────────────────────────────
  function syncUrl() {
    if (window.LOKALI_AUTH_SYNC_URL) return String(window.LOKALI_AUTH_SYNC_URL);
    if (window.LOKALI_CLERK_SYNC_URL) {
      // Legacy global points at .../clerk-sync — same Vercel base, new route.
      return String(window.LOKALI_CLERK_SYNC_URL).replace(/\/clerk-sync\/?$/, '/auth-sync');
    }
    return 'https://lokali-api.vercel.app/api/lokali/auth-sync';
  }
  var AFTER_SIGN_IN_PATH = '/vendor-dashboard/dashboard';
  // Customers are NOT pushed into the vendor dashboard. From a dedicated auth
  // page they go home; inline sign-ups (overlay on a browse/detail page) stay
  // put and the 'lokali:authed' event lets the pending action finish.
  var CUSTOMER_AFTER_SIGN_IN_PATH = window.LOKALI_CUSTOMER_AFTER_SIGN_IN_PATH || '/';
  var SIGN_IN_PATH = '/login';
  var SIGN_UP_PATH = '/sign-up';
  // Stashed by CTA flows before reaching /sign-up (or by the role gate itself):
  // 'customer' | 'vendor'. Read once by the first auth-sync, then cleared.
  var SIGNUP_INTENT_KEY = 'lokali_signup_intent';
  var CACHE_KEY = 'LOKALI_ACCT_CACHE';
  var TURNSTILE_KEY = window.LOKALI_TURNSTILE_SITE_KEY || null;

  var _syncing = false;

  // Two cooldown windows (ported from the Clerk controller):
  //  - SUCCESS cooldown (long): once provisioned, don't resync on every nav.
  //  - ATTEMPT cooldown (short): after ANY attempt (success OR fail), don't
  //    fire another /auth-sync for a few seconds — a failed attempt must not
  //    be instantly retried by the next page load.
  var SYNC_COOLDOWN_KEY = 'lokali_auth_sync_cooldown';   // success timestamp
  var SYNC_ATTEMPT_KEY  = 'lokali_auth_sync_attempt';    // last attempt timestamp
  var SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 min success window
  var SYNC_ATTEMPT_MS  = 8000;          // 8s minimum gap between attempts

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

  function getSignupIntent() {
    try {
      var v = (sessionStorage.getItem(SIGNUP_INTENT_KEY) || '').trim().toLowerCase();
      return (v === 'customer' || v === 'vendor') ? v : '';
    } catch (e) { return ''; }
  }
  function setSignupIntent(role) {
    try { sessionStorage.setItem(SIGNUP_INTENT_KEY, role); } catch (e) {}
  }
  function clearSignupIntent() {
    try { sessionStorage.removeItem(SIGNUP_INTENT_KEY); } catch (e) {}
  }

  // ── acct cache (the synchronous signed-in/role signal) ────────────────────
  // Shape: { role, first_name, last_name } — lokali-auth-nav.js paints the
  // header menu from it and lokali-dashboard.js's requireAuth reads it at
  // parse time (supabase-js boots async). Keep this shape EXACTLY.
  function cachedRole() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return (c && c.role) || '';
    } catch (e) { return ''; }
  }
  function writeAcctCache(role) {
    try {
      var meta = (_user && _user.user_metadata) || {};
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        role: role || null,
        first_name: meta.first_name || '',
        last_name: meta.last_name || ''
      }));
    } catch (e) {}
  }
  function clearAcctCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
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

  // ── page detection (identical to the Clerk controller) ────────────────────
  function authPathPrefixes() {
    var o = window.LOKALI_AUTH_PATH_PREFIXES || window.LOKALI_CLERK_AUTH_PATH_PREFIXES;
    if (o && o.length) return o;
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
    return (window.location.pathname || '/').indexOf('/vendor-dashboard') === 0;
  }
  function isHomePath() {
    var path = window.location.pathname || '/';
    return path === '/' || path === '';
  }
  function isSignUpPage() {
    var path = (window.location.pathname || '/').toLowerCase();
    return path.indexOf('/sign-up') === 0 || path.indexOf('/signup') === 0 || path.indexOf('/register') === 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SESSION STATE (supabase-js owns sessions; we track the last-known values
  // so user()/isSignedIn() can stay synchronous)
  // ──────────────────────────────────────────────────────────────────────────
  var _client = null;       // supabase client (once booted)
  var _session = null;      // last-known session
  var _user = null;         // last-known user
  var _recoveryMode = false; // PASSWORD_RECOVERY in progress — never route away
  var _confirming = false;   // email-confirm / OAuth code exchange in progress — show a loading card, never a blank page

  function setSession(session) {
    _session = session || null;
    _user = (session && session.user) || null;
    if (_session) _confirming = false; // signed in — drop the loading state
  }

  var _readyResolve;
  var readyP = new Promise(function (res) { _readyResolve = res; });

  // lokali-supabase-client.js may load after us — poll for its ready promise.
  function waitForSupabase() {
    return new Promise(function (resolve) {
      var tries = 0;
      (function poll() {
        if (window.LokaliSupabaseReady) return resolve(window.LokaliSupabaseReady);
        if (++tries > 60) return resolve(null); // ~15s cap
        setTimeout(poll, 250);
      })();
    });
  }

  function getAccessToken() {
    return readyP.then(function () {
      if (!_client) return null;
      return _client.auth.getSession().then(function (r) {
        var s = r && r.data && r.data.session;
        setSession(s);
        return (s && s.access_token) || null;
      }).catch(function () { return null; });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SYNC TO BACKEND (auth-sync: provisions app_user, returns {ok, role})
  // ──────────────────────────────────────────────────────────────────────────
  function syncUser() {
    if (_syncing) return Promise.resolve(null);
    var provisioned = cachedRole();
    // Already provisioned + a successful sync happened recently → skip.
    if (provisioned && inSyncCooldown()) return Promise.resolve(provisioned);
    // Throttle attempts regardless — a failing route must not be hammered by
    // every page load. Returns whatever we have; callers must NOT redirect on null.
    if (inAttemptCooldown()) return Promise.resolve(provisioned || null);
    _syncing = true;
    markAttempt();

    var intent = getSignupIntent();
    return getAccessToken().then(function (token) {
      if (!token) return null;
      return fetch(syncUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(intent ? { intended_role: intent } : {})
      }).then(function (res) { return res.json(); });
    }).then(function (data) {
      _syncing = false;
      if (data && data.ok === true) {
        markSynced();
        clearSignupIntent();
        writeAcctCache(data.role || null);
        return data.role || null;
      }
      return null;
    }).catch(function (err) {
      _syncing = false;
      console.error('[Lokali] auth sync failed:', err);
      return null;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ROLE + ROUTING
  // ──────────────────────────────────────────────────────────────────────────
  // Resolve the signed-in user's role. Cache first (a just-completed sync wrote
  // the server-returned role there); else the get_my_role() RPC (DB truth).
  // Resolves NULL for a signed-in-but-unprovisioned user — callers must never
  // route into guarded pages on null (routing there is what crash-looped).
  function fetchRole() {
    var r = cachedRole();
    if (r) return Promise.resolve(r);
    return readyP.then(function () {
      if (!_client || !_session) return null;
      return _client.rpc('get_my_role').then(function (res) {
        var role = res && res.data;
        if (typeof role === 'string' && role) {
          writeAcctCache(role);
          return role;
        }
        return null;
      }).catch(function () { return null; });
    });
  }

  // Route after a confirmed auth. Vendors go to the dashboard; customers are
  // never forced there. Emits 'lokali:authed' with the role so page scripts
  // (favorites, share, reviews) can react to inline sign-up-to-save.
  // A null role (signed in, provisioning incomplete) routes NOWHERE.
  function routeAfterAuth() {
    fetchRole().then(function (role) {
      if (!role) return; // unprovisioned — never push into guarded pages
      if (_recoveryMode) return; // setting a new password — stay on the form
      writeAcctCache(role);
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

  // ──────────────────────────────────────────────────────────────────────────
  // AUTH-STATE HANDLING
  // ──────────────────────────────────────────────────────────────────────────
  function handleAuthState() {
    if (!_session) {
      // Signed out: a stale acct cache would keep painting the account menu
      // and let the dashboard guards wave through an anonymous visitor.
      try {
        if (window.LokaliAPI && typeof window.LokaliAPI.clearToken === 'function') {
          window.LokaliAPI.clearToken();
        }
      } catch (e) {}
      clearSyncCooldown();
      clearAcctCache();
      return;
    }

    // "Already provisioned" signal = the cached role the auth-sync wrote.
    var existing = cachedRole() || null;

    // Trigger a sync when NOT provisioned yet, on the pages where it matters
    // (auth page = just signed in/up; dashboard = needs identity; home =
    // common OAuth-return landing), OR whenever a sign-up intent is pending —
    // that fires on browse/detail pages where the pending save must complete.
    if (!existing && (isAuthPage() || isDashboardPath() || isHomePath() || getSignupIntent())) {
      syncUser().then(function (role) {
        if (role) routeAfterAuth();
      });
    } else if (existing && isAuthPage()) {
      routeAfterAuth();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STYLES (Plus Jakarta Sans everywhere; violet/orange brand, light surfaces)
  // ──────────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('lok-auth-css')) return;
    var s = document.createElement('style');
    s.id = 'lok-auth-css';
    s.textContent = [
      // mount layout (same rule the Clerk controller injected)
      '#clerk-sign-in, #clerk-sign-up { display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; padding:2rem 1rem; box-sizing:border-box; }',
      '#clerk-sign-in > *, #clerk-sign-up > * { max-width:100%; }',
      // card + form
      ".lok-auth{font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;width:100%;max-width:440px;margin:0 auto;box-sizing:border-box;}",
      // Page mounts sit inside a Webflow wrapper whose descendant rule forces
      // max-width:100% on .lok-auth — win with id specificity + !important so the
      // form stays a centered card, not full-bleed. (Overlay .lok-auth unaffected.)
      '#clerk-sign-in .lok-auth,#clerk-sign-up .lok-auth{max-width:440px !important;margin-left:auto !important;margin-right:auto !important;}',
      '.lok-auth *,.lok-auth *:before,.lok-auth *:after{box-sizing:border-box;font-family:inherit;}',
      '.lok-auth-card{background:#fff;border:1px solid #ECE8F8;border-radius:16px;padding:32px 28px;box-shadow:0 10px 30px rgba(35,29,63,.08);}',
      '.lok-auth h2{margin:0 0 6px;font-size:22px;font-weight:700;color:#231D3F;text-align:center;line-height:1.3;}',
      '.lok-auth .lok-auth-sub{margin:0 0 22px;font-size:14px;color:#6B6580;text-align:center;line-height:1.5;}',
      '.lok-auth label{display:block;font-size:13px;font-weight:600;color:#231D3F;margin:0 0 6px;}',
      '.lok-auth .lok-auth-field{margin-bottom:14px;}',
      '.lok-auth input[type=email],.lok-auth input[type=password],.lok-auth input[type=text]{' +
        'display:block;width:100%;min-height:46px;padding:11px 14px;font-size:15px;color:#231D3F;' +
        'background:#FDFCFF;border:1.5px solid #ECE8F8;border-radius:12px;outline:none;' +
        'transition:border-color .15s,box-shadow .15s;-webkit-appearance:none;appearance:none;}',
      '.lok-auth input:focus{border-color:#6002EE;box-shadow:0 0 0 3px rgba(96,2,238,.12);}',
      '.lok-auth input::placeholder{color:#A7A1BC;}',
      '.lok-auth-row{display:flex;gap:10px;}',
      '.lok-auth-row .lok-auth-field{flex:1;min-width:0;}',
      '.lok-auth-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:46px;' +
        'padding:11px 16px;font-size:15px;font-weight:700;border-radius:12px;cursor:pointer;' +
        'transition:background .15s,border-color .15s,transform .1s;border:1.5px solid transparent;}',
      '.lok-auth-btn:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
      '.lok-auth-btn[disabled]{opacity:.6;cursor:default;}',
      '.lok-auth-btn-primary{background:#6002EE;color:#fff;border-color:#6002EE;}',
      '.lok-auth-btn-primary:hover:not([disabled]){background:#4E02C2;border-color:#4E02C2;}',
      '.lok-auth-btn-google{background:#fff;color:#231D3F;border-color:#ECE8F8;font-weight:600;}',
      '.lok-auth-btn-google:hover:not([disabled]){border-color:#D4AAFD;background:#F9F5FF;}',
      '.lok-auth-btn-google svg{width:18px;height:18px;flex-shrink:0;}',
      '.lok-auth-divider{display:flex;align-items:center;gap:12px;margin:18px 0;color:#A7A1BC;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;}',
      '.lok-auth-divider:before,.lok-auth-divider:after{content:"";flex:1;height:1px;background:#ECE8F8;}',
      '.lok-auth-error{display:none;margin:0 0 14px;padding:10px 14px;font-size:13px;line-height:1.45;color:#B3261E;background:#FDF0EF;border:1px solid #F6D5D2;border-radius:10px;}',
      '.lok-auth-error.show{display:block;}',
      '.lok-auth-info{display:none;margin:0 0 14px;padding:10px 14px;font-size:13px;line-height:1.45;color:#3D2E7C;background:#F5F0FF;border:1px solid #E3D5FB;border-radius:10px;}',
      '.lok-auth-info.show{display:block;}',
      '.lok-auth-links{margin-top:16px;font-size:13px;color:#6B6580;text-align:center;line-height:1.7;}',
      '.lok-auth a.lok-auth-link{color:#6002EE;font-weight:600;text-decoration:none;cursor:pointer;}',
      '.lok-auth a.lok-auth-link:hover{text-decoration:underline;}',
      '.lok-auth-hint{margin:-8px 0 14px;font-size:12px;color:#A7A1BC;line-height:1.5;}',
      '.lok-auth-turnstile{margin:0 0 14px;display:flex;justify-content:center;}',
      // spinner
      '.lok-auth-spin{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:lokAuthSpin .7s linear infinite;vertical-align:-3px;}',
      // large spinner for the "Signing you in…" loading card (on a light surface)
      '.lok-auth-spin-lg{width:26px;height:26px;border-width:3px;border-color:rgba(96,2,238,.22);border-top-color:#6002EE;vertical-align:0;}',
      // password show/hide toggle
      '.lok-auth-inwrap{position:relative;}',
      '.lok-auth-inwrap input{padding-right:46px;}',
      '.lok-auth-reveal{position:absolute;top:0;right:0;height:100%;width:44px;border:none;background:transparent;cursor:pointer;color:#8A82A6;display:flex;align-items:center;justify-content:center;padding:0;min-height:0;}',
      '.lok-auth-reveal:hover{color:#6002EE;}',
      '.lok-auth-reveal svg{width:20px;height:20px;}',
      '@keyframes lokAuthSpin{to{transform:rotate(360deg);}}',
      // success / check-email state
      '.lok-auth-check{text-align:center;padding:8px 0;}',
      '.lok-auth-check .lok-auth-check-icon{width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#F5F0FF;display:flex;align-items:center;justify-content:center;}',
      '.lok-auth-check .lok-auth-check-icon svg{width:26px;height:26px;}',
      // role gate (ported from the Clerk controller — same look)
      '.lok-role-gate{max-width:420px;margin:0 auto;padding:8px 0;font-family:inherit;}',
      '.lok-role-gate h3{margin:0 0 6px;font-size:22px;color:#231D3F;text-align:center;}',
      '.lok-role-gate p{margin:0 0 18px;font-size:14px;color:#6B6580;text-align:center;}',
      '.lok-role-gate .lok-role-cards{display:flex;flex-direction:column;gap:12px;}',
      '.lok-role-card{display:block;width:100%;text-align:left;background:#fff;' +
        'border:1.5px solid #ECE8F8;border-radius:14px;padding:16px 18px;cursor:pointer;' +
        'font-family:inherit;transition:border-color .15s,background .15s,transform .15s;}',
      '.lok-role-card:hover{border-color:#D4AAFD;background:#F9F5FF;transform:translateY(-1px);}',
      '.lok-role-card:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
      '.lok-role-card .lok-role-title{display:block;font-size:16px;font-weight:700;color:#231D3F;margin-bottom:3px;}',
      '.lok-role-icon{width:18px;height:18px;margin-right:9px;vertical-align:-2px;display:inline-block;}',
      '.lok-role-card .lok-role-desc{display:block;font-size:13px;color:#6B6580;line-height:1.45;}',
      '.lok-role-gate .lok-role-login{margin-top:16px;font-size:13px;text-align:center;color:#6B6580;}',
      '.lok-role-gate .lok-role-login a{color:#6002EE;font-weight:600;text-decoration:none;}',
      '.lok-role-note{max-width:420px;margin:0 auto 10px;font-size:13px;color:#6B6580;text-align:center;}',
      '.lok-role-note a{color:#6002EE;font-weight:600;text-decoration:none;cursor:pointer;}',
      // overlay modal
      '.lok-auth-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;background:rgba(35,29,63,.55);backdrop-filter:blur(2px);' +
        "font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;}",
      '.lok-auth-overlay .lok-auth-modal{position:relative;width:100%;max-width:420px;max-height:calc(100vh - 40px);' +
        'overflow-y:auto;background:#fff;border-radius:18px;padding:34px 28px 28px;box-shadow:0 24px 64px rgba(35,29,63,.25);}',
      '.lok-auth-overlay .lok-auth-close{position:absolute;top:12px;right:12px;width:36px;height:36px;min-height:36px;' +
        'display:flex;align-items:center;justify-content:center;background:#F7F5FC;border:none;border-radius:50%;' +
        'color:#6B6580;font-size:16px;line-height:1;cursor:pointer;transition:background .15s,color .15s;}',
      '.lok-auth-overlay .lok-auth-close:hover{background:#EFEAFB;color:#231D3F;}',
      '.lok-auth-overlay .lok-auth-close:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
      '.lok-auth-overlay .lok-auth{max-width:100%;}',
      '.lok-auth-overlay .lok-auth-card{border:none;box-shadow:none;padding:0;}',
      // account panel section split
      '.lok-auth-section{padding:18px 0;border-top:1px solid #ECE8F8;}',
      '.lok-auth-section:first-of-type{border-top:none;padding-top:0;}',
      '.lok-auth-section h4{margin:0 0 4px;font-size:15px;font-weight:700;color:#231D3F;}',
      '.lok-auth-section .lok-auth-section-sub{margin:0 0 14px;font-size:12.5px;color:#6B6580;line-height:1.5;}',
      '@media (max-width:479px){.lok-auth-card{padding:26px 18px;}.lok-auth-row{flex-direction:column;gap:0;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DOM helpers
  // ──────────────────────────────────────────────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  function inputField(labelText, type, autocomplete, placeholder) {
    var wrap = el('div', 'lok-auth-field');
    var id = 'lok-in-' + Math.random().toString(36).slice(2, 8);
    var lb = el('label', null, labelText);
    lb.setAttribute('for', id);
    var input = document.createElement('input');
    input.type = type;
    input.id = id;
    if (autocomplete) input.setAttribute('autocomplete', autocomplete);
    if (placeholder) input.placeholder = placeholder;
    wrap.appendChild(lb);
    if (type === 'password') {
      // Wrap so a show/hide eye toggle can sit inside the field.
      var iw = el('div', 'lok-auth-inwrap');
      iw.appendChild(input);
      var tog = document.createElement('button');
      tog.type = 'button';
      tog.className = 'lok-auth-reveal';
      tog.setAttribute('aria-label', 'Show password');
      tog.innerHTML = EYE_SVG;
      tog.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        tog.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
        tog.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        input.focus();
      });
      iw.appendChild(tog);
      wrap.appendChild(iw);
    } else {
      wrap.appendChild(input);
    }
    return { wrap: wrap, input: input };
  }
  function primaryBtn(label) {
    var b = el('button', 'lok-auth-btn lok-auth-btn-primary');
    b.type = 'submit';
    b.textContent = label;
    b._label = label;
    return b;
  }
  function setBusy(btn, busy) {
    if (busy) {
      btn.disabled = true;
      btn.innerHTML = '<span class="lok-auth-spin"></span>';
    } else {
      btn.disabled = false;
      btn.textContent = btn._label;
    }
  }
  function errorBox() { return el('div', 'lok-auth-error'); }
  function infoBox() { return el('div', 'lok-auth-info'); }
  function showMsg(box, msg) {
    box.textContent = '';
    if (typeof msg === 'string') box.textContent = msg;
    else if (msg) box.appendChild(msg);
    box.classList.add('show');
  }
  function hideMsg(box) { box.classList.remove('show'); box.textContent = ''; }
  function linkBtn(text) {
    var a = el('a', 'lok-auth-link', text);
    a.setAttribute('role', 'button');
    a.setAttribute('tabindex', '0');
    return a;
  }
  function googleIconSVG() {
    var d = document.createElement('div');
    d.innerHTML =
      '<svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
      '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
      '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
    return d.firstChild;
  }
  function googleBtn(label) {
    var b = el('button', 'lok-auth-btn lok-auth-btn-google');
    b.type = 'button';
    b.appendChild(googleIconSVG());
    b.appendChild(document.createTextNode(label));
    return b;
  }
  function divider() { return el('div', 'lok-auth-divider', 'or'); }

  // Friendly error copy for supabase-js auth errors.
  function friendlyAuthError(err) {
    var msg = (err && (err.message || err.error_description)) || 'Something went wrong. Please try again.';
    var low = msg.toLowerCase();
    if (low.indexOf('invalid login credentials') >= 0) return 'That email and password don’t match. Please try again.';
    if (low.indexOf('user already registered') >= 0) return 'An account with this email already exists. Try logging in instead.';
    if (low.indexOf('password should') >= 0 || low.indexOf('password must') >= 0) {
      return 'Password needs at least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.';
    }
    if (low.indexOf('rate limit') >= 0 || low.indexOf('too many') >= 0) return 'Too many attempts — please wait a minute and try again.';
    if (low.indexOf('captcha') >= 0) return 'Please complete the verification challenge and try again.';
    return msg;
  }
  function isUnconfirmedError(err) {
    var msg = ((err && err.message) || '').toLowerCase();
    return msg.indexOf('email not confirmed') >= 0 || msg.indexOf('not confirmed') >= 0;
  }

  // ── Turnstile (dormant until LOKALI_TURNSTILE_SITE_KEY is set — Phase E) ──
  var _turnstileLoading = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (_turnstileLoading) return _turnstileLoading;
    _turnstileLoading = new Promise(function (resolve) {
      var sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      sc.async = true;
      sc.onload = function () { resolve(); };
      sc.onerror = function () { resolve(); }; // fail open — Supabase enforces server-side
      document.head.appendChild(sc);
    });
    return _turnstileLoading;
  }
  // Attach a Turnstile widget into `form` (before the submit button). Returns
  // { token() } — null when the widget is disabled/unsolved.
  function attachTurnstile(container) {
    if (!TURNSTILE_KEY) return { token: function () { return null; } };
    var holder = el('div', 'lok-auth-turnstile');
    container.appendChild(holder);
    var tok = null;
    loadTurnstile().then(function () {
      if (!window.turnstile) return;
      try {
        window.turnstile.render(holder, {
          sitekey: TURNSTILE_KEY,
          theme: 'light', // default 'auto' rendered an ink-dark widget on the light card for dark-mode visitors
          callback: function (t) { tok = t; },
          'expired-callback': function () { tok = null; }
        });
      } catch (e) {}
    });
    return { token: function () { return tok; } };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FORMS
  // ──────────────────────────────────────────────────────────────────────────
  function signInWithGoogle(errBox) {
    // Signup intent (if any) survives in sessionStorage across the OAuth
    // round-trip (same tab), so the role gate is still honored on return.
    readyP.then(function () {
      if (!_client) return;
      _client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + SIGN_IN_PATH,
          // #81: always show Google's account chooser — without this a re-login
          // silently reuses the last Google account, stranding multi-account users.
          queryParams: { prompt: 'select_account' }
        }
      }).then(function (res) {
        if (res && res.error && errBox) showMsg(errBox, friendlyAuthError(res.error));
      });
    });
  }

  // Sign-in form. opts: { overlay, root } — root is the container to re-render
  // into when swapping to reset/sign-up views.
  function renderSignIn(root, opts) {
    opts = opts || {};
    root.innerHTML = '';
    var box = el('div', 'lok-auth');
    var card = el('div', 'lok-auth-card');
    card.appendChild(el('h2', null, 'Welcome back'));
    card.appendChild(el('p', 'lok-auth-sub', 'Log in to your Lokali account'));

    var err = errorBox();
    var info = infoBox();
    card.appendChild(err);
    card.appendChild(info);

    var g = googleBtn('Continue with Google');
    g.addEventListener('click', function () { signInWithGoogle(err); });
    card.appendChild(g);
    card.appendChild(divider());

    var form = document.createElement('form');
    form.setAttribute('novalidate', '');
    var email = inputField('Email', 'email', 'email', 'you@example.com');
    var pass = inputField('Password', 'password', 'current-password', '');
    form.appendChild(email.wrap);
    form.appendChild(pass.wrap);

    var captcha = attachTurnstile(form);
    var submit = primaryBtn('Log in');
    form.appendChild(submit);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideMsg(err); hideMsg(info);
      var em = (email.input.value || '').trim();
      var pw = pass.input.value || '';
      if (!em || !pw) { showMsg(err, 'Please enter your email and password.'); return; }
      setBusy(submit, true);
      readyP.then(function () {
        if (!_client) throw new Error('Auth is still loading — please try again.');
        var creds = { email: em, password: pw };
        var ct = captcha.token();
        if (ct) creds.options = { captchaToken: ct };
        return _client.auth.signInWithPassword(creds);
      }).then(function (res) {
        setBusy(submit, false);
        if (res && res.error) {
          if (isUnconfirmedError(res.error)) {
            var frag = document.createDocumentFragment();
            frag.appendChild(document.createTextNode('Please confirm your email first — check your inbox. '));
            var resend = linkBtn('Resend confirmation');
            resend.addEventListener('click', function () {
              _client.auth.resend({ type: 'signup', email: em }).then(function (r) {
                if (r && r.error) showMsg(err, friendlyAuthError(r.error));
                else { hideMsg(err); showMsg(info, 'Confirmation email sent to ' + em + '. Check your inbox.'); }
              });
            });
            frag.appendChild(resend);
            showMsg(err, frag);
          } else {
            showMsg(err, friendlyAuthError(res.error));
          }
          return;
        }
        setSession(res && res.data && res.data.session);
        // onAuthStateChange also fires, but its dedupe may see the same user id
        // (e.g. re-login in the same tab) — drive the post-auth flow directly.
        if (opts.onAuthed) opts.onAuthed();
        else { syncUser().then(function () { routeAfterAuth(); }); }
      }).catch(function (ex) {
        setBusy(submit, false);
        showMsg(err, friendlyAuthError(ex));
      });
    });

    card.appendChild(form);

    var links = el('div', 'lok-auth-links');
    var forgot = linkBtn('Forgot password?');
    forgot.addEventListener('click', function () { renderResetRequest(root, opts); });
    links.appendChild(forgot);
    links.appendChild(document.createElement('br'));
    links.appendChild(document.createTextNode('Don’t have an account? '));
    var su = linkBtn('Sign up');
    su.addEventListener('click', function () {
      if (opts.overlay) renderSignUpFlow(root, opts);
      else window.location.href = SIGN_UP_PATH;
    });
    links.appendChild(su);
    card.appendChild(links);

    box.appendChild(card);
    root.appendChild(box);
    return box;
  }

  // "Forgot password?" → email → reset link.
  function renderResetRequest(root, opts) {
    opts = opts || {};
    root.innerHTML = '';
    var box = el('div', 'lok-auth');
    var card = el('div', 'lok-auth-card');
    card.appendChild(el('h2', null, 'Reset your password'));
    card.appendChild(el('p', 'lok-auth-sub', 'Enter your email and we’ll send you a link to set a new password.'));
    var err = errorBox(); var info = infoBox();
    card.appendChild(err); card.appendChild(info);

    var form = document.createElement('form');
    form.setAttribute('novalidate', '');
    var email = inputField('Email', 'email', 'email', 'you@example.com');
    form.appendChild(email.wrap);
    var captcha = attachTurnstile(form);
    var submit = primaryBtn('Send reset link');
    form.appendChild(submit);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideMsg(err); hideMsg(info);
      var em = (email.input.value || '').trim();
      if (!em) { showMsg(err, 'Please enter your email.'); return; }
      setBusy(submit, true);
      readyP.then(function () {
        if (!_client) throw new Error('Auth is still loading — please try again.');
        var o = { redirectTo: window.location.origin + SIGN_IN_PATH };
        var ct = captcha.token();
        if (ct) o.captchaToken = ct;
        return _client.auth.resetPasswordForEmail(em, o);
      }).then(function (res) {
        setBusy(submit, false);
        if (res && res.error) { showMsg(err, friendlyAuthError(res.error)); return; }
        showMsg(info, 'Check your email — if an account exists for ' + em + ', a reset link is on its way.');
      }).catch(function (ex) { setBusy(submit, false); showMsg(err, friendlyAuthError(ex)); });
    });
    card.appendChild(form);

    var links = el('div', 'lok-auth-links');
    var back = linkBtn('← Back to log in');
    back.addEventListener('click', function () { renderSignIn(root, opts); });
    links.appendChild(back);
    card.appendChild(links);

    box.appendChild(card);
    root.appendChild(box);
  }

  // Rendered when the user returns from the reset email (PASSWORD_RECOVERY).
  function renderRecovery(root) {
    root.innerHTML = '';
    var box = el('div', 'lok-auth');
    var card = el('div', 'lok-auth-card');
    card.appendChild(el('h2', null, 'Set a new password'));
    card.appendChild(el('p', 'lok-auth-sub', 'Choose a new password for your Lokali account.'));
    var err = errorBox(); var info = infoBox();
    card.appendChild(err); card.appendChild(info);

    var form = document.createElement('form');
    form.setAttribute('novalidate', '');
    var pw = inputField('New password', 'password', 'new-password', '');
    form.appendChild(pw.wrap);
    form.appendChild(el('div', 'lok-auth-hint', 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.'));
    var submit = primaryBtn('Save new password');
    form.appendChild(submit);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideMsg(err); hideMsg(info);
      var val = pw.input.value || '';
      if (!val) { showMsg(err, 'Please enter a new password.'); return; }
      setBusy(submit, true);
      readyP.then(function () {
        if (!_client) throw new Error('Auth is still loading — please try again.');
        return _client.auth.updateUser({ password: val });
      }).then(function (res) {
        setBusy(submit, false);
        if (res && res.error) { showMsg(err, friendlyAuthError(res.error)); return; }
        _recoveryMode = false;
        showMsg(info, 'Password updated — taking you back in…');
        setTimeout(function () { syncUser().then(function () { routeAfterAuth(); }); }, 900);
      }).catch(function (ex) { setBusy(submit, false); showMsg(err, friendlyAuthError(ex)); });
    });
    card.appendChild(form);
    box.appendChild(card);
    root.appendChild(box);
  }

  // "Check your email" state after a successful sign-up.
  function renderCheckEmail(root, emailAddr) {
    root.innerHTML = '';
    var box = el('div', 'lok-auth');
    var card = el('div', 'lok-auth-card');
    var chk = el('div', 'lok-auth-check');
    var icon = el('div', 'lok-auth-check-icon');
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="#6002EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
    chk.appendChild(icon);
    chk.appendChild(el('h2', null, 'Check your email'));
    var sub = el('p', 'lok-auth-sub');
    sub.appendChild(document.createTextNode('We sent a confirmation link to '));
    var strong = document.createElement('strong');
    strong.textContent = emailAddr;
    sub.appendChild(strong);
    sub.appendChild(document.createTextNode('. Click it to activate your account, then log in.'));
    chk.appendChild(sub);
    var info = infoBox(); var err = errorBox();
    chk.appendChild(info); chk.appendChild(err);
    var links = el('div', 'lok-auth-links');
    links.appendChild(document.createTextNode('Didn’t get it? '));
    var resend = linkBtn('Resend email');
    resend.addEventListener('click', function () {
      hideMsg(info); hideMsg(err);
      readyP.then(function () {
        if (!_client) return;
        _client.auth.resend({ type: 'signup', email: emailAddr }).then(function (r) {
          if (r && r.error) showMsg(err, friendlyAuthError(r.error));
          else showMsg(info, 'Confirmation email re-sent. Give it a minute (and check spam).');
        });
      });
    });
    links.appendChild(resend);
    chk.appendChild(links);
    card.appendChild(chk);
    box.appendChild(card);
    root.appendChild(box);
  }

  // ── Sign-up role gate (ported 1:1 from the Clerk controller) ──────────────
  // Role is SET-ONCE at provisioning, and auth-sync can only stamp the right
  // one if a signup intent is stashed. The CTA flows stash it ("Become a
  // Vendor" → vendor, sign-up-to-save → customer), but anyone reaching
  // /sign-up cold — typed URL, or the "Sign up" link on /login — has NO intent
  // and would get the server default silently. So with no intent we ask first,
  // stash the answer, then show the form.
  function renderRoleChooser(root, opts) {
    var wrap = el('div', 'lok-role-gate');
    var h = el('h3', null, 'How will you use Lokali?');
    var sub = el('p', null, 'Just your starting point — every account can shop, and you can open a storefront anytime.');
    var cards = el('div', 'lok-role-cards');

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
      var t = el('span', 'lok-role-title');
      t.appendChild(icon);
      t.appendChild(document.createTextNode(title));
      var d = el('span', 'lok-role-desc', desc);
      b.appendChild(t);
      b.appendChild(d);
      b.addEventListener('click', function () {
        setSignupIntent(role);
        renderSignUpFlow(root, opts);
      });
      return b;
    }

    cards.appendChild(card(faIcon('0 0 448 512', FA_BAG, '#FF8D00'), "I'm here to shop", 'Discover local makers, save favorites, and message the businesses near you.', 'customer'));
    cards.appendChild(card(faIcon('0 0 640 512', FA_SHOP, '#6002EE'), "I want to sell", 'Open a storefront to list your business and get found by locals. Free to start — you can still shop, too.', 'vendor'));

    var login = el('div', 'lok-role-login');
    login.appendChild(document.createTextNode('Already have an account? '));
    var loginA = document.createElement('a');
    loginA.href = SIGN_IN_PATH;
    loginA.textContent = 'Log in';
    if (opts && opts.overlay) {
      loginA.addEventListener('click', function (e) {
        e.preventDefault();
        renderSignIn(root, opts);
      });
    }
    login.appendChild(loginA);

    wrap.appendChild(h);
    wrap.appendChild(sub);
    wrap.appendChild(cards);
    wrap.appendChild(login);

    root.innerHTML = '';
    var box = el('div', 'lok-auth');
    var cardEl = el('div', 'lok-auth-card');
    cardEl.appendChild(wrap);
    box.appendChild(cardEl);
    root.appendChild(box);
  }

  // Sign-up form (shown only once an intent exists).
  function renderSignUpForm(root, opts) {
    opts = opts || {};
    var intent = getSignupIntent();
    root.innerHTML = '';
    var box = el('div', 'lok-auth');
    var card = el('div', 'lok-auth-card');

    // Person-first "starting point" note (#66): every account can shop; the
    // vendor answer just fast-tracks storefront setup. "Change" re-opens the
    // chooser before the account is minted.
    var note = el('div', 'lok-role-note');
    note.appendChild(document.createTextNode(
      intent === 'vendor' ? 'Setting up your storefront. ' : 'Signing up to shop. '));
    var change = document.createElement('a');
    change.textContent = 'Change';
    change.addEventListener('click', function () {
      clearSignupIntent();
      renderRoleChooser(root, opts);
    });
    note.appendChild(change);
    card.appendChild(note);

    card.appendChild(el('h2', null, 'Create your account'));
    card.appendChild(el('p', 'lok-auth-sub', intent === 'vendor'
      ? 'Get your business in front of nearby customers.'
      : 'Save favorites and connect with local vendors.'));

    var err = errorBox(); var info = infoBox();
    card.appendChild(err); card.appendChild(info);

    var g = googleBtn('Continue with Google');
    g.addEventListener('click', function () { signInWithGoogle(err); });
    card.appendChild(g);
    card.appendChild(divider());

    var form = document.createElement('form');
    form.setAttribute('novalidate', '');
    var row = el('div', 'lok-auth-row');
    var first = inputField('First name', 'text', 'given-name', '');
    var last = inputField('Last name', 'text', 'family-name', '');
    row.appendChild(first.wrap);
    row.appendChild(last.wrap);
    form.appendChild(row);
    var email = inputField('Email', 'email', 'email', 'you@example.com');
    var pass = inputField('Password', 'password', 'new-password', '');
    form.appendChild(email.wrap);
    form.appendChild(pass.wrap);
    form.appendChild(el('div', 'lok-auth-hint', 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.'));

    var captcha = attachTurnstile(form);
    var submit = primaryBtn('Create account');
    form.appendChild(submit);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideMsg(err); hideMsg(info);
      var em = (email.input.value || '').trim();
      var pw = pass.input.value || '';
      if (!em || !pw) { showMsg(err, 'Please fill in your email and a password.'); return; }
      setBusy(submit, true);
      readyP.then(function () {
        if (!_client) throw new Error('Auth is still loading — please try again.');
        var o = {
          data: {
            first_name: (first.input.value || '').trim(),
            last_name: (last.input.value || '').trim(),
            intended_role: getSignupIntent() || 'customer'
          },
          emailRedirectTo: window.location.origin + SIGN_IN_PATH
        };
        var ct = captcha.token();
        if (ct) o.captchaToken = ct;
        return _client.auth.signUp({ email: em, password: pw, options: o });
      }).then(function (res) {
        setBusy(submit, false);
        if (res && res.error) { showMsg(err, friendlyAuthError(res.error)); return; }
        var d = (res && res.data) || {};
        if (d.session) {
          // Auto-confirm path (confirmations off) — proceed like a sign-in.
          setSession(d.session);
          if (opts.onAuthed) opts.onAuthed();
          else { syncUser().then(function () { routeAfterAuth(); }); }
          return;
        }
        // Confirm-email path (production): show the friendly waiting state.
        // The intent stays stashed; the post-confirmation login syncs it.
        renderCheckEmail(root, em);
      }).catch(function (ex) {
        setBusy(submit, false);
        showMsg(err, friendlyAuthError(ex));
      });
    });
    card.appendChild(form);

    var links = el('div', 'lok-auth-links');
    links.appendChild(document.createTextNode('Already have an account? '));
    var si = linkBtn('Log in');
    si.addEventListener('click', function () {
      if (opts.overlay) renderSignIn(root, opts);
      else window.location.href = SIGN_IN_PATH;
    });
    links.appendChild(si);
    card.appendChild(links);

    box.appendChild(card);
    root.appendChild(box);
  }

  // Role gate first when no intent is stashed; else the form.
  function renderSignUpFlow(root, opts) {
    if (!getSignupIntent()) renderRoleChooser(root, opts);
    else renderSignUpForm(root, opts);
  }

  // ── Account panel: change email + change password ─────────────────────────
  function renderAccountPanel(root) {
    root.innerHTML = '';
    var box = el('div', 'lok-auth');
    var card = el('div', 'lok-auth-card');
    card.appendChild(el('h2', null, 'Sign-in & security'));
    card.appendChild(el('p', 'lok-auth-sub', 'Manage how you sign in to Lokali.'));

    // — Change email —
    var secE = el('div', 'lok-auth-section');
    secE.appendChild(el('h4', null, 'Change email'));
    secE.appendChild(el('p', 'lok-auth-section-sub',
      'For security, we’ll send confirmation links to BOTH your current and new address — click both to finish the change.'));
    var errE = errorBox(); var infoE = infoBox();
    secE.appendChild(errE); secE.appendChild(infoE);
    var formE = document.createElement('form');
    formE.setAttribute('novalidate', '');
    var newEmail = inputField('New email', 'email', 'email', (_user && _user.email) || 'you@example.com');
    formE.appendChild(newEmail.wrap);
    var subE = primaryBtn('Update email');
    formE.appendChild(subE);
    formE.addEventListener('submit', function (e) {
      e.preventDefault();
      hideMsg(errE); hideMsg(infoE);
      var em = (newEmail.input.value || '').trim();
      if (!em) { showMsg(errE, 'Please enter your new email.'); return; }
      setBusy(subE, true);
      readyP.then(function () {
        if (!_client) throw new Error('Auth is still loading — please try again.');
        return _client.auth.updateUser({ email: em });
      }).then(function (res) {
        setBusy(subE, false);
        if (res && res.error) { showMsg(errE, friendlyAuthError(res.error)); return; }
        showMsg(infoE, 'Confirmation links sent to both inboxes — click both to complete the change.');
      }).catch(function (ex) { setBusy(subE, false); showMsg(errE, friendlyAuthError(ex)); });
    });
    secE.appendChild(formE);
    card.appendChild(secE);

    // — Change password —
    var secP = el('div', 'lok-auth-section');
    secP.appendChild(el('h4', null, 'Change password'));
    secP.appendChild(el('p', 'lok-auth-section-sub',
      'If it’s been a while since you signed in, we may ask you to log in again first.'));
    var errP = errorBox(); var infoP = infoBox();
    secP.appendChild(errP); secP.appendChild(infoP);
    var formP = document.createElement('form');
    formP.setAttribute('novalidate', '');
    var newPass = inputField('New password', 'password', 'new-password', '');
    formP.appendChild(newPass.wrap);
    formP.appendChild(el('div', 'lok-auth-hint', 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.'));
    var subP = primaryBtn('Update password');
    formP.appendChild(subP);
    formP.addEventListener('submit', function (e) {
      e.preventDefault();
      hideMsg(errP); hideMsg(infoP);
      var pw = newPass.input.value || '';
      if (!pw) { showMsg(errP, 'Please enter a new password.'); return; }
      setBusy(subP, true);
      readyP.then(function () {
        if (!_client) throw new Error('Auth is still loading — please try again.');
        return _client.auth.updateUser({ password: pw });
      }).then(function (res) {
        setBusy(subP, false);
        if (res && res.error) { showMsg(errP, friendlyAuthError(res.error)); return; }
        newPass.input.value = '';
        showMsg(infoP, 'Password updated.');
      }).catch(function (ex) { setBusy(subP, false); showMsg(errP, friendlyAuthError(ex)); });
    });
    secP.appendChild(formP);
    card.appendChild(secP);

    box.appendChild(card);
    root.appendChild(box);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // OVERLAY MODAL (openSignUp / openSignIn / openAccountPanel host)
  // ──────────────────────────────────────────────────────────────────────────
  var _overlay = null;
  function closeOverlay() {
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
    document.removeEventListener('keydown', overlayEsc, true);
  }
  function overlayEsc(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeOverlay(); }
  }
  function openOverlay(build) {
    injectStyles();
    closeOverlay();
    var ov = el('div', 'lok-auth-overlay');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    var modal = el('div', 'lok-auth-modal');
    var close = el('button', 'lok-auth-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', closeOverlay);
    modal.appendChild(close);
    var body = el('div');
    modal.appendChild(body);
    ov.appendChild(modal);
    ov.addEventListener('mousedown', function (e) {
      if (e.target === ov) closeOverlay();
    });
    document.addEventListener('keydown', overlayEsc, true);
    document.body.appendChild(ov);
    _overlay = ov;
    build(body);
    var firstInput = modal.querySelector('input,button.lok-role-card');
    if (firstInput) { try { firstInput.focus(); } catch (e) {} }
  }

  // Post-auth handler for overlay flows: close the modal, sync+route (the
  // 'lokali:authed' event lets the pending page action — save/share — finish).
  function overlayAuthed() {
    closeOverlay();
    syncUser().then(function () { routeAfterAuth(); });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE MOUNTS (same element ids the Clerk widgets mounted into)
  // ──────────────────────────────────────────────────────────────────────────
  function mountAuthUI() {
    var signInEl = document.getElementById('clerk-sign-in');
    var signUpEl = document.getElementById('clerk-sign-up');
    var userBtnEl = document.getElementById('clerk-user-button');
    if (!signInEl && !signUpEl && !userBtnEl) return;
    injectStyles();

    if (_session) {
      // Signed in on an auth page: sync + routing take over. Show a brief loading
      // card (not a blank page) while we redirect to the dashboard. (The old Clerk
      // user button is gone — the header account menu is the signed-in UI now.)
      var routeMount = signInEl || signUpEl;
      if (routeMount) { routeMount.style.display = ''; renderConfirming(routeMount); }
      if (signInEl && signInEl !== routeMount) signInEl.style.display = 'none';
      if (signUpEl && signUpEl !== routeMount) signUpEl.style.display = 'none';
      if (userBtnEl) userBtnEl.style.display = 'none';
      return;
    }

    // Code exchange in progress — keep the "Signing you in…" card, don't flash
    // the sign-in form underneath it.
    if (_confirming) return;

    if (userBtnEl) userBtnEl.style.display = 'none';
    if (signInEl) {
      signInEl.style.display = '';
      if (signInEl.getAttribute('data-lok-mounted') !== '1') {
        signInEl.setAttribute('data-lok-mounted', '1');
        // /login?reset=1 reuses the login mount for the reset-request form
        // (design decision 6 — no new Webflow page needed).
        if (/[?&]reset=1\b/.test(window.location.search)) renderResetRequest(signInEl, {});
        else renderSignIn(signInEl, {});
      }
    }
    if (signUpEl) {
      signUpEl.style.display = '';
      if (signUpEl.getAttribute('data-lok-mounted') !== '1') {
        signUpEl.setAttribute('data-lok-mounted', '1');
        renderSignUpFlow(signUpEl, {});
      }
    }
  }

  function showRecoveryUI() {
    var signInEl = document.getElementById('clerk-sign-in');
    injectStyles();
    if (signInEl) {
      signInEl.style.display = '';
      signInEl.setAttribute('data-lok-mounted', '1');
      renderRecovery(signInEl);
    } else {
      openOverlay(function (body) { renderRecovery(body); });
    }
  }

  // Loading + failure cards for the email-confirm / OAuth code-exchange landing,
  // so a confirmation link never shows a blank page while the code is exchanged.
  function confirmMount() { return document.getElementById('clerk-sign-in') || document.getElementById('clerk-sign-up'); }
  function renderConfirming(root) {
    root.innerHTML = '';
    var box = el('div', 'lok-auth'), card = el('div', 'lok-auth-card'), chk = el('div', 'lok-auth-check');
    var icon = el('div', 'lok-auth-check-icon');
    icon.innerHTML = '<span class="lok-auth-spin lok-auth-spin-lg"></span>';
    chk.appendChild(icon);
    chk.appendChild(el('h2', null, 'Signing you in…'));
    chk.appendChild(el('p', 'lok-auth-sub', 'Just a moment…'));
    card.appendChild(chk); box.appendChild(card); root.appendChild(box);
  }
  function renderConfirmError(root) {
    root.innerHTML = '';
    var box = el('div', 'lok-auth'), card = el('div', 'lok-auth-card'), chk = el('div', 'lok-auth-check');
    var icon = el('div', 'lok-auth-check-icon');
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#6002EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.5"/></svg>';
    chk.appendChild(icon);
    chk.appendChild(el('h2', null, 'This link couldn’t be confirmed'));
    chk.appendChild(el('p', 'lok-auth-sub', 'Confirmation links open only in the same browser you signed up on, and they expire after a while. Try logging in, or request a fresh link.'));
    var btn = primaryBtn('Go to log in'); btn.type = 'button';
    btn.addEventListener('click', function () { window.location.href = SIGN_IN_PATH; });
    card.appendChild(chk); card.appendChild(btn); box.appendChild(card); root.appendChild(box);
  }
  function showConfirmingUI() { var m = confirmMount(); if (!m) return; injectStyles(); m.style.display = ''; m.setAttribute('data-lok-mounted', '1'); renderConfirming(m); }
  function showConfirmError() { var m = confirmMount(); if (m) renderConfirmError(m); }

  // ──────────────────────────────────────────────────────────────────────────
  // PUBLIC API — FROZEN CONTRACT (Phase D2 sweeps build against this)
  // ──────────────────────────────────────────────────────────────────────────
  var XANO401_RECYCLE_KEY = 'lokali_xano401_recycle';

  function doSignOut() {
    try { sessionStorage.removeItem(XANO401_RECYCLE_KEY); } catch (e) {}
    clearSyncCooldown();
    clearSignupIntent();
    clearAcctCache();
    try {
      if (window.LokaliAPI && typeof window.LokaliAPI.clearToken === 'function') {
        window.LokaliAPI.clearToken();
      }
    } catch (e) {}
    function go() { window.location.href = SIGN_IN_PATH; }
    return readyP.then(function () {
      if (!_client) { go(); return; }
      return _client.auth.signOut().then(go, go);
    });
  }

  window.LokaliAuth = {
    /** Resolves once the supabase client booted and the initial session is known. */
    ready: readyP,
    /** Current Supabase access token (JWT), or null when signed out. */
    token: function () { return getAccessToken(); },
    /** Last-known supabase user object (sync), or null. */
    user: function () { return _user; },
    /** Sync signed-in check from the last-known session. */
    isSignedIn: function () { return !!_session; },
    /** Sync role from LOKALI_ACCT_CACHE; null when unknown/unprovisioned. */
    role: function () { return cachedRole() || null; },
    /** Role: cache → get_my_role() RPC (writes cache). Null when unknown. */
    fetchRole: fetchRole,
    /** Supabase signOut + clear caches + redirect to /login. */
    signOut: doSignOut,
    /** Overlay sign-up (opts.intent: 'customer'|'vendor' pre-stashes the role). */
    openSignUp: function (opts) {
      opts = opts || {};
      if (opts.intent === 'customer' || opts.intent === 'vendor') setSignupIntent(opts.intent);
      openOverlay(function (body) {
        renderSignUpFlow(body, { overlay: true, onAuthed: overlayAuthed });
      });
    },
    /** Overlay sign-in. */
    openSignIn: function (opts) {
      openOverlay(function (body) {
        renderSignIn(body, { overlay: true, onAuthed: overlayAuthed });
      });
    },
    /** Overlay with change-email + change-password forms (replaces Clerk.openUserProfile). */
    openAccountPanel: function () {
      openOverlay(function (body) { renderAccountPanel(body); });
    }
  };

  // ── Compat alias — dashboard-embed.js (and not-yet-swept scripts) call this.
  window.LokaliClerk = {
    signOut: function () { return window.LokaliAuth.signOut(); },
    /**
     * Called by dashboard scripts on a 401. If a Supabase session exists, try
     * ONE resync + reload (fixes a stale/unprovisioned state). If that already
     * ran this session, return false so the caller sends the user to login.
     */
    onXano401: function () {
      if (!_session || !_user) return false;
      try {
        if (sessionStorage.getItem(XANO401_RECYCLE_KEY) === '1') {
          sessionStorage.removeItem(XANO401_RECYCLE_KEY);
          return false;
        }
        sessionStorage.setItem(XANO401_RECYCLE_KEY, '1');
      } catch (e) {
        return false;
      }
      // Force a fresh sync attempt (skip the success cooldown so a genuinely
      // broken state gets one real retry).
      clearSyncCooldown();
      syncUser().then(function (role) {
        if (role) {
          window.location.reload();
        } else {
          try { sessionStorage.removeItem(XANO401_RECYCLE_KEY); } catch (e2) {}
          try {
            if (window.LokaliAPI && typeof window.LokaliAPI.clearToken === 'function') {
              window.LokaliAPI.clearToken();
            }
          } catch (e3) {}
          window.location.href = SIGN_IN_PATH;
        }
      });
      return true;
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // BOOT
  // ──────────────────────────────────────────────────────────────────────────
  // Email-confirm / OAuth landings carry an auth code in the URL. Show a loading
  // card IMMEDIATELY (before the client even boots) so the page is never blank
  // while the code is exchanged — and if nothing signs us in within ~12s (link
  // opened in a different browser than sign-up so the PKCE verifier is missing,
  // or it expired), show a clear, actionable error instead of a stuck spinner.
  (function primeConfirming() {
    var hasCode = /[?&#](code|token_hash|type)=/.test(window.location.search + window.location.hash);
    if (!hasCode || !isAuthPage()) return;
    _confirming = true;
    function go() { showConfirmingUI(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
    setTimeout(function () {
      if (_confirming && !_session && !_recoveryMode) { _confirming = false; showConfirmError(); }
    }, 12000);
  })();

  // NOTE: waitForSupabase() resolves *with* window.LokaliSupabaseReady (a
  // promise), and Promise resolution adopts thenables — so `c` here is already
  // the resolved client (or null on timeout), NOT a promise. Do not .then it.
  waitForSupabase().then(function (c) {
    if (!c) {
      console.error('[Lokali] supabase client never loaded — auth disabled on this page');
      _readyResolve();
      return;
    }
    _client = c;
    return c.auth.getSession().then(function (r) {
        setSession(r && r.data && r.data.session);
        _readyResolve();

        // CROSS-DEVICE email confirmation / recovery: a `token_hash` link works in
        // ANY browser (unlike the PKCE `?code=` flow, which needs the verifier from
        // the sign-up browser). supabase-js auto-handles `?code=` but NOT
        // `token_hash` — verify it explicitly here. The Supabase email templates
        // point confirmation links at `/login?token_hash=…&type=email`.
        if (!_session) {
          var _q = new URLSearchParams(window.location.search);
          var _th = _q.get('token_hash');
          var _ty = _q.get('type');
          if (_th && _ty) {
            var _isRecovery = /recovery/i.test(_ty);
            if (_isRecovery) _recoveryMode = true;
            var _verify = function (t) { return c.auth.verifyOtp({ token_hash: _th, type: t }); };
            _verify(_ty).then(function (res) {
              // Signup confirm tokens are minted as 'email' in some Supabase configs
              // and 'signup' in others — if the URL type fails, try the other common
              // confirm type before giving up (recovery is unambiguous, so skip there).
              if (res && res.error && !_isRecovery && _ty !== 'signup') return _verify('signup');
              return res;
            }).then(function (res) {
              try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
              if (res && res.error) { _confirming = false; _recoveryMode = false; showConfirmError(); return; }
              // success: setSession (via onAuthStateChange SIGNED_IN) clears _confirming
              // and routing takes over; for recovery we show the set-password form.
              if (_isRecovery) showRecoveryUI();
            }).catch(function () { _confirming = false; _recoveryMode = false; showConfirmError(); });
          }
        }

        // A stored session can be STALE — the account was deleted, or the token
        // revoked. supabase-js keeps serving it from localStorage until an API
        // call 401s, but on /login nothing makes such a call, so the form stays
        // hidden ("signed in") forever and the user is stranded. Validate the
        // session against the server once on boot; if it's dead, sign out so the
        // login form appears. (Skips the recovery flow, which owns its own UI.)
        if (_session && !_recoveryMode) {
          c.auth.getUser().then(function (ures) {
            var uerr = ures && ures.error;
            // Only a definitive auth rejection (401/403) proves the session is
            // dead. Ignore transient/network errors so a blip never logs a valid
            // user out.
            if (uerr && (uerr.status === 401 || uerr.status === 403)) {
              c.auth.signOut().catch(function () {});
              setSession(null);
              _confirming = false;
              try { mountAuthUI(); } catch (e) {}
            }
          }).catch(function () {});
        }

        // If the URL carries an auth code (email confirm / OAuth return /
        // recovery link, PKCE flow), hold routing briefly so a trailing
        // PASSWORD_RECOVERY event can flip _recoveryMode before we redirect.
        var urlHasCode = /[?&#](code|token_hash|type)=/.test(window.location.search + window.location.hash);
        var lastUserId = _user ? _user.id : null;

        function initialKick() {
          handleAuthState();
          mountAuthUI();
        }
        if (urlHasCode) setTimeout(initialKick, 800);
        else initialKick();

        // Auth-state watcher. supabase-js fires this on many internal changes
        // (token refresh, tab focus) — only act when the user id actually
        // flips, mirroring the Clerk-listener dedupe (event storms once caused
        // an infinite sync loop).
        c.auth.onAuthStateChange(function (event, session) {
          if (event === 'PASSWORD_RECOVERY') {
            _recoveryMode = true;
            setSession(session);
            showRecoveryUI();
            return;
          }
          var nowId = (session && session.user && session.user.id) || null;
          var changed = nowId !== lastUserId;
          lastUserId = nowId;
          setSession(session);
          if (changed) {
            if (urlHasCode && event === 'SIGNED_IN') {
              // Give PASSWORD_RECOVERY (which follows SIGNED_IN on recovery
              // links) a beat to arrive before routing away from the form.
              setTimeout(function () {
                if (!_recoveryMode) { handleAuthState(); mountAuthUI(); }
              }, 800);
            } else {
              handleAuthState();
              mountAuthUI();
            }
          }
        });
      });
  }).catch(function (err) {
    console.error('[Lokali] auth boot failed:', err);
    _readyResolve();
  });

  // Mounts may not exist yet if we ran before DOM ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      readyP.then(function () { mountAuthUI(); });
    });
  }
})();
