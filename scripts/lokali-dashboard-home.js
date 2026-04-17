
var LokaliDashboardHome = (function () {
  'use strict';

  // ─── Listing strength checklist definition ────────────────────────────────
  // Each entry: key (used as data-strength-key on cloned row), label, sub-label,
  // points value, and a test function (null = evaluated externally via data).
  var STRENGTH_CHECKS = [
    {
      key: 'business-name',
      label: 'Business name added',
      sub: null,
      pts: 15,
      test: function (v) { return !!(v.business_name && v.business_name.trim()); }
    },
    {
      key: 'profile-photo',
      label: 'Profile photo uploaded',
      sub: 'Upload a profile photo — listings with photos get significantly more clicks',
      pts: 20,
      test: function (v) { return !!(v.profile_photo && v.profile_photo.trim()); }
    },
    {
      key: 'description',
      label: 'Description written (80+ chars)',
      sub: 'Write a description of at least 80 characters',
      pts: 15,
      test: function (v) { return (v.business_description || '').trim().length >= 80; }
    },
    {
      key: 'tagline',
      label: 'Tagline set',
      sub: 'Add a short tagline — it appears at the top of your listing',
      pts: 10,
      test: function (v) { return !!(v.tagline && v.tagline.trim()); }
    },
    {
      key: 'category',
      label: 'Category selected',
      sub: null,
      pts: 10,
      test: function (v) {
        var c = v.categories_id;
        return !!(c && (Array.isArray(c) ? c.length > 0 : true));
      }
    },
    {
      key: 'service-area',
      label: 'At least one service area set',
      sub: null,
      pts: 10,
      test: function (v) {
        var l = v.locations_id;
        return !!(l && (Array.isArray(l) ? l.length > 0 : true));
      }
    },
    {
      key: 'active-service',
      label: 'At least one active service',
      sub: 'Add a service to show customers what you offer',
      pts: 10,
      test: null   // evaluated via activeServices count
    },
    {
      key: 'active-product',
      label: 'At least one active product',
      sub: 'Add a product to expand what customers can browse',
      pts: 10,
      test: null   // evaluated via activeProducts count
    }
  ];

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _el(id) {
    return document.getElementById(id) || document.querySelector('[data-lokali="' + id + '"]');
  }

  function _setText(id, text) {
    var el = _el(id);
    if (el) el.textContent = text != null ? String(text) : '';
  }

  function _show(id) { var el = _el(id); if (el) el.style.display = ''; }
  function _hide(id) { var el = _el(id); if (el) el.style.display = 'none'; }

  function _extractItems(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.items))   return data.items;
    if (Array.isArray(data.records)) return data.records;
    if (Array.isArray(data.data))    return data.data;
    return [];
  }

  function _scoreLabel(score) {
    if (score >= 80) return 'Strong';
    if (score >= 55) return 'Good';
    if (score >= 30) return 'Fair';
    return 'Needs work';
  }

  // ─── Listing strength calculation ─────────────────────────────────────────

  function _calcStrength(vendor, activeServices, activeProducts) {
    var score = 0;
    var results = STRENGTH_CHECKS.map(function (check) {
      var done = false;
      if (check.key === 'active-service') done = activeServices > 0;
      else if (check.key === 'active-product') done = activeProducts > 0;
      else done = !!check.test(vendor);
      if (done) score += check.pts;
      return { key: check.key, label: check.label, sub: check.sub, pts: check.pts, done: done };
    });
    return { score: score, results: results };
  }

  // ─── Render: stats cards ──────────────────────────────────────────────────

  function _renderStats(activeServices, activeProducts, score) {
    _setText('dashboard-active-services', activeServices);
    _setText('dashboard-active-products', activeProducts);
    _setText('dashboard-listing-strength', score + '%');
  }

  // ─── Render: progress bar + label ─────────────────────────────────────────

  function _renderProgressBar(score) {
    var bar = _el('listing-strength-bar');
    if (bar) bar.style.width = Math.min(score, 100) + '%';
    _setText('listing-strength-score', score);
    _setText('listing-strength-score-max', '100');
    _setText('listing-strength-label', _scoreLabel(score));
  }

  // ─── Render: checklist rows ───────────────────────────────────────────────
  // Expects a hidden template element with id="strength-check-template".
  // Inside the template, child elements carry data-field attributes:
  //   data-field="check-label"  — the check title
  //   data-field="check-sub"    — the sub-description (hidden when null)
  //   data-field="check-pts"    — e.g. "+15 pts"
  //   data-field="check-icon"   — circle/checkmark icon (script adds done class)
  // Script adds class "strength-check--done" to completed rows.

  function _renderStrengthList(results) {
    var container = _el('listing-strength-list');
    if (!container) return;

    var template = document.getElementById('strength-check-template');
    if (!template) return;

    // Remove previously cloned rows (not the template)
    var old = container.querySelectorAll('[data-strength-key]');
    Array.prototype.forEach.call(old, function (el) { el.parentNode.removeChild(el); });

    results.forEach(function (check) {
      var clone = template.cloneNode(true);
      clone.removeAttribute('id');
      clone.setAttribute('data-strength-key', check.key);
      clone.style.display = '';

      var f = function (field) { return clone.querySelector('[data-field="' + field + '"]'); };
      var labelEl = f('check-label');
      var subEl   = f('check-sub');
      var ptsEl   = f('check-pts');
      var iconEl  = f('check-icon');

      if (labelEl) labelEl.textContent = check.label;
      if (ptsEl)   ptsEl.textContent = '+' + check.pts + ' pts';
      if (subEl) {
        if (check.sub) { subEl.textContent = check.sub; subEl.style.display = ''; }
        else subEl.style.display = 'none';
      }

      if (check.done) {
        clone.classList.add('strength-check--done');
        if (iconEl) iconEl.classList.add('strength-check-icon--done');
      } else {
        clone.classList.remove('strength-check--done');
        if (iconEl) iconEl.classList.remove('strength-check-icon--done');
      }

      container.appendChild(clone);
    });
  }

  // ─── Render: upgrade banner ───────────────────────────────────────────────
  // Show banner when vendor is on free/starter plan; hide otherwise.

  function _renderPlanBanner(billing) {
    var banner = _el('plan-upgrade-banner');
    if (!banner) return;
    var planName = '';
    if (billing) {
      planName = (
        billing.plan_name ||
        billing.name ||
        (billing.subscription && billing.subscription.plan_name) ||
        ''
      ).toLowerCase().trim();
    }
    var isFree = !planName || planName === 'free' || planName === 'starter';
    banner.style.display = isFree ? '' : 'none';
  }

  // ─── Render: quick actions ────────────────────────────────────────────────
  // Quick action links are Webflow elements. Script just shows/hides the
  // "Complete your profile" action based on strength score so it disappears
  // once the profile is strong.

  function _renderQuickActions(score) {
    var completeProfile = _el('quick-action-complete-profile');
    if (completeProfile) {
      completeProfile.style.display = score >= 80 ? 'none' : '';
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    if (!window.LokaliDashboard.requireAuth()) return;

    // Greeting fires immediately — non-blocking
    window.LokaliDashboard.populateGreeting();

    Promise.all([
      window.LokaliAPI.vendors.me(),
      window.LokaliAPI.services.getMine(false),
      window.LokaliAPI.products.getMine(false),
      window.LokaliAPI.plans.getMyBilling()
    ]).then(function (results) {
      var vendorRes  = results[0];
      var servicesRes = results[1];
      var productsRes = results[2];
      var billingRes  = results[3];

      if (vendorRes.error) {
        console.error('[DashboardHome] vendor load error:', vendorRes.error);
        return;
      }

      var vendor = vendorRes.data;

      var serviceItems = _extractItems(servicesRes.data);
      var productItems = _extractItems(productsRes.data);
      var activeServices = serviceItems.filter(function (s) { return s.is_active !== false; }).length;
      var activeProducts = productItems.filter(function (p) { return p.is_active !== false; }).length;

      var strength = _calcStrength(vendor, activeServices, activeProducts);

      _renderStats(activeServices, activeProducts, strength.score);
      _renderProgressBar(strength.score);
      _renderStrengthList(strength.results);
      _renderQuickActions(strength.score);

      if (!billingRes.error) _renderPlanBanner(billingRes.data);

    }).catch(function (err) {
      console.error('[DashboardHome] init error:', err);
    });
  }

  return { init: init };

})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { LokaliDashboardHome.init(); });
} else {
  LokaliDashboardHome.init();
}
