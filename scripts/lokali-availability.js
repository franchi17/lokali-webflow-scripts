/**
 * Lokali — storefront availability calendar (#71), CUSTOMER side.
 *
 * Load AFTER scripts/lokali-supabase-client.js (needs window.LokaliSupabaseAPI +
 * window.LokaliSupabaseReady). Renders ONE storefront-level calendar on the
 * vendor detail page (/{slug}) — never per service/product. Capacity lives on
 * the vendor, so there is exactly one calendar per storefront.
 *
 * Mount: a <div id="lokali-availability"></div> placed in the Webflow Designer
 * where the section should appear (same convention as #lokali-share-detail). If
 * that element is absent it falls back to inserting before the services grid.
 *
 * Self-hiding: it probes availability_calendar() AND availability_hours_public()
 * — both return [] when the vendor isn't on the feature (disabled / not on a
 * Pro/Featured plan), so non-participating storefronts look exactly as today. A
 * vendor may publish Hours without turning the booking calendar on; in that case
 * only the "Hours" block renders (no date picker).
 *
 * Mode is inferred per date click: availability_slots(date) returns times for a
 * slot-mode vendor and [] for a quantity-mode vendor (a slot-mode date with no
 * template slots renders 'off' and isn't clickable) — so no extra config read,
 * and the customer never sees a raw count either way.
 */
