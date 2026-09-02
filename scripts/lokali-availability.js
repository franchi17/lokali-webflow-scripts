/**
 * Lokali, storefront availability section (#71, link redesign 2026-08-27,
 * cleanup + Featured embed 2026-09-02). CUSTOMER side: "Book an appointment"
 * (the vendor's external scheduling link: Calendly, Acuity, Square etc.), the
 * weekly Hours card, and the books-full banner with the general new-client
 * waitlist join.
 *
 * The NATIVE booking calendar / slot picker / sold-out-date waitlist retired on
 * 2026-08-27 (usage check: zero real usage). Its code was removed from this file
 * on 2026-09-02 (#157 CLEAN sweep). Do not re-wire it.
 *
 * FEATURED inline embed (#157 fast-follow, 2026-09-02): when the vendor is on
 * the Featured plan and the link is on a scheduler known to permit framing,
 * the scheduler renders INSIDE the card (iframe) with an "open in a new tab"
 * escape hatch. Every other case, and every other plan, keeps the button.
 *
 * Load AFTER scripts/lokali-supabase-client.js (needs window.LokaliSupabaseAPI +
 * window.LokaliSupabaseReady). Renders ONE storefront-level section on the
 * vendor detail page (/{slug}), never per service/product.
 *
 * Mount: a <div id="lokali-availability"></div> placed in the Webflow Designer
 * where the section should appear (same convention as #lokali-share-detail). If
 * that element is absent it falls back to inserting before the services grid.
 *
 * Self-hiding: it probes availability_booking_link() AND
 * availability_hours_public(). Link null + hours [] when the vendor isn't on
 * the feature (nothing set / not on a Pro/Featured plan), so non-participating
 * storefronts look exactly as today. A vendor may publish Hours without a
 * booking link, or the reverse; either alone renders its card.
 */
