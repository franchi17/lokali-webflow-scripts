/*
  Lokali — notification bell (#137)
  ---------------------------------------------------------------------------
  WHY THIS EXISTS: Lokali was correct but silent. Abuse reports sat in a table
  nobody read (#131); a vendor's specialty request waited three days and its
  approval was then invisible to them (#136); a vendor gets no in-app signal for
  a lead or a review. Same shape every time — the system knew something and
  never said it.

  WHAT IT IS: one bell in the header for whoever is signed in. Vendors, customers
  and the admin all read the SAME feed table; the server decides what is in it,
  so this script needs no notion of role at all.

  ⚠️ A BELL IS PULL, NOT PUSH. It only speaks once someone logs in, so it does
  NOT replace the report email (#134). Bell = the record + the in-app nudge;
  email = what reaches you when you are not looking.

  SAFETY: every value from the database is written with textContent, never
  innerHTML. Titles and bodies contain reporter/customer free text — a review
  comment or a report reason is attacker-controlled in the general case.

  Mounts beside the account chip in .header-wrapper, and as a row inside the
  mobile drawer (#lok-mnav-panel). Idempotent and self-contained; pairs with
  lokali-auth-nav.js (which owns the chip) and lokali-mobile-nav.js.
*/
(function () {
  'use strict';
  if (window.__lokaliNotifBooted) return;      // idempotent: the tag ships site-wide
  window.__lokaliNotifBooted = true;

  // Font Awesome Free 6.5.2 `bell` (regular), uploaded to the site's own assets
  // — the same convention every other icon here follows (crown-solid,
  // heart-regular, bullhorn-solid …), rather than pulling in the FA library.
  // ⚠️ Rendered as a CSS MASK, not an <img>: a mask takes its colour from
  // `background-color`, so the bell inherits the button's currentColor and
  // still turns violet on hover. An <img> would be stuck at the file's own
  // colour and would need a second asset for the hover state.
  var BELL_URL = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/6a81fd94dd848a6c178f429e_bell-regular-full.svg';
  var POLL_MS   = 90000;   // gentle background refresh while the tab is open
  var LIMIT     = 15;
  var state     = { items: [], unread: 0, open: false, loading: false };
  var mounts    = [];      // every bell we rendered (desktop + drawer)

  // ── styles ────────────────────────────────────────────────────────────────
  // House rules: Plus Jakarta Sans stated explicitly (injected UI never
  // inherits it reliably), violet/light surfaces only — no black/ink panels.
  function css() {
    if (document.getElementById('lok-notif-css')) return;
    var s = document.createElement('style');
    s.id = 'lok-notif-css';
    s.textContent = [
      '.lok-notif{position:relative;display:inline-flex;align-items:center;font-family:"Plus Jakarta Sans",sans-serif;}',
      '.lok-notif-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:none;background:none;border-radius:10px;cursor:pointer;color:#4A4761;padding:0;}',
      '.lok-notif-btn:hover{background:#F7F6FC;color:#6002EE;}',
      '.lok-notif-ico{display:block;width:19px;height:19px;background-color:currentColor;'+
        '-webkit-mask:url("' + BELL_URL + '") center/contain no-repeat;'+
        'mask:url("' + BELL_URL + '") center/contain no-repeat;}',
      // The badge is the whole point of a bell — peach/orange so it reads as
      // "new" against the violet chrome without shouting.
      '.lok-notif-dot{position:absolute;top:5px;right:5px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#FF8D00;color:#fff;font-size:10.5px;font-weight:800;line-height:17px;text-align:center;box-shadow:0 0 0 2px #fff;}',
      '.lok-notif-panel{position:absolute;top:calc(100% + 8px);right:0;width:340px;max-width:calc(100vw - 32px);background:#fff;border:.5px solid #EEEDF6;border-radius:14px;box-shadow:0 12px 32px rgba(26,24,41,.14);display:none;z-index:1100;overflow:hidden;}',
      '.lok-notif.open .lok-notif-panel{display:block;}',
      '.lok-notif-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;}',
      '.lok-notif-title{font-size:13px;font-weight:800;color:#1A1829;letter-spacing:-.2px;}',
      '.lok-notif-clear{border:none;background:none;color:#6002EE;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:4px 6px;border-radius:6px;}',
      '.lok-notif-clear:hover{background:#F7F6FC;}',
      '.lok-notif-clear[disabled]{color:#B3B1C6;cursor:default;background:none;}',
      '.lok-notif-list{max-height:min(60vh,420px);overflow-y:auto;padding:0 6px 6px;}',
      '.lok-notif-item{display:block;width:100%;text-align:left;border:none;background:none;font-family:inherit;padding:10px 10px;border-radius:10px;cursor:pointer;text-decoration:none;box-sizing:border-box;}',
      '.lok-notif-item:hover{background:#F7F6FC;}',
      '.lok-notif-it-top{display:flex;align-items:flex-start;gap:8px;}',
      '.lok-notif-unread{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#6002EE;margin-top:6px;}',
      '.lok-notif-unread.is-read{background:transparent;}',
      '.lok-notif-it-title{font-size:13.5px;font-weight:700;color:#1A1829;line-height:1.35;}',
      '.lok-notif-it-body{font-size:12.5px;color:#4A4761;line-height:1.45;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
      '.lok-notif-it-when{font-size:11px;color:#8E8BA6;margin-top:3px;}',
      // Dismiss (×). Hidden until hover on a pointer device so the panel stays
      // calm; ALWAYS visible on touch, where there is no hover to reveal it.
      '.lok-notif-x{flex:0 0 auto;border:none;background:none;color:#B3B1C6;font-family:inherit;font-size:15px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:6px;opacity:0;transition:opacity .12s;}',
      '.lok-notif-item:hover .lok-notif-x,.lok-notif-x:focus{opacity:1;}',
      '.lok-notif-x:hover{background:#FEF3F2;color:#C0392B;}',
      '@media (hover:none){.lok-notif-x{opacity:1;}}',
      '.lok-notif-empty{padding:22px 16px 26px;text-align:center;color:#8E8BA6;font-size:13px;line-height:1.5;}',
      '.lok-notif-empty strong{display:block;color:#4A4761;font-weight:700;margin-bottom:2px;}',
      '.lok-notif-foot{border-top:.5px solid #EEEDF6;padding:8px 10px;text-align:center;}',
      '.lok-notif-clearread{border:none;background:none;color:#8E8BA6;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;padding:6px 10px;border-radius:8px;}',
      '.lok-notif-clearread:hover{background:#F7F6FC;color:#6002EE;}',
      // #98 house rule: ≥44px tap targets under 991px.
      '@media (max-width:991px){.lok-notif-btn{width:44px;height:44px;}.lok-notif-item{min-height:44px;}.lok-notif-clear,.lok-notif-clearread{min-height:44px;display:inline-flex;align-items:center;justify-content:center;}.lok-notif-x{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;}}',
      // In the mobile drawer the panel is not a floating popover — it stacks.
      '#lok-mnav-panel .lok-notif{display:block;width:100%;}',
      '#lok-mnav-panel .lok-notif-panel{position:static;width:100%;max-width:none;box-shadow:none;border:none;border-top:.5px solid #EEEDF6;border-radius:0;margin-top:4px;}',
      '#lok-mnav-panel .lok-notif-btn{width:100%;justify-content:flex-start;gap:10px;padding:0 4px;}',
      '#lok-mnav-panel .lok-notif-btn::after{content:"Notifications";font-size:15px;font-weight:600;color:#1A1829;}',
      '#lok-mnav-panel .lok-notif-dot{position:static;margin-left:auto;box-shadow:none;}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  function bellSVG() {
    return '<span class="lok-notif-ico" aria-hidden="true"></span>';
  }

  // "just now / 5m / 3h / 2d / Aug 14" — short enough for a 340px panel.
  function ago(iso) {
    var t = iso ? Date.parse(iso) : NaN;
    if (isNaN(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    try {
      return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  function api() {
    var A = window.LokaliSupabaseAPI;
    return (A && A.notifications) ? A.notifications : null;
  }

  // ── data ──────────────────────────────────────────────────────────────────
  function load() {
    var n = api();
    if (!n || state.loading) return Promise.resolve();
    state.loading = true;
    return n.mine(LIMIT).then(function (res) {
      state.loading = false;
      var d = res && res.data;
      if (!d || d.ok !== true) return;          // signed out / not ready — leave as is
      state.items  = Array.isArray(d.items) ? d.items : [];
      state.unread = Number(d.unread) || 0;
      render();
    }).catch(function () { state.loading = false; });
  }

  function markAll() {
    var n = api();
    if (!n || !state.unread) return;
    // Optimistic: the badge clearing instantly is the whole feel of the thing.
    // Reverted by the next load() if the write actually failed.
    state.unread = 0;
    state.items = state.items.map(function (i) { i.read = true; return i; });
    render();
    n.markRead(null).catch(function () { load(); });
  }

  // Optimistic removal — the row disappearing instantly is what makes dismiss
  // feel like dismiss. load() puts it back if the delete actually failed.
  function dismiss(ids) {
    var n = api();
    if (!n) return;
    var set = {}; (ids || []).forEach(function (i) { set[i] = 1; });
    var removedUnread = state.items.filter(function (i) { return set[i.id] && !i.read; }).length;
    state.items = state.items.filter(function (i) { return !set[i.id]; });
    state.unread = Math.max(0, state.unread - removedUnread);
    render();
    n.dismiss(ids).catch(function () { load(); });
  }

  function dismissRead() {
    var n = api();
    if (!n) return;
    var had = state.items.some(function (i) { return i.read; });
    if (!had) return;
    state.items = state.items.filter(function (i) { return !i.read; });
    render();
    n.dismiss(null).catch(function () { load(); });   // null = read ones only
  }

  function openItem(item) {
    var n = api();
    if (n && !item.read) n.markRead([item.id]).catch(function () {});
    if (item.link_url) window.location.href = item.link_url;
  }

  // ── render ────────────────────────────────────────────────────────────────
  function render() {
    mounts.forEach(function (m) {
      var dot = m.querySelector('.lok-notif-dot');
      if (state.unread > 0) {
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'lok-notif-dot';
          m.querySelector('.lok-notif-btn').appendChild(dot);
        }
        dot.textContent = state.unread > 9 ? '9+' : String(state.unread);
        m.querySelector('.lok-notif-btn').setAttribute(
          'aria-label', state.unread + ' unread notification' + (state.unread === 1 ? '' : 's'));
      } else if (dot) {
        dot.remove();
        m.querySelector('.lok-notif-btn').setAttribute('aria-label', 'Notifications');
      }

      var list = m.querySelector('.lok-notif-list');
      var clear = m.querySelector('.lok-notif-clear');
      if (clear) clear.disabled = !state.unread;
      if (!list) return;
      list.textContent = '';

      if (!state.items.length) {
        var e = document.createElement('div');
        e.className = 'lok-notif-empty';
        var strong = document.createElement('strong');
        strong.textContent = 'Nothing yet';
        e.appendChild(strong);
        e.appendChild(document.createTextNode(
          'New leads, reviews and updates about your listings will show up here.'));
        list.appendChild(e);
        return;
      }

      state.items.forEach(function (item) {
        // A link when we have somewhere to send them, a button when we don't —
        // so middle-click / open-in-new-tab behave the way people expect.
        var row = document.createElement(item.link_url ? 'a' : 'button');
        row.className = 'lok-notif-item';
        if (item.link_url) row.href = item.link_url; else row.type = 'button';

        var top = document.createElement('div');
        top.className = 'lok-notif-it-top';
        var dotEl = document.createElement('span');
        dotEl.className = 'lok-notif-unread' + (item.read ? ' is-read' : '');
        var col = document.createElement('div');

        var t = document.createElement('div');
        t.className = 'lok-notif-it-title';
        t.textContent = item.title || '';       // ⚠️ textContent — user text
        col.appendChild(t);

        if (item.body) {
          var b = document.createElement('div');
          b.className = 'lok-notif-it-body';
          b.textContent = item.body;            // ⚠️ textContent — user text
          col.appendChild(b);
        }
        var w = document.createElement('div');
        w.className = 'lok-notif-it-when';
        w.textContent = ago(item.created_at);
        col.appendChild(w);

        var x = document.createElement('button');
        x.type = 'button'; x.className = 'lok-notif-x';
        x.setAttribute('aria-label', 'Dismiss this notification');
        x.textContent = '\u00d7';
        x.addEventListener('click', function (ev) {
          ev.preventDefault(); ev.stopPropagation();   // must not open the item
          dismiss([item.id]);
        });

        top.appendChild(dotEl); top.appendChild(col); top.appendChild(x);
        top.style.justifyContent = 'space-between';
        row.appendChild(top);
        row.addEventListener('click', function (ev) {
          if (item.link_url) { ev.preventDefault(); }
          openItem(item);
        });
        list.appendChild(row);
      });
    });
  }

  // ── mount ─────────────────────────────────────────────────────────────────
  function build() {
    var wrap = document.createElement('div');
    wrap.className = 'lok-notif';
    wrap.setAttribute('data-lok-notif', '1');
    wrap.innerHTML =
      '<button type="button" class="lok-notif-btn" aria-haspopup="true" aria-expanded="false" aria-label="Notifications">' +
        bellSVG() + '</button>' +
      '<div class="lok-notif-panel" role="dialog" aria-label="Notifications">' +
        '<div class="lok-notif-head">' +
          '<span class="lok-notif-title">Notifications</span>' +
          '<button type="button" class="lok-notif-clear">Mark all read</button>' +
        '</div><div class="lok-notif-list"></div>' +
        '<div class="lok-notif-foot"><button type="button" class="lok-notif-clearread">Clear read notifications</button></div>' +
      '</div>';

    var btn = wrap.querySelector('.lok-notif-btn');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !wrap.classList.contains('open');
      // Only one panel open at a time, across both mounts.
      mounts.forEach(function (m) { m.classList.remove('open');
        m.querySelector('.lok-notif-btn').setAttribute('aria-expanded', 'false'); });
      if (willOpen) {
        wrap.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        load();                       // always fetch fresh on open
      }
    });
    wrap.querySelector('.lok-notif-clear').addEventListener('click', function (e) {
      e.stopPropagation(); markAll();
    });
    wrap.querySelector('.lok-notif-clearread').addEventListener('click', function (e) {
      e.stopPropagation(); dismissRead();
    });
    wrap.querySelector('.lok-notif-panel').addEventListener('click', function (e) {
      e.stopPropagation();            // clicks inside must not close it
    });
    return wrap;
  }

  function mount() {
    // Beside the account chip on desktop; as a row in the mobile drawer.
    var hosts = [];
    var chip = document.querySelector('.header-wrapper [data-lok-acct]');
    if (chip && chip.parentNode) hosts.push({ parent: chip.parentNode, before: chip });
    var panel = document.querySelector('#lok-mnav-panel');
    if (panel) hosts.push({ parent: panel, before: panel.firstChild });

    hosts.forEach(function (h) {
      if (h.parent.querySelector(':scope > [data-lok-notif]')) return;  // already there
      var el = build();
      h.parent.insertBefore(el, h.before || null);
      mounts.push(el);
    });
    return mounts.length > 0;
  }

  document.addEventListener('click', function () {
    mounts.forEach(function (m) { m.classList.remove('open');
      m.querySelector('.lok-notif-btn').setAttribute('aria-expanded', 'false'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') mounts.forEach(function (m) { m.classList.remove('open'); });
  });

  // ── boot ──────────────────────────────────────────────────────────────────
  // Wait for BOTH a signed-in session and the account chip (auth-nav renders it
  // asynchronously). Give up quietly after ~20s rather than polling forever —
  // a signed-out visitor should cost nothing.
  function boot() {
    css();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var A = window.LokaliAuth;
      var signedIn = A && typeof A.isSignedIn === 'function' && A.isSignedIn();
      if (signedIn && mount()) {
        clearInterval(iv);
        load();
        // Refresh when the tab comes back — cheaper and less surprising than a
        // fast timer, and covers the "left it open all afternoon" case.
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) load();
        });
        setInterval(function () { if (!document.hidden) load(); }, POLL_MS);
      } else if (tries > 40) {
        clearInterval(iv);
      }
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
