/*
  Lokali — Settings page wiring.
  Hosted version of the former inline settings-page-embed.html paste; load with ONE <script defer src> tag on the Settings page after the sitewide bundle.
  Requires (already site-wide): lokali-api-client.js, lokali-clerk-auth.js, lokali-dashboard.js.
  Optional: lokali-billing.js (for the Stripe portal/upgrade buttons via data-lokali-portal / data-lokali-checkout).

  ELEMENT IDs THIS SCRIPT LOOKS FOR (add in Webflow; anything missing is skipped safely):
    Inputs   : #settings-first-name (or existing #First-Name-Input), #settings-last-name (or #Last-Name-Input)
    Display  : #settings-email, #settings-account-type, #settings-current-plan
    Buttons  : #settings-save-btn, #settings-view-plans, #settings-deactivate, #settings-reactivate, #settings-delete
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

  function toast(type, msg) {
    var el = $('lokali-settings-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lokali-settings-toast';
      el.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:9999;padding:12px 20px;border-radius:999px;box-shadow:0 8px 20px rgba(15,23,42,.2);font-size:14px;font-weight:500;color:#fff;display:none;max-width:90vw;text-align:center;';
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
    return Promise.all(calls).then(function (res) {
      var me = res[0];
      if (me && me.error) {
        if (me.status === 401) { if (window.LokaliAPI.clearToken) window.LokaliAPI.clearToken(); window.location.href = '/login'; return new Promise(function () {}); }
        throw new Error(me.error);
      }
      var d = (me && me.data) || {};
      _user = d.user || d;
      _vendor = d.vendor || (d.user ? null : d.vendor) || null;
      var billing = res[1];
      if (billing && !billing.error && billing.data) {
        var b = billing.data;
        _plan = (b.plan_code || b.plan || (b.plan && b.plan.code) || (b.subscription && b.subscription.plan_code) || 'free');
        if (b.plan && b.plan.code) _plan = b.plan.code;
        var feat = b.features || b.plan || {};
        if (typeof feat.custom_profile_url === 'boolean') _customUrlAllowed = feat.custom_profile_url;
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
    setText($('settings-current-plan'), _titlecase(_plan || 'free'));

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

    // Gate paid-only toggles on Free plans
    if (!isPro()) {
      PRO_ONLY_TOGGLES.forEach(function (id) {
        var t = $(id); if (!t) return;
        var input = t.tagName === 'INPUT' ? t : inputOf(t);
        if (input) { input.disabled = true; input.checked = false; }
        var label = (input && input.closest) ? input.closest('label') : t;
        if (label && label.style) { label.style.opacity = '0.5'; label.style.pointerEvents = 'none'; label.title = 'Available on Pro & Featured plans'; }
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
        '🔒 Claim your own link — like <strong>golokali.com/' + (currentSlug || 'your-name') + '</strong> — with Pro &amp; Featured.</div>';
      return;
    }

    host.innerHTML = label +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<span style="color:#8E8BA6;font-size:14px;">golokali.com/</span>' +
      '<input id="lok-slug-input" type="text" value="' + currentSlug.replace(/"/g, '') + '" maxlength="30" autocomplete="off" spellcheck="false" ' +
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

    var del = $('settings-delete');
    if (del) del.addEventListener('click', function (e) {
      e.preventDefault();
      if (!confirm('Delete your account? Your listing is hidden immediately and your data is permanently removed after review.')) return;
      if (!confirm('Are you absolutely sure? This cannot be undone once processed.')) return;
      if (!window.LokaliAPI.vendors || !window.LokaliAPI.vendors.deleteMe) {
        toast('info', 'Deletion request received. Our team will review and follow up by email.');
        return;
      }
      window.LokaliAPI.vendors.deleteMe().then(function (res) {
        if (res.error) { toast('error', res.error || 'Could not process the request.'); return; }
        toast('info', 'Your listing is now hidden and your deletion request was received.');
        setTimeout(function () {
          if (window.LokaliAPI.clearToken) window.LokaliAPI.clearToken();
          window.location.href = '/';
        }, 2500);
      }).catch(function () {
        toast('error', 'Network error. Please try again.');
      });
    });

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
    var payload = {
      first_name: fn ? String(fn.value || '').trim() : '',
      last_name:  ln ? String(ln.value || '').trim() : ''
    };
    var btn = $('settings-save-btn');
    if (btn) btn.setAttribute('disabled', 'disabled');
    window.LokaliAPI.auth.updateProfile(payload).then(function (res) {
      if (res.error) { toast('error', res.error || 'Could not save. Please try again.'); return; }
      var u = (res.data && res.data.value) || res.data || {};
      if (u.first_name != null) _user.first_name = u.first_name;
      if (u.last_name != null) _user.last_name = u.last_name;
      toast('success', 'Settings saved.');
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
