/**
 * Lokali — vendor dashboard "Availability" page (#71 → link redesign
 * 2026-08-27), OWNER side.
 *
 * Load on /vendor-dashboard/availability AFTER scripts/lokali-supabase-client.js.
 * Self-mounting into <div id="lok-availability-page"></div> — no-op if absent.
 *
 * Surfaces (top to bottom):
 *   1. New clients — "accepting new clients" toggle + the general (date-less)
 *      new-client queue (#121). Off = storefront shows a books-full note.
 *   2. Booking link — the vendor's external scheduling link (Calendly/Acuity/
 *      Square etc.; https-only, DB-enforced by patch_booking_link.sql). Renders
 *      the storefront "Book an appointment" button.
 *   3. Hours — one weekly open→close schedule (split days = two windows). Shown
 *      on the storefront as "Hours". Saved to availability_hours.
 *
 * The NATIVE booking calendar (requests inbox, days off, capacity settings,
 * slot generation, sold-out-date waitlist) was retired 2026-08-27 after the
 * usage check showed zero real usage. Its renderers below are no longer called
 * (their mounts are gone) and await a cleanup sweep — do not re-wire them.
 *
 * Plan gate: has_availability_plan(vendorId) is checked up front; free vendors
 * get the upsell card (server enforces regardless — this is just honest UI).
 */
