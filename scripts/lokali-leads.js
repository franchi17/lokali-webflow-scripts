/**
 * Lokali — vendor dashboard "Leads" page (the action page).
 *
 * Load AFTER scripts/lokali-api-client.js (needs window.LokaliAPI.leads + an
 * auth token). Self-mounting into <div id="lok-leads-page"></div> — no-op if absent.
 *
 * Data sources (both existing endpoints, fetched in parallel):
 *   - leads.getMine()   → { inquiries:[full rows], events_30d:[full rows] }  (the list + statuses)
 *   - leads.analytics() → { totals, inquiries[], contacts[], views[] }        (month numbers)
 *
 * 2026-09-17 redesign (F-approved mockup, evidence-based pass):
 *   - the page lets a vendor ACT: each inquiry shows the shopper's email/phone
 *     with Reply (prefilled mailto), Call and Text; tapping Reply marks it replied;
 *   - "Needs a reply" (status new) sits first with how long each person has
 *     waited, then "Everything else" with a Replied / Won / Closed stepper;
 *   - anonymous contact taps are COUNTED in "How people reached you" (30 days),
 *     never listed (a status on a nameless tap means nothing);
 *   - the top strip shows needs-a-reply, leads this month and the vendor's own
 *     reply time (from inquiries.first_reply_at); the month-over-month chip only
 *     appears when either month has 5+ leads, otherwise the since-you-joined total;
 *   - a vendor with no inquiries yet gets the three checkup items that bring a
 *     first lead (window.LokaliCheckup, shared with the dashboard home).
 * Replies stay off-platform (email / phone); Lokali never sees the messages.
 *
 * See docs/vendor-leads-analytics-maintainer-guide.md for the full data model.
 */
