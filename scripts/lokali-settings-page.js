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
    // #230 (found 2026-10-29): this used to write the ROW's textContent, which
    // threw away the native "View Plans" link (#settings-view-plans) on every
    // load, so Settings never showed a way to change plan. Write the text
    // child only; the row keeps its link (and lokali-billing.js's additions).
    var planRow = $('settings-current-plan');
    setText((planRow && planRow.querySelector('.settings-lokali-text')) || planRow,
      _titlecase(_plan || 'free') + (_planEnds ? ' · ends ' + _planEnds : ''));

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
        var sa = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.account; // mirror lives on the client, not the adapter
        if (sa && sa.syncNewsletter) sa.syncNewsletter();
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
        var sc = window.LokaliSupabaseAPI && window.LokaliSupabaseAPI.account;
        if (sc && sc.syncCircle) sc.syncCircle();
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

    // #230: the plan link opens the in-app plan picker when lokali-billing.js
    // has one (it intercepts /pricing clicks on dashboard pages in the capture
    // phase, so this handler never runs then); otherwise the pricing page.
    var viewPlans = $('settings-view-plans');
    if (viewPlans) {
      if (viewPlans.getAttribute('href') === '#' || !viewPlans.getAttribute('href')) viewPlans.setAttribute('href', '/pricing');
      viewPlans.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.LokaliUpgrade && typeof window.LokaliUpgrade.open === 'function') { window.LokaliUpgrade.open({ source: 'settings' }); return; }
        window.location.href = (typeof window.LOKALI_PRICING_URL === 'string' && window.LOKALI_PRICING_URL) || '/pricing';
      });
    }

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
    '.lok-set-grp{font-family:' + FONT + ';font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6E6A85;margin:18px 0 6px;}' +
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
    // #215 Your storefronts (link / switch / disconnect)
    '.lok-set-btn.danger{border-color:#F3C6C6;color:#B42318;}.lok-set-btn.danger:hover{background:#FDF1F1;}' +
    '.lok-set-btn[disabled]{opacity:.55;cursor:default;}' +
    '.lok-sf{font-family:' + FONT + ';margin:0 0 8px;scroll-margin-top:84px;}' +
    '.lok-sf-head{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6E6A85;margin:22px 0 6px;}' +
    '.lok-sf-sub{font-size:13.5px;line-height:1.5;color:#6E6A85;margin:0 0 12px;}' +
    '.lok-sf-list{display:flex;flex-direction:column;gap:8px;margin:0 0 12px;}' +
    '.lok-sf-row{display:flex;align-items:center;gap:12px;min-height:60px;padding:10px 12px 10px 10px;border:1px solid #DEDAEE;border-radius:12px;background:#fff;}' +
    '.lok-sf-row.is-current{background:#F7F6FC;}' +
    '.lok-sf-av{position:relative;width:40px;height:40px;border-radius:10px;background:#F0E6FF;color:#6002EE;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto;text-transform:uppercase;}' +
    '.lok-sf-av img{width:100%;height:100%;object-fit:cover;display:block;border-radius:10px;box-shadow:inset 0 0 0 1px #EEEDF6;}' +
    // #215b hot-pink unread dot (#EE0290, F 2026-10-12 'brighter') on the logo + a pink count line
    // (the count text stays #B1006A: #EE0290 is 4.2:1, under AA for 13px text).
    '.lok-sf-pdot{position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:#EE0290;box-shadow:0 0 0 2px #fff;}' +
    '.lok-sf-txt span.new{color:#B1006A;font-weight:700;}' +
    '.lok-sf-txt{flex:1 1 auto;min-width:0;}' +
    '.lok-sf-txt b{display:block;font-size:15px;font-weight:600;color:#1A1829;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.lok-sf-txt span{display:block;font-size:13px;color:#6E6A85;}' +
    '.lok-sf-txt span.on{color:#1B7A4B;font-weight:600;}' +
    '.lok-sf-acts{display:flex;gap:8px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end;}' +
    '.lok-sf-form{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch;}' +
    '.lok-sf-form input{flex:1 1 240px;min-width:0;min-height:44px;padding:0 14px;border:1.5px solid #DEDAEE;border-radius:10px;background:#FDFCFF;font-family:' + FONT + ';font-size:15px;color:#1A1829;outline:none;}' +
    '.lok-sf-form input:focus{border-color:#6002EE;box-shadow:0 0 0 3px rgba(96,2,238,.12);}' +
    '.lok-sf-msg{font-size:13.5px;line-height:1.5;margin:10px 0 0;color:#6E6A85;}' +
    '.lok-sf-msg.err{color:#B42318;}.lok-sf-msg.ok{color:#1B7A4B;}' +
    '.lok-sf-ask{border:1px solid #D4BFF9;background:#F7F3FF;border-radius:14px;padding:16px;margin:0 0 14px;}' +
    '.lok-sf-ask b{display:block;font-size:16px;font-weight:700;color:#1A1829;margin:0 0 4px;}' +
    '.lok-sf-ask p{font-size:14px;line-height:1.5;color:#4A4761;margin:0 0 12px;}' +
    '.lok-sf-ask .lok-sf-acts{justify-content:flex-start;}' +
    // #217 Add another business / Link your storefronts panels
    '.lok-sf-btns{display:flex;gap:10px;flex-wrap:wrap;}' +
    '.lok-sf-panel{border:1px solid #DEDAEE;background:#FDFCFF;border-radius:14px;padding:16px;margin:12px 0 0;}' +
    '.lok-sf-panel>b{display:block;font-size:16px;font-weight:700;color:#1A1829;margin:0 0 12px;}' +
    '.lok-sf-field{display:block;margin:0 0 14px;}' +
    '.lok-sf-field>span{display:block;font-size:13px;font-weight:600;color:#4A4761;margin:0 0 6px;}' +
    '.lok-sf-field input{display:block;width:100%;box-sizing:border-box;min-height:44px;padding:0 14px;border:1.5px solid #DEDAEE;border-radius:10px;background:#fff;font-family:' + FONT + ';font-size:15px;color:#1A1829;outline:none;}' +
    '.lok-sf-field input:focus{border-color:#6002EE;box-shadow:0 0 0 3px rgba(96,2,238,.12);}' +
    '.lok-sf-hint{font-size:13px;line-height:1.5;color:#6E6A85;margin:6px 0 12px;overflow-wrap:anywhere;}' +
    '.lok-sf-field .lok-sf-hint{margin-bottom:0;}' +
    '.lok-sf-panel .lok-sf-acts{justify-content:flex-start;}' +
    '.lok-sf-panel .lok-sf-form input{background:#fff;}' +
    '@media (max-width:560px){.lok-sf-row{flex-wrap:wrap;}.lok-sf-acts{flex-basis:100%;justify-content:flex-start;padding-left:50px;}.lok-sf-ask .lok-sf-acts{padding-left:0;}.lok-sf-panel .lok-sf-acts{padding-left:0;}}' +
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
    // 2026-09-21, measured on the live signed-in page (F's Chrome): bring this page to the
    // same floor as the shopper hub: AA text, 44px tap areas, 16px fields.
    // Slate #8E8BA6 was 3.28:1 on white; #6E6A85 is 5.17:1.
    '.lok-set-sec .settings-header,.lok-set-sec .settings-lokali-text,.lok-set-sec .settings-lokali-text a{color:#6E6A85 !important;}' +
    // #EE0290 was 4.16:1 at 14px; #D1007E is 5.23:1.
    '.lok-set-sec #settings-delete .text-block-94{color:#D1007E !important;}' +
    // Fields under 16px make iOS zoom the whole page on focus (name fields were 12px).
    '.lok-set-sec input[type="text"],.lok-set-sec input[type="email"],.lok-set-sec input:not([type]),#lok-slug-input{font-size:16px !important;}' +
    '#lok-slug-input{min-height:44px;box-sizing:border-box;}' +
    // Text links were 26px tall: same look, 44px tap area.
    '.lok-set-sec .link-block-6{display:inline-flex;align-items:center;min-height:44px;}' +
    // Switches stay 44x24 to the eye; the hit area grows to 44px tall.
    '.lok-set-tog label.lk-toggle{position:relative;}' +
    '.lok-set-tog label.lk-toggle::before{content:"";position:absolute;left:0;right:0;top:-10px;bottom:-10px;}' +
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

  // #215 Your storefronts: one person, several businesses. Each storefront keeps
  // its own login; linking them puts a "Switch to" list in the menus so nobody
  // signs out and back in. Linking = type the other storefront's login email,
  // that inbox gets a confirm link, confirming while signed in there links the
  // two. Any member can disconnect any storefront in the group. The confirm
  // link lands on this page as ?link=<token>.
  // #217 Add another business: a NEW storefront without a second inbox (its login
  // is a "+" version of this one's email); its emailed link uses the same param.
  function mountStorefrontsCard(sYou) {
    var A = window.LokaliSupabaseAPI, SF = A && A.storefronts;
    if (!sYou || !SF || !SF.linked || $('lok-sf')) return;
    var card = mk('div', 'lok-sf'); card.id = 'lok-sf';
    card.appendChild(mk('div', 'lok-sf-head', 'Your storefronts'));
    var sub = mk('p', 'lok-sf-sub'); card.appendChild(sub);
    var ask = mk('div', 'lok-sf-ask'); ask.hidden = true; card.appendChild(ask);
    var list = mk('div', 'lok-sf-list'); card.appendChild(list);
    var formWrap = mk('div'); card.appendChild(formWrap);
    var msg = mk('p', 'lok-sf-msg'); msg.hidden = true; card.appendChild(msg);
    sYou.appendChild(card);
    var mine = (_vendor && (_vendor.business_name || _vendor.name)) || 'this storefront';
    var linked = [], unread = {};
    // #217: which panel is open ('' | 'add' | 'link'), and what was typed in the add
    // panel (render() rebuilds the card, so the draft lives here, not in the inputs).
    var open = '', draft = { name: '', email: '', edited: false };
    var ownEmail = String((_user && _user.email) || '').trim().toLowerCase();
    // info@x.com + "Alma y Letra" -> info+almayletra@x.com: a "+" version of this
    // login's own address, so the new storefront's emails land in the same inbox.
    // An existing tag is replaced (signed in as info+alma@ -> info+newname@).
    function suggestEmail(name) {
      var m = /^([^@\s]+)@([^@\s]+)$/.exec(ownEmail); if (!m) return '';
      var tag = String(name || '').toLowerCase();
      try { tag = tag.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
      tag = tag.replace(/[^a-z0-9]+/g, '').slice(0, 20);
      return tag ? m[1].split('+')[0] + '+' + tag + '@' + m[2] : '';
    }

    function say(kind, text) { msg.hidden = !text; msg.textContent = text || ''; msg.className = 'lok-sf-msg' + (kind ? ' ' + kind : ''); }
    function initials(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || ''); }
    function avatar(sf) {
      var av = mk('div', 'lok-sf-av', sf.profile_photo ? '' : initials(sf.business_name));
      if (sf.profile_photo) { var img = document.createElement('img'); img.alt = ''; if (window.LokaliImg) window.LokaliImg.set(img, sf.profile_photo, 120); else img.src = sf.profile_photo; av.appendChild(img); }
      if ((Number(unread[sf.vendors_id]) || 0) > 0) { var d = mk('span', 'lok-sf-pdot'); d.setAttribute('aria-hidden', 'true'); av.appendChild(d); }
      return av;
    }
    var REQ_ERR = {
      email_invalid: 'That email does not look right.',
      no_account: 'No Lokali login uses that email. Check the address your other storefront signs in with.',
      no_vendor: 'That login has no storefront yet. Open one there first, then link it.',
      not_a_vendor: 'Open a storefront on this account first.',
      admin_account: 'That account cannot be linked.',
      same_login: 'That is the email you are signed in with here. Enter the email of your other storefront.',
      already_linked: 'Those two are already linked.',
      already_sent: 'We sent that email a moment ago. Check the inbox (and spam) before sending another.',
      too_many: 'You have a few requests waiting already. Confirm one of those first, or try again in an hour.',
      email_failed: 'The email could not be sent. Nothing was linked. Try again in a minute.',
      rpc_unavailable: 'Linking is not switched on yet. Try again later.'
    };
    var UNLINK_ERR = { not_linked: 'That storefront is not linked to this one.', no_vendor: 'That storefront no longer exists.' };
    var ADD_ERR = {
      name_required: 'Enter the business name.',
      email_invalid: 'That email does not look right.',
      email_taken: 'That email already has a Lokali login. Use a different one, or link that storefront with Link your storefronts.',
      email_not_yours: 'Use a version of your own email with a + in it, like you+shop@yourdomain.com. A business with its own separate inbox signs up on its own, then joins through Link your storefronts.', // SEC-105
      same_name: 'One of your storefronts already has that name.',
      group_full: 'One group can hold 10 storefronts. Disconnect one first.',
      already_sent: 'We sent that email a moment ago. Check the inbox (and spam) before sending another.',
      too_many: 'You have a few of these waiting already. Finish one of those first, or try again in an hour.',
      not_a_vendor: 'Open a storefront on this account first.',
      admin_account: 'The admin account cannot add storefronts.',
      email_failed: 'The email could not be sent. Nothing was created. Try again in a minute.',
      rpc_unavailable: 'Adding a business is not switched on yet. Try again later.',
      not_enabled: 'Adding a business is not switched on yet. Try again later.'
    };

    function render() {
      list.innerHTML = ''; formWrap.innerHTML = '';
      var others = linked.filter(function (x) { return !x.current; });
      if (!linked.length) {
        sub.textContent = 'Run more than one business? Add it here and a Switch to list appears in your menu, so you move between storefronts without signing out. No second email address needed. Each storefront keeps its own plan and settings.';
      } else {
        sub.textContent = 'Linked storefronts share a Switch to list in your menu. Each keeps its own plan and settings. Disconnect any of them whenever you like.';
        linked.forEach(function (sf) {
          var row = mk('div', 'lok-sf-row' + (sf.current ? ' is-current' : ''));
          row.appendChild(avatar(sf));
          var txt = mk('div', 'lok-sf-txt');
          txt.appendChild(mk('b', '', sf.business_name || 'Storefront'));
          var nNew = Number(unread[sf.vendors_id]) || 0;
          if (nNew > 0 && !sf.current) txt.appendChild(mk('span', 'new', nNew + (nNew === 1 ? ' new notification' : ' new notifications')));
          else txt.appendChild(mk('span', sf.current ? 'on' : '', sf.current ? 'You are here' : (sf.is_active ? 'Live on Lokali' : 'Hidden from Lokali')));
          row.appendChild(txt);
          var acts = mk('div', 'lok-sf-acts');
          if (!sf.current) {
            var sw = mk('button', 'lok-set-btn pri', 'Switch to'); sw.type = 'button';
            sw.addEventListener('click', function () { switchTo(sf, sw); });
            acts.appendChild(sw);
          }
          var dc = mk('button', 'lok-set-btn quiet', 'Disconnect'); dc.type = 'button';
          dc.setAttribute('aria-label', 'Disconnect ' + (sf.business_name || 'this storefront'));
          dc.addEventListener('click', function () { confirmDisconnect(sf, row); });
          acts.appendChild(dc);
          row.appendChild(acts);
          list.appendChild(row);
        });
      }
      // Two ways in, each opening its own panel: Add another business (#217, a new
      // storefront on a "+" version of this login's email) and Link your
      // storefronts (#215, one that already has its own login).
      var btns = mk('div', 'lok-sf-btns');
      var addBtn = mk('button', 'lok-set-btn' + (linked.length ? ' quiet' : ' pri'), 'Add another business'); addBtn.type = 'button';
      var linkBtn = mk('button', 'lok-set-btn quiet', linked.length ? 'Link another storefront' : 'Link your storefronts'); linkBtn.type = 'button';
      addBtn.setAttribute('aria-expanded', open === 'add' ? 'true' : 'false');
      linkBtn.setAttribute('aria-expanded', open === 'link' ? 'true' : 'false');
      btns.appendChild(addBtn); btns.appendChild(linkBtn); formWrap.appendChild(btns);
      addBtn.addEventListener('click', function () { open = open === 'add' ? '' : 'add'; say('', ''); render(); focusPanel(); });
      linkBtn.addEventListener('click', function () { open = open === 'link' ? '' : 'link'; say('', ''); render(); focusPanel(); });
      if (open === 'add') formWrap.appendChild(addPanel());
      if (open === 'link') formWrap.appendChild(linkPanel());
    }

    function focusPanel() { var f = formWrap.querySelector('.lok-sf-panel input'); if (f) try { f.focus(); } catch (e) {} }
    function closePanel() { open = ''; draft = { name: '', email: '', edited: false }; render(); }

    // #217 Add another business: name + the address its emails go to. One email goes
    // to that address; tapping it creates the storefront, linked to this one.
    function addPanel() {
      var p = document.createElement('form'); p.className = 'lok-sf-panel'; p.setAttribute('novalidate', '');
      p.appendChild(mk('b', '', 'Add another business'));
      var f1 = mk('label', 'lok-sf-field'); f1.appendChild(mk('span', '', 'Business name'));
      var nm = document.createElement('input'); nm.type = 'text'; nm.maxLength = 120; nm.autocomplete = 'off'; nm.value = draft.name;
      f1.appendChild(nm); p.appendChild(f1);
      var f2 = mk('label', 'lok-sf-field'); f2.appendChild(mk('span', '', 'Emails for this storefront go to'));
      var em = document.createElement('input'); em.type = 'email'; em.maxLength = 254; em.autocomplete = 'off'; em.value = draft.email;
      var ph = suggestEmail('yourbusiness'); em.placeholder = ph || 'Email for this storefront';
      f2.appendChild(em);
      var hint = mk('p', 'lok-sf-hint'); f2.appendChild(hint); p.appendChild(f2);
      function paintHint() {
        hint.textContent = (draft.email && draft.email === suggestEmail(draft.name))
          ? 'A version of your own email, so its new leads and reviews land in the inbox you already use (' + ownEmail + '). Change it if you prefer another address.'
          : 'New leads and reviews for this storefront go to this address.';
      }
      nm.addEventListener('input', function () {
        draft.name = nm.value;
        if (!draft.edited) { draft.email = suggestEmail(nm.value); em.value = draft.email; }
        paintHint();
      });
      em.addEventListener('input', function () {
        draft.email = em.value.trim().toLowerCase();
        draft.edited = draft.email !== '' && draft.email !== suggestEmail(draft.name);
        paintHint();
      });
      paintHint();
      p.appendChild(mk('p', 'lok-sf-hint', 'We send one email to that address. Tap the button in it and the storefront is created and linked to ' + mine + '.'));
      var acts = mk('div', 'lok-sf-acts');
      var go = mk('button', 'lok-set-btn pri', 'Send the email'); go.type = 'submit';
      var cancel = mk('button', 'lok-set-btn quiet', 'Cancel'); cancel.type = 'button';
      acts.appendChild(go); acts.appendChild(cancel); p.appendChild(acts);
      cancel.addEventListener('click', function () { say('', ''); closePanel(); });
      p.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = nm.value.trim(), email = em.value.trim().toLowerCase();
        if (!name) { say('err', ADD_ERR.name_required); nm.focus(); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('err', ADD_ERR.email_invalid); em.focus(); return; }
        if (email === ownEmail) { say('err', 'That is the email you sign in with here. Use a different one (the suggested one works).'); em.focus(); return; }
        go.disabled = true; cancel.disabled = true; go.textContent = 'Sending…'; say('', '');
        SF.requestAdd(name, email).then(function (res) {
          go.disabled = false; cancel.disabled = false; go.textContent = 'Send the email';
          if (res.error) { say('err', ADD_ERR[res.error] || 'Something went wrong. Nothing was created.'); return; }
          var d = res.data || {}, to = d.email || email;
          closePanel();
          say('ok', 'Check your inbox. We sent a link to ' + to + '. Tap Create my storefront in that email to finish; it is good for 48 hours.' +
            (to.indexOf('+') > 0 ? ' Nothing there after a few minutes? Some email providers do not accept an address with a +. Add the business again with a different email.' : ''));
        }).catch(function () { go.disabled = false; cancel.disabled = false; go.textContent = 'Send the email'; say('err', 'Network error. Nothing was created.'); });
      });
      return p;
    }

    // #215 Link your storefronts: one that already has its own login.
    function linkPanel() {
      var p = mk('div', 'lok-sf-panel');
      p.appendChild(mk('b', '', 'Link a storefront that has its own login'));
      p.appendChild(mk('p', 'lok-sf-hint', 'Type the email that storefront signs in with. We email it a confirm link; confirming there links the two.'));
      var form = document.createElement('form'); form.className = 'lok-sf-form'; form.setAttribute('novalidate', '');
      var inp = document.createElement('input'); inp.type = 'email'; inp.autocomplete = 'off'; inp.maxLength = 254;
      inp.placeholder = 'Login email of your other storefront';
      inp.setAttribute('aria-label', 'Login email of your other storefront');
      var go = mk('button', 'lok-set-btn pri', 'Send the link'); go.type = 'submit';
      form.appendChild(inp); form.appendChild(go); p.appendChild(form);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = inp.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('err', REQ_ERR.email_invalid); inp.focus(); return; }
        go.disabled = true; var was = go.textContent; go.textContent = 'Sending…'; say('', '');
        SF.requestLink(email).then(function (res) {
          go.disabled = false; go.textContent = was;
          if (res.error) { say('err', REQ_ERR[res.error] || 'Something went wrong. Nothing was linked.'); return; }
          var d = res.data || {};
          closePanel();
          say('ok', 'We emailed ' + email + '. Open that email while signed in to ' + (d.to_business || 'the other storefront') + ' and tap Confirm the link. It is good for 48 hours.');
        }).catch(function () { go.disabled = false; go.textContent = was; say('err', 'Network error. Nothing was linked.'); });
      });
      return p;
    }

    function confirmDisconnect(sf, row) {
      if (row.querySelector('.lok-sf-confirm')) return;
      var acts = row.querySelector('.lok-sf-acts'); acts.style.display = 'none';
      var box = mk('div', 'lok-sf-acts lok-sf-confirm');
      var q = mk('span', '', sf.current ? 'Disconnect ' + mine + ' from the others?' : 'Disconnect ' + (sf.business_name || 'this storefront') + '?');
      q.style.cssText = 'font-size:13.5px;color:#4A4761;align-self:center;';
      var yes = mk('button', 'lok-set-btn danger', 'Disconnect'); yes.type = 'button';
      var no = mk('button', 'lok-set-btn quiet', 'Keep'); no.type = 'button';
      box.appendChild(q); box.appendChild(yes); box.appendChild(no); row.appendChild(box);
      no.addEventListener('click', function () { row.removeChild(box); acts.style.display = ''; });
      yes.addEventListener('click', function () {
        yes.disabled = true; yes.textContent = 'Disconnecting…';
        SF.unlink(sf.vendors_id).then(function (res) {
          var d = res && res.data;
          if (res.error || !d || d.ok !== true) { yes.disabled = false; yes.textContent = 'Disconnect'; say('err', UNLINK_ERR[d && d.reason] || 'Could not disconnect. Try again.'); return; }
          linked = Array.isArray(d.storefronts) ? d.storefronts : [];
          if (linked.length === 1) linked = [];   // a group of one is no group
          render();
          say('ok', (sf.business_name || 'That storefront') + ' is disconnected. You can link it again any time.');
        }).catch(function () { yes.disabled = false; yes.textContent = 'Disconnect'; say('err', 'Network error. Nothing changed.'); });
      });
      try { yes.focus(); } catch (e) {}
    }

    function switchTo(sf, btn, label) {
      var was = label || 'Switch to';
      btn.disabled = true; btn.textContent = 'Switching…'; say('', '');
      SF.switchTo(sf.vendors_id).then(function (res) {
        if (res.error) { btn.disabled = false; btn.textContent = was; say('err', 'Could not switch right now. Try again.'); return; }
        window.location.href = '/vendor-dashboard/dashboard';
      }).catch(function () { btn.disabled = false; btn.textContent = was; say('err', 'Network error. You are still signed in here.'); });
    }

    // #217: an "Add another business" email lands on this page with the same ?link=
    // param as #215 (a token the link flow does not know comes here). Tapping that
    // email was the yes, so the storefront is created straight away.
    function addProblem(reason, d) {
      ask.innerHTML = '';
      var biz = d.business_name || 'This storefront';
      if (reason === 'wrong_account') {
        ask.appendChild(mk('b', '', 'Sign in to ' + (d.from_business || 'your storefront') + ' to finish'));
        ask.appendChild(mk('p', '', biz + ' is being added to ' + (d.from_business || 'another storefront') + ', so only that storefront’s login' +
          (d.from_email_masked ? ' (' + d.from_email_masked + ')' : '') + ', or one linked with it, can finish. Sign out, sign in there, then open the email link again.'));
        var a0 = mk('div', 'lok-sf-acts'); var so = mk('button', 'lok-set-btn', 'Sign out'); so.type = 'button';
        so.addEventListener('click', function () { if (window.LokaliAuth && window.LokaliAuth.signOut) window.LokaliAuth.signOut().then(function () { window.location.href = '/login'; }); else window.location.href = '/login'; });
        a0.appendChild(so); ask.appendChild(a0);
        return;
      }
      var WHY = {
        used: [biz + ' is already created', 'It is in your Switch to list. Nothing else to do.'],
        expired: ['This link has expired', 'Nothing was created. Add the business again from Your storefronts to get a new link.'],
        email_taken: ['That email is already in use', (d.email || 'That address') + ' became a Lokali login after this link was sent, so nothing was created. Add the business again with a different email.'],
        group_full: ['Too many linked storefronts', 'One group can hold 10 storefronts. Disconnect one, then add the business again.'],
        no_request: ['This link cannot be used', 'This link is not valid. Add the business again, or ask for a new link from the other storefront’s Settings.']
      };
      var w = WHY[reason] || ['Could not create the storefront', 'Nothing was created. Open the email link again in a minute.'];
      ask.appendChild(mk('b', '', w[0])); ask.appendChild(mk('p', '', w[1]));
    }
    function handleAdd(token) {
      ask.innerHTML = ''; ask.appendChild(mk('b', '', 'Checking the link…'));
      SF.viewAdd(token).then(function (res) {
        var d = res.data || {};
        if (res.error) { addProblem(res.error, d); return; }
        ask.innerHTML = '';
        ask.appendChild(mk('b', '', 'Creating ' + (d.business_name || 'your storefront') + '…'));
        ask.appendChild(mk('p', '', 'This takes a few seconds.'));
        return SF.createAdd(token).then(function (r2) {
          var d2 = r2.data || {};
          if (r2.error || d2.ok !== true) { addProblem(r2.error || 'create_failed', d2); return; }
          if (Array.isArray(d2.storefronts)) { linked = d2.storefronts; render(); }
          var name = d2.business_name || d.business_name || 'Your new storefront';
          ask.innerHTML = '';
          ask.appendChild(mk('b', '', name + ' is ready'));
          ask.appendChild(mk('p', '', 'It is linked to ' + mine + ' and stays hidden from shoppers until you finish its profile and add a first listing. New leads and reviews for it go to ' + (d2.email || d.email || 'its email') + '.'));
          var a1 = mk('div', 'lok-sf-acts');
          var label = 'Switch to ' + name + ' and set it up';
          var sw = mk('button', 'lok-set-btn pri', label); sw.type = 'button';
          sw.addEventListener('click', function () { switchTo({ vendors_id: d2.vendors_id }, sw, label); });
          a1.appendChild(sw); ask.appendChild(a1);
          // Re-read after the create committed, so the list loaded at mount (which may
          // land later on a slow connection) can never put the old one back.
          SF.linked().then(function (r3) { if (!r3.error && (r3.data || []).length) { linked = r3.data; render(); } }).catch(function () {});
        });
      }).catch(function () { ask.innerHTML = ''; ask.appendChild(mk('b', '', 'Could not check the link')); ask.appendChild(mk('p', '', 'Nothing was created. Try opening the email link again.')); });
    }

    // An incoming confirm link (?link=<token>). Shown above the list; the token
    // leaves the URL at once so a reload or a shared screenshot cannot replay it.
    function handleIncoming() {
      var token = '';
      try { token = new URLSearchParams(window.location.search).get('link') || ''; } catch (e) {}
      // Signed out when the email was opened: lokali-dashboard.js stashed the token
      // and lokali-auth.js brought us here after sign-in.
      if (!token) { try { var st = JSON.parse(sessionStorage.getItem('LOKALI_SF_LINK') || 'null'); if (st && st.token && (Date.now() - (st.t || 0)) < 30 * 60 * 1000) token = st.token; } catch (e) {} }
      try { sessionStorage.removeItem('LOKALI_SF_LINK'); } catch (e) {}
      if (!token || !SF.viewLink) return;
      try { history.replaceState(null, '', window.location.pathname + '#lok-sf'); } catch (e) {}
      ask.hidden = false; ask.innerHTML = '';
      ask.appendChild(mk('b', '', 'Checking the link…'));
      SF.viewLink(token).then(function (res) {
        ask.innerHTML = '';
        try { ask.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        var d = res.data || {};
        if (res.error === 'no_request' && SF.viewAdd) { handleAdd(token); return; } // #217
        if (res.error === 'wrong_account') {
          ask.appendChild(mk('b', '', 'Sign in to ' + (d.to_business || 'the other storefront') + ' to confirm'));
          var p1 = mk('p', '', 'This request links ' + (d.from_business || 'a storefront') + ' with ' + (d.to_business || 'another storefront') + ', and only that storefront’s login can confirm it' + (d.to_email_masked ? ' (' + d.to_email_masked + ')' : '') + '. Sign out, sign in there, then open the email link again.');
          ask.appendChild(p1);
          var acts0 = mk('div', 'lok-sf-acts'); var so = mk('button', 'lok-set-btn', 'Sign out'); so.type = 'button';
          so.addEventListener('click', function () { if (window.LokaliAuth && window.LokaliAuth.signOut) window.LokaliAuth.signOut().then(function () { window.location.href = '/login'; }); else window.location.href = '/login'; });
          acts0.appendChild(so); ask.appendChild(acts0);
          return;
        }
        if (res.error) {
          var WHY = { no_request: 'This link is not valid. Ask for a new one from the other storefront’s Settings.', used: 'This link was already used. If the storefronts are linked, they are listed below.', expired: 'This link has expired. Ask for a new one from the other storefront’s Settings.', declined: 'This request was declined. Ask for a new one if you changed your mind.' };
          ask.appendChild(mk('b', '', 'This link cannot be used'));
          ask.appendChild(mk('p', '', WHY[res.error] || 'Something went wrong. Ask for a new link from the other storefront’s Settings.'));
          return;
        }
        ask.appendChild(mk('b', '', 'Link ' + (d.from_business || 'that storefront') + ' with ' + (d.to_business || mine) + '?'));
        // SEC-103 (2026-10-14): name the LOGIN behind the request and say plainly what linking grants.
        ask.appendChild(mk('p', '', 'Someone signed in to ' + (d.from_business || 'that storefront') + (d.from_email_masked ? ' (login ' + d.from_email_masked + ')' : '') + ' asked to link it with this one.'));
        var warn = mk('p', '', 'Linking gives full access. Anyone who can sign in to ' + (d.from_business || 'that storefront') + ' will be able to open and change this storefront without your password: its leads and customer messages, listings, settings and billing. The same goes the other way.');
        warn.style.cssText = 'background:#FFF4E5;border-radius:10px;padding:12px 14px;color:#3A2A12;';
        ask.appendChild(warn);
        ask.appendChild(mk('p', '', 'Only confirm if you run both storefronts yourself and you recognize that login. Lokali staff will never ask you to link your storefront.'));
        var acts = mk('div', 'lok-sf-acts');
        var yes = mk('button', 'lok-set-btn pri', 'Link storefronts'); yes.type = 'button';
        var no = mk('button', 'lok-set-btn quiet', 'Not now'); no.type = 'button';
        acts.appendChild(yes); acts.appendChild(no); ask.appendChild(acts);
        yes.addEventListener('click', function () {
          yes.disabled = true; no.disabled = true; yes.textContent = 'Linking…';
          SF.answerLink(token, true).then(function (r2) {
            var d2 = r2.data || {};
            if (r2.error || d2.ok !== true) { yes.disabled = false; no.disabled = false; yes.textContent = 'Link storefronts'; say('err', 'Could not link right now. Try the email link again in a minute.'); return; }
            linked = Array.isArray(d2.storefronts) ? d2.storefronts : [];
            ask.hidden = true; render();
            say('ok', 'Linked. ' + (d.from_business || 'The other storefront') + ' is now in your Switch to list.');
            try { SF.linked(); } catch (e) {}
          }).catch(function () { yes.disabled = false; no.disabled = false; yes.textContent = 'Link storefronts'; say('err', 'Network error. Nothing changed.'); });
        });
        no.addEventListener('click', function () {
          no.disabled = true; yes.disabled = true;
          SF.answerLink(token, false).then(function () { ask.hidden = true; say('', 'Not linked. The email link is now void; ask for a new one if you change your mind.'); })
            .catch(function () { ask.hidden = true; });
        });
      }).catch(function () { ask.innerHTML = ''; ask.appendChild(mk('b', '', 'Could not check the link')); ask.appendChild(mk('p', '', 'Try opening the email link again.')); });
    }

    render();
    SF.linked().then(function (res) {
      if (res.error) return;
      linked = res.data || []; render();
      if (linked.length > 1 && SF.unread) SF.unread().then(function (r) { unread = (r && r.data) || {}; render(); }).catch(function () {});
    });
    handleIncoming();
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
    // lokali-billing.js mounts the Spotlight card; keep it with the plan whichever
    // script ran first.
    var spot = $('lokali-spotlight');
    if (spot) form.insertBefore(spot, (verify || sPlan).nextSibling);
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
      // F 2026-09-20: this row is where a vendor adds or removes a way in (set a
      // password on a Google account, connect or disconnect Google), not only
      // where they change a password. The panel itself lives in lokali-auth.js.
      var cpt = cp.querySelector('.text-link'); if (cpt) cpt.textContent = 'Manage sign-in';
      var pwd = cp.parentNode ? cp.parentNode.querySelector('.settings-lokali-text') : null;
      if (pwd) pwd.textContent = 'Password, Google, or both. Add or remove a way to sign in.';
      var pwBlock = cp.closest ? cp.closest('.div-block-157') : null;
      var pwHead = pwBlock ? pwBlock.querySelector('.settings-header') : null;
      // Sibling labels (FIRST NAME, EMAIL) are TYPED in capitals in Webflow, not CSS-uppercased.
      if (pwHead && !pwHead.children.length) pwHead.textContent = 'HOW YOU SIGN IN';
    }
    mountStorefrontsCard(sYou); // #215
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
    // #230: 'Change plan' (lokali-billing.js refines it to 'Upgrade' on Free and
    // adds the plan sentence + a Downgrade to Free link once billing is known).
    var vp = document.querySelector('#settings-view-plans .text-link'); if (vp) vp.textContent = 'Change plan';
    var stripeLink = document.querySelector('.div-block-158.stripe a');
    // lokali-billing.js turns this row into "Set up billing" for a comped vendor
    // (data-lokali-setup-plan); leave its wording alone when it has.
    if (stripeLink && !stripeLink.hasAttribute('data-lokali-setup-plan')) {
      var sl = stripeLink.querySelector('.text-link') || stripeLink;
      sl.textContent = 'Manage card and invoices';
      if (!stripeLink.parentNode.querySelector('.lok-set-billnote')) {
        stripeLink.parentNode.insertBefore(mk('div', 'settings-lokali-text lok-set-billnote', 'Your card, invoices and receipts open in Stripe, our payment partner, on a secure page. Plan changes happen above.'), stripeLink);
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
