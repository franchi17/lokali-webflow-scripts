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
 *      lead time, hold mode (+ window). Saved via availability_config upsert;
 *      RLS enforces owns_vendor + the Pro/Featured plan gate server-side.
 *   3. Days off — month calendar; tap a date to block/unblock. Owner sees the
 *      raw confirmed/cap counts here (customers never do).
 *   4. Weekly template (slot mode only) — recurring slots per weekday + per-date
 *      overrides ride the same Days-off calendar.
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
  function hhmm(t) { return String(t || '').slice(0, 5); }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
  }); }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
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
      '.lok-ava .ava-cell.off{background:#F1EFF5;color:#B0ACBC;text-decoration:line-through;border:1px solid #E7E4F0;}' +
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
      '.lok-ava .ava-note{font-size:12px;color:#8B8798;line-height:1.5;}';
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
    this.viewMonth = firstOfMonth(new Date());
    this.pending = [];
    this.template = [];
    this.waitlist = [];
    this.shell();
    this.loadAll();
  }

  Page.prototype.shell = function () {
    // No internal header — the Webflow page heading ("Availability" + subtitle)
    // is the single source of truth, so the widget starts straight at the inbox.
    this.mount.className = 'lok-ava';
    this.mount.innerHTML =
      '<div class="ava-inbox"></div>' +
      '<div class="ava-settings"></div>' +
      '<div class="ava-daysoff"></div>' +
      '<div class="ava-template"></div>' +
      '<div class="ava-waitlist"></div>';
    this.$inbox = this.mount.querySelector('.ava-inbox');
    this.$settings = this.mount.querySelector('.ava-settings');
    this.$daysoff = this.mount.querySelector('.ava-daysoff');
    this.$template = this.mount.querySelector('.ava-template');
    this.$waitlist = this.mount.querySelector('.ava-waitlist');
  };

  Page.prototype.loadAll = function () {
    var self = this;
    var from = iso(firstOfMonth(this.viewMonth)), to = iso(lastOfMonth(this.viewMonth));
    Promise.all([
      API.getConfig(this.vendorId),
      API.listDates(this.vendorId, from, to),
      API.pendingRequests(this.vendorId),
      API.listTemplate(this.vendorId),
      API.listWaitlist(this.vendorId),
      API.waitlistOpen(this.vendorId)          // waitlist = Featured-only perk
    ]).then(function (r) {
      self.cfg = (r[0] && r[0].data) || {
        vendors_id: self.vendorId, is_enabled: false, capacity_mode: 'quantity',
        hold_mode: 'on_confirm', hold_window_hours: 24, limited_threshold: 5,
        lead_time_hours: 12, default_daily_cap: 30, _absent: true
      };
      self.dates = {};
      ((r[1] && r[1].data) || []).forEach(function (row) { self.dates[row.the_date] = row; });
      self.pending = (r[2] && r[2].data) || [];
      self.template = (r[3] && r[3].data) || [];
      self.waitlist = (r[4] && r[4].data) || [];
      self.waitlistPlan = (r[5] && r[5].data) === true;
      self.renderAll();
    });
  };

  Page.prototype.renderAll = function () {
    this.renderInbox();
    this.renderSettings();
    this.renderDaysOff();
    this.renderTemplate();
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
          // Refresh counters + waitlist (a confirm changes the date's remaining).
          self.pending = self.pending.filter(function (p) { return p.id !== id; });
          API.listDates(self.vendorId, iso(firstOfMonth(self.viewMonth)), iso(lastOfMonth(self.viewMonth)))
            .then(function (rr) {
              self.dates = {};
              ((rr && rr.data) || []).forEach(function (d) { self.dates[d.the_date] = d; });
              self.renderDaysOff();
            });
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
        '<div style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:14px;">' +
          '<div class="ava-caprow"><p class="ava-sub" style="margin:0 0 4px;">Orders per day</p>' +
            '<span class="ava-step" data-f="default_daily_cap"><span data-d="-1">&#8722;</span><b>' + c.default_daily_cap + '</b><span data-d="1">+</span></span></div>' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Show &ldquo;Limited&rdquo; at</p>' +
            '<span class="ava-step" data-f="limited_threshold"><span data-d="-1">&#8722;</span><b>' + c.limited_threshold + '</b><span data-d="1">+</span></span></div>' +
          '<div><p class="ava-sub" style="margin:0 0 4px;">Lead time (hours)</p>' +
            '<span class="ava-step" data-f="lead_time_hours"><span data-d="-1">&#8722;</span><b>' + c.lead_time_hours + '</b><span data-d="1">+</span></span></div>' +
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
        var min = f === 'hold_window_hours' ? 1 : 0;
        b.textContent = String(Math.max(min, (+b.textContent) + Number(d)));
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
      self.$settings.querySelector('.ava-caprow').style.display = (m === 'slot') ? 'none' : '';
      self.$template.style.display = (m === 'slot') ? '' : 'none';
    });
    seg('.ava-hold', 'data-h', function (h) {
      self.$settings.querySelector('.ava-holdwin').style.display = (h === 'on_inquiry') ? '' : 'none';
    });
    if (c.capacity_mode === 'slot') this.$settings.querySelector('.ava-caprow').style.display = 'none';

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
        }
      });
    });
  };

  // ---- 3. Days off (+ owner counts) ------------------------------------------
  Page.prototype.renderDaysOff = function () {
    var self = this;
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
      '<p class="ava-sub" style="margin:0 0 8px;">Tap a date to block it. Numbers show confirmed of cap — only you see these.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;font-size:11px;color:#B0ACBC;text-align:center;margin-bottom:5px;">' +
      DOW_MON.map(function (d) { return '<div>' + d + '</div>'; }).join('') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;">';
    var i;
    for (i = 0; i < pad; i++) html += '<div class="ava-cell pad"></div>';
    for (i = 1; i <= last.getDate(); i++) {
      var dISO = iso(new Date(from.getFullYear(), from.getMonth(), i));
      var row = this.dates[dISO];
      var blocked = row && row.is_blocked;
      var used = this.usedFor(dISO), cap = this.capFor(dISO);
      html += '<div class="ava-cell' + (blocked ? ' off' : '') + '" data-date="' + dISO + '">' +
        '<span>' + i + '</span>' +
        (blocked ? '' : '<span style="font-size:9px;font-weight:400;">' + used + '/' + cap + '</span>') +
        '</div>';
    }
    html += '</div></div>';
    this.$daysoff.innerHTML = html;

    this.$daysoff.querySelectorAll('.ava-mnav').forEach(function (n) {
      n.addEventListener('click', function () {
        self.viewMonth = new Date(self.viewMonth.getFullYear(), self.viewMonth.getMonth() + Number(n.getAttribute('data-d')), 1);
        API.listDates(self.vendorId, iso(firstOfMonth(self.viewMonth)), iso(lastOfMonth(self.viewMonth)))
          .then(function (r) {
            self.dates = {};
            ((r && r.data) || []).forEach(function (d) { self.dates[d.the_date] = d; });
            self.renderDaysOff();
          });
      });
    });
    this.$daysoff.querySelectorAll('.ava-cell[data-date]').forEach(function (cell) {
      cell.addEventListener('click', function () {
        var dISO = cell.getAttribute('data-date');
        var row = self.dates[dISO];
        var nowBlocked = !(row && row.is_blocked);
        API.setDateBlocked(self.vendorId, dISO, nowBlocked).then(function (r) {
          if (r && r.error) return; // plan gate / not signed in — leave as-is
          self.dates[dISO] = Object.assign({}, row || { the_date: dISO, confirmed_units: 0 }, { is_blocked: nowBlocked });
          self.renderDaysOff();
        });
      });
    });
  };

  // ---- 4. Weekly template (slot mode) ----------------------------------------
  Page.prototype.renderTemplate = function () {
    var self = this;
    var rows = [1, 2, 3, 4, 5, 6, 0].map(function (wd) {   // display Mon..Sun
      var slots = self.template.filter(function (t) { return t.weekday === wd && t.is_active !== false; });
      var chips = slots.map(function (t) {
        return '<span class="ava-tchip">' + esc(hhmm(t.slot_time)) +
          ' <u data-del="' + t.id + '">&#10005;</u></span>';
      }).join('');
      return '<div style="display:flex;align-items:flex-start;gap:12px;padding:7px 0;">' +
        '<span style="width:38px;font-size:13px;font-weight:500;color:#6C6880;padding-top:5px;">' + WDAYS[wd] + '</span>' +
        '<div style="flex:1;">' + (chips || '<span class="ava-sub" style="line-height:30px;">Day off</span>') + '</div>' +
        '<span style="display:inline-flex;gap:6px;align-items:center;">' +
          '<input type="time" data-wd="' + wd + '" step="300" />' +
          '<button class="ava-btn2" data-add="' + wd + '">Add</button></span></div>';
    }).join('');
    this.$template.innerHTML =
      '<div class="ava-card">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<h3>Weekly slots</h3><span class="ava-sub">Repeats every week · block single dates above</span></div>' +
        rows + '</div>';
    this.$template.style.display = this.cfg.capacity_mode === 'slot' ? '' : 'none';

    this.$template.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) {
        API.removeTemplateSlot(Number(del.getAttribute('data-del'))).then(function (r) {
          if (r && r.error) return;
          self.template = self.template.filter(function (t) { return t.id !== Number(del.getAttribute('data-del')); });
          self.renderTemplate();
        });
        return;
      }
      var add = e.target.closest('button[data-add]');
      if (add) {
        var wd = Number(add.getAttribute('data-add'));
        var input = self.$template.querySelector('input[data-wd="' + wd + '"]');
        if (!input || !input.value) return;
        API.addTemplateSlot(self.vendorId, wd, input.value, 1).then(function (r) {
          if (r && r.error) return;
          API.listTemplate(self.vendorId).then(function (rr) {
            self.template = (rr && rr.data) || [];
            self.renderTemplate();
          });
        });
      }
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