(function () {
  'use strict';

  var DAY = 24 * 60 * 60 * 1000, DAY30 = 30 * DAY;

  var INK = '#1A1829', DUSK = '#4A4761', GRAY = '#6E6A85',
      VIOLET = '#6002EE', VIOLET_L = '#F3EBFF', VIOLET_T = '#F1EDFB', VIOLET_B = '#E5D4FD',
      GREEN = '#1D6A45', GREEN_L = '#EAFAF2', PINK = '#B1006A', PINK_L = '#FDE7F3',
      BORDER = '#EEEDF6', SNOW = '#F7F6FC';
  var FONT = '"Plus Jakarta Sans",-apple-system,sans-serif';

  // Font Awesome Free 6 (CC BY 4.0) solid glyphs for the action buttons.
  var FA = {
    envelope: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4 0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg>',
    phone: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z"/></svg>',
    sms: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M64 0C28.7 0 0 28.7 0 64V352c0 35.3 28.7 64 64 64h96v80c0 6.1 3.4 11.6 8.8 14.3s11.9 2.1 16.8-1.5L309.3 416H448c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H64z"/></svg>',
    check: '<svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5l7 8H5z"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 19l-7-8h14z"/></svg>'
  };
  // Stroke icons for the channel row (same drawings as before).
  var CH = {
    inquiry:   { label: 'Inquiries',      icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', brand: true },
    email:     { label: 'Email taps',     icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z|M22 6 12 13 2 6' },
    phone:     { label: 'Phone taps',     icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' },
    whatsapp:  { label: 'WhatsApp taps',  icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z' },
    instagram: { label: 'Instagram taps', icon: 'M2 2h20v20H2z|M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' },
    website:   { label: 'Website taps',   icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' },
    cta:       { label: 'Promo button',   icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    showcase:  { label: 'Showcase link',  icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' }
  };
  var CH_ORDER = ['inquiry', 'email', 'phone', 'whatsapp', 'instagram', 'website', 'cta', 'showcase'];

  var CSS = [
    '#lok-leads-page{font-family:' + FONT + ';color:' + INK + ';}',
    '#lok-leads-page .lq-info{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:' + GRAY + ';margin:0 0 14px;line-height:1.4;}',
    '#lok-leads-page .lq-info svg{width:13px;height:13px;flex-shrink:0;}',
    // stat strip
    '#lok-leads-page .lq-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:18px;}',
    '#lok-leads-page .lq-stats.four{grid-template-columns:repeat(4,minmax(0,1fr));}',
    '#lok-leads-page .lq-hist{font-size:12px;color:' + DUSK + ';background:' + GREEN_L + ';border-radius:8px;padding:8px 10px;margin:8px 0 0;line-height:1.5;}',
    '#lok-leads-page .lq-hist b{color:' + GREEN + ';}',
    '#lok-leads-page .lq-stat{border:1px solid ' + BORDER + ';border-radius:12px;padding:14px 16px;background:#fff;}',
    '#lok-leads-page .lq-stat.hot{background:' + VIOLET_T + ';border-color:' + VIOLET_B + ';}',
    '#lok-leads-page .lq-stat .l{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + GRAY + ';}',
    '#lok-leads-page .lq-stat .v{font-size:24px;font-weight:800;line-height:1.1;margin-top:6px;letter-spacing:-.02em;color:' + INK + ';}',
    '#lok-leads-page .lq-stat.hot .v{color:' + VIOLET + ';}',
    '#lok-leads-page .lq-stat .s{font-size:12px;color:' + DUSK + ';margin-top:4px;line-height:1.4;}',
    '#lok-leads-page .lq-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;border-radius:100px;padding:3px 9px;line-height:1.4;}',
    '#lok-leads-page .lq-chip.up{background:' + GREEN_L + ';color:' + GREEN + ';}',
    '#lok-leads-page .lq-chip.down{background:' + SNOW + ';color:' + DUSK + ';}',
    '#lok-leads-page .lq-chip.quiet{background:' + SNOW + ';color:' + DUSK + ';}',
    '#lok-leads-page .lq-chip svg{width:10px;height:10px;}',
    // section heads
    '#lok-leads-page .lq-sh{display:flex;align-items:center;gap:10px;margin:22px 0 10px;flex-wrap:wrap;}',
    '#lok-leads-page .lq-sh h3{font-size:14px;font-weight:800;margin:0;color:' + INK + ';line-height:1.3;}',
    '#lok-leads-page .lq-cnt{font-size:11px;font-weight:700;border-radius:100px;padding:2px 8px;background:' + VIOLET + ';color:#fff;}',
    '#lok-leads-page .lq-cnt.soft{background:' + SNOW + ';color:' + DUSK + ';}',
    '#lok-leads-page .lq-hint{font-size:12px;color:' + GRAY + ';margin-left:auto;}',
    // needs-a-reply cards
    '#lok-leads-page .lq-lead{border:1px solid ' + VIOLET_B + ';background:#fff;border-radius:14px;padding:14px 16px;display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:12px;align-items:start;margin-bottom:10px;box-shadow:0 2px 10px rgba(96,2,238,.05);}',
    '#lok-leads-page .lq-av{width:36px;height:36px;border-radius:50%;background:' + VIOLET_L + ';color:' + VIOLET + ';font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;}',
    '#lok-leads-page .lq-who{font-size:13.5px;font-weight:700;color:' + INK + ';line-height:1.4;}',
    '#lok-leads-page .lq-who span{font-weight:500;color:' + DUSK + ';}',
    '#lok-leads-page .lq-about{font-size:12px;color:' + GRAY + ';margin-top:2px;line-height:1.5;word-break:break-word;}',
    '#lok-leads-page .lq-msg{font-size:13px;color:' + INK + ';line-height:1.5;margin:8px 0 10px;padding:10px 12px;background:' + SNOW + ';border-radius:10px;border-left:3px solid ' + VIOLET_B + ';white-space:pre-wrap;word-break:break-word;}',
    '#lok-leads-page .lq-wait{font-size:12px;font-weight:700;color:' + PINK + ';background:' + PINK_L + ';border-radius:100px;padding:3px 9px;white-space:nowrap;justify-self:end;}',
    '#lok-leads-page .lq-wait.fresh{color:' + GREEN + ';background:' + GREEN_L + ';}',
    '#lok-leads-page .lq-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}',
    '#lok-leads-page .lq-btn{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:7px 13px;border-radius:9px;font:700 12.5px/1.2 ' + FONT + ';border:1px solid ' + VIOLET_B + ';background:#fff;color:' + VIOLET + ';cursor:pointer;text-decoration:none;}',
    '#lok-leads-page .lq-btn.p{background:' + VIOLET + ';border-color:' + VIOLET + ';color:#fff;}',
    '#lok-leads-page .lq-btn.q{border-color:' + BORDER + ';color:' + DUSK + ';font-weight:600;}',
    '#lok-leads-page .lq-btn svg{width:13px;height:13px;flex-shrink:0;}',
    '#lok-leads-page .lq-btn:focus-visible{outline:2px solid ' + VIOLET + ';outline-offset:2px;}',
    '#lok-leads-page .lq-ghost{font:500 12px/1.4 ' + FONT + ';color:' + GRAY + ';margin-left:auto;text-decoration:underline;text-underline-offset:2px;cursor:pointer;background:none;border:none;padding:6px 0;}',
    // everything-else rows
    '#lok-leads-page .lq-list{background:#fff;border:1px solid ' + BORDER + ';border-radius:14px;padding:0 14px;}',
    '#lok-leads-page .lq-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid ' + BORDER + ';}',
    '#lok-leads-page .lq-row:last-child{border-bottom:none;}',
    '#lok-leads-page .lq-ic{width:28px;height:28px;border-radius:8px;background:' + SNOW + ';color:' + DUSK + ';display:flex;align-items:center;justify-content:center;}',
    '#lok-leads-page .lq-ic svg{width:14px;height:14px;}',
    '#lok-leads-page .lq-t1{font-size:13.5px;font-weight:700;color:' + INK + ';line-height:1.4;}',
    '#lok-leads-page .lq-t1 span{font-weight:500;color:' + DUSK + ';}',
    '#lok-leads-page .lq-t2{font-size:12px;color:' + GRAY + ';margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '#lok-leads-page .lq-when{font-size:12px;color:' + GRAY + ';white-space:nowrap;}',
    '#lok-leads-page .lq-step{display:inline-flex;background:' + SNOW + ';border:1px solid ' + BORDER + ';border-radius:9px;padding:2px;gap:2px;}',
    '#lok-leads-page .lq-step button{font:700 11px/1.2 ' + FONT + ';padding:5px 9px;border-radius:7px;color:' + DUSK + ';cursor:pointer;background:transparent;border:none;}',
    // Active step is FILLED so the state reads at a glance (F 2026-09-17: the white-on-
    // white 'on' state was invisible): replied = violet, won = green, closed = dusk.
    '#lok-leads-page .lq-step button.on{font-weight:800;box-shadow:none;}',
    '#lok-leads-page .lq-step button.replied.on{background:' + VIOLET + ';color:#fff;}',
    '#lok-leads-page .lq-step button.won.on{background:' + GREEN + ';color:#fff;}',
    '#lok-leads-page .lq-step button.closed.on{background:' + DUSK + ';color:#fff;}',
    // Closed group: folded by default, one line with a Show/Hide toggle
    '#lok-leads-page .lq-fold{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid ' + BORDER + ';border-radius:12px;padding:12px 14px;margin-top:6px;}',
    '#lok-leads-page .lq-fold b{font-size:13.5px;color:' + INK + ';}',
    '#lok-leads-page .lq-fold span{font-size:12px;color:' + GRAY + ';}',
    '#lok-leads-page .lq-fold button{margin-left:auto;font:700 12.5px/1.2 ' + FONT + ';color:' + VIOLET + ';background:' + VIOLET_L + ';border:none;border-radius:8px;padding:8px 12px;cursor:pointer;}',
    '#lok-leads-page .lq-closed .lq-row{opacity:.85;}',
    '#lok-leads-page .lq-del{font:600 12px/1.2 ' + FONT + ';color:' + GRAY + ';background:none;border:1px solid ' + BORDER + ';border-radius:8px;padding:6px 10px;cursor:pointer;white-space:nowrap;}',
    '#lok-leads-page .lq-del.arm{color:#fff;background:#B42318;border-color:#B42318;}',
    '#lok-leads-page .lq-step button:focus-visible{outline:2px solid ' + VIOLET + ';outline-offset:1px;}',
    // channels
    '#lok-leads-page .lq-chs{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;}',
    '#lok-leads-page .lq-ch{border:1px solid ' + BORDER + ';border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;background:#fff;}',
    '#lok-leads-page .lq-ch .i{width:28px;height:28px;border-radius:8px;background:' + SNOW + ';color:' + DUSK + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
    '#lok-leads-page .lq-ch .i.brand{background:' + VIOLET_L + ';color:' + VIOLET + ';}',
    '#lok-leads-page .lq-ch .n{font-size:15px;font-weight:800;line-height:1;color:' + INK + ';}',
    '#lok-leads-page .lq-ch .k{font-size:11px;color:' + GRAY + ';margin-top:2px;}',
    // empty / all-clear
    '#lok-leads-page .lq-clear{font-size:13px;color:' + DUSK + ';padding:14px 16px;background:#fff;border:1px dashed ' + VIOLET_B + ';border-radius:12px;}',
    '#lok-leads-page .lq-empty{display:grid;grid-template-columns:1.1fr 1fr;gap:20px;align-items:center;border:1px dashed ' + VIOLET_B + ';border-radius:14px;padding:22px;background:#fff;}',
    '#lok-leads-page .lq-empty h3{font-size:16px;font-weight:800;margin:0 0 8px;color:' + INK + ';}',
    '#lok-leads-page .lq-empty ol{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px;}',
    '#lok-leads-page .lq-empty li{display:grid;grid-template-columns:24px 1fr;gap:10px;font-size:12.5px;color:' + DUSK + ';line-height:1.5;align-items:start;}',
    '#lok-leads-page .lq-empty li i{width:24px;height:24px;border-radius:50%;background:' + VIOLET_L + ';color:' + VIOLET + ';font-style:normal;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;}',
    '#lok-leads-page .lq-empty li i.ok{background:' + GREEN_L + ';color:' + GREEN + ';}',
    '#lok-leads-page .lq-empty li i.ok svg{width:11px;height:11px;}',
    '#lok-leads-page .lq-empty li b{color:' + INK + ';}',
    '#lok-leads-page .lq-ghostcard{border:1px solid ' + BORDER + ';border-radius:12px;padding:14px;opacity:.75;}',
    '#lok-leads-page .lq-ghostcard .lq-who{font-size:13px;}',
    '#lok-leads-page .lq-ghostcard .lq-msg{font-size:12px;margin:8px 0;}',
    '#lok-leads-page .lq-ghostcard .lq-btn{min-height:30px;padding:5px 10px;font-size:11.5px;}',
    // loading card — same spinner language as the auth "Signing you in…" card
    '#lok-leads-page .lp-load{background:#fff;border:.5px solid ' + BORDER + ';border-radius:12px;padding:36px 20px;text-align:center;}',
    '#lok-leads-page .lp-spin{display:inline-block;width:26px;height:26px;border:3px solid rgba(96,2,238,.22);border-top-color:' + VIOLET + ';border-radius:50%;animation:lokLpSpin .7s linear infinite;}',
    '#lok-leads-page .lp-load-t{margin-top:12px;font-size:13px;font-weight:500;color:' + GRAY + ';}',
    '@keyframes lokLpSpin{to{transform:rotate(360deg);}}',
    // phone
    '@media(max-width:700px){',
    '#lok-leads-page .lq-stats,#lok-leads-page .lq-stats.four{grid-template-columns:1fr 1fr;}',
    '#lok-leads-page .lq-stats:not(.four) .lq-stat:last-child{grid-column:1/-1;}',
    '#lok-leads-page .lq-lead{grid-template-columns:minmax(0,1fr);}',
    '#lok-leads-page .lq-av{display:none;}',
    '#lok-leads-page .lq-wait{justify-self:start;order:-1;}',
    '#lok-leads-page .lq-btn{min-height:44px;}',
    '#lok-leads-page .lq-row{grid-template-columns:24px minmax(0,1fr);row-gap:6px;}',
    '#lok-leads-page .lq-row .lq-when,#lok-leads-page .lq-row .lq-step{grid-column:2;justify-self:start;}',
    '#lok-leads-page .lq-empty{grid-template-columns:1fr;}',
    '#lok-leads-page .lq-hint{margin-left:0;flex-basis:100%;}',
    '}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('lok-leads-styles-v2')) return;
    var s = document.createElement('style'); s.id = 'lok-leads-styles-v2'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── helpers ──
  function ts(v) { if (v == null) return 0; if (typeof v === 'number') return v; var n = Date.parse(v); return isNaN(n) ? 0 : n; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function html(tag, cls, markup) { var e = el(tag, cls); e.innerHTML = markup; return e; }
  function strokeIcon(paths) {
    var p = paths.split('|').map(function (d) { return '<path d="' + d + '"/>'; }).join('');
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function shortDate(t) { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function firstName(name) { var p = String(name || '').trim().split(/\s+/); return p[0] || ''; }
  function looksLikeEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim()); }
  function telHref(p) { return 'tel:' + String(p || '').replace(/[^\d+]/g, ''); }
  function smsHref(p) { return 'sms:' + String(p || '').replace(/[^\d+]/g, ''); }
  function countInWindow(rows, fromAgo, toAgo) {
    var now = Date.now();
    return rows.filter(function (r) { var d = now - ts(r.created_at); return d >= fromAgo && d < toAgo; }).length;
  }
  // "Waiting 2 days" for anything a day or older, a fresh relative time under that.
  function waitLabel(t) {
    var d = Date.now() - t;
    if (d < 60 * 60000) return { text: 'Just now', fresh: true };
    if (d < DAY) return { text: Math.round(d / 3600000) + 'h ago', fresh: true };
    var days = Math.floor(d / DAY);
    return { text: 'Waiting ' + plural(days, 'day'), fresh: false };
  }
  function replyTimeLabel(ms) {
    if (ms < 60 * 60000) return 'Under an hour';
    if (ms < 6 * 3600000) return 'A few hours';
    if (ms < DAY) return 'Same day';
    if (ms < 2 * DAY) return 'About a day';
    return 'About ' + plural(Math.round(ms / DAY), 'day');
  }
  // Median first-reply delay over the vendor's last five replied inquiries.
  function replyTime(inquiries) {
    var ds = inquiries
      .filter(function (i) { return i.first_reply_at && ts(i.first_reply_at) > ts(i.created_at); })
      .sort(function (a, b) { return ts(b.first_reply_at) - ts(a.first_reply_at); })
      .slice(0, 5)
      .map(function (i) { return ts(i.first_reply_at) - ts(i.created_at); })
      .sort(function (a, b) { return a - b; });
    if (!ds.length) return null;
    var mid = Math.floor(ds.length / 2);
    var med = ds.length % 2 ? ds[mid] : (ds[mid - 1] + ds[mid]) / 2;
    return { label: replyTimeLabel(med), n: ds.length };
  }

  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function historyLine(l) {
    var n = l.prior.length;
    var parts = l.prior.slice(0, 2).map(function (o) {
      var what = o.context ? escapeHtml(o.context) : 'a general inquiry';
      var when = new Date(o.t).toLocaleDateString(undefined, { month: 'long' });
      var out = o.status === 'won' ? 'won' : o.status === 'closed' ? 'closed' : o.status === 'replied' ? 'replied' : 'new';
      return what + ' in ' + when + ' (' + out + ')';
    });
    return '<b>Back for the ' + ordinal(n + 1) + ' time.</b> ' + parts.join(', ') + (n > 2 ? ', and ' + (n - 2) + ' more' : '') + '.';
  }

  function setStatus(lead, status) {
    var A = window.LokaliAPI && window.LokaliAPI.leads;
    if (!A || typeof A.setInquiryStatus !== 'function') return Promise.resolve({ error: 'unavailable' });
    return A.setInquiryStatus(lead.id, status).then(function (res) { return res || {}; }).catch(function (e) { return { error: e }; });
  }

  // ── render ──
  function render(mount, leadsData, analytics) {
    var inquiries = ((leadsData && leadsData.inquiries) || []).map(function (i) {
      return {
        id: i.id, t: ts(i.created_at), status: (i.status || 'new'),
        name: i.customer_name || (looksLikeEmail(i.customer_email) ? i.customer_email : '') || 'Someone',
        email: looksLikeEmail(i.customer_email) ? String(i.customer_email).trim() : '',
        phone: String(i.customer_phone || '').trim(),
        message: String(i.message || '').trim(), context: String(i.context || '').trim(),
        source: i.source || 'listing', first_reply_at: i.first_reply_at || null, created_at: i.created_at
      };
    });
    var events = (leadsData && leadsData.events_30d) || [];
    var totals = (analytics && analytics.totals) || {};
    var aInq = (analytics && analytics.inquiries) || [];
    var aCon = (analytics && analytics.contacts) || [];

    var thisMonth = countInWindow(aInq, 0, DAY30) + countInWindow(aCon, 0, DAY30);
    var prevMonth = countInWindow(aInq, DAY30, 2 * DAY30) + countInWindow(aCon, DAY30, 2 * DAY30);
    var sinceJoin = (totals.inquiries || 0) + (totals.contacts || 0);
    // Repeat customers (2026-09-17): same email or phone within THIS vendor's
    // inquiries only. No cross-vendor profile is built.
    var byKey = {};
    inquiries.forEach(function (l) {
      var keys = [];
      if (l.email) keys.push('e:' + l.email.toLowerCase());
      if (l.phone) { var d = l.phone.replace(/\D/g, ''); if (d.length >= 7) keys.push('p:' + d.slice(-10)); }
      l._keys = keys;
      keys.forEach(function (k) { (byKey[k] = byKey[k] || []).push(l); });
    });
    inquiries.forEach(function (l) {
      var seen = {}, prior = [];
      l._keys.forEach(function (k) { byKey[k].forEach(function (o) { if (o !== l && o.t < l.t && !seen[o.id]) { seen[o.id] = 1; prior.push(o); } }); });
      prior.sort(function (a, b) { return b.t - a.t; });
      l.prior = prior;
    });
    var repeatN = inquiries.filter(function (l) { return l.prior.length; }).length;
    // Three groups: needs a reply (new, oldest first) / everything else (replied,
    // won) / closed (folded away, F 2026-09-17: 'archive, delete or hide closed').
    var needs, rest, closed;
    function partition() {
      needs = inquiries.filter(function (l) { return l.status === 'new'; }).sort(function (a, b) { return a.t - b.t; });
      rest = inquiries.filter(function (l) { return l.status !== 'new' && l.status !== 'closed'; }).sort(function (a, b) { return b.t - a.t; });
      closed = inquiries.filter(function (l) { return l.status === 'closed'; }).sort(function (a, b) { return b.t - a.t; });
    }
    partition();
    var showClosed = false;
    var rt = replyTime(inquiries);

    mount.innerHTML = '';

    // one-line explainer beside the title, not a paragraph below the fold
    mount.appendChild(html('div', 'lq-info', FA.info + '<span>Replies happen by email or phone, never through Lokali. We never see your messages.</span>'));

    // ── stat strip ──
    var stats = el('div', 'lq-stats');
    var s1 = el('div', 'lq-stat' + (needs.length ? ' hot' : ''));
    s1.appendChild(el('div', 'l', 'Needs a reply'));
    s1.appendChild(el('div', 'v', String(needs.length)));
    s1.appendChild(el('div', 's', needs.length
      ? 'Oldest has waited ' + plural(Math.max(1, Math.floor((Date.now() - needs[0].t) / DAY)), 'day')
      : (inquiries.length ? 'You’re all caught up' : 'Nothing waiting on you')));
    stats.appendChild(s1);
    var s2 = el('div', 'lq-stat');
    s2.appendChild(el('div', 'l', 'Leads this month'));
    s2.appendChild(el('div', 'v', String(thisMonth)));
    var s2s = el('div', 's');
    if (thisMonth >= 5 || prevMonth >= 5) {
      var diff = thisMonth - prevMonth;
      s2s.appendChild(html('span', 'lq-chip ' + (diff >= 0 ? 'up' : 'down'), (diff >= 0 ? FA.up : FA.down) + (diff >= 0 ? '+' : '') + diff + ' vs last month'));
    } else {
      s2s.appendChild(el('span', 'lq-chip quiet', sinceJoin + ' since you joined'));
    }
    s2.appendChild(s2s);
    stats.appendChild(s2);
    var s3 = el('div', 'lq-stat');
    s3.appendChild(el('div', 'l', 'Your reply time'));
    s3.appendChild(el('div', 'v', rt ? rt.label : 'No replies yet'));
    s3.appendChild(el('div', 's', rt ? 'Based on your last ' + (rt.n === 1 ? 'reply' : rt.n + ' replies') : 'Reply to your first lead to start the clock'));
    stats.appendChild(s3);
    if (inquiries.length >= 10) {
      var s4 = el('div', 'lq-stat');
      s4.appendChild(el('div', 'l', 'Came back'));
      s4.appendChild(el('div', 'v', repeatN + ' of ' + inquiries.length));
      s4.appendChild(el('div', 's', 'Inquiries from someone who had contacted you before'));
      stats.appendChild(s4); stats.classList.add('four');
    }
    mount.appendChild(stats);

    // ── no inquiries at all: teach what brings one ──
    if (!inquiries.length) {
      var emptyHost = el('div');
      mount.appendChild(emptyHost);
      renderEmpty(emptyHost);
    }

    // ── needs a reply ──
    var needsHost = el('div');
    var restHost = el('div');
    var closedHost = el('div');
    mount.appendChild(needsHost);
    mount.appendChild(restHost);
    mount.appendChild(closedHost);

    function paintNeeds() {
      needsHost.innerHTML = '';
      if (!inquiries.length) return;
      var sh = el('div', 'lq-sh');
      sh.appendChild(el('h3', null, 'Needs a reply'));
      sh.appendChild(el('span', 'lq-cnt' + (needs.length ? '' : ' soft'), String(needs.length)));
      if (needs.length) sh.appendChild(el('span', 'lq-hint', 'Tapping Reply marks it replied for you'));
      needsHost.appendChild(sh);
      if (!needs.length) { needsHost.appendChild(el('div', 'lq-clear', 'Nothing waiting on you. New inquiries land here.')); return; }
      needs.forEach(function (l) { needsHost.appendChild(leadCard(l)); });
      s1.className = 'lq-stat hot';
    }
    function paintRest() {
      restHost.innerHTML = '';
      if (!rest.length) return;
      var sh = el('div', 'lq-sh');
      sh.appendChild(el('h3', null, 'Everything else'));
      sh.appendChild(el('span', 'lq-cnt soft', String(rest.length)));
      sh.appendChild(el('span', 'lq-hint', 'Move a lead along as it plays out'));
      restHost.appendChild(sh);
      var list = el('div', 'lq-list');
      rest.forEach(function (l) { list.appendChild(leadRow(l)); });
      restHost.appendChild(list);
    }
    function paintClosed() {
      closedHost.innerHTML = '';
      if (!closed.length) return;
      var fold = el('div', 'lq-fold');
      fold.appendChild(html('b', null, 'Closed'));
      fold.appendChild(el('span', null, closed.length + (closed.length === 1 ? ' lead' : ' leads') + ' you have finished with. Reopen one with the buttons, or delete it for good.'));
      var tg = el('button', null, showClosed ? 'Hide' : 'Show'); tg.type = 'button';
      tg.setAttribute('aria-expanded', showClosed ? 'true' : 'false');
      tg.addEventListener('click', function () { showClosed = !showClosed; paintClosed(); });
      fold.appendChild(tg);
      closedHost.appendChild(fold);
      if (!showClosed) return;
      var list = el('div', 'lq-list lq-closed');
      closed.forEach(function (l) { list.appendChild(leadRow(l, true)); });
      closedHost.appendChild(list);
    }
    function refreshStats() {
      s1.querySelector('.v').textContent = String(needs.length);
      s1.querySelector('.s').textContent = needs.length
        ? 'Oldest has waited ' + plural(Math.max(1, Math.floor((Date.now() - needs[0].t) / DAY)), 'day')
        : 'You’re all caught up';
      s1.className = 'lq-stat' + (needs.length ? ' hot' : '');
    }
    // move a lead between the two groups after a status change
    function repaintAll() { partition(); paintNeeds(); paintRest(); paintClosed(); refreshStats(); }
    function moveLead(l, status) {
      var prev = l.status; l.status = status;
      repaintAll();
      setStatus(l, status).then(function (res) {
        if (res && res.error) { l.status = prev; repaintAll(); }
      });
    }
    // Delete = only from the Closed group, two taps (Delete -> Delete for good),
    // and only when the client exposes it (the DELETE policy is SQL-gated).
    function deleteLead(l) {
      var A = window.LokaliAPI && window.LokaliAPI.leads;
      if (!A || typeof A.deleteInquiry !== 'function') return Promise.resolve({ error: 'unavailable' });
      return A.deleteInquiry(l.id).then(function (res) { return res || {}; }).catch(function (e) { return { error: e }; });
    }

    function leadCard(l) {
      var card = el('div', 'lq-lead');
      card.appendChild(el('div', 'lq-av', initials(l.name)));
      var body = el('div');
      var who = html('div', 'lq-who', escapeHtml(l.name) + (l.context ? ' <span>asked about</span> ' + escapeHtml(l.context) : ' <span>sent a general inquiry</span>'));
      body.appendChild(who);
      var bits = [];
      if (l.email) bits.push(escapeHtml(l.email));
      if (l.phone) bits.push(escapeHtml(l.phone));
      if (!l.email && !l.phone) bits.push('no contact details were left');
      bits.push('via your ' + (l.source === 'service' ? 'service page' : l.source === 'product' ? 'product page' : 'storefront'));
      body.appendChild(html('div', 'lq-about', bits.join(' · ')));
      if (l.prior && l.prior.length) body.appendChild(html('div', 'lq-hist', historyLine(l)));
      if (l.message) body.appendChild(el('div', 'lq-msg', l.message));
      var acts = el('div', 'lq-acts');
      var primaryDone = false;
      if (l.email) {
        var subject = 'Re: your ' + (l.context ? 'question about ' + l.context : 'inquiry') + ' on Lokali';
        var bodyTxt = 'Hi ' + (firstName(l.name) || 'there') + ',\n\n';
        var a = html('a', 'lq-btn p', FA.envelope + '<span>Reply by email</span>');
        a.href = 'mailto:' + encodeURIComponent(l.email).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyTxt);
        a.addEventListener('click', function () { if (l.status === 'new') moveLead(l, 'replied'); });
        acts.appendChild(a); primaryDone = true;
      }
      if (l.phone) {
        var c = html('a', 'lq-btn' + (primaryDone ? '' : ' p'), FA.phone + '<span>Call</span>'); c.href = telHref(l.phone);
        c.addEventListener('click', function () { if (l.status === 'new') moveLead(l, 'replied'); });
        acts.appendChild(c);
        var t = html('a', 'lq-btn', FA.sms + '<span>Text</span>'); t.href = smsHref(l.phone);
        t.addEventListener('click', function () { if (l.status === 'new') moveLead(l, 'replied'); });
        acts.appendChild(t);
      }
      if (!l.email && !l.phone) {
        var m = el('button', 'lq-btn q', 'Mark as replied'); m.type = 'button';
        m.addEventListener('click', function () { moveLead(l, 'replied'); });
        acts.appendChild(m);
      }
      var g = el('button', 'lq-ghost', 'No reply needed'); g.type = 'button';
      g.addEventListener('click', function () { moveLead(l, 'closed'); });
      acts.appendChild(g);
      body.appendChild(acts);
      card.appendChild(body);
      var w = waitLabel(l.t);
      card.appendChild(el('span', 'lq-wait' + (w.fresh ? ' fresh' : ''), w.text));
      return card;
    }

    function leadRow(l, inClosed) {
      var row = el('div', 'lq-row');
      row.appendChild(html('div', 'lq-ic', strokeIcon(CH.inquiry.icon)));
      var body = el('div');
      body.appendChild(html('div', 'lq-t1', escapeHtml(l.name) + (l.context ? ' <span>asked about</span> ' + escapeHtml(l.context) : ' <span>sent a general inquiry</span>')));
      var t2 = [];
      if (l.first_reply_at) t2.push('Replied ' + shortDate(ts(l.first_reply_at)));
      else t2.push(l.status === 'closed' ? 'Closed' : l.status.charAt(0).toUpperCase() + l.status.slice(1));
      if (l.prior && l.prior.length) t2.push('Back for the ' + ordinal(l.prior.length + 1) + ' time');
      if (l.message) t2.push('“' + l.message + '”');
      body.appendChild(el('div', 'lq-t2', t2.join(' · ')));
      row.appendChild(body);
      row.appendChild(el('div', 'lq-when', shortDate(l.t)));
      var step = el('div', 'lq-step'); step.setAttribute('role', 'group'); step.setAttribute('aria-label', 'Status');
      ['replied', 'won', 'closed'].forEach(function (s) {
        var b = el('button', s + (l.status === s ? ' on' : ''), s.charAt(0).toUpperCase() + s.slice(1)); b.type = 'button';
        b.setAttribute('aria-pressed', l.status === s ? 'true' : 'false');
        b.addEventListener('click', function () {
          if (l.status === s) return;
          moveLead(l, s);   // repaints every group: Closed <-> Everything else
        });
        step.appendChild(b);
      });
      row.appendChild(step);
      if (inClosed && window.LokaliAPI && window.LokaliAPI.leads && typeof window.LokaliAPI.leads.deleteInquiry === 'function') {
        row.style.gridTemplateColumns = '28px minmax(0,1fr) auto auto auto';
        var d = el('button', 'lq-del', 'Delete'); d.type = 'button'; d.setAttribute('aria-label', 'Delete this lead for good');
        var armed = false, timer = null;
        d.addEventListener('click', function () {
          if (!armed) { armed = true; d.classList.add('arm'); d.textContent = 'Delete for good'; timer = setTimeout(function () { armed = false; d.classList.remove('arm'); d.textContent = 'Delete'; }, 4000); return; }
          clearTimeout(timer); d.disabled = true; d.textContent = 'Deleting';
          deleteLead(l).then(function (res) {
            if (res && res.error) { d.disabled = false; armed = false; d.classList.remove('arm'); d.textContent = 'Delete'; return; }
            inquiries = inquiries.filter(function (x) { return x !== l; });
            repaintAll();
          });
        });
        row.appendChild(d);
      }
      return row;
    }

    paintNeeds();
    paintRest();
    paintClosed();

    // ── how people reached you (30 days) ──
    var by = {};
    inquiries.forEach(function (l) { if (Date.now() - l.t < DAY30) by.inquiry = (by.inquiry || 0) + 1; });
    events.forEach(function (e) {
      if (Date.now() - ts(e.created_at) >= DAY30) return;
      var ty = e.event_type || 'website';
      if (ty === 'call' || ty === 'sms') ty = 'phone';
      if (!CH[ty]) ty = 'website';
      by[ty] = (by[ty] || 0) + 1;
    });
    var any = CH_ORDER.some(function (k) { return by[k]; });
    if (any) {
      var sh = el('div', 'lq-sh');
      sh.appendChild(el('h3', null, 'How people reached you'));
      sh.appendChild(el('span', 'lq-hint', 'Last 30 days. Taps on your contact buttons, no names attached'));
      mount.appendChild(sh);
      var chs = el('div', 'lq-chs');
      CH_ORDER.forEach(function (k) {
        if (!by[k]) return;
        var cfg = CH[k];
        var c = el('div', 'lq-ch');
        c.appendChild(html('div', 'i' + (cfg.brand ? ' brand' : ''), strokeIcon(cfg.icon)));
        var m = el('div');
        m.appendChild(el('div', 'n', String(by[k])));
        m.appendChild(el('div', 'k', cfg.label));
        c.appendChild(m);
        chs.appendChild(c);
      });
      mount.appendChild(chs);
    }
  }

  // First-storefront empty state: the three checkup items that bring a lead,
  // pre-checked from the vendor's own storefront (window.LokaliCheckup is the
  // shared helper in lokali-dashboard.js; degrades to static copy without it).
  function renderEmpty(host) {
    var box = el('div', 'lq-empty');
    var left = el('div');
    left.appendChild(el('h3', null, 'Your first lead usually follows three things'));
    var ol = el('ol'); left.appendChild(ol);
    var btns = el('div', 'lq-acts'); left.appendChild(btns);
    var ghost = el('div', 'lq-ghostcard');
    ghost.appendChild(html('div', 'lq-who', 'A shopper <span>asked about</span> your listing'));
    ghost.appendChild(el('div', 'lq-msg', '“Hi, is this available next week?”'));
    ghost.appendChild(html('div', 'lq-acts', '<span class="lq-btn p">' + FA.envelope + '<span>Reply by email</span></span><span class="lq-btn">' + FA.phone + '<span>Call</span></span>'));
    box.appendChild(left); box.appendChild(ghost);
    host.appendChild(box);

    function paint(items) {
      ol.innerHTML = ''; btns.innerHTML = '';
      items.forEach(function (it, idx) {
        var li = el('li');
        li.appendChild(it.done ? html('i', 'ok', FA.check) : el('i', null, String(idx + 1)));
        li.appendChild(html('div', null, '<b>' + escapeHtml(it.title) + '.</b> ' + escapeHtml(it.why)));
        ol.appendChild(li);
      });
      var open = items.filter(function (i) { return !i.done; })[0];
      if (open) { var a = el('a', 'lq-btn p', open.action); a.href = open.href; btns.appendChild(a); }
      var see = el('a', 'lq-btn q', 'See your storefront checkup'); see.href = '/vendor-dashboard/analytics'; btns.appendChild(see);
    }
    var fallback = [
      { done: false, title: 'A way to reach you', why: 'A phone number or email so an inquiry has somewhere to land.', action: 'Add contact', href: '/vendor-dashboard/profile#lok-sec-business' },
      { done: false, title: 'A photo on every listing', why: 'A listing with no photo is the one nobody opens.', action: 'Add photos', href: '/vendor-dashboard/services' },
      { done: false, title: 'A price or "ask for a quote"', why: 'Shoppers skip listings with no price.', action: 'Add prices', href: '/vendor-dashboard/services' }
    ];
    paint(fallback);
    var A = window.LokaliAPI;
    if (typeof window.LokaliCheckup !== 'function' || !A || !A.vendors || !A.services || !A.products) return;
    Promise.all([A.vendors.me(), A.services.getMine(), A.products.getMine()]).then(function (rs) {
      var v = (rs[0] && rs[0].data) || {}; if (v && v.vendor) v = v.vendor;
      var svc = (rs[1] && rs[1].data && (rs[1].data.items || rs[1].data)) || [];
      var prd = (rs[2] && rs[2].data && (rs[2].data.items || rs[2].data)) || [];
      var ck = window.LokaliCheckup(v, svc, prd, [], {}, null);
      var want = ['contact', 'photo', 'price', 'depth'];
      var picked = [];
      want.forEach(function (k) { var it = ck.items.filter(function (i) { return i.key === k; })[0]; if (it && picked.length < 3) picked.push(it); });
      if (picked.length) paint(picked.map(function (i) { return { done: i.done, title: i.title, why: i.why, action: i.action, href: i.href }; }));
    }).catch(function () {});
  }

  // The page could render BLANK on mobile — the same failure class the
  // Analytics page hit 2026-07-13: init ran ONCE at DOMContentLoaded, and if
  // the adapter wasn't installed yet or the Supabase session was still
  // restoring it bailed silently (console.warn + return); a rejected fetch
  // had no .catch either. Reported live by Francesca 2026-08-13 ("sometimes
  // doesn't load on mobile"). Now: spinner immediately, poll until the API +
  // auth token exist (slow phones can take >10s), always paint something,
  // and offer a retry that restarts the whole boot.
  function showLoading(mount, text) {
    mount.innerHTML = '';
    var c = el('div', 'lp-load');
    c.appendChild(el('div', 'lp-spin'));
    c.appendChild(el('div', 'lp-load-t', text));
    mount.appendChild(c);
  }

  function showError(mount, text) {
    mount.innerHTML = '';
    var c = el('div', 'lp-load');
    c.appendChild(el('div', 'lp-load-t', text));
    var b = document.createElement('button');
    b.textContent = 'Try again';
    b.style.cssText = 'display:block;margin:14px auto 0;font-family:inherit;font-size:13px;font-weight:600;' +
      'color:#fff;background:' + VIOLET + ';border:none;border-radius:9px;padding:9px 18px;cursor:pointer;';
    b.addEventListener('click', function () { init(0); });
    c.appendChild(b);
    mount.appendChild(c);
  }

  function apiReady() {
    var A = window.LokaliAPI;
    if (!A || !A.leads || typeof A.leads.getMine !== 'function' || typeof A.leads.analytics !== 'function') return false;
    // Wait for the restored auth token too — calling before the session is
    // back gets an anon 401/empty and stranded the page blank.
    try { return !!(typeof A.getToken === 'function' ? A.getToken() : true); } catch (e) { return true; }
  }

  function load(mount, attempt) {
    Promise.all([window.LokaliAPI.leads.getMine(), window.LokaliAPI.leads.analytics()])
      .then(function (res) {
        var leadsRes = res[0], anRes = res[1];
        if ((!leadsRes || leadsRes.error) && (!anRes || anRes.error)) {
          if (attempt < 1) { setTimeout(function () { load(mount, attempt + 1); }, 2500); return; }
          showError(mount, 'Leads are taking a moment to load.');
          return;
        }
        render(mount, (leadsRes && leadsRes.data) || {}, (anRes && anRes.data) || {});
      })
      .catch(function (err) {
        console.warn('[lokali-leads] load failed', err);
        if (attempt < 1) { setTimeout(function () { load(mount, attempt + 1); }, 2500); return; }
        showError(mount, "We couldn't load your leads.");
      });
  }

  function init(tries) {
    tries = tries || 0;
    var mount = document.getElementById('lok-leads-page');
    if (!mount) return;
    injectStyles();
    // Spinner up FIRST — also covers the ready-API-but-slow-fetch case, so the
    // page never sits on static/blank content while data loads.
    if (tries === 0) showLoading(mount, 'Loading your leads…');
    if (!apiReady()) {
      if (tries < 120) { setTimeout(function () { init(tries + 1); }, 250); return; } // ~30s of patience for slow mobile session restores
      showError(mount, "We couldn't load your leads.");
      return;
    }
    load(mount, 0);
  }

  // test hooks (live pre-ship checks render sample data into the mount)
  try { window.LokaliLeads = { render: render, injectStyles: injectStyles }; } catch (e) {}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(0); });
  else init(0);
})();
