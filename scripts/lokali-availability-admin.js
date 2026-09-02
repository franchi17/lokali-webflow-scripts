/**
 * Lokali, vendor dashboard "Availability" page (#71, link redesign
 * 2026-08-27, cleanup 2026-09-02), OWNER side.
 *
 * Load on /vendor-dashboard/availability AFTER scripts/lokali-supabase-client.js.
 * Self-mounting into <div id="lok-availability-page"></div>; no-op if absent.
 *
 * Surfaces (top to bottom):
 *   1. New clients: "accepting new clients" toggle + the general (date-less)
 *      new-client queue (#121). Off = storefront shows a books-full note.
 *   2. Booking link: the vendor's external scheduling link (Calendly/Acuity/
 *      Square etc.; https-only, DB-enforced by patch_booking_link.sql). Renders
 *      the storefront "Book an appointment" button.
 *   3. Hours: one weekly open-to-close schedule (split days = two windows). Shown
 *      on the storefront as "Hours". Saved to availability_hours.
 *
 * The NATIVE booking calendar (requests inbox, days off, capacity settings,
 * slot generation, sold-out-date waitlist) was retired 2026-08-27 after the
 * usage check showed zero real usage; its renderers were removed from this
 * file on 2026-09-02 (#157 CLEAN sweep). Do not re-wire it.
 *
 * Plan gate: has_availability_plan(vendorId) is checked up front; free vendors
 * get the upsell card (server enforces regardless; this is just honest UI).
 */
