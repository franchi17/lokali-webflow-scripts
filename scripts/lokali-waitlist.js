/**
 * Lokali — City waitlist modal ("Request your city") with Google Places.
 *
 * Self-contained: injects its own CSS + modal (same pattern as lokali-mobile-nav),
 * so there's no Webflow form to build/style. Any element with id #wl-trigger or
 * attribute [data-lokali-waitlist] opens it. The city field is a Google Places
 * autocomplete constrained to cities — so picks resolve to a canonical
 * { city, state, country, place_id } (neighborhoods like "Alden Bridge" never
 * appear; "Montrose" won't match a city → nudges to "Houston"). On submit it
 * POSTs to the public Xano endpoint POST /waitlist (Contact group), which dedupes
 * by (email, place_id). No secrets here — the Maps key is referrer-restricted.
 *
 * The Google Maps key is NEVER committed here — set it as a global in Webflow
 * site-wide custom code (head):  <script>window.LOKALI_GMAPS_KEY='...';</script>
 * Same referrer-restricted key the profile page uses. Without it, the city field
 * gracefully degrades to a plain free-text input.
 *
 * Deploy: jsDelivr from this repo, site-wide footer (self-guards off-page).
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://x8ki-letl-twmt.n7.xano.io/api:oYK_cDmG/waitlist';
  // #46 — the modal opens from many pages now (about/home/market/contact), so
  // attribute each signup to the page it came from instead of a fixed string.
  var SOURCE = (function () {
    var p = (window.location.pathname || '/').toLowerCase();
    if (p.indexOf('/contact') === 0) return 'contact_page';
    if (p.indexOf('/the-market') === 0) return 'market_page';
    if (p.indexOf('/about') === 0) return 'about_page';
    if (p === '/' || p === '') return 'home_page';
    var seg = p.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return seg ? seg + '_page' : 'home_page';
  })();
  var GMAPS_KEY = (typeof window.LOKALI_GMAPS_KEY === 'string') ? window.LOKALI_GMAPS_KEY.trim() : '';
  var TRIGGER_SEL = '#wl-trigger, [data-lokali-waitlist]';

  var built = false, mapsReady = false, mapsLoading = false, ac = null;
  var picked = null; // { city, state, country, place_id, label }

  function $(id) { return document.getElementById(id); }

  function injectCSS() {
    if ($('lok-wl-css')) return;
    var css = ''
      + '.lok-wl-back{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;'
      + 'background:rgba(26,18,48,.55);backdrop-filter:blur(3px);padding:20px;}'
      + '.lok-wl-back.open{display:flex;}'
      + '.lok-wl-card{position:relative;width:100%;max-width:440px;background:#fff;border-radius:20px;'
      + "box-shadow:0 24px 70px rgba(40,20,90,.35);overflow:visible;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;animation:lokWlIn .22s ease;}"
      + '@keyframes lokWlIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}'
      + '.lok-wl-top{height:6px;border-radius:20px 20px 0 0;background:linear-gradient(90deg,#B39AFD,#8B6CF0,#EEC1FF);}'
      + '.lok-wl-body{padding:30px 30px 28px;}'
      + '.lok-wl-x{position:absolute;top:14px;right:16px;border:0;background:transparent;font-size:24px;line-height:1;color:#9990ad;cursor:pointer;padding:4px;}'
      + '.lok-wl-x:hover{color:#5a4b78;}'
      + '.lok-wl-eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8B6CF0;font-weight:700;margin:0 0 6px;}'
      + '.lok-wl-h{font-size:23px;line-height:1.2;color:#1f1638;font-weight:700;margin:0 0 8px;}'
      + '.lok-wl-sub{font-size:14.5px;line-height:1.5;color:#5d5470;margin:0 0 20px;}'
      + '.lok-wl-field{margin:0 0 13px;}'
      + '.lok-wl-field label{display:block;font-size:12.5px;font-weight:600;color:#3d3357;margin:0 0 5px;}'
      + '.lok-wl-field input{width:100%;box-sizing:border-box;padding:11px 13px;border:1.5px solid #e4def2;border-radius:11px;font-size:15px;color:#1f1638;background:#faf8ff;outline:none;transition:border-color .15s;}'
      + '.lok-wl-field input:focus{border-color:#8B6CF0;background:#fff;}'
      + '.lok-wl-picked{font-size:12.5px;color:#1d9e75;margin:6px 2px 0;display:none;}'
      + '.lok-wl-picked.show{display:block;}'
      + '.lok-wl-roles{display:flex;gap:8px;margin:0 0 18px;}'
      + '.lok-wl-role{flex:1;text-align:center;padding:9px 6px;border:1.5px solid #e4def2;border-radius:11px;font-size:13.5px;font-weight:600;color:#5d5470;background:#faf8ff;cursor:pointer;transition:all .15s;}'
      + '.lok-wl-role.on{border-color:#8B6CF0;background:#efe9ff;color:#5a3fc0;}'
      + '.lok-wl-btn{width:100%;border:0;border-radius:12px;padding:13px;font-size:15.5px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(90deg,#8B6CF0,#A45FE8);box-shadow:0 8px 20px rgba(139,108,240,.35);transition:filter .15s;}'
      + '.lok-wl-btn:hover{filter:brightness(1.06);}.lok-wl-btn:disabled{opacity:.6;cursor:default;}'
      + '.lok-wl-msg{font-size:13.5px;margin:12px 0 0;display:none;}.lok-wl-msg.err{color:#c0392b;display:block;}'
      + '.lok-wl-done{text-align:center;padding:8px 0 4px;}.lok-wl-done .em{font-size:40px;line-height:1;display:block;margin:0 0 14px;}'
      + '.lok-wl-done h3{font-size:21px;color:#1f1638;margin:0 0 8px;font-weight:700;}'
      + '.lok-wl-done p{font-size:14.5px;color:#5d5470;line-height:1.5;margin:0 0 22px;}'
      + ".pac-container{z-index:10001 !important;border-radius:12px;margin-top:4px;box-shadow:0 12px 30px rgba(40,20,90,.22);font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}";
    var s = document.createElement('style');
    s.id = 'lok-wl-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function build() {
    if (built) return;
    injectCSS();
    var back = document.createElement('div');
    back.className = 'lok-wl-back';
    back.id = 'lok-wl-back';
    back.innerHTML =
      '<div class="lok-wl-card" role="dialog" aria-modal="true" aria-label="Request your city">'
      + '<div class="lok-wl-top"></div>'
      + '<button class="lok-wl-x" type="button" aria-label="Close">&times;</button>'
      + '<div class="lok-wl-body">'
      +   '<div id="lok-wl-form-wrap">'
      +     '<p class="lok-wl-eyebrow">Where we go next</p>'
      +     '<h2 class="lok-wl-h">Request your city</h2>'
      +     '<p class="lok-wl-sub">Tell us where you want Lokali next. We use every request to shape our expansion map — and we’ll let you know the moment we reach you.</p>'
      +     '<form id="lokali-waitlist-form" novalidate autocomplete="off">'
      +       '<div class="lok-wl-field"><label for="wl-email">Email</label>'
      +         '<input id="wl-email" name="email" type="email" autocomplete="email" placeholder="you@example.com"></div>'
      +       '<div class="lok-wl-field"><label for="wl-city">Your city</label>'
      +         '<input id="wl-city" name="city" type="text" autocomplete="off" placeholder="Start typing your city…">'
      +         '<p id="wl-picked" class="lok-wl-picked"></p></div>'
      +       '<div class="lok-wl-roles" role="group" aria-label="I am a">'
      +         '<div class="lok-wl-role on" data-role="customer">I’m a neighbor</div>'
      +         '<div class="lok-wl-role" data-role="vendor">I’m a vendor</div></div>'
      +       '<input id="wl-role" type="hidden" value="customer">'
      +       '<button id="wl-submit" class="lok-wl-btn" type="submit">Add me to the list</button>'
      +       '<p id="wl-error" class="lok-wl-msg">Something went wrong. Please try again.</p>'
      +     '</form>'
      +   '</div>'
      +   '<div id="lok-wl-done" class="lok-wl-done" style="display:none;">'
      +     '<span class="em">🎉</span><h3>You’re on the list!</h3>'
      +     '<p id="wl-done-msg">We’ll tell you the moment Lokali reaches your area.</p>'
      +     '<button class="lok-wl-btn" type="button" id="wl-done-close">Done</button>'
      +   '</div>'
      + '</div></div>';
    document.body.appendChild(back);
    built = true;

    var form = $('lokali-waitlist-form');
    var hp = document.createElement('input');
    hp.type = 'text'; hp.name = 'company_website'; hp.tabIndex = -1;
    hp.setAttribute('autocomplete', 'off'); hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute;left:-9999px;height:0;width:0;opacity:0;';
    form.appendChild(hp);
    form._hp = hp;

    back.querySelectorAll('.lok-wl-role').forEach(function (r) {
      r.addEventListener('click', function () {
        back.querySelectorAll('.lok-wl-role').forEach(function (x) { x.classList.remove('on'); });
        r.classList.add('on');
        $('wl-role').value = r.getAttribute('data-role');
      });
    });

    // Typing again invalidates a prior pick (so we don't submit a stale place).
    $('wl-city').addEventListener('input', function () {
      picked = null;
      var p = $('wl-picked'); p.classList.remove('show'); p.textContent = '';
    });

    back.querySelector('.lok-wl-x').addEventListener('click', close);
    $('wl-done-close').addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); e.stopImmediatePropagation(); submit(form); }, true);
  }

  // ── Google Maps loader (once) ──────────────────────────────────────────────
  function loadMaps() {
    if (mapsReady) { initAC(); return; }
    if (window.google && window.google.maps && window.google.maps.places) { mapsReady = true; initAC(); return; }
    if (mapsLoading) return;
    if (!GMAPS_KEY) { // no key — city field stays a plain text input
      if (window.console) console.warn('[lokali-waitlist] window.LOKALI_GMAPS_KEY not set — city autocomplete disabled (free-text fallback).');
      return;
    }
    mapsLoading = true;
    window.__lokWlMapsReady = function () { mapsReady = true; initAC(); };
    var existing = document.querySelector('script[data-lok-wl-maps]');
    if (existing) return;
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GMAPS_KEY) + '&libraries=places&callback=__lokWlMapsReady';
    s.async = true; s.defer = true; s.setAttribute('data-lok-wl-maps', '1');
    s.onerror = function () { mapsLoading = false; }; // stays free-text
    document.head.appendChild(s);
  }

  function comp(list, type, useShort) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].types && list[i].types.indexOf(type) > -1) return useShort ? list[i].short_name : list[i].long_name;
    }
    return '';
  }

  function initAC() {
    var input = $('wl-city');
    if (!input || ac || !(window.google && google.maps && google.maps.places)) return;
    try {
      ac = new google.maps.places.Autocomplete(input, {
        types: ['(cities)'],
        fields: ['address_components', 'place_id', 'formatted_address', 'name']
      });
      ac.addListener('place_changed', function () {
        var pl = ac.getPlace();
        if (!pl || !pl.place_id) return;
        var c = pl.address_components || [];
        var city = comp(c, 'locality', false) || comp(c, 'postal_town', false)
          || comp(c, 'administrative_area_level_3', false) || comp(c, 'sublocality', false) || (pl.name || '');
        picked = {
          city: city,
          state: comp(c, 'administrative_area_level_1', true),
          country: comp(c, 'country', true),
          place_id: pl.place_id,
          label: pl.formatted_address || (pl.name || city)
        };
        var p = $('wl-picked');
        p.textContent = '✓ ' + (picked.label || city);
        p.classList.add('show');
        var err = $('wl-error'); err.classList.remove('err');
      });
    } catch (e) { /* free-text fallback */ }
  }

  function open() {
    build();
    $('lok-wl-form-wrap').style.display = '';
    $('lok-wl-done').style.display = 'none';
    $('lok-wl-back').classList.add('open');
    loadMaps();
    setTimeout(function () { var e = $('wl-email'); if (e) e.focus(); }, 40);
  }
  function close() { var b = $('lok-wl-back'); if (b) b.classList.remove('open'); }

  function v(id) { var el = $(id); return el ? el.value.trim() : ''; }

  function submit(form) {
    var err = $('wl-error'); err.classList.remove('err');
    if (form._hp && form._hp.value) { return; } // honeypot

    var email = v('wl-email');
    if (!email || email.indexOf('@') < 1) return showErr('Please enter a valid email address.');

    var typed = v('wl-city');
    if (!typed) return showErr('Please tell us your city.');
    // When Maps is available, require a real selection so the data stays clean.
    if (mapsReady && !picked) return showErr('Please choose your city from the suggestions.');

    var data = picked
      ? { email: email, city: picked.city, state: picked.state, country: picked.country,
          place_id: picked.place_id, place_label: picked.label, role: v('wl-role') || 'customer', source: SOURCE }
      : { email: email, city: typed, role: v('wl-role') || 'customer', source: SOURCE }; // free-text fallback

    var city = data.city;
    var btn = $('wl-submit'); btn.disabled = true; btn.textContent = 'Adding…';
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; })
      .then(function (ok) {
        btn.disabled = false; btn.textContent = 'Add me to the list';
        if (ok) {
          $('wl-done-msg').textContent = 'We’ll tell you the moment Lokali reaches ' + city + '.';
          $('lok-wl-form-wrap').style.display = 'none';
          $('lok-wl-done').style.display = 'block';
          form.reset(); picked = null;
          var p = $('wl-picked'); p.classList.remove('show'); p.textContent = '';
          var cust = document.querySelector('.lok-wl-role[data-role="customer"]'); if (cust) cust.click();
        } else { showErr('Something went wrong. Please try again.'); }
      });
  }

  function showErr(m) {
    var err = $('wl-error'); if (err) { err.textContent = m; err.classList.add('err'); }
    var btn = $('wl-submit'); if (btn) { btn.disabled = false; btn.textContent = 'Add me to the list'; }
    return false;
  }

  // #56 — one DELEGATED listener instead of per-element binding, so CTAs that
  // render AFTER DOMContentLoaded (The Market's code-island "Request your
  // city →" button, any future injected card) open the modal too. The
  // code-island anchor can't carry [data-lokali-waitlist] (its markup is a
  // component prop), so it's matched by its text as a deliberate fallback.
  function isCityCta(el) {
    if (el.closest && el.closest(TRIGGER_SEL)) return true;
    var a = el.closest ? el.closest('a[href="#"], a[href=""]') : null;
    if (!a) return false;
    var txt = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return txt.indexOf('request your city') === 0 || txt.indexOf("don't see your city") === 0 || txt.indexOf('don’t see your city') === 0;
  }

  document.addEventListener('click', function (e) {
    // The Market's "Request your city →" lives inside a code-island's OPEN
    // shadow root: document-level e.target is retargeted to the island host,
    // so resolve the REAL click target through composedPath() first.
    var el = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!el || el.nodeType !== 1 || !isCityCta(el)) return;
    e.preventDefault();
    open();
  }, true);
})();
