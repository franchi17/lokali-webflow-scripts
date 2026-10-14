/**
 * Lokali — Homepage "Meet your neighbors" strip, v3 cards (2026-10 redesign).
 *
 * Injects a section right after the hero (above lokali-home.js's "Shop by
 * category") with up to 4 live publish-ready vendors as Market-style cards
 * (F's approved mockup, 2026-10-14): the vendor's WORK photo on top (the
 * Market card's cover chain via the adapter, owner photo as the stand-in),
 * then owner face + first name, business name, the storefront's tagline, a
 * Founding vendor pill and "Visit storefront". v2's bio hook and category
 * pill are gone (F: tagline instead of the bio; the category is one tap
 * away). Founding vendors sort first; within the week the set is a
 * deterministic shuffle seeded by the Monday-of-week date in
 * America/Chicago (no server state).
 *
 * Data = direct anon reads through window.LokaliSupabaseReady (the
 * spotlight-home pattern): one vendors select carrying the Meet-the-Vendor
 * owner fields (owner_name/owner_photo/owner_bio — NOT in the adapter's
 * VENDOR_LIST_COLS, which is why this does not go through vendors.list).
 * RLS gates the rows; is_publish_ready is filtered server-side. Failure or
 * empty = NOTHING injected, homepage unchanged.
 *
 * Fallback per F decision: a vendor missing owner_name renders business-led
 * (business name in the headline slot, tagline as the hook); missing photo =
 * initials circle. Vendor-authored text lands via textContent only.
 *
 * Deploy: Webflow REGISTERED script `lokalineighbors` (page-level on Home) —
 * a version bump is a re-register with the new @1.4.N URL + SRI hash, NOT a
 * freeform-tag sweep (the Data API 406s script tags in Home's freeform code).
 * Keep this file byte-identical in scripts/ and lokali-webflow-scripts/scripts/.
 */
