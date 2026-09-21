/*
  Lokali — Settings page wiring.
  Hosted version of the former inline settings-page-embed.html paste; load with ONE <script defer src> tag on the Settings page after the sitewide bundle.
  Requires (already site-wide): the API client (lokali-api-adapter.js), lokali-auth.js, lokali-dashboard.js.
  Optional: lokali-billing.js (for the Stripe portal/upgrade buttons via data-lokali-portal / data-lokali-checkout).

  ELEMENT IDs THIS SCRIPT LOOKS FOR (add in Webflow; anything missing is skipped safely):
    Inputs   : #settings-first-name (or existing #First-Name-Input), #settings-last-name (or #Last-Name-Input)
    Display  : #settings-email, #settings-account-type, #settings-current-plan
    Buttons  : #settings-save-btn, #settings-view-plans,
               #settings-change-email + #settings-change-password (both open the LokaliAuth
               account panel — email + password are managed there),
               #settings-deactivate, #settings-reactivate, #settings-delete
    Toggles  : #toggle-visibility-public  (on = listing live, off = deactivated)
               #toggle-visibility-reviews (PRO/FEATURED) — show public reviews
               #toggle-notify-inquiry, #toggle-notify-announcements,
               #toggle-notify-promotional (PRO/FEATURED), #toggle-notify-review (PRO/FEATURED)
  Set window.LOKALI_PRICING_URL to override the "View Plans" destination (default /pricing).
*/
(function () {
  'use strict';

  var PRO_PLANS = ['pro', 'featured'];
  // Toggles that are a paid-plan perk (disabled + dimmed on Free).
  var PRO_ONLY_TOGGLES = ['toggle-visibility-reviews', 'toggle-notify-promotional', 'toggle-notify-review'];

  var _user = null;
  var _vendor = null;
  var _plan = 'free';
  var _planEnds = ''; // set when a portal cancel is pending (41g) — "ends <date>"
  var _customUrlAllowed = null; // plan.custom_profile_url when billing exposes it; else inferred from plan code
  var _prefs = null;            // vendor preferences (notifications + review visibility)

  function $(id) { return document.getElementById(id); }
  function firstEl(ids) { for (var i = 0; i < ids.length; i++) { var e = $(ids[i]); if (e) return e; } return null; }
  function inputOf(el) {
    if (!el) return null;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el;
    return el.querySelector ? el.querySelector('input,textarea') : null;
  }
  function setText(el, v) { if (el) el.textContent = (v == null ? '' : String(v)); }
  // Escape untrusted strings before interpolating into innerHTML.
  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(type, msg) {
    var el = $('lokali-settings-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lokali-settings-toast';
      el.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:9999;padding:12px 20px;border-radius:999px;box-shadow:0 8px 20px rgba(15,23,42,.2);' +
        "font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:500;color:#fff;display:none;max-width:90vw;text-align:center;";
      document.body.appendChild(el);
    }
    el.style.background = type === 'success' ? '#047857' : (type === 'info' ? '#4a26fd' : '#b91c1c');
    el.textContent = msg || '';
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.display = 'none'; }, 5000);
  }

  function isPro() { return PRO_PLANS.indexOf((_plan || 'free').toLowerCase()) !== -1; }

  function init() {
    if (window.LokaliDashboard && window.LokaliDashboard.requireAuth && !window.LokaliDashboard.requireAuth()) return;
    if (window.LokaliDashboard && window.LokaliDashboard.preventFormSubmit) window.LokaliDashboard.preventFormSubmit();
    load().then(populate).then(bind).then(regroup).catch(function (err) {
      console.error('[Settings] init error:', err);
    });
  }

  function load() {
    var calls = [window.LokaliAPI.auth.me()];
    if (window.LokaliAPI.plans && window.LokaliAPI.plans.getMyBilling) calls.push(window.LokaliAPI.plans.getMyBilling());
    else calls.push(Promise.resolve(null));
    if (window.LokaliAPI.vendors && window.LokaliAPI.vendors.getPreferences) calls.push(window.LokaliAPI.vendors.getPreferences());
    else calls.push(Promise.resolve(null));
    // auth/me does not carry the vendor record; fetch vendor/me so the listing
    // visibility toggle (and any vendor-derived field) reflects real state.
    if (window.LokaliAPI.vendors && window.LokaliAPI.vendors.me) calls.push(window.LokaliAPI.vendors.me());
    else calls.push(Promise.resolve(null));
    return Promise.all(calls).then(function (res) {
      var me = res[0];
      if (me && me.error) {
        if (me.status === 401) { if (window.LokaliAPI.clearToken) window.LokaliAPI.clearToken(); window.location.href = '/login'; return new Promise(function () {}); }
        throw new Error(me.error);
      }
      var d = (me && me.data) || {};
      _user = d.user || d;
      _vendor = d.vendor || (d.user ? null : d.vendor) || null;
      var vendorRes = res[3];
      if (vendorRes && !vendorRes.error && vendorRes.data) {
        _vendor = vendorRes.data.vendor || vendorRes.data;
      }
      var billing = res[1];
      if (billing && !billing.error && billing.data) {
        var b = billing.data;
        _plan = (b.plan_code || b.plan || (b.plan && b.plan.code) || (b.subscription && b.subscription.plan_code) || 'free');
        if (b.plan && b.plan.code) _plan = b.plan.code;
        var feat = b.features || b.plan || {};
        if (typeof feat.custom_profile_url === 'boolean') _customUrlAllowed = feat.custom_profile_url;
        // 41g — pending cancellation: plan runs until period end, then stops.
        _planEnds = '';
        if (b.cancel_at_period_end === true && b.current_period_end) {
          var endsTs = b.current_period_end;
          if (endsTs < 1e12) endsTs = endsTs * 1000; // tolerate unix seconds
          try {
            _planEnds = new Date(endsTs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
          } catch (e) { _planEnds = ''; }
        }
      }
      var prefsRes = res[2];
      if (prefsRes && !prefsRes.error && prefsRes.data) _prefs = prefsRes.data;
    });
  }

  function populate() {
    var fn = inputOf(firstEl(['settings-first-name', 'First-Name-Input']));
    var ln = inputOf(firstEl(['settings-last-name', 'Last-Name-Input']));
    if (fn) fn.value = (_user && _user.first_name) || '';
    if (ln) ln.value = (_user && _user.last_name) || '';

    setText($('settings-email'), (_user && _user.email) || '');
    setText($('settings-account-type'), _titlecase((_user && _user.role) || 'vendor'));
    setText($('settings-current-plan'), _titlecase(_plan || 'free') + (_planEnds ? ' · ends ' + _planEnds : ''));

    // Listing visibility = vendor.is_active
    var vis = $('toggle-visibility-public');
    if (vis && _vendor) {
      var visInput = vis.tagName === 'INPUT' ? vis : inputOf(vis);
      if (visInput) visInput.checked = !!_vendor.is_active;
    }

    // Notification / review preferences (persisted via vendor/me/preferences)
    if (_prefs) {
      var prefMap = {
        'toggle-notify-inquiry'      : 'notify_inquiry',
        'toggle-notify-announcements': 'notify_announcements',
        'toggle-notify-promotional'  : 'notify_promotional',
        'toggle-notify-review'       : 'notify_review',
        'toggle-visibility-reviews'  : 'show_public_reviews'
      };
      Object.keys(prefMap).forEach(function (id) {
        var t = $(id); if (!t) return;
        var input = t.tagName === 'INPUT' ? t : inputOf(t);
        if (input) input.checked = !!_prefs[prefMap[id]];
      });
    }

    mountSlugEditor();
    mountNewsletterToggle(); // #54 — person-level newsletter opt-out
    mountCircleToggle();     // #170 — The Lokali Circle (vendor-only email) opt-out

    // Gate paid-only toggles on Free plans
    if (!isPro()) {
      PRO_ONLY_TOGGLES.forEach(function (id) {
        var t = $(id); if (!t) return;
        var input = t.tagName === 'INPUT' ? t : inputOf(t);
        if (input) { input.disabled = true; input.checked = false; }
        var label = (input && input.closest) ? input.closest('label') : t;
        if (label && label.style) { label.style.opacity = '0.5'; label.style.pointerEvents = 'none'; }
        // pointer-events:none suppresses a title tooltip — the unlock hint has
        // to be visible text (linked to /pricing).
        var row = t.closest ? t.closest('.div-block-160') : null;
        var head = row ? row.querySelector('.notifications-header') : null;
        if (head && !head.querySelector('.lok-pro-pill')) {
          var pill = document.createElement('a');
          pill.className = 'lok-pro-pill';
          pill.href = (typeof window.LOKALI_PRICING_URL === 'string' && window.LOKALI_PRICING_URL) || '/pricing';
          pill.textContent = 'Pro & Featured';
          pill.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 9px;border-radius:999px;background:#F3EBFF;color:#6002EE;' +
            "font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:600;text-decoration:none;vertical-align:middle;";
          head.appendChild(pill);
        }
      });
    }
  }

  function _titlecase(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ---------------------------------------------------------------------------
  // Custom profile URL (Pro & Featured). Self-mounting — no Webflow edits.
  // Mounts after the plan display (or wherever #lok-slug-section is placed).
  // ---------------------------------------------------------------------------
  function slugAllowed() {
    if (_customUrlAllowed != null) return _customUrlAllowed;
    return isPro();
  }

  function mountSlugEditor() {
    if (!window.LokaliAPI.vendors || !window.LokaliAPI.vendors.updateSlug) return;
    var host = $('lok-slug-section');
    if (!host) {
      var anchor = $('settings-current-plan');
      var card = anchor ? (anchor.closest('section, .settings-card, [class*="card"]') || anchor.parentElement) : null;
      if (!card) return;
      host = document.createElement('div');
      host.id = 'lok-slug-section';
      host.style.cssText = 'margin-top:16px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;';
      card.appendChild(host);
    }

    var currentSlug = (_vendor && _vendor.slug) || '';
    var label = '<div style="font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#8E8BA6;margin-bottom:6px;">Custom profile URL</div>';

    if (!slugAllowed()) {
      host.innerHTML = label +
        '<div style="border:1px dashed #c8c6d8;border-radius:10px;padding:14px;background:#F7F6FC;color:#4A4761;font-size:14px;line-height:1.5;">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:1em;height:1em;vertical-align:-.125em;flex-shrink:0;"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg> Claim your own link, like <strong>golokali.com/' + escapeHtml(currentSlug || 'your-name') + '</strong>, with Pro &amp; Featured.</div>';
      return;
    }

    host.innerHTML = label +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<span style="color:#8E8BA6;font-size:14px;">golokali.com/</span>' +
      '<input id="lok-slug-input" type="text" value="' + escapeHtml(currentSlug) + '" maxlength="30" autocomplete="off" spellcheck="false" ' +
      'style="flex:1;min-width:140px;border:1px solid #c8c6d8;border-radius:8px;padding:9px 12px;font-size:14px;color:#1A1829;background:#fff;font-family:inherit;">' +
      '<button type="button" id="lok-slug-save" style="border:none;border-radius:8px;background:#6002ee;color:#fff;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Save URL</button>' +
      '</div>' +
      '<div id="lok-slug-status" style="font-size:13px;margin-top:6px;min-height:18px;color:#8E8BA6;"></div>' +
      '<div style="font-size:12px;color:#8E8BA6;margin-top:2px;">Lowercase letters, numbers, hyphens. One change every 30 days; your old link keeps working.</div>';

    var input = $('lok-slug-input');
    var saveBtn = $('lok-slug-save');
    var status = $('lok-slug-status');
    var checkTimer = null;

    // #132 (same defect as #129, different surface): change_vendor_slug answers
    // in CODES and this page toasted them verbatim — a vendor hitting the
    // 30-day limit read "rate_limited". Every refusal the RPC can return gets a
    // sentence; anything unmapped falls through to the our-fault line, never the
    // raw code. Note "your old link keeps working" in the hint above is now
    // true — the Worker 301s retired slugs as of 2026-08-16 (#130).
    var SLUG_OUR_FAULT = 'Something went wrong on our end. Your URL wasn’t changed. Please try again.';
    var SLUG_ERRORS = {
      rate_limited:  'You can change your URL once every 30 days, and this one was changed recently, so it’s not available yet.',
      slug_taken:    'That URL is already taken. Try another.',
      slug_reserved: 'That URL is reserved by Lokali. Try another.',
      invalid_slug:  'Use 2–30 characters: lowercase letters, numbers and hyphens only.',
      plan_required: 'A custom URL is a Pro and Featured feature. Upgrade to claim yours.',
      not_found:     'We couldn’t find your storefront. Try reloading the page.',
      unauthorized:  'Your session expired. Please log in again.'
    };
    function slugErrorMessage(code) { return SLUG_ERRORS[code] || SLUG_OUR_FAULT; }

    function setStatus(msg, color) { if (status) { status.textContent = msg || ''; status.style.color = color || '#8E8BA6'; } }

    input.addEventListener('input', function () {
      var v = input.value.trim().toLowerCase();
      input.value = v;
      clearTimeout(checkTimer);
      if (!v || v === currentSlug) { setStatus(''); return; }
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) || v.length < 3) {
        setStatus('3–30 characters: lowercase letters, numbers, single hyphens.', '#B1006A');
        return;
      }
      setStatus('Checking availability…');
      checkTimer = setTimeout(function () {
        window.LokaliAPI.vendors.slugAvailable(v).then(function (r) {
          if (input.value.trim() !== v) return; // stale
          // A failed check resolves an { error } envelope with no `available`
          // key — don't report that as "taken".
          if (!r || r.error) { setStatus('Couldn’t check availability. Try again.'); return; }
          if (r.available) setStatus('✓ golokali.com/' + v + ' is available', '#047857');
          else setStatus('That URL is already taken.', '#B1006A');
        });
      }, 450);
    });

    saveBtn.addEventListener('click', function () {
      var v = input.value.trim().toLowerCase();
      if (!v || v === currentSlug) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      window.LokaliAPI.vendors.updateSlug(v).then(function (res) {
        if (res.error) {
          var msg = slugErrorMessage(res.error);
          setStatus(msg, '#B1006A');
          toast('error', msg);
        } else {
          currentSlug = (res.data && (res.data.slug || (res.data.value && res.data.value.slug))) || v;
          if (_vendor) _vendor.slug = currentSlug;
          setStatus('✓ Your profile now lives at golokali.com/' + currentSlug, '#047857');
          toast('success', 'Custom URL saved.');
        }
      }).catch(function () {
        toast('error', 'Network error. Please try again.');
      }).then(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save URL';
      });
    });
  }

  // Persist a single preference toggle (notifications / review visibility).
  // ── #54 "The Neighborhood Edit" newsletter toggle ──────────────────────────
  // Injected rather than authored in Webflow because the sibling notification
  // toggles are HtmlEmbed elements wrapping a raw <input type="checkbox">, and
  // Webflow's element builder refuses a standalone checkbox ("Checkbox Field can
  // only be placed in a Form"). We clone the existing row markup exactly
  // (.div-block-160 + .notifications-header + .settings-lokali-text + the
  // .lk-toggle embed) so it is visually indistinguishable; the .lk-toggle CSS is
  // already on the page from the sibling embeds, so no styles are duplicated.
  //
  // PERSON-LEVEL, not storefront-level: this writes app_user.notif_letter — the
  // same flag the customer /account page toggles — NOT vendor_preferences. A
  // newsletter goes to a person's inbox, every vendor owns an app_user row, and
  // the #66 account model is person-first. (vendor_preferences.notify_promotional
  // is a different thing: storefront marketing consent, default OFF, Pro-gated.)
  // Consequence worth knowing: a vendor who also shops sees one shared setting
  // here and on /account, which is correct — one person, one newsletter.
  function mountNewsletterToggle() {
    if ($('toggle-notify-letter')) return;                 // idempotent
    var anchor = $('toggle-notify-announcements');
    if (!anchor) return;                                   // markup changed — skip silently
    var row = anchor.closest ? anchor.closest('.div-block-160') : null;
    if (!row || !row.parentNode) return;

    var newRow = document.createElement('div');
    newRow.className = row.className || 'div-block-160';
    var label = document.createElement('div');
    var h = document.createElement('div');
    h.className = 'notifications-header';
    h.textContent = 'The Neighborhood Edit';
    var p = document.createElement('div');
    p.className = 'settings-lokali-text';
    p.textContent = 'Our bi-monthly newsletter: vendor spotlights and what’s new on Lokali. Rare by design.';
    label.appendChild(h); label.appendChild(p);

    var embed = document.createElement('div');
    embed.id = 'toggle-notify-letter';
    embed.className = anchor.className || 'w-embed';
    // Static markup only (no interpolation) — matches the sibling embeds.
    embed.innerHTML =
      '<label class="lk-toggle">' +
        '<input type="checkbox" />' +
        '<span class="lk-toggle-track"><span class="lk-toggle-thumb"></span></span>' +
      '</label>';

    newRow.appendChild(label);
    newRow.appendChild(embed);
    row.parentNode.insertBefore(newRow, row.nextSibling);

    var input = inputOf(embed);
    if (!input) return;
    // The header div isn't associated with the checkbox — name it directly.
    input.setAttribute('aria-label', 'The Neighborhood Edit newsletter');
    // Default ON: treat null/undefined as subscribed, same reading as
    // lokali-account.js and the admin_newsletter_recipients() `is not false`.
    input.checked = !(_user && _user.notif_letter === false);
    input.addEventListener('change', function () { saveLetter(input.checked, input); });
  }

  function saveLetter(value, inputEl) {
    if (!(window.LokaliAPI.account && window.LokaliAPI.account.update)) return;
    window.LokaliAPI.account.update({ notif_letter: !!value }).then(function (res) {
      if (res && res.error) {
        toast('error', 'Could not save preference.');
        if (inputEl) inputEl.checked = !value; // revert
        return;
      }
      if (_user) _user.notif_letter = !!value;
      // Mirror to the Brevo list (best-effort; the save already succeeded).
      try {
        if (window.LokaliAPI.account.syncNewsletter) window.LokaliAPI.account.syncNewsletter();
      } catch (e) {}
      flashSaved(inputEl);
    }).catch(function () {
      toast('error', 'Network error. Please try again.');
      if (inputEl) inputEl.checked = !value;
    });
  }

  // ── #170 "The Lokali Circle" — the vendor-only monthly email ───────────────
  // Same injection technique and the same person-level flag pattern as the
  // Neighborhood Edit toggle above, on its own column (app_user.notif_circle)
  // so opting out of one never opts you out of the other. Sits directly under
  // the Neighborhood Edit row; if that row failed to mount, anchors on the
  // announcements row instead so the Circle toggle still appears.
  function mountCircleToggle() {
    if ($('toggle-notify-circle')) return;                 // idempotent
    var anchor = $('toggle-notify-letter') || $('toggle-notify-announcements');
    if (!anchor) return;                                   // markup changed — skip silently
    var row = anchor.closest ? anchor.closest('.div-block-160') : null;
    if (!row || !row.parentNode) return;

    var newRow = document.createElement('div');
    newRow.className = row.className || 'div-block-160';
    var label = document.createElement('div');
    var h = document.createElement('div');
    h.className = 'notifications-header';
    h.textContent = 'The Lokali Circle';
    var p = document.createElement('div');
    p.className = 'settings-lokali-text';
    p.textContent = 'A monthly note for vendors: storefront tips, what is new in your dashboard, and the occasional question from Francesca.';
    label.appendChild(h); label.appendChild(p);

    var embed = document.createElement('div');
    embed.id = 'toggle-notify-circle';
    embed.className = anchor.className || 'w-embed';
    embed.innerHTML =
      '<label class="lk-toggle">' +
        '<input type="checkbox" />' +
        '<span class="lk-toggle-track"><span class="lk-toggle-thumb"></span></span>' +
      '</label>';

    newRow.appendChild(label);
    newRow.appendChild(embed);
    row.parentNode.insertBefore(newRow, row.nextSibling);

    var input = inputOf(embed);
    if (!input) return;
    input.setAttribute('aria-label', 'The Lokali Circle vendor email');
    // Default ON: null/undefined = subscribed, same as admin_circle_recipients().
    input.checked = !(_user && _user.notif_circle === false);
    input.addEventListener('change', function () { saveCircle(input.checked, input); });
  }

  function saveCircle(value, inputEl) {
    if (!(window.LokaliAPI.account && window.LokaliAPI.account.update)) return;
    window.LokaliAPI.account.update({ notif_circle: !!value }).then(function (res) {
      if (res && res.error) {
        toast('error', 'Could not save preference.');
        if (inputEl) inputEl.checked = !value; // revert
        return;
      }
      if (_user) _user.notif_circle = !!value;
      try {
        if (window.LokaliAPI.account.syncCircle) window.LokaliAPI.account.syncCircle();
      } catch (e) {}
      flashSaved(inputEl);
    }).catch(function () {
      toast('error', 'Network error. Please try again.');
      if (inputEl) inputEl.checked = !value;
    });
  }

  function savePref(key, value, inputEl) {
    if (!window.LokaliAPI.vendors || !window.LokaliAPI.vendors.updatePreferences) return;
    var payload = {};
    payload[key] = !!value;
    window.LokaliAPI.vendors.updatePreferences(payload).then(function (res) {
      if (res.error) {
        toast('error', 'Could not save preference.');
        if (inputEl) inputEl.checked = !value; // revert
      } else {
        _prefs = (res.data && res.data.value) || res.data || _prefs;
        flashSaved(inputEl);
      }
    }).catch(function () {
      toast('error', 'Network error. Please try again.');
      if (inputEl) inputEl.checked = !value;
    });
  }

  function bind() {
    var saveBtn = $('settings-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', function (e) { e.preventDefault(); saveProfile(); });

    var viewPlans = $('settings-view-plans');
    if (viewPlans) viewPlans.addEventListener('click', function (e) {
      e.preventDefault();
      window.location.href = (typeof window.LOKALI_PRICING_URL === 'string' && window.LOKALI_PRICING_URL) || '/pricing';
    });

    // Email + password are both auth-managed (Supabase owns identity). Both the
    // "Change" email link and the "Update" password link open the LokaliAuth
    // account panel, where email and password changes are handled. No separate
    // app-side email/password is stored to write.
    var openAuthAccount = function (e) {
      if (e) e.preventDefault();
      if (window.LokaliAuth && typeof window.LokaliAuth.openAccountPanel === 'function') {
        window.LokaliAuth.openAccountPanel();
      } else {
        toast('info', 'Opening your account… one moment.');
        setTimeout(function () {
          if (window.LokaliAuth && typeof window.LokaliAuth.openAccountPanel === 'function') window.LokaliAuth.openAccountPanel();
          else toast('error', 'Account manager unavailable. Please refresh and try again.');
        }, 800);
      }
    };
    var pwBtn = $('settings-change-password');
    if (pwBtn) pwBtn.addEventListener('click', openAuthAccount);
    var emailBtn = $('settings-change-email');
    if (emailBtn) emailBtn.addEventListener('click', openAuthAccount);

    // Listing visibility toggle → reactivate (on) / deactivate (off)
    var vis = $('toggle-visibility-public');
    var visInput = vis ? (vis.tagName === 'INPUT' ? vis : inputOf(vis)) : null;
    if (visInput) visInput.addEventListener('change', function () { setListingVisible(visInput.checked, visInput); });

    var deact = $('settings-deactivate');
    if (deact) deact.addEventListener('click', function (e) {
      e.preventDefault();
      if (!confirm('Hide your listing? Customers won’t find it until you reactivate. Your data is preserved.')) return;
      setListingVisible(false, visInput);
    });

    var react = $('settings-reactivate');
    if (react) react.addEventListener('click', function (e) { e.preventDefault(); setListingVisible(true, visInput); });

    // Real account deletion — the same 58a chain the /account page uses
    // (Vercel /account/delete: Stripe cancel → backend purge → auth-user
    // delete → sign-out). Replaces the old native confirm() pair + a
    // vendors.deleteMe call that never existed on any backend, which made
    // this button silently no-op behind a fake "request received" toast.
    var del = $('settings-delete');
    if (del) {
      var delCard = document.createElement('div');
      delCard.id = 'settings-delete-confirm';
      delCard.style.cssText = 'display:none;width:100%;box-sizing:border-box;margin-top:14px;padding:14px 16px;' +
        "border:1px solid #F3D6D6;border-radius:12px;background:#FDF7F7;font-family:'Plus Jakarta Sans',sans-serif;";
      var delHelp = document.createElement('div');
      delHelp.style.cssText = 'font-size:13px;color:#6B6580;margin-bottom:10px;';
      delHelp.appendChild(document.createTextNode('Type '));
      var bTag = document.createElement('b'); bTag.textContent = 'DELETE';
      delHelp.appendChild(bTag);
      delHelp.appendChild(document.createTextNode(' to confirm. Your sign-in, listing and all account data are permanently removed.'));
      // 58k-D3 — founders only: deleting permanently forfeits the founding spot
      // (increment-only counter; a forfeited slot never reopens or comes back).
      if (_vendor && _vendor.is_founding_member) {
        var foundWarn = document.createElement('div');
        foundWarn.style.cssText = 'margin:0 0 10px;padding:8px 10px;border-radius:8px;' +
          "background:#FBEFD6;color:#9A6B00;font-size:13px;font-weight:600;font-family:'Plus Jakarta Sans',sans-serif;";
        foundWarn.textContent = 'Heads up: you’re a founding vendor. Deleting permanently retires your founding spot and its lifetime pricing. It can’t be undone or reclaimed.';
        delCard.appendChild(foundWarn);
      }
      // #100 exit survey — vendor list (this page is vendor-only). One optional,
      // fully skippable question before the point of no return; slugs must match
      // patch_exit_survey.sql (unknowns coerce to 'other'). Same UI as the
      // /account (customer) delete confirm in lokali-account.js.
      var EXIT_REASONS = [
        ['not_enough_customers',   'Not enough customers or leads'],
        ['too_expensive',          'Too expensive'],
        ['closing_business',       'Closing or pausing my business'],
        ['not_right_fit',          'Not the right fit for my business'],
        ['too_hard_to_use',        'Too hard to use'],
        ['found_another_platform', 'Found another platform'],
        ['other',                  'Something else']
      ];
      var exitReason = '';
      var surveyWrap = document.createElement('div');
      surveyWrap.style.cssText = 'margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #F3D6D6;';
      var sTitle = document.createElement('div');
      sTitle.style.cssText = 'font-size:13px;font-weight:600;color:#4A4761;margin-bottom:8px;';
      sTitle.textContent = 'Before you go: why are you leaving? (optional)';
      surveyWrap.appendChild(sTitle);
      var pillRow = document.createElement('div');
      pillRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;';
      var exitComment = document.createElement('textarea');
      exitComment.rows = 2;
      exitComment.placeholder = 'Anything we could have done better? (optional)';
      exitComment.style.cssText = 'width:100%;max-width:100%;box-sizing:border-box;display:none;' +
        'margin-bottom:2px;padding:9px 12px;border:1px solid #ECE8F8;border-radius:10px;font:inherit;resize:vertical;';
      var pillOff = 'font-family:inherit;font-size:12.5px;line-height:1.3;text-align:left;padding:7px 12px;' +
        'border-radius:999px;cursor:pointer;transition:all .12s;background:#fff;border:1px solid #E4E2F0;color:#4A4761;';
      var pillOn = 'font-family:inherit;font-size:12.5px;line-height:1.3;text-align:left;padding:7px 12px;' +
        'border-radius:999px;cursor:pointer;transition:all .12s;background:#6002EE;border:1px solid #6002EE;color:#fff;font-weight:600;';
      EXIT_REASONS.forEach(function (r) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = r[1]; b.style.cssText = pillOff;
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () {
          var already = exitReason === r[0];
          exitReason = already ? '' : r[0];
          Array.prototype.forEach.call(pillRow.children, function (c) { c.style.cssText = pillOff; c.setAttribute('aria-pressed', 'false'); });
          if (!already) { b.style.cssText = pillOn; b.setAttribute('aria-pressed', 'true'); }
          exitComment.style.display = exitReason ? 'block' : 'none';
        });
        pillRow.appendChild(b);
      });
      surveyWrap.appendChild(pillRow); surveyWrap.appendChild(exitComment);

      var delIn = document.createElement('input');
      delIn.type = 'text'; delIn.placeholder = 'Type DELETE';
      delIn.style.cssText = 'max-width:180px;margin-right:8px;padding:9px 12px;border:1px solid #ECE8F8;border-radius:10px;font:inherit;';
      var delGo = document.createElement('button');
      delGo.type = 'button'; delGo.textContent = 'Permanently delete';
      delGo.style.cssText = 'padding:9px 16px;border:0;border-radius:999px;background:#E0245E;color:#fff;font:inherit;font-weight:600;cursor:pointer;margin-right:8px;';
      var delNo = document.createElement('button');
      delNo.type = 'button'; delNo.textContent = 'Cancel';
      delNo.style.cssText = 'padding:9px 16px;border:1px solid #ECE8F8;border-radius:999px;background:#fff;color:#231D3F;font:inherit;font-weight:600;cursor:pointer;';
      delCard.appendChild(surveyWrap); delCard.appendChild(delHelp); delCard.appendChild(delIn); delCard.appendChild(delGo); delCard.appendChild(delNo);
      // Drop the card BELOW the whole [description | button] flex row (as a sibling
      // of that row) so it spans full width, instead of being trapped in the
      // button's narrow right column. Fall back to the old spot if the row is flat.
      var delRow = del.parentNode;
      if (delRow && delRow.parentNode) delRow.parentNode.insertBefore(delCard, delRow.nextSibling);
      else if (del.parentNode) del.parentNode.insertBefore(delCard, del.nextSibling);

      del.addEventListener('click', function (e) {
        e.preventDefault();
        delCard.style.display = delCard.style.display === 'none' ? 'block' : 'none';
        if (delCard.style.display === 'block') delIn.focus();
      });
      delNo.addEventListener('click', function () { delCard.style.display = 'none'; delIn.value = ''; });
      delGo.addEventListener('click', function () {
        if (delIn.value.trim() !== 'DELETE') { toast('error', 'Type DELETE to confirm'); delIn.focus(); return; }
        var auth = window.LokaliAuth;
        if (!auth || typeof auth.token !== 'function' || !auth.isSignedIn()) {
          toast('error', 'Please reload and sign in again'); return;
        }
        delGo.disabled = true; delGo.textContent = 'Deleting…';
        var base = (window.LOKALI_BILLING_BASE || 'https://lokali-api.vercel.app/api/lokali').replace(/\/$/, '');
        auth.token().then(function (jwt) {
          if (!jwt) throw new Error('not_signed_in');
          return fetch(base + '/account/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
            body: JSON.stringify({
              confirm: 'DELETE',
              // #100 — omitted when skipped; the route ignores a missing reason.
              reason: exitReason || undefined,
              comment: exitReason ? (exitComment.value || '').trim().slice(0, 1000) : undefined
            })
          });
        }).then(function (res) {
          if (!res.ok) return res.json().catch(function () { return {}; }).then(function (b) { throw new Error(b && b.error ? b.error : 'delete_failed'); });
          try { if (window.LokaliAPI.clearToken) window.LokaliAPI.clearToken(); } catch (e2) {}
          var bye = function () { window.location.href = '/'; };
          try { auth.signOut().then(bye, bye); } catch (e3) { bye(); }
        }).catch(function (err) {
          delGo.disabled = false; delGo.textContent = 'Permanently delete';
          toast('error', (err && err.message) === 'billing_cleanup_failed'
            ? "We couldn't close your subscription. Try again in a minute or contact us."
            : "Couldn't delete your account. Please try again or contact us.");
        });
      });
    }

    // Preference toggles → persisted via vendor/me/preferences
    var prefMap = {
      'toggle-notify-inquiry'      : 'notify_inquiry',
      'toggle-notify-announcements': 'notify_announcements',
      'toggle-notify-promotional'  : 'notify_promotional',
      'toggle-notify-review'       : 'notify_review',
      'toggle-visibility-reviews'  : 'show_public_reviews'
    };
    Object.keys(prefMap).forEach(function (id) {
      var t = $(id); if (!t) return;
      var input = t.tagName === 'INPUT' ? t : inputOf(t);
      if (!input) return;
      input.addEventListener('change', function () {
        savePref(prefMap[id], input.checked, input);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 2026-09-20 (F approved all five suggestions, settings analysis; mockup
  // docs/mockups/vendor-settings-menu-2026-09-20.html) — PAGE REGROUP.
  //   You · Your storefront · Emails · Plan and billing · Close your account
  // Every native node is MOVED or relabelled, never rebuilt, so each id the rest
  // of this file, lokali-billing.js (.div-block-158.stripe a) and the page's
  // Get Verified embed (#settings-current-plan) bind to keeps working. If any
  // anchor is missing the page is left exactly as authored in Webflow.
  // One save model: switches save at once and say "Saved" beside themselves;
  // the two name fields get a bar that appears only when they changed (the
  // Profile page's pattern). The header Save button, which only ever saved the
  // name, is hidden.
  // ---------------------------------------------------------------------------
  var FONT = "'Plus Jakarta Sans',sans-serif";
  var RG_CSS =
    '.lok-set-jump{display:flex;gap:8px;overflow-x:auto;margin:4px 0 18px;padding-bottom:2px;-webkit-overflow-scrolling:touch;}' +
    '.lok-set-jump a{flex:0 0 auto;display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border:1px solid #DEDAEE;border-radius:100px;background:#fff;' +
      'font-family:' + FONT + ';font-size:13.5px;font-weight:700;color:#4A4761;text-decoration:none;}' +
    '.lok-set-jump a:hover,.lok-set-jump a:focus-visible{border-color:#D4BFF9;color:#6002EE;}' +
    '.lok-set-sec{scroll-margin-top:84px;}' +
    '.lok-set-sub{font-family:' + FONT + ';font-size:13.5px;color:#6E6A85;margin:-4px 0 12px;}' +
    '.lok-set-grp{font-family:' + FONT + ';font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6E6A85;margin:18px 0 6px;}' +
    '.lok-set-grp:first-of-type{margin-top:4px;}' +
    '.lok-set-link{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;padding:10px 14px;margin:0 0 10px;border:1px solid #DEDAEE;border-radius:12px;' +
      'background:#F7F6FC;text-decoration:none;font-family:' + FONT + ';}' +
    '.lok-set-link:hover,.lok-set-link:focus-visible{border-color:#D4BFF9;background:#EEE6FF;}' +
    '.lok-set-link b{display:block;font-size:15px;font-weight:600;color:#1A1829;}' +
    '.lok-set-link span{display:block;font-size:13px;color:#6E6A85;}' +
    '.lok-set-link i{font-style:normal;font-size:14px;font-weight:700;color:#6002EE;flex:0 0 auto;}' +
    '.lok-set-tog{display:flex !important;align-items:center;justify-content:flex-end;gap:8px;flex:0 0 auto;margin:0 !important;padding:0 !important;}' +
    // .w-embed carries clearfix ::before/::after; as flex items they put a gap to the
    // RIGHT of the switch, so a tapped switch sat 8px left of its neighbours.
    '.lok-set-tog::before,.lok-set-tog::after{display:none !important;content:none !important;}' +
    '.lok-set-tog label.lk-toggle{margin:0 !important;flex:0 0 auto;}' +
    // Billing row: the native lilac pill was built around one sentence-long link.
    '.lok-set-sec .div-block-158.stripe{background:transparent !important;padding:0 !important;border-radius:0 !important;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;}' +
    '.lok-set-sec .div-block-158.stripe .lok-set-billnote{flex:1 1 240px;min-width:0;}' +
    '.lok-set-sec .div-block-158.stripe a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid #DEDAEE;border-radius:10px;background:#fff;text-decoration:none;flex:0 0 auto;}' +
    '.lok-set-sec .div-block-158.stripe a:hover{border-color:#D4BFF9;background:#EEE6FF;}' +
    '.lok-set-sec .div-block-158.stripe a img{display:none;}' +
    '.lok-set-sec .div-block-158.stripe a .text-link{font-family:' + FONT + ';font-size:14px;font-weight:700;color:#4A4761;margin:0;}' +
    '.lok-set-saved{font-family:' + FONT + ';font-size:12.5px;font-weight:700;color:#1B7A4B;opacity:0;transition:opacity .2s;min-width:42px;text-align:right;}' +
    '.lok-set-saved.on{opacity:1;}' +
    '.lok-set-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:10px;border:1px solid #D4BFF9;background:#fff;' +
      'font-family:' + FONT + ';font-size:14px;font-weight:700;color:#6002EE;cursor:pointer;flex:0 0 auto;}' +
    '.lok-set-btn:hover{background:#EEE6FF;}' +
    '.lok-set-btn.pri{background:#6002EE;border-color:#6002EE;color:#fff;}.lok-set-btn.pri:hover{background:#3D00E0;}' +
    '.lok-set-btn.quiet{border-color:#DEDAEE;color:#4A4761;}' +
    '.lok-set-break{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:0 0 16px;margin:0 0 16px;border-bottom:1px solid #EEEDF6;}' +
    '.lok-set-break>div{flex:1 1 240px;min-width:0;}' +
    '.lok-set-break b{display:block;font-family:' + FONT + ';font-size:15px;font-weight:700;color:#1A1829;}' +
    '.lok-set-break span{display:block;font-family:' + FONT + ';font-size:13.5px;color:#6E6A85;}' +
    '#lok-set-namebar{display:none;position:sticky;bottom:12px;z-index:50;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:16px;padding:10px 12px 10px 16px;' +
      'background:#fff;border:1px solid #D4BFF9;border-radius:14px;box-shadow:0 10px 28px rgba(38,10,80,.16);font-family:' + FONT + ';font-size:14px;font-weight:600;color:#1A1829;}' +
    '#lok-set-namebar.on{display:flex;}' +
    '#lok-set-namebar>span:last-child{display:flex;gap:8px;}' +
    // Phone: the longer switch titles must wrap instead of pushing the switch
    // off the card (the title + plan badge pair was a no-wrap flex row).
    '.lok-set-sec .div-block-161,.lok-set-sec .div-block-164{flex-wrap:wrap;}' +
    '.lok-set-sec .div-block-160>div:first-child,.lok-set-sec .div-block-162>div:first-child,.lok-set-sec .div-block-163>div:first-child{flex:1 1 auto;min-width:0;}' +
    '@media (prefers-reduced-motion:reduce){.lok-set-saved{transition:none;}}';

  function sectionOf(id) { var e = $(id); return e && e.closest ? e.closest('section') : null; }
  function toggleInput(id) { var t = $(id); return t ? (t.tagName === 'INPUT' ? t : inputOf(t)) : null; }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function setHeading(sec, text) {
    var h = sec.querySelector('.section-heading');
    if (h && !h.children.length) h.textContent = text;
  }
  // Retitle a switch row. Only text nodes change; the plan badge and the
  // Pro pill that sit beside some headers are left alone.
  function retitle(toggleId, title, desc) {
    var t = $(toggleId); if (!t || !t.parentNode) return;
    var row = t.parentNode;
    var h = row.querySelector('.notifications-header, .visibility-header');
    if (h && title) {
      var done = false;
      for (var i = 0; i < h.childNodes.length; i++) {
        if (h.childNodes[i].nodeType === 3 && h.childNodes[i].nodeValue.trim()) { h.childNodes[i].nodeValue = title; done = true; break; }
      }
      if (!done) h.insertBefore(document.createTextNode(title), h.firstChild);
    }
    var d = row.querySelector('.settings-lokali-text');
    if (d && desc != null) d.textContent = desc;
    var input = toggleInput(toggleId);
    if (input && title) { input.setAttribute('role', 'switch'); input.setAttribute('aria-label', title); }
  }

  // Every switch host gets the same layout (and its hidden 'Saved' chip) up front,
  // so the switches share one right edge whether or not they have been tapped.
  function savedChip(inputEl) {
    if (!inputEl || !inputEl.closest) return null;
    var lab = inputEl.closest('label'); if (!lab || !lab.parentNode) return null;
    var host = lab.parentNode;
    var chip = host.querySelector('.lok-set-saved');
    if (!chip) {
      chip = mk('span', 'lok-set-saved', 'Saved');
      chip.setAttribute('aria-live', 'polite');
      host.classList.add('lok-set-tog');
      host.insertBefore(chip, lab);
    }
    return chip;
  }
  // "Saved", right beside the switch that was tapped.
  function flashSaved(inputEl) {
    var chip = savedChip(inputEl); if (!chip) return;
    chip.classList.add('on');
    clearTimeout(chip._t);
    chip._t = setTimeout(function () { chip.classList.remove('on'); }, 1800);
  }

  // Name fields: the bar shows only while they differ from the saved name.
  function nameInputs() {
    return [inputOf(firstEl(['settings-first-name', 'First-Name-Input'])), inputOf(firstEl(['settings-last-name', 'Last-Name-Input']))];
  }
  function syncNameBar() {
    var bar = $('lok-set-namebar'); if (!bar) return;
    var n = nameInputs();
    var dirty = (n[0] && String(n[0].value || '').trim() !== String((_user && _user.first_name) || '')) ||
                (n[1] && String(n[1].value || '').trim() !== String((_user && _user.last_name) || ''));
    bar.classList.toggle('on', !!dirty);
  }

  // "Need a break?" row state follows the storefront switch.
  function syncBreakRow() {
    var btn = $('lok-set-hide'); if (!btn) return;
    var live = !(_vendor && _vendor.is_active === false);
    btn.textContent = live ? 'Hide my storefront' : 'Show my storefront again';
    var t = $('lok-set-break-title'), d = $('lok-set-break-desc');
    if (t) t.textContent = live ? 'Need a break?' : 'Your storefront is hidden';
    if (d) d.textContent = live
      ? 'Hide your storefront and keep everything: your listings, your reviews and your founding spot.'
      : 'Shoppers cannot find you right now. Everything is kept, and one tap brings it back.';
  }

  // One switch that pauses every OPTIONAL email. Customer messages are never
  // part of it. A convenience over the switches above, not a new stored flag:
  // it remembers which ones it turned off (this browser only) and turns those
  // back on. Switches a plan has locked are skipped.
  var PAUSE_KEY = 'LOKALI_EMAIL_PAUSE';
  var PAUSE_PREFS = { 'toggle-notify-review': 'notify_review', 'toggle-notify-announcements': 'notify_announcements', 'toggle-notify-promotional': 'notify_promotional' };
  var PAUSE_PERSON = ['toggle-notify-circle', 'toggle-notify-letter'];
  function readPause() { try { var v = JSON.parse(localStorage.getItem(PAUSE_KEY) || 'null'); return v && v.length ? v : null; } catch (e) { return null; } }
  function writePause(v) { try { if (v) localStorage.setItem(PAUSE_KEY, JSON.stringify(v)); else localStorage.removeItem(PAUSE_KEY); } catch (e) {} }
  function setPaused(on, pauseInput) {
    var snap = on ? [] : (readPause() || []);
    var prefPayload = {}, prefInputs = [];
    Object.keys(PAUSE_PREFS).forEach(function (id) {
      var inp = toggleInput(id); if (!inp || inp.disabled) return;
      if (on ? inp.checked : (snap.indexOf(id) >= 0 && !inp.checked)) {
        if (on) snap.push(id);
        inp.checked = !on; prefPayload[PAUSE_PREFS[id]] = !on; prefInputs.push(inp);
      }
    });
    var person = [];
    PAUSE_PERSON.forEach(function (id) {
      var inp = toggleInput(id); if (!inp || inp.disabled) return;
      if (on ? inp.checked : (snap.indexOf(id) >= 0 && !inp.checked)) { if (on) snap.push(id); person.push(inp); }
    });
    if (on && !snap.length) {
      if (pauseInput) pauseInput.checked = false;
      toast('info', 'Your optional emails are already off.');
      return;
    }
    writePause(on ? snap : null);
    // The three storefront preferences go in ONE write (the row may not exist
    // yet, and parallel first inserts would race); the two person-level
    // newsletters reuse their own handlers, which also mirror to Brevo.
    if (prefInputs.length && window.LokaliAPI.vendors && window.LokaliAPI.vendors.updatePreferences) {
      window.LokaliAPI.vendors.updatePreferences(prefPayload).then(function (res) {
        if (res && res.error) throw new Error('save');
        _prefs = (res.data && res.data.value) || res.data || _prefs;
        prefInputs.forEach(flashSaved);
      }).catch(function () {
        prefInputs.forEach(function (inp) { inp.checked = on; });
        writePause(null);
        if (pauseInput) pauseInput.checked = !on;
        toast('error', 'Could not save your email choices. Please try again.');
      });
    }
    person.forEach(function (inp, i) {
      setTimeout(function () {
        inp.checked = !on; inp._lokBulk = true;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        inp._lokBulk = false;
      }, 300 * i);
    });
    flashSaved(pauseInput);
  }
  function mountPauseRow(section) {
    if ($('toggle-pause-optional')) return;
    var anchor = $('toggle-notify-announcements');
    var ref = anchor && anchor.closest ? anchor.closest('.div-block-160') : null;
    if (!ref) return;
    var row = mk('div', ref.className || 'div-block-160');
    var txt = mk('div');
    txt.appendChild(mk('div', 'notifications-header', 'Pause every optional email'));
    txt.appendChild(mk('div', 'settings-lokali-text', 'Customer messages still reach you.'));
    var embed = mk('div', anchor.className || 'w-embed');
    embed.id = 'toggle-pause-optional';
    // Static markup only (no interpolation), same as the sibling embeds.
    embed.innerHTML = '<label class="lk-toggle"><input type="checkbox" /><span class="lk-toggle-track"><span class="lk-toggle-thumb"></span></span></label>';
    row.appendChild(txt); row.appendChild(embed);
    section.appendChild(row);
    var input = inputOf(embed); if (!input) return;
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-label', 'Pause every optional email');
    var all = Object.keys(PAUSE_PREFS).concat(PAUSE_PERSON);
    function anyOn() { return all.some(function (id) { var i = toggleInput(id); return i && !i.disabled && i.checked; }); }
    if (readPause() && !anyOn()) input.checked = true; else writePause(null);
    input.addEventListener('change', function () { setPaused(input.checked, input); });
    // Turning any one back on by hand ends the pause.
    all.forEach(function (id) {
      var i = toggleInput(id); if (!i) return;
      i.addEventListener('change', function () { if (!i._lokBulk && i.checked && input.checked) { input.checked = false; writePause(null); } });
    });
  }

  function regroup() {
    if ($('lok-set-css')) return;
    var sYou = sectionOf('settings-email'), sPlan = sectionOf('settings-current-plan'),
        sMail = sectionOf('toggle-notify-inquiry'), sStore = sectionOf('toggle-visibility-public'),
        sClose = sectionOf('settings-delete');
    if (!sYou || !sPlan || !sMail || !sStore || !sClose || !sYou.parentNode) return;
    var st = mk('style'); st.id = 'lok-set-css'; st.textContent = RG_CSS; document.head.appendChild(st);
    var form = sYou.parentNode;

    // Order. The Get Verified card is injected by the page embed right after the
    // plan section (it may land before or after this runs), so it follows it.
    form.insertBefore(sStore, sYou.nextSibling);
    form.insertBefore(sMail, sStore.nextSibling);
    form.insertBefore(sPlan, sMail.nextSibling);
    var verify = $('lok-verify-section');
    if (verify) form.insertBefore(verify, sPlan.nextSibling);
    var secs = [[sYou, 'set-you', 'You'], [sStore, 'set-storefront', 'Your storefront'], [sMail, 'set-emails', 'Emails'],
                [sPlan, 'set-plan', 'Plan and billing'], [sClose, 'set-close', 'Close your account']];
    var jump = mk('nav', 'lok-set-jump'); jump.setAttribute('aria-label', 'Settings sections');
    secs.forEach(function (x) {
      if (!x[0].id) x[0].id = x[1];
      x[0].classList.add('lok-set-sec');
      setHeading(x[0], x[2]);
      var a = mk('a', '', x[2] === 'Close your account' ? 'Close account' : x[2]); a.href = '#' + x[0].id;
      jump.appendChild(a);
    });
    var formWrap = form.parentNode;
    if (formWrap && formWrap.parentNode) formWrap.parentNode.insertBefore(jump, formWrap);

    // Header: the Save button only ever saved the name; the name bar replaces it.
    var saveBtn = $('settings-save-btn'); if (saveBtn) saveBtn.style.display = 'none';
    var sub = document.querySelector('.div-block-45 .subheader');
    if (sub) sub.textContent = 'Your sign-in, your storefront, the emails we send and your plan.';

    // You
    var acctType = $('settings-account-type'); if (acctType && acctType.parentNode) acctType.parentNode.style.display = 'none';
    var ce = document.querySelector('#settings-change-email .text-link'); if (ce) ce.textContent = 'Change email';
    var cp = $('settings-change-password');
    if (cp) {
      var cpt = cp.querySelector('.text-link'); if (cpt) cpt.textContent = 'Change password';
      var pwd = cp.parentNode ? cp.parentNode.querySelector('.settings-lokali-text') : null;
      if (pwd) pwd.textContent = 'Opens the secure sign-in panel.';
    }
    var bar = mk('div'); bar.id = 'lok-set-namebar';
    bar.appendChild(mk('span', '', 'You changed your name'));
    var acts = mk('span');
    var discard = mk('button', 'lok-set-btn quiet', 'Discard'); discard.type = 'button';
    var save = mk('button', 'lok-set-btn pri', 'Save'); save.type = 'button';
    acts.appendChild(discard); acts.appendChild(save); bar.appendChild(acts);
    form.appendChild(bar);
    nameInputs().forEach(function (inp) { if (inp) inp.addEventListener('input', syncNameBar); });
    save.addEventListener('click', function () { saveProfile(); });
    discard.addEventListener('click', function () {
      var n = nameInputs();
      if (n[0]) n[0].value = (_user && _user.first_name) || '';
      if (n[1]) n[1].value = (_user && _user.last_name) || '';
      syncNameBar();
    });

    // Your storefront: the three ways to step back, lightest first. The first
    // two live on Availability and are linked, not moved.
    var firstRow = $('toggle-visibility-public'); firstRow = firstRow ? firstRow.parentNode : null;
    if (firstRow && firstRow.parentNode === sStore) {
      sStore.insertBefore(mk('div', 'lok-set-sub', 'Three ways to step back, from lightest to heaviest.'), firstRow);
      [['Not taking new clients', 'Your storefront stays up and shoppers see you are full. On Availability.'],
       ['Away until a date', 'Shows shoppers the day you are back, then switches itself off. On Availability.']].forEach(function (l) {
        var a = mk('a', 'lok-set-link'); a.href = '/vendor-dashboard/availability';
        var d = mk('div'); d.appendChild(mk('b', '', l[0])); d.appendChild(mk('span', '', l[1]));
        a.appendChild(d); a.appendChild(mk('i', '', 'Open'));
        sStore.insertBefore(a, firstRow);
      });
    }
    retitle('toggle-visibility-public', 'Show my storefront on Lokali', 'Off hides you from The Market and search, and your link shows a not available message. Nothing is deleted.');
    retitle('toggle-visibility-reviews', 'Show reviews on my storefront', 'Off keeps collecting reviews privately.');
    var slug = $('lok-slug-section'); if (slug) sStore.appendChild(slug);

    // Emails: by who they are from, one pause switch at the end.
    retitle('toggle-notify-inquiry', 'A customer sends you a message', 'Includes the reminder when a message is still waiting for a reply.');
    retitle('toggle-notify-review', 'Someone leaves a review', null);
    retitle('toggle-notify-announcements', 'Product news and tips', null);
    retitle('toggle-notify-promotional', 'Offers and spotlight openings', null);
    ['toggle-notify-circle', 'toggle-notify-letter'].forEach(function (id) {
      var i = toggleInput(id); if (i) i.setAttribute('role', 'switch');
    });
    function rowOf(id) { var t = $(id); return t && t.parentNode && t.parentNode.parentNode === sMail ? t.parentNode : null; }
    function put(node) { if (node) sMail.appendChild(node); }
    put(mk('div', 'lok-set-grp', 'About your business'));
    put(rowOf('toggle-notify-inquiry')); put(rowOf('toggle-notify-review'));
    put(mk('div', 'lok-set-grp', 'From Lokali'));
    put(rowOf('toggle-notify-announcements')); put(rowOf('toggle-notify-circle'));
    put(rowOf('toggle-notify-letter')); put(rowOf('toggle-notify-promotional'));
    mountPauseRow(sMail);
    Array.prototype.forEach.call(document.querySelectorAll('.lok-set-sec label.lk-toggle input'), savedChip);

    // On Free, populate() adds a 'Pro & Featured' pill that links to pricing; the
    // native 'Pro & Featured only' badge beside it said the same thing twice.
    Array.prototype.forEach.call(document.querySelectorAll('.lok-pro-pill'), function (pill) {
      var r = pill.closest ? pill.closest('.div-block-160, .div-block-163') : null;
      var badge = r ? r.querySelector('.plan-badge') : null;
      if (badge) badge.style.display = 'none';
    });

    // Plan and billing
    var vp = document.querySelector('#settings-view-plans .text-link'); if (vp) vp.textContent = 'Compare plans';
    var stripeLink = document.querySelector('.div-block-158.stripe a');
    if (stripeLink) {
      var sl = stripeLink.querySelector('.text-link') || stripeLink;
      sl.textContent = 'Manage billing';
      if (!stripeLink.parentNode.querySelector('.lok-set-billnote')) {
        stripeLink.parentNode.insertBefore(mk('div', 'settings-lokali-text lok-set-billnote', 'Cards and invoices open in Stripe, our payment partner, on a secure page.'), stripeLink);
      }
    }

    // Close your account: the gentle option first, and a true delete sentence
    // (the route deletes at once; nobody at Lokali reviews it).
    var del = $('settings-delete');
    var delRow = del ? del.parentNode : null;
    if (delRow && delRow.parentNode === sClose) {
      var br = mk('div', 'lok-set-break');
      var bt = mk('div');
      var t1 = mk('b'); t1.id = 'lok-set-break-title';
      var t2 = mk('span'); t2.id = 'lok-set-break-desc';
      bt.appendChild(t1); bt.appendChild(t2);
      var hide = mk('button', 'lok-set-btn'); hide.type = 'button'; hide.id = 'lok-set-hide';
      br.appendChild(bt); br.appendChild(hide);
      sClose.insertBefore(br, delRow);
      hide.addEventListener('click', function () {
        var live = !(_vendor && _vendor.is_active === false);
        setListingVisible(!live, toggleInput('toggle-visibility-public'));
      });
      syncBreakRow();
      var dd = delRow.querySelector('.settings-lokali-text');
      if (dd) dd.textContent = 'Removes your storefront, your listings and your sign-in right away, and cancels any subscription. This cannot be undone.';
    }
  }

  function saveProfile() {
    var fn = inputOf(firstEl(['settings-first-name', 'First-Name-Input']));
    var ln = inputOf(firstEl(['settings-last-name', 'Last-Name-Input']));
    // A missing or blank input stays out of the payload — sending '' would
    // wipe the stored name on every save.
    var payload = {};
    var fnVal = fn ? String(fn.value || '').trim() : '';
    var lnVal = ln ? String(ln.value || '').trim() : '';
    if (fnVal) payload.first_name = fnVal;
    if (lnVal) payload.last_name = lnVal;
    // A blanked field keeps its saved value — SAY so instead of silently
    // no-oping (both blank) or claiming a clean save (one blank).
    var kept = (fn && !fnVal) || (ln && !lnVal);
    if (!fnVal && !lnVal) {
      toast('error', 'Name fields can’t be blank, so your saved name was kept.');
      if (fn && _user.first_name) fn.value = _user.first_name;
      if (ln && _user.last_name) ln.value = _user.last_name;
      return;
    }
    var btn = $('settings-save-btn');
    if (btn) btn.setAttribute('disabled', 'disabled');
    window.LokaliAPI.auth.updateProfile(payload).then(function (res) {
      if (res.error) { toast('error', res.error || 'Could not save. Please try again.'); return; }
      var u = (res.data && res.data.value) || res.data || {};
      if (u.first_name != null) _user.first_name = u.first_name;
      if (u.last_name != null) _user.last_name = u.last_name;
      if (kept) {
        if (fn && !fnVal && _user.first_name) fn.value = _user.first_name;
        if (ln && !lnVal && _user.last_name) ln.value = _user.last_name;
      }
      toast('success', kept ? 'Saved. Blank fields kept their previous value.' : 'Name saved.');
      syncNameBar();
    }).catch(function () {
      toast('error', 'Network error. Please try again.');
    }).then(function () { if (btn) btn.removeAttribute('disabled'); });
  }

  function setListingVisible(visible, visInput) {
    var fn = visible ? window.LokaliAPI.vendors.reactivate : window.LokaliAPI.vendors.deactivate;
    if (!fn) { toast('error', 'Action unavailable.'); return; }
    fn().then(function (res) {
      if (res.error) {
        toast('error', res.error || 'Could not update visibility.');
        if (visInput) visInput.checked = !visible; // revert
        return;
      }
      if (_vendor) _vendor.is_active = visible;
      if (visInput) visInput.checked = visible;
      flashSaved(visInput);
      syncBreakRow();
      toast('success', visible ? 'Your storefront is live.' : 'Your storefront is hidden. Nothing was deleted.');
    }).catch(function () {
      toast('error', 'Network error. Please try again.');
      if (visInput) visInput.checked = !visible;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
