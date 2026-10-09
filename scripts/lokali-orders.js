/**
 * Lokali — vendor dashboard "Orders" page (#205 on-site checkout).
 *
 * Load AFTER the sitewide bundle (needs window.LokaliSupabase + window.LokaliAuth).
 * Self-mounting into <div id="lok-orders-page"></div>; no-op if absent.
 *
 * Data: my_orders() (RPC, owner-scoped, pending rows never listed; events folded in).
 * Actions (vendor JWT, Vercel):
 *   POST {BASE}/checkout/fulfil  { orders_id, note }                           -> shopper emailed
 *   POST {BASE}/checkout/refund  { orders_id, amount_cents?, reason, restock } -> Stripe refund on
 *                                                                               the vendor's account
 * Groups: "To fulfil" (paid, newest first) then "Done" (fulfilled), with
 * refunded / disputed / canceled folded under "Everything else". Money state
 * only ever changes through the Connect webhook or the two routes above.
 */
(function () {
  'use strict';

  var BASE = ((window.LOKALI_BILLING_BASE ? String(window.LOKALI_BILLING_BASE) : 'https://lokali-api.vercel.app/api/lokali')).replace(/\/$/, '');
  var INK = '#1A1829', DUSK = '#4A4761', GRAY = '#6E6A85', VIOLET = '#6002EE', VIOLET_L = '#F3EBFF', VIOLET_B = '#E5D4FD',
      GREEN = '#1D6A45', GREEN_L = '#EAFAF2', PINK = '#B1006A', PINK_L = '#FDE7F3',
      SNOW = '#F7F6FC';
  var FONT = '"Plus Jakarta Sans",-apple-system,sans-serif';

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(c) { var d = (Number(c) || 0) / 100; return '$' + d.toLocaleString('en-US', { minimumFractionDigits: (d % 1) ? 2 : 0, maximumFractionDigits: 2 }); }
  function when(iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function ago(iso) { var ms = Date.now() - new Date(iso).getTime(); var h = Math.floor(ms / 36e5); if (h < 1) return 'just now'; if (h < 24) return h + 'h ago'; var d = Math.floor(h / 24); return d + (d === 1 ? ' day ago' : ' days ago'); }

  function token() { var A = window.LokaliAuth; if (!A || typeof A.token !== 'function') return Promise.reject(new Error('no auth')); return Promise.resolve().then(function () { return A.token(); }); }
  function post(path, body) {
    return token().then(function (jwt) {
      if (!jwt) throw new Error('Not signed in');
      return fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt }, body: JSON.stringify(body || {}) });
    }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { ok: res.ok, status: res.status, data: d || {} }; }); });
  }

  function injectStyles() {
    if ($('lok-orders-css')) return;
    var s = el('style'); s.id = 'lok-orders-css';
    s.textContent =
      '#lok-orders-page{font-family:' + FONT + ';color:' + INK + ';}' +
      '#lok-orders-page *{box-sizing:border-box;}' +
      '.op-load{padding:40px 0;text-align:center;color:' + GRAY + ';font-size:14px;}' +
      '.op-spin{width:28px;height:28px;border:3px solid ' + VIOLET_B + ';border-top-color:' + VIOLET + ';border-radius:50%;margin:0 auto 12px;animation:opspin .8s linear infinite;}@keyframes opspin{to{transform:rotate(360deg)}}' +
      '.op-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 20px;}' +
      '.op-tile{background:#fff;border:1px solid #DEDAEE;border-radius:14px;padding:14px 16px;}' +
      '.op-tile b{display:block;font-size:22px;font-weight:700;}.op-tile span{font-size:12px;color:' + GRAY + ';}' +
      '.op-h{font-size:15px;font-weight:700;margin:22px 0 10px;display:flex;align-items:center;gap:8px;}' +
      '.op-h small{font-weight:600;color:' + GRAY + ';font-size:12px;background:' + SNOW + ';padding:3px 8px;border-radius:999px;}' +
      '.op-card{background:#fff;border:1px solid #DEDAEE;border-radius:16px;padding:16px;margin:0 0 10px;box-shadow:0 1px 2px rgba(26,24,41,.04);}' +
      '.op-top{display:flex;gap:12px;align-items:flex-start;}' +
      '.op-img{width:56px;height:56px;border-radius:12px;object-fit:cover;flex:none;background:' + SNOW + ';}' +
      '.op-main{flex:1;min-width:0;}.op-name{font-size:15px;font-weight:700;}' +
      '.op-sub{font-size:13px;color:' + DUSK + ';margin-top:2px;}.op-sub b{font-weight:600;}' +
      '.op-amt{font-size:16px;font-weight:700;white-space:nowrap;text-align:right;}' +
      '.op-pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:4px 9px;border-radius:999px;margin-top:6px;}' +
      '.op-pill.paid{background:' + VIOLET_L + ';color:' + VIOLET + ';}.op-pill.fulfilled{background:' + GREEN_L + ';color:' + GREEN + ';}' +
      '.op-pill.refunded,.op-pill.partially_refunded,.op-pill.canceled{background:' + SNOW + ';color:' + GRAY + ';}.op-pill.disputed{background:' + PINK_L + ';color:' + PINK + ';}' +
      '.op-who{font-size:13px;color:' + DUSK + ';margin-top:10px;line-height:1.5;}.op-who a{color:' + VIOLET + ';font-weight:600;text-decoration:none;}' +
      '.op-note{font-size:13px;background:' + SNOW + ';border-radius:10px;padding:8px 10px;margin-top:8px;color:' + DUSK + ';}' +
      '.op-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}' +
      '.op-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid ' + VIOLET_B + ';background:#fff;color:' + VIOLET + ';font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;}' +
      '.op-btn.primary{background:' + VIOLET + ';color:#fff;border-color:' + VIOLET + ';}.op-btn.danger{color:' + PINK + ';border-color:#F5C3DB;}.op-btn[disabled]{opacity:.6;cursor:default;}' +
      '.op-form{margin-top:10px;padding:12px;border:1px dashed ' + VIOLET_B + ';border-radius:12px;background:#FCFBFF;}' +
      '.op-form label{display:block;font-size:12px;font-weight:600;color:' + DUSK + ';margin:8px 0 4px;}' +
      '.op-form input,.op-form textarea{width:100%;font-family:inherit;font-size:14px;padding:9px 11px;border:1px solid #DEDAEE;border-radius:10px;color:' + INK + ';background:#fff;}' +
      '.op-form textarea{min-height:64px;resize:vertical;}.op-form .op-check{display:flex;align-items:center;gap:8px;font-size:13px;margin-top:8px;}' +
      '.op-err{font-size:13px;color:' + PINK + ';margin-top:8px;}' +
      '.op-fold{font-family:inherit;background:none;border:0;color:' + VIOLET + ';font-weight:700;font-size:13px;cursor:pointer;padding:8px 0;}' +
      '.op-hist{font-size:12px;color:' + GRAY + ';margin-top:8px;line-height:1.5;}' +
      '.op-empty{background:#fff;border:1px solid #DEDAEE;border-radius:16px;padding:24px;}' +
      '.op-empty h3{margin:0 0 8px;font-size:17px;}.op-empty p{margin:0 0 10px;font-size:14px;color:' + DUSK + ';line-height:1.55;}' +
      '.op-empty ol{margin:0 0 14px 18px;padding:0;font-size:14px;color:' + DUSK + ';line-height:1.7;}' +
      '@media(max-width:480px){.op-amt{font-size:15px;}.op-img{width:48px;height:48px;}}';
    document.head.appendChild(s);
  }

  function showLoading(mount, text) { mount.innerHTML = ''; var c = el('div', 'op-load'); c.appendChild(el('div', 'op-spin')); c.appendChild(el('div', null, text)); mount.appendChild(c); }
  function showError(mount, text) { mount.innerHTML = ''; var c = el('div', 'op-load', text); var b = el('button', 'op-btn', 'Try again'); b.style.marginTop = '12px'; b.addEventListener('click', function () { load(mount, 0); }); c.appendChild(document.createElement('br')); c.appendChild(b); mount.appendChild(c); }

  function fulfilLabel(o) { return o.fulfilment === 'pickup' ? 'Pickup' : o.fulfilment === 'delivery' ? 'Local delivery' : 'Shipping'; }
  function statusLabel(o) {
    return { paid: 'Paid, to fulfil', fulfilled: 'Done', refunded: 'Refunded', partially_refunded: 'Partly refunded', disputed: 'Disputed', canceled: 'Canceled' }[o.status] || o.status;
  }
  function addr(a) { if (!a) return ''; return [a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', '), a.postal_code].filter(function (p) { return p && String(p).trim(); }).map(esc).join('<br>'); }

  function card(o) {
    var c = el('div', 'op-card'); c.id = 'op-' + o.id;
    var refunded = o.refunded_cents > 0 ? '<div style="color:' + GRAY + ';font-weight:600;font-size:12px;">' + money(o.refunded_cents) + ' refunded</div>' : '';
    var contact = [];
    if (o.shopper_email) contact.push('<a href="mailto:' + esc(o.shopper_email) + '?subject=' + encodeURIComponent('Your Lokali order ' + o.id + ': ' + o.product_name) + '">' + esc(o.shopper_email) + '</a>');
    if (o.shopper_phone) contact.push('<a href="tel:' + esc(o.shopper_phone) + '">' + esc(o.shopper_phone) + '</a>');
    c.innerHTML =
      '<div class="op-top">' +
        (o.product_image_url ? '<img class="op-img" src="' + esc(o.product_image_url) + '" alt="">' : '<div class="op-img"></div>') +
        '<div class="op-main"><div class="op-name">' + esc(o.product_name) + (o.quantity > 1 ? ' <span style="color:' + GRAY + ';font-weight:600;">x ' + o.quantity + '</span>' : '') + '</div>' +
        '<div class="op-sub"><b>' + fulfilLabel(o) + '</b> · ' + when(o.paid_at || o.created_at) + (o.status === 'paid' ? ' · ' + ago(o.paid_at || o.created_at) : '') + '</div>' +
        '<span class="op-pill ' + esc(o.status) + '">' + statusLabel(o) + '</span></div>' +
        '<div class="op-amt">' + money(o.total_cents) + refunded + '</div>' +
      '</div>' +
      '<div class="op-who"><b>' + esc(o.shopper_name || 'Shopper') + '</b>' + (contact.length ? ' · ' + contact.join(' · ') : '') +
        (o.fulfilment === 'shipping' && o.shipping_address ? '<br>' + addr(o.shipping_address) : '') + '</div>' +
      (o.shopper_note ? '<div class="op-note">Their note: ' + esc(o.shopper_note) + '</div>' : '') +
      (o.vendor_note ? '<div class="op-note">Your note: ' + esc(o.vendor_note) + '</div>' : '') +
      (o.status === 'disputed' ? '<div class="op-note" style="background:' + PINK_L + ';color:' + PINK + ';">The shopper\'s bank opened a dispute. Answer it with your evidence in your Stripe dashboard (Settings, Get paid on Lokali, Open Stripe dashboard). The amount is held until it is decided.</div>' : '') +
      '<div class="op-acts" id="op-acts-' + o.id + '"></div><div id="op-form-' + o.id + '"></div>' +
      '<div class="op-hist">' + (o.events || []).map(function (e) { return esc(String(e.kind || '').replace('_', ' ')) + ' ' + when(e.at); }).join(' · ') + '</div>';
    var acts = c.querySelector('#op-acts-' + o.id);
    var refundable = (o.total_cents || 0) - (o.refunded_cents || 0);
    if (o.status === 'paid' || o.status === 'partially_refunded') {
      var f = el('button', 'op-btn primary', o.fulfilment === 'shipping' ? 'Mark shipped' : o.fulfilment === 'delivery' ? 'Mark delivered' : 'Mark picked up');
      f.addEventListener('click', function () { openFulfil(o, c); });
      acts.appendChild(f);
    }
    if (refundable > 0 && ['paid', 'fulfilled', 'partially_refunded'].indexOf(o.status) >= 0) {
      var r = el('button', 'op-btn danger', 'Refund');
      r.addEventListener('click', function () { openRefund(o, c, refundable); });
      acts.appendChild(r);
    }
    return c;
  }

  function openFulfil(o, c) {
    var host = c.querySelector('#op-form-' + o.id); if (!host) return;
    if (host.firstChild) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="op-form"><label for="op-fn-' + o.id + '">Note for the shopper (optional)</label>' +
      '<textarea id="op-fn-' + o.id + '" maxlength="500" placeholder="' + (o.fulfilment === 'shipping' ? 'Tracking number or carrier' : o.fulfilment === 'delivery' ? 'When it will arrive' : 'When and where to pick up') + '"></textarea>' +
      '<div class="op-acts"><button type="button" class="op-btn primary" id="op-fgo-' + o.id + '">Confirm and email them</button><button type="button" class="op-btn" id="op-fx-' + o.id + '">Cancel</button></div><div class="op-err" id="op-ferr-' + o.id + '"></div></div>';
    host.querySelector('#op-fx-' + o.id).addEventListener('click', function () { host.innerHTML = ''; });
    var go = host.querySelector('#op-fgo-' + o.id);
    go.addEventListener('click', function () {
      go.disabled = true; go.textContent = 'Saving';
      post('/checkout/fulfil', { orders_id: o.id, note: host.querySelector('#op-fn-' + o.id).value }).then(function (r) {
        if (!r.ok) { host.querySelector('#op-ferr-' + o.id).textContent = r.data.error === 'not_fulfillable' ? 'This order cannot be marked done any more (' + (r.data.status || '') + ').' : 'Could not save. Try again.'; go.disabled = false; go.textContent = 'Confirm and email them'; return; }
        replaceCard(o.id, r.data.order);
      }).catch(function () { host.querySelector('#op-ferr-' + o.id).textContent = 'Could not save. Try again.'; go.disabled = false; go.textContent = 'Confirm and email them'; });
    });
  }

  function openRefund(o, c, refundable) {
    var host = c.querySelector('#op-form-' + o.id); if (!host) return;
    if (host.firstChild) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="op-form"><label for="op-ra-' + o.id + '">Amount to refund (up to ' + money(refundable) + ')</label>' +
      '<input id="op-ra-' + o.id + '" type="number" inputmode="decimal" min="0.01" max="' + (refundable / 100).toFixed(2) + '" step="0.01" value="' + (refundable / 100).toFixed(2) + '">' +
      '<label for="op-rr-' + o.id + '">Reason (the shopper sees it)</label><input id="op-rr-' + o.id + '" maxlength="200" placeholder="Out of stock, damaged, changed their mind">' +
      '<label class="op-check"><input type="checkbox" id="op-rs-' + o.id + '" checked style="width:auto;"> Put the item back in stock on a full refund</label>' +
      '<div class="op-acts"><button type="button" class="op-btn danger" id="op-rgo-' + o.id + '">Refund now</button><button type="button" class="op-btn" id="op-rx-' + o.id + '">Cancel</button></div>' +
      '<div class="op-err" id="op-rerr-' + o.id + '"></div>' +
      '<div class="op-hist">Comes out of your Stripe balance. Lokali\'s fee is returned to you; Stripe keeps its card fee. The shopper sees it in 5 to 10 business days.</div></div>';
    host.querySelector('#op-rx-' + o.id).addEventListener('click', function () { host.innerHTML = ''; });
    var go = host.querySelector('#op-rgo-' + o.id);
    go.addEventListener('click', function () {
      var cents = Math.round(parseFloat(host.querySelector('#op-ra-' + o.id).value || '0') * 100);
      if (!(cents > 0)) { host.querySelector('#op-rerr-' + o.id).textContent = 'Enter an amount.'; return; }
      if (cents > refundable) cents = refundable;
      if (!window.confirm('Refund ' + money(cents) + ' to ' + (o.shopper_name || 'the shopper') + '? This cannot be undone.')) return;
      go.disabled = true; go.textContent = 'Refunding';
      post('/checkout/refund', { orders_id: o.id, amount_cents: cents, reason: host.querySelector('#op-rr-' + o.id).value, restock: host.querySelector('#op-rs-' + o.id).checked }).then(function (r) {
        if (!r.ok) { host.querySelector('#op-rerr-' + o.id).textContent = r.data.detail || 'Stripe refused the refund. Check your Stripe balance and try again.'; go.disabled = false; go.textContent = 'Refund now'; return; }
        if (r.data.order) replaceCard(o.id, r.data.order); else load($('lok-orders-page'), 0);
      }).catch(function () { host.querySelector('#op-rerr-' + o.id).textContent = 'Could not reach Stripe. Try again.'; go.disabled = false; go.textContent = 'Refund now'; });
    });
  }

  var _orders = [];
  function replaceCard(id, fresh) {
    if (!fresh) { load($('lok-orders-page'), 0); return; }
    for (var i = 0; i < _orders.length; i++) if (_orders[i].id === id) { fresh.events = fresh.events || _orders[i].events; _orders[i] = fresh; }
    render($('lok-orders-page'), _orders);
  }

  function render(mount, orders) {
    _orders = orders;
    mount.innerHTML = '';
    if (!orders.length) {
      var e = el('div', 'op-empty');
      e.innerHTML = '<h3>No orders yet</h3><p>Once shoppers can pay by card on your product pages, every paid order lands here with the shopper\'s details and a button to mark it done.</p>' +
        '<ol><li>Open <a href="/vendor-dashboard/settings#lokali-checkout" style="color:' + VIOLET + ';font-weight:600;">Settings, Get paid on Lokali</a> and set up payouts with Stripe.</li>' +
        '<li>Give your products a price and, if you ship, a flat shipping price.</li><li>Turn on Show Buy on Lokali.</li></ol>' +
        '<a class="op-btn primary" href="/vendor-dashboard/settings#lokali-checkout">Set up payments</a>';
      mount.appendChild(e); return;
    }
    var now = new Date(), mk = now.getFullYear() + '-' + (now.getMonth() + 1);
    var paid = orders.filter(function (o) { return o.status === 'paid' || o.status === 'partially_refunded'; });
    var done = orders.filter(function (o) { return o.status === 'fulfilled'; });
    var rest = orders.filter(function (o) { return paid.indexOf(o) < 0 && done.indexOf(o) < 0; });
    var month = orders.filter(function (o) { var d = new Date(o.paid_at || o.created_at); return (d.getFullYear() + '-' + (d.getMonth() + 1)) === mk && ['paid', 'fulfilled', 'partially_refunded'].indexOf(o.status) >= 0; });
    var net = month.reduce(function (s, o) { return s + (o.total_cents - o.refunded_cents); }, 0);
    var fees = month.reduce(function (s, o) { return s + (o.platform_fee_cents || 0); }, 0);
    var strip = el('div', 'op-strip');
    strip.innerHTML = tile(paid.length, 'to fulfil') + tile(month.length, 'orders this month') + tile(money(net), 'sales this month') + tile(money(fees), 'Lokali fees this month');
    mount.appendChild(strip);
    section(mount, 'To fulfil', paid, 'Nothing waiting on you.');
    section(mount, 'Done', done.slice(0, 20), 'Nothing fulfilled yet.');
    if (rest.length) {
      var h = el('div', 'op-h'); h.innerHTML = 'Everything else <small>' + rest.length + '</small>'; mount.appendChild(h);
      var fold = el('button', 'op-fold', 'Show refunded, disputed and canceled'); var box = el('div'); box.style.display = 'none';
      rest.forEach(function (o) { box.appendChild(card(o)); });
      fold.addEventListener('click', function () { var on = box.style.display === 'none'; box.style.display = on ? '' : 'none'; fold.textContent = on ? 'Hide' : 'Show refunded, disputed and canceled'; });
      mount.appendChild(fold); mount.appendChild(box);
    }
    function tile(v, l) { return '<div class="op-tile"><b>' + esc(v) + '</b><span>' + l + '</span></div>'; }
  }
  function section(mount, title, rows, emptyText) {
    var h = el('div', 'op-h'); h.innerHTML = esc(title) + ' <small>' + rows.length + '</small>'; mount.appendChild(h);
    if (!rows.length) { var p = el('div', null, emptyText); p.style.cssText = 'font-size:13px;color:' + GRAY + ';padding:4px 0 8px;'; mount.appendChild(p); return; }
    rows.forEach(function (o) { mount.appendChild(card(o)); });
  }

  function load(mount, attempt) {
    attempt = attempt || 0;
    if (attempt === 0) showLoading(mount, 'Loading your orders');
    var c = window.LokaliSupabase;
    if (!c || typeof c.rpc !== 'function') { if (attempt < 120) { setTimeout(function () { load(mount, attempt + 1); }, 250); return; } showError(mount, "We couldn't load your orders."); return; }
    c.rpc('my_orders', { p_limit: 300 }).then(function (r) {
      if (r.error) { if (attempt < 8 && /JWT|401|403/i.test(String(r.error.message || ''))) { setTimeout(function () { load(mount, attempt + 1); }, 500); return; } showError(mount, "We couldn't load your orders."); return; }
      render(mount, Array.isArray(r.data) ? r.data : []);
    }).catch(function () { showError(mount, "We couldn't load your orders."); });
  }

  // The Webflow page is a duplicate of Leads (same dashboard shell), so the mount
  // may still carry the Leads id and heading; on the orders path we adopt both.
  function init() {
    var onOrders = /^\/vendor-dashboard\/orders(\/|$)/.test(String(window.location.pathname || ''));
    var mount = $('lok-orders-page') || (onOrders ? $('lok-leads-page') : null);
    if (!mount) return;
    if (mount.id !== 'lok-orders-page') mount.id = 'lok-orders-page';
    if (onOrders) {
      try {
        document.title = 'Orders | Lokali';
        var hs = document.querySelectorAll('h1, h2, .heading, .page-heading');
        for (var i = 0; i < hs.length; i++) { if (/^\s*Leads\s*$/.test(hs[i].textContent || '')) { hs[i].textContent = 'Orders'; break; } }
        var subs = document.querySelectorAll('p, .paragraph, .subheading, .page-subheading');
        for (var j = 0; j < subs.length; j++) { if (/leads?|inquir/i.test(subs[j].textContent || '') && (subs[j].textContent || '').length < 180 && subs[j].closest && !subs[j].closest('#lok-orders-page') && !subs[j].closest('nav, aside, .sidebar, .dashboard-sidebar')) { subs[j].textContent = 'Orders paid by card on your Lokali product pages. Mark each one done once it is picked up, delivered or shipped.'; break; } }
      } catch (e) {}
    }
    injectStyles(); load(mount, 0);
  }
  try { window.LokaliOrders = { render: render, injectStyles: injectStyles }; } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
