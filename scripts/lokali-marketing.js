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
 * #163 "Your QR code" card: a printable QR to the vendor's storefront
 * (rendered by lokali-qr-kit.js, page-level tag on this page ONLY — the card
 * self-hides when the kit global is absent). Codes carry
 * ?utm_source=qr&utm_campaign=vendor&lkv=<id>; lokali-qr-scan.js attributes
 * the landing. Stats via vendor_qr_stats(): Featured sees the numbers, Pro
 * sees only "your code is getting scanned" with NO count (scans are recorded
 * for Pro too — the upgrade teaser; the count is hidden server-side).
 *
 * #197 "Your launch post" card (2026-10-07): the 1080x1080 "Now on Lokali" square
 * from the launch kit, drawn on a canvas in the browser (the kit's cron cannot
 * render Plus Jakarta Sans) so every vendor can download it from here. Same
 * design as docs/marketing/launch-kit/now-on-lokali.html: business name,
 * category + area line, golokali.com/slug pill, wordmark. Needs no new RPC:
 * category/location names come from the public lookups already granted.
 *
 * The "Bring your neighbors" placement-links card (2026-09-17 .. 2026-11-10) was
 * removed at F's ask (confusing, unused). The ?via= links already pasted by
 * vendors still land and count server-side (placement_share_links /
 * share_landings untouched); only the dashboard card is gone.
 *
 * Two QR codes, two jobs (F 2026-11-10): the storefront code card and the review
 * code card are a matched pair in opposite inks (violet band + violet modules /
 * blue band + blue modules), each captioned under the code, the review card
 * ending in a box that says it is not the storefront code. The copy-ready
 * text / email / packaging suggestions under the review code were removed.
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
  // Review-code blue (the brand blue of the email headlines). Two codes, two
  // inks: storefront = violet, review = blue, so a printout tells them apart
  // (F 2026-11-10: 'a visual differentiator so they don't use the wrong one').
  var REVIEW_BLUE = '#021AEE';
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

  var ICON_STORE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" aria-hidden="true"><path d="M547.6 103.8L490.3 13.1C485.2 5 476.1 0 466.4 0H109.6C99.9 0 90.8 5 85.7 13.1L28.3 103.8c-29.6 46.8-3.4 111.9 51.9 119.4c4 .5 8.1 .8 12.1 .8c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.2 0 49.3-11.4 65.2-29c16 17.6 39.1 29 65.2 29c4.1 0 8.1-.3 12.1-.8c55.5-7.4 81.8-72.5 52.1-119.4zM499.7 254.9l-.1 0c-5.3 .7-10.7 1.1-16.2 1.1c-12.4 0-24.3-1.9-35.4-5.3V384H128V250.6c-11.2 3.5-23.2 5.4-35.6 5.4c-5.5 0-11-.4-16.3-1.1l-.1 0c-4.1-.6-8.1-1.3-12-2.3V384v64c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V384 252.6c-4 1-8 1.8-12.3 2.3z"/></svg>';
  var ICON_STAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>';
  var ICON_INFO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336h24V272H216c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24H216c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>';
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
  }); }

  // DB guard errors arrive raw from PostgREST: "LOKALI_LIMIT_REACHED: <human>".
  function humanError(err) {
    var m = (err && (err.message || err.error_description)) || 'Something went wrong. Try again.';
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
      '.mkt-post-row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;}' +
      '.mkt-post-prev{flex:0 0 auto;width:188px;height:188px;border:1px solid #ECE8F8;border-radius:12px;overflow:hidden;background:#F7F6FC;line-height:0;}' +
      '.mkt-post-prev canvas{width:188px;height:188px;display:block;}' +
      '.mkt-post-cap{margin:10px 0 0;background:#F7F6FC;border:1px solid #ECE8F8;border-radius:10px;padding:10px 12px;font-size:13px;color:#3E3A55;line-height:1.5;white-space:pre-wrap;}' +
      // "Get a new link" (SEC-074): quiet on purpose, it is a rare, destructive-ish
      // action. #6E6A85 is 5.17:1 on white (the slate above is 3.3:1); 44px tap area.
      '.mkt-rv-rot{margin-top:10px;font-size:12.5px;color:#6E6A85;line-height:1.5;}' +
      '.mkt-rv-rot button{border:0;background:none;padding:0;min-height:44px;font-family:inherit;font-size:12.5px;font-weight:700;color:' + BRAND + ';cursor:pointer;text-decoration:underline;text-underline-offset:2px;}' +
      '.mkt-rv-rot button[disabled]{opacity:.6;cursor:default;}' +
      '.mkt-rv-rot button.warn{color:#B3261E;}' +
      '.mkt-rv-rot button.plain{color:#6E6A85;margin-left:14px;}' +
      '.mkt-lock{text-align:center;padding:26px 18px;}' +
      '.mkt-lock p{margin:0 auto 14px;max-width:430px;font-size:13.5px;color:#8E8BA6;}' +
      '.mkt-lock .mkt-lockh{font-size:16px;font-weight:700;color:#3E3A55;margin-bottom:6px;}' +
      '.mkt-cta-demo{display:inline-block;background:' + BRAND + ';color:#fff;border-radius:10px;padding:10px 20px;' +
        'font-size:13.5px;font-weight:600;margin-bottom:12px;}' +
      '.mkt-up{display:inline-block;background:' + BRAND + ';color:#fff;border-radius:10px;padding:11px 24px;' +
        'font-size:13.5px;font-weight:600;text-decoration:none;}' +
      '.mkt-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#3E3A55;color:#fff;' +
        'font-family:' + FONT + ';font-size:13.5px;border-radius:10px;padding:11px 18px;z-index:9999;max-width:82vw;}' +
      // #163 "Your QR code": preview left, copy + downloads + stats right.
      '.mkt-qr-row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;}' +
      '.mkt-qr-code{flex:0 0 auto;border:1px solid #ECE8F8;border-radius:12px;padding:10px;background:#fff;line-height:0;}' +
      '.mkt-qr-code svg{display:block;width:168px;height:168px;}' +
      '.mkt-qr-side{flex:1;min-width:230px;}' +
      '.mkt-qr-url{font-size:12px;color:#8E8BA6;overflow-wrap:anywhere;margin:0 0 10px;}' +
      '.mkt-qr-url b{color:#6B6880;font-weight:600;}' +
      '.mkt-qr-btns{display:flex;gap:8px;flex-wrap:wrap;}' +
      '.mkt-qr-dl{display:inline-block;border:0;background:#F3EBFF;color:' + BRAND + ';font-weight:600;font-size:12.5px;' +
        'border-radius:9px;padding:8px 14px;cursor:pointer;}' +
      '.mkt-qr-stats{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 0;}' +
      '.mkt-qr-stat{background:#F7F6FC;border:1px solid #ECE8F8;border-radius:10px;padding:10px 14px;min-width:86px;}' +
      '.mkt-qr-sv{font-size:20px;font-weight:700;color:#3E3A55;line-height:1.2;}' +
      '.mkt-qr-sl{font-size:11px;font-weight:600;color:#8E8BA6;text-transform:uppercase;letter-spacing:.04em;}' +
      '.mkt-qr-teaser{background:#F7F6FC;border:1px solid #ECE8F8;border-radius:10px;padding:12px 14px;margin:14px 0 0;' +
        'font-size:12.5px;color:#6B6880;}' +
      '.mkt-qr-teaser a{color:' + BRAND + ';font-weight:600;text-decoration:none;}' +
      '.mkt-qr-teaser a:hover{text-decoration:underline;}' +
      // #163b badge toggle (Featured): two pills under the preview.
      '.mkt-qr-badge{display:flex;align-items:center;gap:6px;margin:10px 0 0;flex-wrap:wrap;}' +
      '.mkt-qr-badge span{font-size:11.5px;color:#8E8BA6;margin-right:2px;}' +
      '.mkt-qr-badge button{border:1px solid #E4DEF4;background:#fff;color:#5D4F9E;font-family:inherit;font-size:12px;' +
        'font-weight:600;border-radius:999px;padding:5px 11px;cursor:pointer;}' +
      '.mkt-qr-badge button.on{background:#F3EBFF;border-color:' + BRAND + ';color:' + BRAND + ';}' +
      // Two QR codes, two jobs (F 2026-11-10): each code card wears a band + tint in
      // its own ink. Violet = storefront (for everyone), blue = review (customers only).
      '.mkt-band{display:flex;align-items:center;gap:8px;margin:-22px -24px 16px;padding:9px 24px;border-radius:14px 14px 0 0;color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;}' +
      '.mkt-band svg{width:14px;height:14px;fill:#fff;flex:0 0 auto;}' +
      '.mkt-band.store{background:' + BRAND + ';}' +
      '.mkt-band.review{background:' + REVIEW_BLUE + ';}' +
      '.mkt-card.store{background:#F9F6FF;border-color:#E4DEF4;}' +
      '.mkt-card.review{background:#F1F4FF;border-color:#C9D3FB;}' +
      '.mkt-card.store .mkt-h,.mkt-card.review .mkt-h{display:flex;align-items:center;gap:8px;}' +
      '.mkt-card.store .mkt-h svg{width:18px;height:18px;fill:' + BRAND + ';flex:0 0 auto;}' +
      '.mkt-card.review .mkt-h{color:#13227A;}' +
      '.mkt-card.review .mkt-h svg{width:18px;height:18px;fill:' + REVIEW_BLUE + ';flex:0 0 auto;}' +
      '.mkt-card.review .mkt-sub,.mkt-card.review .mkt-qr-url,.mkt-card.review .mkt-note{color:#5A66A0;}' +
      '.mkt-card.review .mkt-qr-url b{color:#13227A;}' +
      '.mkt-card.review .mkt-qr-dl{background:#E0E6FF;color:' + REVIEW_BLUE + ';}' +
      '.mkt-card.review .mkt-qr-code{border-color:#C9D3FB;}' +
      '.mkt-card.review .mkt-rv-rot button{color:' + REVIEW_BLUE + ';}' +
      '.mkt-card.review .mkt-rv-rot button.warn{color:#B3261E;}' +
      '.mkt-card.review .mkt-rv-rot button.plain{color:#6E6A85;}' +
      '.mkt-tag{display:inline-block;font-size:11.5px;font-weight:600;border-radius:999px;padding:4px 10px;white-space:nowrap;}' +
      '.mkt-tag.store{background:#F3EBFF;color:' + BRAND + ';}' +
      '.mkt-tag.review{background:#E0E6FF;color:#13227A;}' +
      '.mkt-qr-code{line-height:1.2;}' +
      '.mkt-qr-cap{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-align:center;margin:8px 0 0;line-height:1;}' +
      '.mkt-card.store .mkt-qr-cap{color:' + BRAND + ';}' +
      '.mkt-card.review .mkt-qr-cap{color:' + REVIEW_BLUE + ';}' +
      '.mkt-diff{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px dashed #8FA3F0;border-radius:10px;padding:10px 12px;margin-top:14px;font-size:12.5px;color:#5A66A0;line-height:1.5;}' +
      '.mkt-diff svg{flex:0 0 auto;width:16px;height:16px;fill:' + REVIEW_BLUE + ';margin-top:2px;}' +
      '.mkt-diff b{color:#13227A;font-weight:600;}' +
      '@media (max-width:600px){.mkt-band{margin:-16px -16px 14px;padding:8px 16px;}.mkt-head{flex-wrap:wrap;}}' +
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
  function Page(mount, vendor, premium, free) {
    this.mount = mount;
    this.vendor = vendor;
    this.premium = premium;            // Featured? (showcase entitlement)
    // Free plan (F 2026-09-20: the review link AND the basic storefront QR are
    // for every vendor; a code on a market table is distribution for Lokali, so
    // gating it cost growth). A free Page shows the QR card + the "Ask for a
    // review" card above the plans teaser. It fetches the review code and
    // vendor_qr_stats only; that RPC answers {allowed:false} below Featured, so
    // scan numbers and the own-logo badge stay paid with no SQL change.
    this.free = free === true;
    this.entries = { cta: [], showcase: [] };
    this.editing = null;               // entry id being edited, or 'new:<kind>'
    // #163b: Featured vendors may put their OWN storefront logo in the QR
    // badge. null until loaded; the L is always the default and the fallback.
    this.qrLogo = null;
    this.qrBadge = 'l';
    try { if (localStorage.getItem('lok-qr-badge:' + vendor.id) === 'own') this.qrBadge = 'own'; } catch (e) {}
    this.load();
  }

  Page.prototype.load = function () {
    var self = this;
    if (this.free) {
      var RV = window.LokaliSupabaseAPI.reviews;
      Promise.all([
        (RV && RV.myLink) ? RV.myLink().catch(function () { return null; }) : Promise.resolve(null),
        API.qrStats ? API.qrStats(this.vendor.id).catch(function () { return null; }) : Promise.resolve(null)
      ]).then(function (rs) {
        var rl = rs[0] && rs[0].data;
        self.reviewCode = (rl && rl.ok && /^[a-f0-9]{10}$/.test(rl.code || '')) ? rl.code : null;
        var q = rs[1] && rs[1].data;
        self.qr = (q && q.ok) ? q : null;
        self.render();
      });
      return;
    }
    Promise.all([
      API.list(this.vendor.id),
      API.current(this.vendor.id, 0),
      API.current(this.vendor.id, 1),
      // Spotlight creative is Featured-only (and needs myCreatives support in
      // the shipped client — absent until the phase-2 tag, hence the guard).
      (SPOTLIGHT_CREATIVE_ENABLED && this.premium && API.myCreatives) ? API.myCreatives(this.vendor.id) : Promise.resolve(null),
      // #163 QR scan stats — same absent-until-the-tag guard as myCreatives.
      // The RPC returns full stats for Featured, {allowed:false, total} for
      // Pro (the teaser), and the card renders either way.
      API.qrStats ? API.qrStats(this.vendor.id) : Promise.resolve(null),
      // Review link code (patch_review_invite.sql). Same absent-until-the-tag +
      // never-take-the-page-down guard: without a code the card falls back to
      // the plain #reviews link it shipped with.
      (window.LokaliSupabaseAPI.reviews && window.LokaliSupabaseAPI.reviews.myLink)
        ? window.LokaliSupabaseAPI.reviews.myLink().catch(function () { return null; })
        : Promise.resolve(null)
    ]).then(function (rs) {
      var rows = (rs[0] && rs[0].data) || [];
      self.entries = { cta: [], showcase: [] };
      rows.forEach(function (e) { if (self.entries[e.kind]) self.entries[e.kind].push(e); });
      self.now = (rs[1] && rs[1].data) || {};
      self.next = (rs[2] && rs[2].data) || {};
      self.spot = (rs[3] && rs[3].data) || null;   // {bookings, creatives} | null
      var q = rs[4] && rs[4].data;                 // #163 vendor_qr_stats payload
      self.qr = (q && q.ok) ? q : null;
      var rl = rs[5] && rs[5].data;                // my_review_link payload
      self.reviewCode = (rl && rl.ok && /^[a-f0-9]{10}$/.test(rl.code || '')) ? rl.code : null;
      self.render();
      self.loadQrLogo();
    });
  };

  // #163b: fetch the storefront logo once (CORS) so it can sit in the badge.
  // Featured only (featured-first rollout); a failed load simply keeps the L
  // and the toggle never appears.
  Page.prototype.loadQrLogo = function () {
    var self = this;
    if (!this.premium || !window.LokaliQR || !window.LokaliQR.loadBadgeImage) return;
    var url = this.vendor.profile_photo;
    if (!url) return;
    window.LokaliQR.loadBadgeImage(url, 512).then(function (logo) {
      if (!logo) { self.qrBadge = 'l'; return; }
      self.qrLogo = logo;
      self.refreshQrPreview();
    });
  };
  Page.prototype.qrOpts = function (px, ink) {
    // ink = the module colour: violet for the storefront code (default), blue for
    // the review code. lokali-qr-kit.js honours opts.dark in toSvg; PNGs go
    // through svgToPng() below so the ink carries into the download too.
    var o = { px: px, dark: ink || BRAND };
    if (this.qrBadge === 'own' && this.qrLogo) o.custom = this.qrLogo;
    return o;
  };
  // Re-render just the QR preview + toggle (no full re-render, so an open
  // editor elsewhere on the page is untouched).
  Page.prototype.refreshQrPreview = function () {
    var box = this.mount.querySelector('.mkt-qr-code');
    if (box) box.innerHTML = window.LokaliQR.toSvg(this.qrUrl(), this.qrOpts(168, BRAND)) + '<p class="mkt-qr-cap">Storefront</p>';
    // The slot is always rendered (empty until the logo lands), so the toggle
    // can appear AFTER the async logo load without a full re-render.
    var slot = this.mount.querySelector('.mkt-qr-badge-slot');
    if (slot) slot.innerHTML = this.qrBadgeHtml();
  };
  Page.prototype.qrBadgeHtml = function () {
    if (!this.premium || !this.qrLogo) return '';
    var own = this.qrBadge === 'own';
    return '<div class="mkt-qr-badge" role="group" aria-label="Center badge">' +
      '<span>Center:</span>' +
      '<button type="button" data-act="qr-badge-l"' + (own ? '' : ' class="on"') + '>Lokali L</button>' +
      '<button type="button" data-act="qr-badge-own"' + (own ? ' class="on"' : '') + '>Your logo</button>' +
    '</div>';
  };
  Page.prototype.setQrBadge = function (which) {
    this.qrBadge = (which === 'own' && this.qrLogo) ? 'own' : 'l';
    try { localStorage.setItem('lok-qr-badge:' + this.vendor.id, this.qrBadge); } catch (e) {}
    this.refreshQrPreview();
  };

  Page.prototype.render = function () {
    this.mount.className = 'lok-mkt';
    if (this.free) {
      this.mount.innerHTML = this.qrCardHtml() + this.reviewCardHtml() + this.postCardHtml() + upsellHtml();
      this.bind();
      this.drawPost();
      return;
    }
    this.mount.innerHTML =
      this.cardHtml('cta') +
      (this.premium ? this.cardHtml('showcase') : this.lockedShowcaseHtml()) +
      this.qrCardHtml() +
      this.reviewCardHtml() +
      this.postCardHtml() +
      (SPOTLIGHT_CREATIVE_ENABLED && this.premium && this.spot ? this.spotlightCardHtml() : '');
    this.bind();
    this.drawPost();
  };

  // ---- #163 Your QR code ------------------------------------------------------
  // Always the canonical domain, never location.origin: a printed code must
  // point at golokali.com even when the dashboard is previewed elsewhere.
  // The lkv param is what lokali-qr-scan.js attributes the landing with.
  Page.prototype.qrUrl = function () {
    return 'https://www.golokali.com/' + this.vendor.slug +
      '?utm_source=qr&utm_medium=print&utm_campaign=vendor&lkv=' + this.vendor.id;
  };

  // Renders only when lokali-qr-kit.js is on the page (page-level tag on
  // /vendor-dashboard/marketing) — same absent-until-the-tag posture as the
  // API guards, so a half-shipped state hides the card instead of breaking it.
  Page.prototype.qrCardHtml = function () {
    if (!window.LokaliQR || !this.vendor.slug) return '';
    var q = this.qr;   // vendor_qr_stats payload | null (RPC not live yet)
    var statsHtml = '';
    if (q && q.allowed) {
      var mobilePct = q.total > 0 ? Math.round((q.mobile / q.total) * 100) : 0;
      var since = q.first_scan_at
        ? new Date(q.first_scan_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : null;
      statsHtml =
        '<div class="mkt-qr-stats">' +
          '<div class="mkt-qr-stat"><div class="mkt-qr-sv">' + (+q.total || 0) + '</div><div class="mkt-qr-sl">Scans</div></div>' +
          '<div class="mkt-qr-stat"><div class="mkt-qr-sv">' + (+q.d30 || 0) + '</div><div class="mkt-qr-sl">Last 30 days</div></div>' +
          '<div class="mkt-qr-stat"><div class="mkt-qr-sv">' + (+q.d7 || 0) + '</div><div class="mkt-qr-sl">This week</div></div>' +
        '</div>' +
        (q.total > 0
          ? '<p class="mkt-note">' + mobilePct + '% of scans came from a phone' +
            (since ? ', counting since ' + esc(since) : '') + '.</p>'
          : '<p class="mkt-note">No scans yet. Counting starts the moment your code is out in the world.</p>');
    } else if (q && !q.allowed) {
      // Pro teaser: scans ARE being recorded, but the payload carries NO
      // numbers (v2, Francesca 2026-09-01) — activity yes, count no. The
      // count is the headline stat, so showing it would undercut the
      // upgrade; the hide is server-side in vendor_qr_stats(), this copy
      // just matches it.
      statsHtml =
        '<div class="mkt-qr-teaser">' +
          (q.has_scans
            ? '<b>Your code is getting scanned.</b> How many, how often, and from ' +
              'what devices are a Featured perk. Your full history is being saved ' +
              'in the meantime, so it will all be here the day you upgrade. '
            : 'Scan counting is already on. Your history is saved from the very ' +
              'first scan, and the stats are a Featured perk. ') +
          '<a href="/pricing">See the Featured plan</a>' +
        '</div>';
      // #163b: Featured also puts the vendor's own logo in the center.
      statsHtml += '<p class="mkt-note">Featured vendors can also put their own logo in the center of the code.</p>';
    }
    return '<div class="mkt-card store" data-kind="qr">' +
      '<div class="mkt-band store">' + ICON_STORE + ' For everyone &middot; opens your storefront</div>' +
      '<div class="mkt-head"><p class="mkt-h">' + ICON_STORE + 'Your storefront QR code</p><span class="mkt-tag store">Opens your storefront</span></div>' +
      '<p class="mkt-sub">For people who have not met you yet. Put it on flyers, table tents, business cards and packaging, anywhere people can point a camera.</p>' +
      '<div class="mkt-qr-row">' +
        '<div class="mkt-qr-code">' + window.LokaliQR.toSvg(this.qrUrl(), this.qrOpts(168, BRAND)) + '<p class="mkt-qr-cap">Storefront</p></div>' +
        '<div class="mkt-qr-side">' +
          '<p class="mkt-qr-url">Opens <b>golokali.com/' + esc(this.vendor.slug) + '</b>. Scans are counted automatically.</p>' +
          '<div class="mkt-qr-btns">' +
            '<button type="button" class="mkt-qr-dl" data-act="qr-png">Download PNG</button>' +
            '<button type="button" class="mkt-qr-dl" data-act="qr-svg">Download SVG</button>' +
          '</div>' +
          '<p class="mkt-note">Print it at least 1 inch (2.5 cm) wide and keep the white border, cameras need it. The SVG stays sharp at any size.</p>' +
          '<div class="mkt-qr-badge-slot">' + this.qrBadgeHtml() + '</div>' +
          statsHtml +
        '</div>' +
      '</div>' +
    '</div>';
  };

  // Rasterise an SVG string to a 1024px PNG data URL (the kit's own toPngDataUrl
  // always paints near-black; drawing its SVG keeps the card's ink).
  function svgToPng(svg, px) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = px; c.height = px;
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, px, px);
          ctx.drawImage(img, 0, 0, px, px);
          resolve(c.toDataURL('image/png'));
        } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = function (e) { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }
  function saveFile(href, name, revoke) {
    var a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    if (revoke) setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
  }
  // Shared by both code cards: fmt 'svg' | 'png', url = what the code opens,
  // ink = module colour, name = file name without the extension.
  function downloadCode(url, ink, name, fmt, opts) {
    var svg = window.LokaliQR.toSvg(url, opts);
    if (fmt === 'svg') {
      saveFile(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), name + '.svg', true);
      return;
    }
    svgToPng(svg, 1024).then(function (dataUrl) { saveFile(dataUrl, name + '.png'); }, function () {
      // Last resort: the kit's own PNG (dark ink, still a valid code).
      saveFile(window.LokaliQR.toPngDataUrl(url, 1024, opts), name + '.png');
    });
  }
  Page.prototype.downloadQr = function (fmt) {
    downloadCode(this.qrUrl(), BRAND, 'lokali-storefront-qr-' + this.vendor.slug, fmt, this.qrOpts(1024, BRAND));
  };

  // ---- #197 Your launch post ---------------------------------------------------
  // The square is drawn into a <canvas> after render (fonts + wordmark are async),
  // at 1080px and shown scaled; the download hands over the full-size PNG.
  var WORDMARK = 'https://cdn.prod.website-files.com/6989095758ae17edfc424d30/698b5bd9a395418e4c895175_Lokali%20Logo.png'; // CORS: allow-origin *
  var _lookups = null;
  function lookups() {
    if (_lookups) return _lookups;
    var api = window.LokaliSupabaseAPI;
    var d = (api && api.data) || {};
    _lookups = Promise.all([
      d.categories ? d.categories().catch(function () { return null; }) : null,
      d.locations ? d.locations().catch(function () { return null; }) : null
    ]).then(function (rs) {
      var cats = {}, locs = {};
      ((rs[0] && rs[0].data) || []).forEach(function (c) { cats[c.id] = c.category_name; });
      ((rs[1] && rs[1].data) || []).forEach(function (l) { locs[l.id] = l.location_name; });
      return { cats: cats, locs: locs };
    });
    return _lookups;
  }

  Page.prototype.postCardHtml = function () {
    if (!this.vendor.slug || !document.createElement('canvas').getContext) return '';
    return '<div class="mkt-card" data-kind="post">' +
      '<div class="mkt-head"><p class="mkt-h">Your launch post</p></div>' +
      '<p class="mkt-sub">A square image made for your storefront. Post it once on Instagram or Facebook, pin it, and you are done.</p>' +
      '<div class="mkt-post-row">' +
        '<div class="mkt-post-prev"><canvas id="mkt-post-canvas" width="1080" height="1080" aria-label="Now on Lokali: ' + esc(this.vendor.business_name || '') + '"></canvas></div>' +
        '<div class="mkt-qr-side">' +
          '<div class="mkt-qr-btns"><button type="button" class="mkt-qr-dl" data-act="post-png">Download image (PNG)</button>' +
          '<button type="button" class="mkt-qr-dl" data-act="post-copy">Copy caption</button></div>' +
          '<div class="mkt-post-cap" id="mkt-post-cap">' + esc(this.postCaption()) + '</div>' +
          '<p class="mkt-note">1080 x 1080, the size Instagram and Facebook want. The caption is a starting point, say it your way.</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  Page.prototype.postCaption = function () {
    var name = this.vendor.business_name || 'We';
    return name + ' is now on Lokali, the marketplace for local businesses. ' +
      'See what we offer, send us a message, or leave a review at golokali.com/' + this.vendor.slug + '. ' +
      'And if you are a neighbor with a business of your own, there is a free storefront waiting for you too.';
  };

  // Text wrap that fits the business name: starts at 96px, shrinks until it
  // takes at most two lines of 900px, then shrinks further for three.
  function fitName(ctx, text, maxW, maxLines, size, min) {
    for (var s = size; s >= min; s -= 4) {
      ctx.font = '800 ' + s + 'px "Plus Jakarta Sans", Helvetica, Arial, sans-serif';
      var words = text.split(/\s+/), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var t = cur ? cur + ' ' + words[i] : words[i];
        if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = words[i]; }
      }
      if (cur) lines.push(cur);
      var tooWide = lines.some(function (l) { return ctx.measureText(l).width > maxW; });
      if (lines.length <= maxLines && !tooWide) return { lines: lines, size: s };
    }
    return { lines: [text], size: min };
  }

  Page.prototype.drawPost = function () {
    var cv = document.getElementById('mkt-post-canvas');
    if (!cv) return Promise.resolve(null);
    var self = this, v = this.vendor, W = 1080;
    var fontsReady = (document.fonts && document.fonts.load)
      ? Promise.all([document.fonts.load('800 96px "Plus Jakarta Sans"'), document.fonts.load('700 30px "Plus Jakarta Sans"'), document.fonts.load('600 30px "Plus Jakarta Sans"')]).catch(function () {})
      : Promise.resolve();
    var logo = new Promise(function (res) {
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () { res(im); }; im.onerror = function () { res(null); };
      im.src = WORDMARK;
    });
    return Promise.all([fontsReady, logo, lookups()]).then(function (rs) {
      var img = rs[1], lk = rs[2];
      var catIds = Array.isArray(v.categories_id) ? v.categories_id : (v.categories_id != null ? [v.categories_id] : []);
      var locIds = Array.isArray(v.locations_id) ? v.locations_id : (v.locations_id != null ? [v.locations_id] : []);
      var cat = catIds.length ? (lk.cats[catIds[0]] || '') : '';
      var loc = locIds.length ? (lk.locs[locIds[0]] || '') : '';
      var sub = cat ? (loc ? cat + ' in ' + loc + ' and nearby' : cat) : (loc ? 'Local business in ' + loc + ' and nearby' : 'A local business, now on Lokali');
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, W, W);
      ctx.fillStyle = '#F7F6FC'; ctx.fillRect(0, 0, W, W);
      // soft blobs, same as the kit's square
      function blob(x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); }
      blob(W + 220 - 310, -240 + 310, 310, '#EFE5FD');
      blob(-150 + 190, W + 150 - 190, 190, '#FCE8F1');
      blob(W - 120 - 110, W + 90 - 110, 110, '#E0F5F1');
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      var name = fitName(ctx, v.business_name || 'Your business', 900, 3, 96, 56);
      var lh = name.size * 1.02, nameH = name.lines.length * lh;
      var subH = 30 * 1.3, pillH = 76;
      var block = 26 + 26 + nameH + 26 + subH + 44 + pillH;  // eyebrow + gap + name + gap + sub + gap + pill
      var y = (W - block) / 2 - 20;
      ctx.fillStyle = BRAND;
      ctx.font = '700 26px "Plus Jakarta Sans", Helvetica, Arial, sans-serif';
      var eyebrow = 'NOW ON LOKALI';
      // letter-spacing by hand (canvas letterSpacing is not everywhere yet)
      var sp = 26 * 0.14, ew = 0, chars = eyebrow.split('');
      chars.forEach(function (ch) { ew += ctx.measureText(ch).width + sp; });
      var ex = (W - ew + sp) / 2; ctx.textAlign = 'left';
      chars.forEach(function (ch) { ctx.fillText(ch, ex, y + 26); ex += ctx.measureText(ch).width + sp; });
      ctx.textAlign = 'center';
      y += 26 + 26;
      ctx.fillStyle = '#2E2A3B';
      ctx.font = '800 ' + name.size + 'px "Plus Jakarta Sans", Helvetica, Arial, sans-serif';
      name.lines.forEach(function (l, i) { ctx.fillText(l, W / 2, y + name.size * 0.9 + i * lh); });
      y += nameH + 26;
      ctx.fillStyle = '#625C75';
      ctx.font = '600 30px "Plus Jakarta Sans", Helvetica, Arial, sans-serif';
      if (ctx.measureText(sub).width > 900) { ctx.font = '600 24px "Plus Jakarta Sans", Helvetica, Arial, sans-serif'; }
      ctx.fillText(sub, W / 2, y + 30);
      y += subH + 44;
      ctx.font = '700 30px "Plus Jakarta Sans", Helvetica, Arial, sans-serif';
      var url = 'golokali.com/' + v.slug, pw = ctx.measureText(url).width + 72;
      ctx.fillStyle = BRAND;
      ctx.beginPath();
      var px = (W - pw) / 2, r = pillH / 2;
      ctx.moveTo(px + r, y); ctx.lineTo(px + pw - r, y); ctx.arc(px + pw - r, y + r, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(px + r, y + pillH); ctx.arc(px + r, y + r, r, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(url, W / 2, y + pillH / 2 + 11);
      if (img && img.naturalHeight) {
        var h = 54, w = img.naturalWidth * (h / img.naturalHeight);
        ctx.drawImage(img, (W - w) / 2, W - 64 - h, w, h);
      } else {
        ctx.fillStyle = BRAND; ctx.font = '800 36px "Plus Jakarta Sans", Helvetica, Arial, sans-serif';
        ctx.fillText('Lokali', W / 2, W - 64);
      }
      return cv;
    }).catch(function (e) { console.warn('[marketing] post draw failed', e); return null; });
  };

  Page.prototype.downloadPost = function () {
    var cv = document.getElementById('mkt-post-canvas');
    if (!cv) return;
    var self = this;
    this.drawPost().then(function () {
      var a = document.createElement('a');
      try { a.href = cv.toDataURL('image/png'); } catch (e) { toast('The image could not be exported in this browser.'); return; }
      a.download = 'now-on-lokali-' + self.vendor.slug + '.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
  };

  // ---- Ask for a review (2026-09-17, F; review link 2026-09-19) ------------------
  // The review link lands on the storefront with the Reviews tab open. With the
  // vendor's review code (?review=CODE, patch_review_invite.sql) a customer who
  // never used Lokali's contact buttons can post too, labeled "Invited by the
  // vendor"; without a code it is the original gate-only link. No lkv param: a
  // review ask is not a QR scan and must not count as one.
  Page.prototype.reviewPath = function () {
    return this.vendor.slug + (this.reviewCode ? '?review=' + this.reviewCode : '');
  };
  Page.prototype.reviewUrl = function () {
    return 'https://www.golokali.com/' + this.reviewPath() + (this.reviewCode ? '' : '?src=review-ask') + '#reviews';
  };
  Page.prototype.reviewCardHtml = function () {
    if (!this.vendor.slug) return '';
    var self = this;
    var qr = window.LokaliQR
      ? '<div class="mkt-qr-code">' + window.LokaliQR.toSvg(this.reviewUrl(), this.qrOpts(168, REVIEW_BLUE)) + '<p class="mkt-qr-cap">Review</p></div>'
      : '';
    // F 2026-11-10: no copy-ready text / email / packaging wording here any more.
    // Vendors get the link and the code and say it their own way.
    return '<div class="mkt-card review" data-kind="review">' +
      '<div class="mkt-band review">' + ICON_STAR + ' For customers only &middot; asks for a review</div>' +
      '<div class="mkt-head"><p class="mkt-h">' + ICON_STAR + 'Your review QR code</p><span class="mkt-tag review">Opens your Reviews tab, ready to post</span></div>' +
      '<p class="mkt-sub">For customers you already served. Show it at pickup or print it on a thank-you note. The best moment to ask is right after a handoff, while the good feeling is fresh.</p>' +
      '<div class="mkt-qr-row">' + qr +
        '<div class="mkt-qr-side">' +
          '<p class="mkt-qr-url">Opens <b style="overflow-wrap:anywhere">golokali.com/' + esc(self.reviewPath()) + '#reviews</b>: your storefront, straight to the Reviews tab' +
            (self.reviewCode ? ', with posting unlocked for the person who scanned it.' : '.') + '</p>' +
          '<div class="mkt-qr-btns">' +
            '<button type="button" class="mkt-qr-dl" data-act="rv-copy-link">Copy link</button>' +
            (window.LokaliQR ? '<button type="button" class="mkt-qr-dl" data-act="rv-png">Download QR (PNG)</button><button type="button" class="mkt-qr-dl" data-act="rv-svg">Download QR (SVG)</button>' : '') +
          '</div>' +
          '<p class="mkt-note">Reviews show on your Market card, and one or two change how a stranger reads it. ' + (self.reviewCode
            ? 'Anyone you give this to can sign in and post, including customers you met in person; those reviews are labeled "Invited by the vendor".'
            : 'Reviewers sign in first, and only people who actually contacted you through Lokali can post.') + '</p>' +
          self.rotateRowHtml() +
        '</div>' +
      '</div>' +
      '<div class="mkt-diff">' + ICON_INFO + '<div><b>Not the same as your storefront code above.</b> That one is for finding you. This one carries an invitation: whoever scans it can post a review. Keep it for customers you served.</div></div>' +
    '</div>';
  };
  // ---- "Get a new link" (SEC-074) ---------------------------------------------
  // The review code is a bearer token we ask vendors to PUBLISH (QR on a stall,
  // texts, emails). If it reaches someone it should not, this replaces it: the
  // old link and any printed QR stop admitting reviews at once. Two steps, because
  // that is exactly what makes it costly: a vendor with 200 printed cards must
  // not lose them to a stray tap. Shown only when there is a code to replace and
  // the client method exists (absent-until-the-tag guard, like myLink above).
  Page.prototype.canRotateReviewLink = function () {
    var api = window.LokaliSupabaseAPI;
    return !!(this.reviewCode && api && api.reviews && api.reviews.rotateLink);
  };
  Page.prototype.rotateRowHtml = function () {
    if (!this.canRotateReviewLink()) return '';
    if (!this.rotateArmed) {
      return '<p class="mkt-rv-rot">Link or QR code in the wrong hands? <button type="button" data-act="rv-rotate">Get a new link</button></p>';
    }
    return '<p class="mkt-rv-rot" role="alert">Your current link and any QR code you printed will stop working for new reviews. Reviews you already have are not affected. ' +
      '<button type="button" class="warn" data-act="rv-rotate-yes">Yes, get a new link</button>' +
      '<button type="button" class="plain" data-act="rv-rotate-no">Keep this one</button></p>';
  };
  // Redraw ONLY this card: a full render() would throw away a form someone has
  // open in another card. Clicks are delegated from the mount, so new buttons work.
  Page.prototype.redrawReviewCard = function () {
    var old = this.mount && this.mount.querySelector('.mkt-card[data-kind="review"]');
    if (!old) return;
    var box = document.createElement('div');
    box.innerHTML = this.reviewCardHtml();
    if (box.firstChild) old.parentNode.replaceChild(box.firstChild, old);
  };
  Page.prototype.rotateReviewLink = function (btn) {
    var self = this;
    if (self.rotating || !self.canRotateReviewLink()) return;
    self.rotating = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Getting a new link\u2026'; }
    var finish = function (msg) { self.rotating = false; self.rotateArmed = false; self.redrawReviewCard(); toast(msg); };
    window.LokaliSupabaseAPI.reviews.rotateLink().then(function (res) {
      var d = res && res.data;
      // Same shape check as the initial load: never render a code we did not expect.
      if (res && !res.error && d && d.ok && /^[a-f0-9]{10}$/.test(d.code || '')) {
        self.reviewCode = d.code;
        finish('New link ready. The old one no longer works, so reprint any QR codes.');
      } else {
        finish('We could not make a new link just now. Your current link still works.');
      }
    }).catch(function () {
      finish('We could not make a new link just now. Your current link still works.');
    });
  };
  Page.prototype.copyReviewLink = function () {
    var text = 'https://www.golokali.com/' + this.reviewPath() + '#reviews';
    var done = function () { toast('Copied. Send it right after the handoff.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  };
  Page.prototype.downloadReviewQr = function (fmt) {
    if (!window.LokaliQR) return;
    downloadCode(this.reviewUrl(), REVIEW_BLUE, 'lokali-review-qr-' + this.vendor.slug, fmt, this.qrOpts(1024, REVIEW_BLUE));
  };

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // ---- Spotlight ad creative (phase 2) --------------------------------------
  Page.prototype.spotlightCardHtml = function () {
    var self = this;
    var bookings = this.spot.bookings || [];
    var byBooking = {};
    (this.spot.creatives || []).forEach(function (c) { byBooking[c.spotlight_bookings_id] = c; });
    var html = '<div class="mkt-card" data-kind="spotlight">' +
      '<p class="mkt-h">Spotlight ad creative</p>' +
      '<p class="mkt-sub">Booked a homepage Spotlight? Upload a custom image and headline for your card. We review every creative before it goes live, usually within a day.</p>';
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
        var pillTxt = c.status === 'approved' ? 'Approved and live on the homepage'
          : (c.status === 'rejected' ? 'Not approved' : 'In review');
        pill = '<span style="display:inline-block;background:' + pillBg + ';color:' + pillFg + ';' +
          'border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;">' + pillTxt + '</span>' +
          (c.status === 'rejected' && c.review_note
            ? '<div class="mkt-note">&ldquo;' + esc(c.review_note) + '&rdquo; Fix it and resubmit below.</div>' : '');
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
        '<input class="mkt-in" data-f="sc-headline" maxlength="90" value="' + esc(c ? (c.headline || '') : '') + '" placeholder="Fresh this week, come say hi Saturday">' +
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
    // SEC-045: mirrors the spotlight_creatives_image_https CHECK so a bad
    // scheme reads as a sentence instead of a raw check_violation. The DB is
    // the control — uploads land on our own https CDN, so this only fires if
    // the hidden field is tampered with.
    if (!/^https:\/\//i.test(url)) {
      toast('That image link isn\u2019t secure (https). Upload the photo again.');
      return;
    }
    API.attachCreative(+form.getAttribute('data-booking'), url, headline || null).then(function (res) {
      var d = res && res.data;
      if ((res && res.error) || !d || d.ok !== true) {
        toast(d && d.reason === 'bad_status' ? 'That Spotlight window can no longer be changed.' : humanError(res && res.error));
        return;
      }
      toast('Submitted! We’ll review it shortly.');
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
        '<p class="mkt-example-note">It sits at the top of your contact card, right above &ldquo;Send a message&rdquo;: the first thing a visitor can tap.</p>'
      : '<div class="mkt-demo-sec">Showcase of the week</div>' +
        '<div class="mkt-demo-show">' +
          '<div class="mkt-demo-show-img">' + IMG_ICON + '<span>Your photo</span></div>' +
          '<div class="mkt-demo-show-t">Your headline: what’s new this week</div>' +
          '<div class="mkt-demo-show-b">A sentence or two about it. Add a photo and a link if you like.</div>' +
        '</div>' +
        '<p class="mkt-example-note">“Showcase of the week” is the section heading. Everything on the card is yours: the photo, the headline, the text.</p>';
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
          ? { txt: 'Live now · pinned', cls: 'live' }
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
      ? 'A button at the top of your contact card: a question, an invite, a link. You feed the list; we show a different one each week.'
      : 'A section at the top of your storefront for what’s new: a listing, an event, a favorite.';
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
      html += '<p class="mkt-note" style="margin:0 0 14px;">Nothing is visible right now. Turn one back on below.</p>';
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
          ? 'Rotating weekly: each visible entry shows in turn, changing every Monday.'
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
    // The edit form REPLACES the entry's [data-id] card, so it must carry the id itself or
    // Save resolves no id and inserts a duplicate (2026-10-19 bug review H4).
    return '<div class="mkt-form" data-kind="' + kind + '"' + (e && e.id ? ' data-id="' + e.id + '"' : '') + '>' +
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
          '<p class="mkt-note" style="margin-top:6px;">Landscape works best: about twice as wide as tall, at least 1200&thinsp;px wide. JPG or PNG; stored photos stay under 1&thinsp;MB (we compress automatically, so most are fine as-is).</p>'
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
      '<p>Lead your storefront with a rotating feature: this week’s listing, an open house, a seasonal special. Available on the Featured plan.</p>' +
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
      // #163 QR code downloads
      else if (act === 'post-png') self.downloadPost();
      else if (act === 'post-copy') { var capEl = document.getElementById('mkt-post-cap'); if (capEl) { var capTxt = capEl.textContent, capDone = function () { toast('Caption copied'); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(capTxt).then(capDone, function () { fallbackCopy(capTxt); capDone(); }); else { fallbackCopy(capTxt); capDone(); } } }
      else if (act === 'qr-png') self.downloadQr('png');
      else if (act === 'qr-svg') self.downloadQr('svg');
      else if (act === 'qr-badge-l') self.setQrBadge('l');
      else if (act === 'qr-badge-own') self.setQrBadge('own');
      // "Ask for a review" buttons
      else if (act === 'rv-copy-link') self.copyReviewLink();
      else if (act === 'rv-png') self.downloadReviewQr('png');
      else if (act === 'rv-svg') self.downloadReviewQr('svg');
      else if (act === 'rv-rotate') { self.rotateArmed = true; self.redrawReviewCard(); }
      else if (act === 'rv-rotate-no') { self.rotateArmed = false; self.redrawReviewCard(); }
      else if (act === 'rv-rotate-yes') self.rotateReviewLink(btn);
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
      toast('Links need to start with https:// (copy the full address from your browser).');
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
          toast('That photo is over 1 MB even after compression. Try a smaller or simpler image.');
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
  function upsellHtml() {
    return '<div class="mkt-card mkt-lock">' +
        '<span class="mkt-cta-demo">' + esc(CTA_EXAMPLE) + '</span>' +
        '<p class="mkt-lockh">Marketing tools</p>' +
        '<p>Rotate a weekly promo button and a Showcase of the week on your storefront. You feed the list, we keep it fresh. Available on paid plans.</p>' +
        '<a class="mkt-up" href="/pricing">See plans</a>' +
      '</div>';
  }
  function renderUpsell(mount) {
    mount.className = 'lok-mkt';
    mount.innerHTML = upsellHtml();
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
        else if (vendor.slug) new Page(mount, vendor, false, true);   // free: QR + review cards + teaser
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
