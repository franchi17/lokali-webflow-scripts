/**
 * Lokali — public vendor profile view tracker.
 *
 * Load this ONLY on the public vendor profile template (e.g. golokali.com/vendors/{id}).
 * It fires one fire-and-forget POST to Xano so the vendor's "Profile Views" stat
 * increments on the dashboard. Server-side dedupe (1h per IP+UA) keeps the cost flat
 * and prevents refresh-spam.
 *
 * No auth, no Promise chains, no error surfaces — by design.
 *
 * Configuration (set before this script if you want to override defaults):
 *   window.LOKALI_VENDORS_BASE       — Xano Vendors API base URL.
 *   window.LOKALI_PUBLIC_VIEW_PATH   — path template, default 'vendors/{id}/view'.
 *   window.LOKALI_PUBLIC_VENDOR_ID   — explicit vendor id (skips URL parsing).
 *
 * Vendor ID resolution (first match wins):
 *   1. window.LOKALI_PUBLIC_VENDOR_ID (set in Webflow page embed if needed).
 *   2. [data-lokali-vendor-id] attribute on any element.
 *   3. The final numeric segment of the URL path (/vendors/123 → "123").
 */
(function () {
  'use strict';

  var DEFAULT_BASE = 'https://x8ki-letl-twmt.n7.xano.io/api:d01JTdvD';
  var DEFAULT_PATH = 'vendors/{id}/view';
  var SESSION_KEY  = 'lokali_view_tracked_';

  function getBase() {
    if (typeof window.LOKALI_VENDORS_BASE === 'string' && window.LOKALI_VENDORS_BASE) {
      return window.LOKALI_VENDORS_BASE.replace(/\/$/, '');
    }
    return DEFAULT_BASE;
  }

  function getPathTemplate() {
    if (typeof window.LOKALI_PUBLIC_VIEW_PATH === 'string' && window.LOKALI_PUBLIC_VIEW_PATH) {
      return window.LOKALI_PUBLIC_VIEW_PATH.replace(/^\//, '');
    }
    return DEFAULT_PATH;
  }

  function resolveVendorId() {
    if (window.LOKALI_PUBLIC_VENDOR_ID != null && window.LOKALI_PUBLIC_VENDOR_ID !== '') {
      return String(window.LOKALI_PUBLIC_VENDOR_ID);
    }
    var el = document.querySelector('[data-lokali-vendor-id]');
    if (el) {
      var attr = el.getAttribute('data-lokali-vendor-id');
      if (attr) return String(attr).trim();
    }
    var path = (window.location && window.location.pathname) || '';
    var match = path.match(/\/vendors\/([^\/?#]+)/i);
    if (match && match[1]) return decodeURIComponent(match[1]);
    return null;
  }

  function alreadyTrackedThisSession(vendorId) {
    try {
      var key = SESSION_KEY + vendorId;
      if (window.sessionStorage && window.sessionStorage.getItem(key)) return true;
      if (window.sessionStorage) window.sessionStorage.setItem(key, '1');
    } catch (e) {
      // Storage blocked (private mode, etc.) — rely on server-side dedupe.
    }
    return false;
  }

  function trackView() {
    var vendorId = resolveVendorId();
    if (!vendorId) return;

    // Don't double-fire on SPA-style re-renders within a single tab session.
    if (alreadyTrackedThisSession(vendorId)) return;

    var url = getBase() + '/' + getPathTemplate().replace('{id}', encodeURIComponent(vendorId));

    try {
      fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        keepalive: true,
        credentials: 'omit'
      }).catch(function () {});
    } catch (e) {
      // Network or CSP error — nothing to do, count is best-effort.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackView);
  } else {
    trackView();
  }
})();
