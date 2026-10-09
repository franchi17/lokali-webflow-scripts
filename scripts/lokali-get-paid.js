/**
 * Lokali — Settings card "Get paid on Lokali" (#205 on-site checkout).
 *
 * Load with ONE <script defer src> tag on /vendor-dashboard/settings after the
 * sitewide bundle (needs window.LokaliAuth for the token, window.LokaliSupabase
 * for the plan fee read). Self-mounting after the plan card (same anchor rule
 * as the Spotlight card); no-op elsewhere.
 *
 * What the vendor sees:
 *   not connected   fee for THEIR plan + "Set up payouts with Stripe" (Express
 *                   onboarding on Stripe's hosted pages; Lokali never sees bank
 *                   or identity details)
 *   setup pending   "Finish setup" (Stripe still needs something)
 *   ready           the Buy-on-Lokali switch, payouts/tax chips, Stripe
 *                   dashboard link, link to Orders
 *
 * Routes (vendor JWT): POST {BILLING_BASE}/checkout/connect
 *   {action:'status'|'onboard'|'dashboard'|'toggle', enabled}
 */
(function () {
  'use strict';
  if (!/^\/vendor-dashboard\/settings/.test(window.location.pathname)) return;

  var BASE = ((window.LOKALI_BILLING_BASE ? String(window.LOKALI_BILLING_BASE) : 'https://lokali-api.vercel.app/api/lokali')).replace(/\/$/, '');
  var URL_CONNECT = BASE + '/checkout/connect';
  var FEES_DEFAULT = { free: 5, pro: 3, featured: 1 };

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function token() {
    var A = window.LokaliAuth;
    if (!A || typeof A.token !== 'function') return Promise.reject(new Error('No auth session'));
    return Promise.resolve().then(function () { return A.token(); });
  }
  function post(body) {
    return token().then(function (jwt) {
      if (!jwt) throw new Error('Not signed in');
      return fetch(URL_CONNECT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt }, body: JSON.stringify(body || {}) });
    }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { ok: res.ok, status: res.status, data: d || {} }; }); });
  }

  var CSS =
    '#lokali-checkout{font-family:"Plus Jakarta Sans",system-ui,sans-serif;}' +
    '#lokali-checkout .gp-intro{font-size:14px;line-height:1.55;color:#4A4761;margin:0 0 14px;}' +
    '#lokali-checkout .gp-fee{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;}' +
    '#lokali-checkout .gp-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;font-size:13px;font-weight:600;background:#F1EDFB;color:#4A4761;border:1px solid #E5D4FD;}' +
    '#lokali-checkout .gp-chip.on{background:#EAFAF2;color:#1D6A45;border-color:#CDEFDC;}#lokali-checkout .gp-chip.warn{background:#FFF4E5;color:#8A4B00;border-color:#FFE0B2;}' +
    '#lokali-checkout .gp-chip.you{background:#6002EE;color:#fff;border-color:#6002EE;}' +
    '#lokali-checkout .gp-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;border:0;background:#6002EE;color:#fff;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;}' +
    '#lokali-checkout .gp-btn.ghost{background:#fff;color:#6002EE;border:1px solid #D9CFFB;}#lokali-checkout .gp-btn[disabled]{opacity:.6;cursor:default;}' +
    '#lokali-checkout .gp-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px;}' +
    '#lokali-checkout .gp-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #DEDAEE;border-radius:14px;margin-top:14px;}' +
    '#lokali-checkout .gp-switch strong{font-size:14px;display:block;}#lokali-checkout .gp-switch span{font-size:12px;color:#6E6A85;}' +
    '#lokali-checkout .gp-tog{position:relative;width:46px;height:26px;flex:none;border-radius:999px;background:#CFCBE3;border:0;cursor:pointer;transition:background .15s;}' +
    '#lokali-checkout .gp-tog::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 3px rgba(0,0,0,.2);}' +
    '#lokali-checkout .gp-tog[aria-checked="true"]{background:#6002EE;}#lokali-checkout .gp-tog[aria-checked="true"]::after{left:23px;}' +
    '#lokali-checkout .gp-msg{font-size:13px;margin-top:10px;color:#B1006A;display:none;}' +
    '#lokali-checkout .gp-fine{font-size:12px;color:#8E8BA6;line-height:1.5;margin-top:12px;}' +
    '#lokali-checkout .gp-fine a,#lokali-checkout .gp-intro a{color:#6002EE;font-weight:600;}';

  var state = { plan: 'free', fees: FEES_DEFAULT, st: null };

  function feeLine() {
    var f = state.fees, p = state.plan;
    var mine = f[p] != null ? f[p] : f.free;
    return '<div class="gp-fee">' +
      chip('free', 'No monthly fee', f.free) + chip('pro', 'Pro', f.pro) + chip('featured', 'Featured', f.featured) +
      '</div><div class="gp-intro">On your plan a shopper\'s payment costs you <strong>' + fmtPct(mine) + ' to Lokali plus Stripe\'s card rate (2.9% + 30c)</strong>. ' +
      'For comparison, Etsy takes about 9.5% plus 45c and Shopify charges a monthly store fee on top of the same card rate. Fees come out automatically; the rest pays out to your bank on Stripe\'s schedule.</div>';
    function chip(code, label, pct) { return '<span class="gp-chip' + (code === p ? ' you' : '') + '">' + label + ': ' + fmtPct(pct) + (code === p ? ' (you)' : '') + '</span>'; }
  }
  function fmtPct(n) { var v = Number(n); return (isFinite(v) ? (Math.round(v * 100) / 100) : 5) + '%'; }

  function render(sec) {
    var st = state.st || { connected: false };
    var body = $('lk-gp-body');
    if (!body) return;
    var html = feeLine();
    if (!st.connected) {
      html += '<div class="gp-row"><button type="button" class="gp-btn" data-gp="onboard">Set up payouts with Stripe</button></div>' +
        '<div class="gp-fine">Takes about five minutes on Stripe\'s secure pages: your name, a bank account for payouts and a quick identity check. Lokali never sees any of it. Products only for now; services keep Inquire and Book now.</div>';
    } else if (!st.charges_enabled) {
      html += '<div class="gp-fee"><span class="gp-chip warn">Setup not finished</span>' + (st.requirements_due ? '<span class="gp-chip warn">' + st.requirements_due + ' item' + (st.requirements_due === 1 ? '' : 's') + ' Stripe still needs</span>' : '') + '</div>' +
        '<div class="gp-row"><button type="button" class="gp-btn" data-gp="onboard">Finish setup with Stripe</button><button type="button" class="gp-btn ghost" data-gp="status">Refresh status</button></div>' +
        '<div class="gp-fine">Buy on Lokali appears on your products as soon as Stripe turns on card payments for your account, usually within minutes of finishing.</div>';
    } else {
      html += '<div class="gp-fee"><span class="gp-chip on">Card payments on</span>' +
        '<span class="gp-chip ' + (st.payouts_enabled ? 'on' : 'warn') + '">' + (st.payouts_enabled ? 'Payouts on' : 'Payouts pending') + '</span>' +
        '<span class="gp-chip ' + (st.tax_active ? 'on' : '') + '">' + (st.tax_active ? 'Sales tax: automatic' : 'Sales tax: not set up') + '</span></div>' +
        '<div class="gp-switch"><div><strong>Show Buy on Lokali on my products</strong><span>Priced, in-stock products get a Buy button above Inquire. Quote-based items keep Inquire.</span></div>' +
        '<button type="button" class="gp-tog" role="switch" aria-checked="' + (st.checkout_enabled ? 'true' : 'false') + '" aria-label="Show Buy on Lokali on my products" data-gp="toggle"></button></div>' +
        '<div class="gp-row"><a class="gp-btn ghost" href="/vendor-dashboard/orders">Your orders</a><button type="button" class="gp-btn ghost" data-gp="dashboard">Open Stripe dashboard</button><button type="button" class="gp-btn ghost" data-gp="status">Refresh status</button></div>' +
        '<div class="gp-fine">Refunds and disputes are handled from your Orders page and your Stripe dashboard. ' +
        (st.tax_active ? 'Stripe Tax adds the right sales tax at checkout.' : 'To collect sales tax automatically, turn on Stripe Tax in your Stripe dashboard (Settings, Tax) and refresh here. Until then prices are charged as listed and tax is yours to handle.') + '</div>';
    }
    html += '<div class="gp-msg" id="lk-gp-msg"></div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-gp]').forEach(function (b) { b.addEventListener('click', function () { act(b.getAttribute('data-gp'), b); }); });
  }

  function say(msg) { var m = $('lk-gp-msg'); if (!m) return; m.textContent = msg || ''; m.style.display = msg ? '' : 'none'; }
  function busy(b, on, label) { if (!b) return; if (on) { b.dataset.t = b.textContent; b.disabled = true; b.textContent = label || 'One moment'; } else { b.disabled = false; if (b.dataset.t) b.textContent = b.dataset.t; } }

  function act(kind, btn) {
    if (kind === 'toggle') {
      var next = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', next ? 'true' : 'false');
      post({ action: 'toggle', enabled: next }).then(function (r) {
        if (!r.ok) { btn.setAttribute('aria-checked', next ? 'false' : 'true'); say(r.data.error || 'Could not save that.'); return; }
        state.st = r.data.state; say('');
      }).catch(function () { btn.setAttribute('aria-checked', next ? 'false' : 'true'); say('Could not save that.'); });
      return;
    }
    busy(btn, true, kind === 'status' ? 'Checking' : 'Opening Stripe');
    post({ action: kind }).then(function (r) {
      if (!r.ok) { say(r.data.error || 'Stripe did not answer. Try again in a moment.'); busy(btn, false); return; }
      if (r.data.url) { window.location.assign(r.data.url); return; }
      state.st = r.data.state || state.st; render();
    }).catch(function () { say('Please sign in again and retry.'); busy(btn, false); });
  }

  function loadPlanAndFees() {
    var c = window.LokaliSupabase;
    var feesP = (c && typeof c.from === 'function')
      ? c.from('plan').select('code, checkout_fee_percent').then(function (r) {
          var f = {}; (r && r.data || []).forEach(function (row) { if (row && row.code) f[String(row.code).toLowerCase()] = Number(row.checkout_fee_percent); });
          return (f.free != null && f.pro != null && f.featured != null) ? f : FEES_DEFAULT;
        }).catch(function () { return FEES_DEFAULT; })
      : Promise.resolve(FEES_DEFAULT);
    var planP = (window.LokaliAPI && window.LokaliAPI.plans && window.LokaliAPI.plans.getMyBilling)
      ? window.LokaliAPI.plans.getMyBilling().then(function (res) { var b = (res && (res.data || res)) || {}; var p = String(b.plan || 'free').toLowerCase(); var s = String(b.plan_status || '').toLowerCase(); return (s === '' || s === 'active' || s === 'trialing') ? p : 'free'; }).catch(function () { return 'free'; })
      : Promise.resolve('free');
    return Promise.all([feesP, planP]).then(function (a) { state.fees = a[0]; state.plan = a[1]; });
  }

  function mount(tries) {
    tries = tries || 0;
    if ($('lokali-checkout')) return;
    var planEl = $('settings-current-plan');
    var anchor = $('lokali-spotlight') || $('lok-verify-section') || (planEl && planEl.closest ? planEl.closest('section') : null);
    if (!anchor) { if (tries < 80) setTimeout(function () { mount(tries + 1); }, 250); return; }
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var sec = document.createElement('section');
    var look = document.querySelector('.section-12');
    sec.className = look ? look.className.replace(/\blok-set-sec\b/, '').trim() : anchor.className;
    sec.id = 'lokali-checkout';
    sec.innerHTML = '<div class="form-heading-div">' +
      '<svg width="22" height="22" viewBox="0 0 576 512" fill="#6002EE" aria-hidden="true" style="flex:none"><path d="M64 32C28.7 32 0 60.7 0 96v32h576V96c0-35.3-28.7-64-64-64H64zM576 224H0v192c0 35.3 28.7 64 64 64h448c35.3 0 64-28.7 64-64V224zM112 352h64c8.8 0 16 7.2 16 16s-7.2 16-16 16h-64c-8.8 0-16-7.2-16-16s7.2-16 16-16zm112 16c0-8.8 7.2-16 16-16h128c8.8 0 16 7.2 16 16s-7.2 16-16 16H240c-8.8 0-16-7.2-16-16z"/></svg>' +
      '<div class="section-heading">Get paid on Lokali</div></div>' +
      '<div class="gp-intro">Let shoppers pay you by card right on your Lokali product pages. The sale goes straight to your own Stripe account; you handle pickup, delivery or shipping as usual and mark it done on your Orders page.</div>' +
      '<div id="lk-gp-body"><div class="gp-intro">Checking your setup</div></div>';
    anchor.insertAdjacentElement('afterend', sec);
    loadPlanAndFees().then(function () { return post({ action: 'status' }); }).then(function (r) {
      state.st = r.ok ? r.data.state : { connected: false };
      render(sec);
      if (!r.ok && r.status !== 404) say(r.data.error || '');
    }).catch(function () { state.st = { connected: false }; render(sec); });
    if (window.location.hash === '#lokali-checkout') setTimeout(function () { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(0); });
  else mount(0);
})();
