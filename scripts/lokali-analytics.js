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
 * page), a daily/weekly views chart with a range selector (30d free; 90d and
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
    '#lok-analytics-section .an-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:1rem;}',
    '@media(max-width:1100px) and (min-width:721px){#lok-analytics-section .an-grid{grid-template-columns:1fr 1fr;}}',
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
      title.textContent = 'Storefront views — ' + rangeTitle;
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
      var b = el('button', 'an-tab' + (r.days === 30 ? ' on' : '') + (locked ? ' locked' : ''),
                 r.label + (locked ? ' 🔒' : ''));
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

  function render(mount, data, services, products, vendor, billing) {
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
    grid.appendChild(kpiCard('Storefront views', String(views30), deltaChip(views30, viewsPrev), 'vs. previous 30 days'));
    grid.appendChild(kpiCard('View → Lead rate', rate.toFixed(1) + '<small>%</small>', deltaChip(rate, ratePrev, 'pts'), 'Views that became leads'));
    var leadsLink = el('a', 'an-klink', 'See all in Leads →'); leadsLink.href = '/vendor-dashboard/leads';
    grid.appendChild(kpiCard('Leads', String(leads30), null, leadsLink));

    // Payment clicks — taps on the vendor's Venmo/Cash App/PayPal/other pay links.
    // A distinct, high-intent signal; deliberately NOT folded into Leads.
    // 76a: the detail line breaks the 30-day count down per method.
    var PAY_LABELS = { venmo: 'Venmo', cashapp: 'Cash App', paypal: 'PayPal', zelle: 'Zelle', other_pay: 'Other link' };
    var payDetail = 'taps to pay you directly';
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
      ['venmo', 'cashapp', 'paypal', 'zelle', 'other_pay'].forEach(function (k) {
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

    // light real-data insight (peak day) — no Phase 3 benchmark data needed
    if (views30 > 0) {
      var ins = el('div', 'an-insight');
      ins.innerHTML = '<strong>' + views30 + '</strong> people viewed your storefront in the last 30 days, and <strong>' +
        rate.toFixed(0) + '%</strong> of them reached out. Adding photos and a second service is the fastest way to lift both numbers.';
      mount.appendChild(ins);
    }

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
    if (!isTopTier(vendor, billing)) {
      var up = el('div', 'an-up');
      var ut = el('div');
      ut.appendChild(el('div', 'an-up-t', 'Get seen by more local customers'));
      ut.appendChild(el('div', 'an-up-s', 'Featured vendors appear at the top of their category with a Featured badge on every listing.'));
      up.appendChild(ut);
      var btn = el('a', 'an-up-btn', 'Upgrade'); btn.href = '/pricing';
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
  function showMsg(mount, text, withRetry) {
    mount.innerHTML = '';
    var c = el('div', 'an-card');
    c.appendChild(el('div', 'an-empty', text));
    if (withRetry) {
      var b = document.createElement('button');
      b.textContent = 'Try again';
      b.style.cssText = 'display:block;margin:10px auto 0;font-family:inherit;font-size:13px;font-weight:600;' +
        'color:#fff;background:#6002ee;border:none;border-radius:9px;padding:9px 18px;cursor:pointer;';
      b.addEventListener('click', function () { load(mount, 0); });
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
      render(mount, data, asArray(unwrap(r[1])), asArray(unwrap(r[2])), unwrap(r[3]), unwrap(r[4]));
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
    if (!apiReady()) {
      if (tries === 0) showMsg(mount, 'Loading your analytics…', false);
      if (tries < 40) { setTimeout(function () { init(tries + 1); }, 250); return; }
      showMsg(mount, "We couldn't load your analytics.", true);
      return;
    }
    load(mount, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(0); });
  else init(0);
})();