(function () {
  'use strict';

  if (!window.LokaliSupabaseReady || !window.LokaliSupabaseAPI) return;
  var API = window.LokaliSupabaseAPI.availability;
  var VENDORS = window.LokaliSupabaseAPI.vendors;
  if (!API || !VENDORS) return;

  var FONT = "'Plus Jakarta Sans', sans-serif";
  var BRAND = '#6002ee';
  var WDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];   // schema weekday: 0=Sun … 6=Sat

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
  }); }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }
  function toMin(t) { var p = String(t == null ? '0:0' : t).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function fmt12(min) {
    min = ((min % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60, ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12;
    return h12 + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
  }

  function injectStyles() {
    if (document.getElementById('lok-ava-styles')) return;
    var css =
      '.lok-ava,.lok-ava *{font-family:' + FONT + ';box-sizing:border-box;}' +
      '.lok-ava{background:#F7F5FD;border-radius:20px;padding:22px;color:#45415A;}' +
      // Francesca 2026-08-13: on phones the tinted wrapper's 22px padding made
      // the cards ~44px narrower than every other dashboard page's — drop the
      // wrapper chrome ≤767px so the cards line up with the profile/leads cards.
      '@media(max-width:767px){.lok-ava{background:transparent;border-radius:0;padding:0;}}' +
      '.lok-ava .ava-card{background:#fff;border:1px solid #ECE8F6;border-radius:16px;padding:18px 20px;margin-bottom:14px;}' +
      '.lok-ava h3{margin:0;font-size:14px;font-weight:600;color:#3E3A55;}' +
      '.lok-ava .ava-sub{font-size:12px;color:#8B8798;}' +
      '.lok-ava .ava-chip{font-size:11px;font-weight:500;padding:4px 11px;border-radius:999px;}' +
      '.lok-ava .ava-btn{font-family:inherit;font-size:13px;font-weight:600;color:#fff;background:' + BRAND + ';' +
        'border:none;border-radius:9px;padding:8px 14px;cursor:pointer;white-space:nowrap;}' +
      '.lok-ava .ava-btn[disabled]{opacity:.55;cursor:default;}' +
      '.lok-ava .ava-btn2{font-family:inherit;font-size:13px;color:#8B8798;background:#F4F1FB;border:none;' +
        'border-radius:9px;padding:8px 12px;cursor:pointer;}' +
      '.lok-ava .ava-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #F2EFF8;}' +
      '.lok-ava .ava-row:last-child{border-bottom:none;}' +
      // accepting-new-clients switch + info popover (Francesca 2026-08-13:
      // "a toggle instead of a checkmark" + an explainer card)
      '.lok-ava .ava-switch{position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;cursor:pointer;}' +
      '.lok-ava .ava-switch input{opacity:0;width:0;height:0;position:absolute;}' +
      '.lok-ava .ava-track{position:absolute;top:0;left:0;right:0;bottom:0;background:#C8C6D8;border-radius:999px;transition:background .18s;}' +
      '.lok-ava .ava-track::after{content:"";position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;top:2px;left:2px;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.18);}' +
      '.lok-ava .ava-switch input:checked + .ava-track{background:#6002EE;}' +
      '.lok-ava .ava-switch input:checked + .ava-track::after{left:20px;}' +
      '.lok-ava .ava-info-wrap{position:relative;display:inline-flex;align-items:center;}' +
      '.lok-ava .ava-info-btn{width:20px;height:20px;border-radius:50%;border:1.5px solid #6002EE;background:#fff;color:#6002EE;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;font-family:inherit;font-weight:700;font-size:11px;line-height:1;margin-left:7px;}' +
      '.lok-ava .ava-info-pop{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);z-index:60;width:min(290px,calc(100vw - 32px));background:#fff;border:1px solid #E9E3F7;border-radius:12px;box-shadow:0 10px 30px rgba(26,24,41,.15);padding:14px 30px 14px 14px;display:none;text-align:left;}' +
      '.lok-ava .ava-ip-h{display:block;margin:0 0 6px;font-size:13px;font-weight:700;color:#3E3A55;}' +
      '.lok-ava .ava-ip-p{display:block;margin:0 0 8px;font-size:12.5px;font-weight:400;line-height:1.6;color:#6C6880;}' +
      '.lok-ava .ava-ip-p:last-child{margin-bottom:0;}' +
      '.lok-ava .ava-info-x{position:absolute;top:8px;right:8px;width:22px;height:22px;border:none;background:transparent;color:#8B8798;font-size:12px;cursor:pointer;padding:0;line-height:1;font-family:inherit;}' +
      '.lok-ava .ava-avatar{width:36px;height:36px;border-radius:50%;background:#EEE6FF;display:flex;align-items:center;' +
        'justify-content:center;color:' + BRAND + ';font-weight:600;font-size:13px;flex-shrink:0;}' +
      '.lok-ava input[type=time]{font-family:inherit;font-size:13px;color:#45415A;border:1px solid #E4DEF4;border-radius:9px;padding:5px 8px;background:#FCFBFE;}' +
      '.lok-ava .ava-note{font-size:12px;color:#8B8798;line-height:1.5;}' +
      '.lok-ava .ava-hday{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 12px;padding:11px 0;border-bottom:1px solid #F4F1FB;}' +
      '.lok-ava .ava-hday:last-child{border-bottom:none;}' +
      // Francesca 2026-08-13: hours used to sit BESIDE the day, and "Mon, Tue,
      // Wed kind of get lost" — the day now heads its own line (uppercase, a
      // step larger) with the saved-hours card underneath.
      '.lok-ava .ava-hlabel{flex-basis:100%;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#5D4F9E;padding-top:0;}' +
      '.lok-ava .ava-hwins{flex:1;min-width:120px;display:flex;flex-direction:column;gap:6px;}' +
      '.lok-ava .ava-hwin{background:#F6F2FD;border:1px solid #E9E3F7;border-radius:10px;padding:7px 11px;}' +
      '.lok-ava .ava-hwin .ava-htime{font-size:13px;font-weight:600;color:#4B4666;}' +
      '.lok-ava .ava-hwin u{cursor:pointer;text-decoration:none;color:#B0A9C4;font-style:normal;margin-left:8px;float:right;}' +
      '.lok-ava .ava-hadd{display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;}' +
      '.lok-ava .ava-hadd input[type=time]{font-family:inherit;font-size:12px;color:#45415A;border:1px solid #E4DEF4;border-radius:8px;padding:5px 7px;background:#FCFBFE;}' +
      // #93 — copy one day's hours to other days (Calendly-style)
      '.lok-ava .ava-copylink{cursor:pointer;text-decoration:none;font-style:normal;font-size:11.5px;color:#8B8798;padding-top:9px;flex-shrink:0;}' +
      '.lok-ava .ava-copylink:hover{color:#5D4F9E;}' +
      '.lok-ava .ava-copy{flex-basis:100%;margin:8px 0 2px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;' +
        'background:#FCFBFE;border:1px solid #E9E3F7;border-radius:10px;padding:9px 12px;}' +
      '.lok-ava .ava-copy .ava-copyto{font-size:11.5px;color:#8B8798;flex-basis:100%;}' +
      '.lok-ava .ava-copy label{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#45415A;cursor:pointer;}' +
      '.lok-ava .ava-copy input[type=checkbox]{accent-color:#5D4F9E;width:14px;height:14px;cursor:pointer;}' +
      '.lok-ava .ava-copy .ava-copycancel{cursor:pointer;text-decoration:none;font-style:normal;font-size:11.5px;color:#B0A9C4;}' +
      '@media (max-width:600px){.lok-ava .ava-copy{margin-left:0;}}' +
      // Mobile: the day-hours row [label][windows][start–end + Add] overflowed
      // 375px and clipped the "Add" button. Let it wrap so the add-window
      // controls drop to their own full-width line under the label+windows.
      '@media (max-width:600px){' +
        '.lok-ava .ava-hday{flex-wrap:wrap;}' +
        '.lok-ava .ava-hwins{flex-basis:calc(100% - 86px);}' +
        '.lok-ava .ava-hadd{flex-basis:100%;margin-top:6px;}' +
      '}';
    var s = document.createElement('style');
    s.id = 'lok-ava-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ==========================================================================
  function Page(mount, vendor) {
    this.mount = mount;
    this.vendorId = vendor.id;
    this.cfg = null;            // availability_config row (or defaults)
    this.hours = [];            // availability_hours rows (weekly schedule)
    this.waitlist = [];         // general new-client queue rows (#121)
    this.shell();
    this.loadAll();
  }

  Page.prototype.shell = function () {
    // No internal header — the Webflow page heading ("Availability" + subtitle)
    // is the single source of truth.
    this.mount.className = 'lok-ava';
    // Link redesign 2026-08-27: the native calendar is retired (usage check:
    // zero real usage), so the page is three cards:
    //   .ava-newclients = accepting toggle + general new-client queue (#121;
    //                     stays at the TOP per F 2026-08-22)
    //   .ava-booking    = external scheduling link (Calendly/Acuity/etc.)
    //   .ava-hours      = weekly hours (the storefront Hours card)
    this.mount.innerHTML =
      '<div class="ava-newclients"></div>' +
      '<div class="ava-booking"></div>' +
      '<div class="ava-hours"></div>';
    this.$booking = this.mount.querySelector('.ava-booking');
    this.$hours = this.mount.querySelector('.ava-hours');
    this.$newclients = this.mount.querySelector('.ava-newclients');

    // Offer-spot delegation, bound ONCE on the mount. It used to be re-bound
    // inside the (since retired) sold-out waitlist renderer on every render,
    // and since only innerHTML was replaced the listeners stacked up, so one
    // "Offer spot" click fired the RPC once per render since page load.
    var self = this;
    this.mount.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-offer]');
      if (btn) { self.offerSpot(Number(btn.getAttribute('data-offer'))); return; }
      // Remove / Withdraw links, two-tap: the first tap arms the link
      // ("Sure? Tap again"), the second executes. Delegated once here, so
      // re-renders never stack listeners (the offerSpot lesson above).
      var act = e.target.closest('u[data-wremove], u[data-wwithdraw]');
      if (!act) return;
      if (act.getAttribute('data-armed') !== '1') {
        act.setAttribute('data-armed', '1');
        act.textContent = act.hasAttribute('data-wremove') ? 'Sure? Remove' : 'Sure? Withdraw';
        act.style.color = '#9E5F44';
        return;
      }
      act.textContent = 'Working…';
      var isRemove = act.hasAttribute('data-wremove');
      var id = Number(act.getAttribute(isRemove ? 'data-wremove' : 'data-wwithdraw'));
      (isRemove ? API.removeWaitlist(id) : API.withdrawOffer(id)).then(function (r) {
        if (r && r.error) {
          act.textContent = 'Couldn’t ' + (isRemove ? 'remove' : 'withdraw');
          console.warn('[availability] waitlist action failed', r.error);
          return;
        }
        self.refreshQueue();
      });
    });
  };

  // Re-read the queue and re-render the cards that show it.
  Page.prototype.refreshQueue = function () {
    var self = this;
    return API.listWaitlist(this.vendorId).then(function (r) {
      self.waitlist = (r && r.data) || [];
      self.renderNewClients();
    });
  };

  Page.prototype.loadAll = function () {
    var self = this;
    Promise.all([
      API.getConfig(this.vendorId),
      API.listHours(this.vendorId),
      API.listWaitlist(this.vendorId),         // general new-client queue rows
      API.waitlistOpen(this.vendorId)          // waitlist = Featured-only perk
    ]).then(function (r) {
      // No config row yet = a vendor who has never saved anything here. The
      // upsert in saveConfig creates it; the DB defaults fill the rest.
      self.cfg = (r[0] && r[0].data) || { vendors_id: self.vendorId, _absent: true };
      self.hours = (r[1] && r[1].data) || [];
      self.waitlist = (r[2] && r[2].data) || [];
      self.waitlistPlan = (r[3] && r[3].data) === true;
      self.renderAll();
    });
  };

  Page.prototype.renderAll = function () {
    this.renderNewClients();   // #121: accepting toggle + general queue, on top
    this.renderBooking();      // external scheduling link (2026-08-27)
    this.renderHours();
  };

  // ---- Booking link (link redesign 2026-08-27) --------------------------------
  // The vendor's external scheduling link (Calendly/Acuity/Square etc.), shown
  // on the storefront as the "Book an appointment" button. https-only — the DB
  // CHECK enforces it (patch_booking_link.sql); this mirrors it as honest UI.
  // Saved via the same availability_config upsert as everything else, so RLS's
  // owns_vendor + Pro/Featured plan gate applies server-side.
  var KNOWN_SCHEDULERS = [
    ['calendly.com', 'Calendly'], ['acuityscheduling.com', 'Acuity Scheduling'],
    ['squarespacescheduling.com', 'Acuity Scheduling'], ['square.site', 'Square Appointments'],
    ['squareup.com', 'Square Appointments'], ['setmore.com', 'Setmore'], ['booksy.com', 'Booksy']
  ];
  function schedulerFor(url) {
    try {
      var h = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
      for (var i = 0; i < KNOWN_SCHEDULERS.length; i++) {
        var d = KNOWN_SCHEDULERS[i][0];
        if (h === d || h.slice(-(d.length + 1)) === '.' + d) return KNOWN_SCHEDULERS[i][1];
      }
    } catch (e) {}
    return null;
  }
  Page.prototype.renderBooking = function () {
    var self = this;
    var cur = (this.cfg && this.cfg.booking_url) || '';
    this.$booking.innerHTML =
      '<div class="ava-card">' +
        '<h3>Booking link</h3>' +
        '<p class="ava-note" style="margin:6px 0 12px;">Paste your scheduling link and customers book straight from your storefront with a &#8220;Book an appointment&#8221; button. Works with Calendly, Acuity, Square Appointments and similar: any secure (https) link.</p>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
          '<input type="url" class="ava-booking-url" maxlength="300" placeholder="https://calendly.com/your-business" value="' + esc(cur) + '" ' +
            'style="flex:1;min-width:220px;font-family:inherit;font-size:14px;color:#45415A;border:1px solid #E4DEF4;border-radius:9px;padding:11px 12px;background:#fff;">' +
          '<button type="button" class="ava-btn ava-booking-save">Save</button>' +
          (cur ? '<u class="ava-sub ava-booking-clear" style="cursor:pointer;">remove</u>' : '') +
        '</div>' +
        '<p class="ava-booking-msg" style="margin:8px 0 0;font-size:12px;color:#6C6880;"></p>' +
      '</div>';

    var input = this.$booking.querySelector('.ava-booking-url');
    var msg = this.$booking.querySelector('.ava-booking-msg');
    function hint() {
      var v = (input.value || '').trim();
      if (!v) { msg.textContent = ''; return; }
      if (!/^https:\/\/.+/i.test(v)) {
        msg.style.color = '#9E5F44';
        msg.textContent = 'The link must start with https://. Copy it from your scheduler’s share button.';
        return;
      }
      var who = schedulerFor(v);
      msg.style.color = '#3E7C5E';
      msg.textContent = who ? '✓ ' + who + ' link recognized.' : '✓ Link looks good.';
    }
    input.addEventListener('input', hint);
    hint();

    function save(value) {
      msg.style.color = '#6C6880'; msg.textContent = 'Saving…';
      API.saveConfig(self.vendorId, {
        booking_url: value,
        updated_at: new Date().toISOString()
      }).then(function (r) {
        if (r && r.error) {
          msg.style.color = '#9E5F44';
          msg.textContent = 'Couldn’t save. Use a full https:// link.';
          console.warn('[availability] booking_url save failed', r.error);
        } else {
          self.cfg.booking_url = value;
          self.renderBooking();
          var m2 = self.$booking.querySelector('.ava-booking-msg');
          m2.style.color = '#3E7C5E';
          m2.textContent = value ? 'Saved ✓ The button is live on your storefront.' : 'Removed ✓ The button is off your storefront.';
        }
      });
    }
    this.$booking.querySelector('.ava-booking-save').addEventListener('click', function () {
      var v = (input.value || '').trim();
      if (!v) { save(null); return; }
      if (!/^https:\/\/.+\..+/i.test(v)) {
        msg.style.color = '#9E5F44';
        msg.textContent = 'That doesn’t look like a link. It must start with https://';
        input.focus();
        return;
      }
      save(v);
    });
    var clear = this.$booking.querySelector('.ava-booking-clear');
    if (clear) clear.addEventListener('click', function () { input.value = ''; save(null); });
  };

  // ---- Weekly hours (the storefront Hours card) --------------------------------
  Page.prototype.renderHours = function () {
    var self = this;
    var byDay = {};
    this.hours.forEach(function (h) { (byDay[h.weekday] = byDay[h.weekday] || []).push(h); });

    var rows = [1, 2, 3, 4, 5, 6, 0].map(function (wd) {   // display Mon..Sun
      var wins = (byDay[wd] || []).slice().sort(function (a, b) { return toMin(a.open_time) - toMin(b.open_time); });
      var chips = wins.map(function (w) {
        var openM = toMin(w.open_time), closeM = toMin(w.close_time);
        return '<div class="ava-hwin" data-h="' + w.id + '">' +
            '<span class="ava-htime">' + fmt12(openM) + ' – ' + fmt12(closeM) + '</span>' +
            '<u data-delh="' + w.id + '" title="Remove">&#10005;</u></div>';
      }).join('');
      // #93: a day with hours gets "Copy" (Calendly-style): pick target days,
      // Apply REPLACES those days' hours with this day's windows.
      var copyLink = wins.length
        ? '<u class="ava-copylink" data-copyh="' + wd + '" title="Copy this day’s hours to other days">Copy</u>'
        : '';
      var copyPanel = '';
      if (self._copyFrom === wd && wins.length) {
        copyPanel =
          '<div class="ava-copy">' +
            '<span class="ava-copyto">Copy ' + WDAYS[wd] + '’s hours to (this replaces those days’ existing hours):</span>' +
            [1, 2, 3, 4, 5, 6, 0].filter(function (d) { return d !== wd; }).map(function (d) {
              return '<label><input type="checkbox" class="ava-copyday" value="' + d + '" />' + WDAYS[d] + '</label>';
            }).join('') +
            '<button class="ava-btn2" data-copyapply="' + wd + '">Apply</button>' +
            '<u class="ava-copycancel" data-copycancel="1">cancel</u>' +
          '</div>';
      }
      return '<div class="ava-hday">' +
          '<span class="ava-hlabel">' + WDAYS[wd] + '</span>' +
          '<div class="ava-hwins">' + (chips || '<span class="ava-sub" style="line-height:32px;">Closed</span>') + '</div>' +
          '<span class="ava-hadd">' +
            '<input type="time" class="ava-hopen" data-wd="' + wd + '" step="300" />' +
            '<span style="color:#B0ACBC;font-size:12px;">to</span>' +
            '<input type="time" class="ava-hclose" data-wd="' + wd + '" step="300" />' +
            '<button class="ava-btn2" data-addh="' + wd + '">Add</button></span>' +
          copyLink + copyPanel +
        '</div>';
    }).join('');

    var intro = 'Your open hours, shown on your storefront so customers know when you’re available. Split days (e.g. a lunch break) are just two windows.';
    this.$hours.innerHTML =
      '<div class="ava-card">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
          '<h3>Hours</h3><span class="ava-sub">Repeats every week</span></div>' +
        '<p class="ava-note" style="margin:0 0 12px;">' + intro + '</p>' +
        rows + '</div>';

    if (this._hoursWired) return;
    this._hoursWired = true;
    this.$hours.addEventListener('click', function (e) {
      // remove a window
      var del = e.target.closest('[data-delh]');
      if (del) {
        var did = Number(del.getAttribute('data-delh'));
        API.removeHours(did).then(function (r) {
          if (r && r.error) return;
          self.hours = self.hours.filter(function (h) { return h.id !== did; });
          self.renderHours();
        });
        return;
      }
      // #93: copy-hours flow: open the panel, cancel it, or apply the copy.
      var cp = e.target.closest('[data-copyh]');
      if (cp) { self._copyFrom = Number(cp.getAttribute('data-copyh')); self.renderHours(); return; }
      var cpc = e.target.closest('[data-copycancel]');
      if (cpc) { self._copyFrom = null; self.renderHours(); return; }
      var cpa = e.target.closest('button[data-copyapply]');
      if (cpa) {
        var src = Number(cpa.getAttribute('data-copyapply'));
        var targets = Array.prototype.slice.call(self.$hours.querySelectorAll('.ava-copyday:checked'))
          .map(function (c) { return Number(c.value); });
        if (!targets.length) { self._copyFrom = null; self.renderHours(); return; }
        var srcWins = self.hours.filter(function (h) { return h.weekday === src; });
        cpa.textContent = '…'; cpa.disabled = true;
        Promise.all(targets.map(function (twd) {
          // Replace semantics: clear the target day, then re-create the source
          // windows there.
          var dels = self.hours.filter(function (h) { return h.weekday === twd; })
            .map(function (h) { return API.removeHours(h.id); });
          return Promise.all(dels).then(function () {
            return Promise.all(srcWins.map(function (w) {
              return API.addHours(self.vendorId, twd, w.open_time, w.close_time);
            }));
          });
        })).then(function () {
          self._copyFrom = null;
          self.reloadHours();
        }).catch(function (err) {
          // Re-read from the server either way — it is the source of truth.
          console.warn('[lokali-availability] copy hours failed', err);
          self._copyFrom = null;
          self.reloadHours();
        });
        return;
      }
      // add a window
      var add = e.target.closest('button[data-addh]');
      if (add) {
        var wd = Number(add.getAttribute('data-addh'));
        var openEl = self.$hours.querySelector('.ava-hopen[data-wd="' + wd + '"]');
        var closeEl = self.$hours.querySelector('.ava-hclose[data-wd="' + wd + '"]');
        var open = openEl && openEl.value, close = closeEl && closeEl.value;
        if (!open || !close) { (openEl || closeEl).focus(); return; }
        if (toMin(close) <= toMin(open)) { closeEl.style.borderColor = '#DFA284'; closeEl.focus(); return; }
        add.textContent = '…'; add.disabled = true;
        API.addHours(self.vendorId, wd, open, close).then(function (r) {
          if (r && r.error) { add.textContent = 'Add'; add.disabled = false; return; }
          self.reloadHours();
        });
      }
    });
  };

  Page.prototype.reloadHours = function () {
    var self = this;
    return API.listHours(this.vendorId).then(function (rr) {
      self.hours = (rr && rr.data) || [];
      self.renderHours();
    });
  };

  // #121: the vendor-level NEW-CLIENT queue and the switch that opens it, on one
  // card. Renders for EVERY plan: the toggle is not a Featured perk (any vendor
  // can say "not taking new clients"; only the customer-side JOIN is gated), and
  // it must stay reachable when the queue is empty, which is exactly when a
  // vendor reaches for it.
  Page.prototype.renderNewClients = function () {
    var self = this, c = this.cfg || {};
    var accepting = c.accepting_new_clients !== false;
    var general = (this.waitlist || []).filter(function (w) { return !w.the_date; });

    var html = '<div class="ava-card">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">' +
        '<h3>New clients</h3>' +
        (general.length ? '<span class="ava-sub">' + general.length + ' waiting to be taken on</span>' : '') +
      '</div>' +
      '<p class="ava-note" style="margin:0 0 12px;">Whether you\'re open to taking anyone new at all, not tied to any one date.</p>' +
      // divs/spans only in this block — an injected <p> would be auto-closed by
      // the parser around the popover's inner blocks and mangle the tree.
      '<div class="ava-acceptrow" style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#F6F2FD;border:1px solid #E9E3F7;border-radius:10px;padding:10px 14px;">' +
        '<div><div style="font-size:13px;font-weight:600;color:#3E3A55;display:flex;align-items:center;">Accepting new clients' +
          '<span class="ava-info-wrap"><button type="button" class="ava-info-btn" aria-label="What does this do?">?</button>' +
            '<span class="ava-info-pop">' +
              '<button type="button" class="ava-info-x" aria-label="Close">✕</button>' +
              '<span class="ava-ip-h">Accepting new clients</span>' +
              '<span class="ava-ip-p"><b>On</b>: customers book you normally from your storefront.</span>' +
              '<span class="ava-ip-p"><b>Off</b>: your page says your books are full. Instead of the booking button, new customers join the queue on THIS card, and when you have room you tap <b>Offer spot</b> to invite one. Your hours stay visible either way.</span>' +
            '</span></span></div>' +
          '<p class="ava-note" style="margin:2px 0 0;">Off = new clients see a books-full note and can join the queue below.</p></div>' +
        '<span style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><span class="ava-accepting-msg" style="font-size:12px;color:#6C6880;"></span>' +
          '<label class="ava-switch"><input type="checkbox" class="ava-accepting"' + (accepting ? ' checked' : '') + ' /><span class="ava-track"></span></label></span>' +
      '</div>';

    if (general.length) {
      html += '<p style="margin:14px 0 2px;font-size:13px;font-weight:600;color:#3E3A55;">Waiting to be taken on' +
        '<span class="ava-sub" style="font-weight:400;"> · no date in mind</span></p>' +
        waitlistRows(general);
    } else if (!accepting) {
      html += '<p class="ava-note" style="margin:12px 0 0;">Nobody in the queue yet. While this is off, new customers can add themselves here from your storefront.</p>';
    }
    html += '</div>';
    this.$newclients.innerHTML = html;

    // Info popover: click "?" to open, ✕ / outside click to close; clamped
    // inside the viewport on phones.
    var infoWrap = this.$newclients.querySelector('.ava-info-wrap');
    if (infoWrap) {
      var infoBtn = infoWrap.querySelector('.ava-info-btn');
      var infoPop = infoWrap.querySelector('.ava-info-pop');
      var showPop = function (on) {
        infoPop.style.display = on ? 'block' : 'none';
        if (!on) return;
        infoPop.style.transform = 'translateX(-50%)';
        var r = infoPop.getBoundingClientRect(), pad = 12, shift = 0;
        if (r.right > window.innerWidth - pad) shift = (window.innerWidth - pad) - r.right;
        else if (r.left < pad) shift = pad - r.left;
        if (shift) infoPop.style.transform = 'translateX(calc(-50% + ' + Math.round(shift) + 'px))';
      };
      infoBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); showPop(infoPop.style.display !== 'block'); });
      infoWrap.querySelector('.ava-info-x').addEventListener('click', function (e) { e.stopPropagation(); showPop(false); });
      document.addEventListener('click', function (e) { if (!infoWrap.contains(e.target)) showPop(false); });
    }

    // Instant-save on flip, separate from the main Settings Save so a missing DB
    // column (patch not applied yet) can never break the other settings.
    var acceptCb = this.$newclients.querySelector('.ava-accepting');
    var acceptMsg = this.$newclients.querySelector('.ava-accepting-msg');
    if (acceptCb) {
      acceptCb.addEventListener('change', function () {
        var next = acceptCb.checked;
        acceptMsg.textContent = 'Saving…';
        API.saveConfig(self.vendorId, {
          accepting_new_clients: next,
          updated_at: new Date().toISOString()
        }).then(function (r) {
          if (r && r.error) {
            acceptCb.checked = !next;
            acceptMsg.textContent = 'Couldn’t save';
            console.warn('[availability] accepting_new_clients save failed (SQL patch applied?)', r.error);
          } else {
            self.cfg.accepting_new_clients = next;
            acceptMsg.textContent = next ? 'On' : 'Off';
            self.renderNewClients();          // reflect the empty-queue hint
          }
          setTimeout(function () {
            var m = self.$newclients.querySelector('.ava-accepting-msg');
            if (m) m.textContent = '';
          }, 2500);
        });
      });
    }
  };

  // Queue rows for the New clients card (Remove / Withdraw / Offer spot).
  function waitlistRows(list) {
    var out = '';
    list.forEach(function (w, idx) {
      // Every row gets "Remove" (= dealt with outside Lokali; drops the row —
      // they can rejoin later). An offered row also gets "Withdraw": the offer
      // email can't be unsent, but the row returns to waiting and the sent
      // expiry no longer applies. Both are two-tap (first tap arms a confirm).
      var links =
        (w.status === 'offered'
          ? '<u class="ava-sub" data-wwithdraw="' + w.id + '" style="cursor:pointer;">Withdraw</u>'
          : '') +
        '<u class="ava-sub" data-wremove="' + w.id + '" style="cursor:pointer;">Remove</u>';
      var right = (w.status === 'offered'
        ? '<span class="ava-chip" style="background:#E7F3EC;color:#3E7C5E;">Offer sent</span>'
        : '<button class="ava-btn" data-offer="' + w.id + '">Offer spot</button>') +
        '<span style="display:inline-flex;gap:10px;margin-left:10px;">' + links + '</span>';
      out += '<div class="ava-row">' +
        '<span style="font-size:12px;font-weight:600;color:#B0ACBC;width:14px;">' + (idx + 1) + '</span>' +
        '<div class="ava-avatar" style="background:#F5EFE4;color:#B5793B;">' + esc(initials(w.customer_name || w.customer_email)) + '</div>' +
        '<div style="flex:1;min-width:0;"><p style="margin:0;font-size:14px;font-weight:500;color:#3E3A55;">' +
          esc(w.customer_name || w.customer_email) +
          (w.requested_qty ? ' · <span style="color:#5D4F9E;">wants ' + w.requested_qty + '</span>' : '') + '</p>' +
          '<p style="margin:1px 0 0;font-size:12px;color:#8B8798;">' + esc(w.customer_email || '') + '</p></div>' +
        '<div data-wrow="' + w.id + '">' + right + '</div></div>';
    });
    return out;
  }

  // Offer flow (delegated from the mount in shell()).
  Page.prototype.offerSpot = function (id) {
    var self = this;
    var cellEl = this.mount.querySelector('[data-wrow="' + id + '"]');
    if (!cellEl) return;
    cellEl.innerHTML = '<span class="ava-sub">Working…</span>';
    API.offerSpot(id, 6).then(function (r) {
      var res = (r && r.data) || {};
      cellEl.innerHTML = res.ok
        ? '<span class="ava-chip" style="background:#E7F3EC;color:#3E7C5E;">Offer sent · 6h to claim</span>'
        : '<span class="ava-chip" style="background:#FAE9E2;color:#9E5F44;">Couldn’t offer</span>';
      // Email the waitlisted customer the spot's theirs (best-effort).
      if (res.ok && API.notifyOffered) {
        try { API.notifyOffered(id); } catch (e) {}
      }
      // Re-render shortly so the offered row gains its Withdraw/Remove links
      // (the pause lets the vendor read the "6h to claim" note first).
      if (res.ok) setTimeout(function () { self.refreshQueue(); }, 1800);
    });
  };

  // ---- upsell (free plan) ------------------------------------------------------
  function renderUpsell(mount) {
    mount.className = 'lok-ava';
    mount.innerHTML =
      '<div class="ava-card" style="text-align:center;padding:34px 24px;">' +
        '<p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#3E3A55;">Booking &amp; hours</p>' +
        '<p class="ava-note" style="margin:0 auto 18px;max-width:420px;">Show your weekly hours on your storefront and let customers book you directly through your Calendly, Acuity or Square scheduling link. Available on Pro and Featured plans.</p>' +
        '<a href="/pricing" style="display:inline-block;background:' + BRAND + ';color:#fff;border-radius:10px;' +
          'padding:12px 26px;font-size:14px;font-weight:600;text-decoration:none;">Upgrade to unlock</a>' +
      '</div>';
  }

  // ---- boot --------------------------------------------------------------------
  function boot() {
    var mount = document.getElementById('lok-availability-page');
    if (!mount) return;
    injectStyles();
    VENDORS.me().then(function (r) {
      var vendor = r && r.data;
      if (!vendor || !vendor.id) return;                 // not a vendor / not signed in
      API.hasPlan(vendor.id).then(function (pr) {
        if (pr && pr.data === true) new Page(mount, vendor);
        else renderUpsell(mount);
      });
    });
  }

  window.LokaliSupabaseReady.then(function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else { boot(); }
  });
})();
