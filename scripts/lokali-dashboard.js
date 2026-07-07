
(function () {
  'use strict';

  // Dashboard content must clear the fixed 200px sidebar (.section-11) on
  // desktop. Content wrappers differ per page (div-block-38/39, container-11)
  // and some center in the full width, sliding under the rail at ~1248px and
  // narrower. Reserving the rail's width as body padding-left offsets all
  // in-flow content uniformly; the fixed sidebar ignores body padding and
  // stays pinned at left:0. Scoped to >=992px (tablet/mobile collapse the nav).
  (function injectLayoutFix() {
    // Dashboard pages only — never pad the body on public pages (no sidebar).
    if (String(location.pathname || '').indexOf('/vendor-dashboard') === -1) return;
    if (document.getElementById('lok-dashboard-layout-fix')) return;
    var s = document.createElement('style');
    s.id = 'lok-dashboard-layout-fix';
    s.textContent = '@media (min-width:992px){body{padding-left:200px;}}' +
      // #49 — services/products cards render from a template with a -10px
      // inline margin, so adjacent cards read as one slab. Real separation:
      // gap + border + soft shadow (brand-light surfaces per the no-ink rule).
      '.service-card[data-service-id],.product-card[data-product-id]{' +
        'margin-bottom:16px !important;border:1px solid #ECE8F8 !important;' +
        'border-radius:14px;background:#fff;box-shadow:0 1px 5px rgba(35,29,63,.07);}' +
      // #50 — Edit/Delete were hover-revealed; always show them on desktop
      // (mobile has no hover, so reveal everywhere). Beats any IX inline style.
      '.service-card [data-action],.product-card [data-action],' +
      '.service-card .icon-btn-edit,.product-card .icon-btn-edit,' +
      '.service-card .icon-btn--delete,.product-card .icon-btn--delete{' +
        'opacity:1 !important;visibility:visible !important;}';
    (document.head || document.documentElement).appendChild(s);
  })();

  // Role guard: the vendor dashboard is vendors-only. A signed-in CUSTOMER who
  // lands here (typed URL, stale link) is sent to their own hub at /account.
  // Uses the cached role for an instant bounce, then confirms against the server.
  // No token → left to requireAuth()/page scripts, which send to /login.
  (function roleGuard() {
    if (String(location.pathname || '').indexOf('/vendor-dashboard') === -1) return;
    var TOKEN_KEY = 'LOKALI_AUTH_TOKEN', CACHE_KEY = 'LOKALI_ACCT_CACHE';

    if (window.LOKALI_BACKEND === 'supabase') {
      // No Xano token exists — instant bounce off the cached role (written by
      // clerk-auth on sync), then confirm against Clerk (publicMetadata.role
      // is stamped server-side by clerk-sync).
      try {
        var sc = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (sc && sc.role && sc.role !== 'vendor') { window.location.replace('/account'); return; }
      } catch (e) {}
      var tries = 0;
      (function poll() {
        var C = window.Clerk;
        if (C && C.loaded) {
          var role = C.user && C.user.publicMetadata && C.user.publicMetadata.role;
          if (role && role !== 'vendor') window.location.replace('/account');
          return;
        }
        if (++tries <= 40) setTimeout(poll, 250);
      })();
      return;
    }

    var t;
    try { t = localStorage.getItem(TOKEN_KEY); } catch (e) { t = null; }
    if (!t || t.length < 20) return; // no token → not our job (requireAuth → /login)
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.role && c.role !== 'vendor') { window.location.replace('/account'); return; }
    } catch (e) {}
    var AUTH_BASE = (typeof window !== 'undefined' && window.LOKALI_AUTH_BASE) ||
                    'https://x8ki-letl-twmt.n7.xano.io/api:mp2-aEJM';
    fetch(AUTH_BASE + '/account', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) { if (a && a.role && a.role !== 'vendor') window.location.replace('/account'); })
      .catch(function () {});
  })();

  window.LokaliDashboard = {

    requireAuth: function () {
      var token = window.LokaliAPI && window.LokaliAPI.getToken
        ? window.LokaliAPI.getToken()
        : null;
      if (!token) {
        window.location.href = '/login';
        return false;
      }
      return true;
    },

    getVendor: function () {
      if (!window.LokaliAPI || !window.LokaliAPI.vendors || !window.LokaliAPI.vendors.me) {
        return Promise.reject(new Error('LokaliAPI.vendors.me is not available'));
      }
      return window.LokaliAPI.vendors.me();
    },

    getBilling: function () {
      if (!window.LokaliAPI || !window.LokaliAPI.plans || !window.LokaliAPI.plans.getMyBilling) {
        return Promise.reject(new Error('LokaliAPI.plans.getMyBilling is not available'));
      }
      return window.LokaliAPI.plans.getMyBilling();
    },

    showSuccess: function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'block';
      setTimeout(function () { el.style.display = 'none'; }, 3000);
    },

    showError: function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'block';
    },

    hideMessage: function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = 'none';
    },

    disableButton: function (id, state) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.disabled = !!state;
    },

    setTextValue: function (id, value) {
      var el = document.getElementById(id);
      if (el) el.value = value || '';
    },

    setCheckboxValue: function (id, value) {
      var el = document.getElementById(id);
      if (el) el.checked = !!value;
    },

    setSelectValue: function (id, value) {
      var el = document.getElementById(id);
      if (el && value != null) el.value = String(value);
    },

    setImageSrc: function (id, src) {
      var el = document.getElementById(id);
      if (el && src) el.src = src;
    },

    preventFormSubmit: function (selector) {
      var sel = selector || '.w-form form';
      var nodes = document.querySelectorAll(sel);
      nodes.forEach(function (node) {
        var targets = node.tagName === 'FORM' ? [node] : node.querySelectorAll('form');
        Array.prototype.forEach.call(targets, function (form) {
          form.addEventListener('submit', function (e) {
            e.preventDefault();
          });
        });
      });
    },

    showLoading: function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'block';
    },

    hideLoading: function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    },

    renderList: function (containerId, items, renderFn) {
      var container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = (items && items.length)
        ? items.map(renderFn).join('')
        : '';
    },

    /**
     * Fetches the current user's preferred name (name → first_name → fallback)
     * and sets the text content of every element matching `selector`.
     * selector defaults to '[data-lokali-greeting-name]'.
     * Returns a Promise.
     */
    populateGreetingName: function (selector) {
      var sel = selector || '[data-lokali-greeting-name]';
      var tok = window.LokaliAPI && window.LokaliAPI.getToken && window.LokaliAPI.getToken();
      if (!tok) return Promise.resolve();
      return window.LokaliAPI.auth.me().then(function (res) {
        if (res.error || !res.data) return;
        var user = res.data.user || res.data;
        var name = user.name || user.preferred_name || user.first_name || '';
        if (!name) return;
        var els = document.querySelectorAll(sel);
        Array.prototype.forEach.call(els, function (el) {
          el.textContent = name;
        });
      }).catch(function () {});
    },

    /**
     * Picks a time-aware greeting and fills every [data-lokali-greeting] element
     * with the full string, e.g. "Good morning, Jane!".
     * Falls back gracefully if the user has no saved name.
     * Returns a Promise.
     */
    populateGreeting: function (selector) {
      var sel = selector || '[data-lokali-greeting]';

      var hour = new Date().getHours();
      var pools =
        hour <  12 ? ['Good morning',   'Morning'                      ] :
        hour <  17 ? ['Good afternoon', 'Welcome back',  'Hey there'   ] :
                     ['Good evening',   'Welcome back',  'Hey there'   ];
      var prefix = pools[Math.floor(Math.random() * pools.length)];

      var tok = window.LokaliAPI && window.LokaliAPI.getToken && window.LokaliAPI.getToken();
      if (!tok) {
        var els0 = document.querySelectorAll(sel);
        Array.prototype.forEach.call(els0, function (el) { el.textContent = prefix + '!'; });
        return Promise.resolve();
      }

      return window.LokaliAPI.auth.me().then(function (res) {
        var name = '';
        if (!res.error && res.data) {
          var user = res.data.user || res.data;
          name = user.name || user.preferred_name || user.first_name || '';
        }
        var text = name ? prefix + ', ' + name + '!' : prefix + '!';
        var els = document.querySelectorAll(sel);
        Array.prototype.forEach.call(els, function (el) {
          el.textContent = text;
        });
      }).catch(function () {});
    }

  };

  (function () {
    function isLoggedIn() {
      return window.LokaliAPI && window.LokaliAPI.getToken && window.LokaliAPI.getToken();
    }
    var path = window.location.pathname;
    var dashboardPrefix = '/vendor-dashboard';
    if (!isLoggedIn() && path.indexOf(dashboardPrefix) === 0) {
      window.location.href = '/login';
    }
  })();

})();

