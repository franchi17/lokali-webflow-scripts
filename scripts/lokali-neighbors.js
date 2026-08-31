/**
 * Lokali — Homepage "Meet your neighbors" strip (#162 person-first follow-ups).
 *
 * Injects a section between the hero and "How It Works" (`.section-3`) with
 * up to 4 live publish-ready vendor cards on a deterministic weekly rotation
 * (Monday, America/Chicago — same cadence as the marketing-tools rotation).
 * Every visitor sees the same set for the week; no server state is involved:
 * the week key seeds a client-side shuffle of the public vendor list.
 *
 * Data = the site-wide adapter (`window.LokaliAPI`): vendors.list() is
 * publish-ready-gated server-side, covers() resolves card photos (never the
 * logo), data.locations() maps area chips. Failure/empty = NOTHING is
 * injected — the homepage looks exactly as it does today (spotlight-home's
 * empty-state contract).
 *
 * SAFETY: business_name / tagline / description are VENDOR-AUTHORED — all
 * text lands via textContent (no innerHTML interpolation of vendor data).
 *
 * Loads on the homepage via a PINNED page-level tag (@1.4.N). Requires
 * lokali-api-adapter.js (site-wide footer). Keep this file byte-identical in
 * scripts/ and lokali-webflow-scripts/scripts/.
 */
