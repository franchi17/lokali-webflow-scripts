/*
 * lokali-grants.js — "Grants you can apply for" card on the vendor dashboard
 * home (/vendor-dashboard/dashboard). #256, F 2026-11-19.
 *
 * WHAT IT IS (F: "for now we just list the grants and people decide to apply
 * as needed"): one plain list, the same for every plan. Name, who can apply,
 * amount, deadline, Apply (opens the funder's own page in a new tab). No
 * matching, no questions, no reminders. Soonest deadline first; the first
 * three show, "Show all N" opens the rest.
 *
 * DATA: grants_open() (patch_grants_list.sql) — signed-in only, returns live
 * grants whose deadline is today or later, so closed grants drop off on their
 * own. The list itself is maintained by the monthly refresh, never from here.
 * Apply taps call log_grant_tap(id), fire-and-forget: one row per grant per
 * storefront per day, with the plan at tap time. That count decides whether a
 * paid version is ever built.
 *
 * PLACEMENT: appended at the END of the home column (after the quick actions
 * and the standing cards), because F found the home page busy (2026-09-20);
 * it never pushes the status, tiles or next step down. Self-hides when the
 * list is empty or the call fails.
 *
 * Mount: none needed. Registered Webflow page script (SRI-pinned, footer) on
 * the dashboard page only. Waits for window.LokaliSupabaseReady, so its
 * position relative to the sitewide bundle does not matter. Idempotent.
 *
 * Two mirrored copies (repo rule — edit BOTH, byte-identical):
 *   scripts/lokali-grants.js
 *   lokali-webflow-scripts/scripts/lokali-grants.js
 */
