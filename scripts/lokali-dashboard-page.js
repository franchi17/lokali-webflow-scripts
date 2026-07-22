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
  var MAX_SCORE = 105; // 76f: +10 owner_photo +10 meet_vendor (was 85)

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
        lsItem('profile_photo', 'Add your logo', 'Vendors with photos get 3× more contacts', 15) +
        lsItem('bio', 'Write a bio <span style="color:#9A9AB0;font-weight:500;">(80+ characters)</span>', 'Your story is what makes a customer choose you over a directory', 20) +
        lsItem('tagline', 'Add a tagline', 'One sentence. What you do and who you do it for.', 10) +
        lsItem('owner_photo', 'Add your photo', 'A real face builds trust — it tops the "Meet the vendor" section', 10) +
        lsItem('meet_vendor', 'Fill out Meet the Vendor', 'Your first name + a short personal intro on your public page', 10) +
        lsItem('has_listing', 'Add a service or product', "Customers can't book or buy without at least one listing", 20) +
      '</div>' +
      '<div class="ls-complete-state"><div class="ls-complete-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#1E8E3E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="ls-complete-body"><p class="ls-complete-title">Your listing is complete</p><p class="ls-complete-desc">Your profile is set up to get the most visibility on Lokali.</p></div></div>';
  }

  // #90 publish gate — persistent "not public yet" banner INTEGRATED into the
  // Listing Strength card (decision: one place tied to the real gate, not a
  // second nag). Shows only while the storefront misses the minimum bar
  // (category + service area + >=1 live listing); disappears on its own once
  // everything's in. While not ready, the card ignores a saved dismiss.
  function renderGateBanner(root, gateReady, bits) {
    if (!root) return;
    var el = root.querySelector('[data-ls-gate]');
    if (gateReady) { if (el) el.parentNode.removeChild(el); return; }
    var missing = [];
    if (!bits.name) missing.push('name your storefront'); // #101 — signup-path vendors start nameless
    if (!bits.cats) missing.push('pick your category');
    if (!bits.locs) missing.push('set your service area');
    if (!bits.listing) missing.push('add a service or product');
    var msg = 'Your storefront isn’t public yet — customers can’t find it on The Market until you ' +
      (missing.length ? missing.join(' · ') : 'finish setup') + '.';
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('data-ls-gate', '');
      el.style.cssText = 'display:flex;align-items:flex-start;gap:10px;background:#FDF1E7;' +
        'border:1px solid #F6D9BE;border-radius:12px;padding:12px 14px;margin:0 0 14px;' +
        "font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;line-height:1.5;color:#8A4B14;";
      el.innerHTML = '<span style="font-size:16px;line-height:1.4;">🚦</span><span data-ls-gate-msg></span>';
      root.insertBefore(el, root.firstChild);
    }
    var m = el.querySelector('[data-ls-gate-msg]');
    if (m) m.textContent = msg;
    // The gate outranks a saved dismiss — a hidden card can't warn anyone.
    root.style.display = '';
  }

  function listingStrength(v, hasListing) {
    ensureCardMarkup();
    var tasks = [
      { id: 'business_name', pts: 10, done: !!v.business_name },
      { id: 'category',      pts: 10, done: !!(v.categories_id && v.categories_id.length) },
      { id: 'profile_photo', pts: 15, done: !!v.profile_photo },
      { id: 'bio',           pts: 20, done: (v.business_description || '').trim().length >= 80 },
      { id: 'tagline',       pts: 10, done: !!(v.business_tagline && String(v.business_tagline).trim()) },
      // 76f — the Meet-the-Vendor personal fields (76e columns)
      { id: 'owner_photo',   pts: 10, done: !!v.owner_photo },
      { id: 'meet_vendor',   pts: 10, done: !!(v.owner_name && String(v.owner_name).trim()) && (v.owner_bio || '').trim().length >= 40 },
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
    // #90 — the publish-gate banner rides the same data pass. Prefer the
    // server-computed flag when the column exists; fall back to the same
    // client-side math (matches the trigger's rule) pre-patch.
    var gCats = !!(v.categories_id && v.categories_id.length);
    var gLocs = !!(v.locations_id && v.locations_id.length);
    var gateReady = (v.is_publish_ready != null) ? !!v.is_publish_ready
                    : (!!v.business_name && gCats && gLocs && !!hasListing);
    renderGateBanner(root, gateReady, { name: !!v.business_name, cats: gCats, locs: gLocs, listing: !!hasListing });
    if (root) {
      if (score >= MAX_SCORE) { root.classList.add('is-complete'); }
      var s = root.querySelector('[data-ls-score]');    if (s) s.textContent = pct + '%';
      var p = root.querySelector('[data-ls-progress]'); if (p) p.style.width = pct + '%';
      var sub = root.querySelector('[data-ls-subtitle]');
      if (sub) sub.textContent = "You're missing " + missing + ' thing' + (missing > 1 ? 's' : '') + ' that help customers decide to reach out.';
    }
    return pct;
  }

  function render(v, services, products, leadsData) {
    var hasListing = services.length > 0 || products.length > 0;

    // Heading + subtitle. The subtitle used to repeat the business name right
    // under "Good to see you, {name}" — show the tagline instead, or hide it.
    setId('vendor-name', v.business_name || 'Vendor');
    var subEl = document.querySelector('.text-block-95');
    if (subEl) {
      var tagline = String(v.business_tagline || v.tagline || '').trim();
      subEl.textContent = tagline;
      subEl.style.display = tagline ? '' : 'none';
    }

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
    // Profile views. Needs an element with id="stat-profile-views" in Webflow.
    // vendor/me now returns profile_views_total computed LIVE from page_views
    // (same source as the analytics page, so the two numbers agree). Falls back
    // to the legacy month_count key, then 0.
    var profileViews = v.profile_views_total != null ? v.profile_views_total
      : (v.profile_views_month_count != null ? v.profile_views_month_count : 0);
    setId('stat-profile-views', profileViews);

    // Third stat card: "Leads this month" (was a Listing Strength mirror —
    // redundant with the checklist card right below, and static once 100%).
    // Same 30-day inquiries+contacts count as the analytics page's Leads KPI,
    // so the two pages always agree. The Webflow card's label is static text,
    // so retitle it here; the value element keeps its legacy id.
    var DAY30 = 30 * 24 * 60 * 60 * 1000;
    function in30(rows) {
      var now = Date.now();
      return (rows || []).filter(function (r) {
        var t = Date.parse(r.created_at || r.created || 0);
        return t && (now - t) < DAY30;
      }).length;
    }
    var leads30 = leadsData ? (in30(leadsData.inquiries) + in30(leadsData.contacts)) : 0;
    var statLeads = document.getElementById('stat-profile-complete');
    if (statLeads) {
      statLeads.textContent = String(leads30);
      // Retitle the static Webflow label ("Listing Strength") on the same card.
      var cardEl = statLeads, label = null;
      for (var i = 0; i < 4 && cardEl && !label; i++) {
        cardEl = cardEl.parentElement;
        label = cardEl && cardEl.querySelector('.dashboard-card-header');
      }
      if (label) label.textContent = 'Leads this month';
    }
    // The big checklist card below still needs its update — listingStrength()
    // writes data-ls-score/-progress as a side effect, so keep the call.
    listingStrength(v, hasListing);

    // Share card buttons + quick-action cards
    wireShareButtons(v);
    wireQuickActions(v, services, products);
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
      if (flagged) sessionStorage.removeItem(WZ_FLAG);
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
    // Don't burn the once-per-session shot if the wizard's deps aren't up yet
    // (runSetupWizard bails silently on them).
    var SB = window.LokaliSupabaseAPI;
    if (!window.LokaliAPI || !SB || !SB.vendors || !SB.vendors.updateProfile) return;
    try { sessionStorage.setItem(WZ_SEEN, '1'); } catch (e) {}
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
    wrap.appendChild(card);

    var steps = [];
    var stepIdx = 0;

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    function next() { stepIdx++; if (stepIdx >= steps.length) close(); else steps[stepIdx](); }

    function shell(title, sub, bodyHtml, opts) {
      opts = opts || {};
      card.innerHTML =
        '<button data-wz-x aria-label="Close" style="position:absolute;top:14px;right:14px;background:none;' +
          'border:none;cursor:pointer;font-size:18px;color:#9A9AB0;line-height:1;">✕</button>' +
        '<div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#6E3CFF;margin-bottom:6px;">' +
          'STEP ' + (stepIdx + 1) + ' OF ' + steps.length + '</div>' +
        '<h3 style="font-size:21px;font-weight:800;color:#231d3f;margin:0 0 6px;font-family:inherit;">' + title + '</h3>' +
        '<p style="font-size:14px;line-height:1.55;margin:0 0 16px;">' + sub + '</p>' +
        '<div data-wz-body>' + bodyHtml + '</div>' +
        '<div data-wz-err style="display:none;color:#C05621;font-size:13px;margin-top:10px;"></div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;gap:12px;">' +
          '<div style="font-size:12.5px;line-height:1.45;color:#9A9AB0;max-width:55%;">' +
            'You can skip — but your storefront <strong style="color:#8A4B14;">won’t go live</strong> until this is set.</div>' +
          '<div style="display:flex;align-items:center;gap:14px;white-space:nowrap;">' +
            '<a data-wz-skip style="cursor:pointer;font-size:14px;color:#9A9AB0;text-decoration:underline;">Skip for now</a>' +
            (opts.noContinue ? '' :
              '<button data-wz-next style="background:#6E3CFF;color:#fff;border:none;cursor:pointer;font-family:inherit;' +
              'font-weight:700;font-size:14px;padding:10px 22px;border-radius:999px;">Continue</button>') +
          '</div>' +
        '</div>';
      card.querySelector('[data-wz-x]').addEventListener('click', close);
      card.querySelector('[data-wz-skip]').addEventListener('click', next);
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
        b.style.cssText = 'font-family:inherit;font-size:14px;padding:8px 16px;border-radius:999px;cursor:pointer;' +
          'border:1.5px solid #E4DCF7;background:#FAF7FF;color:#3b3654;';
        b.addEventListener('click', function () {
          if (!multi) { sel = {}; box.querySelectorAll('button').forEach(function (o) {
            o.style.background = '#FAF7FF'; o.style.borderColor = '#E4DCF7'; o.style.color = '#3b3654'; }); }
          var on = !sel[id];
          sel[id] = on;
          if (!on) delete sel[id];
          b.style.background = on ? '#6E3CFF' : '#FAF7FF';
          b.style.borderColor = on ? '#6E3CFF' : '#E4DCF7';
          b.style.color = on ? '#fff' : '#3b3654';
        });
        box.appendChild(b);
      });
      body.appendChild(box);
      return function () { return Object.keys(sel).map(Number); };
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
          if (res && res.error) { showErr('Could not save — try again.'); return; }
          v.business_name = name;
          setId('vendor-name', name); // heading was 'Vendor' until now
          next();
        });
      });
    });

    // Step: category (single pick — more can be added on the profile page later)
    if (!(v.categories_id && v.categories_id.length)) steps.push(function () {
      var body = shell('What do you do?', 'Pick the category that fits your business best.', '<div data-wz-load>Loading categories…</div>');
      (A.data && A.data.categories ? A.data.categories() : Promise.resolve({ data: [] })).then(function (r) {
        var items = (r && r.data) || [];
        if (items.items) items = items.items;
        body.innerHTML = '';
        var getSel = pillList(body, items, 'id', 'category_name', false);
        card.querySelector('[data-wz-next]').addEventListener('click', function () {
          var ids = getSel();
          if (!ids.length) { showErr('Pick a category (or use Skip for now).'); return; }
          SB.vendors.updateProfile(v.id, { categories_id: ids }).then(function (res) {
            if (res && res.error) { showErr('Could not save — try again.'); return; }
            next();
          });
        });
      });
    });

    // Step: service area (multi pick — a vendor can serve several communities)
    if (!(v.locations_id && v.locations_id.length)) steps.push(function () {
      var body = shell('Where do you serve?', 'Choose your community — pick every area you serve.', '<div>Loading areas…</div>');
      (A.data && A.data.locations ? A.data.locations() : Promise.resolve({ data: [] })).then(function (r) {
        var items = (r && r.data) || [];
        if (items.items) items = items.items;
        body.innerHTML = '';
        var getSel = pillList(body, items, 'id', 'location_name', true);
        card.querySelector('[data-wz-next]').addEventListener('click', function () {
          var ids = getSel();
          if (!ids.length) { showErr('Pick at least one area (or use Skip for now).'); return; }
          SB.vendors.updateProfile(v.id, { locations_id: ids }).then(function (res) {
            if (res && res.error) { showErr('Could not save — try again.'); return; }
            next();
          });
        });
      });
    });

    // Step: first listing — out-and-back CTA into the real add-service/product
    // forms (decision: reuse them rather than duplicate a mini-form here).
    steps.push(function () {
      shell('Add your first service or product',
        'This is what customers can actually book or buy — your storefront goes live the moment one is up.',
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
          '<a href="/vendor-dashboard/services" style="flex:1;min-width:150px;text-align:center;background:#6E3CFF;color:#fff;' +
            'font-weight:700;font-size:14px;padding:12px 18px;border-radius:12px;text-decoration:none;font-family:inherit;">Add a service</a>' +
          '<a href="/vendor-dashboard/products" style="flex:1;min-width:150px;text-align:center;background:#FDF1E7;color:#8A4B14;' +
            'border:1.5px solid #F6D9BE;font-weight:700;font-size:14px;padding:12px 18px;border-radius:12px;text-decoration:none;font-family:inherit;">Add a product</a>' +
        '</div>', { noContinue: true });
    });

    if (!steps.length) return;
    document.body.appendChild(wrap);
    steps[0]();
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
      window.LokaliAPI.products.getMine(false),
      // Leads for the "Leads this month" stat card — same endpoint the
      // analytics page uses, so the two numbers always agree. Best-effort.
      (window.LokaliAPI.leads && window.LokaliAPI.leads.analytics)
        ? window.LokaliAPI.leads.analytics().catch(function () { return null; })
        : Promise.resolve(null)
    ]).then(function (r) {
      var vendorRes = r[0];
      if (vendorRes.error || !vendorRes.data) {
        // Only a genuine auth failure goes to /login. Transient errors (the
        // Xano free-tier rate limit, cold starts, network blips) retry instead
        // — bouncing a signed-in vendor to /login on a 429 looked like a
        // forced logout.
        if (vendorRes.status === 401 || vendorRes.status === 403) {
          window.location.href = '/login';
          return;
        }
        if (_initRetries < 2) {
          _initRetries++;
          setTimeout(init, 4000 * _initRetries);
        }
        return;
      }
      var v = vendorRes.data.vendor || vendorRes.data;
      var leadsRes = r[3];
      var leadsData = leadsRes && !leadsRes.error ? (leadsRes.data != null ? leadsRes.data : leadsRes) : null;
      render(v, toArr(r[1].data), toArr(r[2].data), leadsData);
      maybeRunWizard(v); // #90 first-run setup wizard (one-shot, flag-gated)
    });
  }

  var _initRetries = 0;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
