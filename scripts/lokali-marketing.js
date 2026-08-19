/*
 * lokali-marketing.js — /vendor-dashboard/marketing (Marketing tools).
 *
 * Two rotating-content queues the vendor feeds herself, rendered on her PUBLIC
 * storefront by lokali-vendor-listing.js via the anon RPC marketing_current():
 *
 *   · "Promo button" (kind 'cta')       — Pro + Featured
 *   · "Showcase of the week" ('showcase') — Featured only
 *
 * Rotation modes per queue (derived, not stored): a pinned active entry means
 * "Pin one" (that entry always shows); no pin means "Rotate weekly" — the
 * server picks round-robin by Monday-anchored week number (America/Chicago).
 * The preview chips call the SAME RPC with week offsets 0/1, so what the
 * vendor previews here is by construction what the storefront serves.
 *
 * Empty/first-run state (2026-08-18 redesign): with zero entries there is
 * nothing to preview, count, or toggle, so none of that renders — instead a
 * static mock of the live element (exampleHtml) shows what it becomes. The
 * rotate/pin toggle itself only renders once there are 2+ ACTIVE entries:
 * with 0 or 1 active, the two modes are behaviourally identical (the RPC
 * always returns the same single entry), so showing the toggle would be a
 * control with no effect.
 *
 * Plan gates + queue caps (20 cta / 10 showcase) are DB-trigger enforced
 * (LOKALI_LIMIT_REACHED) — this page is honest UI, not the enforcement.
 * Free vendors never see the sidebar tab (lokali-sidebar-account.js hides it);
 * a direct URL lands on the upsell card below.
 *
 * Mount: <div id="lok-marketing-page"></div> (Webflow HTML embed). No-ops
 * when absent. Boot pattern cloned from lokali-availability-admin.js.
 *
 * Two mirrored copies (repo rule — edit BOTH, byte-identical):
 *   scripts/lokali-marketing.js
 *   lokali-webflow-scripts/scripts/lokali-marketing.js
 */
