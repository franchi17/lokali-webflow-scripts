/* lokali-rsvp.js — RSVP page for vendor gatherings (#195, first use: Nov 5 2026).
 *
 * The /rsvp Webflow page is a DUPLICATE of /contact-us (made 2026-10-08 via the API, which
 * cannot build page bodies): it ships with the contact header + form markup and the
 * lok-cf-* styles. This script, loaded by the site footer's path-gated loader on /rsvp only,
 * rewrites that section into the RSVP form (same classes, so the page CSS styles it), owns
 * the submit (capture + stopImmediatePropagation, like lokali-contact.js), POSTs JSON to
 * /api/lokali/rsvp, and prefills name / email / business for a signed-in vendor.
 * Event key = ?e= (default nov5-2026). Fields: name, email, business, attending, storefront.
 * No "what do you need help with": that is for the room (F 2026-10-08).
 *
 * 2026-11-13: Content Day is PHOTOS ONLY (F). The interest question is now yes ('photos') / 'not_this_time';
 *   'video' and 'both' stay valid on the server for the old answers but are no longer offered.
 * 2026-11-09: events with kind 'interest' (first: content-day-2027, the February 2027 Content
 * Day from Circle issue 3) keep name / email / business and ask three choices instead of
 * attending + storefront: interest (photos / video / both / not this time), timing (weekday /
 * Saturday / either), sponsor (yes / maybe / no), plus an optional 300-char note. Same route,
 * same honeypot, same signed change link (SEC-095). The Nov 5 form is unchanged.
 */
