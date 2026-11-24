/**
 * Lokali — vendor dashboard "Events" page (#261, F 2026-11-23, mockup
 * docs/design/event-tickets-2026-11/mockup-v3.html screens 1, 2 and 8).
 *
 * Load AFTER the sitewide bundle (window.LokaliSupabase, LokaliAuth, LokaliAPI,
 * LokaliSupabaseAPI). Self-mounting into <div id="lok-events-page"></div>;
 * no-op if absent.
 *
 *   List      upcoming + past events, tickets sold, Guest list / Edit / Share
 *   Form      one column: name, photo, date, start + end, price, tickets
 *             available, where (from the profile), refund rule (3 choices);
 *             "More options": about, lineup (link someone on Lokali or type a
 *             name), waitlist switch, most tickets one person can buy
 *   Share     right after saving: the event's link, a QR code, an Instagram
 *             Story card (1080 x 1920 PNG)
 *   Door      vendor_event_guests: find a name, Mark here (with Undo), print or
 *             download, Cancel event and refund everyone
 *
 * Writes go straight to vendor_events / vendor_event_lineup under the owner's
 * database rules (patch_event_tickets.sql). Money moves only through the
 * server: checkout/event-cancel (refunds) and checkout/event-waitlist (notify
 * after adding tickets).
 */
