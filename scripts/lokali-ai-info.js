/*!
 * lokali-ai-info.js — the "AI info" tag on vendor photos (F 2026-11-23, Instagram-style).
 *
 * Rule (policy page "AI Photo Policy"): photos of work must be real; AI must never change the
 * product or work itself. Removing a background / brightening / cropping = no tag. AI made the
 * picture, or ADDED something new to it (a studio scene behind a real product, an AI logo) = tag.
 *
 * Storage: ai_photo_labels (patch_ai_photo_labels.sql), one row per tagged vendor-media object
 * path. Keyed by path, so this script needs no knowledge of which page or slot shows a picture:
 * it scans <img> elements, pulls the vendor-media path out of the src (full object URL or the
 * LokaliImg.thumb() render URL), and asks the table about those paths.
 *
 *   PUBLIC pages  — a quiet "AI info" chip on each tagged picture; tap opens a one-line
 *                   explanation (the chip sits inside cards that are links, so the tap is
 *                   swallowed and never navigates).
 *   /vendor-dashboard/* — every picture in the signed-in vendor's own folder gets a small
 *                   "AI info" switch; tapping it adds/removes the label. Other vendors' pictures
 *                   are never touched (and the table would refuse them anyway).
 *
 * Depends on lokali-supabase-client.js (window.LokaliSupabaseReady / LokaliSupabaseAPI).
 * Fails silently: if the table is missing (patch not applied) or the client never loads, the
 * page simply shows no chips.
 */