(function () {
  'use strict';

  if (!window.LokaliSupabaseReady || !window.LokaliSupabaseAPI) return;
  var API = window.LokaliSupabaseAPI.availability;
  if (!API) return;

  var FONT = "'Plus Jakarta Sans', sans-serif";
  var BRAND = '#6002ee';

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
  }); }
  // Friendly 12-hour labels. Server times are "HH:MM" (24h); we show "2:00 PM".
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
      '.lok-av input{width:100%;font-family:inherit;font-size:14px;color:#45415A;' +
        'border:1px solid #E4DEF4;border-radius:10px;padding:9px 12px;background:#FCFBFE;}' +
      '.lok-av .av-cta{width:100%;background:' + BRAND + ';color:#fff;border:none;border-radius:10px;' +
        'padding:12px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;}' +
      '.lok-av .av-cta[disabled]{opacity:.55;cursor:default;}' +
      // Featured inline embed: the scheduler's own UI inside a soft frame. The
      // height is the scheduler's comfortable minimum (Calendly documents 700px
      // for its inline widget; Acuity fits in less); phones get a shorter frame
      // so the card never swallows the whole viewport.
      '.lok-av .av-embed{position:relative;border:1px solid #ECE8F6;border-radius:12px;background:#FAF9FE;overflow:hidden;}' +
      '.lok-av .av-embed iframe{display:block;width:100%;height:700px;border:0;background:#fff;}' +
      '.lok-av .av-embed-wait{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;gap:8px;color:#8B7FC4;font-size:13px;font-weight:600;pointer-events:none;}' +
      '.lok-av .av-embed.on .av-embed-wait{display:none;}' +
      '.lok-av .av-alt{display:block;margin:10px 0 0;text-align:center;font-size:12px;color:#8B8798;text-decoration:none;}' +
      '.lok-av .av-alt:hover{color:' + BRAND + ';}' +
      '@media (max-width:767px){' +
        // The lilac wrapper made the cards narrower than everything else on
        // the page: strip it so booking + hours span the full column.
        '.lok-av{padding:0;background:transparent;margin:14px 0;}' +
        '.lok-av .av-card{padding:14px;}' +
        '.lok-av .av-embed iframe{height:620px;}' +
      '}';
    var s = document.createElement('style');
    s.id = 'lok-av-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- mount ---------------------------------------------------------------
  // Preferred: self-inject an "Availability" TAB into the listing's vl-tab bar
  // (data-vl-tab / data-vl-panel, lokali-vendor-listing.js). Both native and
  // injected click handlers query [data-vl-tab]/[data-vl-panel] live, so the
  // injected tab participates in switching with zero Webflow edits. The tab
  // only exists for vendors on the feature (boot() probes first).
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
      // only sees ELEMENT children, so it relabeled the count CHIP and the tab
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

  // ---- scheduler recognition + Featured embed ------------------------------
  // Host match is exact-or-subdomain, never a substring, so a link on
  // "calendly.com.evil.example" is neither named nor embedded.
  function hostOf(url) {
    try {
      var u = new URL(url);
      if (u.protocol !== 'https:') return null;
      return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch (e) { return null; }
  }
  function hostMatches(h, d) { return h === d || h.slice(-(d.length + 1)) === '.' + d; }
  var KNOWN = [
    ['calendly.com', 'Calendly'],
    ['acuityscheduling.com', 'Acuity Scheduling'], ['squarespacescheduling.com', 'Acuity Scheduling'],
    ['as.me', 'Acuity Scheduling'],
    ['square.site', 'Square Appointments'], ['squareup.com', 'Square Appointments'],
    ['setmore.com', 'Setmore'], ['booksy.com', 'Booksy']
  ];
  function schedulerName(url) {
    var h = hostOf(url);
    if (!h) return null;
    for (var i = 0; i < KNOWN.length; i++) if (hostMatches(h, KNOWN[i][0])) return KNOWN[i][1];
    return h;
  }
  // Schedulers whose booking pages permit being framed by another site. Calendly
  // documents its inline widget as exactly this iframe; Acuity's own "embed"
  // snippet is an iframe of the client scheduling page. Square's booking site
  // sends X-Frame-Options: SAMEORIGIN (checked 2026-09-02), so it stays a button:
  // a blocked frame renders BLANK and JS cannot detect it, which is why this
  // list is an allowlist and not a try-then-fallback.
  var EMBED_HOSTS = ['calendly.com', 'acuityscheduling.com', 'squarespacescheduling.com', 'as.me'];
  function embedSrc(url) {
    var h = hostOf(url);
    if (!h) return null;
    var ok = false;
    for (var i = 0; i < EMBED_HOSTS.length; i++) if (hostMatches(h, EMBED_HOSTS[i])) { ok = true; break; }
    if (!ok) return null;
    try {
      var u = new URL(url);
      if (hostMatches(h, 'calendly.com')) {
        // Calendly's inline-embed hints: attribute the booking to this site and
        // keep its cookie banner out of the frame (the storefront has its own).
        u.searchParams.set('embed_domain', location.hostname);
        u.searchParams.set('embed_type', 'Inline');
        u.searchParams.set('hide_gdpr_banner', '1');
      }
      return u.href;
    } catch (e) { return null; }
  }

  // ---- rendering -----------------------------------------------------------
  function Widget(mount, vendorId, hours, opts) {
    this.mount = mount;
    this.vendorId = vendorId;
    this.hours = hours || [];         // [{weekday, open, close}] from hoursPublic
    // "Accepting new clients" (Francesca 2026-08-13): off = the booking flow is
    // replaced by a full-books note + (Featured) the general waitlist join.
    this.accepting = !opts || opts.accepting !== false;
    // has_waitlist_plan() is true for the FEATURED plan only, so it doubles as
    // the Featured signal for the inline embed (no extra RPC, already public).
    this.isFeatured = !!(opts && opts.canWaitlist);
    this.canWaitlist = this.isFeatured;
    // External scheduling link (2026-08-27): replaces the native calendar.
    this.bookingUrl = (opts && opts.bookingUrl) || null;
    this.embedUrl = (this.isFeatured && this.bookingUrl) ? embedSrc(this.bookingUrl) : null;
    this.render();
  }

  // Full-books banner + general (date-less) waitlist join.
  Widget.prototype.closedHTML = function () {
    var inp = 'font-family:inherit;font-size:16px;color:#45415A;border:1px solid #E4DEF4;border-radius:9px;padding:9px 11px;background:#fff;box-sizing:border-box;width:100%;';
    return '<div class="av-card av-closed" style="margin-bottom:14px;">' +
      '<p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#3E3A55;">Not taking new clients right now</p>' +
      '<p style="margin:0;font-size:13px;color:#6C6880;line-height:1.5;">' + (this.canWaitlist
        // #121: name the LAYER. This is the vendor-level new-client queue (a
        // date-less availability_waitlist row).
        ? 'Their books are full at the moment. Join their new-client waitlist and they’ll reach out when they’re taking clients again.'
        : 'Their books are full at the moment. Check back soon.') + '</p>' +
      (this.canWaitlist
        ? '<div class="av-join" style="margin-top:12px;display:flex;flex-direction:column;gap:8px;max-width:340px;">' +
            '<input type="text" class="av-join-name" placeholder="Your name" style="' + inp + '">' +
            '<input type="email" class="av-join-email" placeholder="you@email.com" style="' + inp + '">' +
            '<input type="text" class="av-join-hp" tabindex="-1" autocomplete="off" style="display:none;">' +
            '<button type="button" class="av-join-btn" style="font-family:inherit;font-size:14px;font-weight:600;color:#fff;background:#6002EE;border:none;border-radius:9px;padding:11px 16px;cursor:pointer;">Join the new-client waitlist</button>' +
            '<p class="av-join-msg" style="margin:0;font-size:12px;color:#8B8798;"></p>' +
          '</div>'
        : '') +
      '</div>';
  };

  Widget.prototype.bindJoin = function () {
    var self = this;
    var btn = this.mount.querySelector('.av-join-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var name = (self.mount.querySelector('.av-join-name').value || '').trim();
      var email = (self.mount.querySelector('.av-join-email').value || '').trim();
      var hp = (self.mount.querySelector('.av-join-hp').value || '').trim();
      var msg = self.mount.querySelector('.av-join-msg');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Please enter a valid email.'; return; }
      btn.disabled = true; btn.style.opacity = '.6';
      API.joinWaitlist({ vendorId: self.vendorId, date: null, email: email, name: name || null, website: hp || null })
        .then(function (r) {
          var res = (r && r.data) || {};
          if (res.ok) {
            var box = self.mount.querySelector('.av-join');
            box.innerHTML = '<p style="margin:0;font-size:13.5px;font-weight:600;color:#3E7C5E;">You’re on the new-client waitlist ✓ They’ll reach out when they’re taking clients again.</p>';
          } else {
            btn.disabled = false; btn.style.opacity = '';
            msg.textContent = 'Couldn’t join right now. Please try again.';
          }
        })
        .catch(function () { btn.disabled = false; btn.style.opacity = ''; msg.textContent = 'Couldn’t join right now. Please try again.'; });
    });
  };

  // "Hours" card: the vendor's weekly open to close schedule (split days render
  // as "9:00 AM – 12:00 PM, 2:00 – 5:00 PM"). Empty string when the vendor set none.
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

  // "Book an appointment" card: the vendor's external scheduling link
  // (https-only, enforced in the DB and re-checked in boot). Empty string when
  // the vendor set no link. Featured + embeddable host = the scheduler inline;
  // everything else = the button. The .av-booking class is load-bearing:
  // lokali-vendor-listing.js keys its "Books online" highlight on it.
  Widget.prototype.bookingHTML = function () {
    if (!this.bookingUrl) return '';
    var who = schedulerName(this.bookingUrl);
    var href = esc(this.bookingUrl);
    var head =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">' +
        '<p style="margin:0;font-size:15px;font-weight:600;color:#3E3A55;">Book an appointment</p>' +
        '<span style="font-size:11px;font-weight:500;padding:4px 11px;border-radius:999px;background:#E9F4EE;color:#3E7C5E;white-space:nowrap;">Accepting new clients</span>' +
      '</div>';
    if (this.embedUrl) {
      return '<div class="av-card av-booking av-booking-embed" style="margin-bottom:14px;">' + head +
        '<p style="margin:0 0 12px;font-size:13px;color:#6C6880;line-height:1.5;">Pick a time that works for you. You are booking on the vendor&#8217;s ' + esc(who || 'scheduling') + ' page, right here.</p>' +
        '<div class="av-embed">' +
          '<div class="av-embed-wait" aria-hidden="true">' +
            '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"></rect><path d="M16 2v4M8 2v4M3 10h18M8 15h2M14 15h2M8 18h2"></path></svg>' +
            '<span>Loading the scheduler&#8230;</span>' +
          '</div>' +
          '<iframe class="av-embed-frame" data-src="' + esc(this.embedUrl) + '" title="Book an appointment' + (who ? ' on ' + esc(who) : '') + '" ' +
            'loading="lazy" referrerpolicy="strict-origin-when-cross-origin" ' +
            'sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>' +
        '</div>' +
        '<a class="av-alt" href="' + href + '" target="_blank" rel="noopener nofollow">Open in a new tab instead</a>' +
        '</div>';
    }
    return '<div class="av-card av-booking" style="margin-bottom:14px;">' + head +
      '<p style="margin:0 0 12px;font-size:13px;color:#6C6880;line-height:1.5;">Pick a time that works for you. Booking opens the vendor&#8217;s scheduling page.</p>' +
      '<a class="av-cta" href="' + href + '" target="_blank" rel="noopener nofollow" ' +
        'style="display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>' +
        '<span>Book an appointment</span></a>' +
      (who ? '<p style="margin:9px 0 0;font-size:11px;color:#B0ACBC;text-align:center;">Opens the vendor&#8217;s ' + esc(who) + ' page</p>' : '') +
      '</div>';
  };

  // The frame's src is set only once the card is near the viewport: the section
  // usually sits below the fold (or in a hidden tab), and a third-party
  // scheduler is the heaviest thing on the page.
  Widget.prototype.armEmbed = function () {
    var box = this.mount.querySelector('.av-embed');
    var frame = box && box.querySelector('.av-embed-frame');
    if (!frame) return;
    var armed = false;
    function arm() {
      if (armed) return;
      armed = true;
      frame.addEventListener('load', function () { box.classList.add('on'); });
      frame.src = frame.getAttribute('data-src');
      // A blocked or very slow frame would leave the placeholder forever; drop
      // it after a beat either way so the "open in a new tab" link stands alone.
      setTimeout(function () { box.classList.add('on'); }, 8000);
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); arm(); } });
      }, { rootMargin: '300px 0px' });
      io.observe(box);
    } else { arm(); }
  };

  Widget.prototype.render = function () {
    this.mount.className = 'lok-av';
    // Books full: the closed banner (+ waitlist join) replaces the booking
    // flow entirely; hours stay visible for existing clients.
    if (!this.accepting) {
      this.mount.innerHTML = this.closedHTML() + this.hoursHTML();
      this.bindJoin();
      return;
    }
    // Booking leads, hours follow (F 2026-07-20).
    this.mount.innerHTML = this.bookingHTML() + this.hoursHTML();
    if (this.embedUrl) this.armEmbed();
  };

  // ---- boot ----------------------------------------------------------------
  function boot() {
    getVendorId().then(function (vid) {
      if (!vid) return;
      // Probe the booking link AND the published Hours together. Build the
      // section if EITHER is present. Both empty => not on the feature ->
      // render nothing.
      Promise.all([
        API.bookingLink ? API.bookingLink(vid) : Promise.resolve(null),
        API.hoursPublic ? API.hoursPublic(vid) : Promise.resolve({ data: [] }),
        // Defensive probes: an RPC error reads as "accepting" / "not Featured".
        API.accepting ? API.accepting(vid) : Promise.resolve(null),
        API.waitlistOpen ? API.waitlistOpen(vid) : Promise.resolve(null)
      ]).then(function (res) {
        var bookingUrl = (res[0] && typeof res[0].data === 'string' && /^https:\/\//i.test(res[0].data)) ? res[0].data : null;
        var hours = (res[1] && res[1].data) || [];
        var accepting = !(res[2] && res[2].data === false);
        var canWaitlist = !!(res[3] && res[3].data === true);
        // Books-full vendors render the closed banner even with no link or
        // hours: the banner IS the content.
        if (!bookingUrl && !hours.length && accepting) return;
        var mount = findMount();
        if (!mount) return;
        injectStyles();
        new Widget(mount, vid, hours, { accepting: accepting, canWaitlist: canWaitlist, bookingUrl: bookingUrl });
      });
    });
  }

  window.LokaliSupabaseReady.then(function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else { boot(); }
  });
})();
