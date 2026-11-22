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
 *                   dashboard link, link to Orders, and (F 2026-11-19) the
 *                   return rule shoppers see before paying (REQUIRED before
 *                   the switch can go on) + "ready within N days" (optional)
 *
 * Fees are shown in dollars on a $100 sale, from the rate the SERVER says this
 * storefront pays right now (status -> fee). A paid plan with no card on file
 * pays the base rate until a card is added (2026-11-19 fee rule).
 *
 * Routes (vendor JWT): POST {BILLING_BASE}/checkout/connect
 *   {action:'status'|'onboard'|'dashboard'|'toggle'|'settings', enabled,
 *    return_policy, pickup_days, ship_days}
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
    '#lokali-checkout .gp-fine a,#lokali-checkout .gp-intro a,#lokali-checkout .gp-card a{color:#6002EE;font-weight:600;}' +
    '#lokali-checkout .gp-ex{background:#F7F6FC;border-radius:14px;padding:12px 14px;margin:0 0 14px;}' +
    '#lokali-checkout .gp-ex strong{display:block;font-size:14px;color:#3A3550;margin-bottom:4px;}' +
    '#lokali-checkout .gp-ex div{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:#4A4761;padding:5px 0;border-top:1px solid #E9E6F5;}' +
    '#lokali-checkout .gp-card{background:#FFF7E8;border:1px solid #FFE0B2;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.5;color:#7A4A00;margin:0 0 14px;}' +
    '#lokali-checkout .gp-set{border:1px solid #DEDAEE;border-radius:14px;padding:14px;margin-top:14px;}' +
    '#lokali-checkout .gp-set label{display:block;font-size:13px;font-weight:700;color:#3A3550;margin:0 0 2px;}' +
    '#lokali-checkout .gp-set .gp-help{font-size:12px;color:#6E6A85;margin:0 0 6px;line-height:1.5;}' +
    '#lokali-checkout .gp-set textarea,#lokali-checkout .gp-set input{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;padding:9px 11px;border:1px solid #DEDAEE;border-radius:10px;color:#1A1829;background:#fff;}' +
    '#lokali-checkout .gp-set textarea{min-height:64px;resize:vertical;}' +
    '#lokali-checkout .gp-days{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;}' +
    '#lokali-checkout .gp-saved{font-size:13px;color:#1D6A45;font-weight:600;margin-left:4px;display:none;}' +
    '#lokali-checkout .gp-terms{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid #DEDAEE;border-radius:14px;margin-top:14px;font-size:13px;line-height:1.5;color:#3A3550;cursor:pointer;}' +
    '#lokali-checkout .gp-terms input{flex:none;width:18px;height:18px;margin:1px 0 0;accent-color:#6002EE;cursor:pointer;}' +
    '#lokali-checkout .gp-terms a{color:#6002EE;font-weight:600;}' +
    '#lokali-checkout .gp-agreed{font-size:12px;color:#1D6A45;margin-top:10px;}' +
    '@media(max-width:480px){#lokali-checkout .gp-days{grid-template-columns:1fr;}}';

  var state = { plan: 'free', fees: FEES_DEFAULT, st: null, fee: null };

  // The rate this storefront pays today: the server's answer when we have it
  // (it knows about complimentary plans and the card-on-file rule), else the
  // plan table.
  function myRate() {
    if (state.fee && isFinite(Number(state.fee.percent))) return Number(state.fee.percent);
    var f = state.fees, p = state.plan;
    return f[p] != null ? Number(f[p]) : Number(f.free);
  }
  function usd(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }
  function feeLine() {
    var f = state.fees, p = state.plan, rate = myRate();
    var lokali = rate, stripeFee = 3.20, keep = 100 - lokali - stripeFee;
    var html = '<div class="gp-fee">' +
      chip('free', 'No monthly fee', f.free) + chip('pro', 'Pro', f.pro) + chip('featured', 'Featured', f.featured) + '</div>' +
      '<div class="gp-ex"><strong>On a $100 sale you keep ' + usd(keep) + '</strong>' +
      '<div><span>Lokali (' + fmtPct(rate) + ')</span><span>' + usd(lokali) + '</span></div>' +
      '<div><span>Stripe card fee (2.9% + 30c)</span><span>' + usd(stripeFee) + '</span></div></div>';
    if (state.fee && state.fee.needs_card) {
      html += '<div class="gp-card">Your plan\'s rate is ' + fmtPct(state.fee.with_card_percent) + ' once a card is on file for your plan. Until then, orders are charged ' + fmtPct(state.fee.percent) + '. ' +
        '<a href="#settings-current-plan">Add a card under Your plan</a></div>';
    }
    html += '<div class="gp-intro">Fees come out automatically; the rest pays out to your bank on Stripe\'s schedule.</div>';
    return html;
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
        settingsBox(st) +
        termsBox(st) +
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

  // What shoppers are told before they pay (F 2026-11-19). The return rule is
  // required before the Buy switch can go on; the two day counts are optional.
  function settingsBox(st) {
    return '<div class="gp-set">' +
      '<label for="lk-gp-policy">Your return rule</label>' +
      '<div class="gp-help">Shoppers see this before they pay. Needed before Buy on Lokali can go on. Say it your way: "All sales final", "Returns within 7 days, unused".</div>' +
      '<textarea id="lk-gp-policy" maxlength="300" placeholder="All sales final. Damaged in transit? Tell us within 3 days.">' + esc(st.return_policy || '') + '</textarea>' +
      '<div class="gp-days">' +
        '<div><label for="lk-gp-pickup">Pickup or delivery ready within</label><div class="gp-help">Days. Leave blank and shoppers read "the vendor will be in touch".</div>' +
        '<input id="lk-gp-pickup" type="number" inputmode="numeric" min="1" max="60" step="1" placeholder="2" value="' + (st.pickup_days != null ? esc(st.pickup_days) : '') + '"></div>' +
        '<div><label for="lk-gp-ship">Shipped orders leave within</label><div class="gp-help">Days. Only shown on items you ship.</div>' +
        '<input id="lk-gp-ship" type="number" inputmode="numeric" min="1" max="60" step="1" placeholder="5" value="' + (st.ship_days != null ? esc(st.ship_days) : '') + '"></div>' +
      '</div>' +
      '<div class="gp-row"><button type="button" class="gp-btn" data-gp="settings">Save</button><span class="gp-saved" id="lk-gp-saved">Saved</span></div>' +
      '</div>';
  }

  // Card payment terms (F 2026-11-20): a vendor ticks this once before the Buy
  // switch can go on; the server keeps the dated record (vendor_checkout_consent).
  function termsBox(st) {
    if (st.terms_agreed_at) {
      var d = new Date(st.terms_agreed_at);
      var when = isNaN(d) ? '' : ' on ' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      return '<div class="gp-agreed">You agreed to the card payment terms' + esc(when) + '.</div>';
    }
    return '<label class="gp-terms" for="lk-gp-terms"><input type="checkbox" id="lk-gp-terms">' +
      '<span>I agree to the card payment terms in section 6 of Lokali\'s <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>: I am the seller, payments go to my own Stripe account, and Lokali keeps the fee shown above on each order.</span></label>';
  }

  function say(msg) { var m = $('lk-gp-msg'); if (!m) return; m.textContent = msg || ''; m.style.display = msg ? '' : 'none'; }
  function busy(b, on, label) { if (!b) return; if (on) { b.dataset.t = b.textContent; b.disabled = true; b.textContent = label || 'One moment'; } else { b.disabled = false; if (b.dataset.t) b.textContent = b.dataset.t; } }

  var NEED_RULE = 'Add your return rule above and save it first. Shoppers see it before they pay.';
  var NEED_TERMS = 'Tick the box to agree to the card payment terms first.';
  function dayVal(id) { var el = $(id); var v = el ? String(el.value || '').trim() : ''; if (!v) return null; var n = Math.floor(Number(v)); return (isFinite(n) && n >= 1 && n <= 60) ? n : NaN; }
  function act(kind, btn) {
    if (kind === 'settings') {
      var pol = $('lk-gp-policy') ? String($('lk-gp-policy').value || '').replace(/\s+/g, ' ').trim() : '';
      var pd = dayVal('lk-gp-pickup'), sd = dayVal('lk-gp-ship');
      if (pd !== null && isNaN(pd) || sd !== null && isNaN(sd)) { say('Days must be a whole number from 1 to 60, or blank.'); return; }
      busy(btn, true, 'Saving');
      post({ action: 'settings', return_policy: pol, pickup_days: pd, ship_days: sd }).then(function (r) {
        busy(btn, false);
        if (!r.ok) { say(r.data.error === 'return_policy_required' ? 'Buy on Lokali is on, so the return rule cannot be empty. Turn the switch off first if you want to remove it.' : (r.data.error || 'Could not save that.')); return; }
        state.st = Object.assign({}, state.st || {}, r.data.state || {}); say('');
        var ok = $('lk-gp-saved'); if (ok) { ok.style.display = 'inline'; setTimeout(function () { ok.style.display = 'none'; }, 2500); }
      }).catch(function () { busy(btn, false); say('Could not save that.'); });
      return;
    }
    if (kind === 'toggle') {
      var next = btn.getAttribute('aria-checked') !== 'true';
      if (next && !(state.st && String(state.st.return_policy || '').trim())) { say(NEED_RULE); var pf = $('lk-gp-policy'); if (pf) pf.focus(); return; }
      var tb = $('lk-gp-terms');
      var agree = !!(tb && tb.checked);
      if (next && !(state.st && state.st.terms_agreed_at) && !agree) { say(NEED_TERMS); if (tb) tb.focus(); return; }
      btn.setAttribute('aria-checked', next ? 'true' : 'false');
      post({ action: 'toggle', enabled: next, agree_terms: agree }).then(function (r) {
        if (!r.ok) {
          btn.setAttribute('aria-checked', next ? 'false' : 'true');
          var e = r.data.error;
          say(e === 'return_policy_required' ? NEED_RULE : e === 'terms_required' ? NEED_TERMS : (e || 'Could not save that.'));
          return;
        }
        var hadTerms = !!(state.st && state.st.terms_agreed_at);
        state.st = Object.assign({}, state.st || {}, r.data.state || {}); say('');
        if (!hadTerms && state.st.terms_agreed_at) render();
      }).catch(function () { btn.setAttribute('aria-checked', next ? 'false' : 'true'); say('Could not save that.'); });
      return;
    }
    busy(btn, true, kind === 'status' ? 'Checking' : 'Opening Stripe');
    post({ action: kind }).then(function (r) {
      if (!r.ok) { say(r.data.error || 'Stripe did not answer. Try again in a moment.'); busy(btn, false); return; }
      if (r.data.url) { window.location.assign(r.data.url); return; }
      state.st = r.data.state || state.st; if (r.data.fee) state.fee = r.data.fee; render();
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
    // past_due / paused count as paid here, matching getMyBilling's own notion of a paid plan.
    var planP = (window.LokaliAPI && window.LokaliAPI.plans && window.LokaliAPI.plans.getMyBilling)
      ? window.LokaliAPI.plans.getMyBilling().then(function (res) { var b = (res && (res.data || res)) || {}; var p = String(b.plan || 'free').toLowerCase(); var s = String(b.plan_status || '').toLowerCase(); return (s === '' || s === 'active' || s === 'trialing' || s === 'past_due' || s === 'paused') ? p : 'free'; }).catch(function () { return 'free'; })
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
      state.fee = (r.ok && r.data.fee) || null;
      render(sec);
      if (!r.ok && r.status !== 404) say(r.data.error || '');
    }).catch(function () { state.st = { connected: false }; render(sec); });
    if (window.location.hash === '#lokali-checkout') setTimeout(function () { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(0); });
  else mount(0);
})();
