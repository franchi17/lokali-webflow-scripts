/**
 * lokali-founding-page.js - the /founding-vendors page, v3 (F 2026-11-23 "Yes, all three").
 *
 * The page body is one Designer HtmlEmbed (.lkfd, #162c, 2026-09-02 / v2 2026-10-14) whose
 * static text stays in the raw HTML for crawlers. This script restyles it into the logo PINK
 * family (brand guide 2026-11-22: ground #FDE6F2, big numbers #EE0290, buttons + small words
 * #B0006A; no orange, no violet inside the page) and gives the page its own top:
 *
 *   - the SEATS are the centerpiece: a huge live "N of 50 founding seats still open" on the
 *     left, all 50 seats on the right. Each taken seat shows that founding vendor's WORK (the
 *     adapter's cover photo: gallery -> service -> product, never a logo and never a face, so
 *     no one has to agree to be shown). Taken seats with no public storefront stay plain pink.
 *   - the perks become a numbered list, the steps three small cards, and the ending says
 *     "Seat N could have your name on it" with a gentle free-plan line.
 *   - dropped, per the sales guides (no pressure): "Customers notice" and "on the terms only
 *     the first 50 get".
 *
 * The live count is the one lokali-founding-banner.js already writes into the embed's .f-n
 * (beside "Founding spots left"); this script watches that number instead of calling the RPC
 * a second time. Cap = 50 (global, founding-member business rules).
 * HIDE_VENDORS: storefronts Francesca asked us not to feature here.
 * Copy rules: no emoji, no em dashes, Plus Jakarta Sans set explicitly, no ink surfaces.
 */