(function () {
  'use strict';
  if (!/^\/rsvp(\/|$)/.test(String(window.location.pathname || ''))) return;

  var ENDPOINT = (function () {
    var base = window.LOKALI_VERCEL_API_BASE ||
      (window.LOKALI_AUTH_SYNC_URL ? String(window.LOKALI_AUTH_SYNC_URL).replace(/\/(auth-sync|clerk-sync)\/?$/, '') : '');
    if (base) return base.replace(/\/$/, '') + '/rsvp';
    return 'https://lokali-api.vercel.app/api/lokali/rsvp';
  })();

  var EVENTS = {
    'nov5-2026': {
      eyebrow: "You're invited",
      title: "Lokali's first Vendor Circle gathering",
      body: 'Thursday, November 5, 5 p.m. - 7 p.m. at Mia’s Table, 18450 I-45 South, Shenandoah. Vendors only. Let me know by October 29.',
      photo: 'https://cdn.jsdelivr.net/gh/franchi17/lokali-webflow-scripts@4169b72f4493/assets/mias-table-shakes.jpg',
      day: 'Thursday', date: 'November 5', time: '5 p.m. - 7 p.m.',
      venue: 'Mia\u2019s Table', address: '18450 I-45 South, Shenandoah',
      caps: 'Vendors only \u00b7 Mia\u2019s menu if you\u2019re hungry',
      deadline: 'Save your seat by Thursday, October 29',
      calendar: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Lokali%20Vendor%20Circle%20gathering%20at%20Mia%27s%20Table&dates=20261105T230000Z/20261106T010000Z&location=Mia%27s%20Table%2C%2018450%20I-45%20S%2C%20Shenandoah%2C%20TX%2077384&details=Lokali%27s%20first%20Vendor%20Circle%20gathering.%20Vendors%20only.'
    },
    // Content Day interest (not an RSVP: nothing is booked yet). No photo, no calendar link, and
    // no studio or crew named on purpose: F decides those after the answers are in.
    'content-day-2027': {
      kind: 'interest',
      eyebrow: 'Would you come to',
      title: 'Lokali Content Day',
      day: 'February', date: '2027', time: 'Date to come',
      venue: 'A studio in the area', address: 'A short photo session with a photographer who shoots for businesses: professional photos of you and your work for your storefront and Instagram. Done together, it costs each of us a fraction of booking it alone.',
      caps: 'Vendors only · Nothing is booked yet',
      deadline: 'Tell me if you would come and I will price the day'
    }
  };
  var key = (function () { try { return (new URLSearchParams(window.location.search).get('e') || 'nov5-2026').toLowerCase(); } catch (e) { return 'nov5-2026'; } })();
  var EV = EVENTS[key] || EVENTS['nov5-2026']; if (!EVENTS[key]) key = 'nov5-2026';

  function $(id) { return document.getElementById(id); }
  var changeToken = '';
  var styled = false;
  function injectStyles() {
    if (styled) return; styled = true;
    var css = document.createElement('style');
    css.textContent =
      '.lk-rsvp-hero{padding:36px 16px 8px!important;}' +
      '.lk-inv{max-width:560px;margin:0 auto;background:#EFE5FD;border-radius:22px;padding:14px;box-shadow:0 10px 36px rgba(43,26,74,.10);font-family:"Plus Jakarta Sans",Helvetica,Arial,sans-serif;}' +
      '.lk-inv-frame{border:1px solid #C9B3F2;border-radius:14px;overflow:hidden;}' +
      '.lk-inv-photo{display:block;width:100%;height:auto;aspect-ratio:2/1;object-fit:cover;}' +
      '.lk-inv-body{padding:34px 36px 32px;text-align:center;}' +
      '.lk-inv-caps{margin:0 0 12px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#6002EE;}' +
      '.lk-inv-caps-dark{color:#4A4761;margin-bottom:4px;}' +
      '.lk-inv-caps-sm{font-size:12px;letter-spacing:.14em;margin:0 0 22px;}' +
      '.lk-inv-title{margin:0 0 20px;font-size:30px;line-height:1.18;font-weight:800;color:#1A1829;letter-spacing:-.01em;text-wrap:balance;}' +
      '.lk-inv-rule{width:56px;height:2px;background:#6002EE;margin:0 auto 22px;}' +
      '.lk-inv-date{margin:0;font-size:60px;line-height:1;font-weight:800;color:#1A1829;letter-spacing:-.02em;}' +
      '.lk-inv-time{margin:10px 0 22px;font-size:18px;line-height:1.5;font-weight:700;color:#1A1829;}' +
      '.lk-inv-venue{margin:0 0 4px;font-size:17px;line-height:1.5;font-weight:800;color:#1A1829;}' +
      '.lk-inv-addr{margin:0 0 6px;font-size:14px;line-height:1.6;color:#4A4761;}' +
      '.lk-inv-deadline{margin:0;font-size:13px;line-height:1.6;color:#4A4761;}' +
      '.lk-inv-deadline a{color:#6002EE;font-weight:600;text-decoration:underline;}' +
      '.lk-inv-formlead{margin:0 0 18px;font-size:15px;line-height:1.6;color:#4A4761;text-align:center;}' +
      '.lk-inv-formlead b{color:#1A1829;}' +
      '.lk-rg{margin:0 0 18px;}' +
      '.lk-rg-opts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}' +
      '.lk-rg-opt{position:relative;}' +
      '.lk-rg-opt input{position:absolute;opacity:0;width:0;height:0;}' +
      '.lk-rg-opt span{display:inline-block;padding:9px 14px;border:1px solid #C9B3F2;border-radius:999px;background:#fff;color:#1A1829;font-size:14px;line-height:1.3;font-weight:600;cursor:pointer;font-family:"Plus Jakarta Sans",Helvetica,Arial,sans-serif;}' +
      '.lk-rg-opt input:checked+span{background:#6002EE;border-color:#6002EE;color:#fff;}' +
      '.lk-rg-opt input:focus-visible+span{outline:2px solid #6002EE;outline-offset:2px;}' +
      '.lk-rg-note{width:100%;min-height:84px;resize:vertical;}' +
      '@media (max-width:480px){.lk-inv{padding:10px;}.lk-inv-body{padding:28px 20px 26px;}.lk-inv-title{font-size:26px;}.lk-inv-date{font-size:44px;}.lk-inv-caps-sm{font-size:11px;letter-spacing:.1em;}}';
    document.head.appendChild(css);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }

  function init() {
    var form = $('lokali-contact-form');
    if (!form) return;
    // header copy (the duplicated contact page's intro section)
    var sec = document.querySelector('.section-14');
    if (sec) {
      injectStyles();
      sec.className = 'section-14 lk-rsvp-hero';
      sec.innerHTML =
        '<div class="lk-inv">' +
          '<div class="lk-inv-frame">' +
            (EV.photo ? '<img class="lk-inv-photo" src="' + EV.photo + '" alt="">' : '') +
            '<div class="lk-inv-body">' +
              '<p class="lk-inv-caps">' + esc(EV.kind === 'interest' ? EV.eyebrow : 'You are invited to') + '</p>' +
              '<h1 class="lk-inv-title">' + esc(EV.title) + '</h1>' +
              '<div class="lk-inv-rule"></div>' +
              '<p class="lk-inv-caps lk-inv-caps-dark">' + esc(EV.day) + '</p>' +
              '<p class="lk-inv-date">' + esc(EV.date) + '</p>' +
              '<p class="lk-inv-time">' + esc(EV.time) + '</p>' +
              '<div class="lk-inv-rule"></div>' +
              '<p class="lk-inv-venue">' + esc(EV.venue) + '</p>' +
              '<p class="lk-inv-addr">' + esc(EV.address) + '</p>' +
              '<p class="lk-inv-caps lk-inv-caps-sm">' + esc(EV.caps) + '</p>' +
              '<p class="lk-inv-deadline">' + esc(EV.deadline) + (EV.calendar ? ' &middot; <a href="' + EV.calendar + '" target="_blank" rel="noopener">Add to calendar</a>' : '') + '</p>' +
            '</div>' +
          '</div>' +
        '</div>';
      var formWrap = document.querySelector('.lok-cf');
      if (formWrap) {
        var lead = document.createElement('p');
        lead.className = 'lk-inv-formlead';
        lead.innerHTML = EV.kind === 'interest'
          ? '<b>Four quick answers.</b> They decide how big a studio I book, and on which day.'
          : '<b>Save your seat.</b> Ten seconds, and Mia\u2019s Table knows how many to expect.';
        var inner = formWrap.querySelector('.lok-cf-inner') || formWrap;
        inner.insertBefore(lead, inner.firstChild);
      }
    }
    try { document.title = (EV.kind === 'interest' ? 'Content Day' : 'RSVP') + ' | Lokali'; } catch (e) {}

    // The success / error blocks sit INSIDE the form on the duplicated page (the contact form
    // keeps them there), so the innerHTML rewrite below would delete them. Lift them out first.
    // Found 2026-11-09 on the Content Day form: without this no message ever shows after a submit.
    var done = $('cf-success'), err = $('cf-error');
    var wrapEl = form.parentElement;
    if (wrapEl) {
      if (done && form.contains(done)) wrapEl.appendChild(done);
      if (err && form.contains(err)) wrapEl.appendChild(err);
    }
    form.id = 'lokali-rsvp-form'; form.setAttribute('name', 'lokali-rsvp-form'); form.removeAttribute('data-lokali-contact');
    var head =
      '<div class="lok-cf-row">' +
        '<div class="lok-cf-field"><label for="rs-name" class="lok-cf-label">Your name</label><input class="lok-cf-input w-input" maxlength="100" name="name" id="rs-name" type="text" placeholder="First and last" required autocomplete="name"></div>' +
        '<div class="lok-cf-field"><label for="rs-email" class="lok-cf-label">Email</label><input class="lok-cf-input w-input" maxlength="200" name="email" id="rs-email" type="email" placeholder="you@example.com" required autocomplete="email"></div>' +
      '</div>' +
      '<div class="lok-cf-field"><label for="rs-business" class="lok-cf-label">Your business</label><input class="lok-cf-input w-input" maxlength="120" name="business" id="rs-business" type="text" placeholder="The name customers know" autocomplete="organization"></div>';
    function radios(name, label, opts) {
      return '<div class="lok-cf-field lk-rg" role="radiogroup" aria-labelledby="rs-' + name + '-l"><span id="rs-' + name + '-l" class="lok-cf-label">' + label + '</span><div class="lk-rg-opts">' +
        opts.map(function (o) { return '<label class="lk-rg-opt"><input type="radio" name="' + name + '" value="' + o[0] + '"><span>' + o[1] + '</span></label>'; }).join('') +
        '</div></div>';
    }
    form.innerHTML = EV.kind === 'interest'
      ? head +
        radios('interest', 'Would you come for photos?', [['photos', 'Yes, count me in'], ['not_this_time', 'Not this time']]) +
        radios('timing', 'Which day works for you?', [['weekday', 'A weekday'], ['saturday', 'A Saturday'], ['either', 'Either']]) +
        radios('sponsor', 'Would your business sponsor the day?', [['yes', 'Yes, let’s talk'], ['maybe', 'Maybe'], ['no', 'Not this time']]) +
        '<div class="lok-cf-field"><label for="rs-note" class="lok-cf-label">What would you want photographed or filmed? <span class="lok-cf-opt">(optional)</span></label><textarea class="lok-cf-input w-input lk-rg-note" maxlength="300" name="note" id="rs-note" placeholder="Your products, you at work, your space, a short clip talking about what you do"></textarea></div>' +
        '<input id="rs-submit" type="submit" class="lok-cf-btn w-button" value="Send my answers">'
      : head +
        '<div class="lok-cf-field"><label for="rs-attending" class="lok-cf-label">Will you be there?</label><select id="rs-attending" name="attending" class="lok-cf-select w-select" required><option value="">Choose one</option><option value="yes">Yes, count me in</option><option value="no">I can’t make it this time</option></select></div>' +
        '<div class="lok-cf-field"><label for="rs-storefront" class="lok-cf-label">Is your storefront live on Lokali?</label><select id="rs-storefront" name="storefront" class="lok-cf-select w-select" required><option value="">Choose one</option><option value="live">Yes, it’s live</option><option value="not_yet">Not yet, I’m setting it up</option><option value="none">I don’t have one yet</option></select>' +
          '<p class="lok-cf-hint">The gathering is for Lokali vendors. If a friend forwarded this and you’d like a storefront, <a href="/sign-up">it’s free to open one</a>.</p></div>' +
        '<input id="rs-submit" type="submit" class="lok-cf-btn w-button" value="Save my seat">';

    if (done) { done.id = 'rs-success'; done.style.display = 'none'; }
    if (err) { err.id = 'rs-error'; err.style.display = 'none'; }

    // honeypot (injected, like the contact form)
    var hp = document.createElement('input');
    hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1; hp.setAttribute('autocomplete', 'off'); hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;height:0;width:0;opacity:0;';
    form.appendChild(hp);

    form.addEventListener('submit', function (e) { e.preventDefault(); e.stopImmediatePropagation(); submit(form, hp); }, true);

    // prefill from the confirmation email's change links (?email=&name=&business=&sf=&a=yes|no&t=):
    // SEC-095 (2026-10-10): `t` is the signed token from that person's own email. Only a submit
    // carrying it may change an existing answer; without it the server leaves the row alone and
    // emails the owner their own links instead (see the pending_link branch below).
    try {
      var q = new URLSearchParams(window.location.search);
      changeToken = q.get('t') || '';
      var setv = function (id, v) { var el = $(id); if (el && v && !el.value) el.value = v; };
      setv('rs-name', q.get('name')); setv('rs-email', q.get('email')); setv('rs-business', q.get('business'));
      var sf = q.get('sf'); if (sf && ['live','not_yet','none'].indexOf(sf) >= 0 && $('rs-storefront')) $('rs-storefront').value = sf;
      var a = q.get('a'); if (a && $('rs-attending')) $('rs-attending').value = a === 'no' ? 'no' : 'yes';
      if (EV.kind === 'interest') {
        ['interest', 'timing', 'sponsor'].forEach(function (n) {
          var v = q.get(n); if (!v) return;
          var r = form.querySelector('input[name="' + n + '"][value="' + v.replace(/[^a-z_]/g, '') + '"]'); if (r) r.checked = true;
        });
        if (q.get('email') && $('rs-submit')) $('rs-submit').value = 'Save my answers';
      } else if (q.get('email') && $('rs-submit')) $('rs-submit').value = a === 'no' ? 'Save: I can\u2019t make it' : 'Save my answer';
    } catch (e) {}
    // prefill for a signed-in vendor (best effort, never blocks the form)
    try {
      if (window.LokaliSupabaseReady && window.LokaliSupabaseReady.then) {
        window.LokaliSupabaseReady.then(function (c) {
          var API = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.vendors;
          if (!API || !API.me || !c || !c.auth || !c.auth.getSession) return;
          // only ask for the profile when there IS a session: signed out, get_my_vendor() is a 401
          return c.auth.getSession().then(function (sr) {
            if (!sr || !sr.data || !sr.data.session) return;
            return API.me();
          }).then(function (r) {
            var v = r && r.data; if (!v || !v.id) return;
            if ($('rs-business') && !$('rs-business').value) $('rs-business').value = v.business_name || '';
            if ($('rs-name') && !$('rs-name').value) $('rs-name').value = v.owner_name || '';
            if ($('rs-email') && !$('rs-email').value) $('rs-email').value = v.contact_email || '';
            if ($('rs-storefront') && !$('rs-storefront').value && v.slug && v.is_active !== false) $('rs-storefront').value = 'live';
          });
        }).catch(function () {});
      }
    } catch (e) {}
  }

  // The duplicated contact page keeps Webflow's .w-form-done / .w-form-fail wrappers around
  // the two message blocks, and Webflow CSS hides those wrappers. Toggle the wrapper too, or
  // the message is set but never seen (F's first live test, 2026-10-08: a blank card).
  function show(which, text) {
    var ok = $('rs-success'), bad = $('rs-error');
    function wrap(el, on) {
      if (!el) return;
      el.style.display = on ? 'block' : 'none';
      var w = el.parentElement;
      if (w && /\bw-form-(done|fail)\b/.test(w.className)) w.style.display = on ? 'block' : 'none';
    }
    wrap(ok, which === 'ok'); wrap(bad, which === 'bad');
    if (ok && which === 'ok' && text) ok.innerHTML = text;
    if (bad && which === 'bad' && text) bad.textContent = text;
  }

  function picked(form, name) { var r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }

  function submitInterest(form, hp) {
    show(null);
    if (hp && hp.value) return;
    var data = {
      event: key,
      name: (($('rs-name') || {}).value || '').trim(), email: (($('rs-email') || {}).value || '').trim(),
      business: (($('rs-business') || {}).value || '').trim(),
      interest: picked(form, 'interest'), timing: picked(form, 'timing'), sponsor: picked(form, 'sponsor'),
      note: (($('rs-note') || {}).value || '').trim().slice(0, 300)
    };
    if (changeToken) data.t = changeToken;
    if (!data.name) return show('bad', 'Please enter your name.');
    if (!data.email || data.email.indexOf('@') < 1) return show('bad', 'Please enter a valid email address.');
    if (!data.interest) return show('bad', 'Tell me if you would come: yes, or not this time.');
    if (!data.timing) return show('bad', 'One more: a weekday, a Saturday, or either?');
    if (!data.sponsor) return show('bad', 'Last one: would your business sponsor the day?');
    var btn = $('rs-submit'), label = btn ? btn.value : null;
    if (btn) { btn.disabled = true; btn.value = 'Sending…'; }
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (btn) { btn.disabled = false; btn.value = label; }
        if (!res.ok) {
          return show('bad', res.j && res.j.error === 'rate_limited' ? 'Too many tries in a row. Give it an hour, or reply to the Circle email.' : 'Something went wrong. Please try again, or reply to the Circle email with your answers.');
        }
        form.style.display = 'none';
        if (res.j && res.j.pending_link) {
          return show('ok', '<b>I already have answers from ' + esc(data.email) + '.</b> To change them, use the link in the email we just sent to that address (check spam too). Nothing changed yet.');
        }
        var first = esc(data.name.split(/\s+/)[0]);
        if (data.interest === 'not_this_time') {
          show('ok', '<b>Noted, ' + first + '. Thank you for telling me.</b> That helps me plan just as much as a yes. A short note is on its way to ' + esc(data.email) + ' with a link in case your mind changes.');
        } else {
          show('ok', '<b>Got it, ' + first + '. You are on the Content Day list.</b> Once I know how many of us are coming, I will price the studio and the photographer and come back with a date and a cost per person. A copy of your answers is on its way to ' + esc(data.email) + '.');
        }
      })
      .catch(function () { if (btn) { btn.disabled = false; btn.value = label; } show('bad', 'Something went wrong. Please try again, or reply to the Circle email with your answers.'); });
  }

  function submit(form, hp) {
    if (EV.kind === 'interest') return submitInterest(form, hp);
    show(null);
    if (hp && hp.value) return;
    var data = {
      event: key,
      name: ($('rs-name') || {}).value || '', email: ($('rs-email') || {}).value || '',
      business: ($('rs-business') || {}).value || '',
      attending: (($('rs-attending') || {}).value || '') === 'yes',
      storefront: ($('rs-storefront') || {}).value || ''
    };
    if (changeToken) data.t = changeToken;
    data.name = data.name.trim(); data.email = data.email.trim(); data.business = data.business.trim();
    if (!data.name) return show('bad', 'Please enter your name.');
    if (!data.email || data.email.indexOf('@') < 1) return show('bad', 'Please enter a valid email address.');
    if (!(($('rs-attending') || {}).value)) return show('bad', 'Let me know if you can make it.');
    if (!data.storefront) return show('bad', 'One more: is your storefront live on Lokali?');
    var btn = $('rs-submit'), label = btn ? btn.value : null;
    if (btn) { btn.disabled = true; btn.value = 'Saving…'; }
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (btn) { btn.disabled = false; btn.value = label; }
        if (!res.ok) {
          return show('bad', res.j && res.j.error === 'rate_limited' ? 'Too many tries in a row. Give it an hour, or reply to the invite email.' : 'Something went wrong. Please try again, or reply to the invite email with a yes.');
        }
        form.style.display = 'none';
        if (res.j && res.j.pending_link) {
          // an answer already exists for this address and this submit carried no signed link
          return show('ok', '<b>We already have an answer from ' + esc(data.email) + '.</b> To change it, use the link in the email we just sent to that address (check spam too). Nothing changed yet.');
        }
        var tok = res.j && typeof res.j.token === 'string' ? res.j.token : '';
        if (data.attending) {
          var first = esc(data.name.split(/\s+/)[0]);
          var nudge = data.storefront === 'live' ? '' :
            ' <br><br><b>One more thing.</b> The printed booth card and review cards are made from live storefronts around October 30. Open yours by then and your kit will be on the table waiting for you. There is no monthly fee and it takes about twenty minutes: <a href="/sign-up">open a storefront</a>.';
          show('ok', '<b>You’re on the list, ' + first + '.</b> See you on November 5. A confirmation is on its way to ' + esc(data.email) + '. <a href="' + EV.calendar + '" target="_blank" rel="noopener">Add it to your calendar</a>.' + nudge);
        } else {
          show('ok', '<b>Thanks for letting me know.</b> You’ll hear about the next one. Plans change again? <a href="/rsvp?e=' + encodeURIComponent(key) + '&a=yes&email=' + encodeURIComponent(data.email) + '&name=' + encodeURIComponent(data.name) + '&business=' + encodeURIComponent(data.business) + '&sf=' + encodeURIComponent(data.storefront) + (tok ? '&t=' + encodeURIComponent(tok) : '') + '">Count me back in</a>.');
        }
      })
      .catch(function () { if (btn) { btn.disabled = false; btn.value = label; } show('bad', 'Something went wrong. Please try again, or reply to the invite email with a yes.'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
