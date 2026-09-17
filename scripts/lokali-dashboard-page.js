/*
  Lokali — Vendor Dashboard page logic (/vendor-dashboard/dashboard)
  Hosted version of the former inline "dashboard-page-custom-code.html" block.
  Ships via jsDelivr from lokali-webflow-scripts (commit → tag → bump pin → purge),
  loaded with a single <script defer> tag on the dashboard page AFTER the
  sitewide bundle: lokali-api-client.js → lokali-clerk-auth.js → lokali-dashboard.js

  Replaces the TWO previous inline <script> blocks on the page (the
  listing-strength block and the LokaliDashboardPage block). The HTML Embed
  markup (data-listing-strength, element IDs) stays in the page — only the JS
  moved here.

  2026-09-17 DASHBOARD HOME REDESIGN (F-approved mockup, evidence-based UX):
   - Header: rotating greeting (time-of-day aware, first name when Meet the
     Vendor is filled, never the same line twice in a row) + Live/Not-public
     chip + plan chip + storefront URL, with 'Copy link' and 'View storefront'
     as the two header actions.
   - Four 7-day tiles (views w/ 14-day sparkline, leads w/ unread, payment taps,
     shares) each with a 'vs. week before' delta — lifetime totals moved off.
   - 'Your next step' (the shared window.LokaliCheckup, top item large + two
     runners-up) REPLACES the Listing-strength points card. Points retired:
     they never mapped to an outcome and the card went static at 100%.
   - 'What happened' feed: last 8 human events (inquiry, contact tap, payment
     tap, review) + the month's busiest day. Views themselves stay out.
   - Quick actions re-cut by frequency: Add a service / Add a product /
     Reply to leads / Share & QR kit. The Webflow share card is hidden; its two
     buttons stay in the DOM and drive the header 'Copy link'.
   - Milestones, referrals, home-screen card, celebration moments and the
     first-run wizard are unchanged, mounted after the quick actions.
   All script-side: the Webflow elements are mount points only.

  Fixes baked in:
   - services.getMine() returns {items:[...]}, products returns a bare array → coerce both (toArr).
   - vendors.me() returns {data:{vendor:{...}}} → unwrap once (no double-nesting).
   - Real vendor fields: business_description (bio), categories_id[], profile_photo.
   - Stat/heading text written with textContent (elements are H2/DIV, not inputs).
   - Top "Listing Strength" stat card mirrors the listing-strength card score.
   - Share / preview links use clean root URL golokali.com/{slug} (Cloudflare Worker
     routing); vendors without a slug yet fall back to /vendor?id={id}.
   - Share card buttons wired: #share-copy-link + #share-profile-btn.
   - Quick-action Link Blocks: #qa-services/#qa-products/#qa-settings (static hrefs
     in Webflow), #qa-preview href set here; services/products sub-lines show counts.
*/
(function () {

  function toArr(d) {
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.items)) return d.items;
    if (d && Array.isArray(d.data)) return d.data;
    return [];
  }
  function setId(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; }
  function setSel(sel, val) { var e = document.querySelector(sel); if (e) e.textContent = val; }

  var ORIGIN = 'https://www.golokali.com';
  // Clean root URL when the vendor has a slug (golokali.com/dreams-inc);
  // fall back to the legacy ?id= link only until their first profile save.
  function publicListingUrl(v) {
    return v.slug ? (ORIGIN + '/' + v.slug) : (ORIGIN + '/vendor?id=' + v.id);
  }

  // ── Clipboard ──────────────────────────────────────────────────────────────
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }
  // Briefly swap a label element's text to "Copied" then restore it.
  function flashCopied(labelEl) {
    if (!labelEl) return;
    if (labelEl.__restoreTimer) { clearTimeout(labelEl.__restoreTimer); }
    else { labelEl.__original = labelEl.textContent; }
    labelEl.textContent = 'Copied';
    labelEl.__restoreTimer = setTimeout(function () {
      labelEl.textContent = labelEl.__original;
      labelEl.__restoreTimer = null;
    }, 2000);
  }

  // ── Share card buttons ─────────────────────────────────────────────────────
  // The vendor's own Share & Grow link is routed through the Shares API so it
  // carries an opaque ?via= token — that makes landings via the vendor's shared
  // link trackable (Share & Grow "reach"). The token is stamped origin="vendor"
  // server-side (the vendor owns this listing), so it is excluded from the
  // public "shared by N neighbors" count. We mint once per browser session
  // (cached) and upgrade the buttons' URL in place, so a click always reads the
  // best URL available synchronously (no lost user-gesture for clipboard/share)
  // and falls back to the plain public URL if the Shares API is unavailable.
  function tokenizeShareUrl(v, ref) {
    if (!v || v.id == null) return;
    if (!(window.LokaliAPI && window.LokaliAPI.share && window.LokaliAPI.share.create)) return;
    var key = 'lokali_vshare_' + v.id;
    try {
      var cached = sessionStorage.getItem(key);
      if (cached) { ref.url = cached; return; }
    } catch (e) {}
    window.LokaliAPI.share.create(v.id, 'copy_link').then(function (res) {
      var url = res && res.data && res.data.share_url;
      if (!url) return;
      ref.url = url;
      try { sessionStorage.setItem(key, url); } catch (e) {}
    }).catch(function () {});
  }

  function wireShareButtons(v) {
    var ref = { url: publicListingUrl(v) };
    tokenizeShareUrl(v, ref);

    var copyBtn = document.getElementById('share-copy-link');
    if (copyBtn && !copyBtn.__wired) {
      copyBtn.__wired = true;
      copyBtn.addEventListener('click', function (e) {
        e.preventDefault();
        copyToClipboard(ref.url).then(function (ok) {
          if (ok) flashCopied(copyBtn.querySelector('.text-block-97') || copyBtn);
        });
      });
    }

    var shareBtn = document.getElementById('share-profile-btn');
    if (shareBtn && !shareBtn.__wired) {
      shareBtn.__wired = true;
      shareBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var data = { title: (v.business_name || 'My Lokali profile'), url: ref.url };
        if (navigator.share) { navigator.share(data).catch(function () {}); return; }
        // Desktop: no native share sheet → copy + show feedback so it doesn't feel dead.
        copyToClipboard(ref.url).then(function (ok) {
          if (ok) flashCopied(shareBtn.querySelector('.share') || shareBtn);
        });
      });
    }
  }

  // ── Quick-action cards ─────────────────────────────────────────────────────
  function setCardSub(cardId, text) {
    var card = document.getElementById(cardId);
    if (!card) return;
    var sub = card.querySelector('.text-block-100');
    if (sub) sub.textContent = text;
  }
  function wireQuickActions(v, services, products) {
    // The four cards are real Webflow Link Blocks now:
    //   #qa-services  → /vendor-dashboard/services   (static href in Webflow)
    //   #qa-products  → /vendor-dashboard/products    (static href in Webflow)
    //   #qa-settings  → /vendor-dashboard/settings    (static href in Webflow)
    //   #qa-preview   → public listing, set here because the URL needs the vendor id.
    var sCount = services.filter(function (s) { return !!s.is_active; }).length;
    var pCount = products.filter(function (p) { return !!p.is_active; }).length;
    setCardSub('qa-services', sCount + (sCount === 1 ? ' active service' : ' active services'));
    setCardSub('qa-products', pCount + (pCount === 1 ? ' active product' : ' active products'));

    var preview = document.getElementById('qa-preview');
    if (preview) {
      preview.setAttribute('href', publicListingUrl(v));
      preview.setAttribute('target', '_blank');
      preview.setAttribute('rel', 'noopener');
    }
  }


  // #90 publish gate — persistent "not public yet" banner INTEGRATED into the
  // Listing Strength card (decision: one place tied to the real gate, not a
  // second nag). Shows only while the storefront misses the minimum bar
  // (category + service area + >=1 live listing); disappears on its own once
  // everything's in. While not ready, the card ignores a saved dismiss.
  function renderGateBanner(root, gateReady, bits) {
    if (!root) return;
    var el = root.querySelector('[data-ls-gate]');
    // #147c (2026-09-10): the address no longer blocks publishing. A LIVE
    // storefront with no address on file gets a soft note in the same slot
    // instead of the hard "not public yet" banner.
    var soft = gateReady && bits.address === false;
    if (gateReady && !soft) { if (el) el.parentNode.removeChild(el); return; }
    var missing = [];
    if (!bits.name) missing.push('name your storefront'); // #101 — signup-path vendors start nameless
    if (!bits.cats) missing.push('pick your category');
    if (!bits.locs) missing.push('set your service area');
    if (!bits.listing) missing.push('add a service or product');
    var msg = soft
      ? 'Your storefront is live. One thing left: add your business address on your profile. It is never shown to customers; it lets us confirm you are local.'
      : 'Your storefront isn’t public yet. Customers can’t find it on The Market until you ' +
        (missing.length ? missing.join(' · ') : 'finish setup') + '.';
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('data-ls-gate', '');
      // Icon: Font Awesome Free 6.7.2 traffic-light (CC BY 4.0); was an emoji (F rule 2026-09-02).
      el.innerHTML = '<span style="display:inline-flex;line-height:1.4;padding-top:2px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:16px;height:16px;vertical-align:-.125em;flex-shrink:0;"><path d="M64 0C28.7 0 0 28.7 0 64L0 352c0 88.4 71.6 160 160 160s160-71.6 160-160l0-288c0-35.3-28.7-64-64-64L64 0zm96 416a48 48 0 1 1 0-96 48 48 0 1 1 0 96zm48-176a48 48 0 1 1 -96 0 48 48 0 1 1 96 0zm-48-80a48 48 0 1 1 0-96 48 48 0 1 1 0 96z"/></svg></span><span data-ls-gate-msg></span>';
      root.insertBefore(el, root.firstChild);
    }
    el.style.cssText = 'display:flex;align-items:flex-start;gap:10px;border-radius:12px;padding:12px 14px;margin:0 0 14px;' +
      "font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;line-height:1.5;" +
      (soft ? 'background:#F4F1FC;border:1px solid #DDD5F5;color:#4A3C7A;'
            : 'background:#FDF1E7;border:1px solid #F6D9BE;color:#8A4B14;');
    var m = el.querySelector('[data-ls-gate-msg]');
    if (m) m.textContent = msg;
    // The gate outranks a saved dismiss — a hidden card can't warn anyone.
    root.style.display = '';
  }

  // ── Home layout helpers (2026-09-17 redesign) ───────────────────────────
  var HOME_CSS = [
    '#lok-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:6px 0 18px;font-family:"Plus Jakarta Sans",-apple-system,sans-serif;}',
    '#lok-hd .lok-hd-sub{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:#4A4761;line-height:1.5;}',
    '#lok-hd .lok-hd-url{font-weight:600;color:#1A1829;}',
    '.lok-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;border-radius:100px;padding:3px 10px;line-height:1.5;white-space:nowrap;}',
    '.lok-chip.live{background:#EAFAF2;color:#1D6A45;}',
    '.lok-chip.live i{width:7px;height:7px;border-radius:50%;background:#1D6A45;display:inline-block;}',
    '.lok-chip.off{background:#FDECEC;color:#A32D2D;}',
    '.lok-chip.paused{background:#EEEDF6;color:#4A4761;}',
    '.lok-chip.plan{background:#FFF1E3;color:#9a4d00;}',
    '.lok-chip.plan.free{background:#EEEDF6;color:#4A4761;}',
    '#lok-hd .lok-btns{display:flex;gap:8px;flex-wrap:wrap;}',
    '.lok-btn{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:8px 14px;border-radius:9px;font-size:13px;font-weight:700;text-decoration:none;border:1px solid #E5D4FD;background:#fff;color:#6002EE;font-family:inherit;cursor:pointer;line-height:1.2;}',
    '.lok-btn:hover{background:#F3EBFF;}',
    '.lok-btn.primary{background:#6002EE;color:#fff;border-color:#6002EE;}',
    '.lok-btn.primary:hover{opacity:.92;background:#6002EE;}',
    '.lok-btn svg{width:14px;height:14px;flex-shrink:0;}',
    '.lok-btn:focus-visible,.quick-actions-card:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
    '.lok-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px;font-family:"Plus Jakarta Sans",-apple-system,sans-serif;}',
    '.lok-kpi{background:#fff;border:.5px solid #EEEDF6;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;min-width:0;}',
    '.lok-klabel{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#8E8BA6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.5;}',
    '.lok-krow{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;}',
    '.lok-kvalue{font-size:28px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:#1A1829;margin:0;}',
    '.lok-spark{width:84px;height:28px;flex-shrink:0;}',
    '.lok-delta{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;border-radius:100px;padding:2px 8px;width:fit-content;line-height:1.5;}',
    '.lok-delta.up{color:#1D6A45;background:#EAFAF2;}',
    '.lok-delta.down{color:#A32D2D;background:#FDECEC;}',
    '.lok-delta.flat{color:#8E8BA6;background:#EEEDF6;}',
    '.lok-delta.new{color:#6002EE;background:#F3EBFF;}',
    '.lok-kdetail{font-size:11.5px;color:#6E6A85;line-height:1.5;}',
    '#lok-cols{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin:0 0 16px;align-items:start;}',
    '.lok-card{background:#fff;border:.5px solid #EEEDF6;border-radius:12px;padding:16px 18px;min-width:0;font-family:"Plus Jakarta Sans",-apple-system,sans-serif;}',
    '.lok-card.accent{border-color:#E5D4FD;}',
    '.lok-ct{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}',
    '.lok-ct h3{font-size:13.5px;font-weight:700;margin:0;color:#1A1829;line-height:1.4;}',
    '.lok-ct a{font-size:12px;font-weight:600;text-decoration:none;color:#6002EE;}',
    '.lok-pill{font-size:11px;font-weight:700;border-radius:100px;padding:3px 10px;background:#F3EBFF;color:#6002EE;white-space:nowrap;line-height:1.5;}',
    '.lok-pill.ok{background:#EAFAF2;color:#1D6A45;}',
    '.lok-next{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;padding:12px;border-radius:10px;background:#F3EBFF;}',
    '.lok-next .n{width:28px;height:28px;border-radius:50%;background:#6002EE;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;}',
    '.lok-next .t{font-size:14px;font-weight:700;margin:0;color:#1A1829;line-height:1.4;}',
    '.lok-next .w{font-size:12.5px;color:#4A4761;margin:2px 0 8px;max-width:52ch;line-height:1.5;}',
    '.lok-next .lok-btn{min-height:34px;padding:6px 12px;font-size:12.5px;}',
    '.lok-meter{height:5px;background:#EEEDF6;border-radius:100px;overflow:hidden;margin:12px 0 6px;}',
    '.lok-meter>div{height:100%;background:#6002EE;border-radius:100px;}',
    '.lok-meter.ok>div{background:#1D6A45;}',
    '.lok-mline{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:#6E6A85;line-height:1.5;}',
    '.lok-mline a{text-decoration:none;font-weight:600;color:#6002EE;white-space:nowrap;}',
    '.lok-also{list-style:none;margin:10px 0 0;padding:0;font-size:12.5px;color:#4A4761;}',
    '.lok-also li{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:.5px solid #EEEDF6;line-height:1.5;}',
    '.lok-also li svg{width:14px;height:14px;color:#8E8BA6;flex-shrink:0;}',
    '.lok-also li a{margin-left:auto;text-decoration:none;font-weight:600;font-size:12px;white-space:nowrap;color:#6002EE;min-height:32px;display:inline-flex;align-items:center;}',
    '.lok-ns-done{font-size:12.5px;color:#4A4761;line-height:1.55;}',
    '.lok-feed{list-style:none;margin:0;padding:0;}',
    '.lok-feed li{display:grid;grid-template-columns:26px 1fr auto;gap:10px;align-items:start;padding:9px 0;border-bottom:.5px solid #EEEDF6;font-size:12.5px;line-height:1.5;}',
    '.lok-feed li:last-child{border-bottom:none;}',
    '.lok-feed li:first-child{padding-top:0;}',
    '.lok-fi{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
    '.lok-fi svg{width:13px;height:13px;}',
    '.lok-fi.lead{background:#F3EBFF;color:#6002EE;}',
    '.lok-fi.view{background:#EEEDF6;color:#4A4761;}',
    '.lok-fi.pay{background:#FFF1E3;color:#9a4d00;}',
    '.lok-fi.review{background:#EAFAF2;color:#1D6A45;}',
    '.lok-ft{margin:0;color:#1A1829;}',
    '.lok-ft b{font-weight:700;}',
    '.lok-ft .m{color:#6E6A85;}',
    '.lok-fw{font-size:11px;color:#8E8BA6;white-space:nowrap;font-variant-numeric:tabular-nums;padding-top:2px;}',
    '.lok-feed-empty{font-size:12.5px;color:#4A4761;background:#F7F6FC;border-radius:10px;padding:12px 14px;line-height:1.55;}',
    '#lokali-share-teaser{margin-top:12px;}',
    // Webflow's .quick-actions-card is a 2-col grid with a 45px .large-icon carrying a 20px
    // left margin; our icon tile had neither, so it sat on the card edge (F, phone screenshot
    // 2026-09-17). Flex row with real padding at every width.
    '.quick-actions-card{display:flex!important;align-items:center;gap:12px;padding:12px 14px!important;min-height:60px;grid-template-columns:none!important;}',
    '.lok-qa-ic{width:34px;height:34px;border-radius:10px;background:#F3EBFF;color:#6002EE;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin:0;}',
    '.lok-qa-ic svg{width:15px;height:15px;}',
    '.quick-actions-card .div-block-171{min-width:0;}',
    '@media(max-width:900px){.lok-kpis{grid-template-columns:1fr 1fr;}#lok-cols{grid-template-columns:1fr;}}',
    '@media(max-width:480px){.lok-kpis{grid-template-columns:1fr;}.lok-btn{min-height:44px;}.lok-also li a{min-height:44px;}}'
  ].join('');
  function injectHomeStyles() {
    if (document.getElementById('lok-home-css')) return;
    var st = document.createElement('style'); st.id = 'lok-home-css'; st.textContent = HOME_CSS;
    document.head.appendChild(st);
  }
  function esc(str) { return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function tsOf(v) { if (v == null) return 0; if (typeof v === 'number') return v; var n = Number(v); if (!isNaN(n) && String(v).trim() !== '') return n; n = Date.parse(v); return isNaN(n) ? 0 : n; }
  var DAY = 86400000;
  function countIn(rows, from, to) { var now = Date.now(); return (rows || []).filter(function (r) { var d = now - tsOf(r.created_at); return d >= from && d < to; }).length; }

  // Font Awesome Free 6.7.2 (CC BY 4.0) inline paths. F rule: icons, never emoji.
  var ICO = {
    circle: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M464 256A208 208 0 1 0 48 256a208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z"/></svg>',
    copy: '<svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16h140.1l52 52V320c0 8.8-7.2 16-16 16zM192 384h192c35.3 0 64-28.7 64-64V100.1c0-12.7-5.1-24.9-14.1-33.9L400.1 34.1c-9-9-21.2-14.1-33.9-14.1H192c-35.3 0-64 28.7-64 64V320c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64V448c0 35.3 28.7 64 64 64H256c35.3 0 64-28.7 64-64V416H272v32c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192c0-8.8 7.2-16 16-16H96V128H64z"/></svg>',
    ext: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"/></svg>',
    plus: '<svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32V224H48c-17.7 0-32 14.3-32 32s14.3 32 32 32H192V432c0 17.7 14.3 32 32 32s32-14.3 32-32V288H400c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z"/></svg>',
    mail: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M64 112c-8.8 0-16 7.2-16 16v22.1L220.5 291.7c20.7 17 50.4 17 71.1 0L464 150.1V128c0-8.8-7.2-16-16-16H64zM48 212.2V384c0 8.8 7.2 16 16 16H448c8.8 0 16-7.2 16-16V212.2L322 328.8c-38.4 31.5-93.7 31.5-132 0L48 212.2zM0 128C0 92.7 28.7 64 64 64H448c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128z"/></svg>',
    qr: '<svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M0 80C0 53.5 21.5 32 48 32h96c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V80zM64 96v64h64V96H64zM0 336c0-26.5 21.5-48 48-48h96c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V336zm64 16v64h64V352H64zM304 32h96c26.5 0 48 21.5 48 48v96c0 26.5-21.5 48-48 48H304c-26.5 0-48-21.5-48-48V80c0-26.5 21.5-48 48-48zm80 64H320v64h64V96zM256 304c0-8.8 7.2-16 16-16h64c8.8 0 16 7.2 16 16s7.2 16 16 16h32c8.8 0 16-7.2 16-16s7.2-16 16-16s16 7.2 16 16v96c0 8.8-7.2 16-16 16H368c-8.8 0-16-7.2-16-16s-7.2-16-16-16s-16 7.2-16 16v64c0 8.8-7.2 16-16 16H272c-8.8 0-16-7.2-16-16V304zM368 480a16 16 0 1 1 0-32 16 16 0 1 1 0 32zm64 0a16 16 0 1 1 0-32 16 16 0 1 1 0 32z"/></svg>',
    pay: '<svg viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M64 32C28.7 32 0 60.7 0 96v32H576V96c0-35.3-28.7-64-64-64H64zM576 224H0V416c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V224zM112 352h64c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16s7.2-16 16-16zm112 16c0-8.8 7.2-16 16-16H368c8.8 0 16 7.2 16 16s-7.2 16-16 16H240c-8.8 0-16-7.2-16-16z"/></svg>',
    eye: '<svg viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M288 32c-80.8 0-145.5 36.8-192.6 80.6C48.6 156 17.3 208 2.5 243.7c-3.3 7.9-3.3 16.7 0 24.6C17.3 304 48.6 356 95.4 399.4C142.5 443.2 207.2 480 288 480s145.5-36.8 192.6-80.6c46.8-43.5 78.1-95.4 93-131.1c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C433.5 68.8 368.8 32 288 32zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64c0 35.3-28.7 64-64 64c-7.1 0-13.9-1.2-20.3-3.3c-5.5-1.8-11.9 1.6-11.7 7.4c.3 6.9 1.3 13.8 3.2 20.7c13.7 51.2 66.4 81.6 117.6 67.9s81.6-66.4 67.9-117.6c-11.1-41.5-47.8-69.4-88.6-71.1c-5.8-.2-9.2 6.1-7.4 11.7c2.1 6.4 3.3 13.2 3.3 20.3z"/></svg>',
    star: '<svg viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>',
    phone: '<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z"/></svg>'
  };

  // ── Greeting: rotates every load, time-of-day aware, never repeats the
  // previous line (F 2026-09-17: "like Claude does it"). Greets the PERSON
  // when Meet the Vendor has a first name, else the business.
  var GREETINGS = ['Welcome back', 'Good to see you', 'Nice to have you back', 'Hello again', 'Back at it', 'Ready when you are', 'Let’s see what’s new', 'Glad you’re here', 'Hi there', 'Look who’s back',
    'Good to have you here', 'There you are', 'Welcome in', 'Hey', 'Happy to see you', 'Right on time', 'Let’s get to it', 'Welcome home', 'Good things ahead', 'Off we go'];
  var GREET_KEY = 'lokali_greet_last';
  function pickGreeting() {
    var h = new Date().getHours();
    var tod = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    var pool = GREETINGS.concat([tod, tod, tod]); // time-of-day line wins about a quarter of loads
    var last = ''; try { last = localStorage.getItem(GREET_KEY) || ''; } catch (e) {}
    var pick = pool[Math.floor(Math.random() * pool.length)];
    for (var i = 0; i < 6 && pick === last; i++) pick = pool[Math.floor(Math.random() * pool.length)];
    try { localStorage.setItem(GREET_KEY, pick); } catch (e) {}
    return pick;
  }
  function renderGreeting(v) {
    var h1 = document.querySelector('.heading-17');
    if (h1) h1.textContent = pickGreeting() + ', ';
    var first = String(v.owner_name || '').trim().split(/\s+/)[0];
    setId('vendor-name', first || v.business_name || 'friend');
  }

  // ── Header: status chips + the two actions ──────────────────────────────
  function renderHeader(v, billing, gateReady) {
    var greet = document.querySelector('.div-block-40');
    if (!greet || !greet.parentNode) return;
    var sub = document.querySelector('.text-block-95'); if (sub) sub.style.display = 'none';
    var hd = document.getElementById('lok-hd');
    if (!hd) { hd = el('div'); hd.id = 'lok-hd'; greet.parentNode.insertBefore(hd, greet.nextSibling); }
    var url = v.slug ? ('golokali.com/' + v.slug) : ('golokali.com/vendor?id=' + v.id);
    var status = v.is_active === false
      ? '<span class="lok-chip paused">Paused</span>'
      : (gateReady ? '<span class="lok-chip live"><i></i>Live</span>' : '<span class="lok-chip off">Not public yet</span>');
    var planName = (billing && billing.subscription && billing.subscription.plan_name) || 'Free';
    var isFree = !billing || !billing.plan || billing.plan === 'free';
    var plan = '<span class="lok-chip plan' + (isFree ? ' free' : '') + '">' + esc(isFree ? 'Free plan' : planName) + '</span>';
    hd.innerHTML =
      '<div class="lok-hd-sub">' + status + plan + '<span class="lok-hd-url">' + esc(url) + '</span></div>' +
      '<div class="lok-btns">' +
        '<button type="button" class="lok-btn" data-hd-copy>' + ICO.copy + '<span>Copy link</span></button>' +
        '<a class="lok-btn primary" href="' + esc(publicListingUrl(v)) + '" target="_blank" rel="noopener">View storefront' + ICO.ext + '</a>' +
      '</div>';
    var copy = hd.querySelector('[data-hd-copy]');
    copy.addEventListener('click', function () {
      // The hidden Webflow 'Copy link' anchor carries the tokenized ?via= URL
      // (wireShareButtons), so clicking it keeps share attribution intact.
      var hidden = document.getElementById('share-copy-link');
      if (hidden && hidden.__wired) hidden.click();
      else copyToClipboard('https://www.' + url);
      flashCopied(copy.querySelector('span'));
    });
  }

  // ── Tiles: last 7 days with a comparison; views carry a 14-day sparkline ──
  function sparkline(views) {
    var now = Date.now(), buckets = [], i, max = 0;
    for (i = 0; i < 14; i++) buckets.push(0);
    (views || []).forEach(function (r) {
      var d = Math.floor((now - tsOf(r.created_at)) / DAY);
      if (d >= 0 && d < 14) buckets[13 - d]++;
    });
    buckets.forEach(function (n) { if (n > max) max = n; });
    var W = 84, H = 28, step = W / 13, pts = buckets.map(function (n, k) {
      var y = max ? (H - 3) - (n / max) * (H - 6) : H - 3;
      return (k * step).toFixed(1) + ',' + y.toFixed(1);
    });
    var prev = pts.slice(0, 8).join(' '), cur = pts.slice(7).join(' '), last = pts[13].split(',');
    return '<svg class="lok-spark" viewBox="0 0 84 28" role="img" aria-label="Views over the last 14 days">' +
      '<polyline fill="none" stroke="#E5D4FD" stroke-width="2" points="' + prev + '"/>' +
      '<polyline fill="none" stroke="#6002EE" stroke-width="2" stroke-linecap="round" points="' + cur + '"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.5" fill="#6002EE"/></svg>';
  }
  function deltaChip(cur, prev) {
    if (cur === prev) return '<span class="lok-delta flat">' + (cur === 0 ? 'none yet' : 'same as week before') + '</span>';
    if (cur > prev) return '<span class="lok-delta up">↑ ' + (cur - prev) + ' vs. week before</span>';
    return '<span class="lok-delta down">↓ ' + (prev - cur) + ' vs. week before</span>';
  }
  function tile(label, valueId, value, extra, chip, detail) {
    return '<div class="lok-kpi"><div class="lok-klabel">' + label + '</div>' +
      '<div class="lok-krow"><h2 class="lok-kvalue"' + (valueId ? ' id="' + valueId + '"' : '') + '>' + value + '</h2>' + (extra || '') + '</div>' +
      chip + '<div class="lok-kdetail">' + detail + '</div></div>';
  }
  function renderTiles(leadsData, shares) {
    var box = document.querySelector('.div-block-41');
    if (!box) return;
    var L = leadsData || {};
    var views = L.views || [], inq = L.inquiries || [], con = L.contacts || [], pay = L.payment_clicks || [];
    var W7 = 7 * DAY;
    var v7 = countIn(views, 0, W7), vPrev = countIn(views, W7, 2 * W7);
    var l7 = countIn(inq, 0, W7) + countIn(con, 0, W7), lPrev = countIn(inq, W7, 2 * W7) + countIn(con, W7, 2 * W7);
    var p7 = countIn(pay, 0, W7), pPrev = countIn(pay, W7, 2 * W7);
    var unread = (L.totals && L.totals.unread) || 0;
    var sh = shares && shares.ok ? shares : null;
    var landings = sh ? (Number(sh.landings) || 0) : 0, sharers = sh ? (Number(sh.unique_sharers) || 0) : 0;
    box.className = 'lok-kpis';
    box.innerHTML =
      tile('Views · last 7 days', 'stat-profile-views', v7, sparkline(views), deltaChip(v7, vPrev), 'Storefront and listing opens') +
      tile('Leads · last 7 days', 'stat-profile-complete', l7, '',
        unread ? '<span class="lok-delta new">' + unread + ' unread</span>' : deltaChip(l7, lPrev), 'Inquiries and contact taps') +
      tile('Payment taps · last 7 days', 'stat-active-products', p7, '', deltaChip(p7, pPrev), 'Venmo, Cash App, PayPal, Buy') +
      tile('Shared link · all time', null, landings, '',
        '<span class="lok-delta ' + (sharers ? 'up' : 'flat') + '">' + (sharers ? sharers + (sharers === 1 ? ' neighbor shared it' : ' neighbors shared it') : 'not shared yet') + '</span>',
        'People who opened a link someone shared');
  }

  // ── Your next step: the shared checkup, top item large ──────────────────
  function nextStepCard(v, hasListing, ck) {
    var root = document.querySelector('[data-listing-strength]');
    if (!root) return null;
    root.className = 'lok-card accent';
    root.style.cssText = '';
    var open = ck.open || [], done = ck.done || [], total = ck.total || 0;
    var html = '<div class="lok-ct"><h3>Your next step</h3>' +
      (open.length ? '<span class="lok-pill">' + open.length + ' to do</span>' : '<span class="lok-pill ok">All in place</span>') + '</div>';
    if (open.length) {
      var f = open[0];
      html += '<div class="lok-next"><div class="n">1</div><div>' +
        '<p class="t">' + esc(f.title) + '</p><p class="w">' + esc(f.why) + '</p>' +
        '<a class="lok-btn" href="' + esc(f.href) + '">' + esc(f.action) + ' →</a></div></div>';
    } else {
      html += '<div class="lok-ns-done">Your storefront has everything shoppers look for. Fresh photos and a new listing now and then keep it that way.</div>';
    }
    if (total) {
      html += '<div class="lok-meter' + (open.length ? '' : ' ok') + '" role="img" aria-label="' + done.length + ' of ' + total + ' in place"><div style="width:' + Math.round(done.length / total * 100) + '%"></div></div>' +
        '<div class="lok-mline"><span>' + done.length + ' of ' + total + ' things shoppers look for are in place</span><a href="/vendor-dashboard/analytics">Full checkup →</a></div>';
    }
    if (open.length > 1) {
      html += '<ul class="lok-also">' + open.slice(1, 3).map(function (it) {
        return '<li>' + ICO.circle + '<span>' + esc(it.title) + '</span><a href="' + esc(it.href) + '">' + esc(it.action) + ' →</a></li>';
      }).join('') + '</ul>';
    }
    root.innerHTML = html;
    // #90 publish gate: the 'not public yet' / soft address note rides on top.
    var gCats = !!(v.categories_id && v.categories_id.length);
    var gLocs = !!(v.locations_id && v.locations_id.length);
    var gAddr = !!(v.address && String(v.address).trim());
    var gateReady = (v.is_publish_ready != null) ? !!v.is_publish_ready
                    : (!!v.business_name && gCats && gLocs && !!hasListing);
    renderGateBanner(root, gateReady, { name: !!v.business_name, cats: gCats, locs: gLocs, listing: !!hasListing, address: gAddr });
    return gateReady;
  }

  // ── What happened: the last 8 human events + the month's busiest day ────
  var CONTACT_VERB = { call: 'tapped Call', sms: 'tapped Text', whatsapp: 'tapped WhatsApp', email: 'tapped Email', instagram: 'opened your Instagram', website: 'opened your website' };
  var PAY_VERB = { venmo: 'tapped your Venmo', cashapp: 'tapped your Cash App', paypal: 'tapped your PayPal', zelle: 'copied your Zelle', buy_link: 'clicked Buy on a product', other_pay: 'tapped your pay link' };
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function whenLabel(t) {
    var now = Date.now(), d = now - t;
    if (d < 60000) return 'just now';
    if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
    if (d < DAY) return Math.floor(d / 3600000) + 'h ago';
    var a = new Date(now), b = new Date(t);
    var days = Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / DAY);
    if (days <= 1) return 'Yesterday';
    if (days < 7) return DOW3[b.getDay()];
    return MON3[b.getMonth()] + ' ' + b.getDate();
  }
  function buildFeed(leadsData, reviews) {
    var L = leadsData || {}, items = [];
    (L.inquiries || []).forEach(function (r) { var t = tsOf(r.created_at); if (t) items.push({ t: t, kind: 'lead', ico: ICO.mail, html: '<b>New inquiry</b> came in' }); });
    (L.contacts || []).forEach(function (r) { var t = tsOf(r.created_at); if (t) items.push({ t: t, kind: 'lead', ico: ICO.phone, html: '<b>Someone ' + esc(CONTACT_VERB[r.event_type] || 'reached out') + '</b>' }); });
    (L.payment_clicks || []).forEach(function (r) { var t = tsOf(r.created_at); if (t) items.push({ t: t, kind: 'pay', ico: ICO.pay, html: '<b>Someone ' + esc(PAY_VERB[r.event_type] || 'tapped a pay link') + '</b>' }); });
    (reviews || []).forEach(function (r) {
      var t = tsOf(r.created_at); if (!t) return;
      var who = r.author_name ? esc(String(r.author_name).split(' ')[0]) : 'A customer';
      var rating = Number(r.rating);
      items.push({ t: t, kind: 'review', ico: ICO.star, html: '<b>' + who + ' left a review</b>' + (rating > 0 ? ' <span class="m">· ' + rating + (rating === 1 ? ' star' : ' stars') + '</span>' : '') });
    });
    // Busiest day of the last 30 days (needs at least 3 views to be a story).
    var byDay = {}, best = null, now = Date.now();
    (L.views || []).forEach(function (r) {
      var t = tsOf(r.created_at); if (!t || now - t > 30 * DAY) return;
      var d = new Date(t), k = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      byDay[k] = byDay[k] || { n: 0, t: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime() };
      byDay[k].n++;
      if (!best || byDay[k].n > best.n) best = byDay[k];
    });
    if (best && best.n >= 3) items.push({ t: best.t, kind: 'view', ico: ICO.eye, html: '<b>Busiest day this month</b> <span class="m">· ' + best.n + ' views on ' + DOW[new Date(best.t).getDay()] + '</span>' });
    items.sort(function (a, b) { return b.t - a.t; });
    return items.slice(0, 8);
  }
  function renderFeed(leadsData, reviews, gateReady, paidPlan) {
    var strength = document.querySelector('[data-listing-strength]');
    var host = strength && strength.parentNode; // Webflow's .div-block-182 embed wrapper
    if (!host || !host.parentNode) return;
    var cols = document.getElementById('lok-cols');
    if (!cols) {
      cols = el('div'); cols.id = 'lok-cols';
      host.parentNode.insertBefore(cols, host);
      cols.appendChild(host);
      host.style.margin = '0';
    }
    var card = document.getElementById('lok-feed-card');
    if (!card) { card = el('div', 'lok-card'); card.id = 'lok-feed-card'; cols.appendChild(card); }
    var items = buildFeed(leadsData, reviews);
    var html = '<div class="lok-ct"><h3>What happened</h3><a href="/vendor-dashboard/leads">All leads →</a></div>';
    if (items.length) {
      html += '<ul class="lok-feed">' + items.map(function (it) {
        return '<li><span class="lok-fi ' + it.kind + '">' + it.ico + '</span><p class="lok-ft">' + it.html + '</p><span class="lok-fw">' + whenLabel(it.t) + '</span></li>';
      }).join('') + '</ul>';
    } else {
      html += '<div class="lok-feed-empty">' + (gateReady
        ? 'Nothing yet, and that is normal early on. Inquiries, contact taps, payment taps and reviews show up here as they happen. Sharing your link with ten people you already know is the fastest way to see the first one.'
        : 'Once your storefront is live, inquiries, contact taps, payment taps and reviews show up here as they happen.') + '</div>';
    }
    card.innerHTML = html;
    // The Free-tier share teaser (lokali-share.js) used to sit in the share
    // card; keep its mount alive under the feed so the nudge still renders.
    // lokali-share.js gates it with isPaidTier(vendor row), and the vendor row
    // carries no plan field, so PAID vendors saw 'Upgrade to Pro' too (latent
    // since the card existed; F's Featured account, 2026-09-17). Plan truth is
    // billing: on a paid plan the mount is removed, so nothing can render into it.
    var teaser = document.getElementById('lokali-share-teaser');
    if (teaser) {
      if (paidPlan) teaser.parentNode.removeChild(teaser);
      else card.appendChild(teaser);
    }
  }

  // ── Quick actions: re-cut by how often a vendor actually does them ───────
  function qaCard(id, href, ico, label, sub) {
    var a = document.getElementById(id); if (!a) return;
    a.setAttribute('href', href); a.removeAttribute('target'); a.removeAttribute('rel');
    var img = a.querySelector('img'); if (img) img.style.display = 'none';
    if (!a.querySelector('.lok-qa-ic')) a.insertBefore(el('span', 'lok-qa-ic', ico), a.firstChild);
    var l = a.querySelector('.text-block-99'); if (l) l.textContent = label;
    var s2 = a.querySelector('.text-block-100'); if (s2) s2.textContent = sub;
  }
  function renderQuickActions(services, products, leadsData) {
    var sCount = services.filter(function (s) { return !!s.is_active; }).length;
    var pCount = products.filter(function (p) { return !!p.is_active; }).length;
    var unread = (leadsData && leadsData.totals && leadsData.totals.unread) || 0;
    qaCard('qa-services', '/vendor-dashboard/services', ICO.plus, 'Add a service', sCount + (sCount === 1 ? ' active service' : ' active services'));
    qaCard('qa-products', '/vendor-dashboard/products', ICO.plus, 'Add a product', pCount + (pCount === 1 ? ' active product' : ' active products'));
    qaCard('qa-settings', '/vendor-dashboard/leads', ICO.mail, 'Reply to leads', unread ? unread + ' unread' : 'Nothing waiting');
    qaCard('qa-preview', '/vendor-dashboard/marketing', ICO.qr, 'Share & QR kit', 'Link, caption, printable code');
    var share = document.querySelector('.div-block-43'); if (share) share.style.display = 'none';
  }
  // Where the standing cards (milestones, referrals, home-screen) mount now:
  // after the quick actions, so the first screen holds status / tiles /
  // next step / feed. Celebration moments still ride above the two columns.
  function homeBottomAnchor() {
    return document.querySelector('.div-block-168') || document.getElementById('lok-cols') || document.querySelector('[data-listing-strength]');
  }
  function homeTopAnchor() {
    return document.getElementById('lok-cols') || document.querySelector('[data-listing-strength]');
  }

  // ── Vendor gamification: milestones + referrals ────────────────────────────
  // Data: LokaliSupabaseAPI.vendorGamification (patch_vendor_gamification.sql).
  // Best-effort everywhere: if the RPCs/table aren't live yet (SQL-before-tag
  // window) or the client is an older cached copy, the dashboard renders
  // exactly as before — these cards simply don't mount.
  var GAM_CSS = [
    '.lok-gam-card{font-family:"Plus Jakarta Sans",-apple-system,sans-serif;background:#fff;border:.5px solid #EEEDF6;border-radius:12px;padding:1.5rem;margin:0 0 16px;color:#1A1829;}',
    '.lok-gam-eyebrow{font-size:11px;font-weight:700;color:#6002EE;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;}',
    '.lok-gam-title{font-size:17px;font-weight:700;letter-spacing:-.2px;}',
    '.lok-gam-sub{font-size:13px;color:#4A4761;margin-top:4px;line-height:1.5;}',
    '.lok-gam-list{margin-top:1.25rem;padding-top:.25rem;border-top:.5px solid #EEEDF6;}',
    '.lok-gam-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:.5px solid #EEEDF6;}',
    '.lok-gam-row:last-child{border-bottom:none;padding-bottom:2px;}',
    '.lok-gam-check{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;}',
    '.lok-gam-check.done{background:#F3EBFF;color:#6002EE;}',
    '.lok-gam-check.todo{border:1.5px dashed #C8C6D8;}',
    // line-height 1.5 throughout — these inherit the page's 26px line-height,
    // which reads far too airy on 11.5-13px text (Francesca 2026-08-13).
    '.lok-gam-name{font-size:13px;font-weight:500;line-height:1.5;}',
    '.lok-gam-row.upcoming .lok-gam-name{color:#8E8BA6;font-weight:400;}',
    '.lok-gam-detail{font-size:11.5px;color:#8E8BA6;margin-top:1px;line-height:1.5;}',
    '.lok-gam-date{font-size:11.5px;color:#8E8BA6;flex-shrink:0;text-align:right;min-width:52px;line-height:1.5;}',
    '.lok-gam-pill{font-size:10.5px;font-weight:700;border-radius:100px;padding:2px 8px;flex-shrink:0;white-space:nowrap;}',
    '.lok-gam-pill.green{background:#EAFAF2;color:#1D6A45;}',
    '.lok-gam-pill.grey{background:#EEEDF6;color:#8E8BA6;}',
    '.lok-gam-cb{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;font-weight:700;border-radius:100px;padding:4px 12px;background:#FFF0E6;color:#B4530A;}',
    '.lok-gam-moment{font-family:"Plus Jakarta Sans",-apple-system,sans-serif;background:linear-gradient(135deg,#F3EBFF 0%,#fff 65%);border:.5px solid #E5D4FD;border-radius:12px;padding:1.5rem;margin:0 0 16px;display:flex;gap:14px;align-items:flex-start;color:#1A1829;}',
    '.lok-gam-moment-ico{width:44px;height:44px;border-radius:50%;flex-shrink:0;background:#6002EE;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(96,2,238,.25);}',
    '.lok-gam-moment-title{font-size:16px;font-weight:700;}',
    '.lok-gam-moment-sub{font-size:13px;color:#4A4761;margin-top:4px;line-height:1.5;}',
    '.lok-gam-actions{display:flex;gap:8px;margin-top:12px;}',
    '.lok-gam-btn{font-family:inherit;font-size:12.5px;font-weight:600;color:#fff;background:#6002EE;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;text-decoration:none;display:inline-block;}',
    '.lok-gam-btn:hover{opacity:.9;}',
    '.lok-gam-ghost{font-family:inherit;font-size:12.5px;font-weight:500;color:#8E8BA6;background:none;border:none;padding:8px 10px;cursor:pointer;}',
    '.lok-gam-ghost:hover{color:#4A4761;}',
    '.lok-gam-linkbox{display:flex;align-items:center;gap:10px;background:#F7F6FC;border:.5px solid #EEEDF6;border-radius:8px;padding:10px 12px;margin-top:1.25rem;}',
    '.lok-gam-linktext{flex:1;font-size:12.5px;color:#4A4761;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.lok-gam-copy{font-family:inherit;font-size:12px;font-weight:600;color:#6002EE;background:#fff;border:.5px solid #E5D4FD;border-radius:8px;padding:6px 14px;flex-shrink:0;cursor:pointer;}',
    '.lok-gam-copy:hover{background:#F3EBFF;}',
    '.lok-gam-incentive{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:#4A4761;line-height:1.5;}',
    '.lok-gam-incentive svg{color:#1D6A45;flex-shrink:0;}',
    // Share-your-profile card polish (Francesca 2026-08-13): the Webflow
    // "Copy link" pill carried a stray 20px left margin (misaligned with the
    // Share Profile button below it), and the Share button was oversized —
    // 12px+5px double padding stacking to a 60px-tall button with 14px text
    // next to the pill's 12px. Align edges, one text size, slimmer button.
    '#share-copy-link{margin-left:0 !important;font-size:13px;line-height:1.5;}',
    '#share-copy-link .text-block-97{font-size:13px;line-height:1.5;}',
    '#share-profile-btn{padding:9px 16px !important;align-items:center;}',
    '#share-profile-btn .share{font-size:13px;line-height:1.5;padding:5px 0 5px 4px;}'
  ].join('');

  var GAM_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  // Fixed set of five (handoff §4 — names verbatim). `moment` = celebration
  // card copy; the first-inquiry strings are the handoff's exact copy block.
  var GAM_MILESTONES = [
    { key: 'first_save', name: 'First save', locked: 'Unlocks when a shopper saves your listing',
      done: 'A shopper saved your listing',
      moment: { title: 'Someone saved your listing', sub: 'Your first save is in! A shopper bookmarked your storefront to come back to. Saves often turn into inquiries.', cta: null } },
    { key: 'first_inquiry', name: 'First inquiry', locked: 'Unlocks when a customer reaches out',
      done: 'A customer reached out about your services',
      moment: { title: 'Someone just found you', sub: 'Your first inquiry is in! A reply within a day makes a great first impression.', cta: { label: 'View inquiry', href: '/vendor-dashboard/leads' } } },
    { key: 'first_100_views', name: 'First 100 views', locked: 'Unlocks when your listing reaches 100 views',
      done: 'Your listing reached 100 views',
      moment: { title: '100 views and counting', sub: 'Your listing just passed 100 views. Shoppers are finding you.', cta: null } },
    { key: 'first_review', name: 'First review', locked: 'Unlocks when a customer reviews you',
      done: 'A customer reviewed your business',
      moment: { title: 'Your first review is in', sub: 'A customer took the time to write about your business. That’s the kind of proof no ad can buy.', cta: null } },
    { key: 'first_share', name: 'First customer share', locked: 'Unlocks when someone shares your listing',
      done: 'A customer shared your listing',
      moment: { title: 'Someone passed your name along', sub: 'A customer liked your storefront enough to share it. Word of mouth is officially working.', cta: null } }
  ];

  function gamStyles() {
    if (document.getElementById('lok-gam-styles')) return;
    var s = document.createElement('style'); s.id = 'lok-gam-styles'; s.textContent = GAM_CSS;
    document.head.appendChild(s);
  }
  function gamDate(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function gamEsc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Claim a stashed ?ref= code (lokali-auth-nav.js wrote it on the landing
  // page). All validation is server-side; the stash is cleared only once the
  // RPC actually answers, so a pre-SQL 404 retries on a later visit.
  function gamClaimReferral(SB) {
    var raw = null;
    try { raw = localStorage.getItem('lokali_vendor_ref'); } catch (e) {}
    if (!raw) return Promise.resolve();
    var stash = null;
    try { stash = JSON.parse(raw); } catch (e) {}
    if (!stash || !stash.code || (stash.exp && stash.exp < Date.now())) {
      try { localStorage.removeItem('lokali_vendor_ref'); } catch (e) {}
      return Promise.resolve();
    }
    return SB.vendorGamification.claimReferral(stash.code).then(function (res) {
      if (res && !res.error) {
        try { localStorage.removeItem('lokali_vendor_ref'); } catch (e) {}
      }
    }).catch(function () {});
  }

  function gamCelebration(earned) {
    // Newest undismissed milestone reached within 7 days — one card max.
    var DAY7 = 7 * 24 * 60 * 60 * 1000;
    var pick = null;
    earned.forEach(function (m) {
      if (m.dismissed_at) return;
      var t = Date.parse(m.reached_at);
      if (isNaN(t) || (Date.now() - t) > DAY7) return;
      if (!pick || t > Date.parse(pick.reached_at)) pick = m;
    });
    if (!pick) return null;
    var meta = null;
    GAM_MILESTONES.forEach(function (d) { if (d.key === pick.milestone) meta = d; });
    if (!meta) return null;

    var card = document.createElement('div');
    card.className = 'lok-gam-moment';
    card.innerHTML =
      '<div class="lok-gam-moment-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>' +
      '<div><div class="lok-gam-moment-title">' + gamEsc(meta.moment.title) + '</div>' +
      '<div class="lok-gam-moment-sub">' + gamEsc(meta.moment.sub) + '</div>' +
      '<div class="lok-gam-actions">' +
        (meta.moment.cta ? '<a class="lok-gam-btn" href="' + meta.moment.cta.href + '">' + gamEsc(meta.moment.cta.label) + '</a>' : '') +
        '<button type="button" class="lok-gam-ghost" data-gam-dismiss>Dismiss</button>' +
      '</div></div>';
    card.querySelector('[data-gam-dismiss]').addEventListener('click', function () {
      if (card.parentNode) card.parentNode.removeChild(card);
      var SB = window.LokaliSupabaseAPI;
      if (SB && SB.vendorGamification) SB.vendorGamification.dismissMilestone(pick.milestone);
    });
    return card;
  }

  function gamMilestonesCard(rows) {
    var byKey = {};
    (rows || []).forEach(function (m) { byKey[m.milestone] = m; });
    var earnedCount = 0;
    GAM_MILESTONES.forEach(function (d) { if (byKey[d.key]) earnedCount++; });

    var COUNT_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five'];
    var sub = earnedCount === 5
      ? 'Five for five: every early milestone, reached. These are yours to see.'
      : earnedCount === 0
        ? 'Every business starts at zero. These unlock as customers find you. Only you can see them.'
        : COUNT_WORDS[earnedCount] + ' down. These are yours to see, a record of your business taking root on Lokali.';

    var card = document.createElement('div');
    card.className = 'lok-gam-card';
    var html =
      '<div class="lok-gam-eyebrow">Your journey</div>' +
      '<div class="lok-gam-title">Milestones</div>' +
      '<div class="lok-gam-sub">' + sub + '</div>' +
      '<div class="lok-gam-list">';
    GAM_MILESTONES.forEach(function (d) {
      var m = byKey[d.key];
      html +=
        '<div class="lok-gam-row' + (m ? '' : ' upcoming') + '">' +
          '<div class="lok-gam-check ' + (m ? 'done' : 'todo') + '">' + (m ? GAM_CHECK : '') + '</div>' +
          '<div style="flex:1;min-width:0;"><div class="lok-gam-name">' + d.name + '</div>' +
          '<div class="lok-gam-detail">' + (m ? d.done : d.locked) + '</div></div>' +
          '<div class="lok-gam-date">' + (m ? gamDate(m.reached_at) : '') + '</div>' +
        '</div>';
    });
    html += '</div>';
    card.innerHTML = html;
    return card;
  }

  function gamReferralCard(data) {
    var refs = (data && data.referrals) || [];
    var n = refs.length;
    var m = (data && data.months_earned) || 0;
    var url = data && data.referral_url;
    if (!url) return null;
    var shownUrl = url.replace(/^https?:\/\/(www\.)?/, '');

    var sub;
    if (n >= 3) {
      sub = n + ' neighbors and counting. You’re a Community Builder. The neighborhood is bigger because of you.';
    } else if (n > 0) {
      sub = (n === 1 ? '1 neighbor has' : n + ' neighbors have') + ' joined through your link, ' +
            (m === 1 ? '1 free month' : m + ' free months') + ' earned so far.';
    } else {
      sub = 'Know another local business that belongs on Lokali? Send them your link. Founding slots are limited.';
    }

    var card = document.createElement('div');
    card.className = 'lok-gam-card';
    var html =
      '<div class="lok-gam-eyebrow">Grow the neighborhood</div>' +
      '<div class="lok-gam-title">Bring your neighbors</div>' +
      '<div class="lok-gam-sub">' + gamEsc(sub) + '</div>' +
      // Community Builder recognition at 3+ — peach house, matching the
      // badges-guide treatment.
      (n >= 3
        ? '<div><span class="lok-gam-cb"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Community Builder</span></div>'
        : '') +
      '<div class="lok-gam-linkbox"><div class="lok-gam-linktext">' + gamEsc(shownUrl) + '</div>' +
        '<button type="button" class="lok-gam-copy" data-gam-copy>Copy link</button></div>' +
      '<div class="lok-gam-incentive">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg>' +
        '<span>You get <strong>1 month free</strong> for each neighbor who joins a paid plan, up to 12 months a year.</span></div>';
    if (n > 0) {
      html += '<div class="lok-gam-list">';
      refs.forEach(function (r) {
        var paid = !!r.is_paid;
        var planLabel = (r.plan === 'featured' ? 'Featured' : r.plan === 'pro' ? 'Pro' : 'Free') + ' plan';
        html +=
          '<div class="lok-gam-row">' +
            '<div class="lok-gam-check done">' + GAM_CHECK + '</div>' +
            '<div class="lok-gam-name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + gamEsc(r.business_name || 'A neighbor') + '</div>' +
            '<div class="lok-gam-pill ' + (paid ? 'green' : 'grey') + '">' + planLabel + '</div>' +
            '<div class="lok-gam-date">' + gamDate(r.created_at) + '</div>' +
          '</div>';
      });
      html += '</div>';
    }
    card.innerHTML = html;
    card.querySelector('[data-gam-copy]').addEventListener('click', function () {
      var btn = card.querySelector('[data-gam-copy]');
      copyToClipboard(url).then(function (ok) { if (ok) flashCopied(btn); });
    });
    return card;
  }

  function renderGamification() {
    var SB = window.LokaliSupabaseAPI;
    if (!SB || !SB.vendorGamification) return;
    var anchor = homeBottomAnchor(), top = homeTopAnchor();
    if (!anchor || !anchor.parentNode) return;
    if (document.querySelector('[data-gam-mounted]')) return;

    gamClaimReferral(SB).then(function () {
      return Promise.all([
        SB.vendorGamification.milestones(),
        SB.vendorGamification.referralData()
      ]);
    }).then(function (res) {
      var msRes = res[0], refRes = res[1];
      gamStyles();
      var wrap = document.createElement('div');
      wrap.setAttribute('data-gam-mounted', '');

      var rows = (msRes && !msRes.error && msRes.data) || null;
      if (rows) {
        var moment = gamCelebration(rows);
        // Celebration rides ABOVE the listing-strength card; the two standing
        // cards mount together right after it.
        if (moment && top && top.parentNode) top.parentNode.insertBefore(moment, top);
        wrap.appendChild(gamMilestonesCard(rows));
      }
      var refData = refRes && !refRes.error && refRes.data;
      if (refData && refData.ok) {
        var refCard = gamReferralCard(refData);
        if (refCard) wrap.appendChild(refCard);
      }
      if (wrap.children.length) {
        anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
      }
    }).catch(function () {});
  }

  // ── Add Lokali to your home screen (F 2026-09-13: "people keep asking if I
  // have an app"). The site is installable (manifest + pass-through service
  // worker served by the Cloudflare Worker, head tags in Site Settings); this
  // card tells phone users how to install it. Mounts on the dashboard home
  // only, right after the listing-strength card, and only when:
  //   - the device has a coarse pointer (a phone or tablet, not a laptop);
  //   - the page is NOT already running from the home screen;
  //   - the vendor has not dismissed it in the last 30 days.
  // iOS: step copy (Share, then Add to Home Screen; Safari and Chrome 16.4+).
  // Android/Chrome: the card waits for the browser's beforeinstallprompt and
  // renders a one-tap "Add to home screen" button; browsers that never fire
  // it (Firefox, Samsung Internet) get no card rather than a guess.
  var A2HS_KEY = 'lokali_a2hs_dismissed';
  var A2HS_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
  var a2hsPrompt = null;
  var a2hsMounted = false;
  try {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      a2hsPrompt = e;
      renderHomeScreenCard();
    });
    window.addEventListener('appinstalled', function () {
      var c = document.querySelector('[data-a2hs]');
      if (c && c.parentNode) c.parentNode.removeChild(c);
      try { localStorage.setItem(A2HS_KEY, String(Date.now())); } catch (err) {}
    });
  } catch (err) {}

  function a2hsStandalone() {
    try {
      if (window.navigator.standalone === true) return true;
      return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) { return false; }
  }
  function a2hsSnoozed() {
    try {
      var t = parseInt(localStorage.getItem(A2HS_KEY) || '0', 10);
      return t && (Date.now() - t) < A2HS_SNOOZE_MS;
    } catch (e) { return false; }
  }
  function a2hsDismiss() {
    try { localStorage.setItem(A2HS_KEY, String(Date.now())); } catch (e) {}
    var c = document.querySelector('[data-a2hs]');
    if (c && c.parentNode) c.parentNode.removeChild(c);
  }
  // Font Awesome Free 6.7.2 (CC BY 4.0) inline SVGs, F rule: no emoji in UI.
  var A2HS_ICO_PHONE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:20px;height:20px;"><path d="M16 64C16 28.7 44.7 0 80 0L304 0c35.3 0 64 28.7 64 64l0 384c0 35.3-28.7 64-64 64L80 512c-35.3 0-64-28.7-64-64L16 64zM224 448a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM304 64L80 64l0 320 224 0 0-320z"/></svg>';
  var A2HS_ICO_SHARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:13px;height:13px;vertical-align:-2px;margin:0 2px;"><path d="M246.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 109.3 192 320c0 17.7 14.3 32 32 32s32-14.3 32-32l0-210.7 73.4 73.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-128-128zM64 352c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 64c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 64c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-64z"/></svg>';

  function renderHomeScreenCard() {
    if (a2hsMounted) return;
    var anchor = homeBottomAnchor();
    if (!anchor || !anchor.parentNode) return;
    if (a2hsStandalone() || a2hsSnoozed()) return;
    var coarse = false;
    try { coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) {}
    if (!coarse) return;
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS && !a2hsPrompt) return; // Android: wait for beforeinstallprompt (re-called from the listener)

    gamStyles();
    a2hsMounted = true;
    var card = document.createElement('div');
    card.className = 'lok-gam-moment';
    card.setAttribute('data-a2hs', '');
    card.style.position = 'relative';
    var body;
    if (isIOS) {
      body = '<div class="lok-gam-sub" style="margin-top:8px;">Tap the Share button ' + A2HS_ICO_SHARE +
        ' at the bottom of the screen, then choose <strong style="font-weight:700;color:#1A1829;">Add to Home Screen</strong>.</div>';
    } else {
      body = '<div class="lok-gam-actions" style="flex-wrap:wrap;"><button type="button" class="lok-gam-btn" data-a2hs-install style="white-space:nowrap;">Add to home screen</button>' +
        '<button type="button" class="lok-gam-ghost" data-a2hs-later style="white-space:nowrap;">Not now</button></div>';
    }
    card.innerHTML =
      '<button type="button" data-a2hs-close aria-label="Dismiss" style="position:absolute;top:10px;right:10px;width:32px;height:32px;border:none;background:none;color:#8E8BA6;font-size:18px;line-height:1;cursor:pointer;font-family:inherit;">✕</button>' +
      '<div class="lok-gam-moment-ico">' + A2HS_ICO_PHONE + '</div>' +
      '<div style="min-width:0;padding-right:28px;">' +
        '<div class="lok-gam-moment-title">Add Lokali to your home screen</div>' +
        '<div class="lok-gam-moment-sub">Open your dashboard in one tap, full screen, no browser bar. Same account, nothing to download.</div>' +
        body +
      '</div>';
    card.querySelector('[data-a2hs-close]').addEventListener('click', a2hsDismiss);
    var later = card.querySelector('[data-a2hs-later]');
    if (later) later.addEventListener('click', a2hsDismiss);
    var install = card.querySelector('[data-a2hs-install]');
    if (install) install.addEventListener('click', function () {
      if (!a2hsPrompt) return a2hsDismiss();
      var p = a2hsPrompt; a2hsPrompt = null;
      try {
        p.prompt();
        if (p.userChoice) p.userChoice.then(function (r) {
          if (r && r.outcome === 'accepted') a2hsDismiss();
          else install.style.display = 'none'; // the prompt can only be shown once
        }).catch(function () {});
      } catch (e) { a2hsDismiss(); }
    });
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
  }

  function render(v, services, products, leadsData, x) {
    x = x || {};
    var hasListing = services.length > 0 || products.length > 0;
    injectHomeStyles();
    renderGreeting(v);

    // Preview + share links (the share card is hidden; the header 'Copy link' clicks through).
    var previewBtn = document.getElementById('btn-preview-listing');
    if (previewBtn) previewBtn.href = v.slug ? ('/' + v.slug) : ('/vendor?id=' + v.id);
    wireShareButtons(v);

    var ck = (typeof window.LokaliCheckup === 'function')
      ? window.LokaliCheckup(v, services, products, x.photos, x.cfg, x.billing)
      : { items: [], open: [], done: [], total: 0, paidPlan: false };
    var gateReady = nextStepCard(v, hasListing, ck);
    if (gateReady == null) gateReady = !!v.is_publish_ready;
    renderHeader(v, x.billing, gateReady);
    renderTiles(leadsData, x.shares);
    renderFeed(leadsData, x.reviews, gateReady, !!(x.billing && x.billing.plan && x.billing.plan !== 'free'));
    renderQuickActions(services, products, leadsData);

    // Milestones + referral cards + home-screen card (best-effort; mount after the quick actions now)
    renderGamification();
    renderHomeScreenCard();
  }

  // ── #90 first-run setup wizard ─────────────────────────────────────────────
  // Fires ONCE, right after admin_open_storefront lands the vendor here
  // (lokali-account.js sets the sessionStorage flag before navigating). Never
  // re-appears on later logins — the persistent nudge is the Listing-Strength
  // gate banner, not this modal. Steps: category → service area → first
  // listing CTA. Every step is skippable (with the won't-go-live warning
  // shown at the step), and the whole wizard closes on ✕.
  var WZ_FLAG = 'lokali_sf_wizard';
  var WZ_SEEN = 'lokali_sf_wizard_seen'; // #101 — once per browsing session for the nameless auto-run

  function maybeRunWizard(v) {
    var flagged = false, seen = false;
    try {
      flagged = sessionStorage.getItem(WZ_FLAG) === '1';
      seen = sessionStorage.getItem(WZ_SEEN) === '1';
    } catch (e) {}
    if (!v) return;
    if (v.is_publish_ready === true) return; // already live somehow — nothing to set up
    // #101 — a vendor-intent SIGNUP lands here directly (no /account card, so
    // no flag) with a nameless storefront; that state can only mean first
    // arrival, so onboard them too (the wizard leads with the name step).
    // Session-gated so ✕ isn't re-nagged on every dashboard nav — the
    // persistent nudge stays the Listing-Strength gate banner.
    if (!flagged && (v.business_name || seen)) return;
    // Don't burn the one-shot flags if the wizard's deps aren't up yet
    // (runSetupWizard bails silently on them) — consume them only once we
    // know the wizard will actually run.
    var SB = window.LokaliSupabaseAPI;
    if (!window.LokaliAPI || !SB || !SB.vendors || !SB.vendors.updateProfile) return;
    try {
      if (flagged) sessionStorage.removeItem(WZ_FLAG);
      sessionStorage.setItem(WZ_SEEN, '1');
    } catch (e) {}
    runSetupWizard(v);
  }

  function runSetupWizard(v) {
    var A = window.LokaliAPI;
    var SB = window.LokaliSupabaseAPI; // partial updates (updateMe would blank unset fields)
    if (!A || !SB || !SB.vendors || !SB.vendors.updateProfile) return;

    var wrap = document.createElement('div');
    wrap.setAttribute('data-sf-wizard', '');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(35,29,63,.45);padding:20px;';
    var card = document.createElement('div');
    card.style.cssText = "font-family:'Plus Jakarta Sans',sans-serif;background:#fff;max-width:480px;" +
      'width:100%;border-radius:20px;padding:28px 26px 24px;position:relative;color:#3b3654;' +
      'box-shadow:0 18px 60px rgba(35,29,63,.25);max-height:86vh;overflow:auto;';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'lok-wz-title');
    wrap.appendChild(card);

    var steps = [];
    var stepIdx = 0;
    var opener = document.activeElement; // restore focus here on close

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    // Escape closes; Tab is contained within the dialog (aria-modal promise).
    function onWzKeydown(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      var f = card.querySelectorAll('button, a[href], input');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function close() {
      document.removeEventListener('keydown', onWzKeydown);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      try { if (opener && opener.focus) opener.focus(); } catch (e) {}
    }
    function next() { stepIdx++; if (stepIdx >= steps.length) close(); else steps[stepIdx](); }

    function shell(title, sub, bodyHtml, opts) {
      opts = opts || {};
      card.innerHTML =
        '<button data-wz-x aria-label="Close" style="position:absolute;top:14px;right:14px;background:none;' +
          'border:none;cursor:pointer;font-size:18px;color:#9A9AB0;line-height:1;">✕</button>' +
        '<div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#6E3CFF;margin-bottom:6px;">' +
          'STEP ' + (stepIdx + 1) + ' OF ' + steps.length + '</div>' +
        '<h3 id="lok-wz-title" style="font-size:21px;font-weight:800;color:#231d3f;margin:0 0 6px;font-family:inherit;">' + title + '</h3>' +
        '<p style="font-size:14px;line-height:1.55;margin:0 0 16px;">' + sub + '</p>' +
        '<div data-wz-body>' + bodyHtml + '</div>' +
        '<div data-wz-err aria-live="polite" style="display:none;color:#C05621;font-size:13px;margin-top:10px;"></div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;gap:12px;">' +
          '<div style="font-size:12.5px;line-height:1.45;color:#9A9AB0;max-width:55%;">' +
            'You can skip, but your storefront <strong style="color:#8A4B14;">won’t go live</strong> until this is set.</div>' +
          '<div style="display:flex;align-items:center;gap:14px;white-space:nowrap;">' +
            '<button type="button" data-wz-skip style="background:none;border:none;padding:0;cursor:pointer;' +
              'font-family:inherit;font-size:14px;color:#9A9AB0;text-decoration:underline;">Skip for now</button>' +
            (opts.noContinue ? '' :
              '<button data-wz-next style="background:#6E3CFF;color:#fff;border:none;cursor:pointer;font-family:inherit;' +
              'font-weight:700;font-size:14px;padding:10px 22px;border-radius:999px;">Continue</button>') +
          '</div>' +
        '</div>';
      card.querySelector('[data-wz-x]').addEventListener('click', close);
      card.querySelector('[data-wz-skip]').addEventListener('click', next);
      // Focus follows each swapped-in step (the innerHTML reset drops it to body).
      var fc = card.querySelector('[data-wz-body] input') || card.querySelector('[data-wz-body] a[href]') ||
               card.querySelector('[data-wz-next]') || card.querySelector('[data-wz-skip]');
      setTimeout(function () { try { fc.focus(); } catch (e) {} }, 0);
      return card.querySelector('[data-wz-body]');
    }
    function showErr(msg) {
      var e = card.querySelector('[data-wz-err]');
      if (e) { e.textContent = msg; e.style.display = ''; }
    }
    function pillList(body, items, idKey, nameKey, multi) {
      var sel = {};
      var box = document.createElement('div');
      box.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
      items.forEach(function (it) {
        var id = it[idKey], name = it[nameKey] || ('#' + id);
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = name;
        b.setAttribute('aria-pressed', 'false'); // selected state isn't color-only
        b.style.cssText = 'font-family:inherit;font-size:14px;padding:8px 16px;border-radius:999px;cursor:pointer;' +
          'border:1.5px solid #E4DCF7;background:#FAF7FF;color:#3b3654;';
        b.addEventListener('click', function () {
          if (!multi) { sel = {}; box.querySelectorAll('button').forEach(function (o) {
            o.style.background = '#FAF7FF'; o.style.borderColor = '#E4DCF7'; o.style.color = '#3b3654';
            o.setAttribute('aria-pressed', 'false'); }); }
          var on = !sel[id];
          sel[id] = on;
          if (!on) delete sel[id];
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.style.background = on ? '#6E3CFF' : '#FAF7FF';
          b.style.borderColor = on ? '#6E3CFF' : '#E4DCF7';
          b.style.color = on ? '#fff' : '#3b3654';
        });
        box.appendChild(b);
      });
      body.appendChild(box);
      return function () { return Object.keys(sel).map(Number); };
    }
    // Lookup failed/empty: the step body used to clear to a blank box (or hang
    // on "Loading…" with a dead Continue). Inline message + retry; the footer
    // Skip stays live, so the step is never a dead end.
    function stepLoadFail(body, what, retryFn) {
      body.innerHTML = '';
      var m = document.createElement('div');
      m.style.cssText = 'font-size:14px;line-height:1.5;color:#8A4B14;background:#FDF1E7;' +
        'border:1px solid #F6D9BE;border-radius:12px;padding:12px 14px;';
      m.textContent = 'Couldn’t load ' + what + '. Try again, or use Skip for now and set this later on your profile page.';
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Try again';
      b.style.cssText = 'font-family:inherit;font-weight:700;font-size:14px;color:#fff;background:#6E3CFF;' +
        'border:none;border-radius:999px;padding:10px 20px;cursor:pointer;margin-top:10px;';
      b.addEventListener('click', retryFn);
      body.appendChild(m);
      body.appendChild(b);
    }

    // Step: business name (#101) — only for storefronts created straight from
    // a vendor-intent signup: the /account upgrade card collects the name
    // before the dashboard is ever reached, but the signup path lands here
    // nameless, and nothing else on the dashboard can set it.
    if (!v.business_name) steps.push(function () {
      var body = shell("What's your business called?",
        'This is the name customers see on The Market.',
        '<input data-wz-name type="text" maxlength="120" placeholder="e.g. Hazel &amp; Fern Handmade" ' +
          'style="font-family:inherit;font-size:15px;color:#3b3654;background:#FAF7FF;border:1.5px solid #E4DCF7;' +
          'border-radius:12px;padding:11px 14px;width:100%;box-sizing:border-box;">');
      var input = body.querySelector('[data-wz-name]');
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      card.querySelector('[data-wz-next]').addEventListener('click', function () {
        var name = (input.value || '').trim();
        if (!name) { showErr('Enter a name (or use Skip for now).'); return; }
        SB.vendors.updateProfile(v.id, { business_name: name }).then(function (res) {
          if (res && res.error) { showErr('Could not save. Try again.'); return; }
          v.business_name = name;
          setId('vendor-name', name); // heading was 'Vendor' until now
          next();
        });
      });
    });

    // Step: category (single pick — more can be added on the profile page later)
    if (!(v.categories_id && v.categories_id.length)) steps.push(function () {
      var body = shell('What do you do?', 'Pick the category that fits your business best.', '<div data-wz-load>Loading categories…</div>');
      var getSel = null;
      // Bound before the fetch so Continue always answers, even mid-load.
      card.querySelector('[data-wz-next]').addEventListener('click', function () {
        var ids = getSel ? getSel() : [];
        if (!ids.length) { showErr('Pick a category (or use Skip for now).'); return; }
        SB.vendors.updateProfile(v.id, { categories_id: ids }).then(function (res) {
          if (res && res.error) { showErr('Could not save. Try again.'); return; }
          next();
        });
      });
      function loadCats() {
        body.innerHTML = '<div>Loading categories…</div>';
        (A.data && A.data.categories ? A.data.categories() : Promise.resolve({ data: [] })).then(function (r) {
          var items = (r && !r.error && r.data) || [];
          if (items.items) items = items.items;
          if (!items.length) { stepLoadFail(body, 'categories', loadCats); return; }
          body.innerHTML = '';
          getSel = pillList(body, items, 'id', 'category_name', false);
        }, function () { stepLoadFail(body, 'categories', loadCats); });
      }
      loadCats();
    });

    // Step: service area (multi pick — a vendor can serve several communities)
    if (!(v.locations_id && v.locations_id.length)) steps.push(function () {
      var body = shell('Where do you serve?', 'Choose your community: pick every area you serve.', '<div>Loading areas…</div>');
      var getSel = null;
      // Bound before the fetch so Continue always answers, even mid-load.
      card.querySelector('[data-wz-next]').addEventListener('click', function () {
        var ids = getSel ? getSel() : [];
        if (!ids.length) { showErr('Pick at least one area (or use Skip for now).'); return; }
        SB.vendors.updateProfile(v.id, { locations_id: ids }).then(function (res) {
          if (res && res.error) { showErr('Could not save. Try again.'); return; }
          next();
        });
      });
      function loadAreas() {
        body.innerHTML = '<div>Loading areas…</div>';
        (A.data && A.data.locations ? A.data.locations() : Promise.resolve({ data: [] })).then(function (r) {
          var items = (r && !r.error && r.data) || [];
          if (items.items) items = items.items;
          if (!items.length) { stepLoadFail(body, 'areas', loadAreas); return; }
          body.innerHTML = '';
          getSel = pillList(body, items, 'id', 'location_name', true);
        }, function () { stepLoadFail(body, 'areas', loadAreas); });
      }
      loadAreas();
    });

    // Step: first listing — out-and-back CTA into the real add-service/product
    // forms (decision: reuse them rather than duplicate a mini-form here).
    steps.push(function () {
      shell('Add your first service or product',
        'This is what customers can actually book or buy. Your storefront goes live the moment one is up.',
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
          '<a href="/vendor-dashboard/services" style="flex:1;min-width:150px;text-align:center;background:#6E3CFF;color:#fff;' +
            'font-weight:700;font-size:14px;padding:12px 18px;border-radius:12px;text-decoration:none;font-family:inherit;">Add a service</a>' +
          '<a href="/vendor-dashboard/products" style="flex:1;min-width:150px;text-align:center;background:#FDF1E7;color:#8A4B14;' +
            'border:1.5px solid #F6D9BE;font-weight:700;font-size:14px;padding:12px 18px;border-radius:12px;text-decoration:none;font-family:inherit;">Add a product</a>' +
        '</div>', { noContinue: true });
    });

    if (!steps.length) return;
    document.body.appendChild(wrap);
    document.addEventListener('keydown', onWzKeydown);
    steps[0]();
  }

  // Load-failure card: after the retry budget is spent the page used to sit on
  // the static Webflow placeholders with no hint anything failed. Inline card
  // with a Retry button, mounted above the listing-strength card.
  function showLoadError() {
    var box = document.querySelector('[data-dash-load-err]');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-dash-load-err', '');
      box.setAttribute('role', 'alert');
      box.style.cssText = "font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;" +
        'flex-wrap:wrap;gap:12px;background:#FDF1E7;border:1px solid #F6D9BE;border-radius:12px;' +
        'padding:14px 16px;margin:0 0 16px;font-size:14px;line-height:1.5;color:#8A4B14;';
      box.innerHTML = '<span style="flex:1;min-width:200px;">We couldn’t load your dashboard. ' +
        'Check your connection and try again.</span>' +
        '<button type="button" data-dash-load-retry style="font-family:inherit;font-weight:700;font-size:14px;' +
        'color:#fff;background:#6002EE;border:none;border-radius:999px;padding:10px 22px;cursor:pointer;min-height:44px;">Retry</button>';
      var anchor = document.querySelector('[data-listing-strength]');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
      else document.body.insertBefore(box, document.body.firstChild);
      box.querySelector('[data-dash-load-retry]').addEventListener('click', function () {
        box.style.display = 'none';
        _initRetries = 0;
        init();
      });
    }
    box.style.display = 'flex';
  }
  function hideLoadError() {
    var box = document.querySelector('[data-dash-load-err]');
    if (box) box.style.display = 'none';
  }

  function init() {
    if (!window.LokaliDashboard || !window.LokaliDashboard.requireAuth()) return;


    if (!(window.LokaliAPI && window.LokaliAPI.vendors)) { setTimeout(init, 300); return; }

    Promise.all([
      window.LokaliAPI.vendors.me(),
      window.LokaliAPI.services.getMine(false),
      window.LokaliAPI.products.getMine(false),
      // Leads for the "Leads this month" stat card — same endpoint the
      // analytics page uses, so the two numbers always agree. Best-effort.
      (window.LokaliAPI.leads && window.LokaliAPI.leads.analytics)
        ? window.LokaliAPI.leads.analytics().catch(function () { return null; })
        : Promise.resolve(null)
    ]).then(function (r) {
      var vendorRes = r[0];
      if (vendorRes.error || !vendorRes.data) {
        // Only a genuine auth failure goes to /login. Transient errors (rate
        // limits, cold starts, network blips) retry instead
        // — bouncing a signed-in vendor to /login on a 429 looked like a
        // forced logout.
        if (vendorRes.status === 401 || vendorRes.status === 403) {
          window.location.href = '/login';
          return;
        }
        if (_initRetries < 2) {
          _initRetries++;
          setTimeout(init, 4000 * _initRetries);
          return;
        }
        showLoadError(); // retry budget spent — never fail silent
        return;
      }
      hideLoadError();
      var v = vendorRes.data.vendor || vendorRes.data;
      var leadsRes = r[3];
      var leadsData = leadsRes && !leadsRes.error ? (leadsRes.data != null ? leadsRes.data : leadsRes) : null;
      var services = toArr(r[1].data), products = toArr(r[2].data);
      // Home extras, every one best-effort: plan (chip + checkup gating),
      // portfolio photos + booking config (checkup), share count (tile),
      // public reviews (feed). A miss degrades that one element, never the page.
      var A = window.LokaliAPI, S = window.LokaliSupabaseAPI;
      function soft(p) { return (p && p.then ? p : Promise.resolve(null)).catch(function () { return null; }); }
      function data(res) { return res && !res.error ? (res.data != null ? res.data : res) : null; }
      return Promise.all([
        soft(A.plans && A.plans.getMyBilling ? A.plans.getMyBilling() : null),
        soft(S && S.photos && S.photos.list ? S.photos.list('vendor', v.id) : null),
        soft(S && S.availability && S.availability.getConfig ? S.availability.getConfig(v.id) : null),
        soft(A.share && A.share.count ? A.share.count(v.id) : null),
        soft(A.reviews && A.reviews.forVendor ? A.reviews.forVendor(v.id) : null)
      ]).then(function (x) {
        render(v, services, products, leadsData, {
          billing: data(x[0]),
          photos: toArr(data(x[1])),
          cfg: data(x[2]),
          shares: data(x[3]),
          reviews: toArr(data(x[4]))
        });
        maybeRunWizard(v); // #90 first-run setup wizard (one-shot, flag-gated)
      });
    }).catch(function () {
      // Hard rejection (thrown error anywhere in the chain) — same budget + card.
      if (_initRetries < 2) {
        _initRetries++;
        setTimeout(init, 4000 * _initRetries);
        return;
      }
      showLoadError();
    });
  }

  var _initRetries = 0;
  try { window.LokaliHome = { buildFeed: buildFeed, sparkline: sparkline, deltaChip: deltaChip, whenLabel: whenLabel, pickGreeting: pickGreeting }; } catch (e) {}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
