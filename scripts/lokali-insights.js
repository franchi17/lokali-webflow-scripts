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
 * page), the Storefront checkup card (2026-09-16: field-based list of what
 * shoppers look for that the storefront lacks; see buildCheckup), a daily/weekly views chart with a range selector (30d free; 90d and
 * 6mo are a Pro/Featured perk — the server clamps free vendors to 60d of
 * rows and reports history_days, so the lock here mirrors real enforcement),
 * Top services / Top products by views (Phase 2 — needs page_views.item_id),
 * and a tier-aware upgrade nudge.
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
    // 4 KPI cards → one row of 4 on desktop, 2×2 on middling widths, 1-wide on
    // phones (was repeat(3,1fr): 3 across + a stray 4th on its own row).
    // 5 KPI cards (views, lead rate, leads, payment clicks, shares): one row of
    // 5 on desktop, 3+2 on middling widths, 1-wide on phones. (Was 4 cols → the
    // Shares card sat alone on a second row — F 2026-08-22.)
    '#lok-analytics-section .an-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:1rem;}',
    '@media(max-width:1100px) and (min-width:721px){#lok-analytics-section .an-grid{grid-template-columns:1fr 1fr 1fr;}}',
    '#lok-analytics-section .an-card{background:#fff;border:.5px solid ' + BORDER + ';border-radius:10px;padding:1.25rem;}',
    '#lok-analytics-section .an-kpi{display:flex;flex-direction:column;gap:6px;}',
    '#lok-analytics-section .an-klabel{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:' + SLATE + ';white-space:nowrap;}',
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
    // chart header row: title left, range tabs right (wraps on phones)
    '#lok-analytics-section .an-chead{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:1.1rem;}',
    '#lok-analytics-section .an-chead .an-ctitle{margin-bottom:0;}',
    '#lok-analytics-section .an-tabs{display:flex;gap:3px;background:' + SNOW + ';border-radius:8px;padding:3px;}',
    '#lok-analytics-section .an-tab{font-family:inherit;font-size:11px;font-weight:600;color:' + DUSK + ';background:transparent;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap;}',
    '#lok-analytics-section .an-tab.on{background:#fff;color:' + VIOLET + ';box-shadow:0 1px 2px rgba(26,24,41,.10);}',
    '#lok-analytics-section .an-tab.locked{color:' + SLATE + ';}',
    '#lok-analytics-section .an-lock-note{margin-top:12px;background:' + VIOLET_L + ';border:.5px solid #E5D4FD;border-radius:8px;padding:8px 12px;font-size:12px;color:' + DUSK + ';}',
    '#lok-analytics-section .an-lock-note a{color:' + VIOLET + ';font-weight:600;text-decoration:none;}',
    '#lok-analytics-section .an-lock-note a:hover{text-decoration:underline;}',
    '#lok-analytics-section .an-bars{display:flex;align-items:flex-end;gap:3px;height:130px;}',
    '#lok-analytics-section .an-bcol{flex:1;display:flex;align-items:flex-end;height:100%;}',
    '#lok-analytics-section .an-bar{width:100%;border-radius:3px 3px 0 0;background:' + VIOLET_L + ';min-height:2px;position:relative;transition:background .12s;}',
    '#lok-analytics-section .an-bcol:hover .an-bar{background:' + VIOLET + ';}',
    '#lok-analytics-section .an-bar .tip{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:' + VIOLET + ';color:#fff;font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;white-space:nowrap;z-index:5;}',
    '#lok-analytics-section .an-bcol:hover .tip{display:block;}',
    '#lok-analytics-section .an-axis{display:flex;justify-content:space-between;margin-top:8px;}',
    '#lok-analytics-section .an-axis span{font-size:10px;color:' + SLATE + ';}',
    // margin-top separates the Top-services/products row from the storefront
    // views chart above it (they sat flush — "squished", Francesca 2026-07-09).
    '#lok-analytics-section .an-two{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:20px;margin-bottom:1rem;}',
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
    // Insight line: was a yellow note (#FFFCF0/#8a6d1a); F 2026-09-17 'not a fan of the yellow' -> the soft violet tint the dashboard uses.
    '#lok-analytics-section .an-insight{background:' + VIOLET_L + ';border:.5px solid #E5D4FD;border-radius:10px;padding:.85rem 1.1rem;font-size:12px;color:' + DUSK + ';line-height:1.55;margin-bottom:1rem;}',
    '#lok-analytics-section .an-insight strong{color:' + INK + ';}',
    // Storefront checkup (2026-09-16). Design notes in the mockup artifact:
    // endowed progress (meter shows credit already earned), goal gradient
    // (count remaining, not a percent), Hick's law (3 open items by default),
    // descriptive link labels (WCAG 2.4.4), 44px touch targets on phones.
    '#lok-analytics-section .an-ck{background:#fff;border:.5px solid #E5D4FD;border-radius:10px;padding:1.25rem;margin-bottom:1rem;font-family:"Plus Jakarta Sans",sans-serif;}',
    '#lok-analytics-section .an-ck-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;}',
    '#lok-analytics-section .an-ck-head .an-ctitle{margin-bottom:0;}',
    '#lok-analytics-section .an-ck-sub{font-size:12px;color:' + DUSK + ';margin-top:2px;max-width:62ch;}',
    '#lok-analytics-section .an-ck-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;border-radius:100px;padding:4px 10px;background:' + VIOLET_L + ';color:' + VIOLET + ';white-space:nowrap;}',
    '#lok-analytics-section .an-ck-pill.ok{background:' + GREEN_L + ';color:' + GREEN + ';}',
    '#lok-analytics-section .an-ck-pill svg{width:11px;height:11px;}',
    '#lok-analytics-section .an-ck-meter{height:5px;background:' + MIST + ';border-radius:100px;overflow:hidden;margin-bottom:14px;}',
    '#lok-analytics-section .an-ck-meter>div{height:100%;background:' + VIOLET + ';border-radius:100px;}',
    '#lok-analytics-section .an-ck-meter.ok>div{background:' + GREEN + ';}',
    '#lok-analytics-section .an-ck-list{list-style:none;margin:0;padding:0;}',
    '#lok-analytics-section .an-ck-row{display:grid;grid-template-columns:22px 1fr auto;gap:12px;align-items:start;padding:10px 0;border-bottom:.5px solid ' + BORDER + ';}',
    '#lok-analytics-section .an-ck-row:first-child{padding-top:0;}',
    '#lok-analytics-section .an-ck-row:last-child{border-bottom:none;padding-bottom:0;}',
    '#lok-analytics-section .an-ck-ico{width:20px;height:20px;margin-top:1px;color:' + SLATE + ';}',
    '#lok-analytics-section .an-ck-row.done .an-ck-ico{color:' + GREEN + ';}',
    '#lok-analytics-section .an-ck-t{font-size:13px;font-weight:600;color:' + INK + ';}',
    '#lok-analytics-section .an-ck-row.done .an-ck-t{font-weight:500;color:' + DUSK + ';}',
    '#lok-analytics-section .an-ck-w{font-size:12px;color:#6E6A85;margin-top:1px;max-width:62ch;line-height:1.5;}',
    '#lok-analytics-section .an-ck-fix{display:inline-flex;align-items:center;min-height:32px;font-size:12px;font-weight:600;color:' + VIOLET + ';text-decoration:none;white-space:nowrap;padding:4px 12px;border:1px solid #E5D4FD;border-radius:8px;background:#fff;}',
    '#lok-analytics-section .an-ck-fix:hover{background:' + VIOLET_L + ';}',
    '#lok-analytics-section .an-ck-fix:focus-visible,#lok-analytics-section .an-ck-more:focus-visible{outline:2px solid ' + VIOLET + ';outline-offset:2px;}',
    '#lok-analytics-section .an-ck-more{margin-top:10px;font:inherit;font-size:12px;font-weight:600;color:' + DUSK + ';background:none;border:none;padding:6px 0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:32px;}',
    '#lok-analytics-section .an-ck-more svg{width:12px;height:12px;transition:transform .12s;}',
    '#lok-analytics-section .an-ck-more[aria-expanded="false"] svg{transform:rotate(-90deg);}',
    '#lok-analytics-section .an-ck-done{margin-top:6px;border-top:.5px dashed ' + BORDER + ';padding-top:10px;}',
    '#lok-analytics-section .an-ck-plan{font-size:11px;color:' + SLATE + ';margin-top:12px;}',
    '@media(max-width:720px){#lok-analytics-section .an-ck-row{grid-template-columns:22px 1fr;}#lok-analytics-section .an-ck-fix{grid-column:2;justify-self:start;min-height:44px;padding:8px 14px;}#lok-analytics-section .an-ck-more{min-height:44px;}}',
    '@media(prefers-reduced-motion:reduce){#lok-analytics-section .an-ck-more svg{transition:none;}}',
    '@media(max-width:720px){#lok-analytics-section .an-grid{grid-template-columns:1fr;}#lok-analytics-section .an-two{grid-template-columns:1fr;}}',
    // loading card — same spinner language as the auth "Signing you in…" card
    '#lok-analytics-section .an-load{background:#fff;border:.5px solid ' + BORDER + ';border-radius:10px;padding:36px 20px;text-align:center;}',
    '#lok-analytics-section .an-spin{display:inline-block;width:26px;height:26px;border:3px solid rgba(96,2,238,.22);border-top-color:' + VIOLET + ';border-radius:50%;animation:lokAnSpin .7s linear infinite;}',
    '#lok-analytics-section .an-load-t{margin-top:12px;font-size:13px;font-weight:500;color:' + SLATE + ';}',
    '@keyframes lokAnSpin{to{transform:rotate(360deg);}}'
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
    if (!rows.length) { c.appendChild(el('div', 'an-empty', 'No views yet. They’ll appear here as people open your pages.')); return c; }
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

  // Views chart with a range selector. 30 days = daily bars, for everyone;
  // 90 days / 6 months = weekly bars (Pro + Featured); 12 months = monthly bars
  // (Featured only, #73). The lock mirrors real server enforcement (RLS clamps
  // page_views reads to the plan window — free 60d / Pro 180d / Featured 360d),
  // so unlocking a tab client-side would just draw a short/empty chart.
  var RANGES = [
    { days: 30,  label: '30 days',   title: 'last 30 days' },
    { days: 90,  label: '90 days',   title: 'last 90 days' },
    { days: 180, label: '6 months',  title: 'last 6 months' },
    { days: 360, label: '12 months', title: 'last 12 months' }
  ];

  function viewsChart(views, maxDays) {
    var wrap = el('div', 'an-card');
    var head = el('div', 'an-chead');
    var title = el('div', 'an-ctitle');
    var tabs = el('div', 'an-tabs');
    head.appendChild(title); head.appendChild(tabs);
    wrap.appendChild(head);
    var body = el('div');
    wrap.appendChild(body);
    var note = null, buttons = [];

    function draw(days, rangeTitle) {
      title.textContent = 'Storefront views · ' + rangeTitle;
      body.innerHTML = '';
      var perBar = days >= 360 ? 30 : (days > 30 ? 7 : 1);  // days/bar: daily / weekly / monthly
      var unit = days >= 360 ? 'mo' : (days > 30 ? 'wk' : 'd');
      var span = perBar * DAY;
      var n = Math.round(days / perBar);
      var now = Date.now(), buckets = [];
      for (var i = 0; i < n; i++) buckets.push(0);
      views.forEach(function (v) {
        var idx = Math.floor((now - ts(v.created_at)) / span);
        if (idx >= 0 && idx < n) buckets[n - 1 - idx] += 1;
      });
      var max = Math.max.apply(null, buckets.concat([1]));
      var bars = el('div', 'an-bars');
      buckets.forEach(function (cnt, i) {
        var col = el('div', 'an-bcol');
        var bar = el('div', 'an-bar');
        bar.style.height = Math.max(2, Math.round(cnt / max * 100)) + '%';
        if (cnt === max && cnt > 0) bar.style.background = VIOLET;
        var ago = n - 1 - i;
        var label = ago === 0 ? (unit === 'd' ? 'today' : 'this ' + unit)
                              : ago + unit + ' ago';
        var tip = el('div', 'tip', cnt + (cnt === 1 ? ' view · ' : ' views · ') + label);
        bar.appendChild(tip); col.appendChild(bar); bars.appendChild(col);
      });
      body.appendChild(bars);
      var axis = el('div', 'an-axis');
      var axisLabels = days === 30 ? ['30d ago', '3 wks', '2 wks', 'last wk', 'today']
                     : days === 90 ? ['90d ago', '60d', '30d', 'today']
                     : days === 180 ? ['6mo ago', '4mo', '2mo', 'today']
                                    : ['12mo ago', '8mo', '4mo', 'today'];
      axisLabels.forEach(function (t) { axis.appendChild(el('span', null, t)); });
      body.appendChild(axis);
    }

    RANGES.forEach(function (r) {
      var locked = r.days > maxDays;
      // The 12-month tab is Featured-only; 90d/6mo are Pro+Featured.
      var msg = r.days > 180
        ? '12-month view history is a Featured-plan perk.'
        : '90-day and 6-month view history is included with the Pro and Featured plans.';
      var b = el('button', 'an-tab' + (r.days === 30 ? ' on' : '') + (locked ? ' locked' : ''), r.label);
      // Icon: Font Awesome Free 6.7.2 lock (CC BY 4.0); was an emoji (F rule 2026-09-02).
      if (locked) b.insertAdjacentHTML('beforeend', ' <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:.9em;height:.9em;vertical-align:-.125em;flex-shrink:0;"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg>');
      b.type = 'button';
      if (locked) b.title = msg;
      b.addEventListener('click', function () {
        if (locked) {
          if (!note) { note = el('div', 'an-lock-note'); wrap.appendChild(note); }
          note.innerHTML = msg + ' <a href="/pricing">Upgrade →</a>';
          return;
        }
        buttons.forEach(function (x) { x.className = x.className.replace(/ ?\bon\b/, ''); });
        b.className += ' on';
        draw(r.days, r.title);
      });
      buttons.push(b); tabs.appendChild(b);
    });

    draw(30, RANGES[0].title);
    return wrap;
  }

  // Plan truth comes from the BILLING endpoint — the vendor row carries no
  // plan field (same trap lokali-sidebar-account.js documents), so the old
  // vendor-only check was ALWAYS false and the upsell never hid.
  function isTopTier(vendor, billing) {
    var p = String(
      (billing && (billing.plan || billing.plan_code)) ||
      (vendor && (vendor.plan || vendor.tier || vendor.plan_name || vendor.subscription_tier || vendor.plan_tier)) || ''
    ).toLowerCase();
    return p.indexOf('featured') >= 0 || p.indexOf('spotlight') >= 0;
  }

  // Storefront checkup: the pure builder lives in lokali-dashboard.js
  function demandCard(mount, vendor, services, products) {
    var escapeHtml = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var S = window.LokaliSupabaseAPI;
    if (!S || !S.marketing || typeof S.marketing.searchSignals !== 'function') return;
    var host = el('div'); mount.appendChild(host);
    S.marketing.searchSignals(30).then(function (r) {
      var d = r && !r.error ? r.data : null;
      if (!d || d.ok !== true) { host.parentNode && host.parentNode.removeChild(host); return; }
      var found = d.found || [], missed = d.missed || [];
      if (!found.length && !missed.length) { host.parentNode && host.parentNode.removeChild(host); return; }
      if (!document.getElementById('an-dm-css')) {
        var st = document.createElement('style'); st.id = 'an-dm-css';
        st.textContent = '.an-dm{background:#fff;border:.5px solid #EEEDF6;border-radius:14px;padding:16px 18px 18px;margin-top:14px;font-family:"Plus Jakarta Sans",-apple-system,sans-serif;}' +
          '.an-dm h3{font-size:15px;font-weight:700;margin:0 0 2px;color:#1A1829;}.an-dm .s{font-size:12px;color:#6E6A85;margin:0 0 10px;}' +
          '.an-dm h4{font-size:12.5px;font-weight:700;margin:12px 0 6px;color:#1A1829;}' +
          '.an-dm .bar{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;font-size:12.5px;color:#1A1829;margin:0 0 7px;}' +
          '.an-dm .bar i{display:block;height:8px;border-radius:100px;background:#F3EBFF;position:relative;margin-top:4px;}' +
          '.an-dm .bar i::after{content:"";position:absolute;left:0;top:0;bottom:0;border-radius:100px;background:#6002EE;width:var(--w);}' +
          '.an-dm .bar.miss i{background:#FDE7F3;}.an-dm .bar.miss i::after{background:#B1006A;}' +
          '.an-dm .bar .n{font-weight:700;color:#4A4761;font-size:12px;}' +
          '.an-dm .tip{background:#F1EDFB;border:1px solid #E5D4FD;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:12.5px;line-height:1.5;color:#1A1829;}' +
          '.an-dm .tip a{display:inline-block;margin-top:8px;font:700 12.5px/1.2 inherit;background:#6002EE;color:#fff;text-decoration:none;border-radius:9px;padding:8px 13px;}' +
          '.an-dm .foot{font-size:11px;color:#6E6A85;margin-top:12px;line-height:1.5;}';
        document.head.appendChild(st);
      }
      function bars(list, cls) {
        var max = Math.max.apply(null, list.map(function (x) { return +x.n || 0; }).concat([1]));
        return list.map(function (x) {
          var w = Math.max(6, Math.round((+x.n || 0) / max * 100));
          return '<div class="bar' + cls + '"><div>' + escapeHtml(String(x.term)) + '<i style="--w:' + w + '%"></i></div><span class="n">' + (+x.n || 0) + '</span></div>';
        }).join('');
      }
      var c = el('div', 'an-dm');
      var html = '<h3>What people searched for</h3><div class="s">Last ' + (d.days || 30) + ' days, in your category and area. Counts only, never who searched.</div>';
      if (found.length) html += '<h4>Searches that found you</h4>' + bars(found, '');
      if (missed.length) html += '<h4>Searches near you that found nobody</h4>' + bars(missed, ' miss');
      if (missed.length) {
        var top = missed[0];
        var hasSvc = (services || []).length > 0, hasPrd = (products || []).length > 0;
        var addHref = hasPrd && !hasSvc ? '/vendor-dashboard/products' : '/vendor-dashboard/services';
        html += '<div class="tip"><b>' + (+top.n) + ' ' + ((+top.n) === 1 ? 'person' : 'people') + ' looked for \u201c' + escapeHtml(String(top.term)) + '\u201d and left empty-handed.</b> If you do it, a listing named that way, with the matching specialty tag, would show up for every one of those searches.' +
          '<br><a href="' + addHref + '">Add a listing</a></div>';
      }
      html += '<div class="foot">A term only appears once it has been searched five or more times, so no single search can be traced to a person.</div>';
      c.innerHTML = html;
      host.appendChild(c);
    }).catch(function () { if (host.parentNode) host.parentNode.removeChild(host); });
  }

  // (window.LokaliCheckup, sitewide plain tag, loads before this deferred
  // script) so the dashboard home and this page read ONE copy. A missing
  // global (old cached bundle) just hides the card.
  function buildCheckup(v, services, products, photos, cfg, billing) {
    if (typeof window.LokaliCheckup !== 'function') return { items: [], open: [], done: [], total: 0, paidPlan: false };
    return window.LokaliCheckup(v, services, products, photos, cfg, billing);
  }

  var CK_ICON_OPEN = '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M464 256A208 208 0 1 0 48 256a208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z"/></svg>';
  var CK_ICON_DONE = '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg>';
  var CK_ICON_CHEV = '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>';
  var CK_SHOW = 3; // Hick's law: three open items by default, the rest behind one toggle

  function ckRow(item) {
    var li = el('li', 'an-ck-row' + (item.done ? ' done' : ''));
    var ico = el('span', 'an-ck-ico'); ico.innerHTML = item.done ? CK_ICON_DONE : CK_ICON_OPEN;
    li.appendChild(ico);
    var body = el('div');
    body.appendChild(el('div', 'an-ck-t', item.title));
    if (!item.done) body.appendChild(el('div', 'an-ck-w', item.why));
    li.appendChild(body);
    if (!item.done) {
      // Descriptive label (WCAG 2.4.4): the link says what happens, not "Fix".
      var a = el('a', 'an-ck-fix', item.action + ' →'); a.href = item.href;
      a.setAttribute('aria-label', item.action + ': ' + item.title);
      li.appendChild(a);
    }
    return li;
  }

  function ckToggle(label, list, startOpen) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'an-ck-more';
    btn.innerHTML = CK_ICON_CHEV + '<span></span>';
    var lbl = btn.querySelector('span');
    function paint(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      list.hidden = !open;
      lbl.textContent = (open ? 'Hide ' : 'Show ') + label;
    }
    paint(!!startOpen);
    btn.addEventListener('click', function () { paint(list.hidden); });
    return btn;
  }

  function checkupCard(ck) {
    var card = el('div', 'an-ck');
    card.setAttribute('role', 'region'); card.setAttribute('aria-label', 'Storefront checkup');
    var head = el('div', 'an-ck-head');
    var ht = el('div');
    ht.appendChild(el('div', 'an-ctitle', 'Storefront checkup'));
    ht.appendChild(el('div', 'an-ck-sub', ck.open.length
      ? 'Things shoppers look for that your page doesn’t have yet.'
      : 'Your storefront has everything shoppers look for. The next lift is more photos and a fresh listing now and then.'));
    head.appendChild(ht);
    var pill = el('span', 'an-ck-pill' + (ck.open.length ? '' : ' ok'));
    if (ck.open.length) pill.textContent = ck.open.length + ' to do';
    else pill.innerHTML = CK_ICON_DONE + ' All ' + ck.total + ' in place';
    head.appendChild(pill);
    card.appendChild(head);

    // Endowed progress: the meter starts with the credit already earned.
    var meter = el('div', 'an-ck-meter' + (ck.open.length ? '' : ' ok'));
    meter.setAttribute('role', 'img');
    meter.setAttribute('aria-label', ck.done.length + ' of ' + ck.total + ' in place');
    var fill = el('div'); fill.style.width = Math.round(ck.done.length / Math.max(1, ck.total) * 100) + '%';
    meter.appendChild(fill); card.appendChild(meter);

    if (ck.open.length) {
      var first = ck.open.slice(0, CK_SHOW), rest = ck.open.slice(CK_SHOW);
      var ul = el('ul', 'an-ck-list');
      first.forEach(function (i) { ul.appendChild(ckRow(i)); });
      card.appendChild(ul);
      if (rest.length) {
        var more = el('ul', 'an-ck-list an-ck-done');
        rest.forEach(function (i) { more.appendChild(ckRow(i)); });
        card.appendChild(ckToggle(rest.length + ' more to do', more, false));
        card.appendChild(more);
      }
    }
    if (ck.done.length) {
      var dl = el('ul', 'an-ck-list an-ck-done');
      ck.done.forEach(function (i) { dl.appendChild(ckRow(i)); });
      card.appendChild(ckToggle(ck.open.length ? ck.done.length + ' already in place' : 'the ' + ck.total + ' checks', dl, false));
      card.appendChild(dl);
    }
    if (!ck.paidPlan) {
      card.appendChild(el('div', 'an-ck-plan', 'Gallery, booking link and Verified checks appear once those features are on your plan.'));
    }
    return card;
  }

  function render(mount, data, services, products, vendor, billing, photos, cfg) {
    var views = (data && data.views) || [];
    var inq = (data && data.inquiries) || [];
    var con = (data && data.contacts) || [];
    var pay = (data && data.payment_clicks) || [];
    var pay30 = inWin(pay, 0, DAY30), payPrev = inWin(pay, DAY30, 2 * DAY30);

    var views30 = inWin(views, 0, DAY30), viewsPrev = inWin(views, DAY30, 2 * DAY30);
    var leads30 = inWin(inq, 0, DAY30) + inWin(con, 0, DAY30);
    var leadsPrev = inWin(inq, DAY30, 2 * DAY30) + inWin(con, DAY30, 2 * DAY30);
    // Clamp at 100 — sparse early data (e.g. 5 leads on 2 views) pushes the
    // raw ratio over 100%, which reads as a broken stat to a vendor.
    var rate = views30 ? Math.min(100, leads30 / views30 * 100) : 0;
    var ratePrev = viewsPrev ? Math.min(100, leadsPrev / viewsPrev * 100) : 0;

    mount.innerHTML = '';

    // KPIs
    var grid = el('div', 'an-grid');
    // Label shortened 2026-08-22 (F): at five-across 'Storefront views' wrapped
    // to two lines and pushed its number below the neighbours'. The chart card
    // below is still titled 'Storefront views'.
    grid.appendChild(kpiCard('Views', String(views30), deltaChip(views30, viewsPrev), 'vs. previous 30 days'));
    grid.appendChild(kpiCard('View → Lead rate', rate.toFixed(1) + '<small>%</small>', deltaChip(rate, ratePrev, 'pts'), 'Views that became leads'));
    var leadsLink = el('a', 'an-klink', 'See all in Leads →'); leadsLink.href = '/vendor-dashboard/leads';
    grid.appendChild(kpiCard('Leads', String(leads30), null, leadsLink));

    // Payment clicks — taps on the vendor's Venmo/Cash App/PayPal/other pay links.
    // A distinct, high-intent signal; deliberately NOT folded into Leads.
    // 76a: the detail line breaks the 30-day count down per method.
    var PAY_LABELS = { venmo: 'Venmo', cashapp: 'Cash App', paypal: 'PayPal', zelle: 'Zelle', other_pay: 'Other link', buy_link: 'Buy link', booking_link: 'Book now' }; // buy_link = #172 product checkout button; booking_link = service-page Book now (2026-09-23)
    var payDetail = 'taps to pay you, buy from your store or book';
    if (pay30 > 0) {
      var payNow = Date.now(), payCounts = {};
      pay.forEach(function (e) {
        var d = payNow - ts(e.created_at);
        if (d >= 0 && d < DAY30) {
          var k = PAY_LABELS[String(e.event_type)] ? String(e.event_type) : 'other_pay';
          payCounts[k] = (payCounts[k] || 0) + 1;
        }
      });
      var payBits = [];
      ['venmo', 'cashapp', 'paypal', 'zelle', 'other_pay', 'buy_link', 'booking_link'].forEach(function (k) {
        if (payCounts[k]) payBits.push(PAY_LABELS[k] + ' ' + payCounts[k]);
      });
      if (payBits.length) payDetail = payBits.join(' · ');
    }
    grid.appendChild(kpiCard('Payment clicks', String(pay30), deltaChip(pay30, payPrev), payDetail));

    // Shares KPI — word-of-mouth. Fetched separately from the Shares endpoint
    // (unique customer sharers; the vendor's own Share & Grow links don't count).
    var sharesCard = kpiCard('Shares', '<span style="color:#C8C6D8">…</span>', null, 'neighbors who shared your profile');
    grid.appendChild(sharesCard);
    if (window.LokaliAPI && window.LokaliAPI.share && window.LokaliAPI.share.count) {
      window.LokaliAPI.share.count().then(function (res) {
        var n = (res && res.data && res.data.unique_sharers) || 0;
        var m = (res && res.data && res.data.landings) || 0;
        var vEl = sharesCard.querySelector('.an-kvalue');
        if (vEl) vEl.textContent = String(n);
        var dEl = sharesCard.querySelector('.an-kdetail');
        if (dEl) {
          dEl.textContent = (n === 0)
            ? 'neighbors who shared your profile'
            : (n === 1 ? '1 neighbor' : n + ' neighbors') + (m > 0 ? ' · ' + m + (m === 1 ? ' visit' : ' visits') : '');
        }
      }).catch(function () {
        var vEl2 = sharesCard.querySelector('.an-kvalue');
        if (vEl2) vEl2.textContent = '0';
      });
    }

    mount.appendChild(grid);

    var ck = buildCheckup(vendor, services, products, photos, cfg, billing);

    // light real-data insight — points at the top open checkup item instead of
    // the old one-size sentence ("add photos") that every vendor used to get.
    if (views30 > 0) {
      var ins = el('div', 'an-insight');
      var tail = ck.open.length
        ? 'The quickest lift below: <strong>' + ck.open[0].title.charAt(0).toLowerCase() + ck.open[0].title.slice(1) + '</strong>.'
        : 'Your storefront has everything shoppers look for. Fresh photos and a new listing now and then keep it that way.';
      ins.innerHTML = '<strong>' + views30 + '</strong> people viewed your storefront in the last 30 days, and <strong>' +
        rate.toFixed(0) + '%</strong> of them reached out. ' + tail;
      mount.appendChild(ins);
    }
    if (ck.total) mount.appendChild(checkupCard(ck));

    // Demand signals (2026-09-17): searches that found this vendor and searches
    // nearby that found nobody, from my_search_signals() (five-search floor is
    // server-side). Renders only once the RPC exists and has something to say.
    try { demandCard(mount, vendor, services, products); } catch (e) {}

    // views chart with plan-gated range selector. The selectable window is the
    // vendor's plan tier: Featured 360d / Pro 180d / free 30d (paid truth =
    // billing.features.analytics_enabled; Featured via isTopTier). The server
    // clamps the actual rows regardless of what renders here (#73).
    var paidHist = !!(billing && billing.features && billing.features.analytics_enabled);
    var maxDays = isTopTier(vendor, billing) ? 360 : (paidHist ? 180 : 30);
    mount.appendChild(viewsChart(views, maxDays));

    // top items
    var topSvc = topItems(views, 'service', services, 5);
    var topProd = topItems(views, 'product', products, 5);
    var two = el('div', 'an-two');
    two.appendChild(rankCard('Top services by views', topSvc, VIOLET));
    two.appendChild(rankCard('Top products by views', topProd, ORANGE));
    mount.appendChild(two);

    // tier-aware upsell — hidden once the vendor is on the top tier (#67:
    // tier-agnostic label; a vendor could pick Pro or Featured on /pricing).
    //
    // The pitch now depends on which tier they're actually on. It used to show
    // the Featured "top of your category" line to free vendors too, which is
    // the wrong ask (skipping Pro) and the wrong argument: ranking is worth
    // little while categories are thin, and a service vendor with three
    // services feels no listing cap. Free vendors hear about depth instead —
    // the storefront gallery, photos per listing, bookings, Verified.
    if (!isTopTier(vendor, billing)) {
      var up = el('div', 'an-up');
      var ut = el('div');
      if (paidHist) {
        ut.appendChild(el('div', 'an-up-t', 'Get seen by more local customers'));
        // No badge claim: the customer-facing ★ Featured badge was removed by
        // decision (#86, 2026-07-18) — it named a billing tier customers don't
        // care about and competed with the Founding badge. Featured's real
        // deliverables are ranking, photo depth, and features-first rollout.
        ut.appendChild(el('div', 'an-up-s', 'Featured vendors rank at the top of their category, show more photos, and get everything Lokali offers.'));
      } else {
        ut.appendChild(el('div', 'an-up-t', 'Show customers more of your work'));
        ut.appendChild(el('div', 'an-up-s', 'Pro adds a photo gallery across the top of your storefront, 5 photos per listing, bookings straight from your page, and the Verified badge.'));
      }
      up.appendChild(ut);
      var btn = el('a', 'an-up-btn', paidHist ? 'Upgrade' : 'See what Pro includes'); btn.href = '/pricing';
      up.appendChild(btn);
      mount.appendChild(up);
    }
  }

  function unwrap(res) { return res && !res.error ? (res.data != null ? res.data : res) : null; }
  function asArray(x) { if (Array.isArray(x)) return x; if (x && Array.isArray(x.items)) return x.items; return []; }

  // The page rendered BLANK on mobile (2026-07-13): init ran at DOMContentLoaded,
  // and any of (a) LokaliAPI/adapter not installed yet, (b) the Supabase session
  // still restoring on a slow connection, or (c) a rejected fetch, ended with
  // nothing on screen — the old code either bailed silently or let Promise.all
  // reject with no .catch. Now: poll until the API + auth token exist, always
  // paint SOMETHING, and offer a retry on failure.
  function showLoading(mount, text) {
    mount.innerHTML = '';
    var c = el('div', 'an-load');
    c.appendChild(el('div', 'an-spin'));
    c.appendChild(el('div', 'an-load-t', text));
    mount.appendChild(c);
  }

  function showMsg(mount, text, withRetry) {
    mount.innerHTML = '';
    var c = el('div', 'an-load');
    c.appendChild(el('div', 'an-load-t', text));
    if (withRetry) {
      var b = document.createElement('button');
      b.textContent = 'Try again';
      b.style.cssText = 'display:block;margin:14px auto 0;font-family:inherit;font-size:13px;font-weight:600;' +
        'color:#fff;background:#6002ee;border:none;border-radius:9px;padding:9px 18px;cursor:pointer;';
      // Restart the FULL boot — the old handler called load() directly, which
      // threw (and blanked the page) when the retry was needed because the
      // API/adapter never arrived in the first place.
      b.addEventListener('click', function () { init(0); });
      c.appendChild(b);
    }
    mount.appendChild(c);
  }

  function apiReady() {
    var A = window.LokaliAPI;
    if (!A || !A.leads || typeof A.leads.analytics !== 'function') return false;
    // Wait for the restored auth token too — calling before the session is
    // back gets an anon 401/empty and used to strand the page blank.
    try { return !!(typeof A.getToken === 'function' ? A.getToken() : true); } catch (e) { return true; }
  }

  function load(mount, attempt) {
    var API = window.LokaliAPI;
    var calls = [
      API.leads.analytics(),
      API.services && API.services.getMine ? API.services.getMine() : Promise.resolve(null),
      API.products && API.products.getMine ? API.products.getMine() : Promise.resolve(null),
      API.vendors && API.vendors.me ? API.vendors.me() : Promise.resolve(null),
      // Billing = plan truth (vendor row has no plan field); best-effort.
      API.plans && API.plans.getMyBilling ? API.plans.getMyBilling().catch(function () { return null; }) : Promise.resolve(null)
    ];
    Promise.all(calls).then(function (r) {
      var data = unwrap(r[0]);
      if (!data) {
        if (attempt < 1) { setTimeout(function () { load(mount, attempt + 1); }, 2500); return; }
        showMsg(mount, 'Analytics are taking a moment to load.', true);
        return;
      }
      var vendor = unwrap(r[3]);
      // vendors.me() answers { vendor: row } (adapter vendorMe), not the row.
      // v1.4.421 read the wrapper: every vendor-side check saw undefined and
      // the extras below had no id, so a complete storefront showed "9 to do"
      // (F, 2026-09-16). Unwrap once here; the raw row is what buildCheckup
      // and isTopTier expect.
      if (vendor && vendor.vendor && typeof vendor.vendor === 'object') vendor = vendor.vendor;
      // Checkup extras (portfolio photos + availability config): best-effort,
      // both owner-scoped reads on the Supabase client; a miss just hides
      // the gallery/booking rows rather than blocking the page.
      var S = window.LokaliSupabaseAPI, vid = vendor && vendor.id;
      var extras = (S && vid != null)
        ? Promise.all([
            S.photos && S.photos.list ? S.photos.list('vendor', vid).catch(function () { return null; }) : null,
            S.availability && S.availability.getConfig ? S.availability.getConfig(vid).catch(function () { return null; }) : null
          ])
        : Promise.resolve([null, null]);
      return extras.then(function (x) {
        render(mount, data, asArray(unwrap(r[1])), asArray(unwrap(r[2])), vendor, unwrap(r[4]), asArray(unwrap(x[0])), unwrap(x[1]));
      });
    }).catch(function (err) {
      console.warn('[lokali-analytics] load failed', err);
      if (attempt < 1) { setTimeout(function () { load(mount, attempt + 1); }, 2500); return; }
      showMsg(mount, "We couldn't load your analytics.", true);
    });
  }

  function init(tries) {
    tries = tries || 0;
    var mount = document.getElementById('lok-analytics-section');
    if (!mount) return;
    injectStyles();
    // Spinner up FIRST — also covers the ready-API-but-slow-fetch case, so the
    // page never sits on static/blank content while data loads (Francesca
    // 2026-08-13: mobile "doesn't load" reports).
    if (tries === 0) showLoading(mount, 'Loading your analytics…');
    if (!apiReady()) {
      if (tries < 120) { setTimeout(function () { init(tries + 1); }, 250); return; } // ~30s of patience for slow mobile session restores
      showMsg(mount, "We couldn't load your analytics.", true);
      return;
    }
    load(mount, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(0); });
  else init(0);
})();