(function () {
  'use strict';

  if (!window.LokaliSupabaseReady || !window.LokaliSupabaseAPI) return;
  var API = window.LokaliSupabaseAPI.availability;
  var VENDORS = window.LokaliSupabaseAPI.vendors;
  if (!API || !VENDORS) return;

  var FONT = "'Plus Jakarta Sans', sans-serif";
  var BRAND = '#6002ee';
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var WDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];   // schema weekday: 0=Sun … 6=Sat
  var DOW_MON = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  function iso(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function lastOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function prettyDate(isoStr) {
    var p = isoStr.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return WDAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
  }
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
  // Same expansion the server does (avail_expand_slots) — integer minutes, so the
  // vendor preview is exactly what customers will see.
  function expandWindow(openM, closeM, dur, buf) {
    var out = [], cur = openM, n = 0;
    if (!dur || dur < 1) return out;
    while (cur + dur <= closeM && n < 200) { out.push(cur); cur += dur + Math.max(buf, 0); n++; }
    return out;
  }
  // Plain-English caption for the old "lead time" (renamed "Minimum notice").
  function leadHint(h) {
    h = +h || 0;
    var human = h <= 0 ? 'no minimum (same-day requests are fine)'
      : h < 24 ? 'about ' + h + ' hour' + (h === 1 ? '' : 's') + ' ahead'
      : 'about ' + Math.round(h / 24) + ' day' + (Math.round(h / 24) === 1 ? '' : 's') + ' ahead';
    return 'How far ahead customers must request: ' + human + '. Dates inside this window show as closed.';
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
      '.lok-ava .ava-seg{display:flex;gap:6px;background:#F4F1FB;border-radius:13px;padding:4px;}' +
      '.lok-ava .ava-seg div{flex:1;text-align:center;padding:9px 0;font-size:13px;font-weight:500;border-radius:11px;cursor:pointer;color:#6C6880;}' +
      '.lok-ava .ava-seg div.on{background:#fff;color:#5D4F9E;box-shadow:0 1px 2px rgba(94,74,183,0.10);}' +
      '.lok-ava .ava-step{display:inline-flex;align-items:center;gap:14px;background:#F6F2FD;border:1px solid #E4DEF4;border-radius:12px;padding:6px 14px;}' +
      '.lok-ava .ava-step b{font-size:18px;font-weight:600;color:#5D4F9E;min-width:30px;text-align:center;}' +
      '.lok-ava .ava-step span{cursor:pointer;font-size:17px;color:' + BRAND + ';user-select:none;}' +
      '.lok-ava .ava-cell{aspect-ratio:1;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'font-size:12px;font-weight:500;cursor:pointer;background:#F6F2FD;color:#5D4F9E;border:1px solid #EAE4F8;}' +
      '.lok-ava .ava-cell.off{background:#FAE9E2;color:#9E5F44;border:1px solid #EBC3B2;}' +
      '.lok-ava .ava-cell.closed{background:#FAFAFC;color:#C9C5D6;border:1px solid #F0EDF5;}' +
      '.lok-ava .ava-cell.err{outline:2px solid #DFA284;outline-offset:-2px;}' +
      '.lok-ava .ava-cell.pad{background:transparent;border:none;cursor:default;}' +
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
      // decline-with-note panel (Francesca 2026-08-13)
      '.lok-ava .ava-decline-panel{flex-basis:100%;display:flex;flex-direction:column;gap:8px;background:#FCFBFE;border:1px solid #E9E3F7;border-radius:10px;padding:10px 12px;}' +
      '.lok-ava .ava-decline-note{font-family:inherit;font-size:13px;line-height:1.5;color:#45415A;border:1px solid #E4DEF4;border-radius:9px;padding:8px 10px;background:#fff;resize:vertical;min-height:48px;}' +
      '.lok-ava .ava-decline-btns{display:flex;gap:8px;flex-wrap:wrap;}' +
      '.lok-ava .ava-decline-send{color:#9E5F44;background:#FAE9E2;}' +
      '.lok-ava .ava-avatar{width:36px;height:36px;border-radius:50%;background:#EEE6FF;display:flex;align-items:center;' +
        'justify-content:center;color:' + BRAND + ';font-weight:600;font-size:13px;flex-shrink:0;}' +
      '.lok-ava input[type=time]{font-family:inherit;font-size:13px;color:#45415A;border:1px solid #E4DEF4;border-radius:9px;padding:5px 8px;background:#FCFBFE;}' +
      '.lok-ava .ava-tchip{display:inline-flex;align-items:center;gap:6px;background:#F3F0FC;color:#5D4F9E;font-size:13px;' +
        'font-weight:500;padding:5px 11px;border-radius:999px;margin:0 6px 6px 0;}' +
      '.lok-ava .ava-tchip u{cursor:pointer;text-decoration:none;opacity:.55;font-style:normal;}' +
      '.lok-ava .ava-save{font-family:inherit;font-size:14px;font-weight:600;color:#fff;background:' + BRAND + ';' +
        'border:none;border-radius:10px;padding:11px 22px;cursor:pointer;}' +
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
      '.lok-ava .ava-hprev{display:block;margin-top:4px;font-size:11px;color:#8B8798;line-height:1.6;}' +
      '.lok-ava .ava-hovr{display:inline-block;margin-top:5px;font-size:11px;font-weight:500;color:#6C6880;background:#EFEAFB;border-radius:999px;padding:2px 9px;cursor:pointer;}' +
      '.lok-ava .ava-hovr.cust{background:#E7DEFA;color:#5D4F9E;}' +
      '.lok-ava .ava-hadd{display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;}' +
      '.lok-ava .ava-hadd input[type=time]{font-family:inherit;font-size:12px;color:#45415A;border:1px solid #E4DEF4;border-radius:8px;padding:5px 7px;background:#FCFBFE;}' +
      '.lok-ava .ava-ovr{margin-top:6px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;}' +
      '.lok-ava .ava-ovr input{width:56px;font-family:inherit;font-size:12px;color:#45415A;border:1px solid #E4DEF4;border-radius:8px;padding:4px 7px;background:#fff;}' +
      '.lok-ava .ava-ovr label{font-size:11px;color:#8B8798;}' +
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

  function remainChip(remain, cap) {
    var st = remain <= 0 ? { bg: '#FAE9E2', fg: '#9E5F44', t: 'Sold out' }
           : remain <= 5 ? { bg: '#FBF1DE', fg: '#96702E', t: remain + ' of ' + cap + ' left' }
           :               { bg: '#E7F3EC', fg: '#3E7C5E', t: remain + ' of ' + cap + ' left' };
    return '<span class="ava-chip" style="background:' + st.bg + ';color:' + st.fg + ';">' + st.t + '</span>';
  }

  // ==========================================================================
  function Page(mount, vendor) {
    this.mount = mount;
    this.vendorId = vendor.id;
    this.cfg = null;            // availability_config row (or defaults)
    this.dates = {};            // iso -> availability_date row (this month)
    this.slotRows = {};         // iso -> availability_slot rows (this month; slot mode)
    this.viewMonth = firstOfMonth(new Date());
    this.pending = [];
    this.hours = [];            // availability_hours rows (weekly schedule)
    this.waitlist = [];
    this._editOvr = null;       // window id whose per-day override editor is open
    this.shell();
    this.loadAll();
  }

  Page.prototype.shell = function () {
    // No internal header — the Webflow page heading ("Availability" + subtitle)
    // is the single source of truth.
    this.mount.className = 'lok-ava';
    // Link redesign 2026-08-27: the native calendar is retired (usage check:
    // zero real usage), so the page is down to three cards —
    //   .ava-newclients = accepting toggle + general new-client queue (#121;
    //                     stays at the TOP per F 2026-08-22)
    //   .ava-booking    = external scheduling link (Calendly/Acuity/etc.)
    //   .ava-hours      = weekly hours (the storefront Hours card)
    // The inbox/days-off/settings/sold-out-waitlist renderers below are no
    // longer called (their mounts are gone) and await a cleanup sweep.
    this.mount.innerHTML =
      '<div class="ava-newclients"></div>' +
      '<div class="ava-booking"></div>' +
      '<div class="ava-hours"></div>';
    this.$booking = this.mount.querySelector('.ava-booking');
    this.$inbox = this.mount.querySelector('.ava-inbox');
    this.$settings = this.mount.querySelector('.ava-settings');
    this.$hours = this.mount.querySelector('.ava-hours');
    this.$daysoff = this.mount.querySelector('.ava-daysoff');
    this.$newclients = this.mount.querySelector('.ava-newclients');
    this.$waitlist = this.mount.querySelector('.ava-waitlist');

    // Offer-spot delegation, bound ONCE on the mount. It used to be re-bound
    // inside renderWaitlist on every render — and since only innerHTML was
    // replaced, the listeners stacked up, so one "Offer spot" click fired the
    // RPC once per render since page load. Delegating here also covers the new
    // .ava-newclients card without a second binding.
    var self = this;
    this.mount.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-offer]');
      if (!btn) return;
      self.offerSpot(Number(btn.getAttribute('data-offer')));
    });
  };

  Page.prototype.loadAll = function () {
    var self = this;
    // Link redesign 2026-08-27: dates/pending/slots reads retired with the
    // calendar; nulls keep r[] positions so the assignments below are unchanged.
    Promise.all([
      API.getConfig(this.vendorId),
      Promise.resolve(null),
      Promise.resolve(null),
      API.listHours(this.vendorId),
      API.listWaitlist(this.vendorId),         // general new-client queue rows
      API.waitlistOpen(this.vendorId),         // waitlist = Featured-only perk
      Promise.resolve(null)
    ]).then(function (r) {
      self.cfg = (r[0] && r[0].data) || {
        vendors_id: self.vendorId, is_enabled: false, capacity_mode: 'quantity',
        hold_mode: 'on_confirm', hold_window_hours: 24, limited_threshold: 5,
        lead_time_hours: 12, default_daily_cap: 30, slot_minutes: 60, buffer_minutes: 0,
        _absent: true
      };
      self.dates = {};
      ((r[1] && r[1].data) || []).forEach(function (row) { self.dates[row.the_date] = row; });
      self.pending = (r[2] && r[2].data) || [];
      self.hours = (r[3] && r[3].data) || [];
      self.waitlist = (r[4] && r[4].data) || [];
      self.waitlistPlan = (r[5] && r[5].data) === true;
      self.slotRows = {};
      ((r[6] && r[6].data) || []).forEach(function (s) {
        (self.slotRows[s.the_date] = self.slotRows[s.the_date] || []).push(s);
      });
      self.renderAll();
    });
  };

  Page.prototype.renderAll = function () {
    this.renderNewClients();   // #121: accepting toggle + general queue, on top
    this.renderBooking();      // external scheduling link (2026-08-27)
    this.renderHours();
  };

  // ---- 1. Requests inbox ----------------------------------------------------
  Page.prototype.capFor = function (dISO) {
    var row = this.dates[dISO];
    return (row && row.cap_override != null) ? row.cap_override : (this.cfg.default_daily_cap || 0);
  };
  Page.prototype.usedFor = function (dISO) {
    var row = this.dates[dISO];
    return row ? (row.confirmed_units || 0) : 0;
  };
  // Slot-mode per-date picture: total = slots GENERATED from the weekly hours
  // (same integer-minute expansion the server does), booked = materialized slot
  // rows that are full. { booked, total }; total 0 => no hours that weekday.
  Page.prototype.slotInfoFor = function (dISO) {
    var p = dISO.split('-');
    var wd = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
    var def = this.curDefaults();
    var total = 0;
    this.hours.forEach(function (h) {
      if (h.weekday !== wd || h.is_active === false) return;
      total += expandWindow(
        toMin(h.open_time), toMin(h.close_time),
        h.slot_minutes != null ? h.slot_minutes : def.dur,
        h.buffer_minutes != null ? h.buffer_minutes : def.buf
      ).length;
    });
    var booked = (this.slotRows[dISO] || []).filter(function (s) {
      return (s.booked_count || 0) >= (s.capacity || 1);
    }).length;
    return { booked: booked, total: total };
  };
  // Re-read this month's per-date rows (+ slot rows) and redraw the calendar.
  Page.prototype.refreshMonth = function () {
    var self = this;
    var from = iso(firstOfMonth(this.viewMonth)), to = iso(lastOfMonth(this.viewMonth));
    return Promise.all([
      API.listDates(this.vendorId, from, to),
      API.listSlots(this.vendorId, from, to)
    ]).then(function (r) {
      self.dates = {};
      ((r[0] && r[0].data) || []).forEach(function (d) { self.dates[d.the_date] = d; });
      self.slotRows = {};
      ((r[1] && r[1].data) || []).forEach(function (s) {
        (self.slotRows[s.the_date] = self.slotRows[s.the_date] || []).push(s);
      });
      self.renderDaysOff();
    });
  };

  Page.prototype.renderInbox = function () {
    var self = this;
    var isSlot = this.cfg.capacity_mode === 'slot';
    if (!this.pending.length) {
      this.$inbox.innerHTML =
        '<div class="ava-card"><h3>Requests</h3>' +
        '<p class="ava-note" style="margin:8px 0 0;">No pending requests. New date-tagged inquiries land here for you to confirm.</p></div>';
      return;
    }
    var byDate = {};
    this.pending.forEach(function (p) {
      (byDate[p.requested_date] = byDate[p.requested_date] || []).push(p);
    });
    var html = '<div class="ava-card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
      '<h3>Requests</h3><span class="ava-sub">' + this.pending.length + ' waiting on you · confirming reserves the spot</span></div>';
    Object.keys(byDate).sort().forEach(function (dISO) {
      var cap = self.capFor(dISO), remain = Math.max(cap - self.usedFor(dISO), 0);
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 2px;">' +
        '<span style="font-size:13px;font-weight:600;color:#3E3A55;">' + esc(prettyDate(dISO)) + '</span>' +
        (isSlot ? '' : remainChip(remain, cap)) + '</div>';
      byDate[dISO].forEach(function (p) {
        var what = p.requested_qty != null ? (p.requested_qty + ' requested') : 'slot request';
        html += '<div class="ava-row" data-inq="' + p.id + '">' +
          '<div class="ava-avatar">' + esc(initials(p.customer_name)) + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<p style="margin:0;font-size:14px;font-weight:500;color:#3E3A55;">' + esc(p.customer_name || 'Customer') +
              ' · <span style="color:#5D4F9E;">' + esc(what) + '</span></p>' +
            '<p style="margin:1px 0 0;font-size:12px;color:#8B8798;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
              esc(p.message || p.customer_email || '') + '</p></div>' +
          '<div class="ava-actions" style="display:flex;gap:7px;flex-shrink:0;">' +
            '<button class="ava-btn" data-a="confirm">Confirm</button>' +
            '<button class="ava-btn2" data-a="decline">Decline</button></div></div>';
      });
    });
    html += '</div>';
    this.$inbox.innerHTML = html;

    // $inbox persists across re-renders (settings Save re-calls renderInbox) —
    // bind once or a single Confirm click fires the RPC once per render.
    if (this._inboxWired) return;
    this._inboxWired = true;
    this.$inbox.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-a]');
      if (!btn) return;
      var row = btn.closest('[data-inq]');
      var id = Number(row.getAttribute('data-inq'));
      var actions = row.querySelector('.ava-actions');
      var act = btn.getAttribute('data-a');

      // Decline opens an inline panel (Francesca 2026-08-13): an OPTIONAL
      // customer-facing note plus an explicit Send step — which also replaces
      // the old "Decline — sure?" arming (decline can't be undone).
      if (act === 'decline') {
        if (row.querySelector('.ava-decline-panel')) return;
        var panel = document.createElement('div');
        panel.className = 'ava-decline-panel';
        panel.innerHTML =
          '<textarea class="ava-decline-note" maxlength="500" rows="2" placeholder="Optional: a short note for the customer, e.g. “booked up that week, the 24th is open”. It goes in their email."></textarea>' +
          '<div class="ava-decline-btns">' +
            '<button type="button" class="ava-btn2 ava-decline-send" data-a="decline-send">Send decline</button>' +
            '<button type="button" class="ava-btn2" data-a="decline-cancel">Keep request</button></div>';
        row.appendChild(panel);
        return;
      }
      if (act === 'decline-cancel') {
        var pc = row.querySelector('.ava-decline-panel');
        if (pc) pc.remove();
        return;
      }
      if (act === 'decline-send') {
        var pd = row.querySelector('.ava-decline-panel');
        var noteEl = pd && pd.querySelector('.ava-decline-note');
        var reason = noteEl ? String(noteEl.value || '').trim().slice(0, 500) : '';
        if (pd) pd.remove();
        actions.innerHTML = '<span class="ava-sub">Working…</span>';
        API.decline(id).then(function (r) {
          var res = (r && r.data) || {};
          if (res.ok) {
            actions.innerHTML = '<span class="ava-sub">Declined</span>';
            // Best-effort decline email carrying the optional note — the RPC
            // already committed the state; a mail failure must not undo it.
            // The chip only claims an email once the server says it sent one.
            if (API.notifyDeclined) {
              try {
                API.notifyDeclined(id, reason).then(function (nr) {
                  if (nr && nr.data && nr.data.sent) {
                    actions.innerHTML = '<span class="ava-sub">Declined · customer emailed</span>';
                  }
                }).catch(function () {});
              } catch (e2) {}
            }
            self.pending = self.pending.filter(function (p) { return p.id !== id; });
            self.refreshMonth();
          } else {
            actions.innerHTML = '<span class="ava-chip" style="background:#FAE9E2;color:#9E5F44;">Couldn’t update. Reload</span>';
          }
        });
        return;
      }

      actions.innerHTML = '<span class="ava-sub">Working…</span>';
      API.confirm(id).then(function (r) {
        var res = (r && r.data) || {};
        if (res.ok) {
          actions.innerHTML = '<span class="ava-chip" style="background:#E7F3EC;color:#3E7C5E;">✓ Confirmed · customer keeps their spot</span>';
          // Email the customer their request is confirmed (best-effort; the RPC
          // already committed the state — a mail failure must not undo it).
          if (API.notifyConfirmed) {
            try { API.notifyConfirmed(id); } catch (e) {}
          }
          // Refresh counters (a confirm changes the date's remaining — quantity
          // units AND slot booked-counts both live in refreshMonth's re-read).
          self.pending = self.pending.filter(function (p) { return p.id !== id; });
          self.refreshMonth();
        } else {
          actions.innerHTML = '<span class="ava-chip" style="background:#FAE9E2;color:#9E5F44;">' +
            (res.reason === 'would_oversell' ? 'Would oversell this date' : 'Couldn’t update. Reload') + '</span>';
        }
      });
    });
  };

  // ---- 2. Settings ----------------------------------------------------------
  Page.prototype.renderSettings = function () {
    var self = this, c = this.cfg;
    var slotMin = c.slot_minutes != null ? c.slot_minutes : 60;
    var bufMin = c.buffer_minutes != null ? c.buffer_minutes : 0;
    this.$settings.innerHTML =
      '<div class="ava-card">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
          '<h3>Settings</h3>' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#6C6880;cursor:pointer;">' +
            '<input type="checkbox" class="ava-enabled"' + (c.is_enabled ? ' checked' : '') + ' /> Calendar on</label>' +
        '</div>' +
        // #121: "Accepting new clients" MOVED OUT of Settings — see
        // renderNewClients(). It sat directly under the calendar config and read
        // as another booking knob, when it actually governs the vendor-level
        // new-client waitlist. It now lives on that queue's own card.
        '<p class="ava-sub" style="margin:0 0 4px;">Capacity mode</p>' +
        '<div class="ava-seg ava-mode" style="margin-bottom:14px;">' +
          '<div data-m="quantity" role="button" tabindex="0" aria-pressed="' + (c.capacity_mode === 'quantity') + '" class="' + (c.capacity_mode === 'quantity' ? 'on' : '') + '">By quantity</div>' +
          '<div data-m="slot" role="button" tabindex="0" aria-pressed="' + (c.capacity_mode === 'slot') + '" class="' + (c.capacity_mode === 'slot' ? 'on' : '') + '">By time slot</div>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:6px;">' +
          '<div class="ava-caprow"><p class="ava-sub" style="margin:0 0 4px;">Orders per day</p>' +
            '<span class="ava-step" data-f="default_daily_cap"><span data-d="-1" role="button" tabindex="0" aria-label="Decrease orders per day">&#8722;</span><b>' + c.default_daily_cap + '</b><span data-d="1" role="button" tabindex="0" aria-label="Increase orders per day">+</span></span></div>' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Show &ldquo;Limited&rdquo; at</p>' +
            '<span class="ava-step" data-f="limited_threshold"><span data-d="-1" role="button" tabindex="0" aria-label="Decrease Limited threshold">&#8722;</span><b>' + c.limited_threshold + '</b><span data-d="1" role="button" tabindex="0" aria-label="Increase Limited threshold">+</span></span></div>' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Minimum notice (hours)</p>' +
            '<span class="ava-step" data-f="lead_time_hours"><span data-d="-1" role="button" tabindex="0" aria-label="Decrease minimum notice">&#8722;</span><b>' + c.lead_time_hours + '</b><span data-d="1" role="button" tabindex="0" aria-label="Increase minimum notice">+</span></span></div>' +
        '</div>' +
        '<p class="ava-note ava-leadhint" style="margin:0 0 14px;">' + leadHint(c.lead_time_hours) + '</p>' +
        '<div class="ava-slotrow" style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:14px;">' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Booking length (min)</p>' +
            '<span class="ava-step" data-f="slot_minutes"><span data-d="-5" role="button" tabindex="0" aria-label="Decrease booking length">&#8722;</span><b>' + slotMin + '</b><span data-d="5" role="button" tabindex="0" aria-label="Increase booking length">+</span></span></div>' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Buffer between (min)</p>' +
            '<span class="ava-step" data-f="buffer_minutes"><span data-d="-5" role="button" tabindex="0" aria-label="Decrease buffer">&#8722;</span><b>' + bufMin + '</b><span data-d="5" role="button" tabindex="0" aria-label="Increase buffer">+</span></span></div>' +
        '</div>' +
        '<p class="ava-sub" style="margin:0 0 4px;">When a customer requests</p>' +
        '<div class="ava-seg ava-hold" style="margin-bottom:6px;">' +
          '<div data-h="on_confirm" role="button" tabindex="0" aria-pressed="' + (c.hold_mode === 'on_confirm') + '" class="' + (c.hold_mode === 'on_confirm' ? 'on' : '') + '">Hold on confirm</div>' +
          '<div data-h="on_inquiry" role="button" tabindex="0" aria-pressed="' + (c.hold_mode === 'on_inquiry') + '" class="' + (c.hold_mode === 'on_inquiry' ? 'on' : '') + '">Hold on inquiry</div>' +
        '</div>' +
        '<div class="ava-holdwin" style="' + (c.hold_mode === 'on_inquiry' ? '' : 'display:none;') + 'margin-bottom:6px;">' +
          '<p class="ava-sub" style="margin:6px 0 4px;">Release unconfirmed holds after (hours)</p>' +
          '<span class="ava-step" data-f="hold_window_hours"><span data-d="-1" role="button" tabindex="0" aria-label="Decrease hold window">&#8722;</span><b>' + c.hold_window_hours + '</b><span data-d="1" role="button" tabindex="0" aria-label="Increase hold window">+</span></span></div>' +
        '<div style="display:flex;align-items:center;gap:12px;margin-top:12px;">' +
          '<button class="ava-save">Save settings</button><span class="ava-savemsg ava-sub"></span></div>' +
      '</div>';

    // steppers — the +/- spans carry role=button, so Enter/Space must step too
    this.$settings.querySelectorAll('.ava-step').forEach(function (st) {
      function step(e) {
        var d = e.target.getAttribute && e.target.getAttribute('data-d');
        if (!d) return;
        var b = st.querySelector('b');
        var f = st.getAttribute('data-f');
        var min = f === 'hold_window_hours' ? 1 : f === 'slot_minutes' ? 5 : 0;
        b.textContent = String(Math.max(min, (+b.textContent) + Number(d)));
        if (f === 'lead_time_hours') {
          var hint = self.$settings.querySelector('.ava-leadhint');
          if (hint) hint.textContent = leadHint(+b.textContent);
        }
        // Length/buffer feed the slot preview + calendar totals — refresh live.
        if ((f === 'slot_minutes' || f === 'buffer_minutes') && self.cfg.capacity_mode === 'slot') {
          self.renderHours();
          self.renderDaysOff();
        }
      }
      st.addEventListener('click', step);
      st.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(e); }
      });
    });
    // segmented controls
    function seg(rootSel, attr, after) {
      var root = self.$settings.querySelector(rootSel);
      function pick(e) {
        var t = e.target.closest('div[' + attr + ']');
        if (!t) return;
        root.querySelectorAll('div').forEach(function (n) {
          n.classList.remove('on');
          n.setAttribute('aria-pressed', 'false');
        });
        t.classList.add('on');
        t.setAttribute('aria-pressed', 'true');
        if (after) after(t.getAttribute(attr));
      }
      root.addEventListener('click', pick);
      root.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); }
      });
    }
    seg('.ava-mode', 'data-m', function (m) {
      self.cfg.capacity_mode = m;                 // reflect the pending choice for the preview
      self.$settings.querySelector('.ava-caprow').style.display = (m === 'slot') ? 'none' : '';
      var sr = self.$settings.querySelector('.ava-slotrow');
      if (sr) sr.style.display = (m === 'slot') ? 'flex' : 'none';
      self.renderHours();                         // hours are shown both modes; preview only in slot
      self.renderDaysOff();                       // calendar numbers switch meaning with the mode
    });
    seg('.ava-hold', 'data-h', function (h) {
      self.$settings.querySelector('.ava-holdwin').style.display = (h === 'on_inquiry') ? '' : 'none';
    });
    if (c.capacity_mode === 'slot') {
      this.$settings.querySelector('.ava-caprow').style.display = 'none';
    } else {
      this.$settings.querySelector('.ava-slotrow').style.display = 'none';
    }

    // #121: the accepting-new-clients popover + toggle wiring moved with their
    // markup to renderNewClients(). Kept generic here in case Settings ever
    // grows its own "?" popover; scoped to $settings so it no-ops today.
    var infoWrap = this.$settings.querySelector('.ava-info-wrap');
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

    this.$settings.querySelector('.ava-save').addEventListener('click', function () {
      var read = function (f) { return +self.$settings.querySelector('.ava-step[data-f=' + f + '] b').textContent; };
      var fields = {
        is_enabled: self.$settings.querySelector('.ava-enabled').checked,
        capacity_mode: self.$settings.querySelector('.ava-mode .on').getAttribute('data-m'),
        hold_mode: self.$settings.querySelector('.ava-hold .on').getAttribute('data-h'),
        default_daily_cap: read('default_daily_cap'),
        limited_threshold: read('limited_threshold'),
        lead_time_hours: read('lead_time_hours'),
        hold_window_hours: read('hold_window_hours'),
        slot_minutes: read('slot_minutes'),
        buffer_minutes: read('buffer_minutes'),
        updated_at: new Date().toISOString()
      };
      var msg = self.$settings.querySelector('.ava-savemsg');
      msg.textContent = 'Saving…';
      API.saveConfig(self.vendorId, fields).then(function (r) {
        if (r && r.error) {
          msg.textContent = 'Couldn’t save. Availability needs a Pro or Featured plan.';
          msg.style.color = '#9E5F44';
        } else {
          msg.textContent = 'Saved';
          msg.style.color = '#3E7C5E';
          Object.assign(self.cfg, fields);
          self.renderInbox();
          self.renderHours();
          self.renderDaysOff();
        }
      });
    });
  };

  // ---- 3. Days off (+ owner counts) ------------------------------------------
  Page.prototype.renderDaysOff = function () {
    var self = this;
    var isSlot = this.cfg.capacity_mode === 'slot';
    var from = firstOfMonth(this.viewMonth), last = lastOfMonth(this.viewMonth);
    var pad = (from.getDay() + 6) % 7;
    var html = '<div class="ava-card">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<h3>Days off &amp; capacity</h3>' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<button type="button" class="ava-mnav" data-d="-1" aria-label="Previous month" style="cursor:pointer;color:#8B7FC4;font-size:17px;background:none;border:none;padding:2px 6px;line-height:1;">&#8249;</button>' +
          '<span style="font-size:13px;color:#6C6880;min-width:110px;text-align:center;">' +
            MONTHS[from.getMonth()] + ' ' + from.getFullYear() + '</span>' +
          '<button type="button" class="ava-mnav" data-d="1" aria-label="Next month" style="cursor:pointer;color:' + BRAND + ';font-size:17px;background:none;border:none;padding:2px 6px;line-height:1;">&#8250;</button>' +
        '</div></div>' +
      '<p class="ava-sub" style="margin:0 0 8px;">' +
        (isSlot
          ? 'Tap a date to block it. Numbers show booked of that day’s slots. Only you see these.'
          : 'Tap a date to block it. Numbers show confirmed of cap. Only you see these.') + '</p>' +
      '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;font-size:11px;color:#B0ACBC;text-align:center;margin-bottom:5px;">' +
      DOW_MON.map(function (d) { return '<div>' + d + '</div>'; }).join('') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;">';
    var i;
    for (i = 0; i < pad; i++) html += '<div class="ava-cell pad"></div>';
    for (i = 1; i <= last.getDate(); i++) {
      var dISO = iso(new Date(from.getFullYear(), from.getMonth(), i));
      var row = this.dates[dISO];
      var blocked = row && row.is_blocked;
      var sub, closed = false;
      if (blocked) {
        sub = 'Off';                 // explicit label — a bare strikethrough read as "nothing happened"
      } else if (isSlot) {
        // booked of generated slots; a weekday with no hours is CLOSED to
        // customers, so grey it out — active vs inactive at a glance.
        var si = this.slotInfoFor(dISO);
        closed = si.total === 0;
        sub = closed ? '' : si.booked + '/' + si.total;
      } else {
        sub = this.usedFor(dISO) + '/' + this.capFor(dISO);
      }
      html += '<div class="ava-cell' + (blocked ? ' off' : closed ? ' closed' : '') + '" data-date="' + dISO + '"' +
        ' role="button" tabindex="0" aria-pressed="' + (!!blocked) + '"' +
        ' aria-label="' + esc(prettyDate(dISO)) + (blocked ? ', blocked (day off)' : ', tap to block') + '">' +
        '<span>' + i + '</span>' +
        (sub ? '<span style="font-size:9px;font-weight:400;">' + sub + '</span>' : '') +
        '</div>';
    }
    html += '</div></div>';
    this.$daysoff.innerHTML = html;

    this.$daysoff.querySelectorAll('.ava-mnav').forEach(function (n) {
      n.addEventListener('click', function () {
        self.viewMonth = new Date(self.viewMonth.getFullYear(), self.viewMonth.getMonth() + Number(n.getAttribute('data-d')), 1);
        self.refreshMonth();
      });
    });
    this.$daysoff.querySelectorAll('.ava-cell[data-date]').forEach(function (cell) {
      cell.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); }
      });
      cell.addEventListener('click', function () {
        var dISO = cell.getAttribute('data-date');
        var row = self.dates[dISO];
        var nowBlocked = !(row && row.is_blocked);
        API.setDateBlocked(self.vendorId, dISO, nowBlocked).then(function (r) {
          if (r && r.error) {
            // Never fail silently — flash the cell and say why in the caption.
            cell.classList.add('err');
            var hintEl = self.$daysoff.querySelector('.ava-sub');
            if (hintEl) {
              hintEl.textContent = 'Couldn’t save that change. Check you’re signed in on a Pro or Featured plan, then reload.';
              hintEl.style.color = '#9E5F44';
            }
            setTimeout(function () { cell.classList.remove('err'); }, 1600);
            return;
          }
          self.dates[dISO] = Object.assign({}, row || { the_date: dISO, confirmed_units: 0 }, { is_blocked: nowBlocked });
          self.renderDaysOff();
        });
      });
    });
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
        '<p class="ava-note" style="margin:6px 0 12px;">Paste your scheduling link and customers book straight from your storefront with a &#8220;Book an appointment&#8221; button. Works with Calendly, Acuity, Square Appointments and similar &#8212; any secure (https) link.</p>' +
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
        msg.textContent = 'The link must start with https:// — copy it from your scheduler’s share button.';
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
          msg.textContent = 'Couldn’t save — use a full https:// link (SQL patch applied?).';
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
        msg.textContent = 'That doesn’t look like a link — it must start with https://';
        input.focus();
        return;
      }
      save(v);
    });
    var clear = this.$booking.querySelector('.ava-booking-clear');
    if (clear) clear.addEventListener('click', function () { input.value = ''; save(null); });
  };

  // ---- 4. Weekly hours (unified: storefront hours + slot generation) ----------
  // Live default length/buffer, read straight from the settings steppers so the
  // slot preview updates before the vendor even hits Save; falls back to cfg.
  Page.prototype.curDefaults = function () {
    var sd = this.$settings && this.$settings.querySelector('.ava-step[data-f=slot_minutes] b');
    var bd = this.$settings && this.$settings.querySelector('.ava-step[data-f=buffer_minutes] b');
    return {
      dur: sd ? +sd.textContent : (this.cfg.slot_minutes != null ? this.cfg.slot_minutes : 60),
      buf: bd ? +bd.textContent : (this.cfg.buffer_minutes != null ? this.cfg.buffer_minutes : 0)
    };
  };

  Page.prototype.renderHours = function () {
    var self = this;
    // Link redesign 2026-08-27: slot GENERATION is retired with the calendar,
    // so the per-window length/buffer preview never renders — hours are purely
    // the storefront Hours card now.
    var isSlot = false;
    var def = this.curDefaults();
    var byDay = {};
    this.hours.forEach(function (h) { (byDay[h.weekday] = byDay[h.weekday] || []).push(h); });

    var rows = [1, 2, 3, 4, 5, 6, 0].map(function (wd) {   // display Mon..Sun
      var wins = (byDay[wd] || []).slice().sort(function (a, b) { return toMin(a.open_time) - toMin(b.open_time); });
      var chips = wins.map(function (w) {
        var openM = toMin(w.open_time), closeM = toMin(w.close_time);
        var eDur = w.slot_minutes != null ? w.slot_minutes : def.dur;
        var eBuf = w.buffer_minutes != null ? w.buffer_minutes : def.buf;
        var custom = (w.slot_minutes != null || w.buffer_minutes != null);
        var extra = '';
        if (isSlot) {
          if (self._editOvr === w.id) {
            extra =
              '<div class="ava-ovr" data-ovrfor="' + w.id + '">' +
                '<label>Length <input type="number" class="ava-ovrdur" min="5" step="5" value="' + eDur + '" /></label>' +
                '<label>Buffer <input type="number" class="ava-ovrbuf" min="0" step="5" value="' + eBuf + '" /></label>' +
                '<button class="ava-btn2 ava-ovrsave" data-ovrsave="' + w.id + '">Save</button>' +
                (custom ? '<u class="ava-sub ava-ovrreset" data-ovrreset="' + w.id + '" style="cursor:pointer;">use default</u>' : '') +
                '<u class="ava-sub ava-ovrcancel" data-ovrcancel="' + w.id + '" style="cursor:pointer;">cancel</u>' +
              '</div>';
          } else {
            var slots = expandWindow(openM, closeM, eDur, eBuf);
            extra =
              '<span class="ava-hprev">' +
                (slots.length ? slots.map(fmt12).join(' · ') : 'no slot fits: widen this window or lower the length') +
              '</span>' +
              '<span class="ava-hovr' + (custom ? ' cust' : '') + '" data-ovr="' + w.id + '">' +
                eDur + ' min' + (eBuf ? ' · ' + eBuf + ' buffer' : '') + (custom ? ' (custom)' : '') +
              '</span>';
          }
        }
        return '<div class="ava-hwin" data-h="' + w.id + '">' +
            '<span class="ava-htime">' + fmt12(openM) + ' – ' + fmt12(closeM) + '</span>' +
            '<u data-delh="' + w.id + '" title="Remove">&#10005;</u>' + extra + '</div>';
      }).join('');
      // #93 — a day with hours gets "Copy" (Calendly-style): pick target days,
      // Apply REPLACES those days' hours with this day's windows (custom
      // per-window timings carried along).
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

    var intro = isSlot
      ? 'Your open hours &mdash; shown on your storefront. Bookable appointments are generated inside them from the length &amp; buffer above; tap a window to give that one custom timing. Closing for lunch? Add two windows (e.g. 9&ndash;12 and 1&ndash;5) &mdash; the gap stays unbookable.'
      : 'Your open hours &mdash; shown on your storefront so customers know when you’re available. Split days (e.g. a lunch break) are just two windows.';
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
      // open / cancel / save / reset the per-window override editor
      var ovr = e.target.closest('[data-ovr]');
      if (ovr) { self._editOvr = Number(ovr.getAttribute('data-ovr')); self.renderHours(); return; }
      var cancel = e.target.closest('[data-ovrcancel]');
      if (cancel) { self._editOvr = null; self.renderHours(); return; }
      var reset = e.target.closest('[data-ovrreset]');
      if (reset) {
        var rid = Number(reset.getAttribute('data-ovrreset'));
        API.updateHours(rid, { slot_minutes: null, buffer_minutes: null }).then(function () {
          self._editOvr = null; self.reloadHours();
        });
        return;
      }
      var save = e.target.closest('[data-ovrsave]');
      if (save) {
        var sid = Number(save.getAttribute('data-ovrsave'));
        var box = self.$hours.querySelector('[data-ovrfor="' + sid + '"]');
        var dur = Math.max(5, +(box.querySelector('.ava-ovrdur').value) || 5);
        var buf = Math.max(0, +(box.querySelector('.ava-ovrbuf').value) || 0);
        API.updateHours(sid, { slot_minutes: dur, buffer_minutes: buf }).then(function () {
          self._editOvr = null; self.reloadHours();
        });
        return;
      }
      // #93 — copy-hours flow: open the panel, cancel it, or apply the copy.
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
          // windows there (per-window slot/buffer overrides carried along).
          var dels = self.hours.filter(function (h) { return h.weekday === twd; })
            .map(function (h) { return API.removeHours(h.id); });
          return Promise.all(dels).then(function () {
            return Promise.all(srcWins.map(function (w) {
              return API.addHours(self.vendorId, twd, w.open_time, w.close_time, w.slot_minutes, w.buffer_minutes);
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

  // ---- 5. Waitlist (FEATURED-only perk) ----------------------------------------
  Page.prototype.renderWaitlist = function () {
    var self = this;
    if (!this.waitlistPlan) {
      // Pro vendors see the upsell teaser, not the queue (server refuses joins
      // and offers regardless — this is honest UI, same as the analytics locks).
      this.$waitlist.innerHTML =
        '<div class="ava-card" style="display:flex;align-items:center;justify-content:space-between;gap:14px;">' +
          '<div><h3>Sold-out date waitlist <span class="ava-chip" style="background:#FBEEDD;color:#B5793B;margin-left:6px;">Featured</span></h3>' +
          '<p class="ava-note" style="margin:6px 0 0;">When a date sells out, Featured storefronts capture the demand: customers join a queue for that day and you offer freed spots. Every cancellation becomes a warm lead.</p></div>' +
          '<a href="/pricing" style="flex-shrink:0;background:' + BRAND + ';color:#fff;border-radius:9px;padding:10px 16px;font-size:13px;font-weight:600;text-decoration:none;">Upgrade</a>' +
        '</div>';
      return;
    }
    // #121: DATED rows only. The date-less "new clients" queue moved to its own
    // card (renderNewClients) so it sits with the toggle that opens it — the two
    // used to share one "Waitlist" card and read as one feature.
    var dated = this.waitlist.filter(function (w) { return !!w.the_date; });
    if (!dated.length) { this.$waitlist.innerHTML = ''; return; }
    var byDate = {};
    dated.forEach(function (w) { (byDate[w.the_date] = byDate[w.the_date] || []).push(w); });
    var html = '<div class="ava-card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">' +
      '<h3>Sold-out date waitlist</h3><span class="ava-sub">' + dated.length + ' waiting on a specific day</span></div>' +
      '<p class="ava-note" style="margin:0 0 6px;">Each person below asked for one particular date. Offer a spot when that day frees up.</p>';
    Object.keys(byDate).sort().forEach(function (dISO) {
      html += '<p style="margin:12px 0 2px;font-size:13px;font-weight:600;color:#3E3A55;">' + esc(prettyDate(dISO)) + '</p>';
      html += waitlistRows(byDate[dISO]);
    });
    html += '</div>';
    this.$waitlist.innerHTML = html;
  };

  // #121: the vendor-level NEW-CLIENT queue and the switch that opens it, on one
  // card. Renders for EVERY plan — the toggle is not a Featured perk (any vendor
  // can say "not taking new clients"; only the customer-side JOIN is gated), and
  // it must stay reachable when the queue is empty, which is exactly when a
  // vendor reaches for it. That's why it can't live inside renderWaitlist, whose
  // two early returns blank the section for non-Featured or empty queues.
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
              '<span class="ava-ip-p"><b>On</b> &mdash; customers book you normally from your storefront.</span>' +
              '<span class="ava-ip-p"><b>Off</b> &mdash; your page says your books are full. Instead of the booking button, new customers join the queue on THIS card, and when you have room you tap <b>Offer spot</b> to invite one. Your hours stay visible either way.</span>' +
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

  // Shared by both waitlist cards — identical row, identical Offer flow.
  function waitlistRows(list) {
    var out = '';
    list.forEach(function (w, idx) {
      var right = w.status === 'offered'
        ? '<span class="ava-chip" style="background:#E7F3EC;color:#3E7C5E;">Offer sent</span>'
        : '<button class="ava-btn" data-offer="' + w.id + '">Offer spot</button>';
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

  // Offer flow, shared by both cards (delegated from the mount in shell()).
  Page.prototype.offerSpot = function (id) {
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
