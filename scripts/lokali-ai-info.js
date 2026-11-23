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
  var RULE_URL = '/for-customers#ai-photos';
  var PATH = location.pathname.replace(/\/+$/, '') || '/';

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
      '.lk-ai-links{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px}' +
      '.lk-ai-links a{font:700 12.5px/1.4 ' + FONT + ';color:#6002EE;text-decoration:none;cursor:pointer}' +
      '.lk-ai-links a:hover{text-decoration:underline}' +
      '#ai-photos.lk-ai-sec{max-width:1040px;margin:0 auto;padding:56px 20px;font-family:' + FONT + ';color:#4A4761;box-sizing:border-box}' +
      '#ai-photos .lk-ai-eye{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6002EE;margin:0 0 8px}' +
      '#ai-photos h2{font:800 clamp(24px,4vw,32px)/1.2 ' + FONT + ';color:#45415A;margin:0 0 20px;letter-spacing:-.01em}' +
      '#ai-photos .lk-ai-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}' +
      '#ai-photos .lk-ai-card{background:#F3EBFF;border-radius:16px;padding:20px;box-sizing:border-box}' +
      '#ai-photos .lk-ai-card h3{font:700 16px/1.3 ' + FONT + ';color:#45415A;margin:0 0 6px}' +
      '#ai-photos .lk-ai-card p{font:400 15px/1.6 ' + FONT + ';color:#4A4761;margin:0}' +
      '.lk-ai-tipline{display:block;margin-top:2px;color:#6002EE;font-weight:600}' +
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
      var links = document.createElement('div');
      links.className = 'lk-ai-links';
      var rule = document.createElement('a');
      rule.href = RULE_URL; rule.textContent = 'Our photo rule';
      rule.addEventListener('click', function (e) { e.stopPropagation(); }); // real navigation, but never the card's
      links.appendChild(rule);
      var rep = document.createElement('a');
      rep.href = '#'; rep.textContent = 'Something look off? Report it';
      rep.addEventListener('click', function (e) { swallow(e); openReport(); });
      links.appendChild(rep);
      pop.appendChild(links);
      pop.addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('.lk-ai-links'))) swallow(e); });
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

  // ---------------------------------------------------------------- report path
  // "Something look off? Report it": open the storefront's own "Report this vendor" box
  // (lokali-vendor-listing.js; signed-in only) with "Misleading listing or photos" chosen.
  // Signed out, that box is not rendered, so send them to log in instead.
  function openReport() {
    var link = document.querySelector('.vl-vreport-link');
    if (!link) { location.href = '/login'; return; }
    var pops = document.querySelectorAll('.lk-ai-pop');
    for (var i = 0; i < pops.length; i++) pops[i].remove();
    link.scrollIntoView({ behavior: 'smooth', block: 'center' });
    link.click();
    setTimeout(function () {
      var sel = document.querySelector('.vl-vreport-box select');
      if (sel) { sel.value = 'misleading'; try { sel.focus(); } catch (e) {} }
    }, 60);
  }

  // ---------------------------------------------------------------- wording on other pages
  // These pages are built in the Webflow Designer (HTML embeds), which the data API cannot
  // edit, so the new wording is added here. Each insert is marked and runs once; the embed
  // sources in this repo carry the same markup, so a re-paste does not double it.
  var GOOD_CARD =
    '<div class="lg-visual" style="background:linear-gradient(160deg,#F3EBFF,#ffffff);">' +
      '<svg width="58" height="72" viewBox="0 0 58 72" fill="none"><rect x="9" y="8" width="40" height="56" rx="8" fill="#6002EE" opacity=".5"/></svg>' +
      '<span style="position:absolute;left:10px;bottom:10px;font:600 11px/1 Plus Jakarta Sans,sans-serif;color:#6E6A85;background:#fff;border:1px solid #E7E1F3;border-radius:999px;padding:4px 9px;">AI info</span>' +
    '</div><div class="lg-card-body"><div class="lg-tag lg-good">Fine, with the label</div>' +
    '<div class="lg-caption">A real product, AI background</div>' +
    '<div class="lg-note">Your real product, untouched, with a studio-style scene added behind it. Turn on "AI info" so neighbors know the setting was made with AI.</div></div>';
  var BAD_CARD =
    '<div class="lg-visual" style="background:#FFF4F9;">' +
      '<svg width="70" height="70" viewBox="0 0 70 70" fill="none"><rect x="13" y="13" width="44" height="44" rx="8" fill="#B0006A" opacity=".18"/><path d="M24 46l22-22M24 24l22 22" stroke="#B0006A" stroke-width="3.5" stroke-linecap="round" opacity=".6"/></svg>' +
    '</div><div class="lg-card-body"><div class="lg-tag lg-bad">Skip this</div>' +
    '<div class="lg-caption">AI-made or AI-changed work</div>' +
    '<div class="lg-note">A cake you never baked, a brighter color than the real thing, a "before and after" that didn\'t happen. Neighbors should get exactly what they saw.</div></div>';

  function guideCards() {
    if (!/^\/vendor-resources\/(service|product)-photo-guide$/.test(PATH)) return;
    if (document.querySelector('[data-lk-ai-card]')) return;
    var bads = document.querySelectorAll('.lg-card .lg-tag.lg-bad');
    if (!bads.length) return;
    var firstBad = bads[0].closest('.lg-card'), lastBad = bads[bads.length - 1].closest('.lg-card');
    var good = document.createElement('div');
    good.className = 'lg-card'; good.setAttribute('data-lk-ai-card', 'good'); good.innerHTML = GOOD_CARD;
    var bad = document.createElement('div');
    bad.className = 'lg-card'; bad.setAttribute('data-lk-ai-card', 'bad'); bad.innerHTML = BAD_CARD;
    firstBad.parentNode.insertBefore(good, firstBad);
    lastBad.parentNode.insertBefore(bad, lastBad.nextSibling);
  }

  function customerSection() {
    if (PATH !== '/for-customers' || document.getElementById('ai-photos')) return;
    var host = null, cands = document.querySelectorAll('[class*="lkft"]');
    for (var i = 0; i < cands.length; i++) {
      var par = cands[i].parentElement;
      if (!(par && par.closest && par.closest('[class*="lkft"]'))) { host = cands[i]; }
    }
    var sec = document.createElement('section');
    sec.id = 'ai-photos'; sec.className = 'lk-ai-sec';
    sec.innerHTML =
      '<p class="lk-ai-eye">Photos you can trust</p><h2>Real photos, clearly labeled</h2>' +
      '<div class="lk-ai-grid">' +
        '<div class="lk-ai-card"><h3>Real photos</h3><p>Every photo of a product or service on Lokali is a real photo of what you will get.</p></div>' +
        '<div class="lk-ai-card"><h3>What "AI info" means</h3><p>The vendor used AI for part of the picture, like the background or a logo. The product itself is real.</p></div>' +
        '<div class="lk-ai-card"><h3>Something look off?</h3><p>Use "Report this vendor" on their page. Francesca reads every report.</p></div>' +
      '</div>';
    if (host) host.appendChild(sec);
    else {
      var foot = document.querySelector('footer');
      if (foot) foot.parentNode.insertBefore(sec, foot); else document.body.appendChild(sec);
    }
    if (location.hash === '#ai-photos') setTimeout(function () { sec.scrollIntoView({ block: 'start' }); }, 50);
  }

  // The "Photo guidelines" tip beside photo uploads (lokali-profile-page-embed.js).
  function uploadTip() {
    if (!DASH) return;
    var pops = document.querySelectorAll('.lok-info-wrap div');
    for (var i = 0; i < pops.length; i++) {
      var d = pops[i];
      if (d.children.length > 4 || d.querySelector('.lk-ai-tipline')) continue;
      if (!/no text overlays/i.test(d.textContent || '') || /Photo guidelines/.test(d.textContent || '')) continue;
      var line = document.createElement('span');
      line.className = 'lk-ai-tipline';
      line.textContent = 'Real photos of your own work. Used AI to add a background? Turn on "AI info" on the photo.';
      d.appendChild(line);
    }
  }

  // Storefront report reason: say plainly that AI-misleading photos belong here.
  function reportLabel() {
    var opts = document.querySelectorAll('.vl-vreport-box option[value="misleading"]');
    for (var i = 0; i < opts.length; i++) {
      if (!/AI\)/.test(opts[i].textContent)) opts[i].textContent = 'Misleading listing or photos (including AI)';
    }
  }

  function pageExtras() {
    try { guideCards(); customerSection(); uploadTip(); reportLabel(); } catch (e) {}
  }

  // ---------------------------------------------------------------- scan
  function decorate() {
    pageExtras();
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
