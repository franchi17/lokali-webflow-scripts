
(function () {
  'use strict';

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

