/*
  Lokali API client — TOMBSTONE (XANO-DECOMM, 2026-07-27).

  This file was the legacy Xano HTTP client: ~750 lines of grouped helpers
  (auth/vendors/services/products/…) over 11 hardcoded Xano base URLs. The Xano
  workspace was PERMANENTLY DELETED on 2026-07-24, so that client can never
  work again and its code was removed.

  Why the file still exists at all: the site-wide Webflow footer loads it as the
  FIRST script tag, and Site Settings → Footer is not API-editable — removing
  the tag is a manual Webflow edit (optional; this stub is ~2 KB and harmless).

  What this stub does:
  - Defines `window.LokaliAPI` with the SAME surface the legacy client had, so
    nothing that touches it before the Supabase adapter loads can throw.
  - Every method resolves to the standard `{ data: null, error, status: 0 }`
    failure shape (never rejects — matching the old client's contract).
  - In production this object lives only for microseconds:
    `lokali-api-adapter.js` (loaded right after, KEEP IT) replaces
    `window.LokaliAPI` with the real Supabase-backed implementation whenever
    `window.LOKALI_BACKEND === 'supabase'` — which is every page since the
    2026-07-07 cutover.
*/
(function () {
  'use strict';

  var MSG = 'Legacy API client retired (XANO-DECOMM 2026-07-24) — the Supabase adapter (lokali-api-adapter.js) should own window.LokaliAPI. If you see this error, LOKALI_BACKEND is not "supabase" or the adapter failed to load.';

  function dead() {
    try { console.warn('[LokaliAPI tombstone]', MSG); } catch (e) {}
    return Promise.resolve({ data: null, error: MSG, status: 0 });
  }

  // Same grouped surface as the legacy client; every leaf is the dead() stub.
  function group(names) {
    var g = {};
    for (var i = 0; i < names.length; i++) g[names[i]] = dead;
    return g;
  }

  var api = {
    request: dead,
    auth: group(['me', 'login', 'signup', 'logout', 'update']),
    vendors: group(['me', 'get', 'list', 'update', 'uploadPhoto']),
    services: group(['mine', 'list', 'get', 'create', 'update', 'remove', 'uploadImage']),
    products: group(['mine', 'list', 'get', 'create', 'update', 'remove', 'uploadImage']),
    plans: group(['list', 'me', 'checkout', 'portal']),
    leads: group(['list', 'track']),
    share: group(['track']),
    account: group(['get', 'update', 'remove']),
    reviews: group(['mine', 'list', 'create', 'awaiting']),
    data: group(['categories', 'locations', 'listingIndex']),
    getToken: function () { return null; },
    setToken: function () {},
    clearToken: function () {}
  };

  if (typeof window !== 'undefined') {
    window.LokaliAPI = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
