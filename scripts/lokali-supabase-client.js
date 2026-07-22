/*
 * lokali-supabase-client.js
 * ---------------------------------------------------------------------------
 * The browser's connection to Supabase — the replacement for the Xano base
 * URLs in lokali-api-client.js. Built for the Xano -> Supabase migration;
 * updated for the Clerk -> Supabase Auth migration (Phase D).
 *
 * WHAT IT DOES
 *   1. Creates a Supabase client using the project URL + PUBLISHABLE key. Both
 *      are safe in the browser — they're public by design; the Row-Level
 *      Security policies (rls.sql) are what actually protect the data.
 *   2. supabase-js OWNS auth sessions now (Supabase Auth — sign-in happens in
 *      lokali-auth.js). Sessions persist in localStorage, tokens auto-refresh,
 *      and OAuth / email-confirmation / recovery codes in the URL are picked up
 *      automatically (PKCE flow). RLS identity is `auth.uid()` (the
 *      auth.users uuid), matched against `app_user.auth_user_id`. Logged-out
 *      visitors are anonymous (fine for the public read paths).
 *
 * USAGE: `await window.LokaliSupabaseReady;` then use
 *   `window.LokaliSupabase.from('vendors').select(...)` etc.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // Public config. Safe to ship in client code (protected by RLS). Overridable
  // via window vars if we ever point at a different project.
  var SUPABASE_URL =
    (typeof window !== 'undefined' && window.LOKALI_SUPABASE_URL) ||
    'https://baacipkokiweipncavov.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY =
    (typeof window !== 'undefined' && window.LOKALI_SUPABASE_PUBLISHABLE_KEY) ||
    'sb_publishable_--wRW6DD_9ZCBqfb0kJUww_0lzfzs39';

  // Load supabase-js (ESM) from jsDelivr — the same CDN the rest of the Lokali
  // scripts already ship from — and build the singleton client.
  window.LokaliSupabaseReady = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm')
    .then(function (mod) {
      var createClient = mod.createClient;
      var client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          // supabase-js owns sessions (Supabase Auth): persist across loads,
          // refresh tokens automatically, and detect the auth code that email
          // confirmations / OAuth / password-recovery links put in the URL.
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      });
      window.LokaliSupabase = client;
      // CLEAN-C9 — debug-only: this fired on every pageview for every visitor.
      // The failure path below still logs unconditionally (errors are worth seeing).
      if (window.LOKALI_DEBUG) { try { console.log('[lokali-supabase] client ready'); } catch (e) {} }
      return client;
    })
    .catch(function (err) {
      try { console.error('[lokali-supabase] failed to init', err); } catch (e) {}
      throw err;
    });

  // Current Supabase access token, or null when logged out / not yet booted.
  // Resolved fresh per request so a user who logs in mid-session is picked up.
  function sessionAccessToken() {
    try {
      return window.LokaliSupabaseReady.then(function (c) {
        return c.auth.getSession().then(function (r) {
          var s = r && r.data && r.data.session;
          return (s && s.access_token) || null;
        });
      }).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  // -------------------------------------------------------------------------
  // Read API — the Supabase equivalents of the LokaliAPI read methods the
  // public listing uses. Note how thin these are compared to the Xano
  // endpoints: the "only approved + active" gating now lives in the RLS
  // policies (rls.sql), so the queries don't repeat it. Every method resolves
  // to { data, error } (supabase-js's shape). Wiring the UI onto these comes
  // next; for now they're independently testable.
  // -------------------------------------------------------------------------
  function withClient(run) {
    return window.LokaliSupabaseReady.then(function (c) { return run(c); })
      // Contract: every method RESOLVES { data, error } — the page scripts were
      // written against the Xano client, which never rejected. A failed ESM
      // import of supabase-js (flaky network, CDN hiccup, blocker) must surface
      // as an error envelope, not strand every caller on an unhandled rejection.
      .catch(function (err) {
        return { data: null, error: { message: (err && err.message) || 'Supabase client failed to load' } };
      });
  }

  // Base URL of the Vercel API. A couple of writes go through a route instead
  // of straight to Supabase — the inquiry + review submits, which must fire a
  // Brevo email server-side. Derived from LOKALI_AUTH_SYNC_URL (canonical) or
  // the legacy LOKALI_CLERK_SYNC_URL, overridable directly.
  function vercelApiBase() {
    if (typeof window === 'undefined') return '';
    if (window.LOKALI_VERCEL_API_BASE) return String(window.LOKALI_VERCEL_API_BASE).replace(/\/$/, '');
    if (window.LOKALI_AUTH_SYNC_URL) return String(window.LOKALI_AUTH_SYNC_URL).replace(/\/(auth-sync|clerk-sync)\/?$/, '');
    if (window.LOKALI_CLERK_SYNC_URL) return String(window.LOKALI_CLERK_SYNC_URL).replace(/\/(auth-sync|clerk-sync)\/?$/, '');
    return '';
  }
  // POST JSON to a Vercel route; resolves to { data, error } like supabase-js.
  function postRoute(path, payload, withAuth) {
    var url = vercelApiBase() + path;
    var authP = withAuth ? sessionAccessToken() : Promise.resolve(null);
    return authP.then(function (token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload || {}) })
        .then(function (res) {
          return res.json().catch(function () { return null; }).then(function (data) {
            if (!res.ok) return { data: data, error: (data && data.error) || ('HTTP ' + res.status) };
            return { data: data, error: null };
          });
        });
    }).catch(function (err) { return { data: null, error: (err && err.message) || 'network_error' }; });
  }

  // Cached app_user.id of the signed-in caller, filled by auth.ensureUser().
  // Needed only by methods that must filter to "my own rows" where RLS returns
  // a superset — e.g. reviews.mine(), because approved reviews are publicly
  // readable so a bare select would also return everyone else's.
  var appUserId = null;

  // Keep an object to only the listed keys — so a stray/protected field in the
  // caller's payload can't reach the DB (a non-granted column would otherwise
  // make Postgres reject the whole write). The column grants in rls.sql are the
  // real guard; this just gives a clean client-side surface.
  function pick(obj, keys) {
    var out = {};
    obj = obj || {};
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(obj, keys[i]) && obj[keys[i]] !== undefined) {
        out[keys[i]] = obj[keys[i]];
      }
    }
    return out;
  }

  // Owner-editable column sets — mirror the `grant update (...)` lists in rls.sql
  // (vendors, reviews) and the sane presentation fields for services/products.
  var VENDOR_EDITABLE = [
    'business_name', 'business_description', 'business_tagline', 'website_url',
    'instagram_url', 'locations_id', 'categories_id', 'subcategories', 'profile_photo', // subcategories = #96 (≤3, DB CHECK-capped)
    'owner_name', 'owner_bio', 'owner_photo', 'owner_languages', // #76e Meet the Vendor
    'text_messages', 'whatsapp_messages', 'phone_calls', // phone_calls = #76c call preference
    'phone_number', 'phone_visible',
    'contact_email', 'address',
    // P2P payment handles (stored bare; URL built at render time).
    'venmo_username', 'cashapp_cashtag', 'paypalme_slug',
    'other_pay_url', 'other_pay_label', 'zelle_contact'
    // NB: 'slug' is intentionally NOT here — it changes only via vendors.changeSlug
    // (the validated/rate-limited path) or the auto-slug trigger.
  ];
  var SERVICE_EDITABLE = [
    'service_name', 'service_description', 'duration_minutes', 'is_active',
    'remote', 'sort_order', 'price_type', 'price_cents', 'price_min_cents',
    'price_max_cents', 'price_note', 'image_url', 'video_url', 'slug',
    'subcategory', // #96-LISTING: one optional taxonomy slug per listing
    'lead_time',   // #78: free-text per-item lead time (display only)
    'is_featured_pick' // FEAT-PICKS: Featured-plan shop window (cap+plan gate = DB trigger)
  ];
  var PRODUCT_EDITABLE = [
    'product_name', 'product_description', 'price', 'stock_quantity', 'image_url',
    'video_url', 'is_custom', 'turnaround_days', 'is_quote_based', 'is_active',
    'shipping_offered', 'pickup_only', 'sort_order', 'slug',
    'subcategory', // #96-LISTING
    'lead_time',   // #78: free-text per-item lead time (supersedes turnaround_days for display)
    'is_featured_pick' // FEAT-PICKS: Featured-plan shop window (cap+plan gate = DB trigger)
  ];
  // Author may edit only these (vendor_reply is stamped by the guard trigger).
  var REVIEW_EDITABLE = ['comment', 'is_recommended', 'rating'];
  var PREF_EDITABLE = [
    'notify_inquiry', 'notify_announcements', 'notify_promotional',
    'notify_review', 'show_public_reviews'
  ];
  // Customer account fields the person may edit (mirror rls.sql app_user grant).
  var APP_USER_EDITABLE = [
    'first_name', 'last_name', 'phone_number', 'preferred_language', 'region',
    'notif_letter', 'notif_vendor_replies', 'notif_review_reminders',
    'avatar' // #76 customer-dashboard preset avatar id
  ];
  // The public vendor surface — exactly the column grant in
  // patch_vendor_columns.sql (Xano's public |pick). select('*') on vendors
  // FAILS for browser roles by design; the owner's full row comes from the
  // get_my_vendor() RPC (security definer), never a table select.
  var VENDOR_PUBLIC_COLS =
    'id,business_name,business_description,business_tagline,' +
    'website_url,instagram_url,locations_id,categories_id,subcategories,profile_photo,' + // subcategories = #96

    'owner_name,owner_bio,owner_photo,owner_languages,' +
    'text_messages,whatsapp_messages,phone_calls,phone_number,phone_visible,contact_email,' +
    'created_at,is_active,slug,is_founding_member,' +
    'is_spotlight,spotlight_until,is_verified,is_featured,plan_rank,' +
    'venmo_username,cashapp_cashtag,paypalme_slug,other_pay_url,other_pay_label,zelle_contact,' +
    'is_publish_ready';  // #90 publish gate — listing page renders a "not public yet" state on false
  // Photo-gallery kind -> its table + parent-id column.
  var PHOTO_TABLES = {
    service: { table: 'service_photos', parent: 'services_id' },
    product: { table: 'product_photos', parent: 'products_id' },
    vendor:  { table: 'vendor_photos',  parent: 'vendors_id' }
  };
  var MEDIA_BUCKET = 'vendor-media';

  window.LokaliSupabaseAPI = {
    vendors: {
      // RLS returns the row only if it's approved + active (or owned).
      getBySlug: function (slug) {
        return withClient(function (c) {
          return c.from('vendors').select(VENDOR_PUBLIC_COLS).eq('slug', slug).maybeSingle();
        });
      },
      getById: function (id) {
        return withClient(function (c) {
          return c.from('vendors').select(VENDOR_PUBLIC_COLS).eq('id', id).maybeSingle();
        });
      },
      // Browse / "the market" page. Optional filters by category, location, and
      // a name search. RLS still limits to approved+active, so the list is
      // always safe. Founding members surface first, then alphabetical.
      list: function (opts) {
        opts = opts || {};
        return withClient(function (c) {
          var q = c.from('vendors').select(
            'id,business_name,business_tagline,slug,profile_photo,' +
            'locations_id,categories_id,is_verified,is_featured,is_founding_member,plan_rank'
          ).eq('is_publish_ready', true);  // #90 publish gate (see adapter list())
          if (opts.categoryId != null) q = q.contains('categories_id', [opts.categoryId]);
          if (opts.locationId != null) q = q.contains('locations_id', [opts.locationId]);
          if (opts.search) q = q.ilike('business_name', '%' + opts.search + '%');
          return q
            .order('is_founding_member', { ascending: false })
            .order('business_name', { ascending: true });
        });
      },
      // Whole listing in ONE request (vendor + services + products + approved
      // reviews) via PostgREST embeds — replaces Xano's 3-4 separate calls.
      getFullListing: function (slug) {
        return withClient(function (c) {
          return c.from('vendors').select(
            VENDOR_PUBLIC_COLS + ',' +
            'services(*),' +
            'products(*),' +
            'reviews(id,author_name,is_recommended,is_verified_contact,comment,vendor_reply,vendor_reply_at,services_id,products_id,created_at)'
          ).eq('slug', slug).maybeSingle();
        });
      },
      // The caller's OWN vendor row (the dashboard's starting point). Uses the
      // get_my_vendor() RPC because a bare select would also return every public
      // listing; the RPC filters to current_app_user_id(). Returns { data, error }
      // where data is the vendor row, or null if this user has no vendor yet.
      // The dashboard should cache data.id and pass it to the owner methods below.
      me: function () {
        return withClient(function (c) { return c.rpc('get_my_vendor'); });
      },
      // Owner edits their own listing. Only the column-granted presentation
      // fields are sent (rls.sql column grants + the vendors_owner_update policy
      // enforce this server-side too). is_approved / stripe_* / identity_* are
      // never writable here — those move through Edge Functions.
      updateProfile: function (vendorId, fields) {
        return withClient(function (c) {
          // Read-back is the public column list (a bare .select() would expand
          // to * and trip the column-scoped grant). Full-row needs → vendors.me().
          return c.from('vendors').update(pick(fields, VENDOR_EDITABLE))
            .eq('id', vendorId).select(VENDOR_PUBLIC_COLS).maybeSingle();
        });
      },
      // Change the custom profile URL (Pro/Featured). Server validates format,
      // reserved words, uniqueness, a 30-day limit, and writes a 301 alias.
      // Returns { data: { ok, changed, slug } | { ok:false, reason }, error }.
      changeSlug: function (slug) {
        return withClient(function (c) {
          return c.rpc('change_vendor_slug', { p_slug: slug });
        });
      },
      // Hide / restore the caller's own listing (is_active isn't column-granted;
      // set_vendor_active is the only path). Returns { data: { ok, is_active } }.
      deactivate: function () {
        return withClient(function (c) { return c.rpc('set_vendor_active', { p_active: false }); });
      },
      reactivate: function () {
        return withClient(function (c) { return c.rpc('set_vendor_active', { p_active: true }); });
      }
    },
    // #71 availability / limited-capacity. Reads are anon RPCs that return DERIVED
    // status only (never raw counts). Writes are the two public routes (service
    // role + vendor notify). Owner actions (confirm/decline/offer) are added by
    // the dashboard client — they're authenticated RPCs gated by owns_vendor().
    availability: {
      // Derived per-date status for [fromISO, toISO] (YYYY-MM-DD). Empty array
      // when the vendor isn't on the feature -> the storefront shows no calendar.
      calendar: function (vendorId, fromISO, toISO) {
        return withClient(function (c) {
          return c.rpc('availability_calendar', {
            p_vendors_id: vendorId, p_from: fromISO, p_to: toISO
          });
        });
      },
      // Open slot times for one date (slot mode). Empty for quantity mode — the
      // storefront uses that emptiness to pick the qty stepper vs the slot list.
      slots: function (vendorId, dateISO) {
        return withClient(function (c) {
          return c.rpc('availability_slots', { p_vendors_id: vendorId, p_date: dateISO });
        });
      },
      // Public weekly hours for the storefront "Hours" block (Pro/Featured perk).
      // Returns [] for a free/off-plan vendor. Derived read — never a raw count.
      hoursPublic: function (vendorId) {
        return withClient(function (c) {
          return c.rpc('availability_hours_public', { p_vendors_id: vendorId });
        });
      },
      // Public date-aware inquiry -> /availability/submit (service-role RPC +
      // vendor notify). No auth (open to logged-out visitors). Returns
      // { data: { ok, inquiry_id } | { ok:false, reason }, error }.
      submitInquiry: function (payload) {
        payload = payload || {};
        return postRoute('/availability/submit', {
          vendorId: payload.vendorId,
          date: payload.date,
          qty: payload.qty != null ? payload.qty : null,
          slotTime: payload.slotTime || null,
          name: payload.name || null,
          email: payload.email || null,
          phone: payload.phone || null,
          message: payload.message || null,
          website: payload.website || null
        }, false);
      },
      // Public waitlist join for a sold-out date -> /availability/waitlist.
      joinWaitlist: function (payload) {
        payload = payload || {};
        return postRoute('/availability/waitlist', {
          vendorId: payload.vendorId,
          date: payload.date,
          email: payload.email,
          name: payload.name || null,
          qty: payload.qty != null ? payload.qty : null,
          slotTime: payload.slotTime || null,
          website: payload.website || null
        }, false);
      },

      // ---- OWNER methods (vendor dashboard /vendor-dashboard/availability). ----
      // All RLS-scoped to owns_vendor(); config writes additionally require the
      // Pro/Featured plan gate server-side. Raw counts are owner-visible here.
      hasPlan: function (vendorId) {
        return withClient(function (c) {
          return c.rpc('has_availability_plan', { p_vendors_id: vendorId });
        });
      },
      // Waitlist is FEATURED-only. anon-callable: the storefront decides whether
      // a sold-out date shows the join form or a plain sold-out message.
      waitlistOpen: function (vendorId) {
        return withClient(function (c) {
          return c.rpc('has_waitlist_plan', { p_vendors_id: vendorId });
        });
      },
      getConfig: function (vendorId) {
        return withClient(function (c) {
          return c.from('availability_config').select('*').eq('vendors_id', vendorId).maybeSingle();
        });
      },
      saveConfig: function (vendorId, fields) {
        var row = Object.assign({ vendors_id: vendorId }, fields || {});
        return withClient(function (c) {
          return c.from('availability_config').upsert(row, { onConflict: 'vendors_id' });
        });
      },
      // Per-date rows for the month (blackouts + confirmed counts; owner-only read).
      listDates: function (vendorId, fromISO, toISO) {
        return withClient(function (c) {
          return c.from('availability_date').select('*')
            .eq('vendors_id', vendorId).gte('the_date', fromISO).lte('the_date', toISO);
        });
      },
      setDateBlocked: function (vendorId, dateISO, blocked) {
        return withClient(function (c) {
          return c.from('availability_date')
            .upsert({ vendors_id: vendorId, the_date: dateISO, is_blocked: !!blocked },
                    { onConflict: 'vendors_id,the_date' });
        });
      },
      // Materialized per-date slot rows for the month (slot mode; owner-only via
      // RLS). The dashboard's Days-off calendar shows booked-of-generated counts.
      listSlots: function (vendorId, fromISO, toISO) {
        return withClient(function (c) {
          return c.from('availability_slot')
            .select('the_date,slot_time,booked_count,capacity,hold_expires_at')
            .eq('vendors_id', vendorId).gte('the_date', fromISO).lte('the_date', toISO);
        });
      },
      // Weekly HOURS schedule (the unified open→close windows). Doubles as the
      // storefront "Hours" and, in slot mode, the source the bookable times are
      // generated from (server-side avail_expand_slots). weekday: 0=Sun … 6=Sat.
      // slotMin/bufferMin null => inherit the config default (per-window override).
      listHours: function (vendorId) {
        return withClient(function (c) {
          return c.from('availability_hours').select('*')
            .eq('vendors_id', vendorId).order('weekday').order('open_time');
        });
      },
      addHours: function (vendorId, weekday, open, close, slotMin, bufferMin) {
        return withClient(function (c) {
          return c.from('availability_hours').insert({
            vendors_id: vendorId, weekday: weekday,
            open_time: open, close_time: close,
            slot_minutes: slotMin != null ? slotMin : null,
            buffer_minutes: bufferMin != null ? bufferMin : null
          });
        });
      },
      updateHours: function (hoursId, fields) {
        return withClient(function (c) {
          return c.from('availability_hours').update(fields || {}).eq('id', hoursId);
        });
      },
      removeHours: function (hoursId) {
        return withClient(function (c) {
          return c.from('availability_hours').delete().eq('id', hoursId);
        });
      },
      // Pending date-tagged requests (the confirm inbox).
      pendingRequests: function (vendorId) {
        return withClient(function (c) {
          return c.from('inquiries')
            .select('id,created_at,customer_name,customer_email,customer_phone,message,requested_date,requested_qty,slot_id,availability_status')
            .eq('vendors_id', vendorId).eq('availability_status', 'pending')
            .order('requested_date').order('created_at');
        });
      },
      // Confirm / decline — the ONLY capacity movers, owner-only RPCs.
      confirm: function (inquiryId) {
        return withClient(function (c) {
          return c.rpc('confirm_availability_inquiry', { p_inquiry_id: inquiryId });
        });
      },
      decline: function (inquiryId) {
        return withClient(function (c) {
          return c.rpc('decline_availability_inquiry', { p_inquiry_id: inquiryId });
        });
      },
      // Waitlist queue + offer-a-freed-spot.
      listWaitlist: function (vendorId) {
        return withClient(function (c) {
          return c.from('availability_waitlist').select('*')
            .eq('vendors_id', vendorId).in('status', ['waiting', 'offered'])
            .order('the_date').order('created_at');
        });
      },
      offerSpot: function (waitlistId, hours) {
        return withClient(function (c) {
          return c.rpc('offer_waitlist_spot', { p_waitlist_id: waitlistId, p_hours: hours || 6 });
        });
      },
      // Customer-facing emails, fired best-effort by the dashboard right after a
      // successful confirm/offer. These go through the Vercel route (Brevo needs
      // the server key + the confirm/offer RPCs never return the customer email);
      // the route re-verifies the vendor session + row ownership. Authed POST.
      notifyConfirmed: function (inquiryId) {
        return postRoute('/availability/notify', { kind: 'confirm', inquiryId: inquiryId }, true);
      },
      notifyOffered: function (waitlistId) {
        return postRoute('/availability/notify', { kind: 'offer', waitlistId: waitlistId }, true);
      }
    },
    reviews: {
      // Public, approved reviews for a vendor (RLS enforces is_approved AND the
      // vendor's show_public_reviews preference — patch_reviews_privacy.sql).
      // Explicit column list = exactly the anon column grant (mirrors Xano's
      // public |pick); a select('*') would fail under the column-scoped grants.
      listByVendor: function (vendorId) {
        return withClient(function (c) {
          return c.from('reviews')
            .select('id,author_name,is_recommended,is_verified_contact,comment,vendor_reply,vendor_reply_at,services_id,products_id,created_at')
            .eq('vendors_id', vendorId)
            .order('created_at', { ascending: false });
        });
      },
      // Post a review — goes through the /review route (verifies the Supabase JWT, runs the
      // contact gate via admin_submit_review, emails the vendor). Returns
      // { data: { ok, id, verified, flagged, ... } | { ok:false, reason }, error }.
      create: function (payload) {
        payload = payload || {};
        return postRoute('/review', {
          vendorId: payload.vendorId,
          isRecommended: payload.isRecommended !== false,
          comment: payload.comment || null,
          serviceId: payload.serviceId != null ? payload.serviceId : null,
          productId: payload.productId != null ? payload.productId : null
        }, true);
      },
      // Vendor replies to an approved review on their OWN listing. RLS
      // (reviews_vendor_reply / owns_vendor) permits it; the guard_review_update
      // trigger blocks the vendor from touching the customer's words and stamps
      // vendor_reply_at server-side — so we send only the reply text.
      // No read-back .select(): callers only check .error, and a * read-back
      // would trip the column-scoped grants (patch_reviews_privacy.sql).
      reply: function (reviewId, text) {
        return withClient(function (c) {
          return c.from('reviews').update({ vendor_reply: text })
            .eq('id', reviewId);
        });
      },
      // The signed-in customer's own reviews. Needs the cached app_user id
      // because approved reviews are publicly readable (RLS returns a superset).
      mine: function () {
        if (appUserId == null) {
          return Promise.resolve({ data: null, error: { message: 'call auth.ensureUser() first' } });
        }
        return withClient(function (c) {
          // Explicit columns = the authenticated column grant (adds user_id,
          // rating over the public list; never the flag columns).
          return c.from('reviews')
            .select('id,vendors_id,user_id,author_name,rating,is_recommended,is_verified_contact,comment,vendor_reply,vendor_reply_at,services_id,products_id,created_at')
            .eq('user_id', appUserId)
            .order('created_at', { ascending: false });
        });
      },
      // Author edits/removes their own review (RLS reviews_author_update/delete).
      // No read-back .select() — see reply() note.
      updateMine: function (reviewId, fields) {
        return withClient(function (c) {
          return c.from('reviews').update(pick(fields, REVIEW_EDITABLE))
            .eq('id', reviewId);
        });
      },
      removeMine: function (reviewId) {
        return withClient(function (c) { return c.from('reviews').delete().eq('id', reviewId); });
      },
      // Vendors the signed-in customer is eligible to review now (mirrors the gate).
      awaiting: function () {
        return withClient(function (c) { return c.rpc('reviews_awaiting'); });
      }
    },
    // --- Authenticated (signed-in) surface --------------------------------
    auth: {
      // Call once right after login: self-provisions the app_user row so
      // RLS can match this user. Returns { data: <app_user row>, error }.
      // #101: passes the sessionStorage signup intent as a fallback role hint —
      // OAuth signups have no user_metadata.intended_role in the JWT, so
      // without this a Google vendor signup that reached ensure_app_user first
      // would be minted 'customer' permanently (role is SET-ONCE). The RPC
      // clamps it (vendor/customer only) and metadata still wins when present.
      ensureUser: function (profile) {
        profile = profile || {};
        var intent = null;
        try {
          // 'role:timestamp' since #101 (bare legacy value also accepted);
          // freshness is lokali-auth.js's concern — here any stash is a hint.
          var v = (sessionStorage.getItem('lokali_signup_intent') || '').trim().toLowerCase().split(':')[0];
          if (v === 'vendor' || v === 'customer') intent = v;
        } catch (e) {}
        return withClient(function (c) {
          return c.rpc('ensure_app_user', {
            p_email: profile.email || null,
            p_first_name: profile.firstName || null,
            p_last_name: profile.lastName || null,
            p_intended_role: intent
          }).then(function (res) {
            if (res && res.data && res.data.id != null) appUserId = res.data.id;
            return res;
          });
        });
      },
      // The cached app_user.id (null until ensureUser resolves). Handy for UIs
      // that need to know "who am I" without another round-trip.
      currentUserId: function () { return appUserId; }
    },
    favorites: {
      // The customer's saved vendors (RLS returns only their own rows).
      list: function () {
        return withClient(function (c) {
          // id included: the account page reads the favorite row id; the embed
          // carries the public vendor-card fields (locations/categories for the
          // city/category chips).
          return c.from('favorites').select(
            'id, vendors_id, vendors(id,business_name,slug,business_tagline,profile_photo,is_verified,locations_id,categories_id)'
          );
        });
      },
      // user_id is stamped by the set_owner_user_id() trigger — never sent here.
      add: function (vendorId) {
        return withClient(function (c) {
          return c.from('favorites').insert({ vendors_id: vendorId });
        });
      },
      remove: function (vendorId) {
        return withClient(function (c) {
          return c.from('favorites').delete().eq('vendors_id', vendorId);
        });
      }
    },
    // services / products: listByVendor is dual-purpose — for the PUBLIC it
    // returns only active rows (public_read policy); for the OWNER it returns
    // ALL their rows incl. inactive (owner_all policy). create/update/remove are
    // owner-only (owns_vendor). NOTE: plan-limit enforcement (max services per
    // plan) is NOT here — it lands as a Tier-3 trigger/Edge Function in Phase 3,
    // exactly as rls.sql says. These are the raw data ops the limit gate wraps.
    services: {
      listByVendor: function (vendorId) {
        return withClient(function (c) {
          return c.from('services').select('*')
            .eq('vendors_id', vendorId)
            // FEAT-PICKS: picks-first ordering is applied CLIENT-SIDE in
            // lokali-vendor-listing.js, NOT here — ordering by a column the DB
            // doesn't have yet 400s the WHOLE query (verified live), so a
            // query-side order would hard-couple this script's ship to the SQL
            // patch and break every listing if they ever drift.
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true });
        });
      },
      create: function (vendorId, fields) {
        var row = pick(fields, SERVICE_EDITABLE);
        row.vendors_id = vendorId;
        return withClient(function (c) {
          return c.from('services').insert(row).select().maybeSingle();
        });
      },
      update: function (id, fields) {
        return withClient(function (c) {
          return c.from('services').update(pick(fields, SERVICE_EDITABLE))
            .eq('id', id).select().maybeSingle();
        });
      },
      setActive: function (id, active) {
        return withClient(function (c) {
          return c.from('services').update({ is_active: active }).eq('id', id);
        });
      },
      remove: function (id) {
        return withClient(function (c) { return c.from('services').delete().eq('id', id); });
      }
    },
    products: {
      listByVendor: function (vendorId) {
        return withClient(function (c) {
          return c.from('products').select('*')
            .eq('vendors_id', vendorId)
            // FEAT-PICKS: picks-first is client-side (see services note above).
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true });
        });
      },
      create: function (vendorId, fields) {
        var row = pick(fields, PRODUCT_EDITABLE);
        row.vendors_id = vendorId;
        return withClient(function (c) {
          return c.from('products').insert(row).select().maybeSingle();
        });
      },
      update: function (id, fields) {
        return withClient(function (c) {
          return c.from('products').update(pick(fields, PRODUCT_EDITABLE))
            .eq('id', id).select().maybeSingle();
        });
      },
      setActive: function (id, active) {
        return withClient(function (c) {
          return c.from('products').update({ is_active: active }).eq('id', id);
        });
      },
      remove: function (id) {
        return withClient(function (c) { return c.from('products').delete().eq('id', id); });
      }
    },
    // Public write paths — the listing's fire-and-forget tracking + the
    // inquiry form. RLS lets anon INSERT these (and ONLY insert): the vendor
    // reads their own leads/analytics, the public never can.
    inquiries: {
      // Goes through the /inquiry route (not a direct insert) so the server can
      // email the vendor. Returns { data: { ok }, error }.
      submit: function (vendorId, payload) {
        payload = payload || {};
        return postRoute('/inquiry', {
          vendorId: vendorId,
          name: payload.name || null,
          email: payload.email || null,
          phone: payload.phone || null,
          message: payload.message || null,
          context: payload.context || null,
          source: payload.source || 'listing'
        }, false);
      }
    },
    tracking: {
      recordView: function (vendorId, source, itemId) {
        return withClient(function (c) {
          return c.from('page_views').insert({
            vendors_id: vendorId, source: source || 'listing', item_id: itemId != null ? itemId : null
          });
        });
      },
      // event_type: call|sms|whatsapp|email|instagram|website. For a signed-in
      // customer the review-gate needs user_id stamped — best done with a DB
      // trigger (set user_id = current_app_user_id()); wired in the auth phase.
      recordLeadEvent: function (vendorId, eventType, source) {
        return withClient(function (c) {
          return c.from('lead_events').insert({
            vendors_id: vendorId, event_type: eventType, source: source || 'listing'
          });
        });
      }
    },
    // --- Vendor dashboard: own settings, leads, analytics, moderation --------
    // All owner-scoped: RLS (owns_vendor) returns/permits only the caller's rows.
    preferences: {
      get: function (vendorId) {
        return withClient(function (c) {
          return c.from('vendor_preferences').select('*')
            .eq('vendors_id', vendorId).maybeSingle();
        });
      },
      // vendor_preferences has no unique(vendors_id), so upsert = update-or-insert
      // in two steps (a single row per vendor is the invariant the app keeps).
      // The settings page saves PER TOGGLE, so two first-ever saves can race the
      // no-row select — the insert catches the duplicate-key error (23505, once
      // unique(vendors_id) exists in SQL) and retries as an update.
      save: function (vendorId, fields) {
        var allowed = pick(fields, PREF_EDITABLE);
        return withClient(function (c) {
          return c.from('vendor_preferences').select('id')
            .eq('vendors_id', vendorId).maybeSingle()
            .then(function (res) {
              if (res.error) return res;
              if (res.data && res.data.id != null) {
                return c.from('vendor_preferences').update(allowed)
                  .eq('id', res.data.id).select().maybeSingle();
              }
              var row = pick(fields, PREF_EDITABLE); // fresh copy: `allowed` stays column-granted-only for the update paths
              row.vendors_id = vendorId;
              return c.from('vendor_preferences').insert(row).select().maybeSingle()
                .then(function (ins) {
                  if (ins && ins.error && String(ins.error.code) === '23505') {
                    return c.from('vendor_preferences').update(allowed)
                      .eq('vendors_id', vendorId).select().maybeSingle();
                  }
                  return ins;
                });
            });
        });
      },
      // 58k-A3 marketing-consent mirror. The browser can't hold the Brevo key, so
      // after a prefs save that touched notify_promotional the adapter pings this
      // Vercel route, which reads the SAVED flag and syncs the vendor's Brevo
      // MARKETING_OPTIN attribute. Best-effort; never blocks the save.
      syncMarketing: function () {
        return postRoute('/preferences/marketing-sync', {}, true);
      }
    },
    leads: {
      // Inquiry inbox (contact-form submissions) for the vendor's own listing.
      inquiries: function (vendorId) {
        return withClient(function (c) {
          return c.from('inquiries').select('*')
            .eq('vendors_id', vendorId).order('created_at', { ascending: false });
        });
      },
      setInquiryStatus: function (inquiryId, patch) {
        return withClient(function (c) {
          return c.from('inquiries')
            .update(pick(patch, ['status', 'is_read'])).eq('id', inquiryId);
        });
      },
      // Contact-click events (call/text/whatsapp/email/ig/website) for the vendor.
      events: function (vendorId) {
        return withClient(function (c) {
          return c.from('lead_events').select('*')
            .eq('vendors_id', vendorId).order('created_at', { ascending: false });
        });
      },
      setEventStatus: function (eventId, status) {
        return withClient(function (c) {
          return c.from('lead_events').update({ status: status }).eq('id', eventId);
        });
      }
    },
    analytics: {
      // Raw impressions for the vendor (optionally since an ISO timestamp).
      pageViews: function (vendorId, sinceIso) {
        return withClient(function (c) {
          var q = c.from('page_views').select('*').eq('vendors_id', vendorId);
          if (sinceIso) q = q.gte('created_at', sinceIso);
          return q.order('created_at', { ascending: false });
        });
      },
      // Fast count-only query (head request) for KPI tiles. NOTE: RLS clamps
      // owner reads of page_views to the plan's history window (60d free /
      // 180d paid), so this counts within that window — use myViewCount() for
      // a true all-time total.
      pageViewCount: function (vendorId, sinceIso) {
        return withClient(function (c) {
          var q = c.from('page_views').select('id', { count: 'exact', head: true })
            .eq('vendors_id', vendorId);
          if (sinceIso) q = q.gte('created_at', sinceIso);
          return q;
        });
      },
      // All-time views count via security-definer RPC — immune to the
      // plan-window clamp on raw page_views reads (count only, own vendor only).
      myViewCount: function () {
        return withClient(function (c) { return c.rpc('my_page_view_count'); });
      }
    },
    // Vendor asks a past contact for a review (review-gate seed rows).
    reviewRequests: {
      list: function (vendorId) {
        return withClient(function (c) {
          return c.from('review_requests').select('*')
            .eq('vendors_id', vendorId).order('created_at', { ascending: false });
        });
      },
      create: function (vendorId, userId) {
        return withClient(function (c) {
          return c.from('review_requests').insert({ vendors_id: vendorId, user_id: userId });
        });
      }
    },
    // Moderation reports. Both directions go through the /report routes (verify
    // the Supabase JWT, resolve the reporter, enforce self-report/owner + dedup
    // guards, insert via the service role, then fire the "FRAUD REPORT" team
    // alert + reporter autoresponder). This REPLACED a direct table insert that
    // wrote a SILENT row — no email fired, no guards ran — after the Xano→
    // Supabase cutover dropped the old endpoints (restored for 55f-1). The
    // queue stays admin-read only (RLS); the reporter gets back only { ok, id }.
    reports: {
      vendor: function (vendorId, category, reason) {
        return postRoute('/report/vendor', {
          vendorId: vendorId,
          category: category || null,
          reason: reason || null
        }, true);
      },
      // reviewId + reason only; the route derives vendors_id + reported_user_id
      // from the flagged review server-side (SEC-016) and enforces owner-only.
      review: function (reviewId, reason) {
        return postRoute('/report/review', {
          reviewId: reviewId,
          reason: reason || null
        }, true);
      }
    },
    // --- Image storage (Supabase Storage) --------------------------------
    // Replaces the Xano image vault. Objects live at {vendorId}/{kind}/{file};
    // the storage policies only let the owning vendor write under their own
    // {vendorId}/ prefix (bucket is public-read). uploadImage returns the public
    // URL to store in image_url / profile_photo / a *_photos row.
    storage: {
      // kind: 'service' | 'product' | 'vendor' | 'profile'
      uploadImage: function (vendorId, kind, file) {
        return withClient(function (c) {
          var name = (file && file.name) || 'image';
          var ext = (name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
          var rand = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          var path = vendorId + '/' + (kind || 'misc') + '/' + rand + '.' + ext;
          return c.storage.from(MEDIA_BUCKET)
            .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file && file.type })
            .then(function (res) {
              if (res.error) return { data: null, error: res.error };
              var pub = c.storage.from(MEDIA_BUCKET).getPublicUrl(path);
              return { data: { path: path, url: pub.data.publicUrl }, error: null };
            });
        });
      },
      // Remove one or more objects by their storage path(s).
      remove: function (paths) {
        return withClient(function (c) {
          return c.storage.from(MEDIA_BUCKET).remove([].concat(paths));
        });
      }
    },
    // --- Photo-gallery rows (service_photos / product_photos / vendor_photos) ---
    // After uploadImage returns a URL, attach it as a gallery row here. RLS
    // (owner_all) limits writes to the caller's own listings.
    photos: {
      list: function (kind, parentId) {
        var m = PHOTO_TABLES[kind];
        return withClient(function (c) {
          return c.from(m.table).select('*')
            .eq(m.parent, parentId)
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true });
        });
      },
      add: function (kind, parentId, imageUrl, sortOrder) {
        var m = PHOTO_TABLES[kind];
        var row = { image_url: imageUrl, is_active: true };
        row[m.parent] = parentId;
        if (sortOrder != null) row.sort_order = sortOrder;
        return withClient(function (c) {
          return c.from(m.table).insert(row).select().maybeSingle();
        });
      },
      remove: function (kind, photoId) {
        var m = PHOTO_TABLES[kind];
        return withClient(function (c) { return c.from(m.table).delete().eq('id', photoId); });
      },
      // #76d portfolio manager reorder — RLS owner_all limits to own rows.
      setSort: function (kind, photoId, sortOrder) {
        var m = PHOTO_TABLES[kind];
        return withClient(function (c) {
          return c.from(m.table).update({ sort_order: sortOrder }).eq('id', photoId);
        });
      }
    },
    // Vendor's current billing status — newest subscription + its plan (RLS
    // owner_read limits to the caller's own vendor).
    billing: {
      status: function (vendorId) {
        return withClient(function (c) {
          return c.from('vendor_subscriptions')
            .select('*, plan(*)')
            .eq('vendors_id', vendorId)
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle();
        });
      }
    },
    // The signed-in customer's own account profile (RLS returns only their row).
    account: {
      get: function () {
        return withClient(function (c) { return c.from('app_user').select('*').maybeSingle(); });
      },
      update: function (fields) {
        return withClient(function (c) {
          // No explicit filter needed for safety — RLS app_user_self_update limits
          // the write to the caller's own row; .not id-null is just a required
          // PostgREST predicate.
          return c.from('app_user').update(pick(fields, APP_USER_EDITABLE))
            .not('id', 'is', null).select().maybeSingle();
        });
      },
      // #54 — newsletter subscription mirror. Same shape as vendors.syncMarketing:
      // the browser can't hold the Brevo key, so after a save that touched
      // notif_letter the caller pings this Vercel route, which re-reads the SAVED
      // flag server-side and adds/removes the person from the Neighborhood Edit
      // Brevo list. Best-effort — never blocks or fails the save.
      syncNewsletter: function () {
        return postRoute('/preferences/newsletter-sync', {}, true);
      },
      // #66 Phase 1 — the person-first unlock. Goes through the /open-storefront
      // route (not a direct RPC) so the server can fire the Brevo vendor-list add
      // + welcome email after admin_open_storefront creates the vendors row + free
      // subscription and promotes role customer->vendor. Returns { data: { ok,
      // vendors_id, role, is_new_vendor } | { ok:false, reason }, error }.
      openStorefront: function (businessName) {
        return postRoute('/open-storefront', { businessName: businessName || null }, true);
      }
    },
    // Public founding-programme status for a community ("X spots left" banner).
    founding: {
      status: function (locationId) {
        return withClient(function (c) { return c.rpc('founding_status', { p_location_id: locationId }); });
      }
    },
    // Word-of-mouth ?via= tracking — native RPCs (no route; no external calls).
    // create/count need a signed-in user; resolve works for anon + authed.
    shares: {
      create: function (vendorId, channel) {
        return withClient(function (c) {
          return c.rpc('create_share', { p_vendors_id: vendorId, p_channel: channel || null });
        });
      },
      resolve: function (code, landedSession) {
        return withClient(function (c) {
          return c.rpc('resolve_share', { p_code: code, p_landed_session: landedSession || null });
        });
      },
      count: function (vendorId) {
        return withClient(function (c) {
          return c.rpc('share_count', { p_vendors_id: vendorId != null ? vendorId : null });
        });
      }
    },
    // Public capture forms — go through Vercel routes (service-role insert +
    // Brevo). Pass the form fields straight through; the route validates. Each
    // resolves to { data: { ok, ... }, error }.
    forms: {
      contact: function (payload) { return postRoute('/contact', payload || {}, false); },
      waitlist: function (payload) { return postRoute('/waitlist', payload || {}, false); },
      interest: function (payload) { return postRoute('/interest', payload || {}, false); }
    },
    // #96-LISTING — capability flags for skew detection: the pinned form
    // scripts flip instantly on re-registration, but THIS file rides the
    // 7-day @v1.4 browser cache. A form must only mount its Specialty
    // selector when the LOADED client actually whitelists the column —
    // otherwise pick() would strip it and the save would silently drop the
    // vendor's choice under a success toast.
    capabilities: { listingSubcategory: true, itemLeadTime: true }, // itemLeadTime = #78 (lead_time in both EDITABLE lists)
    // #96-SUGGEST — admin surface (is_admin()-gated server-side; non-admins
    // get { ok:false } — safe to call from any session).
    admin: {
      overview: function () {
        return withClient(function (c) { return c.rpc('admin_overview'); });
      }
    },
    // #96-SUGGEST — subcategory taxonomy + the vendor suggestion pipeline.
    // Taxonomy lives in the `subcategory` table now (approvals go live with no
    // script ship); the picker/browse constants are the FALLBACK. The admin
    // RPCs are is_admin()-gated server-side — safe to call from any session,
    // non-admins just get { ok:false, reason:'not_admin' }.
    subcategories: {
      list: function () {
        return withClient(function (c) {
          return c.from('subcategory').select('category_id,slug,label,sort_order')
            .eq('is_active', true)
            .order('category_id', { ascending: true })
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true });
        });
      },
      // #96-AUTOAPPLY: listing = optional { services_id } or { products_id } —
      // the originating listing; approval then auto-tags it. Params are only
      // sent when provided, so calls still work against the older 2-arg RPC.
      suggest: function (categoryId, label, listing) {
        return withClient(function (c) {
          var params = { p_category_id: categoryId, p_label: label };
          if (listing && listing.services_id != null) params.p_services_id = listing.services_id;
          if (listing && listing.products_id != null) params.p_products_id = listing.products_id;
          return c.rpc('submit_subcategory_suggestion', params);
        });
      },
      mySuggestions: function () {
        return withClient(function (c) {
          return c.from('subcategory_suggestions')
            .select('id,category_id,suggested_label,status,final_label,created_at,reviewed_at')
            .order('created_at', { ascending: false });
        });
      },
      adminList: function () {
        return withClient(function (c) { return c.rpc('list_subcategory_suggestions'); });
      },
      adminReview: function (id, approve, finalLabel) {
        return withClient(function (c) {
          return c.rpc('review_subcategory_suggestion', {
            p_id: id, p_approve: !!approve, p_final_label: finalLabel || null
          });
        });
      }
    },
    data: {
      // Active subscription plans (pricing page). RLS plan_public_read gates it.
      plans: function () {
        return withClient(function (c) {
          return c.from('plan').select('*').eq('is_active', true).order('sort_order');
        });
      },
      categories: function () {
        return withClient(function (c) {
          return c.from('category').select('*').eq('is_active', true).order('category_name');
        });
      },
      locations: function () {
        return withClient(function (c) {
          return c.from('locations').select('*').eq('is_active', true).order('location_name');
        });
      },
      // #96 service-aware browse: the names of every ACTIVE listing (services
      // + products) in one paginated query pair. The Market folds them into its search
      // haystack and renders them as "offerings" chips on the vendor cards.
      // Anon RLS (services/products public_read) already scopes rows to active
      // listings of active+approved vendors — only names + owner ids ride the
      // wire. Resolves { data: [{ vendors_id, name, kind }], error } with rows
      // in per-vendor sort_order, services before products (the same order the
      // listing page presents them).
      listingIndex: function () {
        // Paginated with .range(): PostgREST silently LIMITs any response to
        // its max-rows (1000 by default) with no error, which would quietly
        // drop the newest vendors from search once active listings pass 1000
        // rows (#96 review finding). The order is a total one (id is unique),
        // so pages can't skip or duplicate rows. On a mid-pagination error the
        // rows collected so far ride back beside the error — partial coverage
        // beats none.
        var PAGE = 1000;
        function fetchAll(c, table, cols) {
          var acc = [];
          function step(from) {
            return c.from(table).select(cols).eq('is_active', true)
              .order('vendors_id', { ascending: true }).order('sort_order', { ascending: true }).order('id', { ascending: true })
              .range(from, from + PAGE - 1)
              .then(function (res) {
                if (res && res.error) return { data: acc, error: res.error };
                var rows = (res && res.data) || [];
                acc = acc.concat(rows);
                if (rows.length < PAGE) return { data: acc, error: null };
                return step(from + PAGE);
              });
          }
          return step(0);
        }
        return withClient(function (c) {
          return Promise.all([
            fetchAll(c, 'services', 'vendors_id,service_name'),
            fetchAll(c, 'products', 'vendors_id,product_name')
          ]).then(function (rs) {
            var svc = rs[0] || {}, prod = rs[1] || {};
            // Partial success still helps (chips/search for the kind that
            // loaded); only a double failure surfaces as an error.
            if (svc.error && prod.error) return { data: null, error: svc.error };
            var items = [];
            (svc.data || []).forEach(function (r) {
              if (r && r.vendors_id != null && r.service_name) items.push({ vendors_id: r.vendors_id, name: r.service_name, kind: 'service' });
            });
            (prod.data || []).forEach(function (r) {
              if (r && r.vendors_id != null && r.product_name) items.push({ vendors_id: r.vendors_id, name: r.product_name, kind: 'product' });
            });
            return { data: items, error: null };
          });
        });
      }
    }
  };
})();