(function initVendorDashboardSidebar() {
  'use strict';

  var MOBILE_MAX_PX = 991;

  function isMobileLayout() {
    return window.innerWidth <= MOBILE_MAX_PX;
  }

  function run() {
    var btn = document.getElementById('hamburger-btn');
    var sidebar = document.getElementById('sidebar-wrapper');
    if (!btn || !sidebar) return;

    var z = parseInt(window.getComputedStyle(sidebar).zIndex, 10);
    if (!z || z < 999) sidebar.style.zIndex = '1001';

    var closeBtn = document.getElementById('sidebar-close-btn');
    if (!btn.hasAttribute('aria-expanded')) btn.setAttribute('aria-expanded', 'false');
    var overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebar-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = [
        'display:none',
        'position:fixed',
        'top:0', 'right:0', 'bottom:0', 'left:0',
        'background:rgba(0,0,0,0.4)',
        'z-index:998',
        'transition:opacity 300ms ease',
        'opacity:0'
      ].join(';');
      document.body.appendChild(overlay);
    }

    var open = false;

    function releaseDesktopLayout() {
      open = false;
      sidebar.style.removeProperty('transform');
      overlay.style.opacity = '0';
      overlay.style.display = 'none';
      btn.classList.remove('lokali-nav-open');
      btn.setAttribute('aria-expanded', 'false');
      overlay.setAttribute('aria-hidden', 'true');
    }

    function closeSidebar() {
      if (!open) return;
      open = false;
      if (isMobileLayout()) {
        sidebar.style.transform = 'translateX(-100%)';
      } else {
        sidebar.style.removeProperty('transform');
      }
      overlay.style.opacity = '0';
      btn.classList.remove('lokali-nav-open');
      btn.setAttribute('aria-expanded', 'false');
      overlay.setAttribute('aria-hidden', 'true');
      setTimeout(function () { overlay.style.display = 'none'; }, 300);
    }

    function openSidebar() {
      if (open) return;
      open = true;
      sidebar.style.transform = 'translateX(0%)';
      overlay.style.display = 'block';
      btn.classList.add('lokali-nav-open');
      btn.setAttribute('aria-expanded', 'true');
      overlay.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(function () { overlay.style.opacity = '1'; });
    }

    function onViewportChange() {
      if (!isMobileLayout()) {
        releaseDesktopLayout();
      }
    }

    btn.addEventListener('click', function () {
      if (!isMobileLayout()) return;
      if (open) closeSidebar();
      else openSidebar();
    });
    overlay.addEventListener('click', closeSidebar);

    if (closeBtn) {
      if (!String(closeBtn.textContent || '').trim()) closeBtn.textContent = '\u00D7';
      closeBtn.addEventListener('click', closeSidebar);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) closeSidebar();
    });

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