(function () {
  'use strict';
  var ROOT_ID = 'lok-events-page';
  var BASE = ((window.LOKALI_BILLING_BASE ? String(window.LOKALI_BILLING_BASE) : 'https://lokali-api.vercel.app/api/lokali')).replace(/\/$/, '');
  var TZ = 'America/Chicago';
  var SELF_SRC = (document.currentScript && document.currentScript.src) || '';

  function $(sel, r) { return (r || document).querySelector(sel); }
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

  // Central-time wall clock <-> UTC ISO (the inputs are local to the event).
  function tzOffsetMin(utcMs) {
    var p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcMs));
    var g = {}; p.forEach(function (x) { g[x.type] = x.value; });
    var asUtc = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour % 24, +g.minute);
    return (asUtc - utcMs) / 60000;
  }
  function toIso(dateStr, timeStr) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || ''), t = /^(\d{2}):(\d{2})$/.exec(timeStr || '');
    if (!d || !t) return null;
    var guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
    var off = tzOffsetMin(guess);
    var ms = guess - off * 60000;
    var off2 = tzOffsetMin(ms);           // second pass handles the DST edge
    if (off2 !== off) ms = guess - off2 * 60000;
    return new Date(ms).toISOString();
  }
  function fromIso(iso) {
    if (!iso) return { date: '', time: '' };
    var p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
    var g = {}; p.forEach(function (x) { g[x.type] = x.value; });
    return { date: g.year + '-' + g.month + '-' + g.day, time: (('0' + (+g.hour % 24)).slice(-2)) + ':' + g.minute };
  }

  function client() {
    if (window.LokaliSupabase && typeof window.LokaliSupabase.from === 'function') return Promise.resolve(window.LokaliSupabase);
    return Promise.resolve(window.LokaliSupabaseReady).then(function () { return window.LokaliSupabase; });
  }
  function jwt() {
    var A = window.LokaliAuth;
    if (!A || typeof A.token !== 'function') return Promise.reject(new Error('no auth'));
    return Promise.resolve().then(function () { return A.token(); });
  }
  function post(path, body) {
    return jwt().then(function (t) {
      if (!t) throw new Error('Not signed in');
      return fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }, body: JSON.stringify(body || {}) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) { return { ok: res.ok, status: res.status, data: d || {} }; });
    }, function () { return { ok: false, status: 0, data: { error: 'network' } }; });
  }

  function styles() {
    if (document.getElementById('lkea-css')) return;
    var s = document.createElement('style'); s.id = 'lkea-css';
    s.textContent = [
      '#' + ROOT_ID + ',#' + ROOT_ID + ' *,.lkea-ovl,.lkea-ovl *{box-sizing:border-box;font-family:"Plus Jakarta Sans",-apple-system,sans-serif;}',
      '#' + ROOT_ID + '{max-width:720px;color:#45415A;}',
      '.lkea-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px;}',
      '.lkea-h1{font-size:24px;font-weight:700;color:#1A1829;margin:0;}',
      '.lkea-intro{font-size:14px;color:#6E6A85;margin:4px 0 0;line-height:1.5;}',
      '.lkea-card{background:#fff;border:1px solid #E7E1F3;border-radius:16px;padding:16px;margin:0 0 12px;}',
      '.lkea-soft{background:#F3EBFF;border-radius:16px;padding:16px;margin:0 0 14px;}',
      '.lkea-t{font-size:16px;font-weight:700;color:#1A1829;margin:0 0 2px;}',
      '.lkea-m{font-size:13px;color:#6E6A85;margin:0;}',
      '.lkea-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}',
      '.lkea-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;border:0;background:#6002EE;color:#fff;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none;}',
      '.lkea-btn[disabled]{opacity:.6;cursor:default;}',
      '.lkea-btn2{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border-radius:999px;border:1.5px solid #E5D4FD;background:#fff;color:#6002EE;font-weight:700;font-size:13px;cursor:pointer;text-decoration:none;}',
      '.lkea-link{border:0;background:none;color:#6002EE;font-weight:600;font-size:13px;cursor:pointer;padding:6px 0;}',
      '.lkea-lbl{display:block;font-size:13px;color:#6E6A85;margin:14px 0 4px;}',
      '.lkea-in{width:100%;min-height:46px;border:1px solid #E7E1F3;border-radius:10px;padding:0 12px;font-size:16px;color:#1A1829;background:#fff;}',
      'textarea.lkea-in{min-height:96px;padding:10px 12px;line-height:1.5;}',
      '.lkea-chips{display:flex;gap:8px;flex-wrap:wrap;}',
      '.lkea-chip{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #E7E1F3;background:#fff;color:#45415A;font-size:13px;cursor:pointer;}',
      '.lkea-chip.on{background:#F3EBFF;border-color:#6002EE;color:#6002EE;font-weight:700;}',
      '.lkea-photo{display:flex;align-items:center;gap:12px;}',
      '.lkea-photo img{width:72px;height:72px;border-radius:12px;object-fit:cover;background:#E5D4FD;}',
      '.lkea-more{border-top:1px solid #E7E1F3;margin-top:18px;padding-top:6px;}',
      '.lkea-more summary{cursor:pointer;color:#6002EE;font-weight:700;font-size:14px;min-height:44px;display:flex;align-items:center;}',
      '.lkea-lu{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 6px;}',
      '.lkea-lu [data-n]{flex:1 1 100%;}',
      '.lkea-lu [data-r]{flex:1 1 140px;}',
      '.lkea-lu .lkea-in{min-height:42px;font-size:14px;}',
      '.lkea-sw{display:flex;align-items:center;gap:10px;font-size:14px;color:#1A1829;margin:14px 0 0;cursor:pointer;}',
      '.lkea-sw input{width:20px;height:20px;accent-color:#6002EE;}',
      '.lkea-err{font-size:13px;color:#B0006A;margin:10px 0 0;}',
      '.lkea-ok{font-size:13px;color:#17634A;font-weight:600;margin:10px 0 0;}',
      '.lkea-row{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:56px;border-top:1px solid #E7E1F3;font-size:15px;color:#1A1829;}',
      '.lkea-here{min-height:40px;padding:0 16px;border-radius:999px;border:1.5px solid #6002EE;background:#fff;color:#6002EE;font-weight:700;font-size:13px;cursor:pointer;}',
      '.lkea-here.on{background:#E0F5EB;border-color:#E0F5EB;color:#17634A;}',
      '.lkea-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#F3EBFF;color:#1A1829;border:1px solid #E5D4FD;border-radius:12px;padding:10px 14px;font-size:14px;display:flex;gap:14px;align-items:center;z-index:99999;box-shadow:0 6px 20px rgba(96,2,238,.12);}',
      '.lkea-toast button{border:0;background:none;color:#6002EE;font-weight:700;cursor:pointer;font-size:14px;}',
      '.lkea-share{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;}',
      '.lkea-share img{width:100%;border-radius:12px;background:#F3EBFF;display:block;}',
      '.lkea-pick{border:1px solid #E7E1F3;border-radius:10px;margin:4px 0 8px;background:#fff;}',
      '.lkea-pick button{display:block;width:100%;text-align:left;border:0;background:none;padding:10px 12px;font-size:14px;color:#1A1829;cursor:pointer;}',
      '.lkea-pick button:hover{background:#F3EBFF;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  var V = null;          // the signed-in storefront
  var root = null;

  function vendorLive() { return !!(V && V.checkout_enabled && V.stripe_charges_enabled && V.stripe_account_id); }
  function eventLink(ev) { return 'https://www.golokali.com/' + (V && V.slug ? V.slug : '') + '#event-' + ev.id; }

  // ── list ─────────────────────────────────────────────────────────────────────
  function showList(flash) {
    root.innerHTML = '';
    var top = document.createElement('div'); top.className = 'lkea-top';
    top.innerHTML = '<div><h1 class="lkea-h1">Events</h1><p class="lkea-intro">Sell tickets to your classes, workshops and openings. Guests pay by card, and their names land on your door list.</p></div>' +
      '<button type="button" class="lkea-btn" data-add>Add an event</button>';
    root.appendChild(top);
    top.querySelector('[data-add]').addEventListener('click', function () { showForm(null); });
    if (flash) { var f = document.createElement('p'); f.className = 'lkea-ok'; f.style.margin = '0 0 12px'; f.textContent = flash; root.appendChild(f); }
    if (!vendorLive()) {
      var n = document.createElement('div'); n.className = 'lkea-soft';
      n.innerHTML = '<p class="lkea-t">Free events work right away</p><p class="lkea-m" style="color:#45415A;">For paid tickets, turn on card payments first. It takes about 10 minutes with Stripe; until then, paid events show "Ticket sales open soon".</p>' +
        '<div class="lkea-acts"><a class="lkea-btn2" href="/vendor-dashboard/settings#lokali-checkout">Turn on card payments</a></div>';
      root.appendChild(n);
    }
    var box = document.createElement('div'); box.innerHTML = '<p class="lkea-m">Loading your events</p>';
    root.appendChild(box);
    client().then(function (c) {
      return c.from('vendor_events').select('*').eq('vendors_id', V.id).is('deleted_at', null).order('starts_at', { ascending: true });
    }).then(function (r) {
      var rows = (r && !r.error && r.data) ? r.data : [];
      box.innerHTML = '';
      if (!rows.length) {
        var e = document.createElement('div'); e.className = 'lkea-card';
        e.innerHTML = '<p class="lkea-t">No events yet</p><p class="lkea-m">Add one and it shows on your page and on the This week page, with a Get tickets button.</p>';
        box.appendChild(e);
        return;
      }
      var now = Date.now();
      var up = rows.filter(function (x) { return new Date(x.ends_at || x.starts_at).getTime() + 3 * 36e5 > now && !x.canceled_at; });
      var past = rows.filter(function (x) { return up.indexOf(x) < 0; });
      up.forEach(function (ev) { box.appendChild(eventCard(ev, false)); });
      if (past.length) {
        var d = document.createElement('details'); d.className = 'lkea-more';
        d.innerHTML = '<summary>Past and canceled (' + past.length + ')</summary>';
        past.reverse().forEach(function (ev) { d.appendChild(eventCard(ev, true)); });
        box.appendChild(d);
      }
    }).catch(function () { box.innerHTML = '<p class="lkea-err">We could not load your events. Try again in a moment.</p>'; });
  }

  function eventCard(ev, past) {
    var c = document.createElement('div'); c.className = 'lkea-card';
    c.innerHTML = '<p class="lkea-t">' + esc(ev.title) + (ev.canceled_at ? ' <span class="lkea-m" style="display:inline;">· canceled</span>' : '') + '</p>' +
      '<p class="lkea-m">' + esc(when(ev.starts_at, ev.ends_at)) + ' · ' + esc(ev.place) + '</p>' +
      '<p class="lkea-m" data-sold style="margin-top:4px;">' + (ev.price_cents === 0 ? 'Free · ' + esc(ev.capacity) + ' spots' : money(ev.price_cents) + ' · ' + esc(ev.capacity) + ' tickets') + '</p>' +
      '<div class="lkea-acts"><button type="button" class="lkea-btn2" data-g>Guest list</button>' +
      (past ? '' : '<button type="button" class="lkea-btn2" data-e>Edit</button><button type="button" class="lkea-btn2" data-s>Share</button>') + '</div>';
    c.querySelector('[data-g]').addEventListener('click', function () { showGuests(ev); });
    if (!past) {
      c.querySelector('[data-e]').addEventListener('click', function () { showForm(ev); });
      c.querySelector('[data-s]').addEventListener('click', function () { showShare(ev, false); });
    }
    client().then(function (cl) { return cl.rpc('event_tickets_taken', { p_events_id: ev.id }); }).then(function (r) {
      if (r && !r.error && typeof r.data === 'number') {
        $('[data-sold]', c).textContent = (ev.price_cents === 0 ? 'Free · ' + r.data + ' of ' + ev.capacity + ' spots taken' : money(ev.price_cents) + ' · ' + r.data + ' of ' + ev.capacity + ' tickets taken');
      }
    }).catch(function () {});
    return c;
  }

  // ── add / edit ───────────────────────────────────────────────────────────────
  function showForm(ev) {
    var isNew = !ev;
    ev = ev || { title: '', description: '', photo_url: '', starts_at: null, ends_at: null, place: V.address || V.business_name || '', price_cents: null, capacity: null, max_per_buyer: 10, guest_refund: '2d', waitlist_enabled: true };
    var s = fromIso(ev.starts_at), e = fromIso(ev.ends_at);
    root.innerHTML = '';
    var back = document.createElement('button'); back.type = 'button'; back.className = 'lkea-link'; back.textContent = 'Back to events';
    back.addEventListener('click', function () { showList(); });
    root.appendChild(back);
    var f = document.createElement('div'); f.className = 'lkea-card';
    f.innerHTML = '<p class="lkea-t" style="font-size:18px;">' + (isNew ? 'Add an event with tickets' : 'Edit event') + '</p>' +
      '<label class="lkea-lbl" for="lkea-title">Event name</label><input class="lkea-in" id="lkea-title" maxlength="120" placeholder="Opening night: new work">' +
      '<span class="lkea-lbl">Photo</span><div class="lkea-photo"><img data-ph alt="" style="' + (ev.photo_url ? '' : 'display:none;') + '"><label class="lkea-btn2" style="cursor:pointer;">' + (ev.photo_url ? 'Change photo' : 'Add a photo') + '<input type="file" accept="image/*" data-file style="display:none;"></label></div>' +
      '<label class="lkea-lbl" for="lkea-date">Date</label><input class="lkea-in" id="lkea-date" type="date">' +
      '<label class="lkea-lbl" for="lkea-start">Starts</label><input class="lkea-in" id="lkea-start" type="time" step="900">' +
      '<label class="lkea-lbl" for="lkea-end">Ends (optional)</label><input class="lkea-in" id="lkea-end" type="time" step="900">' +
      '<span class="lkea-lbl">Tickets</span><div class="lkea-chips" data-kind><button type="button" class="lkea-chip" data-v="paid">Paid</button><button type="button" class="lkea-chip" data-v="free">Free</button></div>' +
      '<div data-paidonly><label class="lkea-lbl" for="lkea-price">Ticket price, in dollars</label><input class="lkea-in" id="lkea-price" type="number" inputmode="decimal" min="1" step="0.01" placeholder="25"></div>' +
      '<p class="lkea-m" data-freenote style="display:none;margin-top:8px;">No card, no Lokali fee. Guests reserve with their name and email, confirm by email, and land on the same guest list.</p>' +
      '<label class="lkea-lbl" for="lkea-cap" data-caplbl>Tickets available</label><input class="lkea-in" id="lkea-cap" type="number" inputmode="numeric" min="1" max="2000" step="1" placeholder="40">' +
      '<label class="lkea-lbl" for="lkea-place">Where is it?</label><input class="lkea-in" id="lkea-place" maxlength="120">' +
      '<span class="lkea-lbl">If you cancel the event</span><p class="lkea-m" data-cancelnote style="background:#F3EBFF;border-radius:10px;padding:10px 12px;color:#45415A;">Everyone gets a full refund, with one button.</p>' +
      '<div data-paidonly2><span class="lkea-lbl">If a guest can\'t come</span><div class="lkea-chips" data-refund>' +
        '<button type="button" class="lkea-chip" data-v="none">No refunds</button><button type="button" class="lkea-chip" data-v="2d">Up to 2 days before</button><button type="button" class="lkea-chip" data-v="7d">Up to 7 days before</button></div></div>' +
      '<details class="lkea-more"' + (isNew ? '' : ' open') + '><summary>More options: about, lineup, waitlist</summary>' +
        '<label class="lkea-lbl" for="lkea-desc">About this event (optional)</label><textarea class="lkea-in" id="lkea-desc" maxlength="1000" placeholder="What guests can expect"></textarea>' +
        '<span class="lkea-lbl">Lineup (optional)</span><div data-lineup></div>' +
        '<button type="button" class="lkea-link" data-addp>Add a person</button>' +
        '<p class="lkea-m">Pick someone on Lokali to link their page, or type any name.</p>' +
        '<label class="lkea-sw"><input type="checkbox" data-wait> Start a waitlist if it sells out</label>' +
        '<label class="lkea-lbl" for="lkea-max">Most tickets one person can buy</label><input class="lkea-in" id="lkea-max" type="number" min="1" max="20" step="1">' +
      '</details>' +
      '<div class="lkea-acts" style="margin-top:18px;"><button type="button" class="lkea-btn" data-save>' + (isNew ? 'Save and share' : 'Save changes') + '</button></div><div data-msg></div>' +
      (isNew ? '' : '<div class="lkea-acts" style="border-top:1px solid #E7E1F3;margin-top:18px;padding-top:6px;"><button type="button" class="lkea-link" data-remove>Remove this event</button></div>');
    root.appendChild(f);

    $('#lkea-title', f).value = ev.title || '';
    $('#lkea-desc', f).value = ev.description || '';
    $('#lkea-date', f).value = s.date; $('#lkea-start', f).value = s.time; $('#lkea-end', f).value = e.time;
    $('#lkea-price', f).value = ev.price_cents ? (ev.price_cents / 100) : '';
    $('#lkea-cap', f).value = ev.capacity || '';
    $('#lkea-place', f).value = ev.place || '';
    $('#lkea-max', f).value = ev.max_per_buyer || 10;
    $('[data-wait]', f).checked = ev.waitlist_enabled !== false;
    var refund = ev.guest_refund || '2d';
    function drawRefund() { f.querySelectorAll('[data-refund] .lkea-chip').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === refund); }); }
    f.querySelectorAll('[data-refund] .lkea-chip').forEach(function (b) { b.addEventListener('click', function () { refund = b.getAttribute('data-v'); drawRefund(); }); });
    drawRefund();
    // #261 free events: Paid / Free. An event with tickets or spots taken can't switch (the database refuses too).
    var kind = (!isNew && ev.price_cents === 0) ? 'free' : 'paid';
    function drawKind() {
      f.querySelectorAll('[data-kind] .lkea-chip').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === kind); });
      $('[data-paidonly]', f).style.display = kind === 'free' ? 'none' : '';
      $('[data-paidonly2]', f).style.display = kind === 'free' ? 'none' : '';
      $('[data-freenote]', f).style.display = kind === 'free' ? '' : 'none';
      $('[data-caplbl]', f).textContent = kind === 'free' ? 'Spots available' : 'Tickets available';
      $('[data-cancelnote]', f).textContent = kind === 'free' ? 'Everyone with a spot gets an email, with one button.' : 'Everyone gets a full refund, with one button.';
    }
    f.querySelectorAll('[data-kind] .lkea-chip').forEach(function (b) { b.addEventListener('click', function () { kind = b.getAttribute('data-v'); drawKind(); }); });
    drawKind();

    var photo = ev.photo_url || '';
    var ph = $('[data-ph]', f);
    if (photo) ph.src = photo;
    $('[data-file]', f).addEventListener('change', function (evt) {
      var file = evt.target.files && evt.target.files[0];
      if (!file) return;
      var msg = $('[data-msg]', f); msg.innerHTML = '<p class="lkea-m">Uploading your photo</p>';
      var S = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.storage;
      if (!S) { msg.innerHTML = '<p class="lkea-err">Photo upload isn\'t ready yet. Reload the page and try again.</p>'; return; }
      S.uploadImage(V.id, 'showcase', file).then(function (r) {
        if (r && r.data && r.data.url) { photo = r.data.url; ph.src = photo; ph.style.display = ''; msg.innerHTML = ''; }
        else msg.innerHTML = '<p class="lkea-err">' + esc((r && r.error && r.error.message) || 'The photo did not upload. Try another one?') + '</p>';
      });
    });

    // lineup rows
    var lineup = [], removedIds = [];
    var luBox = $('[data-lineup]', f);
    function drawLineup() {
      luBox.innerHTML = '';
      lineup.forEach(function (p, i) {
        var row = document.createElement('div');
        row.innerHTML = '<div class="lkea-lu"><input class="lkea-in" placeholder="Name" aria-label="Name" maxlength="80" data-n><input class="lkea-in" placeholder="What they do" aria-label="What they do" maxlength="80" data-r><input class="lkea-in" placeholder="7 pm" aria-label="Time" maxlength="40" data-t style="flex:0 0 88px;"><button type="button" class="lkea-link" data-x aria-label="Remove">Remove</button></div>' +
          '<div class="lkea-m" data-linked style="margin:-2px 0 8px;"></div><div class="lkea-pick" data-pick style="display:none;"></div>';
        var n = $('[data-n]', row), r = $('[data-r]', row), t = $('[data-t]', row), linked = $('[data-linked]', row), pick = $('[data-pick]', row);
        n.value = p.name || ''; r.value = p.role || ''; t.value = p.time_label || '';
        function drawLinked() { linked.innerHTML = p.linked_vendors_id ? 'Linked to their Lokali page · <button type="button" class="lkea-link" data-unlink>Unlink</button>' : ''; var u = $('[data-unlink]', linked); if (u) u.addEventListener('click', function () { p.linked_vendors_id = null; drawLinked(); }); }
        drawLinked();
        var timer = null;
        n.addEventListener('input', function () {
          p.name = n.value;
          clearTimeout(timer);
          var q = n.value.trim();
          if (q.length < 3) { pick.style.display = 'none'; return; }
          timer = setTimeout(function () {
            client().then(function (c) {
              return c.from('vendors').select('id,business_name,slug').eq('is_active', true).eq('is_approved', true).ilike('business_name', '%' + q.replace(/[%_,()]/g, ' ') + '%').limit(5);
            }).then(function (res) {
              var hits = (res && res.data) ? res.data.filter(function (x) { return x.id !== V.id; }) : [];
              if (!hits.length) { pick.style.display = 'none'; return; }
              pick.innerHTML = hits.map(function (x) { return '<button type="button" data-id="' + esc(x.id) + '">Link ' + esc(x.business_name) + ' on Lokali</button>'; }).join('');
              pick.style.display = '';
              pick.querySelectorAll('button').forEach(function (b, k) {
                b.addEventListener('click', function () { p.linked_vendors_id = hits[k].id; if (!p.name) { p.name = hits[k].business_name; n.value = p.name; } pick.style.display = 'none'; drawLinked(); });
              });
            }).catch(function () {});
          }, 300);
        });
        r.addEventListener('input', function () { p.role = r.value; });
        t.addEventListener('input', function () { p.time_label = t.value; });
        $('[data-x]', row).addEventListener('click', function () { if (p.id) removedIds.push(p.id); lineup.splice(i, 1); drawLineup(); });
        luBox.appendChild(row);
      });
    }
    $('[data-addp]', f).addEventListener('click', function () { if (lineup.length < 20) { lineup.push({ name: '', role: '', time_label: '', linked_vendors_id: null }); drawLineup(); } });
    if (!isNew) {
      client().then(function (c) { return c.from('vendor_event_lineup').select('*').eq('events_id', ev.id).order('sort_order'); })
        .then(function (r) { lineup = (r && r.data) ? r.data : []; drawLineup(); }).catch(function () {});
    }

    var rm = $('[data-remove]', f);
    if (rm) rm.addEventListener('click', function () {
      client().then(function (c) { return c.rpc('event_tickets_taken', { p_events_id: ev.id }); }).then(function (r) {
        var taken = (r && typeof r.data === 'number') ? r.data : 0;
        if (taken > 0) { $('[data-msg]', f).innerHTML = '<p class="lkea-err">' + taken + ' tickets are already sold. To call it off, open the Guest list and use "Cancel event and refund everyone".</p>'; return null; }
        if (!window.confirm('Remove "' + ev.title + '"? It comes off your page and the This week page.')) return null;
        return client().then(function (c) { return c.from('vendor_events').update({ deleted_at: new Date().toISOString() }).eq('id', ev.id); }).then(function (u) {
          if (u && u.error) throw u.error;
          showList('Event removed.');
        });
      }).catch(function () { $('[data-msg]', f).innerHTML = '<p class="lkea-err">That did not work. Try again in a moment.</p>'; });
    });

    $('[data-save]', f).addEventListener('click', function () {
      var msg = $('[data-msg]', f); msg.innerHTML = '';
      var title = $('#lkea-title', f).value.replace(/\s+/g, ' ').trim();
      var starts = toIso($('#lkea-date', f).value, $('#lkea-start', f).value);
      var endT = $('#lkea-end', f).value;
      var ends = endT ? toIso($('#lkea-date', f).value, endT) : null;
      if (starts && ends && new Date(ends) <= new Date(starts)) ends = new Date(new Date(ends).getTime() + 864e5).toISOString(); // ends after midnight
      var price = kind === 'free' ? 0 : Math.round(parseFloat($('#lkea-price', f).value) * 100);
      var cap = parseInt($('#lkea-cap', f).value, 10);
      var place = $('#lkea-place', f).value.replace(/\s+/g, ' ').trim();
      var max = Math.max(1, Math.min(20, parseInt($('#lkea-max', f).value, 10) || 10));
      var problem = !title ? 'Add the event name.' : !starts ? 'Add the date and start time.' : (isNew && new Date(starts) < new Date()) ? 'That start time has already passed.'
        : (kind === 'paid' && !(price >= 100)) ? 'Add a ticket price of at least $1, or choose Free.' : price > 100000 ? 'Ticket price can be up to $1,000.'
        : !(cap >= 1 && cap <= 2000) ? 'Add how many tickets are available (1 to 2,000).' : !place ? 'Add where it is.' : '';
      if (problem) { msg.innerHTML = '<p class="lkea-err">' + esc(problem) + '</p>'; return; }
      var row = { title: title, description: $('#lkea-desc', f).value.trim() || null, photo_url: photo || null, starts_at: starts, ends_at: ends,
        place: place, price_cents: price, capacity: cap, max_per_buyer: max, guest_refund: refund, waitlist_enabled: !!$('[data-wait]', f).checked };
      var btn = $('[data-save]', f); btn.disabled = true; btn.textContent = 'Saving';
      var oldCap = ev.capacity || 0;
      client().then(function (c) {
        var q = isNew ? c.from('vendor_events').insert(Object.assign({ vendors_id: V.id }, row)).select('*').single()
                      : c.from('vendor_events').update(row).eq('id', ev.id).select('*').single();
        return q.then(function (r) {
          if (r.error) throw r.error;
          var saved = r.data;
          // lineup: remove, then insert / update in order
          var ops = removedIds.map(function (id) { return c.from('vendor_event_lineup').delete().eq('id', id); });
          lineup.filter(function (p) { return (p.name || '').trim(); }).forEach(function (p, i) {
            var lr = { sort_order: i, name: p.name.trim().slice(0, 80), role: (p.role || '').trim() || null, time_label: (p.time_label || '').trim() || null, linked_vendors_id: p.linked_vendors_id || null };
            ops.push(p.id ? c.from('vendor_event_lineup').update(lr).eq('id', p.id) : c.from('vendor_event_lineup').insert(Object.assign({ events_id: saved.id }, lr)));
          });
          return Promise.all(ops).then(function () { return saved; });
        });
      }).then(function (saved) {
        if (!isNew && saved.capacity > oldCap) post('/checkout/event-waitlist', { action: 'notify', events_id: saved.id }).catch(function () {});
        if (isNew) showShare(saved, true); else showList('Saved.');
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = isNew ? 'Save and share' : 'Save changes';
        var m = String((err && err.message) || '');
        msg.innerHTML = '<p class="lkea-err">' + (/switch between free and paid/.test(m) ? 'People already have tickets or spots, so this event can\'t switch between free and paid.'
          : /already taken/.test(m) ? esc(m.replace(/^.*vendor_event: /, '').replace(/^(\d+)/, '$1') + '. Tickets available can\'t go below that.')
          : /daily limit/.test(m) ? 'That\'s 10 new events today. Add more tomorrow.'
          : 'That did not save. Check the details and try again.') + '</p>';
      });
    });
  }

  // ── share (right after saving, or from the list) ─────────────────────────────
  function loadQr() {
    if (window.LokaliQR) return Promise.resolve(window.LokaliQR);
    return new Promise(function (resolve) {
      var src = SELF_SRC ? SELF_SRC.replace(/lokali-events-admin(\.min)?\.js.*$/, 'lokali-qr-kit.js') : '';
      if (!src) { resolve(null); return; }
      var sc = document.createElement('script'); sc.src = src; sc.async = true;
      sc.onload = function () { resolve(window.LokaliQR || null); };
      sc.onerror = function () { resolve(null); };
      document.head.appendChild(sc);
    });
  }

  function storyCard(ev, qrDataUrl) {
    return new Promise(function (resolve) {
      var W = 1080, H = 1920;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var x = cv.getContext('2d');
      x.fillStyle = '#F3EBFF'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#E5D4FD'; x.beginPath(); x.arc(W, 0, 520, 0, Math.PI * 2); x.fill();
      function wrap(text, size, weight, color, y, maxLines) {
        x.font = weight + ' ' + size + 'px "Plus Jakarta Sans", sans-serif'; x.fillStyle = color;
        var words = String(text).split(/\s+/), line = '', lines = [];
        words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (x.measureText(t).width > W - 160 && line) { lines.push(line); line = w; } else line = t; });
        if (line) lines.push(line);
        lines.slice(0, maxLines).forEach(function (l, i) { x.fillText(l, 80, y + i * size * 1.2); });
        return y + Math.min(lines.length, maxLines) * size * 1.2;
      }
      var y = 260;
      y = wrap((V.business_name || '').toUpperCase(), 40, '700', '#6002EE', y, 2) + 40;
      y = wrap(ev.title, 96, '700', '#1A1829', y, 4) + 40;
      y = wrap(when(ev.starts_at, ev.ends_at), 46, '500', '#45415A', y, 2) + 10;
      y = wrap(ev.place, 46, '500', '#45415A', y, 2) + 60;
      wrap(ev.price_cents === 0 ? 'Free · Reserve on Lokali' : 'Tickets ' + money(ev.price_cents) + ' on Lokali', 52, '700', '#6002EE', y, 1);
      function finish() { resolve(cv.toDataURL('image/png')); }
      if (!qrDataUrl) { finish(); return; }
      var img = new Image();
      img.onload = function () { x.fillStyle = '#fff'; x.fillRect(300, 1300, 480, 480); x.drawImage(img, 320, 1320, 440, 440); finish(); };
      img.onerror = finish;
      img.src = qrDataUrl;
    });
  }

  function download(dataUrl, name) {
    var a = document.createElement('a'); a.href = dataUrl; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function showShare(ev, fresh) {
    root.innerHTML = '';
    var back = document.createElement('button'); back.type = 'button'; back.className = 'lkea-link'; back.textContent = 'Back to events';
    back.addEventListener('click', function () { showList(); });
    root.appendChild(back);
    var link = eventLink(ev);
    var c = document.createElement('div'); c.className = 'lkea-card';
    c.innerHTML = '<p class="lkea-t" style="font-size:18px;">' + (fresh ? 'Your event is up' : 'Share your event') + '</p>' +
      '<p class="lkea-m" style="margin:0 0 12px;">Most guests come from your own people. Send them here.</p>' +
      '<div style="display:flex;gap:8px;"><input class="lkea-in" readonly value="' + esc(link) + '" data-link style="font-size:14px;"><button type="button" class="lkea-btn2" data-copy>Copy</button></div>' +
      '<div class="lkea-share"><div><img data-story alt="Story card preview" style="aspect-ratio:9/16;object-fit:cover;"></div><div><img data-qr alt="QR code for your event" style="aspect-ratio:1/1;"></div></div>' +
      '<div class="lkea-acts"><button type="button" class="lkea-btn" data-dl-story disabled>Save the Story card</button><button type="button" class="lkea-btn2" data-dl-qr disabled>Save the QR code</button></div>';
    root.appendChild(c);
    if (fresh && !vendorLive() && ev.price_cents !== 0) {
      var n = document.createElement('div'); n.className = 'lkea-soft';
      n.innerHTML = '<p class="lkea-t">One more step: turn on card payments</p><p class="lkea-m" style="color:#45415A;">Your event shows now with "Ticket sales open soon". The Get tickets button appears once card payments are on.</p><div class="lkea-acts"><a class="lkea-btn2" href="/vendor-dashboard/settings#lokali-checkout">Turn on card payments</a></div>';
      root.appendChild(n);
    }
    $('[data-copy]', c).addEventListener('click', function () {
      var b = this;
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { $('[data-link]', c).select(); });
    });
    loadQr().then(function (Q) {
      var qr = null;
      try { qr = Q ? Q.toPngDataUrl(link, 880) : null; } catch (e) { qr = null; }
      return Promise.resolve(qr);
    }).then(function (qr) {
      if (qr) { $('[data-qr]', c).src = qr; var bq = $('[data-dl-qr]', c); bq.disabled = false; bq.addEventListener('click', function () { download(qr, 'event-qr.png'); }); }
      else $('[data-qr]', c).style.display = 'none';
      return (document.fonts && document.fonts.load ? document.fonts.load('700 40px "Plus Jakarta Sans"').catch(function () {}) : Promise.resolve()).then(function () { return storyCard(ev, qr); });
    }).then(function (png) {
      $('[data-story]', c).src = png;
      var bs = $('[data-dl-story]', c); bs.disabled = false;
      bs.addEventListener('click', function () { download(png, 'event-story.png'); });
    });
  }

  // ── the door list ────────────────────────────────────────────────────────────
  function showGuests(ev) {
    root.innerHTML = '';
    var back = document.createElement('button'); back.type = 'button'; back.className = 'lkea-link'; back.textContent = 'Back to events';
    back.addEventListener('click', function () { showList(); });
    root.appendChild(back);
    var c = document.createElement('div'); c.className = 'lkea-card';
    c.innerHTML = '<p class="lkea-m">Loading the guest list</p>';
    root.appendChild(c);
    client().then(function (cl) { return cl.rpc('vendor_event_guests', { p_events_id: ev.id }); }).then(function (r) {
      var d = r && r.data;
      if (!d || !d.ok) { c.innerHTML = '<p class="lkea-err">We could not load this guest list.</p>'; return; }
      drawGuests(c, d);
    }).catch(function () { c.innerHTML = '<p class="lkea-err">We could not load this guest list.</p>'; });
  }

  function lastFirst(n) {
    var p = String(n || '').trim().split(/\s+/);
    return p.length > 1 ? p[p.length - 1] + ', ' + p.slice(0, -1).join(' ') : (p[0] || 'Guest');
  }

  function drawGuests(c, d) {
    var ev = d.event;
    var guests = (d.guests || []).slice().sort(function (a, b) { return lastFirst(a.guest_name).localeCompare(lastFirst(b.guest_name)); });
    var live = guests.filter(function (g) { return g.status !== 'refunded' && g.status !== 'pending'; });
    var isFree = Number(ev.price_cents) === 0;   // #261 free events: spots, no money line
    function hereCount() { return live.reduce(function (n, g) { return n + (g.checked_in_at ? Number(g.quantity) || 0 : 0); }, 0); }
    var fee = Number(d.fee_cents) || 0, sales = Number(d.sales_cents) || 0;
    c.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;"><p class="lkea-t" style="font-size:18px;">Guest list</p><span data-here style="font-size:14px;font-weight:700;color:#17634A;"></span></div>' +
      '<p class="lkea-m">' + esc(ev.title) + ' · ' + esc(when(ev.starts_at, ev.ends_at)) + '</p>' +
      '<p class="lkea-m" style="margin-top:4px;">' + (isFree ? esc(d.tickets_taken) + ' of ' + esc(ev.capacity) + ' spots taken · free event' : esc(d.tickets_taken) + ' of ' + esc(ev.capacity) + ' tickets taken · ' + money(sales) + ' in ticket sales · Lokali\'s fee ' + money(fee) + ' · Stripe takes its card fee separately') +
        (Number(d.waiting) ? ' · ' + esc(d.waiting) + ' waiting for tickets' : '') + '</p>' +
      (ev.canceled_at ? '<p class="lkea-m" style="background:#F3EBFF;border-radius:10px;padding:10px 12px;margin-top:10px;color:#45415A;">This event is canceled. ' + (isFree ? 'Everyone with a spot was told.' : 'Everyone was refunded in full.') + '</p>' : '') +
      '<div class="lkea-acts"><button type="button" class="lkea-btn2" data-print>Print or download the list</button></div>' +
      '<input class="lkea-in" type="search" placeholder="Find a name" aria-label="Find a name" data-find style="margin:12px 0 6px;">' +
      '<div data-rows></div>' +
      (ev.canceled_at ? '' : '<p style="text-align:center;margin:18px 0 0;"><button type="button" class="lkea-link" data-cancel>Plans changed? Cancel event and ' + (isFree ? 'tell everyone' : 'refund everyone') + '</button></p>') +
      '<div data-msg></div>';
    var rowsBox = $('[data-rows]', c), hereEl = $('[data-here]', c);
    function drawHere() { hereEl.textContent = hereCount() + ' of ' + d.tickets_taken + ' here'; }
    function drawRows() {
      var q = ($('[data-find]', c).value || '').trim().toLowerCase();
      rowsBox.innerHTML = '';
      var shown = guests.filter(function (g) { return !q || String(g.guest_name || '').toLowerCase().indexOf(q) >= 0 || String(g.shopper_email || '').toLowerCase().indexOf(q) >= 0; });
      if (!shown.length) { rowsBox.innerHTML = '<p class="lkea-m" style="padding:12px 0;">' + (guests.length ? 'No one by that name.' : 'No tickets sold yet.') + '</p>'; return; }
      shown.forEach(function (g) {
        var row = document.createElement('div'); row.className = 'lkea-row';
        if (g.status === 'refunded' || g.status === 'pending') {
          row.innerHTML = '<span style="color:#6E6A85;">' + esc(lastFirst(g.guest_name)) + ' · ' + esc(g.quantity) + ' · ' + (g.status === 'pending' ? 'waiting to confirm' : 'refunded') + '</span>';
        } else {
          row.innerHTML = '<span>' + esc(lastFirst(g.guest_name)) + ' <span style="color:#6E6A85;">· ' + esc(g.quantity) + '</span></span>' +
            '<button type="button" class="lkea-here' + (g.checked_in_at ? ' on' : '') + '">' + (g.checked_in_at ? 'Here' : 'Mark here') + '</button>';
          $('button', row).addEventListener('click', function () { setHere(g, !g.checked_in_at); });
        }
        rowsBox.appendChild(row);
      });
    }
    function setHere(g, here) {
      var before = g.checked_in_at;
      g.checked_in_at = here ? new Date().toISOString() : null;
      drawRows(); drawHere();
      client().then(function (cl) {
        return g.kind === 'spot' ? cl.rpc('vendor_event_spot_checkin', { p_reservations_id: g.reservations_id, p_here: here })
                                 : cl.rpc('vendor_event_checkin', { p_orders_id: g.orders_id, p_here: here });
      }).then(function (r) {
        if (!r || r.error || !r.data || !r.data.ok) throw new Error('checkin');
        if (here) toast(g.guest_name + ' marked here', function () { setHere(g, false); });
      }).catch(function () { g.checked_in_at = before; drawRows(); drawHere(); toast('That did not save. Check your signal and tap again.'); });
    }
    $('[data-find]', c).addEventListener('input', drawRows);
    $('[data-print]', c).addEventListener('click', function () { printList(ev, live); });
    var cx = $('[data-cancel]', c);
    if (cx) cx.addEventListener('click', function () {
      var n = live.length;
      if (!window.confirm('Cancel "' + ev.title + '"?\n\n' + (isFree ? (n ? 'Everyone with a spot gets an email. ' : '') : '') + (!isFree && n ? (Number(d.tickets_taken) === 1 ? 'The 1 ticket sold gets' : 'All ' + d.tickets_taken + ' tickets sold get') + ' a full refund, and ' + (n === 1 ? 'the guest gets' : 'each of the ' + n + ' guests gets') + ' an email. ' : '') + 'The event comes off your page. This can\'t be undone.')) return;
      cx.disabled = true; cx.textContent = 'Canceling and refunding';
      post('/checkout/event-cancel', { events_id: ev.id }).then(function (r) {
        if (r.ok) { showList('Event canceled. ' + (isFree ? (r.data.spots_told === 1 ? '1 guest told.' : (r.data.spots_told || 0) + ' guests told.') : (r.data.refunded === 1 ? '1 refund sent.' : (r.data.refunded || 0) + ' refunds sent.'))); return; }
        cx.disabled = false; cx.textContent = 'Plans changed? Cancel event and ' + (isFree ? 'tell everyone' : 'refund everyone');
        var failed = (r.data && r.data.failed) || [];
        $('[data-msg]', c).innerHTML = '<p class="lkea-err">' + (failed.length ? (failed.length === 1 ? '1 refund did' : failed.length + ' refunds did') + ' not go through yet. Tap Cancel again to retry just those.' : 'That did not work. Try again in a moment.') + '</p>';
      });
    });
    drawRows(); drawHere();
  }

  function printList(ev, guests) {
    var rows = guests.map(function (g) { return '<tr><td style="padding:8px 0;border-bottom:1px solid #E7E1F3;width:28px;">&#9744;</td><td style="padding:8px 0;border-bottom:1px solid #E7E1F3;">' + esc(lastFirst(g.guest_name)) + '</td><td style="padding:8px 0;border-bottom:1px solid #E7E1F3;text-align:right;">' + esc(g.quantity) + '</td></tr>'; }).join('');
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Guest list</title><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700&display=swap" rel="stylesheet"></head>' +
      '<body style="font-family:\'Plus Jakarta Sans\',sans-serif;color:#1A1829;padding:24px;"><h1 style="font-size:22px;margin:0;">' + esc(ev.title) + '</h1><p style="color:#45415A;margin:4px 0 16px;">' + esc(when(ev.starts_at, ev.ends_at)) + ' · ' + esc(ev.place) + '</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:15px;"><tr><th></th><th style="text-align:left;">Name</th><th style="text-align:right;">Tickets</th></tr>' + rows + '</table></body></html>';
    var w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); setTimeout(function () { try { w.print(); } catch (e) {} }, 600); }
    var csv = 'Name,Tickets,Email\n' + guests.map(function (g) { return [lastFirst(g.guest_name), g.quantity, g.shopper_email || ''].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    download('data:text/csv;charset=utf-8,' + encodeURIComponent(csv), 'guest-list.csv');
  }

  var toastT = null;
  function toast(text, undo) {
    var old = document.querySelector('.lkea-toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'lkea-toast';
    t.innerHTML = '<span>' + esc(text) + '</span>' + (undo ? '<button type="button">Undo</button>' : '');
    document.body.appendChild(t);
    if (undo) $('button', t).addEventListener('click', function () { t.remove(); undo(); });
    clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, 5000);
  }

  // ── start ────────────────────────────────────────────────────────────────────
  function start() {
    root = document.getElementById(ROOT_ID);
    if (!root) return;
    styles();
    root.innerHTML = '<p class="lkea-m">Loading</p>';
    var API = window.LokaliAPI && window.LokaliAPI.vendors;
    if (!API || typeof API.me !== 'function') { setTimeout(start, 300); return; }
    API.me().then(function (out) {
      V = out && out.data && out.data.vendor;
      if (!V || V.id == null) { root.innerHTML = '<p class="lkea-err">Sign in with your storefront account to add events.</p>'; return; }
      showList();
    }, function () { root.innerHTML = '<p class="lkea-err">We could not load your storefront. Reload the page.</p>'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.LokaliEventsAdmin = { toIso: toIso, fromIso: fromIso };
})();
