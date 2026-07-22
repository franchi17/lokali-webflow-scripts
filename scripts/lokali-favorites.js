/**
 * lokali-favorites.js — customer "save vendor" / favorites front-end.
 *
 * Three surfaces, all driven by this one script:
 *   1. Browse cards (/the-market): a heart overlay on every `.vcard[data-vendor-id]`
 *      rendered by lokali-browse.js.
 *   2. Vendor detail page: a heart attached to an element you place with
 *      id="lokali-fav-detail" (vendor id resolved from the ?id= URL param, the
 *      element's data-vendor-id, or window.LOKALI_VENDOR_ID).
 *   3. Saved page: renders the customer's saved vendors into #lokali-saved-grid.
 *
 * Auth: uses the session token via window.LokaliAPI. If the user isn't signed in,
 * clicking a heart starts "sign up to save" — it stashes the pending vendor,
 * stamps a customer signup intent, and opens the LokaliAuth sign-up overlay.
 * lokali-auth.js completes the sync and emits `lokali:authed`, which we catch
 * to finish the save.
 *
 * Depends on: the API client (window.LokaliAPI, with the 'favorites' base)
 * and lokali-auth.js (signup intent + the 'lokali:authed' event).
 */
(function () {
  'use strict';

  var PENDING_FAV_KEY = 'lokali_pending_fav';     // vendor id to save after sign-up
  var SIGNUP_INTENT_KEY = 'lokali_signup_intent'; // read by lokali-auth.js
  var BROWSE_GRID_ID = 'browse-vendor-grid';
  var DETAIL_ANCHOR_ID = 'lokali-fav-detail';
  var SAVED_GRID_ID = 'lokali-saved-grid';

  var _savedSet = null;   // Set of vendor ids the user has saved (null = not loaded)
  var _loadingSaved = null; // in-flight promise so we load the set once

  // ── helpers ────────────────────────────────────────────────
  function api() { return window.LokaliAPI; }
  function hasToken() { var a = api(); return !!(a && a.getToken && a.getToken()); }

  function setPendingFav(id) { try { sessionStorage.setItem(PENDING_FAV_KEY, String(id)); } catch (e) {} }
  function getPendingFav() { try { return sessionStorage.getItem(PENDING_FAV_KEY); } catch (e) { return null; } }
  function clearPendingFav() { try { sessionStorage.removeItem(PENDING_FAV_KEY); } catch (e) {} }
  function stampCustomerIntent() { try { sessionStorage.setItem(SIGNUP_INTENT_KEY, 'customer:' + Date.now()); } catch (e) {} } // timestamped (#101 — intent expires)

  function injectCSS() {
    if (document.getElementById('lokali-favorites-styles')) return;
    var s = document.createElement('style');
    s.id = 'lokali-favorites-styles';
    s.textContent = [
      ".lk-fav{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:100px;border:.5px solid #EEEDF6;background:rgba(255,255,255,.92);backdrop-filter:blur(2px);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;z-index:3;transition:transform .12s, background .12s, border-color .12s;}",
      ".lk-fav:hover{transform:scale(1.08);border-color:#D4AAFD;}",
      ".lk-fav svg{width:16px;height:16px;display:block;}",
      ".lk-fav .lk-heart-fill{fill:none;stroke:#6B6880;stroke-width:1.8;transition:fill .12s, stroke .12s;}",
      ".lk-fav.is-saved .lk-heart-fill{fill:#6002EE;stroke:#6002EE;}",
      ".lk-fav.is-busy{opacity:.55;pointer-events:none;}",
      // inline (detail) variant sits in normal flow rather than overlaid
      ".lk-fav.lk-fav-inline{position:static;top:auto;right:auto;width:auto;height:auto;border-radius:8px;padding:8px 14px;gap:7px;font:600 13px/1 'Plus Jakarta Sans',sans-serif;color:#1A1829;}",
      ".lk-fav.lk-fav-inline.is-saved{background:#F3EBFF;border-color:#D4AAFD;color:#6002EE;}",
      // saved page — the .vcard styles live in lokali-browse.js (loaded only on
      // /the-market), so scope minimal card styling here or the cards render
      // unstyled and the absolute-positioned heart escapes to the grid corner.
      "#" + SAVED_GRID_ID + "{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;}",
      "#" + SAVED_GRID_ID + " .vcard{position:relative;background:#fff;border:.5px solid #EEEDF6;border-radius:14px;padding:16px;font-family:'Plus Jakarta Sans',sans-serif;}",
      "#" + SAVED_GRID_ID + " .vcard-name{font-weight:600;font-size:15px;color:#1A1829;}",
      "#" + SAVED_GRID_ID + " .vcard-tagline{font-size:13px;color:#6B6880;}",
      ".lk-saved-empty{font:500 14px/1.5 'Plus Jakarta Sans',sans-serif;color:#6B6880;padding:2rem 0;}",
      ".lk-saved-empty a{color:#6002EE;font-weight:600;text-decoration:none;}"
    ].join('');
    document.head.appendChild(s);
  }

  function heartSVG() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lk-heart-fill" d="M12 20.5l-1.4-1.27C5.6 14.86 2.5 12.07 2.5 8.6 2.5 6.1 4.5 4.1 7 4.1c1.5 0 2.95.7 3.9 1.81C11.85 4.8 13.3 4.1 14.8 4.1c2.5 0 4.5 2 4.5 4.5 0 3.47-3.1 6.26-8.1 10.63L12 20.5z"/></svg>';
  }

  // ── saved-set loading ──────────────────────────────────────
  function loadSavedSet() {
    if (_savedSet) return Promise.resolve(_savedSet);
    if (_loadingSaved) return _loadingSaved;
    if (!hasToken()) { _savedSet = new Set(); return Promise.resolve(_savedSet); }
    _loadingSaved = api().request('favorites', 'GET', '/favorites', null, true)
      .then(function (res) {
        var set = new Set();
        var rows = (res && res.data) || [];
        if (Array.isArray(rows)) {
          rows.forEach(function (r) { if (r && r.vendors_id != null) set.add(Number(r.vendors_id)); });
        }
        _savedSet = set;
        _loadingSaved = null;
        return set;
      })
      .catch(function () { _savedSet = new Set(); _loadingSaved = null; return _savedSet; });
    return _loadingSaved;
  }

  // ── toggle (save / unsave) ─────────────────────────────────
  function persistToggle(vendorId, makeSaved) {
    if (makeSaved) {
      return api().request('favorites', 'POST', '/favorites', { vendors_id: vendorId }, true);
    }
    return api().request('favorites', 'DELETE', '/favorites/' + encodeURIComponent(vendorId), null, true);
  }

  function applyState(btn, saved) {
    if (!btn) return;
    btn.classList.toggle('is-saved', !!saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.setAttribute('aria-label', saved ? 'Remove from saved' : 'Save vendor');
    btn.title = saved ? 'Saved' : 'Save vendor';
  }

  function syncAllHeartsFor(vendorId, saved) {
    var sel = '.lk-fav[data-vendor-id="' + vendorId + '"]';
    var nodes = document.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) applyState(nodes[i], saved);
  }

  function doToggle(vendorId, btn) {
    var id = Number(vendorId);
    var currentlySaved = _savedSet ? _savedSet.has(id) : btn.classList.contains('is-saved');
    var next = !currentlySaved;
    // optimistic
    if (_savedSet) { if (next) _savedSet.add(id); else _savedSet.delete(id); }
    syncAllHeartsFor(id, next);
    btn.classList.add('is-busy');
    persistToggle(id, next).then(function (res) {
      btn.classList.remove('is-busy');
      if (res && res.error) {
        // revert on failure
        if (_savedSet) { if (next) _savedSet.delete(id); else _savedSet.add(id); }
        syncAllHeartsFor(id, currentlySaved);
      }
    }).catch(function () {
      btn.classList.remove('is-busy');
      if (_savedSet) { if (next) _savedSet.delete(id); else _savedSet.add(id); }
      syncAllHeartsFor(id, currentlySaved);
    });
  }

  // ── #102: a VENDOR's first shopping-side action gets an explicit heads-up ──
  // (Francesca 2026-07-22: never open the customer side silently — "tell them
  // hey, we're switching you to customer"). One-time per browser; customers
  // and already-acknowledged vendors never see it. Same pattern lives in
  // lokali-inquiry.js for the contact modal.
  var SHOP_NOTICE_KEY = 'lokali_shop_side_ok';
  function vendorNeedsShopNotice() {
    try {
      if (localStorage.getItem(SHOP_NOTICE_KEY) === '1') return false;
      var c = JSON.parse(localStorage.getItem('LOKALI_ACCT_CACHE') || 'null');
      return !!(c && c.role === 'vendor');
    } catch (e) { return false; }
  }
  function showShopNotice(onContinue) {
    var old = document.getElementById('lok-shop-notice');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'lok-shop-notice';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;' +
      "padding:20px;background:rgba(35,29,63,.55);font-family:'Plus Jakarta Sans',-apple-system,sans-serif;";
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" style="background:#fff;border-radius:16px;max-width:400px;width:100%;padding:26px 24px;box-shadow:0 20px 60px rgba(35,29,63,.25);">' +
        '<h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#231D3F;font-family:inherit;">Switching you to your shopping space</h3>' +
        '<p style="margin:0 0 18px;font-size:13.5px;line-height:1.55;color:#4A4761;">You’re signed in as a vendor. Saving and contacting other vendors happens on your customer side — your storefront isn’t touched. We won’t ask again.</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
          '<button data-sn-cancel style="font-family:inherit;font-size:13px;font-weight:600;color:#4A4761;background:#fff;border:.5px solid #C8C6D8;border-radius:9px;padding:9px 16px;cursor:pointer;">Not now</button>' +
          '<button data-sn-go style="font-family:inherit;font-size:13px;font-weight:600;color:#fff;background:#6002EE;border:none;border-radius:9px;padding:9px 16px;cursor:pointer;">Continue</button>' +
        '</div>' +
      '</div>';
    // Dialog basics: Escape dismisses, and focus returns to the opener.
    var prevFocus = document.activeElement;
    function dismiss() {
      document.removeEventListener('keydown', snEsc, true);
      ov.remove();
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
    }
    ov.addEventListener('click', function (e) { if (e.target === ov) dismiss(); });
    // Escape at DOCUMENT level: a click on non-focusable card text can drop
    // focus to <body> (Safari), where an overlay-scoped listener never hears
    // the key. Removed again in dismiss().
    function snEsc(e) { if (e.key === 'Escape') dismiss(); }
    document.addEventListener('keydown', snEsc, true);
    ov.querySelector('[data-sn-cancel]').addEventListener('click', dismiss);
    ov.querySelector('[data-sn-go]').addEventListener('click', function () {
      try { localStorage.setItem(SHOP_NOTICE_KEY, '1'); } catch (e) {}
      dismiss();
      onContinue();
    });
    document.body.appendChild(ov);
    try { ov.querySelector('[data-sn-go]').focus(); } catch (e) {}
  }

  function onHeartClick(vendorId, btn, ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (hasToken()) {
      // #102 — only an ADD (first shopping action) warrants the notice; an
      // un-save means they've been here before.
      var saving = !(_savedSet ? _savedSet.has(Number(vendorId)) : btn.classList.contains('is-saved'));
      if (saving && vendorNeedsShopNotice()) {
        showShopNotice(function () { doToggle(vendorId, btn); });
        return;
      }
      doToggle(vendorId, btn);
      return;
    }
    // Not signed in → sign up to save.
    setPendingFav(vendorId);
    stampCustomerIntent();
    openAuthModal();
  }

  function openAuthModal() {
    if (window.LokaliAuth && typeof window.LokaliAuth.openSignUp === 'function') {
      window.LokaliAuth.openSignUp();
    } else if (window.LokaliAuth && typeof window.LokaliAuth.openSignIn === 'function') {
      window.LokaliAuth.openSignIn();
    } else {
      // LokaliAuth not ready / not present on this page → fall back to the sign-up page.
      window.location.href = '/sign-up';
    }
  }

  // ── heart element factory ──────────────────────────────────
  function makeHeart(vendorId, inline) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lk-fav' + (inline ? ' lk-fav-inline' : '');
    btn.setAttribute('data-vendor-id', String(vendorId));
    btn.innerHTML = heartSVG() + (inline ? '<span class="lk-fav-label">Save</span>' : '');
    applyState(btn, _savedSet ? _savedSet.has(Number(vendorId)) : false);
    btn.addEventListener('click', function (ev) { onHeartClick(vendorId, btn, ev); });
    return btn;
  }

  // ── surface 1: browse cards ────────────────────────────────
  function decorateCard(card) {
    if (!card || card.querySelector('.lk-fav')) return;
    var vid = card.getAttribute('data-vendor-id');
    if (!vid) return;
    card.appendChild(makeHeart(vid, false));
  }

  function decorateBrowse() {
    var grid = document.getElementById(BROWSE_GRID_ID);
    if (!grid) return;
    var scan = function () {
      var cards = grid.querySelectorAll('.vcard[data-vendor-id]');
      for (var i = 0; i < cards.length; i++) decorateCard(cards[i]);
    };
    // Cards render asynchronously (and re-render on filter) → observe the grid.
    loadSavedSet().then(scan);
    var mo = new MutationObserver(function () { scan(); });
    mo.observe(grid, { childList: true, subtree: false });
  }

  // ── surface 2: vendor detail ───────────────────────────────
  function resolveDetailVendorId(anchor) {
    if (anchor && anchor.getAttribute('data-vendor-id')) return anchor.getAttribute('data-vendor-id');
    if (typeof window.LOKALI_VENDOR_ID !== 'undefined' && window.LOKALI_VENDOR_ID) return window.LOKALI_VENDOR_ID;
    try {
      var p = new URLSearchParams(window.location.search).get('id');
      if (p) return p;
    } catch (e) {}
    return null;
  }

  function decorateDetail() {
    // If the listing has its own designed save button (#vl-save, wired by
    // lokali-vendor-listing.js to the same Favorites API), don't inject a
    // duplicate heart here.
    if (document.getElementById('vl-save')) return;
    var anchor = document.getElementById(DETAIL_ANCHOR_ID);
    if (!anchor) return;
    var vid = resolveDetailVendorId(anchor);
    if (!vid) return;
    loadSavedSet().then(function () {
      if (anchor.querySelector('.lk-fav')) return;
      var inline = anchor.getAttribute('data-fav-style') !== 'icon';
      anchor.appendChild(makeHeart(vid, inline));
    });
  }

  // ── surface 3: saved page ──────────────────────────────────
  function savedLoadError(grid) {
    grid.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'lk-saved-empty';
    d.setAttribute('aria-live', 'polite');
    d.textContent = 'Couldn’t load your saved vendors. ';
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = 'Try again';
    a.addEventListener('click', function (ev) { ev.preventDefault(); renderSaved(); });
    d.appendChild(a);
    grid.appendChild(d);
  }

  function renderSaved() {
    var grid = document.getElementById(SAVED_GRID_ID);
    if (!grid) return;
    if (!hasToken()) {
      grid.innerHTML = '<div class="lk-saved-empty">Please <a href="/login">sign in</a> to see your saved vendors.</div>';
      return;
    }
    api().request('favorites', 'GET', '/favorites', null, true).then(function (res) {
      if (res && res.error) { savedLoadError(grid); return; }
      var rows = (res && res.data) || [];
      if (!Array.isArray(rows) || !rows.length) {
        grid.innerHTML = '<div class="lk-saved-empty">You haven\'t saved any vendors yet. Browse <a href="/the-market">The Market</a> and tap the heart on a vendor to save them here.</div>';
        return;
      }
      grid.innerHTML = '';
      rows.forEach(function (row) {
        var v = row.vendor || row._vendor || null;
        if (!v) return;
        grid.appendChild(buildSavedCard(v));
      });
    }).catch(function () { savedLoadError(grid); });
  }

  // A lightweight card for the saved page (independent of lokali-browse.js).
  function buildSavedCard(v) {
    var card = document.createElement('div');
    card.className = 'vcard';
    card.setAttribute('data-vendor-id', String(v.id));
    var name = document.createElement('div');
    name.className = 'vcard-name';
    name.style.marginBottom = '4px';
    name.textContent = v.business_name || 'Vendor';
    var tag = document.createElement('div');
    tag.className = 'vcard-tagline';
    tag.textContent = v.business_tagline || v.business_description || '';
    card.appendChild(name);
    card.appendChild(tag);
    card.appendChild(makeHeart(v.id, false));
    var href = v.slug ? ('/' + v.slug) : ('/vendor?id=' + v.id);
    card.style.cursor = 'pointer';
    card.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('.lk-fav')) return;
      window.location.href = href;
    });
    return card;
  }

  // ── sign-up-to-save completion ─────────────────────────────
  // lokali-vendor-listing.js waits on this signal before re-reading #vl-save
  // state (a fixed post-authed timer raced the POST below).
  function announceSynced() {
    try { window.dispatchEvent(new CustomEvent('lokali:favorites-synced')); } catch (e) {}
  }
  function completePendingSave() {
    var pending = getPendingFav();
    if (!pending || !hasToken()) return;
    // Reload the saved set fresh (the new account has none yet), then save.
    // The pending key is cleared only once the POST settles: vendor-listing's
    // 'lokali:authed' listener reads it to suppress its refreshSaveState timer,
    // and clearing up-front let that timer flash the button back to "Save"
    // mid-POST.
    _savedSet = null;
    loadSavedSet().then(function () {
      persistToggle(Number(pending), true).then(function (res) {
        clearPendingFav();
        // The adapter resolves failures as { error } — only paint saved state
        // on a real success, otherwise the heart lies about a failed POST.
        if (!(res && res.error)) {
          if (_savedSet) _savedSet.add(Number(pending));
          syncAllHeartsFor(Number(pending), true);
        }
        announceSynced();
      }).catch(function () { clearPendingFav(); announceSynced(); });
    });
  }

  // ── init ───────────────────────────────────────────────────
  function init() {
    injectCSS();
    // React to the auth event emitted by lokali-auth.js after a sync.
    window.addEventListener('lokali:authed', function () { completePendingSave(); });
    decorateBrowse();
    decorateDetail();
    renderSaved();
  }

  // Wait for the API client (load order isn't guaranteed across page custom code
  // + injected scripts). Give up after ~10s rather than hang.
  function whenReady(cb) {
    var tries = 0;
    (function poll() {
      if (window.LokaliAPI) { cb(); return; }
      if (tries++ > 100) return;
      setTimeout(poll, 100);
    })();
  }

  function start() { whenReady(init); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Small public surface for debugging / manual triggers.
  window.LokaliFavorites = {
    reload: function () { _savedSet = null; return loadSavedSet(); },
    isSaved: function (id) { return _savedSet ? _savedSet.has(Number(id)) : false; }
  };
})();