(function () {
  'use strict';

  var STYLE_ID = 'lok-nb-style';
  var MAX_CARDS = 4;

  // Storefronts never shown in the strip (F 2026-08-31: Pancha Ventures is the
  // founding-counter anchor/test fixture, not a discovery surface). Overridable
  // per-page via window.LOKALI_NEIGHBORS_EXCLUDE = ['slug', ...].
  var EXCLUDE_SLUGS = (Array.isArray(window.LOKALI_NEIGHBORS_EXCLUDE) && window.LOKALI_NEIGHBORS_EXCLUDE.length)
    ? window.LOKALI_NEIGHBORS_EXCLUDE.map(String)
    : ['pancha-ventures'];

  // Cover fallback palettes (match the-market's branded gradient fallbacks).
  var FALLBACK = [
    { bg: 'linear-gradient(135deg,#ECE8F8 0%,#D4AAFD 100%)', chipBg: '#F3EBFF', chipFg: '#6002EE', av: '#6002EE' },
    { bg: 'linear-gradient(135deg,#FFF3EA 0%,#FFC9A1 100%)', chipBg: '#FFF3EA', chipFg: '#B85C2B', av: '#B85C2B' },
    { bg: 'linear-gradient(135deg,#E7F3EC 0%,#A9D8BE 100%)', chipBg: '#EAFAF2', chipFg: '#1D6A45', av: '#1D6A45' },
    { bg: 'linear-gradient(135deg,#EEF3F8 0%,#A9C4D8 100%)', chipBg: '#EEF3F8', chipFg: '#2C5470', av: '#2C5470' }
  ];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.lok-nb{font-family:"Plus Jakarta Sans",sans-serif;background:#F3EBFF;padding:56px 20px;}' +
      '.lok-nb-inner{max-width:1160px;margin:0 auto;}' +
      '.lok-nb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:26px;flex-wrap:wrap;}' +
      '.lok-nb-title{font-size:32px;font-weight:800;letter-spacing:-.6px;color:#1A1829;margin:0;}' +
      '.lok-nb-sub{font-size:16px;color:#4A4761;margin:6px 0 0;}' +
      '.lok-nb-all{font-size:15px;font-weight:600;color:#6002EE;text-decoration:none;white-space:nowrap;}' +
      '.lok-nb-all:hover{color:#4B02BB;}' +
      '.lok-nb-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;}' +
      '@media(max-width:991px){.lok-nb-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}' +
      '@media(max-width:560px){.lok-nb-grid{grid-template-columns:1fr;max-width:420px;margin:0 auto;}}' +
      '.lok-nb-card{display:block;background:#fff;border:1px solid #EEEDF6;border-radius:18px;overflow:hidden;' +
        'box-shadow:0 10px 26px rgba(26,24,41,.07);text-decoration:none;transition:transform .2s ease,box-shadow .2s ease;}' +
      '.lok-nb-card:hover{transform:translateY(-3px);box-shadow:0 16px 34px rgba(26,24,41,.11);}' +
      '.lok-nb-cover{height:118px;background-size:cover;background-position:center;}' +
      '.lok-nb-body{padding:0 16px 16px;}' +
      '.lok-nb-avatar{width:52px;height:52px;border-radius:50%;border:3px solid #fff;margin-top:-26px;' +
        'background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;' +
        'font-size:17px;font-weight:700;color:#fff;}' +
      '.lok-nb-name{margin-top:8px;font-size:16px;font-weight:700;color:#1A1829;}' +
      '.lok-nb-line{font-size:13px;color:#4A4761;margin-top:2px;overflow:hidden;text-overflow:ellipsis;' +
        'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}' +
      '.lok-nb-chip{display:inline-block;margin-top:9px;font-size:11px;font-weight:600;border-radius:999px;padding:4px 10px;}' +
      '.lok-nb-note{margin-top:24px;text-align:center;font-size:13px;color:#8E8BA6;}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- weekly deterministic rotation --------------------------------------
  // Week key = the Monday of the current week in America/Chicago, "YYYY-MM-DD".
  function weekKey() {
    var parts, y, m, d;
    try {
      parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()).split('-');
      y = +parts[0]; m = +parts[1]; d = +parts[2];
    } catch (e) {
      var n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1; d = n.getDate();
    }
    var dt = new Date(Date.UTC(y, m - 1, d));
    var dow = dt.getUTCDay();                       // 0 Sun .. 6 Sat
    dt.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7)); // back to Monday
    return dt.toISOString().slice(0, 10);
  }

  function hashStr(s) {
    var h = 1779033703;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 1831565813) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weeklyPick(vendors) {
    var rnd = mulberry32(hashStr(weekKey()));
    var arr = vendors.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr.slice(0, MAX_CARDS);
  }

  // ---- rendering ----------------------------------------------------------
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/);
    var a = (p[0] || '')[0] || '';
    var b = (p.length > 1 ? p[p.length - 1] : '')[0] || '';
    return (a + b).toUpperCase() || 'L';
  }

  function vendorHref(v) {
    var slug = String(v.slug || '').trim();
    return slug ? ('/' + encodeURIComponent(slug)) : ('/vendor?id=' + encodeURIComponent(v.id));
  }

  function card(v, idx, locById, covers) {
    var pal = FALLBACK[idx % FALLBACK.length];
    var a = document.createElement('a');
    a.className = 'lok-nb-card';
    a.href = vendorHref(v);

    var cover = document.createElement('div');
    cover.className = 'lok-nb-cover';
    var cv = covers && covers[v.id];
    if (cv && cv.url) {
      cover.style.backgroundImage = 'url("' + String(cv.url).replace(/"/g, '%22') + '")';
      // fx/fy arrive as PERCENT values (0-100), matching browse's objectPosition use.
      if (typeof cv.fx === 'number' && typeof cv.fy === 'number') cover.style.backgroundPosition = cv.fx + '% ' + cv.fy + '%';
    } else {
      cover.style.background = pal.bg;
    }
    a.appendChild(cover);

    var body = document.createElement('div');
    body.className = 'lok-nb-body';

    var av = document.createElement('div');
    av.className = 'lok-nb-avatar';
    var photo = String(v.profile_photo || '').trim();
    if (photo) {
      av.style.backgroundImage = 'url("' + photo.replace(/"/g, '%22') + '")';
      av.style.backgroundColor = '#EEEDF6';
    } else {
      av.style.backgroundColor = pal.av;
      av.textContent = initials(v.business_name);
    }
    body.appendChild(av);

    var name = document.createElement('div');
    name.className = 'lok-nb-name';
    name.textContent = v.business_name || 'Local business';
    body.appendChild(name);

    var line = document.createElement('div');
    line.className = 'lok-nb-line';
    line.textContent = String(v.business_tagline || v.business_description || '').trim();
    body.appendChild(line);

    var locIds = Array.isArray(v.locations_id) ? v.locations_id : (v.locations_id != null ? [v.locations_id] : []);
    var locName = '';
    for (var i = 0; i < locIds.length; i++) { if (locById[locIds[i]]) { locName = locById[locIds[i]]; break; } }
    if (locName) {
      var chip = document.createElement('span');
      chip.className = 'lok-nb-chip';
      chip.style.background = pal.chipBg;
      chip.style.color = pal.chipFg;
      chip.textContent = locName;
      body.appendChild(chip);
    }

    a.appendChild(body);
    return a;
  }

  function buildSection(picks, locById, covers) {
    var sec = document.createElement('section');
    sec.className = 'lok-nb';
    sec.id = 'lok-neighbors';

    var inner = document.createElement('div');
    inner.className = 'lok-nb-inner';

    var head = document.createElement('div');
    head.className = 'lok-nb-head';
    var hwrap = document.createElement('div');
    var h = document.createElement('h2');
    h.className = 'lok-nb-title';
    h.textContent = 'Meet your neighbors';
    var sub = document.createElement('p');
    sub.className = 'lok-nb-sub';
    sub.textContent = 'A few of the people behind the work near you.';
    hwrap.appendChild(h); hwrap.appendChild(sub);
    var all = document.createElement('a');
    all.className = 'lok-nb-all';
    all.href = '/the-market';
    all.textContent = 'See everyone in the Market →';
    head.appendChild(hwrap); head.appendChild(all);
    inner.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'lok-nb-grid';
    for (var i = 0; i < picks.length; i++) grid.appendChild(card(picks[i], i, locById, covers));
    inner.appendChild(grid);

    var note = document.createElement('p');
    note.className = 'lok-nb-note';
    note.textContent = 'New faces rotate in every Monday.';
    inner.appendChild(note);

    sec.appendChild(inner);
    return sec;
  }

  function insertSection(sec) {
    // Directly below the hero: before the "What is Lokali" section
    // (`.wi-section`), falling back to before "How It Works" (`.section-3`,
    // the spotlight-home anchor). No anchor = nothing is injected.
    var anchor = document.querySelector('.wi-section') || document.querySelector('.section-3');
    if (!anchor || !anchor.parentNode) return false;
    anchor.parentNode.insertBefore(sec, anchor);
    return true;
  }

  // ---- boot ---------------------------------------------------------------
  function apiReady(tries) {
    if (window.LokaliAPI && window.LokaliAPI.vendors && window.LokaliAPI.data) return Promise.resolve(window.LokaliAPI);
    if (tries <= 0) return Promise.reject(new Error('LokaliAPI not available'));
    return new Promise(function (resolve, reject) {
      setTimeout(function () { apiReady(tries - 1).then(resolve, reject); }, 250);
    });
  }

  function start() {
    if (!document.querySelector('.section-3')) return; // homepage anchor only
    apiReady(40).then(function (api) {
      return Promise.all([
        api.vendors.list({ page: 1, per_page: 100 }),
        api.data.locations()
      ]).then(function (res) {
        var vout = res[0];
        if (!vout || vout.error) return;
        var items = (vout.data && vout.data.items) || [];
        var vendors = items.filter(function (v) {
          return v && v.is_active !== false &&
            EXCLUDE_SLUGS.indexOf(String(v.slug || '')) === -1;
        });
        if (!vendors.length) return; // empty = homepage unchanged
        var locById = {};
        try {
          var locs = (res[1] && res[1].data && (res[1].data.items || res[1].data)) || [];
          for (var i = 0; i < locs.length; i++) {
            var l = locs[i];
            var id = l.id != null ? l.id : l.location_id;
            if (id != null) locById[id] = l.name || l.location_name || l.title || '';
          }
        } catch (e) {}
        var picks = weeklyPick(vendors);
        var ids = picks.map(function (v) { return v.id; });
        // Covers are best-effort (browse contract): fallback gradients paint
        // immediately; the section renders once, with whatever covers landed.
        var coverP = (api.vendors && typeof api.vendors.covers === 'function')
          ? api.vendors.covers(ids).then(function (o) { return (o && o.data && o.data.covers) || {}; }, function () { return {}; })
          : Promise.resolve({});
        return coverP.then(function (covers) {
          injectStyle();
          insertSection(buildSection(picks, locById, covers));
        });
      });
    }).catch(function (e) {
      try { console.warn('[lokali-neighbors] skipped:', e && e.message); } catch (x) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
