
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
      test: function (v) {
        var t = v.business_tagline || v.tagline || '';
        return !!(t && t.trim());
      }
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

  // ─── New-user dashboard renderers ─────────────────────────────────────────
  // All of the renderers below are additive. Each one no-ops if the
  // corresponding markup isn't present on the page, so the same script works
  // on both the legacy and reframed dashboard layouts.

  function _normalizeBillingShape(raw) {
    raw = raw || {};
    var planName = '';
    var planLabel = '';
    if (raw.plan && typeof raw.plan === 'object') {
      planName = (raw.plan.name || '').toString().toLowerCase().trim();
      planLabel = (raw.plan.label || '').toString().trim();
    }
    if (!planName) {
      planName = (
        raw.plan_name ||
        raw.name ||
        (raw.subscription && raw.subscription.plan_name) ||
        ''
      ).toString().toLowerCase().trim();
    }

    var services = raw.services && typeof raw.services === 'object' ? raw.services : null;
    var products = raw.products && typeof raw.products === 'object' ? raw.products : null;

    return {
      planName: planName,
      planLabel: planLabel || _defaultPlanLabel(planName),
      services: services,
      products: products,
      profileViewsThisMonth: raw.profile_views_this_month != null
        ? raw.profile_views_this_month
        : (raw.profileViewsThisMonth != null ? raw.profileViewsThisMonth : null),
      publicUrl: (raw.public_url || raw.publicUrl || '').toString()
    };
  }

  function _defaultPlanLabel(planName) {
    switch (planName) {
      case 'free':    return 'Free Plan';
      case 'starter': return 'Starter Plan';
      case 'mid':     return 'Mid Plan';
      case 'pro':     return 'Pro Plan';
      default:        return planName ? (planName.charAt(0).toUpperCase() + planName.slice(1) + ' Plan') : '';
    }
  }

  function _formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    try { return Number(n).toLocaleString(); } catch (e) { return String(n); }
  }

  // ─── Render: Profile Views stat card ──────────────────────────────────────

  function _renderProfileViews(billing) {
    var card = _el('dashboard-profile-views-card');
    if (!billing || billing.profileViewsThisMonth == null) {
      if (card) card.style.display = 'none';
      return;
    }
    if (card) card.style.display = '';
    _setText('dashboard-profile-views', _formatNumber(billing.profileViewsThisMonth));
    _setText('dashboard-profile-views-period', 'This month');
  }

  // ─── Render: Active Services capacity ─────────────────────────────────────
  // Existing stat field `dashboard-active-services` stays (just the count).
  // Adds capacity ("3/3") plus an "At limit · upgrade for more" state.

  function _renderActiveServicesCapacity(billing, fallbackCount) {
    var s = billing && billing.services;
    var used = s && s.used != null ? Number(s.used) : Number(fallbackCount || 0);
    var limit = s && s.limit != null ? Number(s.limit) : null;
    _setText('dashboard-active-services', used);

    if (limit == null) {
      _setText('dashboard-active-services-capacity', '');
      _hide('dashboard-active-services-state');
      return;
    }

    var unlimited = limit >= 999999;
    _setText('dashboard-active-services-capacity', unlimited ? '' : (used + '/' + limit));

    var stateEl = _el('dashboard-active-services-state');
    if (stateEl) {
      var atLimit = !unlimited && used >= limit;
      stateEl.style.display = atLimit ? '' : 'none';
      if (atLimit) _setText('dashboard-active-services-state', 'At limit · upgrade for more');
    }
  }

  // ─── Render: Listing strength missing count ───────────────────────────────
  // Surfaces a dynamic "N" for headlines like
  // "You're missing N things that help customers decide to reach out."

  function _renderStrengthMissingCount(results) {
    var missing = (results || []).filter(function (r) { return !r.done; }).length;
    _setText('strength-missing-count', missing);
    var sectionTitle = _el('listing-strength-title-noun');
    if (sectionTitle) {
      sectionTitle.textContent = missing === 1 ? 'thing' : 'things';
    }
  }

  // ─── Render: Share profile card ───────────────────────────────────────────
  // Expects:
  //   [data-lokali="share-profile-url"]   — text node for the URL
  //   #share-copy-link                    — copy-link button
  //   #share-copy-link-text or
  //     [data-lokali="share-copy-link-text"] (inside the button) — swappable label
  //   #share-profile-btn                  — "Share profile" button (Web Share API
  //                                          with copy fallback)
  // Hides the whole card (#share-profile-card) when no URL is available.

  function _renderShareCard(vendor, billing) {
    var url = (billing && billing.publicUrl) || _deriveShareUrl(vendor);
    var card = _el('share-profile-card');

    if (!url) {
      if (card) card.style.display = 'none';
      return;
    }
    if (card) card.style.display = '';

    _setText('share-profile-url', _displayUrl(url));
    var linkEl = _el('share-profile-url');
    if (linkEl && linkEl.tagName === 'A') linkEl.setAttribute('href', url);

    _wireCopyLink(url);
    _wireShareButton(url, vendor && vendor.business_name);
  }

  function _deriveShareUrl(vendor) {
    if (!vendor) return '';
    var identifier = (vendor.slug && vendor.slug.trim()) || vendor.id;
    if (!identifier) return '';
    var host = (window.LOKALI_PUBLIC_ORIGIN && String(window.LOKALI_PUBLIC_ORIGIN).replace(/\/$/, '')) ||
               'https://www.golokali.com';
    return host + '/vendors/' + identifier;
  }

  function _displayUrl(url) {
    return String(url).replace(/^https?:\/\//i, '');
  }

  function _wireCopyLink(url) {
    var btn = document.getElementById('share-copy-link');
    if (!btn || btn.__lokaliWired) return;
    btn.__lokaliWired = true;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      _copyToClipboard(url).then(function (ok) {
        if (!ok) return;
        var labelEl = btn.querySelector('[data-lokali="share-copy-link-text"]') ||
                      document.getElementById('share-copy-link-text') ||
                      btn;
        var original = labelEl.textContent;
        labelEl.textContent = 'Copied';
        btn.classList.add('lokali-share-copied');
        setTimeout(function () {
          labelEl.textContent = original;
          btn.classList.remove('lokali-share-copied');
        }, 2000);
      });
    });
  }

  function _wireShareButton(url, title) {
    var btn = document.getElementById('share-profile-btn');
    if (!btn || btn.__lokaliWired) return;
    btn.__lokaliWired = true;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var shareData = { title: title || 'My Lokali profile', url: url };
      if (navigator.share) {
        navigator.share(shareData).catch(function () {});
        return;
      }
      _copyToClipboard(url);
    });
  }

  function _copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return _legacyCopy(text); });
    }
    return Promise.resolve(_legacyCopy(text));
  }

  function _legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  // ─── Render: contextual plan card ─────────────────────────────────────────
  // The new design's plan upsell card lives at the bottom of the dashboard and
  // replaces the violet "blunt demand" banner. The legacy banner renderer
  // above (`_renderPlanBanner`) stays in place for back-compat — the new card
  // uses distinct IDs so both can coexist if needed.
  //   #plan-context-card                                  — card root
  //   [data-lokali="plan-context-label"]                  — e.g. "FREE PLAN"
  //   [data-lokali="plan-context-services-used"]          — e.g. "3/3 services used"
  //   [data-lokali="plan-context-headline"]               — copy varies by tier
  //   [data-lokali="plan-context-sub"]                    — sub-copy
  //   [data-lokali="plan-context-cta"]                    — CTA label

  function _renderPlanCard(billing) {
    var card = _el('plan-context-card');
    if (!card) return;

    var planName = billing.planName || 'free';
    var isFreeish = planName === 'free' || planName === 'starter';

    if (!isFreeish) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';

    var s = billing.services;
    var used = s && s.used != null ? Number(s.used) : 0;
    var limit = s && s.limit != null ? Number(s.limit) : null;
    var atLimit = limit != null && limit < 999999 && used >= limit;

    _setText('plan-context-label', (billing.planLabel || 'Free Plan').toUpperCase());
    _setText('plan-context-services-used',
      limit != null ? (used + '/' + limit + ' services used') : (used + ' services used'));

    var headline = atLimit
      ? "You're getting traction. Unlock more with Mid."
      : "You're getting started. Unlock more with Mid.";
    _setText('plan-context-headline', headline);

    _setText('plan-context-sub',
      'More listings, public reviews, and homepage placement from $20/mo');
    _setText('plan-context-cta', 'See plans');
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
      var billing = _normalizeBillingShape(!billingRes.error ? billingRes.data : null);

      _renderStats(activeServices, activeProducts, strength.score);
      _renderProgressBar(strength.score);
      _renderStrengthList(strength.results);
      _renderStrengthMissingCount(strength.results);
      _renderQuickActions(strength.score);

      _renderProfileViews(billing);
      _renderActiveServicesCapacity(billing, activeServices);
      _renderShareCard(vendor, billing);
      _renderPlanCard(billing);

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
