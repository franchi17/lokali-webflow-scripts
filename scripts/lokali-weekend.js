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

  // v2 (F 2026-11-24 'this week is great', site consistency mockup): a white calendar page.
  // A seven-day strip (today + 6) where days with posts get a violet dot per place, then one
  // simple list: day and time, a small photo, the vendor and the place, a link to the storefront.
  // When nobody has posted, the strip still shows with a calm line instead of one empty box.
  function css() {
    if (document.getElementById('lkw-css')) return;
    var s = document.createElement('style'); s.id = 'lkw-css';
    s.textContent = [
      '.lkw{font-family:' + F + ';color:#45415A;background:#fff;padding:48px 0 72px;}',
      '.lkw *{box-sizing:border-box;font-family:' + F + ';}',
      '.lkw-wrap{max-width:960px;margin:0 auto;padding:0 24px;}',
      '.lkw-eyebrow{font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#6002EE;}',
      '.lkw h1{font-size:42px;line-height:1.06;font-weight:800;letter-spacing:-.035em;margin:8px 0 10px;color:#45415A;text-wrap:balance;}',
      '.lkw h1 em{font-style:normal;color:#6002EE;}',
      '.lkw-lede{font-size:17px;line-height:1.6;color:#4A4761;margin:0 0 24px;max-width:60ch;}',
      '.lkw-strip{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:0 0 28px;}',
      '.lkw-d{border:1.5px solid #E6DFF5;border-radius:16px;padding:12px 6px;text-align:center;min-height:96px;text-decoration:none;color:#45415A;display:block;}',
      'a.lkw-d:hover{border-color:#6002EE;}',
      '.lkw-d small{display:block;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6E6A85;}',
      '.lkw-d b{display:block;font-size:26px;font-weight:800;line-height:1.2;margin-top:4px;}',
      '.lkw-d em{display:block;font-style:normal;font-size:11px;color:#6E6A85;margin-top:2px;}',
      '.lkw-d i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#6002EE;margin:6px 2px 0;}',
      '.lkw-d.on{border-color:#6002EE;background:#F6F2FF;}',
      '.lkw-d.today small{color:#6002EE;}',
      '.lkw-day{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#6002EE;margin:26px 0 0;padding-bottom:8px;border-bottom:1px solid #EEE8F8;scroll-margin-top:110px;}',
      '.lkw-row{display:grid;grid-template-columns:120px 56px minmax(0,1fr) auto;gap:16px;align-items:center;padding:14px 0;border-bottom:1px solid #EEE8F8;text-decoration:none;color:#45415A;}',
      '.lkw-when{font-size:13px;color:#6E6A85;line-height:1.35;}.lkw-when b{display:block;color:#45415A;font-size:14.5px;}',
      '.lkw-av{width:56px;height:56px;border-radius:12px;background:#F3EBFF;color:#6002EE;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;overflow:hidden;}',
      '.lkw-av img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.lkw-vn{display:block;font-size:16px;font-weight:800;line-height:1.3;}',
      '.lkw-vs{display:block;font-size:13.5px;color:#6E6A85;line-height:1.4;overflow-wrap:anywhere;}',
      '.lkw-go{font-size:13.5px;font-weight:700;color:#6002EE;text-decoration:underline;text-underline-offset:3px;white-space:nowrap;}',
      'a.lkw-row:hover .lkw-vn{color:#6002EE;}',
      '.lkw-row:focus-visible,.lkw-btn:focus-visible,.lkw-d:focus-visible{outline:3px solid #C9B3FA;outline-offset:2px;border-radius:12px;}',
      '.lkw-empty{background:#FAF8FE;border-radius:18px;padding:22px 24px;}',
      '.lkw-empty h2{font-size:18px;font-weight:800;margin:0 0 6px;}',
      '.lkw-empty p{font-size:15px;line-height:1.6;color:#4A4761;margin:0 0 14px;}',
      '.lkw-btn{display:inline-block;font-size:14.5px;font-weight:700;min-height:44px;line-height:22px;padding:11px 22px;border-radius:999px;background:#6002EE;color:#fff;text-decoration:none;margin:0 6px 6px 0;}',
      '.lkw-btn.ghost{background:#fff;color:#6002EE;box-shadow:inset 0 0 0 1.5px #6002EE;}',
      '.lkw-fine{font-size:13px;line-height:1.6;color:#6E6A85;margin:26px 0 0;}',
      '.lkw-fine a{color:#6002EE;font-weight:600;text-decoration:none;}',
      '@media(max-width:700px){.lkw{padding:34px 0 56px;}.lkw-wrap{padding:0 16px;}.lkw h1{font-size:30px;}.lkw-lede{font-size:16px;}',
      '.lkw-strip{gap:4px;}.lkw-d{border-radius:12px;padding:8px 2px;min-height:76px;}.lkw-d small{font-size:9.5px;letter-spacing:.08em;}.lkw-d b{font-size:19px;}.lkw-d em{display:none;}.lkw-d i{width:6px;height:6px;margin:4px 1px 0;}',
      '.lkw-row{grid-template-columns:48px minmax(0,1fr);gap:4px 12px;}.lkw-row .lkw-av{grid-row:span 2;width:48px;height:48px;}.lkw-when{grid-column:2;order:2;}.lkw-go{display:none;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

  function strip(byDay) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var out = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(t.getTime()); d.setDate(t.getDate() + i);
      var k = dayKey(d), day = byDay[k], n = day ? day.places.length : 0;
      var dots = ''; for (var j = 0; j < Math.min(n, 3); j++) dots += '<i></i>';
      var label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + (n ? ', ' + n + (n === 1 ? ' place' : ' places') : ', nothing posted yet');
      var inner = '<small>' + (i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })) + '</small><b>' + d.getDate() + '</b>' + dots;
      out += n ? '<a class="lkw-d on' + (i === 0 ? ' today' : '') + '" href="#lkw-' + k + '" aria-label="' + esc(label) + '">' + inner + '</a>'
               : '<div class="lkw-d' + (i === 0 ? ' today' : '') + '" aria-label="' + esc(label) + '">' + inner + '</div>';
    }
    return '<div class="lkw-strip" role="list" aria-label="The next seven days">' + out + '</div>';
  }

  function shell(inner, byDay) {
    return '<div class="lkw"><div class="lkw-wrap"><span class="lkw-eyebrow">This week</span>' +
      '<h1>Where to find your neighbors <em>this week.</em></h1>' +
      '<p class="lkw-lede">Markets, pop-ups and pickups near you, posted by the vendors themselves.</p>' +
      strip(byDay || {}) + inner +
      '<p class="lkw-fine">Plans change, so check the vendor\'s page before you head out.<br>Sell locally? <a href="/sign-up">Open your storefront</a> and your plans show up here.</p>' +
      '</div></div>';
  }

  function render(mount, feed) {
    if (!feed.length) {
      mount.innerHTML = shell('<div class="lkw-empty"><h2>Nothing posted for these days yet</h2>' +
        '<p>Vendors post here as their plans firm up. Meanwhile, meet everyone on The Market.</p>' +
        '<a class="lkw-btn" href="/the-market">Browse The Market</a><a class="lkw-btn ghost" href="/sign-up">Open your storefront</a></div>', {});
      return;
    }
    var days = [], byDay = {};
    feed.forEach(function (e) {
      var d = new Date(e.starts_at);
      var key = dayKey(d);
      if (!byDay[key]) { byDay[key] = { d: d, key: key, places: [], byPlace: {} }; days.push(byDay[key]); }
      var day = byDay[key];
      var pk = String(e.place || '').trim().toLowerCase();
      if (!day.byPlace[pk]) { day.byPlace[pk] = { place: e.place, starts: d, ends: e.ends_at ? new Date(e.ends_at) : null, rows: [] }; day.places.push(day.byPlace[pk]); }
      var pl = day.byPlace[pk];
      if (d < pl.starts) pl.starts = d;
      if (e.ends_at && (!pl.ends || new Date(e.ends_at) > pl.ends)) pl.ends = new Date(e.ends_at);
      pl.rows.push(e);
    });
    var html = days.map(function (day) {
      return '<h2 class="lkw-day" id="lkw-' + day.key + '">' + esc(day.d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })) + '</h2>' +
        day.places.map(function (pl) {
          var time = tm(pl.starts) + (pl.ends ? ' to ' + tm(pl.ends) : '');
          return pl.rows.map(function (e) {
            var v = e.vendor || {};
            var photo = v.profile_photo || v.card_photo_url || '';
            var av = /^https:\/\//.test(photo) ? '<img src="' + esc(photo) + '" alt="" loading="lazy">' : esc(initials(v.business_name));
            var sub = [pl.place, e.note].filter(Boolean).join(' · ');
            return '<a class="lkw-row" href="/' + encodeURIComponent(v.slug || '') + '">' +
              '<span class="lkw-when"><b>' + esc(day.d.toLocaleDateString('en-US', { weekday: 'short' })) + '</b>' + esc(time) + '</span>' +
              '<span class="lkw-av">' + av + '</span>' +
              '<span><span class="lkw-vn">' + esc(v.business_name || 'A local vendor') + '</span>' + (sub ? '<span class="lkw-vs">' + esc(sub) + '</span>' : '') + '</span>' +
              '<span class="lkw-go">See storefront</span></a>';
          }).join('');
        }).join('');
    }).join('');
    mount.innerHTML = shell(html, byDay);
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
