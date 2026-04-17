const LokaliServicesPage = (() => {

  let services     = [];
  let editingId    = null;
  let imageRemoved = false;
  let dragSrc      = null;
  let _maxServices = null;
  let _imagePreviewObjectUrl = null;

  let filterStatus   = 'all';
  let saveInProgress = false;

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
    return String(raw).trim();
  };

  const KNOWN_PRICE_KEYS = new Set(['fixed', 'starting_at', 'range', 'quote']);

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
      '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    switch (service.price_type) {
      case 'fixed':       return fmt(service.price_cents);
      case 'starting_at': return 'From ' + fmt(service.price_min_cents);
      case 'range':       return fmt(service.price_min_cents) + ' \u2013 ' + fmt(service.price_max_cents);
      case 'quote':       return 'Get a quote';
      default:            return '';
    }
  };

  const getCategoryName = (_categoryId) => '';

  const applyFormErrorTypography = (node) => {
    if (!node) return;
    node.style.fontFamily = '"Plus Jakarta Sans", "Plus Jakarta Sans Variable", system-ui, sans-serif';
    node.style.fontSize = '14px';
    node.style.lineHeight = '1.45';
    node.style.fontWeight = '500';
    node.style.color = '#B1006A';
    node.style.marginLeft = '1.25rem';
    node.style.marginRight = '1.25rem';
    node.style.letterSpacing = 'normal';
    node.style.textTransform = 'none';
  };

  const showError = (msg) => {
    const e = el.formError();
    if (!e) return;
    applyFormErrorTypography(e);
    e.textContent = msg;
    e.style.display = 'block';
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
      ? (Number(cents) / 100).toFixed(0)
      : '';

  const nextServiceSortOrder = () => {
    let max = -1;
    for (const s of services) {
      const n = Number(s.sort_order);
      if (!isNaN(n) && n > max) max = n;
    }
    return max + 1;
  };

  const applyPillStyle = (pill, selected) => {
    if (!pill) return;
    const inner = pill.firstElementChild || pill;
    if (selected) {
      pill.classList.add('filter-pill-selected');
      inner.style.setProperty('background', '#6002EE', 'important');
      inner.style.setProperty('background-color', '#6002EE', 'important');
      inner.style.setProperty('color', '#FFFFFF', 'important');
      inner.style.setProperty('border-color', 'transparent', 'important');
    } else {
      pill.classList.remove('filter-pill-selected');
      inner.style.removeProperty('background');
      inner.style.removeProperty('background-color');
      inner.style.removeProperty('color');
      inner.style.removeProperty('border-color');
    }
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
    if (stack && sortVal !== 'custom') {
      const all = [...stack.querySelectorAll(STACK_CARD_SEL)];
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
      all.forEach(c => stack.appendChild(c));
    }

    updateEmptyState();
    fixLastCard();
  };

  const updateEmptyState = () => {
    const stack = el.stack();
    const emptyNew = el.emptyState();
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

    const countEl = el.activeCount();
    if (countEl) {
      if (_maxServices != null) {
        const remaining = Math.max(0, _maxServices - totalCount);
        countEl.textContent =
          `${totalCount} of ${_maxServices} services · ${remaining} slot${remaining === 1 ? '' : 's'} left`;
      } else {
        countEl.textContent =
          `${activeCount} active service${activeCount === 1 ? '' : 's'} · ${totalCount} total`;
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
      card.setAttribute('data-created',    index);
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

      const editBtn = card.querySelector('[data-action="edit"]') || card.querySelector('.icon-btn-edit');
      if (editBtn) editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openForm(service.id);
      });

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

      stack.appendChild(card);
    });

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

  const showFormView = () => {
    el.listView()?.style && (el.listView().style.display = 'none');
    el.formView()?.style && (el.formView().style.display = 'block');
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

  const populateForm = (service) => {
    if (el.fieldName())        el.fieldName().value        = service.service_name || '';
    if (el.fieldDescription()) el.fieldDescription().value = service.service_description || '';
    if (el.fieldCategory())    el.fieldCategory().value    = service.category_id || '';
    selectPriceTypeOption(el.fieldPriceType(), service.price_type || 'fixed');
    if (el.fieldDuration())    el.fieldDuration().value    = service.duration_minutes || '';
    if (el.fieldRemote())      el.fieldRemote().checked    = service.remote || false;
    if (el.fieldIsActive())    el.fieldIsActive().checked  = service.is_active !== false;
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
    }
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

    syncPriceWrapsFromSelect();
    resetImagePreview();
  };

  const revokeImagePreviewUrl = () => {
    if (_imagePreviewObjectUrl) {
      try { URL.revokeObjectURL(_imagePreviewObjectUrl); } catch (e) {}
      _imagePreviewObjectUrl = null;
    }
  };

  const resetImagePreview = () => {
    revokeImagePreviewUrl();
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
      sort_order:          null,
    };

    if (!editingId) {
      payload.sort_order = nextServiceSortOrder();
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

    return payload;
  };

  const validate = (payload) => {
    if (!payload.service_name)  return 'Please enter a service name.';
    if (!payload.price_type)    return 'Please select a price type.';

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

      const imgFile = el.imgInput()?.files?.[0];

      if (imgFile) {

        const uploadRes = await window.LokaliAPI.services.uploadServiceImage(imgFile);
        if (uploadRes.error) throw new Error('Image upload failed: ' + uploadRes.error);
        const p = uploadRes.data?.path || uploadRes.data?.image_path || null;
        imageUrl = uploadRes.data?.url || uploadRes.data?.image_url || (p ? ('https://x8ki-letl-twmt.n7.xano.io' + p) : null);
      } else if (imageRemoved) {

        imageUrl = null;
      } else if (editingId) {

        const existing = services.find(s => s.id === editingId);
        imageUrl = existing?.image_url ?? null;
      } else {

        imageUrl = null;
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

      await loadData();
      showListView();

    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      saveInProgress = false;
      if (saveBtn) {
        saveBtn.removeAttribute('aria-busy');
        saveBtn.textContent = 'Save service';
        saveBtn.style.fontSize = '';
        saveBtn.style.fontWeight = '';
        saveBtn.style.fontFamily = '';
        saveBtn.style.lineHeight = '';
        saveBtn.style.letterSpacing = '';
        saveBtn.style.pointerEvents = '';
        saveBtn.style.cursor = '';
        saveBtn.style.backgroundColor = '';
      }
    }
  };

  const handleDeactivate = async (serviceId) => {
    const service   = services.find(s => s.id === serviceId);
    const confirmed = window.confirm(
      `Deactivate "${service?.service_name || 'this service'}"? It will move to your inactive list and you can reactivate it anytime.`
    );
    if (!confirmed) return;

    try {
      const result = await window.LokaliAPI.services.delete(serviceId);
      if (result.error) throw new Error(result.error);
      await loadData();
      showListView();
    } catch (err) {
      showError(err.message || 'Could not deactivate service. Please try again.');
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
    const cards = el.stack()?.querySelectorAll(STACK_CARD_SEL);
    if (!cards || !cards.length) return;

    const updates = [...cards]
      .map((card, index) => ({
        id:         parseInt(card.dataset.serviceId),
        sort_order: index,
      }))
      .filter(o => !isNaN(o.id));

    try {
      await Promise.all(
        updates.map(o =>
          window.LokaliAPI.services.update(o.id, { sort_order: o.sort_order })
        )
      );
    } catch (err) {
      console.error('[ServicesPage] Reorder error:', err);
    }
  };

  const loadData = async () => {
    const [servicesRes, billingRes] = await Promise.all([
      window.LokaliAPI.services.getMine(true),
      window.LokaliAPI.plans.getMyBilling(),
    ]);

    if (servicesRes.error) throw new Error(servicesRes.error);

    services = normalizeServiceList(servicesRes.data);

    const billing = billingRes?.data;
    _maxServices = billing?.features?.max_services
                ?? billing?.subscription?.max_services
                ?? null;

    services.sort((a, b) => {
      const aOrder = a.sort_order ?? 9999;
      const bOrder = b.sort_order ?? 9999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    renderList();
    requestAnimationFrame(reconcileListDom);
  };

  const bindEvents = () => {

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
    el.deleteBtn()?.addEventListener('click', () => handleDeactivate(editingId));

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
      await loadData();
    } catch (err) {
      console.error('[ServicesPage] init error:', err);
      services = [];
      _maxServices = null;
      try {
        renderList();
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