(function () {
  'use strict';
  if (window.__lokaliAiInfo) return;
  window.__lokaliAiInfo = true;

  var RE = /\/storage\/v1\/(?:object|render\/image)\/public\/vendor-media\/([0-9]+\/[a-z]+\/[A-Za-z0-9._-]+)/;
  var DASH = /^\/vendor-dashboard(\/|$)/.test(location.pathname);
  var MIN_PUBLIC = 110;   // px: below this a chip would cover the picture (tiny avatars, strips)
  var MIN_DASH = 56;
  var FONT = '"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif';
  var EXPLAIN = 'AI was used on this picture, for example to create the background. Photos on Lokali must show the real product or work.';

  var known = {};     // path -> true (tagged) | false (not tagged)
  var pending = {};   // path -> true while a lookup is in flight
  var myVendorId = null;

  function pathOf(img) {
    var m = RE.exec(img.currentSrc || img.getAttribute('src') || '');
    return m ? m[1] : null;
  }

  function client() {
    return (window.LokaliSupabaseReady || Promise.reject(new Error('no client')));
  }

  // ---------------------------------------------------------------- styles
  function injectCss() {
    if (document.getElementById('lk-ai-css')) return;
    var s = document.createElement('style');
    s.id = 'lk-ai-css';
    s.textContent =
      '.lk-ai-host{position:relative}' +
      '.lk-ai-chip{position:absolute;left:8px;bottom:8px;z-index:3;display:inline-flex;align-items:center;gap:4px;' +
        'font:600 12px/1 ' + FONT + ';color:#6E6A85;background:#FFFFFF;border:1px solid #E7E1F3;border-radius:999px;' +
        'padding:5px 10px;cursor:pointer;box-shadow:0 1px 3px rgba(69,65,90,.12)}' +
      '.lk-ai-chip:hover{color:#6002EE}' +
      '.lk-ai-chip:focus-visible{outline:3px solid #E5D4FD;outline-offset:2px}' +
      '.lk-ai-pop{position:absolute;left:8px;right:8px;bottom:40px;z-index:4;background:#FFFFFF;border:1px solid #E7E1F3;' +
        'border-radius:12px;padding:10px 12px;font:400 13px/1.5 ' + FONT + ';color:#4A4761;box-shadow:0 4px 14px rgba(69,65,90,.16);text-align:left}' +
      '.lk-ai-pop b{display:block;color:#45415A;font-weight:700;margin-bottom:2px}' +
      '.lk-ai-sw{position:absolute;left:6px;top:6px;z-index:5;display:inline-flex;align-items:center;gap:6px;' +
        'font:600 11.5px/1 ' + FONT + ';color:#6E6A85;background:#FFFFFF;border:1px solid #E7E1F3;border-radius:999px;' +
        'padding:4px 8px 4px 4px;cursor:pointer;box-shadow:0 1px 3px rgba(69,65,90,.12)}' +
      '.lk-ai-sw i{width:22px;height:13px;border-radius:999px;background:#E7E1F3;position:relative;transition:background .15s}' +
      '.lk-ai-sw i:after{content:"";position:absolute;top:2px;left:2px;width:9px;height:9px;border-radius:50%;background:#FFFFFF;transition:left .15s}' +
      '.lk-ai-sw[aria-checked="true"]{color:#6002EE;border-color:#E5D4FD}' +
      '.lk-ai-sw[aria-checked="true"] i{background:#6002EE}' +
      '.lk-ai-sw[aria-checked="true"] i:after{left:11px}' +
      '.lk-ai-sw[aria-busy="true"]{opacity:.6;cursor:progress}' +
      '.lk-ai-sw:focus-visible{outline:3px solid #E5D4FD;outline-offset:2px}' +
      '@media (prefers-reduced-motion:reduce){.lk-ai-sw i,.lk-ai-sw i:after{transition:none}}';
    document.head.appendChild(s);
  }

  function host(img) {
    var p = img.parentElement;
    if (!p) return null;
    if (getComputedStyle(p).position === 'static') p.classList.add('lk-ai-host');
    return p;
  }

  function swallow(e) { e.preventDefault(); e.stopPropagation(); }

  // ---------------------------------------------------------------- public chip
  function addChip(img) {
    var p = host(img);
    if (!p || p.querySelector(':scope > .lk-ai-chip')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'lk-ai-chip';
    b.textContent = 'AI info';
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function (e) {
      swallow(e);
      var open = p.querySelector(':scope > .lk-ai-pop');
      if (open) { open.remove(); b.setAttribute('aria-expanded', 'false'); return; }
      var pop = document.createElement('div');
      pop.className = 'lk-ai-pop';
      pop.setAttribute('role', 'note');
      var t = document.createElement('b'); t.textContent = 'AI info';
      pop.appendChild(t);
      pop.appendChild(document.createTextNode(EXPLAIN));
      pop.addEventListener('click', swallow);
      p.appendChild(pop);
      b.setAttribute('aria-expanded', 'true');
    });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) {
      b.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true });
    });
    p.appendChild(b);
  }

  // ---------------------------------------------------------------- dashboard switch
  function setSwitch(sw, on) {
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    sw.title = on
      ? 'Customers see "AI info" on this picture. Tap to remove.'
      : 'Tap if AI made this picture or added something new to it, like a background scene. Not needed for removing a background, brightening or cropping.';
  }

  function addSwitch(img, path) {
    var p = host(img);
    if (!p) return;
    var sw = p.querySelector(':scope > .lk-ai-sw');
    if (sw) { setSwitch(sw, !!known[path]); sw.dataset.path = path; return; }
    sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'lk-ai-sw';
    sw.setAttribute('role', 'switch');
    sw.dataset.path = path;
    sw.innerHTML = '<i aria-hidden="true"></i><span>AI info</span>';
    setSwitch(sw, !!known[path]);
    sw.addEventListener('click', function (e) {
      swallow(e);
      if (sw.getAttribute('aria-busy') === 'true') return;
      var pth = sw.dataset.path, on = !known[pth];
      sw.setAttribute('aria-busy', 'true');
      client().then(function (c) {
        return on
          ? c.from('ai_photo_labels').insert({ path: pth, vendors_id: myVendorId })
          : c.from('ai_photo_labels').delete().eq('path', pth);
      }).then(function (res) {
        if (res && res.error && !(on && res.error.code === '23505')) throw res.error;
        known[pth] = on;
        setSwitch(sw, on);
      }).catch(function (err) {
        try { console.error('[lokali-ai-info] could not save', err); } catch (x) {}
        sw.title = 'Could not save just now. Please try again.';
      }).then(function () { sw.removeAttribute('aria-busy'); });
    });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) {
      sw.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true });
    });
    p.appendChild(sw);
  }

  // ---------------------------------------------------------------- scan
  function decorate() {
    var imgs = document.images;
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i], path = pathOf(img);
      if (!path || known[path] === undefined) continue;
      var w = img.getBoundingClientRect().width;
      if (DASH) {
        if (myVendorId != null && path.split('/')[0] === String(myVendorId) && w >= MIN_DASH) addSwitch(img, path);
      } else if (known[path] && w >= MIN_PUBLIC) {
        addChip(img);
      }
    }
  }

  function lookup() {
    var want = [], seen = {};
    var imgs = document.images;
    for (var i = 0; i < imgs.length; i++) {
      var path = pathOf(imgs[i]);
      if (!path || seen[path] || known[path] !== undefined || pending[path]) continue;
      if (DASH && (myVendorId == null || path.split('/')[0] !== String(myVendorId))) continue;
      seen[path] = true; want.push(path);
    }
    if (!want.length) { decorate(); return; }
    want.forEach(function (p) { pending[p] = true; });
    var chunks = [];
    for (var j = 0; j < want.length; j += 80) chunks.push(want.slice(j, j + 80));
    client().then(function (c) {
      return Promise.all(chunks.map(function (ch) {
        return c.from('ai_photo_labels').select('path').in('path', ch).then(function (res) {
          if (res.error) throw res.error;
          ch.forEach(function (p) { known[p] = false; });
          (res.data || []).forEach(function (r) { known[r.path] = true; });
        });
      }));
    }).catch(function () {
      // Table missing or offline: show nothing, and do not retry these paths on every mutation.
      want.forEach(function (p) { if (known[p] === undefined) known[p] = false; });
    }).then(function () {
      want.forEach(function (p) { delete pending[p]; });
      decorate();
    });
  }

  var timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; lookup(); }, 250);
  }

  function start() {
    injectCss();
    schedule();
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes') { schedule(); return; }
        for (var k = 0; k < m.addedNodes.length; k++) {
          var n = m.addedNodes[k];
          if (n.nodeType === 1 && !(n.classList && (n.classList.contains('lk-ai-chip') || n.classList.contains('lk-ai-sw') || n.classList.contains('lk-ai-pop')))) { schedule(); return; }
        }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    window.addEventListener('resize', schedule);
    // Close an open explanation when tapping elsewhere.
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.lk-ai-chip,.lk-ai-pop')) return;
      var pops = document.querySelectorAll('.lk-ai-pop');
      for (var i = 0; i < pops.length; i++) {
        var chip = pops[i].parentElement && pops[i].parentElement.querySelector(':scope > .lk-ai-chip');
        if (chip) chip.setAttribute('aria-expanded', 'false');
        pops[i].remove();
      }
    });
  }

  function boot() {
    if (!DASH) { start(); return; }
    var api = window.LokaliSupabaseAPI;
    if (!api || !api.vendors || !api.vendors.me) return;
    api.vendors.me().then(function (res) {
      var v = res && res.data;
      if (Array.isArray(v)) v = v[0];
      if (!v || v.id == null) return;
      myVendorId = v.id;
      start();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
