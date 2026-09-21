/**
 * lokali-guide-usage.js - anonymous usage of the guides, for the admin Insights
 * page (F 2026-09-20). Site-wide, tiny, `defer`. Backend: patch_guide_events.sql.
 *
 * Records, and ONLY records:
 *   view        /start, /vendor-resources, /vendor-resources/{guide}, /this-weekend
 *   click       the two Resources menu links (desktop + phone), the dashboard
 *               "Help and guides" row, and the cards on the guides landing page
 *   start_ready a Start Here checklist was built (which answers, from a closed list)
 *   start_cta   the sign-up button on Start Here was tapped
 *
 * PRIVACY, identical to lokali-api-adapter.js trackVisit: random browser-minted
 * ids (the SAME lok_visitor / lok_visit keys, so counts line up), no IP, no user
 * agent, no account, no email. Global Privacy Control or Do Not Track => the id
 * lives in sessionStorage only and dies with the tab. The auth token rides along
 * only so the server can flag a signed-in vendor/admin as internal; it is never
 * stored. The server drops anything that is not on its closed list, so nothing a
 * visitor types can ever be recorded. Filename is blocklist-safe on purpose
 * (never name a script *analytics* / *tracker* / *pixel* / *beacon*).
 */
(function () {
  'use strict';
  if (window.__lokGuideUsage) return;
  window.__lokGuideUsage = true;

  var SUPABASE_URL = window.LOKALI_SUPABASE_URL || 'https://api.golokali.com';
  var SUPABASE_KEY = window.LOKALI_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_--wRW6DD_9ZCBqfb0kJUww_0lzfzs39';

  function randId() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (e) { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + 'xxxxxx'; }
  }
  function privacySignal() {
    try { return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1'; }
    catch (e) { return false; }
  }
  function stored(store, key) {
    try {
      var v = store.getItem(key);
      if (!v || !/^[a-z0-9-]{16,40}$/.test(v)) { v = randId().toLowerCase(); store.setItem(key, v); }
      return v;
    } catch (e) { return null; }
  }
  var mem = null;
  function ids() {
    var visit = stored(window.sessionStorage, 'lok_visit');
    if (!visit) { mem = mem || randId().toLowerCase(); return { visitor: mem, visit: mem, persistent: false }; }
    if (privacySignal()) return { visitor: visit, visit: visit, persistent: false };
    var visitor = stored(window.localStorage, 'lok_visitor');
    return visitor ? { visitor: visitor, visit: visit, persistent: true } : { visitor: visit, visit: visit, persistent: false };
  }
  function ref() {
    try {
      if (/[?&]via=/.test(location.search)) return 'share';
      var r = document.referrer; if (!r) return 'direct';
      var u = new URL(r);
      if (u.hostname.replace(/^www\./, '') !== location.hostname.replace(/^www\./, '')) return 'external';
      return /^\/the-market(\/|$)/.test(u.pathname) ? 'market' : 'internal';
    } catch (e) { return 'direct'; }
  }

  function send(kind, target, detail) {
    try {
      var i = ids();
      var body = { p_visitor: i.visitor, p_visit: i.visit, p_kind: kind, p_persistent: i.persistent, p_ref: ref(), p_target: target };
      if (detail) body.p_detail = detail;
      // keepalive: a menu click navigates away at once.
      var post = function (token) {
        // Only a real JWT string may ride as the bearer. LokaliAuth.token() returns a
        // PROMISE (found on staging 2026-09-20: 'Bearer [object Promise]' -> 401 on
        // every event), so it is resolved first and anything odd falls back to the key.
        var bearer = (typeof token === 'string' && token.split('.').length === 3) ? token : SUPABASE_KEY;
        fetch(SUPABASE_URL + '/rest/v1/rpc/log_guide_event', {
          method: 'POST', keepalive: true, body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + bearer }
        }).catch(function () {});
      };
      var t = null;
      try { t = window.LokaliAuth && window.LokaliAuth.token ? window.LokaliAuth.token() : null; } catch (e) {}
      if (t && typeof t.then === 'function') {
        // Never let a slow token hold up a click that is about to navigate: race it.
        var sent = false;
        var once = function (tok) { if (sent) return; sent = true; post(tok); };
        t.then(once, function () { once(null); });
        setTimeout(function () { once(null); }, 250);
      } else { post(t); }
    } catch (e) {}
  }

  // ---- which page is this? ----
  var path = String(location.pathname || '').replace(/\/+$/, '') || '/';
  function pageTarget() {
    if (path === '/start') return 'start';
    if (path === '/this-weekend') return 'weekend';
    if (path === '/vendor-resources') return 'guides';
    var m = /^\/vendor-resources\/([a-z0-9-]{3,40})$/.exec(path);
    return m ? 'guide:' + m[1] : null;
  }
  var page = pageTarget();
  if (page) send('view', page);

  // ---- clicks (one delegated listener; hrefs + data attributes, no text) ----
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = (a.getAttribute('href') || '').replace(/\/+$/, '');
    if (a.hasAttribute('data-lok-help')) { send('click', 'dash:help'); return; }
    if (a.closest('.lok-res-panel') || a.closest('#lok-mnav-panel')) {
      if (href === '/start') send('click', 'menu:start');
      else if (href === '/vendor-resources') send('click', 'menu:guides');
      return;
    }
    if (page === 'guides') {
      if (a.getAttribute('data-lk-use') === 'hub:start') { send('click', 'hub:start'); return; }
      var m = /^\/vendor-resources\/([a-z0-9-]{3,40})$/.exec(href);
      if (m && a.classList.contains('lkg-card')) send('click', 'hub:' + m[1]);
      return;
    }
    if (page === 'start' && a.classList.contains('lkst-btn') && href === '/sign-up') send('start_cta', 'start');
  }, true);

  // ---- Start Here funnel: lokali-start.js announces each newly built checklist ----
  var lastDetail = null;
  function onStartReady(d) {
    d = d || {};
    var detail = [d.kind || '', d.product || '-', d.service || '-', d.setup || ''].join('|');
    if (!/^(product|service|both)\|(food|handmade|resale|-)\|(care|trade|foodsvc|kids|pro|-)\|(sole|llc|unsure)$/.test(detail)) return;
    if (detail === lastDetail) return; // same answers re-rendered (a checkbox tick): not a new checklist
    lastDetail = detail;
    send('start_ready', 'start', detail);
  }
  window.addEventListener('lokali:start-ready', function (e) { onStartReady(e && e.detail); });
  // Saved answers can render a checklist before this deferred script attaches.
  if (window.__lokStartReady) onStartReady(window.__lokStartReady);
})();