(function () {
  'use strict';
  var CAP = 50;
  var HIDE_VENDORS = { '250': true };
  var FONT = '"Plus Jakarta Sans",sans-serif';

  function $(s, r) { return (r || document).querySelector(s); }
  function ce(t, c) { var e = document.createElement(t); if (c) e.className = c; return e; }
  function safeUrl(p) {
    if (!p || typeof p !== 'string') return '';
    p = p.trim();
    if (!p || /[\s"'<>`\\]/.test(p) || !/^https:\/\//.test(p)) return '';
    return p;
  }

  var CSS = [
    '.lkfd{color:#45415A !important;}',
    '.lkfd h1,.lkfd h2,.lkfd h3{color:#45415A !important;}',
    '.lkfd-eb{color:#B0006A !important;}',
    '.lkfd-btn{background:#B0006A !important;color:#fff !important;}',
    '.lkfd-btn:hover{background:#8E0056 !important;color:#fff !important;}',
    '.lkfd-ul{color:#B0006A !important;}',
    '.lkfd-fine a{color:#B0006A !important;}',
    // the top: count + words left, the 50 seats right
    '.lkfd-hero.lkfd3{background:#FDE6F2 !important;text-align:left !important;padding:56px 0 !important;}',
    '.lkfd3-grid{display:grid;grid-template-columns:minmax(0,.68fr) minmax(0,1.32fr);gap:44px;align-items:center;}',
    '.lkfd3-n{display:block;font:800 150px/.82 ' + FONT + ';letter-spacing:-.06em;color:#EE0290;margin-top:10px;font-variant-numeric:tabular-nums;}',
    '.lkfd3-of{display:block;font:800 18px/1.3 ' + FONT + ';color:#45415A;margin-top:12px;}',
    '.lkfd.lkfd3-on h1.lkfd3-h1{font-size:28px !important;line-height:1.15;max-width:none;margin:24px 0 0 !important;text-align:left;}',
    '.lkfd3 .lkfd-lede{margin:10px 0 0 !important;font-size:16px !important;max-width:34em;text-align:left;}',
    '.lkfd3 .lkfd-acts{justify-content:flex-start !important;margin-top:22px !important;}',
    '.lkfd3-wall{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:7px;}',
    '.lkfd3-wall i{display:block;aspect-ratio:1/1;border-radius:12px;background:#EE0290 center/cover no-repeat;}',
    '.lkfd3-wall i.o{background:#fff;box-shadow:inset 0 0 0 2px #F5A3CF;}',
    '.lkfd3-key{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:14px;font:600 12.5px/1.3 ' + FONT + ';color:#6E6A85;}',
    '.lkfd3-key i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;}',
    // perks: a numbered list, no boxes
    '.lkfd3-on .lkfd-sec:not(.lkfd-sec-lav) .lkfd-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:30px 48px;counter-reset:lkp;}',
    '.lkfd3-on .lkfd-card{background:none !important;border:0 !important;box-shadow:none !important;padding:0 0 0 64px !important;position:relative;}',
    '.lkfd3-on .lkfd-card::before{counter-increment:lkp;content:counter(lkp);position:absolute;left:0;top:-6px;font:800 46px/1 ' + FONT + ';color:#EE0290;letter-spacing:-.04em;}',
    '.lkfd3-on .lkfd-ico{display:none !important;}',
    '.lkfd3-on .lkfd-card h3{font-size:19px !important;}',
    // steps: three small pink cards
    '.lkfd3-on .lkfd-sec-lav{background:#FDE6F2 !important;}',
    '.lkfd3-on .lkfd-steps{gap:16px !important;}',
    '.lkfd3-on .lkfd-steps li{background:#fff;border:0 !important;border-radius:18px;padding:22px !important;}',
    '.lkfd3-on .lkfd-num{font-size:12px !important;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#B0006A !important;}',
    '.lkfd3-on .lkfd-num::before{content:"Step ";}',
    // ending: white, centred, a deep pink button and the free-plan line
    '.lkfd3-on .lkfd-ctab{background:#fff !important;color:#45415A !important;padding:72px 0 !important;}',
    '.lkfd3-on .lkfd-ctab .lkfd-eb{display:none !important;}',
    '.lkfd3-on .lkfd-ctab h2{color:#45415A !important;}',
    '.lkfd3-on .lkfd-ctab p{color:#4A4761 !important;}',
    '.lkfd3-on .lkfd-ctab .lkfd-btn{background:#B0006A !important;color:#fff !important;}',
    '.lkfd3-on .lkfd-ctab .lkfd-btn:hover{background:#8E0056 !important;}',
    '.lkfd3-free{margin-top:18px !important;font-size:14.5px !important;color:#6E6A85 !important;}',
    '.lkfd3-free a{color:#B0006A;font-weight:700;text-decoration:underline;text-underline-offset:3px;}',
    '.lkfd a:focus-visible{outline:2px solid #B0006A;outline-offset:3px;}',
    '@media (max-width:991px){.lkfd3-grid{grid-template-columns:minmax(0,1fr);gap:30px;}.lkfd3-n{font-size:120px;}}',
    '@media (max-width:600px){.lkfd3-on .lkfd-sec:not(.lkfd-sec-lav) .lkfd-cards{grid-template-columns:minmax(0,1fr);}.lkfd3-wall{gap:5px;}.lkfd3-wall i{border-radius:8px;}.lkfd3-n{font-size:100px;}.lkfd.lkfd3-on h1.lkfd3-h1{font-size:25px !important;}}'
  ].join('');

  var root, numEl, ofEl, wall, seatPhotos = [], remaining = null;

  function render() {
    if (!wall) return;
    var open = remaining == null ? null : Math.max(0, Math.min(CAP, remaining));
    var taken = open == null ? null : CAP - open;
    if (open != null) {
      numEl.textContent = String(open);
      ofEl.textContent = 'of ' + CAP + ' founding seats still open';
      var h2 = $('.lkfd-ctab h2', root);
      if (h2) h2.textContent = open > 0 ? 'Seat ' + (taken + 1) + ' could have your name on it.' : 'All fifty founding seats are taken.';
    }
    wall.innerHTML = '';
    var t = taken == null ? 0 : taken;
    for (var i = 0; i < CAP; i++) {
      var s = ce('i', i < t ? 't' : 'o');
      if (i < t && seatPhotos[i]) {
        s.style.backgroundImage = 'url("' + seatPhotos[i].url + '")';
        if (typeof seatPhotos[i].fx === 'number' && typeof seatPhotos[i].fy === 'number') s.style.backgroundPosition = seatPhotos[i].fx + '% ' + seatPhotos[i].fy + '%';
      }
      wall.appendChild(s);
    }
    wall.setAttribute('aria-label', taken == null ? 'The 50 founding seats' : taken + ' of 50 founding seats taken');
  }

  function readCount(src) {
    var n = parseInt((src && src.textContent || '').replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n)) { remaining = n; render(); }
  }

  function loadPhotos(tries) {
    var api = window.LokaliAPI && window.LokaliAPI.vendors;
    if (!api || typeof api.list !== 'function' || typeof api.covers !== 'function') {
      if ((tries || 0) < 40) setTimeout(function () { loadPhotos((tries || 0) + 1); }, 250);
      return;
    }
    api.list({ page: 1, per_page: 100 }).then(function (out) {
      var d = out && out.data, rows = Array.isArray(d) ? d : (d && (d.items || d.vendors || d.data)) || [];
      var ids = rows.filter(function (v) { return v && v.is_founding_member === true && v.is_active !== false && v.id != null && !HIDE_VENDORS[String(v.id)]; })
        .map(function (v) { return v.id; });
      if (!ids.length) return;
      return api.covers(ids).then(function (res) {
        var map = res && res.data && res.data.covers;
        if (!map) return;
        seatPhotos = ids.map(function (id) { var c = map[id] || map[String(id)]; var u = c && safeUrl(c.url); return u ? { url: u, fx: c.fx, fy: c.fy } : null; })
          .filter(Boolean);
        render();
      });
    }).catch(function () { /* seats stay plain pink */ });
  }

  function build() {
    root = $('.lkfd');
    var hero = root && $('.lkfd-hero', root);
    if (!root || !hero || root.classList.contains('lkfd3-on')) return;
    var st = ce('style'); st.id = 'lkfd3-css'; st.textContent = CSS; document.head.appendChild(st);
    root.classList.add('lkfd3-on');

    // keep the static counter (lokali-founding-banner.js writes the live number into it), hidden
    var srcN = $('.lkfd-counters .f-n', hero);
    var counters = $('.lkfd-counters', hero);
    if (counters) counters.style.display = 'none';

    var wrap = $('.lkfd-wrap', hero);
    var lede = $('.lkfd-lede', hero), acts = $('.lkfd-acts', hero), h1 = $('h1', hero);
    hero.classList.add('lkfd3');
    var grid = ce('div', 'lkfd3-grid'), left = ce('div'), right = ce('div');
    var eb = ce('div', 'lkfd-eb'); eb.textContent = 'Founding vendors'; left.appendChild(eb);
    numEl = ce('b', 'lkfd3-n'); numEl.setAttribute('aria-hidden', 'true'); numEl.textContent = srcN ? srcN.textContent : '';
    ofEl = ce('span', 'lkfd3-of'); ofEl.textContent = 'of ' + CAP + ' founding seats still open';
    left.appendChild(numEl); left.appendChild(ofEl);
    if (h1) { h1.textContent = 'Be one of Lokali’s first fifty.'; h1.classList.add('lkfd3-h1'); left.appendChild(h1); }
    if (lede) { lede.textContent = 'Pro or Featured, nothing until billing starts, today’s rate for as long as you stay, and a founding badge. One group of fifty, across every Lokali community.'; left.appendChild(lede); }
    if (acts) {
      var b = $('.lkfd-btn', acts); if (b) { b.textContent = 'Claim my spot'; b.classList.remove('lkfd-btn-or'); }
      left.appendChild(acts);
    }
    wall = ce('div', 'lkfd3-wall'); wall.setAttribute('role', 'img');
    var key = ce('div', 'lkfd3-key');
    key.innerHTML = '<span><i style="background:#EE0290"></i>Taken, showing that vendor’s work</span><span><i style="background:#fff;box-shadow:inset 0 0 0 2px #F5A3CF"></i>Open, waiting for you</span>';
    right.appendChild(wall); right.appendChild(key);
    grid.appendChild(left); grid.appendChild(right);
    if (wrap) { wrap.innerHTML = ''; wrap.appendChild(grid); if (counters) wrap.appendChild(counters); }

    // perks: drop the pushy line
    var cards = root.querySelectorAll('.lkfd-card p');
    for (var i = 0; i < cards.length; i++) {
      if (/Customers notice/.test(cards[i].textContent)) cards[i].textContent = 'A mark on your storefront and your Market card that says you were here first. It stays for as long as you stay.';
    }
    var hs = root.querySelectorAll('.lkfd-sechead h2');
    for (var k = 0; k < hs.length; k++) if (/^What a founding vendor gets$/.test(hs[k].textContent.trim())) hs[k].textContent = 'What a founding vendor gets.';

    // ending
    var ctab = $('.lkfd-ctab .lkfd-wrap', root);
    if (ctab) {
      var p = $('p', ctab); if (p) p.textContent = 'Your neighbors are already looking for what you do. Be the storefront they find first.';
      var cb = $('.lkfd-btn', ctab); if (cb) cb.textContent = 'Claim my spot';
      var free = ce('p', 'lkfd3-free'); free.innerHTML = 'Not ready for Pro? <a href="/sign-up">Start on the free plan</a>. It’s there either way.';
      ctab.appendChild(free);
    }

    readCount(srcN);
    if (srcN && window.MutationObserver) new MutationObserver(function () { readCount(srcN); }).observe(srcN, { childList: true, characterData: true, subtree: true });
    loadPhotos(0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
