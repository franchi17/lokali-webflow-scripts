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
  function wireShareButtons(v) {
    var url = publicListingUrl(v);

    var copyBtn = document.getElementById('share-copy-link');
    if (copyBtn && !copyBtn.__wired) {
      copyBtn.__wired = true;
      copyBtn.addEventListener('click', function (e) {
        e.preventDefault();
        copyToClipboard(url).then(function (ok) {
          if (ok) flashCopied(copyBtn.querySelector('.text-block-97') || copyBtn);
        });
      });
    }

    var shareBtn = document.getElementById('share-profile-btn');
    if (shareBtn && !shareBtn.__wired) {
      shareBtn.__wired = true;
      shareBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var data = { title: (v.business_name || 'My Lokali profile'), url: url };
        if (navigator.share) { navigator.share(data).catch(function () {}); return; }
        // Desktop: no native share sheet → copy + show feedback so it doesn't feel dead.
        copyToClipboard(url).then(function (ok) {
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

  function listingStrength(v, hasListing) {
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
    setId('stat-active-services', services.filter(function (s) { return !!s.is_active; }).length);
    setId('stat-active-products', products.filter(function (p) { return !!p.is_active; }).length);
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
