const LokaliServicesPage = (() => {

  // Delete is destructive — surface a danger color on hover (resting state stays
  // neutral grey so it doesn't shout). currentColor drives the trash SVG stroke.
  (function injectDeleteIconStyle() {
    if (document.getElementById('lok-icon-btn-delete-style')) return;
    var s = document.createElement('style');
    s.id = 'lok-icon-btn-delete-style';
    s.textContent = '.icon-btn--delete:hover{color:#C0152F;background:#FCEBED;border-color:#F2C4CB;}' +
      // Duplicate (2026-09-17): same look as Edit.
      // Webflow's .icon-btn is a fixed 32px square; the two text buttons need their own width.
      '.lok-gc .card-actions .icon-btn[data-action="edit"],.lok-gc .card-actions .icon-btn[data-action="duplicate"]{width:auto!important;}' +
      '.lok-gc .card-actions .icon-btn[data-action="duplicate"]{order:0;display:inline-flex;align-items:center;gap:5px;color:#6002EE;border-color:#E5D4FD;background:#fff;font-weight:600;}';
    (document.head || document.documentElement).appendChild(s);
  })();

  // #98 tap targets for injected controls on mobile: the gallery corner buttons
  // are 22px inline-styled and the featured-pick star inherits the 25px
  // icon-btn circle. 34px is the geometric max for three controls on an 84px
  // tile; the star gets the full 44. !important beats the inline styles.
  (function injectTapTargetStyle() {
    if (document.getElementById('lok-services-tap-style')) return;
    var s = document.createElement('style');
    s.id = 'lok-services-tap-style';
    s.textContent =
      '@media (max-width:991px){' +
      '#lok-service-gallery button[data-photo-id],#lok-service-gallery button[data-move-id],' +
      '#lok-service-gallery button[data-pending-remove],#lok-service-gallery button[data-pending-move]' +
      '{width:34px!important;height:34px!important;font-size:18px!important;}' +
      '.lok-pick-star{min-width:44px!important;min-height:44px!important;}' +
      '}';
    (document.head || document.documentElement).appendChild(s);
  })();

  // #62 field-alignment + #61 required markers. The Webflow detail/pricing field
  // wrappers carry a stray margin:0 20px that insets them ~20px from the section
  // headers, video, checkboxes and action buttons (all at the panel column) —
  // making the field block look indented with ragged right edges. Zero those
  // margins so every row shares one left/right edge. Scoped to the form view so
  // nothing else on the page is affected. `.lok-req` styles the required "*".
  (function injectFormPolishStyle() {
    if (document.getElementById('lok-services-form-polish-style')) return;
    var s = document.createElement('style');
    s.id = 'lok-services-form-polish-style';
    s.textContent =
      '#services-form-view .div-block-84,' +
      '#services-form-view .div-block-85,' +
      '#services-form-view .div-block-89,' +
      '#services-form-view #price-wrap-fixed,' +
      '#services-form-view #price-wrap-starting,' +
      '#services-form-view #price-wrap-range,' +
      '#services-form-view #price-wrap-quote{margin-left:0!important;margin-right:0!important;}' +
      // Checkbox boxes carried a leftover Webflow float-era margin (`-20px` on
      // some, `0` on others) that left them misaligned against the field column
      // once the wrappers became flex. Normalize: box sits at the wrapper's flex
      // start (aligned with the inputs above) with an 8px gap to its label.
      '#services-form-view .w-checkbox{padding-left:0!important;gap:0!important;align-items:center;}' +
      '#services-form-view .w-checkbox-input{margin:0 8px 0 0!important;}' +
      '#services-form-view .form-text-header .lok-req{color:#E0245E;font-weight:700;}' +
      // Description box was cramped (~2 visible lines for a 5000-char field) —
      // give it real room and let vendors drag it taller (Francesca 2026-07-20).
      '#services-form-view #service-description{min-height:180px!important;resize:vertical;}' +
      // 2026-10-02 (F punchlist 3): typed text in the Webflow-styled inputs read
      // light grey, as if it were still the placeholder. Pin the VALUE colour to
      // the dashboard ink and keep the placeholder visibly lighter so the two
      // states stay distinct (AA: #1A1829 on white 16:1, #8E8BA6 placeholder).
      '#services-form-view input.w-input,#services-form-view textarea.w-input,#services-form-view select.w-select,' +
      '#services-form-view input[type=text],#services-form-view input[type=number],#services-form-view textarea{color:#1A1829!important;opacity:1!important;-webkit-text-fill-color:#1A1829!important;}' +
      '#services-form-view input::placeholder,#services-form-view textarea::placeholder{color:#8E8BA6!important;opacity:1!important;-webkit-text-fill-color:#8E8BA6!important;}';
    (document.head || document.documentElement).appendChild(s);
  })();

  let services     = [];
  let editingId    = null;
  let imageRemoved = false;
  let dragSrc      = null;
  let _maxServices = null;
  let _maxServicePhotos = null;   // gallery cap (Free=1, Pro=3, Featured=5 — #82)
  let _isProPlan = false;
  let _planLabel = 'Free';   // 'Free' | 'Pro' | 'Featured' — for the plan-cap copy
  let _hasGallery = false;  // cap > 1: the gallery is the photo widget (2026-09-22; was Pro-only)
  let _isFeaturedPlan = false;   // FEAT-PICKS: the star toggle is a Featured-plan perk         // gallery is a Pro/Featured perk
  let _imagePreviewObjectUrl = null;

  let filterStatus   = 'all';
  let saveInProgress = false;
  var loadFailed     = false;   // init load failed — error card is up, not the empty state

  const CLONED_CARD_DISPLAY = null;

  const STACK_CARD_SEL = '.service-card[data-service-id]:not(#service-card-template)';

  const clearStackDataCards = (stack) => {
    if (!stack) return;
    [...stack.querySelectorAll('[data-service-id]:not(#service-card-template)')].forEach((node) => node.remove());
  };

  const resolveSelectElement = (id) => {
    const n = document.getElementById(id);
    if (!n) return null;
    if (n.tagName === 'SELECT') return n;
    return n.querySelector ? n.querySelector('select') : null;
  };

  const resolveFileInput = (id) => {
    const n = document.getElementById(id);
    if (!n) return null;
    if (n.tagName === 'INPUT' && n.type === 'file') return n;
    return n.querySelector ? n.querySelector('input[type="file"]') : null;
  };

  const resolveFieldInput = (id) => {
    const n = document.getElementById(id);
    if (!n) return null;
    if (n.tagName === 'TEXTAREA') return n;
    if (n.tagName === 'INPUT') {
      const t = (n.type || '').toLowerCase();
      if (t === 'checkbox' || t === 'radio' || t === 'file' || t === 'hidden') return null;
      return n;
    }
    if (!n.querySelector) return null;
    const ta = n.querySelector('textarea');
    if (ta) return ta;
    const num = n.querySelector('input[type="number"]');
    if (num) return num;
    const txt = n.querySelector('input[type="text"]');
    if (txt) return txt;
    const inp = n.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])');
    return inp || null;
  };

  const resolveCheckboxInput = (id) => {
    const n = document.getElementById(id);
    if (!n) return null;
    if (n.tagName === 'INPUT' && n.type === 'checkbox') return n;
    return n.querySelector ? n.querySelector('input[type="checkbox"]') : null;
  };

  const normalizePriceType = (raw) => {
    if (raw == null || raw === '') return '';

    const v = String(raw).trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');

    if (v === 'fixed' || v === 'fixed_price' || v === 'fices') return 'fixed';
    if (v === 'starting_at' || v === 'starting' || v === 'start' || v === 'starts_at' || v === 'starts') return 'starting_at';
    if (v === 'range' || v === 'price_range' || v === 'rance') return 'range';
    if (v === 'quote' || v === 'custom_quote' || v === 'custom' || v === 'get_a_quote') return 'quote';
    if (v === 'free' || v === 'no_cost' || v === 'free_of_charge' || v === 'no_charge') return 'free'; // 2026-10-02
    return String(raw).trim();
  };

  // 'free' (2026-10-02, patch_service_free_price.sql): a no-cost service. The
  // Webflow select has no such option, so ensureFreeOption() appends one at
  // init, gated on the client capability (a stale client would let the save
  // through to a CHECK violation otherwise).
  const KNOWN_PRICE_KEYS = new Set(['fixed', 'starting_at', 'range', 'quote', 'free']);
  const freeSupported = () => !!window.LokaliSupabaseAPI?.capabilities?.servicePriceFree;
  const ensureFreeOption = () => {
    const sel = el.fieldPriceType();
    if (!sel || !freeSupported()) return;
    if ([...sel.options].some(o => normalizePriceType(o.value) === 'free')) return;
    const opt = document.createElement('option');
    opt.value = 'free';
    opt.textContent = 'Free';
    sel.appendChild(opt);
  };

  const canonicalPriceTypeKey = (valueRaw, labelRaw) => {
    let k = normalizePriceType(valueRaw);
    if (KNOWN_PRICE_KEYS.has(k)) return k;
    if (labelRaw != null && String(labelRaw).trim() !== '') {
      const cleaned = String(labelRaw).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      k = normalizePriceType(cleaned);
      if (KNOWN_PRICE_KEYS.has(k)) return k;
    }
    return '';
  };

  const readPriceTypeFromSelect = () => {
    const sel = el.fieldPriceType();
    if (!sel) return '';
    const opt = sel.options[sel.selectedIndex];
    const label = opt ? String(opt.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '';
    return canonicalPriceTypeKey(sel.value, label);
  };

  const applyPriceWrapVisibility = (key) => {
    const k = KNOWN_PRICE_KEYS.has(key) ? key : '';
    const map = {
      fixed:       el.wrapFixed(),
      starting_at: el.wrapStarting(),
      range:       el.wrapRange(),
      quote:       el.wrapQuote(),
    };
    Object.values(map).forEach(w => {
      if (!w) return;
      w.setAttribute('hidden', '');
      w.style.display = 'none';
    });
    if (!k) return;
    const target = map[k];
    if (target) {
      target.removeAttribute('hidden');
      target.style.removeProperty('display');
    }
  };

  const syncPriceWrapsFromSelect = () => {
    applyPriceWrapVisibility(readPriceTypeFromSelect());
  };

  const trimOrNull = (v) => {
    const x = String(v ?? '').trim();
    return x ? x : null;
  };

  const readPriceNoteForSave = () => {
    const t = readPriceTypeFromSelect();
    if (t === 'starting_at') {
      if (el.fieldPriceNoteStarting()) return trimOrNull(el.fieldPriceNoteStarting().value);
      return trimOrNull(el.fieldPriceNote()?.value);
    }
    if (el.fieldPriceNote()) {
      const n = trimOrNull(el.fieldPriceNote().value);
      if (n) return n;
    }
    return trimOrNull(el.fieldPriceNoteStarting()?.value);
  };

  const selectPriceTypeOption = (selectEl, raw) => {
    if (!selectEl) return;
    const want = normalizePriceType(raw) || raw || 'fixed';
    const opts = [...selectEl.options];
    const match = opts.find(o => normalizePriceType(o.value) === want);
    if (match) {
      selectEl.value = match.value;
      return;
    }
    const byExact = opts.find(o => o.value === raw || o.value === String(raw));
    if (byExact) selectEl.value = byExact.value;
  };

  const numericKeyedObjectToArray = (obj) => {
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const keys = Object.keys(obj);
    if (!keys.length) return null;
    if (!keys.every((k) => /^\d+$/.test(k))) return null;
    return keys
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => obj[k])
      .filter((v) => v != null && typeof v === 'object');
  };

  const normalizeServiceList = (raw) => {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.records)) return raw.records;
    if (Array.isArray(raw.data)) return raw.data;
    if (Array.isArray(raw.result)) return raw.result;
    if (Array.isArray(raw.results)) return raw.results;
    if (Array.isArray(raw.services)) return raw.services;
    if (Array.isArray(raw.payload)) return raw.payload;
    if (Array.isArray(raw.output)) return raw.output;
    if (Array.isArray(raw.list)) return raw.list;
    if (typeof raw === 'object') {
      const inner = raw.data;
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        if (Array.isArray(inner.items)) return inner.items;
        if (Array.isArray(inner.services)) return inner.services;
        if (Array.isArray(inner.records)) return inner.records;
        if (Array.isArray(inner.data)) return inner.data;
        if (Array.isArray(inner.service_list)) return inner.service_list;
        const innerNum = numericKeyedObjectToArray(inner);
        if (innerNum && innerNum.length) return innerNum;
      }
      const asNum = numericKeyedObjectToArray(raw);
      if (asNum && asNum.length) return asNum;
    }
    return [];
  };

  const isServiceActive = (s) => {
    if (s == null) return true;
    if (s.is_active === false || s.is_active === 0) return false;
    return true;
  };
  // Parked by the plan cap (admin_enforce_plan_limits sets deactivated_by_limit), not by the
  // vendor. These come back on their own when the plan grows, so the page shows them as
  // "waiting for Pro" rather than "hidden" (F 2026-11-09: let them see the value of upgrading).
  const isLimitHidden = (s) => !!s && s.deactivated_by_limit === true && !isServiceActive(s);

  const applyThumbPreview = (thumb, url) => {
    if (!thumb || !url) return;
    if (String(thumb.tagName).toUpperCase() === 'IMG') {
      thumb.src = url;
    } else {
      thumb.style.backgroundImage = 'url(' + JSON.stringify(String(url)) + ')';
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
    }
    thumb.style.display = 'block';
    _mainImageUrl = url;
    // Free plan: the card preview lives under the locked-gallery note and must
    // follow a newly picked file immediately (the lock branch does not
    // re-render). In add mode the preview may not exist yet — the vendor picks
    // the image AFTER the lock note rendered with no URL — so create it then.
    const pv = document.getElementById('lok-service-cover-preview');
    if (pv) { pv.src = url; }
    else if (!_hasGallery) {
      const gbody = document.getElementById('lok-service-gallery-body');
      if (gbody) { _coverViews = []; renderCoverPreview(gbody, url, true); }
    }
    initFocusDrag(thumb);   // #149: idempotent — wires once
    applyFocusPreview();
  };

  // #149: focal point of the MAIN image (percentages, null = centered).
  // The vendor drags the 100px preview to say which part of the photo must
  // stay in view; renderers turn it into `object-position: X% Y%` on every
  // cropped surface. Saved as image_focus_x/y — ⚠️ the columns come from
  // patch_image_focus.sql, and every save names them, so the SQL must be live
  // before this file's pin moves (#101 ship order).
  let _imgFocus = null;
  let _mainImageUrl = null;   // #149: current main-image URL, for the card preview
  let _skipLegacySeed = false; // set while a delete re-renders the gallery
  const lcFocusPos = (r) => (r && r.image_focus_x != null && r.image_focus_y != null) ? (r.image_focus_x + '% ' + r.image_focus_y + '%') : '';
  const applyFocusPreview = () => {
    paintCoverViews();               // gallery thumb + card preview stay in sync
    // 2026-10-09: the 'What shoppers see' card paints its cover as a background; move it too.
    const pv = document.querySelector('#lok-lc-preview .lok-gc-cover');
    if (pv) pv.style.backgroundPosition = _imgFocus ? (_imgFocus.x + '% ' + _imgFocus.y + '%') : 'center';
    const thumb = el.imgThumb();
    if (!thumb) return;
    const pos = _imgFocus ? (_imgFocus.x + '% ' + _imgFocus.y + '%') : 'center';
    if (String(thumb.tagName).toUpperCase() === 'IMG') thumb.style.objectPosition = pos;
    else thumb.style.backgroundPosition = pos;
    const hint = document.getElementById('lok-service-focus-hint');
    if (hint) hint.style.display = (thumb.style.display !== 'none') ? 'block' : 'none';
  };
  const initFocusDrag = (thumb) => {
    if (!thumb || thumb.dataset.lokFocusWired) return;
    thumb.dataset.lokFocusWired = '1';
    thumb.style.touchAction = 'none';   // phones: drag must not scroll the page
    thumb.style.cursor = 'grab';
    if (!document.getElementById('lok-service-focus-hint')) {
      const hint = document.createElement('div');
      hint.id = 'lok-service-focus-hint';
      // white-space:normal — .container-11 sets nowrap page-wide (see gallery hosts)
      hint.style.cssText = 'font-size:12px;color:#8E8BA6;margin-top:6px;line-height:1.5;white-space:normal;max-width:220px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;';
      hint.textContent = 'Drag the photo to choose which part stays in view on your cards.';
      (thumb.closest('div') || thumb).insertAdjacentElement('afterend', hint);
    }
    let dragging = false;
    const setFromEvent = (e) => {
      const r = thumb.getBoundingClientRect();
      if (!r.width || !r.height) return;
      _imgFocus = {
        x: Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100))),
        y: Math.max(0, Math.min(100, Math.round(((e.clientY - r.top) / r.height) * 100)))
      };
      applyFocusPreview();
    };
    thumb.addEventListener('pointerdown', (e) => {
      if (thumb.style.display === 'none') return;
      dragging = true;
      try { thumb.setPointerCapture(e.pointerId); } catch (err) {}
      setFromEvent(e);
      e.preventDefault();
    });
    thumb.addEventListener('pointermove', (e) => { if (dragging) setFromEvent(e); });
    thumb.addEventListener('pointerup',   () => { dragging = false; });
    thumb.addEventListener('pointercancel', () => { dragging = false; });
  };

  // #149 cover-thumb drag (Pro/Featured path). persistNow=true on the SAVED
  // gallery (edit mode: write immediately on release, like the cover autosave,
  // so a vendor who drags and walks away still gets the fix); false on the
  // PENDING gallery (no row yet — Save carries _imgFocus in its payload).
  // Every element currently displaying the cover crop (the gallery thumb and
  // the WYSIWYG card preview). A drag on any of them repaints all of them.
  // Rebuilt on every gallery render — the old nodes are gone with innerHTML.
  let _coverViews = [];
  const paintCoverViews = () => {
    const pos = _imgFocus ? (_imgFocus.x + '% ' + _imgFocus.y + '%') : 'center';
    _coverViews.forEach((el2) => { el2.style.objectPosition = pos; });
  };
  const wireCoverFocusDrag = (imEl, persistNow) => {
    if (!imEl || imEl.dataset.lokFocusWired) return;
    imEl.dataset.lokFocusWired = '1';
    _coverViews.push(imEl);
    imEl.style.touchAction = 'none';
    imEl.style.cursor = 'grab';
    imEl.title = 'Drag to choose which part of the photo stays in view';
    if (_imgFocus) imEl.style.objectPosition = _imgFocus.x + '% ' + _imgFocus.y + '%';
    let dragging = false;
    const setFrom = (e) => {
      const r = imEl.getBoundingClientRect();
      if (!r.width || !r.height) return;
      _imgFocus = {
        x: Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100))),
        y: Math.max(0, Math.min(100, Math.round(((e.clientY - r.top) / r.height) * 100)))
      };
      applyFocusPreview();             // one painter: thumb, hint, and all cover views
    };
    imEl.addEventListener('pointerdown', (e) => {
      dragging = true;
      try { imEl.setPointerCapture(e.pointerId); } catch (err) {}
      setFrom(e); e.preventDefault();
    });
    imEl.addEventListener('pointermove', (e) => { if (dragging) setFrom(e); });
    const done = async () => {
      if (!dragging) return;
      dragging = false;
      if (!persistNow || !editingId || !_imgFocus) return;
      // One write per drag, on release — the cover-autosave shape: full
      // payload minus the fields only an explicit Save may commit.
      const row = services.find(x => x.id === editingId);
      const payload = buildPayload(row ? row.image_url : null);
      if (validate(payload)) return;   // silent: focus is cosmetic, never nag here
      delete payload.subcategory;
      delete payload.lead_time;
      try { await window.LokaliAPI.services.update(editingId, payload); } catch (e) {}
    };
    imEl.addEventListener('pointerup', done);
    imEl.addEventListener('pointercancel', () => { dragging = false; });
  };

  // #149 WYSIWYG: "it is not intuitive that we can drag... we also have no
  // idea on how it will be seen" (Francesca, live feedback 2026-08-19). A
  // card-shaped frame under the gallery shows EXACTLY what the crop keeps —
  // same aspect as the storefront card imgs (~230x150) — and is itself the
  // drag surface, so the affordance is stated in words AND demonstrated.
  const renderCoverPreview = (body, coverUrl, persistNow) => {
    if (!coverUrl) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:14px;white-space:normal;';
    const lab = document.createElement('div');
    lab.style.cssText = 'font-size:12px;font-weight:600;color:#4A4761;margin-bottom:6px;';
    lab.textContent = 'How your cover photo will appear on your card. Drag it to adjust';
    const frame = document.createElement('div');
    frame.style.cssText = 'width:230px;max-width:100%;height:150px;border-radius:12px;overflow:hidden;border:1px solid #EEEDF6;background:#F7F6FC;box-shadow:0 2px 8px rgba(26,24,41,.08);';
    const im = document.createElement('img');
    im.id = 'lok-service-cover-preview';
    im.src = coverUrl; im.alt = 'Card crop preview';
    im.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    frame.appendChild(im);
    wrap.appendChild(lab); wrap.appendChild(frame);
    body.appendChild(wrap);
    wireCoverFocusDrag(im, persistNow);
  };

  const clearThumbPreview = (thumb) => {
    if (!thumb) return;
    if (String(thumb.tagName).toUpperCase() === 'IMG') {
      thumb.removeAttribute('src');
    } else {
      thumb.style.backgroundImage = '';
      thumb.style.backgroundSize = '';
      thumb.style.backgroundPosition = '';
    }
    thumb.style.display = 'none';
  };

  const el = {

    listView:       () => document.getElementById('services-list-view'),
    stack:          () => document.getElementById('services-stack'),
    cardTemplate:   () => {
      const node = document.getElementById('service-card-template');
      if (!node) return null;
      if (node.classList.contains('service-card')) return node;
      const inner = node.querySelector('.service-card') || node.querySelector('[data-field]')?.closest('.service-card');
      return inner || node;
    },
    emptyState:         () => document.getElementById('services-empty-state'),
    emptyStateFiltered: () => document.getElementById('services-empty-filtered'),
    /** Webflow: set element ID `services-active-count` on the footer text block (plain text is fine; script replaces content). */
    activeCount:    () => document.getElementById('services-active-count'),
    upgradeLink:    () => document.getElementById('services-upgrade-link'),
    addBtn:         () => document.getElementById('services-add-btn'),

    pillAll:        () => document.getElementById('filter-pill-all'),
    pillActive:     () => document.getElementById('filter-pill-active'),
    pillInactive:   () => document.getElementById('filter-pill-inactive'),
    catFilter:      () => resolveSelectElement('filter-category'),
    sortSelect:     () => resolveSelectElement('services-sort'),

    formView:       () => document.getElementById('services-form-view'),
    formTitle:      () => document.getElementById('services-form-title'),
    formError:      () => document.getElementById('services-form-error'),
    backBtn:        () => document.getElementById('services-back-btn'),
    saveBtn:        () => document.getElementById('services-save-btn'),
    cancelBtn:      () => document.getElementById('services-cancel-btn'),
    deleteBtn:      () => document.getElementById('services-delete-btn'),

    fieldName:        () => resolveFieldInput('service-name'),
    fieldDescription: () => resolveFieldInput('service-description'),
    fieldCategory:    () => resolveSelectElement('service-category'),
    fieldPriceType:   () => resolveSelectElement('service-price-type'),
    fieldPrice:          () => resolveFieldInput('service-price'),
    fieldPriceStarting:  () => resolveFieldInput('service-price-starting'),
    fieldPriceMin:    () => resolveFieldInput('service-price-min'),
    fieldPriceMax:    () => resolveFieldInput('service-price-max'),
    fieldPriceNote:          () => resolveFieldInput('service-price-note'),
    fieldPriceNoteStarting:  () => resolveFieldInput('service-price-note-starting'),
    fieldDuration:    () => resolveFieldInput('service-duration'),
    fieldRemote:      () => resolveCheckboxInput('service-remote'),
    fieldIsActive:    () => resolveCheckboxInput('service-is-active'),

    wrapFixed:      () => document.getElementById('price-wrap-fixed'),
    wrapStarting:   () => document.getElementById('price-wrap-starting'),
    wrapRange:      () => document.getElementById('price-wrap-range'),
    wrapQuote:      () => document.getElementById('price-wrap-quote'),

    imgInput:       () => resolveFileInput('service-img-input'),
    imgThumb:       () => document.getElementById('service-img-thumb'),
    imgPlaceholder: () => document.getElementById('service-img-placeholder'),
    imgRemoveBtn:   () => document.getElementById('service-img-remove'),
  };

  const formatPrice = (service) => {
    const fmt = (cents) =>
      '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: (cents % 100) ? 2 : 0, maximumFractionDigits: 2 });

    switch (service.price_type) {
      case 'fixed':       return fmt(service.price_cents);
      case 'starting_at': return 'From ' + fmt(service.price_min_cents);
      case 'range':       return fmt(service.price_min_cents) + ' \u2013 ' + fmt(service.price_max_cents);
      case 'quote':       return 'Get a quote';
      case 'free':        return 'Free';
      default:            return '';
    }
  };

  const getCategoryName = (_categoryId) => '';

  const applyFormErrorTypography = (node) => {
    if (!node) return;
    node.style.setProperty('font-family', '"Plus Jakarta Sans", "Plus Jakarta Sans Variable", system-ui, sans-serif', 'important');
    node.style.setProperty('font-size', '14px', 'important');
    node.style.setProperty('line-height', '1.45', 'important');
    node.style.setProperty('font-weight', '500', 'important');
    node.style.setProperty('color', '#B1006A', 'important');
    node.style.setProperty('letter-spacing', 'normal', 'important');
    node.style.setProperty('text-transform', 'none', 'important');
    node.style.marginLeft = '1.25rem';
    node.style.marginRight = '1.25rem';
  };

  const showError = (msg) => {
    const e = el.formError();
    if (!e) return;
    applyFormErrorTypography(e);
    e.textContent = msg;
    e.style.display = 'block';
    // Zoom Drain, 2026-11-06: on a phone the vendor tapped Save, validation
    // failed, and the one-line message sat off-screen — he left believing the
    // listing had saved. Make it a box, announce it, and bring it into view.
    e.setAttribute('role', 'alert');
    e.style.padding = '10px 14px';
    e.style.borderRadius = '10px';
    e.style.background = '#FDECEF';
    e.style.border = '1px solid #F5B8C4';
    e.style.color = '#9F1239';
    e.style.fontWeight = '600';
    try { e.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { e.scrollIntoView(); }
  };

  const clearError = () => {
    const e = el.formError();
    if (!e) return;
    e.textContent = '';
    e.style.display = 'none';
  };

  const centsFromDollars = (val) => {
    const n = parseFloat(String(val ?? '').replace(/,/g, ''));
    if (isNaN(n) || n < 0) return 0;
    return Math.round(n * 100);
  };
  const dollarsFromCents = (cents) =>
    (cents != null && !isNaN(cents) && Number(cents) !== 0)
      ? (Number(cents) % 100 === 0 ? String(Number(cents) / 100) : (Number(cents) / 100).toFixed(2))
      : '';

  const nextServiceSortOrder = () => {
    let max = -1;
    for (const s of services) {
      const n = Number(s.sort_order);
      if (!isNaN(n) && n > max) max = n;
    }
    return max + 1;
  };

  // #94 — NEW ITEMS GO TO THE TOP (Francesca 2026-07-21, Etsy's model): a new
  // service takes min-1 so it lands in the public page's above-the-fold slots
  // where it can actually be seen. Negative values are fine (integer column,
  // ASC order); any drag re-normalizes the whole list to 0..n-1.
  // nextServiceSortOrder (max+1) is kept for the EDIT fallback only — an
  // existing row that somehow lost its slot should re-enter at the bottom,
  // not silently jump the vendor's curated fold.
  const topServiceSortOrder = () => {
    let min = 1;
    for (const s of services) {
      const n = Number(s.sort_order);
      if (!isNaN(n) && n < min) min = n;
    }
    return min - 1;
  };

  const applyPillStyle = (pill, selected) => {
    if (!pill) return;
    // Segmented control (LokaliListingUI): classes only, no inline colors.
    pill.classList.toggle('filter-pill-selected', !!selected);
    pill.classList.toggle('lok-seg-on', !!selected);
  };

  const setStatusFilter = (val) => {
    filterStatus = val;
    const pills = [el.pillAll(), el.pillActive(), el.pillInactive()];
    pills.forEach(p => applyPillStyle(p, false));
    const targets = { all: el.pillAll(), active: el.pillActive(), inactive: el.pillInactive() };
    applyPillStyle(targets[val], true);
    applyFiltersAndSort();
  };

  const normalizeSortValue = (raw) => {
    if (!raw) return 'custom';
    const v = String(raw).trim().toLowerCase().replace(/[\s_-]+/g, '_');
    if (v === 'custom' || v === 'custom_order') return 'custom';
    if (v === 'newest' || v === 'newest_first') return 'newest';
    if (v === 'alpha' || v === 'a_to_z' || v === 'alphabetical') return 'alpha';
    if (v === 'price_asc' || v === 'price_low_to_high') return 'price_asc';
    if (v === 'price_desc' || v === 'price_high_to_low') return 'price_desc';
    return raw;
  };

  const applyFiltersAndSort = () => {
    const sortVal = normalizeSortValue(el.sortSelect()?.value);
    let visible = [...document.querySelectorAll(`#services-stack ${STACK_CARD_SEL}`)];

    visible.forEach(card => {
      const isActive = card.dataset.active === 'true';
      let show = true;
      if (filterStatus === 'active'   && !isActive) show = false;
      if (filterStatus === 'inactive' && isActive)  show = false;
      card.classList.toggle('service-card--hidden', !show);
    });

    const stack = el.stack();
    if (stack) {
      const all = [...stack.querySelectorAll(STACK_CARD_SEL)];
      if (sortVal === 'custom') {
        // #94: a view sort physically reorders the DOM — returning to Custom
        // must restore the curated sort_order arrangement, or the next drag
        // would persist the view order as the public order.
        var pos = {};
        services.forEach(function (s, i) { pos[String(s.id)] = i; });
        all.sort(function (a, b) {
          var pa = pos[a.dataset.serviceId], pb = pos[b.dataset.serviceId];
          return (pa == null ? 9999 : pa) - (pb == null ? 9999 : pb);
        });
      } else {
        all.sort((a, b) => {
          if (sortVal === 'newest')     return parseInt(b.dataset.created) - parseInt(a.dataset.created);
          if (sortVal === 'alpha') {
            const nameA = (a.querySelector('[data-field="service-name"]') || a.querySelector('.service-name'))?.textContent || '';
            const nameB = (b.querySelector('[data-field="service-name"]') || b.querySelector('.service-name'))?.textContent || '';
            return nameA.localeCompare(nameB) || 0;
          }
          if (sortVal === 'price_asc')  return parseInt(a.dataset.price) - parseInt(b.dataset.price);
          if (sortVal === 'price_desc') return parseInt(b.dataset.price) - parseInt(a.dataset.price);
          return 0;
        });
      }
      all.forEach(c => stack.appendChild(c));
    }

    updateEmptyState();
    fixLastCard();
  };

  const updateEmptyState = () => {
    if (loadFailed) return; // load-error card is up — don't paint the empty state over it
    const stack = el.stack();
    const emptyNew = el.emptyState();
    if (emptyNew && window.LokaliListingUI) window.LokaliListingUI.emptyState(emptyNew, { kind: 'service', onAdd: () => el.addBtn()?.click() });
    const emptyFiltered = el.emptyStateFiltered();
    if (!stack) return;

    const visibleCount = stack.querySelectorAll(`${STACK_CARD_SEL}:not(.service-card--hidden)`).length;
    const noServicesEver = services.length === 0;

    if (visibleCount > 0) {
      if (emptyNew) emptyNew.style.display = 'none';
      if (emptyFiltered) emptyFiltered.style.display = 'none';
      return;
    }

    if (emptyFiltered) {
      if (noServicesEver) {
        if (emptyNew) emptyNew.style.display = 'block';
        emptyFiltered.style.display = 'none';
      } else {
        if (emptyNew) emptyNew.style.display = 'none';
        emptyFiltered.style.display = 'block';
      }
    } else if (emptyNew) {

      emptyNew.style.display = 'block';
    }
  };

  const fixLastCard = () => {
    const stack = el.stack();
    if (!stack) return;
    const all     = stack.querySelectorAll(STACK_CARD_SEL);
    const visible = stack.querySelectorAll(`${STACK_CARD_SEL}:not(.service-card--hidden)`);
    all.forEach(c => c.style.marginBottom = '-10px');
    if (visible.length) visible[visible.length - 1].style.marginBottom = '0';
  };

  const renderList = () => {
    const stack    = el.stack();
    const template = el.cardTemplate();
    if (!stack || !template) return;

    clearStackDataCards(stack);

    const activeCount = services.filter(s => isServiceActive(s)).length;
    const totalCount  = services.length;
    const limitCount  = services.filter(isLimitHidden).length;

    const countEl = el.activeCount();
    if (countEl) {
      if (limitCount > 0 && _maxServices != null && _maxServices < 100000) {
        countEl.textContent =
          `${activeCount} live on the ${_planLabel} plan · ${limitCount} more written and waiting`;
      } else if (_maxServices != null && _maxServices >= 100000) {
        // Pro/Featured store an "unlimited" cap as a large sentinel (e.g. 99999999).
        // Don't render the raw number — show that the plan is uncapped.
        countEl.textContent =
          `${activeCount} live on your storefront · unlimited on your plan`;
      } else if (_maxServices != null) {
        const remaining = Math.max(0, _maxServices - totalCount);
        countEl.textContent =
          `${totalCount} of ${_maxServices} services · ${remaining} slot${remaining === 1 ? '' : 's'} left`;
      } else {
        countEl.textContent =
          `${activeCount} of ${totalCount} live on your storefront`;
      }
    }

    const upgradeEl = el.upgradeLink();
    if (upgradeEl && _maxServices != null) {
      upgradeEl.style.display = (totalCount >= _maxServices) ? 'flex' : 'none';
    }
    if (upgradeEl) upgradeEl.href = '/pricing';

    const catTool = el.catFilter();
    if (catTool) {
      catTool.style.display = 'none';
      catTool.setAttribute('aria-hidden', 'true');
    }

    // #94 — surface the reorder → public-page link. The mechanism always
    // existed (drag persists sort_order; the public page renders that order,
    // first 5 above the "Show all" fold) but nothing ever TOLD vendors, so a
    // never-dragged list rode on creation order. One line, only when there is
    // something to arrange. Plus Jakarta Sans + muted violet-gray per house style.
    let orderHint = document.getElementById('services-order-hint');
    if (totalCount > 1) {
      if (!orderHint && stack.parentNode) {
        orderHint = document.createElement('div');
        orderHint.id = 'services-order-hint';
        orderHint.style.cssText =
          'font-family:"Plus Jakarta Sans",sans-serif;font-size:13px;color:#6B6580;' +
          'margin:2px 0 10px;line-height:1.5;';
        orderHint.textContent =
          'New services start at the top. Drag a card to move it.';
        stack.parentNode.insertBefore(orderHint, stack);
      }
      if (orderHint) orderHint.style.display = '';
    } else if (orderHint) {
      orderHint.style.display = 'none';
    }

    // Plan-cap banner: only when the server has parked at least one service. Says what is
    // true (N ready, plan shows M) and what upgrading does, with the way to the pricing page.
    let capBanner = document.getElementById('services-pro-banner');
    if (limitCount > 0 && _maxServices != null && _maxServices < 100000) {
      if (!capBanner && stack.parentNode) {
        capBanner = document.createElement('div');
        capBanner.id = 'services-pro-banner';
        capBanner.style.cssText =
          'display:flex;align-items:center;gap:12px;background:#F3EBFF;border-radius:12px;' +
          'padding:12px 14px;margin:0 0 12px;font-family:"Plus Jakarta Sans",sans-serif;';
        stack.parentNode.insertBefore(capBanner, stack);
      }
      if (capBanner) {
        const nextPlan = _planLabel === 'Pro' ? 'Featured' : 'Pro';
        const room = nextPlan === 'Pro' ? ', with room for 15' : '';
        capBanner.innerHTML =
          '<svg viewBox="0 0 512 512" width="20" height="20" fill="#6002EE" aria-hidden="true" style="flex:none"><path d="M327.5 85.2c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L384 128l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L448 128l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L448 64 426.8 7.5C425.1 3 420.8 0 416 0s-9.1 3-10.8 7.5L384 64 327.5 85.2zM205.1 73.3c-2.6-5.7-8.3-9.3-14.5-9.3s-11.9 3.6-14.5 9.3L123.3 187.3 9.3 240C3.6 242.6 0 248.3 0 254.6s3.6 11.9 9.3 14.5l114.1 52.7L176 435.8c2.6 5.7 8.3 9.3 14.5 9.3s11.9-3.6 14.5-9.3l52.7-114.1 114.1-52.7c5.7-2.6 9.3-8.3 9.3-14.5s-3.6-11.9-9.3-14.5L257.8 187.4 205.1 73.3zM384 384l-56.5 21.2c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L384 448l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L448 448l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L448 384l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L384 384z"/></svg>' +
          '<p style="font-size:13px;color:#3C2A6E;margin:0;flex:1;line-height:1.5">' +
            `You have ${totalCount} services ready. The ${_planLabel} plan shows ${_maxServices}. ` +
            `On ${nextPlan} all ${totalCount} go live the minute you upgrade${room}.` +
          '</p>' +
          `<a href="/pricing" style="font-size:12.5px;font-weight:600;color:#fff;background:#6002EE;border-radius:100px;padding:7px 14px;white-space:nowrap;text-decoration:none">See ${nextPlan}</a>`;
        capBanner.style.display = '';
      }
    } else if (capBanner) {
      capBanner.style.display = 'none';
    }

    services.forEach((service, index) => {
      const card = template.cloneNode(true);
      card.removeAttribute('id');
      card.classList.add('service-card');
      card.style.removeProperty('display');
      card.style.marginBottom = '-10px';
      card.setAttribute('data-service-id', service.id);
      card.setAttribute('data-active',     isServiceActive(service) ? 'true' : 'false');
      card.setAttribute('data-category',   getCategoryName(service.category_id));
      card.setAttribute('data-price',      service.price_cents || service.price_min_cents || 0);
      // 'Newest' sorts by real creation time — a render index inverted it
      // under #94's new-items-on-top order.
      var createdTs = typeof service.created_at === 'number'
        ? service.created_at
        : (Date.parse(service.created_at || '') || 0);
      card.setAttribute('data-created',    createdTs);
      card.setAttribute('draggable',       'true');

      const find = (field, ...fallbackClasses) => {
        let node = card.querySelector(`[data-field="${field}"]`);
        if (node) return node;
        for (const cls of fallbackClasses) {
          node = card.querySelector(`.${cls}`);
          if (node) return node;
        }
        return null;
      };

      const set = (field, val, ...fallbackClasses) => {
        const node = find(field, ...fallbackClasses);
        if (node) node.textContent = val || '';
      };

      set('service-name',        service.service_name || service.name || '',              'service-name');
      set('service-category',    getCategoryName(service.category_id), 'service-category');
      set('service-description', service.service_description || service.description || '', 'service-description');
      set('service-price',       formatPrice(service),              'service-price');

      const pill = find('service-status', 'status-pill', 'service-status');
      if (pill) {
        pill.textContent = isServiceActive(service) ? 'Active' : 'Inactive';
        pill.classList.toggle('pill-active',   isServiceActive(service));
        pill.classList.toggle('pill-inactive', !isServiceActive(service));
      }

      const remoteBadge = find('service-remote', 'remote-badge', 'service-remote');
      if (remoteBadge) remoteBadge.style.display = service.remote ? 'inline-flex' : 'none';

      // FEAT-PICKS — the star: a Featured-plan vendor hand-picks up to 5
      // services to LEAD the public page (picks sort before the drag order, so
      // they fill the above-the-fold slots). Non-Featured vendors see the star
      // dimmed — it is the perk's sales surface, not dead UI. The DB trigger is
      // the real gate (plan + cap); this UI just mirrors it politely.
      (function () {
        const actions = card.querySelector('.card-actions');
        if (!actions) return;
        const item = service;
        const starBtn = document.createElement('button');
        starBtn.type = 'button';
        starBtn.className = 'icon-btn lok-pick-star';
        starBtn.setAttribute('data-action', 'feature');
        const paint = (on) => {
          starBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="' +
            (on ? '#6002EE' : 'none') + '" stroke="' + (on ? '#6002EE' : 'currentColor') +
            '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
          starBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
          starBtn.setAttribute('aria-label', on ? 'Un-feature this service' : 'Feature this service');
          starBtn.title = _isFeaturedPlan
            ? (on ? 'Featured pick: shows first on your public page. Click to un-feature.'
                  : 'Feature this service. Up to 5 lead your public page.')
            : 'Featured picks are a Featured-plan perk. Upgrade to hand-pick what leads your page.';
        };
        paint(item.is_featured_pick === true);
        if (!_isFeaturedPlan && item.is_featured_pick !== true) {
          starBtn.style.opacity = '0.35';
        }
        starBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!_isFeaturedPlan && item.is_featured_pick !== true) {
            alert('Featured picks are a Featured-plan perk. Upgrade to hand-pick what leads your public page.');
            return;
          }
          const next = item.is_featured_pick !== true;
          starBtn.disabled = true;
          const res = await window.LokaliAPI.services.update(item.id, { is_featured_pick: next });
          starBtn.disabled = false;
          if (res && res.error) {
            alert(String(res.error).replace(/^LOKALI_LIMIT_REACHED:\s*/, ''));
            return;
          }
          item.is_featured_pick = next;
          paint(next);
          // Grandfathered un-star on a non-Featured plan: re-dim immediately
          // (re-starring is gated), don't wait for the next full render.
          starBtn.style.opacity = (!_isFeaturedPlan && !next) ? '0.35' : '';
        });
        actions.insertBefore(starBtn, actions.firstChild);
      })();

      const editBtn = card.querySelector('[data-action="edit"]') || card.querySelector('.icon-btn-edit');
      if (editBtn) editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openForm(service.id);
      });
      // Duplicate (2026-09-17, F): opens the Add form prefilled from this service.
      // Photos are NOT copied and Live starts off; saving creates a new row.
      if (editBtn && !card.querySelector('[data-action="duplicate"]')) {
        const dupBtn = document.createElement('button');
        dupBtn.type = 'button';
        dupBtn.className = 'icon-btn';
        dupBtn.setAttribute('data-action', 'duplicate');
        dupBtn.title = 'Duplicate this service';
        dupBtn.setAttribute('aria-label', 'Duplicate this service');
        dupBtn.innerHTML = '<svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><path d="M288 448H64V224h64V160H64c-35.3 0-64 28.7-64 64V448c0 35.3 28.7 64 64 64H288c35.3 0 64-28.7 64-64V416H288v32zm-64-96H448c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H224c-35.3 0-64 28.7-64 64V288c0 35.3 28.7 64 64 64z"/></svg><span>Copy</span>';
        dupBtn.addEventListener('click', (e) => { e.stopPropagation(); duplicateFrom(service); });
        editBtn.insertAdjacentElement('afterend', dupBtn);
      }

      const deleteBtn = card.querySelector('[data-action="delete"]') || card.querySelector('.icon-btn--delete');
      if (deleteBtn) deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeactivate(service.id);
      });

      card.addEventListener('click', () => openForm(service.id));

      card.querySelector('.drag-handle')?.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragend',   onDragEnd);
      card.addEventListener('dragover',  onDragOver);
      card.addEventListener('drop',      onDrop);

      if (window.LokaliListingUI) window.LokaliListingUI.card(card, {
        kind: 'service', imgUrl: service.image_url || '', focus: lcFocusPos(service), hasPrice: !!formatPrice(service),
        spec: lcSpecLabel(service.subcategory), lead: service.lead_time || '',
        ways: [service.remote ? 'Remote' : ''], live: isServiceActive(service), byLimit: isLimitHidden(service), pick: service.is_featured_pick === true
      });
      stack.appendChild(card);
    });
    if (window.LokaliListingUI) {
      const LUI = window.LokaliListingUI;
      const liveN = services.filter(isServiceActive).length;
      LUI.afterRender(stack, { picks: services.filter((x) => x.is_featured_pick === true).length, cap: 5, featured: _isFeaturedPlan, customOrder: (el.sortSelect()?.value || 'custom') === 'custom' });
      const hiddenAll = services.filter((s) => !isServiceActive(s));
      const hiddenLabel = hiddenAll.length > 0 && hiddenAll.every(isLimitHidden) ? 'Waiting' : 'Hidden';
      LUI.segmented({ all: el.pillAll(), live: el.pillActive(), hidden: el.pillInactive() }, { all: services.length, live: liveN, hidden: services.length - liveN, hiddenLabel });
      LUI.header(document.querySelector('#services-list-view .text-block-33'), el.activeCount(), document.getElementById('services-order-hint'));
      lcPaintViews();
    }

    reorderFooterAfterStack(stack);

    applyFiltersAndSort();
  };

  const reorderFooterAfterStack = (stack) => {
    const parent = stack.parentElement;
    if (!parent) return;

    const findSibling = (node) => {
      if (!node) return null;
      let el = node;
      while (el.parentElement && el.parentElement !== parent) el = el.parentElement;
      return (el.parentElement === parent && el !== stack) ? el : null;
    };

    const seen = new Set();
    const footerSiblings = [];
    [el.activeCount(), el.upgradeLink()].forEach(node => {
      const sib = findSibling(node);
      if (sib && !seen.has(sib)) { seen.add(sib); footerSiblings.push(sib); }
    });

    let anchor = stack;
    footerSiblings.forEach(sib => {
      anchor.after(sib);
      anchor = sib;
    });
  };

  const reconcileListDom = () => {
    if (loadFailed) return; // error card is up — renderList would swap it for the empty state
    const stack = el.stack();
    const template = el.cardTemplate();
    if (!stack || !template) return;
    // Always re-run when list is empty so #services-active-count updates after failed API init (not only Webflow placeholder).
    if (services.length === 0) {
      renderList();
      return;
    }
    if (stack.querySelectorAll(STACK_CARD_SEL).length > 0) return;
    renderList();
  };

  const showListView = () => {
    el.listView()?.style && (el.listView().style.display = 'block');
    el.formView()?.style && (el.formView().style.display = 'none');
    editingId = null;
    clearError();
  };

  // The Webflow "icon button" base class is a 25x25 circle (card edit/trash icons); when the
  // form action buttons inherit it, the label clips. Un-squash only when that size is detected,
  // so proper Designer styling (if added later) wins.
  const fixFormActionButtons = () => {
    [el.saveBtn(), el.cancelBtn(), el.deleteBtn()].forEach((b) => {
      if (!b) return;
      b.style.setProperty('font-size', '12px', 'important');
      b.querySelectorAll('div,span').forEach((t) => t.style.setProperty('font-size', '12px', 'important'));
      const w = parseFloat(getComputedStyle(b).width);
      if (!w || w > 60) return;
      b.style.setProperty('width', 'auto', 'important');
      b.style.setProperty('height', 'auto', 'important');
      b.style.setProperty('padding', '10px 20px', 'important');
      b.style.setProperty('gap', '8px', 'important');
      b.style.setProperty('display', b.style.display === 'none' ? 'none' : 'inline-flex', 'important');
      b.style.setProperty('align-items', 'center', 'important');
      b.style.setProperty('justify-content', 'center', 'important');
      b.style.setProperty('border-radius', '12px', 'important');
      b.style.setProperty('white-space', 'nowrap', 'important');
    });
  };

  // Line the self-mounted gallery up with the field column above it.
  const alignGalleryHost = () => {
    const host = document.getElementById('lok-service-gallery');
    const ref = el.fieldName();
    if (!host || !ref) return;
    const dx = ref.getBoundingClientRect().left - host.getBoundingClientRect().left;
    if (dx > 0 && dx < 300) {
      host.style.paddingLeft = dx + 'px';
      host.style.paddingRight = dx + 'px';
    }
  };

  const applyPhotoUI = () => {
    // Pro/Featured: the gallery is the only photo widget and its first photo is the
    // cover, so hide the standalone "Service image" field to avoid two competing
    // photo areas. Free keeps it (the gallery is locked for them).
    if (!_hasGallery) return;
    const anchor = el.imgThumb() || el.imgPlaceholder() || el.imgInput();
    if (!anchor) return;
    let section = anchor;
    while (section && !/service image/i.test(section.textContent || '')) section = section.parentElement;
    if (section) section.style.display = 'none';
  };

  // ── Listings UI (2026-09-17): photo cards, segmented filter, preview ──────
  // Rendering lives in window.LokaliListingUI (lokali-dashboard.js); these
  // readers hand it this page's state.
  let _lcPreview = null, _lcPreviewWired = false, _lcViews = null, _lcViewsP = null;
  let _lcOrg = null;
  const lcPhotoCap = () => { const m = /(\d+) of (\d+) photos/.exec(document.getElementById('lok-service-gallery')?.textContent || ''); return m ? parseInt(m[2], 10) : 0; };
  const lcSpecLabel = (slug) => {
    if (!slug) return '';
    const hit = (_subcatList || []).find((r) => r.slug === slug);
    return hit ? hit.label : String(slug).replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  };
  const lcCoverUrl = () => {
    const g = document.querySelector('#lok-service-gallery-body img[data-photo-idx="0"]');
    if (g && g.getAttribute('src')) return g.getAttribute('src');
    const t = el.imgThumb();
    if (t && t.style.display !== 'none') {
      if (String(t.tagName).toUpperCase() === 'IMG' && t.getAttribute('src')) return t.getAttribute('src');
      const m = /url\("?([^")]+)"?\)/.exec(t.style.backgroundImage || '');
      if (m) return m[1];
    }
    return '';
  };
  const lcPreviewPrice = () => {
    const key = readPriceTypeFromSelect();
    const cents = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : Math.round(n * 100); };
    if (key === 'quote') return 'Get a quote';
    if (key === 'free') return 'Free';
    const fake = { price_type: key, price_cents: cents(el.fieldPrice()?.value), price_min_cents: cents(el.fieldPriceStarting()?.value) || cents(el.fieldPriceMin()?.value), price_max_cents: cents(el.fieldPriceMax()?.value) };
    if (key === 'fixed' && !(fake.price_cents > 0)) return '';
    if (key === 'starting_at' && !(fake.price_min_cents > 0)) return '';
    if (key === 'range' && !(fake.price_min_cents > 0 && fake.price_max_cents > 0)) return '';
    return formatPrice(fake) || '';
  };
  const lcWays = () => [el.fieldRemote()?.checked ? 'Remote' : ''];
  const lcRefreshPreview = () => {
    if (!_lcPreview) return;
    const price = lcPreviewPrice();
    const imgUrl0 = lcCoverUrl();
    if (_lcOrg && _lcOrg.update) _lcOrg.update({ photos: (_galleryPhotos && _galleryPhotos.length) || (imgUrl0 ? 1 : 0), photoCap: lcPhotoCap(), imgUrl: imgUrl0, name: el.fieldName()?.value, price, hasPrice: !!price, spec: lcSpecLabel(_selectedSubcat) });
    _lcPreview.update({ name: el.fieldName()?.value, price, hasPrice: !!price, spec: lcSpecLabel(_selectedSubcat), lead: _leadTime || '', imgUrl: lcCoverUrl(), focus: _imgFocus ? (_imgFocus.x + '% ' + _imgFocus.y + '%') : '', ways: lcWays(), live: el.fieldIsActive() ? !!el.fieldIsActive().checked : true });
  };
  const lcMountPreview = () => {
    const LUI = window.LokaliListingUI; if (!LUI) return;
    const fv = el.formView(); if (!fv) return;
    _lcPreview = LUI.preview(fv, fv.querySelector('.form-header'));
    LUI.formBar(fv, el.saveBtn());
    if (!_lcPreviewWired) {
      _lcPreviewWired = true;
      fv.addEventListener('input', lcRefreshPreview);
      fv.addEventListener('change', lcRefreshPreview);
      fv.addEventListener('click', () => setTimeout(lcRefreshPreview, 60));
      if (window.MutationObserver) {
        let tick = null;
        new MutationObserver((ms) => {
          const pv = document.getElementById('lok-lc-preview');
          if (!ms.some((m) => !(pv && pv.contains(m.target)))) return;   // ignore our own preview repaint
          clearTimeout(tick); tick = setTimeout(lcRefreshPreview, 80);
        }).observe(fv, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
      }
    }
    reachHost(); // #251: must exist before the organiser builds its sections
    if (!_lcOrg) _lcOrg = LUI.organize(fv, { kind: 'service', ids: { img: 'service-img-input', name: 'service-name', desc: 'service-description', priceType: 'service-price-type', active: 'service-is-active', remote: 'service-remote' }, hosts: { gallery: 'lok-service-gallery', video: 'lok-service-video', buy: 'lok-service-link', reach: 'lok-service-reach' } }); // buy = Website link host (2026-10-03): the organiser's settle() only pulls hosts.video + hosts.buy into Details, so without this the link field stayed in the hidden raw grid
    if (_lcOrg && _lcOrg.reset) _lcOrg.reset(!!editingId);
    setTimeout(lcRefreshPreview, 0);
    setTimeout(lcRefreshPreview, 500);
  };
  const lcPaintViews = () => {
    const paint = () => window.LokaliListingUI && window.LokaliListingUI.paintStats(el.stack(), _lcViews || [], 'service');
    if (_lcViews) { paint(); return; }
    if (!_lcViewsP) {
      const A = window.LokaliAPI;
      _lcViewsP = (A && A.leads && A.leads.analytics ? A.leads.analytics() : Promise.resolve(null))
        .then((r) => { const d = r && !r.error ? (r.data != null ? r.data : r) : null; _lcViews = (d && d.views) || []; })
        .catch(() => { _lcViews = []; });
    }
    _lcViewsP.then(paint);
  };

  const showFormView = () => {
    el.listView()?.style && (el.listView().style.display = 'none');
    el.formView()?.style && (el.formView().style.display = 'block');
    fixFormActionButtons();
    applyPhotoUI();
    alignGalleryHost();
    ensureSubcatUI();      // #96-LISTING
    renderSubcatPills();
    ensureLeadTimeUI();    // #78
    syncLeadInput();
    renderLeadPresets();
    lcMountPreview();
  };

  const openForm = (serviceId = null) => {
    editingId    = serviceId;
    imageRemoved = false;
    clearError();

    const isEditing = !!serviceId;
    const titleEl   = el.formTitle();
    const deleteBtn = el.deleteBtn();

    if (titleEl)   titleEl.textContent    = isEditing ? 'Edit service' : 'Add a service';
    if (deleteBtn) deleteBtn.style.display = isEditing ? 'flex' : 'none';

    if (isEditing) {
      const service = services.find(s => s.id === serviceId);
      if (!service) return;
      populateForm(service);
    } else {
      if (_maxServices != null && services.length >= _maxServices) {
        alert(`You've reached your ${_maxServices}-service limit on your current plan. Upgrade to add more.`);
        return;
      }
      resetForm();
    }

    showFormView();
  };

  // Duplicate (2026-09-17): the Add form, prefilled from an existing service.
  const duplicateFrom = (service) => {
    if (_maxServices != null && services.length >= _maxServices) {
      alert(`You've reached your ${_maxServices}-service limit on your current plan. Upgrade to add more.`);
      return;
    }
    openForm(null);
    if (editingId !== null) return;
    const copy = Object.assign({}, service, {
      id: null,
      service_name: String(service.service_name || '').trim() + ' (copy)',
      image_url: null, image_focus_x: null, image_focus_y: null,
      is_active: false,
      is_featured_pick: false
    });
    populateForm(copy);
    if (typeof lcRefreshPreview === 'function') { try { lcRefreshPreview(); } catch (e) {} }
    const nameEl = el.fieldName();
    if (nameEl) { try { nameEl.focus(); nameEl.select(); } catch (e) {} }
  };

  const populateForm = (service) => {
    _selectedSubcat = service.subcategory || null; // #96-LISTING (pills re-render in showFormView)
    _subcatDefaulted = false;
    _leadTime = service.lead_time || null;         // #78 (input + chips re-render in showFormView)
    if (el.fieldName())        el.fieldName().value        = service.service_name || '';
    if (el.fieldDescription()) el.fieldDescription().value = service.service_description || '';
    if (el.fieldCategory())    el.fieldCategory().value    = service.category_id || '';
    selectPriceTypeOption(el.fieldPriceType(), service.price_type || 'fixed');
    if (el.fieldDuration())    el.fieldDuration().value    = service.duration_minutes || '';
    if (el.fieldRemote())      el.fieldRemote().checked    = service.remote || false;
    if (el.fieldIsActive())    el.fieldIsActive().checked  = service.is_active !== false;
    // Under the Live switch: a parked service says so (the server refuses to switch it on
    // past the cap, trg_limit_services_activate, so better to say it up front).
    const liveSub = document.querySelector('.lok-sw-live-s');
    if (liveSub) liveSub.textContent = isLimitHidden(service)
      ? 'Waiting for a bigger plan. It goes live on its own the minute you upgrade.'
      : 'Turn off to hide it without deleting.';
    const note = service.price_note || '';
    if (el.fieldPriceNote())          el.fieldPriceNote().value          = note;
    if (el.fieldPriceNoteStarting())  el.fieldPriceNoteStarting().value  = note;

    const ptNorm = normalizePriceType(service.price_type) || service.price_type;
    const hasStartingInput = !!el.fieldPriceStarting();
    if (el.fieldPrice()) {
      if (hasStartingInput) {
        el.fieldPrice().value = ptNorm === 'fixed' ? dollarsFromCents(service.price_cents) : '';
      } else {
        const cents = ptNorm === 'starting_at' ? service.price_min_cents : service.price_cents;
        el.fieldPrice().value = dollarsFromCents(cents);
      }
    }
    if (el.fieldPriceStarting()) {
      el.fieldPriceStarting().value =
        ptNorm === 'starting_at' ? dollarsFromCents(service.price_min_cents) : '';
    }
    if (el.fieldPriceMin()) el.fieldPriceMin().value = dollarsFromCents(service.price_min_cents);
    if (el.fieldPriceMax()) el.fieldPriceMax().value = dollarsFromCents(service.price_max_cents);

    syncPriceWrapsFromSelect();

    resetImagePreview();
    if (service.image_url) {
      const thumb = el.imgThumb();
      const ph    = el.imgPlaceholder();
      const rem   = el.imgRemoveBtn();
      applyThumbPreview(thumb, service.image_url);
      if (ph)  ph.style.display = 'none';
      if (rem) rem.style.display = 'block';
      // #149: AFTER applyThumbPreview — it repaints the position from _imgFocus.
      _imgFocus = (service.image_focus_x != null && service.image_focus_y != null)
        ? { x: service.image_focus_x, y: service.image_focus_y } : null;
      applyFocusPreview();
    }
    renderGallery(service.id);
    setVideoUrl(service.video_url);
    setLinkUrl(service.link_url);   // 2026-10-02 website link
    setReach(service);              // #251 how shoppers reach you (after the link: it moves that field)
  };

  const resetForm = () => {
    [
      el.fieldName(), el.fieldDescription(), el.fieldPrice(), el.fieldPriceStarting(),
      el.fieldPriceMin(), el.fieldPriceMax(), el.fieldPriceNote(), el.fieldPriceNoteStarting(),
      el.fieldDuration()
    ].forEach(f => { if (f) f.value = ''; });

    selectPriceTypeOption(el.fieldPriceType(), 'fixed');
    if (el.fieldRemote())    el.fieldRemote().checked   = false;
    if (el.fieldIsActive())  el.fieldIsActive().checked = true;
    if (el.fieldCategory())  el.fieldCategory().value   = '';
    _selectedSubcat = defaultSubcatForNew(); // #96-LISTING: a new service starts on the vendor's usual tag
    _subcatDefaulted = !!_selectedSubcat;
    _leadTime = null;       // #78
    syncLeadInput();

    syncPriceWrapsFromSelect();
    resetImagePreview();
    // Stale-cover bug (2026-09-01): _galleryPhotos held the LAST-EDITED item's
    // attached photos, and handleSave prefers _galleryPhotos[0] as the cover —
    // so a new item created after viewing another inherited its cover photo.
    _galleryPhotos = [];
    _pendingGalleryPhotos = [];
    _pendingSubcatLabels = [];
    renderGallery(null);
    setVideoUrl('');
    setLinkUrl('');   // 2026-10-02 website link
    setReach(null);   // #251
  };

  const revokeImagePreviewUrl = () => {
    if (_imagePreviewObjectUrl) {
      try { URL.revokeObjectURL(_imagePreviewObjectUrl); } catch (e) {}
      _imagePreviewObjectUrl = null;
    }
  };

  const resetImagePreview = () => {
    revokeImagePreviewUrl();
    _imgFocus = null;             // #149: no image, no focal point
    _mainImageUrl = null;
    applyFocusPreview();
    const input = el.imgInput();
    const thumb = el.imgThumb();
    const ph    = el.imgPlaceholder();
    const rem   = el.imgRemoveBtn();
    if (input) input.value = '';
    clearThumbPreview(thumb);
    if (ph)    ph.style.display  = 'flex';
    if (rem)   rem.style.display = 'none';
    imageRemoved = false;
  };

  // ---------------------------------------------------------------------------
  // Optional showcase video (YouTube / Vimeo). Self-mounting input — no Webflow
  // edits. Mirrors the server-side validation; the public detail page re-parses
  // the id + allowlists the host before building the embed.
  // ---------------------------------------------------------------------------
  const VIDEO_URL_RE = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/|v\/)[\w-]{11}|youtu\.be\/[\w-]{11}|youtube-nocookie\.com\/embed\/[\w-]{11}|vimeo\.com\/\d{6,12}|player\.vimeo\.com\/video\/\d{6,12})/i;
  const isValidVideoUrl = (u) => VIDEO_URL_RE.test(String(u || '').trim());
  const VIDEO_HINT = 'Plays right on your listing. Works with YouTube (youtube.com / youtu.be) and Vimeo. Leave blank for none.';

  const markVideoValidity = () => {
    const inp = document.getElementById('lok-service-video-input');
    const hint = document.getElementById('lok-service-video-hint');
    if (!inp) return;
    const v = inp.value.trim();
    const bad = v && !isValidVideoUrl(v);
    inp.style.borderColor = bad ? '#E4739A' : '#E6E4F0';
    if (hint) { hint.style.color = bad ? '#B1006A' : '#8E8BA6'; hint.textContent = bad ? 'Enter a valid YouTube or Vimeo link (or leave blank).' : VIDEO_HINT; }
  };

  const videoHost = () => {
    let host = document.getElementById('lok-service-video');
    if (host) return host;
    // Mount right after the photo gallery (both edit + create call renderGallery
    // first, so the gallery host exists); fall back to the image section.
    const anchorEl = document.getElementById('lok-service-gallery') || el.imgPlaceholder() || el.imgThumb() || el.imgInput();
    if (!anchorEl) return null;
    host = document.createElement('div');
    host.id = 'lok-service-video';
    host.style.cssText = 'margin-top:16px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;white-space:normal;';
    host.innerHTML =
      '<div style="font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:#4A4761;margin-bottom:8px;">Showcase video <span style="font-weight:500;text-transform:none;color:#8E8BA6;">· optional</span></div>' +
      '<input id="lok-service-video-input" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Paste a YouTube or Vimeo link" style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #E6E4F0;border-radius:10px;font-size:14px;font-family:inherit;color:#1A1829;background:#fff;" />' +
      '<div id="lok-service-video-hint" style="font-size:12px;color:#8E8BA6;margin-top:6px;line-height:1.5;">' + VIDEO_HINT + '</div>';
    const parent = anchorEl.parentElement || document.body;
    if (anchorEl.nextSibling) parent.insertBefore(host, anchorEl.nextSibling);
    else parent.appendChild(host);
    const inp = host.querySelector('#lok-service-video-input');
    if (inp) inp.addEventListener('input', markVideoValidity);
    return host;
  };
  const videoInput = () => { videoHost(); return document.getElementById('lok-service-video-input'); };
  const readVideoUrl = () => (videoInput()?.value || '').trim();
  const setVideoUrl = (v) => { const inp = videoInput(); if (inp) inp.value = v || ''; markVideoValidity(); };

  // ---------------------------------------------------------------------------
  // Per-service website link (2026-10-02, F punchlist 4; patch_service_link.sql).
  // Same shape as the product Buy link (#172): the vendor pastes the page about
  // THIS service on their own site; the item page renders a "Visit website"
  // button above Inquire (below Book now when the storefront has one) and the
  // click is logged as lead_events.event_type = 'service_link'. Gated on the
  // client capability so a stale cached client never shows a field whose value
  // would silently drop.
  // ---------------------------------------------------------------------------
  const LINK_URL_RE = /^https:\/\/[^\s"'<>`\\]+$/;
  const LINK_MAXLEN = 500;
  const isValidLinkUrl = (u) => { const s = String(u || '').trim(); return LINK_URL_RE.test(s) && s.length <= LINK_MAXLEN; };
  const LINK_HINT = 'Have a page about this service on your own site (a program page, class schedule or sign-up form)? Paste it and shoppers get a "Visit website" button. Leave blank to keep Inquire only.';
  let _linkUiMounted = false;

  const markLinkValidity = () => {
    const inp = document.getElementById('lok-service-link-input');
    const hint = document.getElementById('lok-service-link-hint');
    if (!inp) return;
    const v = inp.value.trim();
    const bad = v && !isValidLinkUrl(v);
    inp.style.borderColor = bad ? '#E4739A' : '#E6E4F0';
    if (hint) { hint.style.color = bad ? '#B1006A' : '#8E8BA6'; hint.textContent = bad ? 'Enter a full https:// link with no spaces (or leave blank).' : LINK_HINT; }
  };

  const linkHost = () => {
    let host = document.getElementById('lok-service-link');
    if (host) return host;
    if (!window.LokaliSupabaseAPI?.capabilities?.serviceLink) return null;
    const anchorEl = videoHost();
    if (!anchorEl) return null;
    host = document.createElement('div');
    host.id = 'lok-service-link';
    host.style.cssText = 'margin-top:16px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;white-space:normal;';
    host.innerHTML =
      '<div style="font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:#4A4761;margin-bottom:8px;">Website link <span style="font-weight:500;text-transform:none;color:#8E8BA6;">· optional</span></div>' +
      '<input id="lok-service-link-input" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="' + LINK_MAXLEN + '" placeholder="https://www.yoursite.com/this-service" style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #E6E4F0;border-radius:10px;font-size:14px;font-family:inherit;color:#1A1829;background:#fff;" />' +
      '<div id="lok-service-link-hint" style="font-size:12px;color:#8E8BA6;margin-top:6px;line-height:1.5;">' + LINK_HINT + '</div>';
    anchorEl.insertAdjacentElement('afterend', host);
    const inp = host.querySelector('#lok-service-link-input');
    if (inp) inp.addEventListener('input', markLinkValidity);
    _linkUiMounted = true;
    return host;
  };
  const linkInput = () => { linkHost(); return document.getElementById('lok-service-link-input'); };
  const readLinkUrl = () => (linkInput()?.value || '').trim();
  const setLinkUrl = (v) => { const inp = linkInput(); if (inp) inp.value = v || ''; markLinkValidity(); };

  // ---------------------------------------------------------------------------
  // #251 "How shoppers reach you" (F 2026-11-12/13, mockup
  // docs/mockups/inquire-custom-questions-2026-11-12.html in the main repo).
  // One section, drawn by this file and placed by the organiser in
  // lokali-dashboard.js (hosts.reach): a first choice (message me on Lokali /
  // go to my website), then, for the Lokali choice, whether a phone number is
  // asked, up to three of the vendor's own questions (Pro and Featured), a live
  // preview and, under More options, the message hint. The Website link field
  // (#lok-service-link, 2026-10-02) is MOVED in here, never rebuilt, so its
  // input, validator and save path are untouched.
  //
  // Nothing is written unless the vendor changes something here: an existing
  // service keeps cta_mode NULL (= the behaviour before #251) until they pick.
  // The section only appears once service_inquiry_form answers, i.e. after
  // patch_inquiry_questions.sql is applied; before that this block is inert.
  const REACH_STARTERS = [
    { q: 'Event date', t: 'date' },
    { q: 'Preferred day or time', t: 'text' },
    { q: 'Your address or area', t: 'text' },
    { q: 'How did you hear about us?', t: 'text' }
  ];
  const REACH_TYPES = { text: 'Short answer', date: 'Date', pick: 'Pick one' };
  const REACH_ICON = {
    date: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/></svg>',
    pick: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="4" cy="4.5" r="1.6"/><circle cx="4" cy="11.5" r="1.6"/><path d="M8 4.5h6M8 11.5h6"/></svg>',
    text: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6"/></svg>'
  };
  const REACH_CSS = [
    '#lok-service-reach{font-family:"Plus Jakarta Sans",system-ui,sans-serif;white-space:normal;display:flex;flex-direction:column;gap:14px;margin-top:10px;}',
    '#lok-service-reach [hidden]{display:none!important;}',
    '.lok-rc-pick{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
    '.lok-rc-opt{display:flex;gap:10px;align-items:flex-start;text-align:left;padding:12px;border:1.5px solid #E6E4F0;border-radius:12px;background:#fff;cursor:pointer;color:#4A4761;font:500 13px/1.45 "Plus Jakarta Sans",system-ui,sans-serif;}',
    '.lok-rc-opt b{display:block;color:#1A1829;font-size:14.5px;font-weight:700;}',
    '.lok-rc-dot{width:18px;height:18px;border-radius:50%;border:2px solid #DCCBFB;flex:none;margin-top:2px;box-sizing:border-box;}',
    '.lok-rc-opt[aria-pressed="true"]{border-color:#6002EE;background:#FDFCFF;}',
    '.lok-rc-opt[aria-pressed="true"] .lok-rc-dot{border:5px solid #6002EE;}',
    '.lok-rc-note{font-size:13px;color:#6B6880;line-height:1.5;margin:0;}',
    '.lok-rc-note b{color:#1A1829;}',
    '.lok-rc-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px;font-weight:600;color:#1A1829;}',
    '.lok-rc-seg{font:600 13px/1.2 "Plus Jakarta Sans",system-ui,sans-serif;padding:8px 13px;border-radius:999px;border:1px solid #E6E4F0;background:#fff;color:#4A4761;cursor:pointer;}',
    '.lok-rc-seg[aria-pressed="true"]{background:#F3EBFF;border-color:#6002EE;color:#4A1FB8;}',
    '.lok-rc-sub{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4A4761;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
    '.lok-rc-sub span{font-weight:600;text-transform:none;letter-spacing:0;color:#8E8BA6;}',
    '.lok-rc-list{display:flex;flex-direction:column;gap:8px;}',
    '.lok-rc-q{border:1px solid #E6E4F0;border-radius:12px;background:#fff;overflow:hidden;}',
    '.lok-rc-line{display:flex;align-items:center;gap:10px;padding:10px 12px;min-width:0;}',
    '.lok-rc-ic{width:30px;height:30px;border-radius:8px;background:#F3EBFF;color:#4A1FB8;display:inline-flex;align-items:center;justify-content:center;flex:none;}',
    '.lok-rc-ic svg{width:15px;height:15px;}',
    '.lok-rc-tx{min-width:0;flex:1;}',
    '.lok-rc-tx b{display:block;color:#1A1829;font-size:14.5px;font-weight:700;overflow-wrap:anywhere;}',
    '.lok-rc-tx span{font-size:12.5px;color:#8E8BA6;}',
    '.lok-rc-link{font:700 13px/1.2 "Plus Jakarta Sans",system-ui,sans-serif;color:#6002EE;background:none;border:none;padding:6px;cursor:pointer;border-radius:8px;}',
    '.lok-rc-link.quiet{color:#8E8BA6;font-weight:600;}',
    '.lok-rc-edit{border-top:1px solid #E6E4F0;background:#FBFAFE;padding:12px;display:flex;flex-direction:column;gap:10px;}',
    '.lok-rc-f{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#1A1829;min-width:0;}',
    '.lok-rc-f small{font-weight:500;color:#6B6880;}',
    '#lok-service-reach input[type="text"]{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #E6E4F0;border-radius:10px;font:500 14px/1.4 "Plus Jakarta Sans",system-ui,sans-serif;color:#1A1829;background:#fff;margin:0;}',
    '#lok-service-reach input[type="text"].lok-rc-choice{width:120px;padding:6px 10px;font-size:13px;border-radius:999px;}',
    '.lok-rc-wrap{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
    '.lok-rc-add{font:700 14px/1.2 "Plus Jakarta Sans",system-ui,sans-serif;color:#6002EE;background:none;border:1.5px dashed #DCCBFB;border-radius:12px;padding:11px;cursor:pointer;width:100%;}',
    '.lok-rc-starters{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:12px;border:1.5px dashed #DCCBFB;border-radius:12px;}',
    '.lok-rc-lock{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;border:1px solid #DCCBFB;background:#F3EBFF;border-radius:12px;padding:12px 14px;color:#4A1FB8;font-weight:600;font-size:14px;}',
    '.lok-rc-lock a{font:700 13px/1.2 "Plus Jakarta Sans",system-ui,sans-serif;color:#fff;background:#6002EE;border-radius:10px;padding:8px 14px;text-decoration:none;}',
    '.lok-rc-prev{background:#FBFAFE;border:1px dashed #DCCBFB;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;}',
    '.lok-rc-box{background:#fff;border:1px solid #E6E4F0;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;}',
    '.lok-rc-pl{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:#1A1829;font-weight:600;}',
    '.lok-rc-pl span{font-weight:500;color:#8E8BA6;white-space:nowrap;}',
    '.lok-rc-pl em{font-style:normal;font-weight:500;color:#8E8BA6;}',
    '.lok-rc-more{border-top:1px solid #E6E4F0;padding-top:10px;display:flex;flex-direction:column;gap:12px;}',
    '.lok-rc-chk{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#1A1829;cursor:pointer;}',
    '.lok-rc-chk input{width:17px;height:17px;accent-color:#6002EE;margin:0;}',
    '#lok-service-reach button:focus-visible,#lok-service-reach input:focus-visible{outline:2px solid #6002EE;outline-offset:2px;}',
    '#lok-service-reach #lok-service-link{margin-top:0!important;}',
    '@media(max-width:560px){.lok-rc-pick{grid-template-columns:1fr;}}'
  ].join('');

  let _reach = null;          // the open form's state (reachBlank shape)
  let _reachOn = false;       // service_inquiry_form answered: the columns exist
  let _reachProbe = null;     // the one probe promise
  let _reachBook = {};        // vendors_id -> storefront booking link ('' = none)
  const reachBlank = () => ({
    mode: null, modeTouched: false,   // null = never chosen (pre-#251 behaviour)
    phone: 'optional', hint: '', qs: [], touched: false,
    also: false,                      // inquire mode: also show a Visit website link
    open: -1, starters: false, more: false, vid: null
  });
  const reachEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const reachBtn = (cls, text, onClick) => { const b = reachEl('button', cls, text); b.type = 'button'; b.addEventListener('click', onClick); return b; };

  const reachHost = () => {
    let host = document.getElementById('lok-service-reach');
    if (host) return host;
    const form = el.fieldName()?.closest('form');
    if (!form) return null;
    if (!document.getElementById('lok-reach-css')) {
      const st = document.createElement('style'); st.id = 'lok-reach-css'; st.textContent = REACH_CSS;
      document.head.appendChild(st);
    }
    host = document.createElement('div');
    host.id = 'lok-service-reach';
    host.style.display = 'none';          // shown only once the probe passes
    host.setAttribute('data-on', '0');
    form.appendChild(host);
    return host;
  };
  const reachProbe = () => {
    if (_reachProbe) return _reachProbe;
    const api = window.LokaliSupabaseAPI?.inquiries;
    if (!api || typeof api.form !== 'function') return (_reachProbe = Promise.resolve(false));
    _reachProbe = api.form(0).then((res) => !(res && res.error)).catch(() => false)
      .then((ok) => { _reachOn = ok; return ok; });
    return _reachProbe;
  };
  // What the storefront does today when cta_mode was never chosen.
  const reachMode = () => {
    if (!_reach) return 'inquire';
    if (_reach.mode) return _reach.mode;
    return (readLinkUrl() || _reachBook[_reach.vid]) ? 'link' : 'inquire';
  };
  // Clean copy for saving. false = a question is half-written (never saved by
  // a background autosave; the explicit Save names it).
  const reachCleanQs = () => {
    const out = [];
    for (const q of (_reach ? _reach.qs : [])) {
      const text = String(q.q || '').trim().slice(0, 200);
      if (!text) return false;
      const row = { q: text, t: REACH_TYPES[q.t] ? q.t : 'text', req: q.req === true };
      if (row.t === 'pick') {
        const c = [];
        (q.c || []).forEach((ch) => { const v = String(ch || '').trim().slice(0, 60); if (v && c.indexOf(v) < 0 && c.length < 6) c.push(v); });
        if (c.length < 2) return false;
        row.c = c;
      }
      out.push(row);
    }
    return out.slice(0, 3);
  };
  const reachSummary = () => {
    if (reachMode() === 'link') return 'The main button opens your link';
    const n = _isProPlan ? _reach.qs.filter((q) => String(q.q || '').trim()).length : 0;
    return 'Shoppers message you on Lokali' + (n ? ' · ' + n + (n === 1 ? ' question of your own' : ' questions of your own') : '');
  };
  const reachTouch = (host) => {
    // the form's own dirty tracking + card preview listen for input events
    try { host.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
  };

  const reachPaintPreview = () => {
    const box = document.getElementById('lok-rc-preview');
    const host = document.getElementById('lok-service-reach');
    if (host && _reach) { host.setAttribute('data-sum', reachSummary()); host.setAttribute('data-set', (_reach.mode || _reach.qs.length) ? '1' : '0'); }
    if (!box || !_reach) return;
    box.textContent = '';
    const line = (label, note, muted) => { const r = reachEl('div', 'lok-rc-pl'); if (muted) r.appendChild(reachEl('em', '', label)); else r.appendChild(document.createTextNode(label)); if (note) r.appendChild(reachEl('span', '', note)); box.appendChild(r); };
    line('Your name'); line('Email');
    if (_reach.phone !== 'none') line('Phone', _reach.phone === 'required' ? '' : 'optional');
    if (_isProPlan) _reach.qs.forEach((q) => {
      const text = String(q.q || '').trim(); if (!text) return;
      line(text, REACH_TYPES[q.t] + (q.req ? '' : ' · optional'));
    });
    line('Message');
    line(_reach.hint.trim() || 'Hi! I’m interested in...', '', true);
  };

  const reachPaint = () => {
    const host = reachHost();
    if (!host || !_reach) return;
    host.style.display = _reachOn ? '' : 'none';
    host.setAttribute('data-on', _reachOn ? '1' : '0');
    if (!_reachOn) return;
    const mode = reachMode();              // reads the link input: before anything moves
    const link = linkHost();               // may be null (capability off)
    // Keep the link field IN the document across the rebuild (its helpers look it
    // up by id and would build a second one if it were detached): step it out to
    // the host's parent, clear, then place it again below.
    const outside = host.parentElement;
    if (link && outside && host.contains(link)) outside.appendChild(link);
    host.textContent = '';
    const repaint = () => { reachPaint(); reachTouch(host); };

    // 1. the one choice
    const pick = reachEl('div', 'lok-rc-pick'); pick.setAttribute('role', 'group'); pick.setAttribute('aria-label', 'Main button on this service');
    [['inquire', 'They message me on Lokali', 'The main button says Inquire. Requests land in your Leads.'],
     ['link', 'They go to my website', 'The main button opens your link.']].forEach((o) => {
      const b = reachBtn('lok-rc-opt', null, () => { _reach.mode = o[0]; _reach.modeTouched = true; repaint(); });
      b.setAttribute('aria-pressed', mode === o[0] ? 'true' : 'false');
      b.appendChild(reachEl('span', 'lok-rc-dot'));
      const t = reachEl('span'); t.appendChild(reachEl('b', '', o[1])); t.appendChild(document.createTextNode(o[2])); b.appendChild(t);
      pick.appendChild(b);
    });
    host.appendChild(pick);

    if (mode === 'link') {
      if (link) { link.style.display = ''; host.appendChild(link); }
      if (_reachBook[_reach.vid]) host.appendChild(reachEl('p', 'lok-rc-note', 'Leave the link blank and the button opens your storefront booking link.'));
      reachPaintPreview();
      return;
    }

    // 2. always asked + phone
    const always = reachEl('p', 'lok-rc-note'); always.appendChild(document.createTextNode('Every shopper gives their ')); always.appendChild(reachEl('b', '', 'name, email and a message')); always.appendChild(document.createTextNode('. Those three are always required.'));
    host.appendChild(always);
    const ph = reachEl('div', 'lok-rc-row'); ph.setAttribute('role', 'group'); ph.setAttribute('aria-label', 'Phone number');
    ph.appendChild(reachEl('span', '', 'Phone number:'));
    [['none', 'Don’t ask'], ['optional', 'Optional'], ['required', 'Required']].forEach((o) => {
      const b = reachBtn('lok-rc-seg', o[1], () => { _reach.phone = o[0]; _reach.touched = true; repaint(); });
      b.setAttribute('aria-pressed', _reach.phone === o[0] ? 'true' : 'false'); ph.appendChild(b);
    });
    host.appendChild(ph);

    // 3. the vendor's own questions (Pro and Featured)
    if (_isProPlan) {
      const sub = reachEl('div', 'lok-rc-sub', 'Your questions'); sub.appendChild(reachEl('span', '', _reach.qs.length + ' of 3')); host.appendChild(sub);
      const list = reachEl('div', 'lok-rc-list');
      _reach.qs.forEach((q, n) => {
        const row = reachEl('div', 'lok-rc-q'), ln = reachEl('div', 'lok-rc-line');
        const ic = reachEl('span', 'lok-rc-ic'); ic.innerHTML = REACH_ICON[q.t] || REACH_ICON.text; ln.appendChild(ic);
        const tx = reachEl('div', 'lok-rc-tx'); const title = reachEl('b', '', String(q.q || '').trim() || 'New question'); tx.appendChild(title);
        const meta = reachEl('span', '', REACH_TYPES[q.t] + ' · ' + (q.req ? 'required' : 'optional') + (q.t === 'pick' ? ' · ' + (q.c || []).filter((c) => String(c || '').trim()).length + ' choices' : '')); tx.appendChild(meta);
        ln.appendChild(tx);
        ln.appendChild(reachBtn('lok-rc-link', _reach.open === n ? 'Done' : 'Edit', () => { _reach.open = _reach.open === n ? -1 : n; reachPaint(); }));
        ln.appendChild(reachBtn('lok-rc-link quiet', 'Remove', () => { _reach.qs.splice(n, 1); _reach.open = -1; _reach.touched = true; repaint(); }));
        row.appendChild(ln);
        if (_reach.open === n) {
          const ed = reachEl('div', 'lok-rc-edit');
          const f = reachEl('label', 'lok-rc-f', 'Question'); f.setAttribute('for', 'lok-rc-qtext');
          const inp = reachEl('input'); inp.type = 'text'; inp.id = 'lok-rc-qtext'; inp.maxLength = 200; inp.value = q.q || ''; inp.placeholder = 'What do you want to ask?';
          inp.addEventListener('input', () => { q.q = inp.value; _reach.touched = true; title.textContent = inp.value.trim() || 'New question'; reachPaintPreview(); });
          f.appendChild(inp); ed.appendChild(f);
          const types = reachEl('div', 'lok-rc-wrap'); types.setAttribute('role', 'group'); types.setAttribute('aria-label', 'Answer type');
          ['text', 'date', 'pick'].forEach((t) => {
            const b = reachBtn('lok-rc-seg', REACH_TYPES[t], () => { q.t = t; if (t === 'pick' && (!q.c || q.c.length < 2)) q.c = ['Yes', 'No']; _reach.touched = true; repaint(); });
            b.setAttribute('aria-pressed', q.t === t ? 'true' : 'false'); types.appendChild(b);
          });
          ed.appendChild(types);
          if (q.t === 'pick') {
            const cs = reachEl('div', 'lok-rc-wrap'); cs.appendChild(reachEl('span', 'lok-rc-note', 'Your choices:'));
            (q.c || []).forEach((ch, k) => {
              const ci = reachEl('input', 'lok-rc-choice'); ci.type = 'text'; ci.maxLength = 60; ci.value = ch || ''; ci.setAttribute('aria-label', 'Choice ' + (k + 1));
              ci.addEventListener('input', () => { q.c[k] = ci.value; _reach.touched = true; reachPaintPreview(); });
              cs.appendChild(ci);
            });
            if ((q.c || []).length < 6) cs.appendChild(reachBtn('lok-rc-link', '+ Add a choice', () => { q.c.push(''); _reach.touched = true; reachPaint(); }));
            ed.appendChild(cs);
          }
          const rq = reachEl('label', 'lok-rc-chk'); const cb = reachEl('input'); cb.type = 'checkbox'; cb.checked = q.req === true;
          cb.addEventListener('change', () => { q.req = cb.checked; _reach.touched = true; repaint(); });
          rq.appendChild(cb); rq.appendChild(document.createTextNode('Shoppers must answer this')); ed.appendChild(rq);
          row.appendChild(ed);
        }
        list.appendChild(row);
      });
      host.appendChild(list);
      if (_reach.qs.length < 3) {
        if (_reach.starters) {
          const st = reachEl('div', 'lok-rc-starters'); st.appendChild(reachEl('span', 'lok-rc-note', 'Start from one of these, or write your own:'));
          const add = (s) => { _reach.qs.push({ q: s.q, t: s.t, req: false, c: [] }); _reach.open = s.q ? -1 : _reach.qs.length - 1; _reach.starters = false; _reach.touched = true; repaint(); };
          REACH_STARTERS.forEach((s) => st.appendChild(reachBtn('lok-rc-seg', s.q, () => add(s))));
          st.appendChild(reachBtn('lok-rc-seg', 'Write your own', () => add({ q: '', t: 'text' })));
          host.appendChild(st);
        } else {
          host.appendChild(reachBtn('lok-rc-add', '+ Add a question', () => { _reach.starters = true; reachPaint(); }));
        }
      }
    } else {
      const lock = reachEl('div', 'lok-rc-lock'); lock.appendChild(reachEl('span', '', 'Ask shoppers your own questions. Unlocks with Pro.'));
      const a = reachEl('a', '', 'See plans'); a.href = '/pricing'; lock.appendChild(a); host.appendChild(lock);
    }

    // 4. what shoppers see
    const prev = reachEl('div', 'lok-rc-prev'); const psub = reachEl('div', 'lok-rc-sub', 'What shoppers see'); psub.appendChild(reachEl('span', '', 'updates as you edit')); prev.appendChild(psub);
    const box = reachEl('div', 'lok-rc-box'); box.id = 'lok-rc-preview'; prev.appendChild(box); host.appendChild(prev);

    // 5. more options
    const more = reachEl('div', 'lok-rc-more');
    const mb = reachBtn('lok-rc-link', _reach.more ? 'Fewer options' : 'More options', () => { _reach.more = !_reach.more; reachPaint(); }); mb.style.cssText = 'align-self:flex-start;padding-left:0;';
    more.appendChild(mb);
    if (_reach.more) {
      const hf = reachEl('label', 'lok-rc-f', 'Hint inside the message box '); hf.setAttribute('for', 'lok-rc-hint'); hf.appendChild(reachEl('small', '', 'Tell shoppers what to write'));
      const hi = reachEl('input'); hi.type = 'text'; hi.id = 'lok-rc-hint'; hi.maxLength = 200; hi.value = _reach.hint; hi.placeholder = 'For example: Tell me a little about what you need';
      hi.addEventListener('input', () => { _reach.hint = hi.value; _reach.touched = true; reachPaintPreview(); });
      hf.appendChild(hi); more.appendChild(hf);
      if (link) {
        const al = reachEl('label', 'lok-rc-chk'); const ac = reachEl('input'); ac.type = 'checkbox'; ac.checked = _reach.also;
        ac.addEventListener('change', () => { _reach.also = ac.checked; if (!ac.checked) setLinkUrl(''); repaint(); });
        al.appendChild(ac); al.appendChild(document.createTextNode('Also show a "Visit website" link under Inquire')); more.appendChild(al);
        if (_reach.also) { link.style.display = ''; more.appendChild(link); }
      }
    }
    host.appendChild(more);
    // not shown in this state: park it, hidden, inside the section (still in the document for its save path)
    if (link && !host.contains(link)) { const park = reachEl('div'); park.hidden = true; park.appendChild(link); host.appendChild(park); }
    reachPaintPreview();
  };

  // service = the row being edited, or null for a new service.
  const setReach = (service) => {
    _reach = reachBlank();
    if (service) {
      _reach.mode = service.cta_mode === 'inquire' || service.cta_mode === 'link' ? service.cta_mode : null;
      _reach.phone = service.inquiry_phone === 'none' || service.inquiry_phone === 'required' ? service.inquiry_phone : 'optional';
      _reach.hint = typeof service.inquiry_hint === 'string' ? service.inquiry_hint : '';
      _reach.qs = (Array.isArray(service.inquiry_questions) ? service.inquiry_questions : []).slice(0, 3).map((q) => ({
        q: typeof q?.q === 'string' ? q.q : '', t: REACH_TYPES[q?.t] ? q.t : 'text', req: q?.req === true,
        c: Array.isArray(q?.c) ? q.c.filter((c) => typeof c === 'string').slice(0, 6) : []
      }));
      _reach.also = !!service.link_url;
      _reach.more = !!_reach.hint;
    }
    _reach.vid = service?.vendors_id ?? services[0]?.vendors_id ?? null;
    const mine = _reach;
    reachProbe().then((ok) => {
      if (_reach !== mine) return;         // another service was opened meanwhile
      reachPaint();
      // the storefront booking link decides what "never chosen" looks like today
      const vid = mine.vid, av = window.LokaliSupabaseAPI?.availability;
      if (!ok || vid == null || _reachBook[vid] != null || !av || typeof av.bookingLink !== 'function') return;
      av.bookingLink(vid).then((res) => {
        _reachBook[vid] = (res && !res.error && typeof res.data === 'string') ? res.data : '';
        if (_reach === mine && _reachBook[vid]) reachPaint();
      }).catch(() => {});
    });
  };
  // Adds only what the vendor changed in this section.
  const reachPayload = (payload) => {
    if (!_reachOn || !_reach) return;
    if (_reach.modeTouched && _reach.mode) payload.cta_mode = _reach.mode;
    if (!_reach.touched) return;
    payload.inquiry_phone = _reach.phone;
    payload.inquiry_hint = _reach.hint.trim() ? _reach.hint.trim().slice(0, 200) : null;
    if (_isProPlan) {
      const qs = reachCleanQs();
      if (qs !== false) payload.inquiry_questions = qs.length ? qs : null;
    }
  };
  const reachProblem = () => {
    if (!_reachOn || !_reach) return null;
    if (_isProPlan && _reach.touched && reachCleanQs() === false)
      return 'Finish or remove the question you started under "How shoppers reach you". A "Pick one" question needs at least two choices.';
    if (_reach.modeTouched && _reach.mode === 'link' && !readLinkUrl() && !_reachBook[_reach.vid])
      return 'Add your link under "How shoppers reach you", or choose "They message me on Lokali".';
    return null;
  };

  // ---------------------------------------------------------------------------
  // Per-service photo gallery (Pro & Featured). Self-mounting — no Webflow edits.
  // Photos attach to a saved service id, so the gallery only enables in edit mode.
  // ---------------------------------------------------------------------------
  let _galleryBusy = false;
  let _galleryPhotos = [];
  // Add-mode staging: photos uploaded to storage but not yet attached (a brand-new
  // service has no id until it's saved). On Save the service is created, then each
  // of these is attached to its id — so vendors add photos while creating an item
  // exactly like when editing, with no "save first, then reopen" step.
  let _pendingGalleryPhotos = [];
  // #136: labels suggested while CREATING this service. There is no service id
  // yet at suggest time, so the suggestion row is stored with none — and
  // approval then has nothing to tag. Held here until the save gives us an id.
  let _pendingSubcatLabels = [];

  const photoUrl = (u) => {
    if (!u) return '';
    const s = String(u).trim();
    // This value is interpolated into innerHTML below — block javascript:/data:
    // schemes, protocol-relative //host, and chars that break out of the src="".
    if (!s || /[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s;
    if (s.indexOf('//') === 0) return '';
    // A leading-slash relative path is a legacy Xano-era upload that can no
    // longer resolve (XANO-DECOMM 2026-07-24) — show nothing rather than a
    // broken-host URL. Live rows store full Supabase/CDN URLs (handled above).
    if (s.indexOf('/') === 0) return '';
    return s;
  };

  const galleryHost = () => {
    let host = document.getElementById('lok-service-gallery');
    if (host) return host;
    const anchorEl = el.imgPlaceholder() || el.imgThumb() || el.imgInput();
    if (!anchorEl) return null;
    // Mount the gallery right after the "Service image" section so Photos lead the
    // form. That section sits ABOVE the form grid, so the host never becomes a grid
    // item (which would break field placement). Fall back to after the grid.
    let wrap = anchorEl;
    while (wrap && !/service image/i.test(wrap.textContent || '')) wrap = wrap.parentElement;
    if (!wrap) wrap = anchorEl.closest('.w-layout-grid') || anchorEl.closest('[class*="grid"]') ||
      anchorEl.closest('.w-form, .form-field, [class*="image"], [class*="upload"]') || anchorEl.parentElement;
    host = document.createElement('div');
    // white-space:normal is load-bearing: the dashboard container
    // (.container-11) sets white-space:nowrap page-wide. Native Webflow
    // blocks carry their own styles, but injected divs INHERIT it — the
    // free-plan gallery hint rendered as one long unwrapped line and
    // .form-view's overflow:hidden clipped it mid-sentence (vendor
    // onboarding, 2026-08-18). Same guard on the video host above.
    host.id = 'lok-service-gallery';
    host.style.cssText = 'margin-top:16px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;white-space:normal;';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.id = 'lok-service-gallery-input';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', onGalleryFile);
    host.appendChild(fileInput);
    const body = document.createElement('div');
    body.id = 'lok-service-gallery-body';
    host.appendChild(body);
    if (wrap && wrap.parentElement) wrap.parentElement.insertBefore(host, wrap.nextSibling);
    else (anchorEl.parentElement || document.body).appendChild(host);
    return host;
  };

  const galleryInput = () => document.getElementById('lok-service-gallery-input');

  const renderGallery = async (serviceId) => {
    const host = galleryHost();
    if (!host) return;
    const body = document.getElementById('lok-service-gallery-body');
    if (!body) return;

    // the organised form already titles this section; the inline heading is for the un-organised layout
    const title = (window.LokaliListingUI && window.LokaliListingUI.organize ? '' : '<div style="font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:#4A4761;margin-bottom:8px;">Photos</div>') +
      '<a href="/vendor-resources/service-photo-guide" target="_blank" rel="noopener" ' +
      'style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#6002ee;text-decoration:none;margin:-2px 0 12px;">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;"><circle cx="12" cy="12" r="9" stroke="#6002ee" stroke-width="2"/><path d="M12 11v5M12 8h.01" stroke="#6002ee" stroke-width="2" stroke-linecap="round"/></svg>' +
      'Photo size &amp; tips guide</a>';

    // Locked: plan allows a single photo per listing (no plan does since 2026-09-20)
    if (!_hasGallery) {
      body.innerHTML = title +
        '<div style="color:#4A4761;font-size:14px;line-height:1.5;">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true" focusable="false" style="width:1em;height:1em;vertical-align:-.125em;flex-shrink:0;"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg> Add a <strong>photo gallery</strong> with Pro &amp; Featured: 5 photos per' +
        ' service on Pro, 10 on Featured, so customers see your work before they call.</div>';
      // #149: Free vendors still have a card crop to control (their standalone
      // image). Same WYSIWYG preview; drag persists on release in edit mode.
      _coverViews = [];
      renderCoverPreview(body, _mainImageUrl, true);
      return;
    }
    // New service (no id yet): stage photos in the browser — they attach to the
    // service on Save, so vendors add photos while creating, not after.
    if (serviceId == null) {
      renderPendingGallery(body, title);
      return;
    }

    body.innerHTML = title + '<div style="font-size:13px;color:#8E8BA6;">Loading photos…</div>';
    const res = await window.LokaliAPI.services.listPhotos(serviceId);
    if (res.error) {
      body.innerHTML = title + '<div style="font-size:13px;color:#B1006A;">Couldn’t load gallery photos.</div>';
      return;
    }
    const raw = res.data;
    _galleryPhotos = (Array.isArray(raw) ? raw : (raw?.items || raw?.records || raw?.data || []))
      .filter(p => p && p.is_active !== false)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    // Legacy cover (2026-09-22): a listing made while its plan allowed ONE photo has
    // its photo as the standalone image_url and no gallery row. Register that photo
    // as gallery photo 1 before anything else happens, so a newly added photo sits
    // BESIDE it instead of replacing it (syncCoverFromGallery makes photo 1 the cover).
    if (editingId !== serviceId) return; // a slower response for another item must not land here
    if (!_galleryPhotos.length && !_skipLegacySeed) {
      const legacy = _mainImageUrl || (services.find(x => x.id === serviceId) || {}).image_url || null;
      if (legacy && /^https:\/\//.test(legacy)) {
        const seeded = await window.LokaliAPI.services.addPhoto(serviceId, legacy, 0);
        if (seeded && !seeded.error && seeded.data) _galleryPhotos = [Object.assign({ image_url: legacy, sort_order: 0 }, seeded.data)];
      }
    }

    const cap = _maxServicePhotos || 1;
    const count = _galleryPhotos.length;

    let html = title +
      '<div style="font-size:12px;color:#8E8BA6;margin-bottom:8px;">' + count + ' of ' + cap + ' photos · the first photo is your cover. Drag it to choose what stays in view' +
      (count > 1 ? ' · use ‹ › to reorder' : '') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;">';

    const arrowStyle = 'position:absolute;bottom:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(26,24,41,.72);color:#fff;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;';
    _galleryPhotos.forEach((p, i) => {
      html += '<div style="position:relative;width:84px;height:84px;border-radius:10px;overflow:hidden;border:1px solid #eeedf6;background:#F7F6FC;">' +
        '<img data-photo-idx="' + i + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">' +
        '<button type="button" data-photo-id="' + p.id + '" aria-label="Remove photo" ' +
        'style="position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(26,24,41,.72);color:#fff;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>' +
        (i > 0 ? '<button type="button" data-move-id="' + p.id + '" data-move-dir="-1" aria-label="Move photo earlier" style="' + arrowStyle + 'left:4px;">‹</button>' : '') +
        (i < count - 1 ? '<button type="button" data-move-id="' + p.id + '" data-move-dir="1" aria-label="Move photo later" style="' + arrowStyle + 'right:4px;bottom:4px;top:auto;">›</button>' : '') +
        '</div>';
    });

    if (count < cap) {
      html += '<button type="button" id="lok-gallery-add" ' +
        'style="width:84px;height:84px;border-radius:10px;border:1.5px dashed #6002ee;background:#fff;color:#6002ee;font-size:28px;font-weight:300;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>';
    }
    html += '</div>';
    if (count >= cap) {
      html += '<div style="font-size:12px;color:#8E8BA6;margin-top:8px;">You’ve reached your ' + cap + '-photo limit for this service.</div>';
    }
    body.innerHTML = html;
    // Set image src via property (never interpolate the uploaded URL into an
    // attribute string) so a crafted image_url can't inject markup.
    body.querySelectorAll('img[data-photo-idx]').forEach((im) => {
      const gp = _galleryPhotos[parseInt(im.getAttribute('data-photo-idx'), 10)];
      if (gp) im.src = photoUrl(gp.image_url);
    });
    // #149: Pro/Featured never see the standalone image section (the gallery's
    // first photo IS the cover), so the focal-point drag lives on the COVER
    // THUMB here. It writes the LISTING's image_focus — the value the public
    // cards read. Other thumbs stay non-draggable: no public surface crops
    // per-gallery-photo today, and a drag that changes nothing teaches vendors
    // the feature is broken.
    _coverViews = [];
    wireCoverFocusDrag(body.querySelector('img[data-photo-idx="0"]'), true);
    renderCoverPreview(body, _galleryPhotos.length ? photoUrl(_galleryPhotos[0].image_url) : null, true);

    const addBtn = document.getElementById('lok-gallery-add');
    if (addBtn) addBtn.addEventListener('click', () => { const gi = galleryInput(); if (gi) gi.click(); });
    body.querySelectorAll('button[data-photo-id]').forEach((b) => {
      b.addEventListener('click', () => deleteGalleryPhoto(b.getAttribute('data-photo-id')));
    });
    body.querySelectorAll('button[data-move-id]').forEach((b) => {
      b.addEventListener('click', () => moveGalleryPhoto(b.getAttribute('data-move-id'), parseInt(b.getAttribute('data-move-dir'), 10)));
    });
  };

  // Add-mode gallery: renders the staged (not-yet-attached) photos. Add uploads to
  // storage and pushes here; remove/reorder are local array ops; the first photo is
  // the cover. All of these attach to the service on Save (see handleSave).
  const renderPendingGallery = (body, title) => {
    const cap = _maxServicePhotos || 1;
    const count = _pendingGalleryPhotos.length;
    const arrowStyle = 'position:absolute;bottom:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(26,24,41,.72);color:#fff;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;';
    let html = title +
      '<div style="font-size:12px;color:#8E8BA6;margin-bottom:8px;">' + count + ' of ' + cap + ' photos · the first photo is your cover. Drag it to choose what stays in view' +
      (count > 1 ? ' · use ‹ › to reorder' : '') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;">';
    _pendingGalleryPhotos.forEach((p, i) => {
      html += '<div style="position:relative;width:84px;height:84px;border-radius:10px;overflow:hidden;border:1px solid #eeedf6;background:#F7F6FC;">' +
        '<img data-pending-idx="' + i + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">' +
        '<button type="button" data-pending-remove="' + i + '" aria-label="Remove photo" ' +
        'style="position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(26,24,41,.72);color:#fff;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>' +
        (i > 0 ? '<button type="button" data-pending-move="' + i + '" data-move-dir="-1" aria-label="Move photo earlier" style="' + arrowStyle + 'left:4px;">‹</button>' : '') +
        (i < count - 1 ? '<button type="button" data-pending-move="' + i + '" data-move-dir="1" aria-label="Move photo later" style="' + arrowStyle + 'right:4px;bottom:4px;top:auto;">›</button>' : '') +
        '</div>';
    });
    if (count < cap) {
      html += '<button type="button" id="lok-gallery-add" ' +
        'style="width:84px;height:84px;border-radius:10px;border:1.5px dashed #6002ee;background:#fff;color:#6002ee;font-size:28px;font-weight:300;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>';
    }
    html += '</div>';
    html += '<div style="font-size:12px;color:#8E8BA6;margin-top:8px;">' +
      (count ? 'These photos are added to your service when you hit Save.' : 'Add up to ' + cap + ' photos. They’re saved with your service.') + '</div>';
    body.innerHTML = html;
    _coverViews = [];
    wireCoverFocusDrag(body.querySelector('img[data-pending-idx="0"]'), false);
    renderCoverPreview(body, _pendingGalleryPhotos.length ? _pendingGalleryPhotos[0].url : null, false);
    body.querySelectorAll('img[data-pending-idx]').forEach((im) => {
      const gp = _pendingGalleryPhotos[parseInt(im.getAttribute('data-pending-idx'), 10)];
      if (gp) im.src = photoUrl(gp.url);
    });
    const addBtn = document.getElementById('lok-gallery-add');
    if (addBtn) addBtn.addEventListener('click', () => { const gi = galleryInput(); if (gi) gi.click(); });
    body.querySelectorAll('button[data-pending-remove]').forEach((b) => {
      b.addEventListener('click', () => {
        _pendingGalleryPhotos.splice(parseInt(b.getAttribute('data-pending-remove'), 10), 1);
        renderGallery(null);
      });
    });
    body.querySelectorAll('button[data-pending-move]').forEach((b) => {
      b.addEventListener('click', () => {
        const i = parseInt(b.getAttribute('data-pending-move'), 10);
        const dir = parseInt(b.getAttribute('data-move-dir'), 10);
        const j = i + dir;
        if (j < 0 || j >= _pendingGalleryPhotos.length) return;
        const [m] = _pendingGalleryPhotos.splice(i, 1);
        _pendingGalleryPhotos.splice(j, 0, m);
        renderGallery(null);
      });
    });
  };

  const moveGalleryPhoto = async (photoId, dir) => {
    if (_galleryBusy || !editingId) return;
    const i = _galleryPhotos.findIndex((p) => String(p.id) === String(photoId));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= _galleryPhotos.length) return;
    _galleryBusy = true;
    const reordered = [..._galleryPhotos];
    const [moved] = reordered.splice(i, 1);
    reordered.splice(j, 0, moved);
    try {
      const updates = reordered
        .map((p, idx) => ({ p, idx }))
        .filter(({ p, idx }) => p.sort_order !== idx)
        .map(({ p, idx }) => window.LokaliAPI.services.updatePhoto(p.id, { sort_order: idx }));
      const results = await Promise.all(updates);
      const failed = results.find((r) => r && r.error);
      if (failed) alert('Could not reorder photos: ' + failed.error);
    } catch (e) {
      alert('Could not reorder photos. Please try again.');
    } finally {
      _galleryBusy = false;
      await renderGallery(editingId);
      await syncCoverFromGallery();
    }
  };

  const onGalleryFile = async () => {
    const gi = galleryInput();
    const file = gi?.files?.[0];
    if (!file || _galleryBusy) { if (gi) gi.value = ''; return; }
    if (file.type.indexOf('image/') !== 0) { if (gi) gi.value = ''; return; }

    // Add mode (no service id yet): upload to storage and stage locally — the
    // photo attaches to the service on Save. No addPhoto call (nothing to attach to).
    if (!editingId) {
      const cap = _maxServicePhotos || 1;
      if (_pendingGalleryPhotos.length >= cap) { if (gi) gi.value = ''; return; }
      _galleryBusy = true;
      const addBtn0 = document.getElementById('lok-gallery-add');
      if (addBtn0) { addBtn0.textContent = '…'; addBtn0.style.pointerEvents = 'none'; }
      try {
        const up = await window.LokaliAPI.services.uploadServiceImage(file);
        if (up.error) throw new Error(up.error);
        const pp = up.data?.path || up.data?.image_path || null;
        const purl = up.data?.url || up.data?.image_url || null;
        if (!purl) throw new Error('Upload returned no URL');
        _pendingGalleryPhotos.push({ url: purl });
      } catch (e) {
        alert('Photo upload failed. Please try again.');
      } finally {
        _galleryBusy = false;
        if (gi) gi.value = '';
        renderGallery(null);
      }
      return;
    }

    _galleryBusy = true;
    const addBtn = document.getElementById('lok-gallery-add');
    if (addBtn) { addBtn.textContent = '…'; addBtn.style.pointerEvents = 'none'; }
    try {
      const up = await window.LokaliAPI.services.uploadServiceImage(file);
      if (up.error) throw new Error(up.error);
      const p = up.data?.path || up.data?.image_path || null;
      const url = up.data?.url || up.data?.image_url || null;
      if (!url) throw new Error('Upload returned no URL');
      const sort = _galleryPhotos.length;
      const res = await window.LokaliAPI.services.addPhoto(editingId, url, sort);
      if (res.error) {
        if (res.data?.error_code === 'SERVICE_PHOTO_LIMIT_REACHED' || /PHOTO_LIMIT/i.test(String(res.error))) {
          alert('You’ve reached the photo limit for this service on your current plan.');
        } else {
          alert('Could not add photo: ' + res.error);
        }
      }
    } catch (e) {
      alert('Photo upload failed. Please try again.');
    } finally {
      _galleryBusy = false;
      if (gi) gi.value = '';
      await renderGallery(editingId);
      await syncCoverFromGallery();
    }
  };

  const deleteGalleryPhoto = async (photoId) => {
    if (!photoId || _galleryBusy) return;
    if (!confirm('Remove this photo from the gallery?')) return;
    _galleryBusy = true;
    try {
      const res = await window.LokaliAPI.services.deletePhoto(photoId);
      if (res.error) alert('Could not remove photo: ' + res.error);
    } catch (e) {
      alert('Could not remove photo. Please try again.');
    } finally {
      _galleryBusy = false;
      // Removing the LAST photo must not re-seed it from the old cover.
      _skipLegacySeed = true; _mainImageUrl = null;
      try { await renderGallery(editingId); } finally { _skipLegacySeed = false; }
      await syncCoverFromGallery();
    }
  };

  // After a user gallery action, the first photo becomes the cover. Persist it
  // immediately so the card/listing thumbnail updates without waiting for Save,
  // reusing the SAME full payload Save sends (the legacy API's PATCH required all fields,
  // and this matches existing save behavior — no field is dropped). Only runs
  // after add/delete/reorder, never on initial open, so a legacy cover is safe.
  const syncCoverFromGallery = async () => {
    if (!_hasGallery || !editingId) return;
    const svc = services.find(s => s.id === editingId);
    const desired = _galleryPhotos.length ? _galleryPhotos[0].image_url : null;
    if (svc && svc.image_url === desired) return;
    // #149: a DIFFERENT photo is becoming the cover — the old focal point was
    // chosen for the old photo, so reset to centered. buildPayload() below
    // reads _imgFocus, so the null rides the same autosave write.
    _imgFocus = null;
    const payload = buildPayload(desired);
    // Same checks as the Save button: a form Save would block (cleared price,
    // bad range) must not be committed live by a photo action. The photo
    // change stays local; the explicit Save persists it once the form is fixed.
    var invalid = validate(payload);
    if (invalid) { showError(invalid); return; }
    // #96-LISTING: the cover autosave must never commit a Specialty the vendor
    // is still deciding on (or revert one from a stale local row) — only the
    // explicit Save persists the tag.
    delete payload.subcategory;
    delete payload.lead_time;   // #78: same reason — only explicit Save persists it
    const res = await window.LokaliAPI.services.update(editingId, payload);
    if (res && !res.error && svc) svc.image_url = desired;
  };

  const buildPayload = (imageUrl) => {
    const priceType = readPriceTypeFromSelect();

    const payload = {
      service_name:        el.fieldName()?.value.trim(),
      service_description: el.fieldDescription()?.value.trim() || null,
      category_id:         parseInt(el.fieldCategory()?.value) || null,
      price_type:          priceType,
      duration_minutes:    parseInt(el.fieldDuration()?.value) || null,
      remote:              el.fieldRemote()?.checked || false,
      is_active:           el.fieldIsActive()?.checked !== false,
      price_note:          readPriceNoteForSave(),
      price_cents:         null,
      price_min_cents:     null,
      price_max_cents:     null,
      image_url:           imageUrl,
      image_focus_x:       _imgFocus ? _imgFocus.x : null,   // #149
      image_focus_y:       _imgFocus ? _imgFocus.y : null,
      sort_order:          null,
    };

    if (!editingId) {
      payload.sort_order = topServiceSortOrder(); // #94: new items on TOP
    } else {
      const ex = services.find(s => s.id === editingId);
      const so = ex != null ? ex.sort_order : null;
      payload.sort_order = so != null && !isNaN(Number(so)) ? Number(so) : nextServiceSortOrder();
    }

    switch (priceType) {
      case 'fixed':
        payload.price_cents = centsFromDollars(el.fieldPrice()?.value);
        break;
      case 'starting_at': {
        const startEl = el.fieldPriceStarting() || el.fieldPrice();
        payload.price_min_cents = centsFromDollars(startEl?.value);
        break;
      }
      case 'range':
        payload.price_min_cents = centsFromDollars(el.fieldPriceMin()?.value);
        payload.price_max_cents = centsFromDollars(el.fieldPriceMax()?.value);
        break;
      case 'quote':

        break;
    }

    // Showcase video: '' clears it, a valid URL sets it. Omit an invalid-but-nonempty
    // value so background autosaves don't fail — the explicit Save blocks it via validate().
    const vurl = readVideoUrl();
    if (vurl === '' || isValidVideoUrl(vurl)) payload.video_url = vurl;
    // 2026-10-02 website link: '' clears (sent as NULL: the SQL shape check
    // rejects an empty string), a valid https link sets it, an invalid one is
    // omitted so background autosaves never fail; explicit Save blocks it.
    if (_linkUiMounted) {
      const lurl = readLinkUrl();
      if (lurl === '') payload.link_url = null;
      else if (isValidLinkUrl(lurl)) payload.link_url = lurl;
    }

    // #96-LISTING — only when the selector actually mounted; otherwise the key
    // is omitted entirely and the saved value is left alone (a taxonomy-fetch
    // failure must never silently clear a tag).
    if (_subcatUiMounted) payload.subcategory = _selectedSubcat;
    // #78: only send the key once the box is really on the page, so a form that
    // never mounted it can't null out a saved lead time.
    if (_leadUiMounted) payload.lead_time = _leadTime;
    reachPayload(payload); // #251: only the keys the vendor changed, only once the columns exist

    return payload;
  };

  const validate = (payload) => {
    if (!payload.service_name)  return 'Please enter a service name.';
    if (!payload.price_type)    return 'Please select a price type.';
    if (readVideoUrl() && !isValidVideoUrl(readVideoUrl()))
      return 'Your video link must be a YouTube or Vimeo URL (or leave it blank).';
    if (readLinkUrl() && !isValidLinkUrl(readLinkUrl()))
      return 'Your website link must be a full https:// address with no spaces (or leave it blank).';
    const reachErr = reachProblem(); // #251
    if (reachErr) return reachErr;

    if (payload.price_type === 'free' && !freeSupported())
      return 'Free services are not available yet. Please refresh the page and try again.';
    if (payload.price_type === 'fixed' && !payload.price_cents)
      return 'Please enter a price.';
    if (payload.price_type === 'starting_at' && !payload.price_min_cents)
      return 'Please enter a starting price.';
    if (payload.price_type === 'range') {
      if (!payload.price_min_cents || !payload.price_max_cents)
        return 'Please enter both min and max prices.';
      if (payload.price_min_cents >= payload.price_max_cents)
        return 'Max price must be greater than min price.';
    }

    return null;
  };

  // #142: deterministic save-button content — Font Awesome Free floppy-disk
  // (CC BY 4.0) inline SVG + Plus Jakarta Sans ALL-CAPS label. Painted at
  // init AND from handleSave's finally: the "Saving…" swap wipes the button's
  // children, so the old static <img> icon never survived the first save.
  const SAVE_ICON_SVG =
    '<svg viewBox="0 0 448 512" aria-hidden="true" style="width:15px;height:15px;fill:currentColor;display:block;flex:0 0 auto;">' +
    '<path d="M64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V173.3c0-17-6.7-33.3-18.7-45.3L352 50.7C340 38.7 323.7 32 306.7 32H64zm0 96c0-17.7 14.3-32 32-32H288c17.7 0 32 14.3 32 32v64c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V128zM224 288a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>';
  const paintSaveBtn = (btn) => {
    if (!btn) return;
    btn.innerHTML = SAVE_ICON_SVG + '<span style="text-transform:uppercase;letter-spacing:.05em;">Save</span>';
    btn.style.fontFamily = "'Plus Jakarta Sans',system-ui,sans-serif";
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '8px';
  };

  const handleSave = async () => {
    if (saveInProgress) return;
    saveInProgress = true;
    clearError();

    const saveBtn = el.saveBtn();
    if (saveBtn) {
      const cs = window.getComputedStyle(saveBtn);
      saveBtn.style.fontSize = cs.fontSize;
      saveBtn.style.fontWeight = cs.fontWeight;
      saveBtn.style.fontFamily = cs.fontFamily;
      saveBtn.style.lineHeight = cs.lineHeight;
      saveBtn.style.letterSpacing = cs.letterSpacing;
      saveBtn.setAttribute('aria-busy', 'true');
      saveBtn.textContent = 'Saving\u2026';
      saveBtn.style.pointerEvents = 'none';
      saveBtn.style.cursor = 'wait';
      saveBtn.style.backgroundColor = '#D4BFF9';
    }

    try {

      let imageUrl;

      // Validate the typed fields FIRST: a failed save must not upload a photo
      // (Zoom Drain 2026-11-06 left two orphaned storage objects this way).
      // validate() never reads image_url, so a null cover is fine here.
      const preError = validate(buildPayload(null));
      if (preError) {
        showError(preError);
        return;
      }

      const imgFile = el.imgInput()?.files?.[0];

      if (imgFile) {

        const uploadRes = await window.LokaliAPI.services.uploadServiceImage(imgFile);
        if (uploadRes.error) throw new Error('Image upload failed: ' + uploadRes.error);
        // Supabase storage returns a full public URL; the old Xano path-concat
        // fallback is gone (XANO-DECOMM 2026-07-24).
        imageUrl = uploadRes.data?.url || uploadRes.data?.image_url || null;
      } else if (imageRemoved) {

        imageUrl = null;
      } else if (editingId) {

        const existing = services.find(s => s.id === editingId);
        imageUrl = existing?.image_url ?? null;
      } else {

        imageUrl = null;
      }

      // Unified photos (Pro/Featured): the gallery is the cover source — the first
      // photo becomes the card/listing thumbnail. The standalone image field is hidden.
      // Edit mode reads the attached gallery; add mode reads ONLY the staged photos
      // (gated on editingId since 2026-09-01 — the attached list belongs to the
      // last-edited item and must never become a NEW item's cover).
      if (_hasGallery) {
        if (editingId && Array.isArray(_galleryPhotos) && _galleryPhotos.length) {
          imageUrl = _galleryPhotos[0].image_url || imageUrl;
        } else if (!editingId && _pendingGalleryPhotos.length) {
          imageUrl = _pendingGalleryPhotos[0].url || imageUrl;
        }
      }

      const payload = buildPayload(imageUrl);
      const validationError = validate(payload);
      if (validationError) {
        showError(validationError);
        return;
      }

      let result;
      if (editingId) {
        result = await window.LokaliAPI.services.update(editingId, payload);
      } else {
        result = await window.LokaliAPI.services.create(payload);
      }

      if (result.error) {

        if (result.data?.error_code === 'SERVICE_LIMIT_REACHED') {
          throw new Error('You\'ve reached your service limit. Upgrade your plan to add more.');
        }
        throw new Error(result.error);
      }

      // Add-mode staging: the service now exists, so everything we staged while
      // it had no id gets attached to it here.
      const newId = editingId ? null
        : (result.data?.id ?? result.data?.service?.id
           ?? (Array.isArray(result.data?.records) ? result.data.records[0]?.id : null) ?? null);

      // Photos. First staged photo is already the cover (set above).
      // Every plan attaches its staged photos (the DB cap trigger is the limit).
      // Was gated on _isProPlan from the Free = 1 photo era: after the 2026-09-20
      // cap change (Free 2 / Pro 5 / Featured 10) a Free vendor could stage a
      // second photo, see '2 of 2', and lose it on Save (F, 2026-09-22).
      if (newId != null && _pendingGalleryPhotos.length) {
        for (let i = 0; i < _pendingGalleryPhotos.length; i++) {
          try { await window.LokaliAPI.services.addPhoto(newId, _pendingGalleryPhotos[i].url, i); } catch (e) {}
        }
      }
      _pendingGalleryPhotos = [];

      // #136: link any specialty suggested during creation to the service that
      // now exists, so approval tags it like any other. Without this the
      // suggestion keeps both listing ids NULL forever and an approved
      // specialty never reaches the profile — indistinguishable, from the
      // vendor's side, from being ignored (Nolasko, 2026-08-16).
      // Best-effort and swallowed: the save already succeeded, and the #137
      // bell tells them what to do if the tag does not land.
      if (newId != null && _pendingSubcatLabels.length) {
        // ⚠️ Deliberately does NOT require a bumped lokali-supabase-client.js.
        // That file's shipped pin is held back (its newer build also carries an
        // unshipped uploadImage rewrite), so this prefers the wrapper when it
        // exists and otherwise calls the RPC on the raw client — which
        // window.LokaliSupabase has exposed since well before the current pin.
        const sapi = window.LokaliSupabaseAPI;
        for (const lbl of _pendingSubcatLabels) {
          try {
            if (sapi?.subcategories?.attachSuggestion) {
              await sapi.subcategories.attachSuggestion(lbl, { services_id: newId });
            } else if (window.LokaliSupabase) {
              await window.LokaliSupabase.rpc('attach_subcategory_suggestion',
                { p_label: lbl, p_services_id: newId });
            }
          } catch (e) {}
        }
      }
      _pendingSubcatLabels = [];

      await loadData();
      showListView();

    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      saveInProgress = false;
      if (saveBtn) {
        saveBtn.removeAttribute('aria-busy');
        saveBtn.style.fontSize = '';
        saveBtn.style.fontWeight = '';
        saveBtn.style.fontFamily = '';
        saveBtn.style.lineHeight = '';
        saveBtn.style.letterSpacing = '';
        saveBtn.style.pointerEvents = '';
        saveBtn.style.cursor = '';
        saveBtn.style.backgroundColor = '';
        paintSaveBtn(saveBtn); // restore icon + SAVE label (see #142 above)
      }
    }
  };

  // Trash: the old confirm promised a reversible deactivation but ran a real
  // DELETE (adapter -> supabase .delete(), no trigger intercepts). Honest
  // two-path dialog instead — primary = Deactivate (reversible, the same
  // is_active path as the form checkbox), secondary = permanent delete with
  // explicit can't-be-undone copy. Injected modal: role=dialog + aria-modal,
  // focus moved in on open / restored on close, Escape closes.
  function openTrashDialog(itemName) {
    return new Promise(function (resolve) {
      var prev = document.activeElement;
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9990;background:rgba(51,37,78,.5);display:flex;align-items:center;justify-content:center;padding:20px;';
      var card = document.createElement('div');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'lok-trash-title');
      card.style.cssText = 'background:#fff;border-radius:14px;max-width:420px;width:100%;padding:22px 20px;box-sizing:border-box;font-family:"Plus Jakarta Sans",system-ui,sans-serif;box-shadow:0 12px 40px rgba(51,37,78,.28);';
      var btnBase = 'display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;';
      card.innerHTML =
        '<div id="lok-trash-title" style="font-size:16px;font-weight:700;color:#1A1829;margin-bottom:6px;"></div>' +
        '<p style="font-size:13.5px;color:#5A5570;line-height:1.5;margin:0 0 16px;">Deactivating hides it from your public page. It moves to your Inactive list and you can bring it back anytime.</p>' +
        '<button type="button" data-trash-deactivate style="' + btnBase + 'border:1px solid #6002EE;background:#6002EE;color:#fff;margin-bottom:10px;">Deactivate (hide it, keep it)</button>' +
        '<button type="button" data-trash-delete style="' + btnBase + 'border:1px solid #F2C4CB;background:#fff;color:#C0152F;margin-bottom:10px;">Delete permanently (can’t be undone)</button>' +
        '<button type="button" data-trash-cancel style="' + btnBase + 'border:1px solid #E6E4F0;background:#fff;color:#5A5570;">Cancel</button>';
      overlay.appendChild(card);
      // The name goes in as text, never markup.
      card.querySelector('#lok-trash-title').textContent = 'Remove “' + itemName + '”?';
      function close(choice) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (prev && prev.focus) { try { prev.focus(); } catch (e) {} }
        resolve(choice);
      }
      function onKey(ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); close(null); }
      }
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('click', function (ev) { if (ev.target === overlay) close(null); });
      card.querySelector('[data-trash-deactivate]').addEventListener('click', function () { close('deactivate'); });
      card.querySelector('[data-trash-delete]').addEventListener('click', function () { close('delete'); });
      card.querySelector('[data-trash-cancel]').addEventListener('click', function () { close(null); });
      document.body.appendChild(overlay);
      card.querySelector('[data-trash-deactivate]').focus();
    });
  }

  const handleDeactivate = async (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    const choice  = await openTrashDialog((service && service.service_name) || 'this service');
    if (!choice) return;

    try {
      const result = choice === 'delete'
        ? await window.LokaliAPI.services.delete(serviceId)
        : await window.LokaliAPI.services.update(serviceId, { is_active: false });
      if (result.error) throw new Error(result.error);
      await loadData();
      showListView();
    } catch (err) {
      showError(err.message || 'Could not update service. Please try again.');
    }
  };

  const onDragStart = (e) => {
    const sortVal = el.sortSelect()?.value;
    if (sortVal && sortVal !== 'custom') {
      e.preventDefault();
      return;
    }
    dragSrc = e.currentTarget;
    setTimeout(() => dragSrc?.classList.add('service-card--dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnd = () => {
    el.stack()?.querySelectorAll(STACK_CARD_SEL).forEach(c => {
      c.classList.remove('service-card--dragging', 'service-card--drag-over');
    });
    fixLastCard();
    persistSortOrder();
  };

  const onDragOver = (e) => {
    e.preventDefault();
    const target = e.currentTarget;
    if (!target || target === dragSrc) return;

    el.stack()?.querySelectorAll(STACK_CARD_SEL).forEach(c =>
      c.classList.remove('service-card--drag-over')
    );
    target.classList.add('service-card--drag-over');

    const rect = target.getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    el.stack()?.insertBefore(dragSrc, e.clientY < mid ? target : target.nextSibling);
  };

  const onDrop = (e) => e.preventDefault();

  const persistSortOrder = async () => {
    // #94 guard: only the Custom view may write sort_order — a view-sorted
    // DOM arrangement must never overwrite the curated public order.
    var sortSel = el.sortSelect();
    if (normalizeSortValue(sortSel && sortSel.value) !== 'custom') return;
    const cards = el.stack()?.querySelectorAll(STACK_CARD_SEL);
    if (!cards || !cards.length) return;

    const updates = [...cards]
      .map((card, index) => ({
        id:         parseInt(card.dataset.serviceId),
        sort_order: index,
      }))
      .filter(o => !isNaN(o.id));

    // Sync the in-memory rows immediately — buildPayload's edit branch re-sends
    // ex.sort_order, so a stale value would silently revert the slot on the
    // next Save (or cover autosave). A failed persist reloads server truth below.
    updates.forEach(function (o) {
      for (var k = 0; k < services.length; k++) {
        if (String(services[k].id) === String(o.id)) { services[k].sort_order = o.sort_order; break; }
      }
    });
    services.sort(function (a, b) {
      return (a.sort_order != null ? a.sort_order : 9999) - (b.sort_order != null ? b.sort_order : 9999);
    });

    try {
      var results = await Promise.all(
        updates.map(o =>
          window.LokaliAPI.services.update(o.id, { sort_order: o.sort_order })
        )
      );
      // The adapter resolves { error } envelopes instead of throwing — a
      // silently-failed persist would revert the public order on next load.
      for (var i = 0; i < results.length; i++) {
        if (results[i] && results[i].error) throw new Error(String(results[i].error));
      }
    } catch (err) {
      console.error('[ServicesPage] Reorder error:', err);
      alert('Couldn’t save your new order. Please try again.');
      try { await loadData(); } catch (e) {}
    }
  };

  const loadData = async () => {
    // Both calls can transiently fail (429 / cold start). If the
    // BILLING call loses that race, plan detection falls back to "free" and the
    // photo gallery wrongly locks for Pro/Featured vendors — so retry a few
    // times on a transient error before giving up. (vendors.me + billing are
    // memoized in the client, so retries don't re-hit the successful ones.)
    const isTransient = (r) =>
      r && r.error && /rate|429|whoa|requests per|timeout|network|cold/i.test(String(r.error));
    let servicesRes, billingRes;
    for (let attempt = 0; ; attempt++) {
      [servicesRes, billingRes] = await Promise.all([
        window.LokaliAPI.services.getMine(true),
        window.LokaliAPI.plans.getMyBilling(),
      ]);
      if (attempt >= 3 || !(isTransient(servicesRes) || isTransient(billingRes))) break;
      await new Promise((r) => setTimeout(r, 1800 * (attempt + 1)));
    }

    if (servicesRes.error) throw new Error(servicesRes.error);

    services = normalizeServiceList(servicesRes.data);
    loadFailed = false;
    var loadErrBox = document.getElementById('services-load-error');
    if (loadErrBox) loadErrBox.remove();

    // Only trust the billing response when the call actually succeeded. On a
    // transient 429/cold-start the call errors, and we must NOT
    // downgrade a paid vendor to "free" (that wrongly locks the photo gallery
    // mid-session). Cache the last-known-good plan and fall back to it instead.
    const PLAN_CACHE_KEY = 'lok_plan_services_v1';
    const billing = (billingRes && !billingRes.error) ? billingRes.data : null;

    if (billing) {
      _maxServices = billing?.features?.max_services
                  ?? billing?.subscription?.max_services
                  ?? null;
      const planCode = String(
        billing?.plan_code
        ?? billing?.plan?.code
        ?? billing?.subscription?.plan_code
        ?? billing?.plan
        ?? 'free'
      ).toLowerCase();
      _isProPlan = planCode === 'pro' || planCode === 'featured';
      try { if (_reach) reachPaint(); } catch (e) {} // #251: the questions block depends on the plan
      _planLabel = planCode === 'featured' ? 'Featured' : (planCode === 'pro' ? 'Pro' : 'Free');
      _isFeaturedPlan = planCode === 'featured'; // FEAT-PICKS
      _maxServicePhotos = billing?.features?.max_service_photos
                       ?? billing?.subscription?.max_service_photos
                       ?? (_isFeaturedPlan ? 10 : _isProPlan ? 5 : 2);
      _hasGallery = (_maxServicePhotos || 0) > 1;
      try {
        sessionStorage.setItem(PLAN_CACHE_KEY, JSON.stringify({ pro: _isProPlan, feat: _isFeaturedPlan, maxPhotos: _maxServicePhotos, maxItems: _maxServices }));
      } catch (e) {}
    } else {
      // Billing call failed — reuse this session's last-known-good plan so a
      // hiccup doesn't lock a paid vendor's gallery. Only default to free/locked
      // if we've never seen a successful billing response this session.
      let cached = null;
      try { cached = JSON.parse(sessionStorage.getItem(PLAN_CACHE_KEY) || 'null'); } catch (e) {}
      _isProPlan = cached ? !!cached.pro : false;
      try { if (_reach) reachPaint(); } catch (e) {} // #251
      _isFeaturedPlan = cached ? !!cached.feat : false; // FEAT-PICKS
      _maxServicePhotos = cached ? (cached.maxPhotos ?? (_isFeaturedPlan ? 10 : _isProPlan ? 5 : 2)) : 2;
      _hasGallery = (_maxServicePhotos || 0) > 1;
      _maxServices = cached ? (cached.maxItems ?? null) : null;
    }

    services.sort((a, b) => {
      const aOrder = a.sort_order ?? 9999;
      const bOrder = b.sort_order ?? 9999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    renderList();
    requestAnimationFrame(reconcileListDom);
  };

  // A failed load must not masquerade as the "Add your first service" empty
  // state (it reads as data loss). Explicit error card + retry instead.
  const renderLoadError = () => {
    const stack = el.stack();
    const emptyNew = el.emptyState();
    const emptyFiltered = el.emptyStateFiltered();
    if (emptyNew) emptyNew.style.display = 'none';
    if (emptyFiltered) emptyFiltered.style.display = 'none';
    if (!stack) return;
    clearStackDataCards(stack);
    var box = document.getElementById('services-load-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'services-load-error';
      box.style.cssText = 'font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#fff;border:1px solid #E6E4F0;border-radius:12px;padding:24px 20px;margin:8px 0;text-align:center;';
      stack.appendChild(box);
    }
    box.innerHTML =
      '<div style="font-size:15px;font-weight:600;color:#1A1829;margin-bottom:4px;">Couldn’t load your services</div>' +
      '<div style="font-size:13px;color:#6B6580;margin-bottom:14px;">Check your connection and try again.</div>' +
      '<button type="button" data-load-retry style="font-family:inherit;font-size:14px;font-weight:600;min-height:44px;padding:10px 24px;border-radius:10px;border:1px solid #6002EE;background:#6002EE;color:#fff;cursor:pointer;">Try again</button>';
    var btn = box.querySelector('[data-load-retry]');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      loadData().catch(function (e) {
        console.error('[ServicesPage] retry error:', e);
        btn.disabled = false;
        btn.textContent = 'Try again';
      });
    });
  };

  // #61 required-field markers. The Webflow field labels are static, so mark the
  // genuinely-required ones once (Service = service name only; everything else is
  // optional per the schema). validate() already blocks an empty name.
  const markRequiredFields = () => {
    ['service-name'].forEach((id) => {
      const inp = document.getElementById(id);
      const label = inp && inp.previousElementSibling;
      if (!label || !label.classList || !label.classList.contains('form-text-header')) return;
      if (label.querySelector('.lok-req')) return;
      const star = document.createElement('span');
      star.className = 'lok-req';
      star.setAttribute('aria-hidden', 'true');
      star.textContent = ' *';
      label.appendChild(star);
    });
  };

  const bindEvents = () => {

    markRequiredFields();
    el.addBtn()?.addEventListener('click', () => openForm(null));

    el.pillAll()?.addEventListener('click',      () => setStatusFilter('all'));
    el.pillActive()?.addEventListener('click',   () => setStatusFilter('active'));
    el.pillInactive()?.addEventListener('click', () => setStatusFilter('inactive'));
    const sortEl = el.sortSelect();
    if (sortEl) {
      sortEl.addEventListener('change', applyFiltersAndSort);
      sortEl.addEventListener('input', applyFiltersAndSort);
    }
    const sortWrapper = document.getElementById('services-sort');
    if (sortWrapper && sortWrapper !== sortEl) {
      sortWrapper.addEventListener('change', applyFiltersAndSort);
      sortWrapper.addEventListener('input', applyFiltersAndSort);
      const observer = new MutationObserver(() => applyFiltersAndSort());
      const innerSelect = sortWrapper.querySelector('select');
      if (innerSelect) observer.observe(innerSelect, { attributes: true, attributeFilter: ['value'] });
    }

    setStatusFilter('all');

    el.backBtn()?.addEventListener('click',   showListView);
    el.cancelBtn()?.addEventListener('click', showListView);
    el.saveBtn()?.addEventListener('click',   handleSave);
    // Photos staged on a NEW item live only in memory until Save succeeds;
    // showListView() empties the list, so a non-empty list means the add form
    // is open with unsaved photos. Warn before a reload or navigation drops
    // them (Zoom Drain 2026-11-06: two photos uploaded, page reloaded, gone).
    window.addEventListener('beforeunload', (ev) => {
      if (editingId || !_pendingGalleryPhotos.length) return;
      ev.preventDefault();
      ev.returnValue = '';
    });
    paintSaveBtn(el.saveBtn()); // #142 FA icon + ALL-CAPS label from first paint
    el.deleteBtn()?.addEventListener('click', () => handleDeactivate(editingId));

    ensureFreeOption(); // 2026-10-02: "Free" joins the price-type select (no Webflow edit)
    const onPriceTypeChange = () => syncPriceWrapsFromSelect();
    el.fieldPriceType()?.addEventListener('change', onPriceTypeChange);
    el.fieldPriceType()?.addEventListener('input', onPriceTypeChange);

    el.imgInput()?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      revokeImagePreviewUrl();
      _imagePreviewObjectUrl = URL.createObjectURL(file);
      const thumb = el.imgThumb();
      const ph    = el.imgPlaceholder();
      const rem   = el.imgRemoveBtn();
      _imgFocus = null;           // #149: a new photo starts centered
      applyThumbPreview(thumb, _imagePreviewObjectUrl);
      if (ph)    ph.style.display  = 'none';
      if (rem)   rem.style.display = 'block';
      imageRemoved = false;
    });

    el.imgRemoveBtn()?.addEventListener('click', () => {
      resetImagePreview();
      imageRemoved = true;
    });

    if (window.LokaliDashboard && typeof window.LokaliDashboard.preventFormSubmit === 'function') {
      window.LokaliDashboard.preventFormSubmit('#services-form');
    }
  };

  // ── #78: per-service LEAD TIME (free-text, display only) ──────────────────
  // "How long until this is ready?" — informational copy that renders on the
  // public listing card + item page. Deliberately NOT the availability
  // "Minimum notice" (vendors.lead_time_hours), which is vendor-wide and
  // actually blocks bookings; this changes no booking logic at all.
  // Mounted INSIDE the description field's wrapper cell for the same Webflow
  // grid reason as the Specialty box below (a new direct grid child gets
  // auto-placed into a leftover cell and renders clipped, top-right).
  let _leadUiMounted = false;
  let _leadTime = null;
  const LEAD_PRESETS = ['Same day', '1–2 days', '3–5 days', 'About a week', '2–3 weeks'];
  const LEAD_MAXLEN = 60; // mirrors services_lead_time_shape in patch_lead_time.sql

  const ensureLeadTimeUI = () => {
    if (_leadUiMounted) return;
    // Same trap as the Specialty box: a stale cached client (7-day @v1.4
    // window) without lead_time in SERVICE_EDITABLE would strip the field in
    // pick() and silently drop the vendor's text under a success toast.
    // No capability flag -> no box.
    if (!window.LokaliSupabaseAPI?.capabilities?.itemLeadTime) return;
    const anchor = el.fieldDescription();
    const host = anchor ? anchor.parentElement : null;
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.id = 'lok-service-leadtime';
    wrap.style.cssText = "margin:14px 0 0;width:100%;box-sizing:border-box;font-family:'Plus Jakarta Sans',system-ui,sans-serif;";
    wrap.innerHTML =
      '<div style="font-size:13px;font-weight:600;color:#1A1829;margin-bottom:2px;">Lead time <span style="font-weight:400;color:#8E8BA6;">(optional)</span></div>' +
      '<p style="font-size:12.5px;color:#8E8BA6;margin:0 0 8px;">How long until this is ready for the customer? Shown on your listing so people know what to expect.</p>' +
      '<div data-lead-presets style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px;"></div>' +
      '<input data-lead-input class="w-input" maxlength="' + LEAD_MAXLEN + '" placeholder="e.g. Ready in ~2 weeks" style="width:100%;box-sizing:border-box;font-family:inherit;">' +
      '<p style="font-size:12px;color:#8E8BA6;margin:8px 0 0;line-height:1.45;">Tap a suggestion or write your own. This is a heads-up for customers. It doesn’t block anyone from booking or ordering.</p>';
    host.appendChild(wrap);
    const inp = wrap.querySelector('[data-lead-input]');
    inp.addEventListener('input', () => {
      _leadTime = inp.value.trim() || null;
      renderLeadPresets();   // keep chip highlighting in sync with typing
    });
    _leadUiMounted = true;
    renderLeadPresets();
  };

  const renderLeadPresets = () => {
    const row = document.querySelector('#lok-service-leadtime [data-lead-presets]');
    if (!row) return;
    row.innerHTML = '';
    LEAD_PRESETS.forEach(label => {
      const on = _leadTime === label;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.cssText = 'font-family:inherit;font-size:13.5px;padding:7px 13px;border-radius:999px;cursor:pointer;line-height:1.3;transition:all .12s;' +
        (on ? 'background:#F1F0F5;border:1px solid #4A4761;color:#1A1829;font-weight:600;'
            : 'background:#fff;border:1px solid #CCCCCC;color:#5A5570;');
      b.addEventListener('click', () => {
        // Tapping the active chip clears it — the field stays optional.
        _leadTime = on ? null : label;
        syncLeadInput();
        renderLeadPresets();
      });
      row.appendChild(b);
    });
  };

  const syncLeadInput = () => {
    const inp = document.querySelector('#lok-service-leadtime [data-lead-input]');
    if (inp) inp.value = _leadTime || '';
  };

  // ── #96-LISTING: per-service specialty (one optional subcategory slug) ─────
  // Taxonomy comes from the live `subcategory` table (an approved suggestion
  // appears on next page load, no script change); the selector only mounts
  // when the taxonomy AND the vendor's category are known — otherwise the
  // form behaves exactly as before and buildPayload omits the key entirely,
  // leaving the column untouched. vendors.subcategories is trigger-derived
  // from these tags server-side; The Market reads it unchanged.
  let _subcatList = null;        // [{slug,label}] for the vendor's category
  let _subcatCategoryId = null;
  let _selectedSubcat = null;    // slug | null ("None")
  let _subcatUiMounted = false;
  let _subcatPendingSuggs = [];
  let _subcatVendorTags = [];    // vendors.subcategories (trigger-derived from this vendor's listings)
  let _subcatDefaulted = false;  // true while a NEW listing sits on the auto-picked tag
  const SUBCAT_LABEL_RE = /^[A-Za-z0-9&'’\-+/() ]+$/;

  // The tag most of this vendor's listings already carry (ties → first seen),
  // else the storefront's first tag. Only a slug the current list knows is
  // used, so the dropdown never opens on a value the vendor can't see.
  const defaultSubcatForNew = () => {
    const counts = {}; const order = [];
    (Array.isArray(services) ? services : []).forEach(x => {
      const sl = x && typeof x.subcategory === 'string' ? x.subcategory : '';
      if (!sl) return;
      if (!counts[sl]) { counts[sl] = 0; order.push(sl); }
      counts[sl] += 1;
    });
    let best = null;
    order.forEach(sl => { if (best == null || counts[sl] > counts[best]) best = sl; });
    if (!best && _subcatVendorTags.length) best = _subcatVendorTags[0];
    if (!best) return null;
    if (_subcatList && !_subcatList.some(s => s.slug === best)) return null;
    return best;
  };

  const loadSubcatTaxonomy = async () => {
    try {
      const sapi = window.LokaliSupabaseAPI;
      // capabilities.listingSubcategory: only mount when the LOADED client
      // whitelists services.subcategory — a stale cached client (7-day @v1.4
      // window) would strip the field in pick() and silently drop the
      // vendor's choice under a success toast. No flag -> no selector.
      if (!sapi?.capabilities?.listingSubcategory) return;
      if (!sapi?.subcategories?.list || !window.LokaliAPI?.vendors?.me) return;
      const [meRes, taxRes, suggRes] = await Promise.all([
        window.LokaliAPI.vendors.me().catch(() => null),
        sapi.subcategories.list().catch(() => null),
        sapi.subcategories.mySuggestions ? sapi.subcategories.mySuggestions().catch(() => null) : Promise.resolve(null),
      ]);
      const vendor = meRes?.data?.vendor || meRes?.data;
      const catRaw = vendor?.categories_id;
      _subcatCategoryId = Array.isArray(catRaw) ? Number(catRaw[0]) : (catRaw != null ? Number(catRaw) : null);
      _subcatVendorTags = Array.isArray(vendor?.subcategories) ? vendor.subcategories.filter(x => typeof x === 'string' && x) : [];
      if (taxRes && !taxRes.error && Array.isArray(taxRes.data) && _subcatCategoryId != null) {
        _subcatList = taxRes.data
          .filter(r => r && Number(r.category_id) === _subcatCategoryId && r.slug && r.label)
          .map(r => ({ slug: r.slug, label: r.label }));
      }
      if (suggRes && !suggRes.error && Array.isArray(suggRes.data)) {
        // Pending chips + a green "approved ✓" for anything approved in the
        // last 7 days — the vendor's answer without leaving the form.
        const RECENT = Date.now() - 7 * 24 * 60 * 60 * 1000;
        _subcatPendingSuggs = suggRes.data.filter(r =>
          r && Number(r.category_id) === _subcatCategoryId &&
          (r.status === 'pending' ||
           (r.status === 'approved' && r.reviewed_at && Date.parse(r.reviewed_at) > RECENT)));
      }
      ensureSubcatUI();
      renderSubcatPills();
    } catch (e) {}
  };

  const ensureSubcatUI = () => {
    if (_subcatUiMounted || !_subcatList || !_subcatList.length) return;
    const anchor = el.fieldDescription();
    const host = anchor ? anchor.parentElement : null;
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.id = 'lok-service-subcat';
    // Mounted INSIDE the description field's wrapper cell (below the textarea),
    // NOT as a sibling: the form is a Webflow grid (`_2-columns`) with
    // explicitly placed w-node cells — a new direct grid child gets
    // auto-placed into a leftover cell (it rendered top-right, clipped, on
    // first ship). Inside the cell = normal flow in SERVICE DETAILS.
    wrap.style.cssText = "margin:14px 0 0;width:100%;box-sizing:border-box;background:#eee6ff;border-radius:8px;padding:12px 14px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;";
    wrap.innerHTML =
      '<div style="font-size:13px;font-weight:600;color:#33254E;margin-bottom:2px;">What kind of service is this?</div>' +
      '<p style="font-size:12.5px;color:#5A5570;margin:0 0 10px;">Shoppers use this to narrow The Market. Pick the closest match, or leave it on None.</p>' +
      '<select data-subcat-select aria-label="What kind of service is this?" style="display:block;width:100%;max-width:420px;font-family:inherit;font-size:16px;padding:9px 12px;border:1px solid #C9BDE8;border-radius:8px;background:#fff;color:#1A1829;cursor:pointer;box-sizing:border-box;"></select>' +
      '<p data-subcat-note style="display:none;font-size:12px;color:#6B6787;margin:8px 0 0;line-height:1.45;"></p>' +
      // The suggest box is folded behind one link: most vendors only ever pick
      // from the list, and the open input + button read like a required field.
      '<button type="button" data-subcat-fold style="display:inline-block;margin-top:10px;padding:0;border:0;background:none;font-family:inherit;font-size:12.5px;font-weight:600;color:#6002EE;cursor:pointer;text-decoration:underline;">None of these fit? Suggest a new one</button>' +
      '<div data-subcat-suggest-wrap style="display:none;border-top:1px dashed #DCD2F2;margin-top:12px;padding-top:10px;">' +
        '<div style="display:flex;gap:6px;">' +
          '<input data-subcat-suggest maxlength="40" placeholder="e.g. Power washing" style="flex:1;min-width:0;font-family:inherit;font-size:16px;padding:8px 12px;border:1px solid #C9BDE8;border-radius:8px;background:#fff;color:#1A1829;">' +
          '<button type="button" data-subcat-suggest-btn style="font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;border:1px solid #6002EE;background:#6002EE;color:#fff;cursor:pointer;">Suggest</button>' +
        '</div>' +
        '<p style="font-size:12px;color:#8E8BA6;margin:8px 0 0;line-height:1.45;">We review new ones first so the filters stay tidy. Once approved, yours shows up here for everyone.</p>' +
        '<p data-subcat-hint style="font-size:12px;color:#6B6787;margin:8px 0 0;line-height:1.45;"></p>' +
        '<div data-subcat-pending style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;"></div>' +
      '</div>';
    host.appendChild(wrap);
    const sel = wrap.querySelector('[data-subcat-select]');
    sel.addEventListener('change', () => { _selectedSubcat = sel.value || null; _subcatDefaulted = false; renderSubcatNote(); });
    wrap.querySelector('[data-subcat-fold]').addEventListener('click', () => {
      openSubcatFold();
      try { wrap.querySelector('[data-subcat-suggest]').focus(); } catch (e) {}
    });
    wrap.querySelector('[data-subcat-suggest-btn]').addEventListener('click', submitSubcatSuggestion);
    const inp = wrap.querySelector('[data-subcat-suggest]');
    inp.addEventListener('input', subcatTypeahead);
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submitSubcatSuggestion(); } });
    _subcatUiMounted = true;
  };

  // Fills the Specialty <select> (was a pill radiogroup until v1.4.297 —
  // long categories overflowed the form; a dropdown stays compact). Options
  // are alphabetical; the function keeps its old name so every call site
  // (typeahead, exists-branch, showFormView) works unchanged.
  const renderSubcatPills = () => {
    const sel = document.querySelector('#lok-service-subcat [data-subcat-select]');
    if (!sel || !_subcatList) return;
    sel.innerHTML = '';
    const mk = (label, slug) => {
      const o = document.createElement('option');
      o.value = slug == null ? '' : slug;
      o.textContent = label;
      sel.appendChild(o);
    };
    mk('None', null);
    // A saved tag missing from the category's current list still renders —
    // visible + deselectable, never a silently-invisible current value.
    if (_selectedSubcat && !_subcatList.some(s => s.slug === _selectedSubcat)) mk(_selectedSubcat, _selectedSubcat);
    _subcatList.slice().sort((a, b) => a.label.localeCompare(b.label)).forEach(s => mk(s.label, s.slug));
    sel.value = _selectedSubcat == null ? '' : _selectedSubcat;
    renderSubcatNote();
    renderSubcatPending();
  };

  const openSubcatFold = () => {
    const w = document.querySelector('#lok-service-subcat [data-subcat-suggest-wrap]');
    const b = document.querySelector('#lok-service-subcat [data-subcat-fold]');
    if (w) w.style.display = 'block';
    if (b) b.style.display = 'none';
  };

  const renderSubcatNote = () => {
    const note = document.querySelector('#lok-service-subcat [data-subcat-note]');
    if (!note) return;
    const show = _subcatDefaulted && !!_selectedSubcat;
    note.textContent = show ? 'Set to match your other services. Change it if this one is different.' : '';
    note.style.display = show ? 'block' : 'none';
  };

  const renderSubcatPending = () => {
    const box = document.querySelector('#lok-service-subcat [data-subcat-pending]');
    if (!box) return;
    box.innerHTML = '';
    if (_subcatPendingSuggs.length) openSubcatFold(); // a vendor with a suggestion in flight sees its status
    _subcatPendingSuggs.forEach(p => {
      const chip = document.createElement('span');
      const approved = p.status === 'approved';
      chip.textContent = approved
        ? ((p.final_label || p.suggested_label) + ' · approved ✓')
        : (p.suggested_label + ' · under review');
      chip.style.cssText = approved
        ? 'font-size:12px;padding:4px 12px;border-radius:999px;background:#EDFAF3;color:#1A6640;border:1px solid #A8DFC4;'
        : 'font-size:12px;padding:4px 12px;border-radius:999px;background:#FBF3D9;color:#8A6A00;border:1px solid #E8D48A;';
      box.appendChild(chip);
    });
  };

  const setSubcatHint = (text, tone) => {
    const hint = document.querySelector('#lok-service-subcat [data-subcat-hint]');
    if (!hint) return;
    hint.textContent = text || '';
    hint.style.color = tone === 'error' ? '#B3400F' : (tone === 'ok' ? '#1A6640' : '#6B6787');
  };

  const subcatTypeahead = () => {
    const inp = document.querySelector('#lok-service-subcat [data-subcat-suggest]');
    const hint = document.querySelector('#lok-service-subcat [data-subcat-hint]');
    if (!inp || !hint || !_subcatList) return;
    const q = String(inp.value || '').trim().toLowerCase();
    hint.innerHTML = '';
    if (q.length < 2) return;
    const match = _subcatList.find(s => s.label.toLowerCase().includes(q));
    if (!match) return;
    hint.appendChild(document.createTextNode('Did you mean '));
    const link = document.createElement('span');
    link.textContent = match.label;
    link.style.cssText = 'color:#6002EE;font-weight:600;cursor:pointer;text-decoration:underline;';
    link.addEventListener('click', () => {
      if (_subcatList.some(s => s.slug === match.slug)) {
        _selectedSubcat = match.slug;
        _subcatDefaulted = false;
        renderSubcatPills();
        inp.value = '';
        setSubcatHint('Selected. It saves with this service.', 'ok');
      }
    });
    hint.appendChild(link);
    hint.appendChild(document.createTextNode('? Tap it to select.'));
    hint.style.color = '#6B6787';
  };

  const submitSubcatSuggestion = async () => {
    const inp = document.querySelector('#lok-service-subcat [data-subcat-suggest]');
    if (!inp) return;
    const label = String(inp.value || '').replace(/\s+/g, ' ').trim();
    if (_subcatCategoryId == null) { setSubcatHint('Pick your business category on the profile page first.', 'error'); return; }
    if (label.length < 3 || label.length > 40 || !SUBCAT_LABEL_RE.test(label) || !/[A-Za-z0-9]/.test(label)) {
      setSubcatHint('3–40 characters: letters, numbers and simple punctuation.', 'error');
      return;
    }
    const sapi = window.LokaliSupabaseAPI;
    if (!sapi?.subcategories?.suggest) return;
    setSubcatHint('Sending…');
    try {
      // Attach the listing being edited (if any) — approval then auto-tags it.
      const out = await sapi.subcategories.suggest(_subcatCategoryId, label,
        editingId ? { services_id: editingId } : null);
      const d = out?.data;
      if (!d || out.error) { setSubcatHint('Hit a snag. Try again in a moment.', 'error'); return; }
      if (d.ok) {
        _subcatPendingSuggs.unshift({ category_id: _subcatCategoryId, suggested_label: label, status: 'pending' });
        renderSubcatPending();
        inp.value = '';
        // #136: no service id exists yet in add mode, so remember the label and
        // link it once the save produces one.
        if (!editingId) _pendingSubcatLabels.push(label);
        setSubcatHint(editingId
          ? 'Thanks! Once approved, this service gets the tag automatically.'
          : 'Thanks! Save this service and it gets the tag automatically once approved.', 'ok');
      } else if (d.reason === 'exists' && d.slug) {
        // Select the returned slug directly — even if this page's taxonomy is
        // stale, the unknown-slug pill renders it (never "reload" advice that
        // would destroy an unsaved draft).
        _selectedSubcat = d.slug;
        _subcatDefaulted = false;
        renderSubcatPills();
        inp.value = '';
        setSubcatHint('That one already exists, so we selected it for you.', 'ok');
      } else if (d.reason === 'already_suggested') setSubcatHint('You already suggested this one. It’s under review.', 'error');
      else if (d.reason === 'pending_limit') setSubcatHint('You have 3 suggestions under review. Hang tight!', 'error');
      else if (d.reason === 'invalid_label') setSubcatHint('3–40 characters: letters, numbers and simple punctuation.', 'error');
      else setSubcatHint('Couldn’t submit that. Try different wording.', 'error');
    } catch (e) { setSubcatHint('Hit a snag. Try again in a moment.', 'error'); }
  };

  const init = async () => {
    try {
      if (!window.LokaliDashboard || typeof window.LokaliDashboard.requireAuth !== 'function') {
        return;
      }
      if (!window.LokaliDashboard.requireAuth()) {
        return;
      }

      if (typeof window !== 'undefined' && window.__lokaliServicesFinalInitDone) {
        return;
      }
      if (typeof window !== 'undefined') window.__lokaliServicesFinalInitDone = true;
      bindEvents();
      loadSubcatTaxonomy(); // #96-LISTING — fire-and-forget; selector mounts when it lands
      await loadData();
    } catch (err) {
      console.error('[ServicesPage] init error:', err);
      services = [];
      _maxServices = null;
      loadFailed = true;
      try {
        renderLoadError();
      } catch (_e) {}
    }
  };

  return { init, reconcileListDom };

})();

