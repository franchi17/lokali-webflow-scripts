/**
 * Lokali — vendor dashboard "Analytics" page (the insight page).
 *
 * Load AFTER scripts/lokali-api-client.js. Self-mounts into
 * <div id="lok-analytics-section"></div> — no-op if absent.
 *
 * Fetches (parallel): leads.analytics() (views/leads rows + totals),
 * services.getMine() + products.getMine() (to name top items), vendors.me()
 * (plan, for the tier-aware upsell). Everything is bucketed client-side.
 *
 * Renders: 3 KPIs (Storefront views, View→Lead rate, Leads → links to Leads
 * page), a 30-day daily views chart, Top services / Top products by views
 * (Phase 2 — needs page_views.item_id), and a tier-aware upgrade nudge.
 * NOT shown (Phase 3, no data yet): search appearances, visitor location,
 * search terms, category benchmark.
 *
 * See docs/vendor-leads-analytics-maintainer-guide.md for the data model.
 */
(function () {
  'use strict';

  var DAY = 24 * 60 * 60 * 1000, DAY30 = 30 * DAY;
  var INK = '#1A1829', DUSK = '#4A4761', SLATE = '#8E8BA6',
      VIOLET = '#6002EE', VIOLET_L = '#F3EBFF', ORANGE = '#FF8D00',
      GREEN = '#1D6A45', GREEN_L = '#EAFAF2', RED = '#A32D2D', RED_L = '#FDECEC',
      BORDER = '#EEEDF6', SNOW = '#F7F6FC', MIST = '#EEEDF6';

  var CSS = [
    '#lok-analytics-section{font-family:"Plus Jakarta Sans",-apple-system,sans-serif;color:' + INK + ';}',
    '#lok-analytics-section .an-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:1rem;}',
    '#lok-analytics-section .an-card{background:#fff;border:.5px solid ' + BORDER + ';border-radius:10px;padding:1.25rem;}',
    '#lok-analytics-section .an-kpi{display:flex;flex-direction:column;gap:6px;}',
    '#lok-analytics-section .an-klabel{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:' + SLATE + ';}',
    '#lok-analytics-section .an-kvalue{font-size:28px;font-weight:600;line-height:1;}',
    '#lok-analytics-section .an-kvalue small{font-size:14px;font-weight:400;}',
    '#lok-analytics-section .an-delta{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;border-radius:100px;padding:2px 8px;width:fit-content;}',
    '#lok-analytics-section .an-delta.up{color:' + GREEN + ';background:' + GREEN_L + ';}',
    '#lok-analytics-section .an-delta.down{color:' + RED + ';background:' + RED_L + ';}',
    '#lok-analytics-section .an-delta.flat{color:' + SLATE + ';background:' + MIST + ';}',
    '#lok-analytics-section .an-kdetail{font-size:11px;color:' + SLATE + ';}',
    '#lok-analytics-section .an-klink{font-size:11px;font-weight:600;color:' + VIOLET + ';text-decoration:none;}',
    '#lok-analytics-section .an-klink:hover{text-decoration:underline;}',
    '#lok-analytics-section .an-ctitle{font-size:13px;font-weight:600;margin-bottom:1.1rem;}',
    '#lok-analytics-section .an-bars{display:flex;align-items:flex-end;gap:3px;height:130px;}',
    '#lok-analytics-section .an-bcol{flex:1;display:flex;align-items:flex-end;height:100%;}',
    '#lok-analytics-section .an-bar{width:100%;border-radius:3px 3px 0 0;background:' + VIOLET_L + ';min-height:2px;position:relative;transition:background .12s;}',
    '#lok-analytics-section .an-bcol:hover .an-bar{background:' + VIOLET + ';}',
    '#lok-analytics-section .an-bar .tip{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:' + INK + ';color:#fff;font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;white-space:nowrap;z-index:5;}',
    '#lok-analytics-section .an-bcol:hover .tip{display:block;}',
    '#lok-analytics-section .an-axis{display:flex;justify-content:space-between;margin-top:8px;}',
    '#lok-analytics-section .an-axis span{font-size:10px;color:' + SLATE + ';}',
    '#lok-analytics-section .an-two{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;}',
    '#lok-analytics-section .an-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:.5px solid ' + BORDER + ';}',
    '#lok-analytics-section .an-row:last-child{border-bottom:none;padding-bottom:0;}',
    '#lok-analytics-section .an-row:first-child{padding-top:0;}',
    '#lok-analytics-section .an-rnum{width:20px;height:20px;border-radius:5px;background:' + SNOW + ';color:' + SLATE + ';font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
    '#lok-analytics-section .an-rnum.gold{background:#FEF3D6;color:#8B5E0A;}',
    '#lok-analytics-section .an-rname{font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#lok-analytics-section .an-rbarw{width:70px;height:5px;background:' + MIST + ';border-radius:100px;overflow:hidden;flex-shrink:0;}',
    '#lok-analytics-section .an-rbar{height:100%;border-radius:100px;}',
    '#lok-analytics-section .an-rval{font-size:12px;font-weight:500;color:' + DUSK + ';width:58px;text-align:right;flex-shrink:0;}',
    '#lok-analytics-section .an-empty{font-size:12.5px;color:' + SLATE + ';padding:6px 0;}',
    '#lok-analytics-section .an-up{border-radius:10px;padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;background:' + VIOLET_L + ';border:.5px solid #E5D4FD;flex-wrap:wrap;}',
    '#lok-analytics-section .an-up-t{font-size:13px;font-weight:600;}',
    '#lok-analytics-section .an-up-s{font-size:12px;color:' + DUSK + ';margin-top:2px;}',
    '#lok-analytics-section .an-up-btn{font:inherit;font-size:12px;font-weight:600;color:#fff;background:' + VIOLET + ';border:none;border-radius:8px;padding:8px 16px;cursor:pointer;text-decoration:none;}',
    '#lok-analytics-section .an-insight{background:#FFFCF0;border:.5px solid #F5E6A8;border-radius:10px;padding:.85rem 1.1rem;font-size:12px;color:#8a6d1a;line-height:1.55;margin-bottom:1rem;}',
    '#lok-analytics-section .an-insight strong{color:#6b540f;}',
    '@media(max-width:720px){#lok-analytics-section .an-grid{grid-template-columns:1fr;}#lok-analytics-section .an-two{grid-template-columns:1fr;}}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('lok-an-styles')) return;
    var s = document.createElement('style'); s.id = 'lok-an-styles'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function ts(v) { if (v == null) return 0; if (typeof v === 'number') return v; var n = Date.parse(v); return isNaN(n) ? 0 : n; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function inWin(rows, from, to) { var now = Date.now(); return rows.filter(function (r) { var d = now - ts(r.created_at); return d >= from && d < to; }).length; }
  function nameOf(item) { return item && (item.name || item.title || item.service_name || item.product_name || ('#' + item.id)); }

  function deltaChip(cur, prev, unit) {
    var d = cur - prev, cls, arrow, txt;
    if (d > 0) { cls = 'up'; arrow = '▲'; } else if (d < 0) { cls = 'down'; arrow = '▼'; } else { cls = 'flat'; arrow = '→'; }
    if (unit === 'pts') txt = (d >= 0 ? '+' : '') + d.toFixed(1) + 'pts';
    else if (prev === 0 && cur === 0) txt = 'no change';
    else if (prev === 0) txt = 'new';
    else txt = (d >= 0 ? '+' : '−') + Math.abs(Math.round(d / prev * 100)) + '%';
    var c = el('div', 'an-delta ' + cls, arrow + ' ' + txt);
    return c;
  }

  function kpiCard(label, valueHtml, deltaEl, detail) {
    var c = el('div', 'an-card'); var k = el('div', 'an-kpi');
    k.appendChild(el('div', 'an-klabel', label));
    var v = el('div', 'an-kvalue'); v.innerHTML = valueHtml; k.appendChild(v);
    if (deltaEl) k.appendChild(deltaEl);
    if (detail) { if (typeof detail === 'string') k.appendChild(el('div', 'an-kdetail', detail)); else k.appendChild(detail); }
    c.appendChild(k); return c;
  }

  function rankCard(title, rows, barColor) {
    var c = el('div', 'an-card');
    c.appendChild(el('div', 'an-ctitle', title));
    if (!rows.length) { c.appendChild(el('div', 'an-empty', 'No views yet — they’ll appear here as people open your pages.')); return c; }
    var max = rows[0].count || 1;
    rows.forEach(function (r, i) {
      var row = el('div', 'an-row');
      var num = el('div', 'an-rnum' + (i === 0 ? ' gold' : ''), String(i + 1));
      row.appendChild(num);
      row.appendChild(el('div', 'an-rname', r.name));
      var bw = el('div', 'an-rbarw'); var b = el('div', 'an-rbar');
      b.style.width = Math.round(r.count / max * 100) + '%'; b.style.background = barColor;
      bw.appendChild(b); row.appendChild(bw);
      row.appendChild(el('div', 'an-rval', r.count + (r.count === 1 ? ' view' : ' views')));
      c.appendChild(row);
    });
    return c;
  }

  // tally views by item_id for a given source, map ids → names, top N
  function topItems(views, source, items, n) {
    var byId = {};
    views.forEach(function (v) { if (v.source === source && v.item_id != null) byId[v.item_id] = (byId[v.item_id] || 0) + 1; });
    var nameById = {};
    (items || []).forEach(function (it) { if (it && it.id != null) nameById[it.id] = nameOf(it); });
    return Object.keys(byId)
      .map(function (id) { return { name: nameById[id] || ('#' + id), count: byId[id] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, n);
  }

  function dailyChart(views) {
    // last 30 days, oldest→newest
    var now = Date.now(), buckets = [];
    for (var d = 29; d >= 0; d--) buckets.push(0);
    views.forEach(function (v) { var age = Math.floor((now - ts(v.created_at)) / DAY); if (age >= 0 && age < 30) buckets[29 - age] += 1; });
    var max = Math.max.apply(null, buckets.concat([1]));
    var wrap = el('div', 'an-card');
    wrap.appendChild(el('div', 'an-ctitle', 'Storefront views — last 30 days'));
    var bars = el('div', 'an-bars');
    buckets.forEach(function (cnt, i) {
      var col = el('div', 'an-bcol');
      var bar = el('div', 'an-bar');
      bar.style.height = Math.max(2, Math.round(cnt / max * 100)) + '%';
      if (cnt === max && cnt > 0) bar.style.background = VIOLET;
      var daysAgo = 29 - i;
      var label = daysAgo === 0 ? 'today' : daysAgo + 'd ago';
      var tip = el('div', 'tip', cnt + (cnt === 1 ? ' view · ' : ' views · ') + label);
      bar.appendChild(tip); col.appendChild(bar); bars.appendChild(col);
    });
    wrap.appendChild(bars);
    var axis = el('div', 'an-axis');
    ['30d ago', '3 wks', '2 wks', 'last wk', 'today'].forEach(function (t) { axis.appendChild(el('span', null, t)); });
    wrap.appendChild(axis);
    return wrap;
  }

  function isTopTier(vendor) {
    if (!vendor) return false;
    var p = String(vendor.plan || vendor.tier || vendor.plan_name || vendor.subscription_tier || vendor.plan_tier || '').toLowerCase();
    return p.indexOf('featured') >= 0 || p.indexOf('spotlight') >= 0;
  }

  function render(mount, data, services, products, vendor) {
    var views = (data && data.views) || [];
    var inq = (data && data.inquiries) || [];
    var con = (data && data.contacts) || [];

    var views30 = inWin(views, 0, DAY30), viewsPrev = inWin(views, DAY30, 2 * DAY30);
    var leads30 = inWin(inq, 0, DAY30) + inWin(con, 0, DAY30);
    var leadsPrev = inWin(inq, DAY30, 2 * DAY30) + inWin(con, DAY30, 2 * DAY30);
    var rate = views30 ? (leads30 / views30 * 100) : 0;
    var ratePrev = viewsPrev ? (leadsPrev / viewsPrev * 100) : 0;

    mount.innerHTML = '';

    // KPIs
    var grid = el('div', 'an-grid');
    grid.appendChild(kpiCard('Storefront views', String(views30), deltaChip(views30, viewsPrev), 'vs. previous 30 days'));
    grid.appendChild(kpiCard('View → Lead rate', rate.toFixed(1) + '<small>%</small>', deltaChip(rate, ratePrev, 'pts'), 'Views that became leads'));
    var leadsLink = el('a', 'an-klink', 'See all in Leads →'); leadsLink.href = '/vendor-dashboard/leads';
    grid.appendChild(kpiCard('Leads', String(leads30), null, leadsLink));
    mount.appendChild(grid);

    // light real-data insight (peak day) — no Phase 3 benchmark data needed
    if (views30 > 0) {
      var ins = el('div', 'an-insight');
      ins.innerHTML = '<strong>' + views30 + '</strong> people viewed your storefront in the last 30 days, and <strong>' +
        rate.toFixed(0) + '%</strong> of them reached out. Adding photos and a second service is the fastest way to lift both numbers.';
      mount.appendChild(ins);
    }

    // daily chart
    mount.appendChild(dailyChart(views));

    // top items
    var topSvc = topItems(views, 'service', services, 5);
    var topProd = topItems(views, 'product', products, 5);
    var two = el('div', 'an-two');
    two.appendChild(rankCard('Top services by views', topSvc, VIOLET));
    two.appendChild(rankCard('Top products by views', topProd, ORANGE));
    mount.appendChild(two);

    // tier-aware upsell
    if (!isTopTier(vendor)) {
      var up = el('div', 'an-up');
      var ut = el('div');
      ut.appendChild(el('div', 'an-up-t', 'Get seen by more local customers'));
      ut.appendChild(el('div', 'an-up-s', 'Featured vendors appear at the top of their category with a Featured badge on every listing.'));
      up.appendChild(ut);
      var btn = el('a', 'an-up-btn', 'Upgrade to Featured'); btn.href = '/pricing';
      up.appendChild(btn);
      mount.appendChild(up);
    }
  }

  function unwrap(res) { return res && !res.error ? (res.data != null ? res.data : res) : null; }
  function asArray(x) { if (Array.isArray(x)) return x; if (x && Array.isArray(x.items)) return x.items; return []; }

  function init() {
    var mount = document.getElementById('lok-analytics-section');
    if (!mount) return;
    if (!window.LokaliAPI || !window.LokaliAPI.leads || typeof window.LokaliAPI.leads.analytics !== 'function') {
      console.warn('[lokali-analytics] LokaliAPI.leads.analytics not available'); return;
    }
    injectStyles();
    var API = window.LokaliAPI;
    var calls = [
      API.leads.analytics(),
      API.services && API.services.getMine ? API.services.getMine() : Promise.resolve(null),
      API.products && API.products.getMine ? API.products.getMine() : Promise.resolve(null),
      API.vendors && API.vendors.me ? API.vendors.me() : Promise.resolve(null)
    ];
    Promise.all(calls).then(function (r) {
      var data = unwrap(r[0]);
      if (!data) {
        mount.innerHTML = '';
        var c = el('div', 'an-card'); c.appendChild(el('div', 'an-empty', 'Analytics are taking a moment to load. Refresh in a few seconds.'));
        mount.appendChild(c); return;
      }
      render(mount, data, asArray(unwrap(r[1])), asArray(unwrap(r[2])), unwrap(r[3]));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
