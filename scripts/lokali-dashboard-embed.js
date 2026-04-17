/**
 * Lokali — vendor dashboard (dashboard-html main area)
 * Load AFTER lokali-api-client.js and lokali-dashboard.js (site or page footer).
 * Expects: <div id="lokali-vendor-dashboard-root">…</div> in an HTML Embed on the page.
 *
 * Webflow often injects footer scripts BEFORE the page body content, so this file
 * polls until the embed exists (see tryBoot / ROOT_POLL).
 *
 * Debug: in console, set window.LOKALI_DASHBOARD_EMBED_DEBUG = true and reload.
 */
(function () {
  'use strict';

  var ROOT_ID = 'lokali-vendor-dashboard-root';
  var API_WAIT_MS = 150;
  var API_MAX_TRIES = 100;
  var ROOT_POLL_MS = 200;
  var ROOT_MAX_POLLS = 150;

  var bootStarted = false;
  var rootPollChainStarted = false;

  function dbg() {
    if (typeof window !== 'undefined' && window.LOKALI_DASHBOARD_EMBED_DEBUG) {
      console.log.apply(console, ['[Lokali dashboard embed]'].concat([].slice.call(arguments)));
    }
  }

  var allSettled =
    typeof Promise !== 'undefined' && Promise.allSettled
      ? Promise.allSettled.bind(Promise)
      : function (promises) {
          return Promise.all(
            promises.map(function (p) {
              return Promise.resolve(p).then(
                function (value) {
                  return { status: 'fulfilled', value: value };
                },
                function (reason) {
                  return { status: 'rejected', reason: reason };
                }
              );
            })
          );
        };

  function el(id) {
    return document.getElementById(id);
  }
  function hide(id) {
    var e = el(id);
    if (e) e.style.display = 'none';
  }
  function text(id, val) {
    var e = el(id);
    if (e) e.textContent = val || '';
  }

  function escapeHtml(s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(msg) {
    hide('ld-loading');
    hide('lokali-dash-fallback');
    var e = el('ld-error');
    if (e) {
      e.textContent = msg;
      e.style.display = 'block';
    }
  }

  function revealAll() {
    hide('ld-loading');
    hide('lokali-dash-fallback');
    hide('ld-services-hint');
    hide('ld-products-hint');
  }

  function fmt(cents) {
    if (!cents) return '';
    var d = cents / 100;
    return '$' + (d % 1 === 0 ? d.toFixed(0) : d.toFixed(2));
  }

  function servicePrice(svc) {
    var t = svc.price_type || 'fixed';
    if (t === 'free') return 'Free';
    if (t === 'contact') return 'Contact for price';
    if (t === 'range' && svc.price_min_cents && svc.price_max_cents) {
      return fmt(svc.price_min_cents) + ' – ' + fmt(svc.price_max_cents);
    }
    if (t === 'starting_at' && svc.price_cents) return 'From ' + fmt(svc.price_cents);
    if (svc.price_cents) return fmt(svc.price_cents);
    if (svc.price_note) return svc.price_note;
    return '—';
  }

  function productPrice(p) {
    if (p.is_quote_based) return 'Quote-based';
    if (!p.price) return 'Contact for price';
    var d = parseFloat(p.price);
    return '$' + (d % 1 === 0 ? d.toFixed(0) : d.toFixed(2));
  }

  function normalizeList(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.records)) return data.records;
    if (Array.isArray(data.services)) return data.services;
    if (Array.isArray(data.products)) return data.products;
    if (Array.isArray(data.data)) return data.data;
    if (data.data && Array.isArray(data.data.items)) return data.data.items;
    if (data.result && Array.isArray(data.result)) return data.result;
    if (data.response && Array.isArray(data.response)) return data.response;
    return [];
  }

  function normalizeVendorPayload(data) {
    if (!data || typeof data !== 'object') return {};
    if (data.vendor && typeof data.vendor === 'object') return data.vendor;
    if (data.business_name != null || data.id != null) return data;
    return data;
  }

  function normalizeBillingFromXano(raw) {
    if (!raw || typeof raw !== 'object') {
      return { planName: 'Free', maxServices: 0, maxProducts: 0 };
    }
    var sub = raw.subscription || {};
    var feat = raw.features || {};
    var plan = raw.plan || {};
    var planName =
      raw.plan_name ||
      raw.name ||
      sub.plan_name ||
      sub.name ||
      plan.name ||
      'Free';
    var maxSvc =
      raw.max_services != null
        ? Number(raw.max_services)
        : raw.services_limit != null
          ? Number(raw.services_limit)
          : feat.max_services != null
            ? Number(feat.max_services)
            : sub.max_services != null
              ? Number(sub.max_services)
              : 0;
    var maxProd =
      raw.max_products != null
        ? Number(raw.max_products)
        : raw.products_limit != null
          ? Number(raw.products_limit)
          : feat.max_products != null
            ? Number(feat.max_products)
            : sub.max_products != null
              ? Number(sub.max_products)
              : 0;
    return { planName: String(planName), maxServices: maxSvc, maxProducts: maxProd, raw: raw };
  }

  function handleAuthFailure(status) {
    if (status !== 401) return false;
    if (
      window.LokaliClerk &&
      typeof window.LokaliClerk.onXano401 === 'function' &&
      window.LokaliClerk.onXano401()
    ) {
      return true;
    }
    try {
      if (window.LokaliAPI && typeof window.LokaliAPI.clearToken === 'function') {
        window.LokaliAPI.clearToken();
      }
    } catch (e) {}
    window.location.href = '/login';
    return true;
  }

  function categoryLabel(vendor) {
    if (!vendor || typeof vendor !== 'object') return '';
    var c = vendor.category;
    if (c && (c.name || c.category_name)) return c.name || c.category_name;
    var cats = vendor.categories;
    if (Array.isArray(cats) && cats.length) {
      var x = cats[0];
      if (x && (x.name || x.category_name)) return x.name || x.category_name;
    }
    var cid = vendor.categories_id;
    if (Array.isArray(cid) && cid.length && typeof cid[0] === 'object') {
      var y = cid[0];
      if (y && (y.name || y.category_name)) return y.name || y.category_name;
    }
    return '';
  }

  function firstLocationLabel(vendor) {
    if (!vendor || typeof vendor !== 'object') return '';
    var locs = vendor.locations || vendor.service_areas || vendor.service_locations;
    if (Array.isArray(locs) && locs.length) {
      var L = locs[0];
      return (L && (L.name || L.location_name || L.title)) || '';
    }
    var lid = vendor.locations_id;
    if (Array.isArray(lid) && lid.length && typeof lid[0] === 'object') {
      var M = lid[0];
      return (M && (M.name || M.location_name || M.title)) || '';
    }
    return '';
  }

  function serviceRowId(svc) {
    return svc.id != null ? svc.id : svc.services_id;
  }

  function productRowId(p) {
    return p.id != null ? p.id : p.products_id;
  }

  function isRowActive(row) {
    if (!row || typeof row !== 'object') return false;
    if (row.deactivated_at) return false;
    var a = row.is_active;
    if (a === false || a === 0 || a === '0') return false;
    return true;
  }

  function todayString() {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function renderProfile(vendor) {
    text('ld-vendor-name', vendor.business_name || 'Your Business');

    var taglineEl = el('ld-vendor-tagline');
    if (taglineEl) {
      taglineEl.textContent = vendor.tagline || vendor.business_description || '';
    }

    var photoWrap = el('ld-vendor-photo-wrap');
    if (photoWrap) {
      if (vendor.profile_photo) {
        photoWrap.innerHTML =
          '<img id="ld-vendor-photo" src="' +
          escapeHtml(vendor.profile_photo) +
          '" alt="' +
          escapeHtml(vendor.business_name || '') +
          '">';
        var img = photoWrap.querySelector('img');
        if (img) {
          img.style.cssText =
            'width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid #C8C6D8;display:block;';
        }
      } else {
        var initial = (vendor.business_name || '?').charAt(0).toUpperCase();
        photoWrap.textContent = initial;
      }
    }

    var tags = el('ld-profile-tags');
    if (tags) {
      var html = '';
      var catName = categoryLabel(vendor);
      if (catName) html += '<span class="ld-tag ld-tag-violet">' + escapeHtml(catName) + '</span>';

      var locName = firstLocationLabel(vendor);
      if (locName) html += '<span class="ld-tag ld-tag-fog">📍 ' + escapeHtml(locName) + '</span>';

      var vActive =
        vendor.is_active !== false && vendor.is_active !== 0 && vendor.is_active !== '0';
      html += vActive
        ? '<span class="ld-tag ld-tag-green">● Active</span>'
        : '<span class="ld-tag ld-tag-orange">Inactive</span>';

      tags.innerHTML = html;
    }

    var isActive =
      vendor.is_active !== false && vendor.is_active !== 0 && vendor.is_active !== '0';
    text('ld-stat-status', isActive ? 'Active' : 'Inactive');
    var statusEl = el('ld-stat-status');
    if (statusEl) statusEl.style.color = isActive ? '#16A34A' : '#8E8BA6';
    text('ld-stat-status-sub', isActive ? 'visible to customers' : 'hidden from browse');
  }

  function renderServices(items) {
    var active = items.filter(isRowActive);
    text('ld-stat-services', String(active.length));
    text('ld-services-badge', String(items.length));

    var container = el('ld-services-list');
    if (!container) return;

    if (!items.length) {
      container.innerHTML =
        '<div class="ld-empty">' +
        '<div class="ld-empty-title">No services yet</div>' +
        '<div class="ld-empty-sub">Add your first service so customers know what you offer.</div>' +
        '<a class="ld-btn-primary" href="/vendor-dashboard/services">Add a service →</a>' +
        '</div>';
      return;
    }

    var cards = items.map(function (svc) {
      var on = isRowActive(svc);
      var statusClass = on ? 'ld-status-active' : 'ld-status-inactive';
      var statusLabel = on ? 'Active' : 'Inactive';
      var dur = svc.duration_minutes ? svc.duration_minutes + ' min' : '';
      return (
        '<div class="ld-service-card">' +
        '<div class="ld-card-top">' +
        '<div class="ld-card-name">' +
        escapeHtml(svc.service_name || 'Untitled service') +
        '</div>' +
        '<div class="ld-card-price">' +
        servicePrice(svc) +
        '</div>' +
        '</div>' +
        (svc.service_description
          ? '<div class="ld-card-desc">' + escapeHtml(svc.service_description) + '</div>'
          : '') +
        '<div class="ld-card-footer">' +
        '<span class="ld-status-dot ' +
        statusClass +
        '">' +
        statusLabel +
        (dur ? ' · ' + dur : '') +
        '</span>' +
        '<div class="ld-card-actions">' +
        '<a class="ld-icon-btn" href="/vendor-dashboard/services?edit=' +
        encodeURIComponent(String(serviceRowId(svc))) +
        '">Edit</a>' +
        '</div>' +
        '</div>' +
        '</div>'
      );
    });

    container.innerHTML = '<div class="ld-grid-2">' + cards.join('') + '</div>';
  }

  function renderProducts(items) {
    var active = items.filter(isRowActive);
    text('ld-stat-products', String(active.length));
    text('ld-products-badge', String(items.length));

    var container = el('ld-products-list');
    if (!container) return;

    if (!items.length) {
      container.innerHTML =
        '<div class="ld-empty">' +
        '<div class="ld-empty-title">No products yet</div>' +
        '<div class="ld-empty-sub">List physical or digital products customers can buy from you.</div>' +
        '<a class="ld-btn-primary" href="/vendor-dashboard/products">Add a product →</a>' +
        '</div>';
      return;
    }

    var cards = items.map(function (p) {
      var on = isRowActive(p);
      var statusClass = on ? 'ld-status-active' : 'ld-status-inactive';
      var statusLabel = on ? 'Active' : 'Inactive';
      var imgHtml = p.image_url
        ? '<img class="ld-product-img" src="' +
          escapeHtml(p.image_url) +
          '" alt="' +
          escapeHtml(p.product_name || '') +
          '">'
        : '<div class="ld-product-img-placeholder">No photo yet</div>';
      return (
        '<div class="ld-product-card">' +
        imgHtml +
        '<div class="ld-card-top">' +
        '<div class="ld-card-name">' +
        escapeHtml(p.product_name || 'Untitled product') +
        '</div>' +
        '<div class="ld-card-price">' +
        productPrice(p) +
        '</div>' +
        '</div>' +
        (p.product_description
          ? '<div class="ld-card-desc">' + escapeHtml(p.product_description) + '</div>'
          : '') +
        '<div class="ld-card-footer">' +
        '<span class="ld-status-dot ' +
        statusClass +
        '">' +
        statusLabel +
        '</span>' +
        '<div class="ld-card-actions">' +
        '<a class="ld-icon-btn" href="/vendor-dashboard/products?edit=' +
        encodeURIComponent(String(productRowId(p))) +
        '">Edit</a>' +
        '</div>' +
        '</div>' +
        '</div>'
      );
    });

    container.innerHTML = '<div class="ld-grid-3">' + cards.join('') + '</div>';
  }

  function renderPlan(billingNorm, serviceCount, productCount) {
    var planName = billingNorm.planName || 'Free';
    var maxSvc = billingNorm.maxServices || 0;
    var maxProd = billingNorm.maxProducts || 0;

    text('ld-plan-label', planName);
    text('ld-plan-badge', planName);
    text('ld-stat-plan', planName);

    text('ld-usage-services-nums', serviceCount + ' / ' + (maxSvc || '∞'));
    text('ld-stat-services-sub', 'of ' + (maxSvc || '∞') + ' allowed');
    var svcPct = maxSvc ? Math.min(100, Math.round((serviceCount / maxSvc) * 100)) : 0;
    var svcBar = el('ld-usage-services-bar');
    if (svcBar) {
      svcBar.style.width = svcPct + '%';
      if (svcPct >= 100) svcBar.classList.add('at-limit');
    }

    text('ld-usage-products-nums', productCount + ' / ' + (maxProd || '∞'));
    text('ld-stat-products-sub', 'of ' + (maxProd || '∞') + ' allowed');
    var prodPct = maxProd ? Math.min(100, Math.round((productCount / maxProd) * 100)) : 0;
    var prodBar = el('ld-usage-products-bar');
    if (prodBar) {
      prodBar.style.width = prodPct + '%';
      if (prodPct >= 100) prodBar.classList.add('at-limit');
    }
  }

  function unwrapSettled(r) {
    if (!r) return { data: null, error: 'No response' };
    if (r.status === 'fulfilled') return r.value;
    return {
      data: null,
      error: r.reason && r.reason.message ? r.reason.message : 'Request failed',
    };
  }

  function init() {
    if (!window.LokaliDashboard || typeof LokaliDashboard.requireAuth !== 'function') return;
    if (!LokaliDashboard.requireAuth()) return;

    text('ld-date', todayString());
    if (LokaliDashboard.populateGreeting) {
      LokaliDashboard.populateGreeting('#ld-greeting');
    }

    allSettled([
      window.LokaliAPI.vendors.me(),
      window.LokaliAPI.services.getMine(true),
      window.LokaliAPI.products.getMine(true),
      window.LokaliAPI.plans.getMyBilling(),
    ]).then(function (results) {
      var vendorRes = unwrapSettled(results[0]);
      var servicesRes = unwrapSettled(results[1]);
      var productsRes = unwrapSettled(results[2]);
      var billingRes = unwrapSettled(results[3]);

      if (handleAuthFailure(vendorRes.status)) return;
      if (handleAuthFailure(servicesRes.status)) return;
      if (handleAuthFailure(productsRes.status)) return;
      if (handleAuthFailure(billingRes.status)) return;

      if (vendorRes.error || vendorRes.data == null) {
        var msg = (vendorRes.error && String(vendorRes.error)) || 'Unknown error';
        showError('Could not load your vendor profile from Xano (vendor/me). ' + msg);
        return;
      }

      var vendor = normalizeVendorPayload(vendorRes.data);
      var services = normalizeList(servicesRes.data);
      var products = normalizeList(productsRes.data);
      var billingNorm = normalizeBillingFromXano(
        !billingRes.error && billingRes.data ? billingRes.data : null
      );

      if (servicesRes.error) services = [];
      if (productsRes.error) products = [];

      renderProfile(vendor);
      renderServices(services);
      renderProducts(products);
      renderPlan(
        billingNorm,
        services.filter(isRowActive).length,
        products.filter(isRowActive).length
      );
      revealAll();
    }).catch(function (err) {
      showError('Something went wrong loading your dashboard. Please refresh.');
      console.error('[Lokali Dashboard embed]', err);
    });
  }

  var apiTries = 0;
  function waitForApiAndInit() {
    if (window.LokaliAPI && window.LokaliDashboard) {
      dbg('LokaliAPI ready, calling init()');
      init();
      return;
    }
    apiTries++;
    if (apiTries >= API_MAX_TRIES) {
      dbg('LokaliAPI wait timeout');
      showError(
        'Lokali scripts did not load. Add (in order) before </body>: lokali-api-client.js, lokali-dashboard.js, then this file. Page footer must run AFTER site footer if both are used.'
      );
      return;
    }
    setTimeout(waitForApiAndInit, API_WAIT_MS);
  }

  /**
   * Single poll chain until #lokali-vendor-dashboard-root exists (Webflow embed often loads after footer scripts).
   */
  function startRootPollChain() {
    if (bootStarted || rootPollChainStarted) return;
    rootPollChainStarted = true;
    var n = 0;
    function poll() {
      if (bootStarted) return;
      if (document.getElementById(ROOT_ID)) {
        runBoot();
        return;
      }
      n++;
      if (n > ROOT_MAX_POLLS) {
        console.error(
          '[Lokali dashboard embed] No #' +
            ROOT_ID +
            ' after ~' +
            Math.round((ROOT_MAX_POLLS * ROOT_POLL_MS) / 1000) +
            's. Add the HTML Embed from dashboard-body-embed.html on this page.'
        );
        return;
      }
      setTimeout(poll, ROOT_POLL_MS);
    }
    poll();
  }

  function runBoot() {
    if (bootStarted) return;
    if (!document.getElementById(ROOT_ID)) {
      startRootPollChain();
      return;
    }
    bootStarted = true;
    dbg('Root found, waiting for LokaliAPI');
    hide('lokali-dash-fallback');
    var loadEl = el('ld-loading');
    if (loadEl) loadEl.style.display = 'flex';
    apiTries = 0;
    waitForApiAndInit();
  }

  function scheduleTryBoot() {
    runBoot();
  }

  if (typeof window !== 'undefined') {
    window.LokaliDashboardEmbed = {
      runBoot: runBoot,
      ROOT_ID: ROOT_ID,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleTryBoot);
  } else {
    scheduleTryBoot();
  }
  window.addEventListener('load', scheduleTryBoot);
  setTimeout(scheduleTryBoot, 0);
  setTimeout(scheduleTryBoot, 500);
  setTimeout(scheduleTryBoot, 2000);
})();