(function () {
  'use strict';

  if (!window.LokaliSupabaseReady || !window.LokaliSupabaseAPI) return;
  var API = window.LokaliSupabaseAPI.availability;
  if (!API) return;

  var FONT = "'Plus Jakarta Sans', sans-serif";
  var BRAND = '#6002ee';
  var STATUS = {
    open:     { bg: '#E7F3EC', bd: '#B9DEC9', fg: '#3E7C5E', dot: '#7FC4A4', tag: 'Open' },
    limited:  { bg: '#FBF1DE', bd: '#EBD3A0', fg: '#96702E', dot: '#E6C079', tag: 'Limited' },
    sold_out: { bg: '#FAE9E2', bd: '#EBC3B2', fg: '#9E5F44', dot: '#DFA284', tag: 'Sold out' },
    off:      { bg: '#F1EFF5', bd: '#E7E4F0', fg: '#B0ACBC', dot: '#D3D0DD', tag: 'Off' },
    closed:   { bg: '#F1EFF5', bd: '#E7E4F0', fg: '#B0ACBC', dot: '#D3D0DD', tag: 'Closed' }
  };
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DOW = ['Mo','Tu','We','Th','Fr','Sa','Su']; // Monday-first display

  // ---- date helpers (local, no tz lib) -------------------------------------
  function iso(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function lastOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function mondayIndex(d) { return (d.getDay() + 6) % 7; } // 0=Mon … 6=Sun
  function prettyDate(isoStr) {
    var p = isoStr.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    return wd + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
  }); }
  // Friendly 12-hour labels. Server times are "HH:MM" (24h); we show "2:00 PM"
  // to customers but always submit the raw 24h string the RPC expects.
  function toMin(t) { var p = String(t == null ? '0:0' : t).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function fmt12(t) {
    var min = ((toMin(t) % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60, ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12;
    return h12 + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
  }
  var WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];  // schema weekday 0=Sun

  // ---- vendor id resolution ------------------------------------------------
  var RESERVED = ['the-market','vendor','vendors','pricing','about','contact-us','account',
                  'sign-in','sign-up','privacy','terms','vendor-resources','vendor-dashboard'];
  function resolveDirectId() {
    if (window.LOKALI_PUBLIC_VENDOR_ID != null && window.LOKALI_PUBLIC_VENDOR_ID !== '') {
      return String(window.LOKALI_PUBLIC_VENDOR_ID);
    }
    var el = document.querySelector('[data-lokali-vendor-id]');
    if (el && el.getAttribute('data-lokali-vendor-id')) return el.getAttribute('data-lokali-vendor-id');
    try {
      var qs = new URLSearchParams(location.search);
      return qs.get('id') || qs.get('v') || null;
    } catch (e) { return null; }
  }
  function slugFromPath() {
    var seg = (location.pathname || '').split('/').filter(Boolean);
    if (!seg.length) return null;
    var s = seg[0].toLowerCase();
    return RESERVED.indexOf(s) === -1 ? s : null;
  }
  function getVendorId() {
    var direct = resolveDirectId();
    if (direct && /^\d+$/.test(String(direct))) return Promise.resolve(Number(direct));
    var slug = slugFromPath();
    if (!slug) return Promise.resolve(null);
    return window.LokaliSupabaseAPI.vendors.getBySlug(slug).then(function (r) {
      return r && r.data ? r.data.id : null;
    }).catch(function () { return null; });
  }

  // ---- one-time styles -----------------------------------------------------
  function injectStyles() {
    if (document.getElementById('lok-av-styles')) return;
    var css =
      '.lok-av,.lok-av *{font-family:' + FONT + ';box-sizing:border-box;}' +
      '.lok-av{background:#F7F5FD;border-radius:20px;padding:22px;color:#45415A;margin:18px 0;}' +
      '.lok-av .av-card{background:#fff;border:1px solid #ECE8F6;border-radius:16px;padding:18px 20px;}' +
      '.lok-av .av-cell{aspect-ratio:1;border-radius:11px;display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;font-size:13px;font-weight:500;border:1px solid transparent;}' +
      '.lok-av .av-cell.clk{cursor:pointer;}' +
      '.lok-av .av-cell.sel{border:2px solid ' + BRAND + ' !important;}' +
      '.lok-av input,.lok-av textarea{width:100%;font-family:inherit;font-size:14px;color:#45415A;' +
        'border:1px solid #E4DEF4;border-radius:10px;padding:9px 12px;background:#FCFBFE;}' +
      '.lok-av .av-cta{width:100%;background:' + BRAND + ';color:#fff;border:none;border-radius:10px;' +
        'padding:12px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;}' +
      '.lok-av .av-cta[disabled]{opacity:.55;cursor:default;}' +
      '.lok-av .av-cta2{width:100%;background:#F5EFE4;color:#B5793B;border:none;border-radius:10px;' +
        'padding:11px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;}' +
      '.lok-av .av-step{display:flex;align-items:center;justify-content:space-between;border:1px solid #E4DEF4;' +
        'border-radius:10px;padding:7px 12px;background:#FCFBFE;}' +
      '.lok-av .av-step b{font-size:15px;font-weight:600;color:#5D4F9E;}' +
      '.lok-av .av-step span{cursor:pointer;font-size:18px;line-height:1;color:' + BRAND + ';user-select:none;padding:0 4px;}' +
      '.lok-av .av-slot{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;' +
        'border-radius:10px;margin-bottom:6px;font-size:14px;font-weight:500;}' +
      '.lok-av .av-slot.pick{cursor:pointer;}.lok-av .av-slot.on{outline:2px solid ' + BRAND + ';outline-offset:-2px;}';
    var s = document.createElement('style');
    s.id = 'lok-av-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- mount ---------------------------------------------------------------
  // Preferred: self-inject an "Availability" TAB into the listing's vl-tab bar
  // (data-vl-tab / data-vl-panel — lokali-vendor-listing.js). Both native and
  // injected click handlers query [data-vl-tab]/[data-vl-panel] live, so the
  // injected tab participates in switching with zero Webflow edits. The tab
  // only exists for vendors on the feature (boot() probes the calendar first).
  // Escape hatch: a #lokali-availability div placed in the Designer wins.
  function activateTab(name) {
    var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    all('[data-vl-tab]').forEach(function (t) {
      t.classList.toggle('vl-stab-active', t.getAttribute('data-vl-tab') === name);
    });
    all('[data-vl-panel]').forEach(function (p) {
      p.style.display = (p.getAttribute('data-vl-panel') === name) ? 'block' : 'none';
    });
  }
  function findMount() {
    var m = document.getElementById('lokali-availability');
    if (m) return m;

    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-vl-tab]'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('[data-vl-panel]'));
    if (tabs.length && panels.length) {
      // Clone an existing tab button so the injected one inherits the exact
      // Webflow classes/typography; retarget it to the new panel.
      // Prefer a PLAIN-TEXT tab (Reviews/About) as the prototype: the old code
      // cloned tabs[0] ("Services" + count chip) and its deepest-child walk
      // only sees ELEMENT children, so it relabeled the count CHIP — the tab
      // rendered as "Services [Availability]" instead of a plain "Availability".
      var proto = null;
      for (var ti = 0; ti < tabs.length; ti++) {
        if (tabs[ti].children.length === 0) { proto = tabs[ti]; break; }
      }
      proto = proto || tabs[0];
      var btn = proto.cloneNode(true);
      btn.classList.remove('vl-stab-active');
      btn.setAttribute('data-vl-tab', 'availability');
      btn.textContent = 'Availability';
      btn.addEventListener('click', function () { activateTab('availability'); });
      proto.parentNode.appendChild(btn);

      var panel = document.createElement('div');
      panel.setAttribute('data-vl-panel', 'availability');
      panel.style.display = 'none';
      var lastPanel = panels[panels.length - 1];
      lastPanel.parentNode.insertBefore(panel, lastPanel.nextSibling);

      var div = document.createElement('div');
      div.id = 'lokali-availability';
      panel.appendChild(div);
      return div;
    }

    // Fallback (no tab bar on this template): insert before the services grid.
    var anchor = document.getElementById('vl-services-grid');
    if (anchor) {
      var host = anchor.closest ? (anchor.closest('section') || anchor.parentNode) : anchor.parentNode;
      var div2 = document.createElement('div');
      div2.id = 'lokali-availability';
      host.parentNode.insertBefore(div2, host);
      return div2;
    }
    return null;
  }

  // ---- rendering -----------------------------------------------------------
  function Widget(mount, vendorId, hours, hasCalendar) {
    this.mount = mount;
    this.vendorId = vendorId;
    this.hours = hours || [];         // [{weekday, open, close}] from hoursPublic
    this.hasCalendar = !!hasCalendar; // false => hours-only storefront (booking off)
    this.viewMonth = firstOfMonth(new Date());
    this.statusByDate = {};
    this.selected = null;
    this.render();
    if (this.hasCalendar) this.loadMonth();
  }

  // "Hours" card — the vendor's weekly open→close schedule (split days render as
  // "9:00 AM – 12:00 PM, 2:00 – 5:00 PM"). Empty string when the vendor set none.
  Widget.prototype.hoursHTML = function () {
    if (!this.hours.length) return '';
    var byDay = {};
    this.hours.forEach(function (h) { (byDay[h.weekday] = byDay[h.weekday] || []).push(h); });
    var rows = [1, 2, 3, 4, 5, 6, 0].map(function (wd) {
      var wins = (byDay[wd] || []).slice().sort(function (a, b) { return toMin(a.open) - toMin(b.open); });
      var closed = !wins.length;
      var val = closed ? 'Closed'
        : wins.map(function (w) { return fmt12(w.open) + ' – ' + fmt12(w.close); }).join(', ');
      return '<div style="display:flex;justify-content:space-between;gap:14px;padding:6px 0;border-top:1px solid #F4F1FB;">' +
        '<span style="font-size:13px;font-weight:600;color:#4B4666;">' + WDAYS[wd] + '</span>' +
        '<span style="font-size:13px;color:' + (closed ? '#B0ACBC' : '#6C6880') + ';text-align:right;">' + esc(val) + '</span></div>';
    }).join('');
    return '<div class="av-card av-hours" style="margin-bottom:14px;">' +
      '<p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#3E3A55;">Hours</p>' + rows + '</div>';
  };

  Widget.prototype.calendarHTML = function () {
    return '<div class="av-card" style="margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
          '<p style="margin:0;font-size:15px;font-weight:600;color:#3E3A55;">Pick a date</p>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span class="av-nav" data-d="-1" style="cursor:pointer;color:#8B7FC4;font-size:18px;user-select:none;">&#8249;</span>' +
            '<span class="av-month" style="font-size:13px;color:#6C6880;min-width:110px;text-align:center;"></span>' +
            '<span class="av-nav" data-d="1" style="cursor:pointer;color:' + BRAND + ';font-size:18px;user-select:none;">&#8250;</span>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;font-size:11px;color:#B0ACBC;text-align:center;margin-bottom:6px;">' +
          DOW.map(function (d) { return '<div>' + d + '</div>'; }).join('') +
        '</div>' +
        '<div class="av-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;"></div>' +
        '<div style="display:flex;gap:16px;margin-top:13px;font-size:11px;color:#8B8798;">' +
          '<span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:' + STATUS.open.dot + ';"></span> Open</span>' +
          '<span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:' + STATUS.limited.dot + ';"></span> Limited</span>' +
          '<span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:' + STATUS.sold_out.dot + ';"></span> Sold out</span>' +
        '</div>' +
      '</div>' +
      '<div class="av-panel av-card"></div>';
  };

  Widget.prototype.render = function () {
    this.mount.className = 'lok-av';
    this.mount.innerHTML = this.hoursHTML() + (this.hasCalendar ? this.calendarHTML() : '');
    if (!this.hasCalendar) return;    // hours-only: nothing else to wire

    var self = this;
    this.mount.querySelectorAll('.av-nav').forEach(function (n) {
      n.addEventListener('click', function () {
        var next = addMonths(self.viewMonth, Number(n.getAttribute('data-d')));
        // Don't page before the current month or more than 2 months ahead.
        var floor = firstOfMonth(new Date());
        var ceil = addMonths(floor, 2);
        if (next < floor || next > ceil) return;
        self.viewMonth = next;
        self.selected = null;
        self.loadMonth();
      });
    });
    this.grid = this.mount.querySelector('.av-grid');
    this.panel = this.mount.querySelector('.av-panel');
    this.monthLabel = this.mount.querySelector('.av-month');
  };

  Widget.prototype.loadMonth = function () {
    var self = this;
    var from = firstOfMonth(this.viewMonth), to = lastOfMonth(this.viewMonth);
    this.monthLabel.textContent = MONTHS[from.getMonth()] + ' ' + from.getFullYear();
    this.grid.innerHTML = '';
    this.panel.innerHTML = '';
    API.calendar(this.vendorId, iso(from), iso(to)).then(function (r) {
      var rows = (r && r.data) || [];
      self.statusByDate = {};
      rows.forEach(function (row) { self.statusByDate[row.date] = row.status; });
      self.drawGrid();
    });
  };

  Widget.prototype.drawGrid = function () {
    var self = this;
    var from = firstOfMonth(this.viewMonth), last = lastOfMonth(this.viewMonth);
    var pad = mondayIndex(from);
    this.grid.innerHTML = '';
    var i;
    for (i = 0; i < pad; i++) this.grid.appendChild(document.createElement('div'));
    for (i = 1; i <= last.getDate(); i++) {
      var dISO = iso(new Date(from.getFullYear(), from.getMonth(), i));
      var st = this.statusByDate[dISO];
      var cell = document.createElement('div');
      if (!st) {
        cell.className = 'av-cell';
        cell.style.color = '#C9C5D6';
        cell.style.border = '1px solid #F0EDF8';
        cell.innerHTML = '<span>' + i + '</span>';
      } else {
        var s = STATUS[st] || STATUS.off;
        var clickable = (st === 'open' || st === 'limited' || st === 'sold_out');
        cell.className = 'av-cell' + (clickable ? ' clk' : '') + (dISO === this.selected ? ' sel' : '');
        cell.style.background = s.bg; cell.style.color = s.fg; cell.style.border = '1px solid ' + s.bd;
        cell.innerHTML = '<span>' + i + '</span><span style="font-size:9px;font-weight:400;margin-top:1px;">' + s.tag + '</span>';
        if (clickable) {
          (function (dd) { cell.addEventListener('click', function () { self.selectDate(dd); }); })(dISO);
        }
      }
      this.grid.appendChild(cell);
    }
  };

  Widget.prototype.selectDate = function (dISO) {
    this.selected = dISO;
    this.drawGrid();
    var self = this;
    var st = this.statusByDate[dISO];
    if (st === 'sold_out') { this.renderWaitlist(dISO); return; }
    this.panel.innerHTML = '<p style="margin:0;font-size:13px;color:#8B8798;">Loading…</p>';
    // Infer mode: slots() non-empty => slot mode; empty => quantity mode.
    API.slots(this.vendorId, dISO).then(function (r) {
      var slots = (r && r.data) || [];
      if (slots.length) self.renderSlotForm(dISO, slots);
      else self.renderQtyForm(dISO);
    });
  };

  Widget.prototype.contactFields = function () {
    return '<div style="display:flex;gap:10px;margin-bottom:12px;">' +
        '<div style="flex:1;"><p style="margin:0 0 4px;font-size:12px;color:#8B8798;">Your name</p>' +
          '<input class="av-name" maxlength="120" placeholder="Jordan Mills" /></div>' +
        '<div style="flex:1;"><p style="margin:0 0 4px;font-size:12px;color:#8B8798;">Email</p>' +
          '<input class="av-email" type="email" maxlength="200" placeholder="you@email.com" /></div>' +
      '</div>' +
      '<input class="av-hp" style="display:none;" tabindex="-1" autocomplete="off" />';
  };

  Widget.prototype.renderQtyForm = function (dISO) {
    var self = this;
    this.panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
        '<p style="margin:0;font-size:15px;font-weight:600;color:#3E3A55;">Request for ' + esc(prettyDate(dISO)) + '</p>' +
        '<span style="font-size:11px;font-weight:500;color:' + STATUS[self.statusByDate[dISO]].fg + ';background:' +
          STATUS[self.statusByDate[dISO]].bg + ';padding:4px 11px;border-radius:999px;">' +
          (self.statusByDate[dISO] === 'limited' ? 'Only a few left' : 'Open') + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:12px;">' +
        '<div style="flex:1;"><p style="margin:0 0 4px;font-size:12px;color:#8B8798;">How many?</p>' +
          '<div class="av-step"><span class="av-dec">&#8722;</span><b class="av-qty">1</b><span class="av-inc">+</span></div></div>' +
        '<div style="flex:1;"><p style="margin:0 0 4px;font-size:12px;color:#8B8798;">Phone (optional)</p>' +
          '<input class="av-phone" maxlength="40" placeholder="(555) 555-5555" /></div>' +
      '</div>' +
      this.contactFields() +
      '<p style="margin:0 0 4px;font-size:12px;color:#8B8798;">Anything they should know?</p>' +
      '<textarea class="av-msg" rows="2" maxlength="2000" style="margin-bottom:14px;resize:none;"></textarea>' +
      '<button class="av-cta av-send">Send request</button>' +
      '<p style="margin:9px 0 0;font-size:11px;color:#B0ACBC;text-align:center;">They confirm each order — you\'ll hear back before it\'s reserved.</p>';

    var qtyEl = this.panel.querySelector('.av-qty');
    this.panel.querySelector('.av-dec').addEventListener('click', function () {
      qtyEl.textContent = String(Math.max(1, (+qtyEl.textContent) - 1));
    });
    this.panel.querySelector('.av-inc').addEventListener('click', function () {
      qtyEl.textContent = String(Math.min(99, (+qtyEl.textContent) + 1));
    });
    this.panel.querySelector('.av-send').addEventListener('click', function () {
      self.submit(dISO, { qty: +qtyEl.textContent, slotTime: null });
    });
  };

  Widget.prototype.renderSlotForm = function (dISO, slots) {
    var self = this;
    var rows = slots.map(function (s, idx) {
      var av = s.status === 'available';
      var col = av ? STATUS.open : (s.status === 'held' ? STATUS.limited : STATUS.sold_out);
      var label = av ? 'Available' : (s.status === 'held' ? 'On hold' : 'Booked');
      return '<div class="av-slot' + (av ? ' pick' : '') + '" data-t="' + esc(s.time) + '" data-idx="' + idx + '" ' +
        'style="background:' + col.bg + ';color:' + col.fg + ';border:1px solid ' + col.bd + ';">' +
        '<span>' + esc(fmt12(s.time)) + '</span><span style="font-size:12px;">' + label + '</span></div>';
    }).join('');
    this.panel.innerHTML =
      '<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#3E3A55;">Book a slot for ' + esc(prettyDate(dISO)) + '</p>' +
      '<div class="av-slots" style="margin-bottom:14px;">' + rows + '</div>' +
      this.contactFields() +
      '<p style="margin:0 0 4px;font-size:12px;color:#8B8798;">Anything they should know?</p>' +
      '<textarea class="av-msg" rows="2" maxlength="2000" style="margin-bottom:14px;resize:none;"></textarea>' +
      '<button class="av-cta av-send" disabled>Pick a time to continue</button>';

    var picked = { time: null };
    var send = this.panel.querySelector('.av-send');
    this.panel.querySelectorAll('.av-slot.pick').forEach(function (el) {
      el.addEventListener('click', function () {
        self.panel.querySelectorAll('.av-slot').forEach(function (n) { n.classList.remove('on'); });
        el.classList.add('on');
        picked.time = el.getAttribute('data-t');
        send.removeAttribute('disabled');
        send.textContent = 'Request ' + fmt12(picked.time);
      });
    });
    send.addEventListener('click', function () {
      if (!picked.time) return;
      self.submit(dISO, { qty: null, slotTime: picked.time });
    });
  };

  Widget.prototype.readContact = function () {
    return {
      name: (this.panel.querySelector('.av-name') || {}).value || null,
      email: (this.panel.querySelector('.av-email') || {}).value || null,
      phone: (this.panel.querySelector('.av-phone') || {}).value || null,
      message: (this.panel.querySelector('.av-msg') || {}).value || null,
      website: (this.panel.querySelector('.av-hp') || {}).value || null
    };
  };

  Widget.prototype.submit = function (dISO, what) {
    var self = this;
    var c = this.readContact();
    if (!c.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) {
      var em = this.panel.querySelector('.av-email');
      if (em) { em.style.borderColor = '#DFA284'; em.focus(); }
      return;
    }
    var btn = this.panel.querySelector('.av-send');
    if (btn) { btn.setAttribute('disabled', 'disabled'); btn.textContent = 'Sending…'; }
    API.submitInquiry({
      vendorId: this.vendorId, date: dISO, qty: what.qty, slotTime: what.slotTime,
      name: c.name, email: c.email, phone: c.phone, message: c.message, website: c.website
    }).then(function (r) {
      var res = (r && r.data) || {};
      if (r && r.error && !res.reason) { self.errorState(dISO); return; }
      if (res.ok) { self.successState(dISO, false); return; }
      if (res.reason === 'sold_out') { self.renderWaitlist(dISO); return; }
      self.errorState(dISO);
    }).catch(function () { self.errorState(dISO); });
  };

  Widget.prototype.successState = function (dISO, isWaitlist) {
    this.panel.innerHTML =
      '<div style="text-align:center;padding:8px 0;">' +
        '<div style="font-size:30px;color:' + (isWaitlist ? '#B5793B' : '#4E9B7A') + ';">' + (isWaitlist ? '&#9733;' : '&#10003;') + '</div>' +
        '<p style="margin:10px 0 3px;font-size:15px;font-weight:600;color:#3E3A55;">' +
          (isWaitlist ? "You're on the waitlist" : 'Request sent') + '</p>' +
        '<p style="margin:0;font-size:13px;color:#8B8798;">' +
          (isWaitlist
            ? "We'll email you the moment a spot opens for " + esc(prettyDate(dISO)) + '.'
            : "They'll confirm your request for " + esc(prettyDate(dISO)) + ' shortly.') +
        '</p>' +
      '</div>';
  };

  Widget.prototype.errorState = function (dISO) {
    var self = this;
    this.panel.innerHTML =
      '<p style="margin:0 0 10px;font-size:14px;color:#9E5F44;">Something went wrong sending that. Please try again.</p>' +
      '<button class="av-cta2 av-retry">Back to ' + esc(prettyDate(dISO)) + '</button>';
    this.panel.querySelector('.av-retry').addEventListener('click', function () { self.selectDate(dISO); });
  };

  // Sold-out panel. The waitlist join is a FEATURED-only vendor perk — probe
  // has_waitlist_plan (anon RPC) and fall back to a plain sold-out message.
  Widget.prototype.renderWaitlist = function (dISO) {
    var self = this;
    if (this._waitlistOpen == null) {
      this.panel.innerHTML = '<p style="margin:0;font-size:13px;color:#8B8798;">Loading…</p>';
      API.waitlistOpen(this.vendorId).then(function (r) {
        self._waitlistOpen = (r && r.data) === true;
        self.renderWaitlist(dISO);
      });
      return;
    }
    if (!this._waitlistOpen) {
      this.panel.innerHTML =
        '<div style="display:flex;align-items:center;gap:9px;margin-bottom:6px;">' +
          '<span style="font-size:19px;color:#C77B63;">&#9888;</span>' +
          '<p style="margin:0;font-size:15px;font-weight:600;color:#3E3A55;">' + esc(prettyDate(dISO)) + ' is sold out</p></div>' +
        '<p style="margin:0;font-size:13px;color:#8B8798;line-height:1.5;">This day is fully booked — pick another date above.</p>';
      return;
    }
    this.panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:6px;">' +
        '<span style="font-size:19px;color:#C77B63;">&#9888;</span>' +
        '<p style="margin:0;font-size:15px;font-weight:600;color:#3E3A55;">' + esc(prettyDate(dISO)) + ' is sold out</p></div>' +
      '<p style="margin:0 0 14px;font-size:13px;color:#8B8798;line-height:1.5;">Join the waitlist and you\'ll be first to know if a spot frees up.</p>' +
      '<div style="display:flex;gap:10px;margin-bottom:10px;">' +
        '<input class="av-name" maxlength="120" placeholder="Your name" />' +
        '<input class="av-email" type="email" maxlength="200" placeholder="you@email.com" /></div>' +
      '<input class="av-hp" style="display:none;" tabindex="-1" autocomplete="off" />' +
      '<button class="av-cta2 av-join">Join the waitlist</button>';
    this.panel.querySelector('.av-join').addEventListener('click', function () {
      var email = (self.panel.querySelector('.av-email') || {}).value || '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        var em = self.panel.querySelector('.av-email');
        if (em) { em.style.borderColor = '#DFA284'; em.focus(); }
        return;
      }
      var btn = self.panel.querySelector('.av-join');
      btn.setAttribute('disabled', 'disabled'); btn.textContent = 'Joining…';
      API.joinWaitlist({
        vendorId: self.vendorId, date: dISO, email: email,
        name: (self.panel.querySelector('.av-name') || {}).value || null,
        website: (self.panel.querySelector('.av-hp') || {}).value || null
      }).then(function (r) {
        var res = (r && r.data) || {};
        if (res.ok) self.successState(dISO, true);
        else self.errorState(dISO);
      }).catch(function () { self.errorState(dISO); });
    });
  };

  // ---- boot ----------------------------------------------------------------
  function boot() {
    getVendorId().then(function (vid) {
      if (!vid) return;
      // Probe the booking calendar AND the published Hours together. Build the
      // section if EITHER is present: a vendor may show hours without turning the
      // booking calendar on. Both empty => not on the feature -> render nothing.
      var from = firstOfMonth(new Date()), to = lastOfMonth(new Date());
      Promise.all([
        API.calendar(vid, iso(from), iso(to)),
        API.hoursPublic ? API.hoursPublic(vid) : Promise.resolve({ data: [] })
      ]).then(function (res) {
        var calRows = (res[0] && res[0].data) || [];
        var hours = (res[1] && res[1].data) || [];
        if (!calRows.length && !hours.length) return;
        var mount = findMount();
        if (!mount) return;
        injectStyles();
        new Widget(mount, vid, hours, calRows.length > 0);
      });
    });
  }

  window.LokaliSupabaseReady.then(function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else { boot(); }
  });
})();