(function startLokaliServicesPage() {
  function go() {
    if (!window.LokaliAPI || !window.LokaliDashboard) {
      return false;
    }
    if (typeof window !== 'undefined' && window.__lokaliServicesPageBootstrapDone) {
      return true;
    }
    if (typeof window !== 'undefined') window.__lokaliServicesPageBootstrapDone = true;

    LokaliServicesPage.init();
    window.addEventListener('load', function onSvcsLoad() {
      window.removeEventListener('load', onSvcsLoad);
      if (typeof LokaliServicesPage.reconcileListDom === 'function') {
        LokaliServicesPage.reconcileListDom();
      }
    });
    return true;
  }

  function failMissingDeps() {
    console.error(
      '[ServicesPage] Missing LokaliAPI or LokaliDashboard. In Webflow: load lokali-api-client.js and lokali-dashboard.js first ' +
        '(Project Settings → Custom Code → Footer, or Before </body>), then this script after them — not in Head before <body>.'
    );
  }

  /** Page embeds often run before footer globals exist; wait for deps instead of exiting once. */
  function kick() {
    if (go()) return;

    var attempts = 0;
    var maxAttempts = 120;
    var id = setInterval(function () {
      attempts++;
      if (go()) {
        clearInterval(id);
      } else if (attempts >= maxAttempts) {
        clearInterval(id);
        failMissingDeps();
      }
    }, 100);

    window.addEventListener('load', function onWinLoad() {
      window.removeEventListener('load', onWinLoad);
      if (go()) clearInterval(id);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kick);
  } else {
    kick();
  }
})();

