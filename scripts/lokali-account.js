/**
 * lokali-account.js — customer "My Account" hub (/account).
 *
 * Renders the whole hub into a single mount element (id="lokali-account"):
 *   • Header band — "Hi, {first_name}", area · member-since, Saved/Reviews counts.
 *   • Segmented control with hash routing (#saved / #reviews / #settings) so
 *     review-reminder / vendor-reply emails can deep-link to a pane.
 *   • Saved  — list rows from the favorites API (View / Contact / unsave heart).
 *   • Reviews — "Awaiting your review" (contacted-not-reviewed) + "Your reviews"
 *     (edit / delete) + an inline recommend-or-not composer. Recommend-only model
 *     (no stars at launch); empty states never show a bare zero.
 *   • Settings — Name, Email (managed via the LokaliAuth account panel), Area (region), 3 notification
 *     toggles, Sign out, Delete account (58a: type-DELETE confirm → Vercel
 *     /account/delete → Stripe cancel + backend purge + auth-user delete → sign-out).
 *
 * Depends on lokali-api-client.js (window.LokaliAPI with the account / reviews /
 * favorites namespaces). Auth via the Xano token; shows a sign-in prompt when
 * signed out. Keeps the Webflow page to just an empty <div id="lokali-account">.
 */
(function () {
  'use strict';

  var MOUNT_ID = 'lokali-account';
  var PANES = ['saved', 'reviews', 'settings'];

  function api() { return window.LokaliAPI; }
  function hasToken() { var a = api(); return !!(a && a.getToken && a.getToken()); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function arr(d) { if (Array.isArray(d)) return d; if (d && Array.isArray(d.items)) return d.items; if (d && Array.isArray(d.data)) return d.data; return []; }
  function initials(name) { var p = String(name || '').trim().split(/\s+/); return ((p[0] || '')[0] || '' ) + ((p[1] || '')[0] || ''); }

  // ── #76 customer avatars ─────────────────────────────────────
  // Preset id -> soft-palette background + one of the site's existing masked
  // icons (same CDN assets the cards/badges use — no emojis, on-palette).
  // app_user.avatar stores the id; an unknown/empty id falls back to initials.
  var AV_ASSET = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/';
  // (A hand-drawn butterfly preset shipped briefly in v1.4.169/170 and was
  // removed by decision 2026-07-18 — didn't look right. FA-free has no
  // butterfly glyph; revisit only with a properly designed asset.)
  var AVATAR_PRESETS = {
    heart:    { bg: '#FBE9F3', tint: '#A5488F', url: AV_ASSET + '6a186b06cfcb6c4d6d1e1cf7_heart-regular.png' },
    star:     { bg: '#FBF3DF', tint: '#8A6A1F', url: AV_ASSET + '6a1af18050966f1b31aac321_star-regular.png' },
    bolt:     { bg: '#F1EEFB', tint: '#5F51B8', url: AV_ASSET + '6a1d92f83a64390307583b8e_bolt-solid.png' },
    balloon:  { bg: '#FBEDE4', tint: '#C97B5D', url: AV_ASSET + '6a18f6d414c76bb968f180db_balloon.svg' },
    house:    { bg: '#E7F3EC', tint: '#2E7D5B', url: AV_ASSET + '6a186b06a37dcea6514f15f9_house-regular.png' },
    backpack: { bg: '#E8F0FB', tint: '#3B5BA5', url: AV_ASSET + '6a18f6d4f1bbd4795f5345bc_backpack.svg' },
    utensils: { bg: '#FDF3D8', tint: '#96702E', url: AV_ASSET + '6a186b067365d964abee8918_utensils-solid.png' },
    scissors: { bg: '#F3EAE3', tint: '#8A5A00', url: AV_ASSET + '6a186b061a80eb9ba75f0d0a_scissors-solid.png' },
    globe:    { bg: '#E3F0F7', tint: '#2E6E7D', url: AV_ASSET + '69f8b5e89bc57b40690cbc77_globe-solid.png' },
    crown:    { bg: '#F7F3E0', tint: '#9A6B00', url: AV_ASSET + '69f4dbb3533f0ee2046ab0fb_crown-solid.png' }
  };
  // Circle node for the given account: chosen preset, else initials on violet.
  function avatarNode(acc, cls) {
    var node = el('div', cls);
    var p = AVATAR_PRESETS[acc && acc.avatar];
    if (p) {
      node.style.background = p.bg;
      node.style.boxShadow = 'none';
      var ic = el('span');
      ic.style.cssText = 'display:inline-block;width:55%;height:55%;background:' + p.tint + ';' +
        '-webkit-mask:url("' + p.url + '") center / contain no-repeat;mask:url("' + p.url + '") center / contain no-repeat;';
      node.appendChild(ic);
    } else {
      node.textContent = (initials((acc && acc.first_name || '') + ' ' + (acc && acc.last_name || '')) || 'U').toUpperCase();
    }
    return node;
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function ts(v) { if (v == null) return 0; if (typeof v === 'number') return v; var n = Date.parse(v); return isNaN(n) ? 0 : n; }
  function monthYear(v) { var t = ts(v); if (!t) return ''; var d = new Date(t); return FULL[d.getMonth()] + ' ' + d.getFullYear(); }
  function monthDay(v) { var t = ts(v); if (!t) return ''; var d = new Date(t); return MONTHS[d.getMonth()] + ' ' + d.getDate(); }

  function vendorHref(v) { if (!v) return '#'; return v.slug ? ('/' + v.slug) : ('/vendor?id=' + v.id); }
  function vendorOf(row) { return (row && (row.vendor || row._vendor)) || row || {}; }
  function vendorName(v) { return (v && (v.business_name || v.name)) || 'Vendor'; }

  // The favorites/reviews endpoints return categories_id (not a name) — map it
  // locally, same fixed 8-category table lokali-vendor-detail.js uses.
  var CAT_NAMES = {
    1: 'Handcrafted Goods', 2: 'Business Services', 3: 'Beauty',
    4: 'Children & Education', 5: 'Events', 6: 'Food',
    7: 'Health & Wellness', 8: 'Home Services'
  };
  function vendorCat(v) {
    var c = v && (v.category || v.category_name);
    if (c) return c;
    var id = v && (Array.isArray(v.categories_id) ? v.categories_id[0] : v.categories_id);
    return id != null ? (CAT_NAMES[id] || '') : '';
  }

  // Vendor profile photo, sanitized (same guard as the sidebar chip) — used to
  // upgrade the initials thumbs to the real photo when one exists.
  var XANO_ORIGIN = 'https://x8ki-letl-twmt.n7.xano.io';
  function vendorPhotoUrl(v) {
    var s = v && (v.profile_photo || v.photo || v.logo);
    if (!s || typeof s !== 'string') return '';
    s = s.trim();
    if (/[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    if (s.charAt(0) === '/') return XANO_ORIGIN + s;
    return /^https?:\/\//i.test(s) ? s : '';
  }
  function thumbPhoto(node, v) {
    var u = vendorPhotoUrl(v);
    if (!u || !node) return;
    var img = document.createElement('img');
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;border-radius:inherit;object-fit:cover;display:block;';
    img.onload = function () { node.textContent = ''; node.appendChild(img); };
    img.onerror = function () { /* keep initials */ };
    img.src = u;
  }

  // ── #45: "Your area" → Google Places city autocomplete ─────────────────────
  // Same pattern as the waitlist modal (lokali-waitlist.js): key from
  // window.LOKALI_GMAPS_KEY (Webflow site-wide head), legacy places.Autocomplete
  // restricted to cities, and a plain-text fallback whenever the key/script is
  // missing or fails. Maps JS loads lazily on first FOCUS of the field so the
  // account page pays nothing until the user actually edits their area.
  // A picked city is normalized to "City, ST" (state/country short code), which
  // The Market's #44 region-default matches by name-contains.
  var _mapsLoading = false;
  function loadMapsThen(cb) {
    if (window.google && window.google.maps && window.google.maps.places) { cb(); return; }
    var key = (typeof window.LOKALI_GMAPS_KEY === 'string') ? window.LOKALI_GMAPS_KEY.trim() : '';
    if (!key) return; // no key configured — stay free-text
    var prev = window.__lokAcctMapsReady;
    window.__lokAcctMapsReady = function () { if (prev) { try { prev(); } catch (e) {} } cb(); };
    if (_mapsLoading || document.querySelector('script[data-lok-acct-maps]') || document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
      // A Maps tag is already in flight (ours or another script's, possibly
      // with a different callback name) — poll briefly until places is ready.
      _mapsLoading = true;
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (window.google && window.google.maps && window.google.maps.places) { clearInterval(iv); cb(); }
        else if (tries > 40) clearInterval(iv);
      }, 250);
      return;
    }
    _mapsLoading = true;
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&libraries=places&callback=__lokAcctMapsReady';
    s.async = true; s.defer = true; s.setAttribute('data-lok-acct-maps', '1');
    s.onerror = function () { _mapsLoading = false; }; // stays free-text
    document.head.appendChild(s);
  }
  function placeComp(list, type, useShort) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i].types && list[i].types.indexOf(type) > -1) return useShort ? list[i].short_name : list[i].long_name;
    }
    return '';
  }
  function initAreaAutocomplete(input) {
    if (!input || input.dataset.lokAcMaps) return;
    input.dataset.lokAcMaps = '1';
    input.setAttribute('placeholder', 'e.g. The Woodlands');
    input.setAttribute('autocomplete', 'off'); // stop browser autofill fighting the Places dropdown
    input.addEventListener('focus', function onFocus() {
      input.removeEventListener('focus', onFocus);
      loadMapsThen(function () {
        if (input.dataset.lokAcBound) return;
        input.dataset.lokAcBound = '1';
        try {
          // #17 — prefer Places API (New); legacy widget stays as the fallback
          // (same pattern as google-maps-ai.js / lokali-waitlist.js).
          var places = google.maps.places;
          if (places.AutocompleteSuggestion && places.Place) initAreaNewAC(input, places);
          else if (places.Autocomplete) initAreaLegacyAC(input);
        } catch (e) { /* free-text fallback */ }
      });
    });
  }
  // A picked city is normalized to "City, ST" — same shape both paths.
  function commitArea(input, city, st) {
    if (city) input.value = st ? (city + ', ' + st) : city;
  }
  function initAreaNewAC(input, places) {
    var token = null, dd = null, items = [], active = -1, timer = null;
    var hadSuccess = false, usingLegacy = false;
    function isPermissionError(err) {
      var m = (err && (err.message || err.toString())) || '';
      return /denied|not enabled|not authorized|unauthorized|permission|forbidden|api key/i.test(m);
    }
    function fallbackToLegacy() {
      usingLegacy = true;
      hide();
      try { initAreaLegacyAC(input); } catch (e) { /* free-text fallback */ }
    }
    function ensureDD() {
      if (dd) return dd;
      dd = document.createElement('div');
      dd.setAttribute('role', 'listbox');
      dd.style.cssText = 'position:absolute;z-index:99999;background:#fff;border:.5px solid #EEEDF6;'
        + 'border-radius:12px;box-shadow:0 12px 30px rgba(40,20,90,.18);overflow:hidden;display:none;'
        + "box-sizing:border-box;font-family:'Plus Jakarta Sans',-apple-system,sans-serif;";
      document.body.appendChild(dd);
      return dd;
    }
    function position() {
      if (!dd) return;
      var r = input.getBoundingClientRect();
      dd.style.left = (r.left + window.scrollX) + 'px';
      dd.style.top = (r.bottom + window.scrollY + 4) + 'px';
      dd.style.width = r.width + 'px';
    }
    function hide() { if (dd) dd.style.display = 'none'; active = -1; }
    function setActive(i) {
      for (var k = 0; k < items.length; k++) items[k].row.style.background = (k === i) ? '#F3EBFF' : '#fff';
      active = i;
    }
    function compNew(list, type, useShort) {
      for (var i = 0; i < (list || []).length; i++) {
        if (list[i].types && list[i].types.indexOf(type) > -1) {
          return (useShort ? list[i].shortText : list[i].longText) || '';
        }
      }
      return '';
    }
    function select(pred) {
      hide();
      token = null; // a session ends once a place is selected
      var pl;
      try { pl = pred.toPlace(); } catch (e) { return; }
      pl.fetchFields({ fields: ['addressComponents', 'displayName'] })
        .then(function () {
          var c = pl.addressComponents || [];
          var city = compNew(c, 'locality', false) || compNew(c, 'postal_town', false)
            || compNew(c, 'administrative_area_level_3', false) || compNew(c, 'sublocality', false) || (pl.displayName || '');
          var st = compNew(c, 'administrative_area_level_1', true) || compNew(c, 'country', true);
          commitArea(input, city, st);
        })
        .catch(function () { /* keep free text */ });
    }
    function render(suggestions) {
      ensureDD();
      dd.innerHTML = '';
      items = [];
      for (var i = 0; suggestions && i < suggestions.length; i++) {
        var pred = suggestions[i].placePrediction;
        if (!pred) continue;
        var text = (pred.text && pred.text.text) ? pred.text.text : '';
        var row = document.createElement('div');
        row.setAttribute('role', 'option');
        row.style.cssText = 'padding:10px 13px;cursor:pointer;font-size:13.5px;line-height:1.4;color:#1A1829;'
          + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#fff;';
        row.textContent = text;
        (function (p, idx, rowEl) {
          rowEl.addEventListener('mousedown', function (e) { e.preventDefault(); select(p); });
          rowEl.addEventListener('mouseenter', function () { setActive(idx); });
        })(pred, items.length, row);
        dd.appendChild(row);
        items.push({ row: row, pred: pred });
      }
      if (!items.length) { hide(); return; }
      position();
      dd.style.display = 'block';
    }
    function fetchSuggestions(q) {
      if (!token) token = new places.AutocompleteSessionToken();
      places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        sessionToken: token,
        includedPrimaryTypes: ['(cities)']
      }).then(function (res) {
        hadSuccess = true;
        if (input.value.trim() !== q) return; // stale response
        render(res && res.suggestions);
      }).catch(function (err) {
        if (window.console) console.warn('[lokali-account] area autocomplete fetch error', err);
        hide();
        if (!hadSuccess && !usingLegacy && isPermissionError(err)) fallbackToLegacy();
      });
    }
    input.addEventListener('input', function () {
      if (usingLegacy) return; // legacy widget now owns this input
      var q = input.value.trim();
      if (timer) clearTimeout(timer);
      if (q.length < 3) { hide(); return; }
      timer = setTimeout(function () { fetchSuggestions(q); }, 250);
    });
    input.addEventListener('keydown', function (e) {
      if (usingLegacy || !dd || dd.style.display === 'none' || !items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % items.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + items.length) % items.length); }
      else if (e.key === 'Enter') { e.preventDefault(); select(items[active >= 0 ? active : 0].pred); }
      else if (e.key === 'Escape') { hide(); }
    });
    input.addEventListener('blur', function () { setTimeout(hide, 150); });
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
  }
  function initAreaLegacyAC(input) {
    var ac = new google.maps.places.Autocomplete(input, {
      types: ['(cities)'],
      fields: ['address_components', 'place_id', 'name']
    });
    ac.addListener('place_changed', function () {
      var pl = ac.getPlace();
      if (!pl || !pl.place_id) return;
      var c = pl.address_components || [];
      var city = placeComp(c, 'locality', false) || placeComp(c, 'postal_town', false)
        || placeComp(c, 'administrative_area_level_3', false) || placeComp(c, 'sublocality', false) || (pl.name || '');
      var st = placeComp(c, 'administrative_area_level_1', true) || placeComp(c, 'country', true);
      commitArea(input, city, st);
    });
  }

  // ── styles (scoped under #lokali-account) ──────────────────
  function injectCSS() {
    if (document.getElementById('lokali-account-styles')) return;
    var V = '#6002EE', VL = '#F3EBFF', VM = '#E5D4FD', SNOW = '#F7F6FC', INK = '#1A1829',
        DUSK = '#4A4761', SLATE = '#8E8BA6', FOG = '#C8C6D8', BORDER = '#EEEDF6',
        GREEN = '#2BB673', GREENL = '#E4F7EE', F = "'Plus Jakarta Sans',-apple-system,sans-serif";
    var s = document.createElement('style');
    s.id = 'lokali-account-styles';
    var R = '#lokali-account ';
    s.textContent = [
      R + '*{box-sizing:border-box;}',
      '#lokali-account{font-family:' + F + ';color:' + INK + ';max-width:760px;margin:0 auto;padding:1.5rem 0 3rem;}',
      // band
      R + '.lk-band{background:linear-gradient(135deg,#F3EBFF 0%,#FAF7FF 55%,#FFF4EC 100%);border:.5px solid ' + VM + ';border-radius:16px;padding:22px 24px;display:flex;align-items:center;gap:16px;margin-bottom:1.5rem;}',
      R + '.lk-avatar{width:52px;height:52px;border-radius:50%;background:' + V + ';color:#fff;font-size:19px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 14px rgba(96,2,238,.25);text-transform:uppercase;}',
      R + '.lk-greet{font-size:20px;font-weight:600;letter-spacing:-.3px;}',
      R + '.lk-meta{font-size:12.5px;color:' + DUSK + ';margin-top:3px;}',
      R + '.lk-stats{margin-left:auto;display:flex;gap:22px;text-align:center;}',
      R + '.lk-stat-num{font-size:18px;font-weight:600;color:' + V + ';line-height:1;}',
      R + '.lk-stat-lbl{font-size:11px;color:' + SLATE + ';margin-top:4px;}',
      // segmented
      R + '.lk-seg-wrap{display:inline-flex;background:#fff;border:.5px solid ' + BORDER + ';border-radius:100px;padding:4px;gap:2px;margin-bottom:1.75rem;}',
      R + '.lk-seg{font-family:' + F + ';font-size:13px;font-weight:600;color:' + SLATE + ';padding:8px 20px;border-radius:100px;cursor:pointer;border:none;background:none;transition:all .15s;display:flex;align-items:center;gap:6px;}',
      R + '.lk-seg:hover:not(.is-active){color:' + DUSK + ';}',
      // #39 — active tab pill in Lokali orange (was brand purple V).
      R + '.lk-seg.is-active{background:#FF8D00;color:#fff;}',
      R + '.lk-seg-count{font-size:11px;opacity:.85;}',
      R + '.lk-pane{display:none;}',
      R + '.lk-pane.is-active{display:block;}',
      R + '.lk-intro{font-size:13px;color:' + SLATE + ';margin-bottom:1.4rem;line-height:1.55;max-width:540px;}',
      R + '.lk-group+.lk-group{margin-top:2.25rem;}',
      R + '.lk-group-label{font-size:11px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:' + SLATE + ';margin:0 0 .9rem;}',
      // saved rows
      R + '.lk-row{display:flex;align-items:center;gap:14px;background:#fff;border:.5px solid ' + BORDER + ';border-radius:12px;padding:12px 14px;margin-bottom:10px;transition:border-color .15s;}',
      R + '.lk-row:hover{border-color:' + FOG + ';}',
      R + '.lk-thumb{width:46px;height:46px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#EADBFF,#D9C2FF);color:' + V + ';font-weight:700;font-size:15px;text-transform:uppercase;}',
      R + '.lk-row-info{flex:1;min-width:0;}',
      R + '.lk-row-name{font-size:14px;font-weight:600;}',
      R + '.lk-row-sub{font-size:12px;color:' + SLATE + ';margin-top:2px;}',
      R + '.lk-row-sub .cat{color:' + V + ';font-weight:600;}',
      R + '.lk-row-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}',
      R + '.lk-btn{font-family:' + F + ';font-size:12px;font-weight:600;cursor:pointer;border-radius:8px;padding:7px 13px;transition:all .12s;border:none;}',
      R + '.lk-btn.primary{background:' + V + ';color:#fff;}',
      R + '.lk-btn.primary:hover{opacity:.88;}',
      R + '.lk-btn.ghost{background:#fff;border:.5px solid ' + FOG + ';color:' + DUSK + ';}',
      R + '.lk-btn.ghost:hover{border-color:' + V + ';color:' + V + ';}',
      R + '.lk-heart{width:30px;height:30px;border-radius:8px;border:none;background:' + SNOW + ';color:' + V + ';cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      R + '.lk-heart:hover{background:' + VL + ';}',
      // awaiting
      R + '.lk-await{background:#fff;border:.5px solid ' + BORDER + ';border-radius:12px;padding:13px 16px;display:flex;align-items:center;gap:14px;margin-bottom:10px;flex-wrap:wrap;}',
      R + '.lk-await-av{width:40px;height:40px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;background:#8B5CF6;text-transform:uppercase;}',
      R + '.lk-await-info{flex:1;min-width:0;}',
      R + '.lk-await-name{font-size:14px;font-weight:600;}',
      R + '.lk-await-sub{font-size:12px;color:' + SLATE + ';margin-top:1px;}',
      R + '.lk-await-cta{font-family:' + F + ';font-size:12px;font-weight:600;color:' + V + ';background:' + VL + ';border:none;border-radius:8px;padding:8px 14px;cursor:pointer;flex-shrink:0;}',
      R + '.lk-await-cta:hover{background:' + VM + ';}',
      // composer
      R + '.lk-composer{flex-basis:100%;margin-top:10px;border-top:.5px solid ' + BORDER + ';padding-top:12px;display:none;}',
      R + '.lk-composer.open{display:block;}',
      R + '.lk-rec{display:flex;gap:8px;margin-bottom:10px;}',
      R + '.lk-rec button{font-family:' + F + ';font-size:12px;font-weight:600;border-radius:100px;padding:7px 14px;cursor:pointer;border:.5px solid ' + FOG + ';background:#fff;color:' + DUSK + ';}',
      R + '.lk-rec button.sel-yes{background:' + GREENL + ';border-color:' + GREEN + ';color:' + GREEN + ';}',
      R + '.lk-rec button.sel-no{background:#FDECEC;border-color:#E0726A;color:#C0392B;}',
      R + '.lk-ta{width:100%;font-family:' + F + ';font-size:13px;color:' + INK + ';border:.5px solid ' + FOG + ';border-radius:8px;padding:10px 12px;min-height:74px;resize:vertical;background:' + SNOW + ';}',
      R + '.lk-ta:focus{outline:none;border-color:' + V + ';background:#fff;}',
      R + '.lk-composer-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;}',
      // my review cards
      R + '.lk-review{background:#fff;border:.5px solid ' + BORDER + ';border-radius:12px;padding:16px 18px;margin-bottom:12px;}',
      R + '.lk-review-head{font-size:13px;color:' + SLATE + ';margin-bottom:9px;}',
      R + '.lk-review-head strong{color:' + INK + ';font-weight:600;}',
      R + '.lk-review-head .when{float:right;font-size:12px;}',
      R + '.lk-rec-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:' + GREEN + ';background:' + GREENL + ';border-radius:100px;padding:3px 10px;margin-bottom:8px;}',
      R + '.lk-rec-pill.no{color:#C0392B;background:#FDECEC;}',
      R + '.lk-review-body{font-size:13px;color:' + DUSK + ';line-height:1.6;}',
      R + '.lk-review-foot{margin-top:11px;padding-top:11px;border-top:.5px solid ' + BORDER + ';display:flex;gap:16px;}',
      R + '.lk-review-foot button{font-family:' + F + ';font-size:12px;font-weight:500;color:' + SLATE + ';background:none;border:none;cursor:pointer;padding:0;}',
      R + '.lk-review-foot button:hover{color:' + V + ';}',
      // settings
      R + '.lk-card{background:#fff;border:.5px solid ' + BORDER + ';border-radius:12px;padding:4px 20px;margin-bottom:16px;}',
      R + '.lk-set-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 0;border-bottom:.5px solid ' + BORDER + ';}',
      R + '.lk-set-row:last-child{border-bottom:none;}',
      R + '.lk-set-label{font-size:13px;font-weight:600;color:' + INK + ';}',
      R + '.lk-set-help{font-size:12px;color:' + SLATE + ';margin-top:2px;line-height:1.45;}',
      R + '.lk-input{font-family:' + F + ';font-size:13px;color:' + INK + ';background:' + SNOW + ';border:.5px solid ' + FOG + ';border-radius:8px;padding:8px 12px;width:220px;}',
      R + '.lk-input:focus{outline:none;border-color:' + V + ';background:#fff;}',
      R + '.lk-toggle{width:40px;height:23px;border-radius:100px;background:' + FOG + ';position:relative;cursor:pointer;transition:background .18s;border:none;flex-shrink:0;}',
      R + '.lk-toggle::after{content:"";position:absolute;top:2.5px;left:2.5px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .18s;}',
      R + '.lk-toggle.on{background:' + V + ';}',
      R + '.lk-toggle.on::after{transform:translateX(17px);}',
      R + '.lk-save-bar{display:flex;justify-content:flex-end;margin:1.25rem 0 2rem;}',
      // #66 Phase 1 — "Open your storefront" card (shown to people without one).
      R + '.lk-sf{background:linear-gradient(135deg,#F3EBFF 0%,#FAF7FF 50%,#FFF4EC 100%);border:.5px solid ' + VM + ';border-radius:16px;padding:18px 20px;margin-bottom:1.5rem;display:flex;align-items:center;gap:16px;}',
      R + '.lk-sf-icon{width:46px;height:46px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + V + ';color:#fff;box-shadow:0 4px 14px rgba(96,2,238,.22);}',
      R + '.lk-sf-body{flex:1;min-width:0;}',
      R + '.lk-sf-title{font-size:15px;font-weight:600;letter-spacing:-.2px;}',
      R + '.lk-sf-sub{font-size:12.5px;color:' + DUSK + ';margin-top:3px;line-height:1.5;}',
      R + '.lk-sf-cta{font-family:' + F + ';font-size:12.5px;font-weight:600;color:#fff;background:#FF8D00;border:none;border-radius:9px;padding:9px 15px;cursor:pointer;flex-shrink:0;transition:opacity .12s;}',
      R + '.lk-sf-cta:hover{opacity:.9;}',
      R + '.lk-sf-form{flex-basis:100%;margin-top:12px;padding-top:14px;border-top:.5px solid ' + VM + ';display:none;}',
      R + '.lk-sf.open .lk-sf-form{display:block;}',
      R + '.lk-sf-label{font-size:12px;font-weight:600;color:' + INK + ';margin-bottom:7px;}',
      R + '.lk-sf-in{font-family:' + F + ';font-size:14px;color:' + INK + ';background:#fff;border:.5px solid ' + FOG + ';border-radius:9px;padding:10px 13px;width:100%;max-width:360px;}',
      R + '.lk-sf-in:focus{outline:none;border-color:' + V + ';}',
      R + '.lk-sf-foot{display:flex;gap:8px;margin-top:11px;}',
      // #66 Phase 2 — owner "switch back to storefront" strip.
      R + '.lk-sfr{display:flex;align-items:center;gap:13px;background:#fff;border:.5px solid ' + BORDER + ';border-radius:14px;padding:13px 16px;margin-bottom:1.5rem;}',
      R + '.lk-sfr-ic{width:38px;height:38px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + VL + ';color:' + V + ';}',
      R + '.lk-sfr-body{flex:1;min-width:0;}',
      R + '.lk-sfr-title{font-size:13.5px;font-weight:600;}',
      R + '.lk-sfr-sub{font-size:12px;color:' + SLATE + ';margin-top:2px;}',
      R + '.lk-sfr-cta{font-family:' + F + ';font-size:12.5px;font-weight:600;color:' + V + ';background:' + VL + ';border-radius:9px;padding:9px 14px;text-decoration:none;flex-shrink:0;transition:background .12s;}',
      R + '.lk-sfr-cta:hover{background:' + VM + ';}',
      R + '.lk-danger{color:#C0392B;}',
      R + '.lk-btn.danger{background:#fff;border:.5px solid #E8B4AE;color:#C0392B;}',
      R + '.lk-btn.danger:hover{background:#FDF0EE;}',
      // empty
      R + '.lk-empty{background:#fff;border:.5px dashed ' + FOG + ';border-radius:14px;padding:3rem 2rem;text-align:center;}',
      R + '.lk-empty-title{font-size:15px;font-weight:600;margin-bottom:5px;}',
      R + '.lk-empty-sub{font-size:13px;color:' + SLATE + ';margin-bottom:1.25rem;line-height:1.5;max-width:360px;margin:0 auto 1.25rem;}',
      R + '.lk-empty a,' + R + '.lk-link{color:' + V + ';font-weight:600;text-decoration:none;}',
      // toast
      '.lk-ac-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:' + V + ';color:#fff;font-family:' + F + ';font-size:13px;font-weight:500;padding:11px 18px;border-radius:10px;box-shadow:0 8px 28px rgba(96,2,238,.28);opacity:0;transition:all .28s ease;z-index:9999;}',
      '.lk-ac-toast.show{transform:translateX(-50%) translateY(0);opacity:1;}',
      // ── mobile (≤640px) ──
      '@media (max-width:640px){' +
        '#lokali-account{padding:1rem 0 2.5rem;}' +
        '#lokali-account .lk-band{flex-wrap:wrap;gap:12px;padding:18px;}' +
        '#lokali-account .lk-greet{font-size:18px;}' +
        '#lokali-account .lk-meta{font-size:12px;}' +
        '#lokali-account .lk-stats{margin-left:0;width:100%;justify-content:flex-start;gap:32px;margin-top:2px;}' +
        '#lokali-account .lk-sf{flex-wrap:wrap;gap:12px;padding:16px;}' +
        '#lokali-account .lk-sf-body{flex-basis:calc(100% - 62px);}' +
        '#lokali-account .lk-sf-cta{width:100%;margin-left:0;}' +
        '#lokali-account .lk-sfr{flex-wrap:wrap;}' +
        '#lokali-account .lk-sfr-body{flex-basis:calc(100% - 51px);}' +
        '#lokali-account .lk-sfr-cta{width:100%;text-align:center;}' +
        '#lokali-account .lk-seg-wrap{display:flex;width:100%;}' +
        '#lokali-account .lk-seg{flex:1;justify-content:center;padding:9px 6px;}' +
        '#lokali-account .lk-intro{font-size:12.5px;}' +
        '#lokali-account .lk-row{flex-wrap:wrap;}' +
        '#lokali-account .lk-row-info{flex-basis:calc(100% - 60px);}' +
        '#lokali-account .lk-row-actions{width:100%;margin-top:6px;}' +
        '#lokali-account .lk-row-actions .lk-btn.primary{flex:1;}' +
        '#lokali-account .lk-row-actions .lk-btn.ghost{display:none;}' +
        '#lokali-account .lk-set-row{flex-direction:column;align-items:stretch;gap:10px;}' +
        '#lokali-account .lk-input,#lokali-account select.lk-input{width:100%;}' +
        '#lokali-account .lk-review-head .when{float:none;display:block;margin-top:3px;}' +
        '#lokali-account .lk-await{gap:10px;}' +
        '#lokali-account .lk-await-cta{margin-left:52px;}' +
        '#lokali-account .lk-composer-foot{flex-wrap:wrap;}' +
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  function toast(msg) {
    var t = el('div', 'lk-ac-toast', esc(msg));
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 320); }, 2400);
  }

  // ── state ──────────────────────────────────────────────────
  var state = { account: null, saved: [], mine: [], awaiting: [], hasStorefront: false, storefrontName: '' };

  // ── data load ──────────────────────────────────────────────
  function loadAll() {
    var A = api();
    // #66 Phase 1 — also ask whether this person already owns a storefront, so
    // the "Open your storefront" card only shows to those who don't. vendors.me()
    // returns { data: { vendor } } for owners, { data: null } otherwise.
    var meP = (A.vendors && A.vendors.me)
      ? A.vendors.me().catch(function () { return { data: null }; })
      : Promise.resolve({ data: null });
    return Promise.all([
      A.account.get().catch(function () { return { data: null }; }),
      A.request('favorites', 'GET', '/favorites', null, true).catch(function () { return { data: [] }; }),
      A.reviews.mine().catch(function () { return { data: [] }; }),
      A.reviews.awaiting().catch(function () { return { data: [] }; }),
      meP
    ]).then(function (r) {
      state.account = (r[0] && r[0].data) || {};
      state.saved = arr(r[1] && r[1].data);
      state.mine = arr(r[2] && r[2].data);
      state.awaiting = arr(r[3] && r[3].data);
      var v = r[4] && r[4].data && r[4].data.vendor;
      state.hasStorefront = !!(v && v.id != null);
      state.storefrontName = (v && (v.business_name || v.name)) || '';
      // 58k-D3 — founding members lose their spot permanently on delete (the
      // counter is increment-only; a forfeited slot never reopens). Surface it
      // in the delete-confirm box only to actual founders.
      state.isFounding = !!(v && v.is_founding_member);
    });
  }

  // ── render: shell ──────────────────────────────────────────
  function currentPane() {
    var h = (location.hash || '').replace('#', '').toLowerCase();
    return PANES.indexOf(h) >= 0 ? h : 'saved';
  }

  function render(mount) {
    var acc = state.account || {};
    var name = acc.first_name || 'there';
    var areaBits = [];
    if (acc.region) areaBits.push(esc(acc.region));
    if (acc.created_at) areaBits.push('Member since ' + monthYear(acc.created_at));

    mount.innerHTML = '';

    // band
    var band = el('div', 'lk-band');
    band.appendChild(avatarNode(acc, 'lk-avatar')); // #76 preset avatar (falls back to initials)
    var who = el('div');
    who.appendChild(el('div', 'lk-greet', 'Hi, ' + esc(name)));
    who.appendChild(el('div', 'lk-meta', areaBits.join(' · ')));
    band.appendChild(who);
    var stats = el('div', 'lk-stats');
    stats.appendChild(el('div', null, '<div class="lk-stat-num">' + state.saved.length + '</div><div class="lk-stat-lbl">Saved</div>'));
    stats.appendChild(el('div', null, '<div class="lk-stat-num">' + state.mine.length + '</div><div class="lk-stat-lbl">Reviews</div>'));
    band.appendChild(stats);
    mount.appendChild(band);

    // #66 — this is the person's home. People without a storefront get the
    // "open one (free)" card (Phase 1); owners get a switch-back-to-storefront
    // strip (Phase 2 identity switcher, person side).
    if (!state.hasStorefront) mount.appendChild(renderStorefrontCTA());
    else mount.appendChild(renderStorefrontReturn());

    // segmented
    var pane = currentPane();
    var seg = el('div', 'lk-seg-wrap');
    [['saved', 'Saved', state.saved.length], ['reviews', 'Reviews', state.mine.length], ['settings', 'Settings', null]].forEach(function (s) {
      var b = el('button', 'lk-seg' + (pane === s[0] ? ' is-active' : ''));
      b.innerHTML = esc(s[1]) + (s[2] != null ? ' <span class="lk-seg-count">' + s[2] + '</span>' : '');
      b.addEventListener('click', function () { location.hash = s[0]; show(s[0]); });
      seg.appendChild(b);
    });
    mount.appendChild(seg);

    // panes
    mount.appendChild(renderSaved());
    mount.appendChild(renderReviews());
    mount.appendChild(renderSettings());

    show(pane);
  }

  function show(pane) {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    PANES.forEach(function (p) {
      var node = mount.querySelector('.lk-pane[data-pane="' + p + '"]');
      if (node) node.classList.toggle('is-active', p === pane);
    });
    var segs = mount.querySelectorAll('.lk-seg');
    var idx = PANES.indexOf(pane);
    for (var i = 0; i < segs.length; i++) segs[i].classList.toggle('is-active', i === idx);
  }

  // ── #66 Phase 1: "Open your storefront" card ───────────────
  // One login, one person, both capabilities: a shopper can open a storefront
  // and start selling without a second account. Confirm the business name →
  // account.openStorefront (server promotes role customer→vendor + creates the
  // vendors row) → hard-nav to the dashboard (re-boots as a vendor).
  var SF_REASONS = {
    name_required: 'Enter a name for your storefront.',
    admin_cannot_open: "This account can't open a storefront.",
    unauthorized: 'Please sign in again.'
  };
  function renderStorefrontCTA() {
    var card = el('div', 'lk-sf');
    card.appendChild(el('div', 'lk-sf-icon',
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M3 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 3 0"/><path d="M9 20v-6h6v6"/></svg>'));
    var body = el('div', 'lk-sf-body');
    body.appendChild(el('div', 'lk-sf-title', 'Open your storefront'));
    body.appendChild(el('div', 'lk-sf-sub', "You're all set up to shop. Selling on Lokali too? Open a storefront — it's free to start, and locals can find, contact, and review you."));
    card.appendChild(body);
    var cta = el('button', 'lk-sf-cta', 'Open your storefront — free');
    card.appendChild(cta);

    // Inline confirm form (business name).
    var form = el('div', 'lk-sf-form');
    form.appendChild(el('div', 'lk-sf-label', "What's your business called?"));
    var input = el('input', 'lk-sf-in'); input.type = 'text'; input.placeholder = 'e.g. Pancha Ventures'; input.maxLength = 120;
    form.appendChild(input);
    var foot = el('div', 'lk-sf-foot');
    var create = el('button', 'lk-btn primary', 'Create storefront');
    var cancel = el('button', 'lk-btn ghost', 'Cancel');
    foot.appendChild(create); foot.appendChild(cancel);
    form.appendChild(foot);
    card.appendChild(form);

    cta.addEventListener('click', function () {
      var opening = !card.classList.contains('open');
      card.classList.toggle('open', opening);
      if (opening) input.focus();
    });
    cancel.addEventListener('click', function () { card.classList.remove('open'); });
    function submit() {
      var name = (input.value || '').trim();
      if (!name) { toast(SF_REASONS.name_required); input.focus(); return; }
      create.disabled = true; create.textContent = 'Creating…';
      api().account.openStorefront(name).then(function (res) {
        var d = res && res.data;
        if (res && res.error) { create.disabled = false; create.textContent = 'Create storefront'; toast('Couldn’t open your storefront — please try again.'); return; }
        if (!d || d.ok !== true) {
          create.disabled = false; create.textContent = 'Create storefront';
          toast(SF_REASONS[d && d.reason] || 'Couldn’t open your storefront — please try again.');
          return;
        }
        // Keep the synchronous role cache honest so the header/menu paint as a
        // vendor immediately; the dashboard boot re-confirms via get_my_role().
        try {
          var c = JSON.parse(localStorage.getItem('LOKALI_ACCT_CACHE') || 'null') || {};
          c.role = 'vendor'; localStorage.setItem('LOKALI_ACCT_CACHE', JSON.stringify(c));
        } catch (e) {}
        toast('Storefront created — taking you to your dashboard…');
        setTimeout(function () { window.location.href = '/vendor-dashboard/dashboard'; }, 700);
      });
    }
    create.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    // Deep-link from the header "Become a Vendor" CTA (#66): land with the form
    // already open and focused so it reads as one continuous action.
    if ((location.hash || '').toLowerCase() === '#storefront') {
      card.classList.add('open');
      setTimeout(function () { input.focus(); }, 60);
    }
    return card;
  }

  // #66 Phase 2 — owners land here in their SHOPPING space; give them a one-click
  // switch back to their storefront (mirrors the header/sidebar switcher). Pure
  // navigation — one login, two spaces.
  function renderStorefrontReturn() {
    var strip = el('div', 'lk-sfr');
    strip.appendChild(el('div', 'lk-sfr-ic',
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M3 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 3 0"/><path d="M9 20v-6h6v6"/></svg>'));
    var body = el('div', 'lk-sfr-body');
    body.appendChild(el('div', 'lk-sfr-title', "You're in your shopping space"));
    body.appendChild(el('div', 'lk-sfr-sub', state.storefrontName
      ? ('Managing ' + esc(state.storefrontName) + '? Switch to your storefront.')
      : 'Switch to your storefront to manage your listing.'));
    strip.appendChild(body);
    var go = el('a', 'lk-sfr-cta', 'Go to storefront →');
    go.href = '/vendor-dashboard/dashboard';
    strip.appendChild(go);
    return strip;
  }

  // ── pane: Saved ────────────────────────────────────────────
  function renderSaved() {
    var pane = el('div', 'lk-pane'); pane.setAttribute('data-pane', 'saved');
    pane.appendChild(el('p', 'lk-intro', "Vendors you've saved to come back to. Tap the heart on any listing to add it here."));
    if (!state.saved.length) {
      pane.appendChild(emptyState('Nothing saved yet', 'When you find a vendor you like, tap the heart to keep them here for later.', 'Browse vendors', '/the-market'));
      return pane;
    }
    state.saved.forEach(function (row) { pane.appendChild(savedRow(row)); });
    return pane;
  }

  function savedRow(row) {
    var v = vendorOf(row);
    var vid = v.id != null ? v.id : row.vendors_id;
    var r = el('div', 'lk-row');
    var thumb = el('div', 'lk-thumb', esc(initials(vendorName(v)) || 'V'));
    thumbPhoto(thumb, v); // upgrade to the real profile photo when there is one
    r.appendChild(thumb);
    var info = el('div', 'lk-row-info');
    info.appendChild(el('div', 'lk-row-name', esc(vendorName(v))));
    var sub = el('div', 'lk-row-sub');
    var cat = vendorCat(v);
    sub.innerHTML = (cat ? '<span class="cat">' + esc(cat) + '</span>' : '') + (v.city ? (cat ? ' · ' : '') + esc(v.city) : '');
    info.appendChild(sub);
    r.appendChild(info);
    var actions = el('div', 'lk-row-actions');
    var view = el('button', 'lk-btn primary', 'View');
    view.addEventListener('click', function () { window.location.href = vendorHref(v); });
    var contact = el('button', 'lk-btn ghost', 'Contact');
    contact.addEventListener('click', function () { window.location.href = vendorHref(v); });
    var heart = el('button', 'lk-heart', '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>');
    heart.title = 'Remove from saved';
    heart.addEventListener('click', function () {
      heart.disabled = true;
      api().request('favorites', 'DELETE', '/favorites/' + encodeURIComponent(vid), null, true).then(function (res) {
        if (res && res.error) { heart.disabled = false; toast('Could not remove'); return; }
        state.saved = state.saved.filter(function (x) { return (vendorOf(x).id != null ? vendorOf(x).id : x.vendors_id) != vid; });
        r.style.transition = 'opacity .2s'; r.style.opacity = '0';
        setTimeout(function () { rerender(); toast('Removed from saved'); }, 180);
      });
    });
    actions.appendChild(view); actions.appendChild(contact); actions.appendChild(heart);
    r.appendChild(actions);
    return r;
  }

  // ── pane: Reviews ──────────────────────────────────────────
  function renderReviews() {
    var pane = el('div', 'lk-pane'); pane.setAttribute('data-pane', 'reviews');

    if (state.awaiting.length) {
      var ag = el('div', 'lk-group');
      ag.appendChild(el('div', 'lk-group-label', 'Awaiting your review'));
      ag.appendChild(el('p', 'lk-intro', 'You contacted these vendors. Sharing how it went helps other locals — and helps the vendor.'));
      state.awaiting.forEach(function (row) { ag.appendChild(awaitRow(row)); });
      pane.appendChild(ag);
    }

    var mg = el('div', 'lk-group');
    mg.appendChild(el('div', 'lk-group-label', 'Your reviews'));
    if (!state.mine.length) {
      if (!state.awaiting.length) {
        pane.appendChild(emptyState('No reviews yet', "Once you've contacted a vendor through Lokali, you can share how it went here.", 'Browse vendors', '/the-market'));
        return pane;
      }
      mg.appendChild(el('p', 'lk-intro', 'Reviews you write will appear here.'));
    } else {
      state.mine.forEach(function (row) { mg.appendChild(myReview(row)); });
    }
    pane.appendChild(mg);
    return pane;
  }

  function awaitRow(row) {
    var v = vendorOf(row);
    var vid = v.id != null ? v.id : row.vendors_id;
    var when = row.contacted_at || row.created_at || row.last_contacted_at;
    var r = el('div', 'lk-await');
    var av = el('div', 'lk-await-av', esc(initials(vendorName(v)) || 'V'));
    thumbPhoto(av, v);
    r.appendChild(av);
    var info = el('div', 'lk-await-info');
    info.appendChild(el('div', 'lk-await-name', esc(vendorName(v))));
    info.appendChild(el('div', 'lk-await-sub', when ? ('Contacted ' + esc(monthDay(when))) : 'You contacted this vendor'));
    r.appendChild(info);
    var cta = el('button', 'lk-await-cta', 'Write a review');
    r.appendChild(cta);

    // inline composer
    var comp = el('div', 'lk-composer');
    var rec = { val: null };
    var recRow = el('div', 'lk-rec');
    var yes = el('button', null, '👍 Would recommend');
    var no = el('button', null, '👎 Wouldn’t');
    yes.addEventListener('click', function () { rec.val = true; yes.className = 'sel-yes'; no.className = ''; });
    no.addEventListener('click', function () { rec.val = false; no.className = 'sel-no'; yes.className = ''; });
    recRow.appendChild(yes); recRow.appendChild(no);
    comp.appendChild(recRow);
    var ta = el('textarea', 'lk-ta'); ta.placeholder = 'How was your experience? (optional)';
    comp.appendChild(ta);
    var foot = el('div', 'lk-composer-foot');
    var cancel = el('button', 'lk-btn ghost', 'Cancel');
    var submit = el('button', 'lk-btn primary', 'Post review');
    cancel.addEventListener('click', function () { comp.classList.remove('open'); });
    submit.addEventListener('click', function () {
      if (rec.val == null) { toast('Pick recommend or not first'); return; }
      submit.disabled = true;
      api().reviews.create({ vendors_id: vid, is_recommended: rec.val, comment: ta.value || '' }).then(function (res) {
        submit.disabled = false;
        if (res && res.error) { toast(res.error || 'Could not post review'); return; }
        state.awaiting = state.awaiting.filter(function (x) { return (vendorOf(x).id != null ? vendorOf(x).id : x.vendors_id) != vid; });
        // optimistic local add so it shows under "Your reviews"
        state.mine.unshift({ id: (res.data && res.data.id), vendors_id: vid, vendor: v, is_recommended: rec.val, comment: ta.value || '', created_at: Date.now() });
        rerender(); toast('Thanks — your review is live');
      });
    });
    foot.appendChild(cancel); foot.appendChild(submit);
    comp.appendChild(foot);
    r.appendChild(comp);
    cta.addEventListener('click', function () { comp.classList.toggle('open'); });
    return r;
  }

  function myReview(row) {
    var v = vendorOf(row);
    var c = el('div', 'lk-review');
    var head = el('div', 'lk-review-head');
    head.innerHTML = 'You reviewed <strong>' + esc(vendorName(v)) + '</strong>' + (row.created_at ? '<span class="when">' + esc(monthYear(row.created_at)) + '</span>' : '');
    c.appendChild(head);
    var rec = !!row.is_recommended;
    c.appendChild(el('div', 'lk-rec-pill' + (rec ? '' : ' no'), (rec ? '✓ Would recommend' : 'Didn’t recommend')));
    if (row.comment) c.appendChild(el('div', 'lk-review-body', esc(row.comment)));
    var foot = el('div', 'lk-review-foot');
    var edit = el('button', null, 'Edit');
    var del = el('button', null, 'Delete');
    edit.addEventListener('click', function () { editReview(c, row); });
    del.addEventListener('click', function () {
      if (row.id == null) { toast('Can’t edit until reloaded'); return; }
      del.disabled = true;
      api().reviews.remove(row.id).then(function (res) {
        if (res && res.error) { del.disabled = false; toast('Could not delete'); return; }
        state.mine = state.mine.filter(function (x) { return x.id !== row.id; });
        rerender(); toast('Review deleted');
      });
    });
    foot.appendChild(edit); foot.appendChild(del);
    c.appendChild(foot);
    return c;
  }

  function editReview(card, row) {
    if (row.id == null) { toast('Can’t edit until reloaded'); return; }
    var rec = { val: !!row.is_recommended };
    card.innerHTML = '';
    var recRow = el('div', 'lk-rec');
    var yes = el('button', rec.val ? 'sel-yes' : null, '👍 Would recommend');
    var no = el('button', !rec.val ? 'sel-no' : null, '👎 Wouldn’t');
    yes.addEventListener('click', function () { rec.val = true; yes.className = 'sel-yes'; no.className = ''; });
    no.addEventListener('click', function () { rec.val = false; no.className = 'sel-no'; yes.className = ''; });
    recRow.appendChild(yes); recRow.appendChild(no);
    card.appendChild(recRow);
    var ta = el('textarea', 'lk-ta'); ta.value = row.comment || '';
    card.appendChild(ta);
    var foot = el('div', 'lk-composer-foot');
    var cancel = el('button', 'lk-btn ghost', 'Cancel');
    var save = el('button', 'lk-btn primary', 'Save');
    cancel.addEventListener('click', function () { rerender(); });
    save.addEventListener('click', function () {
      save.disabled = true;
      api().reviews.update(row.id, { is_recommended: rec.val, comment: ta.value || '' }).then(function (res) {
        if (res && res.error) { save.disabled = false; toast('Could not save'); return; }
        row.is_recommended = rec.val; row.comment = ta.value || '';
        rerender(); toast('Review updated');
      });
    });
    foot.appendChild(cancel); foot.appendChild(save);
    card.appendChild(foot);
  }

  // ── pane: Settings ─────────────────────────────────────────
  function renderSettings() {
    var acc = state.account || {};
    var pane = el('div', 'lk-pane'); pane.setAttribute('data-pane', 'settings');

    // Profile
    pane.appendChild(el('div', 'lk-group-label', 'Profile'));
    var pc = el('div', 'lk-card');
    var firstIn = setInput('First name', 'Shown on the reviews you leave.', acc.first_name || '');
    var lastIn = setInput('Last name', 'Only the initial is shown publicly.', acc.last_name || '');
    pc.appendChild(firstIn.row); pc.appendChild(lastIn.row);

    // #76 — avatar picker: the site's own icon set on soft-palette circles.
    var avatarSel = AVATAR_PRESETS[acc.avatar] ? acc.avatar : '';
    var avRow = el('div', 'lk-set-row');
    avRow.style.display = 'block';
    avRow.appendChild(el('div', 'lk-set-label', 'Avatar'));
    avRow.appendChild(el('div', 'lk-set-help', 'Pick one for your dashboard — or stay with your initials.'));
    var avGrid = el('div');
    avGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;';
    function avCircle(id) {
      var isInitials = id === '';
      var c = el('button');
      c.type = 'button';
      c.setAttribute('data-av', id);
      c.setAttribute('aria-label', isInitials ? 'Use my initials' : 'Avatar: ' + id);
      c.style.cssText = 'width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;font-family:"Plus Jakarta Sans",sans-serif;border:2px solid transparent;';
      if (isInitials) {
        c.style.background = '#6002EE';
        c.style.color = '#fff';
        c.style.font = '600 15px "Plus Jakarta Sans",sans-serif';
        c.textContent = (initials((acc.first_name || '') + ' ' + (acc.last_name || '')) || 'U').toUpperCase();
      } else {
        var p = AVATAR_PRESETS[id];
        c.style.background = p.bg;
        var ic = el('span');
        ic.style.cssText = 'display:inline-block;width:24px;height:24px;background:' + p.tint + ';' +
          '-webkit-mask:url("' + p.url + '") center / contain no-repeat;mask:url("' + p.url + '") center / contain no-repeat;';
        c.appendChild(ic);
      }
      function paint() { c.style.borderColor = (avatarSel === id) ? '#6002EE' : 'transparent'; }
      paint();
      c.addEventListener('click', function () {
        avatarSel = id;
        var kids = avGrid.querySelectorAll('button');
        for (var i = 0; i < kids.length; i++) kids[i].style.borderColor = (kids[i].getAttribute('data-av') === avatarSel) ? '#6002EE' : 'transparent';
      });
      return c;
    }
    avGrid.appendChild(avCircle(''));
    Object.keys(AVATAR_PRESETS).forEach(function (id) { avGrid.appendChild(avCircle(id)); });
    avRow.appendChild(avGrid);
    pc.appendChild(avRow);
    // email
    var emailRow = el('div', 'lk-set-row');
    emailRow.innerHTML = '<div><div class="lk-set-label">Email</div><div class="lk-set-help">' + esc(acc.email || 'Used for sign-in and reply notifications.') + ' Managed through your login.</div></div>';
    var manage = el('div', null);
    var manageBtn = el('button', 'lk-btn ghost', 'Manage sign-in');
    manageBtn.addEventListener('click', function () {
      if (window.LokaliAuth && typeof window.LokaliAuth.openAccountPanel === 'function') window.LokaliAuth.openAccountPanel();
      else toast('Manage your sign-in from the account menu');
    });
    manage.appendChild(manageBtn); emailRow.appendChild(manage);
    pc.appendChild(emailRow);
    var areaIn = setInput('Your area', "We'll surface vendors near you first.", acc.region || '');
    initAreaAutocomplete(areaIn.input); // #45 — Maps city autocomplete (free-text fallback)
    pc.appendChild(areaIn.row);
    pane.appendChild(pc);

    // Notifications
    pane.appendChild(el('div', 'lk-group-label', 'Notifications'));
    var nc = el('div', 'lk-card');
    var tgLetter = toggleRow('The Lokali Letter', 'New vendors and weekly local picks in your area. The good stuff — never spam.', acc.notif_letter !== false);
    var tgReplies = toggleRow('Vendor replies', 'Get an email when a vendor responds to an inquiry you sent.', acc.notif_vendor_replies !== false);
    var tgRemind = toggleRow('Review reminders', 'A gentle nudge to review a vendor a few days after you contact them.', acc.notif_review_reminders === true);
    nc.appendChild(tgLetter.row); nc.appendChild(tgReplies.row); nc.appendChild(tgRemind.row);
    pane.appendChild(nc);

    var bar = el('div', 'lk-save-bar');
    var saveBtn = el('button', 'lk-btn primary', 'Save changes');
    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      api().account.update({
        first_name: firstIn.input.value.trim(),
        last_name: lastIn.input.value.trim(),
        region: areaIn.input.value.trim(),
        avatar: avatarSel,
        notif_letter: tgLetter.get(),
        notif_vendor_replies: tgReplies.get(),
        notif_review_reminders: tgRemind.get()
      }).then(function (res) {
        saveBtn.disabled = false;
        if (res && res.error) { toast(res.error || 'Could not save'); return; }
        state.account.first_name = firstIn.input.value.trim();
        state.account.last_name = lastIn.input.value.trim();
        state.account.avatar = avatarSel;
        state.account.region = areaIn.input.value.trim();
        // refresh the header-band avatar in place
        var bandAv = document.querySelector('.lk-avatar');
        if (bandAv && bandAv.parentNode) bandAv.parentNode.replaceChild(avatarNode(state.account, 'lk-avatar'), bandAv);
        state.account.notif_letter = tgLetter.get();
        state.account.notif_vendor_replies = tgReplies.get();
        state.account.notif_review_reminders = tgRemind.get();
        toast('Changes saved');
      });
    });
    bar.appendChild(saveBtn);
    pane.appendChild(bar);

    // Account
    pane.appendChild(el('div', 'lk-group-label lk-danger', 'Account'));
    var ac = el('div', 'lk-card');
    var outRow = el('div', 'lk-set-row');
    outRow.innerHTML = '<div><div class="lk-set-label">Sign out</div><div class="lk-set-help">Sign out of Lokali on this device.</div></div>';
    var outWrap = el('div'); var outBtn = el('button', 'lk-btn ghost', 'Sign out');
    outBtn.addEventListener('click', function () { try { api().clearToken(); } catch (e) {} window.location.href = '/login'; });
    outWrap.appendChild(outBtn); outRow.appendChild(outWrap); ac.appendChild(outRow);
    var delRow = el('div', 'lk-set-row');
    delRow.innerHTML = '<div><div class="lk-set-label lk-danger">Delete account</div><div class="lk-set-help">Permanently removes your account and saves. Reviews you wrote stay but lose your name. If you have a vendor listing, it and its reviews are deleted too. This can\'t be undone.</div></div>';
    var delWrap = el('div'); var delBtn = el('button', 'lk-btn danger', 'Delete');
    delWrap.appendChild(delBtn); delRow.appendChild(delWrap); ac.appendChild(delRow);

    // 58a — inline type-to-confirm; calls the Vercel delete route (Stripe
    // cancel -> backend purge -> auth-user delete), then signs out. Brand surfaces
    // only (no-ink rule) — light card, violet text, danger accents.
    var confirmBox = el('div', 'lk-del-confirm');
    confirmBox.style.cssText = 'display:none;padding:14px 16px;margin-top:2px;border:1px solid #F3D6D6;border-radius:12px;background:#FDF7F7;';
    confirmBox.innerHTML = '<div class="lk-set-help" style="margin-bottom:8px;">Type <b>DELETE</b> to confirm. Your sign-in, saves and any vendor listing are removed immediately.</div>';
    // 58k-D3 — founders only: deleting permanently forfeits the founding spot.
    if (state.isFounding) {
      var foundWarn = el('div', 'lk-set-help');
      foundWarn.style.cssText = 'margin:-4px 0 10px;padding:8px 10px;border-radius:8px;background:#FBEFD6;color:#9A6B00;font-weight:600;';
      foundWarn.textContent = 'Heads up — you’re a founding member. Deleting permanently retires your founding spot and its lifetime pricing. It can’t be undone or reclaimed.';
      confirmBox.appendChild(foundWarn);
    }
    var confirmIn = el('input', 'lk-input'); confirmIn.type = 'text'; confirmIn.placeholder = 'Type DELETE';
    confirmIn.style.cssText = 'max-width:200px;margin-right:8px;';
    var confirmBtn = el('button', 'lk-btn danger', 'Permanently delete');
    var cancelBtn = el('button', 'lk-btn ghost', 'Cancel');
    cancelBtn.style.marginLeft = '8px';
    confirmBox.appendChild(confirmIn); confirmBox.appendChild(confirmBtn); confirmBox.appendChild(cancelBtn);
    ac.appendChild(confirmBox);

    delBtn.addEventListener('click', function () {
      confirmBox.style.display = confirmBox.style.display === 'none' ? 'block' : 'none';
      if (confirmBox.style.display === 'block') confirmIn.focus();
    });
    cancelBtn.addEventListener('click', function () { confirmBox.style.display = 'none'; confirmIn.value = ''; });
    confirmBtn.addEventListener('click', function () {
      if (confirmIn.value.trim() !== 'DELETE') { toast('Type DELETE to confirm'); confirmIn.focus(); return; }
      var auth = window.LokaliAuth;
      if (!auth || typeof auth.token !== 'function' || !auth.isSignedIn()) {
        toast('Please reload and sign in again'); return;
      }
      confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting…';
      var base = (window.LOKALI_BILLING_BASE || 'https://lokali-api.vercel.app/api/lokali').replace(/\/$/, '');
      auth.token().then(function (jwt) {
        if (!jwt) throw new Error('not_signed_in');
        return fetch(base + '/account/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
          body: JSON.stringify({ confirm: 'DELETE' })
        });
      }).then(function (res) {
        if (!res.ok) return res.json().catch(function () { return {}; }).then(function (b) { throw new Error(b && b.error ? b.error : 'delete_failed'); });
        // Account is gone server-side; kill local state and the (now-dead) session.
        try { api().clearToken(); } catch (e) {}
        var bye = function () { window.location.href = '/'; };
        try { auth.signOut().then(bye, bye); } catch (e) { bye(); }
      }).catch(function (err) {
        confirmBtn.disabled = false; confirmBtn.textContent = 'Permanently delete';
        var msg = (err && err.message) || '';
        toast(msg === 'billing_cleanup_failed'
          ? 'We couldn\'t close your subscription — try again in a minute or contact us.'
          : 'Couldn\'t delete your account — please try again or contact us.');
      });
    });
    pane.appendChild(ac);

    return pane;
  }

  function setInput(label, help, value) {
    var row = el('div', 'lk-set-row');
    var left = el('div', null, '<div class="lk-set-label">' + esc(label) + '</div><div class="lk-set-help">' + esc(help) + '</div>');
    var ctrl = el('div');
    var input = el('input', 'lk-input'); input.type = 'text'; input.value = value || '';
    ctrl.appendChild(input);
    row.appendChild(left); row.appendChild(ctrl);
    return { row: row, input: input };
  }

  function toggleRow(label, help, on) {
    var row = el('div', 'lk-set-row');
    var left = el('div', null, '<div class="lk-set-label">' + esc(label) + '</div><div class="lk-set-help">' + esc(help) + '</div>');
    var ctrl = el('div');
    var tg = el('button', 'lk-toggle' + (on ? ' on' : ''));
    tg.addEventListener('click', function () { tg.classList.toggle('on'); });
    ctrl.appendChild(tg);
    row.appendChild(left); row.appendChild(ctrl);
    return { row: row, get: function () { return tg.classList.contains('on'); } };
  }

  function emptyState(title, sub, ctaText, ctaHref) {
    var e = el('div', 'lk-empty');
    e.appendChild(el('div', 'lk-empty-title', esc(title)));
    e.appendChild(el('div', 'lk-empty-sub', esc(sub)));
    var a = el('a', 'lk-btn primary'); a.href = ctaHref; a.textContent = ctaText;
    a.style.textDecoration = 'none'; a.style.display = 'inline-block';
    e.appendChild(a);
    return e;
  }

  // ── boot ───────────────────────────────────────────────────
  function rerender() { var m = document.getElementById(MOUNT_ID); if (m) render(m); }

  function init() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    injectCSS();
    if (!hasToken()) {
      mount.innerHTML = '<div class="lk-empty"><div class="lk-empty-title">Sign in to your account</div>' +
        '<div class="lk-empty-sub">View your saved vendors, reviews, and settings.</div>' +
        '<a class="lk-btn primary" style="text-decoration:none;display:inline-block" href="/login">Sign in</a></div>';
      return;
    }
    mount.innerHTML = '<div class="lk-empty"><div class="lk-empty-title">Loading your account…</div></div>';
    loadAll().then(function () { render(mount); });
    window.addEventListener('hashchange', function () { show(currentPane()); });
  }

  function whenReady(cb) {
    var tries = 0;
    (function poll() {
      if (window.LokaliAPI && window.LokaliAPI.account && window.LokaliAPI.reviews) { cb(); return; }
      if (tries++ > 100) return;
      setTimeout(poll, 100);
    })();
  }

  function start() { whenReady(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.LokaliAccount = { reload: function () { return loadAll().then(rerender); } };
})();
