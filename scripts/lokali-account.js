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
 * favorites namespaces). Auth via the Supabase session; shows a sign-in prompt when
 * signed out. Keeps the Webflow page to just an empty <div id="lokali-account">.
 */
(function () {
  'use strict';

  var MOUNT_ID = 'lokali-account';
  var PANES = ['badges', 'saved', 'reviews', 'settings'];

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
  // Published for lokali-auth-nav.js so the header chip can paint the same
  // preset art (#79) without duplicating the map.
  window.LOKALI_AVATAR_PRESETS = AVATAR_PRESETS;

  // Keep the header's acct cache in step so the chip shows the avatar on every
  // page, not just after visiting the hub.
  function syncAcctCacheAvatar(av) {
    try {
      var raw = localStorage.getItem('LOKALI_ACCT_CACHE');
      var o = raw ? JSON.parse(raw) : null;
      if (o && typeof o === 'object') { o.avatar = av || ''; localStorage.setItem('LOKALI_ACCT_CACHE', JSON.stringify(o)); }
    } catch (e) {}
  }
  // #103b — stash the admin flag so the header (lokali-auth-nav.js) can hide the
  // "Open your storefront" CTA on the admin account, which can never open one
  // (admin_open_storefront returns admin_cannot_open). Merge-write, like the
  // avatar sync — never clobber role/name/etc.
  function syncAcctCacheAdmin(isAdmin) {
    try {
      var raw = localStorage.getItem('LOKALI_ACCT_CACHE');
      var o = raw ? JSON.parse(raw) : null;
      if (o && typeof o === 'object') { o.is_admin = !!isAdmin; localStorage.setItem('LOKALI_ACCT_CACHE', JSON.stringify(o)); }
    } catch (e) {}
  }

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
    4: 'Children & Education', 5: 'Events & Entertainment', 6: 'Food',
    7: 'Health & Wellness', 8: 'Home & Property', 9: 'Professional Services'
  };
  function vendorCat(v) {
    var c = v && (v.category || v.category_name);
    if (c) return c;
    var id = v && (Array.isArray(v.categories_id) ? v.categories_id[0] : v.categories_id);
    return id != null ? (CAT_NAMES[id] || '') : '';
  }

  // Vendor profile photo, sanitized (same guard as the sidebar chip) — used to
  // upgrade the initials thumbs to the real photo when one exists.
  function vendorPhotoUrl(v) {
    var s = v && (v.profile_photo || v.photo || v.logo);
    if (!s || typeof s !== 'string') return '';
    s = s.trim();
    if (/[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    // Full URL (Supabase Storage / Webflow CDN) only — a leading-slash relative
    // path is a legacy Xano-era /vault upload that can no longer resolve
    // (XANO-DECOMM 2026-07-24), so it renders as the initials thumb instead.
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
  var _areaACCleanup = null; // tears down the previous AC instance's dropdown + window listeners
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
    // Every rerender() builds a fresh input → a fresh instance; without teardown
    // each one leaves a permanent dropdown node + capture-phase window listeners.
    if (_areaACCleanup) _areaACCleanup();
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    _areaACCleanup = function () {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
      if (dd && dd.parentNode) dd.parentNode.removeChild(dd);
      dd = null;
    };
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
      R + '.lk-band{background:#fff;border:.5px solid ' + BORDER + ';border-radius:16px;padding:22px 24px;display:flex;align-items:center;gap:16px;margin-bottom:1.5rem;}',
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
      // #39 orange → light violet (Francesca 2026-07-31: with the storefront CTA
      // already orange, two oranges on one screen was too aggressive — the CTA
      // keeps the action color, the active tab goes soft brand violet).
      R + '.lk-seg.is-active{background:#F3EBFF;color:#6002EE;}',
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
      R + '.lk-sf{background:#fff;border:.5px solid ' + BORDER + ';border-radius:16px;padding:18px 20px;margin-bottom:1.5rem;display:flex;flex-wrap:wrap;align-items:center;gap:16px;}',
      R + '.lk-sf-icon{width:46px;height:46px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + V + ';color:#fff;box-shadow:0 4px 14px rgba(96,2,238,.22);}',
      R + '.lk-sf-body{flex:1;min-width:0;}',
      R + '.lk-sf-title{font-size:15px;font-weight:600;letter-spacing:-.2px;}',
      R + '.lk-sf-sub{font-size:12.5px;color:' + DUSK + ';margin-top:3px;line-height:1.5;}',
      R + '.lk-sf-cta{font-family:' + F + ';font-size:12.5px;font-weight:600;color:#fff;background:#FF8D00;border:none;border-radius:9px;padding:9px 15px;cursor:pointer;flex-shrink:0;transition:opacity .12s;}',
      R + '.lk-sf-cta:hover{opacity:.9;}',
      R + '.lk-sf-form{flex-basis:100%;margin-top:12px;padding-top:14px;border-top:.5px solid ' + VM + ';display:none;}',
      R + '.lk-sf.open .lk-sf-form{display:block;}',
      R + '.lk-sf.open .lk-sf-cta{display:none;}',
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
      '}',
      // ── gamification badge cards (Explorer / Milestones / Scout / Connector).
      // Status-only, gold = earned. Palette + shapes from the design reference.
      R + '.lkg-card{background:#fff;border:.5px solid ' + BORDER + ';border-radius:10px;padding:1.75rem;margin-top:1.75rem;font-family:' + F + ';}',
      R + '.lkg-head{display:flex;align-items:center;gap:14px;margin-bottom:4px;}',
      R + '.lkg-head-text{flex:1;min-width:0;}',
      R + '.lkg-eyebrow{font-size:11px;font-weight:700;color:' + V + ';text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;}',
      R + '.lkg-title{font-size:19px;font-weight:700;letter-spacing:-.3px;color:' + INK + ';}',
      R + '.lkg-sub{font-size:13px;color:' + DUSK + ';margin-top:4px;line-height:1.5;}',
      R + '.lkg-bar{display:flex;gap:4px;margin:1.4rem 0 8px;}',
      R + '.lkg-seg{flex:1;height:10px;border-radius:100px;background:#EEEDF6;}',
      R + '.lkg-seg.done{background:' + V + ';}',
      R + '.lkg-seg.next{background:#FFF0E6;box-shadow:inset 0 0 0 1.5px #FF6B00;}',
      R + '.lkg-count{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1.4rem;}',
      R + '.lkg-count-main{font-size:13px;font-weight:600;color:' + INK + ';}',
      R + '.lkg-count-main span{color:' + SLATE + ';font-weight:500;}',
      R + '.lkg-hint{font-size:12px;color:' + SLATE + ';}',
      R + '.lkg-hint.almost{color:#FF6B00;font-weight:600;}',
      R + '.lkg-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      R + '.lkg-chip{display:flex;align-items:center;gap:10px;border:.5px solid ' + BORDER + ';border-radius:8px;padding:10px 12px;font-size:13px;text-decoration:none;transition:all .12s;}',
      R + '.lkg-chip .ico{width:26px;height:26px;border-radius:7px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}',
      R + '.lkg-chip.done{background:' + SNOW + ';}',
      R + '.lkg-chip.done .ico{background:' + GREENL + ';color:' + GREEN + ';}',
      R + '.lkg-chip.done .nm{color:' + DUSK + ';}',
      R + '.lkg-chip.todo{background:#fff;cursor:pointer;}',
      R + '.lkg-chip.todo .ico{background:' + VL + ';color:' + V + ';}',
      R + '.lkg-chip.todo:hover{border-color:' + V + ';}',
      R + '.lkg-chip.todo:hover .go{opacity:1;transform:translateX(0);}',
      R + '.lkg-chip.highlight{border-color:#FF6B00;background:#FFF0E6;}',
      R + '.lkg-chip.highlight .ico{background:#fff;color:#FF6B00;}',
      R + '.lkg-chip.highlight .go{opacity:1;transform:none;color:#FF6B00;}',
      R + '.lkg-chip .nm{flex:1;font-weight:500;color:' + INK + ';min-width:0;}',
      R + '.lkg-chip .go{font-size:11.5px;font-weight:600;color:' + V + ';opacity:0;transform:translateX(-3px);transition:all .15s;flex-shrink:0;}',
      R + '.lkg-foot{display:flex;align-items:center;gap:12px;margin-top:1.4rem;padding-top:1.25rem;border-top:.5px solid ' + BORDER + ';}',
      R + '.lkg-dot{width:40px;height:40px;border-radius:50%;flex-shrink:0;background:' + VL + ';color:' + V + ';display:flex;align-items:center;justify-content:center;}',
      R + '.lkg-dot.earned{background:' + V + ';color:#fff;box-shadow:0 3px 10px rgba(96,2,238,.28);}',
      // Per-badge colors (badges-guide alignment): peach / rose / green tints
      // pending, solid tone when earned. Violet stays the base.
      R + '.lkg-dot.c-peach{background:#FFF0E6;color:#B4530A;}',
      R + '.lkg-dot.c-peach.earned{background:#FF6B00;color:#fff;box-shadow:0 3px 10px rgba(255,107,0,.28);}',
      R + '.lkg-dot.c-rose{background:#FBE9F2;color:#A63D74;}',
      R + '.lkg-dot.c-rose.earned{background:#A63D74;color:#fff;box-shadow:0 3px 10px rgba(166,61,116,.28);}',
      R + '.lkg-dot.c-green{background:#E7F3EC;color:#3E7C5E;}',
      R + '.lkg-dot.c-green.earned{background:#3E7C5E;color:#fff;box-shadow:0 3px 10px rgba(62,124,94,.28);}',
      R + '.lkg-foot-text{font-size:12.5px;color:' + DUSK + ';line-height:1.5;}',
      R + '.lkg-foot-text strong{font-weight:600;color:' + INK + ';}',
      R + '.lkg-banner{display:flex;align-items:center;gap:14px;background:linear-gradient(120deg,' + VL + ' 0%,#FFF6F0 55%,#fff 90%);border:.5px solid ' + VM + ';border-radius:10px;padding:1.25rem 1.5rem;margin-top:1.75rem;font-family:' + F + ';}',
      R + '.lkg-banner .lkg-dot{width:48px;height:48px;}',
      R + '.lkg-banner+.lkg-card{margin-top:1rem;}',
      R + '.lkg-banner-title{font-size:15px;font-weight:700;color:' + INK + ';}',
      R + '.lkg-banner-sub{font-size:12.5px;color:' + DUSK + ';margin-top:2px;}',
      // milestones track
      R + '.lkg-track{position:relative;margin:1.75rem 0 .5rem;}',
      R + '.lkg-line{position:absolute;top:19px;left:70px;right:70px;height:4px;background:#EEEDF6;border-radius:100px;}',
      R + '.lkg-fill{height:100%;width:0;background:' + V + ';border-radius:100px;transition:width .4s ease;}',
      R + '.lkg-nodes{position:relative;display:flex;justify-content:space-between;}',
      R + '.lkg-node{display:flex;flex-direction:column;align-items:center;gap:7px;width:140px;text-align:center;}',
      R + '.lkg-node-dot{width:42px;height:42px;border-radius:50%;background:' + VL + ';border:1.5px dashed ' + VM + ';color:' + V + ';display:flex;align-items:center;justify-content:center;}',
      R + '.lkg-node.earned .lkg-node-dot{background:' + V + ';border:1.5px solid ' + V + ';color:#fff;box-shadow:0 3px 10px rgba(96,2,238,.26);}',
      R + '.lkg-node-dot.c-peach{background:#FFF0E6;border-color:#F6C6A5;color:#B4530A;}',
      R + '.lkg-node.earned .lkg-node-dot.c-peach{background:#FF6B00;border-color:#FF6B00;color:#fff;box-shadow:0 3px 10px rgba(255,107,0,.26);}',
      R + '.lkg-node-dot.c-rose{background:#FBE9F2;border-color:#EBBBD3;color:#A63D74;}',
      R + '.lkg-node.earned .lkg-node-dot.c-rose{background:#A63D74;border-color:#A63D74;color:#fff;box-shadow:0 3px 10px rgba(166,61,116,.26);}',
      R + '.lkg-node-name{font-size:12px;font-weight:600;color:' + SLATE + ';}',
      R + '.lkg-node.earned .lkg-node-name{color:' + INK + ';}',
      R + '.lkg-node-req{font-size:11px;color:' + SLATE + ';}',
      // badge preview + scout list
      R + '.lkg-preview{margin-top:1.5rem;padding-top:1.25rem;border-top:.5px solid ' + BORDER + ';}',
      R + '.lkg-preview-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:' + SLATE + ';margin-bottom:10px;}',
      R + '.lkg-mini{background:' + SNOW + ';border:.5px solid ' + BORDER + ';border-radius:8px;padding:12px 14px;}',
      R + '.lkg-mini-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;}',
      R + '.lkg-mini-ava{width:28px;height:28px;border-radius:50%;flex-shrink:0;background:#EEEDF6;font-size:11px;font-weight:500;color:' + DUSK + ';display:flex;align-items:center;justify-content:center;text-transform:uppercase;}',
      R + '.lkg-mini-name{font-size:12.5px;font-weight:600;color:' + INK + ';}',
      R + '.lkg-badge-pill{font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:100px;background:' + VL + ';color:' + V + ';}',
      R + '.lkg-badge-pill.c-peach{background:#FFF0E6;color:#B4530A;}',
      R + '.lkg-badge-pill.c-rose{background:#FBE9F2;color:#A63D74;}',
      R + '.lkg-mini-rec{display:inline-flex;align-items:center;font-size:11px;font-weight:600;color:' + GREEN + ';margin-bottom:4px;}',
      R + '.lkg-mini-body{font-size:12px;color:' + DUSK + ';line-height:1.5;}',
      R + '.lkg-hero{display:flex;align-items:center;gap:14px;margin-top:1.5rem;}',
      R + '.lkg-hero .lkg-node-dot,' + R + '.lkg-hero .lkg-dot{width:48px;height:48px;}',
      R + '.lkg-hero-count{font-size:15px;font-weight:700;color:' + INK + ';}',
      R + '.lkg-hero-sub{font-size:12px;color:' + SLATE + ';margin-top:2px;}',
      R + '.lkg-list{margin-top:1.25rem;padding-top:.25rem;border-top:.5px solid ' + BORDER + ';}',
      R + '.lkg-lrow{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:.5px solid ' + BORDER + ';font-size:13px;}',
      R + '.lkg-lrow:last-child{border-bottom:none;padding-bottom:2px;}',
      R + '.lkg-lrow .vn{flex:1;font-weight:500;color:' + INK + ';min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      R + '.lkg-lrow .ord{font-size:10.5px;font-weight:700;color:' + V + ';background:' + VL + ';border-radius:100px;padding:2px 8px;flex-shrink:0;}',
      R + '.lkg-lrow .dt{font-size:11.5px;color:' + SLATE + ';width:60px;text-align:right;flex-shrink:0;}',
      '@media (max-width:560px){#lokali-account .lkg-grid{grid-template-columns:1fr;}#lokali-account .lkg-line{left:50px;right:50px;}}'
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
  var state = { account: null, saved: [], mine: [], awaiting: [], hasStorefront: false, storefrontName: '', admin: null, badges: null };

  // ── #96-SUGGEST: admin data (Francesca's admin home lives on /account — no
  // vendor account needed). Server-enforced: admin_overview() and
  // list_subcategory_suggestions() are is_admin()-gated, so for every
  // non-admin session (and on stale cached clients) this resolves
  // null and the panel simply never exists.
  function fetchAdminData() {
    var sapi = window.LokaliSupabaseAPI;
    if (!sapi || !sapi.admin || !sapi.subcategories ||
        typeof sapi.admin.overview !== 'function' ||
        typeof sapi.subcategories.adminList !== 'function') return Promise.resolve(null);
    return Promise.all([sapi.admin.overview(), sapi.subcategories.adminList()]).then(function (rs) {
      var ov = rs[0] && rs[0].data;
      var ql = rs[1] && rs[1].data;
      if (!ov || ov.ok !== true) return null; // not an admin
      return { overview: ov, queue: (ql && ql.ok === true && Array.isArray(ql.items)) ? ql.items : [] };
    }).catch(function () { return null; });
  }

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
      meP,
      fetchAdminData(), // #96-SUGGEST — null for everyone but the admin
      // Gamification badge state (guarded: stale adapter caches lack the group)
      (A.gamification && typeof A.gamification.badges === 'function')
        ? A.gamification.badges().catch(function () { return { data: null }; })
        : Promise.resolve({ data: null })
    ]).then(function (r) {
      var bd = r[6] && r[6].data;
      state.badges = (bd && bd.ok === true) ? bd : null;
      state.admin = r[5] || null;
      state.account = (r[0] && r[0].data) || {};
      syncAcctCacheAvatar(state.account.avatar); // #79 — header chip stays in step
      // #103b — state.admin is set only when the is_admin()-gated admin_overview
      // RPC returned ok (server truth); publish it so the header hides the
      // storefront CTA this account can't use. False for everyone else.
      syncAcctCacheAdmin(!!state.admin || isAdminOnlyAccount());
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
    return PANES.indexOf(h) >= 0 ? h : 'badges';
  }

  // The dedicated Lokali-admin account (francesca@golokali.com) uses /account
  // purely to manage the site — no shopping / reviews / storefront surfaces
  // (Francesca 2026-07-20). Gated STRICTLY on this one email; every other
  // account (incl. francesca@panchaventures.com) renders exactly as before.
  // This is presentational only — the admin DATA is already is_admin()-gated
  // server-side, so the email check hides nothing sensitive, it just declutters
  // this one account's home.
  var ADMIN_ONLY_EMAIL = 'francesca@golokali.com';
  function isAdminOnlyAccount() {
    return String((state.account && state.account.email) || '').trim().toLowerCase() === ADMIN_ONLY_EMAIL;
  }

  // #103b — the header "Open your storefront" CTA is hidden by lokali-auth-nav.js
  // off the cached is_admin flag, but that flag isn't cached until this page has
  // run once (fresh/incognito session = the CTA would flash on first /account
  // view). Hide it directly here too, so the admin's own console never shows a
  // button that admin_open_storefront refuses. Same scope + matcher as auth-nav.
  function hideHeaderStorefrontCTA() {
    try {
      var scopes = document.querySelectorAll('.header-wrapper, #lok-mnav-panel');
      for (var s = 0; s < scopes.length; s++) {
        var links = scopes[s].querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
          var a = links[i];
          var href = (a.getAttribute('href') || '').split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
          var txt = (a.textContent || '').trim().toLowerCase();
          if (href === '/sign-up' || txt === 'become a vendor' || /^open (a|your|my) storefront$/.test(txt)) {
            a.style.setProperty('display', 'none', 'important');
          }
        }
      }
    } catch (e) {}
  }

  function render(mount) {
    var acc = state.account || {};
    var name = acc.first_name || 'there';
    var areaBits = [];
    if (acc.region) areaBits.push(esc(acc.region));
    if (acc.created_at) areaBits.push('Member since ' + monthYear(acc.created_at));

    mount.innerHTML = '';

    if (isAdminOnlyAccount()) hideHeaderStorefrontCTA(); // #103b — no dead storefront button on the admin console

    // Admin-only home: strip everything customer-facing, show the management
    // panel + a sign-out, and stop before any shopping/review UI is built.
    if (isAdminOnlyAccount()) { renderAdminHome(mount, acc, name); return; }

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

    // #96-SUGGEST — the Lokali admin panel (overview + specialty-suggestion
    // queue). Renders only when the is_admin-gated data actually loaded.
    if (state.admin) mount.appendChild(renderAdminPanel());

    // #66 — this is the person's home. People without a storefront get the
    // "open one (free)" card (Phase 1); owners get a switch-back-to-storefront
    // strip (Phase 2 identity switcher, person side).
    if (!state.hasStorefront) mount.appendChild(renderStorefrontCTA());
    else mount.appendChild(renderStorefrontReturn());

    // segmented
    var pane = currentPane();
    var seg = el('div', 'lk-seg-wrap');
    [['badges', 'Badges', earnedBadgeCount()], ['saved', 'Saved', state.saved.length], ['reviews', 'Reviews', state.mine.length], ['settings', 'Settings', null]].forEach(function (s) {
      var b = el('button', 'lk-seg' + (pane === s[0] ? ' is-active' : ''));
      b.innerHTML = esc(s[1]) + (s[2] != null ? ' <span class="lk-seg-count">' + s[2] + '</span>' : '');
      b.addEventListener('click', function () { location.hash = s[0]; show(s[0]); });
      seg.appendChild(b);
    });
    mount.appendChild(seg);

    // panes
    mount.appendChild(renderBadges());
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

  // ── Admin-only home (francesca@golokali.com) ──────────────
  // Just the management panel + a sign-out. No stats, no storefront CTA, no
  // Saved/Reviews tabs or panes — none of the customer surfaces are built.
  function renderAdminHome(mount, acc, name) {
    injectAdminCSS(); // for the fallback note if the panel data isn't loaded

    var band = el('div', 'lk-band');
    band.appendChild(avatarNode(acc, 'lk-avatar'));
    var who = el('div');
    who.appendChild(el('div', 'lk-greet', 'Hi, ' + esc(name)));
    who.appendChild(el('div', 'lk-meta', 'Lokali admin'));
    band.appendChild(who);
    mount.appendChild(band);

    if (state.admin) {
      mount.appendChild(renderAdminPanel());
    } else {
      // Signed into this account but the is_admin-gated data didn't load — show
      // a note (never the shopping UI) so it isn't a blank page.
      var note = el('div', 'lk-admin');
      note.appendChild(el('p', 'lk-admin-sub',
        'Admin tools aren’t loading right now. Refresh the page — if it keeps happening, your admin access may need to be re-granted in Supabase.'));
      mount.appendChild(note);
    }

    var bar = el('div', 'lk-save-bar');
    var out = el('button', 'lk-btn ghost', 'Sign out');
    out.addEventListener('click', function () {
      // clearToken() only drops adapter caches — LokaliAuth.signOut() also ends
      // the Supabase session (and redirects itself), else /login bounces back in.
      if (window.LokaliAuth && window.LokaliAuth.signOut) { window.LokaliAuth.signOut(); return; }
      try { api().clearToken(); } catch (e) {}
      window.location.href = '/login';
    });
    bar.appendChild(out);
    mount.appendChild(bar);
  }

  // ── #96-SUGGEST: the Lokali admin panel ────────────────────
  var SUGG_LABEL_RE = /^[A-Za-z0-9&'’\-+/() ]+$/;
  function injectAdminCSS() {
    if (document.getElementById('lokali-account-admin-styles')) return;
    var s = document.createElement('style');
    s.id = 'lokali-account-admin-styles';
    s.textContent =
      ".lk-admin{background:#fff;border:1px solid #E4D6FB;border-radius:16px;padding:20px 22px;margin:0 0 18px;font-family:'Plus Jakarta Sans',sans-serif;}" +
      ".lk-admin-head{display:flex;align-items:center;gap:10px;margin-bottom:4px;}" +
      ".lk-admin-title{font-size:17px;font-weight:700;color:#1A1829;margin:0;}" +
      ".lk-admin-badge{font-size:10px;font-weight:700;letter-spacing:.08em;background:#6002EE;color:#fff;border-radius:100px;padding:3px 10px;}" +
      ".lk-admin-sub{font-size:12.5px;color:#6B6880;margin:0 0 14px;}" +
      ".lk-admin-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px;}" +
      ".lk-admin-stat{background:#F7F6FC;border-radius:12px;padding:10px 12px;}" +
      ".lk-admin-stat-num{font-size:20px;font-weight:700;color:#1A1829;}" +
      ".lk-admin-stat-lbl{font-size:11px;color:#8E8BA6;margin-top:2px;}" +
      ".lk-admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;}" +
      ".lk-admin-section{background:#FBFAFE;border:1px solid #EEEDF6;border-radius:12px;padding:16px 18px;}" +
      ".lk-admin-section-wide{grid-column:1/-1;}" +
      ".lk-admin-qtitle{font-size:14px;font-weight:700;color:#1A1829;margin:0 0 4px;display:flex;align-items:center;gap:8px;}" +
      ".lk-admin-qcount{font-size:10.5px;font-weight:600;background:#F3EBFF;color:#6002EE;border-radius:100px;padding:1px 8px;}" +
      ".lk-admin-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 0;border-top:.5px solid #EEEDF6;}" +
      ".lk-admin-row-meta{flex:1;min-width:170px;}" +
      ".lk-admin-row-l1{font-size:13.5px;font-weight:600;color:#1A1829;}" +
      ".lk-admin-row-l1 span{color:#8E8BA6;}" +
      ".lk-admin-row-l2{font-size:11.5px;color:#8E8BA6;}" +
      ".lk-admin-input{font-family:inherit;font-size:13px;padding:7px 10px;border:1px solid #C9BDE8;border-radius:8px;color:#1A1829;width:170px;}" +
      ".lk-admin-approve{font-family:inherit;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:8px;border:1px solid #A8DFC4;background:#EDFAF3;color:#1A6640;cursor:pointer;}" +
      ".lk-admin-decline{font-family:inherit;font-size:12.5px;padding:7px 14px;border-radius:8px;border:1px solid #E4E2F0;background:#F7F6FC;color:#6B6880;cursor:pointer;}" +
      ".lk-admin-empty{font-size:12.5px;color:#8E8BA6;padding:8px 0 2px;border-top:.5px solid #EEEDF6;}";
    document.head.appendChild(s);
  }

  function renderAdminPanel() {
    injectAdminCSS();
    var a = state.admin, ov = a.overview;
    var wrap = el('div', 'lk-admin');
    var head = el('div', 'lk-admin-head');
    head.appendChild(el('h3', 'lk-admin-title', 'Lokali admin'));
    head.appendChild(el('span', 'lk-admin-badge', 'ADMIN'));
    wrap.appendChild(head);
    wrap.appendChild(el('p', 'lk-admin-sub', 'Only you can see this panel.'));

    var stats = el('div', 'lk-admin-stats');
    var _pendingStatNum = null;
    [[ov.vendors_active, 'Active vendors'], [ov.vendors_public, 'On The Market'],
     [ov.users_total, 'Accounts'], [ov.subcategories_live, 'Tags live'],
     [ov.pending_suggestions, 'Suggestions pending']].forEach(function (t) {
      var tile = el('div', 'lk-admin-stat');
      var num = el('div', 'lk-admin-stat-num', esc(String(t[0] != null ? t[0] : '—')));
      tile.appendChild(num);
      tile.appendChild(el('div', 'lk-admin-stat-lbl', esc(t[1])));
      if (t[1] === 'Suggestions pending') _pendingStatNum = num;
      stats.appendChild(tile);
    });
    wrap.appendChild(stats);

    // F 2026-08-22: one line that answers "do I need to approve anything?" —
    // counts from admin_overview() now, plus the two own-RPC queues (creatives,
    // address flags) filled in as they load. Each count jumps to its section.
    var attn = el('div', 'lk-admin-attn');
    attn.setAttribute('data-lk-attn', '');
    attn.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:#FFF6E5;border:1px solid #FFE2A8;border-radius:12px;padding:10px 14px;margin:0 0 16px;font-size:13px;color:#6B4A00;';
    wrap.appendChild(attn);
    window.__lokAttn = { suggestions: a.queue.length, reports: (Number(ov.open_vendor_reports) || 0) + (Number(ov.open_review_reports) || 0), creatives: null, addresses: null };
    function paintAttn() {
      var c = window.__lokAttn; var parts = [];
      if (c.reports) parts.push(c.reports + (c.reports === 1 ? ' report' : ' reports'));
      if (c.suggestions) parts.push(c.suggestions + (c.suggestions === 1 ? ' tag suggestion' : ' tag suggestions'));
      if (c.creatives) parts.push(c.creatives + (c.creatives === 1 ? ' ad creative' : ' ad creatives'));
      if (c.addresses) parts.push(c.addresses + (c.addresses === 1 ? ' address flag' : ' address flags'));
      attn.innerHTML = '';
      if (!parts.length) { attn.style.background = '#EAFAF2'; attn.style.borderColor = '#BFE9D2'; attn.style.color = '#1A6640'; attn.appendChild(document.createTextNode('✅ Nothing needs your approval right now.')); return; }
      attn.style.background = '#FFF6E5'; attn.style.borderColor = '#FFE2A8'; attn.style.color = '#6B4A00';
      var s = document.createElement('strong'); s.textContent = 'Needs your attention: '; attn.appendChild(s);
      attn.appendChild(document.createTextNode(parts.join(' · ') + ' — all below. You also get an email within 5 minutes of anything new.'));
    }
    window.__lokPaintAttn = paintAttn;
    paintAttn();

    // Sections live in a responsive 2-col grid: quiet sections sit side by side
    // as compact cards; sections with queue rows span the full width (the rows
    // carry inputs/buttons and need the horizontal room).
    var grid = el('div', 'lk-admin-grid');
    wrap.appendChild(grid);

    var sugSec = el('div', 'lk-admin-section' + (a.queue.length ? ' lk-admin-section-wide' : ''));
    var qt = el('div', 'lk-admin-qtitle');
    qt.appendChild(document.createTextNode('Tag suggestions'));
    var qc = el('span', 'lk-admin-qcount', String(a.queue.length));
    qt.appendChild(qc);
    sugSec.appendChild(qt);
    sugSec.appendChild(el('p', 'lk-admin-sub', 'Approve with the wording customers should see — it goes live for everyone instantly; the vendor then tags the matching service or product with it.'));

    if (!a.queue.length) {
      sugSec.appendChild(el('div', 'lk-admin-empty', 'No suggestions waiting. New ones from vendors land here.'));
    }

    a.queue.forEach(function (item) {
      var row = el('div', 'lk-admin-row');
      var meta = el('div', 'lk-admin-row-meta');
      var l1 = el('div', 'lk-admin-row-l1');
      l1.textContent = '“' + item.label + '”';
      var l1cat = document.createElement('span');
      l1cat.textContent = ' — ' + (item.category_name || '');
      l1.appendChild(l1cat);
      var l2 = el('div', 'lk-admin-row-l2');
      l2.textContent = 'from ' + (item.vendor_name || 'a vendor') +
        (item.listing_name ? (' · for “' + item.listing_name + '”') : '');
      meta.appendChild(l1); meta.appendChild(l2);
      var input = document.createElement('input');
      input.type = 'text'; input.maxLength = 40; input.className = 'lk-admin-input';
      input.value = String(item.label || '').charAt(0).toUpperCase() + String(item.label || '').slice(1);
      var ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'lk-admin-approve'; ok.textContent = 'Approve';
      var no = document.createElement('button');
      no.type = 'button'; no.className = 'lk-admin-decline'; no.textContent = 'Decline';
      var act = function (approve) {
        var wording = String(input.value || '').replace(/\s+/g, ' ').trim();
        if (approve && (wording.length < 3 || wording.length > 40 ||
            !SUGG_LABEL_RE.test(wording) || !/[A-Za-z0-9]/.test(wording))) {
          l2.textContent = '3–40 characters — letters, numbers and simple punctuation.';
          l2.style.color = '#B3400F';
          return;
        }
        ok.disabled = true; no.disabled = true;
        window.LokaliSupabaseAPI.subcategories.adminReview(item.id, approve, approve ? wording : null).then(function (res) {
          var rd = res && res.data;
          if (rd && rd.ok) {
            row.style.opacity = '.45';
            row.style.pointerEvents = 'none';
            l2.textContent = approve
              ? ('Live as “' + (rd.label || wording) + '”' + (rd.applied_to_listing ? ' · applied to their listing' : ''))
              : 'Declined';
            l2.style.color = approve ? '#1A6640' : '#8E8BA6';
            var left = Math.max(0, parseInt(qc.textContent, 10) - 1);
            qc.textContent = String(left);
            if (_pendingStatNum) _pendingStatNum.textContent = String(left);
            // Reviewed rows leave the queue after the result has been read —
            // they don't linger dimmed for the rest of the session.
            setTimeout(function () {
              row.style.transition = 'opacity .4s';
              row.style.opacity = '0';
              setTimeout(function () {
                if (row.parentNode) row.parentNode.removeChild(row);
                if (left === 0) sugSec.appendChild(el('div', 'lk-admin-empty', 'All caught up — new suggestions from vendors land here.'));
              }, 420);
            }, 1800);
          } else {
            ok.disabled = false; no.disabled = false;
            l2.textContent = 'Couldn’t save — try again.';
            l2.style.color = '#B3400F';
          }
        }).catch(function () {
          ok.disabled = false; no.disabled = false;
          l2.textContent = 'Couldn’t save — try again.';
          l2.style.color = '#B3400F';
        });
      };
      ok.addEventListener('click', function () { act(true); });
      no.addEventListener('click', function () { act(false); });
      row.appendChild(meta); row.appendChild(input); row.appendChild(ok); row.appendChild(no);
      sugSec.appendChild(row);
    });
    grid.appendChild(sugSec);

    appendReportsSection(grid, ov);
    appendAddressFlagsSection(grid);   // #147
    appendSpotlightSection(grid, ov);
    appendSpotlightCreativesSection(grid);
    appendExitSurveySection(grid, ov);
    appendQrScansSection(grid);
    return wrap;
  }

  // ── #131: abuse reports in the admin panel ─────────────────
  // The filing half shipped long ago (storefront "Report" → vendor_reports;
  // vendor "flag review" → review_reports) but NOTHING ever read the queues —
  // admin_overview() didn't return them, this file never mentioned them, so a
  // scam report landed in a table only the SQL editor could see. Reports come
  // first in the panel on purpose: trust/safety outranks bookings and surveys.
  // Data ships in admin_overview(); resolve = admin_resolve_report() (both
  // is_admin()-gated server-side — this UI is convenience, not the gate).

  // #147 — vendors whose address resolved OUTSIDE every area they list (> 50 mi).
  // Its own RPC (admin_address_flags) — admin_overview() stays untouched.
  function appendAddressFlagsSection(wrap) {
    var API = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.vendors;
    if (!API || !API.adminAddressFlags) return;
    var host = el('div', 'lk-admin-section');
    wrap.appendChild(host);
    function draw(rows) {
      host.innerHTML = '';
      host.className = 'lk-admin-section' + (rows.length ? ' lk-admin-section-wide' : '');
      if (window.__lokAttn) { window.__lokAttn.addresses = rows.length; if (window.__lokPaintAttn) window.__lokPaintAttn(); }
      var t = el('div', 'lk-admin-qtitle');
      t.appendChild(document.createTextNode('Address flags'));
      t.appendChild(el('span', 'lk-admin-qcount', String(rows.length)));
      host.appendChild(t);
      host.appendChild(el('p', 'lk-admin-sub',
        'Vendors whose business address is more than 50 miles from every area they list. Nothing is blocked — this is your cue to reach out. Fixes itself when they update the address or their areas.'));
      if (!rows.length) { host.appendChild(el('div', 'lk-admin-empty', 'No out-of-area addresses right now.')); return; }
      rows.forEach(function (r) {
        var row = el('div', 'lk-admin-row');
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1');
        l1.textContent = (r.business_name || 'Unknown vendor') + ' — ' + [r.city, r.state].filter(Boolean).join(', ');
        var l2 = el('div', 'lk-admin-row-l2');
        l2.textContent = (r.nearest_miles != null ? ('~' + r.nearest_miles + ' mi from the nearest listed area') : 'distance unknown') +
          ' · lists: ' + (r.areas || '—') + (r.is_publish_ready ? ' · LIVE on The Market' : ' · not public yet') +
          (r.checked_at ? ' · ' + fmtSpotDay(r.checked_at) : '');
        meta.appendChild(l1); meta.appendChild(l2);
        row.appendChild(meta);
        if (r.slug) {
          var view = document.createElement('a'); view.className = 'lk-admin-btn'; view.textContent = 'View';
          view.href = '/' + encodeURIComponent(r.slug); view.target = '_blank'; view.rel = 'noopener';
          row.appendChild(view);
        }
        // #147b Accept — "I checked, they're fine": sticks to THIS address; a new
        // address goes back through the distance rule. Needs patch_address_accept.sql.
        if (API.adminAcceptAddress) {
          var acc = document.createElement('button'); acc.type = 'button'; acc.className = 'lk-admin-btn'; acc.textContent = 'Accept';
          acc.addEventListener('click', function () {
            acc.disabled = true; acc.textContent = 'Accepting…';
            API.adminAcceptAddress(r.id).then(function (res) {
              var d = res && res.data;
              if (!d || d.ok !== true) { acc.disabled = false; acc.textContent = 'Accept'; l2.textContent += ' · could not accept (' + ((d && d.reason) || (res && res.error && res.error.message) || 'error') + ')'; return; }
              row.remove();
              var cnt = t.querySelector('.lk-admin-qcount'); if (cnt) cnt.textContent = String(Math.max(0, parseInt(cnt.textContent, 10) - 1));
              if (window.__lokAttn && window.__lokAttn.addresses) { window.__lokAttn.addresses -= 1; if (window.__lokPaintAttn) window.__lokPaintAttn(); }
              if (!host.querySelector('.lk-admin-row')) host.appendChild(el('div', 'lk-admin-empty', 'No out-of-area addresses right now.'));
            }).catch(function () { acc.disabled = false; acc.textContent = 'Accept'; });
          });
          row.appendChild(acc);
        }
        host.appendChild(row);
      });
    }
    host.appendChild(el('div', 'lk-admin-empty', 'Loading…'));
    API.adminAddressFlags().then(function (res) {
      var d = res && res.data;
      if (!d || d.ok === false) { host.innerHTML = ''; host.appendChild(el('div', 'lk-admin-empty', 'Address flags unavailable (apply patch_vendor_address_geo.sql).')); return; }
      draw(d.flags || []);
    }).catch(function () { host.innerHTML = ''; host.appendChild(el('div', 'lk-admin-empty', 'Address flags unavailable.')); });
  }

  function appendReportsSection(wrap, ov) {
    var vRows = Array.isArray(ov.vendor_reports) ? ov.vendor_reports : [];
    var rRows = Array.isArray(ov.review_reports) ? ov.review_reports : [];
    var total = vRows.length + rRows.length;

    var sec = el('div', 'lk-admin-section' + (total ? ' lk-admin-section-wide' : ''));
    wrap.appendChild(sec);
    var t = el('div', 'lk-admin-qtitle');
    t.appendChild(document.createTextNode('Reports'));
    t.appendChild(el('span', 'lk-admin-qcount', String(total)));
    sec.appendChild(t);
    sec.appendChild(el('p', 'lk-admin-sub',
      'Customer reports of vendors, and vendor flags on reviews. Resolving here only clears the queue — deactivating a storefront stays a separate, deliberate step.'));

    if (!total) {
      sec.appendChild(el('div', 'lk-admin-empty', 'No open reports. New ones land here the moment they\u2019re filed.'));
      return;
    }

    var CAT_LABELS = { scam: 'Scam / fraud', not_real: 'Not a real business', misleading: 'Misleading', inappropriate: 'Inappropriate', wrong_area: 'Wrong area \u2014 not in this neighborhood', other: 'Other' };

    function reportRow(kind, r) {
      var row = el('div', 'lk-admin-row');
      var meta = el('div', 'lk-admin-row-meta');
      var l1 = el('div', 'lk-admin-row-l1');
      l1.textContent = (kind === 'vendor')
        ? ((CAT_LABELS[r.category] || r.category || 'Report') + ' \u2014 ' + (r.business_name || 'Unknown vendor'))
        : ('Review flagged \u2014 ' + (r.business_name || 'Unknown vendor') + (r.review_rating != null ? (' (' + r.review_rating + '\u2605 review)') : ''));
      var l2 = el('div', 'lk-admin-row-l2');
      l2.textContent = 'from ' + (r.reporter_email || 'unknown') + ' \u00b7 ' + fmtSpotDay(r.created_at);
      meta.appendChild(l1); meta.appendChild(l2);
      // The substance, textContent only (user free text, never markup). For a
      // review report BOTH halves matter — the flagged review is the evidence,
      // the reporter's reason is the accusation — so they render as separate
      // lines rather than one shadowing the other (harness catch 2026-08-16).
      if (r.review_comment) {
        var rq = el('div', 'lk-admin-row-l2');
        rq.style.cssText = 'margin-top:4px;color:#4A4761;font-style:italic;white-space:normal;';
        rq.textContent = 'review: \u201c' + r.review_comment + '\u201d';
        meta.appendChild(rq);
      }
      if (r.reason) {
        var q = el('div', 'lk-admin-row-l2');
        q.style.cssText = 'margin-top:4px;color:#4A4761;white-space:normal;';
        q.textContent = (r.review_comment ? 'their reason: ' : '') + '\u201c' + r.reason + '\u201d';
        if (!r.review_comment) q.style.fontStyle = 'italic';
        meta.appendChild(q);
      }
      row.appendChild(meta);

      if (r.slug) {
        var view = document.createElement('a');
        view.className = 'lk-admin-decline';
        view.textContent = 'View';
        view.href = '/' + encodeURIComponent(r.slug);
        view.target = '_blank'; view.rel = 'noopener';
        row.appendChild(view);
      }
      var up = document.createElement('button');
      up.type = 'button'; up.className = 'lk-admin-approve'; up.textContent = 'Uphold';
      var dis = document.createElement('button');
      dis.type = 'button'; dis.className = 'lk-admin-decline'; dis.textContent = 'Dismiss';
      var act = function (status) {
        up.disabled = true; dis.disabled = true;
        window.LokaliSupabaseAPI.reports.adminResolve(kind, r.id, status).then(function (res) {
          var rd = res && res.data;
          if (rd && rd.ok) {
            row.style.opacity = '.45';
            row.style.pointerEvents = 'none';
            l2.textContent = status === 'upheld'
              ? 'Upheld \u2014 if action is needed, deactivate the vendor from their row in Supabase or the storefront tools.'
              : 'Dismissed';
            l2.style.color = status === 'upheld' ? '#1A6640' : '#8E8BA6';
            var left = Math.max(0, parseInt(t.querySelector('.lk-admin-qcount').textContent, 10) - 1);
            t.querySelector('.lk-admin-qcount').textContent = String(left);
            setTimeout(function () {
              row.style.transition = 'opacity .4s';
              row.style.opacity = '0';
              setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, 420);
            }, 2400);
          } else {
            up.disabled = false; dis.disabled = false;
            l2.textContent = (rd && rd.reason === 'not_found_or_closed')
              ? 'Already resolved (another tab?) \u2014 refresh to update the list.'
              : 'Couldn\u2019t save \u2014 try again.';
            l2.style.color = '#B3400F';
          }
        }).catch(function () {
          up.disabled = false; dis.disabled = false;
          l2.textContent = 'Couldn\u2019t save \u2014 try again.';
          l2.style.color = '#B3400F';
        });
      };
      up.addEventListener('click', function () { act('upheld'); });
      dis.addEventListener('click', function () { act('dismissed'); });
      row.appendChild(up); row.appendChild(dis);
      return row;
    }

    vRows.forEach(function (r) { sec.appendChild(reportRow('vendor', r)); });
    rRows.forEach(function (r) { sec.appendChild(reportRow('review', r)); });
  }

  // ── #88: Spotlight bookings in the admin panel ─────────────
  // Who booked which window (name + email) so Francesca can reach out —
  // homepage-tier vendors get coordinated for the "Meet the vendor" feature
  // and The Neighborhood Edit shoutout. Data ships in admin_overview()
  // (is_admin-gated); all vendor text lands via textContent.
  function fmtSpotDay(iso) {
    // Windows are UTC-midnight-anchored — format in UTC or the shown date
    // slips a day for US timezones.
    try {
      return new Date(iso).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) { return String(iso || ''); }
  }

  // ── #100: exit survey in the admin panel ──────────────────
  // Why people deleted their account. Tallies first (the shape of churn), then
  // the raw recent answers — the free text is where the real signal is. Rows
  // are anonymous by construction (see patch_exit_survey.sql): no name, no
  // email, nothing that ties back to the deleted person.
  var EXIT_LABELS = {
    not_enough_customers: 'Not enough customers/leads',
    too_expensive: 'Too expensive',
    closing_business: 'Closing/pausing the business',
    not_right_fit: 'Not the right fit',
    too_hard_to_use: 'Too hard to use',
    found_another_platform: 'Found another platform',
    not_enough_vendors: 'Not enough vendors nearby',
    didnt_find_what_i_needed: 'Didn’t find what they needed',
    too_many_emails: 'Too many emails',
    privacy: 'Privacy',
    other: 'Something else',
    skipped: 'Skipped'
  };

  function appendExitSurveySection(wrap, ov) {
    var rows = Array.isArray(ov.exit_recent) ? ov.exit_recent : [];
    var tallies = (ov.exit_reasons && typeof ov.exit_reasons === 'object') ? ov.exit_reasons : {};
    var keys = Object.keys(tallies).sort(function (a, b) { return tallies[b] - tallies[a]; });

    var sec = el('div', 'lk-admin-section' + (rows.length ? ' lk-admin-section-wide' : ''));
    wrap.appendChild(sec);
    var t = el('div', 'lk-admin-qtitle');
    t.appendChild(document.createTextNode('Why people left'));
    t.appendChild(el('span', 'lk-admin-qcount', String(rows.length)));
    sec.appendChild(t);
    sec.appendChild(el('p', 'lk-admin-sub',
      'Answers from the delete-account survey — optional, so treat counts as a floor. ' +
      'Cancellations (dropping to Free) are surveyed by Stripe instead: Billing → Subscriptions → the subscription.'));

    if (!keys.length && !rows.length) {
      sec.appendChild(el('div', 'lk-admin-empty', 'Nobody has deleted their account yet.'));
      return;
    }

    if (keys.length) {
      var tally = el('div');
      tally.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 12px;';
      keys.forEach(function (k) {
        var chip = el('span');
        chip.style.cssText = 'font-size:12px;padding:4px 10px;border-radius:999px;' +
          'background:#F3EBFF;color:#5F51B8;font-weight:600;';
        chip.textContent = (EXIT_LABELS[k] || k) + ' · ' + tallies[k];
        tally.appendChild(chip);
      });
      sec.appendChild(tally);
    }

    rows.forEach(function (r) {
      var row = el('div', 'lk-admin-row');
      var meta = el('div', 'lk-admin-row-meta');
      var l1 = el('div', 'lk-admin-row-l1');
      l1.textContent = EXIT_LABELS[r.reason] || r.reason || 'Unknown';
      var l2 = el('div', 'lk-admin-row-l2');
      var bits = [];
      bits.push(r.was_vendor ? ('vendor' + (r.plan ? ' · ' + r.plan : '')) : 'shopper');
      if (typeof r.tenure_days === 'number') {
        bits.push(r.tenure_days < 1 ? 'same day'
          : r.tenure_days + ' day' + (r.tenure_days === 1 ? '' : 's') + ' with us');
      }
      if (r.created_at) bits.push(fmtSpotDay(r.created_at));
      l2.textContent = bits.join(' · ');
      meta.appendChild(l1); meta.appendChild(l2);
      if (r.comment) {
        var q = el('div', 'lk-admin-row-l2');
        q.style.cssText = 'margin-top:4px;color:#4A4761;font-style:italic;white-space:normal;';
        q.textContent = '“' + r.comment + '”';
        meta.appendChild(q);
      }
      row.appendChild(meta);
      sec.appendChild(row);
    });
  }

  // ── QR code scans (sql/patch_qr_scans.sql) ─────────────────
  // Scans of the printed codes (assets/golokali-qr-*.png — the square business
  // flyer first). lokali-qr-tracker.js records a row when a visitor lands with
  // utm_source=qr; this reads the is_admin()-gated admin_qr_scans() RPC.
  // Deliberately its OWN RPC + self-fetching section (same shape as
  // appendSpotlightCreativesSection): admin_overview() stays untouched.
  function appendQrScansSection(wrap) {
    var API = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.admin;
    if (!API || typeof API.qrScans !== 'function') return; // stale client cache: no-op
    var host = el('div', 'lk-admin-section');
    wrap.appendChild(host);

    API.qrScans().then(function (res) {
      var d = (res && res.data) || {};
      if (d.ok !== true) { if (host.parentNode) host.parentNode.removeChild(host); return; }  // not admin / patch not run yet

      var t = el('div', 'lk-admin-qtitle');
      t.appendChild(document.createTextNode('QR code scans'));
      t.appendChild(el('span', 'lk-admin-qcount', String(d.last_30d != null ? d.last_30d : 0)));
      host.appendChild(t);
      host.appendChild(el('p', 'lk-admin-sub',
        'Visits from your printed QR codes — counted once per visit when someone scans and lands on the site. The badge is the last 30 days.'));

      var stats = el('div', 'lk-admin-stats');
      [[d.today, 'Today'], [d.last_7d, 'Last 7 days'],
       [d.last_30d, 'Last 30 days'], [d.total, 'All time']].forEach(function (s) {
        var tile = el('div', 'lk-admin-stat');
        tile.appendChild(el('div', 'lk-admin-stat-num', esc(String(s[0] != null ? s[0] : '—'))));
        tile.appendChild(el('div', 'lk-admin-stat-lbl', esc(s[1])));
        stats.appendChild(tile);
      });
      host.appendChild(stats);

      var camps = Array.isArray(d.campaigns) ? d.campaigns : [];
      if (camps.length) host.className += ' lk-admin-section-wide';
      if (!camps.length) {
        host.appendChild(el('div', 'lk-admin-empty',
          'No scans yet — the first flyer scan lands here.'));
        return;
      }
      camps.forEach(function (c) {
        var row = el('div', 'lk-admin-row');
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1');
        l1.textContent = c.campaign === 'flyer' ? 'Square business flyer' : (c.campaign || 'unknown');
        var l2 = el('div', 'lk-admin-row-l2');
        l2.textContent = String(c.total || 0) + ' total · ' + String(c.last_30d || 0) + ' in 30d' +
          (c.last_scan ? ' · last ' + fmtSpotDay(c.last_scan) : '');
        meta.appendChild(l1); meta.appendChild(l2);
        row.appendChild(meta);
        host.appendChild(row);
      });
    }).catch(function () { if (host.parentNode) host.parentNode.removeChild(host); });
  }

  function appendSpotlightSection(wrap, ov) {
    var rows = Array.isArray(ov.spotlights) ? ov.spotlights : [];
    var waiting = ov.spotlight_waitlist_open;

    var sec = el('div', 'lk-admin-section' + (rows.length ? ' lk-admin-section-wide' : ''));
    wrap.appendChild(sec);
    var t = el('div', 'lk-admin-qtitle');
    t.appendChild(document.createTextNode('Spotlight bookings'));
    t.appendChild(el('span', 'lk-admin-qcount', String(rows.length)));
    sec.appendChild(t);
    sec.appendChild(el('p', 'lk-admin-sub',
      'Upcoming and live Spotlights — reach out to homepage vendors about their “Meet the vendor” feature and The Neighborhood Edit shoutout.' +
      (waiting ? (' ' + waiting + ' vendor' + (waiting === 1 ? ' is' : 's are') + ' on window waitlists.') : '')));

    if (!rows.length) {
      sec.appendChild(el('div', 'lk-admin-empty', 'No Spotlights booked yet. Paid bookings land here with contact details.'));
      return;
    }

    rows.forEach(function (b) {
      var row = el('div', 'lk-admin-row');
      var meta = el('div', 'lk-admin-row-meta');
      var l1 = el('div', 'lk-admin-row-l1');
      l1.textContent = b.business_name || 'Unknown vendor';
      var tierSpan = document.createElement('span');
      tierSpan.textContent = ' — ' + (b.tier === 'homepage' ? 'Homepage ($150)' : 'Category ($75)');
      l1.appendChild(tierSpan);
      var l2 = el('div', 'lk-admin-row-l2');
      l2.textContent = fmtSpotDay(b.starts_at) + ' – ' + fmtSpotDay(b.ends_at) +
        ' · ' + (b.status === 'active' ? 'LIVE NOW' : 'booked') +
        (b.source === 'admin' ? ' · comped' : '');
      if (b.status === 'active') l2.style.color = '#1A6640';
      meta.appendChild(l1); meta.appendChild(l2);
      row.appendChild(meta);
      if (b.email) {
        var mail = document.createElement('a');
        mail.className = 'lk-admin-decline';
        mail.style.textDecoration = 'none';
        mail.textContent = 'Email';
        mail.href = 'mailto:' + encodeURIComponent(b.email) +
          '?subject=' + encodeURIComponent('Your Lokali Spotlight');
        row.appendChild(mail);
      }
      if (b.slug) {
        var view = document.createElement('a');
        view.className = 'lk-admin-decline';
        view.style.textDecoration = 'none';
        view.textContent = 'View';
        view.href = '/' + encodeURIComponent(b.slug);
        view.target = '_blank';
        view.rel = 'noopener';
        row.appendChild(view);
      }
      sec.appendChild(row);
    });
  }

  // ── Spotlight ad creative review (patch_spotlight_creative.sql) ───────────
  // Vendor-uploaded homepage-Spotlight creative renders on OUR front page, so
  // it ships only after approval here. Deliberately fed by its OWN RPC
  // (admin_spotlight_creatives) rather than admin_overview() — that function
  // is read by the whole panel and redefining it to add keys is how the
  // exit-survey section went blank in production (2026-08-16).
  function appendSpotlightCreativesSection(wrap) {
    var API = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.marketing;
    if (!API || !API.adminCreatives) return;      // pre-phase-2 client: no-op
    var host = el('div', 'lk-admin-section');
    wrap.appendChild(host);

    function draw(rows) {
      host.innerHTML = '';
      host.className = 'lk-admin-section' + (rows.length ? ' lk-admin-section-wide' : '');
      var pending = rows.filter(function (r) { return r.status === 'pending'; }).length;
      if (window.__lokAttn) { window.__lokAttn.creatives = pending; if (window.__lokPaintAttn) window.__lokPaintAttn(); }
      var t = el('div', 'lk-admin-qtitle');
      t.appendChild(document.createTextNode('Spotlight ad creative'));
      t.appendChild(el('span', 'lk-admin-qcount', String(pending)));
      host.appendChild(t);
      host.appendChild(el('p', 'lk-admin-sub',
        'Custom images vendors submitted for their homepage Spotlight card. Until one is approved, their card shows their “Meet the vendor” profile instead.'));
      if (!rows.length) {
        host.appendChild(el('div', 'lk-admin-empty', 'Nothing submitted yet.'));
        return;
      }
      rows.forEach(function (c) {
        var row = el('div', 'lk-admin-row');
        if (c.image_url) {
          var thumb = document.createElement('img');
          thumb.src = c.image_url;
          thumb.alt = '';
          thumb.style.cssText = 'width:64px;height:64px;border-radius:8px;object-fit:cover;margin-right:12px;flex:none;';
          row.appendChild(thumb);
        }
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1');
        l1.textContent = c.business_name || 'Unknown vendor';
        if (c.headline) {
          var h = document.createElement('span');
          h.textContent = ' — “' + c.headline + '”';
          l1.appendChild(h);
        }
        var l2 = el('div', 'lk-admin-row-l2');
        l2.textContent = fmtSpotDay(c.starts_at) + ' – ' + fmtSpotDay(c.ends_at) +
          ' · ' + (c.status === 'pending' ? 'awaiting review'
                 : c.status === 'approved' ? 'APPROVED' : 'rejected') +
          (c.status === 'rejected' && c.review_note ? ' · ' + c.review_note : '');
        if (c.status === 'approved') l2.style.color = '#1A6640';
        meta.appendChild(l1); meta.appendChild(l2);
        row.appendChild(meta);

        if (c.status === 'pending') {
          var ok = document.createElement('button');
          ok.type = 'button'; ok.className = 'lk-admin-approve'; ok.textContent = 'Approve';
          ok.onclick = function () { review(c.id, 'approved', null, ok); };
          row.appendChild(ok);
          var no = document.createElement('button');
          no.type = 'button'; no.className = 'lk-admin-decline'; no.textContent = 'Reject';
          no.onclick = function () {
            var note = window.prompt('Why? (the vendor sees this)', '');
            if (note === null) return;              // cancelled
            review(c.id, 'rejected', note, no);
          };
          row.appendChild(no);
        }
        if (c.slug) {
          var view = document.createElement('a');
          view.className = 'lk-admin-decline';
          view.style.textDecoration = 'none';
          view.textContent = 'View';
          view.href = '/' + encodeURIComponent(c.slug);
          view.target = '_blank';
          view.rel = 'noopener';
          row.appendChild(view);
        }
        host.appendChild(row);
      });
    }

    function review(id, status, note, btn) {
      btn.disabled = true;
      btn.textContent = '…';
      API.adminReview(id, status, note).then(function (res) {
        var d = res && res.data;
        if ((res && res.error) || !d || d.ok !== true) {
          btn.disabled = false;
          btn.textContent = status === 'approved' ? 'Approve' : 'Reject';
          return;
        }
        load();
      });
    }

    function load() {
      API.adminCreatives().then(function (res) {
        var d = (res && res.data) || {};
        if (d.ok !== true) return;                 // not admin / RPC missing
        draw(Array.isArray(d.creatives) ? d.creatives : []);
      });
    }
    load();
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
    var input = el('input', 'lk-sf-in'); input.type = 'text'; input.placeholder = 'e.g. Hazel & Fern Handmade'; input.maxLength = 120;
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
    // #113/#114 hardening: ANY exit that isn't success must reset the button —
    // a throw or rejection used to strand it at "Creating…" forever (and Cancel
    // didn't reset it either), which is exactly how the 2026-08-13 wiring bug
    // presented. The .catch below is load-bearing, not decoration.
    function resetCreate() { create.disabled = false; create.textContent = 'Create storefront'; }
    cancel.addEventListener('click', function () { card.classList.remove('open'); resetCreate(); });
    function submit() {
      var name = (input.value || '').trim();
      if (!name) { toast(SF_REASONS.name_required); input.focus(); return; }
      create.disabled = true; create.textContent = 'Creating…';
      api().account.openStorefront(name).then(function (res) {
        var d = res && res.data;
        if (res && res.error) { resetCreate(); toast('Couldn’t open your storefront — please try again.'); return; }
        if (!d || d.ok !== true) {
          resetCreate();
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
        // #90 — arm the one-shot first-run setup wizard on the dashboard
        // (lokali-dashboard-page.js consumes + clears this flag).
        try { sessionStorage.setItem('lokali_sf_wizard', '1'); } catch (e) {}
        setTimeout(function () { window.location.href = '/vendor-dashboard/dashboard'; }, 700);
      }).catch(function () {
        resetCreate();
        toast('Couldn’t open your storefront — please try again.');
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
    } else {
      state.saved.forEach(function (row) { pane.appendChild(savedRow(row)); });
    }
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
    // #contact lands at the listing's contact block — distinct from View.
    contact.addEventListener('click', function () { window.location.href = vendorHref(v) + '#contact'; });
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

  // ── gamification badge cards ───────────────────────────────
  // Four customer badges, all STATUS-ONLY (no perks — perks on review badges
  // would taint review authenticity; none of this feeds ranking). Data = one
  // get_customer_badges() call via the adapter; if it didn't load (signed-out
  // race, stale cached adapter), the cards simply don't render.
  // Badge glyphs = Font Awesome Free 7.3.1 (fontawesome.com/license/free).
  // fill = currentColor so the dots recolor across pending/earned states.
  function faIco(path, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 640 640" fill="currentColor" aria-hidden="true"><path d="' + path + '"/></svg>';
  }
  var FA_BINOCULARS = 'M192 96L224 96C241.7 96 256 110.3 256 128L256 160L160 160L160 128C160 110.3 174.3 96 192 96zM256 192L256 512C256 529.7 241.7 544 224 544L96 544C78.3 544 64 529.7 64 512L64 452.9C64 418.3 73.4 384.3 91.2 354.6C104.9 331.8 113.7 306.4 117 280L124.5 220C126.5 204 140.1 192 156.3 192L256.1 192zM483.8 192C499.9 192 513.6 204 515.6 220L523 280C526.3 306.4 535.1 331.8 548.8 354.6C566.6 384.3 576 418.3 576 452.9L576 512C576 529.7 561.7 544 544 544L416 544C398.3 544 384 529.7 384 512L384 192L483.8 192zM384 128C384 110.3 398.3 96 416 96L448 96C465.7 96 480 110.3 480 128L480 160L384 160L384 128zM352 192L352 352L288 352L288 192L352 192z';
  var FA_COMPASS = 'M528 320C528 205.1 434.9 112 320 112C205.1 112 112 205.1 112 320C112 434.9 205.1 528 320 528C434.9 528 528 434.9 528 320zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320zM370.7 389.1L226.4 444.6C207 452.1 187.9 433 195.4 413.6L250.9 269.3C254.2 260.8 260.8 254.2 269.3 250.9L413.6 195.4C433 187.9 452.1 207 444.6 226.4L389.1 370.7C385.8 379.2 379.2 385.8 370.7 389.1zM352 320C352 302.3 337.7 288 320 288C302.3 288 288 302.3 288 320C288 337.7 302.3 352 320 352C337.7 352 352 337.7 352 320z';
  var FA_PUZZLE = 'M288 64C323.3 64 352 85.5 352 112C352 122.4 347.6 132 340 139.9C333.4 146.8 328 155.2 328 164.8C328 179.8 340.2 192 355.2 192L400 192C426.5 192 448 213.5 448 240L448 284.8C448 299.8 460.2 312 475.2 312C484.7 312 493.2 306.6 500.1 300C508 292.5 517.6 288 528 288C554.5 288 576 316.7 576 352C576 387.3 554.5 416 528 416C517.6 416 507.9 411.6 500.1 404C493.2 397.4 484.8 392 475.2 392C460.2 392 448 404.2 448 419.2L448 528C448 554.5 426.5 576 400 576L343.2 576C330.4 576 320 565.6 320 552.8C320 543.6 325.8 535.5 333.2 530C344.8 521.3 352 509.3 352 496C352 469.5 323.3 448 288 448C252.7 448 224 469.5 224 496C224 509.3 231.2 521.3 242.8 530C250.2 535.5 256 543.5 256 552.8C256 565.6 245.6 576 232.8 576L112 576C85.5 576 64 554.5 64 528L64 407.2C64 394.4 74.4 384 87.2 384C96.4 384 104.5 389.8 110 397.2C118.7 408.8 130.7 416 144 416C170.5 416 192 387.3 192 352C192 316.7 170.5 288 144 288C130.7 288 118.7 295.2 110 306.8C104.5 314.2 96.5 320 87.2 320C74.4 320 64 309.6 64 296.8L64 240C64 213.5 85.5 192 112 192L220.8 192C235.8 192 248 179.8 248 164.8C248 155.3 242.6 146.8 236 139.9C228.5 132 224 122.4 224 112C224 85.5 252.7 64 288 64z';
  var FA_STAR = 'M320.1 32C329.1 32 337.4 37.1 341.5 45.1L415 189.3L574.9 214.7C583.8 216.1 591.2 222.4 594 231C596.8 239.6 594.5 249 588.2 255.4L473.7 369.9L499 529.8C500.4 538.7 496.7 547.7 489.4 553C482.1 558.3 472.4 559.1 464.4 555L320.1 481.6L175.8 555C167.8 559.1 158.1 558.3 150.8 553C143.5 547.7 139.8 538.8 141.2 529.8L166.4 369.9L52 255.4C45.6 249 43.4 239.6 46.2 231C49 222.4 56.3 216.1 65.3 214.7L225.2 189.3L298.8 45.1C302.9 37.1 311.2 32 320.2 32zM320.1 108.8L262.3 222C258.8 228.8 252.3 233.6 244.7 234.8L119.2 254.8L209 344.7C214.4 350.1 216.9 357.8 215.7 365.4L195.9 490.9L309.2 433.3C316 429.8 324.1 429.8 331 433.3L444.3 490.9L424.5 365.4C423.3 357.8 425.8 350.1 431.2 344.7L521 254.8L395.5 234.8C387.9 233.6 381.4 228.8 377.9 222L320.1 108.8z';
  var CHECK_ICO = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var PEN_ICO = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  // Guide-aligned glyphs + colors — /vendor-resources/badges-guide is the
  // visual source of truth (Francesca 2026-07-30): Explorer violet compass,
  // First Review peach star, Regular rose heart, Scout green flag,
  // Connector violet share-nodes. Same stroke style as the guide tiles.
  function gIco(paths, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  var GI_COMPASS = '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>';
  var GI_STAR = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
  var GI_HEART = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>';
  var GI_FLAG = '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>';
  var GI_SHARE = '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>';
  // Category icons by seeded id (1 handcrafted … 8 home, 9 professional); unknown → tag.
  var CAT_ICOS = {
    1: 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
    2: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2',
    3: 'M6 3v18M6 8c4 0 4 3 8 3s4-3 4-3M6 16c4 0 4-3 8-3s4 3 4 3',
    4: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5',
    5: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    6: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7',
    7: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
    8: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10',
    9: 'M3 22h18M6 18V11M10 18V11M14 18V11M18 18V11M2 9l10-6 10 6z' // Professional Services (#152)
  };
  var CAT_ICO_FALLBACK = 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83zM7 7h.01';
  function catIco(id) {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + (CAT_ICOS[id] || CAT_ICO_FALLBACK) + '"/></svg>';
  }
  function marketName() {
    var b = state.badges || {};
    var acc = state.account || {};
    return b.region || acc.region || 'your neighborhood';
  }
  // Card shell. The badge icon sits next to the title like an app icon —
  // light violet while in progress, solid violet once earned — so the four
  // cards are tellable apart at a glance.
  function gCard(eyebrow, title, subText, ico, earned, color) {
    var card = el('div', 'lkg-card');
    var head = el('div', 'lkg-head');
    if (ico) head.appendChild(el('div', 'lkg-dot' + (color ? ' c-' + color : '') + (earned ? ' earned' : ''), ico));
    var tx = el('div', 'lkg-head-text');
    tx.appendChild(el('div', 'lkg-eyebrow', esc(eyebrow)));
    tx.appendChild(el('div', 'lkg-title', esc(title)));
    head.appendChild(tx);
    card.appendChild(head);
    card.appendChild(el('div', 'lkg-sub', esc(subText)));
    return card;
  }
  function gBar(total, done, highlightNext) {
    var bar = el('div', 'lkg-bar');
    for (var i = 0; i < total; i++) {
      bar.appendChild(el('div', 'lkg-seg' + (i < done ? ' done' : (highlightNext && i === done ? ' next' : ''))));
    }
    return bar;
  }
  function gListRow(name, pill, dateText) {
    var row = el('div', 'lkg-lrow');
    var vn = el('div', 'vn'); vn.textContent = name;
    row.appendChild(vn);
    row.appendChild(el('div', 'ord', esc(pill)));
    row.appendChild(el('div', 'dt', esc(dateText)));
    return row;
  }

  // Neighborhood Explorer — account home, below saved vendors.
  function appendExplorerCard(pane) {
    var b = state.badges;
    if (!b || !b.explorer || !Array.isArray(b.explorer.categories) || !b.explorer.categories.length) return;
    var cats = b.explorer.categories;
    var total = cats.length;
    var n = cats.filter(function (c) { return c && c.explored; }).length;
    var earned = n >= total;
    var almost = n === total - 1;
    var market = marketName();

    if (earned) {
      var banner = el('div', 'lkg-banner');
      banner.appendChild(el('div', 'lkg-dot earned', gIco(GI_COMPASS, 22)));
      var bt = el('div');
      bt.appendChild(el('div', 'lkg-banner-title', "You're a Neighborhood Explorer"));
      bt.appendChild(el('div', 'lkg-banner-sub', "You've browsed every corner of " + esc(market) + '. The badge now shows on your profile and next to your reviews.'));
      banner.appendChild(bt);
      pane.appendChild(banner);
    }

    var card = gCard('Your neighborhood', 'Explore ' + market, earned
      ? 'Every category explored. New vendors join weekly — there’s always something new on the block.'
      : 'You’ve discovered ' + n + ' of ' + total + ' corners of your local marketplace.',
      gIco(GI_COMPASS, 20), earned, 'violet');

    card.appendChild(gBar(total, n, almost));
    var count = el('div', 'lkg-count');
    count.appendChild(el('div', 'lkg-count-main', n + ' <span>of ' + total + ' explored</span>'));
    count.appendChild(el('div', 'lkg-hint' + (almost ? ' almost' : ''),
      earned ? 'Complete' : (almost ? 'Just 1 to go' : (total - n) + ' to go')));
    card.appendChild(count);

    var grid = el('div', 'lkg-grid');
    cats.forEach(function (c) {
      if (!c) return;
      var done = !!c.explored;
      var chip;
      if (done) {
        chip = el('div', 'lkg-chip done');
        chip.appendChild(el('div', 'ico', CHECK_ICO));
      } else {
        chip = el('a', 'lkg-chip todo' + (almost ? ' highlight' : ''));
        chip.href = '/the-market?category=' + encodeURIComponent(c.slug || '');
        chip.appendChild(el('div', 'ico', catIco(c.id)));
      }
      var nm = el('div', 'nm'); nm.textContent = c.name || '';
      chip.appendChild(nm);
      if (!done) chip.appendChild(el('div', 'go', 'Browse →'));
      grid.appendChild(chip);
    });
    card.appendChild(grid);

    if (!earned) {
      var foot = el('div', 'lkg-foot');
      foot.appendChild(el('div', 'lkg-foot-text', 'Explore all ' + total + ' categories to earn the <strong>Neighborhood Explorer</strong> badge on your profile.'));
      card.appendChild(foot);
    }
    pane.appendChild(card);
  }

  // How many of the five badges are earned — the Badges tab count chip.
  // (Explorer, First Review, Neighborhood Regular, Scout, Connector.)
  function earnedBadgeCount() {
    var b = state.badges;
    if (!b) return null;
    var n = 0;
    var cats = (b.explorer && b.explorer.categories) || [];
    if (cats.length && cats.every(function (c) { return c && c.explored; })) n++;
    var rc = (b.reviews && b.reviews.count) || 0;
    if (rc >= 1) n++;
    if (rc >= 5) n++;
    if (((b.scout && b.scout.count) || 0) >= 1) n++;
    if (((b.connector && b.connector.count) || 0) >= 5) n++;
    return n;
  }

  // ── pane: Badges — the customer's badge home (all four cards) ──
  function renderBadges() {
    var pane = el('div', 'lk-pane'); pane.setAttribute('data-pane', 'badges');
    pane.appendChild(el('p', 'lk-intro', "Badges you earn by being part of the neighborhood — exploring, reviewing, and spreading the word. Status only: they show on your profile and next to your reviews, nothing more."));
    var b = state.badges;
    if (!b) {
      pane.appendChild(emptyState('Badges couldn’t load', 'Give it a refresh — your progress is safe.', 'Browse vendors', '/the-market'));
      return pane;
    }
    appendExplorerCard(pane);
    pane.appendChild(milestonesCard(b));
    pane.appendChild(scoutCard(b));
    pane.appendChild(connectorCard(b));
    return pane;
  }

  function milestonesCard(b) {
    var n = (b.reviews && b.reviews.count) || 0;
    var sub;
    if (n === 0) sub = 'Reviews come from vendors you’ve contacted through Lokali. After your next inquiry, share how it went.';
    else if (n < 5) sub = n + ' review' + (n === 1 ? '' : 's') + ' shared. ' + (5 - n) + ' more and you’re a Neighborhood Regular.';
    else sub = '5 reviews shared — you’re a Neighborhood Regular. Your badge now shows on every review you write.';
    var card = gCard('Your voice', 'Review milestones', sub, gIco(GI_STAR, 18), n >= 1, 'peach');

    var track = el('div', 'lkg-track');
    var line = el('div', 'lkg-line');
    var fill = el('div', 'lkg-fill');
    fill.style.width = (n <= 1 ? 0 : Math.min((n - 1) / 4 * 100, 100)) + '%';
    line.appendChild(fill); track.appendChild(line);
    var nodes = el('div', 'lkg-nodes');
    [['First Review', '1 review', gIco(GI_STAR, 16), n >= 1, 'peach'], ['Neighborhood Regular', '5 reviews', gIco(GI_HEART, 16), n >= 5, 'rose']].forEach(function (spec) {
      var node = el('div', 'lkg-node' + (spec[3] ? ' earned' : ''));
      node.appendChild(el('div', 'lkg-node-dot c-' + spec[4], spec[2]));
      node.appendChild(el('div', 'lkg-node-name', esc(spec[0])));
      node.appendChild(el('div', 'lkg-node-req', esc(spec[1])));
      nodes.appendChild(node);
    });
    track.appendChild(nodes);
    card.appendChild(track);

    if (n >= 1) {
      var acc = state.account || {};
      var dispName = (acc.first_name || 'You') + (acc.last_name ? ' ' + acc.last_name.charAt(0).toUpperCase() + '.' : '');
      var prev = el('div', 'lkg-preview');
      prev.appendChild(el('div', 'lkg-preview-label', 'How your badge appears'));
      var mini = el('div', 'lkg-mini');
      var top = el('div', 'lkg-mini-top');
      top.appendChild(el('div', 'lkg-mini-ava', esc(initials(dispName) || 'Y')));
      var mn = el('div', 'lkg-mini-name'); mn.textContent = dispName;
      top.appendChild(mn);
      top.appendChild(el('div', 'lkg-badge-pill ' + (n >= 5 ? 'c-rose' : 'c-peach'), n >= 5 ? 'Neighborhood Regular' : 'First Review'));
      mini.appendChild(top);
      mini.appendChild(el('div', 'lkg-mini-rec', '👍 Recommends'));
      mini.appendChild(el('div', 'lkg-mini-body', 'The custom cookie set was even better than the photos. Ordering was easy and pickup was right in my neighborhood.'));
      prev.appendChild(mini);
      card.appendChild(prev);
    }
    return card;
  }

  function scoutCard(b) {
    var rows = (b.scout && b.scout.rows) || [];
    var n = (b.scout && b.scout.count) || 0;
    var sub;
    if (n === 0) sub = 'Be among the first 3 reviews on any vendor and you’re a Scout. New businesses join every week — someone has to go first.';
    else if (n === 1) sub = 'You’re officially a Neighborhood Scout. Your early review helps a brand-new business get its footing.';
    else sub = n + ' businesses got their start with your help. Your Scout badge shows on your profile and every review.';
    var card = gCard('Your discoveries', 'Neighborhood Scout', sub, gIco(GI_FLAG, 20), n >= 1, 'green');

    // Header icon carries the badge state now — the hero is just the count.
    var hero = el('div', 'lkg-hero');
    var ht = el('div');
    ht.appendChild(el('div', 'lkg-hero-count', n === 0 ? 'No scouts yet' : 'Scouted ' + n + ' vendor' + (n > 1 ? 's' : '')));
    ht.appendChild(el('div', 'lkg-hero-sub', n === 0 ? 'Your first one earns the badge' : 'Among the first 3 reviews each time'));
    hero.appendChild(ht);
    card.appendChild(hero);

    if (rows.length) {
      var list = el('div', 'lkg-list');
      rows.forEach(function (r) {
        if (!r) return;
        var pill = (Number(r.ord) === 1) ? '#1 review' : '#' + r.ord + ' of first 3';
        list.appendChild(gListRow(r.vendor || 'Vendor', pill, monthDay(r.created_at)));
      });
      card.appendChild(list);
    }
    return card;
  }

  function connectorCard(b) {
    var n = (b.connector && b.connector.count) || 0;
    var shares = (b.connector && b.connector.shares) || [];
    var earned = n >= 5;
    var sub;
    if (n === 0) sub = 'Share a vendor you love. When 5 people visit through your links, you’re a Connector.';
    else if (!earned) sub = 'Your shares have brought ' + n + ' visitor' + (n === 1 ? '' : 's') + ' to local businesses. ' + (5 - n) + ' more and you’re a Neighborhood Connector.';
    else sub = n + ' visitors and counting — you’re a Neighborhood Connector. Word of mouth is how neighborhoods grow.';
    var card = gCard('Your reach', 'Neighborhood Connector', sub, gIco(GI_SHARE, 20), earned, 'violet');

    card.appendChild(gBar(5, Math.min(n, 5), false));
    var count = el('div', 'lkg-count');
    count.appendChild(el('div', 'lkg-count-main', n + ' <span>of 5 visitors brought</span>'));
    count.appendChild(el('div', 'lkg-hint', n === 0 ? 'Share to get started' : (earned ? 'Earned' : (5 - n) + ' to go')));
    card.appendChild(count);

    if (shares.length) {
      var list = el('div', 'lkg-list');
      shares.forEach(function (s) {
        if (!s) return;
        var v = Number(s.visitors) || 0;
        list.appendChild(gListRow(s.vendor || 'Vendor', v + ' visitor' + (v === 1 ? '' : 's'), monthDay(s.last_at)));
      });
      card.appendChild(list);
    }

    var foot = el('div', 'lkg-foot');
    foot.appendChild(el('div', 'lkg-foot-text', earned
      ? 'Earned — the <strong>Neighborhood Connector</strong> badge now shows on your profile.'
      : 'Bring 5 visitors to local businesses through your shared links to earn the <strong>Neighborhood Connector</strong> badge.'));
    card.appendChild(foot);
    return card;
  }

  // #129: admin_submit_review and the /review route both answer in CODES, and
  // this page used to toast them verbatim — a real customer saw "review_failed"
  // with no idea what to do. (The old `res.error || 'Could not post review'`
  // fallback could never fire: res.error is always truthy when there IS an
  // error.) Two rules in this copy: tell a refused customer HOW to qualify, and
  // when the failure is OURS, say so plainly instead of implying they did
  // something wrong. Anything unmapped falls through to the our-fault line —
  // never to the raw code.
  var REVIEW_OUR_FAULT = 'Something went wrong on our end — your review wasn’t saved. Please try again.';
  var REVIEW_ERRORS = {
    // Refusals the customer can act on.
    not_eligible:     'You can review a vendor once you’ve contacted them through Lokali — use Call, Text, WhatsApp or “Send a message” on their page, then come back in about an hour.',
    already_reviewed: 'You’ve already reviewed this vendor — you can change it under “Your reviews” below.',
    self_review:      'You can’t review your own storefront.',
    comment_too_long: 'That review is a little long — please trim it to 2,000 characters or fewer.',
    unauthorized:     'Your session expired — please log in again and repost.',
    not_found:        'That vendor isn’t available right now.',
    // Ours, not theirs.
    review_failed:    REVIEW_OUR_FAULT,
    not_enabled:      REVIEW_OUR_FAULT,
    Forbidden:        REVIEW_OUR_FAULT
  };
  function reviewErrorMessage(code) {
    return REVIEW_ERRORS[code] || REVIEW_OUR_FAULT;
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
        if (res && res.error) { toast(reviewErrorMessage(res.error)); return; }
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
      if (row.id == null) { toast('Can’t delete until reloaded'); return; }
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
    var tgLetter = toggleRow('The Neighborhood Edit', 'Our bi-monthly newsletter — vendor spotlights and what’s new on Lokali. Rare by design.', acc.notif_letter !== false);
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
        // #129 (same defect, one line away): this toasted the raw server code too.
        if (res && res.error) { toast('Couldn’t save your changes — please try again.'); return; }
        state.account.first_name = firstIn.input.value.trim();
        state.account.last_name = lastIn.input.value.trim();
        state.account.avatar = avatarSel;
        syncAcctCacheAvatar(avatarSel); // #79 — header chip on every page
        state.account.region = areaIn.input.value.trim();
        // refresh the header-band avatar in place
        var bandAv = document.querySelector('.lk-avatar');
        if (bandAv && bandAv.parentNode) bandAv.parentNode.replaceChild(avatarNode(state.account, 'lk-avatar'), bandAv);
        state.account.notif_letter = tgLetter.get();
        state.account.notif_vendor_replies = tgReplies.get();
        state.account.notif_review_reminders = tgRemind.get();
        // #54 — mirror the newsletter flag to the Brevo list (best-effort; the
        // save already succeeded, so a Brevo hiccup must never surface here).
        try {
          if (api().account.syncNewsletter) api().account.syncNewsletter();
        } catch (e) {}
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
    outBtn.addEventListener('click', function () {
      // clearToken() only drops adapter caches — LokaliAuth.signOut() also ends
      // the Supabase session (and redirects itself), else /login bounces back in.
      if (window.LokaliAuth && window.LokaliAuth.signOut) { window.LokaliAuth.signOut(); return; }
      try { api().clearToken(); } catch (e) {}
      window.location.href = '/login';
    });
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
    // #100 exit survey — one optional question, asked before the point of no
    // return. Deliberately SKIPPABLE and never validated: the answer is nice to
    // have, deleting your own account is a right. Reasons are role-aware
    // (a vendor leaves for different reasons than a shopper) and the slugs must
    // match the CHECK list in patch_exit_survey.sql (unknowns coerce to 'other').
    var EXIT_REASONS = state.hasStorefront ? [
      ['not_enough_customers',    'Not enough customers or leads'],
      ['too_expensive',           'Too expensive'],
      ['closing_business',        'Closing or pausing my business'],
      ['not_right_fit',           'Not the right fit for my business'],
      ['too_hard_to_use',         'Too hard to use'],
      ['found_another_platform',  'Found another platform'],
      ['other',                   'Something else']
    ] : [
      ['not_enough_vendors',       'Not enough vendors near me'],
      ['didnt_find_what_i_needed', 'Didn’t find what I was looking for'],
      ['too_many_emails',          'Too many emails'],
      ['privacy',                  'Privacy — I don’t want an account'],
      ['other',                    'Something else']
    ];
    var exitReason = '';
    var surveyWrap = el('div');
    surveyWrap.style.cssText = 'margin:2px 0 14px;padding-bottom:12px;border-bottom:1px solid #F3D6D6;';
    var sTitle = el('div', 'lk-set-help');
    sTitle.style.cssText = 'margin-bottom:8px;color:#4A4761;font-weight:600;';
    sTitle.textContent = 'Before you go — why are you leaving? (optional)';
    surveyWrap.appendChild(sTitle);
    var pillRow = el('div');
    pillRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;';
    var exitComment = el('textarea', 'lk-input');
    exitComment.rows = 2;
    exitComment.placeholder = 'Anything we could have done better? (optional)';
    exitComment.style.cssText = 'width:100%;max-width:100%;box-sizing:border-box;display:none;' +
      'margin-bottom:10px;font-family:inherit;resize:vertical;';
    EXIT_REASONS.forEach(function (r) {
      var b = el('button', null, null);
      b.type = 'button';
      b.textContent = r[1];
      b.setAttribute('aria-pressed', 'false');
      var base = 'font-family:inherit;font-size:12.5px;line-height:1.3;text-align:left;padding:7px 12px;' +
        'border-radius:999px;cursor:pointer;transition:all .12s;';
      var off = base + 'background:#fff;border:1px solid #E4E2F0;color:#4A4761;';
      var on  = base + 'background:#6002EE;border:1px solid #6002EE;color:#fff;font-weight:600;';
      b.style.cssText = off;
      b.addEventListener('click', function () {
        var already = exitReason === r[0];
        exitReason = already ? '' : r[0];           // tap again to unselect
        Array.prototype.forEach.call(pillRow.children, function (el2) {
          el2.style.cssText = off; el2.setAttribute('aria-pressed', 'false');
        });
        if (!already) { b.style.cssText = on; b.setAttribute('aria-pressed', 'true'); }
        exitComment.style.display = exitReason ? 'block' : 'none';
      });
      pillRow.appendChild(b);
    });
    surveyWrap.appendChild(pillRow);
    surveyWrap.appendChild(exitComment);
    confirmBox.appendChild(surveyWrap);

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
          body: JSON.stringify({
            confirm: 'DELETE',
            // #100 — omitted entirely when skipped; the route ignores a missing reason.
            reason: exitReason || undefined,
            comment: exitReason ? (exitComment.value || '').trim().slice(0, 1000) : undefined
          })
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
    // The button has no text content — the sibling label div isn't associated.
    tg.type = 'button';
    tg.setAttribute('role', 'switch');
    tg.setAttribute('aria-checked', on ? 'true' : 'false');
    tg.setAttribute('aria-label', label);
    tg.addEventListener('click', function () {
      tg.classList.toggle('on');
      tg.setAttribute('aria-checked', tg.classList.contains('on') ? 'true' : 'false');
    });
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
