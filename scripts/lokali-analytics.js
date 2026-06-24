/**
 * Lokali — vendor dashboard "Analytics" page.
 *
 * Load AFTER scripts/lokali-api-client.js (needs window.LokaliAPI.leads +
 * an auth token set). Self-mounting: renders into <div id="lok-analytics-section">
 * — add that one empty div on the analytics page in Webflow. No-op if absent.
 *
 * Pulls GET vendor/me/analytics (all-time totals + last 180 days of raw
 * inquiry / contact-click / view rows) and buckets everything client-side into:
 *   - this-month KPI cards (rolling 30 days) with month-over-month deltas
 *   - a views -> contacts -> inquiries conversion funnel
 *   - a 6-month trend chart (inline SVG, no external chart lib)
 *   - a contact-channel breakdown (last 30 days)
 */
(function () {
  'use strict';

  var DAY30 = 30 * 24 * 60 * 60 * 1000;
  var BUCKETS = 6; // rolling 30-day months shown in the trend

  var INK = '#1A1530', PURPLE = '#6002EE', VIOLET = '#B794F6',
      ORANGE = '#ff8d00', ORANGE_DK = '#e07b00',
      SUB = '#6B6680', POS = '#0F9D58', NEG = '#D93025';

  // Per-metric accent colors so the dashboard isn't all one hue.
  var C_VIEWS = ORANGE, C_CONTACTS = PURPLE, C_INQUIRIES = VIOLET;

  var CHANNEL_LABELS = {
    call: 'Calls', sms: 'Texts', whatsapp: 'WhatsApp',
    email: 'Emails', instagram: 'Instagram', website: 'Website'
  };

  var CSS = [
    '#lok-analytics-section{font-family:"Plus Jakarta Sans",sans-serif;color:' + INK + ';}',
    '.lok-an-card{background:#fff;border:1px solid #ECEAF3;border-radius:14px;padding:22px;margin-bottom:16px;}',
    '.lok-an-h{font-size:17px;font-weight:700;margin:0 0 2px;}',
    '.lok-an-sub{font-size:12.5px;color:' + SUB + ';margin:0 0 16px;}',
    '.lok-an-kpis{display:flex;flex-wrap:wrap;gap:12px;}',
    '.lok-an-kpi{flex:1 1 150px;min-width:150px;background:#F7F6FC;border-radius:12px;padding:16px;}',
    '.lok-an-kpi .n{font-size:28px;font-weight:700;color:' + PURPLE + ';line-height:1.1;}',
    '.lok-an-kpi .l{font-size:12px;color:' + SUB + ';font-weight:600;margin-top:2px;}',
    '.lok-an-delta{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:700;margin-top:8px;border-radius:100px;padding:2px 9px;}',
    '.lok-an-delta.up{color:' + POS + ';background:rgba(15,157,88,.10);}',
    '.lok-an-delta.down{color:' + NEG + ';background:rgba(217,48,37,.10);}',
    '.lok-an-delta.flat{color:' + SUB + ';background:#EFEDF6;}',
    '.lok-an-funnel{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;}',
    '.lok-an-fstep{flex:1 1 120px;min-width:120px;background:#F7F6FC;border-radius:12px;padding:14px 16px;position:relative;}',
    '.lok-an-fstep .n{font-size:22px;font-weight:700;color:' + INK + ';}',
    '.lok-an-fstep .l{font-size:12px;color:' + SUB + ';font-weight:600;}',
    '.lok-an-fconv{font-size:11px;color:' + PURPLE + ';font-weight:700;margin-top:4px;}',
    '.lok-an-chartwrap{width:100%;overflow:hidden;}',
    '.lok-an-legend{display:flex;gap:16px;font-size:12px;color:' + SUB + ';margin-bottom:10px;}',
    '.lok-an-legend span{display:inline-flex;align-items:center;gap:6px;}',
    '.lok-an-dot{width:10px;height:10px;border-radius:3px;display:inline-block;}',
    '.lok-an-bars{display:flex;flex-direction:column;gap:9px;}',
    '.lok-an-bar-row{display:flex;align-items:center;gap:10px;font-size:12.5px;}',
    '.lok-an-bar-lab{flex:0 0 78px;color:' + SUB + ';font-weight:600;}',
    '.lok-an-bar-track{flex:1;background:#F0EEF7;border-radius:100px;height:14px;overflow:hidden;}',
    '.lok-an-bar-fill{height:100%;background:' + PURPLE + ';border-radius:100px;min-width:2px;}',
    '.lok-an-bar-val{flex:0 0 34px;text-align:right;font-weight:700;color:' + INK + ';}',
    '.lok-an-empty{padding:16px 0;text-align:center;color:' + SUB + ';font-size:13.5px;}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('lok-an-styles')) return;
    var s = document.createElement('style');
    s.id = 'lok-an-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function ts(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    var n = Date.parse(v);
    return isNaN(n) ? 0 : n;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Which rolling-30-day bucket a timestamp falls in (0 = most recent 30 days).
  // Returns -1 if older than the window we chart.
  function bucketOf(t, now) {
    var i = Math.floor((now - t) / DAY30);
    return (i >= 0 && i < BUCKETS) ? i : -1;
  }

  // Build BUCKETS counts (index 0 = oldest, last = most recent) for a list of rows.
  function bucketCounts(rows, now) {
    var out = [];
    for (var i = 0; i < BUCKETS; i++) out.push(0);
    rows.forEach(function (r) {
      var b = bucketOf(ts(r.created_at), now);
      if (b >= 0) out[BUCKETS - 1 - b] += 1; // reverse so newest is last
    });
    return out;
  }

  function deltaChip(cur, prev) {
    var d = cur - prev;
    var cls, arrow, label;
    if (d > 0) { cls = 'up'; arrow = '↑'; }
    else if (d < 0) { cls = 'down'; arrow = '↓'; }
    else { cls = 'flat'; arrow = '→'; }
    if (prev === 0 && cur === 0) label = 'no change';
    else if (prev === 0) label = 'new';
    else label = Math.round(Math.abs(d) / prev * 100) + '%';
    var chip = el('div', 'lok-an-delta ' + cls, arrow + ' ' + label);
    chip.title = 'vs. previous 30 days (' + prev + ')';
    return chip;
  }

  function kpi(value, label, prev, color) {
    var k = el('div', 'lok-an-kpi');
    var n = el('div', 'n', String(value));
    if (color) n.style.color = color;
    k.appendChild(n);
    k.appendChild(el('div', 'l', label));
    k.appendChild(deltaChip(value, prev));
    return k;
  }

  function funnelStep(value, label, conv, color) {
    var s = el('div', 'lok-an-fstep');
    var n = el('div', 'n', String(value));
    if (color) n.style.color = color;
    s.appendChild(n);
    s.appendChild(el('div', 'l', label));
    if (conv != null) {
      var c = el('div', 'lok-an-fconv', conv + '% convert');
      if (color) c.style.color = color;
      s.appendChild(c);
    }
    return s;
  }

  function pct(part, whole) {
    if (!whole) return 0;
    return Math.round(part / whole * 100);
  }

  // Inline-SVG grouped bar chart: contacts + inquiries per month, with a views
  // line overlaid on its own scale. Pure SVG so there's no chart-lib dependency.
  function trendSVG(views, contacts, inquiries) {
    var W = 620, H = 200, padL = 30, padR = 30, padT = 16, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var n = BUCKETS, slot = plotW / n;

    var leadsMax = 1, viewsMax = 1, i;
    for (i = 0; i < n; i++) {
      leadsMax = Math.max(leadsMax, contacts[i] + inquiries[i]);
      viewsMax = Math.max(viewsMax, views[i]);
    }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Leads and views over the last 6 months">';
    // baseline
    svg += '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="#ECEAF3" stroke-width="1"/>';

    var barW = Math.min(26, slot * 0.42);
    var viewPts = [];
    for (i = 0; i < n; i++) {
      var cx = padL + slot * i + slot / 2;
      var leadTot = contacts[i] + inquiries[i];
      var hC = (contacts[i] / leadsMax) * plotH;
      var hI = (inquiries[i] / leadsMax) * plotH;
      var x = cx - barW / 2;
      var yBase = padT + plotH;
      // contacts (bottom segment)
      if (contacts[i] > 0) {
        svg += '<rect x="' + x.toFixed(1) + '" y="' + (yBase - hC).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hC.toFixed(1) + '" rx="3" fill="' + PURPLE + '"/>';
      }
      // inquiries (stacked on top)
      if (inquiries[i] > 0) {
        svg += '<rect x="' + x.toFixed(1) + '" y="' + (yBase - hC - hI).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hI.toFixed(1) + '" rx="3" fill="' + VIOLET + '"/>';
      }
      if (leadTot > 0) {
        svg += '<text x="' + cx.toFixed(1) + '" y="' + (yBase - hC - hI - 5).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="700" fill="' + INK + '">' + leadTot + '</text>';
      }
      // x label: months ago (newest = "now")
      var lab = (i === n - 1) ? 'now' : (n - 1 - i) + 'mo';
      svg += '<text x="' + cx.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="10.5" fill="' + SUB + '">' + lab + '</text>';
      // views point (own scale)
      var vy = padT + plotH - (views[i] / viewsMax) * plotH;
      viewPts.push(cx.toFixed(1) + ',' + vy.toFixed(1));
    }
    // views line (orange, so it reads clearly against the purple/violet bars)
    svg += '<polyline points="' + viewPts.join(' ') + '" fill="none" stroke="' + C_VIEWS + '" stroke-width="2.5" stroke-linejoin="round"/>';
    for (i = 0; i < n; i++) {
      var p = viewPts[i].split(',');
      svg += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.8" fill="' + ORANGE_DK + '"/>';
    }
    svg += '</svg>';
    return svg;
  }

  function render(mount, data) {
    var now = Date.now();
    var inquiries = (data && Array.isArray(data.inquiries)) ? data.inquiries : [];
    var contacts = (data && Array.isArray(data.contacts)) ? data.contacts : [];
    var views = (data && Array.isArray(data.views)) ? data.views : [];
    var totals = (data && data.totals) || {};

    // rolling-30-day buckets (newest last)
    var bV = bucketCounts(views, now);
    var bC = bucketCounts(contacts, now);
    var bI = bucketCounts(inquiries, now);
    var last = BUCKETS - 1, prev = BUCKETS - 2;
    var vNow = bV[last], vPrev = bV[prev];
    var cNow = bC[last], cPrev = bC[prev];
    var iNow = bI[last], iPrev = bI[prev];

    mount.innerHTML = '';

    // --- KPI card (this month vs last) ---
    var k = el('div', 'lok-an-card');
    k.appendChild(el('h3', 'lok-an-h', 'This month'));
    k.appendChild(el('p', 'lok-an-sub', 'Activity on your Lokali listing over the last 30 days, compared to the 30 days before.'));
    var kpis = el('div', 'lok-an-kpis');
    kpis.appendChild(kpi(vNow, 'Listing views', vPrev, C_VIEWS));
    kpis.appendChild(kpi(cNow, 'Contact clicks', cPrev, C_CONTACTS));
    kpis.appendChild(kpi(iNow, 'Inquiries', iPrev, C_INQUIRIES));
    k.appendChild(kpis);
    mount.appendChild(k);

    // --- Funnel card ---
    var f = el('div', 'lok-an-card');
    f.appendChild(el('h3', 'lok-an-h', 'Your funnel (last 30 days)'));
    f.appendChild(el('p', 'lok-an-sub', 'How many viewers go on to contact you and send an inquiry.'));
    var funnel = el('div', 'lok-an-funnel');
    funnel.appendChild(funnelStep(vNow, 'Views', null, C_VIEWS));
    funnel.appendChild(funnelStep(cNow, 'Contacts', pct(cNow, vNow), C_CONTACTS));
    funnel.appendChild(funnelStep(iNow, 'Inquiries', pct(iNow, cNow), C_INQUIRIES));
    f.appendChild(funnel);
    mount.appendChild(f);

    // --- Trend card ---
    var t = el('div', 'lok-an-card');
    t.appendChild(el('h3', 'lok-an-h', 'Last 6 months'));
    var legend = el('div', 'lok-an-legend');
    function leg(color, label) {
      var s = el('span');
      var d = el('span', 'lok-an-dot'); d.style.background = color;
      s.appendChild(d); s.appendChild(document.createTextNode(label));
      return s;
    }
    legend.appendChild(leg(C_CONTACTS, 'Contact clicks'));
    legend.appendChild(leg(C_INQUIRIES, 'Inquiries'));
    legend.appendChild(leg(C_VIEWS, 'Views'));
    t.appendChild(legend);
    var cw = el('div', 'lok-an-chartwrap');
    cw.innerHTML = trendSVG(bV, bC, bI);
    t.appendChild(cw);
    mount.appendChild(t);

    // --- Channel breakdown (last 30 days) ---
    var ch = el('div', 'lok-an-card');
    ch.appendChild(el('h3', 'lok-an-h', 'How customers reach out'));
    ch.appendChild(el('p', 'lok-an-sub', 'Contact clicks by channel over the last 30 days.'));
    var byType = {};
    contacts.forEach(function (ev) {
      if (now - ts(ev.created_at) >= DAY30) return;
      var ty = ev.event_type || 'other';
      byType[ty] = (byType[ty] || 0) + 1;
    });
    var keys = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; });
    if (!keys.length) {
      ch.appendChild(el('div', 'lok-an-empty',
        'No contact clicks yet — when someone taps call, text or email on your listing, it shows up here.'));
    } else {
      var max = byType[keys[0]] || 1;
      var bars = el('div', 'lok-an-bars');
      keys.forEach(function (ty) {
        var row = el('div', 'lok-an-bar-row');
        row.appendChild(el('div', 'lok-an-bar-lab', CHANNEL_LABELS[ty] || ty));
        var track = el('div', 'lok-an-bar-track');
        var fill = el('div', 'lok-an-bar-fill');
        fill.style.width = Math.round(byType[ty] / max * 100) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(el('div', 'lok-an-bar-val', String(byType[ty])));
        bars.appendChild(row);
      });
      ch.appendChild(bars);
    }
    mount.appendChild(ch);

    // --- All-time footnote ---
    var foot = el('p', 'lok-an-sub');
    foot.style.textAlign = 'center';
    foot.style.margin = '4px 0 0';
    foot.textContent = 'All time: ' + (totals.views || 0) + ' views · ' +
      (totals.contacts || 0) + ' contact clicks · ' + (totals.inquiries || 0) + ' inquiries';
    mount.appendChild(foot);
  }

  function init() {
    var mount = document.getElementById('lok-analytics-section');
    if (!mount) return; // page doesn't have the panel — no-op
    if (!window.LokaliAPI || !window.LokaliAPI.leads || typeof window.LokaliAPI.leads.analytics !== 'function') {
      console.warn('[lokali-analytics] LokaliAPI.leads.analytics not available');
      return;
    }
    injectStyles();
    window.LokaliAPI.leads.analytics().then(function (res) {
      if (!res || res.error) {
        console.warn('[lokali-analytics] failed to load analytics:', res && res.error);
        mount.innerHTML = '';
        var c = el('div', 'lok-an-card');
        c.appendChild(el('div', 'lok-an-empty', 'Analytics are taking a moment to load. Refresh in a few seconds.'));
        mount.appendChild(c);
        return;
      }
      render(mount, res.data);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
