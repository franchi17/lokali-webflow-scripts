/**
 * Lokali — Homepage "Meet your neighbors" strip, v2 person-first (#162).
 *
 * Injects a section between the hero and "What is Lokali" with up to 4 live
 * publish-ready vendors as PERSON-first cards (F 2026-08-31): owner face +
 * first name lead, business name as body text, owner-bio hook line, category
 * pill (site identity colors/icons) and a FOUNDING VENDOR badge. Founding
 * vendors sort first; within the week the set is a deterministic shuffle
 * seeded by the Monday-of-week date in America/Chicago (no server state).
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
  // founding-counter anchor/test fixture, not a discovery surface). Overridable
  // per-page via window.LOKALI_NEIGHBORS_EXCLUDE = ['slug', ...].
  var EXCLUDE_SLUGS = (Array.isArray(window.LOKALI_NEIGHBORS_EXCLUDE) && window.LOKALI_NEIGHBORS_EXCLUDE.length)
    ? window.LOKALI_NEIGHBORS_EXCLUDE.map(String)
    : ['pancha-ventures'];

  // Category identities — colors/labels mirror the-market's CAT_BY_ID and the
  // icon assets its sidebar uses (#96 taxonomy; #152 added 9). Icons render as
  // CSS-masked spans so they take the pill's text color, like browse does.
  var CAT_ASSET = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/';
  var CATS = {
    1: { label: 'Handcrafted Goods',       bg: '#FFF8E6', fg: '#8A5A00', icon: '6a186b061a80eb9ba75f0d0a_scissors-solid.png' },
    2: { label: 'Business Services',       bg: '#F6EEF5', fg: '#7A3B6D', icon: '6a18f6d4b01673d30ca9bcb8_briefcase.svg' },
    3: { label: 'Beauty',                  bg: '#FEF3F2', fg: '#C0392B', icon: '6a18f2524e31974a75003735_hair%20dryer.svg' },
    4: { label: 'Children',                bg: '#E6F1FB', fg: '#1A5C9A', icon: '6a18f6d4f1bbd4795f5345bc_backpack.svg' },
    5: { label: 'Events & Entertainment',  bg: '#F3EBFF', fg: '#6002EE', icon: '6a18f6d414c76bb968f180db_balloon.svg' },
    6: { label: 'Food',                    bg: '#FFF3EA', fg: '#FF6B00', icon: '6a186b067365d964abee8918_utensils-solid.png' },
    7: { label: 'Wellness',                bg: '#EAFAF2', fg: '#1D6A45', icon: '6a186b06cfcb6c4d6d1e1cf7_heart-regular.png' },
    8: { label: 'Home & Property',         bg: '#E7F4F2', fg: '#1F6E66', icon: '6a186b06a37dcea6514f15f9_house-regular.png' },
    9: { label: 'Professional Services',   bg: '#EEF3F8', fg: '#2C5470', icon: '6a89a66cb52c25150db94d06_user-tie-solid.svg' }
  };

  var INITIAL_COLORS = ['#6002EE', '#B85C2B', '#1D6A45', '#2C5470'];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.lok-nb{font-family:"Plus Jakarta Sans",sans-serif;background:#F3EBFF;padding:56px 20px;}' +
      '.lok-nb-inner{max-width:1160px;margin:0 auto;}' +
      '.lok-nb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:26px;flex-wrap:wrap;}' +
      '.lok-nb-title{font-size:32px;font-weight:800;letter-spacing:-.6px;color:#1A1829;margin:0;}' +
      '.lok-nb-sub{font-size:16px;color:#4A4761;margin:6px 0 0;}' +
      '.lok-nb-all{font-size:15px;font-weight:600;color:#6002EE;text-decoration:none;white-space:nowrap;}' +
      '.lok-nb-all:hover{color:#4B02BB;}' +
      '.lok-nb-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;align-items:stretch;}' +
      '@media(max-width:991px){.lok-nb-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}' +
      '@media(max-width:560px){.lok-nb-grid{grid-template-columns:1fr;max-width:420px;margin:0 auto;}}' +
      '.lok-nb-card{display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;' +
        'border:1px solid #EEEDF6;border-radius:18px;padding:30px 20px 22px;box-shadow:0 10px 26px rgba(26,24,41,.07);' +
        'text-decoration:none;transition:transform .2s ease,box-shadow .2s ease;}' +
      '.lok-nb-card:hover{transform:translateY(-3px);box-shadow:0 16px 34px rgba(26,24,41,.11);}' +
      '.lok-nb-photo{width:104px;height:104px;border-radius:50%;overflow:hidden;border:4px solid #F3EBFF;' +
        'box-shadow:0 6px 16px rgba(96,2,238,.14);flex-shrink:0;}' +
      '.lok-nb-photo img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.lok-nb-initials{width:104px;height:104px;border-radius:50%;border:4px solid #F3EBFF;flex-shrink:0;' +
        'box-shadow:0 6px 16px rgba(96,2,238,.14);display:flex;align-items:center;justify-content:center;' +
        'font-size:32px;font-weight:700;color:#fff;}' +
      '.lok-nb-name{margin-top:13px;font-size:20px;font-weight:800;color:#1A1829;}' +
      '.lok-nb-biz{margin-top:2px;font-size:14px;font-weight:600;color:#4A4761;}' +
      '.lok-nb-bio{margin-top:6px;font-size:13px;line-height:1.5;color:#6B6880;overflow:hidden;text-overflow:ellipsis;' +
        'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-width:100%;overflow-wrap:anywhere;word-break:break-word;}' +
      '.lok-nb-pills{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px;}' +
      '.lok-nb-cat{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;border-radius:999px;padding:5px 12px;}' +
      '.lok-nb-cat-ic{display:inline-block;width:12px;height:12px;-webkit-mask-size:contain;mask-size:contain;' +
        '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;}' +
      '.lok-nb-founding{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;letter-spacing:.05em;' +
        'color:#9A6B00;background:#fff;border:1.5px solid #C9A22A;border-radius:999px;padding:3px 10px;}' +
      '.lok-nb-cta{margin-top:auto;padding-top:14px;font-size:14px;font-weight:700;color:#6002EE;}';
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

  var CROWN_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="#C9A22A" aria-hidden="true"><path d="M2 8l5 4 5-8 5 8 5-4-2 12H4L2 8z"/></svg>';

  function card(v, idx) {
    var a = document.createElement('a');
    a.className = 'lok-nb-card';
    a.href = vendorHref(v);

    // Person-first when owner_name exists; business-led fallback otherwise.
    var ownerName = String(v.owner_name || '').trim();
    var headline = ownerName || String(v.business_name || 'Local business');
    var photoUrl = String(v.owner_photo || '').trim() || String(v.profile_photo || '').trim();

    if (photoUrl) {
      var wrap = document.createElement('div');
      wrap.className = 'lok-nb-photo';
      var img = document.createElement('img');
      img.src = photoUrl;
      img.alt = headline;
      img.loading = 'lazy';
      wrap.appendChild(img);
      a.appendChild(wrap);
    } else {
      var ini = document.createElement('div');
      ini.className = 'lok-nb-initials';
      ini.style.backgroundColor = INITIAL_COLORS[idx % INITIAL_COLORS.length];
      ini.textContent = initials(headline);
      a.appendChild(ini);
    }

    var name = document.createElement('div');
    name.className = 'lok-nb-name';
    name.textContent = headline;
    a.appendChild(name);

    if (ownerName && v.business_name && v.business_name !== ownerName) {
      var biz = document.createElement('div');
      biz.className = 'lok-nb-biz';
      biz.textContent = v.business_name;
      a.appendChild(biz);
    }

    // Bios are written for the storefront, not a card: strip URLs (an unbroken
    // link token overflows the card sideways — bit Umoh's YouTube link on day
    // one) and cap at a word boundary; the 2-line CSS clamp stays as the
    // visual guard.
    var hook = String((ownerName && v.owner_bio) || v.business_tagline || v.business_description || '');
    hook = hook.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    if (hook.length > 140) {
      hook = hook.slice(0, 140);
      var sp = hook.lastIndexOf(' ');
      if (sp > 80) hook = hook.slice(0, sp);
      hook += '…';
    }
    if (hook) {
      var bio = document.createElement('div');
      bio.className = 'lok-nb-bio';
      bio.textContent = hook;
      a.appendChild(bio);
    }

    var pills = document.createElement('div');
    pills.className = 'lok-nb-pills';

    var catIds = Array.isArray(v.categories_id) ? v.categories_id : (v.categories_id != null ? [v.categories_id] : []);
    for (var i = 0; i < catIds.length; i++) {
      var cat = CATS[catIds[i]];
      if (!cat) continue;
      var pill = document.createElement('span');
      pill.className = 'lok-nb-cat';
      pill.style.color = cat.fg;
      pill.style.background = cat.bg;
      var ic = document.createElement('span');
      ic.className = 'lok-nb-cat-ic';
      ic.style.backgroundColor = cat.fg;
      var url = 'url("' + CAT_ASSET + cat.icon + '")';
      ic.style.webkitMaskImage = url;
      ic.style.maskImage = url;
      pill.appendChild(ic);
      pill.appendChild(document.createTextNode(cat.label));
      pills.appendChild(pill);
      break; // one category pill per card
    }

    if (v.is_founding_member === true) {
      var fnd = document.createElement('span');
      fnd.className = 'lok-nb-founding';
      fnd.innerHTML = CROWN_SVG; // static SVG only — vendor text never lands here
      fnd.appendChild(document.createTextNode('FOUNDING VENDOR'));
      pills.appendChild(fnd);
    }

    if (pills.childNodes.length) a.appendChild(pills);

    var cta = document.createElement('div');
    cta.className = 'lok-nb-cta';
    cta.textContent = 'Visit storefront →';
    a.appendChild(cta);

    return a;
  }

  function buildSection(picks) {
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
    sub.textContent = 'A few of the people behind the work near you.';
    hwrap.appendChild(h); hwrap.appendChild(sub);
    var all = document.createElement('a');
    all.className = 'lok-nb-all';
    all.href = '/the-market';
    all.textContent = 'See everyone in the Market →';
    head.appendChild(hwrap); head.appendChild(all);
    inner.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'lok-nb-grid';
    for (var i = 0; i < picks.length; i++) grid.appendChild(card(picks[i], i));
    inner.appendChild(grid);

    sec.appendChild(inner);
    return sec;
  }

  function insertSection(sec) {
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
          EXCLUDE_SLUGS.indexOf(String(v.slug || '')) === -1;
      });
      if (!vendors.length) return; // empty = homepage unchanged
      injectStyle();
      insertSection(buildSection(weeklyPick(vendors)));
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
