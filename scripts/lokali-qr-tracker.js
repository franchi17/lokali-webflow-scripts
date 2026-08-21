/*
 * lokali-qr-tracker.js — counts visits that arrive from a printed QR code.
 * ---------------------------------------------------------------------------
 * Load SITE-WIDE (Webflow project settings → custom code → footer), like the
 * other lokali scripts, via jsDelivr. No dependencies — it does NOT wait for
 * lokali-supabase-client.js, because a QR visitor lands cold and the count
 * should be recorded even if the visitor bounces before the app boots.
 *
 * HOW IT WORKS
 *   The printed codes encode:  /?utm_source=qr&utm_medium=print&utm_campaign=<placement>
 *   (assets/golokali-qr-*.png → campaign 'flyer', the square business flyer).
 *   When a page loads with utm_source=qr, one row goes into `qr_scans`
 *   (sql/patch_qr_scans.sql) via an anonymous keepalive REST insert — the
 *   same fire-and-forget pattern as page_views/lead_events in
 *   lokali-api-adapter.js. sessionStorage dedupes, so navigating around the
 *   site after scanning counts once, not per page.
 *
 *   Stats surface in the admin panel on /account ("QR code scans" card,
 *   lokali-account.js → admin_qr_scans() RPC). The GA4 utm tags still work
 *   as before — this is the in-house count.
 *
 * PRIVACY: campaign, landing path, referrer, mobile/desktop, timestamp.
 * Nothing identifying; the table is write-only from the browser (RLS).
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // Same public config as lokali-supabase-client.js (safe in the browser —
  // RLS is the gate), duplicated here so this file stands alone.
  var SUPABASE_URL =
    (typeof window !== 'undefined' && window.LOKALI_SUPABASE_URL) ||
    'https://api.golokali.com';
  var SUPABASE_KEY =
    (typeof window !== 'undefined' && window.LOKALI_SUPABASE_PUBLISHABLE_KEY) ||
    'sb_publishable_--wRW6DD_9ZCBqfb0kJUww_0lzfzs39';

  var params;
  try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
  if (params.get('utm_source') !== 'qr') return;

  // One scan = one visit: dedupe across the browsing session so clicking
  // around after landing doesn't inflate the count. If sessionStorage is
  // unavailable (rare privacy modes) we still record — the landing itself
  // only fires once per scan anyway, since in-site links carry no utm tags.
  var DEDUPE_KEY = 'lok_qr_scan_logged';
  try {
    if (window.sessionStorage.getItem(DEDUPE_KEY)) return;
    window.sessionStorage.setItem(DEDUPE_KEY, '1');
  } catch (e) {}

  var clip = function (v, max) {
    if (!v) return null;
    v = String(v);
    return v.length > max ? v.slice(0, max) : v;
  };

  var row = {
    campaign: clip(params.get('utm_campaign'), 60) || 'unknown',
    medium:   clip(params.get('utm_medium'), 60),
    landing:  clip(window.location.pathname, 200) || '/',
    referrer: clip(document.referrer, 300),
    device:   /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
  };

  // keepalive: survives an immediate navigation away (same reasoning as
  // keepaliveInsert in lokali-api-adapter.js). Anonymous on purpose.
  try {
    fetch(SUPABASE_URL + '/rest/v1/qr_scans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        Prefer: 'return=minimal'
      },
      keepalive: true,
      body: JSON.stringify(row)
    }).catch(function () {});
  } catch (e) {}
})();