(function () {
  'use strict';

  var STYLE_ID = 'lok-nb-style';
  var MAX_CARDS = 4;

  // Storefronts never shown in the strip (F 2026-08-31: Pancha Ventures is the
  // founding-counter anchor/test fixture, not a discovery surface; Rowdy Digital
  // held back for now so longer-live vendors keep the 4 slots — remove when F
  // says so). Overridable per-page via window.LOKALI_NEIGHBORS_EXCLUDE = ['slug', ...].
  var EXCLUDE_SLUGS = (Array.isArray(window.LOKALI_NEIGHBORS_EXCLUDE) && window.LOKALI_NEIGHBORS_EXCLUDE.length)
    ? window.LOKALI_NEIGHBORS_EXCLUDE.map(String)
    : ['pancha-ventures', 'rowdy-digital'];

  // F 2026-09-01: Umoh (Echoed Reflections) LEADS the strip for a week, and
  // Paperloom sits the same week out so it is a literal swap — the other
  // three slots keep rotating normally. SELF-EXPIRING: from `until` (a
  // Chicago-date string, exclusive) the normal weekly shuffle resumes with
  // no re-ship; the block is dead code that the next neighbors edit can drop.
  var FEATURE = { slug: 'echoed-reflections-videography', excludeSlug: 'paperloom', until: '2026-09-09' };
  function featureActive() {
    try {
      // en-CA = YYYY-MM-DD, so plain string compare works; same zone as weekKey().
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()) < FEATURE.until;
    } catch (e) { return false; }
  }

  var INITIAL_COLORS = ['#6002EE', '#B85C2B', '#1D6A45', '#2C5470'];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.lok-nb{font-family:"Plus Jakarta Sans",sans-serif;background:#fff;padding:84px 0;}' +
      '.lok-nb-inner{max-width:1240px;margin:0 auto;padding:0 40px;}' +
      '.lok-nb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:30px;flex-wrap:wrap;}' +
      '.lok-nb-title{font-size:38px;font-weight:800;letter-spacing:-.025em;line-height:1.1;color:#1A1829;margin:0;}' +
      '.lok-nb-sub{font-size:16px;color:#4A4761;margin:10px 0 0;}' +
      '.lok-nb-all{font-size:15px;font-weight:700;color:#6002EE;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1.5px;white-space:nowrap;}' +
      '.lok-nb-all:hover{color:#4B02BB;}' +
      '.lok-nb-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;align-items:stretch;}' +
      // Market card edges (v1.4.452): 1px #DEDAEE + the contact shadow.
      '.lok-nb-card{display:flex;flex-direction:column;min-width:0;background:#fff;border:1px solid #DEDAEE;border-radius:18px;' +
        'box-shadow:0 1px 2px rgba(40,32,90,.08),0 4px 14px rgba(40,32,90,.06);overflow:hidden;text-decoration:none;' +
        'transition:transform .2s ease,box-shadow .2s ease;}' +
      '.lok-nb-card:hover{transform:translateY(-2px);box-shadow:0 2px 4px rgba(40,32,90,.08),0 12px 28px rgba(96,2,238,.12);}' +
      '.lok-nb-cov{aspect-ratio:4/3;overflow:hidden;background:#E9E0FB;position:relative;}' +
      '.lok-nb-cov::after{content:"";position:absolute;inset:0;box-shadow:inset 0 -1px 0 rgba(40,32,90,.08);pointer-events:none;}' +
      '.lok-nb-cov img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.lok-nb-body{padding:14px 16px 16px;display:flex;flex-direction:column;flex:1;}' +
      '.lok-nb-who{display:flex;align-items:center;gap:10px;}' +
      '.lok-nb-face{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#F3EBFF;display:block;}' +
      '.lok-nb-initials{width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;' +
        'font-size:15px;font-weight:700;color:#fff;}' +
      '.lok-nb-name{font-size:18px;font-weight:800;letter-spacing:-.015em;line-height:1.15;color:#1A1829;}' +
      '.lok-nb-biz{margin-top:1px;font-size:13px;font-weight:600;color:#4A4761;line-height:1.3;}' +
      '.lok-nb-tag{margin:10px 0 0;font-size:14px;line-height:1.5;color:#4A4761;overflow:hidden;display:-webkit-box;' +
        '-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow-wrap:anywhere;word-break:break-word;}' +
      // No margin-left:auto on the link: a card without the Founding pill keeps
      // "Visit storefront" on the left like the others (F 2026-10-14).
      '.lok-nb-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:14px;flex-wrap:wrap;}' +
      '.lok-nb-founding{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;' +
        'color:#8A6A12;background:#fff;border:1px solid #E3CD8A;border-radius:999px;padding:4px 9px;}' +
      '.lok-nb-cta{font-size:14px;font-weight:700;color:#6002EE;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1.5px;}' +
      '@media(max-width:1149px){.lok-nb-grid{gap:16px;}.lok-nb-name{font-size:16.5px;}}' +
      '@media(max-width:991px){.lok-nb{padding:48px 0;}.lok-nb-inner{padding:0 24px;}.lok-nb-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.lok-nb-title{font-size:30px;}}' +
      '@media(max-width:767px){.lok-nb-inner{padding:0 16px;}.lok-nb-grid{gap:12px;}.lok-nb-card{border-radius:16px;}.lok-nb-cov{aspect-ratio:1/1;}' +
        '.lok-nb-body{padding:10px 12px 12px;}.lok-nb-who{gap:8px;}.lok-nb-face,.lok-nb-initials{width:30px;height:30px;font-size:12px;}' +
        '.lok-nb-name{font-size:16px;}.lok-nb-biz{font-size:12px;}.lok-nb-tag{display:none;}' + // the tagline would clip at this width
        '.lok-nb-foot{padding-top:10px;gap:8px;}.lok-nb-founding{font-size:9px;padding:3px 7px;}.lok-nb-cta{font-size:13px;}' +
        '.lok-nb-long{display:none;}}' + // "Founding" + "Visit" so the foot stays one row on phones
      '@media(prefers-reduced-motion:reduce){.lok-nb-card{transition:none;}}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- weekly deterministic rotation --------------------------------------
  function weekKey() {
    var parts, y, m, d;
    try {
      parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()).split('-');
      y = +parts[0]; m = +parts[1]; d = +parts[2];
    } catch (e) {
      var n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1; d = n.getDate();
    }
    var dt = new Date(Date.UTC(y, m - 1, d));
    var dow = dt.getUTCDay();
    dt.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7));
    return dt.toISOString().slice(0, 10);
  }

  function hashStr(s) {
    var h = 1779033703;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 1831565813) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weeklyPick(vendors) {
    var rnd = mulberry32(hashStr(weekKey()));
    var arr = vendors.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    arr = arr.slice(0, MAX_CARDS);
    // Founding vendors lead (stable within the shuffled order).
    var f = [], rest = [];
    for (var k = 0; k < arr.length; k++) (arr[k].is_founding_member === true ? f : rest).push(arr[k]);
    return f.concat(rest);
  }

  // ---- rendering ----------------------------------------------------------
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/);
    var a = (p[0] || '')[0] || '';
    var b = (p.length > 1 ? p[p.length - 1] : '')[0] || '';
    return (a + b).toUpperCase() || 'L';
  }

  function vendorHref(v) {
    var slug = String(v.slug || '').trim();
    return slug ? ('/' + encodeURIComponent(slug)) : ('/vendor?id=' + encodeURIComponent(v.id));
  }

  // CLEAN-P23: sized variants through the Storage render endpoint (helper in
  // lokali-supabase-client.js as window.LokaliImg; absent = the full object).
  function imgSet(img, url, w) {
    var I = window.LokaliImg;
    if (I && typeof I.set === 'function') I.set(img, url, w); else img.src = url;
  }

  var CROWN_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="#C9A22A" aria-hidden="true"><path d="M2 8l5 4 5-8 5 8 5-4-2 12H4L2 8z"/></svg>';

  function card(v, idx, cover) {
    var a = document.createElement('a');
    a.className = 'lok-nb-card';
    a.href = vendorHref(v);

    // Person-first when owner_name exists; business-led fallback otherwise.
    var ownerName = String(v.owner_name || '').trim();
    var headline = ownerName || String(v.business_name || 'Local business');
    var faceUrl = String(v.owner_photo || '').trim() || String(v.profile_photo || '').trim();

    // Work photo on top: the Market card's cover (adapter vendors.covers, with
    // its focal point); a vendor with no cover shows their face/profile photo.
    var cov = document.createElement('div');
    cov.className = 'lok-nb-cov';
    var coverUrl = (cover && cover.url) || faceUrl;
    if (coverUrl) {
      var cimg = document.createElement('img');
      imgSet(cimg, coverUrl, 640);
      cimg.alt = '';
      cimg.loading = 'lazy';
      if (cover && cover.url && cover.fx != null && cover.fy != null) cimg.style.objectPosition = cover.fx + '% ' + cover.fy + '%';
      cimg.addEventListener('error', function () { if (cimg.parentNode) cimg.parentNode.removeChild(cimg); });
      cov.appendChild(cimg);
    }
    a.appendChild(cov);

    var body = document.createElement('div');
    body.className = 'lok-nb-body';

    var who = document.createElement('div');
    who.className = 'lok-nb-who';
    var ini = document.createElement('div');
    ini.className = 'lok-nb-initials';
    ini.style.backgroundColor = INITIAL_COLORS[idx % INITIAL_COLORS.length];
    ini.textContent = initials(headline);
    if (faceUrl) {
      var img = document.createElement('img');
      img.className = 'lok-nb-face';
      imgSet(img, faceUrl, 96);
      img.alt = '';
      img.loading = 'lazy';
      // A blocked/failed photo (corporate web filters refuse api.golokali.com
      // while Webflow's CDN loads fine) falls back to the initials circle.
      img.addEventListener('error', function () { if (img.parentNode) img.parentNode.replaceChild(ini, img); });
      who.appendChild(img);
    } else {
      who.appendChild(ini);
    }
    var names = document.createElement('div');
    var name = document.createElement('div');
    name.className = 'lok-nb-name';
    name.textContent = headline;
    names.appendChild(name);
    if (ownerName && v.business_name && v.business_name !== ownerName) {
      var biz = document.createElement('div');
      biz.className = 'lok-nb-biz';
      biz.textContent = v.business_name;
      names.appendChild(biz);
    }
    who.appendChild(names);
    body.appendChild(who);

    // The storefront's own tagline (F 2026-10-14: tagline, not the bio). URLs
    // stripped (an unbroken link token overflows sideways), capped at a word
    // boundary; the 3-line CSS clamp is the visual guard.
    var tag = String(v.business_tagline || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    if (tag.length > 120) {
      tag = tag.slice(0, 120);
      var sp = tag.lastIndexOf(' ');
      if (sp > 70) tag = tag.slice(0, sp);
      tag += '…';
    }
    if (tag) {
      var tagEl = document.createElement('p');
      tagEl.className = 'lok-nb-tag';
      tagEl.textContent = tag;
      body.appendChild(tagEl);
    }

    var foot = document.createElement('div');
    foot.className = 'lok-nb-foot';
    if (v.is_founding_member === true) {
      var fnd = document.createElement('span');
      fnd.className = 'lok-nb-founding';
      fnd.innerHTML = CROWN_SVG; // static SVG only — vendor text never lands here
      fnd.appendChild(document.createTextNode('Founding'));
      var fv2 = document.createElement('span');
      fv2.className = 'lok-nb-long';
      fv2.textContent = '\u00a0vendor';
      fnd.appendChild(fv2);
      foot.appendChild(fnd);
    }
    var cta = document.createElement('span');
    cta.className = 'lok-nb-cta';
    cta.textContent = 'Visit';
    var cta2 = document.createElement('span');
    cta2.className = 'lok-nb-long';
    cta2.textContent = '\u00a0storefront';
    cta.appendChild(cta2);
    foot.appendChild(cta);
    body.appendChild(foot);

    a.appendChild(body);
    return a;
  }

  function buildSection(picks, covers) {
    var sec = document.createElement('section');
    sec.className = 'lok-nb';
    sec.id = 'lok-neighbors';

    var inner = document.createElement('div');
    inner.className = 'lok-nb-inner';

    var head = document.createElement('div');
    head.className = 'lok-nb-head';
    var hwrap = document.createElement('div');
    var h = document.createElement('h2');
    h.className = 'lok-nb-title';
    h.textContent = 'Meet your neighbors';
    var sub = document.createElement('p');
    sub.className = 'lok-nb-sub';
    sub.textContent = 'A few of the people behind the work near you. New faces every week.';
    hwrap.appendChild(h); hwrap.appendChild(sub);
    var all = document.createElement('a');
    all.className = 'lok-nb-all';
    all.href = '/the-market';
    all.textContent = 'See everyone in the Market';
    head.appendChild(hwrap); head.appendChild(all);
    inner.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'lok-nb-grid';
    for (var i = 0; i < picks.length; i++) grid.appendChild(card(picks[i], i, covers && covers[String(picks[i].id)]));
    inner.appendChild(grid);

    sec.appendChild(inner);
    return sec;
  }

  function insertSection(sec) {
    // 2026-10 homepage: right after the hero, so "Shop by category"
    // (lokali-home.js, inserted before .wi-section) always follows it.
    var hero = document.querySelector('section.hero');
    if (hero && hero.parentNode) { hero.parentNode.insertBefore(sec, hero.nextSibling); return true; }
    var anchor = document.querySelector('.wi-section') || document.querySelector('.section-3');
    if (!anchor || !anchor.parentNode) return false;
    anchor.parentNode.insertBefore(sec, anchor);
    return true;
  }

  // ---- boot ---------------------------------------------------------------
  function start() {
    if (!document.querySelector('.wi-section') && !document.querySelector('.section-3')) return; // homepage only
    if (!window.LokaliSupabaseReady || !window.LokaliSupabaseReady.then) return;
    window.LokaliSupabaseReady.then(function (c) {
      return c.from('vendors')
        .select('id,slug,business_name,business_tagline,business_description,profile_photo,' +
                'owner_name,owner_photo,owner_bio,categories_id,is_founding_member,is_active')
        .eq('is_publish_ready', true)
        .limit(100);
    }).then(function (res) {
      if (!res || res.error || !Array.isArray(res.data)) return;
      var vendors = res.data.filter(function (v) {
        return v && v.is_active !== false &&
          EXCLUDE_SLUGS.indexOf(String(v.slug || '')) === -1 &&
          !(featureActive() && String(v.slug || '') === FEATURE.excludeSlug);
      });
      if (!vendors.length) return; // empty = homepage unchanged
      var picked = weeklyPick(vendors);
      if (featureActive()) {
        // Put the featured vendor in slot 1 (ahead of the founding-first
        // ordering — the pin is the point), pulling them into the set if the
        // shuffle happened to leave them out.
        var fi = -1;
        for (var pi = 0; pi < picked.length; pi++) {
          if (String(picked[pi].slug || '') === FEATURE.slug) { fi = pi; break; }
        }
        if (fi > 0) {
          picked.unshift(picked.splice(fi, 1)[0]);
        } else if (fi === -1) {
          for (var vi = 0; vi < vendors.length; vi++) {
            if (String(vendors[vi].slug || '') === FEATURE.slug) {
              if (picked.length >= MAX_CARDS) picked.pop();
              picked.unshift(vendors[vi]);
              break;
            }
          }
        }
      }
      var ids = picked.map(function (v) { return v.id; });
      var A = window.LokaliAPI && window.LokaliAPI.vendors;
      var coversP = (A && typeof A.covers === 'function')
        ? A.covers(ids).then(function (out) { return (out && out.data && out.data.covers) || {}; }, function () { return {}; })
        : Promise.resolve({});
      return coversP.then(function (covers) {
        injectStyle();
        insertSection(buildSection(picked, covers));
      });
    }).catch(function (e) {
      try { console.warn('[lokali-neighbors] skipped:', e && e.message); } catch (x) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
