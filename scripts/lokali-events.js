/**
 * Lokali — Events with tickets on a storefront (#261, F 2026-11-23, mockup
 * docs/design/event-tickets-2026-11/mockup-v3.html screens 3, 4 and 6).
 *
 * Load on the storefront template AFTER lokali-vendor-listing.js. Waits for
 * 'lokali:vendor-loaded' (or window.LOKALI_LOADED_VENDOR), reads
 * vendor_events_public(vendor id) and, when the storefront has upcoming
 * events, puts an "Events" section at the top of the page's main column.
 * No events = nothing is drawn.
 *
 *   Get tickets  -> ticket sheet (how many, name for the guest list) -> POST
 *                   {BASE}/checkout/ticket -> Stripe's page (the webhook marks it paid)
 *   Sold out     -> "Email me if tickets open up" -> POST {BASE}/checkout/event-waitlist
 *   ?waitlist_leave=<token> (link in the waitlist email) -> asks first, then leaves
 *   #event-<id>  -> scrolls to that event (the host's share link)
 *
 * "Tickets left" shows only when 10 or fewer remain (expert review: no push).
 * Map: an address card with Directions; a real map picture only when
 * window.LOKALI_STATIC_MAPS is true (the Maps Static API is switched on for the
 * site key), so a missing API can never show a broken image.
 */
