/**
 * Lokali — vendor dashboard "Availability" page (#71), OWNER side.
 *
 * Load on /vendor-dashboard/availability AFTER scripts/lokali-supabase-client.js.
 * Self-mounting into <div id="lok-availability-page"></div> — no-op if absent.
 *
 * Surfaces (top to bottom, matching the locked mockups):
 *   1. Requests inbox — pending date-tagged inquiries grouped by date, each with
 *      Confirm (#6002ee) / Decline. Confirm is the ONLY capacity mover (the
 *      confirm_availability_inquiry RPC); the per-date "N of cap left" chip
 *      updates from the RPC's returned derived status + a re-read.
 *   2. Settings — enable toggle, capacity mode, daily cap, "Limited" threshold,
 *      Minimum notice (was "lead time"), booking length + buffer (slot mode),
 *      hold mode (+ window). Saved via availability_config upsert; RLS enforces
 *      owns_vendor + the Pro/Featured plan gate server-side.
 *   3. Hours — one weekly open→close schedule (split days = two windows). Shown
 *      on the storefront as "Hours"; in slot mode the bookable appointments are
 *      GENERATED inside each window from the length + buffer (avail_expand_slots),
 *      with an optional per-window timing override. Saved to availability_hours.
 *   4. Days off — month calendar; tap a date to block/unblock. Owner-only raw
 *      numbers per date: confirmed/cap in quantity mode, booked/generated-slots
 *      in slot mode (customers never see either).
 *   5. Waitlist — waiting/offered people per sold-out date, "Offer spot" calls
 *      offer_waitlist_spot (the emailing of the customer is a tracked follow-up).
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
    var human = h <= 0 ? 'no minimum — same-day requests are fine'
      : h < 24 ? 'about ' + h + ' hour' + (h === 1 ? '' : 's') + ' ahead'
      : 'about ' + Math.round(h / 24) + ' day' + (Math.round(h / 24) === 1 ? '' : 's') + ' ahead';
    return 'How far ahead customers must request — ' + human + '. Dates inside this window show as closed.';
  }

  function injectStyles() {
    if (document.getElementById('lok-ava-styles')) return;
    var css =
      '.lok-ava,.lok-ava *{font-family:' + FONT + ';box-sizing:border-box;}' +
      '.lok-ava{background:#F7F5FD;border-radius:20px;padding:22px;color:#45415A;}' +
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
      '.lok-ava .ava-row{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #F2EFF8;}' +
      '.lok-ava .ava-row:last-child{border-bottom:none;}' +
      '.lok-ava .ava-avatar{width:36px;height:36px;border-radius:50%;background:#EEE6FF;display:flex;align-items:center;' +
        'justify-content:center;color:' + BRAND + ';font-weight:600;font-size:13px;flex-shrink:0;}' +
      '.lok-ava input[type=time]{font-family:inherit;font-size:13px;color:#45415A;border:1px solid #E4DEF4;border-radius:9px;padding:5px 8px;background:#FCFBFE;}' +
      '.lok-ava .ava-tchip{display:inline-flex;align-items:center;gap:6px;background:#F3F0FC;color:#5D4F9E;font-size:13px;' +
        'font-weight:500;padding:5px 11px;border-radius:999px;margin:0 6px 6px 0;}' +
      '.lok-ava .ava-tchip u{cursor:pointer;text-decoration:none;opacity:.55;font-style:normal;}' +
      '.lok-ava .ava-save{font-family:inherit;font-size:14px;font-weight:600;color:#fff;background:' + BRAND + ';' +
        'border:none;border-radius:10px;padding:11px 22px;cursor:pointer;}' +
      '.lok-ava .ava-note{font-size:12px;color:#8B8798;line-height:1.5;}' +
      '.lok-ava .ava-hday{display:flex;align-items:flex-start;gap:12px;padding:9px 0;border-bottom:1px solid #F4F1FB;}' +
      '.lok-ava .ava-hday:last-child{border-bottom:none;}' +
      '.lok-ava .ava-hlabel{width:74px;flex-shrink:0;font-size:13px;font-weight:600;color:#5D4F9E;padding-top:7px;}' +
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
      '.lok-ava .ava-copy{flex-basis:100%;margin:8px 0 2px 86px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;' +
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
    // is the single source of truth, so the widget starts straight at the inbox.
    this.mount.className = 'lok-ava';
    // #85 (Francesca 2026-07-18): calendar right after the pending requests —
    // requests → calendar (days off) → settings → hours → waitlist.
    this.mount.innerHTML =
      '<div class="ava-inbox"></div>' +
      '<div class="ava-daysoff"></div>' +
      '<div class="ava-settings"></div>' +
      '<div class="ava-hours"></div>' +
      '<div class="ava-waitlist"></div>';
    this.$inbox = this.mount.querySelector('.ava-inbox');
    this.$settings = this.mount.querySelector('.ava-settings');
    this.$hours = this.mount.querySelector('.ava-hours');
    this.$daysoff = this.mount.querySelector('.ava-daysoff');
    this.$waitlist = this.mount.querySelector('.ava-waitlist');
  };

  Page.prototype.loadAll = function () {
    var self = this;
    var from = iso(firstOfMonth(this.viewMonth)), to = iso(lastOfMonth(this.viewMonth));
    Promise.all([
      API.getConfig(this.vendorId),
      API.listDates(this.vendorId, from, to),
      API.pendingRequests(this.vendorId),
      API.listHours(this.vendorId),
      API.listWaitlist(this.vendorId),
      API.waitlistOpen(this.vendorId),         // waitlist = Featured-only perk
      API.listSlots(this.vendorId, from, to)   // slot-mode booked counts for the calendar
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
    this.renderInbox();
    this.renderSettings();
    this.renderHours();
    this.renderDaysOff();
    this.renderWaitlist();
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

    this.$inbox.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-a]');
      if (!btn) return;
      var row = btn.closest('[data-inq]');
      var id = Number(row.getAttribute('data-inq'));
      var actions = row.querySelector('.ava-actions');
      actions.innerHTML = '<span class="ava-sub">Working…</span>';
      var call = btn.getAttribute('data-a') === 'confirm' ? API.confirm(id) : API.decline(id);
      call.then(function (r) {
        var res = (r && r.data) || {};
        if (res.ok) {
          actions.innerHTML = btn.getAttribute('data-a') === 'confirm'
            ? '<span class="ava-chip" style="background:#E7F3EC;color:#3E7C5E;">✓ Confirmed · customer keeps their spot</span>'
            : '<span class="ava-sub">Declined</span>';
          // Email the customer their request is confirmed (best-effort; the RPC
          // already committed the state — a mail failure must not undo it).
          if (btn.getAttribute('data-a') === 'confirm' && API.notifyConfirmed) {
            try { API.notifyConfirmed(id); } catch (e) {}
          }
          // Refresh counters (a confirm changes the date's remaining — quantity
          // units AND slot booked-counts both live in refreshMonth's re-read).
          self.pending = self.pending.filter(function (p) { return p.id !== id; });
          self.refreshMonth();
        } else {
          actions.innerHTML = '<span class="ava-chip" style="background:#FAE9E2;color:#9E5F44;">' +
            (res.reason === 'would_oversell' ? 'Would oversell this date' : 'Couldn’t update — reload') + '</span>';
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
        '<p class="ava-sub" style="margin:0 0 4px;">Capacity mode</p>' +
        '<div class="ava-seg ava-mode" style="margin-bottom:14px;">' +
          '<div data-m="quantity" class="' + (c.capacity_mode === 'quantity' ? 'on' : '') + '">By quantity</div>' +
          '<div data-m="slot" class="' + (c.capacity_mode === 'slot' ? 'on' : '') + '">By time slot</div>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:6px;">' +
          '<div class="ava-caprow"><p class="ava-sub" style="margin:0 0 4px;">Orders per day</p>' +
            '<span class="ava-step" data-f="default_daily_cap"><span data-d="-1">&#8722;</span><b>' + c.default_daily_cap + '</b><span data-d="1">+</span></span></div>' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Show &ldquo;Limited&rdquo; at</p>' +
            '<span class="ava-step" data-f="limited_threshold"><span data-d="-1">&#8722;</span><b>' + c.limited_threshold + '</b><span data-d="1">+</span></span></div>' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Minimum notice (hours)</p>' +
            '<span class="ava-step" data-f="lead_time_hours"><span data-d="-1">&#8722;</span><b>' + c.lead_time_hours + '</b><span data-d="1">+</span></span></div>' +
        '</div>' +
        '<p class="ava-note ava-leadhint" style="margin:0 0 14px;">' + leadHint(c.lead_time_hours) + '</p>' +
        '<div class="ava-slotrow" style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:14px;">' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Booking length (min)</p>' +
            '<span class="ava-step" data-f="slot_minutes"><span data-d="-5">&#8722;</span><b>' + slotMin + '</b><span data-d="5">+</span></span></div>' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Buffer between (min)</p>' +
            '<span class="ava-step" data-f="buffer_minutes"><span data-d="-5">&#8722;</span><b>' + bufMin + '</b><span data-d="5">+</span></span></div>' +
        '</div>' +
        '<p class="ava-sub" style="margin:0 0 4px;">When a customer requests</p>' +
        '<div class="ava-seg ava-hold" style="margin-bottom:6px;">' +
          '<div data-h="on_confirm" class="' + (c.hold_mode === 'on_confirm' ? 'on' : '') + '">Hold on confirm</div>' +
          '<div data-h="on_inquiry" class="' + (c.hold_mode === 'on_inquiry' ? 'on' : '') + '">Hold on inquiry</div>' +
        '</div>' +
        '<div class="ava-holdwin" style="' + (c.hold_mode === 'on_inquiry' ? '' : 'display:none;') + 'margin-bottom:6px;">' +
          '<p class="ava-sub" style="margin:6px 0 4px;">Release unconfirmed holds after (hours)</p>' +
          '<span class="ava-step" data-f="hold_window_hours"><span data-d="-1">&#8722;</span><b>' + c.hold_window_hours + '</b><span data-d="1">+</span></span></div>' +
        '<div style="display:flex;align-items:center;gap:12px;margin-top:12px;">' +
          '<button class="ava-save">Save settings</button><span class="ava-savemsg ava-sub"></span></div>' +
      '</div>';

    // steppers
    this.$settings.querySelectorAll('.ava-step').forEach(function (st) {
      st.addEventListener('click', function (e) {
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
      });
    });
    // segmented controls
    function seg(rootSel, attr, after) {
      var root = self.$settings.querySelector(rootSel);
      root.addEventListener('click', function (e) {
        var t = e.target.closest('div[' + attr + ']');
        if (!t) return;
        root.querySelectorAll('div').forEach(function (n) { n.classList.remove('on'); });
        t.classList.add('on');
        if (after) after(t.getAttribute(attr));
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
          msg.textContent = 'Couldn’t save — availability needs a Pro or Featured plan.';
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
          '<span class="ava-mnav" data-d="-1" style="cursor:pointer;color:#8B7FC4;font-size:17px;">&#8249;</span>' +
          '<span style="font-size:13px;color:#6C6880;min-width:110px;text-align:center;">' +
            MONTHS[from.getMonth()] + ' ' + from.getFullYear() + '</span>' +
          '<span class="ava-mnav" data-d="1" style="cursor:pointer;color:' + BRAND + ';font-size:17px;">&#8250;</span>' +
        '</div></div>' +
      '<p class="ava-sub" style="margin:0 0 8px;">' +
        (isSlot
          ? 'Tap a date to block it. Numbers show booked of that day’s slots — only you see these.'
          : 'Tap a date to block it. Numbers show confirmed of cap — only you see these.') + '</p>' +
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
      html += '<div class="ava-cell' + (blocked ? ' off' : closed ? ' closed' : '') + '" data-date="' + dISO + '">' +
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
              hintEl.textContent = 'Couldn’t save that change — check you’re signed in on a Pro or Featured plan, then reload.';
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
    var isSlot = this.cfg.capacity_mode === 'slot';
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
                (slots.length ? slots.map(fmt12).join(' · ') : 'no slot fits — widen this window or lower the length') +
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
            '<span class="ava-copyto">Copy ' + WDAYS[wd] + '’s hours to — this replaces those days’ existing hours:</span>' +
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
      self.renderDaysOff();     // slot-mode calendar totals derive from the hours
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
          '<div><h3>Waitlist <span class="ava-chip" style="background:#FBEEDD;color:#B5793B;margin-left:6px;">Featured</span></h3>' +
          '<p class="ava-note" style="margin:6px 0 0;">When a date sells out, Featured storefronts capture the demand — customers join a queue and you offer freed spots. Every cancellation becomes a warm lead.</p></div>' +
          '<a href="/pricing" style="flex-shrink:0;background:' + BRAND + ';color:#fff;border-radius:9px;padding:10px 16px;font-size:13px;font-weight:600;text-decoration:none;">Upgrade</a>' +
        '</div>';
      return;
    }
    if (!this.waitlist.length) { this.$waitlist.innerHTML = ''; return; }
    var byDate = {};
    this.waitlist.forEach(function (w) { (byDate[w.the_date] = byDate[w.the_date] || []).push(w); });
    var html = '<div class="ava-card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
      '<h3>Waitlist</h3><span class="ava-sub">' + this.waitlist.length + ' waiting for a spot</span></div>';
    Object.keys(byDate).sort().forEach(function (dISO) {
      html += '<p style="margin:12px 0 2px;font-size:13px;font-weight:600;color:#3E3A55;">' + esc(prettyDate(dISO)) + '</p>';
      byDate[dISO].forEach(function (w, idx) {
        var right = w.status === 'offered'
          ? '<span class="ava-chip" style="background:#E7F3EC;color:#3E7C5E;">Offer sent</span>'
          : '<button class="ava-btn" data-offer="' + w.id + '">Offer spot</button>';
        html += '<div class="ava-row">' +
          '<span style="font-size:12px;font-weight:600;color:#B0ACBC;width:14px;">' + (idx + 1) + '</span>' +
          '<div class="ava-avatar" style="background:#F5EFE4;color:#B5793B;">' + esc(initials(w.customer_name || w.customer_email)) + '</div>' +
          '<div style="flex:1;min-width:0;"><p style="margin:0;font-size:14px;font-weight:500;color:#3E3A55;">' +
            esc(w.customer_name || w.customer_email) +
            (w.requested_qty ? ' · <span style="color:#5D4F9E;">wants ' + w.requested_qty + '</span>' : '') + '</p>' +
            '<p style="margin:1px 0 0;font-size:12px;color:#8B8798;">' + esc(w.customer_email || '') + '</p></div>' +
          '<div data-wrow="' + w.id + '">' + right + '</div></div>';
      });
    });
    html += '</div>';
    this.$waitlist.innerHTML = html;

    this.$waitlist.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-offer]');
      if (!btn) return;
      var id = Number(btn.getAttribute('data-offer'));
      var cellEl = self.$waitlist.querySelector('[data-wrow="' + id + '"]');
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
    });
  };

  // ---- upsell (free plan) ------------------------------------------------------
  function renderUpsell(mount) {
    mount.className = 'lok-ava';
    mount.innerHTML =
      '<div class="ava-card" style="text-align:center;padding:34px 24px;">' +
        '<p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#3E3A55;">Availability calendar</p>' +
        '<p class="ava-note" style="margin:0 auto 18px;max-width:420px;">Show customers which dates are open, limited, or sold out — and confirm each order so you never oversell a day. Available on Pro and Featured plans.</p>' +
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
