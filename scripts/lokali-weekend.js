/**
 * lokali-weekend.js - the public "This week" page at /this-week (renamed from
 * "This weekend" / /this-weekend 2026-09-21, F: a week includes the weekend; the
 * file name and the weekend_feed() RPC keep their old names)
 * (release 3 of "build it all", 2026-09-20).
 *
 * Built entirely from vendors' own "Where I'll be" posts (weekend_feed() in
 * patch_vendor_posts.sql: public, repeats rolled forward, publish-ready vendors
 * only). Groups the next 9 days by day, then by place, and lists who will be
 * there. Gives shoppers a weekly reason to come back and gives Lokali one link to
 * share every Thursday. Mount: <div id="lokali-weekend"></div> (its inner markup
 * is the no-script fallback; this script replaces it).
 * No emoji, no em dashes, Plus Jakarta Sans set explicitly, no ink surfaces.
 * Every vendor-written string is escaped.
 */
(function () {
  'use strict';
  if (window.__lokWeekendBooted) return;
  window.__lokWeekendBooted = true;
  var F = '"Plus Jakarta Sans",sans-serif';

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function initials(n) { return String(n || 'V').split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase(); }
  function tm(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', ''); }

  function css() {
    if (document.getElementById('lkw-css')) return;
    var s = document.createElement('style'); s.id = 'lkw-css';
    s.textContent = [
      '.lkw{font-family:' + F + ';color:#1A1829;background:#F7F6FC;padding:56px 0 72px;}',
      '.lkw *{box-sizing:border-box;font-family:' + F + ';}',
      '.lkw-wrap{max-width:760px;margin:0 auto;padding:0 20px;}',
      '.lkw-eyebrow{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6002EE;}',
      '.lkw h1{font-size:34px;line-height:1.15;font-weight:700;margin:6px 0 10px;}',
      '.lkw-lede{font-size:17px;line-height:1.6;color:#4A4761;margin:0 0 26px;max-width:60ch;}',
      '.lkw-day{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6B6880;margin:26px 0 10px;}',
      '.lkw-card{background:#fff;border:1px solid #DEDAEE;border-radius:16px;padding:18px;margin:0 0 12px;}',
      '.lkw-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 10px;}',
      '.lkw-place{font-size:17px;font-weight:700;line-height:1.3;margin:0;overflow-wrap:anywhere;}',
      '.lkw-time{font-size:12.5px;font-weight:700;color:#6002EE;background:#F3EBFF;border-radius:999px;padding:4px 11px;white-space:nowrap;}',
      '.lkw-v{display:flex;gap:11px;align-items:center;min-height:44px;padding:6px 0;text-decoration:none;color:#1A1829;border-top:1px solid #EEEDF6;}',
      '.lkw-v:first-of-type{border-top:0;}',
      '.lkw-av{flex:none;width:36px;height:36px;border-radius:50%;background:#F3EBFF;color:#6002EE;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;}',
      '.lkw-av img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.lkw-vn{font-size:15px;font-weight:700;line-height:1.3;}',
      '.lkw-vs{font-size:13px;color:#6B6880;line-height:1.4;overflow-wrap:anywhere;}',
      '.lkw-v:hover .lkw-vn{color:#6002EE;}',
      '.lkw-v:focus-visible,.lkw-btn:focus-visible{outline:3px solid #C9B3FA;outline-offset:2px;border-radius:8px;}',
      '.lkw-empty{background:#fff;border:1px dashed #C8C6D8;border-radius:16px;padding:32px 22px;text-align:center;}',
      '.lkw-empty h2{font-size:19px;font-weight:700;margin:0 0 8px;}',
      '.lkw-empty p{font-size:15px;line-height:1.6;color:#4A4761;margin:0 0 16px;}',
      '.lkw-btn{display:inline-block;font-size:14.5px;font-weight:700;min-height:44px;line-height:22px;padding:11px 22px;border-radius:999px;background:#6002EE;color:#fff;text-decoration:none;margin:0 4px 8px;}',
      '.lkw-btn.ghost{background:#F3EBFF;color:#6002EE;}',
      '.lkw-fine{font-size:13px;line-height:1.6;color:#6B6880;margin:26px 0 0;}',
      '.lkw-fine a{color:#6002EE;font-weight:600;text-decoration:none;}',
      '@media(max-width:600px){.lkw{padding:36px 0 56px;}.lkw h1{font-size:27px;}.lkw-lede{font-size:16px;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function shell(inner) {
    return '<div class="lkw"><div class="lkw-wrap"><span class="lkw-eyebrow">This week</span>' +
      '<h1>Find your local vendors in person</h1>' +
      '<p class="lkw-lede">Markets, pop-ups and pickups near The Woodlands over the next few days. Every listing comes straight from the vendor.</p>' +
      inner +
      '<p class="lkw-fine">Plans change, so check the vendor\'s page before you head out.<br>Sell locally? <a href="/sign-up">Open your storefront</a> and your plans show up here.</p>' +
      '</div></div>';
  }

  function render(mount, feed) {
    if (!feed.length) {
      mount.innerHTML = shell('<div class="lkw-empty"><h2>No plans posted yet</h2>' +
        '<p>Vendors share their plans as they firm up. Until then, meet everyone on The Market.</p>' +
        '<a class="lkw-btn" href="/the-market">Browse The Market</a><a class="lkw-btn ghost" href="/sign-up">Open your storefront</a></div>');
      return;
    }
    var days = [], byDay = {};
    feed.forEach(function (e) {
      var d = new Date(e.starts_at);
      var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (!byDay[key]) { byDay[key] = { d: d, places: [], byPlace: {} }; days.push(byDay[key]); }
      var day = byDay[key];
      var pk = String(e.place || '').trim().toLowerCase();
      if (!day.byPlace[pk]) { day.byPlace[pk] = { place: e.place, starts: d, ends: e.ends_at ? new Date(e.ends_at) : null, rows: [] }; day.places.push(day.byPlace[pk]); }
      var pl = day.byPlace[pk];
      if (d < pl.starts) pl.starts = d;
      if (e.ends_at && (!pl.ends || new Date(e.ends_at) > pl.ends)) pl.ends = new Date(e.ends_at);
      pl.rows.push(e);
    });
    var html = days.map(function (day) {
      return '<h2 class="lkw-day">' + esc(day.d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })) + '</h2>' +
        day.places.map(function (pl) {
          var time = tm(pl.starts) + (pl.ends ? ' to ' + tm(pl.ends) : '');
          return '<div class="lkw-card"><div class="lkw-head"><h3 class="lkw-place">' + esc(pl.place) + '</h3><span class="lkw-time">' + esc(time) + '</span></div>' +
            pl.rows.map(function (e) {
              var v = e.vendor || {};
              var photo = v.profile_photo || v.card_photo_url || '';
              var av = /^https:\/\//.test(photo) ? '<img src="' + esc(photo) + '" alt="" loading="lazy">' : esc(initials(v.business_name));
              var sub = e.note || v.business_tagline || '';
              return '<a class="lkw-v" href="/' + encodeURIComponent(v.slug || '') + '"><span class="lkw-av">' + av + '</span>' +
                '<span><span class="lkw-vn">' + esc(v.business_name || 'A local vendor') + '</span>' +
                (sub ? '<br><span class="lkw-vs">' + esc(sub) + '</span>' : '') + '</span></a>';
            }).join('') + '</div>';
        }).join('');
    }).join('');
    mount.innerHTML = shell(html);
  }

  function boot() {
    var mount = document.getElementById('lokali-weekend');
    var SB = window.LokaliSupabaseAPI;
    if (!mount || !SB || !SB.posts || !SB.posts.weekendFeed) return;
    css();
    SB.posts.weekendFeed(9).then(function (res) {
      var feed = (res && Array.isArray(res.data)) ? res.data.filter(function (e) { return e && e.vendor && e.vendor.slug && e.starts_at; }) : [];
      render(mount, feed);
    }).catch(function () { render(mount, []); });
  }
  var tries = 0;
  function start() {
    if (!window.LokaliSupabaseReady) { if (++tries < 200) setTimeout(start, 150); return; }
    window.LokaliSupabaseReady.then(function () {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    });
  }
  start();
})();
