(function () {
  'use strict';

  var AUTH_BASE = 'https://x8ki-letl-twmt.n7.xano.io/api:mp2-aEJM';
  var VENDORS_BASE = 'https://x8ki-letl-twmt.n7.xano.io/api:d01JTdvD';
  var SERVICES_BASE = 'https://x8ki-letl-twmt.n7.xano.io/api:nyV4IQD1';
  var PRODUCTS_BASE = 'https://x8ki-letl-twmt.n7.xano.io/api:DQ8uiCLA';
  var DATA_BASE = 'https://x8ki-letl-twmt.n7.xano.io/api:sbR5HiCI';
  var DATA_LOCATIONS_BASE = 'https://x8ki-letl-twmt.n7.xano.io/api:kIWlCxMJ';
  var PLANS_BASE = 'https://x8ki-letl-twmt.n7.xano.io/api:svUNydf-';
  var TOKEN_KEY = 'LOKALI_AUTH_TOKEN';

  function getBase(base) {
    if (base === 'auth') return AUTH_BASE;
    if (base === 'vendors') return VENDORS_BASE;
    if (base === 'services') return SERVICES_BASE;
    if (base === 'products') return PRODUCTS_BASE;
    if (base === 'plans') {
      if (typeof window !== 'undefined' && typeof window.LOKALI_PLANS_BASE === 'string' && window.LOKALI_PLANS_BASE) {
        return window.LOKALI_PLANS_BASE;
      }
      return PLANS_BASE;
    }
    if (base === 'dataLocations') {
      if (typeof window !== 'undefined' && typeof window.LOKALI_DATA_LOCATIONS_BASE === 'string' && window.LOKALI_DATA_LOCATIONS_BASE) {
        return window.LOKALI_DATA_LOCATIONS_BASE;
      }
      return DATA_LOCATIONS_BASE;
    }
    return DATA_BASE;
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function clearToken() {
    setToken(null);
  }

  function request(base, method, path, body, useAuth) {
    var url = getBase(base) + '/' + path.replace(/^\//, '');
    var headers = { Accept: 'application/json' };
    if (body != null) headers['Content-Type'] = 'application/json';
    if (useAuth) {
      var token = getToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;
    }
    var opts = { method: method, headers: headers, credentials: 'include' };
    if (body != null && method !== 'GET') opts.body = JSON.stringify(body);

    return fetch(url, opts)
      .then(parseResponse)
      .catch(function (err) {
        return { data: null, error: err.message || 'Network error', status: 0 };
      });
  }

  function parseResponse(res) {
    var status = res.status;
    return res.text().then(function (text) {
      var data = null;
      try {
        if (text) data = JSON.parse(text);
      } catch (e) {}
      if (!res.ok) {
        return { data: data, error: (data && (data.message || data.error)) || res.statusText || 'Request failed', status: status };
      }
      return { data: data, error: null, status: status };
    });
  }

  function mineListPath(defaultPath, overridePathKey, includeInactive) {
    var path = defaultPath;
    if (typeof window !== 'undefined' && typeof window[overridePathKey] === 'string' && window[overridePathKey].trim()) {
      path = window[overridePathKey].replace(/^\//, '');
    }
    if (includeInactive === true) {
      path += (path.indexOf('?') >= 0 ? '&' : '?') + 'include_inactive=true';
    }
    return path;
  }

  function mineListBase(defaultBase, overrideBaseKey) {
    var base = defaultBase;
    if (typeof window !== 'undefined' && typeof window[overrideBaseKey] === 'string' && window[overrideBaseKey].trim()) {
      var b = window[overrideBaseKey].trim().toLowerCase();
      if (b === 'vendors' || b === 'services' || b === 'products') base = b;
    }
    return base;
  }

  function extractVendorIdFromMe(payload) {
    if (payload == null || typeof payload !== 'object') return null;
    if (payload.id != null) return payload.id;
    if (payload.vendor && payload.vendor.id != null) return payload.vendor.id;
    if (payload.vendors_id != null) return payload.vendors_id;
    return null;
  }

  function extractVendorIdFromAuthUser(payload) {
    if (payload == null || typeof payload !== 'object') return null;
    if (payload.vendor_id != null) return payload.vendor_id;
    if (payload.vendors_id != null) return payload.vendors_id;
    if (payload.vendor && payload.vendor.id != null) return payload.vendor.id;
    return null;
  }

  function resolveVendorIdForListFallback() {
    return vendors.me().then(function (vm) {
      if (!vm.error && vm.data) {
        var v = extractVendorIdFromMe(vm.data);
        if (v != null) return v;
      }
      return auth.me().then(function (am) {
        if (!am.error && am.data) {
          var v2 = extractVendorIdFromAuthUser(am.data);
          if (v2 != null) return v2;
        }
        return null;
      });
    });
  }

  function fetchServicesByVendorId(vid, includeInactive) {
    var q = 'services?vendor_id=' + encodeURIComponent(vid);
    if (includeInactive === true) q += '&include_inactive=true';
    return request('services', 'GET', q, null, true).then(function (out2) {
      if (!out2.error) return out2;
      return request('services', 'GET', q, null, false);
    });
  }

  function fetchProductsByVendorId(vid, includeInactive) {
    var q = 'products?vendor_id=' + encodeURIComponent(vid);
    if (includeInactive === true) q += '&include_inactive=true';
    return request('products', 'GET', q, null, true).then(function (out2) {
      if (!out2.error) return out2;
      return request('products', 'GET', q, null, false);
    });
  }

  /** True when payload has no list rows (primary route may return 200 + [] while vendor_id has data). */
  function isEmptyServicesPayload(raw) {
    if (raw == null) return true;
    if (Array.isArray(raw)) return raw.length === 0;
    if (typeof raw === 'object') {
      if (Array.isArray(raw.items)) return raw.items.length === 0;
      if (Array.isArray(raw.records)) return raw.records.length === 0;
      if (Array.isArray(raw.data)) return raw.data.length === 0;
      if (Array.isArray(raw.services)) return raw.services.length === 0;
      if (raw.data && typeof raw.data === 'object' && Array.isArray(raw.data.items)) return raw.data.items.length === 0;
    }
    return false;
  }

  function isEmptyProductsPayload(raw) {
    if (raw == null) return true;
    if (Array.isArray(raw)) return raw.length === 0;
    if (typeof raw === 'object') {
      if (Array.isArray(raw.items)) return raw.items.length === 0;
      if (Array.isArray(raw.records)) return raw.records.length === 0;
      if (Array.isArray(raw.data)) return raw.data.length === 0;
      if (Array.isArray(raw.products)) return raw.products.length === 0;
      if (raw.data && typeof raw.data === 'object' && Array.isArray(raw.data.items)) return raw.data.items.length === 0;
    }
    return false;
  }

  function requestWithFormData(base, method, path, formData, useAuth) {
    var url = getBase(base) + '/' + path.replace(/^\//, '');
    var headers = { Accept: 'application/json' };
    if (useAuth) {
      var token = getToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;
    }
    var opts = { method: method, headers: headers, credentials: 'include', body: formData };
    return fetch(url, opts).then(parseResponse).catch(function (err) {
      return { data: null, error: err.message || 'Network error', status: 0 };
    });
  }

  var auth = {
    login: function (email, password) {
      return request('auth', 'POST', 'auth/login', { email: email, password: password }, false).then(function (out) {
        if (!out.error && out.data) {
          var token = out.data.authToken || out.data.auth_token;
          if (token) setToken(token);
        }
        return out;
      });
    },
    googleLogin: function (idToken) {
      return request('auth', 'POST', 'auth/google-login', { id_token: idToken }, false).then(function (out) {
        if (!out.error && out.data) {
          var token = out.data.authToken || out.data.auth_token;
          if (token) setToken(token);
        }
        return out;
      });
    },
    signup: function (email, password, first_name, last_name) {
      var body = { email: email, password: password };
      if (first_name != null) body.first_name = first_name;
      if (last_name != null) body.last_name = last_name;
      return request('auth', 'POST', 'auth/signup', body, false).then(function (out) {
        if (!out.error && out.data) {
          var token = out.data.auth_token || out.data.authToken;
          if (token) setToken(token);
        }
        return out;
      });
    },
    me: function () {
      return request('auth', 'GET', 'me', null, true);
    },
    updateProfile: function (payload) {
      return request('data', 'PATCH', 'user/edit_profile', payload || {}, true);
    },
    logout: function () {
      clearToken();
      return Promise.resolve({ data: null, error: null, status: 200 });
    },
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken
  };

  var vendors = {
    me: function () {
      return request('vendors', 'GET', 'vendor/me', null, true);
    },
    updateMe: function (payload) {
      payload = payload || {};
      var profilePhoto = payload.profile_photo != null ? String(payload.profile_photo) : (payload.profilePhoto != null ? String(payload.profilePhoto) : '');
      var categoryId = payload.category_id != null ? payload.category_id : payload.categories_id;
      var categoryIdArray = Array.isArray(categoryId) ? categoryId : (categoryId != null ? [categoryId] : []);
      var locationsId = payload.locations_id;
      if (!Array.isArray(locationsId)) locationsId = locationsId != null ? [locationsId] : [];
      var body = {
        business_name:           payload.business_name != null ? String(payload.business_name) : '',
        business_description:    payload.business_description != null ? String(payload.business_description) : '',
        tagline:                 payload.tagline != null ? String(payload.tagline) : '',
        website_url:             payload.website_url != null ? String(payload.website_url) : '',
        locations_id:            locationsId,
        category_id:             categoryIdArray,
        profile_photo:           profilePhoto,
        address:                 payload.address != null ? String(payload.address) : '',
        contact_email:           payload.contact_email != null ? String(payload.contact_email) : '',
        phone_number:            payload.phone_number != null ? String(payload.phone_number) : '',
        text_messages:           !!payload.text_messages,
        whatsapp_messages:       !!payload.whatsapp_messages,
        instagram_handle:        payload.instagram_handle != null ? String(payload.instagram_handle) : '',
        booking_link:            payload.booking_link != null ? String(payload.booking_link) : '',
        response_time:           payload.response_time != null ? String(payload.response_time) : '',
        accepts_custom_requests: !!payload.accepts_custom_requests,
        highlight_women_owned:   !!payload.highlight_women_owned,
        highlight_black_owned:   !!payload.highlight_black_owned,
        highlight_latino_owned:  !!payload.highlight_latino_owned,
        highlight_lgbtq_owned:   !!payload.highlight_lgbtq_owned,
        highlight_veteran_owned: !!payload.highlight_veteran_owned,
        highlight_eco_friendly:  !!payload.highlight_eco_friendly
      };
      return request('vendors', 'PATCH', 'vendor/me', body, true);
    },
    uploadProfilePhoto: function (file) {
      var path = typeof window.LOKALI_UPLOAD_PHOTO_PATH === 'string' ? window.LOKALI_UPLOAD_PHOTO_PATH : 'vendor/me/profile-photo';
      var fieldName = typeof window.LOKALI_UPLOAD_PHOTO_FIELD === 'string' ? window.LOKALI_UPLOAD_PHOTO_FIELD : 'profile_photo';
      var formData = new FormData();
      formData.append(fieldName, file);
      return requestWithFormData('vendors', 'POST', path, formData, true);
    },
    deactivate: function () {
      return request('vendors', 'PATCH', 'vendor/me/deactivate', null, true);
    },
    reactivate: function () {
      return request('vendors', 'PATCH', 'vendor/me/reactivate', null, true);
    },
    list: function (params) {
      var q = params || {};
      var parts = [];
      if (q.location_id != null) parts.push('location_id=' + encodeURIComponent(q.location_id));
      if (q.category_id != null) parts.push('category_id=' + encodeURIComponent(q.category_id));
      if (q.search_term != null) parts.push('search_term=' + encodeURIComponent(q.search_term));
      if (q.page != null) parts.push('page=' + encodeURIComponent(q.page));
      if (q.per_page != null) parts.push('per_page=' + encodeURIComponent(q.per_page));
      var path = 'vendors' + (parts.length ? '?' + parts.join('&') : '');
      return request('vendors', 'GET', path, null, false);
    },
    getById: function (vendorsId) {
      return request('vendors', 'GET', 'vendor/id/' + vendorsId, null, false);
    },
    delete: function (vendorsId) {
      return request('vendors', 'DELETE', 'vendors/id/' + vendorsId, null, true);
    }
  };

  var services = {
    getMine: function (includeInactive) {
      var path = mineListPath('vendors/me/services', 'LOKALI_SERVICES_GET_MINE_PATH', includeInactive);
      var base = mineListBase('services', 'LOKALI_SERVICES_GET_MINE_BASE');
      return request(base, 'GET', path, null, true).then(function (out) {
        var userPath =
          typeof window !== 'undefined' &&
          typeof window.LOKALI_SERVICES_GET_MINE_PATH === 'string' &&
          window.LOKALI_SERVICES_GET_MINE_PATH.trim();
        var fallbackOn =
          typeof window !== 'undefined' &&
          window.LOKALI_SERVICES_GET_MINE_FALLBACK !== false &&
          !userPath;

        var tryVendorList = function () {
          return resolveVendorIdForListFallback().then(function (vid) {
            if (vid == null) return null;
            return fetchServicesByVendorId(vid, includeInactive);
          });
        };

        if (!fallbackOn) {
          return out;
        }

        if (out.error) {
          return tryVendorList().then(function (out2) {
            return out2 || out;
          });
        }

        if (isEmptyServicesPayload(out.data)) {
          return tryVendorList().then(function (out2) {
            if (out2 && !out2.error && !isEmptyServicesPayload(out2.data)) return out2;
            return out;
          });
        }

        return out;
      });
    },
    listByVendor: function (vendorId, useAuth) {
      return request(
        'services',
        'GET',
        'services?vendor_id=' + encodeURIComponent(vendorId),
        null,
        useAuth === true
      );
    },
    getById: function (servicesId) {
      return request('services', 'GET', 'services/' + servicesId, null, false);
    },
    create: function (payload) {
      return request('services', 'POST', 'services', payload, true);
    },
    update: function (id, payload) {
      return request('services', 'PATCH', 'services/' + id, payload, true);
    },
    delete: function (id) {
      return request('services', 'DELETE', 'services/' + id, null, true);
    },
    uploadServiceImage: function (file) {
      var path =
        typeof window.LOKALI_SERVICE_IMAGE_UPLOAD_PATH === 'string' && window.LOKALI_SERVICE_IMAGE_UPLOAD_PATH.trim()
          ? window.LOKALI_SERVICE_IMAGE_UPLOAD_PATH.replace(/^\//, '')
          : 'image-upload';
      var method =
        typeof window.LOKALI_SERVICE_IMAGE_UPLOAD_METHOD === 'string' && window.LOKALI_SERVICE_IMAGE_UPLOAD_METHOD.trim()
          ? window.LOKALI_SERVICE_IMAGE_UPLOAD_METHOD.trim().toUpperCase()
          : 'PATCH';
      var formData = new FormData();
      formData.append('image', file);
      return requestWithFormData('services', method, path, formData, true);
    }
  };

  var products = {
    getMine: function (includeInactive) {
      var path = mineListPath('vendors/me/products', 'LOKALI_PRODUCTS_GET_MINE_PATH', includeInactive);
      var base = mineListBase('products', 'LOKALI_PRODUCTS_GET_MINE_BASE');
      return request(base, 'GET', path, null, true).then(function (out) {
        var userPath =
          typeof window !== 'undefined' &&
          typeof window.LOKALI_PRODUCTS_GET_MINE_PATH === 'string' &&
          window.LOKALI_PRODUCTS_GET_MINE_PATH.trim();
        var fallbackOn =
          typeof window !== 'undefined' &&
          window.LOKALI_PRODUCTS_GET_MINE_FALLBACK !== false &&
          !userPath;

        var tryVendorList = function () {
          return resolveVendorIdForListFallback().then(function (vid) {
            if (vid == null) return null;
            return fetchProductsByVendorId(vid, includeInactive);
          });
        };

        if (!fallbackOn) {
          return out;
        }

        if (out.error) {
          return tryVendorList().then(function (out2) {
            return out2 || out;
          });
        }

        if (isEmptyProductsPayload(out.data)) {
          return tryVendorList().then(function (out2) {
            if (out2 && !out2.error && !isEmptyProductsPayload(out2.data)) return out2;
            return out;
          });
        }

        return out;
      });
    },
    listByVendor: function (vendorId, useAuth) {
      return request(
        'products',
        'GET',
        'products?vendor_id=' + encodeURIComponent(vendorId),
        null,
        useAuth === true
      );
    },
    getById: function (productsId) {
      return request('products', 'GET', 'products/' + productsId, null, true);
    },
    create: function (payload) {
      return request('products', 'POST', 'products', payload, true);
    },
    update: function (id, payload) {
      return request('products', 'PATCH', 'products/' + id, payload, true);
    },
    delete: function (id) {
      return request('products', 'DELETE', 'products/' + id, null, true);
    }
  };

  var plans = {
    getMyBilling: function () {
      return request('plans', 'GET', 'vendor/me/billing', null, true);
    }
  };

  var data = {
    categories: function () {
      return request('data', 'GET', 'categories', null, false);
    },
    locations: function () {
      return request('dataLocations', 'GET', 'locations', null, false);
    }
  };

  var api = {
    request: request,
    auth: auth,
    vendors: vendors,
    services: services,
    products: products,
    plans: plans,
    data: data,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken
  };

  if (typeof window !== 'undefined') {
    window.LokaliAPI = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
