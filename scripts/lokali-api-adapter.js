/*
 * lokali-api-adapter.js — TRANSITIONAL. Deprecated on arrival.
 * ---------------------------------------------------------------------------
 * Re-exposes the legacy Xano client surface (`window.LokaliAPI`) on top of the
 * Supabase client (`window.LokaliSupabaseAPI` in lokali-supabase-client.js),
 * so the ~25 live page scripts cut over to Supabase with ZERO edits — including
 * the SRI-pinned lokali-services-final.js / lokali-products-final.js (no
 * re-registration needed).
 *
 * WHY IT EXISTS: the Supabase client is a cleaner redesign (regrouped methods,
 * raw rows, ISO timestamps). The page scripts expect Xano's exact envelopes
 * ({data, error, status}), wrappers ({vendor:{...}}, {items:[...]}), epoch-ms
 * timestamps, and rolled-up leads/analytics feeds. This file is the one place
 * that translation lives.
 *
 * LIFECYCLE: this is scaffolding for the cutover, not an architecture. As page
 * scripts get rewritten to call LokaliSupabaseAPI natively, their needs drop
 * out of this file; when the last one is rewritten, DELETE this file. Do not
 * grow new features here — new code should target LokaliSupabaseAPI directly.
 *
 * ACTIVATION (cutover, reversible):
 *   <script>window.LOKALI_BACKEND = 'supabase';
 *           window.LOKALI_CLERK_SYNC_URL = 'https://lokali-api.vercel.app/api/lokali/clerk-sync';</script>
 *   …then load lokali-supabase-client.js + this file AFTER lokali-api-client.js.
 *   Flag off/absent → this file only exposes window.LokaliSupabaseAdapter for
 *   testing and touches nothing (the Xano client keeps window.LokaliAPI).
 *   Rollback = remove the flag line (+ purge). Xano stays warm.
 *
 * FIDELITY SOURCES (2026-07-07 audit): the .xs response shapes in xano/api/**
 * and the per-script field-consumption map — see docs/supabase/CUTOVER.md
 * Phase 4. Where Xano returned a shape, this returns the same shape, down to
 * {items} wrappers and error_code on plan-limit rejections.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // Same public config defaults as lokali-supabase-client.js — needed here only
  // for the keepalive REST writes (trackEvent/trackView must survive an
  // immediate tel:/wa.me navigation, so they bypass supabase-js and hit
  // PostgREST directly with fetch keepalive, like the Xano client did).
  var SUPABASE_URL =
    (typeof window !== 'undefined' && window.LOKALI_SUPABASE_URL) ||
    'https://baacipkokiweipncavov.supabase.co';
  var SUPABASE_KEY =
    (typeof window !== 'undefined' && window.LOKALI_SUPABASE_PUBLISHABLE_KEY) ||
    'sb_publishable_--wRW6DD_9ZCBqfb0kJUww_0lzfzs39';

  function SAPI() { return window.LokaliSupabaseAPI; }
  function rawClient() { return window.LokaliSupabaseReady; } // Promise<supabase client>

  // ── envelope + timestamp translation ──────────────────────────────────────
  // Xano envelope: { data, error: string|null, status: number }.
  var LIMIT_TOKEN = 'LOKALI_LIMIT_REACHED';

  function errText(err) {
    if (err == null) return null;
    if (typeof err === 'string') return err;
    return err.message || err.error_description || err.hint || 'Request failed';
  }

  function envelope(res) {
    res = res || {};
    var msg = errText(res.error);
    if (msg && msg.indexOf(LIMIT_TOKEN) >= 0) {
      // Xano's plan-cap rejections carried error_code — services/products-final
      // read res.data.error_code to show the friendly upgrade prompt.
      var human = msg.split(LIMIT_TOKEN + ':').pop().trim() || msg;
      return { data: { error_code: 'LIMIT_REACHED', message: human }, error: human, status: 403 };
    }
    if (msg) return { data: res.data != null ? res.data : null, error: msg, status: res.status || 400 };
    return { data: res.data != null ? res.data : null, error: null, status: 200 };
  }

  function fail(message, status) {
    return { data: null, error: message, status: status || 0 };
  }

  // Supabase (timestamptz) → ISO strings; Xano spoke epoch-milliseconds.
  var TS_KEYS = {
    created_at: 1, updated_at: 1, vendor_reply_at: 1, deactivated_at: 1,
    current_period_start: 1, current_period_end: 1, canceled_at: 1, ended_at: 1,
    identity_verified_at: 1, spotlight_until: 1, spotlight_expired_at: 1,
    terms_accepted_at: 1, contacted_at: 1, last_contacted_at: 1
  };
  function toMs(v) {
    if (typeof v !== 'string') return v;
    var t = Date.parse(v);
    return isNaN(t) ? v : t;
  }
  function normalizeTs(node) {
    if (node == null || typeof node !== 'object') return node;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) normalizeTs(node[i]);
      return node;
    }
    for (var k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      if (TS_KEYS[k]) node[k] = toMs(node[k]);
      else if (node[k] && typeof node[k] === 'object') normalizeTs(node[k]);
    }
    return node;
  }

  // Vendor rows: Xano's detail endpoints exposed instagram_handle (derived from
  // instagram_url); make sure both keys exist on every vendor we hand back.
  function vendorAliases(v) {
    if (v && typeof v === 'object') {
      if (v.instagram_handle == null && v.instagram_url != null) v.instagram_handle = v.instagram_url;
    }
    return v;
  }

  // ── auth/session plumbing (Clerk owns identity now) ───────────────────────
  function clerkSession() {
    try { return (window.Clerk && window.Clerk.session) || null; } catch (e) { return null; }
  }
  // The signed-in cache clerk-auth/auth-nav maintain in localStorage. It's the
  // SYNCHRONOUS "was signed in" signal — the Xano token used to fill this role;
  // Clerk itself boots asynchronously (deferred script), so page-load guards
  // (requireAuth) that check getToken() at parse time need this. Live-cutover
  // bug 2026-07-07: without it the dashboard bounced signed-in vendors to
  // /login because Clerk hadn't booted when the guard ran.
  function acctCache() {
    try { return JSON.parse(localStorage.getItem('LOKALI_ACCT_CACHE') || 'null'); } catch (e) { return null; }
  }
  // Wait (bounded) for Clerk to finish booting, so authed calls carry the JWT
  // instead of racing it and landing anonymous (the app_user 401s at load).
  // Resolves immediately once Clerk is loaded — signed-out stays signed-out.
  var _clerkReadyP = null;
  function waitForClerk() {
    if (window.Clerk && window.Clerk.loaded) return Promise.resolve();
    if (_clerkReadyP) return _clerkReadyP;
    _clerkReadyP = new Promise(function (resolve) {
      var tries = 0;
      (function poll() {
        if (window.Clerk && window.Clerk.loaded) return resolve();
        if (++tries > 40) return resolve(); // ~10s cap — fall through anonymous
        setTimeout(poll, 250);
      })();
    });
    return _clerkReadyP;
  }
  function clerkTokenP() {
    return waitForClerk().then(function () {
      var s = clerkSession();
      if (!s) return null;
      try { return s.getToken(); } catch (e) { return null; }
    });
  }

  // Lazily self-provision/locate the app_user row and cache its id — needed only
  // by "my own rows" reads (reviews.mine). Deliberately LAZY, never on load:
  // on a fresh vendor signup clerk-sync must reach the server first (role is
  // set-once); by the time a user opens a my-reviews surface, that's long done.
  var _appUserP = null;
  function ensureAppUser() {
    if (_appUserP) return _appUserP;
    _appUserP = waitForClerk().then(function () {
      return SAPI().auth.ensureUser();
    }).then(function (res) {
      if (res && res.error) { _appUserP = null; }
      return SAPI().auth.currentUserId();
    }, function () { _appUserP = null; return null; });
    return _appUserP;
  }

  // ── memoized vendor/me + billing (same burst-collapse the Xano client had) ─
  var _meP = null;
  var _billingP = null;
  function invalidateMe() { _meP = null; }
  function invalidateBilling() { _billingP = null; }

  function vendorMe() {
    if (_meP) return _meP;
    _meP = waitForClerk().then(function () {
      return SAPI().vendors.me();
    }).then(function (res) {
      if (!res || res.error || !res.data) {
        _meP = null;
        return envelope({ data: null, error: (res && res.error) || 'No vendor account for this login' });
      }
      var vendor = vendorAliases(normalizeTs(res.data));
      // Xano's vendor/me computes profile_views_total live from page_views.
      return SAPI().analytics.pageViewCount(vendor.id).then(function (cRes) {
        vendor.profile_views_total = (cRes && typeof cRes.count === 'number') ? cRes.count : 0;
        return { data: { vendor: vendor }, error: null, status: 200 };
      }, function () {
        vendor.profile_views_total = 0;
        return { data: { vendor: vendor }, error: null, status: 200 };
      });
    });
    _meP.then(function (out) { if (!out || out.error) _meP = null; }, function () { _meP = null; });
    return _meP;
  }

  function myVendorId() {
    return vendorMe().then(function (out) {
      if (out && !out.error && out.data && out.data.vendor) return out.data.vendor.id;
      return null;
    });
  }

  // Runs fn(vendorId) once the caller's vendor id is known; standard error if not.
  function withVendor(fn) {
    return myVendorId().then(function (vid) {
      if (vid == null) return fail('No vendor account for this login', 0);
      return fn(vid);
    });
  }

  var PREF_DEFAULTS = {
    notify_inquiry: true, notify_announcements: true, notify_promotional: false,
    notify_review: true, show_public_reviews: true
  };
  function prefsShape(row) {
    var out = {};
    for (var k in PREF_DEFAULTS) {
      out[k] = (row && typeof row[k] === 'boolean') ? row[k] : PREF_DEFAULTS[k];
    }
    return out;
  }

  // ── billing composite (Xano vendor/me/billing shape) ──────────────────────
  function freePlanRow() {
    return SAPI().data.plans().then(function (res) {
      var rows = (res && res.data) || [];
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].code).toLowerCase() === 'free') return rows[i];
      }
      return null;
    });
  }

  function billingShape(sub, plan, vendor) {
    plan = plan || {};
    var isFree = !sub;
    return {
      plan: plan.code || 'free',
      plan_status: isFree ? 'free' : (sub.status || 'free'),
      plan_interval: isFree ? null : (sub.billing_interval || null),
      current_period_end: isFree ? null : toMs(sub.current_period_end || null),
      cancel_at_period_end: isFree ? false : !!sub.cancel_at_period_end,
      subscription: {
        plan_code: plan.code || 'free',
        plan_name: plan.plan_name || 'Free',
        status: isFree ? 'free' : (sub.status || 'free'),
        max_service_photos: plan.max_service_photos,
        max_product_photos: plan.max_product_photos
      },
      features: {
        max_services: plan.max_services,
        max_products: plan.max_products,
        max_photo_per_listing: plan.max_photo_per_listing,
        ranking_priority: plan.ranking_priority,
        custom_profile_url: !!plan.custom_profile_url,
        business_hours: !!plan.business_hours,
        public_reviews_allowed: !!plan.public_reviews_allowed,
        review_responses_allowed: !!plan.review_responses_allowed,
        spotlight_eligible: !!plan.spotlight_eligible,
        trust_badge: !!plan.trust_badge,
        analytics_enabled: !!plan.analytics_enabled
      },
      promotion: {
        spotlight_active: !!(vendor && vendor.is_spotlight),
        spotlight_expired_at: vendor ? toMs(vendor.spotlight_until || null) : null
      }
    };
  }

  function getMyBilling() {
    if (_billingP) return _billingP;
    _billingP = withVendor(function (vid) {
      return Promise.all([SAPI().billing.status(vid), vendorMe()]).then(function (rs) {
        var subRes = rs[0] || {};
        var meOut = rs[1] || {};
        var vendor = meOut.data && meOut.data.vendor;
        var sub = subRes.data || null;
        var active = sub && (sub.status === 'active' || sub.status === 'trialing' ||
                             sub.status === 'past_due' || sub.status === 'paused');
        if (sub && active && sub.plan) {
          return { data: billingShape(sub, sub.plan, vendor), error: null, status: 200 };
        }
        // No usable subscription → Free (Xano's fallback: always 200, never 404).
        return freePlanRow().then(function (fp) {
          return { data: billingShape(null, fp, vendor), error: null, status: 200 };
        });
      });
    });
    _billingP.then(function (out) { if (!out || out.error) _billingP = null; }, function () { _billingP = null; });
    return _billingP;
  }

  // ── keepalive REST writes (fire-and-forget tracking) ──────────────────────
  function keepaliveInsert(table, row, token) {
    try {
      var headers = {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + (token || SUPABASE_KEY),
        Prefer: 'return=minimal'
      };
      fetch(SUPABASE_URL + '/rest/v1/' + table, {
        method: 'POST', headers: headers, keepalive: true, body: JSON.stringify(row)
      }).catch(function () {});
    } catch (e) {}
  }

  // ── generic single-row reads the Supabase surface doesn't expose ──────────
  function rawGetById(table, id) {
    return rawClient().then(function (c) {
      return c.from(table).select('*').eq('id', id).maybeSingle();
    }).then(function (res) {
      var out = envelope(res);
      if (!out.error && !out.data) return fail('Not found', 404);
      normalizeTs(out.data);
      return out;
    });
  }

  // Public browse columns = Xano vendors_GET |pick (fuller than the Supabase
  // client's card list — browse renders description/contact bits).
  var VENDOR_LIST_COLS = 'id,business_name,business_tagline,business_description,website_url,' +
    'locations_id,categories_id,profile_photo,text_messages,whatsapp_messages,' +
    'contact_email,phone_number,slug,created_at,is_founding_member,is_verified,is_spotlight';

  // ═══════════════════════════════════════════════════════════════════════════
  // The legacy surface
  // ═══════════════════════════════════════════════════════════════════════════

  var auth = {
    login: function () { return Promise.resolve(fail('Password login is retired — sign in with Clerk.', 410)); },
    googleLogin: function () { return Promise.resolve(fail('Google login goes through Clerk now.', 410)); },
    signup: function () { return Promise.resolve(fail('Signup goes through Clerk now.', 410)); },
    // Xano /me returned the auth user; consumers read both `data.<field>` and
    // `data.user.<field>` — provide both.
    me: function () {
      return waitForClerk().then(function () {
        if (!clerkSession()) return fail('Not signed in', 401);
        return SAPI().account.get().then(function (res) {
          var out = envelope(res);
          if (out.error || !out.data) return out.error ? out : fail('Not signed in', 401);
          normalizeTs(out.data);
          var u = out.data;
          var data = {};
          for (var k in u) if (Object.prototype.hasOwnProperty.call(u, k)) data[k] = u[k];
          data.user = u;
          return { data: data, error: null, status: 200 };
        });
      });
    },
    updateProfile: function (payload) {
      return SAPI().account.update(payload || {}).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        normalizeTs(out.data);
        return { data: out.data || { ok: true }, error: null, status: 200 };
      });
    },
    logout: function () {
      invalidateMe(); invalidateBilling(); _appUserP = null;
      return Promise.resolve({ data: null, error: null, status: 200 });
    },
    // SYNCHRONOUS signed-in signal. Clerk boots async (deferred), so page-load
    // guards calling this at parse time would see null and bounce signed-in
    // users to /login (live cutover bug). The acct cache = "signed in on this
    // browser" persisted by clerk-auth/auth-nav; real auth still happens on
    // every request via the Clerk JWT.
    getToken: function () {
      if (clerkSession()) return 'clerk-session';
      return acctCache() ? 'clerk-cached' : null;
    },
    setToken: function () { invalidateMe(); invalidateBilling(); },
    clearToken: function () { invalidateMe(); invalidateBilling(); _appUserP = null; }
  };

  var vendors = {
    me: vendorMe,
    updateMe: function (payload) {
      payload = payload || {};
      // Same key normalization the Xano client did (category_id→categories_id
      // array, tagline/instagram alias keys). The Supabase client's
      // VENDOR_EDITABLE whitelist drops anything non-writable.
      var categoryId = payload.category_id != null ? payload.category_id : payload.categories_id;
      var fields = {
        business_name: payload.business_name != null ? String(payload.business_name) : '',
        business_description: payload.business_description != null ? String(payload.business_description) : '',
        business_tagline: payload.business_tagline != null ? String(payload.business_tagline)
          : (payload.tagline != null ? String(payload.tagline) : ''),
        website_url: payload.website_url != null ? String(payload.website_url) : '',
        locations_id: Array.isArray(payload.locations_id) ? payload.locations_id
          : (payload.locations_id != null ? [payload.locations_id] : []),
        categories_id: Array.isArray(categoryId) ? categoryId : (categoryId != null ? [categoryId] : []),
        profile_photo: payload.profile_photo != null ? String(payload.profile_photo)
          : (payload.profilePhoto != null ? String(payload.profilePhoto) : ''),
        address: payload.address != null ? String(payload.address) : '',
        contact_email: payload.contact_email != null ? String(payload.contact_email) : '',
        phone_number: payload.phone_number != null ? String(payload.phone_number) : '',
        text_messages: !!payload.text_messages,
        whatsapp_messages: !!payload.whatsapp_messages,
        instagram_url: payload.instagram_url != null ? String(payload.instagram_url)
          : (payload.instagram_handle != null ? String(payload.instagram_handle) : '')
      };
      return withVendor(function (vid) {
        return SAPI().vendors.updateProfile(vid, fields).then(function (res) {
          invalidateMe();
          var out = envelope(res);
          if (!out.error) { normalizeTs(out.data); vendorAliases(out.data); }
          return out;
        });
      });
    },
    getPreferences: function () {
      return withVendor(function (vid) {
        return SAPI().preferences.get(vid).then(function (res) {
          if (res && res.error) return envelope(res);
          return { data: prefsShape(res && res.data), error: null, status: 200 };
        });
      });
    },
    updatePreferences: function (payload) {
      return withVendor(function (vid) {
        return SAPI().preferences.save(vid, payload || {}).then(function (res) {
          if (res && res.error) return envelope(res);
          return { data: prefsShape(res && res.data), error: null, status: 200 };
        });
      });
      // NOTE (parity gap, tracked in CUTOVER.md): the Xano PATCH also mirrored
      // notify_promotional → Brevo MARKETING_OPTIN. A browser client can't hold
      // the Brevo key; that mirror moves to a small Vercel route post-cutover.
    },
    uploadProfilePhoto: function (file) {
      return withVendor(function (vid) {
        return SAPI().storage.uploadImage(vid, 'profile', file).then(function (res) {
          if (res && res.error) return envelope(res);
          var url = res.data.url;
          // Xano's endpoint stored the photo on the vendor row itself — keep that.
          return SAPI().vendors.updateProfile(vid, { profile_photo: url }).then(function () {
            invalidateMe();
            // No `path` key on purpose: a consumer branch prepends the Xano
            // origin to `path`; url/image_url take priority and are absolute.
            return { data: { profile_photo: url, url: url, image_url: url }, error: null, status: 200 };
          });
        });
      });
    },
    deactivate: function () {
      return SAPI().vendors.deactivate().then(function (res) {
        invalidateMe();
        var out = envelope(res);
        if (!out.error && out.data && out.data.ok === false) return fail(out.data.reason || 'failed', 400);
        return out;
      });
    },
    reactivate: function () {
      return SAPI().vendors.reactivate().then(function (res) {
        invalidateMe();
        var out = envelope(res);
        if (!out.error && out.data && out.data.ok === false) return fail(out.data.reason || 'failed', 400);
        return out;
      });
    },
    list: function (params) {
      var q = params || {};
      return rawClient().then(function (c) {
        var query = c.from('vendors').select(VENDOR_LIST_COLS);
        if (q.category_id != null) query = query.contains('categories_id', [Number(q.category_id)]);
        if (q.location_id != null) query = query.contains('locations_id', [Number(q.location_id)]);
        if (q.search_term) {
          // SEC-017: neutralize PostgREST .or() filter metacharacters so a term
          // with , ) ( . * or a backslash can't inject extra filter clauses
          // (read-only against RLS-gated public rows, but keep it clean).
          var term = String(q.search_term).replace(/[\\,.()*%]/g, ' ').trim();
          if (term) {
            query = query.or('business_name.ilike.%' + term + '%,business_description.ilike.%' + term + '%');
          }
        }
        query = query.order('is_founding_member', { ascending: false })
                     .order('business_name', { ascending: true });
        var page = q.page != null ? Math.max(1, Number(q.page)) : 1;
        var per = q.per_page != null ? Math.max(1, Number(q.per_page)) : 20;
        return query.range((page - 1) * per, page * per - 1);
      }).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        var rows = out.data || [];
        for (var i = 0; i < rows.length; i++) vendorAliases(rows[i]);
        normalizeTs(rows);
        return { data: { items: rows }, error: null, status: 200 };
      });
    },
    getById: function (id) {
      return SAPI().vendors.getById(id).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        if (!out.data) return fail('Not found', 404);
        return { data: { vendor: vendorAliases(normalizeTs(out.data)) }, error: null, status: 200 };
      });
    },
    getBySlug: function (slug) {
      return SAPI().vendors.getBySlug(slug).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        if (out.data) {
          return { data: { moved: false, vendor: vendorAliases(normalizeTs(out.data)) }, error: null, status: 200 };
        }
        // Xano resolved renamed slugs via the 301 alias table — mirror that.
        return rawClient().then(function (c) {
          return c.from('slug_aliases').select('vendors_id,new_slug').eq('old_slug', slug).maybeSingle();
        }).then(function (aRes) {
          var alias = aRes && aRes.data;
          if (!alias) return fail('Not found', 404);
          return SAPI().vendors.getById(alias.vendors_id).then(function (vRes) {
            var v = vRes && vRes.data;
            if (!v) return fail('Not found', 404);
            return { data: { moved: true, vendor: vendorAliases(normalizeTs(v)) }, error: null, status: 200 };
          });
        });
      });
    },
    delete: function () {
      return Promise.resolve(fail('Account deletion goes through the account page flow.', 410));
    },
    // Custom profile URL (Pro/Featured) — the settings page always guarded on
    // these existing; the change_vendor_slug RPC finally provides them.
    slugAvailable: function (slug) {
      return rawClient().then(function (c) {
        return Promise.all([
          c.from('vendors').select('id', { count: 'exact', head: true }).eq('slug', slug),
          c.from('slug_aliases').select('id', { count: 'exact', head: true }).eq('old_slug', slug)
        ]);
      }).then(function (rs) {
        var taken = ((rs[0] && rs[0].count) || 0) + ((rs[1] && rs[1].count) || 0);
        var out = { data: { available: taken === 0 }, error: null, status: 200 };
        out.available = taken === 0; // some callers read it off the envelope
        return out;
      }, function (e) { return fail(errText(e)); });
    },
    updateSlug: function (slug) {
      return SAPI().vendors.changeSlug(slug).then(function (res) {
        if (res && res.error) return envelope(res);
        var d = (res && res.data) || {};
        if (d.ok === false) return { data: d, error: d.reason || 'slug_change_failed', status: 400 };
        invalidateMe();
        return { data: { slug: d.slug, value: { slug: d.slug }, changed: d.changed }, error: null, status: 200 };
      });
    }
  };

  // Xano quirk, live-verified 2026-07-07: services lists return {items:[...]}
  // but products lists return a BARE array. Mirror each exactly (`wrap`).
  function listShape(rows, wrap) {
    return wrap ? { items: rows } : rows;
  }

  function listMine(kind, includeInactive, wrap) {
    return withVendor(function (vid) {
      return SAPI()[kind].listByVendor(vid).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        var rows = out.data || [];
        if (includeInactive !== true) {
          rows = rows.filter(function (r) { return r.is_active === true; });
        }
        normalizeTs(rows);
        return { data: listShape(rows, wrap), error: null, status: 200 };
      });
    });
  }

  function listByVendorPublic(kind, vendorId, wrap) {
    return SAPI()[kind].listByVendor(vendorId).then(function (res) {
      var out = envelope(res);
      if (out.error) return out;
      // Anonymous RLS already limits to active rows.
      normalizeTs(out.data || []);
      return { data: listShape(out.data || [], wrap), error: null, status: 200 };
    });
  }

  function photoGroup(kind) {
    var table = kind === 'service' ? 'service_photos' : 'product_photos';
    return {
      list: function (parentId) {
        return SAPI().photos.list(kind, parentId).then(function (res) {
          var out = envelope(res);
          if (!out.error) {
            // Xano's photo list returned only active rows, bare array.
            out.data = (out.data || []).filter(function (p) { return p.is_active !== false; });
            normalizeTs(out.data);
          }
          return out;
        });
      },
      add: function (parentId, imageUrl, sortOrder) {
        return SAPI().photos.add(kind, parentId, imageUrl, sortOrder).then(function (res) {
          var out = envelope(res);
          if (!out.error) normalizeTs(out.data);
          return out;
        });
      },
      update: function (photoId, payload) {
        payload = payload || {};
        var patch = {};
        if (payload.sort_order != null) patch.sort_order = payload.sort_order;
        if (payload.is_active != null) patch.is_active = payload.is_active;
        if (payload.image_url != null) patch.image_url = payload.image_url;
        return rawClient().then(function (c) {
          return c.from(table).update(patch).eq('id', photoId);
        }).then(envelope, function (e) { return fail(errText(e)); });
      },
      remove: function (photoId) {
        return SAPI().photos.remove(kind, photoId).then(envelope);
      }
    };
  }
  var svcPhotos = photoGroup('service');
  var prodPhotos = photoGroup('product');

  function uploadListingImage(kind, file) {
    return withVendor(function (vid) {
      return SAPI().storage.uploadImage(vid, kind, file).then(function (res) {
        if (res && res.error) return envelope(res);
        var url = res.data.url;
        // url/image_url only — never `path` (see uploadProfilePhoto note).
        return { data: { url: url, image_url: url }, error: null, status: 200 };
      });
    });
  }

  var services = {
    getMine: function (includeInactive) { return listMine('services', includeInactive, true); },
    listByVendor: function (vendorId) { return listByVendorPublic('services', vendorId, true); },
    getById: function (id) { return rawGetById('services', id); },
    create: function (payload) {
      return withVendor(function (vid) {
        return SAPI().services.create(vid, payload || {}).then(function (res) {
          var out = envelope(res);
          if (!out.error) normalizeTs(out.data);
          return out;
        });
      });
    },
    update: function (id, payload) {
      return SAPI().services.update(id, payload || {}).then(function (res) {
        var out = envelope(res);
        if (!out.error) normalizeTs(out.data);
        return out;
      });
    },
    delete: function (id) { return SAPI().services.remove(id).then(envelope); },
    listPhotos: svcPhotos.list,
    addPhoto: svcPhotos.add,
    updatePhoto: svcPhotos.update,
    deletePhoto: svcPhotos.remove,
    uploadServiceImage: function (file) { return uploadListingImage('service', file); }
  };

  var products = {
    getMine: function (includeInactive) { return listMine('products', includeInactive, false); },
    listByVendor: function (vendorId) { return listByVendorPublic('products', vendorId, false); },
    getById: function (id) { return rawGetById('products', id); },
    create: function (payload) {
      return withVendor(function (vid) {
        return SAPI().products.create(vid, payload || {}).then(function (res) {
          var out = envelope(res);
          if (!out.error) normalizeTs(out.data);
          return out;
        });
      });
    },
    update: function (id, payload) {
      return SAPI().products.update(id, payload || {}).then(function (res) {
        var out = envelope(res);
        if (!out.error) normalizeTs(out.data);
        return out;
      });
    },
    delete: function (id) { return SAPI().products.remove(id).then(envelope); },
    listPhotos: prodPhotos.list,
    addPhoto: prodPhotos.add,
    updatePhoto: prodPhotos.update,
    deletePhoto: prodPhotos.remove,
    uploadProductImage: function (file) { return uploadListingImage('product', file); }
  };

  var plans = {
    getMyBilling: getMyBilling,
    invalidateBilling: invalidateBilling
  };

  var THIRTY_D = 30 * 24 * 3600 * 1000;
  var ONE80_D = 180 * 24 * 3600 * 1000;

  var leads = {
    submitInquiry: function (vendorId, payload) {
      payload = payload || {};
      // Honeypot parity: Xano silently accepted-and-dropped bot submissions.
      if (payload.website) return Promise.resolve({ data: { ok: true }, error: null, status: 200 });
      return SAPI().inquiries.submit(vendorId, payload).then(envelope);
    },
    trackEvent: function (vendorId, eventType, source) {
      // Fire-and-forget with keepalive, exactly like the Xano client — this
      // write feeds the review gate, and the page often navigates to tel:/wa.me
      // immediately. Signed-in callers carry the Clerk token so the DB trigger
      // stamps user_id (the gate key); anonymous falls back to the anon insert.
      try {
        var row = { vendors_id: vendorId, event_type: eventType, source: source || 'listing' };
        clerkTokenP().then(function (token) { keepaliveInsert('lead_events', row, token); },
                           function () { keepaliveInsert('lead_events', row, null); });
      } catch (e) {}
    },
    trackView: function (vendorId, source, itemId) {
      try {
        var row = { vendors_id: vendorId, source: source || 'listing' };
        if (itemId != null) row.item_id = itemId;
        keepaliveInsert('page_views', row, null);
      } catch (e) {}
    },
    getMine: function () {
      return withVendor(function (vid) {
        return Promise.all([SAPI().leads.inquiries(vid), SAPI().leads.events(vid)]).then(function (rs) {
          var iq = rs[0] || {}, ev = rs[1] || {};
          if (iq.error) return envelope(iq);
          if (ev.error) return envelope(ev);
          var cutoff = Date.now() - THIRTY_D;
          var inquiries = normalizeTs(iq.data || []);
          var events = normalizeTs(ev.data || []).filter(function (e) {
            return typeof e.created_at === 'number' ? e.created_at >= cutoff : true;
          });
          return { data: { inquiries: inquiries, events_30d: events }, error: null, status: 200 };
        });
      });
    },
    analytics: function () {
      return withVendor(function (vid) {
        var sinceIso = new Date(Date.now() - ONE80_D).toISOString();
        return Promise.all([
          SAPI().analytics.pageViews(vid, sinceIso),
          SAPI().leads.inquiries(vid),
          SAPI().leads.events(vid),
          SAPI().analytics.pageViewCount(vid) // all-time
        ]).then(function (rs) {
          var pv = rs[0] || {}, iq = rs[1] || {}, ev = rs[2] || {}, pc = rs[3] || {};
          var firstErr = pv.error || iq.error || ev.error;
          if (firstErr) return envelope({ error: firstErr });
          var now = Date.now();
          var winStart = now - ONE80_D;
          var inquiries = normalizeTs(iq.data || []);
          var events = normalizeTs(ev.data || []);
          var views = normalizeTs(pv.data || []);
          var unread = inquiries.filter(function (i) { return i.is_read !== true; }).length;
          function inWindow(r) { return typeof r.created_at === 'number' ? r.created_at >= winStart : true; }
          return {
            data: {
              generated_at: now,
              window_start: winStart,
              totals: {
                inquiries: inquiries.length,           // all-time (full table for this vendor)
                contacts: events.length,               // all-time
                views: typeof pc.count === 'number' ? pc.count : views.length,
                unread: unread
              },
              inquiries: inquiries.filter(inWindow).map(function (i) { return { created_at: i.created_at }; }),
              contacts: events.filter(inWindow).map(function (e) { return { created_at: e.created_at, event_type: e.event_type }; }),
              views: views.map(function (v) { return { created_at: v.created_at, source: v.source, item_id: v.item_id }; })
            },
            error: null, status: 200
          };
        });
      });
    },
    markRead: function (inquiryId) {
      return SAPI().leads.setInquiryStatus(inquiryId, { is_read: true }).then(envelope);
    },
    setInquiryStatus: function (inquiryId, status) {
      return SAPI().leads.setInquiryStatus(inquiryId, { status: status }).then(envelope);
    },
    setEventStatus: function (eventId, status) {
      return SAPI().leads.setEventStatus(eventId, status).then(envelope);
    }
  };

  var share = {
    create: function (vendorId, channel) {
      return SAPI().shares.create(vendorId, channel).then(function (res) {
        if (res && res.error) return envelope(res);
        var d = (res && res.data) || {};
        if (d.ok === false) return { data: d, error: d.reason || 'share_failed', status: 400 };
        return { data: { share_code: d.share_code, share_url: d.share_url }, error: null, status: 200 };
      });
    },
    resolve: function (code, session) {
      if (!code) return;
      try { SAPI().shares.resolve(code, session).then(function () {}, function () {}); } catch (e) {}
    },
    count: function () {
      return withVendor(function (vid) {
        return SAPI().shares.count(vid).then(function (res) {
          if (res && res.error) return envelope(res);
          var d = (res && res.data) || {};
          if (d.ok === false) return { data: d, error: d.reason || 'share_count_failed', status: 400 };
          return { data: { unique_sharers: d.unique_sharers || 0, landings: d.landings || 0 }, error: null, status: 200 };
        });
      });
    }
  };

  var account = {
    get: function () {
      return waitForClerk().then(function () {
        return SAPI().account.get();
      }).then(function (res) {
        var out = envelope(res);
        if (!out.error) normalizeTs(out.data);
        return out;
      });
    },
    update: function (payload) {
      return SAPI().account.update(payload || {}).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        return { data: { ok: true }, error: null, status: 200 };
      });
    }
  };

  // Public vendor-card fields (SEC-002 list) for the my-reviews join.
  var VENDOR_CARD_COLS = 'id,business_name,business_tagline,business_description,' +
    'profile_photo,locations_id,categories_id,slug,is_founding_member,is_verified,is_spotlight';

  var reviews = {
    forVendor: function (vendorId) {
      return SAPI().reviews.listByVendor(vendorId).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        normalizeTs(out.data || []);
        return { data: { items: out.data || [] }, error: null, status: 200 };
      });
    },
    mine: function () {
      return ensureAppUser().then(function (uid) {
        if (uid == null) return fail('Not signed in', 401);
        return rawClient().then(function (c) {
          return c.from('reviews')
            .select('id,vendors_id,user_id,author_name,rating,is_recommended,is_verified_contact,' +
                    'comment,vendor_reply,vendor_reply_at,services_id,products_id,created_at,' +
                    'vendors(' + VENDOR_CARD_COLS + ')')
            .eq('user_id', uid)
            .order('created_at', { ascending: false });
        }).then(function (res) {
          var out = envelope(res);
          if (out.error) return out;
          var rows = out.data || [];
          for (var i = 0; i < rows.length; i++) {
            rows[i].vendor = rows[i].vendors || null; // Xano's join key was `vendor`
            delete rows[i].vendors;
          }
          normalizeTs(rows);
          return { data: rows, error: null, status: 200 };
        });
      });
    },
    awaiting: function () {
      return SAPI().reviews.awaiting().then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        var rows = Array.isArray(out.data) ? out.data : [];
        return { data: { items: rows }, error: null, status: 200 };
      });
    },
    create: function (payload) {
      payload = payload || {};
      return SAPI().reviews.create({
        vendorId: payload.vendors_id != null ? payload.vendors_id : payload.vendorId,
        isRecommended: payload.is_recommended !== false && payload.isRecommended !== false,
        comment: payload.comment || null,
        serviceId: payload.services_id != null ? payload.services_id : null,
        productId: payload.products_id != null ? payload.products_id : null
      }).then(function (res) {
        if (res && res.error) return envelope(res);
        var d = (res && res.data) || {};
        if (d.ok === false) return { data: d, error: d.reason || 'review_failed', status: 400 };
        return { data: d, error: null, status: 200 };
      });
    },
    update: function (reviewId, payload) {
      return SAPI().reviews.updateMine(reviewId, payload || {}).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        return { data: { ok: true }, error: null, status: 200 };
      });
    },
    remove: function (reviewId) {
      return SAPI().reviews.removeMine(reviewId).then(envelope);
    },
    report: function (reviewId, reason) {
      return withVendor(function (vid) {
        return SAPI().reports.review(reviewId, vid, null, reason).then(function (res) {
          var out = envelope(res);
          if (out.error) return out;
          return { data: { ok: true }, error: null, status: 200 };
        });
      });
    },
    reply: function (reviewId, replyText) {
      return SAPI().reviews.reply(reviewId, replyText).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        return { data: { ok: true }, error: null, status: 200 };
      });
    },
    reportVendor: function (vendorId, category, reason) {
      return SAPI().reports.vendor(vendorId, category, reason).then(function (res) {
        var out = envelope(res);
        if (out.error) return out;
        return { data: { ok: true }, error: null, status: 200 };
      });
    }
  };

  var data = {
    categories: function () {
      return SAPI().data.categories().then(function (res) {
        var out = envelope(res);
        if (!out.error) normalizeTs(out.data);
        return out;
      });
    },
    locations: function () {
      return SAPI().data.locations().then(function (res) {
        var out = envelope(res);
        if (!out.error) normalizeTs(out.data);
        return out;
      });
    }
  };

  // ── raw request() shim ─────────────────────────────────────────────────────
  // A few live scripts bypass the grouped API with LokaliAPI.request(base,
  // method, path, ...). Map every known live call; anything unmapped fails
  // LOUDLY so it surfaces during harness testing, not silently in production.
  function requestShim(base, method, path, body) {
    var p = String(path || '').replace(/^\//, '');
    var m = String(method || 'GET').toUpperCase();
    var match;

    if (base === 'favorites') {
      if (m === 'GET') {
        return waitForClerk().then(function () {
          return SAPI().favorites.list();
        }).then(function (res) {
          var out = envelope(res);
          if (out.error) return out;
          var rows = out.data || [];
          for (var i = 0; i < rows.length; i++) {
            rows[i].vendor = vendorAliases(rows[i].vendors || null); // Xano key
            delete rows[i].vendors;
          }
          normalizeTs(rows);
          return { data: rows, error: null, status: 200 };
        });
      }
      if (m === 'POST') return SAPI().favorites.add(body && body.vendors_id).then(envelope);
      if (m === 'DELETE') {
        match = p.match(/^favorites\/(\d+)/);
        return SAPI().favorites.remove(match ? Number(match[1]) : null).then(envelope);
      }
    }

    if (base === 'vendors') {
      match = p.match(/^(?:vendor\/)?id\/(\d+)\/portfolio\/photos\/list$/);
      if (match) {
        return SAPI().photos.list('vendor', Number(match[1])).then(function (res) {
          var out = envelope(res);
          if (!out.error) {
            out.data = (out.data || []).filter(function (r) { return r.is_active !== false; });
            normalizeTs(out.data);
          }
          return out;
        });
      }
      match = p.match(/^vendor\/slug\/(.+)$/);
      if (match) return vendors.getBySlug(decodeURIComponent(match[1]));
      match = p.match(/^vendor\/id\/(\d+)$/);
      if (match) return vendors.getById(Number(match[1]));
      if (p.indexOf('vendors') === 0) {
        var qs = parseQs(p);
        return vendors.list({
          location_id: qs.location_id, category_id: qs.category_id,
          search_term: qs.search_term, page: qs.page, per_page: qs.per_page
        });
      }
    }

    if (base === 'services') {
      match = p.match(/^services\/(\d+)$/);
      if (match && m === 'GET') return services.getById(Number(match[1]));
      if (p.indexOf('services?') === 0 && m === 'GET') {
        return listByVendorPublic('services', parseQs(p).vendor_id, true);
      }
    }
    if (base === 'products') {
      match = p.match(/^products\/(\d+)$/);
      if (match && m === 'GET') return products.getById(Number(match[1]));
      if (p.indexOf('products?') === 0 && m === 'GET') {
        return listByVendorPublic('products', parseQs(p).vendor_id, false);
      }
    }
    if (base === 'reviews' && m === 'GET' && p.indexOf('reviews?') === 0) {
      return reviews.forVendor(parseQs(p).vendors_id);
    }
    if (base === 'auth' && m === 'GET') {
      if (p === 'me') return auth.me();
      if (p === 'account') return account.get();
    }

    try { console.warn('[lokali-adapter] unmapped request():', base, m, path); } catch (e) {}
    return Promise.resolve(fail('Endpoint not available on the Supabase backend: ' + base + ' ' + m + ' ' + p, 0));
  }

  function parseQs(p) {
    var out = {};
    var qi = p.indexOf('?');
    if (qi < 0) return out;
    var pairs = p.slice(qi + 1).split('&');
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split('=');
      out[decodeURIComponent(kv[0])] = kv[1] != null ? decodeURIComponent(kv[1]) : '';
    }
    return out;
  }

  var adapter = {
    request: requestShim,
    auth: auth,
    vendors: vendors,
    services: services,
    products: products,
    plans: plans,
    leads: leads,
    share: share,
    account: account,
    reviews: reviews,
    data: data,
    getToken: auth.getToken,
    setToken: auth.setToken,
    clearToken: auth.clearToken,
    __isSupabaseAdapter: true
  };

  if (typeof window !== 'undefined') {
    // Always exposed for the diff harness / manual testing.
    window.LokaliSupabaseAdapter = adapter;
    // The actual cutover flip — only when the backend flag says so.
    var activate = function () {
      if (window.LOKALI_BACKEND === 'supabase') window.LokaliAPI = adapter;
    };
    activate();
    // Re-assert after DOM ready in case a later-loading Xano client clobbers it.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', activate);
    }
  }
})();
