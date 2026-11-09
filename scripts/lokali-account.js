/**
 * lokali-account.js — customer "My Account" hub (/account).
 *
 * Renders the whole hub into a single mount element (id="lokali-account"):
 *   • Hub shell (2026-09-20 redesign): 230px sidebar at >=992px (same pattern as
 *     the vendor dashboard + admin home), a visible tab row below that (five-across
 *     icon bar on phones; Settings = gear button). Hash routing (#home / #badges /
 *     #saved / #reviews / #settings) so emails can deep-link to a pane.
 *   • Home — greeting, ONE "Your next step" card (review waiting > set your area >
 *     browse), saved preview, badge strip, category tiles. No bare zeros anywhere.
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

  // Icons: Font Awesome Free 6.7.2 (fontawesome.com), CC BY 4.0. Inline SVGs replace the
  // emoji that used to sit here (F rule 2026-09-02: no emoji in UI, Font Awesome only).
  var LK_FA = {
    up: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:1em;height:1em;vertical-align:-.125em;flex-shrink:0;"><path d="M313.4 32.9c26 5.2 42.9 30.5 37.7 56.5l-2.3 11.4c-5.3 26.7-15.1 52.1-28.8 75.2l144 0c26.5 0 48 21.5 48 48c0 18.5-10.5 34.6-25.9 42.6C497 275.4 504 288.9 504 304c0 23.4-16.8 42.9-38.9 47.1c4.4 7.3 6.9 15.8 6.9 24.9c0 21.3-13.9 39.4-33.1 45.6c.7 3.3 1.1 6.8 1.1 10.4c0 26.5-21.5 48-48 48l-97.5 0c-19 0-37.5-5.6-53.3-16.1l-38.5-25.7C176 420.4 160 390.4 160 358.3l0-38.3 0-48 0-24.9c0-29.2 13.3-56.7 36-75l7.4-5.9c26.5-21.2 44.6-51 51.2-84.2l2.3-11.4c5.2-26 30.5-42.9 56.5-37.7zM32 192l64 0c17.7 0 32 14.3 32 32l0 224c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32L0 224c0-17.7 14.3-32 32-32z"/></svg>',
    down: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:1em;height:1em;vertical-align:-.125em;flex-shrink:0;"><path d="M313.4 479.1c26-5.2 42.9-30.5 37.7-56.5l-2.3-11.4c-5.3-26.7-15.1-52.1-28.8-75.2l144 0c26.5 0 48-21.5 48-48c0-18.5-10.5-34.6-25.9-42.6C497 236.6 504 223.1 504 208c0-23.4-16.8-42.9-38.9-47.1c4.4-7.3 6.9-15.8 6.9-24.9c0-21.3-13.9-39.4-33.1-45.6c.7-3.3 1.1-6.8 1.1-10.4c0-26.5-21.5-48-48-48l-97.5 0c-19 0-37.5 5.6-53.3 16.1L202.7 73.8C176 91.6 160 121.6 160 153.7l0 38.3 0 48 0 24.9c0 29.2 13.3 56.7 36 75l7.4 5.9c26.5 21.2 44.6 51 51.2 84.2l2.3 11.4c5.2 26 30.5 42.9 56.5 37.7zM32 384l64 0c17.7 0 32-14.3 32-32l0-224c0-17.7-14.3-32-32-32L32 96C14.3 96 0 110.3 0 128L0 352c0 17.7 14.3 32 32 32z"/></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:1em;height:1em;vertical-align:-.125em;flex-shrink:0;color:#1A6640;"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg>',
    flag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:1em;height:1em;vertical-align:-.125em;flex-shrink:0;color:#C0392B;"><path d="M64 32C64 14.3 49.7 0 32 0S0 14.3 0 32L0 64 0 368 0 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-128 64.3-16.1c41.1-10.3 84.6-5.5 122.5 13.4c44.2 22.1 95.5 24.8 141.7 7.4l34.7-13c12.5-4.7 20.8-16.6 20.8-30l0-247.7c0-23-24.2-38-44.8-27.7l-9.6 4.8c-46.3 23.2-100.8 23.2-147.1 0c-35.1-17.6-75.4-22-113.5-12.5L64 48l0-16z"/></svg>',
    bulb: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:1em;height:1em;vertical-align:-.125em;flex-shrink:0;color:#B5793B;"><path d="M272 384c9.6-31.9 29.5-59.1 49.2-86.2c0 0 0 0 0 0c5.2-7.1 10.4-14.2 15.4-21.4c19.8-28.5 31.4-63 31.4-100.3C368 78.8 289.2 0 192 0S16 78.8 16 176c0 37.3 11.6 71.9 31.4 100.3c5 7.2 10.2 14.3 15.4 21.4c0 0 0 0 0 0c19.8 27.1 39.7 54.4 49.2 86.2l160 0zM192 512c44.2 0 80-35.8 80-80l0-16-160 0 0 16c0 44.2 35.8 80 80 80zM112 176c0 8.8-7.2 16-16 16s-16-7.2-16-16c0-61.9 50.1-112 112-112c8.8 0 16 7.2 16 16s-7.2 16-16 16c-44.2 0-80 35.8-80 80z"/></svg>'
  };

  var MOUNT_ID = 'lokali-account';
  var PANES = ['home', 'badges', 'saved', 'reviews', 'settings'];

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
    1: 'Handmade & Custom', 2: 'Business Services', 3: 'Beauty',
    4: 'Children & Education', 5: 'Events & Entertainment', 6: 'Food',
    7: 'Health & Wellness', 8: 'Home & Property', 9: 'Professional Services',
    10: 'Clothing & Accessories' // #196
  };
  // Area name from locations_id (the favorites embed carries ids, never a city).
  var _locNames = null, _locP = null;
  function locNamesP() {
    if (_locP) return _locP;
    var A = api(), S = window.LokaliSupabaseAPI;
    var fn = (A && A.data && A.data.locations) || (S && S.data && S.data.locations) || null;
    _locP = (fn ? fn() : Promise.resolve(null)).then(function (res) {
      var m = {}; ((res && res.data) || []).forEach(function (l) { if (l && l.id != null) m[String(l.id)] = l.location_name || l.name || ''; });
      _locNames = m; return m;
    }).catch(function () { _locNames = {}; return _locNames; });
    return _locP;
  }
  function vendorArea(v) {
    var id = v && (Array.isArray(v.locations_id) ? v.locations_id[0] : v.locations_id);
    return (id != null && _locNames) ? (_locNames[String(id)] || '') : '';
  }
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
    img.className = 'lk-thumb-img';
    // has-photo swaps the lavender initials backing for white: the photo is the
    // vendor's logo, and a logo saved with transparent "white" areas otherwise
    // shows the lavender through as a purple tinge (Madrone, 2026-10-12).
    img.onload = function () { node.textContent = ''; node.classList.add('has-photo'); node.appendChild(img); };
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
    try { input.dispatchEvent(new Event('lk-area-picked', { bubbles: true })); } catch (e) {}
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
        DUSK = '#4A4761', SLATE = '#6E6A85', FOG = '#C8C6D8', BORDER = '#DEDAEE',
        GREEN = '#2BB673', GREENL = '#E4F7EE', F = "'Plus Jakarta Sans',-apple-system,sans-serif";
    var s = document.createElement('style');
    s.id = 'lokali-account-styles';
    var R = '#lokali-account ';
    s.textContent = [
      R + '*{box-sizing:border-box;}',
      '#lokali-account{font-family:' + F + ';color:' + INK + ';max-width:1180px;margin:0 auto;padding:1.5rem 0 3rem;}',
      // band
      R + '.lk-band{background:#fff;border:1px solid ' + BORDER + ';border-radius:16px;padding:22px 24px;display:flex;align-items:center;gap:16px;margin-bottom:1.5rem;}',
      R + '.lk-avatar{width:52px;height:52px;border-radius:50%;background:' + V + ';color:#fff;font-size:19px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 14px rgba(96,2,238,.25);text-transform:uppercase;}',
      R + '.lk-greet{font-size:20px;font-weight:600;letter-spacing:-.3px;}',
      R + '.lk-meta{font-size:12.5px;color:' + DUSK + ';margin-top:3px;}',
      R + '.lk-stats{margin-left:auto;display:flex;gap:22px;text-align:center;}',
      R + '.lk-stat-num{font-size:18px;font-weight:600;color:' + V + ';line-height:1;}',
      R + '.lk-stat-lbl{font-size:11px;color:' + SLATE + ';margin-top:4px;}',
      // segmented
      R + '.lk-seg-wrap{display:inline-flex;background:#fff;border:1px solid ' + BORDER + ';border-radius:100px;padding:4px;gap:2px;margin-bottom:1.75rem;}',
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
      R + '.lk-row{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid ' + BORDER + ';border-radius:12px;padding:12px 14px;margin-bottom:10px;transition:border-color .15s;}',
      R + '.lk-row:hover{border-color:' + FOG + ';}',
      R + '.lk-thumb{width:46px;height:46px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#EADBFF,#D9C2FF);color:' + V + ';font-weight:700;font-size:15px;text-transform:uppercase;}',
      R + '.lk-thumb-img{width:100%;height:100%;border-radius:inherit;object-fit:cover;display:block;}',
      R + '.lk-thumb.has-photo,' + R + '.lk-await-av.has-photo{background:#fff;}',
      R + '.lk-row-info{flex:1;min-width:0;}',
      R + '.lk-row-name{font-size:14px;font-weight:600;}',
      R + '.lk-row-sub{font-size:12px;color:' + SLATE + ';margin-top:2px;}',
      R + '.lk-row-sub .cat{color:' + V + ';font-weight:600;}',
      R + '.lk-row-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}',
      R + '.lk-btn{font-family:' + F + ';font-size:12px;font-weight:600;cursor:pointer;border-radius:8px;padding:7px 13px;transition:all .12s;border:none;}',
      R + '.lk-btn.primary{background:' + V + ';color:#fff;}',
      R + '.lk-btn.primary:hover{opacity:.88;}',
      R + '.lk-btn.ghost{background:#fff;border:1px solid ' + FOG + ';color:' + DUSK + ';}',
      R + '.lk-btn.ghost:hover{border-color:' + V + ';color:' + V + ';}',
      R + '.lk-heart{width:30px;height:30px;border-radius:8px;border:none;background:' + SNOW + ';color:' + V + ';cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      R + '.lk-heart:hover{background:' + VL + ';}',
      // awaiting
      R + '.lk-await{background:#fff;border:1px solid ' + BORDER + ';border-radius:12px;padding:13px 16px;display:flex;align-items:center;gap:14px;margin-bottom:10px;flex-wrap:wrap;}',
      R + '.lk-await-av{width:40px;height:40px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;background:#8B5CF6;text-transform:uppercase;}',
      R + '.lk-await-info{flex:1;min-width:0;}',
      R + '.lk-await-name{font-size:14px;font-weight:600;}',
      R + '.lk-await-sub{font-size:12px;color:' + SLATE + ';margin-top:1px;}',
      R + '.lk-await-cta{font-family:' + F + ';font-size:12px;font-weight:600;color:' + V + ';background:' + VL + ';border:none;border-radius:8px;padding:8px 14px;cursor:pointer;flex-shrink:0;}',
      R + '.lk-await-cta:hover{background:' + VM + ';}',
      // composer
      R + '.lk-composer{flex-basis:100%;margin-top:10px;border-top:1px solid ' + BORDER + ';padding-top:12px;display:none;}',
      R + '.lk-composer.open{display:block;}',
      R + '.lk-rec{display:flex;gap:8px;margin-bottom:10px;}',
      R + '.lk-rec button{font-family:' + F + ';font-size:12px;font-weight:600;border-radius:100px;padding:7px 14px;cursor:pointer;border:1px solid ' + FOG + ';background:#fff;color:' + DUSK + ';}',
      R + '.lk-rec button.sel-yes{background:' + GREENL + ';border-color:' + GREEN + ';color:' + GREEN + ';}',
      R + '.lk-rec button.sel-no{background:#FDECEC;border-color:#E0726A;color:#C0392B;}',
      R + '.lk-ta{width:100%;font-family:' + F + ';font-size:13px;color:' + INK + ';border:1px solid ' + FOG + ';border-radius:8px;padding:10px 12px;min-height:74px;resize:vertical;background:' + SNOW + ';}',
      // Conduct tags on a review (2026-10-30; same encoding as lokali-vendor-listing.js).
      R + '.lk-chips{margin:0 0 10px;}',
      R + '.lk-chips-l{font-family:' + F + ';font-size:12px;font-weight:600;color:' + DUSK + ';margin:0 0 6px;}',
      R + '.lk-chips-r{display:flex;flex-wrap:wrap;gap:6px;}',
      R + '.lk-chips button{font-family:' + F + ';font-size:12px;font-weight:600;border-radius:100px;padding:7px 12px;min-height:36px;cursor:pointer;border:1px solid ' + FOG + ';background:#fff;color:' + DUSK + ';}',
      R + '.lk-chips button[aria-pressed="true"]{background:#F1ECFD;border-color:#C9B3FA;color:#4B2EA8;}',
      R + '.lk-rev-tags{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px;}',
      R + '.lk-rev-tag{display:inline-flex;align-items:center;font-family:' + F + ';font-size:11px;font-weight:600;color:#4B2EA8;background:#F1ECFD;border-radius:100px;padding:5px 10px;}',
      R + '.lk-ta:focus{outline:none;border-color:' + V + ';background:#fff;}',
      R + '.lk-composer-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;}',
      // my review cards
      R + '.lk-review{background:#fff;border:1px solid ' + BORDER + ';border-radius:12px;padding:16px 18px;margin-bottom:12px;}',
      R + '.lk-review-head{font-size:13px;color:' + SLATE + ';margin-bottom:9px;}',
      R + '.lk-review-head strong{color:' + INK + ';font-weight:600;}',
      R + '.lk-review-head .when{float:right;font-size:12px;}',
      R + '.lk-rec-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:' + GREEN + ';background:' + GREENL + ';border-radius:100px;padding:3px 10px;margin-bottom:8px;}',
      R + '.lk-rec-pill.no{color:#C0392B;background:#FDECEC;}',
      R + '.lk-review-body{font-size:13px;color:' + DUSK + ';line-height:1.6;}',
      R + '.lk-review-foot{margin-top:11px;padding-top:11px;border-top:1px solid ' + BORDER + ';display:flex;gap:16px;}',
      R + '.lk-review-foot button{font-family:' + F + ';font-size:12px;font-weight:500;color:' + SLATE + ';background:none;border:none;cursor:pointer;padding:0;}',
      R + '.lk-review-foot button:hover{color:' + V + ';}',
      // settings
      R + '.lk-card{background:#fff;border:1px solid ' + BORDER + ';border-radius:12px;padding:4px 20px;margin-bottom:16px;}',
      R + '.lk-set-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 0;border-bottom:1px solid ' + BORDER + ';}',
      R + '.lk-set-row:last-child{border-bottom:none;}',
      R + '.lk-set-label{font-size:13px;font-weight:600;color:' + INK + ';}',
      R + '.lk-set-help{font-size:12px;color:' + SLATE + ';margin-top:2px;line-height:1.45;}',
      R + '.lk-input{font-family:' + F + ';font-size:13px;color:' + INK + ';background:' + SNOW + ';border:1px solid ' + FOG + ';border-radius:8px;padding:8px 12px;width:220px;}',
      R + '.lk-input:focus{outline:none;border-color:' + V + ';background:#fff;}',
      R + '.lk-toggle{width:40px;height:23px;border-radius:100px;background:' + FOG + ';position:relative;cursor:pointer;transition:background .18s;border:none;flex-shrink:0;}',
      R + '.lk-toggle::after{content:"";position:absolute;top:2.5px;left:2.5px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .18s;}',
      R + '.lk-toggle.on{background:' + V + ';}',
      R + '.lk-toggle.on::after{transform:translateX(17px);}',
      R + '.lk-save-bar{display:flex;justify-content:flex-end;margin:1.25rem 0 2rem;}',
      // #66 Phase 1 — "Open your storefront" card (shown to people without one).
      R + '.lk-sf{background:#fff;border:1px solid ' + BORDER + ';border-radius:16px;padding:18px 20px;margin-bottom:1.5rem;display:flex;flex-wrap:wrap;align-items:center;gap:16px;}',
      R + '.lk-sf-icon{width:46px;height:46px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + V + ';color:#fff;box-shadow:0 4px 14px rgba(96,2,238,.22);}',
      R + '.lk-sf-body{flex:1;min-width:0;}',
      R + '.lk-sf-title{font-size:15px;font-weight:600;letter-spacing:-.2px;}',
      R + '.lk-sf-sub{font-size:12.5px;color:' + DUSK + ';margin-top:3px;line-height:1.5;}',
      R + '.lk-sf-cta{font-family:' + F + ';font-size:12.5px;font-weight:600;color:#fff;background:#FF8D00;border:none;border-radius:9px;padding:9px 15px;cursor:pointer;flex-shrink:0;transition:opacity .12s;}',
      R + '.lk-sf-cta:hover{opacity:.9;}',
      R + '.lk-sf-form{flex-basis:100%;margin-top:12px;padding-top:14px;border-top:1px solid ' + VM + ';display:none;}',
      R + '.lk-sf.open .lk-sf-form{display:block;}',
      R + '.lk-sf.open .lk-sf-cta{display:none;}',
      R + '.lk-sf-label{font-size:12px;font-weight:600;color:' + INK + ';margin-bottom:7px;}',
      R + '.lk-sf-in{font-family:' + F + ';font-size:14px;color:' + INK + ';background:#fff;border:1px solid ' + FOG + ';border-radius:9px;padding:10px 13px;width:100%;max-width:360px;}',
      R + '.lk-sf-in:focus{outline:none;border-color:' + V + ';}',
      R + '.lk-sf-foot{display:flex;gap:8px;margin-top:11px;}',
      // #66 Phase 2 — owner "switch back to storefront" strip.
      R + '.lk-sfr{display:flex;align-items:center;gap:13px;background:#fff;border:1px solid ' + BORDER + ';border-radius:14px;padding:13px 16px;margin-bottom:1.5rem;}',
      R + '.lk-sfr-ic{width:38px;height:38px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:' + VL + ';color:' + V + ';}',
      R + '.lk-sfr-body{flex:1;min-width:0;}',
      R + '.lk-sfr-title{font-size:13.5px;font-weight:600;}',
      R + '.lk-sfr-sub{font-size:12px;color:' + SLATE + ';margin-top:2px;}',
      R + '.lk-sfr-cta{font-family:' + F + ';font-size:12.5px;font-weight:600;color:' + V + ';background:' + VL + ';border-radius:9px;padding:9px 14px;text-decoration:none;flex-shrink:0;transition:background .12s;}',
      R + '.lk-sfr-cta:hover{background:' + VM + ';}',
      R + '.lk-danger{color:#C0392B;}',
      R + '.lk-btn.danger{background:#fff;border:1px solid #E8B4AE;color:#C0392B;}',
      R + '.lk-btn.danger:hover{background:#FDF0EE;}',
      // empty
      R + '.lk-empty{background:#fff;border:1px dashed ' + FOG + ';border-radius:14px;padding:3rem 2rem;text-align:center;}',
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
      R + '.lkg-card{background:#fff;border:1px solid ' + BORDER + ';border-radius:10px;padding:1.75rem;margin-top:1.75rem;font-family:' + F + ';}',
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
      R + '.lkg-chip{display:flex;align-items:center;gap:10px;border:1px solid ' + BORDER + ';border-radius:8px;padding:10px 12px;font-size:13px;text-decoration:none;transition:all .12s;}',
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
      R + '.lkg-foot{display:flex;align-items:center;gap:12px;margin-top:1.4rem;padding-top:1.25rem;border-top:1px solid ' + BORDER + ';}',
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
      R + '.lkg-banner{display:flex;align-items:center;gap:14px;background:linear-gradient(120deg,' + VL + ' 0%,#FFF6F0 55%,#fff 90%);border:1px solid ' + VM + ';border-radius:10px;padding:1.25rem 1.5rem;margin-top:1.75rem;font-family:' + F + ';}',
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
      R + '.lkg-node-dot{width:42px;height:42px;border-radius:50%;background:' + VL + ';border:11px dashed ' + VM + ';color:' + V + ';display:flex;align-items:center;justify-content:center;}',
      R + '.lkg-node.earned .lkg-node-dot{background:' + V + ';border:11px solid ' + V + ';color:#fff;box-shadow:0 3px 10px rgba(96,2,238,.26);}',
      R + '.lkg-node-dot.c-peach{background:#FFF0E6;border-color:#F6C6A5;color:#B4530A;}',
      R + '.lkg-node.earned .lkg-node-dot.c-peach{background:#FF6B00;border-color:#FF6B00;color:#fff;box-shadow:0 3px 10px rgba(255,107,0,.26);}',
      R + '.lkg-node-dot.c-rose{background:#FBE9F2;border-color:#EBBBD3;color:#A63D74;}',
      R + '.lkg-node.earned .lkg-node-dot.c-rose{background:#A63D74;border-color:#A63D74;color:#fff;box-shadow:0 3px 10px rgba(166,61,116,.26);}',
      R + '.lkg-node-name{font-size:12px;font-weight:600;color:' + SLATE + ';}',
      R + '.lkg-node.earned .lkg-node-name{color:' + INK + ';}',
      R + '.lkg-node-req{font-size:11px;color:' + SLATE + ';}',
      // badge preview + scout list
      R + '.lkg-preview{margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid ' + BORDER + ';}',
      R + '.lkg-preview-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:' + SLATE + ';margin-bottom:10px;}',
      R + '.lkg-mini{background:' + SNOW + ';border:1px solid ' + BORDER + ';border-radius:8px;padding:12px 14px;}',
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
      R + '.lkg-list{margin-top:1.25rem;padding-top:.25rem;border-top:1px solid ' + BORDER + ';}',
      R + '.lkg-lrow{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid ' + BORDER + ';font-size:13px;}',
      R + '.lkg-lrow:last-child{border-bottom:none;padding-bottom:2px;}',
      R + '.lkg-lrow .vn{flex:1;font-weight:500;color:' + INK + ';min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      R + '.lkg-lrow .ord{font-size:10.5px;font-weight:700;color:' + V + ';background:' + VL + ';border-radius:100px;padding:2px 8px;flex-shrink:0;}',
      R + '.lkg-lrow .dt{font-size:11.5px;color:' + SLATE + ';width:60px;text-align:right;flex-shrink:0;}',
      '@media (max-width:560px){#lokali-account .lkg-grid{grid-template-columns:1fr;}#lokali-account .lkg-line{left:50px;right:50px;}}',
      // ── 2026-09-20 hub redesign: shell, Home, 44px targets, AA text ──
      // Measured on the old page: every control < 44px, slate text 3.1-3.3:1,
      // 11 text styles < 12px, 13px inputs (iPhone focus zoom), 760px cap.
      R + '.lkh{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;align-items:start;}',
      R + '.lkh-rail{position:sticky;background:#fff;border:1px solid #EEEDF6;border-radius:16px;padding:16px 12px;display:flex;flex-direction:column;}',
      R + '.lkh-nav{all:unset;box-sizing:border-box;display:flex;align-items:center;width:100%;border-radius:8px;margin-bottom:1px;padding:6px 8px;cursor:pointer;font-family:' + F + ';font-size:16px;font-weight:500;line-height:26px;color:' + INK + ';text-decoration:none;}',
      R + '.lkh-nav i{width:40px;height:40px;flex:0 0 40px;display:flex;align-items:center;justify-content:center;color:' + DUSK + ';}',
      R + '.lkh-nav i svg{width:18px;height:18px;}',
      R + '.lkh-nav:hover{background:#EEE6FF;}',
      R + '.lkh-nav:focus-visible,' + R + '.lkh-tab:focus-visible{outline:2px solid ' + V + ';outline-offset:1px;}',
      R + '.lkh-nav[aria-current="page"]{background:#EEE6FF;color:' + V + ';font-weight:700;}',
      R + '.lkh-nav[aria-current="page"] i{color:' + V + ';}',
      R + '.lkh-n{margin-left:auto;font-size:12px;font-weight:700;line-height:20px;background:#FFF2DF;color:#8A4B00;border-radius:999px;padding:0 8px;}',
      R + '.lkh-lbl{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + SLATE + ';padding:14px 8px 4px;}',
      R + '.lkh-main{min-width:0;}',
      R + '.lkh-tabs{display:none;}',
      R + '.lkh-gear{display:none;}',
      // home
      R + '.lkh-hello{display:flex;align-items:center;gap:14px;margin-bottom:18px;}',
      R + '.lkh-hello .lk-avatar{width:48px;height:48px;font-size:17px;box-shadow:none;}',
      R + '.lkh-stack{display:flex;flex-direction:column;gap:18px;}',
      R + '.lkh-stack .lk-sf,' + R + '.lkh-stack .lk-sfr{margin-bottom:0;}',
      R + '.lkh-next{background:#EEE6FF;border:1px solid #D4BFF9;border-radius:16px;padding:18px;display:flex;align-items:center;gap:12px 20px;flex-wrap:wrap;}',
      R + '.lkh-next-tx{flex:1 1 300px;min-width:0;}',
      R + '.lkh-k{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3D00E0;}',
      R + '.lkh-next h3{margin:4px 0;font-size:18px;font-weight:700;letter-spacing:-.3px;color:' + INK + ';}',
      R + '.lkh-next p{margin:0;font-size:14px;color:' + DUSK + ';line-height:1.5;max-width:56ch;}',
      R + '.lkh-chips{display:flex;flex-wrap:wrap;gap:8px;flex-basis:100%;}',
      R + '.lkh-chip{font-family:' + F + ';min-height:44px;padding:0 16px;border-radius:100px;border:1px solid #D4BFF9;background:#fff;font-size:14px;font-weight:600;color:' + INK + ';cursor:pointer;}',
      R + '.lkh-chip:hover{border-color:' + V + ';color:' + V + ';}',
      R + '.lkh-chip:disabled{opacity:.55;cursor:default;}',
      R + '.lkh-cols{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:18px;align-items:start;}',
      R + '.lkh-card{background:#fff;border:1px solid ' + BORDER + ';border-radius:16px;padding:18px;min-width:0;}',
      R + '.lkh-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;margin-bottom:14px;}',
      R + '.lkh-head h3{margin:0;font-size:16px;font-weight:700;letter-spacing:-.2px;color:' + INK + ';}',
      R + '.lkh-more{font-family:' + F + ';font-size:13.5px;font-weight:600;color:' + V + ';background:none;border:none;cursor:pointer;min-height:44px;padding:0 4px;margin:-12px 0;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;}',
      R + '.lkh-hint{margin:12px 0 0;font-size:13.5px;color:' + SLATE + ';line-height:1.5;}',
      R + '.lkh-bdg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;}',
      R + '.lkh-b{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;font-size:12px;font-weight:600;color:' + SLATE + ';line-height:1.25;}',
      R + '.lkh-b span{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#EEE6FF;color:' + V + ';border:1.5px dashed #D4BFF9;}',
      R + '.lkh-b.on{color:' + INK + ';}',
      R + '.lkh-b.on span{background:' + V + ';color:#fff;border:1.5px solid ' + V + ';}',
      R + '.lkh-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}',
      R + '.lkh-tile{display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 12px;border-radius:12px;border:1px solid #EEEDF6;background:#fff;font-size:13.5px;font-weight:600;color:' + INK + ';text-decoration:none;}',
      R + '.lkh-tile:hover{border-color:' + V + ';}',
      R + '.lkh-tile i{width:32px;height:32px;border-radius:9px;background:#EEE6FF;color:' + V + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      R + '.lkh-tile.done i{background:' + GREENL + ';color:#1A6640;}',
      R + '.lkh-mini{border:1px dashed ' + BORDER + ';border-radius:14px;padding:22px 16px;text-align:center;font-size:13.5px;color:' + SLATE + ';line-height:1.5;}',
      R + '.lkh-mini b{display:block;font-size:15px;color:' + INK + ';margin-bottom:4px;}',
      // saved cards (rows under 992, photo cards from 992)
      R + '.lkh-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;}',
      R + '.lkh-grid .lk-row{margin-bottom:0;flex-wrap:nowrap;}',
      R + '.lkh-grid .lk-thumb{width:64px;height:64px;font-size:17px;}',
      R + '.lk-row-name a{color:inherit;text-decoration:none;}',
      R + '.lk-row-name a:hover{color:' + V + ';}',
      // stretched link: the whole name/category block opens the storefront (44px+ target)
      R + '.lkh-grid .lk-row-info{position:relative;}',
      R + '.lkh-grid .lk-row-name a::after{content:"";position:absolute;inset:-10px 0;}',
      // Home preview rows are narrow: Message is icon-only there at every width
      R + '.lkh-grid.two .lk-row-actions .lk-btn span,' + R + '.lkh-grid:not(.wide) .lk-row-actions .lk-btn span{display:none;}',
      R + '.lkh-grid:not(.wide) .lk-row-actions .lk-btn{width:44px;padding:0;flex:0 0 44px;}',
      R + '.lk-row-name{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      R + '.lk-row-sub{font-size:13px;}',
      R + '.lk-sig{display:inline-block;margin-top:4px;font-size:12px;font-weight:600;color:#1A6640;background:' + GREENL + ';border-radius:100px;padding:1px 8px;}',
      // 44px targets + readable sizes
      R + '.lk-btn{min-height:44px;padding:0 16px;font-size:14px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;}',
      R + '.lk-heart{width:44px;height:44px;border-radius:10px;}',
      R + '.lk-await-cta{min-height:44px;font-size:14px;padding:0 16px;border-radius:10px;}',
      R + '.lk-await-av{background:' + V + ';}',
      R + '.lk-rec button{min-height:44px;padding:0 16px;font-size:14px;}',
      R + '.lk-rec button.sel-yes,' + R + '.lk-rec-pill,' + R + '.lkg-mini-rec{color:#1A6640;}',
      R + '.lk-rec-pill{font-size:12.5px;}',
      R + '.lk-review-foot{gap:4px;}',
      R + '.lk-review-foot button{min-height:44px;padding:0 10px;font-size:14px;font-weight:600;color:' + DUSK + ';}',
      R + '.lk-review-foot button:first-child{margin-left:-10px;}',
      R + '.lk-toggle{width:52px;height:30px;}',
      R + '.lk-toggle::after{top:3px;left:3px;width:24px;height:24px;}',
      R + '.lk-toggle::before{content:"";position:absolute;inset:-7px 0;}', // 44px tall hit area
      R + '.lk-toggle.on::after{transform:translateX(22px);}',
      R + '.lk-set-row{min-height:44px;}',
      R + '.lk-input,' + R + '.lk-ta,' + R + '.lk-sf-in{font-size:16px;}', // <16px makes iPhone Safari zoom on focus
      R + '.lk-input,' + R + '.lk-sf-in{min-height:44px;}',
      R + '.lk-input{width:260px;}',
      R + '.lk-intro{font-size:14px;max-width:62ch;}',
      R + '.lk-group-label{font-size:12px;}',
      R + '.lk-set-help{font-size:13px;}',
      R + '.lk-await-sub,' + R + '.lk-review-head .when{font-size:13px;}',
      R + '.lk-seg-count,' + R + '.lkg-eyebrow,' + R + '.lkg-chip .go,' + R + '.lkg-node-req,' + R + '.lkg-preview-label,' + R + '.lkg-mini-ava,' + R + '.lkg-badge-pill,' + R + '.lkg-mini-rec,' + R + '.lkg-lrow .ord,' + R + '.lkg-lrow .dt{font-size:12px;}',
      R + '.lkg-lrow .dt{width:64px;}',
      R + '.lkg-card:first-of-type{margin-top:0;}',
      // the storefront invitation is secondary on a shopper's page: quiet orange
      // tint with dark-orange text (white on #FF8D00 measured 2.32:1).
      R + '.lk-sf{border-style:dashed;background:transparent;}',
      R + '.lk-sf-icon{background:#FFF2DF;color:#8A4B00;box-shadow:none;}',
      R + '.lk-sf-cta{background:#FFF2DF;color:#8A4B00;border:1px solid #FFDDB0;min-height:44px;font-size:14px;padding:0 16px;border-radius:10px;}',
      R + '.lk-sf-cta:hover{opacity:1;background:#FFDDB0;}',
      R + '.lk-sfr-cta{min-height:44px;display:inline-flex;align-items:center;font-size:14px;border-radius:10px;}',
      // dirty-only save bar (same behaviour as the vendor Profile page)
      R + '.lk-save-bar{position:sticky;bottom:12px;z-index:5;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #D4BFF9;border-radius:14px;padding:10px 14px;box-shadow:0 8px 24px rgba(61,0,224,.12);font-size:13.5px;color:' + DUSK + ';}',
      R + '.lk-save-bar[hidden]{display:none;}',
      '.lk-ac-toast{display:flex;align-items:center;gap:12px;font-size:14px;max-width:calc(100vw - 32px);}',
      '.lk-ac-toast button{font-family:' + F + ';min-height:40px;padding:0 14px;border-radius:9px;border:none;background:#fff;color:' + V + ';font-weight:700;font-size:13.5px;cursor:pointer;margin:-4px -8px -4px 0;}',
      // signed-out welcome card
      R + '.lk-so{max-width:640px;margin:1.5rem auto 0;padding:0 16px;}',
      R + '.lk-so-card{background:#fff;border:1px solid ' + BORDER + ';border-radius:20px;padding:36px 32px 28px;text-align:center;}',
      R + '.lk-so-icon{width:56px;height:56px;border-radius:50%;background:#EEE6FF;color:' + V + ';display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px;}',
      R + '.lk-so-title{margin:0 0 8px;font-size:24px;font-weight:700;letter-spacing:-.4px;color:' + INK + ';}',
      R + '.lk-so-sub{margin:0 auto 22px;font-size:15px;line-height:1.55;color:' + DUSK + ';max-width:44ch;}',
      R + '.lk-so-acts{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;}',
      R + '.lk-so-acts .lk-btn{min-width:170px;font-size:15px;}',
      R + '.lk-so-perks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:28px;padding-top:24px;border-top:1px solid #EEEDF6;text-align:left;}',
      R + '.lk-so-perk{display:flex;gap:10px;align-items:flex-start;}',
      R + '.lk-so-perk i{width:36px;height:36px;flex:0 0 36px;border-radius:10px;background:#EEE6FF;color:' + V + ';display:flex;align-items:center;justify-content:center;}',
      R + '.lk-so-perk b{display:block;font-size:14px;font-weight:700;color:' + INK + ';margin-bottom:2px;}',
      R + '.lk-so-perk span{font-size:13px;line-height:1.45;color:' + SLATE + ';}',
      R + '.lk-so-foot{margin:18px 0 0;text-align:center;font-size:14px;color:' + DUSK + ';line-height:1.5;}',
      R + '.lk-so-foot a{color:' + V + ';font-weight:600;text-decoration:none;}',
      '@media (max-width:640px){#lokali-account .lk-so-card{padding:28px 20px 22px;}#lokali-account .lk-so-perks{grid-template-columns:1fr;gap:14px;}#lokali-account .lk-so-acts .lk-btn{flex:1 1 100%;}}',
      '@media (min-width:992px){' +
        '#lokali-account .lkh-grid.wide{grid-template-columns:repeat(3,minmax(0,1fr));}' +
        '#lokali-account .lkh-grid.wide .lk-row{flex-direction:column;align-items:stretch;padding:0;overflow:hidden;gap:10px;}' +
        '#lokali-account .lkh-grid.wide .lk-thumb{width:100%;height:130px;border-radius:0;font-size:26px;}' +
        // The wide card's photo is a logo: show it whole and never blown up past
        // its own size (cover cropped an 82px logo to its middle third at 4x).
        '#lokali-account .lkh-grid.wide .lk-thumb.has-photo{padding:12px;border-bottom:1px solid #EEEDF6;}' +
        '#lokali-account .lkh-grid.wide .lk-thumb.has-photo .lk-thumb-img{width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;border-radius:0;}' +
        '#lokali-account .lkh-grid.wide .lk-row-info{padding:0 14px;flex:0 0 auto;}' +
        '#lokali-account .lkh-grid.wide .lk-row-actions{padding:0 14px 14px;}' +
        '#lokali-account .lkh-grid.wide .lk-row-actions .lk-btn{flex:1;}' +
        '#lokali-account .lkh-grid.two{grid-template-columns:repeat(2,minmax(0,1fr));}' +
      '}',
      '@media (max-width:991px){' +
        '#lokali-account .lkh{grid-template-columns:minmax(0,1fr);gap:0;}' +
        '#lokali-account .lkh-rail{display:none;}' +
        '#lokali-account .lkh-tabs{display:flex;gap:2px;position:sticky;z-index:20;background:#fff;border:1px solid #EEEDF6;border-radius:14px;padding:5px;margin-bottom:18px;}' +
        '#lokali-account .lkh-tab{all:unset;box-sizing:border-box;position:relative;flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:10px;cursor:pointer;font-family:' + "'Plus Jakarta Sans',sans-serif" + ';font-size:14px;font-weight:600;color:#4A4761;white-space:nowrap;}' +
        '#lokali-account .lkh-tab svg{width:18px;height:18px;}' +
        '#lokali-account .lkh-tab[aria-current="page"]{background:#EEE6FF;color:#6002EE;}' +
        '#lokali-account .lkh-gear{display:flex;margin-left:auto;}' +
        '#lokali-account .lkh-grid.wide{grid-template-columns:repeat(2,minmax(0,1fr));}' +
        '#lokali-account .lkh-grid .lk-row-actions .lk-btn span{display:none;}' +
        '#lokali-account .lkh-grid .lk-row-actions .lk-btn{width:44px;padding:0;}' +
      '}',
      '@media (max-width:640px){' +
        '#lokali-account .lkh-tab{flex:1 1 0;min-width:0;flex-direction:column;gap:3px;min-height:54px;padding:4px 2px;font-size:12px;}' +
        '#lokali-account .lkh-tab .lkh-n{position:absolute;top:3px;left:calc(50% + 6px);}' +
        '#lokali-account .lkh-cols{grid-template-columns:minmax(0,1fr);}' +
        '#lokali-account .lkh-tiles{grid-template-columns:repeat(2,minmax(0,1fr));}' +
        '#lokali-account .lkh-grid.wide{grid-template-columns:minmax(0,1fr);}' +
        '#lokali-account .lkh-grid .lk-row{flex-wrap:nowrap;}' +
        '#lokali-account .lkh-grid .lk-row-info{flex-basis:auto;}' +
        '#lokali-account .lkh-grid .lk-row-actions{width:auto;margin-top:0;}' +
        '#lokali-account .lkh-grid .lk-row-actions .lk-btn.primary{flex:0 0 44px;}' +
        '#lokali-account .lkh-next .lk-btn{width:100%;}' +
        '#lokali-account .lk-await-cta{margin-left:0;width:100%;}' +
        '#lokali-account .lk-input{width:100%;}' +
        '#lokali-account .lk-save-bar{bottom:8px;}' +
      '}',
      '@media (max-width:360px){#lokali-account .lkh-tab{padding:4px 0;}#lokali-account .lkh-bdg{gap:2px;}#lokali-account .lkh-grid .lk-thumb{width:52px;height:52px;}}'
    ].join('');
    document.head.appendChild(s);
  }

  // Toast with one action button (Undo). Stays 6s: long enough to read + reach.
  function toastAction(msg, label, fn) {
    var t = el('div', 'lk-ac-toast', '<span>' + esc(msg) + '</span>');
    var b = el('button', null, esc(label)); b.type = 'button';
    var gone = false;
    function close() { if (gone) return; gone = true; t.classList.remove('show'); setTimeout(function () { t.remove(); }, 320); }
    b.addEventListener('click', function () { close(); fn(); });
    t.appendChild(b);
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(close, 6000);
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
    if (h === 'following') h = 'saved'; // 2026-10-11: the header heart links to #following; the pane key stays 'saved'
    return PANES.indexOf(h) >= 0 ? h : 'home';
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

    // 2026-09-20 hub shell: sidebar at >=992px, visible tab row below it.
    // Settings stays out of the tab row (five tabs max on a phone) and sits
    // behind the gear button in the greeting; the sidebar lists everything.
    mount.style.maxWidth = '1180px';
    var pane = currentPane();
    var shell = el('div', 'lkh');
    var siteHead = document.querySelector('.header-wrapper.w-nav');
    var headH = siteHead ? siteHead.offsetHeight : 0;

    var rail = el('nav', 'lkh-rail'); rail.setAttribute('aria-label', 'Your account');
    rail.style.top = (headH + 12) + 'px';
    var tabs = el('nav', 'lkh-tabs'); tabs.setAttribute('aria-label', 'Your account');
    tabs.style.top = (headH + 8) + 'px';
    HUB_NAV.forEach(function (n) {
      var waiting = (n[0] === 'reviews' && state.awaiting.length) ? state.awaiting.length : 0;
      var nb = el('button', 'lkh-nav'); nb.type = 'button'; nb.setAttribute('data-nav', n[0]);
      nb.innerHTML = '<i>' + gIco(n[2], 18) + '</i>' + esc(n[1]) + (waiting ? '<span class="lkh-n">' + waiting + '</span>' : '');
      nb.addEventListener('click', function () { location.hash = n[0]; show(n[0]); });
      rail.appendChild(nb);
      if (n[0] === 'settings') return;
      var tb = el('button', 'lkh-tab'); tb.type = 'button'; tb.setAttribute('data-nav', n[0]);
      tb.innerHTML = gIco(n[2], 18) + esc(n[1]) + (waiting ? '<span class="lkh-n">' + waiting + '</span>' : '');
      tb.addEventListener('click', function () { location.hash = n[0]; show(n[0]); });
      tabs.appendChild(tb);
    });
    rail.appendChild(el('div', 'lkh-lbl', 'Shop'));
    var mk = el('a', 'lkh-nav', '<i>' + gIco(GI_BAG, 18) + '</i>The Market'); mk.href = '/the-market';
    rail.appendChild(mk);
    if (state.hasStorefront) {
      rail.appendChild(el('div', 'lkh-lbl', 'Sell'));
      var sd = el('a', 'lkh-nav', '<i>' + gIco(GI_STORE, 18) + '</i>Storefront dashboard'); sd.href = '/vendor-dashboard/dashboard';
      rail.appendChild(sd);
    }
    shell.appendChild(rail);

    var main = el('div', 'lkh-main');
    main.appendChild(tabs);

    // #96-SUGGEST — the Lokali admin panel (overview + specialty-suggestion
    // queue). Renders only when the is_admin-gated data actually loaded.
    if (state.admin) main.appendChild(renderAdminPanel());

    // panes
    main.appendChild(renderHome(acc, name, areaBits));
    main.appendChild(renderBadges());
    main.appendChild(renderSaved());
    main.appendChild(renderReviews());
    main.appendChild(renderSettings());
    shell.appendChild(main);
    mount.appendChild(shell);

    show(pane);
  }

  function show(pane) {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    PANES.forEach(function (p) {
      var node = mount.querySelector('.lk-pane[data-pane="' + p + '"]');
      if (node) node.classList.toggle('is-active', p === pane);
    });
    var navs = mount.querySelectorAll('[data-nav]');
    for (var i = 0; i < navs.length; i++) {
      if (navs[i].getAttribute('data-nav') === pane) navs[i].setAttribute('aria-current', 'page');
      else navs[i].removeAttribute('aria-current');
    }
  }

  // ── Admin-only home (francesca@golokali.com) ──────────────
  // Just the management panel + a sign-out. No stats, no storefront CTA, no
  // Saved/Reviews tabs or panes — none of the customer surfaces are built.
  function renderAdminHome(mount, acc, name) {
    injectAdminCSS(); // for the fallback note if the panel data isn't loaded

    // #181: with admin data loaded, the whole page is the sidebar shell.
    if (state.admin) { renderAdminShell(mount, acc, name); return; }

    var band = el('div', 'lk-band');
    band.appendChild(avatarNode(acc, 'lk-avatar'));
    var who = el('div');
    who.appendChild(el('div', 'lk-greet', 'Hi, ' + esc(name)));
    who.appendChild(el('div', 'lk-meta', 'Lokali admin'));
    band.appendChild(who);
    mount.appendChild(band);

    // Signed into this account but the is_admin-gated data didn't load — show
    // a note (never the shopping UI) so it isn't a blank page.
    var note = el('div', 'lk-admin');
    note.appendChild(el('p', 'lk-admin-sub',
      'Admin tools aren’t loading right now. Refresh the page. If it keeps happening, your admin access may need to be re-granted in Supabase.'));
    mount.appendChild(note);

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

  // ── #181 ADMIN HOME: sidebar shell (F 2026-09-19) ──────────────────────────
  // "Make a side menu like the vendor dashboard... stay with brand colors."
  // The rail copies the vendor dashboard's real values (Webflow "Section 11" +
  // "Dashboard BTN"): white, 230px, 16/12 padding, 8px-radius items, 16px/500
  // labels, #EEE6FF hover. Brand tokens from the site CSS: primary #6002EE,
  // purple-50 #EEE6FF, orange #FF8D00, orange-50 #FFF2DF, ink #1A1829, dusk
  // #4A4761, slate #8E8BA6, snow #F7F6FC, mist #EEEDF6. Orange stays OUT of the
  // nav (same rule as the vendor sidebar) and marks only what needs attention.
  // Three views: Today (what needs you + how Lokali is doing), Vendors (find one,
  // act on them), Insights (the analysis). Every queue and tool is the SAME
  // section code as before, re-homed; nothing about approvals changed.
  var ASH_ICO = {
    today: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M121 32C91.600 32 66 52 58.900 80.500L1.900 308.400C.6 313.500 0 318.700 0 323.900V416c0 35.300 28.700 64 64 64H448c35.300 0 64-28.700 64-64V323.900c0-5.200-.6-10.400-1.900-15.500l-57-227.900C446 52 420.400 32 391 32H121zm0 64H391l48 192H387.800c-12.100 0-23.200 6.800-28.600 17.700l-14.300 28.600c-5.400 10.800-16.500 17.700-28.600 17.700H195.800c-12.100 0-23.200-6.800-28.600-17.700l-14.300-28.600c-5.400-10.800-16.500-17.700-28.600-17.700H73l48-192z"/></svg>',
    vendors: '<svg viewBox="0 0 640 512" aria-hidden="true"><path fill="currentColor" d="M36.800 192H603.200c20.300 0 36.800-16.500 36.800-36.800c0-7.300-2.200-14.400-6.200-20.400L558.200 21.400C549.300 8 534.400 0 518.300 0H121.700c-16 0-31 8-39.900 21.400L6.200 134.700c-4 6.100-6.200 13.200-6.200 20.400C0 175.500 16.500 192 36.800 192zM64 224V384v80c0 26.500 21.500 48 48 48H336c26.500 0 48-21.500 48-48V384 224H320V384H128V224H64zm448 0V480c0 17.700 14.300 32 32 32s32-14.300 32-32V224H512z"/></svg>',
    insights: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M32 32c17.700 0 32 14.300 32 32V400c0 8.800 7.200 16 16 16H480c17.700 0 32 14.300 32 32s-14.300 32-32 32H80c-44.200 0-80-35.800-80-80V64C0 46.300 14.300 32 32 32zm96 96c0-17.700 14.300-32 32-32s32 14.300 32 32V320c0 17.700-14.300 32-32 32s-32-14.300-32-32V128zm128 64c17.700 0 32 14.300 32 32V320c0 17.700-14.300 32-32 32s-32-14.300-32-32V224c0-17.700 14.300-32 32-32zm96-96c0-17.700 14.300-32 32-32s32 14.300 32 32V320c0 17.700-14.300 32-32 32s-32-14.300-32-32V128z"/></svg>',
    prospects: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg>',
    marketing: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5"/><path d="M17.5 7a7 7 0 0 1 0 10"/><path d="M7 14l1 5h2.5l-.8-5"/></svg>',
    bars: '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M0 96C0 78.300 14.300 64 32 64H416c17.700 0 32 14.300 32 32s-14.300 32-32 32H32C14.300 128 0 113.700 0 96zM0 256c0-17.700 14.300-32 32-32H416c17.700 0 32 14.300 32 32s-14.300 32-32 32H32c-17.700 0-32-14.300-32-32zM448 416c0 17.700-14.300 32-32 32H32c-17.700 0-32-14.300-32-32s14.300-32 32-32H416c17.700 0 32 14.300 32 32z"/></svg>',
    check: '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M438.600 105.400c12.500 12.500 12.500 32.800 0 45.300l-256 256c-12.500 12.500-32.800 12.500-45.300 0l-128-128c-12.500-12.500-12.500-32.800 0-45.300s32.800-12.500 45.300 0L160 338.700 393.400 105.400c12.500-12.500 32.800-12.500 45.300 0z"/></svg>',
    moon: '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M223.5 32C100 32 0 132.3 0 256S100 480 223.5 480c60.6 0 115.5-24.2 155.8-63.4c5-4.9 6.3-12.5 3.1-18.7s-10.1-9.7-17-8.5c-9.8 1.7-19.8 2.6-30.1 2.6c-96.9 0-175.5-78.8-175.5-176c0-65.8 36-123.1 89.3-153.3c6.1-3.5 9.2-10.5 7.7-17.3s-7.3-11.9-14.3-12.5c-6.3-.5-12.6-.8-19-.8z"/></svg>',
    sun: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M361.5 1.2c5 2.1 8.6 6.6 9.6 11.9L391 121l107.9 19.8c5.3 1 9.8 4.6 11.9 9.6s1.5 10.7-1.6 15.2L446.9 256l62.3 90.3c3.1 4.5 3.7 10.2 1.6 15.2s-6.6 8.6-11.9 9.6L391 391 371.1 498.9c-1 5.3-4.6 9.8-9.6 11.9s-10.7 1.5-15.2-1.6L256 446.9l-90.3 62.3c-4.5 3.1-10.2 3.7-15.2 1.6s-8.6-6.6-9.6-11.9L121 391 13.1 371.1c-5.3-1-9.8-4.6-11.9-9.6s-1.5-10.7 1.6-15.2L65.1 256 2.8 165.7c-3.1-4.5-3.7-10.2-1.6-15.2s6.6-8.6 11.9-9.6L121 121 140.9 13.1c1-5.3 4.6-9.8 9.6-11.9s10.7-1.5 15.2 1.6L256 65.1 346.3 2.8c4.5-3.1 10.2-3.7 15.2-1.6zM160 256a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zm224 0a128 128 0 1 0 -256 0 128 128 0 1 0 256 0z"/></svg>',
    heart: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z"/></svg>',
  };

  function injectAdminShellCSS() {
    if (document.getElementById('lokali-admin-shell-styles')) return;
    var st = document.createElement('style');
    st.id = 'lokali-admin-shell-styles';
    var F = "'Plus Jakarta Sans',sans-serif";
    st.textContent =
      ".lk-ash{display:grid;grid-template-columns:236px minmax(0,1fr);gap:22px;align-items:start;font-family:" + F + ";color:#2B2640;}" +
      ".lk-ash *{box-sizing:border-box;font-family:inherit;}" +
      ".lk-ash-rail{position:sticky;background:#fff;border:0;border-radius:28px;padding:18px 14px;display:flex;flex-direction:column;min-height:520px;}" +
      ".lk-ash-brand{display:flex;align-items:center;gap:12px;padding:4px 8px 16px;}" +
      ".lk-ash-brand .mk{flex:0 0 40px;width:40px;height:44px;border-radius:20px 20px 9px 9px;background:#6002EE;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-style:italic;font-size:20px;}" +
      ".lk-ash-brand b{display:block;font-size:17px;font-weight:800;letter-spacing:-.02em;line-height:1.2;color:#2B2640;}" +
      ".lk-ash-brand small{display:block;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#5E5873;margin-top:2px;}" +
      ".lk-ash-nav{all:unset;box-sizing:border-box;display:flex;align-items:center;width:100%;border-radius:12px;margin-bottom:2px;padding:2px 8px;cursor:pointer;font-family:" + F + ";font-size:15px;font-weight:600;line-height:26px;color:#4A4761;}" +
      ".lk-ash-nav i{width:40px;height:40px;flex:0 0 40px;display:flex;align-items:center;justify-content:center;color:#4A4761;}" +
      ".lk-ash-nav i svg{width:18px;height:18px;}" +
      ".lk-ash-nav:hover{background:#EEE6FF;}" +
      ".lk-ash-nav:focus-visible{outline:2px solid #6002EE;outline-offset:1px;}" +
      /* current page = two signals: tint + violet, heavier label */
      ".lk-ash-nav[aria-current='page']{background:#EEE6FF;color:#6002EE;font-weight:800;}" +
      ".lk-ash-nav[aria-current='page'] i{color:#6002EE;}" +
      ".lk-ash-count{margin-left:auto;font-size:11px;font-weight:700;line-height:18px;background:#A63D74;color:#fff;border-radius:999px;padding:0 8px;}" +
      ".lk-ash-count[hidden]{display:none;}" +
      ".lk-ash-foot{margin-top:auto;padding-top:14px;border-top:1px solid #F1EAFD;display:flex;flex-direction:column;}" +
      ".lk-ash-lbl{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#5E5873;padding:8px 12px 4px;}" +
      ".lk-ash-ext{font-size:14px;font-weight:600;color:#4A4761;text-decoration:none;padding:0 12px;min-height:40px;border-radius:12px;display:flex;align-items:center;justify-content:space-between;}" +
      ".lk-ash-ext:hover{background:#EEE6FF;color:#6002EE;}" +
      ".lk-ash-chip{display:flex;align-items:center;gap:10px;padding:10px;margin-top:12px;border-radius:18px;background:#F7F2FF;}" +
      "#lokali-account .lk-ash-chip .lk-avatar{width:34px;height:34px;min-height:0;flex:0 0 34px;font-size:13px;aspect-ratio:1/1;}" + /* id-prefixed: the base #lokali-account .lk-avatar rule set height 52 and made it an oval (F 2026-10-10) */
      ".lk-ash-name{font-size:13px;font-weight:700;color:#4A4761;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".lk-ash-role{font-size:12px;font-weight:600;color:#5E5873;}" +
      ".lk-ash-out{all:unset;cursor:pointer;margin-left:auto;font-size:12.5px;font-weight:600;color:#6002EE;padding:8px 6px;border-radius:8px;font-family:" + F + ";}" +
      ".lk-ash-out:hover{background:#EEE6FF;}" +
      ".lk-ash-main{min-width:0;}" +
      ".lk-ash-view[hidden]{display:none;}" +
      ".lk-ash-h{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px;margin:2px 0 18px;}" +
      ".lk-ash-h h2{font-size:clamp(34px,3.6vw,50px);line-height:1;font-weight:800;letter-spacing:-.045em;margin:0;color:#2B2640;}" +
      ".lk-ash-h p{font-size:15px;font-weight:600;color:#5E5873;margin:6px 0 0;}" +
      ".lk-ash-sec{margin:0 0 26px;}" +
      ".lk-ash-sech{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0 0 10px;}" +
      ".lk-ash-sech h3{font-size:22px;font-weight:800;letter-spacing:-.03em;margin:0;color:#2B2640;}" +
      ".lk-ash-sech span{font-size:13px;font-weight:600;color:#5E5873;}" +
      ".lk-ash-sech button{all:unset;cursor:pointer;margin-left:auto;font-size:13px;font-weight:600;color:#6002EE;font-family:" + F + ";}" +
      ".lk-ash-clear{display:flex;gap:12px;align-items:center;background:#EAFAF2;border:1px solid #BFE9D2;border-radius:14px;padding:16px 18px;color:#14623F;font-size:14.5px;font-weight:600;}" +
      ".lk-ash-clear svg{width:18px;height:18px;flex:0 0 auto;}" +
      ".lk-ash-clear small{display:block;font-weight:500;font-size:12.5px;color:#2D7A58;}" +
      ".lk-ash-clear[hidden]{display:none;}" +
      ".lk-ash-queues{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}" +
      ".lk-ash-q{font-size:12.5px;font-weight:600;color:#4A4761;background:#F7F6FC;border:1px solid #F7F6FC;border-radius:999px;padding:5px 11px;}" +
      ".lk-ash-q b{font-weight:800;color:#4A4761;margin-left:5px;}" +
      ".lk-ash-q.on{background:#FBE9F2;border-color:#F5CFE1;color:#A63D74;}.lk-ash-q.on b{color:#A63D74;}" +
      /* queue sections inside Today: full width, amber edge = needs you */
      ".lk-ash-needs{display:flex;flex-direction:column;gap:10px;}" +
      ".lk-ash-needs .lk-admin-section{background:#fff;border:0;box-shadow:inset 0 0 0 2px #FBE9F2;border-radius:24px;}" +
      ".lk-ash-needs .lk-admin-qcount{background:#FBE9F2;color:#A63D74;}" +
      ".lk-ash-pulse{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;background:transparent;border:0;}" +
      ".lk-ash-kp{padding:14px 16px;border-left:1px solid #EEEDF6;}" +
      ".lk-ash-kp:first-child{border-left:0;}" +
      ".lk-ash-kp .l{font-size:13px;font-weight:600;color:#5E5873;}" +
      ".lk-ash-kp .n{font-size:34px;font-weight:800;font-style:italic;letter-spacing:-.04em;line-height:1.1;font-variant-numeric:tabular-nums;margin:4px 0;color:#2B2640;}" +
      ".lk-ash-kp .d{font-size:13px;font-weight:700;color:#5E5873;line-height:1.45;}" +
      ".lk-ash-kp .d.up{color:#1A6640;}.lk-ash-kp .d.warn{color:#A63D74;}" +
      ".lk-ash-list{background:#fff;border:0;border-radius:28px;overflow:hidden;padding:6px 8px;}" +
      ".lk-ash-li{display:flex;gap:10px;padding:11px 16px;border-top:1px solid #EEEDF6;font-size:14px;line-height:1.5;color:#1A1829;}" +
      ".lk-ash-li:first-child{border-top:0;}" +
      ".lk-ash-dot{width:8px;height:8px;border-radius:50%;flex:0 0 8px;margin-top:7px;background:#D4BFF9;}" +
      ".lk-ash-dot.good{background:#5DCAA5;}.lk-ash-dot.bad{background:#A63D74;}" +
      ".lk-ash-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;align-items:center;padding:16px 14px;border-top:1px solid #F1EAFD;}" +
      ".lk-ash-row:first-child{border-top:0;}" +
      ".lk-ash-row b{display:block;font-size:16px;font-weight:800;letter-spacing:-.01em;overflow-wrap:anywhere;}" +
      ".lk-ash-row small{display:block;font-size:14px;color:#4A4761;margin-top:4px;line-height:1.5;}" +
      ".lk-ash-meta{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px;font-weight:600;color:#5E5873;margin-top:6px;}" +
      ".lk-ash-acts{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;}" +
      ".lk-ash-btn{all:unset;box-sizing:border-box;cursor:pointer;font-family:" + F + ";font-size:14px;font-weight:700;color:#2B2640;background:#fff;border:2px solid #E5D4FD;border-radius:999px;padding:0 16px;min-height:44px;display:inline-flex;align-items:center;text-decoration:none;}" +
      ".lk-ash-btn:hover{background:#F7F2FF;border-color:#C9B2F4;color:#2B2640;}" +
      ".lk-ash-btn:focus-visible{outline:2px solid #6002EE;outline-offset:1px;}" +
      ".lk-ash-btn.primary{background:#6002EE;border-color:#6002EE;color:#fff;}" +
      ".lk-ash-btn.primary:hover{background:#4A00B8;border-color:#4A00B8;color:#fff;}" +
      ".lk-ash-pill{font-size:12px;font-weight:800;border-radius:999px;padding:3px 10px;}" +
      ".lk-ash-pill.working{background:#E4F7EE;color:#1A6640;}.lk-ash-pill.seen{background:#E6F0FC;color:#1D5A9E;}" +
      ".lk-ash-pill.stalls,.lk-ash-pill.low,.lk-ash-pill.unseen{background:#FBE9F2;color:#A63D74;}.lk-ash-pill.notlive{background:#EEEDF6;color:#4A4761;}" +
      ".lk-ash-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px;}" +
      ".lk-ash-search{flex:1 1 220px;font-size:15px;border:2px solid #E5D4FD;border-radius:14px;padding:0 14px;min-height:48px;background:#fff;color:#2B2640;}" +
      ".lk-ash-fchip{all:unset;box-sizing:border-box;cursor:pointer;font-family:" + F + ";font-size:14px;font-weight:700;color:#2B2640;background:#fff;border:2px solid #E5D4FD;border-radius:999px;padding:0 14px;min-height:40px;display:inline-flex;align-items:center;gap:7px;}" +
      ".lk-ash-fchip[aria-pressed='true']{background:#6002EE;border-color:#6002EE;color:#fff;}" +
      ".lk-ash-panel{margin:0 0 16px;}" +
      ".lk-ash-panel[hidden]{display:none;}" +
      ".lk-ash-note{font-size:13px;color:#8E8BA6;padding:14px 16px;}" +
      ".lk-ash-bar{display:none;}" +
      ".lk-ash-ov{display:none;}" +
      /* #208 Prospects view */
      ".lk-ash-pform{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px 14px;background:#fff;border:0;border-radius:28px;padding:24px;}" +
      ".lk-ash-pf{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#2B2640;min-width:0;}" +
      ".lk-ash-pf.full{grid-column:1/-1;}" +
      ".lk-ash-pf .lk-ash-search{flex:none;width:100%;}" +
      "textarea.lk-ash-search{padding:10px 12px;min-height:auto;line-height:1.5;resize:vertical;font-family:inherit;}" +
      "select.lk-ash-search{font-family:inherit;}" +
      ".lk-ash-psnap{flex-direction:row;flex-wrap:wrap;align-items:center;gap:10px;font-weight:500;color:#8E8BA6;}" +
      ".lk-ash-pform .lk-ash-acts{flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;}" +
      ".lk-ash-psnap .lk-ash-btn.is-busy{opacity:.6;pointer-events:none;}" +
      ".lk-ash-pmsg{font-size:13px;color:#4A4761;}" +
      ".lk-ash-prow{grid-template-columns:minmax(0,1fr) auto;}" +
      ".lk-ash-pdetail{grid-column:1/-1;border-top:1px dashed #EEEDF6;padding-top:12px;display:flex;flex-direction:column;gap:10px;}" +
      ".lk-ash-pdetail .lk-ash-sech{margin:0;}" +
      ".lk-ash-pdetail .lk-ash-search{flex:none;width:100%;}" +
      ".lk-ash-btn[hidden],.lk-ash-search[hidden]{display:none;}" +
      ".lk-ash-pnote{margin:0;font-size:13.5px;color:#4A4761;background:#F7F6FC;border-radius:10px;padding:10px 12px;}" +
      ".lk-ash-pbody{font-size:14.5px;}" +
      ".lk-ash-pwhen{margin:0;font-size:12.5px;color:#8E8BA6;}" +
      ".lk-ash-psent{font-size:13px;color:#4A4761;}.lk-ash-psent summary{cursor:pointer;font-weight:600;color:#6002EE;}" +
      ".lk-ash-psent pre{white-space:pre-wrap;font-family:inherit;font-size:13px;background:#F7F6FC;border-radius:10px;padding:10px 12px;margin:6px 0 10px;}" +
      ".lk-ash-pmore{padding-top:4px;border-top:1px solid #EEEDF6;}" +
      "@media (max-width:991px){" +
        ".lk-ash{grid-template-columns:minmax(0,1fr);gap:14px;}" +
        ".lk-ash-bar{display:flex;align-items:center;gap:10px;background:#fff;border:0;border-radius:18px;padding:6px 8px 6px 16px;font-size:15px;font-weight:800;}" +
        ".lk-ash-burger{all:unset;cursor:pointer;margin-left:auto;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:10px;color:#1A1829;}" +
        ".lk-ash-burger:hover{background:#EEE6FF;}.lk-ash-burger svg{width:20px;height:20px;}" +
        ".lk-ash-rail{position:fixed !important;top:0 !important;left:0;bottom:0;z-index:3000;width:270px;max-width:86vw;border-radius:0;border:0;border-right:1px solid #EEEDF6;transform:translateX(-102%);transition:transform .22s ease;overflow-y:auto;min-height:0;}" +
        ".lk-ash.is-open .lk-ash-rail{transform:none;box-shadow:12px 0 40px rgba(74,50,140,.18);}" +
        ".lk-ash.is-open .lk-ash-ov{display:block;position:fixed;inset:0;z-index:2999;background:rgba(74,71,97,.28);}" +
        ".lk-ash-pulse{grid-template-columns:1fr 1fr;}" +
        ".lk-ash-kp{border-left:0;border-top:1px solid #EEEDF6;}.lk-ash-kp:nth-child(-n+2){border-top:0;}.lk-ash-kp:nth-child(even){border-left:1px solid #EEEDF6;}" +
        ".lk-ash-row{grid-template-columns:minmax(0,1fr);}.lk-ash-acts{justify-content:flex-start;}" +
        /* phone targets: 44px with space between (WCAG 2.5.5 / Apple default) */
        ".lk-ash-btn,.lk-ash-fchip,.lk-ash-search{min-height:44px;}.lk-ash-acts{gap:8px;}" +
        ".lk-ash-h h2{font-size:21px;}" +
      "}" +
      "@media (prefers-reduced-motion:reduce){.lk-ash-rail{transition:none;}}";
    document.head.appendChild(st);
  }

  // Admin home v2 (2026-10-10): the Today view's own styles. Shoppers = teal,
  // vendors = rose, violet stays the action colour; no orange beside violet.
  function injectAdminHomeCSS() {
    if (document.getElementById('lokali-admin-home-styles')) return;
    var st = document.createElement('style');
    st.id = 'lokali-admin-home-styles';
    var F = "'Plus Jakarta Sans',sans-serif";
    st.textContent =
      ".lk-ah-date{font-size:12.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#8E8BA6;margin:0 0 6px;}" +
      ".lk-ash-h h2.lk-ah-story{font-size:25px;line-height:1.25;letter-spacing:-.02em;font-weight:800;max-width:32ch;text-wrap:balance;margin:0;}" +
      ".lk-ash-view .lk-ash-h{margin:4px 0 20px;}" +
      ".lk-ah-story em{font-style:normal;color:#6002EE;}" +
      ".lk-ah-needs{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:0;border-radius:24px;padding:14px 18px;margin:0 0 20px;}" +
      ".lk-ah-needs .lk-ash-queues{margin:0;flex:1 1 auto;}" +
      ".lk-ah-st{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:800;color:#1A6640;white-space:nowrap;}" +
      ".lk-ah-st svg{width:18px;height:18px;flex:0 0 auto;}" +
      ".lk-ah-st.wait{color:#A63D74;}" +
      ".lk-ah-needs .lk-ash-btn{margin-left:auto;}" +
      ".lk-ash-needs[hidden]{display:none;}" +
      ".lk-ash-needs{margin:0 0 20px;}" +
      ".lk-ah-sides{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:0 0 20px;}" +
      ".lk-ah-side{background:#fff;border:0;border-radius:28px;padding:28px;min-width:0;}" +
      ".lk-ah-eyebrow{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;}" +
      ".lk-ah-dot{width:10px;height:10px;border-radius:50%;}" +
      ".lk-ah-side.shop .lk-ah-eyebrow{color:#0F6B74;}.lk-ah-side.shop .lk-ah-dot{background:#0F6B74;}" +
      ".lk-ah-side.vend .lk-ah-eyebrow{color:#A63D74;}.lk-ah-side.vend .lk-ah-dot{background:#A63D74;}" +
      ".lk-ah-side h3{font-size:26px;font-weight:800;letter-spacing:-.03em;line-height:1.15;margin:12px 0 6px;color:#2B2640;text-wrap:balance;}" +
      ".lk-ah-sub{font-size:14px;color:#5E5873;margin:0 0 18px;max-width:58ch;line-height:1.6;}" +
      ".lk-ah-steps{display:grid;gap:9px;}" +
      ".lk-ah-step{display:grid;grid-template-columns:150px minmax(0,1fr) 56px;align-items:center;gap:12px;font-size:14px;}" +
      ".lk-ah-step .lab{color:#2B2640;font-weight:700;}" +
      ".lk-ah-step.drop .lab{color:#1A1829;font-weight:700;}" +
      ".lk-ah-step .bar{height:14px;background:#F3EBFF;border-radius:999px;overflow:hidden;}" +
      ".lk-ah-step .bar i{display:block;height:100%;border-radius:999px;}" +
      ".lk-ah-side.shop .bar{background:#E0F4F5;}.lk-ah-side.vend .bar{background:#FBE9F2;}.lk-ah-side.shop .bar i{background:#0F6B74;}.lk-ah-side.vend .bar i{background:#A63D74;}" +
      ".lk-ah-step .n{text-align:right;font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;color:#2B2640;}" +
      ".lk-ah-dropnote{margin-top:16px;padding:14px 16px;border-radius:18px;font-size:14px;line-height:1.6;color:#2B2640;}" +
      ".lk-ah-dropnote[hidden]{display:none;}" +
      ".lk-ah-side.shop .lk-ah-dropnote{background:#E0F4F5;}.lk-ah-side.vend .lk-ah-dropnote{background:#FBE9F2;}" +
      ".lk-ah-dropnote a{color:inherit;font-weight:600;text-decoration:underline;text-underline-offset:2px;}" +
      ".lk-ah-foot{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}" +
      ".lk-ah-prompts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;}" +
      ".lk-ah-prompt{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;background:#fff;border:0;border-radius:24px;padding:22px;min-width:0;font-family:" + F + ";color:#2B2640;text-align:left;}" +
      "button.lk-ah-prompt{cursor:pointer;transition:box-shadow .15s,transform .15s;}" +
      "button.lk-ah-prompt:hover{box-shadow:0 10px 24px rgba(96,2,238,.10);transform:translateY(-2px);}" +
      "button.lk-ah-prompt:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}" +
      ".lk-ah-tag{align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px;}" +
      ".lk-ah-tag.shop{background:#E0F4F5;color:#0F6B74;}.lk-ah-tag.vend{background:#FBE9F2;color:#A63D74;}.lk-ah-tag.both{background:#EEE6FF;color:#6002EE;}" +
      ".lk-ah-prompt h4{font-size:18px;font-weight:800;letter-spacing:-.015em;line-height:1.3;margin:0;text-wrap:balance;}" +
      ".lk-ah-prompt p{margin:0;color:#5E5873;font-size:14px;line-height:1.55;}" +
      ".lk-ah-prompt .ev{font-size:13px;font-weight:700;color:#2B2640;border-top:1px solid #F1EAFD;padding-top:10px;margin-top:auto;line-height:1.5;}" +
      ".lk-ah-tile{all:unset;box-sizing:border-box;display:block;cursor:pointer;padding:18px;border-radius:20px;background:#F7F2FF;font-family:" + F + ";min-width:0;transition:transform .15s;}" +
      ".lk-ah-tile:first-child{border-left:0;}.lk-ah-tile.lk-ash-kp{border-left:0;}" +
      ".lk-ah-tile:hover{background:#F1E8FF;transform:translateY(-2px);}" +
      ".lk-ah-tile:focus-visible{outline:2px solid #6002EE;outline-offset:-2px;}" +
      ".lk-ah-tile .n small{font-size:15px;font-style:normal;font-weight:700;color:#5E5873;letter-spacing:0;}" +
      ".lk-ah-tile .d.warn{color:#A63D74;}" +
      ".lk-ah-spark{display:block;width:100%;height:34px;margin-top:8px;}" +
      ".lk-ah-card{background:#fff;border:0;border-radius:28px;padding:28px;min-width:0;}" +
      ".lk-ah-card[hidden]{display:none;}" +
      ".lk-ah-pulsewrap{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:22px;align-items:start;}" +
      ".lk-ah-chartwrap{position:relative;}" +
      ".lk-ah-chart{display:block;width:100%;height:auto;font-family:" + F + ";}" +
      ".lk-ah-tip{position:absolute;pointer-events:none;background:#6002EE;color:#fff;font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;transform:translate(-50%,-115%);white-space:nowrap;}" +
      ".lk-ah-tip[hidden]{display:none;}" +
      ".lk-ah-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#4A4761;margin-top:8px;}" +
      ".lk-ah-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:-1px;margin-right:6px;}" +
      ".lk-ah-legend i.a{background:#6002EE;}.lk-ah-legend i.b{background:#D9D5E8;}" +
      ".lk-ah-annot{display:grid;gap:10px;font-size:13px;color:#4A4761;line-height:1.5;}" +
      ".lk-ah-annot div{padding:12px 14px;border-radius:16px;background:#F7F2FF;}" +
      ".lk-ah-annot b{color:#1A1829;}" +
      ".lk-ah-two{display:grid;grid-template-columns:3fr 2fr;gap:20px;margin:0 0 20px;}" +
      ".lk-ah-two[hidden]{display:none;}" +
      ".lk-ah-dist{display:grid;gap:5px;margin-top:4px;}" +
      ".lk-ah-drow{display:grid;grid-template-columns:170px minmax(0,1fr) 44px 30px;gap:10px;align-items:center;font-size:13px;}" +
      ".lk-ah-drow .nm{color:#4A4761;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      ".lk-ah-drow .bar{height:10px;background:#F3EBFF;border-radius:999px;overflow:hidden;}" +
      ".lk-ah-drow .bar i{display:block;height:100%;background:#C9B2F4;border-radius:999px;}" +
      ".lk-ah-drow.hot .bar i{background:#6002EE;}" +
      ".lk-ah-drow .n{text-align:right;font-weight:600;font-variant-numeric:tabular-nums;}" +
      ".lk-ah-drow .c{font-size:11px;color:#1A6640;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;}" +
      ".lk-ah-drow .c.none{color:#5E5873;font-weight:500;}" +
      ".lk-ah-distfoot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:#4A4761;}" +
      ".lk-ah-wins{display:grid;gap:10px;margin-top:4px;}" +
      ".lk-ah-win{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 16px;border-radius:20px;background:#E4F7EE;}" +
      ".lk-ah-win .ic{width:36px;height:36px;border-radius:18px;background:#fff;color:#1A6640;display:flex;align-items:center;justify-content:center;}" +
      ".lk-ah-win .ic svg{width:16px;height:16px;}" +
      ".lk-ah-win b{display:block;font-size:15px;font-weight:800;overflow-wrap:anywhere;}" +
      ".lk-ah-win small{display:block;color:#4A4761;font-size:13px;line-height:1.45;}" +
      ".lk-ah-win .lk-ash-btn{min-height:40px;padding:0 14px;font-size:13px;}" +
      /* drawer */
      ".lk-ah-drawer{position:fixed;inset:0;z-index:4000;font-family:" + F + ";}" +
      ".lk-ah-drawer[hidden]{display:none;}" +
      ".lk-ah-scrim{position:absolute;inset:0;background:rgba(74,29,176,.18);}" +
      ".lk-ah-panel{position:absolute;top:0;right:0;bottom:0;width:min(540px,100%);background:#fff;border-left:1px solid #EEEDF6;padding:24px 26px 40px;overflow:auto;box-shadow:-12px 0 40px rgba(26,24,41,.14);color:#1A1829;}" +
      ".lk-ah-ph{display:flex;align-items:flex-start;gap:12px;margin:0 0 16px;}" +
      ".lk-ah-ph h3{font-size:18px;font-weight:700;margin:0;}" +
      ".lk-ah-ph p{margin:4px 0 0;color:#4A4761;font-size:13px;line-height:1.5;}" +
      ".lk-ah-x{all:unset;box-sizing:border-box;cursor:pointer;margin-left:auto;flex:0 0 auto;border:2px solid #E5D4FD;border-radius:22px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:#4A4761;font-size:20px;}" +
      ".lk-ah-x:hover{background:#EEE6FF;color:#6002EE;}.lk-ah-x:focus-visible{outline:2px solid #6002EE;outline-offset:1px;}" +
      ".lk-ah-table{width:100%;border-collapse:collapse;font-size:13px;}" +
      ".lk-ah-table th{text-align:left;color:#8E8BA6;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:6px 0 6px 14px;border-bottom:1px solid #EEEDF6;}" +
      ".lk-ah-table td{padding:8px 0 8px 14px;border-bottom:1px solid #F1EFF8;vertical-align:top;overflow-wrap:anywhere;}.lk-ah-table th:first-child,.lk-ah-table td:first-child{padding-left:0;}" +
      ".lk-ah-table .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}" +
      ".lk-ah-minibar{height:8px;min-width:80px;background:#F1EFF8;border-radius:3px;overflow:hidden;}" +
      ".lk-ah-minibar i{display:block;height:100%;background:#0F6B74;border-radius:3px;}" +
      ".lk-ah-note{background:#F6F1FF;border-radius:10px;padding:12px 14px;font-size:13px;color:#4A4761;margin:16px 0;line-height:1.5;}" +
      ".lk-ah-note b{color:#1A1829;}" +
      ".lk-ah-h4{font-size:13px;font-weight:700;color:#1A1829;margin:18px 0 6px;}" +
      ".lk-ah-pbody .lk-ash-list{margin-top:4px;}" +
      "body.lk-ah-lock{overflow:hidden;}" +
      "@media (max-width:1100px){.lk-ah-prompts{grid-template-columns:1fr;}.lk-ah-two{grid-template-columns:1fr;}.lk-ah-pulsewrap{grid-template-columns:1fr;}}" +
      "@media (max-width:991px){" +
        ".lk-ah-sides{grid-template-columns:1fr;gap:14px;margin:0 0 14px;}" +
        ".lk-ah-side,.lk-ah-card{padding:20px;border-radius:24px;}" +
        ".lk-ah-needs{padding:12px 14px;margin:0 0 14px;}" +
        ".lk-ah-two{gap:14px;margin:0 0 18px;}" +
        ".lk-ah-prompts{gap:10px;}.lk-ah-prompt{padding:14px 16px;}" +
        ".lk-ah-pulsewrap{gap:16px;}" +
        ".lk-ash-view .lk-ash-h{margin:2px 0 16px;}" +
        ".lk-ah-dropnote{padding:11px 12px;}" +
        ".lk-ash-h h2.lk-ah-story{font-size:21px;}" +
        ".lk-ah-step{grid-template-columns:118px minmax(0,1fr) 44px;}" +
        ".lk-ah-drow{grid-template-columns:118px minmax(0,1fr) 40px 26px;}" +
        ".lk-ah-needs .lk-ash-btn{margin-left:0;}" +
        ".lk-ah-win{grid-template-columns:36px minmax(0,1fr);}.lk-ah-win .lk-ash-btn{grid-column:2;justify-self:start;}" +
        ".lk-ah-panel{padding:18px 16px 40px;}" +
      "}" +
      "@media (prefers-reduced-motion:reduce){button.lk-ah-prompt{transition:none;}}";
    document.head.appendChild(st);
  }

  // Admin dark mode (F 2026-10-10: "exactly how it shows on the html preview").
  // Same tokens as the mockup's dark theme; applied by html.lk-dark, which the
  // rail toggle sets (remembered per browser, system preference by default).
  function injectAdminDarkCSS() {
    if (document.getElementById('lokali-admin-dark-styles')) return;
    var st = document.createElement('style');
    st.id = 'lokali-admin-dark-styles';
    var D = 'html.lk-dark ';
    st.textContent =
      D + "body{background:#1B1830;}" +
      D + ".lk-ash,html.lk-dark .lk-ash *{color-scheme:dark;}" +
      D + ".lk-ash{color:#F3F1FA;}" +
      D + ".lk-ash-rail,html.lk-dark .lk-ash-bar,html.lk-dark .lk-ash-list,html.lk-dark .lk-ah-side,html.lk-dark .lk-ah-card,html.lk-dark .lk-ah-needs,html.lk-dark .lk-ash-pulse,html.lk-dark .lk-ash-pform,html.lk-dark .lk-ah-prompt,html.lk-dark .lk-ash-clear{background:#242039;border-color:#352F4F;}" +
      D + ".lk-ash-rail{border-color:#352F4F;}" +
      D + ".lk-ash-brand,html.lk-dark .lk-ash-nav,html.lk-dark .lk-ash-h h2,html.lk-dark .lk-ash-sech h3,html.lk-dark .lk-ash-li,html.lk-dark .lk-ash-row b,html.lk-dark .lk-ash-kp .n,html.lk-dark .lk-ah-side h3,html.lk-dark .lk-ah-step .n,html.lk-dark .lk-ah-step.drop .lab,html.lk-dark .lk-ah-dropnote,html.lk-dark .lk-ah-prompt,html.lk-dark .lk-ah-annot b,html.lk-dark .lk-ah-note b,html.lk-dark .lk-ah-panel,html.lk-dark .lk-ah-ph h3,html.lk-dark .lk-ah-h4,html.lk-dark .lk-ash-burger,html.lk-dark .lk-ash-search,html.lk-dark .lk-ash-pbody,html.lk-dark .lk-admin-title,html.lk-dark .lk-admin-qtitle,html.lk-dark .lk-admin-row-l1,html.lk-dark .lk-admin-stat-num,html.lk-dark .lk-admin-input,html.lk-dark .lk-ah-win b{color:#F3F1FA;}" +
      D + ".lk-ash-nav i,html.lk-dark .lk-ash-name,html.lk-dark .lk-ash-ext,html.lk-dark .lk-ash-row small,html.lk-dark .lk-ash-meta,html.lk-dark .lk-ash-kp .l,html.lk-dark .lk-ash-q,html.lk-dark .lk-ash-fchip,html.lk-dark .lk-ash-pf,html.lk-dark .lk-ash-pmsg,html.lk-dark .lk-ash-pnote,html.lk-dark .lk-ash-psent,html.lk-dark .lk-ah-sub,html.lk-dark .lk-ah-step .lab,html.lk-dark .lk-ah-prompt p,html.lk-dark .lk-ah-ph p,html.lk-dark .lk-ah-note,html.lk-dark .lk-ah-annot,html.lk-dark .lk-ah-legend,html.lk-dark .lk-ah-distfoot,html.lk-dark .lk-ah-drow .nm,html.lk-dark .lk-ah-win small,html.lk-dark .lk-ah-x,html.lk-dark .lk-admin-sub,html.lk-dark .lk-admin-decline{color:#C9C4DD;}" +
      D + ".lk-ash-lbl,html.lk-dark .lk-ash-role,html.lk-dark .lk-ash-h p,html.lk-dark .lk-ash-sech span,html.lk-dark .lk-ash-kp .d,html.lk-dark .lk-ash-q b,html.lk-dark .lk-ash-note,html.lk-dark .lk-ash-pwhen,html.lk-dark .lk-ah-date,html.lk-dark .lk-ah-prompt .ev,html.lk-dark .lk-ah-table th,html.lk-dark .lk-ah-tile .n small,html.lk-dark .lk-ah-drow .c.none,html.lk-dark .lk-admin-empty,html.lk-dark .lk-admin-row-l2,html.lk-dark .lk-admin-row-l1 span,html.lk-dark .lk-admin-stat-lbl{color:#9B96B3;}" +
      D + ".lk-ash-nav:hover,html.lk-dark .lk-ash-ext:hover,html.lk-dark .lk-ash-out:hover,html.lk-dark .lk-ash-burger:hover,html.lk-dark .lk-ah-x:hover{background:#2F2750;}" +
      D + ".lk-ash-nav[aria-current='page']{background:#2F2750;color:#C9B0FF;}html.lk-dark .lk-ash-nav[aria-current='page'] i{color:#C9B0FF;}" +
      D + ".lk-ash-brand small{color:#9B96B3;}html.lk-dark .lk-ash-brand b{color:#F3F1FA;}html.lk-dark .lk-ash-chip{background:#29223F;}" +
      D + ".lk-ash-out,html.lk-dark .lk-ash-sech button,html.lk-dark .lk-ah-story em,html.lk-dark .lk-ash-psent summary{color:#C9B0FF;}" +
      D + ".lk-ash-foot,html.lk-dark .lk-ash-chip,html.lk-dark .lk-ash-li,html.lk-dark .lk-ash-row,html.lk-dark .lk-ash-kp,html.lk-dark .lk-ash-pmore,html.lk-dark .lk-ah-table th,html.lk-dark .lk-ah-table td,html.lk-dark .lk-ah-prompt .ev,html.lk-dark .lk-ah-pdetail,html.lk-dark .lk-admin-row,html.lk-dark .lk-admin-row-done,html.lk-dark .lk-admin-empty{border-color:#352F4F;}" +
      D + ".lk-ash-btn,html.lk-dark .lk-ash-fchip,html.lk-dark .lk-ash-q,html.lk-dark .lk-ash-search,html.lk-dark .lk-ah-x,html.lk-dark .lk-admin-input,html.lk-dark .lk-admin-decline{background:#242039;border-color:#352F4F;color:#F3F1FA;}" +
      D + ".lk-ash-btn:hover,html.lk-dark .lk-ash-fchip[aria-pressed='true']{background:#2F2750;border-color:#4A3A7A;color:#C9B0FF;}" +
      D + ".lk-ash-btn.primary{background:#6002EE;border-color:#6002EE;color:#fff;}html.lk-dark .lk-ash-btn.primary:hover{background:#7A2BFF;border-color:#7A2BFF;}" +
      D + ".lk-ah-tile:hover,html.lk-dark .lk-ash-pnote,html.lk-dark .lk-ash-psent pre,html.lk-dark .lk-ah-win,html.lk-dark .lk-admin-stat{background:#29223F;}" +
      D + ".lk-ash-q.on,html.lk-dark .lk-ash-count{background:#3E2638;border-color:#55304A;color:#F0A3C9;}html.lk-dark .lk-ash-q.on b{color:#F0A3C9;}" +
      D + ".lk-ash-clear{background:#1F3A2E;border-color:#2B5A42;color:#8FD9B0;}html.lk-dark .lk-ash-clear small{color:#8FD9B0;}" +
      D + ".lk-ah-st{color:#8FD9B0;}html.lk-dark .lk-ah-st.wait{color:#F0A3C9;}" +
      D + ".lk-ash-pill.working{background:#1F3A2E;color:#8FD9B0;}html.lk-dark .lk-ash-pill.seen{background:#2F2750;color:#C9B0FF;}html.lk-dark .lk-ash-pill.stalls,html.lk-dark .lk-ash-pill.low,html.lk-dark .lk-ash-pill.unseen{background:#3E2638;color:#F0A3C9;}html.lk-dark .lk-ash-pill.notlive{background:#2C273F;color:#C9C4DD;}" +
      D + ".lk-ash-kp .d.up,html.lk-dark .lk-ah-drow .c{color:#8FD9B0;}html.lk-dark .lk-ash-kp .d.warn,html.lk-dark .lk-ah-tile .d.warn{color:#F0A3C9;}" +
      D + ".lk-ash-dot{background:#4A3A7A;}html.lk-dark .lk-ash-dot.good{background:#8FD9B0;}html.lk-dark .lk-ash-dot.bad{background:#F0A3C9;}" +
      D + ".lk-ash-needs .lk-admin-section,html.lk-dark .lk-admin-section{background:#242039;border-color:#352F4F;}html.lk-dark .lk-ash-needs .lk-admin-section{border-left-color:#F0A3C9;}" +
      D + ".lk-ash-needs .lk-admin-qcount{background:#3E2638;color:#F0A3C9;}" +
      D + ".lk-admin-approve{background:#1F3A2E;border-color:#2B5A42;color:#8FD9B0;}" +
      /* the two sides */
      D + ".lk-ah-side.shop .lk-ah-eyebrow{color:#7FD3D8;}html.lk-dark .lk-ah-side.shop .lk-ah-dot,html.lk-dark .lk-ah-side.shop .bar i,html.lk-dark .lk-ah-minibar i{background:#7FD3D8;}" +
      D + ".lk-ah-side.vend .lk-ah-eyebrow{color:#F0A3C9;}html.lk-dark .lk-ah-side.vend .lk-ah-dot,html.lk-dark .lk-ah-side.vend .bar i{background:#F0A3C9;}" +
      D + ".lk-ah-step .bar,html.lk-dark .lk-ah-drow .bar,html.lk-dark .lk-ah-minibar{background:#2C273F;}" +
      D + ".lk-ah-side.shop .lk-ah-dropnote{background:#1E3A3F;}html.lk-dark .lk-ah-side.vend .lk-ah-dropnote{background:#3E2638;}" +
      D + ".lk-ah-tag.shop{background:#1E3A3F;color:#7FD3D8;}html.lk-dark .lk-ah-tag.vend{background:#3E2638;color:#F0A3C9;}html.lk-dark .lk-ah-tag.both{background:#2F2750;color:#C9B0FF;}" +
      D + "button.lk-ah-prompt:hover{border-color:#4A3A7A;}" +
      D + ".lk-ah-drow .bar i{background:#4A4466;}html.lk-dark .lk-ah-drow.hot .bar i{background:#B08CFF;}" +
      D + ".lk-ah-win .ic{background:#1F3A2E;color:#8FD9B0;}" +
      D + ".lk-ah-note{background:#29223F;}" +
      D + ".lk-ah-annot div{border-left-color:#4A3A7A;}" +
      D + ".lk-ah-legend i.a{background:#B08CFF;}html.lk-dark .lk-ah-legend i.b{background:#4A4466;}" +
      D + ".lk-ah-tip{background:#F3F1FA;color:#1B1830;}" +
      D + ".lk-ah-scrim{background:rgba(0,0,0,.5);}html.lk-dark .lk-ah-panel{background:#242039;border-color:#352F4F;box-shadow:-12px 0 40px rgba(0,0,0,.4);}" +
      /* chart marks */
      D + ".lk-ah-grid{stroke:#2F2A45;}html.lk-dark .lk-ah-axis{fill:#9B96B3;}html.lk-dark .lk-ah-area{fill:#2F2750;}html.lk-dark .lk-ah-prev{stroke:#4A4466;}html.lk-dark .lk-ah-line{stroke:#B08CFF;}html.lk-dark .lk-ah-pt{fill:#B08CFF;stroke:#242039;}" +
      D + ".lk-ah-sp-a{fill:#B08CFF;}html.lk-dark .lk-ah-sp-l{stroke:#B08CFF;}html.lk-dark .lk-ah-sp-d{fill:#B08CFF;}" +
      /* theme toggle */
      ".lk-ash-theme{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;border-radius:8px;padding:6px 8px;margin:0 0 6px;font-size:13.5px;font-weight:600;color:#4A4761;font-family:'Plus Jakarta Sans',sans-serif;}" +
      ".lk-ash-theme i{width:40px;height:40px;flex:0 0 40px;display:flex;align-items:center;justify-content:center;color:#4A4761;}.lk-ash-theme i svg{width:16px;height:16px;}" +
      ".lk-ash-theme:hover{background:#EEE6FF;color:#6002EE;}.lk-ash-theme:focus-visible{outline:2px solid #6002EE;outline-offset:1px;}" +
      D + ".lk-ash-theme{color:#C9C4DD;}html.lk-dark .lk-ash-theme i{color:#C9C4DD;}html.lk-dark .lk-ash-theme:hover{background:#2F2750;color:#C9B0FF;}" +
      /* insights module (lokali-admin-insights.js has its own light sheet; this maps every surface) */
      D + ".lki,html.lk-dark .lki h1,html.lk-dark .lki h2,html.lk-dark .lki h3,html.lk-dark .lki h4,html.lk-dark .lki-h1,html.lk-dark .lki-card-h,html.lk-dark .lki-kpi-v,html.lk-dark .lki-cell,html.lk-dark .lki-tl,html.lk-dark .lki-li,html.lk-dark .lki-fn-n,html.lk-dark .lki-tip,html.lk-dark .lk-ash h2,html.lk-dark .lk-ash h3,html.lk-dark .lk-ash h4{color:#F3F1FA;}" +
      D + ".lki-sub,html.lk-dark .lki-card-s,html.lk-dark .lki-kpi-l,html.lk-dark .lki-kpi-d,html.lk-dark .lki-sm-l,html.lk-dark .lki-chip,html.lk-dark .lki-legend,html.lk-dark .lki-why p,html.lk-dark .lki-why li,html.lk-dark .lki-gaps li,html.lk-dark .lki-h-r,html.lk-dark .lki-h-l,html.lk-dark .lki-h details,html.lk-dark .lki-secbar button,html.lk-dark .lki-range button,html.lk-dark .lki-state,html.lk-dark .lki-pill.plan,html.lk-dark .lki-pill.notlive{color:#C9C4DD;}" +
      D + ".lki-sm-l small,html.lk-dark .lki-axis,html.lk-dark .lki-chip span,html.lk-dark .lki-thead,html.lk-dark .lki-cell small,html.lk-dark .lki-cell .lki-lbl,html.lk-dark .lki-caret,html.lk-dark .lki-li small,html.lk-dark .lki-empty,html.lk-dark .lki-note,html.lk-dark .lki-fn-n small,html.lk-dark .lki-wk>div{color:#9B96B3;}" +
      D + ".lki-card,html.lk-dark .lki-kpi,html.lk-dark .lki-range,html.lk-dark .lki-state,html.lk-dark .lki-secbar button,html.lk-dark .lki-tip{background:#242039;border-color:#352F4F;}" +
      D + ".lki-tldr,html.lk-dark .lki-why,html.lk-dark .lki-h,html.lk-dark .lki-chip,html.lk-dark .lki-row:hover,html.lk-dark .lki-col.is-hot,html.lk-dark .lki-pill.plan,html.lk-dark .lki-pill.notlive{background:#29223F;border-color:#352F4F;}" +
      D + ".lki-secbar{background:#1B1830;}" +
      D + ".lki-tl,html.lk-dark .lki-sm,html.lk-dark .lki-v,html.lk-dark .lki-li{border-color:#352F4F;}" +
      D + ".lki-chip.is-on,html.lk-dark .lki-range button.is-on{background:#2F2750;border-color:#4A3A7A;color:#C9B0FF;}html.lk-dark .lki-chip.is-on span{color:#C9B0FF;}" +
      D + ".lki-secbar button:hover{background:#2F2750;color:#C9B0FF;border-color:#4A3A7A;}" +
      D + ".lki-link,html.lk-dark .lki-thead button.is-sort,html.lk-dark .lki-h summary,html.lk-dark .lki-h details a{color:#C9B0FF;}" +
      D + ".lki-vbar,html.lk-dark .lki-hbar,html.lk-dark .lki-fn-bar{background:#2C273F;}" +
      D + ".lki-fn-bar b{background:#B08CFF;}" +
      D + ".lki-tl.good .lki-ico,html.lk-dark .lki-kpi-d.up,html.lk-dark .lki-cell small.up,html.lk-dark .lki-why li.ok .lki-ico{color:#8FD9B0;}" +
      D + ".lki-tl.bad .lki-ico,html.lk-dark .lki-kpi-d.down,html.lk-dark .lki-cell small.down,html.lk-dark .lki-why li.gap .lki-ico{color:#F0A3C9;}" +
      D + ".lki-tl.info .lki-ico{color:#C9B0FF;}" +
      D + ".lki-h.good{border-left-color:#8FD9B0;}html.lk-dark .lki-h.bad{border-left-color:#F0A3C9;}html.lk-dark .lki-h.info{border-left-color:#B08CFF;}" +
      D + ".lki-pill.working{background:#1F3A2E;color:#8FD9B0;}html.lk-dark .lki-pill.seen{background:#2F2750;color:#C9B0FF;}html.lk-dark .lki-pill.stalls,html.lk-dark .lki-pill.low,html.lk-dark .lki-pill.unseen,html.lk-dark .lki-flag{background:#3E2638;color:#F0A3C9;}html.lk-dark .lki-pill.fresh{background:#1F3350;color:#8FBCF2;}" +
      D + ".lki-tip{box-shadow:0 6px 18px rgba(0,0,0,.4);}" +
      /* question grid + drawer (2026-10-10 Insights rebuild) */
      D + ".lki-sl,html.lk-dark .lki-q,html.lk-dark .lki-dw-x{background:#242039;border-color:#352F4F;color:#F3F1FA;}" +
      D + ".lki-q h3,html.lk-dark .lki-q-ans,html.lk-dark .lki-q-brow .n,html.lk-dark .lki-dw-t{color:#F3F1FA;}" +
      D + ".lki-q-read,html.lk-dark .lki-q-brow,html.lk-dark .lki-q-legend,html.lk-dark .lki-dw-s{color:#C9C4DD;}" +
      D + ".lki-q-ans small,html.lk-dark .lki-gh span{color:#9B96B3;}" +
      D + ".lki-q-open,html.lk-dark .lki-sl-more{color:#C9B0FF;border-color:#352F4F;}" +
      D + ".lki-q:hover{border-color:#4A3A7A;}" +
      D + ".lki-gh.shop h2{color:#7FD3D8;}html.lk-dark .lki-gh.vend h2{color:#F0A3C9;}html.lk-dark .lki-gh.both h2{color:#C9B0FF;}html.lk-dark .lki-gh.money h2{color:#8FD9B0;}" +
      D + ".lki-sl.good .lki-ico{color:#8FD9B0;}html.lk-dark .lki-sl.bad .lki-ico{color:#F0A3C9;}html.lk-dark .lki-sl.info .lki-ico{color:#C9B0FF;}" +
      D + ".lki-q-brow .bar,html.lk-dark .lki-q-meter{background:#2C273F;}html.lk-dark .lki-q-brow .bar i{background:#B08CFF;}html.lk-dark .lki-q-brow.shop .bar i{background:#7FD3D8;}html.lk-dark .lki-q-brow.vend .bar i{background:#F0A3C9;}" +
      D + ".lki-q-cols i{background:#B08CFF;}html.lk-dark .lki-q-cols i.lite{background:#4A4466;}html.lk-dark .lki-q-meter i{background:#8FD9B0;}" +
      D + ".lki-dw-panel{background:#1B1830;border-color:#352F4F;color:#F3F1FA;box-shadow:-12px 0 40px rgba(0,0,0,.5);}html.lk-dark .lki-dw-scrim{background:rgba(0,0,0,.55);}" +
      /* queue sections + the vendors / prospects views */
      D + ".lk-admin-stat{background:#29223F;}html.lk-dark .lk-admin-section{background:#242039;}" +
      D + ".lk-ash-note{color:#9B96B3;}" +
      D + ".lk-ash label,html.lk-dark .lk-ash legend{color:#C9C4DD;}" +
      D + ".lk-avatar{background:#2F2750;color:#C9B0FF;}";
    document.head.appendChild(st);
  }

  // What to tell a vendor, in their words (the insights page words gaps for the admin).
  function vendorTips(v, listingsN) {
    var t = [];
    if (!v.has_photo) t.push('Add a cover photo. It is the first thing people see on The Market.');
    if (!v.n_photos) t.push('Add a few gallery photos of your work.');
    if (!v.has_desc) t.push('Write two or three sentences about what you do and who it is for.');
    if (!v.has_tagline) t.push('Add a short tagline under your business name.');
    if (!v.has_tags) t.push('Pick your specialties so searches can find you.');
    if (listingsN === 0) t.push('Add your first service or product. Your storefront needs one to go live.');
    else if (listingsN < 3) t.push('Add another listing or two so people have something to browse.');
    if (!v.has_story) t.push('Fill in "Meet the owner". People buy from people.');
    return t;
  }
  function nudgeMailto(v, contact, tips) {
    var hi = contact && contact.first_name ? 'Hi ' + contact.first_name + ',' : 'Hi,';
    var body = hi + '\n\nI was looking at ' + (v.name || 'your storefront') + ' on Lokali and spotted a few quick things that would help more neighbors find you:\n\n' +
      tips.slice(0, 4).map(function (x) { return '- ' + x; }).join('\n') +
      '\n\nEach takes a few minutes here: https://www.golokali.com/vendor-dashboard/dashboard\n\nHappy to help with any of it, just reply to this email.\n\nFrancesca\nLokali';
    return 'mailto:' + encodeURIComponent(contact.email).replace(/%40/g, '@') +
      '?subject=' + encodeURIComponent('A few quick wins for your Lokali storefront') + '&body=' + encodeURIComponent(body);
  }

  // ── FOUNDER HQ (F 2026-11-01 / 11-02) ───────────────────────────────────────
  // F: "design a dashboard for the position I am in Lokali ... imagine you're my
  // personal assistant", then "this will replace my current dashboard now, so make
  // sure you add all that info too". Mockup: claude.ai/artifact/VKzBLTikf5cTZRoBSWa8va.
  // The Today view keeps every block the 10-10 home had (story, queues, both
  // journeys, prompts, pulse, chart, who is seen, wins) and adds the founder layer
  // around it. "Clo" is the assistant voice of the notes, a name made for this page.
  // Live numbers come from the same admin_insights payload as before. Five
  // hand-written cards (Today's three, This week, Content rhythm, Protected time and
  // the next event) live in admin_board (patch_admin_board.sql) through the signed-in
  // client; until that patch is applied they live in this browser's localStorage,
  // and the Engine room card says which one is in use.
  var FQ_KEY = 'lk_founder_board';
  var FQ_PRICE = { pro: 20, featured: 50 };   // monthly list prices (pricing page)
  var FQ_DEFAULT = {
    three: { set: '2026-11-02', done: {}, items: [
      { t: 'Build the 4 claim cards', d: 'Invite form with the QR box for each guest not on Lokali yet, then print 5x7 on the booth-card stock.' },
      { t: 'Approve the New this week Reel', d: 'It’s in your inbox. One tap and it posts.' },
      { t: 'Five sends, photographers first', d: 'Four of them run November minis, so their window is this week.' }
    ] },
    week: { items: [
      { day: 'Mon 2', t: 'Claim cards, the Reel, five sends.' },
      { day: 'Tue 3', t: 'Print claim cards and booth cards. Same stock, same crop marks.' },
      { day: 'Wed 4', t: 'Flip chart question, the three asks, and the Referral Desk props.' },
      { day: 'Thu 5', t: 'Vendor Circle, 5 to 7 p.m. at Mia’s Table. Referral Desk Ep. 1 posts.', hot: true },
      { day: 'Fri 6', t: 'Thank-you email with the asks list.' },
      { day: 'Sat 7', t: 'Nothing with a login. Dance.' },
      { day: 'Sun 8', t: 'Twenty minutes to set up the week, then off.' }
    ] },
    rhythm: { items: [
      { t: 'New this week Reel', d: 'Every Monday, automatic. You approve by email.' },
      { t: 'Meet the Vendor', d: 'No. 01 posted Oct 30. No. 02 is next.' },
      { t: 'The Referral Desk', d: 'Ep. 1 Thursday. Ep. 2, the cake call, Nov 12.' },
      { t: 'The Lokali Circle', d: 'Issue 3 carries the markets calendar.' },
      { t: 'AI visibility check', d: 'Every other week. Next one around Nov 12.' }
    ] },
    protected: { items: [
      { t: 'The kids', d: 'First, always' },
      { t: 'Rowdy Digital', d: '[your hours]' },
      { t: 'Dancing', d: '[class night]' },
      { t: 'Reading', d: '[your current book]' }
    ] },
    event: {
      name: 'Lokali’s first Vendor Circle gathering', date: '2026-11-05', when: '5 to 7 p.m.',
      place: 'Hosted by Mia’s Table, Shenandoah', rsvp: 'nov5-2026',
      prep: [
        { t: 'Run of show, mixed tables', done: true },
        { t: 'Category dots and envelope labels', done: true },
        { t: 'Claim cards for guests not on Lokali yet' },
        { t: 'Friday: thank-you email with the asks' }
      ]
    }
  };
  var FQ_ICO = {
    three: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M152.1 38.2c9.9 8.9 10.7 24 1.8 33.9l-72 80c-4.4 4.9-10.6 7.8-17.2 7.9s-12.9-2.4-17.6-7L7 113C-2.3 103.6-2.3 88.4 7 79s24.6-9.4 33.9 0l22.1 22.1 55.1-61.2c8.9-9.9 24-10.7 33.9-1.8zm0 160c9.9 8.9 10.7 24 1.8 33.9l-72 80c-4.4 4.9-10.6 7.8-17.2 7.9s-12.9-2.4-17.6-7L7 273c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l22.1 22.1 55.1-61.2c8.9-9.9 24-10.7 33.9-1.8zM224 96c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zm0 160c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zM160 416c0-17.7 14.3-32 32-32l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32zM48 368a48 48 0 1 1 0 96 48 48 0 1 1 0-96z"/></svg>',
    week: '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M96 32l0 32L48 64C21.5 64 0 85.5 0 112l0 48 448 0 0-48c0-26.5-21.5-48-48-48l-48 0 0-32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 32L160 64l0-32c0-17.7-14.3-32-32-32S96 14.3 96 32zM448 192L0 192 0 464c0 26.5 21.5 48 48 48l352 0c26.5 0 48-21.5 48-48l0-272z"/></svg>',
    road: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>',
    money: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M512 80c0 18-14.3 34.6-38.4 48c-29.1 16.1-72.5 27.5-122.3 30.9c-3.7-1.8-7.4-3.5-11.3-5C300.6 137.4 248.2 128 192 128c-8.3 0-16.4 .2-24.5 .6l-1.1-.6C142.3 114.6 128 98 128 80c0-44.2 86-80 192-80S512 35.8 512 80zM160.7 161.1c10.2-.7 20.7-1.1 31.3-1.1c62.2 0 117.4 12.3 152.5 31.4C369.3 204.9 384 221.7 384 240c0 4-.7 7.9-2.1 11.7c-4.6 13.2-17 25.3-35 35.5c0 0 0 0 0 0c-.1 .1-.3 .1-.4 .2c0 0 0 0 0 0s0 0 0 0c-.3 .2-.6 .3-.9 .5c-35 19.4-90.8 32-153.6 32c-59.6 0-112.9-11.3-148.2-29.1c-1.9-.9-3.7-1.9-5.5-2.9C14.3 274.6 0 258 0 240c0-34.8 53.4-64.5 128-75.4c10.5-1.5 21.4-2.7 32.7-3.5zM416 240c0-21.9-10.6-39.9-24.1-53.4c28.3-4.4 54.2-11.4 76.2-20.5c16.3-6.8 31.5-15.2 43.9-25.5l0 35.4c0 19.3-16.5 37.1-43.8 50.9c-14.6 7.4-32.4 13.7-52.4 18.5c.1-1.8 .2-3.5 .2-5.3zm-32 96c0 18-14.3 34.6-38.4 48c-1.8 1-3.6 1.9-5.5 2.9C304.9 404.7 251.6 416 192 416c-62.8 0-118.6-12.6-153.6-32C14.3 370.6 0 354 0 336l0-35.4c12.5 10.3 27.6 18.7 43.9 25.5C83.4 342.6 135.8 352 192 352s108.6-9.4 148.1-25.9c7.8-3.2 15.3-6.9 22.4-10.9c6.1-3.4 11.8-7.2 17.2-11.2c1.5-1.1 2.9-2.3 4.3-3.4l0 3.4 0 5.7 0 26.3zm32 0l0-32 0-25.9c19-4.2 36.5-9.5 52.1-16c16.3-6.8 31.5-15.2 43.9-25.5l0 35.4c0 10.5-5 21-14.9 30.9c-16.3 16.3-45 29.7-81.3 38.4c.1-1.7 .2-3.5 .2-5.3zM192 448c56.2 0 108.6-9.4 148.1-25.9c16.3-6.8 31.5-15.2 43.9-25.5l0 35.4c0 44.2-86 80-192 80S0 476.2 0 432l0-35.4c12.5 10.3 27.6 18.7 43.9 25.5C83.4 438.6 135.8 448 192 448z"/></svg>',
    send: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480l0-83.6c0-4 1.5-7.8 4.2-10.8L331.8 202.8c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8 17.7 316.6C7.1 311.3 .3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z"/></svg>',
    shop: '<svg viewBox="0 0 640 512" aria-hidden="true"><path fill="currentColor" d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192l42.7 0c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96c-.2 0-.4 0-.7 0L21.3 320C9.6 320 0 310.4 0 298.7zM405.3 320c-.2 0-.4 0-.7 0c26.6-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7l42.7 0C592.2 192 640 239.8 640 298.7c0 11.8-9.6 21.3-21.3 21.3l-213.3 0zM224 224a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zM128 485.3C128 411.7 187.7 352 261.3 352l117.3 0C452.3 352 512 411.7 512 485.3c0 14.7-11.9 26.7-26.7 26.7l-330.7 0c-14.7 0-26.7-11.9-26.7-26.7z"/></svg>',
    rhythm: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M0 224c0 17.7 14.3 32 32 32s32-14.3 32-32c0-53 43-96 96-96l160 0 0 32c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l64-64c12.5-12.5 12.5-32.8 0-45.3l-64-64c-9.2-9.2-22.9-11.9-34.9-6.9S320 19.1 320 32l0 32L160 64C71.6 64 0 135.6 0 224zm512 64c0-17.7-14.3-32-32-32s-32 14.3-32 32c0 53-43 96-96 96l-160 0 0-32c0-12.9-7.8-24.6-19.8-29.6s-25.7-2.2-34.9 6.9l-64 64c-12.5 12.5-12.5 32.8 0 45.3l64 64c9.2 9.2 22.9 11.9 34.9 6.9s19.8-16.6 19.8-29.6l0-32 160 0c88.4 0 160-71.6 160-160z"/></svg>',
    house: '<svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M575.8 255.5c0 18-15 32.1-32 32.1l-32 0 .7 160.2c0 2.7-.2 5.4-.5 8.1l0 16.2c0 22.1-17.9 40-40 40l-16 0c-1.1 0-2.2 0-3.3-.1c-1.4 .1-2.8 .1-4.2 .1L416 512l-24 0c-22.1 0-40-17.9-40-40l0-24 0-64c0-17.7-14.3-32-32-32l-64 0c-17.7 0-32 14.3-32 32l0 64 0 24c0 22.1-17.9 40-40 40l-24 0-31.9 0c-1.5 0-3-.1-4.5-.2c-1.2 .1-2.4 .2-3.6 .2l-16 0c-22.1 0-40-17.9-40-40l0-112c0-.9 0-1.9 .1-2.8l0-69.7-32 0c-18 0-32-14-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 12 15 11 24z"/></svg>',
    engine: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M228.3 469.1L47.6 300.4c-4.2-3.9-8.2-8.1-11.9-12.4l87 0c22.6 0 43-13.6 51.7-34.5l10.5-25.2 49.3 109.5c3.8 8.5 12.1 14 21.4 14.1s17.8-5 22-13.3L320 253.7l1.7 3.4c9.5 19 28.9 31 50.1 31l104.5 0c-3.7 4.3-7.7 8.5-11.9 12.4L283.7 469.1c-7.5 7-17.4 10.9-27.7 10.9s-20.2-3.9-27.7-10.9zM503.7 240l-132 0c-3 0-5.8-1.7-7.2-4.4l-23.2-46.3c-4.1-8.1-12.4-13.3-21.5-13.3s-17.4 5.1-21.5 13.3l-41.4 82.8L205.9 158.2c-3.9-8.7-12.7-14.3-22.2-14.1s-18.1 5.9-21.8 14.8l-31.8 76.3c-1.2 3-4.2 4.9-7.4 4.9L16 240c-2.6 0-5 .4-7.3 1.1C3 225.2 0 208.2 0 190.9l0-5.8c0-69.9 50.5-129.5 119.4-141C165 36.5 211.4 51.4 244 84l12 12 12-12c32.6-32.6 79-47.5 124.6-39.9C461.5 55.6 512 115.2 512 185.1l0 5.8c0 16.9-2.8 33.5-8.3 49.1z"/></svg>',
    off: '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M223.5 32C100 32 0 132.3 0 256S100 480 223.5 480c60.6 0 115.5-24.2 155.8-63.4c5-4.9 6.3-12.5 3.1-18.7s-10.1-9.7-17-8.5c-9.8 1.7-19.8 2.6-30.1 2.6c-96.9 0-175.5-78.8-175.5-176c0-65.8 36-123.1 89.3-153.3c6.1-3.5 9.2-10.5 7.7-17.3s-7.3-11.9-14.3-12.5c-6.3-.5-12.6-.8-19-.8z"/></svg>',
    wait: '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l0 11c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437l0 11c-17.7 0-32 14.3-32 32s14.3 32 32 32l320 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-11c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1l0-11c17.7 0 32-14.3 32-32S369.7 0 352 0L32 0zM96 75l0-11 192 0 0 11c0 25.5-10.1 49.9-28.1 67.9L192 210.7l-67.9-67.9C106.1 124.9 96 100.5 96 75z"/></svg>',
    decide: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M6 21h12M12 6l7 1M12 6L5 7M3 14l2-7 2 7a2 2 0 0 1-4 0zM17 14l2-7 2 7a2 2 0 0 1-4 0z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2.5h5L16 6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7.5L12 13l8.5-5.5"/></svg>',
    pen: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"/></svg>'
  };
  function fqClone(o) { return JSON.parse(JSON.stringify(o)); }
  function fqMerge(d) {
    var out = fqClone(FQ_DEFAULT);
    if (d && typeof d === 'object') Object.keys(out).forEach(function (k) { if (d[k] && typeof d[k] === 'object') out[k] = d[k]; });
    ['three', 'week', 'rhythm', 'protected'].forEach(function (k) { if (!Array.isArray(out[k].items)) out[k].items = []; });
    if (!out.three.done || typeof out.three.done !== 'object') out.three.done = {};
    if (!Array.isArray(out.event.prep)) out.event.prep = [];
    return out;
  }
  function fqLocal() { try { var s = localStorage.getItem(FQ_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  // { data, remote }: remote = the admin_board RPC answered (the patch is applied).
  function fqLoadBoard() {
    var ready = window.LokaliSupabaseReady;
    if (!ready || typeof ready.then !== 'function') return Promise.resolve({ data: fqLocal(), remote: false });
    return ready.then(function (c) { return c.rpc('admin_board_get'); }).then(function (res) {
      var d = res && res.data;
      if (res && !res.error && d && d.ok === true) {
        var has = d.data && typeof d.data === 'object' && Object.keys(d.data).length;
        return { data: has ? d.data : fqLocal(), remote: true };
      }
      return { data: fqLocal(), remote: false };
    }).catch(function () { return { data: fqLocal(), remote: false }; });
  }
  // Clo's brief (patch_admin_brief.sql, #237 Phase 1): the newest row, or null when the
  // patch is not applied, the RPC refuses, or the brief is more than a week old.
  function fqLoadBrief() {
    var ready = window.LokaliSupabaseReady;
    if (!ready || typeof ready.then !== 'function') return Promise.resolve(null);
    return ready.then(function (c) { return c.rpc('admin_brief_get'); }).then(function (res) {
      var d = res && res.data, b = d && d.ok === true && d.brief;
      if (!b || typeof b !== 'object' || !b.date) return null;
      var age = fqDaysTo(b.date, new Date()); // negative = days ago
      if (age == null || age < -7 || age > 1) return null;
      return { date: b.date, note: String(b.note || '').trim(), three: fqList(b.three, ['t', 'd']), waiting: fqList(b.waiting, ['t', 'd', 'w']), decisions: fqList(b.decisions, ['t', 'pick']), at: b.generated_at || null };
    }).catch(function () { return null; });
  }
  function fqList(a, keys) {
    if (!Array.isArray(a)) return [];
    return a.filter(function (x) { return x && typeof x === 'object' && String(x.t || '').trim(); }).slice(0, 8)
      .map(function (x) { var o = {}; keys.forEach(function (k) { o[k] = String(x[k] || '').trim(); }); return o; });
  }
  // 'From Friday' when the brief is not today's; '' when it is.
  function fqBriefWhen(date, now) {
    var days = fqDaysTo(date, now); if (days == null || days === 0) return '';
    if (days === -1) return 'From yesterday'; if (days === 1) return 'For tomorrow';
    var d = fqParseDate(date); try { return 'From ' + d.toLocaleDateString('en-US', { weekday: 'long' }); } catch (e) { return ''; }
  }
  // Always keeps a browser copy; resolves true when Lokali stored it too.
  function fqSaveBoard(board) {
    try { localStorage.setItem(FQ_KEY, JSON.stringify(board)); } catch (e) {}
    var ready = window.LokaliSupabaseReady;
    if (!ready || typeof ready.then !== 'function') return Promise.resolve(false);
    return ready.then(function (c) { return c.rpc('admin_board_save', { p_data: board }); })
      .then(function (res) { return !!(res && !res.error && res.data && res.data.ok === true); })
      .catch(function () { return false; });
  }
  function fqT(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function fqN(x) { return (Number(x) || 0).toLocaleString('en-US'); }
  function fqMoney(x) { return '$' + Math.round(Number(x) || 0).toLocaleString('en-US'); }
  function fqKick(ico, text) { var k = fqT('p', 'lk-fq-kick'); var i = fqT('span', 'lk-fq-ico'); i.innerHTML = FQ_ICO[ico] || ''; k.appendChild(i); k.appendChild(document.createTextNode(text)); return k; }
  function fqTitle(text, emText, after) { var h = fqT('h2'); if (emText != null) h.appendChild(fqT('em', null, emText)); h.appendChild(document.createTextNode(text)); if (after) h.appendChild(fqT('em', null, after)); return h; }
  function fqCard(cls) { return fqT('section', 'lk-fq-card' + (cls ? ' ' + cls : '')); }
  function fqHead(card, ico, kick, title) {
    var hd = fqT('div', 'lk-fq-hd'), l = fqT('div'); l.appendChild(fqKick(ico, kick));
    var h = typeof title === 'string' ? fqT('h2', null, title) : title; l.appendChild(h);
    hd.appendChild(l); var r = fqT('div', 'lk-fq-hr-r'); hd.appendChild(r); card.appendChild(hd);
    return { hd: hd, h: h, right: r };
  }
  function fqDayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function fqParseDate(s) { var p = String(s || '').split('-'); if (p.length !== 3) return null; var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); return isNaN(d.getTime()) ? null : d; }
  function fqDaysTo(s, now) { var d = fqParseDate(s); return d ? Math.round((d - fqDayStart(now)) / 86400000) : null; }
  function fqISO(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fqLines(text) { return String(text || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function fqPair(line) { var i = line.indexOf(':'); return i > 0 ? { t: line.slice(0, i).trim(), d: line.slice(i + 1).trim() } : { t: line, d: '' }; }
  function fqWords(k) { return ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][k] || String(k); }

  // A hand-written card's Edit: one item per line, "Title: detail". Save writes
  // the whole board through ctl, then redraws the card and says where it went.
  function fqEditor(right, body, opts) {
    var btn = fqT('button', 'lk-fq-edit'); btn.type = 'button'; btn.innerHTML = FQ_ICO.pen;
    btn.appendChild(document.createTextNode('Edit')); btn.setAttribute('aria-label', 'Edit ' + opts.name);
    right.appendChild(btn);
    var form = fqT('div', 'lk-fq-form'); form.hidden = true;
    var lab = fqT('label', null, opts.label || 'One per line'); var ta = fqT('textarea'); ta.rows = 7; lab.appendChild(ta); form.appendChild(lab);
    if (opts.help) form.appendChild(fqT('p', 'help', opts.help));
    var acts = fqT('div', 'acts'), save = fqT('button', 'lk-ash-btn primary', 'Save'), cancel = fqT('button', 'lk-ash-btn', 'Cancel');
    save.type = 'button'; cancel.type = 'button'; acts.appendChild(save); acts.appendChild(cancel); form.appendChild(acts);
    body.parentNode.insertBefore(form, body.nextSibling);
    var msg = fqT('p', 'lk-fq-msg', ''); msg.hidden = true; form.parentNode.insertBefore(msg, form.nextSibling);
    function open(on) { form.hidden = !on; body.hidden = on; btn.hidden = on; msg.hidden = true; if (on) { ta.value = opts.toText(); try { ta.focus(); } catch (e) {} } }
    btn.addEventListener('click', function () { open(true); });
    cancel.addEventListener('click', function () { open(false); try { btn.focus(); } catch (e) {} });
    save.addEventListener('click', function () {
      save.disabled = true; opts.fromText(ta.value);
      opts.ctl.save().then(function (ok) {
        save.disabled = false; open(false); opts.redraw();
        msg.textContent = ok ? 'Saved.' : 'Saved in this browser. It follows you everywhere once the board patch is applied.';
        msg.className = 'lk-fq-msg' + (ok ? '' : ' warn'); msg.hidden = false;
        setTimeout(function () { msg.hidden = true; }, ok ? 2500 : 6000);
      });
    });
  }

  // The board: loaded once, shared by every hand-written card.
  function fqBoardCtl(parts) {
    var ctl = { board: fqMerge(null), remote: false, loaded: false, brief: null };
    ctl.save = function () {
      return fqSaveBoard(ctl.board).then(function (ok) { ctl.remote = ok; parts.forEach(function (p) { if (p.onStore) p.onStore(ctl); }); return ok; });
    };
    Promise.all([fqLoadBoard(), fqLoadBrief()]).then(function (rs) {
      var r = rs[0];
      ctl.board = fqMerge(r.data); ctl.remote = r.remote; ctl.brief = rs[1]; ctl.loaded = true;
      parts.forEach(function (p) { if (p.draw) p.draw(ctl); if (p.onStore) p.onStore(ctl); });
    });
    return ctl;
  }

  // Date line + now playing, then the hero (greeting, Clo's note with the month's
  // story, three numbers) beside the arch counting down to the next event.
  function fqHero(name, now) {
    var H = { el: [] };
    var top = fqT('div', 'lk-fq-top');
    var dstr = ''; try { dstr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) {}
    top.appendChild(fqT('span', 'lk-fq-date', dstr));
    var play = fqT('div', 'lk-fq-play'), eqw = fqT('span', 'eqw'), eq = fqT('span', 'lk-fq-eq');
    eqw.setAttribute('aria-hidden', 'true'); for (var i = 0; i < 4; i++) eq.appendChild(fqT('i')); eqw.appendChild(eq); play.appendChild(eqw);
    var pt = fqT('span'); pt.appendChild(fqT('small', null, 'Now playing')); pt.appendChild(fqT('b', null, 'Housewife · Tate McRae')); play.appendChild(pt);
    top.appendChild(play); H.el.push(top);

    var row = fqT('div', 'lk-fq-row'); H.el.push(row);
    var hello = fqCard('lk-fq-hello'); hello.setAttribute('aria-labelledby', 'lk-fq-hello-h');
    ['a', 'b'].forEach(function (k) { var s = fqT('span', 'lk-fq-spark ' + k, '✦'); s.setAttribute('aria-hidden', 'true'); hello.appendChild(s); });
    var hr = now.getHours(), first = String(name || '').trim().split(/\s+/)[0] || 'you';
    var h1 = fqT('h2', 'lk-fq-h1'); h1.id = 'lk-fq-hello-h';
    h1.appendChild(fqT('span', null, (hr < 12 ? 'Good morning, ' : hr < 18 ? 'Good afternoon, ' : 'Good evening, ') + first + '.'));
    var line2 = fqT('em', null, 'Run the day.'); h1.appendChild(line2); hello.appendChild(h1);
    var note = fqT('div', 'lk-fq-note'), av = fqT('div', 'lk-fq-av', 'C'); av.setAttribute('aria-hidden', 'true'); note.appendChild(av);
    var p = fqT('p'); var briefS = fqT('span', 'lk-fq-brief'); briefS.hidden = true; p.appendChild(briefS);
    p.appendChild(document.createTextNode('Your month in one breath: '));
    H.story = fqT('span', 'lk-fq-story', 'reading this month’s numbers…'); p.appendChild(H.story);
    var needs = fqT('span'), evt = fqT('span'); p.appendChild(needs); p.appendChild(evt);
    p.appendChild(document.createTextNode(' ')); p.appendChild(fqT('span', 'lk-fq-sign', 'xo, Clo'));
    note.appendChild(p); hello.appendChild(note);
    var stats = fqT('div', 'lk-fq-stats');
    function stat(label) { var s = fqT('div', 'lk-fq-stat'); s.appendChild(fqT('span', 'l', label)); var n = fqT('span', 'n', '…'); s.appendChild(n); stats.appendChild(s); return { s: s, n: n }; }
    var sLive = stat('Storefronts live'), sFound = stat('Founding spots'), sViews = stat('Views, last 30 days');
    hello.appendChild(stats);
    var arch = fqT('section', 'lk-fq-arch'); arch.setAttribute('aria-label', 'Next event'); arch.hidden = true;
    row.appendChild(hello); row.appendChild(arch);

    H.setNeeds = function (total, open) {
      needs.textContent = total ? ' ' + (total === 1 ? 'One thing in the queues needs you.' : fqWords(total) + ' things in the queues need you.') : (open ? '' : ' Nothing in the queues needs you.');
    };
    function chip(host, text, cls) { var c = fqT('span', 'lk-fq-chip' + (cls ? ' ' + cls : ''), text); host.appendChild(c); }
    H.fill = function (o) {
      sLive.n.textContent = fqN(o.live); chip(sLive.s, o.newWeek ? '+' + o.newWeek + ' this week' : 'None new this week', o.newWeek ? '' : 'v');
      sFound.n.textContent = fqN(o.founding); sFound.n.appendChild(fqT('small', null, '/' + o.cap));
      var dots = fqT('div', 'lk-fq-dots'); dots.setAttribute('role', 'img'); dots.setAttribute('aria-label', o.founding + ' of ' + o.cap + ' founding spots claimed');
      for (var k = 0; k < o.cap; k++) dots.appendChild(fqT('i', k < o.founding ? 'on' : null)); sFound.s.appendChild(dots);
      sViews.n.textContent = fqN(o.views);
      chip(sViews.s, o.vd == null ? 'None the 30 days before' : (o.vd >= 0 ? 'Up ' : 'Down ') + Math.abs(o.vd) + '% from ' + fqN(o.prev), o.vd != null && o.vd < 0 ? 'r' : '');
    };
    H.fail = function () { sLive.n.textContent = '–'; sFound.n.textContent = '–'; sViews.n.textContent = '–'; };

    // the arch: next event, its RSVPs, its prep list; Edit swaps in a small form
    var editing = false, rsvpCache = {};
    function dayWord(days, d) {
      if (days === 0) return 'Today'; if (days === 1) return 'Tomorrow';
      try { return days < 7 ? d.toLocaleDateString('en-US', { weekday: 'long' }) : 'On ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
    }
    function editBtn(label, ctl) {
      var b = fqT('button', 'lk-fq-edit'); b.type = 'button'; b.innerHTML = FQ_ICO.pen; b.appendChild(document.createTextNode(label));
      b.addEventListener('click', function () { editing = true; H.draw(ctl); }); return b;
    }
    function field(form, label, value, type) { var l = fqT('label', null, label), inp = fqT('input'); inp.type = type || 'text'; inp.value = value || ''; l.appendChild(inp); form.appendChild(l); return inp; }
    function eventForm(ctl) {
      var ev = ctl.board.event || {}, form = fqT('div', 'lk-fq-form');
      form.appendChild(fqT('span', 'k', 'Next event'));
      var fName = field(form, 'Event name', ev.name), fDate = field(form, 'Date', ev.date, 'date'), fWhen = field(form, 'Time', ev.when), fPlace = field(form, 'Where', ev.place), fRsvp = field(form, 'RSVP list key (empty if none)', ev.rsvp);
      var l = fqT('label', null, 'Prep, one per line'), ta = fqT('textarea'); ta.rows = 5; ta.value = (ev.prep || []).map(function (x) { return x.t; }).join('\n'); l.appendChild(ta); form.appendChild(l);
      var acts = fqT('div', 'acts'), save = fqT('button', 'lk-ash-btn primary', 'Save'), cancel = fqT('button', 'lk-ash-btn', 'Cancel'), clear = fqT('button', 'lk-ash-btn', 'No event');
      [save, cancel, clear].forEach(function (b) { b.type = 'button'; acts.appendChild(b); }); form.appendChild(acts);
      cancel.addEventListener('click', function () { editing = false; H.draw(ctl); });
      clear.addEventListener('click', function () { ctl.board.event = { prep: [] }; editing = false; ctl.save(); H.draw(ctl); });
      save.addEventListener('click', function () {
        var was = {}; (ev.prep || []).forEach(function (x) { was[x.t] = !!x.done; });
        ctl.board.event = { name: fName.value.trim(), date: fDate.value, when: fWhen.value.trim(), place: fPlace.value.trim(), rsvp: fRsvp.value.trim(),
          prep: fqLines(ta.value).map(function (t) { return { t: t, done: !!was[t] }; }) };
        editing = false; ctl.save(); H.draw(ctl);
      });
      return form;
    }
    H.draw = function (ctl) {
      var bf = ctl.brief; briefS.innerHTML = '';
      if (bf && bf.note) { var bw = fqBriefWhen(bf.date, now); if (bw) briefS.appendChild(fqT('b', null, bw + ': ')); briefS.appendChild(document.createTextNode(bf.note + ' ')); }
      briefS.hidden = !(bf && bf.note);
      var ev = ctl.board.event || {}, days = fqDaysTo(ev.date, now), d = fqParseDate(ev.date);
      arch.innerHTML = ''; arch.hidden = !ctl.loaded;
      line2.textContent = ev.name && days != null && days >= 0 && days <= 7 ? 'Big week. You’re ready.' : 'Run the day.';
      if (editing) { arch.appendChild(eventForm(ctl)); return; }
      if (!ev.name || days == null || days < 0) {
        evt.textContent = '';
        arch.appendChild(fqT('span', 'k', 'Next up'));
        arch.appendChild(fqT('h2', null, 'Nothing on the calendar yet'));
        arch.appendChild(fqT('p', null, 'Add your next event and I’ll count it down for you.'));
        arch.appendChild(editBtn('Add an event', ctl)); return;
      }
      arch.appendChild(fqT('span', 'k', 'The drop'));
      arch.appendChild(fqT('span', 'big' + (days === 0 ? ' sm' : ''), days === 0 ? 'Today' : String(days)));
      arch.appendChild(fqT('span', 'sub', days === 0 ? 'it’s happening' : days === 1 ? 'day to go' : 'days to go'));
      arch.appendChild(fqT('h2', null, ev.name));
      var dl = ''; try { dl = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) {}
      var info = fqT('p', null, dl + (ev.when ? ' · ' + ev.when : '')); if (ev.place) info.appendChild(fqT('span', 'pl', ev.place)); arch.appendChild(info);
      var chips = fqT('div', 'chips'); arch.appendChild(chips);
      var word = dayWord(days, d);
      evt.textContent = ' ' + word + ' is ' + ev.name.replace(/^Lokali’s /, 'your ') + '.';
      function paintRsvp(r) {
        chips.innerHTML = '';
        chips.appendChild(fqT('span', 'w', r.yes + ' yes'));
        if (r.no) chips.appendChild(fqT('span', null, r.no + ' can’t make it'));
        if (r.yes) evt.textContent = ' ' + word + ', ' + r.yes + ' said yes' + (r.notLive ? ', and ' + r.notLive + (r.notLive === 1 ? ' of them still needs' : ' of them still need') + ' a claim card.' : '.');
      }
      var api = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.vendors;
      if (ev.rsvp && rsvpCache[ev.rsvp]) paintRsvp(rsvpCache[ev.rsvp]);
      else if (ev.rsvp && api && api.adminEventRsvps) {
        api.adminEventRsvps(ev.rsvp).then(function (res) {
          var x = res && res.data; if (!x || x.ok === false) return;
          var rows = x.rows || [];
          rsvpCache[ev.rsvp] = { yes: Number(x.yes) || 0, no: Number(x.no) || 0, notLive: rows.filter(function (r) { return r.attending && r.storefront !== 'live'; }).length };
          paintRsvp(rsvpCache[ev.rsvp]);
        }).catch(function () {});
      }
      if ((ev.prep || []).length) {
        var ul = fqT('ul', 'lk-fq-prep');
        ev.prep.forEach(function (it) {
          var li = fqT('li'), b = fqT('button', it.done ? 'on' : null); b.type = 'button'; b.setAttribute('aria-pressed', it.done ? 'true' : 'false');
          var ic = fqT('i'); if (it.done) ic.innerHTML = ASH_ICO.check; b.appendChild(ic); b.appendChild(fqT('span', null, it.t));
          b.addEventListener('click', function () { it.done = !it.done; ctl.save(); H.draw(ctl); });
          li.appendChild(b); ul.appendChild(li);
        });
        arch.appendChild(ul);
      }
      arch.appendChild(editBtn('Edit event', ctl));
    };
    return H;
  }

  // Today's three + This week.
  function fqBoardRow(now) {
    var R = { el: fqT('div', 'lk-fq-row') }, today = fqISO(now);
    var three = fqCard('lk-fq-three'), th = fqHead(three, 'three', 'Today’s three', 'Three moves. That’s the whole list.');
    var prog = fqT('div', 'lk-fq-prog'); th.right.appendChild(prog);
    var tb = fqT('div', 'lk-fq-tasks'); three.appendChild(tb);
    var sug = fqT('div', 'lk-fq-sug'); sug.hidden = true; three.appendChild(sug); var sugKeep = false;
    var week = fqCard('lk-fq-week'), wh = fqHead(week, 'week', 'This week', 'The shape of your week.');
    var wb = fqT('ol', 'lk-fq-weeklist'); week.appendChild(wb);
    R.el.appendChild(three); R.el.appendChild(week);
    var ctlRef = null;
    function drawThree() {
      var ctl = ctlRef, b = ctl.board.three, items = (b.items || []).slice(0, 5), done = b.done || {};
      tb.innerHTML = ''; prog.innerHTML = '';
      var n = 0; items.forEach(function (x, i) { if (done[i]) n++; });
      if (!items.length) { tb.appendChild(fqT('p', 'lk-fq-set', 'Nothing set. Tap Edit and name the three things that would make today a win.')); drawSug(); return; }
      prog.appendChild(fqT('span', null, n + ' of ' + items.length + ' done'));
      var bars = fqT('div'); bars.setAttribute('aria-hidden', 'true'); items.forEach(function (x, i) { bars.appendChild(fqT('i', done[i] ? 'on' : null)); }); prog.appendChild(bars);
      items.forEach(function (x, i) {
        var row = fqT('div', 'lk-fq-task' + (done[i] ? ' done' : ''));
        var c = fqT('button', 'lk-fq-chk'); c.type = 'button'; c.setAttribute('aria-pressed', done[i] ? 'true' : 'false');
        c.setAttribute('aria-label', (done[i] ? 'Mark not done: ' : 'Mark done: ') + x.t); if (done[i]) c.innerHTML = ASH_ICO.check;
        c.addEventListener('click', function () { b.done = b.done || {}; if (b.done[i]) delete b.done[i]; else b.done[i] = true; ctl.save(); drawThree(); });
        var tx = fqT('div'); tx.appendChild(fqT('b', null, x.t)); if (x.d) tx.appendChild(fqT('small', null, x.d));
        row.appendChild(c); row.appendChild(tx); tb.appendChild(row);
      });
      if (n === items.length) { var y = fqT('div', 'lk-fq-yay'), s = fqT('span', 's', '✦'); s.setAttribute('aria-hidden', 'true'); y.appendChild(s); var t = fqT('span', null, 'All done. '); t.appendChild(fqT('em', null, 'The rest of the day is yours.')); y.appendChild(t); tb.appendChild(y); }
      if (b.set && b.set !== today) {
        var sd = fqParseDate(b.set), when = ''; try { when = sd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) {}
        tb.appendChild(fqT('p', 'lk-fq-set', 'Set ' + when + '. New day? Edit to choose today’s three.'));
      }
      drawSug();
    }
    // Clo suggests (#237 Phase 1): the brief's three, with one tap to make them hers.
    // Hidden once the board already carries them, or after Keep mine (this page load).
    function sameThree(a, b) { return a.length === b.length && a.every(function (x, i) { return x.t === ((b[i] || {}).t || ''); }); }
    function drawSug() {
      var ctl = ctlRef, bf = ctl && ctl.brief, list = bf ? bf.three.slice(0, 5) : [];
      sug.innerHTML = '';
      var show = list.length && !sugKeep && !sameThree(list, ctl.board.three.items || []);
      sug.hidden = !show; if (!show) return;
      var k = fqT('div', 'k'), avm = fqT('span', 'lk-fq-av sm', 'C'); avm.setAttribute('aria-hidden', 'true'); k.appendChild(avm);
      var bw = fqBriefWhen(bf.date, now); k.appendChild(document.createTextNode('Clo suggests' + (bw ? ' · ' + bw.toLowerCase() : ''))); sug.appendChild(k);
      var ol = fqT('ol'); list.forEach(function (x) { var li = fqT('li'); li.appendChild(fqT('b', null, x.t)); if (x.d) li.appendChild(fqT('small', null, x.d)); ol.appendChild(li); }); sug.appendChild(ol);
      var acts = fqT('div', 'acts'), use = fqT('button', 'lk-ash-btn primary', 'Use these'), keep = fqT('button', 'lk-ash-btn', 'Keep mine');
      use.type = 'button'; keep.type = 'button'; acts.appendChild(use); acts.appendChild(keep); sug.appendChild(acts);
      use.addEventListener('click', function () {
        use.disabled = true;
        ctl.board.three = { set: today, done: {}, items: list.map(function (x) { return { t: x.t, d: x.d }; }) };
        ctl.save().then(function () { drawThree(); });
      });
      keep.addEventListener('click', function () { sugKeep = true; drawSug(); });
    }
    function drawWeek() {
      var ctl = ctlRef, items = ctl.board.week.items || [];
      wb.innerHTML = '';
      if (!items.length) { wb.appendChild(fqT('li', 'lk-fq-set', 'Nothing planned. Tap Edit to sketch the week.')); return; }
      var wd = '', dn = String(now.getDate()); try { wd = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase(); } catch (e) {}
      items.forEach(function (x) {
        var label = String(x.day || ''), parts = label.toLowerCase().split(/\s+/);
        var isToday = parts[0] && wd && parts[0].slice(0, 3) === wd.slice(0, 3) && (!parts[1] || parts[1] === dn);
        var li = fqT('li', 'lk-fq-day' + (x.hot ? ' hot' : isToday ? ' today' : ''));
        li.appendChild(fqT('span', 'd', isToday ? 'Today' : label)); li.appendChild(fqT('span', 't', x.t)); wb.appendChild(li);
      });
    }
    R.draw = function (ctl) { ctlRef = ctl; drawThree(); drawWeek(); };
    R.wire = function (ctl) {
      fqEditor(th.right, tb, { name: 'Today’s three', ctl: ctl, label: 'Up to five, one per line', help: 'Write it as  Title: one line of detail  (the detail is optional). Saving starts a fresh day, so every box unticks.',
        toText: function () { return (ctl.board.three.items || []).map(function (x) { return x.d ? x.t + ': ' + x.d : x.t; }).join('\n'); },
        fromText: function (s) { ctl.board.three = { set: today, done: {}, items: fqLines(s).slice(0, 5).map(fqPair) }; }, redraw: drawThree });
      fqEditor(wh.right, wb, { name: 'This week', ctl: ctl, label: 'One line per day', help: 'Like  Thu 5: Vendor Circle at Mia’s Table.  Start a line with ! to make it the big one.',
        toText: function () { return (ctl.board.week.items || []).map(function (x) { return (x.hot ? '!' : '') + x.day + ': ' + x.t; }).join('\n'); },
        fromText: function (s) { ctl.board.week = { items: fqLines(s).map(function (l) { var hot = l.charAt(0) === '!'; var pr = fqPair(hot ? l.slice(1).trim() : l); return { day: pr.d ? pr.t : '', t: pr.d || pr.t, hot: hot }; }) }; }, redraw: drawWeek });
    };
    return R;
  }

  // Waiting on you + Decide, from Clo's brief (#237 Phase 1). The row stays hidden
  // until a brief exists; the Decide card hides when the brief has no decisions.
  function fqBriefRow(now) {
    var W = { el: fqT('div', 'lk-fq-row lk-fq-briefrow') }; W.el.hidden = true;
    var wait = fqCard('lk-fq-wait'), wh = fqHead(wait, 'wait', 'Waiting on you', 'Nothing is waiting on you.');
    var wl = fqT('ul', 'lk-fq-wl'); wait.appendChild(wl);
    var dec = fqCard('lk-fq-decide'), dh = fqHead(dec, 'decide', 'Decide', 'Nothing to decide today.');
    var dl = fqT('ul', 'lk-fq-wl dec'); dec.appendChild(dl);
    W.el.appendChild(wait); W.el.appendChild(dec);
    W.draw = function (ctl) {
      var bf = ctl.brief; wl.innerHTML = ''; dl.innerHTML = '';
      if (!bf || (!bf.waiting.length && !bf.decisions.length)) { W.el.hidden = true; return; }
      W.el.hidden = false;
      var bw = fqBriefWhen(bf.date, now), n = bf.waiting.length;
      wh.h.textContent = n ? (n === 1 ? 'One thing is on you.' : fqWords(n) + ' things are on you.') : 'Nothing is waiting on you.';
      wh.right.innerHTML = ''; wh.right.appendChild(fqT('span', 'lk-fq-chip v', 'Clo, ' + (bw ? bw.replace(/^(From|For) /, '') : 'today')));
      bf.waiting.forEach(function (x) {
        var li = fqT('li'), tx = fqT('div'); tx.appendChild(fqT('b', null, x.t)); if (x.d) tx.appendChild(fqT('small', null, x.d)); li.appendChild(tx);
        if (x.w) li.appendChild(fqT('span', 'lk-fq-chip' + (/overdue|stale|today/i.test(x.w) ? ' r' : ' v'), x.w));
        wl.appendChild(li);
      });
      var m = bf.decisions.length; dec.hidden = !m;
      dh.h.textContent = m === 1 ? 'One call is yours.' : fqWords(m) + ' calls are yours.';
      bf.decisions.forEach(function (x, i) { var li = fqT('li'), tx = fqT('div'); tx.appendChild(fqT('b', null, (i + 1) + '. ' + x.t)); if (x.pick) tx.appendChild(fqT('small', null, x.pick)); li.appendChild(tx); dl.appendChild(li); });
    };
    return W;
  }

  // Road to billing day + money. Filled once the insights payload lands.
  function fqGrowthRow() {
    var G = { el: fqT('div', 'lk-fq-row') };
    var road = fqCard('lk-fq-road'); road.appendChild(fqKick('road', 'The road to billing day'));
    var rb = fqT('div'); rb.appendChild(fqT('p', 'lk-fq-p', 'Counting storefronts…')); road.appendChild(rb);
    var money = fqCard('lk-fq-money'); money.appendChild(fqKick('money', 'Money moves'));
    var mb = fqT('div', 'lk-fq-mb'); money.appendChild(mb);
    G.el.appendChild(road); G.el.appendChild(money);
    G.fill = function (d, pub, now) {
      // ROAD: live storefronts that serve The Woodlands (location 1), the rule in
      // docs/marketing/lokali-marketing-and-offerings-2026-10.md §7 (TODO #233).
      var ring = pub.filter(function (r) { return (r.v.locations || []).indexOf(1) >= 0; }), n = ring.length;
      var pace = pub.filter(function (r) { return r.v.published_at && (now - new Date(r.v.published_at)) / 86400000 <= 30; }).length;
      var fresh = pub.filter(function (r) { return r.v.published_at && (now - new Date(r.v.published_at)) / 86400000 <= 7; }).length;
      rb.innerHTML = '';
      var big = fqT('h2', 'lk-fq-big'); big.appendChild(fqT('em', null, fqN(n))); big.appendChild(document.createTextNode(' of 100 in The Woodlands ring.')); rb.appendChild(big);
      var eta = '';
      if (n >= 100) eta = ' You are there.';
      else if (pace) {
        var t = new Date(now.getTime() + ((100 - n) / pace) * 30 * 86400000), dd = t.getDate(), mon = '';
        try { mon = t.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch (e) {}
        eta = ' At this month’s pace (' + pace + ' published) you get there in ' + (dd <= 10 ? 'early ' : dd <= 20 ? 'mid ' : 'late ') + mon + ',';
      }
      rb.appendChild(fqT('p', 'lk-fq-p', 'Billing starts at 100 live here, with every category at three.' + eta + (n >= 100 ? '' : ' and nobody is billed without a month’s notice.')));
      var bar = fqT('div', 'lk-fq-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', n + ' of 100 live storefronts');
      var fill = fqT('b'); fill.style.width = Math.min(100, n) + '%'; bar.appendChild(fill);
      var tick = fqT('i'); tick.style.left = '50%'; bar.appendChild(tick);
      var dot = fqT('u'); dot.style.left = Math.min(100, Math.max(2, n)) + '%'; bar.appendChild(dot); rb.appendChild(bar);
      var miles = fqT('div', 'lk-fq-miles');
      [['You are here · ' + n, fresh ? fqWords(fresh) + ' new storefront' + (fresh === 1 ? '' : 's') + ' this week.' : 'No new storefronts this week yet.', 'here'],
       ['At 50', 'First Content Day. First Setup sold at $149.'], ['At 100', 'Billing day. Annual plans ready.'], ['At 250', 'A second neighborhood, its own founders.']]
        .forEach(function (m) { var x = fqT('div', 'lk-fq-mile' + (m[2] ? ' ' + m[2] : '')); x.appendChild(fqT('b', null, m[0])); x.appendChild(document.createTextNode(m[1])); miles.appendChild(x); });
      rb.appendChild(miles);
      rb.appendChild(fqT('div', 'lk-fq-hr'));
      var ch = fqT('div', 'lk-fq-cath'); ch.appendChild(fqT('h3', null, 'The category floor')); ch.appendChild(fqT('span', null, 'Live in The Woodlands · three makes a choice')); rb.appendChild(ch);
      var cats = (d.categories || []).map(function (c) { return { name: c.name, n: ring.filter(function (r) { return (r.v.categories || []).indexOf(c.id) >= 0; }).length }; });
      cats.sort(function (a, b) { return ((a.n >= 3) - (b.n >= 3)) || (a.n - b.n) || String(a.name).localeCompare(String(b.name)); });
      var grid = fqT('div', 'lk-fq-cats');
      cats.forEach(function (c) {
        var row = fqT('div', 'lk-fq-cat'); row.appendChild(fqT('span', 'nm', c.name));
        var dots = fqT('span', 'dots'); dots.setAttribute('aria-hidden', 'true');
        for (var k = 0; k < 3; k++) dots.appendChild(fqT('i', k < c.n ? null : 'off'));
        dots.appendChild(fqT('span', 'x', c.n > 3 ? '+' + (c.n - 3) : '')); row.appendChild(dots);
        row.appendChild(fqT('span', 'ch' + (c.n < 3 ? ' need' : ''), c.n >= 3 ? 'Floor met' : 'Need ' + (3 - c.n)));
        row.setAttribute('aria-label', c.name + ': ' + c.n + ' live'); grid.appendChild(row);
      });
      rb.appendChild(grid);
      var gaps = cats.filter(function (c) { return c.n < 3; });
      if (cats.length) {
        var clo = fqT('p', 'lk-fq-clo');
        clo.appendChild(document.createTextNode(gaps.length
          ? (gaps.length === 1 ? 'One category stands' : fqWords(gaps.length) + ' categories stand') + ' between you and a real city: ' + gaps.map(function (g) { return g.name; }).join(gaps.length === 2 ? ' and ' : ', ') + '. '
          : 'Every category has three. The Woodlands is a real city now. '));
        clo.appendChild(fqT('span', 'lk-fq-sign', 'Clo')); rb.appendChild(clo);
      }

      // MONEY: revenue from the same payload (Stripe-synced plan rows).
      var rev = d.revenue || {}, paying = Number(rev.paying) || 0, mrr = (Number(rev.mrr_cents) || 0) / 100, trial = (Number(rev.trial_mrr_cents) || 0) / 100;
      var plans = {}; (rev.by_plan || []).forEach(function (x) { plans[x.plan] = x.n; });
      mb.innerHTML = '';
      var h = fqT('h2', 'lk-fq-mh');
      if (!paying) { h.appendChild(document.createTextNode('$0 billed.')); h.appendChild(fqT('em', null, 'On purpose.')); }
      else { h.appendChild(document.createTextNode(fqMoney(mrr) + ' a month.')); h.appendChild(fqT('em', null, 'And counting.')); }
      mb.appendChild(h);
      mb.appendChild(fqT('p', 'lk-fq-p', 'Pro is $' + FQ_PRICE.pro + ' and Featured is $' + FQ_PRICE.featured + ' a month. Founding vendors keep today’s rate for as long as they stay.'));
      var tbx = fqT('div', 'lk-fq-today'); tbx.appendChild(fqT('span', 'k', paying ? 'With every trial converted' : 'If billing started today'));
      var tn = fqT('span', 'n', fqMoney(trial + mrr)); tn.appendChild(fqT('small', null, 'a month')); tbx.appendChild(tn);
      tbx.appendChild(fqT('p', null, 'From ' + fqN(rev.trialing) + ' trial' + (rev.trialing === 1 ? '' : 's') + '. ' + fqN(paying) + ' paying' + (paying ? '' : ' yet') + ', ' + fqN(rev.comped) + ' comped. Plans: ' + fqN(plans.free) + ' Free, ' + fqN(plans.pro) + ' Pro, ' + fqN(plans.featured) + ' Featured.'));
      mb.appendChild(tbx);
      var dial = fqT('div', 'lk-fq-dial'); dial.appendChild(fqT('span', 'k', 'Billing day. Slide your assumptions.'));
      function slider(id, label, min, max, step, val, fmt) {
        var w = fqT('div', 'lk-fq-sl'), top = fqT('div'), l = fqT('label', null, label), out = fqT('b', null, fmt(val)); l.htmlFor = id; top.appendChild(l); top.appendChild(out); w.appendChild(top);
        var inp = fqT('input'); inp.type = 'range'; inp.id = id; inp.min = min; inp.max = max; inp.step = step; inp.value = val; w.appendChild(inp); dial.appendChild(w);
        return { inp: inp, out: out, fmt: fmt };
      }
      var sp = slider('lk-fq-paid', 'Paid storefronts', 0, 150, 1, 40, function (x) { return String(x); });
      var sf = slider('lk-fq-feat', 'Share on Featured', 0, 100, 5, 25, function (x) { return x + '%'; });
      var res = fqT('div', 'lk-fq-out'), rn = fqT('span', 'n'), rl = fqT('span'); res.appendChild(rn); res.appendChild(rl); dial.appendChild(res);
      function calc() {
        var P = Number(sp.inp.value) || 0, Fp = (Number(sf.inp.value) || 0) / 100, m = Math.round(P * (Fp * FQ_PRICE.featured + (1 - Fp) * FQ_PRICE.pro));
        sp.out.textContent = sp.fmt(sp.inp.value); sf.out.textContent = sf.fmt(sf.inp.value);
        rn.textContent = fqMoney(m); rl.textContent = 'a month · ' + fqMoney(m * 12) + ' a year';
      }
      sp.inp.addEventListener('input', calc); sf.inp.addEventListener('input', calc); calc();
      mb.appendChild(dial);
      mb.appendChild(fqT('p', 'lk-fq-p sm', 'Every move from Pro to Featured adds $' + (FQ_PRICE.featured - FQ_PRICE.pro) + ' a month. Setup at $149 starts at 50 vendors, and Lokali Checkout fees come on top once it’s live.'));
    };
    G.fail = function () { rb.innerHTML = ''; rb.appendChild(fqT('p', 'lk-fq-p', 'The numbers could not load. Refresh the page to try again.')); };
    return G;
  }

  // Prospects (live), shopper side (live), content rhythm (hand-written).
  function fqLowerRow(goProspects) {
    var L = { el: fqT('div', 'lk-fq-row') };
    var pr = fqCard('lk-fq-third'), ph = fqHead(pr, 'send', 'Outreach', 'Checking who is due…');
    var pb = fqT('div', 'lk-fq-mini v'); pr.appendChild(pb);
    var pn = fqT('p', 'lk-fq-p sm', 'Two notes in your voice, then it lets go. Log every send there.'); pr.appendChild(pn);
    var go = fqT('button', 'lk-ash-btn', 'Open Prospects'); go.type = 'button'; go.addEventListener('click', goProspects); pr.appendChild(go);
    var sh = fqCard('lk-fq-third'), shh = fqHead(sh, 'shop', 'Shopper side', 'Counting shoppers…');
    var sb = fqT('div', 'lk-fq-mini'); sh.appendChild(sb);
    sh.appendChild(fqT('p', 'lk-fq-p sm', 'Vendors first was the right order. Shoppers are the next chapter. At 1,000 subscribers, a second neighborhood opens.'));
    var rh = fqCard('lk-fq-third'), rhh = fqHead(rh, 'rhythm', 'On repeat', 'Your content rhythm.');
    var rl = fqT('ul', 'lk-fq-lines'); rh.appendChild(rl);
    L.el.appendChild(pr); L.el.appendChild(sh); L.el.appendChild(rh);
    function mini(host, items) { host.innerHTML = ''; items.forEach(function (x) { var c = fqT('div'); c.appendChild(fqT('b', null, fqN(x[0]))); c.appendChild(fqT('span', null, x[1])); host.appendChild(c); }); }
    L.fillProspects = function (rows) {
      var due = rows.filter(function (r) { return r.due; }).length, wait = rows.filter(function (r) { return r.status === 'waiting' && !r.due; }).length;
      var won = rows.filter(function (r) { return r.status === 'replied' || r.status === 'signed_up'; }).length, quiet = rows.filter(function (r) { return r.status === 'quiet'; }).length;
      ph.h.textContent = ''; if (due) { ph.h.appendChild(fqT('em', null, fqN(due))); ph.h.appendChild(document.createTextNode(' ready to send.')); } else ph.h.textContent = 'Nobody is due today.';
      mini(pb, [[due, 'Ready to send'], [wait, 'Waiting'], [won, 'Replied or signed up'], [quiet, 'Quiet']]);
    };
    L.failProspects = function () { ph.h.textContent = 'Prospects could not load.'; };
    L.fillShoppers = function (d, t, rows) {
      var s = d.shoppers || {}, nl = Number(s.newsletter) || 0, reviews = 0;
      rows.forEach(function (r) { reviews += Number(r.v.reviews_all) || 0; });
      shh.h.textContent = ''; shh.h.appendChild(fqT('em', null, fqN(nl))); shh.h.appendChild(document.createTextNode(nl === 1 ? ' shopper subscriber.' : ' shopper subscribers.'));
      mini(sb, [[t.qr_scans, 'QR scans · 30 days'], [s.accounts, 'Shopper accounts'], [(d.leads || {}).inquiries_waiting_24h, 'Inquiries waiting over a day'], [reviews, 'Reviews, all time']]);
    };
    L.failShoppers = function () { shh.h.textContent = 'The numbers could not load.'; };
    var ctlRef = null;
    function drawRhythm() {
      var items = ctlRef.board.rhythm.items || []; rl.innerHTML = '';
      if (!items.length) { rl.appendChild(fqT('li', 'lk-fq-set', 'Nothing on repeat yet. Tap Edit to add your series.')); return; }
      items.forEach(function (x) { var li = fqT('li'); li.appendChild(fqT('b', null, x.t)); if (x.d) li.appendChild(fqT('span', null, x.d)); rl.appendChild(li); });
    }
    L.draw = function (ctl) { ctlRef = ctl; drawRhythm(); };
    L.wire = function (ctl) {
      fqEditor(rhh.right, rl, { name: 'On repeat', ctl: ctl, help: 'Write it as  Series: where it stands.',
        toText: function () { return (ctl.board.rhythm.items || []).map(function (x) { return x.d ? x.t + ': ' + x.d : x.t; }).join('\n'); },
        fromText: function (s) { ctl.board.rhythm = { items: fqLines(s).map(fqPair) }; }, redraw: drawRhythm });
    };
    return L;
  }

  // House rules (hers, fixed), engine room, protected time (hand-written).
  function fqHouseRow() {
    var Hs = { el: fqT('div', 'lk-fq-row') };
    var house = fqCard('lk-fq-house'); house.appendChild(fqKick('house', 'Your house'));
    house.appendChild(fqT('h2', null, 'House rules.'));
    house.appendChild(fqT('p', 'lk-fq-p ink', 'I keep them so you never have to repeat yourself.'));
    var ul = fqT('ul', 'lk-fq-rules');
    ['No em dashes, ever.', 'Icons, never emoji.', 'Never “cheap.” Never “free forever.”', 'Plus Jakarta Sans, everywhere.', 'No ink. Orange and violet never share a card.', 'No favorite vendor in public.', 'The kids stay out of the copy.', 'It’s done when it’s verified live.']
      .forEach(function (r) { var li = fqT('li'), s = fqT('span', null, '✦'); s.setAttribute('aria-hidden', 'true'); li.appendChild(s); li.appendChild(document.createTextNode(r)); ul.appendChild(li); });
    house.appendChild(ul);
    var eng = fqCard('lk-fq-eng'), eh = fqHead(eng, 'engine', 'Engine room', 'The site is humming.');
    eh.right.appendChild(fqT('span', 'lk-fq-chip', 'All quiet'));
    var el = fqT('ul', 'lk-fq-englist'); eng.appendChild(el);
    var ver = ''; try { var ss = document.getElementsByTagName('script'); for (var i = 0; i < ss.length; i++) { var m = /@?(\d+\.\d+\.\d+)\/scripts\/lokali-account\.js/.exec(ss[i].src || ''); if (m) { ver = m[1]; break; } } } catch (e) {}
    var lBoard = fqT('span', null, 'Checking where your cards are kept…'), lBrief = fqT('span', null, 'Checking for Clo’s brief…');
    [['g', ver ? 'Scripts pinned at v' + ver + '.' : 'Scripts are pinned to an exact release.'], ['v', lBoard], ['p', lBrief], ['p', 'Any policy or grant change: the three isolation grids run again.'], ['r', 'After any deploy, check it actually landed.']]
      .forEach(function (x) { var li = fqT('li'); li.appendChild(fqT('i', x[0])); if (x[1].nodeType) li.appendChild(x[1]); else li.appendChild(fqT('span', null, x[1])); el.appendChild(li); });
    var off = fqCard('lk-fq-off'), oh = fqHead(off, 'off', 'Protected time', 'Off the clock.');
    off.appendChild(fqT('p', 'lk-fq-p ink', 'I hold these. Nothing gets booked over them.'));
    var ol = fqT('ul', 'lk-fq-pt'); off.appendChild(ol);
    Hs.el.appendChild(house); Hs.el.appendChild(eng); Hs.el.appendChild(off);
    var ctlRef = null;
    function drawOff() {
      var items = ctlRef.board.protected.items || []; ol.innerHTML = '';
      items.forEach(function (x) { var li = fqT('li'); li.appendChild(fqT('span', null, x.t)); li.appendChild(fqT('span', 'v', x.d)); ol.appendChild(li); });
    }
    Hs.draw = function (ctl) { ctlRef = ctl; drawOff(); };
    Hs.onStore = function (ctl) {
      if (!ctl.loaded) return;
      lBoard.textContent = ctl.remote ? 'Your hand-written cards are saved to Lokali, so they follow you everywhere.' : 'Your hand-written cards are saved in this browser until patch_admin_board.sql is applied.';
      var bf = ctl.brief, at = '';
      if (bf && bf.at) { try { at = new Date(bf.at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) {} }
      lBrief.textContent = bf ? 'Clo’s brief landed ' + (at || 'today') + '. It also sits in team/briefs on the Mac.' : 'No brief from Clo on this page yet. It shows here once patch_admin_brief.sql is applied and the morning task has run.';
    };
    Hs.wire = function (ctl) {
      fqEditor(oh.right, ol, { name: 'Protected time', ctl: ctl, help: 'Write it as  What: when.',
        toText: function () { return (ctl.board.protected.items || []).map(function (x) { return x.d ? x.t + ': ' + x.d : x.t; }).join('\n'); },
        fromText: function (s) { ctl.board.protected = { items: fqLines(s).map(fqPair) }; }, redraw: drawOff });
    };
    return Hs;
  }

  // Founder HQ styles: lavender ground, white 28px cards, one solid violet arch,
  // italic 800 numerals, pink only as a spark. Teal = shoppers, rose = vendors,
  // violet = action (the 10-10 colour code). Dark mode maps every surface.
  function injectFounderCSS() {
    if (document.getElementById('lokali-founder-styles')) return;
    var st = document.createElement('style');
    st.id = 'lokali-founder-styles';
    var D = 'html.lk-dark .lk-ash ';
    st.textContent =
      ".lk-ash [hidden]{display:none !important;}" +
      ".lk-ash button:focus-visible,.lk-ash a:focus-visible,.lk-ash input:focus-visible,.lk-ash textarea:focus-visible{outline:3px solid #EE0290;outline-offset:3px;}" +
      ".lk-fq-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;}" +
      ".lk-fq-date{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#5E5873;}" +
      ".lk-fq-play{display:inline-flex;align-items:center;gap:10px;background:#fff;border-radius:999px;padding:6px 18px 6px 6px;min-height:44px;}" +
      ".lk-fq-play .eqw{width:32px;height:32px;border-radius:16px;background:#FBE9F2;display:flex;align-items:center;justify-content:center;}" +
      ".lk-fq-eq{display:inline-flex;align-items:flex-end;gap:2px;height:14px;}" +
      ".lk-fq-eq i{display:block;width:3px;height:6px;background:#EE0290;border-radius:2px;animation:lkfqeq .9s ease-in-out infinite;}" +
      ".lk-fq-eq i:nth-child(2){animation-delay:.18s;}.lk-fq-eq i:nth-child(3){animation-delay:.36s;}.lk-fq-eq i:nth-child(4){animation-delay:.09s;}" +
      "@keyframes lkfqeq{0%,100%{height:4px;}50%{height:14px;}}" +
      ".lk-fq-play small{display:block;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#A63D74;line-height:1.3;}" +
      ".lk-fq-play b{display:block;font-size:13px;font-weight:700;color:#2B2640;line-height:1.3;}" +
      ".lk-fq-row{display:flex;flex-wrap:wrap;gap:20px;align-items:stretch;margin:0 0 20px;}" +
      ".lk-fq-card{background:#fff;border-radius:28px;padding:28px;color:#2B2640;min-width:0;box-sizing:border-box;}" +
      ".lk-fq-card h2{margin:0;font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-.03em;color:#2B2640;text-wrap:balance;}" +
      ".lk-fq-card h2 em,.lk-fq-big em{font-style:italic;color:#6002EE;}" +
      ".lk-fq-hd{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px 12px;margin:0 0 16px;}" +
      ".lk-fq-hd>div:first-child{flex:1 1 180px;min-width:0;}" +
      ".lk-fq-hr-r{display:flex;flex-wrap:wrap;align-items:center;gap:10px;}" +
      ".lk-fq-kick{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#5E5873;margin:0 0 6px;}" +
      ".lk-fq-ico{display:inline-flex;width:16px;height:16px;color:#6002EE;}.lk-fq-ico svg{width:16px;height:16px;}" +
      ".lk-fq-p{margin:8px 0 0;font-size:15px;line-height:1.6;color:#5E5873;max-width:640px;}.lk-fq-p.sm{font-size:14px;}.lk-fq-p.ink{color:#2B2640;}" +
      ".lk-fq-edit{all:unset;box-sizing:border-box;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:#4A4761;border:2px solid #E5D4FD;border-radius:999px;padding:0 14px;min-height:40px;display:inline-flex;align-items:center;gap:6px;}" +
      ".lk-fq-edit svg{width:12px;height:12px;}.lk-fq-edit:hover{border-color:#C9B2F4;color:#2B2640;}" +
      ".lk-fq-form{display:flex;flex-direction:column;gap:10px;}" +
      ".lk-fq-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:#2B2640;}" +
      ".lk-fq-form textarea,.lk-fq-form input{font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;color:#2B2640;background:#fff;border:2px solid #E5D4FD;border-radius:14px;padding:12px 14px;width:100%;box-sizing:border-box;line-height:1.5;}" +
      ".lk-fq-form textarea{resize:vertical;}.lk-fq-form input{min-height:48px;padding:0 14px;}" +
      ".lk-fq-form textarea:focus,.lk-fq-form input:focus{outline:none;border-color:#6002EE;}" +
      ".lk-fq-form .help{font-size:13px;color:#5E5873;line-height:1.5;margin:0;white-space:pre-wrap;}" +
      ".lk-fq-form .acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}" +
      ".lk-fq-msg{margin:12px 0 0;font-size:13px;font-weight:700;color:#1A6640;}.lk-fq-msg.warn{color:#A63D74;}" +
      ".lk-fq-set{margin:12px 0 0;font-size:13px;font-weight:600;color:#5E5873;list-style:none;}" +
      /* hero */
      ".lk-fq-hello{flex:2 1 520px;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:22px;padding:clamp(22px,3.4vw,42px);}" +
      ".lk-fq-spark{position:absolute;line-height:1;pointer-events:none;}.lk-fq-spark.a{top:18px;right:26px;font-size:56px;color:#EE0290;}.lk-fq-spark.b{top:68px;right:86px;font-size:22px;color:#E5D4FD;}" +
      ".lk-fq-card h2.lk-fq-h1{margin:0;font-size:clamp(34px,4vw,58px);line-height:.98;font-weight:800;letter-spacing:-.045em;max-width:720px;padding-right:56px;}" +
      ".lk-fq-h1 span,.lk-fq-h1 em{display:block;}.lk-fq-h1 em{font-style:italic;color:#6002EE;}" +
      ".lk-fq-note{display:flex;gap:14px;align-items:flex-start;background:#FBE9F2;border-radius:22px;padding:18px 22px;max-width:680px;}" +
      ".lk-fq-av{flex:0 0 38px;width:38px;height:38px;border-radius:19px;background:#A63D74;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-style:italic;font-size:17px;}" +
      ".lk-fq-note p{margin:0;font-size:16px;line-height:1.6;color:#2B2640;}" +
      ".lk-fq-story{font-weight:700;}.lk-fq-story em{font-style:normal;font-weight:500;}" +
      ".lk-fq-sign{font-weight:700;font-style:italic;color:#A63D74;white-space:nowrap;}" +
      ".lk-fq-stats{display:flex;flex-wrap:wrap;gap:12px;}" +
      ".lk-fq-stat{flex:1 1 150px;min-width:0;box-sizing:border-box;background:#F7F2FF;border-radius:22px;padding:18px 20px;display:flex;flex-direction:column;gap:6px;}" +
      ".lk-fq-stat .l{font-size:13px;font-weight:600;color:#5E5873;}" +
      ".lk-fq-stat .n{font-size:48px;font-weight:800;font-style:italic;letter-spacing:-.05em;line-height:1;color:#2B2640;font-variant-numeric:tabular-nums;}" +
      ".lk-fq-stat .n small{font-size:24px;color:#5E5873;letter-spacing:-.02em;}" +
      ".lk-fq-chip{align-self:flex-start;font-size:12px;font-weight:700;border-radius:999px;padding:4px 10px;background:#E4F7EE;color:#1A6640;white-space:nowrap;}" +
      ".lk-fq-chip.v{background:#EDE3FF;color:#4A1DB0;}.lk-fq-chip.r{background:#FBE9F2;color:#A63D74;}" +
      ".lk-fq-dots{display:grid;grid-template-columns:repeat(10,10px);gap:4px;}" +
      ".lk-fq-dots i{display:block;width:10px;height:10px;border-radius:5px;background:#DCCDF7;}.lk-fq-dots i.on{background:#6002EE;}" +
      /* the arch */
      ".lk-fq-arch{flex:1 1 300px;box-sizing:border-box;background:#6002EE;color:#fff;border-radius:240px 240px 32px 32px;padding:72px 26px 26px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;min-width:0;}" +
      ".lk-fq-arch .k{font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#E9DDFF;}" +
      ".lk-fq-arch .big{font-size:clamp(104px,10vw,164px);font-weight:800;font-style:italic;line-height:.82;letter-spacing:-.07em;margin-top:6px;}" +
      ".lk-fq-arch .big.sm{font-size:clamp(56px,6vw,84px);letter-spacing:-.05em;}" +
      ".lk-fq-arch .sub{font-size:18px;font-weight:700;}" +
      ".lk-ash .lk-fq-arch h2{margin:10px 0 0;font-size:22px;line-height:1.2;font-weight:800;letter-spacing:-.02em;max-width:300px;color:#fff;}" +
      ".lk-fq-arch p{margin:0;font-size:15px;line-height:1.55;color:#EFE6FF;}.lk-fq-arch p .pl{display:block;}" +
      ".lk-fq-arch .chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:6px;}" +
      ".lk-fq-arch .chips span{font-size:13px;font-weight:700;background:rgba(255,255,255,.16);border-radius:999px;padding:5px 12px;}.lk-fq-arch .chips span.w{background:#fff;color:#4A1DB0;font-weight:800;}" +
      ".lk-fq-prep{list-style:none;margin:10px 0 0;padding:10px 12px;width:100%;box-sizing:border-box;background:rgba(255,255,255,.13);border-radius:22px;display:flex;flex-direction:column;gap:2px;text-align:left;}" +
      ".lk-fq-prep button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;min-height:44px;width:100%;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:600;color:#fff;border-radius:12px;padding:0 6px;}" +
      ".lk-fq-prep button:hover{background:rgba(255,255,255,.1);}" +
      ".lk-fq-prep i{flex:0 0 22px;width:22px;height:22px;box-sizing:border-box;border-radius:11px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#6002EE;}" +
      ".lk-fq-prep .on i{background:#fff;}.lk-fq-prep i svg{width:11px;height:11px;}" +
      ".lk-fq-arch .lk-fq-edit{color:#fff;border-color:rgba(255,255,255,.45);margin-top:10px;}.lk-fq-arch .lk-fq-edit:hover{border-color:#fff;color:#fff;}" +
      ".lk-fq-arch .lk-fq-form{width:100%;text-align:left;}.lk-fq-arch .lk-fq-form label{color:#fff;}.lk-fq-arch .lk-fq-form .k{text-align:center;}" +
      ".lk-fq-arch .lk-fq-form .lk-ash-btn:not(.primary){background:transparent;color:#fff;border-color:rgba(255,255,255,.5);}" +
      ".lk-fq-arch .lk-fq-form .lk-ash-btn.primary{background:#fff;border-color:#fff;color:#4A1DB0;}" +
      /* today's three + this week */
      ".lk-fq-three{flex:1 1 400px;}.lk-fq-week{flex:1.25 1 460px;}" +
      ".lk-fq-tasks{display:flex;flex-direction:column;gap:10px;}" +
      ".lk-fq-task{display:flex;gap:16px;align-items:flex-start;padding:16px 18px;border-radius:22px;background:#F8F4FF;}" +
      ".lk-fq-chk{all:unset;box-sizing:border-box;cursor:pointer;flex:0 0 44px;width:44px;height:44px;border-radius:22px;border:2px solid #C9B2F4;background:#fff;display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .15s ease;}" +
      ".lk-fq-chk:hover{transform:scale(1.07);}.lk-fq-chk svg{width:18px;height:18px;}" +
      ".lk-fq-chk[aria-pressed='true']{background:#6002EE;border-color:#6002EE;}" +
      ".lk-fq-task b{display:block;font-size:17px;font-weight:800;letter-spacing:-.015em;color:#2B2640;line-height:1.35;}" +
      ".lk-fq-task.done b{color:#5E5873;text-decoration:line-through;text-decoration-color:#EE0290;text-decoration-thickness:2px;}" +
      ".lk-fq-task small{display:block;font-size:14px;line-height:1.55;color:#5E5873;margin-top:4px;}" +
      ".lk-fq-prog{display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:13px;font-weight:700;color:#5E5873;}" +
      ".lk-fq-prog div{display:flex;gap:4px;}.lk-fq-prog i{display:block;width:28px;height:6px;border-radius:3px;background:#E5D4FD;}.lk-fq-prog i.on{background:#6002EE;}" +
      ".lk-fq-yay{display:flex;align-items:center;gap:12px;background:#FBE9F2;border-radius:20px;padding:16px 18px;font-size:16px;font-weight:700;}" +
      ".lk-fq-yay .s{font-size:26px;color:#EE0290;line-height:1;}.lk-fq-yay em{font-style:italic;color:#A63D74;}" +
      ".lk-fq-weeklist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}" +
      ".lk-fq-day{display:flex;gap:14px;align-items:center;padding:12px 14px;border-radius:18px;background:#F8F4FF;}" +
      ".lk-fq-day .d{flex:0 0 64px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5E5873;text-align:center;line-height:1.25;}" +
      ".lk-fq-day .t{font-size:15px;font-weight:600;line-height:1.45;min-width:0;}" +
      ".lk-fq-day.today{background:#EEE6FF;}.lk-fq-day.today .d{color:#4A1DB0;}" +
      ".lk-fq-day.hot{background:#FBE9F2;box-shadow:inset 0 0 0 2px #F3B9D6;padding:16px 14px;}.lk-fq-day.hot .d{color:#A63D74;}.lk-fq-day.hot .t{font-weight:800;}" +
      /* Clo's brief: the one-liner in the note, Clo suggests, waiting on you + decide (#237) */
      ".lk-fq-brief b{font-weight:800;color:#A63D74;}" +
      ".lk-fq-sug{margin-top:14px;background:#FBE9F2;border-radius:22px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;}" +
      ".lk-fq-sug .k{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#A63D74;}" +
      ".lk-fq-av.sm{flex:0 0 24px;width:24px;height:24px;border-radius:12px;font-size:12px;}" +
      ".lk-fq-sug ol{margin:0;padding:0 0 0 22px;display:flex;flex-direction:column;gap:8px;}" +
      ".lk-fq-sug li{font-size:15px;line-height:1.45;color:#2B2640;padding-left:2px;}.lk-fq-sug li::marker{font-weight:800;color:#A63D74;}" +
      ".lk-fq-sug li b{font-weight:800;}.lk-fq-sug li small{display:block;font-size:13px;line-height:1.5;color:#5E5873;margin-top:2px;}" +
      ".lk-fq-sug .acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}" +
      ".lk-fq-wait{flex:1.25 1 460px;}.lk-fq-decide{flex:1 1 400px;}" +
      ".lk-fq-wl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}" +
      ".lk-fq-wl li{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:14px 16px;border-radius:18px;background:#F8F4FF;}" +
      ".lk-fq-wl li>div{min-width:0;}.lk-fq-wl b{display:block;font-size:16px;font-weight:800;letter-spacing:-.01em;line-height:1.35;color:#2B2640;}" +
      ".lk-fq-wl small{display:block;font-size:14px;line-height:1.5;color:#5E5873;margin-top:3px;}" +
      ".lk-fq-wl .lk-fq-chip{flex:0 0 auto;margin-top:2px;}" +
      ".lk-fq-wl.dec li{background:#F7F2FF;}" +
      /* road + money */
      ".lk-fq-road{flex:1.6 1 520px;}.lk-fq-money{flex:1 1 340px;}" +
      ".lk-fq-card h2.lk-fq-big,.lk-fq-card h2.lk-fq-mh{font-size:clamp(28px,3vw,40px);line-height:1.05;letter-spacing:-.035em;}" +
      ".lk-fq-mh em{display:block;}" +
      ".lk-fq-bar{position:relative;height:20px;border-radius:999px;background:#EDE3FF;margin:22px 0 16px;}" +
      ".lk-fq-bar b{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:#6002EE;}" +
      ".lk-fq-bar i{position:absolute;top:-5px;bottom:-5px;width:3px;margin-left:-1px;border-radius:2px;background:#2B2640;opacity:.25;}" +
      ".lk-fq-bar u{position:absolute;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:15px;background:#fff;border:4px solid #EE0290;box-sizing:border-box;}" +
      ".lk-fq-miles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;}" +
      ".lk-fq-mile{background:#F7F2FF;border-radius:18px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;font-size:14px;font-weight:600;line-height:1.45;}" +
      ".lk-fq-mile b{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#4A1DB0;}.lk-fq-mile.here b{color:#A63D74;}" +
      ".lk-fq-hr{height:1px;background:#EDE3FF;margin:22px 0;}" +
      ".lk-fq-cath{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 12px;margin:0 0 10px;}" +
      ".lk-ash .lk-fq-cath h3{margin:0;font-size:19px;font-weight:800;letter-spacing:-.02em;color:#2B2640;}.lk-fq-cath span{font-size:13px;font-weight:600;color:#5E5873;}" +
      ".lk-fq-cats{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 28px;}" +
      ".lk-fq-cat{display:flex;align-items:center;gap:12px;min-height:44px;border-bottom:1px solid #F1EAFD;}" +
      ".lk-fq-cat .nm{flex:1;min-width:0;font-size:14px;font-weight:700;}" +
      ".lk-fq-cat .dots{display:flex;align-items:center;gap:4px;}" +
      ".lk-fq-cat .dots i{display:block;width:14px;height:14px;border-radius:7px;background:#6002EE;box-sizing:border-box;}" +
      ".lk-fq-cat .dots i.off{background:transparent;border:2px dashed #A63D74;}" +
      ".lk-fq-cat .x{font-size:12px;font-weight:700;color:#5E5873;min-width:22px;}" +
      ".lk-fq-cat .ch{font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;white-space:nowrap;background:#E4F7EE;color:#1A6640;}.lk-fq-cat .ch.need{background:#FBE9F2;color:#A63D74;}" +
      ".lk-fq-clo{margin:16px 0 0;font-size:15px;line-height:1.6;color:#2B2640;background:#FBE9F2;border-radius:18px;padding:14px 18px;}" +
      ".lk-fq-mb{display:flex;flex-direction:column;gap:16px;}" +
      ".lk-fq-today{background:#E4F7EE;border-radius:22px;padding:18px 20px;display:flex;flex-direction:column;gap:8px;}" +
      ".lk-fq-today .k,.lk-fq-dial .k{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#1A6640;}" +
      ".lk-fq-today .n{font-size:40px;font-weight:800;font-style:italic;letter-spacing:-.045em;line-height:1;color:#1A6640;}" +
      ".lk-fq-today .n small{font-size:16px;font-style:normal;font-weight:700;letter-spacing:0;margin-left:8px;}" +
      ".lk-fq-today p{margin:0;font-size:14px;font-weight:600;line-height:1.5;color:#2B2640;}" +
      ".lk-fq-dial{background:#F7F2FF;border-radius:24px;padding:20px;display:flex;flex-direction:column;gap:12px;}.lk-fq-dial .k{color:#A63D74;}" +
      ".lk-fq-sl div{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}" +
      ".lk-ash .lk-fq-sl label{font-size:14px;font-weight:700;color:#2B2640;}.lk-fq-sl b{font-size:18px;font-weight:800;}" +
      ".lk-fq-sl input{accent-color:#6002EE;width:100%;height:44px;margin:0;cursor:pointer;}" +
      ".lk-fq-out{background:#fff;border-radius:20px;padding:16px 18px;}" +
      ".lk-fq-out .n{display:block;font-size:clamp(38px,4vw,52px);font-weight:800;font-style:italic;letter-spacing:-.05em;line-height:1;color:#6002EE;}" +
      ".lk-fq-out span:last-child{font-size:15px;font-weight:700;}" +
      /* outreach, shoppers, rhythm */
      ".lk-fq-third{flex:1 1 300px;display:flex;flex-direction:column;gap:14px;}.lk-fq-third .lk-fq-hd{margin:0;}.lk-fq-third .lk-ash-btn{align-self:flex-start;}" +
      ".lk-fq-mini{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}" +
      ".lk-fq-mini div{border-radius:18px;padding:14px 16px;background:#E0F4F5;display:flex;flex-direction:column;gap:2px;min-width:0;}" +
      ".lk-fq-mini b{font-size:28px;font-weight:800;font-style:italic;letter-spacing:-.04em;color:#0F6B74;line-height:1.1;}" +
      ".lk-fq-mini span{font-size:13px;font-weight:600;line-height:1.35;}" +
      ".lk-fq-mini.v div{background:#F7F2FF;}.lk-fq-mini.v b{color:#4A1DB0;}" +
      ".lk-fq-lines{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;}" +
      ".lk-fq-lines li{display:flex;flex-direction:column;gap:2px;padding:10px 0;border-bottom:1px solid #F1EAFD;}.lk-fq-lines li:last-child{border-bottom:0;}" +
      ".lk-fq-lines b{font-size:15px;font-weight:800;}.lk-fq-lines span{font-size:13px;font-weight:600;color:#5E5873;}" +
      /* house rules, engine room, protected time */
      ".lk-fq-house{flex:1.3 1 380px;background:#FBE9F2;}.lk-fq-house .lk-fq-kick,.lk-fq-house .lk-fq-ico{color:#A63D74;}" +
      ".lk-ash .lk-fq-house h2{font-size:clamp(36px,3.8vw,50px);line-height:.95;font-style:italic;letter-spacing:-.045em;color:#A63D74;}" +
      ".lk-fq-rules{list-style:none;margin:16px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px 24px;}" +
      ".lk-fq-rules li{display:flex;gap:10px;align-items:baseline;font-size:15px;font-weight:700;line-height:1.45;}.lk-fq-rules li span{color:#EE0290;}" +
      ".lk-fq-eng{flex:1 1 300px;}.lk-fq-englist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;}" +
      ".lk-fq-englist li{display:flex;gap:12px;align-items:flex-start;font-size:14px;line-height:1.5;font-weight:600;}" +
      ".lk-fq-englist i{flex:0 0 10px;width:10px;height:10px;border-radius:5px;margin-top:6px;background:#1A6640;}.lk-fq-englist i.v{background:#1D5A9E;}.lk-fq-englist i.p{background:#6002EE;}.lk-fq-englist i.r{background:#A63D74;}" +
      ".lk-fq-off{flex:1 1 280px;background:#E4F7EE;}.lk-fq-off .lk-fq-kick,.lk-fq-off .lk-fq-ico{color:#1A6640;}" +
      ".lk-ash .lk-fq-off h2{font-size:30px;line-height:1;font-style:italic;letter-spacing:-.04em;color:#1A6640;}" +
      ".lk-fq-pt{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px;}" +
      ".lk-fq-pt li{display:flex;justify-content:space-between;gap:12px;background:#fff;border-radius:14px;padding:10px 14px;font-size:14px;font-weight:700;}.lk-fq-pt li .v{color:#1A6640;text-align:right;}" +
      ".lk-fq-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px;padding:4px 4px 0;font-size:13px;font-weight:600;color:#5E5873;}.lk-fq-foot em{font-style:italic;color:#A63D74;}" +
      ".lk-fq-pulse{margin:0 0 20px;}" +
      ".lk-ash .lk-ah-tile.lk-ash-kp{border:0;}" +
      ".lk-fq-eyebrow{margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#A63D74;}" +
      /* the Insights module, restyled from outside (its own sheet stays as is) */
      ".lk-ash .lki-q,.lk-ash .lki-sl,.lk-ash .lki-card{border:0;border-radius:24px;}" +
      ".lk-ash .lki-q{padding:20px 22px;}" +
      ".lk-ash .lki-q-ans small,.lk-ash .lki-gh span,.lk-ash .lk-admin-empty,.lk-ash .lk-admin-stat-lbl{color:#5E5873;}" +
      ".lk-ash .lki-q:hover{box-shadow:0 10px 24px rgba(96,2,238,.10);}" +
      "@media (max-width:991px){" +
        ".lk-fq-row{gap:14px;margin:0 0 14px;}.lk-fq-card{padding:20px;border-radius:24px;}.lk-fq-hello{padding:22px;}" +
        ".lk-fq-arch{padding:56px 20px 22px;border-radius:200px 200px 28px 28px;}" +
        ".lk-fq-card h2.lk-fq-h1{padding-right:40px;}.lk-fq-stat .n{font-size:40px;}" +
        ".lk-ash-bar{margin:0 0 14px;}" +
      "}" +
      "@media (prefers-reduced-motion:reduce){.lk-fq-eq i{animation:none;height:9px;}.lk-fq-chk{transition:none;}}" +
      /* dark */
      D + ".lk-fq-card{background:#242039;color:#F3F1FA;}" +
      D + ".lk-fq-card h2," + D + ".lk-fq-task b," + D + ".lk-fq-stat .n," + D + ".lk-fq-play b," + D + ".lk-fq-note p," + D + ".lk-fq-clo," + D + ".lk-fq-today p," + D + ".lk-fq-day .t," + D + ".lk-fq-cat .nm," + D + ".lk-fq-mile," + D + ".lk-fq-lines b," + D + ".lk-fq-rules li," + D + ".lk-fq-englist li," + D + ".lk-fq-pt li," + D + ".lk-fq-sl label," + D + ".lk-fq-sl b," + D + ".lk-fq-out span:last-child," + D + ".lk-fq-mini span," + D + ".lk-fq-yay," + D + ".lk-fq-form label," + D + ".lk-fq-cath h3," + D + ".lk-fq-p.ink{color:#F3F1FA;}" +
      D + ".lk-fq-date," + D + ".lk-fq-kick," + D + ".lk-fq-stat .l," + D + ".lk-fq-task small," + D + ".lk-fq-set," + D + ".lk-fq-p," + D + ".lk-fq-cat .x," + D + ".lk-fq-lines span," + D + ".lk-fq-form .help," + D + ".lk-fq-prog," + D + ".lk-fq-day .d," + D + ".lk-fq-stat .n small," + D + ".lk-fq-cath span{color:#B8B2CF;}" +
      "html.lk-dark .lk-fq-foot{color:#B8B2CF;}html.lk-dark .lk-fq-foot em,html.lk-dark .lk-fq-date{color:#F0A3C9;}" +
      D + ".lk-fq-stat," + D + ".lk-fq-task," + D + ".lk-fq-day," + D + ".lk-fq-mile," + D + ".lk-fq-dial," + D + ".lk-fq-mini.v div{background:#29223F;}" +
      "html.lk-dark .lk-fq-play{background:#242039;}html.lk-dark .lk-fq-play .eqw{background:#3E2638;}html.lk-dark .lk-fq-play small{color:#F0A3C9;}html.lk-dark .lk-fq-play b{color:#F3F1FA;}" +
      D + ".lk-fq-note," + D + ".lk-fq-clo," + D + ".lk-fq-yay," + D + ".lk-fq-day.hot{background:#3E2638;}" +
      D + ".lk-fq-sug{background:#3E2638;}" + D + ".lk-fq-sug li," + D + ".lk-fq-sug li b{color:#F3F1FA;}" + D + ".lk-fq-sug li small{color:#B8B2CF;}" +
      D + ".lk-fq-sug .k," + D + ".lk-fq-sug li::marker," + D + ".lk-fq-brief b{color:#F0A3C9;}" +
      D + ".lk-fq-wl li," + D + ".lk-fq-wl.dec li{background:#29223F;}" + D + ".lk-fq-wl b{color:#F3F1FA;}" + D + ".lk-fq-wl small{color:#B8B2CF;}" +
      D + ".lk-fq-day.today{background:#2F2750;}" + D + ".lk-fq-day.today .d{color:#C9B0FF;}" + D + ".lk-fq-day.hot .d{color:#F0A3C9;}" + D + ".lk-fq-day.hot{box-shadow:inset 0 0 0 2px #55304A;}" +
      D + ".lk-fq-h1 em," + D + ".lk-fq-card h2 em," + D + ".lk-fq-big em," + D + ".lk-fq-out .n," + D + ".lk-fq-ico{color:#C9B0FF;}" +
      D + ".lk-fq-sign," + D + ".lk-fq-yay em," + D + ".lk-fq-mile.here b{color:#F0A3C9;}" + D + ".lk-fq-mile b{color:#C9B0FF;}" +
      D + ".lk-fq-chip{background:#1F3A2E;color:#8FD9B0;}" + D + ".lk-fq-chip.v{background:#2F2750;color:#C9B0FF;}" + D + ".lk-fq-chip.r{background:#3E2638;color:#F0A3C9;}" +
      D + ".lk-fq-dots i{background:#3A3356;}" + D + ".lk-fq-dots i.on{background:#B08CFF;}" +
      D + ".lk-fq-chk{background:#242039;border-color:#4A3A7A;}" + D + ".lk-fq-chk[aria-pressed='true']{background:#6002EE;border-color:#6002EE;}" +
      D + ".lk-fq-prog i{background:#3A3356;}" + D + ".lk-fq-prog i.on{background:#B08CFF;}" +
      D + ".lk-fq-bar{background:#2F2750;}" + D + ".lk-fq-bar b{background:#B08CFF;}" + D + ".lk-fq-bar i{background:#F3F1FA;}" + D + ".lk-fq-bar u{background:#242039;}" +
      D + ".lk-fq-hr{background:#352F4F;}" + D + ".lk-fq-cat," + D + ".lk-fq-lines li{border-color:#352F4F;}" +
      D + ".lk-fq-cat .dots i{background:#B08CFF;}" + D + ".lk-fq-cat .dots i.off{background:transparent;border-color:#F0A3C9;}" +
      D + ".lk-fq-cat .ch{background:#1F3A2E;color:#8FD9B0;}" + D + ".lk-fq-cat .ch.need{background:#3E2638;color:#F0A3C9;}" +
      D + ".lk-fq-today{background:#1F3A2E;}" + D + ".lk-fq-today .k," + D + ".lk-fq-today .n{color:#8FD9B0;}" + D + ".lk-fq-dial .k{color:#F0A3C9;}" + D + ".lk-fq-out{background:#242039;}" +
      D + ".lk-fq-mini div{background:#1E3A3F;}" + D + ".lk-fq-mini b{color:#7FD3D8;}" + D + ".lk-fq-mini.v b{color:#C9B0FF;}" +
      D + ".lk-fq-house{background:#3E2638;}" + D + ".lk-fq-house .lk-fq-kick," + D + ".lk-fq-house .lk-fq-ico," + D + ".lk-fq-house h2{color:#F0A3C9;}" +
      D + ".lk-fq-off{background:#1F3A2E;}" + D + ".lk-fq-off .lk-fq-kick," + D + ".lk-fq-off .lk-fq-ico," + D + ".lk-fq-off h2," + D + ".lk-fq-pt li .v{color:#8FD9B0;}" + D + ".lk-fq-pt li{background:#242039;}" +
      D + ".lk-fq-form textarea," + D + ".lk-fq-form input{background:#1B1830;border-color:#352F4F;color:#F3F1FA;}" +
      D + ".lk-fq-edit{color:#C9C4DD;border-color:#352F4F;}" + D + ".lk-fq-edit:hover{border-color:#4A3A7A;color:#F3F1FA;}" +
      D + ".lk-fq-arch .lk-fq-edit{color:#fff;border-color:rgba(255,255,255,.45);}" +
      D + ".lk-fq-msg{color:#8FD9B0;}" + D + ".lk-fq-msg.warn{color:#F0A3C9;}" +
      D + ".lk-fq-spark.b{color:#4A3A7A;}" +
      D + ".lk-ah-tile{background:#29223F;}" + D + ".lk-ah-tile:hover{background:#2F2750;}" +
      D + ".lk-ah-win{background:#1F3A2E;}" + D + ".lk-ah-win .ic{background:#242039;}" +
      D + ".lk-fq-eyebrow{color:#F0A3C9;}" +
      "html.lk-dark .lk-ah-annot div{background:#29223F;}" +
      /* inline-styled admin form labels (sign in as, invite) keep their light grey otherwise */
      "html.lk-dark .lk-ash form label{color:#C9C4DD !important;}html.lk-dark .lk-ash .lk-admin-empty{color:#B8B2CF;}" +
      "html.lk-dark .lk-ash .lki-q-ans small,html.lk-dark .lk-ash .lki-gh span{color:#B8B2CF;}";
    document.head.appendChild(st);
  }


  // Marketing tab styles (F 2026-11-08). Same language as Founder HQ: white
  // 28px cards on the lavender ground, italic 800 numerals, teal = shoppers,
  // rose = vendors, violet = emphasis, green = good. Dark rules keyed on html.lk-dark.
  function injectMarketingCSS() {
    if (document.getElementById('lokali-marketing-styles')) return;
    var st = document.createElement('style');
    st.id = 'lokali-marketing-styles';
    var D = 'html.lk-dark ';
    st.textContent = [
      ".lk-mk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;}",
      ".lk-mk-ctl{display:flex;align-items:center;gap:12px;flex:0 0 auto;}",
      ".lk-ash .lk-mk-ctl select.lk-ash-search{width:auto;min-width:150px;padding:10px 36px 10px 14px;}",
      ".lk-mk-read{font-size:12.5px;font-weight:600;color:#5E5873;white-space:nowrap;}",
      ".lk-mk-body{display:flex;flex-direction:column;gap:20px;}",
      ".lk-mk-body .lk-fq-row{margin:0;}",
      ".lk-mk-grid2{display:grid;grid-template-columns:1.35fr 1fr;gap:20px;}.lk-mk-grid2.rev{grid-template-columns:1fr 1.35fr;}",
      ".lk-mk-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;}",
      ".lk-mk-card{min-width:0;}",
      ".lk-ash .lk-mk-card h2{font-size:clamp(22px,2.2vw,28px);line-height:1.2;letter-spacing:-.025em;font-weight:800;margin:0 0 14px;text-wrap:balance;}",
      ".lk-ash .lk-mk-card h2 em{font-style:italic;color:#6002EE;}",
      ".lk-mk-h4{margin:18px 0 8px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#5E5873;}",
      ".lk-mk-note{margin:12px 0 0;font-size:13px;line-height:1.55;font-weight:600;color:#5E5873;}",
      ".lk-mk-foot{margin:0;padding:4px 6px 0;font-size:12.5px;line-height:1.6;font-weight:600;color:#5E5873;}",
      ".lk-mk-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}.lk-mk-tiles.two,.lk-mk-period .lk-mk-tiles{grid-template-columns:repeat(2,minmax(0,1fr));}",
      ".lk-mk-tile{display:flex;flex-direction:column;gap:3px;border-radius:18px;padding:14px 16px;background:#F7F2FF;min-width:0;}",
      ".lk-mk-tile .l{font-size:12.5px;font-weight:700;color:#5E5873;line-height:1.3;}",
      ".lk-mk-tile .n{font-size:30px;font-weight:800;font-style:italic;letter-spacing:-.045em;line-height:1.05;color:#4A1DB0;}",
      ".lk-mk-tile .n small{font-size:13px;font-style:normal;font-weight:700;letter-spacing:0;color:#5E5873;}",
      ".lk-mk-tile .d{font-size:12px;font-weight:600;line-height:1.4;color:#5E5873;}",
      ".lk-mk-tile.up .d{color:#1A6640;}.lk-mk-tile.warn .d{color:#A63D74;}",
      ".lk-mk-tiles.teal .lk-mk-tile{background:#E0F4F5;}.lk-mk-tiles.teal .lk-mk-tile .n{color:#0F6B74;}",
      ".lk-mk-cats{margin-top:14px;}.lk-mk-cats .lk-fq-cat{flex-wrap:wrap;}",
      ".lk-mk-wait{flex:1 0 100%;font-size:12px;font-weight:600;color:#A63D74;padding:0 0 8px;margin-top:-4px;}",
      ".lk-mk-card .lk-fq-bar{margin:4px 0 2px;}",
      ".lk-mk-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;}",
      ".lk-mk-bars{display:flex;flex-direction:column;gap:8px;}",
      ".lk-mk-bar{display:grid;grid-template-columns:minmax(120px,1.1fr) minmax(0,2fr) auto;align-items:center;gap:12px;font-size:13.5px;}",
      ".lk-mk-bar .lab{font-weight:700;color:#2B2640;line-height:1.3;}.lk-mk-bar .lab small{display:block;font-weight:600;color:#5E5873;font-size:12px;}",
      ".lk-mk-bar .track{position:relative;height:14px;border-radius:999px;background:#F3EBFF;overflow:visible;}",
      ".lk-mk-bar .track i{display:block;height:100%;border-radius:999px;background:#6002EE;min-width:2px;}",
      ".lk-mk-bar .track u{position:absolute;top:-3px;width:2px;height:20px;background:#A63D74;border-radius:1px;}",
      ".lk-mk-bar .val{font-weight:800;color:#2B2640;white-space:nowrap;}.lk-mk-bar .val small{font-weight:600;color:#5E5873;}",
      ".lk-mk-table{width:100%;border-collapse:collapse;margin:14px 0 0;font-size:13.5px;}",
      ".lk-mk-table th{text-align:left;font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#5E5873;padding:0 8px 8px 0;border-bottom:1px solid #F1EAFD;}",
      ".lk-mk-table td{padding:9px 8px 9px 0;border-bottom:1px solid #F1EAFD;color:#2B2640;font-weight:600;vertical-align:top;}",
      ".lk-mk-table td:first-child{font-weight:700;}",
      ".lk-mk-table .num{text-align:right;padding-right:0;padding-left:8px;white-space:nowrap;font-variant-numeric:tabular-nums;}",
      ".lk-mk-table tr:last-child td{border-bottom:0;}",
      ".lk-mk-table .sus{color:#A63D74;}",
      ".lk-mk-recent{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;}",
      ".lk-mk-recent li{padding:10px 0;border-bottom:1px solid #F1EAFD;}.lk-mk-recent li:last-child{border-bottom:0;}",
      ".lk-mk-recent .top{display:flex;justify-content:space-between;gap:12px;align-items:baseline;}",
      ".lk-ash .lk-mk-recent a.nm{font-weight:800;color:#2B2640;text-decoration:none;}.lk-ash .lk-mk-recent a.nm:hover{color:#6002EE;}",
      ".lk-mk-recent .wh{font-size:12px;font-weight:600;color:#5E5873;white-space:nowrap;}",
      ".lk-mk-recent .meta{font-size:12.5px;font-weight:600;color:#5E5873;line-height:1.45;margin-top:2px;}",
      ".lk-mk-posts{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px;}",
      ".lk-mk-sub{font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#5E5873;margin:16px 0 8px;}",
      ".lk-mk-posts li{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:#2B2640;}",
      ".lk-mk-posts .st{flex:0 0 auto;font-size:11.5px;font-weight:800;border-radius:999px;padding:3px 10px;background:#E4F7EE;color:#1A6640;}",
      ".lk-mk-posts .st.draft{background:#FBE9F2;color:#A63D74;}.lk-mk-posts .st.skipped{background:#F3EBFF;color:#4A1DB0;}",
      ".lk-mk-posts .tx{flex:1 1 auto;min-width:0;}",
      ".lk-ash .lk-mk-posts a.op{font-weight:800;color:#6002EE;text-decoration:none;white-space:nowrap;}",
      ".lk-mk-emailhost{margin-top:4px;}",
      ".lk-mk-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;}",
      ".lk-mk-col{display:flex;flex-direction:column;gap:4px;background:#F7F2FF;border-radius:18px;padding:14px 16px;min-width:0;}",
      ".lk-mk-col .l{font-size:12.5px;font-weight:700;color:#5E5873;}",
      ".lk-mk-col .n{font-size:28px;font-weight:800;font-style:italic;letter-spacing:-.04em;color:#4A1DB0;line-height:1.1;}",
      ".lk-mk-col .ch{display:flex;align-items:flex-end;gap:3px;height:56px;margin:8px 0 4px;}",
      ".lk-mk-col .ch i{flex:1 1 0;display:block;border-radius:3px 3px 0 0;background:#C9B3F2;min-height:3px;}.lk-mk-col .ch i.now{background:#6002EE;}",
      ".lk-mk-col .d{font-size:11.5px;font-weight:600;color:#5E5873;}",
      "@media (max-width:1100px){.lk-mk-grid3{grid-template-columns:repeat(2,minmax(0,1fr));}.lk-mk-cols{grid-template-columns:repeat(2,minmax(0,1fr));}}",
      "@media (max-width:991px){.lk-mk-grid2,.lk-mk-grid2.rev,.lk-mk-grid3{grid-template-columns:1fr;gap:14px;}.lk-mk-body{gap:14px;}.lk-mk-tiles{grid-template-columns:repeat(2,minmax(0,1fr));}}",
      "@media (max-width:560px){.lk-mk-tiles,.lk-mk-tiles.two,.lk-mk-period .lk-mk-tiles,.lk-mk-cols{grid-template-columns:1fr;}.lk-mk-bar{grid-template-columns:1fr;gap:4px;}.lk-mk-bar .val{justify-self:end;}}",
      /* dark */
      D + ".lk-mk-read," + D + ".lk-mk-note," + D + ".lk-mk-foot," + D + ".lk-mk-h4," + D + ".lk-mk-tile .l," + D + ".lk-mk-tile .d," + D + ".lk-mk-tile .n small," + D + ".lk-mk-bar .lab small," + D + ".lk-mk-bar .val small," + D + ".lk-mk-table th," + D + ".lk-mk-recent .wh," + D + ".lk-mk-recent .meta," + D + ".lk-mk-col .l," + D + ".lk-mk-col .d," + D + ".lk-mk-wait{color:#B8B2CF;}",
      D + ".lk-mk-bar .lab," + D + ".lk-mk-bar .val," + D + ".lk-mk-table td," + D + ".lk-mk-posts li," + D + ".lk-ash .lk-mk-recent a.nm{color:#F3F1FA;}",
      D + ".lk-mk-tile," + D + ".lk-mk-col," + D + ".lk-mk-tiles.teal .lk-mk-tile{background:#29223F;}",
      D + ".lk-mk-tile .n," + D + ".lk-mk-col .n," + D + ".lk-ash .lk-mk-card h2 em{color:#C9B0FF;}" + D + ".lk-mk-tiles.teal .lk-mk-tile .n{color:#7FD3D8;}",
      D + ".lk-mk-tile.up .d{color:#8FD9B0;}" + D + ".lk-mk-tile.warn .d," + D + ".lk-mk-table .sus{color:#F0A3C9;}",
      D + ".lk-mk-bar .track{background:#2F2750;}" + D + ".lk-mk-bar .track i{background:#B08CFF;}" + D + ".lk-mk-bar .track u{background:#F0A3C9;}",
      D + ".lk-mk-table th," + D + ".lk-mk-table td," + D + ".lk-mk-recent li{border-color:#352F4F;}",
      D + ".lk-mk-posts .st{background:#1F3A2E;color:#8FD9B0;}" + D + ".lk-mk-posts .st.draft{background:#3E2638;color:#F0A3C9;}" + D + ".lk-mk-posts .st.skipped{background:#2F2750;color:#C9B0FF;}",
      D + ".lk-mk-col .ch i{background:#4A3A7A;}" + D + ".lk-mk-col .ch i.now{background:#B08CFF;}",
      D + ".lk-ash .lk-mk-posts a.op{color:#C9B0FF;}"
    ].join('');
    document.head.appendChild(st);
  }

  function renderAdminShell(mount, acc, name) {
    injectAdminCSS(); injectAdminShellCSS(); injectAdminHomeCSS(); injectAdminDarkCSS(); injectFounderCSS(); injectMarketingCSS();
    mount.style.maxWidth = '1320px';
    var a = state.admin, ov = a.overview;
    var SAPI = window.LokaliSupabaseAPI;
    function T(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

    var shell = T('div', 'lk-ash');
    var VIEWS = [['today', 'Today'], ['vendors', 'Vendors'], ['prospects', 'Prospects'], ['marketing', 'Marketing'], ['insights', 'Insights']];

    // phone top bar + drawer overlay (same behaviour as the vendor dashboard)
    var bar = T('div', 'lk-ash-bar'); var barTitle = T('span', null, 'Today'); bar.appendChild(barTitle);
    var burger = T('button', 'lk-ash-burger'); burger.type = 'button'; burger.setAttribute('aria-label', 'Open admin menu'); burger.innerHTML = ASH_ICO.bars; bar.appendChild(burger);
    var overlay = T('div', 'lk-ash-ov');
    function drawer(open) { shell.classList.toggle('is-open', !!open); burger.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    burger.addEventListener('click', function () { drawer(!shell.classList.contains('is-open')); });
    overlay.addEventListener('click', function () { drawer(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') drawer(false); });

    // rail
    var rail = T('nav', 'lk-ash-rail'); rail.setAttribute('aria-label', 'Admin sections');
    var siteHead = document.querySelector('.header-wrapper.w-nav');
    rail.style.top = ((window.matchMedia && window.matchMedia('(min-width: 992px)').matches && siteHead ? siteHead.offsetHeight : 0) + 12) + 'px';
    // Founder HQ brand (F 2026-11-02): the arch monogram + name, Lokali admin underneath
    var brand = T('div', 'lk-ash-brand'), mk = T('i', 'mk', 'F'); mk.setAttribute('aria-hidden', 'true'); brand.appendChild(mk);
    var bt = T('div'); bt.appendChild(T('b', null, 'Founder HQ')); bt.appendChild(T('small', null, 'Lokali admin')); brand.appendChild(bt); rail.appendChild(brand);
    var navBtns = {}, navCount = T('span', 'lk-ash-count', '0'); navCount.hidden = true;
    VIEWS.forEach(function (vw) {
      var b = T('button', 'lk-ash-nav'); b.type = 'button';
      var i = document.createElement('i'); i.innerHTML = ASH_ICO[vw[0]]; b.appendChild(i);
      b.appendChild(document.createTextNode(vw[1]));
      if (vw[0] === 'today') b.appendChild(navCount);
      b.addEventListener('click', function () { go(vw[0], true); });
      navBtns[vw[0]] = b; rail.appendChild(b);
    });
    var foot = T('div', 'lk-ash-foot');
    // dark mode toggle (F 2026-10-10): remembered per browser, system default
    var themeBtn = T('button', 'lk-ash-theme'); themeBtn.type = 'button';
    var themeIco = document.createElement('i'); themeBtn.appendChild(themeIco); var themeLbl = T('span', null, ''); themeBtn.appendChild(themeLbl);
    function applyTheme(mode) {
      var dark = mode === 'dark';
      document.documentElement.classList.toggle('lk-dark', dark);
      themeIco.innerHTML = dark ? ASH_ICO.sun : ASH_ICO.moon; themeLbl.textContent = dark ? 'Light mode' : 'Dark mode';
      themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      // the Webflow wrappers between the mount and <body> keep their own light
      // backgrounds, so paint them too (and clear them again in light mode)
      for (var p = mount.parentElement; p && p !== document.body; p = p.parentElement) p.style.backgroundColor = dark ? '#1B1830' : '#F3EBFF';
    }
    var themeMode = null; try { themeMode = localStorage.getItem('lk_admin_theme'); } catch (e) {}
    // F 2026-10-10: dark is a choice made with the toggle, never applied on its own.
    if (themeMode !== 'dark' && themeMode !== 'light') themeMode = 'light';
    applyTheme(themeMode);
    themeBtn.addEventListener('click', function () { themeMode = themeMode === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('lk_admin_theme', themeMode); } catch (e) {} applyTheme(themeMode); });
    foot.appendChild(themeBtn);
    foot.appendChild(T('div', 'lk-ash-lbl', 'Open in'));
    [['Stripe', 'https://dashboard.stripe.com/'], ['Supabase', 'https://supabase.com/dashboard/project/baacipkokiweipncavov'],
     ['Google Analytics', 'https://analytics.google.com/'], ['Brevo', 'https://app.brevo.com/'], ['Webflow', 'https://webflow.com/dashboard']].forEach(function (x) {
      var l = T('a', 'lk-ash-ext', x[0]); l.href = x[1]; l.target = '_blank'; l.rel = 'noopener'; l.appendChild(T('span', null, '↗')); foot.appendChild(l);
    });
    var chip = T('div', 'lk-ash-chip'); chip.appendChild(avatarNode(acc, 'lk-avatar'));
    var who = T('div'); who.style.minWidth = '0'; who.appendChild(T('div', 'lk-ash-name', name)); who.appendChild(T('div', 'lk-ash-role', 'Lokali admin')); chip.appendChild(who);
    var outBtn = T('button', 'lk-ash-out', 'Sign out'); outBtn.type = 'button';
    outBtn.addEventListener('click', function () {
      if (window.LokaliAuth && window.LokaliAuth.signOut) { window.LokaliAuth.signOut(); return; }
      try { api().clearToken(); } catch (e) {}
      window.location.href = '/login';
    });
    chip.appendChild(outBtn); foot.appendChild(chip); rail.appendChild(foot);

    var main = T('div', 'lk-ash-main');
    main.appendChild(bar);
    var views = {};
    VIEWS.forEach(function (vw) { var v = T('section', 'lk-ash-view'); v.hidden = true; views[vw[0]] = v; main.appendChild(v); });
    shell.appendChild(rail); shell.appendChild(overlay); shell.appendChild(main);
    mount.appendChild(shell);

    // ── shared data: admin_insights(30) once, read by Today AND Vendors ─────
    var insightsP = null, contactsP = null;
    function insightsData() {
      if (!insightsP) insightsP = new Promise(function (resolve) {
        loadAdminInsights(function (ok) {
          if (!ok || !window.LokaliAdminInsights.fetch) { resolve(null); return; }
          window.LokaliAdminInsights.fetch(30).then(function (d) {
            resolve(d && d.ok === true ? { d: d, an: window.LokaliAdminInsights.analyze(d) } : null);
          }).catch(function () { resolve(null); });
        });
      });
      return insightsP;
    }
    function contacts() {
      if (!contactsP) contactsP = (SAPI && SAPI.admin && typeof SAPI.admin.vendorContacts === 'function')
        ? SAPI.admin.vendorContacts().then(function (res) {
            var m = {}, d = res && res.data; if (d && d.ok === true) (d.vendors || []).forEach(function (x) { if (x.email) m[x.id] = x; }); return m;
          }).catch(function () { return {}; })
        : Promise.resolve({});
      return contactsP;
    }

    var signInHost = null;
    function vendorActions(r, cmap) {
      var v = r.v, acts = T('div', 'lk-ash-acts');
      var tips = vendorTips(v, r.listings), c = cmap[v.id];
      if (c && tips.length) { var m = T('a', 'lk-ash-btn', 'Email owner'); m.href = nudgeMailto(v, c, tips); acts.appendChild(m); }
      else if (c) { var m2 = T('a', 'lk-ash-btn', 'Email owner'); m2.href = 'mailto:' + encodeURIComponent(c.email).replace(/%40/g, '@'); acts.appendChild(m2); }
      if (v.name) {
        var si = T('button', 'lk-ash-btn', 'Sign in as'); si.type = 'button';
        si.addEventListener('click', function () { go('vendors', true); if (signInHost && signInHost.lkPrefill) signInHost.lkPrefill(v.name); });
        acts.appendChild(si);
      }
      if (v.slug && v.is_public) { var o = T('a', 'lk-ash-btn', 'Open storefront'); o.href = '/' + encodeURIComponent(v.slug); o.target = '_blank'; o.rel = 'noopener'; acts.appendChild(o); }
      return acts;
    }
    function vendorRow(r, cmap, withNumbers) {
      var v = r.v, row = T('div', 'lk-ash-row'), left = T('div');
      left.appendChild(T('b', null, v.name || 'Unnamed signup'));
      // One line: for a storefront that is live and merely quiet, lead with the most
      // fixable gap (the pill already says the status); otherwise say what happened.
      var quiet = r.dx.key === 'seen' || r.dx.key === 'low';
      left.appendChild(T('small', null, quiet && r.dx.gaps.length ? r.dx.gaps[0] : (r.dx.gaps.length && r.dx.key !== 'working' ? r.dx.summary + ' ' + r.dx.gaps[0] : r.dx.summary)));
      var meta = T('div', 'lk-ash-meta');
      meta.appendChild(T('span', 'lk-ash-pill ' + r.dx.key, r.dx.label));
      if (withNumbers) {
        meta.appendChild(T('span', null, r.v.views + (r.v.views === 1 ? ' view' : ' views')));
        meta.appendChild(T('span', null, r.reach + (r.reach === 1 ? ' reach-out' : ' reach-outs')));
        meta.appendChild(T('span', null, r.score + ' of 7 basics'));
      }
      left.appendChild(meta);
      row.appendChild(left); row.appendChild(vendorActions(r, cmap));
      return row;
    }

    // ── TODAY ───────────────────────────────────────────────────────────────
    // Admin home v2 (2026-10-10): the two sides of the marketplace first, then
    // what the numbers suggest designing next, then the pulse. Queues fold into
    // one line. Everything deeper opens in a drawer. Data = admin_insights +
    // admin_visit_insights, already fetched once for the shell; no new SQL.
    (function buildToday() {
      var v = views.today, now = new Date();
      function n(x) { return (Number(x) || 0).toLocaleString('en-US'); }
      function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
      function plural(k, one, many) { k = Number(k) || 0; return n(k) + ' ' + (k === 1 ? one : (many || one + 's')); }
      function dayLabel(iso) { try { var p = String(iso).slice(0, 10).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return String(iso); } }
      function weekday(iso) { try { var p = String(iso).slice(0, 10).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-US', { weekday: 'long' }); } catch (e) { return ''; } }
      var NS = 'http://www.w3.org/2000/svg';
      function S(tag, attrs, text) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }

      // Founder HQ (2026-11-02): date + now playing, then the hero. The month's
      // story now lives in Clo's note (same two sentences as before).
      var FH = fqHero(name, now); FH.el.forEach(function (x) { v.appendChild(x); });
      var story = FH.story;

      // needs you: one line + chips; the queue sections sit behind Review
      var band = T('div', 'lk-ah-needs');
      var st = T('div', 'lk-ah-st'); st.innerHTML = ASH_ICO.check; var stT = T('span', null, 'Checking the queues…'); st.appendChild(stT); band.appendChild(st);
      var chips = T('div', 'lk-ash-queues'); chips.setAttribute('aria-label', 'All queues'); band.appendChild(chips);
      var review = T('button', 'lk-ash-btn', 'Review'); review.type = 'button'; review.setAttribute('aria-expanded', 'false'); band.appendChild(review);
      v.appendChild(band);
      var grid = T('div', 'lk-ash-needs'); grid.hidden = true; v.appendChild(grid);
      review.addEventListener('click', function () { grid.hidden = !grid.hidden; review.textContent = grid.hidden ? 'Review' : 'Hide'; review.setAttribute('aria-expanded', grid.hidden ? 'false' : 'true'); });
      var FB = fqBoardRow(now); v.appendChild(FB.el);
      var FW = fqBriefRow(now); v.appendChild(FW.el); // Clo's brief: waiting on you + decide (#237)

      window.__lokAttn = { suggestions: a.queue.length, reports: (Number(ov.open_vendor_reports) || 0) + (Number(ov.open_review_reports) || 0), creatives: null, addresses: null, pairings: null, blocks: null };
      function sectionTitle(sec) {
        var t = sec.querySelector('.lk-admin-qtitle'); if (!t) return '';
        var out = ''; t.childNodes.forEach(function (x) { if (x.nodeType === 3) out += x.textContent; }); return out.trim();
      }
      function paintNeeds() {
        var total = 0, open = 0, info = 0; chips.innerHTML = '';
        grid.querySelectorAll('.lk-admin-section').forEach(function (sec) {
          var empty = sec.querySelector('.lk-admin-empty');
          var loading = empty && /loading/i.test(empty.textContent || '');
          var rows = sec.querySelectorAll('.lk-admin-row').length;
          var quiet = !!empty && !loading && !rows && !sec.querySelector('form');
          sec.classList.toggle('lk-collapsed', quiet);
          var title = sectionTitle(sec); if (!title) return;
          // Informational sections (the RSVP list, 2026-10-29): their rows are reading, not work.
          // They get no chip, never count as "needs you" and never read as "still loading";
          // they only keep the grid open so the list stays visible.
          if (sec.classList.contains('lk-admin-section-info')) { if (!quiet) info++; return; }
          var q = T('span', 'lk-ash-q' + (rows ? ' on' : ''), title); q.appendChild(T('b', null, String(rows))); chips.appendChild(q);
          total += rows; if (!quiet) open++;
        });
        var waiting = total > 0 || open > 0 || info > 0;
        st.classList.toggle('wait', total > 0 || open > 0);
        stT.textContent = total ? (total === 1 ? '1 thing needs you' : total + ' things need you') : (open ? 'Something is still loading' : 'Nothing needs you right now');
        navCount.textContent = String(total); navCount.hidden = !total;
        FH.setNeeds(total, open);
        review.hidden = !waiting; if (!waiting) { grid.hidden = true; review.textContent = 'Review'; review.setAttribute('aria-expanded', 'false'); }
      }
      window.__lokPaintAttn = paintNeeds;
      appendReportsSection(grid, ov);              // trust and safety first
      appendAddressFlagsSection(grid);
      appendBlockedSendersSection(grid);           // #201
      appendRsvpSection(grid);                     // #195
      appendInterestSection(grid);                 // Content Day 2027
      appendTagSuggestionsSection(grid, a, null);
      appendSpotlightCreativesSection(grid);
      appendPairingFeedbackSection(grid);
      appendSpotlightSection(grid, ov);
      try { new MutationObserver(function () { paintNeeds(); }).observe(grid, { childList: true, subtree: true, characterData: true }); } catch (e) {}
      setTimeout(paintNeeds, 0);

      // ── drawer (the dive-deeper layer) ────────────────────────────────────
      var drawerEl = T('div', 'lk-ah-drawer'); drawerEl.hidden = true;
      var scrim = T('div', 'lk-ah-scrim'); drawerEl.appendChild(scrim);
      var panel = T('aside', 'lk-ah-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
      var ph = T('div', 'lk-ah-ph'), phl = T('div'); var pTitle = T('h3', null, ''); pTitle.id = 'lk-ah-ptitle'; panel.setAttribute('aria-labelledby', pTitle.id);
      var pSub = T('p', null, ''); phl.appendChild(pTitle); phl.appendChild(pSub); ph.appendChild(phl);
      var pX = T('button', 'lk-ah-x', '×'); pX.type = 'button'; pX.setAttribute('aria-label', 'Close'); ph.appendChild(pX); panel.appendChild(ph);
      var pBody = T('div', 'lk-ah-pbody'); panel.appendChild(pBody); drawerEl.appendChild(panel); v.appendChild(drawerEl);
      var lastFocus = null;
      function openDrawer(title, sub, fill) {
        lastFocus = document.activeElement; pTitle.textContent = title; pSub.textContent = sub || ''; pBody.innerHTML = '';
        fill(pBody); drawerEl.hidden = false; document.body.classList.add('lk-ah-lock'); pX.focus();
      }
      function closeDrawer() { if (drawerEl.hidden) return; drawerEl.hidden = true; document.body.classList.remove('lk-ah-lock'); try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) {} }
      pX.addEventListener('click', closeDrawer); scrim.addEventListener('click', closeDrawer);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
      function table(host, cols, rows) {
        var tb = T('table', 'lk-ah-table'), tr = T('tr');
        cols.forEach(function (c) { tr.appendChild(T('th', c.r ? 'r' : null, c.l)); }); tb.appendChild(tr);
        rows.forEach(function (r) { var x = T('tr'); r.forEach(function (cell, i) { var td = T('td', cols[i] && cols[i].r ? 'r' : null); if (cell && cell.nodeType) td.appendChild(cell); else td.textContent = cell == null ? '' : String(cell); x.appendChild(td); }); tb.appendChild(x); });
        host.appendChild(tb); return tb;
      }
      function note(host, strong, rest) { var d = T('div', 'lk-ah-note'); if (strong) d.appendChild(T('b', null, strong + ' ')); d.appendChild(document.createTextNode(rest)); host.appendChild(d); return d; }

      // ── the two sides ─────────────────────────────────────────────────────
      var sides = T('div', 'lk-ah-sides'); v.appendChild(sides);
      function sideCard(kind, eyebrow) {
        var s = T('section', 'lk-ah-side ' + kind); s.setAttribute('aria-label', eyebrow);
        var eb = T('div', 'lk-ah-eyebrow'); eb.appendChild(T('span', 'lk-ah-dot')); eb.appendChild(document.createTextNode(eyebrow)); s.appendChild(eb);
        s.h = T('h3', null, 'Loading…'); s.appendChild(s.h);
        s.sub = T('p', 'lk-ah-sub', ''); s.appendChild(s.sub);
        s.steps = T('div', 'lk-ah-steps'); s.appendChild(s.steps);
        s.note = T('div', 'lk-ah-dropnote'); s.note.hidden = true; s.appendChild(s.note);
        s.foot = T('div', 'lk-ah-foot'); s.appendChild(s.foot);
        sides.appendChild(s); return s;
      }
      var shopSide = sideCard('shop', 'Shoppers'), vendSide = sideCard('vend', 'Vendors');
      function steps(host, rows, dropIdx) {
        host.innerHTML = ''; var max = rows[0][1] || 1;
        rows.forEach(function (r, i) {
          var s = T('div', 'lk-ah-step' + (i === dropIdx ? ' drop' : ''));
          s.appendChild(T('span', 'lab', r[0]));
          var b = T('div', 'bar'), f = T('i'); f.style.width = Math.max(r[1] ? 1.5 : 0, (r[1] / max) * 100) + '%'; b.appendChild(f); s.appendChild(b);
          s.appendChild(T('span', 'n', n(r[1]))); host.appendChild(s);
        });
      }
      function biggestLoss(rows) { var bi = -1, best = -1; for (var i = 1; i < rows.length; i++) { var loss = rows[i - 1][1] - rows[i][1]; if (loss > best) { best = loss; bi = i; } } return bi; }
      function dropNote(side, strong, rest, linkText, onLink) {
        side.note.innerHTML = ''; side.note.appendChild(T('b', null, strong + ' ')); side.note.appendChild(document.createTextNode(rest + ' '));
        if (linkText) { var l = T('a', null, linkText); l.href = '#'; l.addEventListener('click', function (e) { e.preventDefault(); onLink(); }); side.note.appendChild(l); }
        side.note.hidden = false;
      }
      function footBtn(side, label, primary, fn) { var b = T('button', 'lk-ash-btn' + (primary ? ' primary' : ''), label); b.type = 'button'; b.addEventListener('click', fn); side.foot.appendChild(b); return b; }

      // ── prompts, pulse, chart, two-up: shells now, filled on data ─────────
      var promptsSec = T('div', 'lk-ash-sec'); promptsSec.hidden = true; v.appendChild(promptsSec);
      var pulse = T('div', 'lk-ash-sec lk-fq-card lk-fq-pulse');
      var pulH = T('div', 'lk-ash-sech'); pulH.appendChild(T('h3', null, 'Pulse')); pulH.appendChild(T('span', null, 'last 30 days against the 30 before'));
      var toIns = T('button', null, 'Open Insights'); toIns.type = 'button'; toIns.addEventListener('click', function () { go('insights', true); }); pulH.appendChild(toIns);
      pulse.appendChild(pulH);
      var pbox = T('div', 'lk-ash-list'); pbox.appendChild(T('div', 'lk-ash-note', 'Loading the numbers…')); pulse.appendChild(pbox);
      v.appendChild(pulse);
      var chartSec = T('div', 'lk-ash-sec lk-ah-card'); chartSec.hidden = true; v.appendChild(chartSec);
      var two = T('div', 'lk-ah-two'); two.hidden = true; v.appendChild(two);
      var FG = fqGrowthRow(), FL = fqLowerRow(function () { go('prospects', true); }), FHS = fqHouseRow();
      [FG.el, FL.el, FHS.el].forEach(function (x) { v.appendChild(x); });
      var foot = T('div', 'lk-fq-foot'); foot.appendChild(T('span', null, 'Numbers pulled live from Lokali when this page opened.'));
      var fr = T('span', null, 'Made for one founder in The Woodlands, Texas. '); fr.appendChild(T('em', null, 'Run it.')); foot.appendChild(fr); v.appendChild(foot);
      var ctl = fqBoardCtl([FH, FB, FW, FL, FHS]); [FB, FL, FHS].forEach(function (x) { x.wire(ctl); });
      if (SAPI && SAPI.admin && typeof SAPI.admin.prospects === 'function') {
        SAPI.admin.prospects().then(function (res) { if (res && res.data && res.data.ok === true) FL.fillProspects(res.data.rows || []); else FL.failProspects(); }).catch(function () { FL.failProspects(); });
      } else FL.failProspects();

      Promise.all([insightsData(), contacts()]).then(function (rs) {
        var pack = rs[0], cmap = rs[1];
        if (!pack) {
          pbox.innerHTML = ''; pbox.appendChild(T('div', 'lk-ash-note', 'The numbers could not load. Refresh the page to try again.'));
          story.textContent = 'the numbers could not load, so refresh the page to try again.';
          FH.fail(); FG.fail(); FL.failShoppers();
          shopSide.h.textContent = 'The numbers could not load.'; vendSide.h.textContent = 'The numbers could not load.'; return;
        }
        var d = pack.d, an = pack.an, t = d.totals || {}, z = d.visit || null, zf = (z && z.funnel) || {};
        var rows = an.rows, pub = rows.filter(function (r) { return r.v.is_public; });
        var reachRows = pub.filter(function (r) { return r.reach > 0; });
        var known = z ? (Number(z.known_visitors) || 0) : 0, ret = z ? (Number(z.returning_visitors) || 0) : 0;
        var vd = t.views_prev > 0 ? Math.round(((t.views - t.views_prev) / t.views_prev) * 100) : null;
        var zeroTerms = (d.search_zero || []).filter(function (x) { return !/test/i.test(x.term || ''); });
        var byViews = pub.slice().sort(function (x, y) { return y.v.views - x.v.views; });
        var top5 = 0; byViews.slice(0, 5).forEach(function (r) { top5 += r.v.views; });
        var top5Share = pct(top5, t.views), low = pub.filter(function (r) { return r.v.views <= 2; }).length;
        var stalls = pub.filter(function (r) { return r.dx.key === 'stalls'; });

        // headline: one sentence of fact, one open question
        var s1;
        if (!t.views) s1 = 'No storefront views yet this month.';
        else if (vd == null) s1 = 'Shoppers opened storefronts ' + plural(t.views, 'time') + ' this month.';
        else if (vd >= 80) s1 = 'Shoppers are opening storefronts about ' + (vd >= 180 ? 'three' : 'twice') + ' as often as last month.';
        else if (vd >= 15) s1 = 'Storefront views are up ' + vd + '% on last month.';
        else if (vd <= -15) s1 = 'Storefront views are down ' + Math.abs(vd) + '% on last month.';
        else s1 = 'Storefront views are holding steady on last month.';
        var s2;
        if (z && known >= 20 && ret / known < 0.3) s2 = 'Getting them to come back is the open question.';
        else if (t.views >= 100 && an.reach / t.views < 0.03) s2 = 'Turning views into reach-outs is the open question.';
        else if (t.searches >= 5 && t.searches_zero / t.searches >= 0.3) s2 = 'Searches that find nobody are the open question.';
        else if (reachRows.length) s2 = plural(reachRows.length, 'vendor') + ' heard from a shopper.';
        else s2 = 'No vendor has heard from a shopper yet.';
        story.textContent = s1 + ' '; story.appendChild(T('em', null, s2));
        FH.fill({ live: t.vendors_public != null ? t.vendors_public : pub.length, newWeek: pub.filter(function (r) { return r.v.published_at && (now - new Date(r.v.published_at)) / 86400000 <= 7; }).length,
          founding: Number((d.revenue || {}).founding_claimed) || 0, cap: 50, views: t.views, vd: vd, prev: t.views_prev });
        FG.fill(d, pub, now); FL.fillShoppers(d, t, rows);

        // shoppers
        if (!z || !z.visits) {
          shopSide.h.textContent = 'Visit counting is on and waiting for shoppers.';
          shopSide.sub.textContent = 'Journeys appear here as people browse The Market and open storefronts.';
        } else {
          // The Market is not a step everyone passes (a shared link lands on a
          // storefront), so it is a sentence, not a bar; the bars stay nested.
          var srows = [['Visited Lokali', zf.visits || 0], ['Opened a storefront', zf.viewed || 0], ['Reached out', zf.contacted || 0]];
          shopSide.h.textContent = plural(z.visitors, 'person', 'people') + ' visited. ' + n(ret) + ' came back.';
          shopSide.sub.textContent = 'Visits by people not signed in as a vendor or admin, last ' + d.days + ' days. ' + n(zf.saw_market || 0) + ' of ' + n(zf.visits || 0) + ' visits touched The Market; the rest landed straight on a storefront.';
          var returnStory = known >= 20 && ret / known < 0.3;
          var di = biggestLoss(srows);
          steps(shopSide.steps, srows, returnStory ? -1 : di);
          if (returnStory) {
            dropNote(shopSide, 'Biggest drop: visiting to coming back.', n(known - ret) + ' of ' + n(known) + ' visitors have not returned yet. Following a vendor is the one return path today; a saved search or a shopper-facing "New this week" would add another.', 'See where visits began', function () { entryDrawer(); });
          } else if (di === 1) {
            dropNote(shopSide, 'Biggest drop: arriving to opening.', n(srows[0][1] - srows[1][1]) + ' visits never opened a storefront. The Market cards decide here: photo, name, tagline.', 'See where visits began', function () { entryDrawer(); });
          } else if (di === 2) {
            dropNote(shopSide, 'Biggest drop: opening to reaching out.', n(srows[1][1] - srows[2][1]) + ' visits opened a storefront and stopped there. The storefront page is where the decision happens.', 'How shoppers reach out', function () { channelsDrawer(); });
          }
          footBtn(shopSide, (t.searches ? plural(t.searches_zero, 'search', 'searches') + ' found nobody' : 'No Market searches yet'), false, function () { searchesDrawer(); });
          footBtn(shopSide, 'How shoppers reach out', false, function () { channelsDrawer(); });
        }

        // vendors
        var vrows = [['Signed up', rows.length], ['Went live', pub.length], ['Was seen', pub.filter(function (r) { return r.v.views > 0; }).length], ['Had 5 or more views', pub.filter(function (r) { return r.v.views >= 5; }).length], ['Got a reach-out', reachRows.length]];
        var vi = biggestLoss(vrows);
        vendSide.h.textContent = n(pub.length) + ' live. ' + n(reachRows.length) + ' heard from a shopper.';
        vendSide.sub.textContent = 'Every vendor signup so far and how far each got. The step with the biggest loss is where onboarding or The Market needs work.';
        steps(vendSide.steps, vrows, vi);
        var quiet = pub.filter(function (r) { return r.v.views >= 5 && !r.reach; });
        function avgViews(list) { var s = 0; list.forEach(function (r) { s += r.v.views; }); return list.length ? Math.round(s / list.length) : 0; }
        var complete = pub.filter(function (r) { return r.score >= 6; }), rest = pub.filter(function (r) { return r.score < 6; });
        var evidence = complete.length >= 3 && rest.length >= 3 ? ' Storefronts with 6 or more of the 7 basics averaged ' + plural(avgViews(complete), 'view') + ', the rest ' + n(avgViews(rest)) + '.' : '';
        if (vi === 1) dropNote(vendSide, 'Biggest drop: signing up to going live.', n(vrows[0][1] - vrows[1][1]) + ' signups never went live. The first session after signup is where they stall.', 'See who stalled', function () { nudgeDrawer(); });
        else if (vi === 2) dropNote(vendSide, 'Biggest drop: live to seen.', n(vrows[1][1] - vrows[2][1]) + ' live storefronts were not opened by anyone. Visibility, not the storefront, is the problem.' + evidence, 'See who to nudge', function () { nudgeDrawer(); });
        else if (vi === 3) dropNote(vendSide, 'Biggest drop: seen once to seen often.', n(vrows[2][1] - vrows[3][1]) + ' storefronts got fewer than 5 views. The Market order and the homepage strip decide who is seen.' + evidence, 'See who to nudge', function () { nudgeDrawer(); });
        else if (vi === 4) { var qa = 0; quiet.forEach(function (r) { qa += r.score; }); dropNote(vendSide, 'Biggest drop: being seen to being contacted.', n(vrows[3][1]) + ' storefronts were seen 5 or more times, ' + n(reachRows.length) + ' got a reach-out. The ' + n(quiet.length) + ' quiet ones average ' + (quiet.length ? Math.round(qa / quiet.length) : 0) + ' of 7 basics.' + evidence, 'See the quiet storefronts', function () { nudgeDrawer(); }); }
        var cand = rows.filter(function (r) { return r.v.name && !r.v.away && r.dx.key !== 'working' && (!r.v.is_public || r.score <= 4); });
        cand.sort(function (x, y) { return (x.v.is_public ? x.score : -1) - (y.v.is_public ? y.score : -1) || y.v.views - x.v.views; });
        footBtn(vendSide, cand.length ? 'Nudge ' + Math.min(3, cand.length) + ' vendor' + (Math.min(3, cand.length) === 1 ? '' : 's') + ' this week' : 'See quiet storefronts', true, function () { nudgeDrawer(); });
        footBtn(vendSide, 'All vendors', false, function () { go('vendors', true); });

        // ── drawers with real content ──
        function searchesDrawer() {
          openDrawer('Searches that found nobody', 'Zero-result searches in The Market, last ' + d.days + ' days. Each one is a shopper who left empty-handed.', function (b) {
            if (!(d.search_zero || []).length) { b.appendChild(T('p', 'lk-ash-note', 'Every search found at least one vendor.')); return; }
            table(b, [{ l: 'Typed' }, { l: 'Times', r: true }, { l: 'Last', r: true }], (d.search_zero || []).map(function (x) { return [x.term, n(x.n), dayLabel(x.last_at)]; }));
            note(b, 'Two fixes, different sizes.', 'A synonym on the right subcategory fixes a single term today. A no-results page that shows the three closest storefronts instead of an empty state fixes the pattern.');
            var all = (d.search_terms || []).filter(function (x) { return x.avg_results > 0; }).slice(0, 8);
            if (all.length) { b.appendChild(T('h4', 'lk-ah-h4', 'Searches that did find someone')); table(b, [{ l: 'Typed' }, { l: 'Times', r: true }, { l: 'Found', r: true }], all.map(function (x) { return [x.term, n(x.n), plural(x.avg_results, 'vendor')]; })); }
          });
        }
        var CH = { website: 'Website', buy_link: 'Buy link', 'inquiry form': 'Inquiry form', sms: 'Text message', call: 'Call', zelle: 'Zelle', booking_link: 'Booking link', linkedin: 'LinkedIn', email: 'Email', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' };
        function channelsDrawer() {
          openDrawer('How shoppers reach out', 'Which button people pressed on storefronts, last ' + d.days + ' days.', function (b) {
            var ch = d.contact_channels || [];
            if (!ch.length) { b.appendChild(T('p', 'lk-ash-note', 'No reach-outs in this period.')); return; }
            var max = ch[0].n || 1;
            table(b, [{ l: 'Button' }, { l: 'Clicks', r: true }, { l: '' }], ch.map(function (x) { var bar = T('div', 'lk-ah-minibar'), f = T('i'); f.style.width = pct(x.n, max) + '%'; bar.appendChild(f); return [CH[x.channel] || x.channel, n(x.n), bar]; }));
            var by = (d.leads && d.leads.by_actor) || {};
            note(b, 'Who pressed them:', n(by.anonymous || 0) + ' not signed in, ' + n(by.shopper || 0) + ' signed-in shoppers, ' + n(by.vendor_or_admin || 0) + ' from vendor or admin accounts (your own tests, left out of every rate on this page).');
          });
        }
        var REF = { direct: 'Typed the address or a bookmark', external: 'Another site, search engine or social app', share: 'A Lokali share link', market: 'Arrived mid-visit from The Market', internal: 'Another Lokali page' };
        function entryDrawer() {
          openDrawer('Where visits began', 'How visits that touched a vendor started, and who came back.', function (b) {
            if (!z) { b.appendChild(T('p', 'lk-ash-note', 'Visit counting is not on yet.')); return; }
            var en = (z.entry || []).filter(function (e) { return e.ref !== 'market' && e.ref !== 'internal'; });
            if (en.length) table(b, [{ l: 'Came in via' }, { l: 'Visits', r: true }, { l: 'Reached out', r: true }], en.map(function (e) { return [REF[e.ref] || e.ref, n(e.n), n(e.contacted || 0)]; }));
            note(b, n(ret) + ' of ' + n(known) + ' visitors came back on another day.', ' Random ids only, no names or IPs. Browsers asking not to be tracked never count as returning, so treat this as a floor.');
            var rep = pub.filter(function (r) { return r.v.visit && r.v.visit.repeat_visitors; }).sort(function (x, y) { return y.v.visit.repeat_visitors - x.v.visit.repeat_visitors; }).slice(0, 8);
            if (rep.length) { b.appendChild(T('h4', 'lk-ah-h4', 'Storefronts people came back to')); table(b, [{ l: 'Storefront' }, { l: 'Returning visitors', r: true }], rep.map(function (r) { return [r.v.name, n(r.v.visit.repeat_visitors)]; })); }
          });
        }
        function nudgeDrawer() {
          openDrawer('Vendors to nudge', 'Most fixable first: a named signup that never went live, then live storefronts missing the most basics. Away vendors are left alone.', function (b) {
            if (!cand.length) { b.appendChild(T('p', 'lk-ash-note', 'Every live storefront has its basics. Nothing to nudge this week.')); return; }
            var list = T('div', 'lk-ash-list'); cand.slice(0, 12).forEach(function (r) { list.appendChild(vendorRow(r, cmap, true)); }); b.appendChild(list);
            if (cand.length > 12) b.appendChild(T('p', 'lk-ash-note', (cand.length - 12) + ' more in the Vendors view.'));
          });
        }
        function viewsDrawer() {
          openDrawer('Storefront views', n(t.views) + ' in the last ' + d.days + ' days against ' + n(t.views_prev) + ' in the ' + d.days + ' before.', function (b) {
            var vs = d.view_sources || [], tot = 0; vs.forEach(function (x) { tot += x.n; });
            var LBL = { listing: 'Storefront page', product: 'Product page', service: 'Service page' };
            table(b, [{ l: 'Where the view landed' }, { l: 'Views', r: true }, { l: 'Share', r: true }], vs.map(function (x) { return [LBL[x.source] || x.source, n(x.n), pct(x.n, tot) + '%']; }));
            var item = 0; vs.forEach(function (x) { if (x.source !== 'listing') item += x.n; });
            if (tot) note(b, pct(item, tot) + '% of views land on an item page,', ' not the storefront. Those pages are front doors too.');
            var ti = (d.top_items || []).slice(0, 8);
            if (ti.length) { b.appendChild(T('h4', 'lk-ah-h4', 'Most opened items')); table(b, [{ l: 'Item' }, { l: 'Vendor' }, { l: 'Views', r: true }], ti.map(function (x) { return [x.name, x.vendor, n(x.views)]; })); }
          });
        }

        // ── what this suggests you design next ──
        var prompts = [];
        if (z && known >= 20 && ret / known < 0.3) prompts.push({ tag: 'shop', tl: 'Shoppers', h: 'Give a shopper a reason to come back', p: 'Following a vendor is the only return path today. A saved search or a shopper-facing "New this week" email would turn a one-time visit into a habit.', ev: n(ret) + ' of ' + n(known) + ' visitors returned on another day.' + (t.shares ? ' ' + plural(t.shares, 'share link') + ' created, so people do pass Lokali on.' : ''), open: entryDrawer });
        if (t.searches >= 5 && zeroTerms.length && t.searches_zero / t.searches >= 0.25) prompts.push({ tag: 'both', tl: 'Both sides', h: 'Searches that find nobody', p: '"' + zeroTerms.slice(0, 3).map(function (x) { return x.term; }).join('", "') + '" returned nothing. A synonym on the right subcategory fixes a term today; a "closest matches" page instead of an empty state fixes the pattern.', ev: n(t.searches_zero) + ' of ' + plural(t.searches, 'search', 'searches') + ' returned zero results. Low volume, but every zero sends a shopper to Google.', open: searchesDrawer });
        if (pub.length >= 10 && top5Share >= 40) prompts.push({ tag: 'vend', tl: 'Vendors', h: 'Attention is concentrating on a few storefronts', p: byViews[0].v.name + ' alone took ' + pct(byViews[0].v.views, t.views) + '% of views. The Market order and the homepage strip decide who gets seen; a newly-live lane or a rotation would spread it.', ev: 'Top 5 storefronts: ' + top5Share + '% of views. ' + plural(low, 'live storefront') + ' had 2 or fewer.', open: function () { go('vendors', true); } });
        if (stalls.length) prompts.push({ tag: 'vend', tl: 'Vendors', h: 'People open these storefronts and stop', p: stalls.slice(0, 3).map(function (r) { return r.v.name; }).join(', ') + (stalls.length > 3 ? ' and ' + (stalls.length - 3) + ' more' : '') + ' had 30 or more views and no reach-out. The page itself is where shoppers stop: photos, price, a clear first step.', ev: plural(stalls.length, 'storefront') + ' seen 30+ times without a contact.', open: nudgeDrawer });
        if (!t.reviews && an.reach >= 5) { var ra = 0; rows.forEach(function (r) { ra += Number(r.v.reviews_all) || 0; }); prompts.push({ tag: 'both', tl: 'Both sides', h: 'Nobody left a review this month', p: 'A review ask after a Won lead or a vendor reply would turn reach-outs into the social proof the next shopper looks for.', ev: '0 reviews in ' + d.days + ' days, ' + n(ra) + ' all-time, against ' + plural(an.reach, 'shopper reach-out') + '.', open: function () { go('insights', true); } }); }
        if (prompts.length < 3) (an.takeaways || []).filter(function (x) { return !/^Storefront views|^[\d,]+ storefront views|reach-out|reached out|contact click/i.test(x.text); }).slice(0, 3 - prompts.length).forEach(function (x) { prompts.push({ tag: 'both', tl: 'Worth knowing', h: x.text, p: '', ev: '', open: null }); });
        if (prompts.length) {
          var prH = T('div', 'lk-ash-sech'); prH.appendChild(T('h3', null, 'What this suggests you design next')); prH.appendChild(T('span', null, 'each card opens the numbers behind it')); promptsSec.appendChild(prH);
          var pg = T('div', 'lk-ah-prompts');
          prompts.slice(0, 3).forEach(function (p) {
            var c = T(p.open ? 'button' : 'div', 'lk-ah-prompt'); if (p.open) { c.type = 'button'; c.addEventListener('click', p.open); }
            c.appendChild(T('span', 'lk-ah-tag ' + p.tag, p.tl)); c.appendChild(T('h4', null, p.h));
            if (p.p) c.appendChild(T('p', null, p.p)); if (p.ev) c.appendChild(T('div', 'ev', p.ev));
            pg.appendChild(c);
          });
          promptsSec.appendChild(pg); promptsSec.hidden = false;
        }

        // ── pulse tiles with sparklines ──
        var daily = d.daily || [];
        function buckets(key) { var out = [], size = Math.max(1, Math.ceil(daily.length / 4)); for (var i = 0; i < daily.length; i += size) { var s = 0; daily.slice(i, i + size).forEach(function (r) { s += Number(r[key]) || 0; }); out.push(s); } return out; }
        function spark(vals) {
          var W = 200, H = 34, max = Math.max.apply(null, vals.concat([1])), svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', class: 'lk-ah-spark' });
          if (vals.length < 2) return svg;
          var pts = vals.map(function (x, i) { return [3 + i * (W - 6) / (vals.length - 1), H - 4 - (x / max) * (H - 10)]; });
          var dd = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
          svg.appendChild(S('path', { d: dd + ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + (H - 2) + ' L3,' + (H - 2) + ' Z', fill: '#6002EE', opacity: '.12', class: 'lk-ah-sp-a' }));
          svg.appendChild(S('path', { d: dd, fill: 'none', stroke: '#6002EE', 'stroke-width': '2', 'stroke-linejoin': 'round', class: 'lk-ah-sp-l' }));
          svg.appendChild(S('circle', { cx: pts[pts.length - 1][0].toFixed(1), cy: pts[pts.length - 1][1].toFixed(1), r: '3', fill: '#6002EE', class: 'lk-ah-sp-d' }));
          return svg;
        }
        function tile(label, value, small, detail, cls, sp, onOpen) {
          var k = T('button', 'lk-ash-kp lk-ah-tile'); k.type = 'button'; k.appendChild(T('div', 'l', label));
          var nn = T('div', 'n', value); if (small) nn.appendChild(T('small', null, ' ' + small)); k.appendChild(nn);
          k.appendChild(T('div', 'd' + (cls ? ' ' + cls : ''), detail)); if (sp) k.appendChild(sp); k.addEventListener('click', onOpen); return k;
        }
        var grid4 = T('div', 'lk-ash-pulse');
        grid4.appendChild(tile('Storefront views', n(t.views), null, vd == null ? 'none in the 30 days before' : (vd >= 0 ? 'up ' : 'down ') + Math.abs(vd) + '% from ' + n(t.views_prev), vd != null && vd >= 0 ? 'up' : (vd == null ? '' : 'warn'), spark(buckets('views')), viewsDrawer));
        var rate = t.views ? Math.round((an.reach / t.views) * 100) : 0;
        grid4.appendChild(tile('Shopper reach-outs', n(an.reach), 'real', rate + '% of views' + (an.internal ? ' · ' + n(an.internal) + ' test clicks left out' : ''), an.reach ? '' : 'warn', spark(buckets('contacts')), channelsDrawer));
        if (z && z.visits) grid4.appendChild(tile('Came back another day', n(ret), 'of ' + n(known), 'visitors seen on 2 or more days', ret ? '' : 'warn', null, entryDrawer));
        else { var withReach = reachRows.length; grid4.appendChild(tile('Live storefronts seen', n(t.vendors_seen) + ' of ' + n(t.vendors_public), null, withReach + ' had a shopper reach out', '', null, function () { go('vendors', true); })); }
        var zt = zeroTerms.slice(0, 3).map(function (x) { return x.term; }).join(', ');
        grid4.appendChild(tile('Searches that found nobody', t.searches ? n(t.searches_zero) : 'None', t.searches ? 'of ' + n(t.searches) : null, t.searches ? (zt || 'every search found someone') : 'nobody searched The Market yet', t.searches && t.searches_zero ? 'warn' : '', spark(buckets('searches')), searchesDrawer));
        pulse.replaceChild(grid4, pbox);

        // ── views by day ──
        if (daily.length >= 7) {
          var ch = T('div', 'lk-ash-sech'); ch.appendChild(T('h3', null, 'Views by day')); ch.appendChild(T('span', null, 'Central time, hover for the number')); chartSec.appendChild(ch);
          var wrap = T('div', 'lk-ah-pulsewrap'), cw = T('div', 'lk-ah-chartwrap');
          var W = 720, Hh = 200, pl = 34, pr = 12, pt = 14, pb = 28, iw = W - pl - pr, ih = Hh - pt - pb;
          var maxV = 0; daily.forEach(function (r) { if (r.views > maxV) maxV = r.views; }); maxV = Math.max(5, Math.ceil(maxV / 10) * 10);
          var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + Hh, role: 'img', 'aria-label': 'Storefront views per day, last ' + d.days + ' days', class: 'lk-ah-chart' });
          var X = function (i) { return pl + i * (iw / (daily.length - 1)); }, Y = function (val) { return pt + ih - (val / maxV) * ih; };
          var stepG = maxV > 200 ? 50 : maxV > 100 ? 25 : maxV >= 50 ? 10 : 5; // ~5 gridlines, not one per 10 (a 265-view day drew 27) for (var g = 0; g <= maxV; g += stepG) { svg.appendChild(S('line', { x1: pl, x2: W - pr, y1: Y(g), y2: Y(g), stroke: '#ECE9F5', 'stroke-width': '1', class: 'lk-ah-grid' })); svg.appendChild(S('text', { x: pl - 8, y: Y(g) + 4, 'text-anchor': 'end', 'font-size': '11', fill: '#8E8BA6', class: 'lk-ah-axis' }, String(g))); }
          var area = 'M' + X(0) + ',' + Y(0), line = '';
          daily.forEach(function (r, i) { area += ' L' + X(i).toFixed(1) + ',' + Y(r.views).toFixed(1); line += (i ? ' L' : 'M') + X(i).toFixed(1) + ',' + Y(r.views).toFixed(1); });
          area += ' L' + X(daily.length - 1).toFixed(1) + ',' + Y(0) + ' Z';
          svg.appendChild(S('path', { d: area, fill: '#EEE6FF', opacity: '.9', class: 'lk-ah-area' }));
          var prevAvg = t.views_prev / daily.length;
          svg.appendChild(S('line', { x1: pl, x2: W - pr, y1: Y(prevAvg), y2: Y(prevAvg), stroke: '#D9D5E8', 'stroke-width': '2', 'stroke-dasharray': '4 4', class: 'lk-ah-prev' }));
          svg.appendChild(S('path', { d: line, fill: 'none', stroke: '#6002EE', 'stroke-width': '2', 'stroke-linejoin': 'round', class: 'lk-ah-line' }));
          var every = daily.length > 40 ? 10 : 5;
          daily.forEach(function (r, i) { if (i % every === 0 || i === daily.length - 1) svg.appendChild(S('text', { x: X(i), y: Hh - 8, 'text-anchor': 'middle', 'font-size': '11', fill: '#8E8BA6', class: 'lk-ah-axis' }, dayLabel(r.d))); });
          var order = daily.map(function (r, i) { return i; }).sort(function (x, y) { return daily[y].views - daily[x].views; });
          if (daily[order[0]].views) svg.appendChild(S('circle', { cx: X(order[0]), cy: Y(daily[order[0]].views), r: '4.5', fill: '#6002EE', stroke: '#fff', 'stroke-width': '2', class: 'lk-ah-pt' }));
          svg.appendChild(S('circle', { cx: X(daily.length - 1), cy: Y(daily[daily.length - 1].views), r: '4', fill: '#6002EE', stroke: '#fff', 'stroke-width': '2', class: 'lk-ah-pt' }));
          var dot = S('circle', { r: '4.5', fill: '#6002EE', stroke: '#fff', 'stroke-width': '2', class: 'lk-ah-pt', opacity: '0' }); svg.appendChild(dot);
          var tip = T('div', 'lk-ah-tip'); tip.hidden = true;
          svg.addEventListener('mousemove', function (e) {
            var rc = svg.getBoundingClientRect(), px = (e.clientX - rc.left) / rc.width * W, i = Math.max(0, Math.min(daily.length - 1, Math.round((px - pl) / (iw / (daily.length - 1)))));
            dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(daily[i].views)); dot.setAttribute('opacity', '1');
            tip.hidden = false; tip.textContent = dayLabel(daily[i].d) + ': ' + plural(daily[i].views, 'view'); tip.style.left = (X(i) / W * 100) + '%'; tip.style.top = (Y(daily[i].views) / Hh * 100) + '%';
          });
          svg.addEventListener('mouseleave', function () { dot.setAttribute('opacity', '0'); tip.hidden = true; });
          cw.appendChild(svg); cw.appendChild(tip);
          var lg = T('div', 'lk-ah-legend'); var l1 = T('span'); l1.appendChild(T('i', 'a')); l1.appendChild(document.createTextNode('Storefront views')); var l2 = T('span'); l2.appendChild(T('i', 'b')); l2.appendChild(document.createTextNode('Daily average of the ' + d.days + ' days before')); lg.appendChild(l1); lg.appendChild(l2);
          var left = T('div'); left.appendChild(cw); left.appendChild(lg); wrap.appendChild(left);
          var ann = T('div', 'lk-ah-annot');
          var b0 = daily[order[0]], b1 = daily[order[1]];
          if (b0 && b0.views) { var a0 = T('div'); a0.appendChild(T('b', null, dayLabel(b0.d) + ': ' + plural(b0.views, 'view') + '.')); a0.appendChild(document.createTextNode(' The best day, a ' + weekday(b0.d) + '.' + (b0.contacts ? ' ' + plural(b0.contacts, 'contact click') + ' that day.' : ''))); ann.appendChild(a0); }
          if (b1 && b1.views && b1.views >= prevAvg * 2) { var a1 = T('div'); a1.appendChild(T('b', null, dayLabel(b1.d) + ': ' + plural(b1.views, 'view') + '.')); a1.appendChild(document.createTextNode(' Second best, a ' + weekday(b1.d) + '.')); ann.appendChild(a1); }
          var quietDays = daily.filter(function (r) { return r.views < 5; }).length;
          if (quietDays) { var a2 = T('div'); a2.appendChild(T('b', null, plural(quietDays, 'quiet day') + '.')); a2.appendChild(document.createTextNode(' Under 5 views. A post, a vendor share or a follow-up email lands best there.')); ann.appendChild(a2); }
          wrap.appendChild(ann); chartSec.appendChild(wrap); chartSec.hidden = false;
        }

        // ── who is getting seen + wins to pass on ──
        var seenCard = T('section', 'lk-ah-card'), sh = T('div', 'lk-ash-sech'); sh.appendChild(T('h3', null, 'Who is getting seen')); sh.appendChild(T('span', null, 'views per live storefront, ' + d.days + ' days'));
        var allB = T('button', null, 'All ' + n(pub.length)); allB.type = 'button'; allB.addEventListener('click', function () { go('vendors', true); }); sh.appendChild(allB); seenCard.appendChild(sh);
        var dist = T('div', 'lk-ah-dist'), maxViews = byViews.length ? (byViews[0].v.views || 1) : 1;
        byViews.slice(0, 12).forEach(function (r, i) {
          var row = T('div', 'lk-ah-drow' + (i < 5 ? ' hot' : '')); row.appendChild(T('span', 'nm', r.v.name || 'Unnamed'));
          var bar = T('div', 'bar'), f = T('i'); f.style.width = Math.max(r.v.views ? 1.5 : 0, pct(r.v.views, maxViews)) + '%'; bar.appendChild(f); row.appendChild(bar);
          row.appendChild(T('span', 'n', n(r.v.views))); row.appendChild(T('span', 'c' + (r.reach ? '' : ' none'), n(r.reach))); dist.appendChild(row);
        });
        seenCard.appendChild(dist);
        var df = T('div', 'lk-ah-distfoot'); df.appendChild(T('span', null, 'Green is the number of shopper reach-outs. Violet bars are the top five.'));
        if (pub.length > 12) { var more = T('button', 'lk-ash-btn', 'Show the ' + n(pub.length - 12) + ' below'); more.type = 'button'; more.addEventListener('click', function () { go('vendors', true); }); df.appendChild(more); }
        seenCard.appendChild(df); two.appendChild(seenCard);

        var wins = [];
        var rated = pub.filter(function (r) { return r.v.views >= 5 && r.reach >= 2; }).sort(function (x, y) { return y.reach / y.v.views - x.reach / x.v.views; });
        if (rated.length) wins.push({ r: rated[0], h: rated[0].v.name + ': ' + plural(rated[0].reach, 'reach-out') + ' from ' + plural(rated[0].v.views, 'view'), s: 'Highest contact rate of any storefront this month' });
        var fresh = pub.filter(function (r) { return r.reach > 0 && r.v.published_at && (now - new Date(r.v.published_at)) / 86400000 <= 14 && (!rated.length || r !== rated[0]); }).sort(function (x, y) { return new Date(y.v.published_at) - new Date(x.v.published_at); });
        if (fresh.length) { var days = Math.max(1, Math.round((now - new Date(fresh[0].v.published_at)) / 86400000)); wins.push({ r: fresh[0], h: fresh[0].v.name + ': a reach-out in the first ' + (days === 1 ? 'day' : days + ' days') + ' live', s: plural(fresh[0].v.views, 'view') + ' so far, ' + plural(fresh[0].reach, 'conversation') + ' started' }); }
        var repeat = pub.filter(function (r) { return r.v.visit && r.v.visit.repeat_visitors >= 2 && (!rated.length || r !== rated[0]) && (!fresh.length || r !== fresh[0]); }).sort(function (x, y) { return y.v.visit.repeat_visitors - x.v.visit.repeat_visitors; });
        if (repeat.length) wins.push({ r: repeat[0], h: repeat[0].v.name + ': ' + plural(repeat[0].v.visit.repeat_visitors, 'shopper') + ' came back to it', s: 'Returned on another day to look again' });
        if (t.qr_scans) wins.push({ h: plural(t.qr_scans, 'QR code scan') + ' this month', s: 'The launch kit cards are being scanned in real shops', go: 'insights' });
        if (t.favorites) wins.push({ h: plural(t.favorites, 'shopper') + ' followed a storefront', s: 'A follower is a shopper planning to come back', go: 'insights' });
        if (wins.length) {
          var winCard = T('section', 'lk-ah-card'), wh = T('div', 'lk-ash-sech'); wh.appendChild(T('h3', null, 'Wins to pass on')); wh.appendChild(T('span', null, 'vendors love hearing this')); winCard.appendChild(wh);
          var wl = T('div', 'lk-ah-wins');
          wins.slice(0, 4).forEach(function (w) {
            var row = T('div', 'lk-ah-win'); var ic = T('div', 'ic'); ic.innerHTML = ASH_ICO.heart; row.appendChild(ic);
            var tx = T('div'); tx.appendChild(T('b', null, w.h)); tx.appendChild(T('small', null, w.s)); row.appendChild(tx);
            var c = w.r && cmap[w.r.v.id];
            if (c) {
              var m = T('a', 'lk-ash-btn', 'Tell ' + (c.first_name || 'them')); var body = (c.first_name ? 'Hi ' + c.first_name + ',' : 'Hi,') + '\n\nA quick one from Lokali: ' + w.h.charAt(0).toLowerCase() + w.h.slice(1) + '. ' + w.s + '.\n\nThank you for being part of this. Keep sharing your link, it is working.\n\nFrancesca\nLokali';
              m.href = 'mailto:' + encodeURIComponent(c.email).replace(/%40/g, '@') + '?subject=' + encodeURIComponent('Good news from Lokali') + '&body=' + encodeURIComponent(body); row.appendChild(m);
            } else if (w.r && w.r.v.slug) { var o = T('a', 'lk-ash-btn', 'Open'); o.href = '/' + encodeURIComponent(w.r.v.slug); o.target = '_blank'; o.rel = 'noopener'; row.appendChild(o); }
            else if (w.go) { var gb = T('button', 'lk-ash-btn', 'See'); gb.type = 'button'; gb.addEventListener('click', function () { go(w.go, true); }); row.appendChild(gb); }
            wl.appendChild(row);
          });
          winCard.appendChild(wl); two.appendChild(winCard);
        }
        two.hidden = false;
      });
    })();

    // ── VENDORS (built on first open) ───────────────────────────────────────
    var vendorsBuilt = false;
    function buildVendors() {
      if (vendorsBuilt) return; vendorsBuilt = true;
      var v = views.vendors;
      var head = T('div', 'lk-ash-h'), hl = T('div'); hl.appendChild(T('p', 'lk-fq-eyebrow', 'Your neighbors in business')); hl.appendChild(T('h2', null, 'Vendors')); var sub = T('p', null, ''); hl.appendChild(sub); head.appendChild(hl);
      var inviteBtn = T('button', 'lk-ash-btn primary', 'Invite a vendor'); inviteBtn.type = 'button'; head.appendChild(inviteBtn);
      v.appendChild(head);
      // Rare tool, so it opens on request instead of sitting open on the page.
      var invitePanel = T('div', 'lk-ash-panel'); invitePanel.hidden = true; appendInviteVendorSection(invitePanel); v.appendChild(invitePanel);
      inviteBtn.setAttribute('aria-expanded', 'false');
      inviteBtn.addEventListener('click', function () {
        invitePanel.hidden = !invitePanel.hidden; inviteBtn.setAttribute('aria-expanded', invitePanel.hidden ? 'false' : 'true');
        inviteBtn.textContent = invitePanel.hidden ? 'Invite a vendor' : 'Close invite';
        if (!invitePanel.hidden) { var f = invitePanel.querySelector('input'); if (f) f.focus(); }
      });

      // Sign in as a vendor sits at the top (F 2026-10-06): it is the tool used
      // most on this view, and a vendor row's "Sign in as" scrolls up to it.
      var tool = T('div', 'lk-ash-sec'); tool.style.margin = '0 0 22px'; appendSignInAsSection(tool); signInHost = tool.querySelector('.lk-admin-section'); v.appendChild(tool);
      var linkTool = appendLinkStorefrontsSection(v); // #215

      var tools = T('div', 'lk-ash-tools');
      var search = T('input', 'lk-ash-search'); search.type = 'search'; search.id = 'lk-ash-vsearch'; search.placeholder = 'Find a vendor by name'; search.setAttribute('aria-label', 'Find a vendor by name');
      tools.appendChild(search); v.appendChild(tools);
      var list = T('div', 'lk-ash-list'); list.appendChild(T('div', 'lk-ash-note', 'Loading vendors…')); v.appendChild(list);

      Promise.all([insightsData(), contacts()]).then(function (rs) {
        var pack = rs[0], cmap = rs[1];
        if (!pack) { list.innerHTML = ''; list.appendChild(T('div', 'lk-ash-note', 'Vendors could not load. Refresh the page to try again.')); return; }
        var rows = pack.an.rows, filt = 'all';
        if (linkTool) linkTool.setRows(rows);
        sub.textContent = rows.length + ' accounts · ' + pack.an.live + ' live on The Market · numbers are the last 30 days';
        var F = [['all', 'All'], ['working', 'Working'], ['seen', 'Getting seen'], ['stalls', 'Seen, no contact'], ['low', 'Low visibility'], ['unseen', 'Not seen'], ['notlive', 'Not live']];
        var fbtns = [];
        F.forEach(function (f) {
          var cnt = f[0] === 'all' ? rows.length : rows.filter(function (r) { return r.dx.key === f[0]; }).length;
          if (!cnt) return;
          var b = T('button', 'lk-ash-fchip', f[1]); b.type = 'button'; b.appendChild(T('span', null, String(cnt))); b.setAttribute('aria-pressed', f[0] === 'all' ? 'true' : 'false');
          b.addEventListener('click', function () { filt = f[0]; fbtns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); paint(); });
          fbtns.push(b); tools.appendChild(b);
        });
        function paint() {
          var q = (search.value || '').trim().toLowerCase(); list.innerHTML = '';
          var show = rows.filter(function (r) { return (filt === 'all' || r.dx.key === filt) && String(r.v.name || 'unnamed signup').toLowerCase().indexOf(q) >= 0; });
          if (!show.length) { list.appendChild(T('div', 'lk-ash-note', q ? 'No vendor matches "' + search.value.trim() + '".' : 'No vendors in this group.')); return; }
          show.forEach(function (r) { list.appendChild(vendorRow(r, cmap, true)); });
        }
        search.addEventListener('input', paint);
        paint();
      });
    }

    // ── INSIGHTS (mounted on first open) ────────────────────────────────────
    var insightsBuilt = false;
    function buildInsights() {
      if (insightsBuilt) return; insightsBuilt = true;
      var host = views.insights; host.appendChild(T('div', 'lk-ash-note', 'Loading Insights…'));
      loadAdminInsights(function (ok) {
        if (!ok) { insightsBuilt = false; host.innerHTML = ''; host.appendChild(T('div', 'lk-ash-note', 'Insights could not load. Refresh the page and try again.')); return; }
        window.LokaliAdminInsights.mount(host, { extra: function (slot) {
          // Analysis that used to sit in the Console: it belongs with the analysis.
          appendAcquisitionSection(slot); appendQrScansSection(slot); appendExitSurveySection(slot, ov);
        } });
      });
    }

    // ── PROSPECTS (#208, mounted on first open) ─────────────────────────────
    // People F met who have not signed up yet. One row each; two notes written
    // in her voice from the detail she typed; she reads, edits, taps Send. Email
    // goes out as francesca@ through the route; Instagram / text she sends by
    // hand and marks. Ten days after note 1, note 2 comes due; after that the
    // row goes quiet on its own (never a third). Sign-ups are matched nightly.
    var prospectsBuilt = false;
    function buildProspects() {
      if (prospectsBuilt) return; prospectsBuilt = true;
      var v = views.prospects;
      var head = T('div', 'lk-ash-h'), hl = T('div'); hl.appendChild(T('p', 'lk-fq-eyebrow', 'Future neighbors')); hl.appendChild(T('h2', null, 'Prospects'));
      var sub = T('p', null, 'People you met who have not opened a storefront yet.'); hl.appendChild(sub); head.appendChild(hl);
      var addBtn = T('button', 'lk-ash-btn primary', 'Add a prospect'); addBtn.type = 'button'; head.appendChild(addBtn);
      v.appendChild(head);
      if (!SAPI || !SAPI.admin || !SAPI.admin.prospects) { v.appendChild(T('div', 'lk-ash-note', 'The prospect tools need the newer client script.')); return; }
      var A = SAPI.admin;

      var ERR = {
        not_admin: 'Only the admin can do that.', rpc_unavailable: 'The database side is not installed yet (patch_prospects.sql).',
        no_key: 'The note writer is not set up yet (ANTHROPIC_API_KEY). Write the note yourself below.',
        draft_failed: 'The notes could not be written this time. Try again, or write them yourself below.',
        read_failed: 'Could not read that card. Type the details in.', image_too_large: 'That photo is too big. Try again a little closer.',
        send_failed: 'Brevo refused the send. Is francesca@golokali.com a verified sender in Brevo? Nothing was stamped.',
        stamp_failed: 'The email WENT OUT but the row could not be stamped. Press "Mark as sent" so it is not sent twice.',
        already_sent: 'That note already went out.', closed: 'This prospect is closed; reopen it first.',
        em_dash: 'There is an em dash in the text. Replace it with a comma or a period.', email_required: 'An email address is needed for the email channel.',
        business_name_required: 'Business name is required.', not_email_channel: 'This one is Instagram or text: copy the note and send it yourself.'
      };
      function errText(e) { return ERR[e] || ('Something went wrong (' + e + ').'); }
      function fmtDate(s) { if (!s) return ''; try { var d = /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? new Date(s + 'T12:00:00') : new Date(s); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
      function daysUntil(s) { if (!s) return null; return Math.ceil((new Date(s).getTime() - Date.now()) / 86400000); }
      function val(s) { // SEC-099: plain string for input .value (NOT an HTML escaper; never use in el())
        return String(s == null ? '' : s); }

      // ── add / edit form (one panel, re-used for edits) ──────────────────
      var panel = T('div', 'lk-ash-panel'); panel.hidden = true; v.appendChild(panel);
      var form = document.createElement('form'); form.setAttribute('novalidate', ''); form.className = 'lk-ash-pform';
      var editingId = null;
      function fld(label, name, type, ph, max, full) {
        var w = T('label', 'lk-ash-pf'); w.appendChild(T('span', null, label));
        var i = document.createElement(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
        if (type !== 'textarea' && type !== 'select') i.type = type;
        i.name = name; i.className = 'lk-ash-search'; if (ph) i.placeholder = ph; if (max) i.maxLength = max; if (type === 'textarea') i.rows = 3;
        if (full) w.classList.add('full');
        w.appendChild(i); form.appendChild(w); return i;
      }
      // Snap a card: phone camera -> downscale -> route -> fields pre-filled.
      var snapW = T('div', 'lk-ash-pf full lk-ash-psnap');
      var snapBtn = T('label', 'lk-ash-btn', 'Snap a business card'); var snapIn = document.createElement('input'); snapIn.type = 'file'; snapIn.accept = 'image/*'; snapIn.setAttribute('capture', 'environment'); snapIn.hidden = true; snapBtn.appendChild(snapIn);
      var snapMsg = T('span', null, 'Point the camera at their card and the fields fill in. Then add the one thing you remember about them.');
      snapW.appendChild(snapBtn); snapW.appendChild(snapMsg); form.appendChild(snapW);
      var fFirst = fld('First name', 'first_name', 'text', 'e.g. Stacey', 60);
      var fBiz = fld('Business *', 'business_name', 'text', 'e.g. Kona Ice', 120);
      var fEmail = fld('Email', 'email', 'email', 'name@business.com', 254);
      var fPhone = fld('Phone', 'phone', 'tel', '(832) 555-0100', 40);
      var fIg = fld('Instagram', 'instagram', 'text', 'handle, no @', 60);
      var fChan = fld('Reach them by', 'channel', 'select');
      [['email', 'Email (sent for you)'], ['instagram', 'Instagram DM (you send)'], ['text', 'Text message (you send)']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; fChan.appendChild(op); });
      var fCat = fld('Kind of business', 'category_id', 'select');
      var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Pick one'; fCat.appendChild(o0);
      Object.keys(CAT_NAMES).forEach(function (id) { var o = document.createElement('option'); o.value = id; o.textContent = CAT_NAMES[id]; fCat.appendChild(o); });
      var fWhere = fld('Where you met', 'met_where', 'text', 'e.g. MCHC mixer at Lupita’s', 160);
      var fWhen = fld('When', 'met_on', 'date'); try { fWhen.value = localISODate(); } catch (e) {}
      var fOffer = fld('The offer', 'offer', 'select');
      [['either', 'Sign up, or I set it up for them'], ['build', 'I build it for them'], ['self', 'They sign up themselves']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; fOffer.appendChild(op); });
      var fNote = fld('The one thing you remember about them *', 'note', 'textarea', 'What you talked about, what they make, what made you smile. This is what makes the note sound like you.', 1000, true);
      var acts = T('div', 'lk-ash-pf full lk-ash-acts'); acts.style.justifyContent = 'flex-start';
      var saveBtn = T('button', 'lk-ash-btn primary', 'Save and write the notes'); saveBtn.type = 'submit';
      var cancelBtn = T('button', 'lk-ash-btn', 'Cancel'); cancelBtn.type = 'button';
      var fmsg = T('span', 'lk-ash-pmsg', '');
      acts.appendChild(saveBtn); acts.appendChild(cancelBtn); acts.appendChild(fmsg); form.appendChild(acts);
      panel.appendChild(form);

      function openForm(row) {
        editingId = row ? row.id : null;
        form.reset(); try { fWhen.value = localISODate(); } catch (e) {}
        if (row) {
          fFirst.value = val(row.first_name); fBiz.value = val(row.business_name); fEmail.value = val(row.email); fPhone.value = val(row.phone);
          fIg.value = val(row.instagram); fChan.value = row.channel || 'email'; fCat.value = row.category_id != null ? String(row.category_id) : '';
          fWhere.value = val(row.met_where); if (row.met_on) fWhen.value = String(row.met_on).slice(0, 10); fOffer.value = row.offer || 'either'; fNote.value = val(row.note);
        }
        saveBtn.textContent = row ? 'Save changes' : 'Save and write the notes';
        fmsg.textContent = ''; panel.hidden = false; addBtn.textContent = 'Close'; addBtn.setAttribute('aria-expanded', 'true');
        try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
        (row ? fNote : fFirst).focus();
      }
      function closeForm() { panel.hidden = true; editingId = null; addBtn.textContent = 'Add a prospect'; addBtn.setAttribute('aria-expanded', 'false'); }
      addBtn.addEventListener('click', function () { if (panel.hidden) openForm(null); else closeForm(); });
      cancelBtn.addEventListener('click', closeForm);

      // Downscale the card photo on the phone before it travels (long edge 1400px, JPEG).
      function shrink(file) {
        return new Promise(function (resolve, reject) {
          var url = URL.createObjectURL(file), img = new Image();
          img.onload = function () {
            try {
              var w = img.naturalWidth, h = img.naturalHeight, max = 1400, s = Math.min(1, max / Math.max(w, h));
              var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
              c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
              var data = c.toDataURL('image/jpeg', 0.85); URL.revokeObjectURL(url);
              resolve(data.split(',')[1]);
            } catch (e) { URL.revokeObjectURL(url); reject(e); }
          };
          img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
          img.src = url;
        });
      }
      snapIn.addEventListener('change', function () {
        var f = snapIn.files && snapIn.files[0]; if (!f) return;
        if (!A.prospectCard) { snapMsg.textContent = 'Card reading needs the newer client script.'; return; }
        snapMsg.textContent = 'Reading the card…'; snapBtn.classList.add('is-busy');
        shrink(f).then(function (b64) { return A.prospectCard(b64, 'image/jpeg'); }).then(function (res) {
          snapBtn.classList.remove('is-busy'); snapIn.value = '';
          if (!res || res.error) { snapMsg.textContent = errText(res && res.error || 'read_failed'); return; }
          var d = res.data && res.data.fields || {};
          if (d.first_name && !fFirst.value) fFirst.value = d.first_name;
          if (d.business_name && !fBiz.value) fBiz.value = d.business_name;
          if (d.email && !fEmail.value) fEmail.value = d.email;
          if (d.phone && !fPhone.value) fPhone.value = d.phone;
          if (d.instagram && !fIg.value) fIg.value = d.instagram;
          if (d.email) fChan.value = 'email'; else if (d.instagram) fChan.value = 'instagram';
          snapMsg.textContent = 'Filled in from the card. Check the spelling, then add what you remember.'; fNote.focus();
        }).catch(function () { snapBtn.classList.remove('is-busy'); snapIn.value = ''; snapMsg.textContent = 'Could not read that photo. Type the details in.'; });
      });

      // ── list ───────────────────────────────────────────────────────────
      var tools = T('div', 'lk-ash-tools'); v.appendChild(tools);
      var list = T('div', 'lk-ash-list'); list.appendChild(T('div', 'lk-ash-note', 'Loading prospects…')); v.appendChild(list);
      var rows = [], filt = 'due', openId = null, fbtns = [];
      var GROUPS = [['due', 'Ready to send'], ['waiting', 'Waiting'], ['won', 'Replied or signed up'], ['quiet', 'Quiet'], ['all', 'All']];
      function groupOf(r) {
        if (r.status === 'replied' || r.status === 'signed_up') return 'won';
        if (r.due) return 'due';
        if (r.status === 'waiting') return 'waiting';
        return 'quiet';
      }
      function pill(r) {
        if (r.status === 'signed_up') return ['working', 'Signed up'];
        if (r.status === 'replied') return ['working', 'Replied'];
        if (r.status === 'declined') return ['notlive', 'Not now'];
        if (r.status === 'quiet') return ['notlive', 'Quiet'];
        if (r.due) return ['unseen', r.due_touch === 2 ? 'Last note due' : 'First hello due'];
        var d = daysUntil(r.next_touch_at);
        return ['seen', d == null ? 'Waiting' : d <= 0 ? 'Due today' : 'Note 2 in ' + d + (d === 1 ? ' day' : ' days')];
      }
      function paintTools() {
        tools.innerHTML = ''; fbtns = [];
        if (filt !== 'all' && !rows.some(function (r) { return groupOf(r) === filt; })) filt = rows.some(function (r) { return r.due; }) ? 'due' : 'all';
        GROUPS.forEach(function (g) {
          var cnt = g[0] === 'all' ? rows.length : rows.filter(function (r) { return groupOf(r) === g[0]; }).length;
          if (!cnt && g[0] !== 'all') return;
          var b = T('button', 'lk-ash-fchip', g[1]); b.type = 'button'; b.appendChild(T('span', null, String(cnt))); b.setAttribute('aria-pressed', filt === g[0] ? 'true' : 'false');
          b.addEventListener('click', function () { filt = g[0]; fbtns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); paint(); });
          fbtns.push(b); tools.appendChild(b);
        });
        var due = rows.filter(function (r) { return r.due; }).length, wait = rows.filter(function (r) { return r.status === 'waiting' && !r.due; }).length, won = rows.filter(function (r) { return r.status === 'signed_up'; }).length;
        sub.textContent = rows.length ? (due + ' ready to send · ' + wait + ' waiting · ' + won + ' signed up') : 'People you met who have not opened a storefront yet.';
      }
      function load() {
        return A.prospects().then(function (res) {
          if (!res || res.error || !res.data || res.data.ok !== true) {
            list.innerHTML = ''; list.appendChild(T('div', 'lk-ash-note', res && res.data && res.data.reason ? errText(res.data.reason) : 'Prospects could not load. Is patch_prospects.sql applied?')); return;
          }
          rows = res.data.rows || [];
          if (filt === 'due' && !rows.some(function (r) { return r.due; }) && rows.length) filt = 'all';
          paintTools(); paint();
        });
      }
      function paint() {
        list.innerHTML = '';
        var show = rows.filter(function (r) { return filt === 'all' || groupOf(r) === filt; });
        if (!show.length) { list.appendChild(T('div', 'lk-ash-note', rows.length ? 'Nothing in this group.' : 'No prospects yet. Tap "Add a prospect" after your next event.')); return; }
        show.forEach(function (r) { list.appendChild(prow(r)); });
      }
      function replaceRow(row) {
        for (var i = 0; i < rows.length; i++) if (rows[i].id === row.id) { row.vendor_slug = row.vendor_slug || rows[i].vendor_slug; rows[i] = row; break; }
        paintTools(); paint();
      }

      function prow(r) {
        var row = T('div', 'lk-ash-row lk-ash-prow'), left = T('div');
        var who = (r.first_name ? r.first_name + ', ' : '') + r.business_name;
        left.appendChild(T('b', null, who));
        var line = r.note ? r.note : (r.met_where ? 'Met at ' + r.met_where : 'No note yet');
        left.appendChild(T('small', null, line.length > 140 ? line.slice(0, 137) + '…' : line));
        var meta = T('div', 'lk-ash-meta'); var pl = pill(r); meta.appendChild(T('span', 'lk-ash-pill ' + pl[0], pl[1]));
        meta.appendChild(T('span', null, r.channel === 'email' ? (r.email || 'email') : r.channel === 'instagram' ? '@' + (r.instagram || '?') : 'text ' + (r.phone || '')));
        if (r.met_where || r.met_on) meta.appendChild(T('span', null, (r.met_where ? r.met_where + ' · ' : '') + fmtDate(r.met_on)));
        // #208b: what Brevo saw happen to each note. Opens are "likely": Apple Mail fetches the pixel for everyone.
        function fate(n) {
          var b = r['sent' + n + '_bounced_at'], c = r['sent' + n + '_clicked_at'], o = r['sent' + n + '_opened_at'], d = r['sent' + n + '_delivered_at'];
          if (b) return ', bounced'; if (c) return ', clicked the link'; if (o) return ', likely opened'; if (d) return ', delivered'; return '';
        }
        if (r.touch1_at) { var f1 = T('span', null, 'Note 1 ' + fmtDate(r.touch1_at) + (r.channel === 'email' ? fate(1) : '')); if (r.sent1_bounced_at) f1.style.color = '#9A4A12'; meta.appendChild(f1); }
        if (r.touch2_at) { var f2 = T('span', null, 'Note 2 ' + fmtDate(r.touch2_at) + (r.channel === 'email' ? fate(2) : '')); if (r.sent2_bounced_at) f2.style.color = '#9A4A12'; meta.appendChild(f2); }
        if (r.vendor_slug) { var a = T('a', null, '/' + r.vendor_slug); a.href = '/' + r.vendor_slug; a.target = '_blank'; a.rel = 'noopener'; meta.appendChild(a); }
        left.appendChild(meta); row.appendChild(left);
        var acts = T('div', 'lk-ash-acts');
        var open = T('button', 'lk-ash-btn' + (r.due ? ' primary' : ''), openId === r.id ? 'Close' : (r.due ? 'Read and send' : 'Open')); open.type = 'button';
        open.addEventListener('click', function () { openId = openId === r.id ? null : r.id; paint(); });
        acts.appendChild(open); row.appendChild(acts);
        if (openId === r.id) row.appendChild(detail(r));
        return row;
      }

      function detail(r) {
        var box = T('div', 'lk-ash-pdetail');
        var msg = T('div', 'lk-ash-pmsg', '');
        var closed = r.status === 'replied' || r.status === 'signed_up' || r.status === 'declined' || r.status === 'quiet';
        var touch = r.due_touch || (r.touch1_at ? 2 : 1);
        var isEmail = r.channel === 'email';
        if (r.note) { var n = T('p', 'lk-ash-pnote'); n.appendChild(T('b', null, 'You noted: ')); n.appendChild(document.createTextNode(r.note)); box.appendChild(n); }

        if (!closed) {
          var hasDraft = !!(touch === 1 ? r.body1 : r.body2);
          var dh = T('div', 'lk-ash-sech'); dh.appendChild(T('h3', null, touch === 1 ? 'The first hello' : 'The last note')); dh.appendChild(T('span', null, isEmail ? 'goes out from francesca@golokali.com' : 'copy it into ' + (r.channel === 'instagram' ? 'Instagram' : 'a text')));
          var rewrite = T('button', null, hasDraft ? 'Rewrite both notes' : 'Write the notes for me'); rewrite.type = 'button'; dh.appendChild(rewrite); box.appendChild(dh);
          var subj = document.createElement('input'); subj.className = 'lk-ash-search'; subj.placeholder = 'Subject'; subj.value = val(touch === 1 ? r.subject1 : r.subject2); subj.maxLength = 200; subj.hidden = !isEmail;
          var body = document.createElement('textarea'); body.className = 'lk-ash-search lk-ash-pbody'; body.rows = 11; body.maxLength = 4000; body.placeholder = hasDraft ? '' : 'No draft yet. Press "Write the notes for me", or write it here.'; body.value = val(touch === 1 ? r.body1 : r.body2);
          box.appendChild(subj); box.appendChild(body);
          var when = T('p', 'lk-ash-pwhen', touch === 2 && !r.due ? 'This one is not due until ' + fmtDate(r.next_touch_at) + '. You can still send it now.' : (touch === 2 ? 'After this one the row goes quiet. No third note, ever.' : 'After this, note 2 comes due in ten days unless they reply or sign up.'));
          box.appendChild(when);
          var acts = T('div', 'lk-ash-acts'); acts.style.justifyContent = 'flex-start';
          var send = T('button', 'lk-ash-btn primary', isEmail ? 'Send as Francesca' : 'Copy the note'); send.type = 'button';
          var mark = T('button', 'lk-ash-btn', 'Mark as sent'); mark.type = 'button'; mark.hidden = isEmail;
          var saveDraft = T('button', 'lk-ash-btn', 'Save my edits'); saveDraft.type = 'button';
          acts.appendChild(send); acts.appendChild(mark); acts.appendChild(saveDraft); box.appendChild(acts);

          function draftPayload() { var p = { id: r.id }; if (touch === 1) { p.subject1 = subj.value; p.body1 = body.value; } else { p.subject2 = subj.value; p.body2 = body.value; } return p; }
          saveDraft.addEventListener('click', function () {
            saveDraft.disabled = true; msg.textContent = '';
            A.prospectSave(draftPayload()).then(function (res) { saveDraft.disabled = false; var d = res && res.data; if (!d || d.ok !== true) { msg.textContent = errText((d && d.reason) || (res && res.error) || 'save'); return; } msg.textContent = 'Saved.'; replaceRow(d.row); openId = r.id; paint(); });
          });
          rewrite.addEventListener('click', function () {
            if (!A.prospectDraft) { msg.textContent = 'Needs the newer client script.'; return; }
            if (hasDraft && !window.confirm('Replace both drafts with new ones? Your edits to them will be lost.')) return;
            rewrite.disabled = true; rewrite.textContent = 'Writing…'; msg.textContent = '';
            A.prospectDraft(r.id).then(function (res) {
              rewrite.disabled = false; rewrite.textContent = 'Rewrite both notes';
              if (!res || res.error) { msg.textContent = errText(res && res.error || 'draft_failed'); return; }
              replaceRow(res.data.row); openId = r.id; paint();
            });
          });
          function afterSent(res) {
            send.disabled = false; send.textContent = isEmail ? 'Send as Francesca' : 'Copy the note'; mark.disabled = false;
            var d = res && res.data;
            if (res && res.error) { msg.textContent = errText(res.error); return; }
            if (!d || d.ok !== true) { msg.textContent = errText((d && d.reason) || 'send_failed'); return; }
            replaceRow(d.row); openId = null; paint();
          }
          send.addEventListener('click', function () {
            var s = subj.value.trim(), b = body.value.trim();
            if (b.length < 20) { msg.textContent = 'The note is empty.'; return; }
            if (/[—–]/.test(s + b)) { msg.textContent = ERR.em_dash; return; }
            if (!isEmail) {
              var ok = false; try { navigator.clipboard.writeText(b); ok = true; } catch (e) {}
              if (!ok) { body.select(); try { ok = document.execCommand('copy'); } catch (e2) {} }
              msg.textContent = ok ? 'Copied. Send it, then press "Mark as sent".' : 'Select the text and copy it, then press "Mark as sent".';
              return;
            }
            if (!s) { msg.textContent = 'Add a subject line.'; return; }
            if (!window.confirm('Send this note to ' + (r.email || 'them') + ' now, from francesca@golokali.com?')) return;
            send.disabled = true; send.textContent = 'Sending…'; msg.textContent = '';
            A.prospectSend(r.id, touch, s, b).then(afterSent);
          });
          mark.addEventListener('click', function () {
            if (!window.confirm('Mark note ' + touch + ' as sent to ' + (r.first_name || r.business_name) + '?')) return;
            mark.disabled = true;
            A.prospectMarkSent(r.id, touch, subj.value.trim() || null, body.value.trim() || null).then(afterSent);
          });
        } else {
          var st = T('p', 'lk-ash-pwhen', r.status === 'signed_up' ? 'They signed up' + (r.signed_up_at ? ' on ' + fmtDate(r.signed_up_at) : '') + '. The sequence stopped on its own.'
            : r.status === 'replied' ? 'They replied' + (r.replied_at ? ' on ' + fmtDate(r.replied_at) : '') + '. It is in your hands now.'
            : r.status === 'quiet' ? 'Both notes went out. The door stays open; nothing more is scheduled.' : 'Marked not now.');
          box.appendChild(st);
          if (r.sent2_body || r.sent1_body) { var sent = T('details', 'lk-ash-psent'); var sm = T('summary', null, 'What went out'); sent.appendChild(sm); if (r.sent1_body) { sent.appendChild(T('b', null, 'Note 1' + (r.sent1_subject ? ': ' + r.sent1_subject : ''))); sent.appendChild(T('pre', null, r.sent1_body)); } if (r.sent2_body) { sent.appendChild(T('b', null, 'Note 2' + (r.sent2_subject ? ': ' + r.sent2_subject : ''))); sent.appendChild(T('pre', null, r.sent2_body)); } box.appendChild(sent); }
        }

        var more = T('div', 'lk-ash-acts lk-ash-pmore'); more.style.justifyContent = 'flex-start';
        function small(label, fn) { var b = T('button', 'lk-ash-btn', label); b.type = 'button'; b.addEventListener('click', fn); more.appendChild(b); return b; }
        if (r.status !== 'replied' && r.status !== 'signed_up') small('They replied', function () { setStatus(r, 'replied'); });
        if (r.status !== 'signed_up') small('They signed up', function () { markSignedUp(r); });
        if (r.status !== 'declined' && r.status !== 'signed_up') small('Not now', function () { setStatus(r, 'declined'); });
        if (r.status === 'replied' || r.status === 'declined') small('Reopen', function () { setStatus(r, 'new'); });
        small('Edit details', function () { openForm(r); });
        small('Delete', function () {
          if (!window.confirm('Delete ' + r.business_name + ' from prospects? This cannot be undone.')) return;
          A.prospectDelete(r.id).then(function (res) { if (res && res.data && res.data.ok) { rows = rows.filter(function (x) { return x.id !== r.id; }); openId = null; paintTools(); paint(); } else msg.textContent = 'Could not delete.'; });
        });
        box.appendChild(more); box.appendChild(msg);
        return box;
      }
      function setStatus(r, status) {
        A.prospectStatus(r.id, status).then(function (res) { var d = res && res.data; if (d && d.ok === true) { replaceRow(d.row); openId = r.id; paint(); } else window.alert(errText((d && d.reason) || (res && res.error) || 'status')); });
      }

      function markSignedUp(r) {
        if (!window.confirm('Mark ' + (r.first_name || r.business_name) + ' as signed up? This stops the follow-up notes and cannot be undone here.')) return;
        A.prospectSignedUp(r.id).then(function (res) { var d = res && res.data; if (d && d.ok === true) { replaceRow(d.row); openId = r.id; paint(); } else window.alert(errText((d && d.reason) || (res && res.error) || 'status')); });
      }

      // ── save ───────────────────────────────────────────────────────────
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var p = {
          first_name: fFirst.value.trim(), business_name: fBiz.value.trim(), email: fEmail.value.trim(), phone: fPhone.value.trim(),
          instagram: fIg.value.trim(), channel: fChan.value, category_id: fCat.value ? Number(fCat.value) : null,
          met_where: fWhere.value.trim(), met_on: fWhen.value || null, offer: fOffer.value, note: fNote.value.trim()
        };
        if (!p.business_name) { fmsg.textContent = 'Business name is required.'; fBiz.focus(); return; }
        if (p.channel === 'email' && !p.email) { fmsg.textContent = 'Add their email, or pick Instagram or text.'; fEmail.focus(); return; }
        if (!editingId && !p.note) { fmsg.textContent = 'Add the one thing you remember about them. It is what makes the note yours.'; fNote.focus(); return; }
        if (editingId) p.id = editingId;
        var isNew = !editingId;
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; fmsg.textContent = '';
        A.prospectSave(p).then(function (res) {
          var d = res && res.data;
          if (!d || d.ok !== true) { saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Save and write the notes' : 'Save changes'; fmsg.textContent = errText((d && d.reason) || (res && res.error) || 'save'); return; }
          var row = d.row;
          if (isNew) rows.push(row); else replaceRow(row);
          if (!isNew || !A.prospectDraft) { saveBtn.disabled = false; closeForm(); openId = row.id; filt = 'all'; paintTools(); paint(); return; }
          saveBtn.textContent = 'Writing the notes…';
          A.prospectDraft(row.id).then(function (dr) {
            saveBtn.disabled = false; closeForm();
            if (dr && dr.data && dr.data.row) replaceRow(dr.data.row);
            openId = row.id; filt = 'due'; paintTools(); paint();
            if (dr && dr.error) window.alert(errText(dr.error));
            var el = list.querySelector('.lk-ash-pdetail'); if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e2) {} }
          });
        });
      });

      load();
    }

    // ── MARKETING (F 2026-11-08, mounted on first open) ──────────────────────
    // "Build a marketing tab on my dashboard ... optimized for data and making
    // decisions. Nothing can be made up." One RPC (admin_marketing, docs/supabase/
    // patch_admin_marketing.sql) carries every database number; the email card
    // reads Brevo through /admin/marketing-email (the key stays on the server).
    // Every figure on the page is a live read; where a source does not exist yet
    // (Instagram reach) the card says so instead of guessing.
    var marketingBuilt = false, mkDays = 30;
    function buildMarketing() {
      if (marketingBuilt) return; marketingBuilt = true;
      var v = views.marketing;
      function n(x) { return (Number(x) || 0).toLocaleString('en-US'); }
      function num(x) { return Number(x) || 0; }
      function pct(a, b) { return b ? Math.round((num(a) / num(b)) * 100) : 0; }
      function plural(k, one, many) { k = num(k); return n(k) + ' ' + (k === 1 ? one : (many || one + 's')); }
      function when(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return ''; } }
      function ago(iso) { if (!iso) return ''; var d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
      function delta(cur, prev, what) {
        cur = num(cur); prev = num(prev);
        if (!prev) return cur ? 'none in the ' + mkDays + ' days before' : 'none in either period';
        if (!cur) return 'none this period, ' + n(prev) + ' the ' + mkDays + ' days before';
        var d = Math.round(((cur - prev) / prev) * 100);
        return (d >= 0 ? 'up ' : 'down ') + Math.abs(d) + '% from ' + n(prev) + (what ? ' ' + what : '');
      }
      function deltaCls(cur, prev) { cur = num(cur); prev = num(prev); if (!prev && !cur) return ''; if (!prev) return 'up'; return cur >= prev ? 'up' : 'warn'; }
      function link(href, text, cls) { var a = T('a', cls || null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }
      function card(cls, ico, kick, title) { var c = fqCard('lk-mk-card' + (cls ? ' ' + cls : '')); var h = fqHead(c, ico, kick, title); return { el: c, h: h }; }
      function note(text, cls) { return T('p', 'lk-mk-note' + (cls ? ' ' + cls : ''), text); }
      function tile(label, value, small, detail, cls) {
        var k = T('div', 'lk-mk-tile' + (cls ? ' ' + cls : '')); k.appendChild(T('span', 'l', label));
        var nn = T('span', 'n', value); if (small) nn.appendChild(T('small', null, ' ' + small)); k.appendChild(nn);
        if (detail) k.appendChild(T('span', 'd', detail)); return k;
      }
      function bars(rows, opts) {
        // rows: [{label, n, prev?, sub?}] -> label | bar | number
        opts = opts || {}; var max = 0; rows.forEach(function (r) { max = Math.max(max, num(r.n), num(r.prev)); });
        var box = T('div', 'lk-mk-bars' + (opts.cls ? ' ' + opts.cls : ''));
        rows.forEach(function (r) {
          var row = T('div', 'lk-mk-bar'); var lab = T('span', 'lab', r.label); if (r.sub) lab.appendChild(T('small', null, r.sub)); row.appendChild(lab);
          var track = T('span', 'track'); var fill = T('i'); fill.style.width = (max ? Math.max(1, Math.round((num(r.n) / max) * 100)) : 0) + '%'; track.appendChild(fill);
          if (r.prev != null && max) { var ghost = T('u'); ghost.style.left = Math.min(100, Math.round((num(r.prev) / max) * 100)) + '%'; ghost.title = n(r.prev) + ' the period before'; track.appendChild(ghost); }
          row.appendChild(track);
          var val = T('span', 'val', n(r.n)); if (r.prev != null) val.appendChild(T('small', null, ' / ' + n(r.prev))); row.appendChild(val);
          box.appendChild(row);
        });
        return box;
      }
      function table(head, rows, cls) {
        var t = T('table', 'lk-mk-table' + (cls ? ' ' + cls : '')), th = T('thead'), tr = T('tr');
        head.forEach(function (h, i) { tr.appendChild(T('th', i ? 'num' : null, h)); }); th.appendChild(tr); t.appendChild(th);
        var tb = T('tbody');
        rows.forEach(function (r) { var x = T('tr'); r.forEach(function (c, i) { var td = T('td', i ? 'num' : null); if (c && c.nodeType) td.appendChild(c); else td.textContent = c == null ? '' : String(c); x.appendChild(td); }); tb.appendChild(x); });
        t.appendChild(tb); return t;
      }
      var HOW = { own: 'Signed up on their own', claim_card: 'You built the page for them', 'prospect:instagram': 'Your Instagram note', 'prospect:email': 'Your email note', 'prospect:text': 'Your text message', 'prospect:in_person': 'Met in person, then a note' };
      function howLabel(k) { return HOW[k] || (String(k).indexOf('prospect:') === 0 ? 'Your note (' + String(k).slice(9) + ')' : String(k)); }
      var CHAN = { instagram: 'Instagram DM', email: 'Email', text: 'Text message', in_person: 'In person', unknown: 'Not noted' };
      var REF = { direct: 'Typed in or from an app (direct)', external: 'From another website', market: 'The Market', share: 'A shared link', internal: 'From inside Lokali', unknown: 'Unknown' };
      var PAGE = { storefront: 'Storefronts', home: 'Home', market: 'The Market', pricing: 'Pricing', about: 'About', features: 'Features', guides: 'Guides', contact: 'Contact', start: 'Start Here', week: 'This Week', listing: 'Listings', product: 'Products', service: 'Services', other: 'Other pages' };
      var QRC = { 'flyer/print': 'Printed flyer', 'vendor/print': 'Vendor QR cards', 'vendor-circle/screen': 'Circle screen loop', 'unknown/': 'Unknown' };
      function eventLabel(key) { var m = /^([a-z]{3})(\d{1,2})-(\d{4})$/.exec(String(key || '')); if (!m) return String(key || 'Event'); var mon = { jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec' }[m[1]] || m[1]; return 'Vendor Circle, ' + mon + ' ' + m[2] + ', ' + m[3]; }
      // the eight demand categories of TODO #233, by category slug; realtor and lender
      // has no category of its own and comes from the two subcategories
      var DEMAND = [['home', 'Home services'], ['beauty', 'Beauty'], ['wellness', 'Health and wellness'], ['food', 'Food'], ['events', 'Events'], ['children', 'Children and education'], ['professional', 'Professional services']];

      var head = T('div', 'lk-ash-h lk-mk-head'), hl = T('div'); hl.appendChild(T('p', 'lk-fq-eyebrow', 'Marketing'));
      var story = T('h2', 'lk-ah-story', 'Reading the numbers…'); hl.appendChild(story);
      var sub = T('p', null, 'Every number on this page is read live from Supabase and Brevo. Nothing is estimated, and where a source is missing the card says so.'); hl.appendChild(sub); head.appendChild(hl);
      var ctl = T('div', 'lk-mk-ctl'); var sel = T('select', 'lk-ash-search'); sel.setAttribute('aria-label', 'Period');
      [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].forEach(function (o) { var op = T('option', null, o[1]); op.value = String(o[0]); if (o[0] === mkDays) op.selected = true; sel.appendChild(op); });
      ctl.appendChild(sel); var readAt = T('span', 'lk-mk-read', ''); ctl.appendChild(readAt); head.appendChild(ctl);
      v.appendChild(head);
      var body = T('div', 'lk-mk-body'); v.appendChild(body);
      body.appendChild(T('div', 'lk-ash-note', 'Loading the marketing numbers…'));
      if (!SAPI || !SAPI.admin || !SAPI.admin.marketing) { body.innerHTML = ''; body.appendChild(T('div', 'lk-ash-note', 'The marketing tab needs the newer client script.')); return; }

      sel.addEventListener('change', function () { mkDays = Number(sel.value) || 30; load(); });

      var emailCache = null;
      function load() {
        body.innerHTML = ''; body.appendChild(T('div', 'lk-ash-note', 'Loading the marketing numbers…'));
        SAPI.admin.marketing(mkDays).then(function (res) {
          var d = res && res.data;
          body.innerHTML = '';
          if (!d || d.ok !== true) {
            var why = d && d.reason === 'not_admin' ? 'Only the admin can read this.' : (res && res.error ? 'The database side is not installed yet (patch_admin_marketing.sql).' : 'The numbers could not load. Refresh the page to try again.');
            body.appendChild(T('div', 'lk-ash-note', why)); story.textContent = 'The marketing numbers could not load.'; return;
          }
          try { readAt.textContent = 'Read ' + new Date(d.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (e) {}
          paint(d);
          if (emailCache) paintEmail(emailCache); else if (SAPI.admin.marketingEmail) SAPI.admin.marketingEmail().then(function (r) { emailCache = r; paintEmail(r); }); else paintEmail({ data: null, error: 'no_route' });
        }).catch(function () { body.innerHTML = ''; body.appendChild(T('div', 'lk-ash-note', 'The numbers could not load. Refresh the page to try again.')); });
      }

      var emailHost = null;
      function paint(d) {
        var P = d.days, ring = d.ring || {}, tr = d.traffic || {}, ld = d.leads || {}, sh = d.shoppers || {}, ou = d.outreach || {}, cc = d.claim_cards || {}, ct = d.content || {};
        var byCat = {}; (d.categories || []).forEach(function (c) { byCat[c.slug] = c; });
        var rl = d.realtor_lender || {};
        var demand = DEMAND.map(function (x) { var c = byCat[x[0]] || {}; var live = num(c.live_ring); if (x[0] === 'home') live = Math.max(0, live - num(rl.live_ring)); return { key: x[0], name: x[1], live: live, waiting: num(c.waiting), fresh: num(c.new_ring) }; });
        demand.push({ key: 'realtor', name: 'Realtor and lender', live: num(rl.live_ring), waiting: num(rl.waiting), fresh: 0 });
        demand.sort(function (a, b) { return ((a.live >= 3) - (b.live >= 3)) || (a.live - b.live) || a.name.localeCompare(b.name); });
        var gaps = demand.filter(function (c) { return c.live < 3; }), toFill = 0; gaps.forEach(function (g) { toFill += 3 - g.live; });
        var slots = demand.length * 3, filled = 0; demand.forEach(function (c) { filled += Math.min(3, c.live); });

        // ── story ──
        story.innerHTML = '';
        if (gaps.length) {
          story.appendChild(T('em', null, fqWords(toFill) + (toFill === 1 ? ' storefront' : ' storefronts')));
          story.appendChild(document.createTextNode(' between The Woodlands and a real city: ' + gaps.map(function (g) { return g.name.toLowerCase() + ' ' + g.live + ' of 3'; }).join(', ') + '.'));
        } else { story.appendChild(T('em', null, 'Every demand category has three.')); story.appendChild(document.createTextNode(' The Woodlands is a real city. The next milestone is 100 live in the ring.')); }

        // ── row 1: the milestone + this period ──
        var row1 = T('div', 'lk-fq-row lk-mk-grid2');
        var mile = card('lk-mk-mile', 'road', 'The milestone', '');
        mile.h.h.textContent = ''; mile.h.h.appendChild(T('em', null, n(filled))); mile.h.h.appendChild(document.createTextNode(' of ' + slots + ' slots filled. ' + n(ring.live_ring) + ' live in the ring, ' + n(ring.live_total) + ' in all.'));
        var bar = fqT('div', 'lk-fq-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', filled + ' of ' + slots + ' category slots filled');
        var fill = fqT('b'); fill.style.width = Math.round((filled / slots) * 100) + '%'; bar.appendChild(fill); mile.el.appendChild(bar);
        var grid = fqT('div', 'lk-fq-cats lk-mk-cats');
        demand.forEach(function (c) {
          var row = fqT('div', 'lk-fq-cat'); row.appendChild(fqT('span', 'nm', c.name));
          var dots = fqT('span', 'dots'); dots.setAttribute('aria-hidden', 'true');
          for (var k = 0; k < 3; k++) dots.appendChild(fqT('i', k < c.live ? null : 'off'));
          dots.appendChild(fqT('span', 'x', c.live > 3 ? '+' + (c.live - 3) : '')); row.appendChild(dots);
          var chip = fqT('span', 'ch' + (c.live < 3 ? ' need' : ''), c.live >= 3 ? 'Floor met' : 'Need ' + (3 - c.live));
          if (c.live < 3 && c.waiting) chip.title = c.waiting + ' started, not live yet'; row.appendChild(chip);
          if (c.live < 3 && c.waiting) row.appendChild(fqT('span', 'lk-mk-wait', c.waiting + ' started, not live'));
          row.setAttribute('aria-label', c.name + ': ' + c.live + ' live'); grid.appendChild(row);
        });
        mile.el.appendChild(grid);
        var pace = T('p', 'lk-fq-clo');
        pace.appendChild(document.createTextNode(plural(ring.new_ring, 'storefront') + ' went live in the ring in the last ' + P + ' days (' + n(ring.new_ring_prev) + ' the ' + P + ' before). ' + n(ring.created_live) + ' of the ' + plural(ring.created, 'account') + ' created in that window are live; ' + n(ring.unpublished) + ' approved storefronts are still unpublished. '));
        if (gaps.length) pace.appendChild(document.createTextNode('A send to a 0 or a 1 moves the city; a send to an 8 does not. '));
        pace.appendChild(T('span', 'lk-fq-sign', 'Clo')); mile.el.appendChild(pace);
        row1.appendChild(mile.el);

        var per = card('lk-mk-period', 'week', 'This period', 'The last ' + P + ' days, against the ' + P + ' before.');
        var tiles = T('div', 'lk-mk-tiles');
        tiles.appendChild(tile('New live in the ring', n(ring.new_ring), null, delta(ring.new_ring, ring.new_ring_prev), deltaCls(ring.new_ring, ring.new_ring_prev)));
        var reach = num(ld.inquiries) + num(ld.taps), reachPrev = num(ld.inquiries_prev) + num(ld.taps_prev);
        tiles.appendChild(tile('Shopper reach-outs', n(reach), null, n(ld.inquiries) + ' inquiries, ' + n(ld.taps) + ' taps on a contact · ' + plural(ld.vendors_with_lead, 'storefront') + ' got one · ' + delta(reach, reachPrev), deltaCls(reach, reachPrev)));
        var sinceNote = ''; try { if (tr.page_since && new Date(tr.page_since).getTime() > Date.now() - (2 * P * 86400000)) sinceNote = ' · page visits counted since ' + when(tr.page_since); } catch (e) {}
        tiles.appendChild(tile('Visitors', n(tr.visitors), null, 'browsers that keep a cookie, signed-in vendors left out · ' + (sinceNote ? n(tr.visitors_prev) + ' the ' + P + ' days before, but page visits are only counted since ' + when(tr.page_since) + ', so the two do not compare' : delta(tr.visitors, tr.visitors_prev)), sinceNote ? '' : deltaCls(tr.visitors, tr.visitors_prev)));
        tiles.appendChild(tile('Storefront views', n(tr.views), null, delta(tr.views, tr.views_prev), deltaCls(tr.views, tr.views_prev)));
        tiles.appendChild(tile('Edit sign-ups on the site', n(sh.subscribers_period), null, n(sh.subscribers) + ' all time through the site form · ' + delta(sh.subscribers_period, sh.subscribers_prev), deltaCls(sh.subscribers_period, sh.subscribers_prev)));
        tiles.appendChild(tile('Follows', n(sh.follows_period), null, plural(sh.followers, 'person follows', 'people follow') + ' a storefront, all time · ' + delta(sh.follows_period, sh.follows_prev), deltaCls(sh.follows_period, sh.follows_prev)));
        per.el.appendChild(tiles);
        row1.appendChild(per.el);
        body.appendChild(row1);

        // ── row 2: how storefronts arrive + outreach funnel ──
        var row2 = T('div', 'lk-fq-row lk-mk-grid2 rev');
        var arr = card('lk-mk-arrive', 'shop', 'How storefronts arrive', '');
        var arrivals = (d.arrivals || []).slice(); var arrTotal = 0, yours = 0;
        arrivals.forEach(function (a) { arrTotal += num(a.n); if (a.how !== 'own') yours += num(a.n); });
        arr.h.h.textContent = '';
        if (arrTotal) { arr.h.h.appendChild(T('em', null, n(yours) + ' of ' + n(arrTotal))); arr.h.h.appendChild(document.createTextNode(' storefronts that went live in the last ' + P + ' days came through something you did: a note, or a page you built.')); }
        else arr.h.h.textContent = 'No storefront went live in the last ' + P + ' days.';
        if (arrTotal) arr.el.appendChild(bars(arrivals.map(function (a) { return { label: howLabel(a.how), n: a.n }; })));
        var rec = (d.recent || []).slice(0, 6);
        if (rec.length) {
          arr.el.appendChild(T('h4', 'lk-mk-h4', 'The last ' + rec.length + ' to go live'));
          var ul = T('ul', 'lk-mk-recent');
          rec.forEach(function (r) {
            var li = T('li'); var top = T('div', 'top'); top.appendChild(link('https://www.golokali.com/' + r.slug, r.name, 'nm'));
            top.appendChild(T('span', 'wh', when(r.published_at) + (r.ring ? '' : ' · outside the ring'))); li.appendChild(top);
            var meta = T('div', 'meta', (r.categories || []).join(', ') + ' · ' + howLabel(r.how) + (num(r.photos) ? ' · ' + plural(r.photos, 'photo') : ' · no portfolio photos yet'));
            li.appendChild(meta); ul.appendChild(li);
          });
          arr.el.appendChild(ul);
          var noPhotos = rec.filter(function (r) { return !num(r.photos); }).length;
          if (noPhotos) arr.el.appendChild(note(noPhotos + ' of these ' + rec.length + ' have no portfolio photos, so the Reel and the emails cannot feature them yet. A photo ask is the cheapest content move on this page.'));
        }
        row2.appendChild(arr.el);

        var out = card('lk-mk-outreach', 'send', 'Outreach', '');
        out.h.h.textContent = ''; out.h.h.appendChild(T('em', null, n(ou.sent))); out.h.h.appendChild(document.createTextNode(' personal notes sent, ' + n(ou.replied) + ' replied, ' + n(ou.signed_up) + ' signed up, ' + n(ou.live) + ' live.'));
        var chips = T('div', 'lk-mk-chips');
        chips.appendChild(T('span', 'lk-fq-chip' + (num(ou.due_now) ? ' r' : ''), n(ou.due_now) + ' due now'));
        chips.appendChild(T('span', 'lk-fq-chip v', n(ou.waiting) + ' waiting'));
        chips.appendChild(T('span', 'lk-fq-chip', n(ou.sent_period) + ' sent in the last ' + P + ' days'));
        if (num(ou.quiet)) chips.appendChild(T('span', 'lk-fq-chip', n(ou.quiet) + ' went quiet'));
        out.el.appendChild(chips);
        var bc = (ou.by_channel || []);
        if (bc.length) out.el.appendChild(table(['By channel', 'Sent', 'Replied', 'Signed up', 'Live'], bc.map(function (r) { return [CHAN[r.channel] || r.channel, n(r.sent), n(r.replied), n(r.signed_up), n(r.live)]; })));
        var bcat = (ou.by_category || []);
        if (bcat.length) out.el.appendChild(table(['By category', 'Sent', 'Replied', 'Signed up', 'Live'], bcat.map(function (r) { return [r.category, n(r.sent), n(r.replied), n(r.signed_up), n(r.live)]; })));
        var tooFew = bc.filter(function (r) { return num(r.sent) < 15; }).length === bc.length;
        out.el.appendChild(note(tooFew ? 'No channel has 15 sends yet, so none of these rates is a verdict. The table says what happened, not what works.' : 'A channel with 15 or more sends can be judged; the others cannot yet.'));
        var goP = T('button', 'lk-ash-btn', 'Open Prospects'); goP.type = 'button'; goP.addEventListener('click', function () { go('prospects', true); }); out.el.appendChild(goP);
        row2.appendChild(out.el);
        body.appendChild(row2);

        // ── row 3: Instagram · in person · shoppers ──
        var row3 = T('div', 'lk-fq-row lk-mk-grid3');
        var ig = card('lk-mk-ig', 'camera', 'Instagram', '');
        // #242 (2026-11-09): the numbers come from admin_ig_insights(), filled daily by the
        // cron/ig-insights pull. The old pipeline card (Reel drafts) is gone with the pipeline.
        ig.h.h.textContent = 'Reading Instagram…';
        var igBody = T('div'); ig.el.appendChild(igBody);
        function fmtLabel(f) { return { reel: 'Reels', carousel: 'Carousels', image: 'Single images', video: 'Videos' }[f] || f; }
        var SER = { meet_the_vendor: 'Meet the Vendor', new_this_week: 'New neighbors', referral_desk: 'Referral Desk', neighborhood_edit: 'The Neighborhood Edit', six_promises: 'Six promises', benefits: 'Benefits posts', other: 'Other posts' };
        function serLabel(k) { return SER[k] || k; }
        function hourLabel(h) { h = num(h); return (h % 12 || 12) + (h < 12 ? ' am' : ' pm'); }
        var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        function paintIg(res) {
          var g = res && res.data; igBody.innerHTML = '';
          if (!g || g.ok !== true) {
            ig.h.h.textContent = 'Instagram numbers are not installed yet.';
            igBody.appendChild(note(g && g.reason === 'not_admin' ? 'Only the admin can read this.' : 'Apply patch_ig_insights.sql; the daily pull fills the tables from the next morning.'));
            return;
          }
          var acc = g.account || {}, tot = g.totals || {}, st = g.status || {};
          if (!st.last_pull) {
            ig.h.h.textContent = 'Waiting for the first Instagram pull.';
            igBody.appendChild(note('The pull runs every morning at 3 am Central. Followers, reach and saves per post appear here after the first one.'));
            return;
          }
          ig.h.h.textContent = '';
          if (acc.followers != null) {
            ig.h.h.appendChild(T('em', null, plural(acc.followers, 'follower')));
            var d7 = acc.followers_7d_ago != null ? num(acc.followers) - num(acc.followers_7d_ago) : null;
            var d28 = acc.followers_28d_ago != null ? num(acc.followers) - num(acc.followers_28d_ago) : null;
            var tail = d7 != null ? (d7 >= 0 ? ', up ' + n(d7) : ', down ' + n(-d7)) + ' in 7 days' : '';
            if (d28 != null) tail += (d7 != null ? ' and ' : ', ') + (d28 >= 0 ? 'up ' + n(d28) : 'down ' + n(-d28)) + ' in 28';
            ig.h.h.appendChild(document.createTextNode(tail + '.'));
          } else ig.h.h.textContent = 'Instagram, the last ' + P + ' days.';
          var taps = 0, reachDays = 0; (g.daily || []).forEach(function (x) { taps += num(x.link_taps); reachDays += num(x.reach); });
          var igT = T('div', 'lk-mk-tiles two');
          igT.appendChild(tile('Posts', n(tot.posts), 'in ' + P + ' days', num(tot.with_numbers) < num(tot.posts) ? n(tot.with_numbers) + ' with numbers' : (tot.avg_reach != null ? 'reach ' + n(tot.avg_reach) + ' each on average' : '')));
          igT.appendChild(tile('Saves', n(tot.saved), null, tot.avg_saved != null ? n(tot.avg_saved) + ' per post; the number that says a post was useful' : ''));
          igT.appendChild(tile('Reach', n(reachDays || tot.reach), reachDays ? 'account, ' + P + ' days' : 'posts', reachDays ? 'accounts that saw anything from go.lokali' : 'from the posts in the period'));
          igT.appendChild(tile('Taps to the site', n(taps), 'in ' + P + ' days', 'profile link taps', taps ? '' : 'warn'));
          igBody.appendChild(igT);
          var fmts = (g.by_format || []).filter(function (f) { return num(f.n); });
          if (fmts.length) {
            igBody.appendChild(T('p', 'lk-mk-sub', 'Saves per post, by format'));
            igBody.appendChild(bars(fmts.map(function (f) { return { label: fmtLabel(f.format), sub: plural(f.n, 'post') + ' · reach ' + n(f.avg_reach), n: Math.round(num(f.avg_saved) * 10) / 10 }; })));
          }
          var sers = (g.by_series || []).filter(function (f) { return num(f.n); });
          if (sers.length > 1) {
            igBody.appendChild(T('p', 'lk-mk-sub', 'Saves per post, by series'));
            igBody.appendChild(bars(sers.map(function (f) { return { label: serLabel(f.series), sub: plural(f.n, 'post') + ' · reach ' + n(f.avg_reach), n: Math.round(num(f.avg_saved) * 10) / 10 }; })));
          }
          var top = (g.top_saved || []).slice(0, 5);
          if (top.length) {
            igBody.appendChild(T('p', 'lk-mk-sub', 'Most saved'));
            igBody.appendChild(table(['Post', 'Reach', 'Saves', 'Shares'], top.map(function (x) {
              var cell = T('span'); var cap = (x.caption || '').replace(/\s+/g, ' ').trim() || (x.format === 'REELS' ? 'Reel' : 'Post');
              if (x.permalink) cell.appendChild(link(x.permalink, cap.length > 60 ? cap.slice(0, 57) + '…' : cap)); else cell.textContent = cap.length > 60 ? cap.slice(0, 57) + '…' : cap;
              cell.appendChild(T('small', null, ' ' + when(x.posted_at) + ' · ' + (x.format === 'REELS' ? 'Reel' : x.type === 'CAROUSEL_ALBUM' ? 'carousel' : 'image') + (x.series && x.series !== 'other' ? ' · ' + serLabel(x.series) : '')));
              return [cell, n(x.reach), n(x.saved), n(x.shares)];
            })));
          }
          var hrs = (g.by_hour || []).filter(function (h) { return num(h.n) >= 2; }).sort(function (a, b) { return num(b.avg_saved) - num(a.avg_saved); }).slice(0, 2);
          var onl = (g.online || []).slice().sort(function (a, b) { return num(b.followers) - num(a.followers); }).slice(0, 3);
          var lines = [];
          if (hrs.length) lines.push('Your posts earned the most saves when posted around ' + hrs.map(function (h) { return hourLabel(h.hour); }).join(' and ') + ' (two or more posts each).');
          if (onl.length) lines.push('Followers were online most on ' + onl.map(function (o) { return WD[num(o.weekday)] + ' ' + hourLabel(o.hour); }).join(', ') + ' over the last week.');
          lines.push('Instagram does not say which post brought a sign-up. Read ' + when(st.last_pull) + (st.media_refused ? '; ' + plural(st.media_refused, 'older post') + ' refused numbers' : '') + '.');
          igBody.appendChild(note(lines.join(' ')));
        }
        if (SAPI.admin.igInsights) SAPI.admin.igInsights(P).then(paintIg).catch(function () { paintIg(null); }); else paintIg(null);
        row3.appendChild(ig.el);

        var ip = card('lk-mk-inperson', 'pin', 'In person', '');
        var ev = (d.events || []);
        ip.h.h.textContent = '';
        if (ev.length) { ip.h.h.appendChild(T('em', null, n(ev[0].yes) + ' said yes')); ip.h.h.appendChild(document.createTextNode(' to the ' + eventLabel(ev[0].event).replace('Vendor Circle, ', 'Vendor Circle on ') + '; ' + n(ev[0].yes_not_live) + ' of them had no live storefront.')); }
        else ip.h.h.textContent = 'No event RSVPs recorded yet.';
        var ipT = T('div', 'lk-mk-tiles two');
        ipT.appendChild(tile('Pages you started', n(cc.period), 'in ' + P + ' days', n(cc.period_live) + ' of them live · ' + n(cc.total) + ' all time, ' + n(cc.signed_in) + ' owners signed in, ' + n(cc.live) + ' live'));
        var qrP = 0, qrA = 0; (d.qr || []).forEach(function (q) { qrP += num(q.period); qrA += num(q.all); });
        ipT.appendChild(tile('QR scans', n(qrP), 'in ' + P + ' days', n(qrA) + ' all time'));
        ip.el.appendChild(ipT);
        var qr = (d.qr || []).filter(function (q) { return num(q.all); });
        if (qr.length) ip.el.appendChild(table(['QR code', 'Period', 'All', 'Last'], qr.map(function (q) { return [QRC[q.campaign + '/' + q.medium] || (q.campaign + (q.medium ? ' (' + q.medium + ')' : '')), n(q.period), n(q.all), when(q.last_at)]; })));
        var qv = (d.qr_vendors || []);
        if (qv.length) ip.el.appendChild(note('Scanned to: ' + qv.map(function (x) { return x.name + ' (' + n(x.n) + ')'; }).join(', ') + '.'));
        if (ev.length > 1) ip.el.appendChild(table(['Event', 'Yes', 'No', 'Yes, live'], ev.map(function (e) { return [eventLabel(e.event), n(e.yes), n(e.no), n(e.yes_live)]; })));
        ip.el.appendChild(note('Markets, the chamber and the Circle itself are not tracked by any table; what you log in Prospects under "Met where" is the only record. ' + ((ou.by_met || []).length ? 'So far: ' + (ou.by_met || []).slice(0, 4).map(function (m) { return m.met_where + ' (' + n(m.rows) + (num(m.signed_up) ? ', ' + n(m.signed_up) + ' signed up' : '') + ')'; }).join(', ') + '.' : '')));
        row3.appendChild(ip.el);

        var sp = card('lk-mk-shoppers', 'shop', 'Shoppers', '');
        sp.h.h.textContent = ''; sp.h.h.appendChild(T('em', null, n(sh.subscribers))); sp.h.h.appendChild(document.createTextNode(' signed up for the Edit through the site. ' + plural(sh.followers, 'person follows', 'people follow') + ' a storefront.'));
        var spT = T('div', 'lk-mk-tiles two teal');
        spT.appendChild(tile('Vendor posts (dates)', n(sh.vendor_posts), null, num(sh.vendor_posts) ? plural(sh.vendors_posting, 'storefront') + ' posting · ' + n(sh.vendor_posts_period) + ' in ' + P + ' days' : 'nobody has posted a date yet', num(sh.vendor_posts) ? '' : 'warn'));
        spT.appendChild(tile('Shopper accounts', n(sh.shopper_accounts), null, n(sh.shopper_accounts_period) + ' new in ' + P + ' days · ' + n(sh.waitlist) + ' on the city waitlist'));
        spT.appendChild(tile('Reviews', n(sh.reviews), null, n(sh.reviews_invited) + ' from the review link · ' + n(sh.reviews_period) + ' in ' + P + ' days'));
        spT.appendChild(tile('Shares', n(sh.shares_period), 'in ' + P + ' days', n(sh.share_landings_period) + ' landed, ' + n(sh.share_conversions_period) + ' did something after · ' + delta(sh.shares_period, sh.shares_prev)));
        sp.el.appendChild(spT);
        emailHost = T('div', 'lk-mk-emailhost'); emailHost.appendChild(note('Reading Brevo…')); sp.el.appendChild(emailHost);
        row3.appendChild(sp.el);
        body.appendChild(row3);

        // ── row 4: email campaigns (filled by paintEmail) + where visits come from ──
        var row4 = T('div', 'lk-fq-row lk-mk-grid2');
        var em = card('lk-mk-email', 'mail', 'Email', 'Reading Brevo…'); em.el.setAttribute('data-mk', 'email'); row4.appendChild(em.el);
        var tv = card('lk-mk-traffic', 'road', 'Where visits come from', '');
        tv.h.h.textContent = ''; tv.h.h.appendChild(T('em', null, n(tr.visitors))); tv.h.h.appendChild(document.createTextNode(' visitors in ' + P + ' days' + (sinceNote ? sinceNote.replace(' · ', ', ') : '') + '.'));
        var refs = (tr.by_ref || []).filter(function (r) { return num(r.visitors) || num(r.visitors_prev); });
        if (refs.length) { tv.el.appendChild(T('h4', 'lk-mk-h4', 'By referrer, visitors (the period before after the slash)')); tv.el.appendChild(bars(refs.map(function (r) { return { label: REF[r.ref] || r.ref, n: r.visitors, prev: r.visitors_prev }; }))); }
        var pages = (tr.by_page || []).slice(0, 7);
        if (pages.length) { tv.el.appendChild(T('h4', 'lk-mk-h4', 'Pages opened')); tv.el.appendChild(bars(pages.map(function (p) { return { label: PAGE[p.source] || p.source, n: p.n }; }))); }
        tv.el.appendChild(note('Instagram, Facebook and Google all land in "from another website": the browser does not say which, and no tracking link separates them yet. The Phase 2 attribution build (a per-vendor link) is what would.'));
        row4.appendChild(tv.el);
        body.appendChild(row4);

        // ── row 5: twelve weeks ──
        var wk = (d.weeks || []);
        if (wk.length) {
          var w = card('lk-mk-weeks', 'rhythm', 'Twelve weeks', 'Four lines that should all go up and to the right.');
          var cols = T('div', 'lk-mk-cols');
          [['live_ring', 'Went live in the ring'], ['created', 'Accounts created'], ['subscribers', 'Edit sign-ups'], ['posts', 'Reels posted']].forEach(function (s) {
            var box = T('div', 'lk-mk-col'); var max = 0, tot = 0; wk.forEach(function (x) { max = Math.max(max, num(x[s[0]])); tot += num(x[s[0]]); });
            box.appendChild(T('span', 'l', s[1])); box.appendChild(T('span', 'n', n(tot)));
            var ch = T('div', 'ch'); ch.setAttribute('role', 'img'); ch.setAttribute('aria-label', s[1] + ' by week: ' + wk.map(function (x) { return num(x[s[0]]); }).join(', '));
            wk.forEach(function (x, i) { var b = T('i'); b.style.height = (max ? Math.max(4, Math.round((num(x[s[0]]) / max) * 100)) : 4) + '%'; b.title = 'Week of ' + when(x.week) + ': ' + n(x[s[0]]); if (i === wk.length - 1) b.className = 'now'; ch.appendChild(b); });
            box.appendChild(ch); box.appendChild(T('span', 'd', when(wk[0].week) + ' to this week'));
            cols.appendChild(box);
          });
          w.el.appendChild(cols); body.appendChild(w.el);
        }

        body.appendChild(T('p', 'lk-mk-foot', 'Definitions: live = approved, active and published. The ring = storefronts that serve The Woodlands. Three in a category is a choice (TODO #233). Realtor and lender has no category of its own and is counted from its two subcategories. Your own storefront is left out of the category floor. Sources: admin_marketing() in Supabase, Brevo campaign statistics.'));
      }

      function paintEmail(r) {
        var el = body.querySelector('[data-mk="email"]'); if (!el) return;
        var hd = el.querySelector('h2'); var old = el.querySelectorAll('.lk-mk-table, .lk-mk-note, .lk-mk-tiles'); old.forEach(function (x) { x.remove(); });
        var d = r && r.data;
        if (!d || d.ok !== true) {
          var why = r && r.error === 'no_route' ? 'The email read needs the newer client script.' : d && d.reason === 'no_key' ? 'Brevo is not connected on the server (BREVO_API_KEY).' : r && r.error === 'not_admin' ? 'Only the admin can read this.' : 'Brevo could not be read right now' + (r && r.error ? ' (' + r.error + ')' : '') + '. The list and campaign numbers are in Brevo itself.';
          if (hd) hd.textContent = 'Brevo not read.'; el.appendChild(note(why));
          if (emailHost) { emailHost.innerHTML = ''; emailHost.appendChild(note('The Brevo list total is not available right now.')); }
          return;
        }
        var L = d.lists || {}, cs = (d.campaigns || []);
        if (hd) { hd.textContent = ''; hd.appendChild(T('em', null, n(L.vendors ? L.vendors.total : 0))); hd.appendChild(document.createTextNode(' on the Circle list, ' + n(L.shoppers ? L.shoppers.total : 0) + ' on the Edit list.')); }
        var t = T('div', 'lk-mk-tiles two');
        var vend = cs.filter(function (c) { return c.audience === 'vendors' && c.delivered; }), best = null; vend.forEach(function (c) { if (!best || c.open_rate > best.open_rate) best = c; });
        var avg = 0; if (vend.length) { var s = 0; vend.forEach(function (c) { s += num(c.open_rate); }); avg = Math.round(s / vend.length); }
        t.appendChild(tile('Vendor email opens', vend.length ? avg + '%' : 'none sent', null, vend.length ? 'average unique opens across the last ' + plural(vend.length, 'vendor campaign') : ''));
        var shop = cs.filter(function (c) { return c.audience === 'shoppers'; });
        t.appendChild(tile('Shopper campaigns sent', n(shop.length), null, shop.length ? 'last: ' + when(shop[0].sent_at) : 'The Neighborhood Edit has not gone out yet', shop.length ? '' : 'warn'));
        el.appendChild(t);
        if (cs.length) {
          el.appendChild(table(['Campaign', 'Sent', 'To', 'Delivered', 'Opened', 'Clicks'], cs.slice(0, 8).map(function (c) {
            var nm = T('span', null, String(c.name || c.subject || '').slice(0, 44)); nm.title = c.subject || '';
            var op = T('span', null, n(c.opened) + (c.open_rate != null ? ' (' + c.open_rate + '%)' : ''));
            var ck = T('span', c.clicks_suspect ? 'sus' : null, n(c.clicks) + (c.clicks_suspect ? ' *' : '')); if (c.clicks_suspect) ck.title = 'More clicks than recipients: automated link checks. Ignore.';
            return [nm, when(c.sent_at), c.audience === 'vendors' ? 'Vendors' : c.audience === 'shoppers' ? 'Shoppers' : 'Other', n(c.delivered), op, ck];
          })));
          if (cs.some(function (c) { return c.clicks_suspect; })) el.appendChild(note('* More clicks than recipients means a mail scanner opened the links; Brevo counts those. Opens are the number to read.'));
        } else el.appendChild(note('No sent campaigns came back from Brevo.'));
        if (emailHost) {
          emailHost.innerHTML = '';
          var ls = L.shoppers;
          if (ls) emailHost.appendChild(note(n(ls.total) + ' on the Brevo Edit list in all. Most of those are vendor accounts; the site-form count above is the shopper number.'));
        }
      }

      load();
    }

    function go(view, push) {
      if (!views[view]) view = 'today';
      VIEWS.forEach(function (vw) {
        views[vw[0]].hidden = vw[0] !== view;
        if (vw[0] === view) { navBtns[vw[0]].setAttribute('aria-current', 'page'); barTitle.textContent = vw[1]; } else navBtns[vw[0]].removeAttribute('aria-current');
      });
      if (view === 'vendors') buildVendors();
      if (view === 'insights') buildInsights();
      if (view === 'prospects') buildProspects();
      if (view === 'marketing') buildMarketing();
      drawer(false);
      if (push) { try { history.replaceState(null, '', view === 'today' ? location.pathname + location.search : '#' + view); } catch (e) {} try { window.scrollTo(0, 0); } catch (e2) {} }
    }
    go((location.hash || '').replace('#', '') || 'today', false);
  }

  // Fetch lokali-admin-insights.js from the same pinned release as this file
  // (same sibling-URL idiom as lokali-vendor-detail.js → lokali-inquiry.js).
  function loadAdminInsights(done) {
    if (window.LokaliAdminInsights) { done(true); return; }
    var scripts = document.getElementsByTagName('script'), mine = null;
    for (var i = 0; i < scripts.length; i++) { if (/lokali-account\.js/.test(scripts[i].src || '')) { mine = scripts[i]; break; } }
    if (!mine) { done(false); return; }
    var s = document.createElement('script');
    s.src = mine.src.replace(/lokali-account\.js.*$/, 'lokali-admin-insights.js');
    s.onload = function () { done(!!window.LokaliAdminInsights); };
    s.onerror = function () { done(false); };
    document.body.appendChild(s);
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
      ".lk-admin-row,.lk-admin-row-done{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 0;border-top:.5px solid #EEEDF6;}" +
      ".lk-admin-row-meta{flex:1;min-width:170px;}" +
      ".lk-admin-row-l1{font-size:13.5px;font-weight:600;color:#1A1829;}" +
      ".lk-admin-row-l1 span{color:#8E8BA6;}" +
      ".lk-admin-row-l2{font-size:11.5px;color:#8E8BA6;}" +
      ".lk-admin-input{font-family:inherit;font-size:13px;padding:7px 10px;border:1px solid #C9BDE8;border-radius:8px;color:#1A1829;width:170px;}" +
      ".lk-admin-approve{font-family:inherit;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:8px;border:1px solid #A8DFC4;background:#EDFAF3;color:#1A6640;cursor:pointer;}" +
      ".lk-admin-decline{font-family:inherit;font-size:12.5px;padding:7px 14px;border-radius:8px;border:1px solid #E4E2F0;background:#F7F6FC;color:#6B6880;cursor:pointer;}" +
      ".lk-admin-empty{font-size:12.5px;color:#8E8BA6;padding:8px 0 2px;border-top:.5px solid #EEEDF6;}" +
      /* #175 admin regroup (F 2026-09-13: "everything looks the same"): three zones, a
         sticky pill nav, color-by-kind edges, empty queues collapse to one line. */
      ".lk-admin-nav{position:sticky;z-index:20;display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#fff;border:1px solid #EEEDF6;border-radius:12px;padding:6px;margin:0 0 16px;}" +
      ".lk-admin-nav a{font-size:13px;font-weight:600;color:#6B6880;text-decoration:none;padding:7px 12px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;}" +
      ".lk-admin-nav a:hover{background:#F7F6FC;color:#1A1829;}" +
      ".lk-admin-nav a.lk-nav-attn{background:#FFF6E5;color:#6B4A00;}" +
      ".lk-admin-nav a.lk-nav-attn .lk-admin-navcount{background:#EF9F27;color:#412402;}" +
      ".lk-admin-nav a.lk-nav-clear{background:#EAFAF2;color:#1A6640;}" +
      ".lk-admin-navcount{font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;background:#E4E2F0;color:#4A4761;}" +
      ".lk-zone{margin:0 0 22px;scroll-margin-top:110px;}" +
      ".lk-zone-head{display:flex;align-items:center;gap:8px;margin:0 0 10px;}" +
      ".lk-zone-head svg{width:18px;height:18px;flex:0 0 auto;}" +
      ".lk-zone-title{font-size:15px;font-weight:700;color:#1A1829;}" +
      ".lk-zone-sub{font-size:12px;color:#8E8BA6;}" +
      ".lk-zone-attn .lk-admin-section{border-left:3px solid #EF9F27;border-radius:0 12px 12px 0;}" +
      ".lk-zone-tools .lk-admin-section{border-left:3px solid #7F77DD;border-radius:0 12px 12px 0;}" +
      ".lk-zone-insights .lk-admin-section{border-left:3px solid #5DCAA5;border-radius:0 12px 12px 0;}" +
      ".lk-zone-attn .lk-admin-qcount{background:#FAEEDA;color:#633806;}" +
      ".lk-admin-section.lk-collapsed{display:none;}" +
      ".lk-admin-allclear{display:none;font-size:13px;color:#4A4761;background:#FBFAFE;border:1px solid #EEEDF6;border-radius:12px;padding:10px 14px;margin-top:10px;line-height:1.5;}" +
      ".lk-admin-allclear.lk-on{display:block;}" +
      ".lk-admin-allclear svg{width:14px;height:14px;vertical-align:-2px;margin-right:6px;}" +
      ".lk-admin-allclear span{color:#8E8BA6;}";
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
    window.__lokAttn = { suggestions: a.queue.length, reports: (Number(ov.open_vendor_reports) || 0) + (Number(ov.open_review_reports) || 0), creatives: null, addresses: null, pairings: null, blocks: null };
    function paintAttn() {
      var c = window.__lokAttn; var parts = [];
      if (c.reports) parts.push(c.reports + (c.reports === 1 ? ' report' : ' reports'));
      if (c.suggestions) parts.push(c.suggestions + (c.suggestions === 1 ? ' tag suggestion' : ' tag suggestions'));
      if (c.creatives) parts.push(c.creatives + (c.creatives === 1 ? ' ad creative' : ' ad creatives'));
      if (c.addresses) parts.push(c.addresses + (c.addresses === 1 ? ' address flag' : ' address flags'));
      if (c.pairings) parts.push(c.pairings + (c.pairings === 1 ? ' pairing message' : ' pairing messages'));
      if (c.blocks) parts.push(c.blocks + (c.blocks === 1 ? ' blocked sender' : ' blocked senders'));
      attn.innerHTML = '';
      var total = (c.reports || 0) + (c.suggestions || 0) + (c.creatives || 0) + (c.addresses || 0) + (c.pairings || 0) + (c.blocks || 0);
      if (typeof navCount !== 'undefined') { navCount.textContent = String(total); navAttn.className = total ? 'lk-nav-attn' : 'lk-nav-clear'; }
      if (!parts.length) { attn.style.background = '#EAFAF2'; attn.style.borderColor = '#BFE9D2'; attn.style.color = '#1A6640'; attn.innerHTML = LK_FA.check + ' Nothing needs your approval right now.'; return; }
      attn.style.background = '#FFF6E5'; attn.style.borderColor = '#FFE2A8'; attn.style.color = '#6B4A00';
      var s = document.createElement('strong'); s.textContent = 'Needs your attention: '; attn.appendChild(s);
      attn.appendChild(document.createTextNode(parts.join(' · ') + '. Details below. You also get an email within 5 minutes of anything new.'));
    }
    window.__lokPaintAttn = paintAttn;
    paintAttn();

    // #175: three zones instead of one flat grid. Each zone owns its own
    // responsive grid (quiet cards side by side, queue-bearing cards full width).
    //   Needs attention = the queues you approve or answer (amber edge)
    //   Vendor tools    = actions on an account (violet edge)
    //   Insights        = read-only numbers and lists (teal edge)
    // The sticky pill nav jumps between them and carries the attention count.
    var ICO = {
      inbox: '<svg viewBox="0 0 512 512" fill="#854F0B" aria-hidden="true"><path d="M121 32C91.6 32 66 52 58.9 80.5L1.9 308.4C.6 313.5 0 318.7 0 323.9V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V323.9c0-5.2-.6-10.4-1.9-15.5l-57-227.9C446 52 420.4 32 391 32H121zm0 64H391l48 192H387.8c-12.1 0-23.2 6.8-28.6 17.7l-14.3 28.6c-5.4 10.8-16.5 17.7-28.6 17.7H195.8c-12.1 0-23.2-6.8-28.6-17.7l-14.3-28.6c-5.4-10.8-16.5-17.7-28.6-17.7H73l48-192z"/></svg>',
      tool:  '<svg viewBox="0 0 512 512" fill="#534AB7" aria-hidden="true"><path d="M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7H336c-8.8 0-16-7.2-16-16V118.6c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>',
      chart: '<svg viewBox="0 0 512 512" fill="#0F6E56" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32V400c0 8.8 7.2 16 16 16H480c17.7 0 32 14.3 32 32s-14.3 32-32 32H80c-44.2 0-80-35.8-80-80V64C0 46.3 14.3 32 32 32zm96 96c0-17.7 14.3-32 32-32s32 14.3 32 32V320c0 17.7-14.3 32-32 32s-32-14.3-32-32V128zm128 64c17.7 0 32 14.3 32 32V320c0 17.7-14.3 32-32 32s-32-14.3-32-32V224c0-17.7 14.3-32 32-32zm96-96c17.7 0 32 14.3 32 32V320c0 17.7-14.3 32-32 32s-32-14.3-32-32V128c0-17.7 14.3-32 32-32z"/></svg>',
      check: '<svg viewBox="0 0 448 512" fill="#1A6640" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>'
    };
    var nav = el('div', 'lk-admin-nav');
    var navAttn = document.createElement('a'); navAttn.href = '#lk-zone-attn'; navAttn.textContent = 'Needs attention ';
    var navCount = el('span', 'lk-admin-navcount', '0'); navAttn.appendChild(navCount);
    var navTools = document.createElement('a'); navTools.href = '#lk-zone-tools'; navTools.textContent = 'Vendor tools';
    var navIns = document.createElement('a'); navIns.href = '#lk-zone-insights'; navIns.textContent = 'Insights';
    nav.appendChild(navAttn); nav.appendChild(navTools); nav.appendChild(navIns);
    // Sit just under the site header, which lokali-sticky-nav.js fixes to the
    // top on desktop (>=992px) once you scroll; on phones it scrolls away.
    var siteHead = document.querySelector('.header-wrapper.w-nav');
    var deskHead = window.matchMedia && window.matchMedia('(min-width: 992px)').matches && siteHead ? siteHead.offsetHeight : 0;
    nav.style.top = (deskHead + 8) + 'px';
    wrap.appendChild(nav);
    [navAttn, navTools, navIns].forEach(function (a) {
      a.addEventListener('click', function (ev) {
        var t = document.getElementById(a.getAttribute('href').slice(1));
        if (t) { ev.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    });

    function zone(id, cls, ico, title, sub) {
      var z = el('div', 'lk-zone ' + cls); z.id = id;
      var h = el('div', 'lk-zone-head');
      h.innerHTML = ICO[ico];
      h.appendChild(el('div', 'lk-zone-title', title));
      h.appendChild(el('div', 'lk-zone-sub', sub));
      z.appendChild(h);
      var g = el('div', 'lk-admin-grid'); z.appendChild(g);
      return { root: z, grid: g };
    }
    var zAttn = zone('lk-zone-attn', 'lk-zone-attn', 'inbox', 'Needs attention', 'queues you approve or answer');
    var zTools = zone('lk-zone-tools', 'lk-zone-tools', 'tool', 'Vendor tools', 'things you do to an account');
    var zIns = zone('lk-zone-insights', 'lk-zone-insights', 'chart', 'Insights', 'read-only, nothing to do here');
    wrap.appendChild(zAttn.root); wrap.appendChild(zTools.root); wrap.appendChild(zIns.root);
    var allClear = el('div', 'lk-admin-allclear'); zAttn.root.appendChild(allClear);
    // Stat tiles move into Insights, plus a founding tile (filled async).
    zIns.root.insertBefore(stats, zIns.grid);
    var fTile = el('div', 'lk-admin-stat'); var fNum = el('div', 'lk-admin-stat-num', '\u2014');
    fTile.appendChild(fNum); fTile.appendChild(el('div', 'lk-admin-stat-lbl', 'Founding vendors')); stats.appendChild(fTile);
    try {
      window.LokaliSupabaseAPI.founding.status(null).then(function (r) {
        var d = r && r.data; if (!d) return;
        var claimed = d.claimed != null ? d.claimed : (d.cap != null && d.remaining != null ? d.cap - d.remaining : null);
        var cap = d.cap != null ? d.cap : 50;
        if (claimed != null) { fNum.textContent = ''; fNum.appendChild(document.createTextNode(String(claimed))); var sm = document.createElement('span'); sm.style.cssText = 'font-size:12px;color:#8E8BA6;font-weight:500;'; sm.textContent = ' / ' + cap; fNum.appendChild(sm); }
      }).catch(function () {});
    } catch (e) {}

    // Empty queues collapse to one "All clear" line so the zone is dominated
    // by what needs doing. Sections load async, so watch the zone: a section
    // with an empty-state and no rows collapses; it comes back if rows land.
    function sectionTitle(sec) {
      var t = sec.querySelector('.lk-admin-qtitle'); if (!t) return '';
      var out = ''; t.childNodes.forEach(function (n) { if (n.nodeType === 3) out += n.textContent; });
      return out.trim();
    }
    function collapseEmpties() {
      var names = [];
      zAttn.grid.querySelectorAll('.lk-admin-section').forEach(function (sec) {
        var empty = sec.querySelector('.lk-admin-empty');
        var loading = empty && /loading/i.test(empty.textContent || '');
        var quiet = !!empty && !loading && !sec.querySelector('.lk-admin-row') && !sec.querySelector('form');
        sec.classList.toggle('lk-collapsed', quiet);
        if (quiet) names.push(sectionTitle(sec) || 'a queue');
      });
      allClear.innerHTML = '';
      if (names.length) {
        allClear.innerHTML = ICO.check;
        allClear.appendChild(document.createTextNode('All clear: ' + names.join(', ') + ' '));
        var hint = document.createElement('span'); hint.textContent = '(these open by themselves when something arrives)'; allClear.appendChild(hint);
      }
      allClear.classList.toggle('lk-on', names.length > 0);
    }
    try { new MutationObserver(function () { collapseEmpties(); }).observe(zAttn.grid, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    setTimeout(collapseEmpties, 0);

    var grid = zAttn.grid;
    paintAttn();   // now that the pill exists, stamp the count on it

    appendTagSuggestionsSection(grid, a, function (left) { if (_pendingStatNum) _pendingStatNum.textContent = String(left); });

    appendReportsSection(zAttn.grid, ov);
    appendAddressFlagsSection(zAttn.grid);   // #147
    appendBlockedSendersSection(zAttn.grid);  // #201
    appendSpotlightCreativesSection(zAttn.grid);
    appendPairingFeedbackSection(zAttn.grid); // #166 neighbor-referral flags + suggestions
    appendSpotlightSection(zAttn.grid, ov);
    appendInviteVendorSection(zTools.grid);   // #168
    appendSignInAsSection(zTools.grid);       // #171
    appendAcquisitionSection(zIns.grid);  // #156
    appendQrScansSection(zIns.grid);
    appendExitSurveySection(zIns.grid, ov);
    return wrap;
  }

  // Tag suggestions queue. Moved out of renderAdminPanel unchanged (#181) so the
  // admin home's Today view can host the very same section. onLeft(n) reports
  // how many are still waiting after each decision.
  function appendTagSuggestionsSection(grid, a, onLeft) {
    var sugSec = el('div', 'lk-admin-section' + (a.queue.length ? ' lk-admin-section-wide' : ''));
    var qt = el('div', 'lk-admin-qtitle');
    qt.appendChild(document.createTextNode('Tag suggestions'));
    var qc = el('span', 'lk-admin-qcount', String(a.queue.length));
    qt.appendChild(qc);
    sugSec.appendChild(qt);
    sugSec.appendChild(el('p', 'lk-admin-sub', 'Approve with the wording customers should see. It goes live for everyone instantly; the vendor then tags the matching service or product with it.'));

    if (!a.queue.length) {
      sugSec.appendChild(el('div', 'lk-admin-empty', 'No suggestions waiting. New ones from vendors land here.'));
    }

    a.queue.forEach(function (item) {
      var row = el('div', 'lk-admin-row');
      var meta = el('div', 'lk-admin-row-meta');
      var l1 = el('div', 'lk-admin-row-l1');
      l1.textContent = '“' + item.label + '”';
      var l1cat = document.createElement('span');
      l1cat.textContent = ' · ' + (item.category_name || '');
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
          l2.textContent = '3–40 characters: letters, numbers and simple punctuation.';
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
            if (onLeft) onLeft(left);
            // Reviewed rows leave the queue after the result has been read —
            // they don't linger dimmed for the rest of the session.
            setTimeout(function () {
              row.style.transition = 'opacity .4s';
              row.style.opacity = '0';
              setTimeout(function () {
                if (row.parentNode) row.parentNode.removeChild(row);
                if (left === 0) sugSec.appendChild(el('div', 'lk-admin-empty', 'All caught up. New suggestions from vendors land here.'));
              }, 420);
            }, 1800);
          } else {
            ok.disabled = false; no.disabled = false;
            l2.textContent = 'Couldn’t save. Try again.';
            l2.style.color = '#B3400F';
          }
        }).catch(function () {
          ok.disabled = false; no.disabled = false;
          l2.textContent = 'Couldn’t save. Try again.';
          l2.style.color = '#B3400F';
        });
      };
      ok.addEventListener('click', function () { act(true); });
      no.addEventListener('click', function () { act(false); });
      row.appendChild(meta); row.appendChild(input); row.appendChild(ok); row.appendChild(no);
      sugSec.appendChild(row);
    });
    grid.appendChild(sugSec);
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

  // ── #195: gathering RSVPs (patch_event_rsvps.sql, /rsvp page) ─────────────
  // Not a queue: nothing here "needs" F, so rows use the -done class and do not
  // count in the strip. Yes list first, with the storefront answer, so the
  // seating chart can be drafted straight from it. "Copy list" = one line per
  // RSVP for a spreadsheet or the chart.
  var RSVP_EVENT = 'nov5-2026';
  function appendRsvpSection(wrap) {
    var API = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.vendors;
    if (!API || !API.adminEventRsvps) return;
    var host = el('div', 'lk-admin-section lk-admin-section-info');
    wrap.appendChild(host);
    var SF = { live: 'storefront live', not_yet: 'setting up a storefront', none: 'no storefront yet' };
    function draw(d) {
      host.innerHTML = '';
      var rows = (d && d.rows) || [];
      host.className = 'lk-admin-section lk-admin-section-info' + (rows.length ? ' lk-admin-section-wide' : '');
      var t = el('div', 'lk-admin-qtitle');
      t.appendChild(document.createTextNode('Gathering RSVPs, November 5'));
      t.appendChild(el('span', 'lk-admin-qcount', String(d ? d.yes : 0)));
      host.appendChild(t);
      host.appendChild(el('p', 'lk-admin-sub', (d ? d.yes : 0) + ' coming, ' + (d ? d.no : 0) + ' can’t make it. From golokali.com/rsvp; a second submit from the same email updates the first.'));
      if (!rows.length) { host.appendChild(el('div', 'lk-admin-empty', 'No RSVPs yet. They land here the moment the invite goes out.')); return; }
      var copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'lk-admin-decline'; copy.textContent = 'Copy list';
      copy.addEventListener('click', function () {
        var txt = rows.map(function (r) { return [r.attending ? 'YES' : 'no', r.name, r.business || r.vendor_name || '', r.email, SF[r.storefront] || r.storefront, r.slug ? 'golokali.com/' + r.slug : ''].join('\t'); }).join('\n');
        var okc = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy list'; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(okc, function () {});
      });
      host.appendChild(copy);
      rows.forEach(function (r) {
        var row = el('div', 'lk-admin-row-done');
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1');
        l1.textContent = (r.attending ? 'Yes · ' : 'No · ') + (r.name || '') + (r.business ? ' · ' + r.business : (r.vendor_name ? ' · ' + r.vendor_name : ''));
        var l2 = el('div', 'lk-admin-row-l2');
        var when = ''; try { when = new Date(r.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) {}
        l2.textContent = (SF[r.storefront] || r.storefront || '') + (r.slug ? ' · golokali.com/' + r.slug : ' · not matched to a storefront') + ' · ' + (r.email || '') + (when ? ' · ' + when : '');
        meta.appendChild(l1); meta.appendChild(l2); row.appendChild(meta); host.appendChild(row);
      });
    }
    host.appendChild(el('div', 'lk-admin-empty', 'Loading RSVPs…'));
    API.adminEventRsvps(RSVP_EVENT).then(function (res) {
      var d = res && res.data;
      if (!d || d.ok === false) { host.innerHTML = ''; host.appendChild(el('div', 'lk-admin-empty', 'RSVPs could not be loaded.')); return; }
      draw(d);
      if (window.__lokPaintAttn) window.__lokPaintAttn();
    }).catch(function () { host.innerHTML = ''; host.appendChild(el('div', 'lk-admin-empty', 'RSVPs could not be loaded.')); if (window.__lokPaintAttn) window.__lokPaintAttn(); });
  }
  // ── Content Day interest (patch_content_day_interest.sql, /rsvp?e=content-day-2027) ──
  // Same table and reader as the RSVPs; the per-person answers live in the jsonb
  // `answers` column (interest / timing / sponsor / note). Informational, like the
  // RSVP list: nothing here needs F, so it never counts in the strip. The counts
  // at the top are what she prices the day from.
  var INTEREST_EVENT = 'content-day-2027';
  function appendInterestSection(wrap) {
    var API = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.vendors;
    if (!API || !API.adminEventRsvps) return;
    var host = el('div', 'lk-admin-section lk-admin-section-info');
    wrap.appendChild(host);
    var IL = { photos: 'Photos', video: 'Video', both: 'Both', not_this_time: 'Not this time' };
    var TL = { weekday: 'Weekday', saturday: 'Saturday', either: 'Either' };
    var SL = { yes: 'Yes', maybe: 'Maybe', no: 'No' };
    function draw(d) {
      host.innerHTML = '';
      var rows = ((d && d.rows) || []).filter(function (r) { return r.answers; });
      host.className = 'lk-admin-section lk-admin-section-info' + (rows.length ? ' lk-admin-section-wide' : '');
      var n = function (k) { return rows.filter(function (r) { return r.answers.interest === k; }).length; };
      var interested = rows.length - n('not_this_time');
      var sponsors = rows.filter(function (r) { return r.answers.sponsor === 'yes'; }).length;
      var sat = rows.filter(function (r) { return r.answers.timing === 'saturday'; }).length;
      var wk = rows.filter(function (r) { return r.answers.timing === 'weekday'; }).length;
      var t = el('div', 'lk-admin-qtitle');
      t.appendChild(document.createTextNode('Content Day, February 2027'));
      t.appendChild(el('span', 'lk-admin-qcount', String(interested)));
      host.appendChild(t);
      host.appendChild(el('p', 'lk-admin-sub', interested + ' interested: ' + n('both') + ' both, ' + n('photos') + ' photos only, ' + n('video') + ' video only. ' + n('not_this_time') + ' not this time. ' + wk + ' prefer a weekday, ' + sat + ' a Saturday. ' + sponsors + ' would sponsor. From golokali.com/rsvp?e=content-day-2027.'));
      if (!rows.length) { host.appendChild(el('div', 'lk-admin-empty', 'No answers yet. They land here as vendors fill in the Content Day form.')); return; }
      var copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'lk-admin-decline'; copy.textContent = 'Copy list';
      copy.addEventListener('click', function () {
        var txt = rows.map(function (r) { var a = r.answers; return [r.name, r.business || r.vendor_name || '', r.email, IL[a.interest] || a.interest, TL[a.timing] || a.timing, SL[a.sponsor] || a.sponsor, a.note || '', r.slug ? 'golokali.com/' + r.slug : ''].join('\t'); }).join('\n');
        var okc = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy list'; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(okc, function () {});
      });
      host.appendChild(copy);
      var table = el('table', 'lk-ah-table');
      var thead = document.createElement('thead'), hr = document.createElement('tr');
      ['Who', 'Would use', 'Day', 'Sponsor', 'Note'].forEach(function (h) { var th = document.createElement('th'); th.textContent = h; hr.appendChild(th); });
      thead.appendChild(hr); table.appendChild(thead);
      var tb = document.createElement('tbody');
      rows.forEach(function (r) {
        var a = r.answers, tr = document.createElement('tr');
        var who = document.createElement('td');
        var b = document.createElement('b'); b.textContent = r.name || ''; who.appendChild(b);
        var sub = el('div', 'lk-admin-row-l2');
        sub.textContent = (r.business || r.vendor_name || '') + (r.slug ? ' · golokali.com/' + r.slug : '') + ' · ' + (r.email || '');
        who.appendChild(sub);
        tr.appendChild(who);
        [IL[a.interest] || a.interest || '', TL[a.timing] || a.timing || '', SL[a.sponsor] || a.sponsor || '', a.note || ''].forEach(function (v) { var td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
        tb.appendChild(tr);
      });
      table.appendChild(tb); host.appendChild(table);
    }
    host.appendChild(el('div', 'lk-admin-empty', 'Loading Content Day answers…'));
    API.adminEventRsvps(INTEREST_EVENT).then(function (res) {
      var d = res && res.data;
      if (!d || d.ok === false) { host.innerHTML = ''; host.appendChild(el('div', 'lk-admin-empty', 'Content Day answers could not be loaded.')); return; }
      draw(d);
      if (window.__lokPaintAttn) window.__lokPaintAttn();
    }).catch(function () { host.innerHTML = ''; host.appendChild(el('div', 'lk-admin-empty', 'Content Day answers could not be loaded.')); if (window.__lokPaintAttn) window.__lokPaintAttn(); });
  }
  // ── #201: blocked inquiry senders (patch_inquiry_sender_cap.sql) ──────────
  // Addresses on inquiry_blocklist: automatic (kept sending past the 2-per-hour
  // cap to one vendor, or two vendors marked the same address Spam) and manual.
  // Own RPC, never admin_overview() (the 2026-08-16 blank-section lesson).
  // Unreviewed automatic blocks count in the strip; "Keep blocked" clears one,
  // "Not spam" lifts the block and puts the auto-marked messages back.
  function appendBlockedSendersSection(wrap) {
    var API = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.vendors;
    if (!API || !API.adminInquiryBlocks) return;
    var host = el('div', 'lk-admin-section');
    wrap.appendChild(host);
    function draw(rows) {
      host.innerHTML = '';
      host.className = 'lk-admin-section' + (rows.length ? ' lk-admin-section-wide' : '');
      // Open = not yet reviewed, whether the block was automatic or made by hand
      // (F 2026-10-06: a hand block still needs a way to say "yes, spam").
      var open = rows.filter(function (r) { return !r.reviewed_at; }).length;
      if (window.__lokAttn) { window.__lokAttn.blocks = open; if (window.__lokPaintAttn) window.__lokPaintAttn(); }
      var t = el('div', 'lk-admin-qtitle');
      t.appendChild(document.createTextNode('Blocked senders'));
      t.appendChild(el('span', 'lk-admin-qcount', String(open)));
      host.appendChild(t);
      host.appendChild(el('p', 'lk-admin-sub',
        'Email addresses that can no longer send inquiries. Automatic blocks come from a sender who kept writing past two messages an hour to one vendor, or from two vendors marking the same address Spam. Spam keeps the block and clears it from this count. Not spam lifts the block and puts the auto-marked messages back in the vendor’s inbox.'));
      if (!rows.length) { host.appendChild(el('div', 'lk-admin-empty', 'No blocked senders.')); return; }
      // Reviewed blocks stay listed for reference but fold under a disclosure and
      // use a different class, so the Today chip and nav count see only open rows.
      var done = rows.filter(function (r) { return r.reviewed_at; });
      var doneBox = null;
      if (done.length) {
        doneBox = document.createElement('details');
        var sm = document.createElement('summary'); sm.className = 'lk-admin-row-l2'; sm.style.cssText = 'cursor:pointer;padding:10px 0 2px;';
        sm.textContent = 'Reviewed, still blocked (' + done.length + ')'; doneBox.appendChild(sm);
      }
      if (!open) host.appendChild(el('div', 'lk-admin-empty', 'Nothing waiting. Every block has been reviewed.'));
      rows.forEach(function (r) {
        var row = el('div', r.reviewed_at ? 'lk-admin-row-done' : 'lk-admin-row');
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1'); l1.textContent = r.email || '';
        var l2 = el('div', 'lk-admin-row-l2');
        var why = r.auto ? (String(r.note || '').indexOf('kept sending') >= 0 ? 'kept sending past the hourly cap' : 'marked Spam by two vendors') : 'blocked by hand';
        var spam = Number(r.spam_rows) || 0;
        l2.textContent = why + (r.vendors ? ' · wrote to ' + r.vendors : '') +
          ' · ' + spam + (spam === 1 ? ' message' : ' messages') + ' in Spam' +
          (r.created_at ? ' · ' + fmtLocalDay(r.created_at) : '') + (r.reviewed_at ? ' · reviewed' : '');
        meta.appendChild(l1); meta.appendChild(l2);
        if (r.sample) {
          // Sender-written text: textContent only, never markup.
          var q = el('div', 'lk-admin-row-l2'); q.style.fontStyle = 'italic'; q.textContent = '“' + r.sample + '”';
          meta.appendChild(q);
        }
        row.appendChild(meta);
        if (!r.reviewed_at && API.adminInquiryBlockReview) {
          var keep = document.createElement('button'); keep.type = 'button'; keep.className = 'lk-admin-approve'; keep.textContent = 'Spam';
          keep.title = 'Yes, spam. Keep the block and clear it from the count.';
          keep.onclick = function () { act(keep, API.adminInquiryBlockReview(r.email), 'Spam'); };
          row.appendChild(keep);
        }
        if (API.adminInquiryUnblock) {
          var un = document.createElement('button'); un.type = 'button'; un.className = 'lk-admin-decline'; un.textContent = 'Not spam';
          un.onclick = function () {
            if (!window.confirm('Lift the block on ' + r.email + '? Messages this block hid go back to the vendor as new.')) return;
            act(un, API.adminInquiryUnblock(r.email), 'Not spam');
          };
          row.appendChild(un);
        }
        if (r.reviewed_at) doneBox.appendChild(row); else host.appendChild(row);
      });
      if (doneBox) host.appendChild(doneBox);
    }
    function act(btn, p, label) {
      btn.disabled = true; btn.textContent = '…';
      p.then(function (res) {
        var d = res && res.data;
        if ((res && res.error) || !d || d.ok !== true) { btn.disabled = false; btn.textContent = label; return; }
        load();
      }).catch(function () { btn.disabled = false; btn.textContent = label; });
    }
    function load() {
      API.adminInquiryBlocks().then(function (res) {
        var d = (res && res.data) || {};
        if (d.ok !== true) return;                 // not admin / RPC missing
        draw(Array.isArray(d.blocks) ? d.blocks : []);
      });
    }
    load();
  }

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
        'Vendors whose business address is more than 50 miles from every area they list, and live vendors with no address on file yet. Nothing is blocked. This is your cue to reach out. Fixes itself when they update the address or their areas.'));
      if (!rows.length) { host.appendChild(el('div', 'lk-admin-empty', 'No address flags right now.')); return; }
      rows.forEach(function (r) {
        // #147c (2026-09-10): 'missing' = live with no address (soft gate); no Accept, nothing to accept.
        var missing = r.kind === 'missing';
        var row = el('div', 'lk-admin-row');
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1');
        l1.textContent = (r.business_name || 'Unknown vendor') + ' · ' + (missing ? 'no address on file' : [r.city, r.state].filter(Boolean).join(', '));
        var l2 = el('div', 'lk-admin-row-l2');
        l2.textContent = (missing ? 'Published without a business address' : (r.nearest_miles != null ? ('~' + r.nearest_miles + ' mi from the nearest listed area') : 'distance unknown')) +
          ' · lists: ' + (r.areas || '—') + (r.is_publish_ready ? ' · LIVE on The Market' : ' · not public yet') +
          (r.checked_at ? ' · ' + fmtLocalDay(r.checked_at) : '');
        meta.appendChild(l1); meta.appendChild(l2);
        row.appendChild(meta);
        if (r.slug) {
          var view = document.createElement('a'); view.className = 'lk-admin-btn'; view.textContent = 'View';
          view.href = '/' + encodeURIComponent(r.slug); view.target = '_blank'; view.rel = 'noopener';
          row.appendChild(view);
        }
        // #147b Accept — "I checked, they're fine": sticks to THIS address; a new
        // address goes back through the distance rule. Needs patch_address_accept.sql.
        if (API.adminAcceptAddress && !missing) {
          var acc = document.createElement('button'); acc.type = 'button'; acc.className = 'lk-admin-btn'; acc.textContent = 'Accept';
          acc.addEventListener('click', function () {
            acc.disabled = true; acc.textContent = 'Accepting…';
            API.adminAcceptAddress(r.id).then(function (res) {
              var d = res && res.data;
              if (!d || d.ok !== true) { acc.disabled = false; acc.textContent = 'Accept'; l2.textContent += ' · could not accept (' + ((d && d.reason) || (res && res.error && res.error.message) || 'error') + ')'; return; }
              row.remove();
              var cnt = t.querySelector('.lk-admin-qcount'); if (cnt) cnt.textContent = String(Math.max(0, parseInt(cnt.textContent, 10) - 1));
              if (window.__lokAttn && window.__lokAttn.addresses) { window.__lokAttn.addresses -= 1; if (window.__lokPaintAttn) window.__lokPaintAttn(); }
              if (!host.querySelector('.lk-admin-row')) host.appendChild(el('div', 'lk-admin-empty', 'No address flags right now.'));
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


  // #168 (F 2026-09-04) — invite a vendor: creates their account + pre-fills the
  // storefront; Supabase sends the "set your password" email. Nothing is sent
  // until the admin clicks Invite.
  function appendInviteVendorSection(wrap) {
    var API = window.LokaliSupabaseAPI;
    if (!API || !API.admin || !API.admin.inviteVendor) return;
    var host = el('div', 'lk-admin-section lk-admin-section-wide');
    wrap.appendChild(host);
    var t = el('div', 'lk-admin-qtitle'); t.appendChild(document.createTextNode('Invite a vendor')); host.appendChild(t);
    host.appendChild(el('p', 'lk-admin-sub',
      'For people who said yes in person: this creates their account and pre-fills the storefront, then emails them a link to choose a password. They land on their dashboard with only a listing left to add. Nothing goes out until you press Invite. Tick the QR box instead to get a printable claim link and send no email at all (#232, gathering cards).'));
    var form = document.createElement('form'); form.setAttribute('novalidate', '');
    form.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;align-items:end;';
    function field(label, name, type, ph, max) {
      var w = el('label'); w.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;color:#6B6880;';
      w.appendChild(document.createTextNode(label));
      var i = document.createElement(type === 'textarea' ? 'textarea' : 'input');
      if (type !== 'textarea') i.type = type; i.name = name; i.className = 'lk-admin-input'; i.style.width = '100%'; i.style.boxSizing = 'border-box';
      if (ph) i.placeholder = ph; if (max) i.maxLength = max; if (type === 'textarea') i.rows = 3;
      w.appendChild(i); form.appendChild(w); return i;
    }
    var fEmail = field('Their email *', 'email', 'email', 'name@business.com', 254);
    var fFirst = field('First name', 'first_name', 'text', 'e.g. Lupita', 60);
    var fBiz = field('Business name *', 'business_name', 'text', 'e.g. HTS Solutions', 120);
    var catW = el('label'); catW.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;color:#6B6880;';
    catW.appendChild(document.createTextNode('Category'));
    var fCat = document.createElement('select'); fCat.className = 'lk-admin-input'; fCat.style.width = '100%';
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Pick one'; fCat.appendChild(o0);
    Object.keys(CAT_NAMES).forEach(function (id) { var o = document.createElement('option'); o.value = id; o.textContent = CAT_NAMES[id]; fCat.appendChild(o); });
    catW.appendChild(fCat); form.appendChild(catW);
    var areasW = el('div'); areasW.style.cssText = 'grid-column:1/-1;font-size:12px;color:#6B6880;';
    areasW.appendChild(document.createTextNode('Areas they serve'));
    var areasRow = el('div'); areasRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;'; areasW.appendChild(areasRow); form.appendChild(areasW);
    if (API.data && API.data.locations) {
      API.data.locations().then(function (res) {
        (res && res.data || []).forEach(function (l) {
          var lab = el('label'); lab.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:13px;color:#1A1829;background:#F7F6FC;border:1px solid #E4DEF4;border-radius:999px;padding:5px 10px;cursor:pointer;';
          var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = String(l.id); cb.name = 'loc';
          lab.appendChild(cb); lab.appendChild(document.createTextNode(l.location_name)); areasRow.appendChild(lab);
        });
      }).catch(function () {});
    }
    var fTag = field('Tagline', 'tagline', 'text', 'One line about what they do', 160);
    var fWeb = field('Website', 'website_url', 'url', 'https://…', 300);
    var fPhone = field('Phone', 'phone', 'tel', '(832) 555-0100', 40);
    var fDesc = field('Description', 'description', 'textarea', 'A paragraph in their voice (they can edit it)', 2000);
    fDesc.parentNode.style.gridColumn = '1/-1';
    // #232 (F 2026-10-31, "scan this code … see the prepopulated profile"): same
    // account + pre-fill, but NO email — the response carries a claim link that
    // goes on a printed card as a QR. The link works until their first sign-in.
    var qrW = el('label'); qrW.style.cssText = 'grid-column:1/-1;display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#1A1829;cursor:pointer;';
    var qrCb = document.createElement('input'); qrCb.type = 'checkbox';
    qrW.appendChild(qrCb); qrW.appendChild(document.createTextNode('Printed QR invite: send no email, give me a claim link for their card instead.'));
    form.appendChild(qrW);
    var actions = el('div'); actions.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
    var btn = document.createElement('button'); btn.type = 'submit'; btn.className = 'lk-admin-btn'; btn.textContent = 'Invite';
    var msg = el('div'); msg.style.cssText = 'font-size:13px;color:#6B6880;';
    actions.appendChild(btn); actions.appendChild(msg); form.appendChild(actions);
    qrCb.addEventListener('change', function () { btn.textContent = qrCb.checked ? 'Create + get link' : 'Invite'; });
    // The claim link, shown only after a QR invite. Readonly + copy, like #171's.
    var linkRow = el('div'); linkRow.style.cssText = 'grid-column:1/-1;display:none;gap:8px;align-items:center;';
    var linkInput = document.createElement('input'); linkInput.type = 'text'; linkInput.readOnly = true;
    linkInput.className = 'lk-admin-input'; linkInput.style.cssText = 'flex:1;min-width:0;font-size:12px;';
    linkInput.addEventListener('focus', function () { linkInput.select(); });
    var copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'lk-admin-btn'; copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', function () {
      var done = function () { copyBtn.textContent = 'Copied'; setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(linkInput.value).then(done).catch(function () { linkInput.focus(); });
      else { linkInput.focus(); try { document.execCommand('copy'); done(); } catch (e2) {} }
    });
    linkRow.appendChild(linkInput); linkRow.appendChild(copyBtn); form.appendChild(linkRow);
    var ERR = {
      already_registered: 'That email already has a Lokali account. Ask them to log in instead; nothing was sent.',
      email_invalid: 'That email doesn’t look right.', business_name_required: 'Business name is required.',
      not_admin: 'Only the admin can invite vendors.', rpc_unavailable: 'The database side isn’t installed yet (patch_admin_invite_vendor.sql). Nothing was sent.',
      invite_failed: 'Supabase refused the invite. Nothing was sent.', provision_failed: 'The invite email went out but the storefront pre-fill failed. Tell Claude the email address.',
      claim_unavailable: 'The server cannot sign claim links right now (LOKALI_UNSUB_SECRET). Nothing was created.'
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var qrMode = qrCb.checked;
      var payload = {
        email: fEmail.value.trim(), first_name: fFirst.value.trim(), business_name: fBiz.value.trim(),
        category_id: fCat.value ? Number(fCat.value) : null,
        locations_id: Array.prototype.map.call(areasRow.querySelectorAll('input[name=loc]:checked'), function (c) { return Number(c.value); }),
        tagline: fTag.value.trim(), website_url: fWeb.value.trim(), phone: fPhone.value.trim(), description: fDesc.value.trim(),
        delivery: qrMode ? 'qr' : 'email'
      };
      if (!payload.email || !payload.business_name) { msg.textContent = 'Email and business name are required.'; return; }
      var ask = qrMode
        ? 'Create the account for ' + payload.email + ' and get their claim link? No email goes out.'
        : 'Send the invite email to ' + payload.email + ' now?';
      if (!window.confirm(ask)) return;
      btn.disabled = true; btn.textContent = qrMode ? 'Creating…' : 'Inviting…'; msg.textContent = '';
      linkRow.style.display = 'none';
      API.admin.inviteVendor(payload).then(function (res) {
        btn.disabled = false; btn.textContent = qrCb.checked ? 'Create + get link' : 'Invite';
        var d = res && res.data;
        if (res && res.error) { msg.textContent = ERR[res.error] || ('Could not invite (' + res.error + ').'); return; }
        // reset() FIRST: the link field lives inside the form, so resetting after
        // setting it wiped the link the moment it appeared (found live 2026-11-01).
        form.reset(); btn.textContent = 'Invite'; // reset() unticks the QR box too
        if (qrMode && d && d.claim_url) {
          linkInput.value = d.claim_url; linkRow.style.display = 'flex';
          msg.textContent = 'Account created and storefront pre-filled' + (d.slug ? ' at /' + d.slug : '') +
            '. Nothing was emailed: put this link on their card as a QR. It keeps working until their first sign-in, and scanning it twice is fine.';
        } else {
          msg.textContent = 'Invite sent to ' + payload.email + '. Storefront pre-filled' + (d && d.slug ? ' at /' + d.slug : '') + ' — it goes public once they add a listing.';
        }
      }).catch(function () { btn.disabled = false; btn.textContent = qrCb.checked ? 'Create + get link' : 'Invite'; msg.textContent = 'Network error — nothing was sent.'; });
    });
    host.appendChild(form);
  }

  // #171 (F 2026-09-12) — sign in as a vendor: mints a one-time magic link for an
  // EXISTING vendor account so the admin can build their storefront for them
  // without ever holding their password. The link is shown here (never emailed)
  // and must be opened in a private window; opening it in this browser would
  // replace the admin session. Server refuses admins, shoppers, unknown emails.
  // #215 — linked storefronts: one person running several businesses. Vendors
  // link their own logins from Settings (email confirmation); this panel does
  // it at once, lists every group and can disconnect any storefront. Folds
  // closed like Invite a vendor: a rare tool.
  function appendLinkStorefrontsSection(view) {
    var SAPI = window.LokaliSupabaseAPI, A = SAPI && SAPI.admin;
    if (!A || !A.linkStorefronts || !A.storefrontGroups) return null;
    var sec = el('div', 'lk-ash-sec'); sec.style.margin = '0 0 22px'; view.appendChild(sec);
    var host = el('div', 'lk-admin-section lk-admin-section-wide'); sec.appendChild(host);
    var head = el('div'); head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
    var t = el('div', 'lk-admin-qtitle'); t.appendChild(document.createTextNode('Linked storefronts'));
    var count = el('span', 'lk-admin-qcount', '0'); t.appendChild(count); head.appendChild(t);
    var openBtn = el('button', 'lk-ash-btn', 'Link storefronts'); openBtn.type = 'button'; openBtn.setAttribute('aria-expanded', 'false'); head.appendChild(openBtn);
    host.appendChild(head);
    host.appendChild(el('p', 'lk-admin-sub',
      'One person, several businesses. Linked logins share a Switch to list in their menus, so they move between storefronts without signing out. Vendors can link their own from Settings (we email the other login a confirm link); here it happens at once. Each storefront keeps its own login, plan and billing.'));
    var form = document.createElement('form'); form.setAttribute('novalidate', ''); form.hidden = true;
    form.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:0 0 14px;';
    var dl = document.createElement('datalist'); dl.id = 'lk-link-vendors'; form.appendChild(dl);
    function field(label, ph) {
      var w = el('label'); w.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;color:#6B6880;flex:1 1 220px;';
      w.appendChild(document.createTextNode(label));
      var i = document.createElement('input'); i.type = 'text'; i.className = 'lk-admin-input'; i.autocomplete = 'off'; i.setAttribute('list', 'lk-link-vendors');
      i.style.width = '100%'; i.style.boxSizing = 'border-box'; i.placeholder = ph; i.maxLength = 120;
      w.appendChild(i); form.appendChild(w); return i;
    }
    var fA = field('First storefront *', 'Business name'), fB = field('Second storefront *', 'Business name');
    var go = el('button', 'lk-admin-btn', 'Link these two'); go.type = 'submit'; form.appendChild(go);
    var out = el('div'); out.style.cssText = 'flex-basis:100%;font-size:13px;color:#6B6880;'; form.appendChild(out);
    host.appendChild(form);
    openBtn.addEventListener('click', function () {
      form.hidden = !form.hidden; openBtn.setAttribute('aria-expanded', form.hidden ? 'false' : 'true');
      openBtn.textContent = form.hidden ? 'Link storefronts' : 'Close';
      if (!form.hidden) fA.focus();
    });
    var list = el('div'); host.appendChild(list);
    var rowsByName = {}, rows = [];
    function resolve(name) {
      var q = String(name || '').trim().replace(/\s+/g, ' ').toLowerCase(); if (!q) return { err: 'Type both business names.' };
      var hits = rows.filter(function (r) { return String(r.v.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === q; });
      if (!hits.length) hits = rows.filter(function (r) { return String(r.v.name || '').toLowerCase().indexOf(q) >= 0; });
      if (!hits.length) return { err: 'No storefront called "' + name.trim() + '". Use the exact name from the list below.' };
      if (hits.length > 1) return { err: 'More than one storefront matches "' + name.trim() + '". Type the full name.' };
      return { id: hits[0].v.id, name: hits[0].v.name };
    }
    var ERR = { not_admin: 'Only the admin can do this.', no_vendor: 'One of those storefronts has no login behind it.', same_login: 'Those two storefronts already share one login.',
      admin_account: 'The admin account cannot be linked.', group_full: 'That group is full (10 storefronts).', not_linked: 'That storefront is not linked.' };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ra = resolve(fA.value), rb = resolve(fB.value);
      if (ra.err) { out.textContent = ra.err; return; } if (rb.err) { out.textContent = rb.err; return; }
      if (ra.id === rb.id) { out.textContent = 'Pick two different storefronts.'; return; }
      if (!window.confirm('Link ' + ra.name + ' with ' + rb.name + '? Whoever is signed in to either can switch to the other without a password. Only do this when both belong to the same person.')) return;
      go.disabled = true; go.textContent = 'Linking…'; out.textContent = '';
      A.linkStorefronts(ra.id, rb.id).then(function (res) {
        go.disabled = false; go.textContent = 'Link these two';
        var d = res && res.data;
        if (res.error || !d || d.ok !== true) { out.textContent = ERR[d && d.reason] || 'Could not link (' + (res.error || (d && d.reason) || 'unknown') + ').'; return; }
        out.textContent = d.already ? 'Those two were already linked.' : 'Linked. ' + ra.name + ' and ' + rb.name + ' now see each other under Switch to.';
        fA.value = ''; fB.value = ''; load();
      }).catch(function () { go.disabled = false; go.textContent = 'Link these two'; out.textContent = 'Network error. Nothing happened.'; });
    });
    function load() {
      A.storefrontGroups().then(function (res) {
        var d = res && res.data; list.innerHTML = '';
        if (res.error || !d || d.ok !== true) { list.appendChild(el('div', 'lk-admin-empty', 'Could not load linked storefronts.')); return; }
        var groups = d.groups || []; count.textContent = String(groups.length);
        if (!groups.length) { list.appendChild(el('div', 'lk-admin-empty', 'No linked storefronts yet.')); return; }
        groups.forEach(function (g) {
          var row = el('div', 'lk-admin-row'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;';
          (g.storefronts || []).forEach(function (sf, i) {
            if (i) row.appendChild(el('span', '', '+')).style.color = '#B3B1C6';
            var chip = el('span'); chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 6px 6px 10px;border:1px solid #E4E2F0;border-radius:100px;font-size:13px;font-weight:600;color:#1A1829;background:#fff;';
            var nm = el('a', '', ''); nm.textContent = sf.business_name || 'Storefront'; nm.href = sf.slug ? '/' + encodeURIComponent(sf.slug) : '#'; nm.target = '_blank'; nm.rel = 'noopener'; nm.style.cssText = 'color:inherit;text-decoration:none;';
            chip.appendChild(nm);
            var x = el('button', '', 'Disconnect'); x.type = 'button'; x.setAttribute('aria-label', 'Disconnect ' + (sf.business_name || 'storefront'));
            x.style.cssText = 'all:unset;cursor:pointer;font-size:11px;font-weight:700;color:#B42318;padding:3px 8px;border-radius:100px;background:#FDF1F1;';
            x.addEventListener('click', function () {
              if (!window.confirm('Disconnect ' + (sf.business_name || 'this storefront') + ' from the others? They can be linked again any time.')) return;
              x.textContent = '…';
              A.unlinkStorefront(sf.vendors_id).then(function (r2) { var d2 = r2 && r2.data; if (r2.error || !d2 || d2.ok !== true) { x.textContent = 'Disconnect'; out.textContent = ERR[d2 && d2.reason] || 'Could not disconnect.'; return; } load(); })
                .catch(function () { x.textContent = 'Disconnect'; });
            });
            chip.appendChild(x); row.appendChild(chip);
          });
          list.appendChild(row);
        });
      }).catch(function () { list.innerHTML = ''; list.appendChild(el('div', 'lk-admin-empty', 'Could not load linked storefronts.')); });
    }
    load();
    return {
      setRows: function (rs) {
        rows = rs || []; dl.innerHTML = '';
        rows.forEach(function (r) { if (r.v && r.v.name) { var o = document.createElement('option'); o.value = r.v.name; dl.appendChild(o); } });
      }
    };
  }

  function appendSignInAsSection(wrap) {
    var API = window.LokaliSupabaseAPI;
    if (!API || !API.admin || !API.admin.signInAs) return;
    var host = el('div', 'lk-admin-section lk-admin-section-wide');
    wrap.appendChild(host);
    var t = el('div', 'lk-admin-qtitle'); t.appendChild(document.createTextNode('Sign in as a vendor')); host.appendChild(t);
    host.appendChild(el('p', 'lk-admin-sub',
      'For storefronts you are building on someone’s behalf, with their OK. This makes a one-time sign-in link for their account. Open it in a private or incognito window (opening it here would sign you out), do the work as them, then sign out. The link works once and expires within the hour. Nothing is emailed.'));
    var form = document.createElement('form'); form.setAttribute('novalidate', '');
    form.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:end;';
    var w = el('label'); w.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;color:#6B6880;flex:1 1 260px;';
    w.appendChild(document.createTextNode('Business name or account email *'));
    var fEmail = document.createElement('input'); fEmail.type = 'text'; fEmail.name = 'who'; fEmail.className = 'lk-admin-input'; fEmail.autocomplete = 'off';
    fEmail.style.width = '100%'; fEmail.style.boxSizing = 'border-box'; fEmail.placeholder = 'Paperloom  or  name@business.com'; fEmail.maxLength = 254;
    w.appendChild(fEmail); form.appendChild(w);
    var btn = document.createElement('button'); btn.type = 'submit'; btn.className = 'lk-admin-btn'; btn.textContent = 'Make sign-in link';
    form.appendChild(btn);
    var out = el('div'); out.style.cssText = 'flex-basis:100%;font-size:13px;color:#6B6880;display:flex;flex-wrap:wrap;gap:10px;align-items:center;';
    form.appendChild(out);
    // #181: a vendor row's "Sign in as" fills this in and brings it into view. The
    // admin still presses the button and answers the named confirm below.
    host.lkPrefill = function (who) {
      fEmail.value = String(who || ''); out.textContent = '';
      try { host.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      setTimeout(function () { try { btn.focus(); } catch (e) {} }, 350);
    };
    var ERR = {
      email_invalid: 'That email doesn’t look right.',
      no_account: 'No Lokali account with that email yet. They need to sign up first (or use Invite a vendor).',
      target_is_admin: 'That is an admin account. Sign-in links are only made for vendor accounts.',
      not_a_vendor: 'That account has no storefront. Sign-in links are only made for vendors.',
      not_admin: 'Only the admin can do this.',
      link_failed: 'Supabase refused to make the link. Nothing happened.',
      lookup_failed: 'Could not look up that account. Try again.',
      no_vendor_named: 'No storefront with that business name. Try the exact name from The Market, or their email.',
      name_ambiguous: 'More than one storefront matches that name. Use their email instead.'
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = fEmail.value.trim();
      if (!email) { out.textContent = 'A business name or email is required.'; return; }
      if (!window.confirm('Make a one-time sign-in link for ' + email + '? Only do this with their OK.')) return;
      btn.disabled = true; btn.textContent = 'Making…'; out.textContent = '';
      var payload = email.indexOf('@') >= 0 ? { email: email } : { name: email };   // #175: name lookup lives in the route
      API.admin.signInAs(payload).then(function (res) {
        btn.disabled = false; btn.textContent = 'Make sign-in link';
        var d = res && res.data;
        if (res && res.error) { out.textContent = ERR[res.error] || ('Could not make the link (' + res.error + ').'); return; }
        if (!d || !d.link) { out.textContent = 'No link came back.'; return; }
        out.innerHTML = '';
        var note = el('span'); note.textContent = 'Link for ' + (d.slug ? '/' + d.slug : email) + (d.email ? ' (' + d.email + ')' : '') + '. Copy it, then paste it into a PRIVATE window:';
        var box = document.createElement('input'); box.type = 'text'; box.readOnly = true; box.value = d.link; box.className = 'lk-admin-input';
        box.style.cssText = 'flex:1 1 320px;min-width:0;font-size:12px;';
        box.addEventListener('focus', function () { box.select(); });
        var copy = document.createElement('button'); copy.type = 'button'; copy.className = 'lk-admin-btn'; copy.textContent = 'Copy link';
        copy.addEventListener('click', function () {
          var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 1800); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(d.link).then(done, function () { box.focus(); box.select(); });
          else { box.focus(); box.select(); try { document.execCommand('copy'); done(); } catch (e2) {} }
        });
        out.appendChild(note); out.appendChild(box); out.appendChild(copy);
        fEmail.value = '';
      }).catch(function () { btn.disabled = false; btn.textContent = 'Make sign-in link'; out.textContent = 'Network error. Nothing happened.'; });
    });
    host.appendChild(form);
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
      'Customer reports of vendors, and vendor flags on reviews. Resolving here only clears the queue. Deactivating a storefront stays a separate, deliberate step.'));

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
      l2.textContent = 'from ' + (r.reporter_email || 'unknown') + ' \u00b7 ' + fmtLocalDay(r.created_at);
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
  // Plain timestamps (reports, scans, flags): the viewer's own calendar day.
  // valueAsDate would serialise the UTC day (tomorrow after ~7 PM Central).
  function localISODate() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtLocalDay(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return String(iso || ''); }
  }
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
      'Answers from the delete-account survey. It’s optional, so treat counts as a floor. ' +
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
      if (r.created_at) bits.push(fmtLocalDay(r.created_at));
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
        'Visits from your printed QR codes, counted once per visit when someone scans and lands on the site. The badge is the last 30 days.'));

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
          'No scans yet. The first flyer scan lands here.'));
        return;
      }
      camps.forEach(function (c) {
        var row = el('div', 'lk-admin-row');
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1');
        l1.textContent = c.campaign === 'flyer' ? 'Square business flyer' : (c.campaign || 'unknown');
        var l2 = el('div', 'lk-admin-row-l2');
        l2.textContent = String(c.total || 0) + ' total · ' + String(c.last_30d || 0) + ' in 30d' +
          (c.last_scan ? ' · last ' + fmtLocalDay(c.last_scan) : '');
        meta.appendChild(l1); meta.appendChild(l2);
        row.appendChild(meta);
        host.appendChild(row);
      });
    }).catch(function () { if (host.parentNode) host.parentNode.removeChild(host); });
  }

  // #156 — "How people found us": acquisition attribution for every signup.
  // Its OWN RPC (admin_signup_sources) — admin_overview() stays untouched.
  // Informational only: never registers in the needs-attention strip.
  function appendAcquisitionSection(wrap) {
    var API = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.admin;
    if (!API || typeof API.signupSources !== 'function') return; // stale client cache: no-op
    var HEARD_LBL = {
      friend_word_of_mouth: 'Friend / word of mouth', google_search: 'Google search',
      facebook_group: 'Facebook group', nextdoor: 'Nextdoor', instagram: 'Instagram',
      qr_flyer: 'QR code / flyer', local_event: 'Local event or market',
      another_vendor: 'Another vendor', other: 'Other'
    };
    var CHAN_LBL = {
      paid_google: 'Google ads (gclid)', vendor_referral: 'Vendor referral link',
      shared_link: 'Shared link', organic_search: 'Search engine', facebook: 'Facebook',
      instagram: 'Instagram', nextdoor: 'Nextdoor', direct: 'Direct / typed in',
      other_referrer: 'Other site', unknown: 'Unknown (pre-tracking)'
    };
    var host = el('div', 'lk-admin-section');
    wrap.appendChild(host);

    API.signupSources().then(function (res) {
      var d = (res && res.data) || {};
      if (d.ok !== true) { if (host.parentNode) host.parentNode.removeChild(host); return; }  // not admin / patch not run yet

      var t = el('div', 'lk-admin-qtitle');
      t.appendChild(document.createTextNode('How people found us'));
      t.appendChild(el('span', 'lk-admin-qcount', String(d.signups_30d != null ? d.signups_30d : 0)));
      host.appendChild(t);
      host.appendChild(el('p', 'lk-admin-sub',
        'Where signups come from: their own answer to “How did you hear about us?” plus the referrer/campaign we saw on their first visit. The badge is signups in the last 30 days.'));

      function topOf(obj) {
        var best = null, n = -1;
        Object.keys(obj || {}).forEach(function (k) {
          var v = Number(obj[k]) || 0;
          if (v > n) { n = v; best = k; }
        });
        return best;
      }
      var topHeard = topOf(d.heard_counts);
      var topChan = topOf(d.channel_counts);
      var stats = el('div', 'lk-admin-stats');
      [[d.signups_30d, 'Signups 30d'], [d.signups_total, 'All time'],
       [topHeard ? (HEARD_LBL[topHeard] || topHeard) : '—', 'Top answer'],
       [topChan ? (CHAN_LBL[topChan] || topChan) : '—', 'Top channel']].forEach(function (s) {
        var tile = el('div', 'lk-admin-stat');
        tile.appendChild(el('div', 'lk-admin-stat-num', esc(String(s[0] != null ? s[0] : '—'))));
        tile.appendChild(el('div', 'lk-admin-stat-lbl', esc(s[1])));
        stats.appendChild(tile);
      });
      host.appendChild(stats);

      function breakdown(title, obj, lbls) {
        var keys = Object.keys(obj || {});
        if (!keys.length) return;
        keys.sort(function (a, b) { return (Number(obj[b]) || 0) - (Number(obj[a]) || 0); });
        var row = el('div', 'lk-admin-row');
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1');
        l1.textContent = title;
        var l2 = el('div', 'lk-admin-row-l2');
        l2.textContent = keys.map(function (k) {
          return (lbls[k] || k) + ' ' + String(obj[k]);
        }).join(' · ');
        meta.appendChild(l1); meta.appendChild(l2);
        row.appendChild(meta);
        host.appendChild(row);
      }
      breakdown('Their answer', d.heard_counts, HEARD_LBL);
      breakdown('First-visit channel', d.channel_counts, CHAN_LBL);

      var recent = Array.isArray(d.recent) ? d.recent : [];
      if (!recent.length) {
        host.appendChild(el('div', 'lk-admin-empty',
          'No signups recorded yet. New accounts land here with their source.'));
        return;
      }
      // #176 (F 2026-09-13: "it's going to get unruly as more people join"): the
      // card stays compact — only the 5 newest signups show; the rest sit behind
      // a "Show all N" toggle. The breakdown rows above already carry the totals.
      var SHOW = 5;
      var hidden = [];
      recent.forEach(function (r, i) {
        var row = el('div', 'lk-admin-row');
        if (i >= SHOW) { row.style.display = 'none'; hidden.push(row); }
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1');
        // vendor text lands via textContent (heard_about_detail is free text)
        l1.textContent = (r.first_name || 'Someone') +
          (r.business_name ? ' · ' + r.business_name : '') +
          (r.role ? ' (' + r.role + ')' : '');
        var l2 = el('div', 'lk-admin-row-l2');
        var bits = [];
        if (r.heard_about) {
          bits.push((HEARD_LBL[r.heard_about] || r.heard_about) +
            (r.heard_about_detail ? ': ' + r.heard_about_detail : ''));
        }
        if (r.channel && r.channel !== 'unknown') bits.push(CHAN_LBL[r.channel] || r.channel);
        if (!bits.length) bits.push('no source recorded');
        if (r.created_at) bits.push(fmtLocalDay(r.created_at));
        l2.textContent = bits.join(' · ');
        meta.appendChild(l1); meta.appendChild(l2);
        row.appendChild(meta);
        host.appendChild(row);
      });
      if (hidden.length) {
        var more = document.createElement('button');
        more.type = 'button'; more.className = 'lk-admin-decline';
        more.style.cssText = 'margin-top:10px;';
        var open = false;
        var label = function () { more.textContent = open ? 'Show the latest ' + SHOW + ' only' : 'Show all ' + recent.length + ' signups'; };
        label();
        more.addEventListener('click', function () {
          open = !open;
          hidden.forEach(function (row) { row.style.display = open ? '' : 'none'; });
          label();
        });
        host.appendChild(more);
      }
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
      'Upcoming and live Spotlights. Reach out to homepage vendors about their “Meet the vendor” feature and The Neighborhood Edit shoutout.' +
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
      tierSpan.textContent = ' · ' + (b.tier === 'homepage' ? 'Homepage ($150)' : 'Category ($75)');
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

  // ── #166 pairing feedback (fn_pairings.sql) ───────────────────────────────
  // Vendor messages from the storefront referral card's owner popover: flags
  // ("too close to my work" — the pairing is ALREADY hidden the moment they
  // flagged; this queue is the re-curation reminder) and pairing suggestions.
  // Own RPC (admin_pairing_feedback), never an admin_overview() redefinition
  // (the 2026-08-16 rule). Also lists every curated pairing with its health —
  // flagged / curator-inactive / guard_hidden (the tag guard is suppressing
  // it after tag drift). Re-pairing itself is SQL-editor work in v1.
  function appendPairingFeedbackSection(wrap) {
    var API = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.pairings;
    if (!API || !API.adminFeedback) return;       // stale cached client: no-op
    var host = el('div', 'lk-admin-section');
    wrap.appendChild(host);

    function draw(d) {
      host.innerHTML = '';
      var rows = (d && d.feedback) || [];
      var pairs = (d && d.pairings) || [];
      host.className = 'lk-admin-section' + (rows.length ? ' lk-admin-section-wide' : '');
      if (window.__lokAttn) { window.__lokAttn.pairings = rows.length; if (window.__lokPaintAttn) window.__lokPaintAttn(); }
      var t = el('div', 'lk-admin-qtitle');
      t.appendChild(document.createTextNode('Neighbor pairings'));
      t.appendChild(el('span', 'lk-admin-qcount', String(rows.length)));
      host.appendChild(t);
      host.appendChild(el('p', 'lk-admin-sub',
        'Messages from the storefront referral card. A flagged pairing is already hidden from that storefront; re-pair or retire it in the SQL editor, then resolve the message here.'));

      if (!rows.length) {
        host.appendChild(el('div', 'lk-admin-empty', 'No pairing messages waiting.'));
      }
      rows.forEach(function (f) {
        var row = el('div', 'lk-admin-row');
        var meta = el('div', 'lk-admin-row-meta');
        var l1 = el('div', 'lk-admin-row-l1');
        l1.innerHTML = (f.kind === 'flag' ? LK_FA.flag : LK_FA.bulb) + ' ' + esc(f.vendor || 'Unknown vendor') +
          (f.kind === 'flag' ? ' flagged their pairing' : ' suggests a pairing');
        var l2 = el('div', 'lk-admin-row-l2');
        l2.textContent = '“' + String(f.message || '') + '”';
        meta.appendChild(l1); meta.appendChild(l2);
        row.appendChild(meta);
        var ok = document.createElement('button');
        ok.type = 'button'; ok.className = 'lk-admin-approve'; ok.textContent = 'Resolve';
        ok.onclick = function () {
          ok.disabled = true; ok.textContent = '…';
          API.adminResolve(f.id).then(function (res) {
            var rd = res && res.data;
            if ((res && res.error) || !rd || rd.ok !== true) { ok.disabled = false; ok.textContent = 'Resolve'; return; }
            load();
          }).catch(function () { ok.disabled = false; ok.textContent = 'Resolve'; });
        };
        row.appendChild(ok);
        if (f.slug) {
          var view = document.createElement('a');
          view.className = 'lk-admin-decline';
          view.style.textDecoration = 'none';
          view.textContent = 'View';
          view.href = '/' + encodeURIComponent(f.slug);
          view.target = '_blank';
          view.rel = 'noopener';
          row.appendChild(view);
        }
        host.appendChild(row);
      });

      // Pairing health line: anything not currently rendering, at a glance.
      var off = pairs.filter(function (p) { return p.flagged_at || p.is_active === false || p.guard_hidden; });
      if (off.length) {
        var warn = el('div', 'lk-admin-row-l2');
        warn.style.marginTop = '8px';
        warn.textContent = '⚠️ Not currently showing: ' + off.map(function (p) {
          return p.host + ' → ' + p.suggested + ' (' +
            (p.flagged_at ? 'flagged' : (p.is_active === false ? 'inactive' : 'tag overlap')) + ')';
        }).join(' · ');
        host.appendChild(warn);
      }
    }

    function load() {
      API.adminFeedback().then(function (res) {
        var d = res && res.data;
        if ((res && res.error) || !d || d.ok !== true) return;
        draw(d);
      }).catch(function () {});
    }
    load();
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
          h.textContent = ': “' + c.headline + '”';
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
    body.appendChild(el('div', 'lk-sf-sub', "You're all set up to shop. Selling on Lokali too? Open a storefront. It's free to start, and locals can find, contact, and review you."));
    card.appendChild(body);
    var cta = el('button', 'lk-sf-cta', 'Open your storefront for free');
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
        if (res && res.error) { resetCreate(); toast('Couldn’t open your storefront. Please try again.'); return; }
        if (!d || d.ok !== true) {
          resetCreate();
          toast(SF_REASONS[d && d.reason] || 'Couldn’t open your storefront. Please try again.');
          return;
        }
        // Keep the synchronous role cache honest so the header/menu paint as a
        // vendor immediately; the dashboard boot re-confirms via get_my_role().
        try {
          var c = JSON.parse(localStorage.getItem('LOKALI_ACCT_CACHE') || 'null') || {};
          c.role = 'vendor'; localStorage.setItem('LOKALI_ACCT_CACHE', JSON.stringify(c));
        } catch (e) {}
        toast('Storefront created! Taking you to your dashboard…');
        // #90 — arm the one-shot first-run setup wizard on the dashboard
        // (lokali-dashboard-page.js consumes + clears this flag).
        try { sessionStorage.setItem('lokali_sf_wizard', '1'); } catch (e) {}
        setTimeout(function () { window.location.href = '/vendor-dashboard/dashboard'; }, 700);
      }).catch(function () {
        resetCreate();
        toast('Couldn’t open your storefront. Please try again.');
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

  // ── pane: Home (2026-09-20) ────────────────────────────────
  // Production read that day: 23 of 24 accounts had nothing saved, 0 of 24 had
  // set "Your area" (it sat at the bottom of Settings), 0 inquiries. So the
  // landing view must work EMPTY and must ask for the area itself. One
  // next-step card, never more (same idea as the vendor dashboard's).
  // ⚠️ The nine names mirror the ACTIVE rows of public.locations (Conroe,
  // Shenandoah 2026-10-11, Sugar Land 2026-10-15); The Market's
  // #44 region default matches account.region against those names. Opening a
  // seventh community means adding it here too.
  var HUB_AREAS = ['The Woodlands', 'Woodforest', 'Spring', 'Tomball', 'Katy', 'Conroe', 'Shenandoah', 'Sugar Land', 'Houston'];

  function nextStepCard() {
    var card = el('div', 'lkh-next');
    var tx = el('div', 'lkh-next-tx');
    tx.appendChild(el('div', 'lkh-k', 'Your next step'));
    card.appendChild(tx);
    var acc = state.account || {};
    if (state.awaiting.length) {
      var v = vendorOf(state.awaiting[0]);
      tx.appendChild(el('h3', null, 'How did it go with ' + esc(vendorName(v)) + '?'));
      tx.appendChild(el('p', null, 'You contacted them through Lokali. Two taps tells your neighbors whether you would recommend them.'));
      var go = el('button', 'lk-btn primary', 'Share how it went'); go.type = 'button';
      go.addEventListener('click', function () { location.hash = 'reviews'; show('reviews'); });
      card.appendChild(go);
    } else if (!acc.region) {
      tx.appendChild(el('h3', null, 'Where do you shop?'));
      tx.appendChild(el('p', null, 'Pick one and The Market shows vendors near you first. You can change it any time in Settings.'));
      var chips = el('div', 'lkh-chips');
      HUB_AREAS.forEach(function (city) {
        var c = el('button', 'lkh-chip', esc(city)); c.type = 'button';
        c.addEventListener('click', function () {
          var all = chips.querySelectorAll('button');
          for (var i = 0; i < all.length; i++) all[i].disabled = true;
          var region = city + ', TX';
          api().account.update({ region: region }).then(function (res) {
            if (res && res.error) {
              for (var j = 0; j < all.length; j++) all[j].disabled = false;
              toast('Couldn’t save your area. Please try again.');
              return;
            }
            state.account.region = region;
            rerender();
            toast('Saved. The Market now starts with ' + city + '.');
          }, function () {
            for (var k = 0; k < all.length; k++) all[k].disabled = false;
            toast('Couldn’t save your area. Please try again.');
          });
        });
        chips.appendChild(c);
      });
      card.appendChild(chips);
    } else {
      tx.appendChild(el('h3', null, state.saved.length ? 'See who is new near you' : 'Follow your first local vendor'));
      tx.appendChild(el('p', null, 'The Market starts with vendors near ' + esc(acc.region) + '. Tap the heart to follow anyone you want to keep up with.'));
      var a = el('a', 'lk-btn primary', 'Browse The Market'); a.href = '/the-market';
      card.appendChild(a);
    }
    return card;
  }

  function badgeStrip() {
    var b = state.badges || {};
    var cats = (b.explorer && b.explorer.categories) || [];
    var rc = (b.reviews && b.reviews.count) || 0;
    var defs = [
      [GI_COMPASS, 'Explorer', cats.length && cats.every(function (c) { return c && c.explored; })],
      [GI_STAR, 'First review', rc >= 1],
      [GI_HEART, 'Regular', rc >= 5],
      [GI_FLAG, 'Scout', ((b.scout && b.scout.count) || 0) >= 1],
      [GI_SHARE, 'Connector', ((b.connector && b.connector.count) || 0) >= 5]
    ];
    var strip = el('div', 'lkh-bdg');
    defs.forEach(function (d) { strip.appendChild(el('div', 'lkh-b' + (d[2] ? ' on' : ''), '<span>' + gIco(d[0], 20) + '</span>' + esc(d[1]))); });
    return strip;
  }

  function renderHome(acc, name, areaBits) {
    var pane = el('div', 'lk-pane'); pane.setAttribute('data-pane', 'home');
    var stack = el('div', 'lkh-stack');

    // owners: the switch back to the storefront comes first
    if (state.hasStorefront) stack.appendChild(renderStorefrontReturn());

    var hello = el('div', 'lkh-hello');
    hello.style.marginBottom = '0';
    hello.appendChild(avatarNode(acc, 'lk-avatar')); // #76 preset avatar (falls back to initials)
    var who = el('div');
    who.appendChild(el('div', 'lk-greet', 'Hi, ' + esc(name)));
    who.appendChild(el('div', 'lk-meta', areaBits.join(' · ')));
    hello.appendChild(who);
    var gear = el('button', 'lk-heart lkh-gear', gIco(GI_GEAR, 18)); gear.type = 'button';
    gear.setAttribute('aria-label', 'Settings');
    gear.addEventListener('click', function () { location.hash = 'settings'; show('settings'); });
    hello.appendChild(gear);
    stack.appendChild(hello);

    stack.appendChild(nextStepCard());

    var cols = el('div', 'lkh-cols');
    var sc = el('div', 'lkh-card');
    var sh = el('div', 'lkh-head'); sh.appendChild(el('h3', null, 'Vendors you follow'));
    if (state.saved.length) {
      var all = el('button', 'lkh-more', 'See all ' + state.saved.length); all.type = 'button';
      all.addEventListener('click', function () { location.hash = 'saved'; show('saved'); });
      sh.appendChild(all);
    }
    sc.appendChild(sh);
    if (state.saved.length) {
      var g = el('div', 'lkh-grid'); // one column: two-up truncated vendor names at 1320px
      state.saved.slice(0, 3).forEach(function (row) { g.appendChild(savedRow(row, true)); });
      sc.appendChild(g);
    } else {
      sc.appendChild(el('div', 'lkh-mini', '<b>Not following anyone yet</b>Tap the heart on any vendor in The Market to follow them. They will show up here, and in one email each Thursday.'));
    }
    cols.appendChild(sc);

    var bc = el('div', 'lkh-card');
    var bh = el('div', 'lkh-head'); bh.appendChild(el('h3', null, 'Your badges'));
    var earned = earnedBadgeCount();
    var bm = el('button', 'lkh-more', earned ? (earned + ' of 5 earned') : 'How they work'); bm.type = 'button';
    bm.addEventListener('click', function () { location.hash = 'badges'; show('badges'); });
    bh.appendChild(bm); bc.appendChild(bh);
    bc.appendChild(badgeStrip());
    var cats = (state.badges && state.badges.explorer && state.badges.explorer.categories) || [];
    var nExp = cats.filter(function (c) { return c && c.explored; }).length;
    if (cats.length) {
      bc.appendChild(el('p', 'lkh-hint', nExp >= cats.length
        ? 'Every category explored. Status only, no perks.'
        : (nExp ? 'You have explored ' + nExp + ' of ' + cats.length + ' categories already. ' : 'Browse any category to start your Explorer badge. ') + 'Status only, no perks.'));
    }
    cols.appendChild(bc);
    stack.appendChild(cols);

    if (cats.length) {
      var ec = el('div', 'lkh-card');
      var eh = el('div', 'lkh-head'); eh.appendChild(el('h3', null, 'Keep exploring'));
      var em = el('a', 'lkh-more', 'Open The Market'); em.href = '/the-market'; eh.appendChild(em);
      ec.appendChild(eh);
      var tiles = el('div', 'lkh-tiles');
      cats.forEach(function (c) {
        if (!c) return;
        var t = el('a', 'lkh-tile' + (c.explored ? ' done' : ''));
        t.href = '/the-market?category=' + encodeURIComponent(c.slug || '');
        t.appendChild(el('i', null, c.explored ? CHECK_ICO : catIco(c.id)));
        var nm = el('span'); nm.textContent = c.name || ''; t.appendChild(nm);
        tiles.appendChild(t);
      });
      ec.appendChild(tiles);
      stack.appendChild(ec);
    }

    // #66 — shoppers without a storefront still get the invitation, below
    // their own content and in the quiet style (they came here to shop).
    if (!state.hasStorefront) stack.appendChild(renderStorefrontCTA());

    pane.appendChild(stack);
    return pane;
  }

  // ── pane: Saved ────────────────────────────────────────────
  function renderSaved() {
    var pane = el('div', 'lk-pane'); pane.setAttribute('data-pane', 'saved');
    pane.appendChild(el('p', 'lk-intro', "Vendors you follow. Tap the heart on any storefront to follow it, and their market dates and news land here and in one email each Thursday."));
    if (!state.saved.length) {
      pane.appendChild(emptyState('Not following anyone yet', 'When you find a vendor you like, tap the heart to follow them.', 'Browse The Market', '/the-market'));
    } else {
      var grid = el('div', 'lkh-grid wide');
      state.saved.forEach(function (row) { grid.appendChild(savedRow(row)); });
      pane.appendChild(grid);
    }
    return pane;
  }

  // compact = Home preview: Message only, no unsave (that lives on Saved).
  function savedRow(row, compact) {
    var v = vendorOf(row);
    var vid = v.id != null ? v.id : row.vendors_id;
    var r = el('div', 'lk-row');
    var thumb = el('div', 'lk-thumb', esc(initials(vendorName(v)) || 'V'));
    thumbPhoto(thumb, v); // upgrade to the real profile photo when there is one
    r.appendChild(thumb);
    var info = el('div', 'lk-row-info');
    info.appendChild(el('div', 'lk-row-name', '<a href="' + esc(vendorHref(v)) + '">' + esc(vendorName(v)) + '</a>'));
    var sub = el('div', 'lk-row-sub');
    var cat = vendorCat(v);
    function paintSub() { var city = vendorArea(v); sub.innerHTML = (cat ? '<span class="cat">' + esc(cat) + '</span>' : '') + (city ? (cat ? ' · ' : '') + esc(city) : ''); }
    paintSub(); if (!_locNames) locNamesP().then(function () { if (sub.isConnected) paintSub(); });
    info.appendChild(sub);
    r.appendChild(info);
    var actions = el('div', 'lk-row-actions');
    // Message is the action that earns the vendor a lead, so it is ALWAYS
    // visible (the old Contact button was display:none under 640px). The
    // vendor name + photo are the link to the storefront.
    var msg = el('a', 'lk-btn primary', gIco(GI_MSG, 16) + '<span>Message</span>');
    msg.href = vendorHref(v) + '#contact';
    msg.setAttribute('aria-label', 'Message ' + vendorName(v));
    actions.appendChild(msg);
    if (!compact) {
      var heart = el('button', 'lk-heart', '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>');
      heart.type = 'button';
      heart.title = 'Unfollow';
      heart.setAttribute('aria-label', 'Unfollow ' + vendorName(v));
      heart.addEventListener('click', function () {
        heart.disabled = true;
        var at = state.saved.indexOf(row);
        api().request('favorites', 'DELETE', '/favorites/' + encodeURIComponent(vid), null, true).then(function (res) {
          if (res && res.error) { heart.disabled = false; toast('Couldn’t unfollow. Please try again.'); return; }
          state.saved = state.saved.filter(function (x) { return x !== row; });
          rerender();
          // Undo re-saves through the same endpoint the heart on a listing uses.
          toastAction('Unfollowed ' + vendorName(v), 'Undo', function () {
            api().request('favorites', 'POST', '/favorites', { vendors_id: vid }, true).then(function (r2) {
              if (r2 && r2.error) { toast('Couldn’t undo that. Follow them again from their page.'); return; }
              state.saved.splice(Math.min(Math.max(at, 0), state.saved.length), 0, row);
              rerender();
            });
          });
        });
      });
      actions.appendChild(heart);
    }
    r.appendChild(actions);
    return r;
  }

  // ── pane: Reviews ──────────────────────────────────────────
  function renderReviews() {
    var pane = el('div', 'lk-pane'); pane.setAttribute('data-pane', 'reviews');

    if (state.awaiting.length) {
      var ag = el('div', 'lk-group');
      ag.appendChild(el('div', 'lk-group-label', 'Awaiting your review'));
      ag.appendChild(el('p', 'lk-intro', 'You contacted these vendors. Sharing how it went helps other locals, and it helps the vendor too.'));
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
  var GI_HOME = '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>';
  var GI_GEAR = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';
  var GI_BAG = '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>';
  var GI_STORE = '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 20v-6h6v6"/>';
  var GI_MSG = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';
  // Hub navigation, in order. Settings is rail-only (gear button elsewhere).
  var HUB_NAV = [['home', 'Home', GI_HOME], ['saved', 'Following', GI_HEART], ['reviews', 'Reviews', GI_STAR], ['badges', 'Badges', GI_COMPASS], ['settings', 'Settings', GI_GEAR]];
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
    9: 'M3 22h18M6 18V11M10 18V11M14 18V11M18 18V11M2 9l10-6 10 6z', // Professional Services (#152)
    10: 'M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z' // Clothing & Accessories (#196, shirt)
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
      ? 'Every category explored. New vendors join weekly, so there’s always something new on the block.'
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
    pane.appendChild(el('p', 'lk-intro', "Badges you earn by being part of the neighborhood: exploring, reviewing, and spreading the word. Status only: they show on your profile and next to your reviews, nothing more."));
    var b = state.badges;
    if (!b) {
      pane.appendChild(emptyState('Badges couldn’t load', 'Give it a refresh. Your progress is safe.', 'Browse vendors', '/the-market'));
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
    else sub = '5 reviews shared. You’re a Neighborhood Regular. Your badge now shows on every review you write.';
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
      mini.appendChild(el('div', 'lkg-mini-rec', LK_FA.up + ' Recommends'));
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
    if (n === 0) sub = 'Be among the first 3 reviews on any vendor and you’re a Scout. New businesses join every week, and someone has to go first.';
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
    else sub = n + ' visitors and counting. You’re a Neighborhood Connector. Word of mouth is how neighborhoods grow.';
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
      ? 'Earned! The <strong>Neighborhood Connector</strong> badge now shows on your profile.'
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
  var REVIEW_OUR_FAULT = 'Something went wrong on our end and your review wasn’t saved. Please try again.';
  var REVIEW_ERRORS = {
    // Refusals the customer can act on.
    not_eligible:     'You can review a vendor once you’ve contacted them through Lokali. Use Call, Text, WhatsApp or “Send a message” on their page, then come back in about an hour.',
    already_reviewed: 'You’ve already reviewed this vendor. You can change it under “Your reviews” below.',
    self_review:      'You can’t review your own storefront.',
    comment_too_long: 'That review is a little long. Please trim it to 2,000 characters or fewer.',
    unauthorized:     'Your session expired. Please log in again and repost.',
    not_found:        'That vendor isn’t available right now.',
    // Ours, not theirs.
    review_failed:    REVIEW_OUR_FAULT,
    not_enabled:      REVIEW_OUR_FAULT,
    Forbidden:        REVIEW_OUR_FAULT
  };
  function reviewErrorMessage(code) {
    return REVIEW_ERRORS[code] || REVIEW_OUR_FAULT;
  }

  // ---- conduct tags (2026-10-30) --------------------------------------------
  // Mirror of the block in lokali-vendor-listing.js: tags live on the comment's
  // FIRST LINE joined by " · ", free text after a blank line. Keep the labels
  // and separator identical in both files or old reviews stop parsing as tags.
  var CONDUCT_TAGS = ['Showed up on time', 'Same person every visit', 'No surprise charges', 'Explained the options', 'Easy to reach'];
  var CONDUCT_SEP = ' · ';
  function encodeConduct(tags, text) {
    var t = (text || '').trim();
    if (!tags || !tags.length) return t;
    return tags.join(CONDUCT_SEP) + (t ? '\n\n' + t : '');
  }
  function parseConduct(comment) {
    var c = comment == null ? '' : String(comment);
    var nl = c.indexOf('\n');
    var first = (nl < 0 ? c : c.slice(0, nl)).trim();
    if (!first) return { tags: [], text: c.trim() };
    var parts = first.split(CONDUCT_SEP);
    for (var i = 0; i < parts.length; i++) {
      if (CONDUCT_TAGS.indexOf(parts[i].trim()) < 0) return { tags: [], text: c.trim() };
    }
    return { tags: parts.map(function (p) { return p.trim(); }), text: nl < 0 ? '' : c.slice(nl).trim() };
  }
  function conductChips(preset) {
    var wrap = el('div', 'lk-chips'); wrap.style.display = 'none';
    wrap.appendChild(el('div', 'lk-chips-l', 'What did they do well? Pick any that fit.'));
    var r = el('div', 'lk-chips-r');
    var picked = {};
    (preset || []).forEach(function (t) { picked[t] = true; });
    CONDUCT_TAGS.forEach(function (tag) {
      var b = el('button', null, esc(tag)); b.type = 'button';
      b.setAttribute('aria-pressed', picked[tag] ? 'true' : 'false');
      b.addEventListener('click', function () {
        picked[tag] = !picked[tag];
        b.setAttribute('aria-pressed', picked[tag] ? 'true' : 'false');
      });
      r.appendChild(b);
    });
    wrap.appendChild(r);
    return {
      el: wrap,
      show: function (on) { wrap.style.display = on ? '' : 'none'; },
      selected: function () { return CONDUCT_TAGS.filter(function (t) { return picked[t]; }); }
    };
  }
  function conductTagsEl(tags) {
    var w = el('div', 'lk-rev-tags');
    tags.forEach(function (t) { w.appendChild(el('span', 'lk-rev-tag', esc(t))); });
    return w;
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
    var yes = el('button', null, LK_FA.up + ' Would recommend');
    var no = el('button', null, LK_FA.down + ' Wouldn’t');
    var chips = conductChips();
    yes.addEventListener('click', function () { rec.val = true; yes.className = 'sel-yes'; no.className = ''; chips.show(true); });
    no.addEventListener('click', function () { rec.val = false; no.className = 'sel-no'; yes.className = ''; chips.show(false); });
    recRow.appendChild(yes); recRow.appendChild(no);
    comp.appendChild(recRow);
    comp.appendChild(chips.el);
    var ta = el('textarea', 'lk-ta'); ta.placeholder = 'How was your experience? (optional)'; ta.maxLength = 1880;
    comp.appendChild(ta);
    var foot = el('div', 'lk-composer-foot');
    var cancel = el('button', 'lk-btn ghost', 'Cancel');
    var submit = el('button', 'lk-btn primary', 'Post review');
    cancel.addEventListener('click', function () { comp.classList.remove('open'); });
    submit.addEventListener('click', function () {
      if (rec.val == null) { toast('Pick recommend or not first'); return; }
      submit.disabled = true;
      var body = encodeConduct(rec.val ? chips.selected() : [], ta.value);
      api().reviews.create({ vendors_id: vid, is_recommended: rec.val, comment: body }).then(function (res) {
        submit.disabled = false;
        if (res && res.error) { toast(reviewErrorMessage(res.error)); return; }
        state.awaiting = state.awaiting.filter(function (x) { return (vendorOf(x).id != null ? vendorOf(x).id : x.vendors_id) != vid; });
        // optimistic local add so it shows under "Your reviews"
        state.mine.unshift({ id: (res.data && res.data.id), vendors_id: vid, vendor: v, is_recommended: rec.val, comment: body, created_at: Date.now() });
        rerender(); toast('Thanks! Your review is live');
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
    var pc = parseConduct(row.comment);
    if (pc.tags.length) c.appendChild(conductTagsEl(pc.tags));
    if (pc.text) c.appendChild(el('div', 'lk-review-body', esc(pc.text)));
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
    var yes = el('button', rec.val ? 'sel-yes' : null, LK_FA.up + ' Would recommend');
    var no = el('button', !rec.val ? 'sel-no' : null, LK_FA.down + ' Wouldn’t');
    var pc = parseConduct(row.comment);
    var chips = conductChips(pc.tags);
    chips.show(rec.val);
    yes.addEventListener('click', function () { rec.val = true; yes.className = 'sel-yes'; no.className = ''; chips.show(true); });
    no.addEventListener('click', function () { rec.val = false; no.className = 'sel-no'; yes.className = ''; chips.show(false); });
    recRow.appendChild(yes); recRow.appendChild(no);
    card.appendChild(recRow);
    card.appendChild(chips.el);
    var ta = el('textarea', 'lk-ta'); ta.value = pc.text; ta.maxLength = 1880;
    card.appendChild(ta);
    var foot = el('div', 'lk-composer-foot');
    var cancel = el('button', 'lk-btn ghost', 'Cancel');
    var save = el('button', 'lk-btn primary', 'Save');
    cancel.addEventListener('click', function () { rerender(); });
    save.addEventListener('click', function () {
      save.disabled = true;
      var body = encodeConduct(rec.val ? chips.selected() : [], ta.value);
      api().reviews.update(row.id, { is_recommended: rec.val, comment: body }).then(function (res) {
        if (res && res.error) { save.disabled = false; toast('Could not save'); return; }
        row.is_recommended = rec.val; row.comment = body;
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
    avRow.appendChild(el('div', 'lk-set-help', 'Pick one for your dashboard, or stay with your initials.'));
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
    var tgLetter = toggleRow('The Neighborhood Edit', 'Our bi-monthly newsletter: vendor spotlights and what’s new on Lokali. Rare by design.', acc.notif_letter !== false);
    // 'Vendor replies' toggle removed 2026-10-19 (#214 gap 5): no such email exists.
    // Vendors answer inquiries from their own inbox, so Lokali never sees the reply
    // and cannot send one. The column stays; nothing reads it.
    var tgRemind = toggleRow('Review reminders', 'A gentle nudge to review a vendor a few days after you contact them.', acc.notif_review_reminders === true);
    // #185: weekly email about the vendors this person saved (default ON in
    // patch_vendor_posts.sql; the digest cron reads this flag).
    var tgSaved = toggleRow('Updates from vendors you follow', 'One email on Thursdays when a vendor you follow posts an update or where they will be. No email on quiet weeks.', acc.notif_saved_updates !== false);
    nc.appendChild(tgLetter.row); nc.appendChild(tgSaved.row); nc.appendChild(tgRemind.row);
    pane.appendChild(nc);

    var bar = el('div', 'lk-save-bar');
    bar.hidden = true; // appears on the first change (vendor Profile page pattern)
    bar.appendChild(el('span', null, 'You have unsaved changes'));
    function markDirty() { bar.hidden = false; }
    pane.addEventListener('input', markDirty);
    pane.addEventListener('lk-area-picked', markDirty);
    pane.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.lk-toggle,[data-av]') : null;
      if (t && pc.contains(t) || t && nc.contains(t)) markDirty();
    });
    var saveBtn = el('button', 'lk-btn primary', 'Save changes');
    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      api().account.update({
        first_name: firstIn.input.value.trim(),
        last_name: lastIn.input.value.trim(),
        region: areaIn.input.value.trim(),
        avatar: avatarSel,
        notif_letter: tgLetter.get(),
        notif_review_reminders: tgRemind.get(),
        notif_saved_updates: tgSaved.get()
      }).then(function (res) {
        saveBtn.disabled = false;
        // #129 (same defect, one line away): this toasted the raw server code too.
        if (res && res.error) { toast('Couldn’t save your changes. Please try again.'); return; }
        state.account.first_name = firstIn.input.value.trim();
        state.account.last_name = lastIn.input.value.trim();
        state.account.avatar = avatarSel;
        syncAcctCacheAvatar(avatarSel); // #79 — header chip on every page
        state.account.region = areaIn.input.value.trim();
        // refresh the header-band avatar in place
        var bandAv = document.querySelector('.lk-avatar');
        if (bandAv && bandAv.parentNode) bandAv.parentNode.replaceChild(avatarNode(state.account, 'lk-avatar'), bandAv);
        state.account.notif_letter = tgLetter.get();
        state.account.notif_review_reminders = tgRemind.get();
        state.account.notif_saved_updates = tgSaved.get();
        // #54 — mirror the newsletter flag to the Brevo list (best-effort; the
        // save already succeeded, so a Brevo hiccup must never surface here).
        try {
          var sa = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.account; // the mirror lives on the client, not the adapter
          if (sa && sa.syncNewsletter) sa.syncNewsletter();
        } catch (e) {}
        bar.hidden = true;
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
    delRow.innerHTML = '<div><div class="lk-set-label lk-danger">Delete account</div><div class="lk-set-help">Permanently removes your account and the vendors you follow. Reviews you wrote stay but lose your name. If you have a vendor listing, it and its reviews are deleted too. This can\'t be undone.</div></div>';
    var delWrap = el('div'); var delBtn = el('button', 'lk-btn danger', 'Delete');
    delWrap.appendChild(delBtn); delRow.appendChild(delWrap); ac.appendChild(delRow);

    // 58a — inline type-to-confirm; calls the Vercel delete route (Stripe
    // cancel -> backend purge -> auth-user delete), then signs out. Brand surfaces
    // only (no-ink rule) — light card, violet text, danger accents.
    var confirmBox = el('div', 'lk-del-confirm');
    confirmBox.style.cssText = 'display:none;padding:14px 16px;margin-top:2px;border:1px solid #F3D6D6;border-radius:12px;background:#FDF7F7;';
    confirmBox.innerHTML = '<div class="lk-set-help" style="margin-bottom:8px;">Type <b>DELETE</b> to confirm. Your sign-in, follows and any vendor listing are removed immediately.</div>';
    // 58k-D3 — founders only: deleting permanently forfeits the founding spot.
    if (state.isFounding) {
      var foundWarn = el('div', 'lk-set-help');
      foundWarn.style.cssText = 'margin:-4px 0 10px;padding:8px 10px;border-radius:8px;background:#FBEFD6;color:#9A6B00;font-weight:600;';
      foundWarn.textContent = 'Heads up: you’re a founding vendor. Deleting permanently retires your founding spot and its lifetime pricing. It can’t be undone or reclaimed.';
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
      ['privacy',                  'Privacy: I don’t want an account'],
      ['other',                    'Something else']
    ];
    var exitReason = '';
    var surveyWrap = el('div');
    surveyWrap.style.cssText = 'margin:2px 0 14px;padding-bottom:12px;border-bottom:1px solid #F3D6D6;';
    var sTitle = el('div', 'lk-set-help');
    sTitle.style.cssText = 'margin-bottom:8px;color:#4A4761;font-weight:600;';
    sTitle.textContent = 'Before you go: why are you leaving? (optional)';
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
          ? 'We couldn\'t close your subscription. Try again in a minute or contact us.'
          : 'Couldn\'t delete your account. Please try again or contact us.');
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
      renderSignedOut(mount);
      // Sign in / sign up happen in the LokaliAuth overlay without leaving the
      // page; a shopper stays on /account after it, so swap to the hub here.
      window.addEventListener('lokali:authed', function () {
        if (!hasToken() || mount.querySelector('.lkh,.lk-band')) return;
        mount.innerHTML = '<div class="lk-empty"><div class="lk-empty-title">Loading your account…</div></div>';
        loadAll().then(function () { render(mount); });
        window.addEventListener('hashchange', function () { show(currentPane()); });
      });
      return;
    }
    mount.innerHTML = '<div class="lk-empty"><div class="lk-empty-title">Loading your account…</div></div>';
    loadAll().then(function () { render(mount); });
    window.addEventListener('hashchange', function () { show(currentPane()); });
  }

  // ── signed-out /account (2026-10-14) ─────────────────────────
  // The old state was one dashed box with a stretched link. Now: a welcome
  // card that explains what the account is for, Sign in + Create an account
  // in the overlay (fallback: the /login and /sign-up pages), and the three
  // things a shopper gets. Create an account stamps the customer intent the
  // same way the header heart does, so the role gate is skipped.
  function renderSignedOut(mount) {
    var A = window.LokaliAuth;
    var wrap = el('div', 'lk-so');
    var card = el('div', 'lk-so-card');
    card.appendChild(el('div', 'lk-so-icon', gIco(GI_HEART, 26)));
    card.appendChild(el('h2', 'lk-so-title', 'Your Lokali account'));
    card.appendChild(el('p', 'lk-so-sub', 'Follow the makers and services you like, hear where they\u2019ll be each week, and keep your reviews in one place.'));
    var acts = el('div', 'lk-so-acts');
    var si = el('a', 'lk-btn primary', 'Sign in'); si.href = '/login';
    si.addEventListener('click', function (e) {
      if (A && typeof A.openSignIn === 'function') { e.preventDefault(); A.openSignIn({ source: 'account_page' }); }
    });
    var su = el('a', 'lk-btn ghost', 'Create an account'); su.href = '/sign-up';
    su.addEventListener('click', function (e) {
      try { sessionStorage.setItem('lokali_signup_intent', 'customer:' + Date.now()); } catch (err) {}
      if (A && typeof A.openSignUp === 'function') { e.preventDefault(); A.openSignUp({ intent: 'customer', source: 'account_page' }); }
    });
    acts.appendChild(si); acts.appendChild(su);
    card.appendChild(acts);
    var perks = el('div', 'lk-so-perks');
    [[GI_HEART, 'Following', 'Your favorite storefronts, and a note when they post something new.'],
     [GI_STAR, 'Reviews', 'Share how it went and help the next neighbor choose.'],
     [GI_COMPASS, 'Badges', 'Explore the Market and collect them as you go.']].forEach(function (p) {
      var it = el('div', 'lk-so-perk');
      it.innerHTML = '<i>' + gIco(p[0], 18) + '</i><div><b>' + esc(p[1]) + '</b><span>' + esc(p[2]) + '</span></div>';
      perks.appendChild(it);
    });
    card.appendChild(perks);
    wrap.appendChild(card);
    var foot = el('p', 'lk-so-foot', 'Have a storefront? <a href="/login">Sign in</a> to open your dashboard, or <a href="/for-vendors">see what Lokali does for vendors</a>.');
    wrap.appendChild(foot);
    mount.innerHTML = '';
    mount.appendChild(wrap);
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
