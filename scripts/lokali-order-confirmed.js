/**
 * Lokali — /order-confirmed page (#205 on-site checkout).
 *
 * Stripe sends the shopper back here with ?session_id=cs_... after payment.
 * Self-mounting into <div id="lok-order-confirmed"></div>. Reads
 * GET {BASE}/checkout/summary?session_id= and renders the receipt; while the
 * Connect webhook has not landed yet the order is still "pending", so the page
 * polls a few times before settling on "we are confirming your payment".
 * The redirect itself is never trusted for anything; it only shows what the
 * webhook has recorded.
 */
(function () {
  'use strict';
  var BASE = ((window.LOKALI_BILLING_BASE ? String(window.LOKALI_BILLING_BASE) : 'https://lokali-api.vercel.app/api/lokali')).replace(/\/$/, '');
  var FONT = '"Plus Jakarta Sans",-apple-system,sans-serif';
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(c) { var d = (Number(c) || 0) / 100; return '$' + d.toLocaleString('en-US', { minimumFractionDigits: (d % 1) ? 2 : 0, maximumFractionDigits: 2 }); }

  function css() {
    if (document.getElementById('lok-oc-css')) return;
    var s = document.createElement('style'); s.id = 'lok-oc-css';
    s.textContent = '#lok-order-confirmed{font-family:' + FONT + ';color:#1A1829;max-width:560px;margin:0 auto;padding:0 16px;}' +
      '#lok-order-confirmed .oc-card{background:#fff;border:1px solid #DEDAEE;border-radius:18px;padding:22px;box-shadow:0 10px 30px rgba(26,24,41,.06);}' +
      '#lok-order-confirmed h1{font-size:24px;font-weight:700;margin:0 0 8px;}#lok-order-confirmed p{font-size:15px;line-height:1.55;color:#4A4761;margin:0 0 10px;}' +
      '#lok-order-confirmed .oc-ok{display:inline-flex;align-items:center;gap:8px;background:#EAFAF2;color:#1D6A45;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px;margin-bottom:12px;}' +
      '#lok-order-confirmed .oc-row{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:7px 0;border-bottom:1px solid #EEEDF6;}#lok-order-confirmed .oc-row.t{font-weight:700;border:0;font-size:15px;}' +
      '#lok-order-confirmed .oc-item{display:flex;gap:12px;align-items:center;margin:12px 0;}#lok-order-confirmed .oc-item img{width:64px;height:64px;border-radius:12px;object-fit:cover;}' +
      '#lok-order-confirmed .oc-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;background:#6002EE;color:#fff;font-weight:700;font-size:14px;text-decoration:none;margin-top:14px;}' +
      '#lok-order-confirmed .oc-btn.ghost{background:#fff;color:#6002EE;border:1px solid #D9CFFB;margin-left:8px;}' +
      '#lok-order-confirmed .oc-spin{width:26px;height:26px;border:3px solid #E5D4FD;border-top-color:#6002EE;border-radius:50%;margin:0 auto 12px;animation:ocspin .8s linear infinite;}@keyframes ocspin{to{transform:rotate(360deg)}}' +
      '#lok-order-confirmed .oc-follow{background:#F6F3FF;border-radius:14px;padding:14px;margin-top:16px;}#lok-order-confirmed .oc-follow b{display:block;font-size:14px;margin-bottom:2px;}' +
      '#lok-order-confirmed .oc-follow span{display:block;font-size:13px;color:#6E6A85;line-height:1.5;}#lok-order-confirmed .oc-follow .oc-btn{margin-top:10px;border:0;font-family:inherit;cursor:pointer;}' +
      '#lok-order-confirmed .oc-follow ul{list-style:none;margin:6px 0 0;padding:0;}#lok-order-confirmed .oc-follow li{font-size:13px;color:#4A4761;padding:3px 0 3px 22px;position:relative;line-height:1.45;}' +
      '#lok-order-confirmed .oc-follow li:before{content:"";position:absolute;left:3px;top:8px;width:9px;height:5px;border-left:2px solid #1D6A45;border-bottom:2px solid #1D6A45;transform:rotate(-45deg);}' +
      '#lok-order-confirmed .oc-follow .oc-done{color:#1D6A45;font-weight:700;font-size:14px;}' +
      '#lok-order-confirmed small{color:#8E8BA6;font-size:12px;display:block;margin-top:12px;}';
    document.head.appendChild(s);
  }

  // #261 tickets (F 2026-11-23, mockup v3 screen 5): "You're on the list", the
  // name at the door, Add to calendar + Directions, then the same save + follow
  // box, worded for a ticket. Times are the event's own (Central).
  var TZ = 'America/Chicago';
  function tm(d) { return d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/[\u202f\u00a0]/g, ' ').replace(':00', ''); }
  function evWhen(s, e) {
    var a = new Date(s); if (isNaN(a)) return '';
    var day = a.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
    if (!e) return day + ' at ' + tm(a);
    var x = tm(a), y = tm(new Date(e));
    return day + ', ' + (x.slice(-2) === y.slice(-2) ? x.slice(0, -3) : x) + ' to ' + y;
  }
  function calUrl(ev, host) {
    function f(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
    var s = new Date(ev.starts_at), e = ev.ends_at ? new Date(ev.ends_at) : new Date(s.getTime() + 3 * 36e5);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title) + '&dates=' + f(s) + '/' + f(e) +
      '&location=' + encodeURIComponent(ev.place) + '&details=' + encodeURIComponent('Tickets from ' + host + ' on Lokali. Your name is on the guest list at the door.');
  }
  function renderTicket(mount, o) {
    var ev = o.event, host = (o.vendor && o.vendor.name) || 'the host';
    var vendorHref = o.vendor && o.vendor.slug ? '/' + o.vendor.slug : '/this-week';
    var guest = ev.guest_name || o.shopper_first_name || '';
    var first = String(guest).split(' ')[0];
    var follow = (o.vendor && o.vendor.id != null) ? '<div class="oc-follow" id="oc-follow"></div>' : '';
    mount.innerHTML = '<div class="oc-card"><div class="oc-ok">Paid</div><h1>You\'re on the list' + (first ? ', ' + esc(first) : '') + '</h1>' +
      '<p>' + esc(o.quantity) + (o.quantity === 1 ? ' ticket' : ' tickets') + ' · ' + esc(evWhen(ev.starts_at, ev.ends_at)) + ' · ' + esc(ev.place) + '. We emailed everything to ' + esc(o.shopper_email_masked || 'you') + '.</p>' +
      '<div class="oc-item"><div><div style="font-weight:700;">' + esc(ev.title) + '</div><div style="font-size:13px;color:#17634A;font-weight:600;">On the guest list as ' + esc(guest || 'you') + '. Nothing to print.</div></div></div>' +
      '<div class="oc-row t"><span>Total</span><span>' + money(o.total_cents) + '</span></div>' +
      follow +
      '<a class="oc-btn ghost" href="' + esc(calUrl(ev, host)) + '" target="_blank" rel="noopener" style="margin-left:0;">Add to calendar</a>' +
      '<a class="oc-btn ghost" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ev.place) + '" target="_blank" rel="noopener">Directions</a>' +
      '<a class="oc-btn ghost" href="' + esc(vendorHref) + '">Back to ' + esc(host) + '</a>' +
      '<small>Order ' + esc(o.id) + '. Questions: reply to your ticket email and it reaches ' + esc(host) + ' directly.</small></div>';
    fillFollow(o);
  }

  function render(mount, o) {
    if (o.event && o.event.starts_at) { renderTicket(mount, o); return; }
    var vendorHref = o.vendor && o.vendor.slug ? '/' + o.vendor.slug : '/the-market';
    var how = o.fulfilment === 'pickup' ? 'will be in touch about when and where to pick it up'
      : o.fulfilment === 'delivery' ? 'will be in touch to arrange local delivery' : 'will ship it to the address you gave';
    // "Ready within N days" when the vendor promised it (F 2026-11-19).
    var rd = Number(o.ready_days), within = rd >= 1 ? 'within ' + rd + ' day' + (rd === 1 ? '' : 's') : '';
    if (within) how = o.fulfilment === 'pickup' ? 'will have it ready for pickup ' + within + ', and will be in touch about when and where'
      : o.fulfilment === 'delivery' ? 'will have it ready ' + within + ', and will be in touch to arrange local delivery'
      : 'will ship it ' + within + ' to the address you gave';
    var vname = esc(o.vendor && o.vendor.name || 'this vendor');
    // Ask for the relationship AFTER the order, never before it (Baymard 2026 #1).
    // The box is filled by fillFollow() once we know whether they are signed in.
    var follow = (o.vendor && o.vendor.id != null) ? '<div class="oc-follow" id="oc-follow"></div>' : '';
    mount.innerHTML = '<div class="oc-card"><div class="oc-ok">Paid</div><h1>Thanks' + (o.shopper_first_name ? ', ' + esc(o.shopper_first_name) : '') + '. Your order is in.</h1>' +
      '<p><strong>' + esc(o.vendor && o.vendor.name || 'The vendor') + '</strong> has your order and ' + how + '. A receipt is on its way to ' + esc(o.shopper_email_masked || 'your email') + '.</p>' +
      '<div class="oc-item">' + (o.product_image_url ? '<img src="' + esc(o.product_image_url) + '" alt="">' : '') + '<div><div style="font-weight:700;">' + esc(o.product_name) + '</div><div style="font-size:13px;color:#6E6A85;">Quantity ' + esc(o.quantity) + ' · ' + money(o.unit_amount_cents) + ' each</div></div></div>' +
      '<div class="oc-row"><span>Items</span><span>' + money(o.subtotal_cents) + '</span></div>' +
      (o.shipping_cents > 0 ? '<div class="oc-row"><span>Shipping</span><span>' + money(o.shipping_cents) + '</span></div>' : '') +
      (o.tax_cents > 0 ? '<div class="oc-row"><span>Tax</span><span>' + money(o.tax_cents) + '</span></div>' : '') +
      '<div class="oc-row t"><span>Total</span><span>' + money(o.total_cents) + '</span></div>' +
      follow +
      '<a class="oc-btn ghost" href="' + esc(vendorHref) + '" style="margin-left:0;">Back to ' + esc(o.vendor && o.vendor.name || 'the storefront') + '</a><a class="oc-btn ghost" href="/the-market">Keep browsing</a>' +
      '<small>Order ' + esc(o.id) + '. Questions or a refund: reply to your receipt and it reaches the vendor directly.</small></div>';
    fillFollow(o);
  }

  // One button, two shoppers (F 2026-11-20):
  //   signed in  -> "Follow <vendor>" works right here, one tap; the order is
  //                 already theirs (claim_my_orders covers a sign-in made after
  //                 the Buy tap).
  //   signed out -> "Save my order and follow <vendor>": a short sign-up. The
  //                 order attaches once their email is confirmed and matches the
  //                 one they paid with (claim_my_orders, on /account#orders);
  //                 the follow intent rides in localStorage so it survives the
  //                 confirmation link opening in another tab.
  var ORDER_FOLLOW_KEY = 'lokali_order_follow';
  function fillFollow(o) {
    var box = document.getElementById('oc-follow');
    if (!box || !o.vendor || o.vendor.id == null) return;
    var vid = Number(o.vendor.id), rawName = String(o.vendor.name || 'this vendor'), name = esc(rawName);
    var A = window.LokaliAuth;
    var tokenP = (A && typeof A.token === 'function') ? Promise.resolve().then(function () { return A.token(); }).catch(function () { return null; }) : Promise.resolve(null);
    tokenP.then(function (jwt) { if (jwt) signedIn(); else signedOut(); });

    function signedIn() {
      var c = window.LokaliSupabase;
      try { if (c && typeof c.rpc === 'function') c.rpc('claim_my_orders').then(function () {}, function () {}); } catch (e) {}
      box.innerHTML = '<b>Want to hear when ' + name + ' has something new?</b><span>One tap, right here. One email a week at most.</span>' +
        '<button type="button" class="oc-btn" id="oc-follow-go">Follow ' + name + '</button>' +
        '<a class="oc-btn ghost" href="/account#orders">See my orders</a>';
      var go = document.getElementById('oc-follow-go');
      go.addEventListener('click', function () {
        go.disabled = true; go.textContent = 'One moment';
        var S = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.favorites;
        var p = (S && typeof S.add === 'function') ? S.add(vid) : Promise.reject(new Error('no client'));
        Promise.resolve(p).then(function (r) {
          // a duplicate (already following) is a success for the shopper
          var dup = r && r.error && /duplicate|unique|23505/i.test(String(r.error.message || r.error.code || ''));
          if (r && r.error && !dup) throw new Error('follow failed');
          box.innerHTML = '<span class="oc-done">You are following ' + name + '.</span><span>Their news lands in one email each Thursday, and in your account.</span>' +
            '<a class="oc-btn ghost" href="/account#orders" style="margin-left:0;">See my orders</a>';
        }).catch(function () { window.location.href = '/' + encodeURIComponent(o.vendor.slug || '') + '?follow=1'; });
      });
    }

    function signedOut() {
      var tk = !!o.event;
      box.innerHTML = (tk ? '<b>Keep your ticket in one place</b>' +
          '<ul><li>Your ticket, with Directions and Add to calendar, any time</li><li>Hear about ' + name + '\'s next event</li></ul>' +
          '<button type="button" class="oc-btn" id="oc-save-go">Save my ticket and follow ' + name + '</button>'
        : '<b>Keep this order in one place</b>' +
          '<ul><li>See your order and where it stands, any time</li><li>Hear when ' + name + ' has something new</li></ul>' +
          '<button type="button" class="oc-btn" id="oc-save-go">Save my order and follow ' + name + '</button>') +
        '<span style="margin-top:8px;">Takes about 20 seconds. Use the email you paid with' + (o.shopper_email_masked ? ' (' + esc(o.shopper_email_masked) + ')' : '') + ' so ' + (tk ? 'the ticket' : 'the order') + ' shows up. ' + (tk ? 'Your ticket' : 'Your order') + ' is safe either way.</span>';
      document.getElementById('oc-save-go').addEventListener('click', function () {
        try { localStorage.setItem(ORDER_FOLLOW_KEY, JSON.stringify({ vendor_id: vid, name: rawName, at: Date.now() })); } catch (e) {}
        try {
          sessionStorage.setItem('lokali_pending_fav', String(vid));
          sessionStorage.setItem('lokali_signup_intent', 'customer:' + Date.now());
          sessionStorage.setItem('lokali_prompt_source', 'order_confirmed');
        } catch (e) {}
        try { if (typeof window.gtag === 'function') window.gtag('event', 'account_prompt', { source: 'order_confirmed' }); } catch (e) {}
        var L = window.LokaliAuth;
        if (L && typeof L.openSignUp === 'function') L.openSignUp({ intent: 'customer', follow: { name: rawName, first: '' }, source: 'order_confirmed' });
        else window.location.href = '/sign-up';
      });
    }
  }
  function waiting(mount, final) {
    mount.innerHTML = '<div class="oc-card" style="text-align:center;">' + (final ? '' : '<div class="oc-spin"></div>') +
      '<h1 style="font-size:20px;">' + (final ? 'Your payment went through' : 'Confirming your payment') + '</h1>' +
      '<p>' + (final ? 'The order is being recorded. Your receipt will arrive by email within a few minutes; if it does not, write to hello@golokali.com with the time of your purchase.' : 'One moment while Stripe confirms it.') + '</p>' +
      '<a class="oc-btn ghost" href="/the-market" style="margin-left:0;">Keep browsing</a></div>';
  }
  // The server never confirmed anything (bad session id, rate limit, outage): say so, never "went through".
  function unsure(mount) {
    mount.innerHTML = '<div class="oc-card" style="text-align:center;"><h1 style="font-size:20px;">We could not confirm your payment yet</h1>' +
      '<p>If your card was charged, your receipt email from Stripe has the details and the vendor has your order. If you are not sure, write to hello@golokali.com with the time of your purchase.</p>' +
      '<a class="oc-btn ghost" href="/the-market" style="margin-left:0;">Keep browsing</a></div>';
  }
  function bad(mount) {
    mount.innerHTML = '<div class="oc-card"><h1 style="font-size:20px;">We could not find that order</h1><p>If you just paid, your receipt email has the details. Otherwise head back to the Market.</p><a class="oc-btn" href="/the-market">Go to the Market</a></div>';
  }

  function init() {
    var mount = document.getElementById('lok-order-confirmed');
    // The Webflow page is API-created and empty (no Designer work needed): build
    // the page chrome here. If F later drops a #lok-order-confirmed embed into a
    // designed page, this branch is skipped and only the card renders.
    if (!mount) {
      if (!/^\/order-confirmed(\/|$)/.test(String(window.location.pathname || ''))) return;
      document.title = 'Order confirmed | Lokali';
      document.body.style.cssText += ';margin:0;background:#F2F1F9;font-family:' + FONT + ';';
      var wrap = document.createElement('div');
      wrap.style.cssText = 'min-height:100vh;padding:28px 0 48px;';
      wrap.innerHTML = '<div style="max-width:560px;margin:0 auto 22px;padding:0 16px;"><a href="/" style="font-family:' + FONT + ';font-weight:800;font-size:22px;color:#6002EE;text-decoration:none;letter-spacing:-.01em;">Lokali</a></div>';
      mount = document.createElement('div'); mount.id = 'lok-order-confirmed';
      wrap.appendChild(mount);
      document.body.insertBefore(wrap, document.body.firstChild);
    }
    css();
    var sid = new URLSearchParams(window.location.search).get('session_id') || '';
    if (!/^cs_(test|live)_/.test(sid)) { bad(mount); return; }
    try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
    var tries = 0;
    (function poll() {
      if (tries === 0) waiting(mount, false);
      fetch(BASE + '/checkout/summary?session_id=' + encodeURIComponent(sid)).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
        .then(function (r) {
          if (r.status === 404) { if (tries < 3) { tries++; setTimeout(poll, 1500); } else bad(mount); return; }
          if (!r.ok) { if (tries < 6) { tries++; setTimeout(poll, 2000); } else unsure(mount); return; }
          var o = r.data;
          if (o.status === 'pending') { if (tries < 10) { tries++; setTimeout(poll, 1500); } else waiting(mount, true); return; }
          if (o.status === 'canceled') { bad(mount); return; }
          render(mount, o);
        }).catch(function () { if (tries < 6) { tries++; setTimeout(poll, 2000); } else unsure(mount); });
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
