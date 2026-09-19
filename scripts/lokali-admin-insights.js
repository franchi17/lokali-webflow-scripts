/**
 * lokali-admin-insights.js — "Marketplace insights", the admin-only analytics
 * page inside /account (F 2026-09-19: "what's working, what's not and why, who
 * is getting seen, who isn't").
 *
 * Lazy-loaded by lokali-account.js for the admin account only; never part of a
 * shopper's or vendor's page weight. Data = ONE RPC, admin_insights(p_days)
 * (docs/supabase/patch_admin_insights.sql), is_admin()-gated server-side. This
 * file is presentation: it buckets nothing sensitive and holds no secrets.
 *
 * API: window.LokaliAdminInsights.mount(container, { fetch?: fn(days) -> Promise<data> })
 *
 * File name note: deliberately NOT *analytics* / *tracker* / *pixel*; iOS content
 * blockers drop scripts by filename.
 *
 * House rules honoured here: Plus Jakarta Sans set explicitly, no ink surfaces,
 * no emoji (Font Awesome inline SVGs), no em dashes in copy, soft solid tints.
 */
(function () {
  'use strict';
  if (window.LokaliAdminInsights) return;

  var FONT = "'Plus Jakarta Sans',sans-serif";
  // Chart series colors, validated with the dataviz palette checker (light):
  // views = soft orange, contacts = violet, searches = teal. Fixed by entity.
  var C_VIEWS = '#E8863A', C_CONTACTS = '#6B3FD4', C_SEARCH = '#2E9E83';
  var RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days']];
  var NEW_DAYS = 14;          // a storefront this young is "New", not "Not seen"
  var SEARCH_MIN = 10;        // below this many searches, "matched no search" says nothing
  // Zero reach-outs only means something once enough people have looked. Rule
  // of three: 0 events in n tries puts the true rate under 3/n (95%), so at 30
  // views "nobody reached out" means "under 10%", which is still most healthy
  // storefronts. Below that we say "getting seen" and do not judge.
  var JUDGE_VIEWS = 30;
  var SHOWN_MIN = 20;         // same idea for Market cards: judge click-through only after 20 listings

  var FA = {
    eye: '<svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M288 32c-80.800 0-145.500 36.800-192.600 80.600C48.600 156 17.300 208 2.500 243.700c-3.300 7.900-3.300 16.700 0 24.600C17.300 304 48.600 356 95.400 399.400C142.500 443.200 207.200 480 288 480s145.500-36.800 192.600-80.600c46.800-43.500 78.100-95.400 93-131.100c3.300-7.900 3.300-16.700 0-24.600c-14.900-35.700-46.200-87.700-93-131.100C433.500 68.800 368.800 32 288 32zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64c0 35.300-28.700 64-64 64c-7.100 0-13.900-1.200-20.300-3.300c-5.500-1.800-11.900 1.600-11.700 7.400c.3 6.900 1.300 13.800 3.200 20.700c13.700 51.200 66.400 81.600 117.600 67.900s81.600-66.400 67.900-117.600c-11.100-41.500-47.800-69.400-88.600-71.100c-5.800-.2-9.200 6.100-7.400 11.700c2.100 6.400 3.300 13.200 3.300 20.300z"/></svg>',
    up: '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M214.600 41.400c-12.500-12.500-32.800-12.500-45.300 0l-160 160c-12.500 12.500-12.500 32.800 0 45.300s32.800 12.500 45.300 0L160 141.200V448c0 17.700 14.300 32 32 32s32-14.300 32-32V141.200L329.400 246.600c12.500 12.500 32.800 12.500 45.300 0s12.500-32.800 0-45.300l-160-160z"/></svg>',
    down: '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M169.400 470.600c12.500 12.500 32.800 12.500 45.300 0l160-160c12.500-12.500 12.500-32.800 0-45.300s-32.800-12.500-45.300 0L224 370.800V64c0-17.700-14.300-32-32-32s-32 14.300-32 32V370.800L54.600 265.400c-12.500-12.500-32.800-12.500-45.300 0s-12.500 32.800 0 45.300l160 160z"/></svg>',
    check: '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M438.600 105.400c12.500 12.500 12.500 32.800 0 45.300l-256 256c-12.500 12.500-32.800 12.500-45.300 0l-128-128c-12.500-12.500-12.500-32.800 0-45.300s32.800-12.500 45.300 0L160 338.700 393.400 105.400c12.500-12.500 32.800-12.500 45.300 0z"/></svg>',
    warn: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M256 32c14.200 0 27.300 7.500 34.500 19.800l216 368c7.300 12.400 7.300 27.700 .2 40.100S486.300 480 472 480H40c-14.300 0-27.600-7.700-34.700-20.100s-7-27.800 .2-40.100l216-368C228.700 39.500 241.800 32 256 32zm0 128c-13.300 0-24 10.700-24 24V296c0 13.300 10.700 24 24 24s24-10.700 24-24V184c0-13.300-10.700-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>',
    chev: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M233.400 406.600c12.500 12.500 32.800 12.500 45.300 0l192-192c12.500-12.500 12.500-32.800 0-45.300s-32.800-12.500-45.300 0L256 338.700 86.600 169.400c-12.500-12.500-32.800-12.500-45.300 0s-12.500 32.800 0 45.300l192 192z"/></svg>',
    out: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M320 0c-17.700 0-32 14.300-32 32s14.300 32 32 32h82.700L201.400 265.400c-12.500 12.500-12.500 32.800 0 45.300s32.800 12.500 45.300 0L448 109.300V192c0 17.700 14.300 32 32 32s32-14.300 32-32V32c0-17.700-14.300-32-32-32H320zM80 32C35.800 32 0 67.800 0 112V432c0 44.200 35.800 80 80 80H400c44.200 0 80-35.800 80-80V320c0-17.700-14.300-32-32-32s-32 14.300-32 32V432c0 8.800-7.200 16-16 16H80c-8.800 0-16-7.200-16-16V112c0-8.800 7.200-16 16-16H192c17.700 0 32-14.300 32-32s-14.300-32-32-32H80z"/></svg>',
    dl: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M288 32c0-17.700-14.300-32-32-32s-32 14.300-32 32V274.700l-73.400-73.400c-12.500-12.500-32.800-12.500-45.300 0s-12.500 32.800 0 45.300l128 128c12.500 12.500 32.800 12.500 45.300 0l128-128c12.500-12.500 12.500-32.800 0-45.300s-32.800-12.500-45.300 0L288 274.700V32zM64 352c-35.300 0-64 28.700-64 64v32c0 35.300 28.700 64 64 64H448c35.300 0 64-28.700 64-64V416c0-35.300-28.700-64-64-64H346.500l-45.300 45.300c-25 25-65.500 25-90.500 0L165.500 352H64z"/></svg>'
  };

  // ── tiny helpers ───────────────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(name, cls) {
    var s = el('span', 'lki-ico' + (cls ? ' ' + cls : ''));
    s.innerHTML = FA[name] || '';
    return s;
  }
  function num(n) { n = Number(n) || 0; return n.toLocaleString('en-US'); }
  function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
  function plural(n, one, many) { return num(n) + ' ' + (Number(n) === 1 ? one : (many || one + 's')); }
  function daysSince(iso) {
    if (!iso) return null;
    var t = Date.parse(iso); if (isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86400000);
  }
  function shortDay(d) {
    var p = String(d).split('-'); if (p.length < 3) return String(d);
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return M[Number(p[1]) - 1] + ' ' + Number(p[2]);
  }
  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  var PLAN = { 0: 'Free', 1: 'Pro', 2: 'Featured' };

  // ── styles ─────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('lokali-admin-insights-styles')) return;
    var s = document.createElement('style');
    s.id = 'lokali-admin-insights-styles';
    s.textContent =
      ".lki{font-family:" + FONT + ";color:#1A1829;}" +
      ".lki *{box-sizing:border-box;font-family:inherit;}" +
      ".lki-ico{display:inline-flex;width:1em;height:1em;flex:0 0 auto;}.lki-ico svg{width:100%;height:100%;}" +
      ".lki-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 0 16px;}" +
      ".lki-h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.01em;}" +
      ".lki-sub{font-size:13px;color:#6B6880;margin:4px 0 0;}" +
      ".lki-range{display:inline-flex;background:#fff;border:1px solid #E4E2F0;border-radius:999px;padding:3px;}" +
      ".lki-range button{font-size:13px;font-weight:600;color:#6B6880;background:transparent;border:0;border-radius:999px;padding:7px 14px;cursor:pointer;}" +
      ".lki-range button.is-on{background:#F3EBFF;color:#4A12B8;}" +
      ".lki-card{background:#fff;border:1px solid #E8E5F3;border-radius:16px;padding:18px 20px;margin:0 0 16px;}" +
      ".lki-card-h{font-size:15px;font-weight:700;margin:0;}" +
      ".lki-card-s{font-size:12.5px;color:#6B6880;margin:3px 0 14px;line-height:1.5;}" +
      ".lki-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;}" +
      ".lki-grid2 .lki-card{margin:0;}" +
      ".lki-gap{height:16px;}" +
      /* the short version */
      ".lki-tldr{background:#FBF8FF;border-color:#E4D6FB;}" +
      ".lki-tl{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.5;padding:7px 0;border-top:1px solid #EEE7FB;}" +
      ".lki-tl:first-of-type{border-top:0;}" +
      ".lki-tl .lki-ico{margin-top:3px;font-size:13px;}" +
      ".lki-tl.good .lki-ico{color:#1A7F55;}.lki-tl.bad .lki-ico{color:#B3580F;}.lki-tl.info .lki-ico{color:#6B3FD4;}" +
      /* KPI tiles */
      ".lki-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 16px;}" +
      ".lki-kpi{background:#fff;border:1px solid #E8E5F3;border-radius:14px;padding:14px 16px;}" +
      ".lki-kpi-l{font-size:12px;color:#6B6880;font-weight:600;}" +
      ".lki-kpi-n{font-size:26px;font-weight:700;margin:4px 0 2px;letter-spacing:-.02em;}" +
      ".lki-kpi-d{font-size:12px;color:#6B6880;display:flex;align-items:center;gap:4px;min-height:17px;}" +
      ".lki-kpi-d.up{color:#1A7F55;}.lki-kpi-d.down{color:#B3400F;}.lki-kpi-d .lki-ico{font-size:10px;}" +
      /* small-multiple day charts: one metric per row, shared x, own y (never dual-axis) */
      ".lki-chart{position:relative;}" +
      ".lki-sm{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:end;padding:8px 0;border-top:1px solid #F1EFF8;}" +
      ".lki-sm:first-child{border-top:0;}" +
      ".lki-sm-l{font-size:12.5px;font-weight:600;color:#4A4761;display:flex;align-items:center;gap:6px;padding-bottom:2px;}" +
      ".lki-sm-l i{width:10px;height:10px;border-radius:3px;display:inline-block;}" +
      ".lki-sm-l small{display:block;font-weight:500;color:#8E8BA6;font-size:11px;}" +
      ".lki-bars{display:flex;align-items:flex-end;gap:2px;height:64px;}" +
      ".lki-bars.tall{height:96px;}" +
      ".lki-col{flex:1 1 0;min-width:2px;height:100%;display:flex;align-items:flex-end;cursor:default;border-radius:4px;}" +
      ".lki-col b{display:block;width:100%;border-radius:4px 4px 0 0;min-height:0;}" +
      ".lki-col.is-hot{background:#F3EFFA;}" +
      ".lki-axis{display:grid;grid-template-columns:96px 1fr;gap:10px;font-size:11px;color:#8E8BA6;margin-top:4px;}" +
      ".lki-axis div{display:flex;justify-content:space-between;}" +
      ".lki-tip{position:absolute;z-index:5;pointer-events:none;background:#fff;border:1px solid #DEDAEE;border-radius:10px;box-shadow:0 6px 18px rgba(74,50,140,.12);padding:8px 10px;font-size:12px;line-height:1.5;white-space:nowrap;display:none;}" +
      ".lki-tip strong{display:block;font-size:12px;margin-bottom:2px;}" +
      ".lki-tip i{width:8px;height:8px;border-radius:2px;display:inline-block;margin-right:6px;}" +
      /* vendor table */
      ".lki-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 12px;}" +
      ".lki-chip{font-size:12.5px;font-weight:600;color:#4A4761;background:#F7F6FC;border:1px solid #E8E5F3;border-radius:999px;padding:6px 12px;cursor:pointer;display:inline-flex;gap:6px;align-items:center;}" +
      ".lki-chip.is-on{background:#F3EBFF;border-color:#D9C6FA;color:#4A12B8;}" +
      ".lki-chip span{font-weight:700;font-size:11px;color:#8E8BA6;}" +
      ".lki-chip.is-on span{color:#6B3FD4;}" +
      ".lki-spacer{flex:1;}" +
      ".lki-link{font-size:12.5px;font-weight:600;color:#4A12B8;background:none;border:0;padding:6px 4px;cursor:pointer;display:inline-flex;gap:6px;align-items:center;text-decoration:none;}" +
      ".lki-thead,.lki-row{display:grid;grid-template-columns:minmax(200px,2.4fr) repeat(5,minmax(64px,1fr)) 24px;gap:8px;align-items:center;}" +
      ".lki-thead{font-size:11.5px;font-weight:600;color:#8E8BA6;padding:0 10px 8px;}" +
      ".lki-thead button{all:unset;cursor:pointer;display:inline-flex;gap:4px;align-items:center;justify-content:flex-end;width:100%;font-family:" + FONT + ";}" +
      ".lki-thead button.is-sort{color:#4A12B8;}" +
      ".lki-thead button .lki-ico{font-size:9px;}" +
      ".lki-thead div:first-child button{justify-content:flex-start;}" +
      ".lki-v{border-top:1px solid #F1EFF8;}" +
      ".lki-row{padding:11px 10px;cursor:pointer;border-radius:10px;}" +
      ".lki-row:hover{background:#FBFAFE;}" +
      ".lki-row:focus-visible{outline:2px solid #B79CF2;outline-offset:1px;}" +
      ".lki-name{font-size:14px;font-weight:600;line-height:1.3;overflow-wrap:anywhere;}" +
      ".lki-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;}" +
      ".lki-pill{font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;display:inline-flex;align-items:center;gap:4px;}" +
      ".lki-pill .lki-ico{font-size:9px;}" +
      ".lki-pill.working{background:#E7F7EE;color:#14623F;}" +
      ".lki-pill.stalls{background:#FFF1DD;color:#7A4A06;}" +
      ".lki-pill.seen{background:#EFEAFB;color:#4A2E9E;}" +
      ".lki-pill.low{background:#FDEBDD;color:#8A3D0C;}" +
      ".lki-pill.unseen{background:#FCE4E0;color:#8E2A1B;}" +
      ".lki-pill.notlive{background:#EFEDF6;color:#4A4761;}" +
      ".lki-pill.fresh{background:#E6F3FB;color:#1B5878;}" +
      ".lki-pill.plan{background:#F7F6FC;color:#6B6880;font-weight:500;}" +
      ".lki-cell{text-align:right;font-size:14px;font-variant-numeric:tabular-nums;}" +
      ".lki-cell small{display:block;font-size:11px;color:#8E8BA6;}" +
      ".lki-cell small.up{color:#1A7F55;}.lki-cell small.down{color:#B3400F;}" +
      ".lki-cell .lki-lbl{display:none;}" +
      ".lki-vbar{height:4px;border-radius:2px;background:#F1EFF8;margin-top:5px;overflow:hidden;}" +
      ".lki-vbar b{display:block;height:100%;border-radius:2px;background:" + C_VIEWS + ";}" +
      ".lki-caret{color:#8E8BA6;font-size:11px;transition:transform .15s;justify-self:end;}" +
      ".lki-v.is-open .lki-caret{transform:rotate(180deg);}" +
      ".lki-why{display:none;margin:0 10px 14px;background:#FBFAFE;border:1px solid #EEEDF6;border-radius:12px;padding:14px 16px;}" +
      ".lki-v.is-open .lki-why{display:block;}" +
      ".lki-why-h{font-size:13px;font-weight:700;margin:0 0 6px;}" +
      ".lki-why p{font-size:13px;line-height:1.55;color:#4A4761;margin:0 0 10px;}" +
      ".lki-why ul{margin:0 0 10px;padding:0;list-style:none;}" +
      ".lki-why li{font-size:13px;line-height:1.5;color:#4A4761;padding:3px 0 3px 22px;position:relative;}" +
      ".lki-why li .lki-ico{position:absolute;left:0;top:7px;font-size:12px;}" +
      ".lki-why li.gap .lki-ico{color:#B3580F;}.lki-why li.ok .lki-ico{color:#1A7F55;}" +
      ".lki-why-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:4px 24px;}" +
      /* simple ranked lists */
      ".lki-li{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #F1EFF8;font-size:13.5px;}" +
      ".lki-li:first-of-type{border-top:0;}" +
      ".lki-li-n{font-weight:700;font-variant-numeric:tabular-nums;}" +
      ".lki-li small{display:block;color:#8E8BA6;font-size:11.5px;margin-top:1px;}" +
      ".lki-hbar{grid-column:1/-1;height:6px;border-radius:3px;background:#F1EFF8;overflow:hidden;}" +
      ".lki-hbar b{display:block;height:100%;border-radius:3px;}" +
      ".lki-empty{font-size:13px;color:#8E8BA6;padding:6px 0;line-height:1.5;}" +
      ".lki-note{font-size:12px;color:#8E8BA6;margin:10px 0 0;line-height:1.5;}" +
      ".lki-flag{font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;background:#FFF1DD;color:#7A4A06;margin-left:6px;}" +
      /* health scorecard */
      ".lki-health{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;}" +
      ".lki-h{background:#FBFAFE;border:1px solid #EEEDF6;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;}" +
      ".lki-h.good{border-left:3px solid #5DCAA5;}.lki-h.bad{border-left:3px solid #EF9F27;}.lki-h.info{border-left:3px solid #B79CF2;}" +
      ".lki-h-l{font-size:12px;font-weight:600;color:#6B6880;}" +
      ".lki-h-n{font-size:22px;font-weight:700;letter-spacing:-.02em;margin:4px 0 2px;}" +
      ".lki-h-r{font-size:12.5px;color:#4A4761;line-height:1.5;margin:0 0 8px;}" +
      ".lki-h details{margin-top:auto;font-size:12px;color:#6B6880;line-height:1.55;}" +
      ".lki-h summary{cursor:pointer;font-weight:600;color:#4A12B8;list-style:none;}" +
      ".lki-h summary::-webkit-details-marker{display:none;}" +
      ".lki-h details p{margin:6px 0 0;}" +
      ".lki-h details a{color:#4A12B8;}" +
      /* funnel */
      ".lki-fn{display:grid;grid-template-columns:150px 1fr 90px;gap:10px;align-items:center;padding:6px 0;font-size:13px;}" +
      ".lki-fn-bar{height:22px;border-radius:4px;background:#F1EFF8;overflow:hidden;}" +
      ".lki-fn-bar b{display:block;height:100%;border-radius:4px;background:#8D6BE0;}" +
      ".lki-fn-n{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;}" +
      ".lki-fn-n small{display:block;font-weight:500;font-size:11px;color:#8E8BA6;}" +
      ".lki-wk{display:flex;align-items:flex-end;gap:6px;height:90px;margin-top:6px;}" +
      ".lki-wk>div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:10.5px;color:#8E8BA6;gap:3px;}" +
      ".lki-wk .stack{width:100%;max-width:34px;display:flex;flex-direction:column-reverse;gap:2px;flex:1;justify-content:flex-start;}" +
      ".lki-wk .stack b{display:block;border-radius:3px;min-height:0;}" +
      ".lki-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:#4A4761;margin:0 0 4px;}" +
      ".lki-legend i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:6px;vertical-align:-1px;}" +
      ".lki-gaps li{font-size:13px;line-height:1.55;color:#4A4761;margin:0 0 8px;}" +
      ".lki-gaps ul{margin:0;padding-left:18px;}" +
      "@media (max-width:760px){.lki-fn{grid-template-columns:110px 1fr 70px;}}" +
      ".lki-state{padding:40px 20px;text-align:center;font-size:14px;color:#6B6880;background:#fff;border:1px solid #E8E5F3;border-radius:16px;line-height:1.6;}" +
      "@media (max-width:760px){" +
        ".lki-thead{display:none;}" +
        ".lki-row{grid-template-columns:1fr 1fr 1fr 24px;row-gap:10px;}" +
        ".lki-row>.lki-namecell{grid-column:1/4;}" +
        ".lki-row>.lki-caret{grid-column:4;grid-row:1;}" +
        ".lki-cell{text-align:left;}" +
        ".lki-cell .lki-lbl{display:block;font-size:11px;color:#8E8BA6;}" +
        ".lki-cell.hide-sm{display:none;}" +
        ".lki-sm,.lki-axis{grid-template-columns:1fr;}" +
        ".lki-axis>span{display:none;}" +
        ".lki-h1{font-size:19px;}" +
        ".lki-card{padding:16px;}" +
      "}";
    document.head.appendChild(s);
  }

  // ── the "why": one diagnosis per storefront ────────────────
  function listings(v) { return (Number(v.n_services) || 0) + (Number(v.n_products) || 0); }
  // Shopper reach-outs. Contact clicks made from a signed-in vendor or admin
  // account are almost always one of us testing, so they never count as proof
  // that a storefront works; they are shown separately.
  function internal(v) { return Math.min(Number(v.contacts_internal) || 0, Number(v.contacts) || 0); }
  function reached(v) { return (Number(v.contacts) || 0) - internal(v) + (Number(v.inquiries) || 0); }
  // The seven storefront basics the checkup card already teaches vendors.
  function basics(v) {
    return [!!v.has_photo, (v.n_photos || 0) > 0, !!v.has_desc, !!v.has_tagline, !!v.has_tags, listings(v) >= 3, !!v.has_story];
  }
  function score(v) { return basics(v).filter(Boolean).length; }

  function diagnose(v, ctx) {
    var age = daysSince(v.published_at);
    var isNew = v.is_public && age != null && age < NEW_DAYS;
    var out = { key: '', label: '', summary: '', gaps: [], wins: [], isNew: isNew };

    if (!v.is_public) {
      out.key = 'notlive'; out.label = 'Not live';
      if (!v.name) out.summary = 'Signed up ' + (daysSince(v.created_at) != null ? daysSince(v.created_at) + ' days ago ' : '') + 'and never started the storefront. Shoppers cannot see it.';
      else if (!listings(v)) out.summary = 'The storefront is not on The Market yet because it has no service or product. Shoppers cannot see it.';
      else out.summary = 'The storefront is not published yet, so it is hidden from The Market.';
    } else if (reached(v) > 0) {
      out.key = 'working'; out.label = 'Working';
      out.summary = plural(reached(v), 'shopper') + ' reached out from ' + plural(v.views, 'view') + ' (' + pct(reached(v), v.views) + '% of views). This one is doing its job.';
    } else if (!v.views) {
      out.key = 'unseen'; out.label = 'Not seen';
      out.summary = 'Nobody opened this storefront in the last ' + ctx.days + ' days.' + (isNew ? ' It went live ' + age + ' days ago, so give it a little time.' : '');
    } else if (v.views >= JUDGE_VIEWS) {
      out.key = 'stalls'; out.label = 'Seen, no contact';
      out.summary = plural(v.views, 'view') + ' and no shopper reached out. People are finding it, so the storefront itself is where they stop.';
    } else if (v.views >= ctx.median) {
      out.key = 'seen'; out.label = 'Getting seen';
      out.summary = plural(v.views, 'view') + ' in ' + ctx.days + ' days, at or above the typical live storefront (' + num(Math.round(ctx.median)) + '). No shopper has reached out yet, but under ' + JUDGE_VIEWS + ' views that is too few to read anything into.';
    } else {
      out.key = 'low'; out.label = 'Low visibility';
      out.summary = 'Only ' + plural(v.views, 'view') + ' in ' + ctx.days + ' days (the typical live storefront got ' + num(Math.round(ctx.median)) + ').' + (isNew ? ' It went live ' + age + ' days ago.' : '');
    }

    function gap(t) { out.gaps.push(t); }
    function win(t) { out.wins.push(t); }
    if (v.name) {
      if (!v.has_photo) gap('No cover or profile photo, so the Market card shows a placeholder.'); else win('Has a cover photo');
      if (!v.n_photos) gap('No gallery photos on the storefront.'); else win(plural(v.n_photos, 'gallery photo'));
      if (!v.has_desc) gap('Description is missing or under 80 characters.'); else win('Has a full description');
      if (!v.has_tagline) gap('No tagline under the business name.');
      if (!v.has_tags) gap('No specialty tags, so tag filters and keyword search skip it.'); else win('Tagged with specialties');
      if (listings(v) === 0) gap('No services or products listed.');
      else if (listings(v) < 3) gap('Only ' + plural(listings(v), 'listing') + '. Three or more gives shoppers something to browse.');
      else win(plural(listings(v), 'listing'));
      if (!v.has_story) gap('No "Meet the owner" story.'); else win('Has an owner story');
      if (!v.shares) gap('They did not share their own link in this period. Most early traffic comes from the vendor sharing.');
      else win('Shared their link ' + plural(v.shares, 'time'));
      if (!v.plan_rank) gap('Free plan, so Best match ranks it below Pro and Featured.');
      if (ctx.searches >= SEARCH_MIN && !v.search_hits && v.is_public) gap('Matched none of the ' + num(ctx.searches) + ' Market searches in this period.');
      if (v.away) gap('Marked as away right now.');
      var vz = v.visit;
      if (ctx.hasVisit && v.is_public) {
        if (vz && vz.shown >= SHOWN_MIN && vz.opened_after_shown * 20 < vz.shown) gap('Listed on The Market in ' + plural(vz.shown, 'visit') + ' and opened from there in ' + num(vz.opened_after_shown) + '. The card itself (cover photo, name, tagline) is not earning the click.');
        else if (vz && vz.shown >= SHOWN_MIN) win('Opened in ' + num(vz.opened_after_shown) + ' of ' + plural(vz.shown, 'visit') + ' where The Market listed it');
        if (vz && vz.repeat_visitors) win(plural(vz.repeat_visitors, 'visitor') + ' came back to it on another day');
      }
      if (internal(v)) gap(plural(internal(v), 'contact click') + ' came from a signed-in vendor or admin account, so ' + (internal(v) === 1 ? 'it is' : 'they are') + ' not counted as a shopper reaching out.');
      if (v.reviews_all) win(plural(v.reviews_all, 'review'));
      if (v.favorites_all) win('Saved by ' + plural(v.favorites_all, 'shopper'));
    }
    return out;
  }

  function live0(rows, complete) {
    return rows.filter(function (r) { return r.v.is_public && ((score(r.v) >= 6) === complete); });
  }
  function avg(list) { var t = 0; list.forEach(function (r) { t += r.v.views; }); return list.length ? Math.round(t / list.length) : 0; }

  // ── the short version ──────────────────────────────────────
  function takeaways(d, rows) {
    var t = d.totals || {}, out = [];
    var reach = 0; rows.forEach(function (r) { reach += reached(r.v); });
    var inside = 0; rows.forEach(function (r) { inside += internal(r.v); });
    function push(tone, text) { out.push({ tone: tone, text: text }); }

    if (t.views_prev > 0) {
      var ch = Math.round(((t.views - t.views_prev) / t.views_prev) * 100);
      push(ch >= 0 ? 'good' : 'bad', 'Storefront views are ' + (ch >= 0 ? 'up ' : 'down ') + Math.abs(ch) + '% on the previous ' + d.days + ' days (' + num(t.views) + ' vs ' + num(t.views_prev) + ').');
    } else if (t.views) push('info', num(t.views) + ' storefront views in the last ' + d.days + ' days.');

    if (t.views) push(reach ? 'good' : 'bad',
      reach ? plural(reach, 'shopper reach-out') + ' from ' + num(t.views) + ' views (' + (pct(reach, t.views) || 'under 1') + '%).'
            : 'No shopper reached out to a vendor in this period, even with ' + num(t.views) + ' views.');
    if (inside) push('info', num(inside) + ' more contact ' + (inside === 1 ? 'click' : 'clicks') + ' came from signed-in vendor or admin accounts. Those look like testing, so this page leaves them out of every rate.');
    var full = live0(rows, true), thin = live0(rows, false);
    if (full.length >= 3 && thin.length >= 3) {
      var af = avg(full), at = avg(thin);
      if (af !== at) push(af > at ? 'good' : 'info', 'Storefronts with at least 6 of the 7 basics averaged ' + num(af) + ' views. The rest averaged ' + num(at) + '.');
    }

    var live = rows.filter(function (r) { return r.v.is_public; });
    var top = live.slice().sort(function (a, b) { return b.v.views - a.v.views; });
    if (top.length >= 3 && t.views) {
      var top3 = top[0].v.views + top[1].v.views + top[2].v.views;
      push('info', 'The top three storefronts (' + top[0].v.name + ', ' + top[1].v.name + ', ' + top[2].v.name + ') took ' + pct(top3, t.views) + '% of all views.');
    }
    var unseen = live.filter(function (r) { return r.dx.key === 'unseen' || r.dx.key === 'low'; });
    if (unseen.length) push('bad', plural(unseen.length, 'live storefront') + ' got little or no attention. Open them below to see why.');
    var stalls = live.filter(function (r) { return r.dx.key === 'stalls'; });
    if (stalls.length) push('bad', stalls.map(function (r) { return r.v.name; }).slice(0, 3).join(', ') + (stalls.length > 3 ? ' and ' + (stalls.length - 3) + ' more' : '') + (stalls.length === 1 ? ' is' : ' are') + ' being seen but nobody reaches out.');
    var notlive = rows.filter(function (r) { return r.dx.key === 'notlive'; });
    if (notlive.length) push('info', plural(notlive.length, 'signup') + ' never went live. A nudge could turn them into storefronts.');

    if (t.searches) {
      if (t.searches_zero) push('bad', num(t.searches_zero) + ' of ' + plural(t.searches, 'Market search', 'Market searches') + ' found nobody. Those terms are your recruiting list.');
      else push('good', 'Every one of the ' + plural(t.searches, 'Market search', 'Market searches') + ' found at least one vendor.');
    }
    var empty = (d.categories || []).filter(function (c) { return !c.vendors; });
    if (empty.length) push('info', 'No live vendors yet in ' + empty.map(function (c) { return c.name; }).join(' or ') + '.');
    return out;
  }

  // ── sections ───────────────────────────────────────────────
  function card(title, sub) {
    var c = el('div', 'lki-card');
    c.appendChild(el('h3', 'lki-card-h', title));
    if (sub) c.appendChild(el('p', 'lki-card-s', sub));
    return c;
  }

  function kpi(label, value, prev, hint) {
    var k = el('div', 'lki-kpi');
    k.appendChild(el('div', 'lki-kpi-l', label));
    k.appendChild(el('div', 'lki-kpi-n', typeof value === 'string' ? value : num(value)));
    var dl = el('div', 'lki-kpi-d');
    if (prev != null && typeof value === 'number') {
      if (prev > 0) {
        var ch = Math.round(((value - prev) / prev) * 100);
        dl.className += ch > 0 ? ' up' : (ch < 0 ? ' down' : '');
        if (ch !== 0) dl.appendChild(icon(ch > 0 ? 'up' : 'down'));
        dl.appendChild(document.createTextNode((ch === 0 ? 'No change' : Math.abs(ch) + '%') + ' vs previous (' + num(prev) + ')'));
      } else dl.textContent = value > 0 ? 'None in the previous period' : '';
    } else if (hint) dl.textContent = hint;
    k.appendChild(dl);
    return k;
  }

  // Weekly buckets past 45 days so bars stay readable.
  function bucket(daily) {
    if (daily.length <= 45) return daily.map(function (r) { return { label: shortDay(r.d), views: r.views, contacts: r.contacts, searches: r.searches }; });
    var out = [];
    for (var i = 0; i < daily.length; i += 7) {
      var chunk = daily.slice(i, i + 7), b = { views: 0, contacts: 0, searches: 0 };
      chunk.forEach(function (r) { b.views += r.views; b.contacts += r.contacts; b.searches += r.searches; });
      b.label = 'Week of ' + shortDay(chunk[0].d);
      out.push(b);
    }
    return out;
  }

  function trendCard(d) {
    var data = bucket(d.daily || []);
    var weekly = (d.daily || []).length > 45;
    var c = card('Day by day', 'Each row has its own scale, so compare shapes, not heights across rows. Hover or tap a ' + (weekly ? 'week' : 'day') + ' for the numbers.');
    if (!data.length) { c.appendChild(el('div', 'lki-empty', 'No activity recorded yet.')); return c; }
    var chart = el('div', 'lki-chart');
    var tip = el('div', 'lki-tip'); chart.appendChild(tip);
    var series = [['views', 'Storefront views', C_VIEWS, true], ['contacts', 'Reach-outs', C_CONTACTS, false], ['searches', 'Market searches', C_SEARCH, false]];
    var cols = [];
    series.forEach(function (s) {
      var max = 0; data.forEach(function (r) { if (r[s[0]] > max) max = r[s[0]]; });
      var row = el('div', 'lki-sm');
      var lab = el('div', 'lki-sm-l');
      var sw = document.createElement('i'); sw.style.background = s[2]; lab.appendChild(sw);
      var lt = el('span', null, s[1]); lt.appendChild(el('small', null, 'peak ' + num(max))); lab.appendChild(lt);
      row.appendChild(lab);
      var bars = el('div', 'lki-bars' + (s[3] ? ' tall' : ''));
      data.forEach(function (r, i) {
        var col = el('div', 'lki-col');
        var b = document.createElement('b');
        b.style.background = s[2];
        b.style.height = max ? Math.max(r[s[0]] ? 3 : 0, Math.round((r[s[0]] / max) * 100)) + '%' : '0';
        col.appendChild(b); bars.appendChild(col);
        (cols[i] = cols[i] || []).push(col);
        col.setAttribute('data-i', String(i));
      });
      row.appendChild(bars); chart.appendChild(row);
    });
    var axis = el('div', 'lki-axis'); axis.appendChild(el('span'));
    var ends = el('div'); ends.appendChild(el('span', null, data[0].label)); ends.appendChild(el('span', null, data[data.length - 1].label));
    axis.appendChild(ends); chart.appendChild(axis);

    var hot = -1;
    function show(i, x) {
      if (i === hot) { place(x); return; }
      if (hot >= 0 && cols[hot]) cols[hot].forEach(function (n) { n.classList.remove('is-hot'); });
      hot = i;
      if (i < 0) { tip.style.display = 'none'; return; }
      cols[i].forEach(function (n) { n.classList.add('is-hot'); });
      var r = data[i]; tip.innerHTML = '';
      tip.appendChild(el('strong', null, r.label));
      series.forEach(function (s) {
        var line = el('div'); var sw = document.createElement('i'); sw.style.background = s[2];
        line.appendChild(sw); line.appendChild(document.createTextNode(s[1] + ': ' + num(r[s[0]]))); tip.appendChild(line);
      });
      tip.style.display = 'block'; place(x);
    }
    function place(x) {
      var w = chart.offsetWidth, tw = tip.offsetWidth || 150;
      tip.style.left = Math.max(0, Math.min(w - tw, x - tw / 2)) + 'px'; tip.style.top = '-6px';
    }
    function onMove(ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('.lki-col') : null;
      var rect = chart.getBoundingClientRect();
      var cx = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX) - rect.left;
      show(t ? Number(t.getAttribute('data-i')) : -1, cx);
    }
    chart.addEventListener('mousemove', onMove);
    chart.addEventListener('click', onMove);
    chart.addEventListener('mouseleave', function () { show(-1, 0); });
    c.appendChild(chart);
    return c;
  }

  function vendorCard(d, rows) {
    var c = card('Who is getting seen', 'Every active storefront, most viewed first. Tap one to see why it is or is not working and what to fix.');
    var FILTERS = [['all', 'All'], ['working', 'Working'], ['seen', 'Getting seen'], ['stalls', 'Seen, no contact'], ['low', 'Low visibility'], ['unseen', 'Not seen'], ['notlive', 'Not live']];
    var SORTS = [['name', 'Storefront'], ['views', 'Views'], ['search_hits', 'In searches'], ['reach', 'Reach-outs'], ['rate', 'Reach-out rate'], ['score', 'Basics']];
    var st = { filter: 'all', sort: 'views', dir: -1, open: {} };
    var hasVisit = !!d.visit;
    if (hasVisit) SORTS[2] = ['shown', 'Listed / opened'];
    var maxViews = 0; rows.forEach(function (r) { if (r.v.views > maxViews) maxViews = r.v.views; });

    var tools = el('div', 'lki-tools'); c.appendChild(tools);
    var thead = el('div', 'lki-thead'); c.appendChild(thead);
    var body = el('div'); c.appendChild(body);

    function val(r, k) {
      if (k === 'name') return String(r.v.name || '~').toLowerCase();
      if (k === 'reach') return reached(r.v);
      if (k === 'rate') return r.v.views ? reached(r.v) / r.v.views : -1;
      if (k === 'score') return score(r.v);
      if (k === 'shown') return r.v.visit ? r.v.visit.shown : 0;
      return Number(r.v[k]) || 0;
    }
    function paintTools() {
      tools.innerHTML = '';
      FILTERS.forEach(function (f) {
        var n = f[0] === 'all' ? rows.length : rows.filter(function (r) { return r.dx.key === f[0]; }).length;
        if (!n && f[0] !== 'all') return;
        var b = el('button', 'lki-chip' + (st.filter === f[0] ? ' is-on' : '')); b.type = 'button';
        b.appendChild(document.createTextNode(f[1])); b.appendChild(el('span', null, String(n)));
        b.addEventListener('click', function () { st.filter = f[0]; paint(); });
        tools.appendChild(b);
      });
      tools.appendChild(el('div', 'lki-spacer'));
      var dl = el('button', 'lki-link'); dl.type = 'button'; dl.appendChild(icon('dl')); dl.appendChild(document.createTextNode('Download CSV'));
      dl.addEventListener('click', function () { downloadCSV(d, rows); });
      tools.appendChild(dl);
    }
    function paintHead() {
      thead.innerHTML = '';
      SORTS.forEach(function (s) {
        var cell = el('div'); var b = el('button', st.sort === s[0] ? 'is-sort' : ''); b.type = 'button';
        b.appendChild(document.createTextNode(s[1]));
        if (st.sort === s[0]) b.appendChild(icon(st.dir < 0 ? 'down' : 'up'));
        b.addEventListener('click', function () {
          if (st.sort === s[0]) st.dir = -st.dir; else { st.sort = s[0]; st.dir = s[0] === 'name' ? 1 : -1; }
          paint();
        });
        cell.appendChild(b); thead.appendChild(cell);
      });
      thead.appendChild(el('div'));
    }
    function cell(label, main, sub, subCls, hideSm) {
      var n = el('div', 'lki-cell' + (hideSm ? ' hide-sm' : ''));
      n.appendChild(el('span', 'lki-lbl', label));
      n.appendChild(document.createTextNode(main));
      if (sub) n.appendChild(el('small', subCls || null, sub));
      return n;
    }
    function paintRows() {
      body.innerHTML = '';
      var list = rows.filter(function (r) { return st.filter === 'all' || r.dx.key === st.filter; });
      list.sort(function (a, b) {
        var x = val(a, st.sort), y = val(b, st.sort);
        if (x < y) return -1 * st.dir; if (x > y) return 1 * st.dir;
        return b.v.views - a.v.views;
      });
      if (!list.length) { body.appendChild(el('div', 'lki-empty', 'No storefronts in this group.')); return; }
      list.forEach(function (r) {
        var v = r.v, dx = r.dx;
        var wrap = el('div', 'lki-v' + (st.open[v.id] ? ' is-open' : ''));
        var row = el('div', 'lki-row'); row.tabIndex = 0; row.setAttribute('role', 'button');
        row.setAttribute('aria-expanded', st.open[v.id] ? 'true' : 'false');

        var nameCell = el('div', 'lki-namecell');
        nameCell.appendChild(el('div', 'lki-name', v.name || 'Unnamed signup'));
        var tags = el('div', 'lki-tags');
        var pill = el('span', 'lki-pill ' + dx.key);
        if (dx.key === 'working') pill.appendChild(icon('check')); else if (dx.key === 'seen') pill.appendChild(icon('eye')); else if (dx.key !== 'notlive') pill.appendChild(icon('warn'));
        pill.appendChild(document.createTextNode(dx.label)); tags.appendChild(pill);
        if (dx.isNew) tags.appendChild(el('span', 'lki-pill fresh', 'New'));
        tags.appendChild(el('span', 'lki-pill plan', (PLAN[v.plan_rank] || 'Free') + (v.is_founding ? ' · Founding' : '')));
        nameCell.appendChild(tags);
        var vb = el('div', 'lki-vbar'); var vbb = document.createElement('b');
        vbb.style.width = maxViews ? Math.round((v.views / maxViews) * 100) + '%' : '0'; vb.appendChild(vbb); nameCell.appendChild(vb);
        row.appendChild(nameCell);

        var delta = null, dCls = null;
        if (v.views_prev > 0) { var ch = Math.round(((v.views - v.views_prev) / v.views_prev) * 100); delta = (ch > 0 ? '+' : '') + ch + '%'; dCls = ch > 0 ? 'up' : (ch < 0 ? 'down' : null); }
        else if (v.views > 0) delta = 'new';
        row.appendChild(cell('Views', num(v.views), delta, dCls));
        if (hasVisit) row.appendChild(cell('Listed / opened', v.visit ? num(v.visit.shown) + ' / ' + num(v.visit.opened_after_shown) : '0 / 0', v.visit && v.visit.shown ? pct(v.visit.opened_after_shown, v.visit.shown) + '% opened' : null, null, true));
        else row.appendChild(cell('In searches', num(v.search_hits), null, null, true));
        row.appendChild(cell('Reach-outs', num(reached(v)), internal(v) ? '+' + internal(v) + ' internal' : null));
        row.appendChild(cell('Rate', v.views ? pct(reached(v), v.views) + '%' : '0%'));
        row.appendChild(cell('Basics', score(v) + ' of 7', null, null, true));
        row.appendChild(icon('chev', 'lki-caret'));
        wrap.appendChild(row);

        var why = el('div', 'lki-why');
        why.appendChild(el('div', 'lki-why-h', dx.key === 'working' ? 'Why it is working' : 'Why'));
        why.appendChild(el('p', null, dx.summary));
        if (dx.gaps.length || dx.wins.length) {
          var colsEl = el('div', 'lki-why-cols');
          if (dx.gaps.length) {
            var g = el('div'); g.appendChild(el('div', 'lki-why-h', 'Likely holding it back'));
            var gu = el('ul'); dx.gaps.forEach(function (t) { var li = el('li', 'gap'); li.appendChild(icon('warn')); li.appendChild(document.createTextNode(t)); gu.appendChild(li); });
            g.appendChild(gu); colsEl.appendChild(g);
          }
          if (dx.wins.length) {
            var w = el('div'); w.appendChild(el('div', 'lki-why-h', 'Already in place'));
            var wu = el('ul'); dx.wins.forEach(function (t) { var li = el('li', 'ok'); li.appendChild(icon('check')); li.appendChild(document.createTextNode(t)); wu.appendChild(li); });
            w.appendChild(wu); colsEl.appendChild(w);
          }
          why.appendChild(colsEl);
        }
        if (v.slug && v.is_public) {
          var a = el('a', 'lki-link'); a.href = '/' + encodeURIComponent(v.slug); a.target = '_blank'; a.rel = 'noopener';
          a.appendChild(document.createTextNode('Open storefront')); a.appendChild(icon('out')); why.appendChild(a);
        }
        wrap.appendChild(why);

        function toggle() {
          st.open[v.id] = !st.open[v.id];
          wrap.classList.toggle('is-open', !!st.open[v.id]);
          row.setAttribute('aria-expanded', st.open[v.id] ? 'true' : 'false');
        }
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
        body.appendChild(wrap);
      });
    }
    function paint() { paintTools(); paintHead(); paintRows(); }
    paint();
    return c;
  }

  function downloadCSV(d, rows) {
    var head = ['Storefront', 'Status', 'Plan', 'Founding', 'Live', 'Views', 'Views previous period', 'In searches', 'Shopper reach-outs', 'Clicks from vendor or admin accounts', 'Basics out of 7', 'Shares', 'Saves', 'Reviews', 'Services', 'Products', 'Gallery photos', 'Likely holding it back'];
    var lines = [head];
    rows.forEach(function (r) {
      var v = r.v;
      lines.push([v.name || 'Unnamed signup', r.dx.label, PLAN[v.plan_rank] || 'Free', v.is_founding ? 'yes' : 'no', v.is_public ? 'yes' : 'no',
        v.views, v.views_prev, v.search_hits, reached(v), internal(v), score(v), v.shares, v.favorites_all, v.reviews_all, v.n_services, v.n_products, v.n_photos, r.dx.gaps.join(' | ')]);
    });
    var csv = lines.map(function (l) {
      return l.map(function (x) {
        var s = String(x == null ? '' : x);
        if (/^[=+\-@]/.test(s)) s = "'" + s; // no formula injection from a business name
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    try {
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = 'lokali-insights-' + d.days + 'd.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {}
  }

  function rankList(items, color, emptyText) {
    var box = el('div');
    if (!items.length) { box.appendChild(el('div', 'lki-empty', emptyText)); return box; }
    var max = 0; items.forEach(function (i) { if (i.n > max) max = i.n; });
    items.forEach(function (i) {
      var li = el('div', 'lki-li');
      var l = el('div', null, i.label); if (i.flag) l.appendChild(el('span', 'lki-flag', i.flag));
      if (i.sub) l.appendChild(el('small', null, i.sub));
      li.appendChild(l); li.appendChild(el('div', 'lki-li-n', i.value != null ? i.value : num(i.n)));
      if (color) { var hb = el('div', 'lki-hbar'); var b = document.createElement('b'); b.style.background = color; b.style.width = max ? Math.max(i.n ? 2 : 0, Math.round((i.n / max) * 100)) + '%' : '0'; hb.appendChild(b); li.appendChild(hb); }
      box.appendChild(li);
    });
    return box;
  }

  var CHANNEL = { call: 'Call', sms: 'Text message', whatsapp: 'WhatsApp', email: 'Email', instagram: 'Instagram', website: 'Website click', venmo: 'Venmo', zelle: 'Zelle', cashapp: 'Cash App', paypal: 'PayPal', buy: 'Buy link', booking: 'Booking link', 'inquiry form': 'Inquiry form' };
  var SHARE = { copy_link: 'Copied link', whatsapp: 'WhatsApp', sms: 'Text message', email: 'Email', qr: 'QR code', packaging: 'Packaging insert', email_signature: 'Email signature', etsy_about: 'Etsy About section', other: 'Other' };
  function nice(map, k) { return map[k] || String(k || 'other').replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); }

  function searchCards(d) {
    var g = el('div', 'lki-grid2');
    var since = d.search_log_since ? daysSince(d.search_log_since) : null;
    var young = since != null && since < d.days;
    var a = card('What shoppers search for', 'Words typed into Market search, most frequent first, with how many vendors each one found.');
    a.appendChild(rankList((d.search_terms || []).slice(0, 12).map(function (t) {
      return { label: t.term, n: t.n, sub: t.avg_results ? 'found ' + plural(t.avg_results, 'vendor') : 'found nobody', value: num(t.n) + (t.n === 1 ? ' search' : ' searches') };
    }), C_SEARCH, 'No searches logged in this period.'));
    if (young) a.appendChild(el('p', 'lki-note', 'Search logging began ' + since + ' days ago, so this list is still thin.'));
    g.appendChild(a);
    var z = card('Searched for, found nobody', 'Demand with no supply. Each term here is a vendor worth recruiting, or a tag or keyword worth adding to an existing one.');
    z.appendChild(rankList((d.search_zero || []).slice(0, 12).map(function (t) {
      return { label: t.term, n: t.n, value: num(t.n) + (t.n === 1 ? ' search' : ' searches') };
    }), null, (d.totals && d.totals.searches) ? 'Every search found at least one vendor.' : 'No searches logged in this period.'));
    g.appendChild(z);
    return g;
  }

  function supplyCards(d) {
    var g = el('div', 'lki-grid2');
    var c = card('Categories: supply vs attention', 'Live vendors in each category and the views they drew. A category with views and few vendors has room; one with no vendors is a gap on The Market.');
    c.appendChild(rankList((d.categories || []).slice().sort(function (a, b) { return b.views - a.views; }).map(function (k) {
      return { label: k.name, n: k.views, flag: !k.vendors ? 'no vendors' : null,
        sub: plural(k.vendors, 'live vendor') + ' · ' + plural(k.contacts, 'contact click') + (k.vendors ? ' · ' + num(Math.round(k.views / k.vendors)) + ' views per vendor' : ''),
        value: plural(k.views, 'view') };
    }), C_VIEWS, 'No categories.'));
    g.appendChild(c);
    var l = card('Areas', 'Live vendors serving each area. Most vendors serve several areas, so their views count in each one.');
    l.appendChild(rankList((d.locations || []).slice().sort(function (a, b) { return b.vendors - a.vendors; }).map(function (k) {
      return { label: k.name, n: k.vendors, sub: plural(k.views, 'view') + ' of vendors serving it' + (k.searches ? ' · ' + plural(k.searches, 'search', 'searches') + ' filtered to it' : ''), value: plural(k.vendors, 'vendor') };
    }), C_CONTACTS, 'No areas.'));
    g.appendChild(l);
    return g;
  }

  function behaviourCards(d) {
    var g = el('div', 'lki-grid2');
    var ch = card('How shoppers reach out', 'Which button people press when they decide to contact a vendor.');
    ch.appendChild(rankList((d.contact_channels || []).map(function (k) { return { label: nice(CHANNEL, k.channel), n: k.n }; }), C_CONTACTS, 'No reach-outs in this period.'));
    g.appendChild(ch);
    var it = card('Most viewed listings', 'Individual services and products shoppers opened most.');
    it.appendChild(rankList((d.top_items || []).slice(0, 8).map(function (k) {
      return { label: k.name, n: k.views, sub: k.vendor + ' · ' + (k.kind === 'service' ? 'Service' : 'Product'), value: plural(k.views, 'view') };
    }), C_VIEWS, 'No listing views in this period.'));
    var src = {}; (d.view_sources || []).forEach(function (s) { src[s.source] = s.n; });
    var tot = (src.listing || 0) + (src.service || 0) + (src.product || 0);
    if (tot) it.appendChild(el('p', 'lki-note', pct(src.listing || 0, tot) + '% of views were storefront pages, ' + pct(src.service || 0, tot) + '% services, ' + pct(src.product || 0, tot) + '% products.'));
    g.appendChild(it);
    return g;
  }

  function sharesCard(d) {
    var s = d.shares || {}, t = d.totals || {};
    var byO = {}; (s.by_origin || []).forEach(function (o) { byO[o.origin] = o.n; });
    var c = card('Word of mouth', 'Share links created, and how many brought someone back to the site.');
    var k = el('div', 'lki-kpis'); k.style.margin = '0 0 6px';
    k.appendChild(kpi('Links shared', t.shares || 0, t.shares_prev));
    k.appendChild(kpi('By vendors', byO.vendor || 0, null, 'their own storefront'));
    k.appendChild(kpi('By shoppers', byO.customer || 0, null, 'the ones that count as referrals'));
    k.appendChild(kpi('Visits from a shared link', s.landings || 0, null, plural(s.converted || 0, 'went') + ' on to act'));
    k.appendChild(kpi('QR scans', t.qr_scans || 0, null, 'printed codes'));
    c.appendChild(k);
    c.appendChild(rankList((s.by_channel || []).map(function (x) { return { label: nice(SHARE, x.channel), n: x.n }; }), C_SEARCH, 'No shares in this period.'));
    return c;
  }

  // ── marketplace health: the metrics the marketplace literature says matter
  // at this stage. Every "why" cites a source that was opened and checked
  // (2026-09-19). No invented benchmark targets: where no credible published
  // target exists, the card says what direction is good and nothing more.
  var SRC = {
    a16z: ['a16z, 13 Metrics for Marketplace Companies', 'https://a16z.com/13-metrics-for-marketplace-companies/'],
    lennyMetrics: ['Lenny Rachitsky, The most important marketplace metrics', 'https://www.lennysnewsletter.com/p/the-most-important-marketplace-metrics'],
    lennyKick: ['Lenny Rachitsky, How to kickstart and scale a marketplace', 'https://www.lennysnewsletter.com/p/how-to-kickstart-and-scale-a-marketplace'],
    supply: ['Lenny Rachitsky, 28 ways to grow supply in a marketplace', 'https://andrewchen.com/grow-marketplace-supply/'],
    gurley: ['Bill Gurley, All Markets Are Not Created Equal', 'https://abovethecrowd.com/2012/11/13/all-markets-are-not-created-equal-10-factors-to-consider-when-evaluating-digital-marketplaces/'],
    baymard: ['Baymard Institute, no-results pages', 'https://baymard.com/blog/no-results-page'],
    google: ['Google Business Profile Help', 'https://support.google.com/business/answer/10515606'],
    airbnb: ['Zhang, Lee, Singh and Srinivasan, ICIS 2016', 'https://aisel.aisnet.org/icis2016/Crowdsourcing/Presentations/8/'],
    spiegel: ['Spiegel Research Center, How Online Reviews Influence Sales', 'https://spiegel.medill.northwestern.edu/how-online-reviews-influence-sales/'],
    hbr: ['Harvard Business Review, The Short Life of Online Sales Leads', 'https://hbr.org/2011/03/the-short-life-of-online-sales-leads']
  };

  function healthTile(o) {
    var t = el('div', 'lki-h ' + (o.tone || 'info'));
    t.appendChild(el('div', 'lki-h-l', o.label));
    t.appendChild(el('div', 'lki-h-n', o.value));
    t.appendChild(el('p', 'lki-h-r', o.reading));
    var dt = document.createElement('details');
    dt.appendChild(el('summary', null, 'Why this matters'));
    dt.appendChild(el('p', null, o.why));
    if (o.src && o.src.length) {
      var sp = el('p'); sp.appendChild(document.createTextNode('Source: '));
      o.src.forEach(function (k, i) {
        if (i) sp.appendChild(document.createTextNode(' · '));
        var a = el('a', null, SRC[k][0]); a.href = SRC[k][1]; a.target = '_blank'; a.rel = 'noopener'; sp.appendChild(a);
      });
      dt.appendChild(sp);
    }
    t.appendChild(dt);
    return t;
  }

  function healthCard(d, rows) {
    var t = d.totals || {}, f = d.funnel || {}, L = d.leads || {};
    var live = rows.filter(function (r) { return r.v.is_public; });
    var nLive = live.length;
    var reach = 0; rows.forEach(function (r) { reach += reached(r.v); });
    var withReach = live.filter(function (r) { return reached(r.v) > 0; }).length;
    var zeros = live.filter(function (r) { return !r.v.views; }).length;
    var sorted = live.slice().sort(function (a, b) { return b.v.views - a.v.views; });
    var top3 = 0; sorted.slice(0, 3).forEach(function (r) { top3 += r.v.views; });
    var liveViews = 0; live.forEach(function (r) { liveViews += r.v.views; });
    var sc = 0; live.forEach(function (r) { sc += score(r.v); });
    var complete = live.filter(function (r) { return score(r.v) >= 6; }).length;
    var reviewed = live.filter(function (r) { return r.v.reviews_all > 0; }).length;
    var cats = d.categories || [];
    var thin = cats.filter(function (k) { return k.vendors < 3; }).length;
    var biggest = cats.slice().sort(function (a, b) { return b.vendors - a.vendors; })[0];
    var fill = t.searches ? pct(t.searches - (t.searches_zero || 0), t.searches) : null;

    var c = card('Marketplace health', 'The handful of measures marketplace operators and researchers point to for a marketplace at this stage. Open "Why this matters" on any of them for the reasoning and the source.');
    var g = el('div', 'lki-health');

    g.appendChild(healthTile({ label: 'Seller liquidity', tone: withReach ? (withReach * 2 >= nLive ? 'good' : 'bad') : 'bad',
      value: withReach + ' of ' + nLive, reading: 'live storefronts had a shopper reach out in the last ' + d.days + ' days. This is the number that decides whether vendors stay and pay.',
      why: 'Liquidity is how reliably each side finds the other. a16z calls it match rate and tells operators to count the "zeros", the people who show up and get nothing. For Lokali the seller side is: did a live storefront get at least one lead this period? There is no credible published target for a contact-based local marketplace, so watch the direction, and treat every storefront at zero as a named to-do.',
      src: ['a16z', 'lennyMetrics'] }));

    g.appendChild(healthTile({ label: 'Buyer liquidity (reach-out rate)', tone: reach ? 'info' : 'bad',
      value: (t.views ? pct(reach, t.views) : 0) + '%', reading: plural(reach, 'shopper reach-out') + ' from ' + plural(t.views || 0, 'storefront view') + '. Vendor and admin test clicks are excluded.',
      why: 'Lenny Rachitsky ranks fill rate, the share of intentional visits that end in a completed match, as the single most important marketplace metric. Lokali has no checkout, so the closest honest equivalent is a storefront view that ends in a contact click or inquiry. It undercounts: a shopper who memorises a phone number or walks in is invisible here.',
      src: ['lennyMetrics'] }));

    g.appendChild(healthTile({ label: 'Search fill rate', tone: fill == null ? 'info' : (fill >= 80 ? 'good' : 'bad'),
      value: fill == null ? 'No searches' : fill + '%', reading: fill == null ? 'Nobody used Market search in this period.' : plural(t.searches_zero || 0, 'search', 'searches') + ' of ' + num(t.searches) + ' found nobody. Those terms are listed further down.',
      why: 'A search that returns nothing is a shopper leaving empty-handed, and Baymard found nearly half of sites give people no good way to recover from one. On Lokali a no-result term is also free market research: it names a vendor to recruit or a tag to add. No primary source publishes a healthy percentage, so none is shown.',
      src: ['a16z', 'baymard'] }));

    g.appendChild(healthTile({ label: 'Storefronts nobody saw', tone: zeros ? 'bad' : 'good',
      value: zeros + ' of ' + nLive, reading: zeros ? 'live storefronts had zero views. Each one is listed below with likely reasons.' : 'Every live storefront was opened at least once in this period.',
      why: 'Same idea as counting the zeros on the buyer side. A vendor who is never seen has no reason to stay, upgrade or tell anyone, and no amount of average traffic fixes that for them.',
      src: ['a16z'] }));

    g.appendChild(healthTile({ label: 'Attention concentration', tone: 'info',
      value: (liveViews ? pct(top3, liveViews) : 0) + '%', reading: 'of live storefront views went to the top three. With ' + nLive + ' vendors some concentration is normal, so watch whether it falls as you grow.',
      why: 'a16z and Bill Gurley both treat fragmentation as a strength: a marketplace that depends on a few sellers is fragile, and those sellers need it least. They write about sales share and market structure, so use this as a trend line, not a pass or fail.',
      src: ['a16z', 'gurley'] }));

    g.appendChild(healthTile({ label: 'Vendor activation', tone: (f.signed_up && f.live * 10 >= f.signed_up * 8) ? 'good' : 'bad',
      value: (f.live || 0) + ' of ' + (f.signed_up || 0) + ' live', reading: 'signups went live' + (f.median_days_live_to_first_reach != null ? ', and the typical vendor who got a shopper reach-out waited ' + f.median_days_live_to_first_reach + ' days for the first one.' : '. No storefront has had a shopper reach-out yet.'),
      why: 'Airbnb defined an activated host as a new listing that got its first booking within its first month, and built onboarding around that moment. The Lokali equivalent is a first shopper reach-out within 30 days of going live. No published study proves early leads cause retention, so test it on your own vendors as the numbers grow.',
      src: ['supply'] }));

    g.appendChild(healthTile({ label: 'Storefront basics', tone: complete * 2 >= nLive ? 'good' : 'bad',
      value: (nLive ? (sc / nLive).toFixed(1) : '0') + ' of 7', reading: 'average across live storefronts. ' + complete + ' of ' + nLive + ' have at least six: cover photo, gallery, full description, tagline, tags, three or more listings, owner story.',
      why: 'Google reports customers are 2.7 times more likely to consider a business reputable when its profile is complete, and 70% more likely to visit. On Airbnb, listings with verified professional photos were booked 9% more often. Different platforms, same direction: a finished storefront with real photos is the cheapest lever a vendor has.',
      src: ['google', 'airbnb'] }));

    g.appendChild(healthTile({ label: 'Storefronts with a review', tone: reviewed ? 'info' : 'bad',
      value: reviewed + ' of ' + nLive, reading: plural(t.reviews || 0, 'new review') + ' in this period.',
      why: 'Northwestern\'s Spiegel Research Center found a product with five reviews is 270% more likely to be bought than one with none. That is retail data, so treat it as directional, but the first few reviews on a storefront are worth far more than the fiftieth.',
      src: ['spiegel'] }));

    var replyVal = L.inquiries ? (L.median_reply_hours != null ? L.median_reply_hours + ' h' : 'No replies') : 'No inquiries';
    g.appendChild(healthTile({ label: 'Vendor reply speed', tone: L.inquiries_waiting_24h ? 'bad' : 'info',
      value: replyVal, reading: L.inquiries ? num(L.inquiries_replied || 0) + ' of ' + plural(L.inquiries, 'inquiry', 'inquiries') + ' answered' + (L.inquiries_waiting_24h ? ', ' + num(L.inquiries_waiting_24h) + ' waiting over 24 hours.' : '.') : 'No inquiry-form messages in this period. Calls, texts and website clicks happen off Lokali, so replies to those cannot be measured.',
      why: 'A Harvard Business Review study of 1.25 million sales leads found firms that responded within an hour were nearly seven times as likely to qualify the lead as those who waited even an hour longer, and more than 60 times as likely as those who waited a day. It is correlational, but it is the best evidence there is that a slow vendor wastes the lead you worked to send them.',
      src: ['hbr'] }));

    g.appendChild(healthTile({ label: 'Category density', tone: 'info',
      value: thin + ' of ' + cats.length + ' thin', reading: 'categories have fewer than three live vendors.' + (biggest ? ' The deepest is ' + biggest.name + ' with ' + biggest.vendors + '.' : ''),
      why: 'Of 17 marketplaces Lenny Rachitsky studied, all but one launched constrained to a single geography or category, because a shopper needs real choice in the thing they came for. OpenTable aimed for 50 to 100 restaurants in a city before it felt useful. Depth in one or two categories in The Woodlands will do more than one vendor in each of nine.',
      src: ['lennyKick'] }));

    c.appendChild(g);
    return c;
  }

  function funnelCard(d) {
    var f = d.funnel || {};
    var c = card('Vendor activation funnel', 'Every vendor signup so far, and how far each got. The biggest drop between two steps is where your onboarding effort pays back most.');
    var steps = [['Signed up', f.signed_up], ['Named the business', f.named], ['Added a listing', f.has_listing], ['Went live', f.live], ['Got a view', f.seen], ['Got a shopper reach-out', f.contacted]];
    var top = steps[0][1] || 0;
    steps.forEach(function (st, i) {
      var row = el('div', 'lki-fn');
      row.appendChild(el('div', null, st[0]));
      var bar = el('div', 'lki-fn-bar'); var b = document.createElement('b'); b.style.width = top ? Math.max(st[1] ? 2 : 0, Math.round(((st[1] || 0) / top) * 100)) + '%' : '0'; bar.appendChild(b); row.appendChild(bar);
      var n = el('div', 'lki-fn-n', num(st[1] || 0));
      if (i) n.appendChild(el('small', null, (steps[i - 1][1] ? pct(st[1] || 0, steps[i - 1][1]) : 0) + '% of previous'));
      row.appendChild(n); c.appendChild(row);
    });
    var bits = [];
    if (f.median_days_to_live != null) bits.push('Typical time from signup to live: ' + (Number(f.median_days_to_live) < 1 ? 'under a day' : f.median_days_to_live + ' days') + '.');
    if (f.median_days_live_to_first_reach != null) bits.push('Typical wait from live to first shopper reach-out: ' + f.median_days_live_to_first_reach + ' days.');
    if (bits.length) c.appendChild(el('p', 'lki-note', bits.join(' ')));
    return c;
  }

  function growthCard(d) {
    var wk = d.weekly || [];
    var c = card('Growth by week', 'New vendor signups (and how many of them are live today) next to new shopper accounts, for the last eight weeks.');
    if (!wk.length) { c.appendChild(el('div', 'lki-empty', 'No signups yet.')); return c; }
    var lg = el('div', 'lki-legend');
    [['#8D6BE0', 'Vendors, now live'], ['#CFC0F3', 'Vendors, not live'], [C_SEARCH, 'Shopper accounts']].forEach(function (x) {
      var s = el('span'); var i = document.createElement('i'); i.style.background = x[0]; s.appendChild(i); s.appendChild(document.createTextNode(x[1])); lg.appendChild(s);
    });
    c.appendChild(lg);
    var max = 1; wk.forEach(function (w) { max = Math.max(max, w.vendors, w.shoppers); });
    var box = el('div', 'lki-wk');
    wk.forEach(function (w) {
      var col = el('div'); col.title = 'Week of ' + shortDay(w.week) + ': ' + plural(w.vendors, 'vendor signup') + ' (' + w.went_live + ' live), ' + plural(w.shoppers, 'shopper account');
      var pair = el('div'); pair.style.cssText = 'display:flex;gap:2px;align-items:flex-end;flex:1;width:100%;justify-content:center;';
      var st = el('div', 'stack'); st.style.height = '100%';
      var a = document.createElement('b'); a.style.background = '#8D6BE0'; a.style.height = Math.round((w.went_live / max) * 100) + '%';
      var b = document.createElement('b'); b.style.background = '#CFC0F3'; b.style.height = Math.round(((w.vendors - w.went_live) / max) * 100) + '%';
      st.appendChild(a); st.appendChild(b);
      var st2 = el('div', 'stack'); st2.style.height = '100%';
      var s2 = document.createElement('b'); s2.style.background = C_SEARCH; s2.style.height = Math.round((w.shoppers / max) * 100) + '%'; st2.appendChild(s2);
      pair.appendChild(st); pair.appendChild(st2); col.appendChild(pair);
      col.appendChild(el('span', null, shortDay(w.week)));
      box.appendChild(col);
    });
    c.appendChild(box);
    return c;
  }

  function revenueCard(d) {
    var r = d.revenue || {};
    var c = card('Plans and revenue', 'Counts, not percentages: with this few vendors one signup moves a percentage by five points. Stripe is the source of truth for money; this is the at-a-glance view.');
    var k = el('div', 'lki-kpis'); k.style.margin = '0 0 6px';
    k.appendChild(kpi('Paying now', r.paying || 0, null, 'active Stripe subscription'));
    k.appendChild(kpi('Estimated MRR', '$' + num(Math.round((r.mrr_cents || 0) / 100)), null, 'at monthly list price'));
    k.appendChild(kpi('In free trial', r.trialing || 0, null, 'worth $' + num(Math.round((r.trial_mrr_cents || 0) / 100)) + ' a month if all convert'));
    k.appendChild(kpi('Comped', r.comped || 0, null, 'paid plan, no charge'));
    k.appendChild(kpi('On Free', r.free || 0, null, 'your upgrade pool'));
    k.appendChild(kpi('Founding spots', (r.founding_claimed || 0) + ' of 50', null, 'claimed'));
    c.appendChild(k);
    var risk = [];
    if (r.canceling) risk.push(plural(r.canceling, 'subscription') + ' set to cancel at period end');
    if (r.ended_in_period) risk.push(plural(r.ended_in_period, 'paid subscription') + ' ended in this period');
    if (r.deactivated_in_period) risk.push(plural(r.deactivated_in_period, 'storefront') + ' deactivated in this period');
    c.appendChild(el('p', 'lki-note', risk.length ? 'Watch: ' + risk.join(', ') + '.' : 'No cancellations, ended subscriptions or deactivated storefronts in this period.'));
    return c;
  }

  function demandCard(d) {
    var s = d.shoppers || {}, L = d.leads || {}, a = L.by_actor || {};
    var c = card('The shopper side', 'Vendors are the supply. This is the demand you are building for them.');
    var k = el('div', 'lki-kpis'); k.style.margin = '0 0 6px';
    k.appendChild(kpi('Shopper accounts', s.accounts || 0, null, plural(s.new || 0, 'new one') + ' in this period'));
    k.appendChild(kpi('Have saved a vendor', s.saved || 0));
    k.appendChild(kpi('Have reached out', s.reached_out || 0, null, 'while signed in'));
    k.appendChild(kpi('Have left a review', s.reviewed || 0));
    k.appendChild(kpi('Newsletter subscribers', s.newsletter || 0));
    c.appendChild(k);
    var tot = (a.anonymous || 0) + (a.shopper || 0) + (a.vendor_or_admin || 0);
    if (tot) c.appendChild(rankList([
      { label: 'Visitors who were not signed in', n: a.anonymous || 0, sub: 'real shoppers, anonymous' },
      { label: 'Signed-in shopper accounts', n: a.shopper || 0, sub: 'real shoppers, known' },
      { label: 'Signed-in vendor or admin accounts', n: a.vendor_or_admin || 0, sub: 'most likely testing, left out of every rate on this page' }
    ], C_CONTACTS, ''));
    c.appendChild(el('p', 'lki-note', 'Who pressed the contact buttons in this period. Shoppers can browse and contact vendors without an account, so a small account count is expected; visitor totals live in Google Analytics.'));
    return c;
  }

  // #180 phase 2: people, not page loads.
  function journeysCard(d) {
    var z = d.visit, f = z.funnel || {}, s = z.search || {};
    var since = z.since ? daysSince(z.since) : null;
    var c = card('Visitors and journeys', 'People rather than page loads: one visit is one browser tab session, counted anonymously with a random id. Vendor and admin sessions are left out entirely.');
    if (!z.visits) {
      c.appendChild(el('div', 'lki-empty', 'Visit counting is on and waiting for its first shopper. Numbers appear here as people browse.'));
      return c;
    }
    var k = el('div', 'lki-kpis'); k.style.margin = '0 0 14px';
    k.appendChild(kpi('Visits', z.visits || 0, null, plural(z.visitors || 0, 'visitor')));
    k.appendChild(kpi('Came back another day', (z.returning_visitors || 0) + ' of ' + (z.known_visitors || 0), null, 'visitors seen on 2 or more days'));
    k.appendChild(kpi('Searches that led to a click', s.with_results ? pct(s.clicked || 0, s.with_results) + '%' : 'No searches', null, s.with_results ? num(s.clicked || 0) + ' of ' + num(s.with_results) + ' searches with results' : 'in this period'));
    k.appendChild(kpi('Looked at 2 or more storefronts', f.viewed_2plus || 0, null, 'visits that compared vendors'));
    c.appendChild(k);

    c.appendChild(el('div', 'lki-why-h', 'From arriving to reaching out'));
    var steps = [['All visits', f.visits], ['Browsed or searched The Market', f.saw_market], ['Opened a storefront', f.viewed], ['Reached out to a vendor', f.contacted]];
    var top = f.visits || 0;
    steps.forEach(function (stp, i) {
      var row = el('div', 'lki-fn');
      row.appendChild(el('div', null, stp[0]));
      var bar = el('div', 'lki-fn-bar'); var b = document.createElement('b'); b.style.background = C_SEARCH;
      b.style.width = top ? Math.max(stp[1] ? 2 : 0, Math.round(((stp[1] || 0) / top) * 100)) + '%' : '0'; bar.appendChild(b); row.appendChild(bar);
      var n = el('div', 'lki-fn-n', num(stp[1] || 0)); if (i) n.appendChild(el('small', null, pct(stp[1] || 0, top) + '% of visits'));
      row.appendChild(n); c.appendChild(row);
    });
    c.appendChild(el('p', 'lki-note', 'These steps are not strictly nested: someone who lands straight on a storefront from a shared link never touches The Market.'));

    var REF = { direct: 'Typed the address or a bookmark', external: 'Another website, search engine or social app', share: 'A Lokali share link', market: 'Arrived mid-visit from The Market', internal: 'Another Lokali page' };
    var entry = (z.entry || []).filter(function (e) { return e.ref !== 'market' && e.ref !== 'internal'; });
    if (entry.length) {
      var h = el('div', 'lki-why-h', 'How visits that touched a vendor began'); h.style.marginTop = '14px'; c.appendChild(h);
      c.appendChild(rankList(entry.map(function (e) { return { label: nice(REF, e.ref), n: e.n, sub: e.contacted ? plural(e.contacted, 'visit') + ' ended in a reach-out' : null, value: plural(e.n, 'visit') }; }), C_SEARCH, ''));
    }
    var terms = (s.terms || []).filter(function (t) { return t.avg_results > 0; }).slice(0, 8);
    if (terms.length) {
      var h2 = el('div', 'lki-why-h', 'Searches with results, and whether anyone clicked'); h2.style.marginTop = '14px'; c.appendChild(h2);
      c.appendChild(rankList(terms.map(function (t) { return { label: t.term, n: t.n, flag: t.n >= 3 && !t.clicked ? 'no clicks' : null, sub: 'found ' + plural(t.avg_results, 'vendor') + ' · ' + num(t.clicked) + ' of ' + num(t.n) + ' led to a storefront', value: plural(t.n, 'search', 'searches') }; }), null, ''));
    }
    var notes = [];
    if (since != null && since < d.days) notes.push('Visit counting began ' + (since < 1 ? 'today' : since + ' days ago') + ', so this covers less than the selected period.');
    if (z.private_visits) notes.push(plural(z.private_visits, 'visit') + ' came from browsers asking not to be tracked. They count as visits and are never given a lasting id, so they cannot count as returning.');
    notes.push('It only sees pages that log something: The Market, storefronts, listings and contact clicks. Homepage-only visits are in Google Analytics.');
    c.appendChild(el('p', 'lki-note', notes.join(' ')));
    return c;
  }

  function gapsCard(hasVisit) {
    var c = card('What this page cannot tell you yet', 'Known blind spots, so a quiet number is never mistaken for a fact.');
    c.className += ' lki-gaps';
    var ul = el('ul');
    (hasVisit ? [
     'Visits to pages that log nothing. Visitors and journeys starts counting when someone opens The Market, a storefront or a listing. A person who reads the homepage and leaves is only in Google Analytics.',
     'Whether a Market card was actually on screen. "Listed" means it was in the first 24 results of that pass, not that the shopper scrolled to it.',
     'The same person on two devices, or after clearing their browser, counts as two visitors. Browsers asking not to be tracked never count as returning. Treat "came back" as a floor.'
    ] : [
     'Unique visitors, repeat visits, search to click, and Market card impressions. These switch on when the visit-events SQL patch is applied.'
    ]).concat(['What happens after the click. A call, text or website visit leaves Lokali. Only inquiry-form messages and the lead status vendors set (Replied, Won, Closed) come back.',
     'Small numbers. With about twenty vendors, one busy day or one test session swings every rate. Read direction over weeks, not single values.'
    ]).forEach(function (t) { ul.appendChild(el('li', null, t)); });
    c.appendChild(ul);
    return c;
  }

  // ── render ─────────────────────────────────────────────────
  function render(root, d, onRange) {
    root.innerHTML = '';
    var t = d.totals || {};
    var live = (d.vendors || []).filter(function (v) { return v.is_public; });
    var ctx = { days: d.days, searches: t.searches || 0, median: median(live.map(function (v) { return v.views; })) };
    var vmap = {}; ((d.visit && d.visit.vendors) || []).forEach(function (x) { vmap[x.id] = x; });
    (d.vendors || []).forEach(function (v) { v.visit = vmap[v.id] || null; });
    ctx.hasVisit = !!d.visit;
    var rows = (d.vendors || []).map(function (v) { return { v: v, dx: diagnose(v, ctx) }; });

    var head = el('div', 'lki-head');
    var hl = el('div');
    hl.appendChild(el('h2', 'lki-h1', 'Marketplace insights'));
    hl.appendChild(el('p', 'lki-sub', 'What is working on Lokali, what is not, and why. Only you can see this.'));
    head.appendChild(hl);
    var range = el('div', 'lki-range');
    RANGES.forEach(function (r) {
      var b = el('button', d.days === r[0] ? 'is-on' : '', 'Last ' + r[1]); b.type = 'button';
      b.addEventListener('click', function () { if (d.days !== r[0]) onRange(r[0]); });
      range.appendChild(b);
    });
    head.appendChild(range);
    root.appendChild(head);

    var tl = takeaways(d, rows);
    if (tl.length) {
      var tc = card('The short version'); tc.className += ' lki-tldr';
      tc.querySelector('.lki-card-h').style.marginBottom = '8px';
      tl.forEach(function (x) {
        var line = el('div', 'lki-tl ' + x.tone);
        line.appendChild(icon(x.tone === 'good' ? 'check' : (x.tone === 'bad' ? 'warn' : 'eye')));
        line.appendChild(el('div', null, x.text)); tc.appendChild(line);
      });
      root.appendChild(tc);
    }

    var reach = 0, inside = 0; rows.forEach(function (r) { reach += reached(r.v); inside += internal(r.v); });
    var k = el('div', 'lki-kpis');
    k.appendChild(kpi('Storefront views', t.views || 0, t.views_prev || 0));
    k.appendChild(kpi('Shopper reach-outs', reach, null, inside ? 'plus ' + num(inside) + ' from vendor or admin accounts' : 'contact clicks and inquiries'));
    k.appendChild(kpi('Reach-out rate', (t.views ? pct(reach, t.views) : 0) + '%', null, 'of views led to a contact'));
    k.appendChild(kpi('Storefronts seen', (t.vendors_seen || 0) + ' of ' + (t.vendors_public || 0), null, 'live storefronts with a view'));
    k.appendChild(kpi('Market searches', t.searches || 0, t.searches_prev || 0));
    k.appendChild(kpi('Saves', t.favorites || 0, t.favorites_prev || 0));
    k.appendChild(kpi('New vendors', t.new_vendors || 0, null, plural(t.new_accounts || 0, 'new account') + ' in total'));
    root.appendChild(k);

    root.appendChild(healthCard(d, rows));
    root.appendChild(trendCard(d));
    if (d.visit) root.appendChild(journeysCard(d));
    root.appendChild(vendorCard(d, rows));
    var g1 = el('div', 'lki-grid2'); g1.appendChild(funnelCard(d)); g1.appendChild(growthCard(d)); root.appendChild(g1); root.appendChild(el('div', 'lki-gap'));
    root.appendChild(searchCards(d)); root.appendChild(el('div', 'lki-gap'));
    root.appendChild(supplyCards(d)); root.appendChild(el('div', 'lki-gap'));
    root.appendChild(behaviourCards(d)); root.appendChild(el('div', 'lki-gap'));
    root.appendChild(sharesCard(d));
    var g2 = el('div', 'lki-grid2'); g2.appendChild(revenueCard(d)); g2.appendChild(demandCard(d)); root.appendChild(g2); root.appendChild(el('div', 'lki-gap'));
    root.appendChild(gapsCard(!!d.visit));
    root.appendChild(el('p', 'lki-note', 'Views exclude a vendor previewing their own storefront. Days are Central time. Numbers refresh each time you open this page.'));
  }

  function defaultFetch(days) {
    var A = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.admin;
    if (!A || typeof A.insights !== 'function') return Promise.reject(new Error('stale_client'));
    return A.insights(days).then(function (res) {
      var d = res && res.data;
      if (!d || d.ok !== true || typeof A.visitInsights !== 'function') return d;
      // Phase 2 is optional: before its SQL patch is applied the page just omits it.
      return A.visitInsights(days).then(function (r2) {
        var v = r2 && r2.data; if (v && v.ok === true) d.visit = v; return d;
      }).catch(function () { return d; });
    });
  }

  function mount(container, opts) {
    injectCSS();
    var fetcher = (opts && opts.fetch) || defaultFetch;
    var root = el('div', 'lki');
    container.innerHTML = ''; container.appendChild(root);
    function state(text) { root.innerHTML = ''; root.appendChild(el('div', 'lki-state', text)); }
    function load(days) {
      state('Loading the numbers…');
      fetcher(days).then(function (d) {
        if (!d || d.ok !== true) {
          state(d && d.reason === 'not_admin' ? 'This page is only available to the Lokali admin account.'
            : 'Insights are not available yet. If this is the first time, the admin_insights SQL patch still needs to be run in Supabase.');
          return;
        }
        render(root, d, load);
      }).catch(function () {
        state('Could not load insights. Refresh the page. If it keeps happening, the admin_insights SQL patch may not be applied yet.');
      });
    }
    load((opts && opts.days) || 30);
  }

  window.LokaliAdminInsights = { mount: mount };
})();