(function () {
  'use strict';

  if (!window.LokaliSupabaseReady || !window.LokaliSupabaseAPI) return;
  var API = window.LokaliSupabaseAPI.marketing;
  var VENDORS = window.LokaliSupabaseAPI.vendors;
  var STORAGE = window.LokaliSupabaseAPI.storage;
  if (!API || !VENDORS) return;

  var FONT = "'Plus Jakarta Sans', sans-serif";
  var BRAND = '#6002ee';
  var CAPS = { cta: 20, showcase: 10 };
  // Spotlight ad creative (phase 2): backend is live and grid-proven, but the
  // vendor-facing flow is undesigned — Francesca 2026-08-18: keep it hidden
  // 'until we know what that's going to look like and how it's going to work.'
  // Flip to true only alongside that design pass.
  var SPOTLIGHT_CREATIVE_ENABLED = false;
  var KIND_LABEL = { cta: 'Promo button', showcase: 'Showcase of the week' };
  // The one example used everywhere a placeholder/demo is needed (form
  // placeholder, empty-state mock, locked-plan teaser) — category-neutral,
  // unlike an earlier realtor-specific line that leaked into every vendor's
  // page as if it were universal advice.
  var CTA_EXAMPLE = 'Looking for something specific?';
  // Font Awesome Free 6 'image' (regular), inlined — the dashboard doesn't load
  // the FA font, and one glyph doesn't justify it. License: CC BY 4.0.
  var IMG_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true">' +
    '<path d="M448 80c8.8 0 16 7.2 16 16V415.8l-5-6.5-136-176c-4.5-5.9-11.6-9.3-19-9.3s-14.4 3.4-19 9.3L202 340.7l-30.5-42.7C167 291.7 159.8 288 152 288s-15 3.7-19.5 10.1l-80 112L48 416.3l0-.3V96c0-8.8 7.2-16 16-16H448zM64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zm80 192a48 48 0 1 0 0-96 48 48 0 1 0 0 96z"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
  }); }

  // DB guard errors arrive raw from PostgREST: "LOKALI_LIMIT_REACHED: <human>".
  function humanError(err) {
    var m = (err && (err.message || err.error_description)) || 'Something went wrong — try again.';
    var i = m.indexOf('LOKALI_LIMIT_REACHED:');
    return i >= 0 ? m.slice(i + 'LOKALI_LIMIT_REACHED:'.length).trim() : m;
  }

  // ---- styles ----------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('lok-mkt-css')) return;
    var st = document.createElement('style');
    st.id = 'lok-mkt-css';
    st.textContent =
      '.lok-mkt{font-family:' + FONT + ';max-width:860px;color:#231D3F;}' +
      '.lok-mkt *{font-family:inherit;box-sizing:border-box;}' +
      '.mkt-card{background:#fff;border:1px solid #ECE8F8;border-radius:14px;padding:22px 24px;margin:0 0 18px;}' +
      '.mkt-h{margin:0 0 2px;font-size:17px;font-weight:700;color:#3E3A55;}' +
      '.mkt-sub{margin:0 0 14px;font-size:13px;color:#8E8BA6;}' +
      '.mkt-head{display:flex;align-items:baseline;gap:12px;}' +
      '.mkt-head .mkt-h{flex:1;}' +
      '.mkt-live-link{font-size:12.5px;font-weight:600;color:' + BRAND + ';text-decoration:none;white-space:nowrap;}' +
      '.mkt-live-link:hover{text-decoration:underline;}' +
      // First-run example: a dashed frame around a scaled mock of the actual
      // storefront element (same colors/shape as .vl-mkt-cta / .vl-mkt-show
      // in lokali-vendor-listing.js), so "what it looks like" is not a lie.
      '.mkt-example{border:1.5px dashed #DCCFFA;border-radius:13px;padding:16px;background:#FBFAFE;margin:0 0 14px;}' +
      '.mkt-example-lbl{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#9490AC;margin:0 0 10px;}' +
      '.mkt-demo-cta{display:flex;align-items:center;justify-content:center;background:#F3EBFF;color:' + BRAND + ';' +
        'border:1px solid #E4D6FB;border-radius:10px;min-height:44px;padding:10px 14px;font:600 14px/1.3 ' + FONT + ';text-align:center;}' +
      // Mini contact card: the promo button shown IN PLACE — vivid among
      // ghosted copies of the card's real neighbors (labels match the live
      // storefront: 'Get in touch' lead, 'Send a message', Call/Text).
      '.mkt-demo-card{background:#fff;border:1px solid #EEEDF6;border-radius:12px;padding:14px;max-width:340px;margin:0 auto;}' +
      '.mkt-demo-card-lead{font-size:13.5px;font-weight:700;color:#1A1829;margin:0 0 10px;}' +
      '.mkt-demo-card .mkt-demo-cta{margin:0 0 8px;min-height:40px;}' +
      '.mkt-demo-ghost{display:flex;align-items:center;justify-content:center;min-height:36px;border-radius:9px;' +
        'background:#F1EFF8;color:#B7B4C7;font-size:12.5px;font-weight:600;margin:0 0 8px;}' +
      '.mkt-demo-ghost-row{display:flex;gap:8px;}' +
      '.mkt-demo-ghost-row .mkt-demo-ghost{flex:1;margin:0;}' +
      '.mkt-demo-sec{font-size:12.5px;font-weight:700;color:#3E3A55;margin:0 0 8px;}' +
      '.mkt-demo-show{background:#fff;border:1px solid #EEEDF6;border-radius:12px;padding:14px;}' +
      '.mkt-demo-show-img{width:100%;height:92px;border-radius:8px;background:linear-gradient(135deg,#F3EBFF,#FDF1E7);margin:0 0 10px;' +
        'display:flex;align-items:center;justify-content:center;gap:8px;color:#8E76C9;}' +
      '.mkt-demo-show-img svg{width:24px;height:24px;fill:currentColor;}' +
      '.mkt-demo-show-img span{font-size:12px;font-weight:600;}' +
      '.mkt-example-note{font-size:11.5px;color:#9490AC;margin:10px 0 0;}' +
      '.mkt-demo-show-t{font-size:15px;font-weight:700;color:#1A1829;margin:0 0 4px;}' +
      '.mkt-demo-show-b{font-size:13px;color:#6B6880;line-height:1.5;margin:0;}' +
      '.mkt-seg{display:inline-flex;border:1px solid #ECE8F8;border-radius:10px;overflow:hidden;margin:0 0 14px;}' +
      '.mkt-seg button{border:0;background:#fff;color:#8E8BA6;font-size:12.5px;font-weight:600;padding:7px 14px;cursor:pointer;}' +
      '.mkt-seg button.on{background:#F3EBFF;color:' + BRAND + ';}' +
      // Entry cards: every queued item is its own card with a WHEN chip (the
      // week it goes live, derived from the same rotation the server runs).
      '.mkt-entries{display:flex;flex-direction:column;gap:12px;}' +
      '.mkt-entry{border:1px solid #ECE8F8;border-radius:12px;background:#FDFCFF;padding:16px 18px;}' +
      '.mkt-entry.off{background:#FAFAFC;}' +
      '.mkt-entry.off .mkt-t,.mkt-scard.off .mkt-scard-t{color:#B7B4C7;}' +
      '.mkt-entry-top{display:flex;align-items:center;gap:8px;margin:0 0 7px;}' +
      '.mkt-when{display:inline-block;background:#F7F6FC;border:1px solid #ECE8F8;border-radius:999px;' +
        'padding:3px 10px;font-size:11.5px;font-weight:600;color:#6B6880;white-space:nowrap;}' +
      '.mkt-when.live{background:#E7F3EC;border-color:#B9DEC9;color:#3E7C5E;}' +
      '.mkt-when.hid{color:#B7B4C7;background:#FAFAFC;}' +
      '.mkt-spacer{flex:1;}' +
      '.mkt-t{font-size:14.5px;font-weight:600;color:#3E3A55;}' +
      '.mkt-u{font-size:12px;color:#8E8BA6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;}' +
      '.mkt-b{font-size:12.5px;color:#6B6880;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}' +
      '.mkt-links{display:flex;align-items:center;gap:7px;margin-top:9px;}' +
      '.mkt-tb{border:0;background:none;color:#8E8BA6;font-size:12.5px;font-weight:600;cursor:pointer;padding:0;}' +
      '.mkt-tb:hover{color:' + BRAND + ';}' +
      '.mkt-dot{color:#D8D5E6;}' +
      // Showcase queue: product-card style — image on TOP, text under it,
      // matching how the section renders on the storefront.
      '.mkt-sgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}' +
      '@media (max-width:640px){.mkt-sgrid{grid-template-columns:1fr;}}' +
      '.mkt-sgrid .mkt-form{grid-column:1 / -1;}' +
      '.mkt-scard{border:1px solid #ECE8F8;border-radius:12px;background:#FDFCFF;overflow:hidden;display:flex;flex-direction:column;}' +
      '.mkt-scard.off{background:#FAFAFC;}' +
      '.mkt-scard-img{width:100%;height:140px;object-fit:cover;display:block;background:linear-gradient(135deg,#F3EBFF,#FDF1E7);border:0;}' +
      '.mkt-scard-noimg{display:flex;align-items:center;justify-content:center;color:#8E76C9;}' +
      '.mkt-scard-noimg svg{width:24px;height:24px;fill:currentColor;}' +
      '.mkt-scard-body{padding:14px 16px 16px;}' +
      '.mkt-scard-t{font-size:14px;font-weight:600;color:#3E3A55;}' +
      '.mkt-ib{border:0;background:none;color:#8E8BA6;cursor:pointer;font-size:15px;padding:5px 6px;border-radius:7px;line-height:1;}' +
      '.mkt-ib:hover{background:#F7F6FC;color:#3E3A55;}' +
      '.mkt-ib[disabled]{opacity:.3;cursor:default;}' +
      '.mkt-pin{accent-color:' + BRAND + ';cursor:pointer;margin:0 4px 0 0;}' +
      '.mkt-add{display:inline-block;border:0;background:#F3EBFF;color:' + BRAND + ';font-weight:600;font-size:13px;' +
        'border-radius:10px;padding:9px 16px;cursor:pointer;margin-top:12px;}' +
      '.mkt-count{font-size:12px;color:#8E8BA6;margin-left:8px;font-weight:500;}' +
      '.mkt-form{background:#F7F6FC;border:1px solid #ECE8F8;border-radius:12px;padding:14px;margin-top:12px;}' +
      '.mkt-form label{display:block;font-size:12px;font-weight:600;color:#6B6880;margin:10px 0 4px;}' +
      '.mkt-form label:first-child{margin-top:0;}' +
      '.mkt-in{width:100%;border:1px solid #ECE8F8;border-radius:9px;background:#fff;padding:9px 12px;font-size:14px;color:#231D3F;}' +
      '.mkt-in:focus{outline:none;border-color:#C9B4F5;}' +
      'textarea.mkt-in{min-height:74px;resize:vertical;}' +
      '.mkt-fbtns{display:flex;gap:8px;margin-top:12px;}' +
      '.mkt-save{border:0;background:' + BRAND + ';color:#fff;font-weight:600;font-size:13px;border-radius:9px;padding:9px 18px;cursor:pointer;}' +
      '.mkt-cancel{border:0;background:none;color:#8E8BA6;font-size:13px;cursor:pointer;}' +
      '.mkt-upbtn{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px dashed #C9B4F5;color:' + BRAND + ';' +
        'font-size:12.5px;font-weight:600;border-radius:9px;padding:8px 12px;cursor:pointer;}' +
      '.mkt-upthumb{width:56px;height:56px;border-radius:9px;object-fit:cover;margin-right:10px;vertical-align:middle;}' +
      '.mkt-focusframe{width:320px;max-width:100%;height:150px;border-radius:12px;overflow:hidden;border:1px solid #EEEDF6;background:#F7F6FC;box-shadow:0 2px 8px rgba(26,24,41,.08);margin-top:6px;}' +
      '.mkt-focusframe img{width:100%;height:100%;object-fit:cover;display:block;touch-action:none;cursor:grab;}' +
      '.mkt-note{font-size:12px;color:#8E8BA6;margin-top:8px;}' +
      '.mkt-lock{text-align:center;padding:26px 18px;}' +
      '.mkt-lock p{margin:0 auto 14px;max-width:430px;font-size:13.5px;color:#8E8BA6;}' +
      '.mkt-lock .mkt-lockh{font-size:16px;font-weight:700;color:#3E3A55;margin-bottom:6px;}' +
      '.mkt-cta-demo{display:inline-block;background:' + BRAND + ';color:#fff;border-radius:10px;padding:10px 20px;' +
        'font-size:13.5px;font-weight:600;margin-bottom:12px;}' +
      '.mkt-up{display:inline-block;background:' + BRAND + ';color:#fff;border-radius:10px;padding:11px 24px;' +
        'font-size:13.5px;font-weight:600;text-decoration:none;}' +
      '.mkt-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#3E3A55;color:#fff;' +
        'font-family:' + FONT + ';font-size:13.5px;border-radius:10px;padding:11px 18px;z-index:9999;max-width:82vw;}' +
      '@media (max-width:600px){.mkt-card{padding:16px;}.mkt-acts{gap:0;}}';
    document.head.appendChild(st);
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.querySelector('.mkt-toast');
    if (!t) { t = document.createElement('div'); t.className = 'mkt-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, 3400);
  }

  // ---- page -------------------------------------------------------------------
  function Page(mount, vendor, premium) {
    this.mount = mount;
    this.vendor = vendor;
    this.premium = premium;            // Featured? (showcase entitlement)
    this.entries = { cta: [], showcase: [] };
    this.editing = null;               // entry id being edited, or 'new:<kind>'
    this.load();
  }

  Page.prototype.load = function () {
    var self = this;
    Promise.all([
      API.list(this.vendor.id),
      API.current(this.vendor.id, 0),
      API.current(this.vendor.id, 1),
      // Spotlight creative is Featured-only (and needs myCreatives support in
      // the shipped client — absent until the phase-2 tag, hence the guard).
      (SPOTLIGHT_CREATIVE_ENABLED && this.premium && API.myCreatives) ? API.myCreatives(this.vendor.id) : Promise.resolve(null)
    ]).then(function (rs) {
      var rows = (rs[0] && rs[0].data) || [];
      self.entries = { cta: [], showcase: [] };
      rows.forEach(function (e) { if (self.entries[e.kind]) self.entries[e.kind].push(e); });
      self.now = (rs[1] && rs[1].data) || {};
      self.next = (rs[2] && rs[2].data) || {};
      self.spot = (rs[3] && rs[3].data) || null;   // {bookings, creatives} | null
      self.render();
    });
  };

  Page.prototype.render = function () {
    this.mount.className = 'lok-mkt';
    this.mount.innerHTML =
      this.cardHtml('cta') +
      (this.premium ? this.cardHtml('showcase') : this.lockedShowcaseHtml()) +
      (SPOTLIGHT_CREATIVE_ENABLED && this.premium && this.spot ? this.spotlightCardHtml() : '');
    this.bind();
  };

  // ---- Spotlight ad creative (phase 2) --------------------------------------
  Page.prototype.spotlightCardHtml = function () {
    var self = this;
    var bookings = this.spot.bookings || [];
    var byBooking = {};
    (this.spot.creatives || []).forEach(function (c) { byBooking[c.spotlight_bookings_id] = c; });
    var html = '<div class="mkt-card" data-kind="spotlight">' +
      '<p class="mkt-h">Spotlight ad creative</p>' +
      '<p class="mkt-sub">Booked a homepage Spotlight? Upload a custom image and headline for your card. We review every creative before it goes live — usually within a day.</p>';
    if (!bookings.length) {
      html += '<p class="mkt-note">No upcoming homepage Spotlight. Book one from ' +
        '<a href="/vendor-dashboard/settings" style="color:' + BRAND + ';">Settings &rarr; Spotlight</a>' +
        ' and the uploader appears here.</p>';
    }
    bookings.forEach(function (b) {
      var c = byBooking[b.id];
      var win = new Date(b.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) +
        ' – ' + new Date(b.ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
      var pill = '';
      if (c) {
        var pillBg = c.status === 'approved' ? '#E7F3EC' : (c.status === 'rejected' ? '#FDE8E8' : '#FDF1E7');
        var pillFg = c.status === 'approved' ? '#3E7C5E' : (c.status === 'rejected' ? '#B1006A' : '#8A4B14');
        var pillTxt = c.status === 'approved' ? 'Approved — live on the homepage'
          : (c.status === 'rejected' ? 'Not approved' : 'In review');
        pill = '<span style="display:inline-block;background:' + pillBg + ';color:' + pillFg + ';' +
          'border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;">' + pillTxt + '</span>' +
          (c.status === 'rejected' && c.review_note
            ? '<div class="mkt-note">&ldquo;' + esc(c.review_note) + '&rdquo; — fix it and resubmit below.</div>' : '');
      }
      html += '<div class="mkt-form" data-booking="' + b.id + '">' +
        '<div style="font-size:13px;font-weight:600;color:#3E3A55;">Homepage Spotlight · ' + esc(win) +
          (b.status === 'active' ? ' · <span style="color:#3E7C5E;">LIVE NOW</span>' : '') + '</div>' +
        (pill ? '<div style="margin-top:8px;">' + pill + '</div>' : '') +
        '<label>Creative image</label>' +
        (c ? '<img class="mkt-upthumb" data-f="imgprev" src="' + esc(c.image_url) + '" alt="">' : '') +
        '<button type="button" class="mkt-upbtn" data-act="sc-upload">' + (c ? 'Replace image' : 'Upload an image') + '</button>' +
        '<input type="file" accept="image/*" data-f="sc-file" style="display:none;">' +
        '<input type="hidden" data-f="sc-image-url" value="' + esc(c ? c.image_url : '') + '">' +
        '<label>Headline (optional)</label>' +
        '<input class="mkt-in" data-f="sc-headline" maxlength="90" value="' + esc(c ? (c.headline || '') : '') + '" placeholder="Fresh this week — come say hi Saturday">' +
        '<div class="mkt-fbtns"><button class="mkt-save" data-act="sc-save">' +
          (c ? 'Resubmit for review' : 'Submit for review') + '</button></div>' +
        '<p class="mkt-note">Any change goes back into review; your card shows your profile until it&rsquo;s approved.</p>' +
      '</div>';
    });
    html += '</div>';
    return html;
  };

  Page.prototype.saveCreative = function (form) {
    var self = this;
    var url = form.querySelector('[data-f="sc-image-url"]').value.trim();
    var headline = form.querySelector('[data-f="sc-headline"]').value.trim();
    if (!url) { toast('Upload an image first.'); return; }
    API.attachCreative(+form.getAttribute('data-booking'), url, headline || null).then(function (res) {
      var d = res && res.data;
      if ((res && res.error) || !d || d.ok !== true) {
        toast(d && d.reason === 'bad_status' ? 'That Spotlight window can no longer be changed.' : humanError(res && res.error));
        return;
      }
      toast('Submitted — we’ll review it shortly.');
      self.load();
    });
  };

  Page.prototype.pinnedId = function (kind) {
    var p = this.entries[kind].filter(function (e) { return e.is_pinned && e.is_active; })[0];
    return p ? p.id : null;
  };

  // First-run state: a static mock of the real storefront element, so a
  // vendor with zero entries sees what she's building toward instead of a
  // blank counter and a toggle with nothing to toggle.
  Page.prototype.exampleHtml = function (kind) {
    var demo = kind === 'cta'
      ? '<div class="mkt-demo-card">' +
          '<div class="mkt-demo-card-lead">Get in touch</div>' +
          '<div class="mkt-demo-cta">' + esc(CTA_EXAMPLE) + '</div>' +
          '<div class="mkt-demo-ghost">Send a message</div>' +
          '<div class="mkt-demo-ghost-row">' +
            '<div class="mkt-demo-ghost">Call</div>' +
            '<div class="mkt-demo-ghost">Text</div>' +
          '</div>' +
        '</div>' +
        '<p class="mkt-example-note">It sits at the top of your contact card, right above &ldquo;Send a message&rdquo; &mdash; the first thing a visitor can tap.</p>'
      : '<div class="mkt-demo-sec">Showcase of the week</div>' +
        '<div class="mkt-demo-show">' +
          '<div class="mkt-demo-show-img">' + IMG_ICON + '<span>Your photo</span></div>' +
          '<div class="mkt-demo-show-t">Your headline — what’s new this week</div>' +
          '<div class="mkt-demo-show-b">A sentence or two about it. Add a photo and a link if you like.</div>' +
        '</div>' +
        '<p class="mkt-example-note">“Showcase of the week” is the section heading — everything on the card is yours: the photo, the headline, the text.</p>';
    return '<div class="mkt-example">' +
      '<p class="mkt-example-lbl">What it looks like on your storefront</p>' +
      demo +
    '</div>';
  };

  // Monday of the current week, local time — every live community is Central,
  // matching the server's Monday/Central rotation boundary.
  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function fmtDay(d) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // Which week each ACTIVE entry goes live: anchor on the server's answer for
  // this week (marketing_current(0) -> this.now), then walk the same
  // round-robin order the server uses. Hidden entries get no schedule.
  Page.prototype.schedule = function (kind) {
    var out = {};
    var active = this.entries[kind].filter(function (e) { return e.is_active; });
    var pinned = this.pinnedId(kind);
    var i;
    if (pinned != null) {
      for (i = 0; i < active.length; i++) {
        out[active[i].id] = active[i].id === pinned
          ? { txt: 'Live now — pinned', cls: 'live' }
          : { txt: 'Paused while one is pinned', cls: '' };
      }
      return out;
    }
    var n = active.length;
    if (!n) return out;
    var curId = this.now[kind] && this.now[kind].id;
    var c = 0;
    for (i = 0; i < n; i++) if (active[i].id === curId) { c = i; break; }
    var mon = mondayOf(new Date());
    for (i = 0; i < n; i++) {
      var off = (i - c + n) % n;
      var st = new Date(mon.getTime()); st.setDate(st.getDate() + off * 7);
      var en = new Date(st.getTime()); en.setDate(en.getDate() + 6);
      var range = fmtDay(st) + ' \u2013 ' + fmtDay(en);
      out[active[i].id] = off === 0
        ? { txt: 'Live this week \u00b7 ' + range, cls: 'live' }
        : { txt: (off === 1 ? 'Next \u00b7 ' : '') + range, cls: '' };
    }
    return out;
  };

  Page.prototype.cardHtml = function (kind) {
    var list = this.entries[kind];
    var activeList = list.filter(function (e) { return e.is_active; });
    var pinned = this.pinnedId(kind);
    var sub = kind === 'cta'
      ? 'A button at the top of your contact card — a question, an invite, a link. You feed the list; we show a different one each week.'
      : 'A section at the top of your storefront for what’s new — a listing, an event, a favorite.';
    var storeUrl = (this.vendor && this.vendor.slug) ? ('/' + this.vendor.slug) : null;

    var html =
      '<div class="mkt-card" data-kind="' + kind + '">' +
        '<div class="mkt-head"><p class="mkt-h">' + KIND_LABEL[kind] +
          (list.length ? '<span class="mkt-count">' + list.length + ' / ' + CAPS[kind] + '</span>' : '') +
          '</p>' +
          (kind === 'cta'
            ? '<a class="mkt-live-link" style="color:#8E8BA6;" href="/vendor-resources/marketing-tools-guide" target="_blank" rel="noopener">How it works</a>' : '') +
          (list.length && storeUrl
            ? '<a class="mkt-live-link" href="' + storeUrl + '" target="_blank" rel="noopener">See it on your page &#8599;</a>' : '') +
        '</div>' +
        '<p class="mkt-sub">' + sub + '</p>';

    if (!list.length) {
      html += this.exampleHtml(kind);
    } else if (!activeList.length) {
      html += '<p class="mkt-note" style="margin:0 0 14px;">Nothing is visible right now — turn one back on below.</p>';
    } else if (activeList.length >= 2) {
      html += '<div class="mkt-seg">' +
        '<button type="button" data-mode="rotate" class="' + (pinned == null ? 'on' : '') + '">Rotate weekly</button>' +
        '<button type="button" data-mode="pin" class="' + (pinned != null ? 'on' : '') + '">Pin one</button>' +
      '</div>';
    }

    var self = this;
    var sched = this.schedule(kind);
    // Shared per-entry pieces: the WHEN chip + reorder arrows + text actions.
    function whenChip(e) {
      var sc = e.is_active ? (sched[e.id] || { txt: '', cls: '' }) : { txt: 'Hidden', cls: 'hid' };
      return sc.txt ? '<span class="mkt-when ' + sc.cls + '">' + esc(sc.txt) + '</span>' : '';
    }
    function topRow(e, i) {
      return '<div class="mkt-entry-top">' +
        (pinned != null
          ? '<input type="radio" class="mkt-pin" name="pin-' + kind + '" ' +
            (e.is_pinned ? 'checked' : '') + (e.is_active ? '' : ' disabled') + '>'
          : '') +
        whenChip(e) +
        '<span class="mkt-spacer"></span>' +
        '<button class="mkt-ib" data-act="up" title="Show a week earlier"' + (i === 0 ? ' disabled' : '') + '>&#8593;</button>' +
        '<button class="mkt-ib" data-act="down" title="Show a week later"' + (i === list.length - 1 ? ' disabled' : '') + '>&#8595;</button>' +
      '</div>';
    }
    function linksRow(e) {
      return '<div class="mkt-links">' +
        '<button class="mkt-tb" data-act="edit">Edit</button><span class="mkt-dot">&middot;</span>' +
        '<button class="mkt-tb" data-act="toggle">' + (e.is_active ? 'Hide' : 'Show') + '</button><span class="mkt-dot">&middot;</span>' +
        '<button class="mkt-tb" data-act="del">Delete</button>' +
      '</div>';
    }

    if (kind === 'showcase' && list.length) {
      html += '<div class="mkt-sgrid">';
      list.forEach(function (e, i) {
        if (self.editing === e.id) { html += self.formHtml(kind, e); return; }
        html +=
          '<div class="mkt-scard' + (e.is_active ? '' : ' off') + '" data-id="' + e.id + '">' +
            (e.image_url
              ? '<img class="mkt-scard-img" src="' + esc(e.image_url) + '" alt="">'
              : '<div class="mkt-scard-img mkt-scard-noimg">' + IMG_ICON + '</div>') +
            '<div class="mkt-scard-body">' +
              topRow(e, i) +
              '<div class="mkt-scard-t">' + esc(e.title) + '</div>' +
              (e.body ? '<div class="mkt-b">' + esc(e.body) + '</div>' : '') +
              linksRow(e) +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    } else if (list.length) {
      html += '<div class="mkt-entries">';
      list.forEach(function (e, i) {
        if (self.editing === e.id) { html += self.formHtml(kind, e); return; }
        html +=
          '<div class="mkt-entry' + (e.is_active ? '' : ' off') + '" data-id="' + e.id + '">' +
            topRow(e, i) +
            '<div class="mkt-t">' + esc(e.title) + '</div>' +
            (e.url ? '<div class="mkt-u">' + esc(e.url) + '</div>' : '') +
            linksRow(e) +
          '</div>';
      });
      html += '</div>';
    }

    if (this.editing === 'new:' + kind) html += this.formHtml(kind, null);
    else if (list.length < CAPS[kind]) {
      html += '<button class="mkt-add" data-act="add">' +
        (list.length ? '+ Add ' + (kind === 'cta' ? 'a button' : 'a showcase')
                     : (kind === 'cta' ? 'Write your first one' : 'Add your first showcase')) +
      '</button>';
    }

    if (activeList.length >= 2) {
      html += '<p class="mkt-note">' +
        (pinned == null
          ? 'Rotating weekly — each visible entry shows in turn, changing every Monday.'
          : 'This one stays until you switch back to rotating or pin a different entry.') +
      '</p>';
    } else if (list.length && activeList.length === 1 && list.length < CAPS[kind]) {
      html += '<p class="mkt-note">Add a second one and we’ll start rotating them weekly.</p>';
    }

    html += '</div>';
    return html;
  };

  Page.prototype.formHtml = function (kind, e) {
    var t = e ? e.title : '', u = e ? (e.url || '') : '', b = e ? (e.body || '') : '';
    var img = e ? (e.image_url || '') : '';
    return '<div class="mkt-form" data-kind="' + kind + '">' +
      '<label>' + (kind === 'cta' ? 'Button text' : 'Heading') + '</label>' +
      '<input class="mkt-in" data-f="title" maxlength="120" value="' + esc(t) + '" placeholder="' +
        (kind === 'cta' ? esc(CTA_EXAMPLE) : 'This week: your headline') + '">' +
      (kind === 'showcase'
        ? '<label>Text</label><textarea class="mkt-in" data-f="body" maxlength="600" placeholder="A few sentences about it…">' + esc(b) + '</textarea>' +
          '<label>Photo</label>' +
          (img ? '<img class="mkt-upthumb" data-f="imgprev" src="' + esc(img) + '" alt="">' : '') +
          '<button type="button" class="mkt-upbtn" data-act="upload">' + (img ? 'Replace photo' : 'Add a photo') + '</button>' +
          '<input type="file" accept="image/*" data-f="file" style="display:none;">' +
          '<input type="hidden" data-f="image_url" value="' + esc(img) + '">' +
          '<input type="hidden" data-f="image_focus_x" value="' + (e && e.image_focus_x != null ? e.image_focus_x : '') + '">' +
          '<input type="hidden" data-f="image_focus_y" value="' + (e && e.image_focus_y != null ? e.image_focus_y : '') + '">' +
          // #149c WYSIWYG: same treatment as the listing forms — the frame is
          // the storefront crop, and the frame itself is the drag surface.
          (img
            ? '<p class="mkt-note" style="margin:8px 0 0;">How it will appear on your storefront \u2014 drag the photo to adjust.</p>' +
              '<div class="mkt-focusframe"><img data-f="focusprev" src="' + esc(img) + '" alt="Crop preview"' +
              (e && e.image_focus_x != null && e.image_focus_y != null
                ? ' style="object-position:' + (+e.image_focus_x) + '% ' + (+e.image_focus_y) + '%;"' : '') +
              '></div>'
            : '') +
          '<p class="mkt-note" style="margin-top:6px;">Landscape works best — about twice as wide as tall, at least 1200&thinsp;px wide. JPG or PNG; stored photos stay under 1&thinsp;MB (we compress automatically, so most are fine as-is).</p>'
        : '') +
      '<label>Link (optional)</label>' +
      '<input class="mkt-in" data-f="url" maxlength="500" value="' + esc(u) + '" placeholder="https://… (leave empty to open your contact form)">' +
      (kind === 'showcase'
        ? '<label>Link button label (optional)</label>' +
          '<input class="mkt-in" data-f="link_label" maxlength="40" value="' + esc(e ? (e.link_label || '') : '') + '" placeholder="Take a look">' +
          '<p class="mkt-note" style="margin-top:4px;">Only shows when there&rsquo;s a link. Leave empty for &ldquo;Take a look&rdquo;.</p>'
        : '') +
      '<div class="mkt-fbtns">' +
        '<button class="mkt-save" data-act="save">Save</button>' +
        '<button class="mkt-cancel" data-act="cancel">Cancel</button>' +
      '</div>' +
    '</div>';
  };

  Page.prototype.lockedShowcaseHtml = function () {
    return '<div class="mkt-card mkt-lock">' +
      '<p class="mkt-lockh">Showcase of the week</p>' +
      '<p>Lead your storefront with a rotating feature — this week’s listing, an open house, a seasonal special. Available on the Featured plan.</p>' +
      '<a class="mkt-up" href="/pricing">Upgrade to unlock</a>' +
    '</div>';
  };

  // ---- events -----------------------------------------------------------------
  Page.prototype.bind = function () {
    var self = this;
    this.mount.onclick = function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn || !self.mount.contains(btn)) return;
      var card = btn.closest('[data-kind]');
      var kind = card && card.getAttribute('data-kind');
      var row = btn.closest('[data-id]');
      var id = row && +row.getAttribute('data-id');
      var act = btn.getAttribute('data-act');

      if (act === 'add') { self.editing = 'new:' + kind; self.render(); }
      else if (act === 'edit') { self.editing = id; self.render(); }
      else if (act === 'cancel') { self.editing = null; self.render(); }
      else if (act === 'save') self.save(kind, btn.closest('.mkt-form'), id);
      else if (act === 'del') self.remove(id);
      else if (act === 'toggle') self.toggleActive(kind, id);
      else if (act === 'up' || act === 'down') self.move(kind, id, act === 'up' ? -1 : 1);
      else if (act === 'upload') {
        var f = btn.parentElement.querySelector('[data-f="file"]');
        if (f) f.click();
      }
      // Spotlight creative (phase 2)
      else if (act === 'sc-upload') {
        var sf = btn.parentElement.querySelector('[data-f="sc-file"]');
        if (sf) sf.click();
      }
      else if (act === 'sc-save') self.saveCreative(btn.closest('[data-booking]'));
    };
    // #149c: drag on the showcase crop preview. Delegated pointerdown (the
    // form is re-rendered innerHTML, so per-node wiring would not survive);
    // move/up attach to the img itself, which pointer capture routes to.
    this.mount.addEventListener('pointerdown', function (e) {
      var im = e.target && e.target.closest ? e.target.closest('[data-f="focusprev"]') : null;
      if (!im) return;
      var form = im.closest('.mkt-form'); if (!form) return;
      var fx = form.querySelector('[data-f="image_focus_x"]');
      var fy = form.querySelector('[data-f="image_focus_y"]');
      if (!fx || !fy) return;
      var dragging = true;
      function setFrom(ev2) {
        var r = im.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var x = Math.max(0, Math.min(100, Math.round(((ev2.clientX - r.left) / r.width) * 100)));
        var y = Math.max(0, Math.min(100, Math.round(((ev2.clientY - r.top) / r.height) * 100)));
        fx.value = String(x); fy.value = String(y);
        im.style.objectPosition = x + '% ' + y + '%';
      }
      function move(ev2) { if (dragging) setFrom(ev2); }
      function up() {
        dragging = false;
        im.removeEventListener('pointermove', move);
        im.removeEventListener('pointerup', up);
        im.removeEventListener('pointercancel', up);
      }
      try { im.setPointerCapture(e.pointerId); } catch (err) {}
      im.addEventListener('pointermove', move);
      im.addEventListener('pointerup', up);
      im.addEventListener('pointercancel', up);
      setFrom(e); e.preventDefault();
    });
    this.mount.onchange = function (ev) {
      var inp = ev.target;
      if (inp.getAttribute && inp.getAttribute('data-f') === 'file' && inp.files && inp.files[0]) {
        self.upload(inp);
      }
      if (inp.getAttribute && inp.getAttribute('data-f') === 'sc-file' && inp.files && inp.files[0]) {
        self.upload(inp, 'spotlight', 'sc-image-url');
      }
      if (inp.classList && inp.classList.contains('mkt-pin') && inp.checked) {
        var row = inp.closest('[data-id]');
        var card = inp.closest('[data-kind]');
        if (row && card) self.pin(card.getAttribute('data-kind'), +row.getAttribute('data-id'));
      }
    };
    // Mode toggle
    this.mount.querySelectorAll('.mkt-seg button').forEach(function (b) {
      b.onclick = function () {
        var card = b.closest('[data-kind]');
        var kind = card.getAttribute('data-kind');
        if (b.getAttribute('data-mode') === 'rotate') {
          if (self.pinnedId(kind) != null) {
            API.setPin(self.vendor.id, kind, null).then(function () { self.load(); });
          }
        } else {
          // Pin mode needs a pinned entry: default to the first active one.
          if (self.pinnedId(kind) == null) {
            var first = self.entries[kind].filter(function (e) { return e.is_active; })[0];
            if (!first) { toast('Add an entry first, then pin it.'); return; }
            API.setPin(self.vendor.id, kind, first.id).then(function () { self.load(); });
          }
        }
      };
    });
  };

  Page.prototype.save = function (kind, form, id) {
    var self = this;
    var get = function (f) {
      var el = form.querySelector('[data-f="' + f + '"]');
      return el ? el.value.trim() : '';
    };
    var payload = { title: get('title'), url: get('url') || null };
    if (kind === 'showcase') {
      payload.body = get('body') || null;
      payload.image_url = get('image_url') || null;
      payload.link_label = get('link_label') || null;
      // #149c: '' = untouched/cleared -> null (centered)
      payload.image_focus_x = get('image_focus_x') !== '' ? parseInt(get('image_focus_x'), 10) : null;
      payload.image_focus_y = get('image_focus_y') !== '' ? parseInt(get('image_focus_y'), 10) : null;
    }
    if (!payload.title) { toast('Give it a title first.'); return; }
    // Mirrors the DB constraint (marketing_entries_url_https) with a friendlier
    // message than a raw check_violation.
    if (payload.url && !/^https:\/\//i.test(payload.url)) {
      toast('Links need to start with https:// — copy the full address from your browser.');
      return;
    }
    var done = function (res) {
      if (res && res.error) { toast(humanError(res.error)); return; }
      self.editing = null;
      self.load();
    };
    if (id) API.update(id, payload).then(done);
    else {
      payload.vendors_id = this.vendor.id;
      payload.kind = kind;
      payload.sort_order = this.entries[kind].length + 1;
      API.add(payload).then(done);
    }
  };

  // Shared by the showcase photo and the Spotlight creative — `kind` is the
  // vendor-media folder segment (the storage policy only gates segment 1 =
  // the vendor id, so any kind is fine) and `field` is the hidden input the
  // resulting URL is written into.
  Page.prototype.upload = function (inp, kind, field) {
    kind = kind || 'showcase';
    field = field || 'image_url';
    var form = inp.closest('.mkt-form');
    var btn = form.querySelector('[data-act="' + (kind === 'spotlight' ? 'sc-upload' : 'upload') + '"]');
    var label = btn.textContent;
    btn.textContent = 'Uploading…';
    STORAGE.uploadImage(this.vendor.id, kind, inp.files[0]).then(function (res) {
      if (res && res.error) { btn.textContent = label; toast(humanError(res.error)); return; }
      var url = res.data.url;
      var path = res.data.path;
      // Francesca 2026-08-18: stored marketing photos must be <= 1 MB. Uploads
      // are auto-compressed client-side first (CLEAN-P9), so nearly everything
      // lands far under this; the check measures what was actually STORED and
      // removes offenders (gif/svg pass-throughs, pathological images).
      return fetch(url, { method: 'HEAD' }).then(function (h) {
        var bytes = +(h.headers.get('content-length') || 0);
        if (bytes > 1048576) {
          if (path && STORAGE.remove) { try { STORAGE.remove(path); } catch (e) {} }
          btn.textContent = label;
          toast('That photo is over 1 MB even after compression — try a smaller or simpler image.');
          return;
        }
        finishUpload(url);
      }).catch(function () { finishUpload(url); });  // HEAD hiccup: keep the upload
    });
    function finishUpload(url) {
      form.querySelector('[data-f="' + field + '"]').value = url;
      // #149c: a new photo starts centered; refresh the crop preview if shown
      // (it renders with the form, so a first-ever upload gets it on Save).
      if (field === 'image_url') {
        var ffx = form.querySelector('[data-f="image_focus_x"]');
        var ffy = form.querySelector('[data-f="image_focus_y"]');
        if (ffx) ffx.value = ''; if (ffy) ffy.value = '';
        var fprev = form.querySelector('[data-f="focusprev"]');
        if (fprev) { fprev.src = url; fprev.style.objectPosition = 'center'; }
      }
      var prev = form.querySelector('[data-f="imgprev"]');
      if (!prev) {
        prev = document.createElement('img');
        prev.className = 'mkt-upthumb';
        prev.setAttribute('data-f', 'imgprev');
        prev.alt = '';
        btn.parentElement.insertBefore(prev, btn);
      }
      prev.src = url;
      btn.textContent = kind === 'spotlight' ? 'Replace image' : 'Replace photo';
    }
  };

  Page.prototype.remove = function (id) {
    var self = this;
    API.remove(id).then(function (res) {
      if (res && res.error) { toast(humanError(res.error)); return; }
      self.load();
    });
  };

  Page.prototype.toggleActive = function (kind, id) {
    var self = this;
    var e = this.entries[kind].filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    // Hiding a pinned entry also unpins it (a hidden pin would silently
    // freeze the rotation with nothing shown).
    var patch = e.is_active ? { is_active: false, is_pinned: false } : { is_active: true };
    API.update(id, patch).then(function (res) {
      if (res && res.error) { toast(humanError(res.error)); return; }
      self.load();
    });
  };

  Page.prototype.move = function (kind, id, dir) {
    var list = this.entries[kind];
    var i = list.findIndex(function (x) { return x.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var self = this;
    // Swap sort_order; re-number to i+1-style to heal any historic ties.
    Promise.all([
      API.update(list[i].id, { sort_order: j + 1 }),
      API.update(list[j].id, { sort_order: i + 1 })
    ]).then(function () { self.load(); });
  };

  Page.prototype.pin = function (kind, id) {
    var self = this;
    API.setPin(this.vendor.id, kind, id).then(function (res) {
      if (res && res.error) { toast(humanError(res.error)); return; }
      self.load();
    });
  };

  // ---- upsell (free plan, direct URL) -----------------------------------------
  function renderUpsell(mount) {
    mount.className = 'lok-mkt';
    mount.innerHTML =
      '<div class="mkt-card mkt-lock">' +
        '<span class="mkt-cta-demo">' + esc(CTA_EXAMPLE) + '</span>' +
        '<p class="mkt-lockh">Marketing tools</p>' +
        '<p>Rotate a weekly promo button and a Showcase of the week on your storefront — you feed the list, we keep it fresh. Available on paid plans.</p>' +
        '<a class="mkt-up" href="/pricing">See plans</a>' +
      '</div>';
  }

  // ---- boot -------------------------------------------------------------------
  function boot() {
    var mount = document.getElementById('lok-marketing-page');
    if (!mount) return;
    injectStyles();
    VENDORS.me().then(function (r) {
      var vendor = r && r.data;
      if (!vendor || !vendor.id) return;               // not a vendor / not signed in
      Promise.all([API.hasPlan(vendor.id), API.hasPremium(vendor.id)]).then(function (rs) {
        var paid = rs[0] && rs[0].data === true;
        var premium = rs[1] && rs[1].data === true;
        if (paid) new Page(mount, vendor, premium);
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
