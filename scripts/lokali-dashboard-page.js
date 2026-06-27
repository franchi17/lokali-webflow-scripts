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

  Fixes baked in:
   - services.getMine() returns {items:[...]}, products returns a bare array → coerce both (toArr).
   - vendors.me() returns {data:{vendor:{...}}} → unwrap once (no double-nesting).
   - Real Xano vendor fields: business_description (bio), categories_id[], profile_photo.
   - Stat/heading text written with textContent (elements are H2/DIV, not inputs).
   - Top "Listing Strength" stat card mirrors the listing-strength card score.
   - Share / preview links use clean root URL golokali.com/{slug} (Cloudflare Worker
     routing); vendors without a slug yet fall back to /vendor?id={id}.
   - Share card buttons wired: #share-copy-link + #share-profile-btn.
   - Quick-action Link Blocks: #qa-services/#qa-products/#qa-settings (static hrefs
     in Webflow), #qa-preview href set here; services/products sub-lines show counts.
*/
(function () {
  var DISMISS_KEY = 'lokali_ls_dismissed';
  var MAX_SCORE = 85;

  function toArr(d) {
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.items)) return d.items;
    if (d && Array.isArray(d.data)) return d.data;
    return [];
  }
  function setId(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; }
  function setSel(sel, val) { var e = document.querySelector(sel); if (e) e.textContent = val; }
  function isDismissed() { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; } }

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

  // Self-heal the listing-strength card. Webflow HTML Embeds can mangle pasted
  // markup (a stray `<div<` truncates the whole card). If the card container
  // exists but its inner markup is missing/broken, rebuild it here so the embed
  // only needs the empty container (or even a broken one — we overwrite it).
  var LS_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  function lsItem(id, title, desc, pts) {
    return '<div class="ls-item" data-ls-item="' + id + '">' +
      '<div class="ls-check">' + LS_CHECK + '</div>' +
      '<div class="ls-item-body"><div class="ls-item-title">' + title + '</div>' +
      (desc ? '<div class="ls-item-desc">' + desc + '</div>' : '') + '</div>' +
      '<div class="ls-points">+' + pts + ' pts</div></div>';
  }
  function ensureCardMarkup() {
    var card = document.querySelector('[data-listing-strength]');
    if (!card) return;
    if (card.querySelector('[data-ls-item]')) return; // markup intact
    card.innerHTML =
      '<button class="ls-dismiss" data-ls-dismiss aria-label="Dismiss"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '<div class="ls-header"><div class="ls-header-left"><h3 class="ls-title">Your listing strength</h3><p class="ls-subtitle" data-ls-subtitle></p></div><div class="ls-score-value" data-ls-score></div></div>' +
      '<div class="ls-progress-track"><div class="ls-progress-fill" data-ls-progress></div></div>' +
      '<div class="ls-checklist" data-ls-checklist>' +
        lsItem('business_name', 'Business name added', '', 10) +
        lsItem('category', 'Category selected', '', 10) +
        lsItem('profile_photo', 'Add a profile photo', 'Vendors with photos get 3× more contacts', 15) +
        lsItem('bio', 'Write a bio <span style="color:#9A9AB0;font-weight:500;">(80+ characters)</span>', 'Your story is what makes a customer choose you over a directory', 20) +
        lsItem('tagline', 'Add a tagline', 'One sentence. What you do and who you do it for.', 10) +
        lsItem('has_listing', 'Add a service or product', "Customers can't book or buy without at least one listing", 20) +
      '</div>' +
      '<div class="ls-complete-state"><div class="ls-complete-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#1E8E3E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="ls-complete-body"><p class="ls-complete-title">Your listing is complete</p><p class="ls-complete-desc">Your profile is set up to get the most visibility on Lokali.</p></div></div>';
  }

  function listingStrength(v, hasListing) {
    ensureCardMarkup();
    var tasks = [
      { id: 'business_name', pts: 10, done: !!v.business_name },
      { id: 'category',      pts: 10, done: !!(v.categories_id && v.categories_id.length) },
      { id: 'profile_photo', pts: 15, done: !!v.profile_photo },
      { id: 'bio',           pts: 20, done: (v.business_description || '').trim().length >= 80 },
      { id: 'tagline',       pts: 10, done: !!(v.business_tagline && String(v.business_tagline).trim()) },
      { id: 'has_listing',   pts: 20, done: !!hasListing }
    ];
    var score = 0, missing = 0;
    var root = document.querySelector('[data-listing-strength]');
    tasks.forEach(function (t) {
      if (root) {
        var item = root.querySelector('[data-ls-item="' + t.id + '"]');
        if (item) item.classList.toggle('is-complete', t.done);
      }
      if (t.done) score += t.pts; else missing++;
    });
    var pct = Math.round((score / MAX_SCORE) * 100);
    if (root) {
      if (score >= MAX_SCORE) { root.classList.add('is-complete'); }
      var s = root.querySelector('[data-ls-score]');    if (s) s.textContent = pct + '%';
      var p = root.querySelector('[data-ls-progress]'); if (p) p.style.width = pct + '%';
      var sub = root.querySelector('[data-ls-subtitle]');
      if (sub) sub.textContent = "You're missing " + missing + ' thing' + (missing > 1 ? 's' : '') + ' that help customers decide to reach out.';
    }
    return pct;
  }

  function render(v, services, products) {
    var hasListing = services.length > 0 || products.length > 0;

    // Heading + subtitle
    setId('vendor-name', v.business_name || 'Vendor');
    setSel('.text-block-95', v.business_name || 'Your business'); // subtitle (location names not available from vendor/me)

    // Share + preview links — clean /{slug} URL once the vendor has one.
    var publicUrl = v.slug ? ('golokali.com/' + v.slug) : ('golokali.com/vendor?id=' + v.id);
    setSel('.text-block-96', publicUrl);
    var previewBtn = document.getElementById('btn-preview-listing');
    if (previewBtn) previewBtn.href = v.slug ? ('/' + v.slug) : ('/vendor?id=' + v.id);

    // Stat cards
    var activeServices = services.filter(function (s) { return !!s.is_active; }).length;
    var activeProducts = products.filter(function (p) { return !!p.is_active; }).length;
    setId('stat-active-services', activeServices);
    // Webflow has a single combined "Active Products / Services" card bound to
    // id="stat-active-products" — show the total of both, not products alone.
    setId('stat-active-products', activeServices + activeProducts);
    // Profile views (this month). Needs an element with id="stat-profile-views" in Webflow.
    // Reads vendor.profile_views_month_count from vendor/me (0 until the public profile gets views).
    setId('stat-profile-views', (v.profile_views_month_count != null ? v.profile_views_month_count : 0));

    // Listing strength card + top "Listing Strength" stat card (mirror same %)
    var pct = listingStrength(v, hasListing);
    setId('stat-profile-complete', pct + '%');

    // Share card buttons + quick-action cards
    wireShareButtons(v);
    wireQuickActions(v, services, products);
  }

  function init() {
    if (!window.LokaliDashboard || !window.LokaliDashboard.requireAuth()) return;

    ensureCardMarkup(); // rebuild card markup first so the dismiss button below binds to it

    if (isDismissed()) {
      var card = document.querySelector('[data-listing-strength]');
      if (card) card.style.display = 'none';
    } else {
      var dismissBtn = document.querySelector('[data-ls-dismiss]');
      if (dismissBtn) dismissBtn.addEventListener('click', function () {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
        var c = document.querySelector('[data-listing-strength]');
        if (c) c.style.display = 'none';
      });
    }

    if (!(window.LokaliAPI && window.LokaliAPI.vendors)) { setTimeout(init, 300); return; }

    Promise.all([
      window.LokaliAPI.vendors.me(),
      window.LokaliAPI.services.getMine(false),
      window.LokaliAPI.products.getMine(false)
    ]).then(function (r) {
      var vendorRes = r[0];
      if (vendorRes.error || !vendorRes.data) { window.location.href = '/login'; return; }
      var v = vendorRes.data.vendor || vendorRes.data;
      render(v, toArr(r[1].data), toArr(r[2].data));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