(function () {
  'use strict';

  if (window.__lokGrants) return;
  window.__lokGrants = true;

  var SHOW_FIRST = 3;
  var SOON_DAYS = 14;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var CSS =
    '#lok-grants{background:#fff;border:.5px solid #EEEDF6;border-radius:12px;padding:18px;margin-top:16px;min-width:0;box-sizing:border-box;' +
      'font-family:"Plus Jakarta Sans",-apple-system,sans-serif;color:#1A1829;}' +
    '#lok-grants *{box-sizing:border-box;font-family:inherit;}' +
    '#lok-grants .lg-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;}' +
    '#lok-grants .lg-t{font-size:17px;font-weight:800;letter-spacing:-.2px;line-height:1.3;margin:0;}' +
    '#lok-grants .lg-s{font-size:13.5px;color:#4A4761;margin:2px 0 0;line-height:1.45;}' +
    '#lok-grants .lg-upd{font-size:11.5px;font-weight:700;color:#17784A;background:#E7F6EE;border-radius:20px;padding:3px 10px;white-space:nowrap;}' +
    '#lok-grants .lg-list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;}' +
    '#lok-grants .lg-row{border:1px solid #EEEDF6;border-radius:12px;padding:12px 14px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;align-items:center;}' +
    '#lok-grants .lg-row[hidden]{display:none!important;}' +
    '#lok-grants .lg-name{font-size:15px;font-weight:700;line-height:1.3;margin:0;}' +
    '#lok-grants .lg-who{font-size:13px;color:#4A4761;line-height:1.45;margin:2px 0 0;}' +
    '#lok-grants .lg-side{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;}' +
    '#lok-grants .lg-amt{font-size:16px;font-weight:800;color:#6002EE;white-space:nowrap;font-variant-numeric:tabular-nums;}' +
    '#lok-grants .lg-due{font-size:11.5px;font-weight:700;border-radius:20px;padding:3px 9px;white-space:nowrap;background:#F1ECFE;color:#6002EE;}' + // quick fixes 2026-11-23: one lavender chip for every grant, no peach 'soon' state
    '#lok-grants .lg-go{display:inline-block;font-size:13px;font-weight:700;color:#6002EE;background:#fff;border:1px solid #6002EE;border-radius:10px;padding:6px 12px;text-decoration:none;white-space:nowrap;}' +
    '#lok-grants .lg-go:hover{background:#F0E6FF;}' +
    '#lok-grants .lg-go:focus-visible,#lok-grants .lg-more:focus-visible{outline:3px solid #6002EE;outline-offset:2px;}' +
    '#lok-grants .lg-more{margin-top:10px;font-size:13.5px;font-weight:700;color:#6002EE;background:none;border:0;padding:4px 0;cursor:pointer;}' +
    '#lok-grants .lg-note{margin:10px 0 0;font-size:12px;color:#6E6A85;line-height:1.45;}' +
    '@media (max-width:560px){#lok-grants .lg-row{grid-template-columns:minmax(0,1fr);}#lok-grants .lg-side{justify-content:flex-start;}}';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) { return /^https:\/\/[^\s<>"']+$/.test(String(u || '')) ? String(u) : ''; }
  function parseDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function todayLocal() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysLeft(iso) { var d = parseDay(iso); return d ? Math.round((d - todayLocal()) / 86400000) : null; }
  function shortDate(iso) { var d = parseDay(iso); return d ? MONTHS[d.getMonth()] + ' ' + d.getDate() : ''; }

  function dueChip(g) {
    // Quick fixes 2026-11-23 (team review, F 'Yes, all eight'): always the date,
    // never a countdown ('Closes today' / 'Closes tomorrow' read as pressure).
    var text;
    if (g.closes_label) text = g.closes_label;
    else if (!parseDay(g.closes_on)) text = 'Open all year';
    else text = 'Open until ' + shortDate(g.closes_on);
    return '<span class="lg-due">' + esc(text) + '</span>';
  }

  function render(list) {
    list = list.filter(function (g) { return g && safeUrl(g.url); });
    if (!list.length || document.getElementById('lok-grants')) return;
    var anchor = document.querySelector('.div-block-168') || document.getElementById('lok-cols');
    if (!anchor || !anchor.parentNode) return;

    if (!document.getElementById('lok-grants-css')) {
      var st = document.createElement('style'); st.id = 'lok-grants-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }

    var newest = list.reduce(function (a, g) { return String(g.verified_on || '') > a ? String(g.verified_on) : a; }, '');
    var rows = list.map(function (g, i) {
      var url = safeUrl(g.url);
      return '<li class="lg-row"' + (i >= SHOW_FIRST ? ' hidden' : '') + '>' +
        '<div><p class="lg-name">' + esc(g.name) + '</p><p class="lg-who">' + esc(g.who) + '</p></div>' +
        '<div class="lg-side"><span class="lg-amt">' + esc(g.amount) + '</span>' + dueChip(g) +
          '<a class="lg-go" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-grant="' + esc(g.id) + '"' +
          ' aria-label="Apply for the ' + esc(g.name) + ' (opens the grant\'s website in a new tab)">Apply</a></div>' +
      '</li>';
    }).join('');

    var card = document.createElement('section');
    card.id = 'lok-grants';
    card.setAttribute('aria-labelledby', 'lok-grants-t');
    card.innerHTML =
      '<div class="lg-hd"><div><h2 class="lg-t" id="lok-grants-t">Grants you can apply for</h2>' +
        '<p class="lg-s">Free money for small businesses. Nothing to pay back.</p></div>' +
        (newest ? '<span class="lg-upd">Updated ' + esc(shortDate(newest)) + '</span>' : '') + '</div>' +
      '<ul class="lg-list">' + rows + '</ul>' +
      (list.length > SHOW_FIRST ? '<button type="button" class="lg-more" aria-expanded="false">Show all ' + list.length + ' grants</button>' : '') +
      '<p class="lg-note">We check every grant on its own website each month and only list ones that are free to apply for. Lokali isn\'t part of these programs.</p>';

    anchor.parentNode.appendChild(card);

    var more = card.querySelector('.lg-more');
    if (more) more.addEventListener('click', function () {
      var open = more.getAttribute('aria-expanded') === 'true';
      card.querySelectorAll('.lg-row').forEach(function (r, i) { if (i >= SHOW_FIRST) r.hidden = open; });
      more.setAttribute('aria-expanded', String(!open));
      more.textContent = open ? 'Show all ' + list.length + ' grants' : 'Show fewer';
    });

    card.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-grant]') : null;
      if (!a) return;
      var id = Number(a.getAttribute('data-grant'));
      if (!id || !window.LokaliSupabase) return;
      try { window.LokaliSupabase.rpc('log_grant_tap', { p_grant_id: id }).then(null, function () {}); } catch (err) { /* never block the link */ }
    });
  }

  function whenAnchor(cb) {
    var tries = 0;
    (function poll() {
      if (document.querySelector('.div-block-168') || document.getElementById('lok-cols')) return cb();
      if (++tries < 40) setTimeout(poll, 250);
    })();
  }

  function boot() {
    if (!window.LokaliSupabase) return;
    window.LokaliSupabase.rpc('grants_open').then(function (res) {
      var list = res && !res.error && Array.isArray(res.data) ? res.data : [];
      if (!list.length) return;
      whenAnchor(function () { render(list); });
    }, function () { /* hide on failure */ });
  }

  // Order-proof start: this file is a registered page script, so it may run
  // before OR after the sitewide bundle that creates LokaliSupabaseReady.
  // Wait for it (up to ~15s), then for the DOM, then boot once.
  var waited = 0;
  (function start() {
    if (window.LokaliSupabaseReady && typeof window.LokaliSupabaseReady.then === 'function') {
      window.LokaliSupabaseReady.then(function () {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
      }, function () { /* client failed to start: no card */ });
      return;
    }
    if (++waited < 150) setTimeout(start, 100);
  })();
})();