(function () {
  'use strict';
  if (window.__lokEventsLoaded) return;
  window.__lokEventsLoaded = true;

  var BASE = ((window.LOKALI_BILLING_BASE ? String(window.LOKALI_BILLING_BASE) : 'https://lokali-api.vercel.app/api/lokali')).replace(/\/$/, '');
  var TZ = 'America/Chicago';

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(c) { var d = (Number(c) || 0) / 100; return '$' + d.toLocaleString('en-US', { minimumFractionDigits: (d % 1) ? 2 : 0, maximumFractionDigits: 2 }); }
  function tm(d) { return d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/[  ]/g, ' ').replace(':00', ''); }
  function when(s, e) {
    var a = new Date(s); if (isNaN(a)) return '';
    var day = a.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
    if (!e) return day + ' · ' + tm(a);
    var x = tm(a), y = tm(new Date(e));
    return day + ' · ' + (x.slice(-2) === y.slice(-2) ? x.slice(0, -3) : x) + ' to ' + y;
  }
  function shortWhen(s) {
    var a = new Date(s); if (isNaN(a)) return '';
    return a.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + tm(a);
  }
  function refundLine(r) {
    if (r === 'none') return "Tickets can't be refunded unless the event is canceled.";
    if (r === '7d') return 'Full refund up to 7 days before the event.';
    return 'Full refund up to 2 days before the event.';
  }
  function directions(place) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place); }

  function client() {
    if (window.LokaliSupabase && typeof window.LokaliSupabase.rpc === 'function') return Promise.resolve(window.LokaliSupabase);
    return Promise.resolve(window.LokaliSupabaseReady).then(function () { return window.LokaliSupabase || null; });
  }
  function jwt() {
    var A = window.LokaliAuth;
    if (!A || typeof A.token !== 'function') return Promise.resolve(null);
    return Promise.resolve().then(function () { return A.token(); }).then(function (t) { return t || null; }, function () { return null; });
  }
  function post(path, body, withAuth) {
    return (withAuth ? jwt() : Promise.resolve(null)).then(function (t) {
      var h = { 'Content-Type': 'application/json' };
      if (t) h.Authorization = 'Bearer ' + t;
      return fetch(BASE + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) { return { ok: res.ok, status: res.status, data: d || {} }; });
    }, function () { return { ok: false, status: 0, data: { error: 'network' } }; });
  }

  // ── robot check (SEC-136, 2026-11-24): Cloudflare Turnstile on Reserve ─────
  // Same site key as sign-up (window.LOKALI_TURNSTILE_SITE_KEY). The server only
  // insists once its secret is set; without a key here nothing is drawn.
  var tsLoading = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (tsLoading) return tsLoading;
    tsLoading = new Promise(function (resolve) {
      var sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      sc.async = true;
      sc.onload = function () { resolve(window.turnstile || null); };
      sc.onerror = function () { tsLoading = null; resolve(null); };
      document.head.appendChild(sc);
    });
    return tsLoading;
  }
  function robotBox(box) {
    var key = window.LOKALI_TURNSTILE_SITE_KEY, state = { token: '', id: null };
    if (!key || !box) return { token: function () { return ''; }, reset: function () {} };
    loadTurnstile().then(function (ts) {
      if (!ts || !box.isConnected) return;
      try {
        state.id = ts.render(box, { sitekey: key, callback: function (t) { state.token = t; }, 'expired-callback': function () { state.token = ''; }, 'error-callback': function () { state.token = ''; } });
      } catch (e) {}
    });
    return {
      token: function () { return state.token; },
      reset: function () { state.token = ''; try { if (window.turnstile && state.id != null) window.turnstile.reset(state.id); } catch (e) {} }
    };
  }

  // ── styles (Plus Jakarta Sans set explicitly; violet + lavender, no black) ──
  function styles() {
    if (document.getElementById('lke-css')) return;
    var s = document.createElement('style'); s.id = 'lke-css';
    s.textContent = [
      '.lke,.lke *,.lke-sheet,.lke-sheet *{box-sizing:border-box;font-family:"Plus Jakarta Sans",-apple-system,sans-serif;}',
      '.lke{margin:0 0 28px;}',
      '.lke-h{font-size:22px;font-weight:700;color:#1A1829;margin:0 0 12px;}',
      '.lke-card{background:#fff;border:1px solid #E7E1F3;border-radius:18px;overflow:hidden;margin:0 0 14px;scroll-margin-top:90px;}',
      '.lke-photo{display:block;width:100%;height:190px;object-fit:cover;background:#E5D4FD;}',
      '.lke-body{padding:16px 18px 18px;}',
      '.lke-title{font-size:19px;font-weight:700;color:#1A1829;margin:0 0 4px;line-height:1.3;}',
      '.lke-when{font-size:14px;color:#45415A;margin:0 0 12px;}',
      '.lke-buy{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
      '.lke-price{font-size:20px;font-weight:700;color:#1A1829;}',
      '.lke-left{display:block;font-size:12px;font-weight:500;color:#6E6A85;margin-top:2px;}',
      '.lke-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 22px;border-radius:999px;border:0;background:#6002EE;color:#fff;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none;}',
      '.lke-btn[disabled]{opacity:.6;cursor:default;}',
      '.lke-btn2{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:999px;border:1.5px solid #6002EE;background:#fff;color:#6002EE;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none;}',
      '.lke-chip{display:inline-block;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:#F3EBFF;color:#6002EE;}',
      '.lke-desc{font-size:14px;line-height:1.6;color:#45415A;margin:14px 0 0;white-space:pre-line;}',
      '.lke-sub{font-size:14px;font-weight:700;color:#1A1829;margin:18px 0 8px;}',
      '.lke-person{display:flex;gap:12px;align-items:center;margin:0 0 10px;}',
      '.lke-av{width:38px;height:38px;border-radius:50%;background:#E5D4FD;color:#6002EE;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex:none;}',
      '.lke-pname{font-size:14px;font-weight:700;color:#1A1829;}',
      '.lke-prole{font-size:13px;color:#6E6A85;}',
      '.lke-prole a{color:#6002EE;font-weight:600;text-decoration:none;}',
      '.lke-where{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#F3EBFF;border-radius:14px;padding:12px 14px;font-size:14px;color:#1A1829;}',
      '.lke-where a{color:#6002EE;font-weight:700;text-decoration:none;white-space:nowrap;}',
      '.lke-map{display:block;width:100%;height:150px;object-fit:cover;border-radius:14px;margin:0 0 8px;background:#F3EBFF;}',
      '.lke-note{font-size:12px;color:#6E6A85;margin:12px 0 0;line-height:1.5;}',
      '.lke-wait{background:#F3EBFF;border-radius:14px;padding:14px;margin-top:14px;}',
      '.lke-wait p{margin:0 0 8px;font-size:14px;color:#1A1829;}',
      '.lke-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}',
      '.lke-in{min-height:44px;border:1px solid #E7E1F3;border-radius:10px;padding:0 12px;font-size:15px;color:#1A1829;background:#fff;}',
      '.lke-ok{font-size:14px;color:#17634A;font-weight:600;margin:8px 0 0;}',
      '.lke-err{font-size:13px;color:#B0006A;margin:8px 0 0;}',
      '.lke-ovl{position:fixed;inset:0;background:rgba(26,24,41,.45);z-index:99999;display:flex;align-items:flex-end;justify-content:center;}',
      '@media(min-width:640px){.lke-ovl{align-items:center;}}',
      '.lke-sheet{background:#fff;width:100%;max-width:440px;border-radius:22px 22px 0 0;padding:20px 20px 24px;max-height:92vh;overflow:auto;}',
      '@media(min-width:640px){.lke-sheet{border-radius:22px;}}',
      '.lke-sheet h3{font-size:18px;font-weight:700;color:#1A1829;margin:0 0 2px;}',
      '.lke-sheet .lke-when{margin:0 0 14px;}',
      '.lke-step{display:flex;align-items:center;gap:12px;}',
      '.lke-step button{width:42px;height:42px;border-radius:12px;border:1px solid #E7E1F3;background:#fff;font-size:20px;color:#6002EE;cursor:pointer;}',
      '.lke-step b{min-width:22px;text-align:center;font-size:17px;color:#1A1829;}',
      '.lke-lbl{display:block;font-size:13px;color:#6E6A85;margin:14px 0 4px;}',
      '.lke-total{display:flex;justify-content:space-between;border-top:1px solid #E7E1F3;padding-top:12px;margin-top:14px;font-size:15px;color:#1A1829;}',
      '.lke-info{background:#F3EBFF;border-radius:12px;padding:10px 12px;font-size:13px;color:#45415A;margin:12px 0 14px;line-height:1.5;}',
      '.lke-x{float:right;border:0;background:none;font-size:15px;color:#6E6A85;cursor:pointer;min-height:36px;}',
      '.lke-fine{font-size:12px;color:#6E6A85;text-align:center;margin:10px 0 0;line-height:1.5;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── where to draw ──────────────────────────────────────────────────────────
  function mountPoint() {
    var sec = document.getElementById('lke-events');
    if (sec) return sec;
    sec = document.createElement('section');
    sec.id = 'lke-events';
    sec.className = 'lke';
    var anchor = document.createElement('a'); anchor.id = 'events'; anchor.setAttribute('aria-hidden', 'true');
    sec.appendChild(anchor);
    var main = document.querySelector('.vl-op-main');
    if (main) { main.insertBefore(sec, main.firstChild); return sec; }
    var grid = document.querySelector('.vl-op-grid');
    if (grid && grid.parentNode) { grid.parentNode.insertBefore(sec, grid); return sec; }
    var hero = document.querySelector('.vl-hero');
    if (hero && hero.parentNode) { hero.parentNode.insertBefore(sec, hero.nextSibling); return sec; }
    return null;
  }

  var VENDOR = null;

  function render(list) {
    var sec = mountPoint();
    if (!sec) return;
    sec.innerHTML = '<a id="events" aria-hidden="true"></a>';
    var h = document.createElement('h2'); h.className = 'lke-h';
    h.textContent = list.length === 1 ? 'Coming up' : 'Events coming up';
    sec.appendChild(h);
    leaveBanner(sec);
    spotBanner(sec);
    list.forEach(function (ev) { sec.appendChild(card(ev)); });
    var m = /^#event-(\d+)$/.exec(window.location.hash || '');
    if (m || window.location.hash === '#events') {
      var target = m ? document.getElementById('lke-ev-' + m[1]) : sec;
      if (target && target.scrollIntoView) setTimeout(function () { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
    }
  }

  function card(ev) {
    var c = document.createElement('article');
    c.className = 'lke-card';
    c.id = 'lke-ev-' + ev.id;
    var left = Number(ev.tickets_left) || 0;
    var open = !!ev.sales_open;
    var soldOut = left <= 0;
    var free = !!ev.is_free || Number(ev.price_cents) === 0;   // #261 free events: "Reserve a spot"
    var unit = free ? 'spot' : 'ticket';
    var html = '';
    if (ev.photo_url) html += '<img class="lke-photo" src="' + esc(ev.photo_url) + '" alt="" loading="lazy">';
    html += '<div class="lke-body">';
    if (soldOut) html += '<span class="lke-chip" style="margin-bottom:8px;">' + (free ? 'Full' : 'Sold out') + '</span>';
    html += '<h3 class="lke-title">' + esc(ev.title) + '</h3>';
    html += '<p class="lke-when">' + esc(when(ev.starts_at, ev.ends_at)) + '</p>';
    html += '<div class="lke-buy"><span class="lke-price">' + (free ? 'Free' : money(ev.price_cents)) + '<span class="lke-left">' +
      (!soldOut && left <= 10 ? esc(left + ' of ' + ev.capacity + ' ' + unit + 's left') : (free ? 'reserve your spot' : 'per ticket')) + '</span></span>';
    if (open && !soldOut) html += '<button type="button" class="lke-btn" data-lke-buy="' + esc(ev.id) + '">' + (free ? 'Reserve a spot' : 'Get tickets') + '</button>';
    html += '</div>';
    if (!open && !soldOut) html += '<p class="lke-note">Ticket sales open soon.</p>';
    html += '<div data-lke-wait></div>';
    if (ev.description) html += '<p class="lke-desc">' + esc(ev.description) + '</p>';
    if (ev.lineup && ev.lineup.length) {
      html += '<p class="lke-sub">Lineup</p>';
      ev.lineup.forEach(function (p) {
        var ini = String(p.name || '?').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
        var bits = [p.role, p.time_label].filter(Boolean).map(esc).join(' · ');
        var link = p.vendor_slug ? (bits ? ' · ' : '') + '<a href="/' + esc(p.vendor_slug) + '">Visit their page</a>' : '';
        html += '<div class="lke-person"><div class="lke-av">' + esc(ini) + '</div><div><div class="lke-pname">' + esc(p.name) + '</div>' +
          (bits || link ? '<div class="lke-prole">' + bits + link + '</div>' : '') + '</div></div>';
      });
    }
    html += '<p class="lke-sub">Where</p>';
    var key = (typeof window.LOKALI_GMAPS_KEY === 'string') ? window.LOKALI_GMAPS_KEY.trim() : '';
    if (window.LOKALI_STATIC_MAPS === true && key) {
      var q = encodeURIComponent(ev.place);
      html += '<img class="lke-map" alt="Map of ' + esc(ev.place) + '" loading="lazy" src="https://maps.googleapis.com/maps/api/staticmap?center=' + q +
        '&zoom=15&size=640x300&scale=2&markers=color:0x6002EE%7C' + q + '&key=' + encodeURIComponent(key) + '" onerror="this.style.display=\'none\'">';
    }
    html += '<div class="lke-where"><span>' + esc(ev.place) + '</span><a href="' + esc(directions(ev.place)) + '" target="_blank" rel="noopener">Directions</a></div>';
    if (open) html += '<p class="lke-note">' + (free ? 'Free. Spots close when the event starts.' : esc(refundLine(ev.guest_refund)) + ' Ticket sales close when the event starts.') + '</p>';
    html += '</div>';
    c.innerHTML = html;
    var b = c.querySelector('[data-lke-buy]');
    if (b) b.addEventListener('click', function () { if (free) openReserve(ev); else openSheet(ev); });
    if (soldOut && ev.waitlist_enabled && new Date(ev.starts_at) > new Date()) waitBox(c.querySelector('[data-lke-wait]'), ev);
    return c;
  }

  // ── sold out: the simple waitlist ───────────────────────────────────────────
  function waitBox(box, ev) {
    jwt().then(function (t) {
      var signedIn = !!t;
      var max = Math.min(Number(ev.max_per_buyer) || 10, 20);
      var opts = '';
      var u = (ev.is_free || Number(ev.price_cents) === 0) ? 'spot' : 'ticket';
      for (var i = 1; i <= max; i++) opts += '<option value="' + i + '">' + i + ' ' + u + (i === 1 ? '' : 's') + '</option>';
      box.innerHTML = '<div class="lke-wait"><p><b>Want in if ' + u + 's open up?</b></p>' +
        '<p style="font-size:13px;color:#45415A;">If anyone cancels, we email everyone on the list at the same time. First to ' + (u === 'spot' ? 'reserve' : 'buy') + ' gets them.</p>' +
        '<div class="lke-row">' + (signedIn ? '' : '<input class="lke-in" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Your email" style="flex:1 1 200px;">') +
        '<select class="lke-in" aria-label="How many">' + opts + '</select></div>' +
        '<div style="margin-top:10px;"><button type="button" class="lke-btn2">Email me if ' + u + 's open up</button></div><div data-msg></div></div>';
      var btn = box.querySelector('button'), msg = box.querySelector('[data-msg]');
      var mail = box.querySelector('input'), qty = box.querySelector('select');
      btn.addEventListener('click', function () {
        msg.innerHTML = '';
        var email = mail ? mail.value.trim() : '';
        if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.innerHTML = '<p class="lke-err">Add your email so we can tell you.</p>'; mail.focus(); return; }
        btn.disabled = true; btn.textContent = 'Adding you';
        post('/checkout/event-waitlist', { action: 'join', events_id: ev.id, email: email, quantity: Number(qty.value) || 1 }, true).then(function (r) {
          if (r.ok) {
            box.innerHTML = '<div class="lke-wait"><p class="lke-ok" style="margin:0;">You\'re on the waitlist. We\'ll email you if ' + u + 's open up.</p></div>';
          } else {
            btn.disabled = false; btn.textContent = 'Email me if ' + u + 's open up';
            var e = r.data && r.data.error;
            msg.innerHTML = '<p class="lke-err">' + (e === 'waitlist_closed' ? 'The waitlist for this event is closed.' : e === 'bad_email' ? 'That email doesn\'t look right. Try again?' : e === 'rate_limited' ? 'Too many tries. Give it a few minutes.' : 'That didn\'t go through. Try again in a moment.') + '</p>';
          }
        });
      });
    });
  }

  // ── the link in the waitlist email ─────────────────────────────────────────
  function leaveBanner(sec) {
    var token = '';
    try { token = new URLSearchParams(window.location.search).get('waitlist_leave') || ''; } catch (e) {}
    if (!/^[0-9a-f-]{36}$/i.test(token)) return;
    var b = document.createElement('div'); b.className = 'lke-wait'; b.style.margin = '0 0 14px';
    b.innerHTML = '<p><b>Take you off the waitlist?</b> You won\'t get any more emails about tickets for this event.</p>' +
      '<div class="lke-row"><button type="button" class="lke-btn2">Yes, take me off</button></div><div data-msg></div>';
    sec.appendChild(b);
    var btn = b.querySelector('button');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      post('/checkout/event-waitlist', { action: 'leave', token: token }, false).then(function (r) {
        b.innerHTML = r.ok ? '<p class="lke-ok" style="margin:0;">Done. You\'re off the waitlist.</p>' : '<p class="lke-err" style="margin:0;">That didn\'t go through. Try again in a moment.</p>';
      });
    });
  }

  // ── free events: the links in the spot emails (#261) ───────────────────────
  // ?spot_confirm=<token> "Confirm my spot" · ?spot_cancel=<token> "Give my spot back".
  // The page asks first: an email link scanner opening the URL changes nothing.
  function spotBanner(sec) {
    var qs; try { qs = new URLSearchParams(window.location.search); } catch (e) { return; }
    var conf = qs.get('spot_confirm') || '', canc = qs.get('spot_cancel') || '';
    var token = /^[0-9a-f-]{36}$/i.test(conf) ? conf : /^[0-9a-f-]{36}$/i.test(canc) ? canc : '';
    if (!token) return;
    var isConfirm = token === conf;
    var b = document.createElement('div'); b.className = 'lke-wait'; b.style.margin = '0 0 14px';
    b.innerHTML = isConfirm
      ? '<p><b>One tap to confirm your spot.</b> Then you\'re on the guest list.</p><div class="lke-row"><button type="button" class="lke-btn">Confirm my spot</button></div>'
      : '<p><b>Give your spot back?</b> Someone on the waitlist can have it.</p><div class="lke-row"><button type="button" class="lke-btn2">Yes, give it back</button></div>';
    sec.appendChild(b);
    var btn = b.querySelector('button');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      post('/checkout/event-reserve', { action: isConfirm ? 'confirm' : 'cancel', token: token }, false).then(function (r) {
        var e = r.data && r.data.error;
        if (r.ok) {
          b.innerHTML = '<p class="lke-ok" style="margin:0;">' + (isConfirm
            ? (r.data.already ? 'You\'re already on the list. See you there.' : 'You\'re on the list. Your confirmation is in your email.')
            : 'Done. Your spot is free for someone else.') + '</p>';
        } else {
          b.innerHTML = '<p class="lke-err" style="margin:0;">' + (e === 'sold_out' ? 'Sorry, the event filled up before you confirmed.'
            : e === 'canceled' ? 'This spot was given back earlier.'
            : e === 'event_canceled' ? 'This event was canceled.'
            : e === 'sales_closed' ? 'This event has already started.'
            : 'That didn\'t go through. Try again in a moment.') + '</p>';
        }
      });
    });
  }

  // ── free events: the reserve sheet (#261) ───────────────────────────────────
  function openReserve(ev) {
    var left = Number(ev.tickets_left) || 0;
    var max = Math.max(1, Math.min(Number(ev.max_per_buyer) || 10, left, 20));
    var qty = 1;
    var host = (VENDOR && VENDOR.name) || 'the host';
    var ovl = document.createElement('div'); ovl.className = 'lke-ovl';
    ovl.setAttribute('role', 'dialog'); ovl.setAttribute('aria-modal', 'true'); ovl.setAttribute('aria-label', 'Reserve a spot');
    ovl.innerHTML = '<div class="lke-sheet">' +
      '<button type="button" class="lke-x" aria-label="Close">Close</button>' +
      '<h3>' + esc(ev.title) + '</h3><p class="lke-when">' + esc(host) + ' · ' + esc(shortWhen(ev.starts_at)) + ' · Free</p>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;font-size:15px;color:#1A1829;"><span>How many people?</span>' +
      '<span class="lke-step"><button type="button" data-d="-1" aria-label="One less">−</button><b data-q>1</b><button type="button" data-d="1" aria-label="One more">+</button></span></div>' +
      '<label class="lke-lbl" for="lke-rname">Name for the guest list</label>' +
      '<input class="lke-in" id="lke-rname" type="text" autocomplete="name" maxlength="120" style="width:100%;" placeholder="The name you\'ll give at the door">' +
      '<div data-mailrow><label class="lke-lbl" for="lke-rmail">Your email</label>' +
      '<input class="lke-in" id="lke-rmail" type="email" autocomplete="email" maxlength="200" style="width:100%;" placeholder="you@example.com"></div>' +
      '<div class="lke-info">Free, nothing to print. We\'ll email you to confirm, then your name is on the list at the door.</div>' +
      '<div data-robot style="display:flex;justify-content:center;margin:0 0 12px;"></div>' +
      '<button type="button" class="lke-btn" data-go style="width:100%;">Reserve my spot</button><div data-msg></div>' +
      '</div>';
    document.body.appendChild(ovl);
    var prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    var qEl = ovl.querySelector('[data-q]'), go = ovl.querySelector('[data-go]'), msg = ovl.querySelector('[data-msg]');
    var nameIn = ovl.querySelector('#lke-rname'), mailIn = ovl.querySelector('#lke-rmail'), mailRow = ovl.querySelector('[data-mailrow]');
    var signedIn = false;
    var robot = robotBox(ovl.querySelector('[data-robot]'));
    jwt().then(function (t) {
      signedIn = !!t;
      if (signedIn) { mailRow.style.display = 'none'; ovl.querySelector('.lke-info').textContent = 'Free, nothing to print. Your name goes on the list at the door, and the confirmation goes to your account email.'; }
    });
    function draw() { qEl.textContent = qty; go.textContent = qty === 1 ? 'Reserve my spot' : 'Reserve ' + qty + ' spots'; }
    draw();
    ovl.querySelectorAll('[data-d]').forEach(function (bt) {
      bt.addEventListener('click', function () { qty = Math.max(1, Math.min(max, qty + Number(bt.getAttribute('data-d')))); draw(); });
    });
    function close() { ovl.remove(); document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ovl.querySelector('.lke-x').addEventListener('click', close);
    ovl.addEventListener('click', function (e) { if (e.target === ovl) close(); });
    setTimeout(function () { try { nameIn.focus(); } catch (e) {} }, 50);
    go.addEventListener('click', function () {
      msg.innerHTML = '';
      var name = nameIn.value.replace(/\s+/g, ' ').trim();
      var email = mailIn.value.trim();
      if (!name) { msg.innerHTML = '<p class="lke-err">Add the name you\'ll give at the door.</p>'; nameIn.focus(); return; }
      if (!signedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.innerHTML = '<p class="lke-err">Add your email so we can confirm your spot.</p>'; mailIn.focus(); return; }
      go.disabled = true; go.textContent = 'Reserving';
      post('/checkout/event-reserve', { action: 'reserve', events_id: ev.id, quantity: qty, guest_name: name, email: signedIn ? '' : email, cf_token: robot.token() }, true).then(function (r) {
        if (r.ok) {
          var done = r.data.status === 'confirmed';
          ovl.querySelector('.lke-sheet').innerHTML = '<button type="button" class="lke-x" aria-label="Close">Close</button>' +
            '<h3>' + (done ? 'You\'re on the list' : 'Check your email') + '</h3>' +
            '<p class="lke-when" style="margin:6px 0 14px;">' + (done
              ? 'Your confirmation is in your email, with Add to calendar and Directions.'
              : 'We sent a "Confirm your spot" email to ' + esc(r.data.email_hint || 'you') + '. Tap the button in it within 20 minutes to keep your spot.') + '</p>' +
            '<button type="button" class="lke-btn" data-done style="width:100%;">Done</button>';
          ovl.querySelector('.lke-x').addEventListener('click', close);
          ovl.querySelector('[data-done]').addEventListener('click', close);
          return;
        }
        go.disabled = false; draw(); robot.reset();
        var e = r.data && r.data.error;
        var t = e === 'robot_check' ? 'Tick the box above to show you\'re a person, then try again.'
          : e === 'sold_out' ? (r.data.available > 0 ? 'Only ' + r.data.available + ' left now. Choose fewer?' : 'Those spots just went.')
          : e === 'already_reserved' ? (r.data.status === 'pending' ? 'You already asked for a spot: check your email for the Confirm button.' : 'You\'re already on the list for this event.')
          : e === 'sales_closed' ? 'This event has already started.'
          : e === 'bad_email' ? 'That email doesn\'t look right. Try again?'
          : e === 'bad_quantity' ? 'That\'s more than one person can reserve for this event.'
          : e === 'rate_limited' || e === 'busy' ? 'Lots of people at once. Give it a few minutes.'
          : 'That didn\'t go through. Try again in a moment.';
        msg.innerHTML = '<p class="lke-err">' + esc(t) + '</p>';
      });
    });
  }

  // ── the ticket sheet ───────────────────────────────────────────────────────
  function openSheet(ev) {
    var left = Number(ev.tickets_left) || 0;
    var max = Math.max(1, Math.min(Number(ev.max_per_buyer) || 10, left, 20));
    var qty = 1;
    var ovl = document.createElement('div'); ovl.className = 'lke-ovl';
    ovl.setAttribute('role', 'dialog'); ovl.setAttribute('aria-modal', 'true'); ovl.setAttribute('aria-label', 'Get tickets');
    var host = (VENDOR && VENDOR.name) || 'the host';
    ovl.innerHTML = '<div class="lke-sheet">' +
      '<button type="button" class="lke-x" aria-label="Close">Close</button>' +
      '<h3>' + esc(ev.title) + '</h3><p class="lke-when">' + esc(host) + ' · ' + esc(shortWhen(ev.starts_at)) + '</p>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;font-size:15px;color:#1A1829;"><span>How many tickets?</span>' +
      '<span class="lke-step"><button type="button" data-d="-1" aria-label="One less">−</button><b data-q>1</b><button type="button" data-d="1" aria-label="One more">+</button></span></div>' +
      '<label class="lke-lbl" for="lke-guest">Name for the guest list</label>' +
      '<input class="lke-in" id="lke-guest" type="text" autocomplete="name" maxlength="120" style="width:100%;" placeholder="The name you\'ll give at the door">' +
      '<div class="lke-total"><span data-line></span><b data-sum></b></div>' +
      '<div class="lke-info">Nothing to print. Your name will be on the list at the door, and we\'ll email you the details.</div>' +
      '<button type="button" class="lke-btn" data-pay style="width:100%;"></button><div data-msg></div>' +
      '<p class="lke-fine">Paid securely through Stripe to ' + esc(host) + '. ' + esc(refundLine(ev.guest_refund)) + ' Questions? Message ' + esc(host) + ' from this page.</p>' +
      '</div>';
    document.body.appendChild(ovl);
    var prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    var qEl = ovl.querySelector('[data-q]'), line = ovl.querySelector('[data-line]'), sum = ovl.querySelector('[data-sum]');
    var pay = ovl.querySelector('[data-pay]'), msg = ovl.querySelector('[data-msg]'), guest = ovl.querySelector('#lke-guest');
    function draw() {
      qEl.textContent = qty;
      line.textContent = qty + (qty === 1 ? ' ticket' : ' tickets') + ' × ' + money(ev.price_cents);
      sum.textContent = money(ev.price_cents * qty);
      pay.textContent = 'Pay ' + money(ev.price_cents * qty) + ' by card';
    }
    draw();
    ovl.querySelectorAll('[data-d]').forEach(function (b) {
      b.addEventListener('click', function () { qty = Math.max(1, Math.min(max, qty + Number(b.getAttribute('data-d')))); draw(); });
    });
    function close() { ovl.remove(); document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ovl.querySelector('.lke-x').addEventListener('click', close);
    ovl.addEventListener('click', function (e) { if (e.target === ovl) close(); });
    // A signed-in shopper's own name, when the account has one.
    try {
      var acct = window.LokaliAccount && window.LokaliAccount.state && window.LokaliAccount.state.account;
      var nm = acct && [acct.first_name, acct.last_name].filter(Boolean).join(' ');
      if (nm) guest.value = nm;
    } catch (e) {}
    setTimeout(function () { try { guest.focus(); } catch (e) {} }, 50);
    pay.addEventListener('click', function () {
      msg.innerHTML = '';
      var name = guest.value.replace(/\s+/g, ' ').trim();
      if (!name) { msg.innerHTML = '<p class="lke-err">Add the name you\'ll give at the door.</p>'; guest.focus(); return; }
      pay.disabled = true; pay.textContent = 'Opening the secure payment page';
      post('/checkout/ticket', { events_id: ev.id, quantity: qty, guest_name: name, return_url: window.location.href.split('#')[0] + '#event-' + ev.id }, true).then(function (r) {
        if (r.ok && r.data && r.data.url) { window.location.href = r.data.url; return; }
        pay.disabled = false; draw();
        var e = r.data && r.data.error;
        var t = e === 'sold_out'
          ? (r.data.available > 0 ? 'Only ' + r.data.available + ' left now. Choose fewer?' : 'Those tickets just sold out.')
          : e === 'sales_closed' ? 'Ticket sales for this event have closed.'
          : e === 'bad_quantity' ? 'That\'s more than one person can buy for this event.'
          : e === 'checkout_not_available' ? 'Card payments are paused for this storefront right now. Message them from this page.'
          : e === 'rate_limited' ? 'Too many tries. Give it a few minutes.'
          : 'The payment page didn\'t open. Try again in a moment.';
        msg.innerHTML = '<p class="lke-err">' + esc(t) + '</p>';
      });
    });
  }

  // ── start ──────────────────────────────────────────────────────────────────
  var started = false;
  function start(v) {
    if (started || !v || v.id == null) return;
    started = true;
    VENDOR = v;
    client().then(function (c) {
      if (!c) return null;
      return c.rpc('vendor_events_public', { p_vendors_id: Number(v.id) });
    }).then(function (r) {
      var list = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
      if (!list.length) return;
      styles();
      var tries = 0;
      (function attempt() {
        if (document.querySelector('.vl-op-main') || tries > 20) { render(list); return; }
        tries++; setTimeout(attempt, 250);
      })();
    }).catch(function () {});
  }
  if (window.LOKALI_LOADED_VENDOR) start(window.LOKALI_LOADED_VENDOR);
  document.addEventListener('lokali:vendor-loaded', function (e) { start(e.detail || window.LOKALI_LOADED_VENDOR); });

  window.LokaliEvents = { when: when, refundLine: refundLine };
})();
