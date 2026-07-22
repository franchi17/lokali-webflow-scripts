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
    load().then(populate).then(bind).catch(function (err) {
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
    setText($('settings-current-plan'), _titlecase(_plan || 'free') + (_planEnds ? ' — ends ' + _planEnds : ''));

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
        '🔒 Claim your own link — like <strong>golokali.com/' + escapeHtml(currentSlug || 'your-name') + '</strong> — with Pro &amp; Featured.</div>';
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
          if (!r || r.error) { setStatus('Couldn’t check availability — try again.'); return; }
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
          setStatus(res.error, '#B1006A');
          toast('error', res.error);
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
    p.textContent = 'Our bi-monthly newsletter — vendor spotlights and what’s new on Lokali. Rare by design.';
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
      toast('success', value ? 'Subscribed to The Neighborhood Edit.' : 'Unsubscribed from The Neighborhood Edit.');
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
    // account panel, where email and password changes are handled. No Xano
    // email/password is stored to write.
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
      delCard.style.cssText = 'display:none;margin-top:12px;padding:14px 16px;border:1px solid #F3D6D6;' +
        "border-radius:12px;background:#FDF7F7;font-family:'Plus Jakarta Sans',sans-serif;";
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
        foundWarn.textContent = 'Heads up — you’re a founding member. Deleting permanently retires your founding spot and its lifetime pricing. It can’t be undone or reclaimed.';
        delCard.appendChild(foundWarn);
      }
      var delIn = document.createElement('input');
      delIn.type = 'text'; delIn.placeholder = 'Type DELETE';
      delIn.style.cssText = 'max-width:180px;margin-right:8px;padding:9px 12px;border:1px solid #ECE8F8;border-radius:10px;font:inherit;';
      var delGo = document.createElement('button');
      delGo.type = 'button'; delGo.textContent = 'Permanently delete';
      delGo.style.cssText = 'padding:9px 16px;border:0;border-radius:999px;background:#E0245E;color:#fff;font:inherit;font-weight:600;cursor:pointer;margin-right:8px;';
      var delNo = document.createElement('button');
      delNo.type = 'button'; delNo.textContent = 'Cancel';
      delNo.style.cssText = 'padding:9px 16px;border:1px solid #ECE8F8;border-radius:999px;background:#fff;color:#231D3F;font:inherit;font-weight:600;cursor:pointer;';
      delCard.appendChild(delHelp); delCard.appendChild(delIn); delCard.appendChild(delGo); delCard.appendChild(delNo);
      if (del.parentNode) del.parentNode.insertBefore(delCard, del.nextSibling);

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
            body: JSON.stringify({ confirm: 'DELETE' })
          });
        }).then(function (res) {
          if (!res.ok) return res.json().catch(function () { return {}; }).then(function (b) { throw new Error(b && b.error ? b.error : 'delete_failed'); });
          try { if (window.LokaliAPI.clearToken) window.LokaliAPI.clearToken(); } catch (e2) {}
          var bye = function () { window.location.href = '/'; };
          try { auth.signOut().then(bye, bye); } catch (e3) { bye(); }
        }).catch(function (err) {
          delGo.disabled = false; delGo.textContent = 'Permanently delete';
          toast('error', (err && err.message) === 'billing_cleanup_failed'
            ? "We couldn't close your subscription — try again in a minute or contact us."
            : "Couldn't delete your account — please try again or contact us.");
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
      toast('error', 'Name fields can’t be blank — your saved name was kept.');
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
      toast('success', kept ? 'Saved — blank fields kept their previous value.' : 'Settings saved.');
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
      toast('success', visible ? 'Your listing is live.' : 'Your listing is now hidden.');
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