// Wire the static "View My Listing" sidebar link to the vendor's public page.
// The Webflow template ships it with a dead href (/dashboard//view-listing → 404);
// repoint it to golokali.com/{slug} (clean URL via the Cloudflare Worker), falling
// back to /vendor?id={id} until the vendor has saved a slug. Runs on every dashboard
// page since the sidebar (and this script) is sitewide on /vendor-dashboard.
(function wireViewListingLink() {
  'use strict';

  var ORIGIN = 'https://www.golokali.com';

  function findLink() {
    var byHref = document.querySelector('a[href*="view-listing"]');
    if (byHref) return byHref;
    var links = document.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      if (/^\s*view\s*my\s*listing\s*$/i.test(links[i].textContent || '')) return links[i];
    }
    return null;
  }

  function publicListingUrl(v) {
    return v && v.slug ? (ORIGIN + '/' + v.slug) : (ORIGIN + '/vendor?id=' + (v && v.id));
  }

  var attempts = 0;

  function retry() {
    // The template href is a dead 404 until this rewrite lands, so don't give
    // up on one failed fetch (usually the Xano free-tier rate limit).
    if (attempts < 3) setTimeout(run, 3000 * attempts);
  }

  function run() {
    var link = findLink();
    if (!link) return;
    if (!(window.LokaliAPI && window.LokaliAPI.vendors && window.LokaliAPI.vendors.me)) {
      setTimeout(run, 300);
      return;
    }
    attempts++;
    window.LokaliAPI.vendors.me().then(function (res) {
      if (!res || res.error || !res.data) return retry();
      var v = res.data.vendor || res.data;
      if (!v || (!v.slug && v.id == null)) return retry();
      link.setAttribute('href', publicListingUrl(v));
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
    }).catch(retry);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

// Wire the sidebar "Logout" button site-wide on the dashboard. The Webflow
// template ships #button-logout with a dead href (/dashboard/logout → 404), and
// the real click handler is inline ONLY on the dashboard home page — so on every
// OTHER dashboard page (settings/profile/services/products/analytics/leads) the
// button fell through to that 404. This script loads on all /vendor-dashboard
// pages, so bind here: prefer LokaliClerk.signOut() (full Clerk sign-out), with a
// token-clear + /login fallback if Clerk isn't present. Idempotent (dataset flag);
// on the home page the inline handler also runs — benign, its sync redirect wins.
(function wireLogoutButton() {
  'use strict';

  function doSignOut(e) {
    if (e) e.preventDefault();
    if (window.LokaliClerk && typeof window.LokaliClerk.signOut === 'function') {
      window.LokaliClerk.signOut();
      return;
    }
    try {
      if (window.LokaliAPI && window.LokaliAPI.clearToken) window.LokaliAPI.clearToken();
    } catch (err) {}
    window.location.href = '/login';
  }

  function run() {
    var btn = document.getElementById('button-logout');
    if (!btn || btn.dataset.lokaliLogoutBound) return;
    btn.dataset.lokaliLogoutBound = '1';
    btn.addEventListener('click', doSignOut);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

