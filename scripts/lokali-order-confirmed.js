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
      '#lok-order-confirmed small{color:#8E8BA6;font-size:12px;display:block;margin-top:12px;}';
    document.head.appendChild(s);
  }

  function render(mount, o) {
    var vendorHref = o.vendor && o.vendor.slug ? '/' + o.vendor.slug : '/the-market';
    var how = o.fulfilment === 'pickup' ? 'will be in touch about when and where to pick it up'
      : o.fulfilment === 'delivery' ? 'will be in touch to arrange local delivery' : 'will ship it to the address you gave';
    mount.innerHTML = '<div class="oc-card"><div class="oc-ok">Paid</div><h1>Thanks' + (o.shopper_first_name ? ', ' + esc(o.shopper_first_name) : '') + '. Your order is in.</h1>' +
      '<p><strong>' + esc(o.vendor && o.vendor.name || 'The vendor') + '</strong> has your order and ' + how + '. A receipt is on its way to ' + esc(o.shopper_email_masked || 'your email') + '.</p>' +
      '<div class="oc-item">' + (o.product_image_url ? '<img src="' + esc(o.product_image_url) + '" alt="">' : '') + '<div><div style="font-weight:700;">' + esc(o.product_name) + '</div><div style="font-size:13px;color:#6E6A85;">Quantity ' + esc(o.quantity) + ' · ' + money(o.unit_amount_cents) + ' each</div></div></div>' +
      '<div class="oc-row"><span>Items</span><span>' + money(o.subtotal_cents) + '</span></div>' +
      (o.shipping_cents > 0 ? '<div class="oc-row"><span>Shipping</span><span>' + money(o.shipping_cents) + '</span></div>' : '') +
      (o.tax_cents > 0 ? '<div class="oc-row"><span>Tax</span><span>' + money(o.tax_cents) + '</span></div>' : '') +
      '<div class="oc-row t"><span>Total</span><span>' + money(o.total_cents) + '</span></div>' +
      '<a class="oc-btn" href="' + esc(vendorHref) + '">Back to ' + esc(o.vendor && o.vendor.name || 'the storefront') + '</a><a class="oc-btn ghost" href="/the-market">Keep browsing</a>' +
      '<small>Order ' + esc(o.id) + '. Questions or a refund: reply to your receipt and it reaches the vendor directly.</small></div>';
  }
  function waiting(mount, final) {
    mount.innerHTML = '<div class="oc-card" style="text-align:center;">' + (final ? '' : '<div class="oc-spin"></div>') +
      '<h1 style="font-size:20px;">' + (final ? 'Your payment went through' : 'Confirming your payment') + '</h1>' +
      '<p>' + (final ? 'The order is being recorded. Your receipt will arrive by email within a few minutes; if it does not, write to hello@golokali.com with the time of your purchase.' : 'One moment while Stripe confirms it.') + '</p>' +
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
          if (!r.ok) { if (tries < 6) { tries++; setTimeout(poll, 2000); } else waiting(mount, true); return; }
          var o = r.data;
          if (o.status === 'pending') { if (tries < 10) { tries++; setTimeout(poll, 1500); } else waiting(mount, true); return; }
          if (o.status === 'canceled') { bad(mount); return; }
          render(mount, o);
        }).catch(function () { if (tries < 6) { tries++; setTimeout(poll, 2000); } else waiting(mount, true); });
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
