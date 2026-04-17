(function () {
  'use strict';

  (function injectClerkLayoutStyles() {
    var id = 'lokali-clerk-auth-layout';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent =
      '#clerk-sign-in, #clerk-sign-up { display: flex; justify-content: center; width: 100%; padding: 2rem 1rem; box-sizing: border-box; }' +
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
  var SIGN_IN_PATH = '/login';

  /** Optional: set before this script to match your Webflow slugs, e.g.
   *  window.LOKALI_CLERK_AUTH_PATH_PREFIXES = ['/sign-up', '/signup', '/login'];
   */
  var _syncing = false;
  var _mountUserWaitTries = 0;
  var MOUNT_USER_WAIT_MAX = 80;

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
    if (!CLERK_SYNC_URL) {
      console.error('[Lokali] Set LOKALI_CLERK_SYNC_URL (your clerk-sync proxy) before lokali-clerk-auth.js');
      return Promise.resolve(null);
    }
    _syncing = true;

    var session = window.Clerk && window.Clerk.session;
    if (!session || typeof session.getToken !== 'function') {
      _syncing = false;
      return Promise.resolve(null);
    }

    return session.getToken().then(function (sessionJwt) {
      if (!sessionJwt) {
        _syncing = false;
        return null;
      }
      return fetch(CLERK_SYNC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + sessionJwt
        },
        body: '{}'
      }).then(function (res) {
        return res.json();
      });
    }).then(function (data) {
      if (data === null) {
        return null;
      }
      _syncing = false;
      var token = (typeof data === 'string' && data.length > 20)
        ? data
        : (data && (data.authToken || data.auth_token)) || null;
      if (token && window.LokaliAPI) {
        window.LokaliAPI.setToken(token);
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

  /** OAuth often lands on `/` after Google — redirect only after a fresh sync (no token before). */
  function isHomePath() {
    var path = window.location.pathname || '/';
    return path === '/' || path === '';
  }

  function handleAuthState() {
    if (!window.Clerk.isSignedIn) {
      window.LokaliAPI.clearToken();
      return;
    }

    var user = window.Clerk.user;
    if (!user) {
      return;
    }

    var existing = window.LokaliAPI.getToken();
    if (!existing) {
      syncClerkUser(user).then(function (token) {
        if (token && (isAuthPage() || isHomePath())) {
          window.location.href = AFTER_SIGN_IN_PATH;
        }
      });
    } else if (isAuthPage()) {
      window.location.href = AFTER_SIGN_IN_PATH;
    }
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
      if (signInEl) window.Clerk.mountSignIn(signInEl);
      if (signUpEl) window.Clerk.mountSignUp(signUpEl);
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
      ui: { ClerkUI: window.__internal_ClerkUICtor }
    }).then(function () {
      handleAuthState();
      mountClerkUI();

      window.Clerk.addListener(function () {
        handleAuthState();
        mountClerkUI();
      });
    });
  });

})();
