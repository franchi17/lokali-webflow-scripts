

const LokaliProductsPage = (() => {

  let products     = [];
  let editingId    = null;
  let imageRemoved = false;
  let dragSrc      = null;
  let _maxProducts = null;
  let _imagePreviewObjectUrl = null;

  let filterStatus   = 'all';
  let saveInProgress = false;

  const STACK_CARD_SEL = '.product-card[data-product-id]:not(#product-card-template)';

  const clearStackDataCards = (stack) => {
    if (!stack) return;
    [...stack.querySelectorAll('[data-product-id]:not(#product-card-template)')].forEach((node) => node.remove());
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

  const normalizeProductList = (raw) => {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.records)) return raw.records;
    if (Array.isArray(raw.data)) return raw.data;
    if (Array.isArray(raw.result)) return raw.result;
    if (Array.isArray(raw.results)) return raw.results;
    if (Array.isArray(raw.products)) return raw.products;
    if (Array.isArray(raw.payload)) return raw.payload;
    if (Array.isArray(raw.output)) return raw.output;
    if (Array.isArray(raw.list)) return raw.list;
    if (typeof raw === 'object' && raw) {
      const inner = raw.data;
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        if (Array.isArray(inner.items)) return inner.items;
        if (Array.isArray(inner.products)) return inner.products;
        if (Array.isArray(inner.records)) return inner.records;
        if (Array.isArray(inner.data)) return inner.data;
        const innerNum = numericKeyedObjectToArray(inner);
        if (innerNum && innerNum.length) return innerNum;
      }
      const asNum = numericKeyedObjectToArray(raw);
      if (asNum && asNum.length) return asNum;
    }
    return [];
  };

  const isProductActive = (p) => {
    if (p == null) return true;
    if (p.is_active === false || p.is_active === 0) return false;
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
    listView:       () => document.getElementById('products-list-view'),
    stack:          () => document.getElementById('products-stack'),
    cardTemplate:   () => {
      const node = document.getElementById('product-card-template');
      if (!node) return null;
      if (node.classList.contains('product-card')) return node;
      const inner = node.querySelector('.product-card') || node.querySelector('[data-field]')?.closest('.product-card');
      return inner || node;
    },
    emptyState:         () => document.getElementById('products-empty-state'),
    emptyStateFiltered: () => document.getElementById('products-empty-filtered'),
    activeCount:    () => document.getElementById('products-active-count'),
    upgradeLink:    () => document.getElementById('products-upgrade-link'),
    addBtn:         () => document.getElementById('products-add-btn'),

    pillAll:        () => document.getElementById('filter-pill-all'),
    pillActive:     () => document.getElementById('filter-pill-active'),
    pillInactive:   () => document.getElementById('filter-pill-inactive'),
    catFilter:      () => resolveSelectElement('filter-category'),
    sortSelect:     () => resolveSelectElement('products-sort'),

    formView:       () => document.getElementById('products-form-view'),
    formTitle:      () => document.getElementById('products-form-title'),
    formError:      () => document.getElementById('products-form-error'),
    backBtn:        () => document.getElementById('products-back-btn'),
    saveBtn:        () => document.getElementById('products-save-btn'),
    cancelBtn:      () => document.getElementById('products-cancel-btn'),
    deleteBtn:      () => document.getElementById('products-delete-btn'),

    fieldName:        () => resolveFieldInput('product-name'),
    fieldDescription: () => resolveFieldInput('product-description'),
    fieldCategory:    () => resolveSelectElement('product-category'),
    fieldPrice:       () => resolveFieldInput('product-price'),
    fieldPriceNote:   () => resolveFieldInput('product-price-note'),
    fieldQuoteBased:  () => resolveCheckboxInput('product-quote-based'),
    fieldStock:       () => resolveFieldInput('product-stock'),
    fieldTurnaround:  () => resolveFieldInput('product-turnaround'),
    fieldCustom:      () => resolveCheckboxInput('product-custom'),
    fieldShipping:    () => resolveCheckboxInput('product-shipping'),
    fieldPickupOnly:  () => resolveCheckboxInput('product-pickup-only'),
    fieldIsActive:    () => resolveCheckboxInput('product-is-active'),

    wrapPrice:      () => document.getElementById('price-wrap-product-fixed'),

    imgInput:       () => resolveFileInput('product-img-input'),
    imgThumb:       () => document.getElementById('product-img-thumb'),
    imgPlaceholder: () => document.getElementById('product-img-placeholder'),
    imgRemoveBtn:   () => document.getElementById('product-img-remove'),
  };

  const formatPrice = (p) => {
    if (p.is_quote_based) return 'Quote';
    const cents = p.price != null ? Number(p.price) : null;
    if (cents == null || isNaN(cents)) return '';
    return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
  const dollarsFromCents = (cents) => (cents != null && !isNaN(cents)) ? (Number(cents) / 100).toFixed(0) : '';

  const updatePriceVisibility = () => {
    const quote = el.fieldQuoteBased()?.checked;
    const wrap = el.wrapPrice();
    if (!wrap) return;
    if (quote) wrap.style.display = 'none';
    else wrap.style.removeProperty('display');
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
    let visible = [...document.querySelectorAll(`#products-stack ${STACK_CARD_SEL}`)];

    visible.forEach(card => {
      const isActive = card.dataset.active === 'true';
      let show = true;
      if (filterStatus === 'active'   && !isActive) show = false;
      if (filterStatus === 'inactive' && isActive)  show = false;
      card.classList.toggle('product-card--hidden', !show);
    });

    const stack = el.stack();
    if (stack && sortVal !== 'custom') {
      const all = [...stack.querySelectorAll(STACK_CARD_SEL)];
      all.sort((a, b) => {
        if (sortVal === 'newest')     return parseInt(b.dataset.created) - parseInt(a.dataset.created);
        if (sortVal === 'alpha') {
          const nameA = (a.querySelector('[data-field="product-name"]') || a.querySelector('.product-name'))?.textContent || '';
          const nameB = (b.querySelector('[data-field="product-name"]') || b.querySelector('.product-name'))?.textContent || '';
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

    const visibleCount = stack.querySelectorAll(`${STACK_CARD_SEL}:not(.product-card--hidden)`).length;
    const noProductsEver = products.length === 0;

    if (visibleCount > 0) {
      if (emptyNew) emptyNew.style.display = 'none';
      if (emptyFiltered) emptyFiltered.style.display = 'none';
      return;
    }

    if (emptyFiltered) {
      if (noProductsEver) {
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
    const visible = stack.querySelectorAll(`${STACK_CARD_SEL}:not(.product-card--hidden)`);
    all.forEach(c => c.style.marginBottom = '-10px');
    if (visible.length) visible[visible.length - 1].style.marginBottom = '0';
  };

  const sortKeyPrice = (p) => {
    if (p.is_quote_based) return 0;
    return p.price != null ? Number(p.price) : 0;
  };

  const renderList = () => {
    const stack    = el.stack();
    const template = el.cardTemplate();
    if (!stack || !template) return;

    clearStackDataCards(stack);

    const activeCount = products.filter(p => isProductActive(p)).length;
    const totalCount  = products.length;

    const countEl = el.activeCount();
    if (countEl) {
      if (_maxProducts != null) {
        const remaining = Math.max(0, _maxProducts - totalCount);
        countEl.textContent =
          `${totalCount} of ${_maxProducts} products · ${remaining} slot${remaining === 1 ? '' : 's'} left`;
      } else {
        countEl.textContent =
          `${activeCount} active product${activeCount === 1 ? '' : 's'} · ${totalCount} total`;
      }
    }

    const upgradeEl = el.upgradeLink();
    if (upgradeEl && _maxProducts != null) {
      upgradeEl.style.display = (totalCount >= _maxProducts) ? 'flex' : 'none';
    }
    if (upgradeEl) upgradeEl.href = '/pricing';

    const catTool = el.catFilter();
    if (catTool) {
      catTool.style.display = 'none';
      catTool.setAttribute('aria-hidden', 'true');
    }

    products.forEach((product, index) => {
      const card = template.cloneNode(true);
      card.removeAttribute('id');
      card.classList.add('product-card');
      card.style.removeProperty('display');
      card.style.marginBottom = '-10px';
      card.setAttribute('data-product-id', product.id);
      card.setAttribute('data-active',     isProductActive(product) ? 'true' : 'false');
      card.setAttribute('data-category',   getCategoryName(product.category_id));
      card.setAttribute('data-price',      String(sortKeyPrice(product)));
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

      set('product-name',        product.product_name || product.name || '',              'product-name');
      set('product-category',    getCategoryName(product.category_id), 'product-category');
      set('product-description', product.product_description || product.description || '', 'product-description');
      set('product-price',       formatPrice(product),              'product-price');
      set('product-price-note',  product.price_note || '',          'product-price-note');

      const stock = product.stock_quantity;
      set('product-stock', stock != null ? String(stock) : '\u2014', 'product-stock');

      const pill = find('product-status', 'status-pill', 'product-status');
      if (pill) {
        pill.textContent = isProductActive(product) ? 'Active' : 'Inactive';
        pill.classList.toggle('pill-active',   isProductActive(product));
        pill.classList.toggle('pill-inactive', !isProductActive(product));
      }

      const shipBadge = find('product-shipping', 'shipping-badge', 'product-shipping');
      if (shipBadge) shipBadge.style.display = product.shipping_offered ? 'inline-flex' : 'none';

      const editBtn = card.querySelector('[data-action="edit"]') || card.querySelector('.icon-btn-edit');
      if (editBtn) editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openForm(product.id);
      });

      const deleteBtn = card.querySelector('[data-action="delete"]') || card.querySelector('.icon-btn--delete');
      if (deleteBtn) deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeactivate(product.id);
      });

      card.addEventListener('click', () => openForm(product.id));

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
    if (products.length === 0) {
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

  const openForm = (productId = null) => {
    editingId    = productId;
    imageRemoved = false;
    clearError();

    const isEditing = !!productId;
    const titleEl   = el.formTitle();
    const deleteBtn = el.deleteBtn();

    if (titleEl)   titleEl.textContent    = isEditing ? 'Edit product' : 'Add a product';
    if (deleteBtn) deleteBtn.style.display = isEditing ? 'flex' : 'none';

    if (isEditing) {
      const product = products.find(p => p.id === productId);
      if (!product) return;
      populateForm(product);
    } else {
      if (_maxProducts != null && products.length >= _maxProducts) {
        alert(`You've reached your ${_maxProducts}-product limit on your current plan. Upgrade to add more.`);
        return;
      }
      resetForm();
    }

    showFormView();
  };

  const populateForm = (product) => {
    if (el.fieldName())        el.fieldName().value        = product.product_name || '';
    if (el.fieldDescription()) el.fieldDescription().value = product.product_description || '';
    if (el.fieldCategory())    el.fieldCategory().value    = product.category_id || '';
    if (el.fieldQuoteBased())  el.fieldQuoteBased().checked = !!product.is_quote_based;
    if (el.fieldStock())       el.fieldStock().value       = product.stock_quantity != null ? String(product.stock_quantity) : '';
    if (el.fieldTurnaround())  el.fieldTurnaround().value  = product.turnaround_days != null ? String(product.turnaround_days) : '';
    if (el.fieldCustom())      el.fieldCustom().checked    = !!product.is_custom;
    if (el.fieldShipping())    el.fieldShipping().checked  = !!product.shipping_offered;
    if (el.fieldPickupOnly())  el.fieldPickupOnly().checked = !!product.pickup_only;
    if (el.fieldIsActive())    el.fieldIsActive().checked  = product.is_active !== false;

    if (el.fieldPrice()) el.fieldPrice().value = dollarsFromCents(product.price);
    if (el.fieldPriceNote()) el.fieldPriceNote().value = product.price_note || '';

    updatePriceVisibility();
    resetImagePreview();
    if (product.image_url) {
      const thumb = el.imgThumb();
      const ph    = el.imgPlaceholder();
      const rem   = el.imgRemoveBtn();
      applyThumbPreview(thumb, product.image_url);
      if (ph)  ph.style.display = 'none';
      if (rem) rem.style.display = 'block';
    }
  };

  const resetForm = () => {
    [
      el.fieldName(), el.fieldDescription(), el.fieldPrice(), el.fieldPriceNote(),
      el.fieldStock(), el.fieldTurnaround()
    ].forEach(f => { if (f) f.value = ''; });

    if (el.fieldQuoteBased())  el.fieldQuoteBased().checked  = false;
    if (el.fieldCustom())      el.fieldCustom().checked    = false;
    if (el.fieldShipping())    el.fieldShipping().checked  = false;
    if (el.fieldPickupOnly())  el.fieldPickupOnly().checked = false;
    if (el.fieldIsActive())    el.fieldIsActive().checked   = true;
    if (el.fieldCategory())    el.fieldCategory().value    = '';

    updatePriceVisibility();
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
    const isQuote = el.fieldQuoteBased()?.checked;

    const payload = {
      product_name:        el.fieldName()?.value.trim(),
      product_description: el.fieldDescription()?.value.trim() || null,
      category_id:         parseInt(el.fieldCategory()?.value) || null,
      price:               isQuote ? null : centsFromDollars(el.fieldPrice()?.value),
      price_note:          el.fieldPriceNote()?.value.trim() || null,
      stock_quantity:      (() => {
        const v = el.fieldStock()?.value;
        if (v === '' || v == null) return null;
        const n = parseInt(v, 10);
        return isNaN(n) ? null : n;
      })(),
      image_url:           imageUrl,
      is_custom:           el.fieldCustom()?.checked || false,
      turnaround_days:     (() => {
        const v = el.fieldTurnaround()?.value;
        if (v === '' || v == null) return null;
        const n = parseInt(v, 10);
        return isNaN(n) ? null : n;
      })(),
      is_quote_based:      isQuote,
      is_active:           el.fieldIsActive()?.checked !== false,
      shipping_offered:    el.fieldShipping()?.checked || false,
      pickup_only:         el.fieldPickupOnly()?.checked || false,
    };

    return payload;
  };

  const validate = (payload) => {
    if (!payload.product_name)  return 'Please enter a product name.';
    if (!payload.is_quote_based) {
      const p = payload.price;
      if (p == null || p <= 0) return 'Please enter a valid price, or check "Price on request".';
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
        const existing = products.find(p => p.id === editingId);
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
        result = await window.LokaliAPI.products.update(editingId, payload);
      } else {
        result = await window.LokaliAPI.products.create(payload);
      }

      if (result.error) {
        if (result.data?.error_code === 'PRODUCT_LIMIT_REACHED') {
          throw new Error('You\'ve reached your product limit. Upgrade your plan to add more.');
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
        saveBtn.textContent = 'Save product';
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

  const handleDeactivate = async (productId) => {
    const product   = products.find(p => p.id === productId);
    const confirmed = window.confirm(
      `Deactivate "${product?.product_name || 'this product'}"? It will move to your inactive list and you can reactivate it anytime.`
    );
    if (!confirmed) return;

    try {
      const result = await window.LokaliAPI.products.delete(productId);
      if (result.error) throw new Error(result.error);
      await loadData();
      showListView();
    } catch (err) {
      showError(err.message || 'Could not deactivate product. Please try again.');
    }
  };

  const onDragStart = (e) => {
    const sortVal = el.sortSelect()?.value;
    if (sortVal && sortVal !== 'custom') {
      e.preventDefault();
      return;
    }
    dragSrc = e.currentTarget;
    setTimeout(() => dragSrc?.classList.add('product-card--dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnd = () => {
    el.stack()?.querySelectorAll(STACK_CARD_SEL).forEach(c => {
      c.classList.remove('product-card--dragging', 'product-card--drag-over');
    });
    fixLastCard();
    persistSortOrder();
  };

  const onDragOver = (e) => {
    e.preventDefault();
    const target = e.currentTarget;
    if (!target || target === dragSrc) return;

    el.stack()?.querySelectorAll(STACK_CARD_SEL).forEach(c =>
      c.classList.remove('product-card--drag-over')
    );
    target.classList.add('product-card--drag-over');

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
        id:         parseInt(card.dataset.productId),
        sort_order: index,
      }))
      .filter(o => !isNaN(o.id));

    try {
      await Promise.all(
        updates.map(o =>
          window.LokaliAPI.products.update(o.id, { sort_order: o.sort_order })
        )
      );
    } catch (err) {
      console.error('[ProductsPage] Reorder error:', err);
    }
  };

  const loadData = async () => {
    const [productsRes, billingRes] = await Promise.all([
      window.LokaliAPI.products.getMine(true),
      window.LokaliAPI.plans.getMyBilling(),
    ]);

    if (productsRes.error) throw new Error(productsRes.error);

    products = normalizeProductList(productsRes.data);

    const billing = billingRes?.data;
    _maxProducts = billing?.features?.max_products
                ?? billing?.subscription?.max_products
                ?? null;

    products.sort((a, b) => {
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
    const sortWrapper = document.getElementById('products-sort');
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

    el.fieldQuoteBased()?.addEventListener('change', updatePriceVisibility);

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
      window.LokaliDashboard.preventFormSubmit('#products-form');
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

      if (typeof window !== 'undefined' && window.__lokaliProductsFinalInitDone) {
        return;
      }
      if (typeof window !== 'undefined') window.__lokaliProductsFinalInitDone = true;
      bindEvents();
      await loadData();
    } catch (err) {
      console.error('[ProductsPage] init error:', err);
      products = [];
      _maxProducts = null;
      try {
        renderList();
      } catch (_e) {}
    }
  };

  return { init, reconcileListDom };

})();

(function startLokaliProductsPage() {
  function go() {
    if (!window.LokaliAPI || !window.LokaliDashboard) {
      return false;
    }
    if (typeof window !== 'undefined' && window.__lokaliProductsPageBootstrapDone) {
      return true;
    }
    if (typeof window !== 'undefined') window.__lokaliProductsPageBootstrapDone = true;

    LokaliProductsPage.init();
    window.addEventListener('load', function onProdsLoad() {
      window.removeEventListener('load', onProdsLoad);
      if (typeof LokaliProductsPage.reconcileListDom === 'function') {
        LokaliProductsPage.reconcileListDom();
      }
    });
    return true;
  }

  function failMissingDeps() {
    console.error(
      '[ProductsPage] Missing LokaliAPI or LokaliDashboard. In Webflow: load lokali-api-client.js and lokali-dashboard.js first ' +
        '(Project Settings \u2192 Custom Code \u2192 Footer, or Before </body>), then this script after them \u2014 not in Head before <body>.'
    );
  }

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
