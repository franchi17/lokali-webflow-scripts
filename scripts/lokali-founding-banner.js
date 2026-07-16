/**
 * Lokali — Homepage founding-members hero banner (dynamic count + progress bar).
 *
 * The homepage hero has a static "N of 50 founding spots claimed in The
 * Woodlands" line (Webflow element `.div-block-180` → `.text-block-107`). This
 * script makes that count live and injects an animated progress bar above it so
 * the scarcity fills up visibly as founders join.
 *
 * Data source: the public `founding_status(location_id)` RPC (anon-callable,
 * security-definer) via window.LokaliSupabaseAPI. It returns
 *   { cap, claimed, remaining, is_open }
 * where `claimed` counts ALL founding_members rows (retired/revoked spots
 * included, per the founding-member business rules — a retired spot still
 * consumes the cap, so the bar should reflect it).
 *
 * Community: the cap is GLOBAL since 2026-07-16 — 50 spots TOTAL across all
 * communities (The Woodlands, Houston, Woodforest), because one vendor can
 * serve all three. The RPC still takes a location id (echoed back, same
 * numbers for every community); the hero passes the flagship community —
 * resolved by NAME so we don't hardcode a brittle location id. Override with:
 *   window.LOKALI_FOUNDING_COMMUNITY = 'The Woodlands'   // default
 *
 * Graceful: if the banner element, the API, or the community can't be resolved,
 * it leaves the existing static markup untouched and no-ops. Loaded site-wide;
 * self-guards to the homepage hero via the banner lookup.
 *
 * Keep this file byte-identical in scripts/ and lokali-webflow-scripts/scripts/.
 * Deploy: jsDelivr @v1.4 (commit + tag + purge), same as the other hero scripts.
 */
(function () {
  'use strict';

  var COMMUNITY = (window.LOKALI_FOUNDING_COMMUNITY || 'The Woodlands').trim();
  var STYLE_ID  = 'lok-fb-style';

  // ─── locate the hero banner ────────────────────────────────────────────────
  // Match the count line by its content, not just the Webflow auto-class, so a
  // reused `.text-block-107` elsewhere on the site can't be hijacked.
  function findCountEl() {
    var nodes = document.querySelectorAll('.div-block-180 .text-block-107, .text-block-107');
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || '').toLowerCase();
      if (t.indexOf('founding spot') !== -1) return nodes[i];
    }
    return null;
  }

  // ─── styles (Plus Jakarta Sans; soft muted violet→peach, no ink) ───────────
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.lok-fb{margin:0 0 12px;font-family:"Plus Jakarta Sans",sans-serif;}' +
      '.lok-fb-track{position:relative;height:9px;border-radius:999px;overflow:hidden;' +
        'background:#EEE9F8;box-shadow:inset 0 1px 2px rgba(74,71,97,.10);}' +
      '.lok-fb-fill{position:relative;height:100%;width:0;border-radius:999px;' +
        'background:linear-gradient(90deg,#9B8BE0 0%,#B99AD8 45%,#EBA97D 100%);' +
        'transition:width 1.1s cubic-bezier(.22,1,.36,1);overflow:hidden;}' +
      '.lok-fb-fill::after{content:"";position:absolute;inset:0;border-radius:999px;' +
        'background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.55) 50%,rgba(255,255,255,0) 100%);' +
        'transform:translateX(-100%);animation:lok-fb-shimmer 2.4s ease-in-out infinite;}' +
      '.lok-fb-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
        'margin-top:7px;font-size:12px;line-height:1.3;color:#6B6880;}' +
      '.lok-fb-count{color:#5A4BB8;font-weight:600;letter-spacing:.01em;}' +
      '@keyframes lok-fb-shimmer{0%{transform:translateX(-100%);}60%,100%{transform:translateX(200%);}}' +
      '@media (prefers-reduced-motion:reduce){.lok-fb-fill{transition:none;}.lok-fb-fill::after{animation:none;display:none;}}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ─── render ────────────────────────────────────────────────────────────────
  function render(countEl, status) {
    var cap      = Math.max(0, status.cap | 0);
    var claimed  = Math.max(0, Math.min(status.claimed | 0, cap || (status.claimed | 0)));
    var remaining = (typeof status.remaining === 'number')
      ? Math.max(0, status.remaining | 0)
      : Math.max(0, cap - claimed);
    var pct = cap > 0 ? Math.min(100, Math.round((claimed / cap) * 100)) : 0;
    var full = remaining <= 0 || status.is_open === false;

    injectStyle();

    // Update the existing headline sentence to the live count.
    countEl.textContent = full
      ? ('All ' + cap + ' founding spots claimed in ' + COMMUNITY)
      : (claimed + ' of ' + cap + ' founding spots claimed in ' + COMMUNITY);

    // Build (or reuse) the progress bar, inserted directly above the headline.
    var bar = document.getElementById('lok-fb-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'lok-fb-bar';
      bar.className = 'lok-fb';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', 'Founding member spots claimed');
      bar.innerHTML =
        '<div class="lok-fb-track"><div class="lok-fb-fill"></div></div>' +
        '<div class="lok-fb-meta">' +
          '<span class="lok-fb-count"></span>' +
        '</div>';
      countEl.parentNode.insertBefore(bar, countEl);
    }

    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(cap));
    bar.setAttribute('aria-valuenow', String(claimed));

    // Label stays constant — the headline right below carries the count
    // ("Only N left" removed 2026-07-14 as redundant with it).
    bar.querySelector('.lok-fb-count').textContent = 'Founding members';

    // Fill to target. Force a reflow at width:0 first so the CSS transition
    // animates 0 → target, then set the width DIRECTLY (not via rAF, which
    // never fires in a background/hidden tab and would leave the fill empty).
    var fill = bar.querySelector('.lok-fb-fill');
    void fill.offsetWidth;
    fill.style.width = pct + '%';
  }

  // ─── data ──────────────────────────────────────────────────────────────────
  function resolveLocationId(API) {
    return API.data.locations().then(function (res) {
      var rows = (res && res.data) || [];
      var want = COMMUNITY.toLowerCase();
      for (var i = 0; i < rows.length; i++) {
        var name = (rows[i].location_name || rows[i].name || '').toLowerCase().trim();
        if (name === want) return rows[i].id;
      }
      return null;
    }).catch(function () { return null; });
  }

  function start() {
    var countEl = findCountEl();
    if (!countEl) return; // not on the homepage hero
    var API = window.LokaliSupabaseAPI;
    if (!API || !API.founding || !API.data) return;

    resolveLocationId(API).then(function (locId) {
      if (locId == null) return; // community not found → leave static text
      return API.founding.status(locId).then(function (res) {
        var s = res && res.data;
        if (!s || s.ok === false || typeof s.cap === 'undefined') return;
        render(countEl, s);
      });
    }).catch(function () { /* leave static markup untouched */ });
  }

  // The Supabase client sets window.LokaliSupabaseReady; wait for it if present.
  function boot() {
    if (window.LokaliSupabaseReady && window.LokaliSupabaseReady.then) {
      window.LokaliSupabaseReady.then(start).catch(start);
    } else {
      start();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
