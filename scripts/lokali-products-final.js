

const LokaliProductsPage = (() => {

  // Delete is destructive — surface a danger color on hover (resting state stays
  // neutral grey so it doesn't shout). currentColor drives the trash SVG stroke.
  (function injectDeleteIconStyle() {
    if (document.getElementById('lok-icon-btn-delete-style')) return;
    var s = document.createElement('style');
    s.id = 'lok-icon-btn-delete-style';
    s.textContent = '.icon-btn--delete:hover{color:#C0152F;background:#FCEBED;border-color:#F2C4CB;}';
    (document.head || document.documentElement).appendChild(s);
  })();

  // #62 field-alignment + #61 required markers. Product name/description wrappers
  // carry a stray margin:0 20px (inset ~20px from the section headers and other
  // fields); two fields carry a stray margin-right:20px (ragged right edge). Zero
  // them so every row shares one left/right edge. Scoped to the form view.
  // `.lok-req` styles the required "*".
  (function injectFormPolishStyle() {
    if (document.getElementById('lok-products-form-polish-style')) return;
    var p = document.createElement('style');
    p.id = 'lok-products-form-polish-style';
    p.textContent =
      '#products-form-view .div-block-84,' +
      '#products-form-view .div-block-85{margin-left:0!important;margin-right:0!important;}' +
      '#products-form-view .div-block-121,' +
      '#products-form-view .div-block-123{margin-right:0!important;}' +
      // Checkbox boxes carried a leftover Webflow float-era margin (`-20px` on
      // Quote-based/Shipping/Pickup/Custom, `0` on Active) that left them
      // misaligned against the field column once the wrappers became flex.
      // Normalize: box sits at the wrapper's flex start (aligned with the inputs
      // above) with an 8px gap to its label.
      '#products-form-view .w-checkbox{padding-left:0!important;gap:0!important;align-items:center;}' +
      '#products-form-view .w-checkbox-input{margin:0 8px 0 0!important;}' +
      '#products-form-view .form-text-header .lok-req{color:#E0245E;font-weight:700;}' +
      // Description box was cramped (~2 visible lines for a 5000-char field) —
      // give it real room and let vendors drag it taller (Francesca 2026-07-20).
      '#products-form-view #product-description{min-height:180px!important;resize:vertical;}';
    (document.head || document.documentElement).appendChild(p);
  })();

  let products     = [];
  let editingId    = null;
  let imageRemoved = false;
  let dragSrc      = null;
  let _maxProducts = null;
  let _maxProductPhotos = null;   // gallery cap (Free=1, Pro/Featured=5)
  let _isProPlan = false;         // gallery is a Pro/Featured perk
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
    // The styled square on this page is the "thumbnail preview" element (a leftover copy
    // from the services form); #product-img-thumb is an unsized wrapper, so painting it
    // shows nothing. Prefer the element that actually has dimensions.
    imgThumb:       () => document.querySelector('#products-form-view .thumbnail-preview')
                       || document.getElementById('product-img-thumb'),
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
      inner.style.setProperty('background', '#FF8D00', 'important');
      inner.style.setProperty('background-color', '#FF8D00', 'important');
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
      if (_maxProducts != null && _maxProducts >= 100000) {
        // Pro/Featured store an "unlimited" cap as a large sentinel (e.g. 99999999).
        // Don't render the raw number — show that the plan is uncapped.
        countEl.textContent =
          `${activeCount} active product${activeCount === 1 ? '' : 's'} · unlimited on your plan`;
      } else if (_maxProducts != null) {
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

  // The product form grid carries manual cell placements copied from the services form,
  // which scatter/overlap the product fields (e.g. the Active checkbox over FULFILLMENT).
  // Flow it as a column instead so the (sensible) element order governs layout.
  const fixFormGridFlow = () => {
    const grid = document.querySelector('#products-form-view .w-layout-grid.product-form-grid')
              || document.querySelector('#products-form-view .w-layout-grid');
    if (!grid || grid.dataset.lokFlow) return;
    grid.dataset.lokFlow = '1';
    grid.style.setProperty('display', 'flex', 'important');
    grid.style.setProperty('flex-direction', 'column', 'important');
    grid.style.setProperty('align-items', 'stretch', 'important');
    grid.style.setProperty('gap', '18px', 'important');
  };

  // Line the self-mounted gallery up with the field column above it.
  const alignGalleryHost = () => {
    const host = document.getElementById('lok-product-gallery');
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
    // cover, so hide the standalone "Product image" field to avoid two competing
    // photo areas. Free keeps it (the gallery is locked for them).
    if (!_isProPlan) return;
    const anchor = el.imgThumb() || el.imgPlaceholder() || el.imgInput();
    if (!anchor) return;
    let section = anchor;
    while (section && !/product image/i.test(section.textContent || '')) section = section.parentElement;
    if (section) section.style.display = 'none';
  };

  const showFormView = () => {
    el.listView()?.style && (el.listView().style.display = 'none');
    el.formView()?.style && (el.formView().style.display = 'block');
    fixFormGridFlow();
    fixFormActionButtons();
    applyPhotoUI();
    alignGalleryHost();
    ensureSubcatUI();      // #96-LISTING
    renderSubcatPills();
    ensureLeadTimeUI();    // #78
    syncLeadInput(_legacyTurnaroundDays);
    renderLeadPresets();
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
    _selectedSubcat = product.subcategory || null; // #96-LISTING (pills re-render in showFormView)
    _leadTime = product.lead_time || null;         // #78 (input + chips re-render in showFormView)
    _legacyTurnaroundDays = product.turnaround_days != null ? product.turnaround_days : null;
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
    renderGallery(product.id);
    setVideoUrl(product.video_url);
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
    _selectedSubcat = null; // #96-LISTING
    _leadTime = null;       // #78
    _legacyTurnaroundDays = null;
    syncLeadInput(null);

    updatePriceVisibility();
    resetImagePreview();
    _pendingGalleryPhotos = [];
    renderGallery(null);
    setVideoUrl('');
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

  // ---------------------------------------------------------------------------
  // Optional showcase video (YouTube / Vimeo). Self-mounting input — no Webflow
  // edits. Mirrors the server-side validation; the public detail page re-parses
  // the id + allowlists the host before building the embed.
  // ---------------------------------------------------------------------------
  const VIDEO_URL_RE = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/|v\/)[\w-]{11}|youtu\.be\/[\w-]{11}|youtube-nocookie\.com\/embed\/[\w-]{11}|vimeo\.com\/\d{6,12}|player\.vimeo\.com\/video\/\d{6,12})/i;
  const isValidVideoUrl = (u) => VIDEO_URL_RE.test(String(u || '').trim());
  const VIDEO_HINT = 'Plays right on your listing. Works with YouTube (youtube.com / youtu.be) and Vimeo. Leave blank for none.';

  const markVideoValidity = () => {
    const inp = document.getElementById('lok-product-video-input');
    const hint = document.getElementById('lok-product-video-hint');
    if (!inp) return;
    const v = inp.value.trim();
    const bad = v && !isValidVideoUrl(v);
    inp.style.borderColor = bad ? '#E4739A' : '#E6E4F0';
    if (hint) { hint.style.color = bad ? '#B1006A' : '#8E8BA6'; hint.textContent = bad ? 'Enter a valid YouTube or Vimeo link (or leave blank).' : VIDEO_HINT; }
  };

  const videoHost = () => {
    let host = document.getElementById('lok-product-video');
    if (host) return host;
    // Mount right after the photo gallery (both edit + create call renderGallery
    // first, so the gallery host exists); fall back to the image section.
    const anchorEl = document.getElementById('lok-product-gallery') || el.imgPlaceholder() || el.imgThumb() || el.imgInput();
    if (!anchorEl) return null;
    host = document.createElement('div');
    host.id = 'lok-product-video';
    host.style.cssText = 'margin-top:16px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;';
    host.innerHTML =
      '<div style="font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:#4A4761;margin-bottom:8px;">Showcase video <span style="font-weight:500;text-transform:none;color:#8E8BA6;">· optional</span></div>' +
      '<input id="lok-product-video-input" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Paste a YouTube or Vimeo link" style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #E6E4F0;border-radius:10px;font-size:14px;font-family:inherit;color:#1A1829;background:#fff;" />' +
      '<div id="lok-product-video-hint" style="font-size:12px;color:#8E8BA6;margin-top:6px;line-height:1.5;">' + VIDEO_HINT + '</div>';
    const parent = anchorEl.parentElement || document.body;
    if (anchorEl.nextSibling) parent.insertBefore(host, anchorEl.nextSibling);
    else parent.appendChild(host);
    const inp = host.querySelector('#lok-product-video-input');
    if (inp) inp.addEventListener('input', markVideoValidity);
    return host;
  };
  const videoInput = () => { videoHost(); return document.getElementById('lok-product-video-input'); };
  const readVideoUrl = () => (videoInput()?.value || '').trim();
  const setVideoUrl = (v) => { const inp = videoInput(); if (inp) inp.value = v || ''; markVideoValidity(); };

  // ---------------------------------------------------------------------------
  // Per-product photo gallery (Pro & Featured). Self-mounting — no Webflow edits.
  // Photos attach to a saved product id, so the gallery only enables in edit mode.
  // ---------------------------------------------------------------------------
  const XANO_ORIGIN = 'https://x8ki-letl-twmt.n7.xano.io';
  let _galleryBusy = false;

  const photoUrl = (u) => {
    if (!u) return '';
    const s = String(u).trim();
    // This value is interpolated into innerHTML below — block javascript:/data:
    // schemes, protocol-relative //host, and chars that break out of the src="".
    if (!s || /[\s"'<>`\\]/.test(s) || /^(?:javascript|data|vbscript):/i.test(s)) return '';
    if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s;
    if (s.indexOf('//') === 0) return '';
    if (s.indexOf('/') === 0) return XANO_ORIGIN + s;
    return s;
  };

  const galleryHost = () => {
    let host = document.getElementById('lok-product-gallery');
    if (host) return host;
    const anchorEl = el.imgPlaceholder() || el.imgThumb() || el.imgInput();
    if (!anchorEl) return null;
    // Mount the gallery right after the "Product image" section so Photos lead the
    // form. That section sits ABOVE the form grid, so the host never becomes a grid
    // item (which would break field placement). Fall back to after the grid.
    let wrap = anchorEl;
    while (wrap && !/product image/i.test(wrap.textContent || '')) wrap = wrap.parentElement;
    if (!wrap) wrap = anchorEl.closest('.w-layout-grid') || anchorEl.closest('[class*="grid"]') ||
      anchorEl.closest('.w-form, .form-field, [class*="image"], [class*="upload"]') || anchorEl.parentElement;
    host = document.createElement('div');
    host.id = 'lok-product-gallery';
    host.style.cssText = 'margin-top:16px;font-family:"Plus Jakarta Sans",system-ui,sans-serif;';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.id = 'lok-product-gallery-input';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', onGalleryFile);
    host.appendChild(fileInput);
    const body = document.createElement('div');
    body.id = 'lok-product-gallery-body';
    host.appendChild(body);
    if (wrap && wrap.parentElement) wrap.parentElement.insertBefore(host, wrap.nextSibling);
    else (anchorEl.parentElement || document.body).appendChild(host);
    return host;
  };

  const galleryInput = () => document.getElementById('lok-product-gallery-input');

  let _galleryPhotos = [];
  // Add-mode staging: photos uploaded to storage but not yet attached (a brand-new
  // product has no id until it's saved). On Save the product is created, then each
  // of these is attached to its id — so vendors add photos while creating an item
  // exactly like when editing, with no "save first, then reopen" step.
  let _pendingGalleryPhotos = [];

  const renderGallery = async (productId) => {
    const host = galleryHost();
    if (!host) return;
    const body = document.getElementById('lok-product-gallery-body');
    if (!body) return;

    const title = '<div style="font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:#4A4761;margin-bottom:8px;">Photos</div>' +
      '<a href="/vendor-resources/product-photo-guide" target="_blank" rel="noopener" ' +
      'style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#ee6002;text-decoration:none;margin:-2px 0 12px;">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;"><circle cx="12" cy="12" r="9" stroke="#ee6002" stroke-width="2"/><path d="M12 11v5M12 8h.01" stroke="#ee6002" stroke-width="2" stroke-linecap="round"/></svg>' +
      'Photo size &amp; tips guide</a>';

    // Locked for Free plans
    if (!_isProPlan) {
      body.innerHTML = title +
        '<div style="color:#4A4761;font-size:14px;line-height:1.5;">' +
        '🔒 Add a <strong>photo gallery</strong> with Pro &amp; Featured — show up to 5' +
        ' images per product so customers see more before they buy.</div>';
      return;
    }
    // New product (no id yet): stage photos in the browser — they attach to the
    // product on Save, so vendors add photos while creating, not after.
    if (productId == null) {
      renderPendingGallery(body, title);
      return;
    }

    body.innerHTML = title + '<div style="font-size:13px;color:#8E8BA6;">Loading photos…</div>';
    const res = await window.LokaliAPI.products.listPhotos(productId);
    if (res.error) {
      body.innerHTML = title + '<div style="font-size:13px;color:#B1006A;">Couldn’t load gallery photos.</div>';
      return;
    }
    const raw = res.data;
    _galleryPhotos = (Array.isArray(raw) ? raw : (raw?.items || raw?.records || raw?.data || []))
      .filter(p => p && p.is_active !== false)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));

    const cap = _maxProductPhotos || 5;
    const count = _galleryPhotos.length;

    let html = title +
      '<div style="font-size:12px;color:#8E8BA6;margin-bottom:8px;">' + count + ' of ' + cap + ' photos · the first photo is your cover' +
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
      html += '<div style="font-size:12px;color:#8E8BA6;margin-top:8px;">You’ve reached your ' + cap + '-photo limit for this product.</div>';
    }
    body.innerHTML = html;
    // Set image src via property (never interpolate the uploaded URL into an
    // attribute string) so a crafted image_url can't inject markup.
    body.querySelectorAll('img[data-photo-idx]').forEach((im) => {
      const gp = _galleryPhotos[parseInt(im.getAttribute('data-photo-idx'), 10)];
      if (gp) im.src = photoUrl(gp.image_url);
    });

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
  // the cover. All of these attach to the product on Save (see handleSave).
  const renderPendingGallery = (body, title) => {
    const cap = _maxProductPhotos || 5;
    const count = _pendingGalleryPhotos.length;
    const arrowStyle = 'position:absolute;bottom:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(26,24,41,.72);color:#fff;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;';
    let html = title +
      '<div style="font-size:12px;color:#8E8BA6;margin-bottom:8px;">' + count + ' of ' + cap + ' photos · the first photo is your cover' +
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
      (count ? 'These photos are added to your product when you hit Save.' : 'Add up to ' + cap + ' photos — they’re saved with your product.') + '</div>';
    body.innerHTML = html;
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
        .map(({ p, idx }) => window.LokaliAPI.products.updatePhoto(p.id, { sort_order: idx }));
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

    // Add mode (no product id yet): upload to storage and stage locally — the
    // photo attaches to the product on Save. No addPhoto call (nothing to attach to).
    if (!editingId) {
      const cap = _maxProductPhotos || 5;
      if (_pendingGalleryPhotos.length >= cap) { if (gi) gi.value = ''; return; }
      _galleryBusy = true;
      const addBtn0 = document.getElementById('lok-gallery-add');
      if (addBtn0) { addBtn0.textContent = '…'; addBtn0.style.pointerEvents = 'none'; }
      try {
        const up = await window.LokaliAPI.products.uploadProductImage(file);
        if (up.error) throw new Error(up.error);
        const pp = up.data?.path || up.data?.image_path || null;
        const purl = up.data?.url || up.data?.image_url || (pp ? (XANO_ORIGIN + pp) : null);
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
      const up = await window.LokaliAPI.products.uploadProductImage(file);
      if (up.error) throw new Error(up.error);
      const p = up.data?.path || up.data?.image_path || null;
      const url = up.data?.url || up.data?.image_url || (p ? (XANO_ORIGIN + p) : null);
      if (!url) throw new Error('Upload returned no URL');
      const sort = _galleryPhotos.length;
      const res = await window.LokaliAPI.products.addPhoto(editingId, url, sort);
      if (res.error) {
        if (res.data?.error_code === 'PRODUCT_PHOTO_LIMIT_REACHED' || /PHOTO_LIMIT/i.test(String(res.error))) {
          alert('You’ve reached the photo limit for this product on your current plan.');
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
      const res = await window.LokaliAPI.products.deletePhoto(photoId);
      if (res.error) alert('Could not remove photo: ' + res.error);
    } catch (e) {
      alert('Could not remove photo. Please try again.');
    } finally {
      _galleryBusy = false;
      await renderGallery(editingId);
      await syncCoverFromGallery();
    }
  };

  // After a user gallery action, the first photo becomes the cover. Persist it
  // immediately so the card/listing thumbnail updates without waiting for Save,
  // reusing the SAME full payload Save sends (Xano's PATCH requires all fields,
  // and this matches existing save behavior — no field is dropped). Only runs
  // after add/delete/reorder, never on initial open, so a legacy cover is safe.
  const syncCoverFromGallery = async () => {
    if (!_isProPlan || !editingId) return;
    const prod = products.find(p => p.id === editingId);
    const desired = _galleryPhotos.length ? _galleryPhotos[0].image_url : null;
    if (prod && prod.image_url === desired) return;
    const payload = buildPayload(desired);
    if (!payload.product_name || !payload.product_description) return; // form mid-edit/invalid — Save will handle it
    // #96-LISTING: the cover autosave must never commit a Specialty the vendor
    // is still deciding on (or revert one from a stale local row) — only the
    // explicit Save persists the tag.
    delete payload.subcategory;
    delete payload.lead_time;   // #78: same reason — only explicit Save persists it
    const res = await window.LokaliAPI.products.update(editingId, payload);
    if (res && !res.error && prod) prod.image_url = desired;
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

    // Showcase video: '' clears it, a valid URL sets it. Omit an invalid-but-nonempty
    // value so background autosaves don't fail — the explicit Save blocks it via validate().
    const vurl = readVideoUrl();
    if (vurl === '' || isValidVideoUrl(vurl)) payload.video_url = vurl;

    // #96-LISTING — only when the selector actually mounted; otherwise the key
    // is omitted and the saved value is left alone.
    if (_subcatUiMounted) payload.subcategory = _selectedSubcat;
    // #78: only send the key once the box is really on the page, so a form that
    // never mounted it can't null out a saved lead time.
    if (_leadUiMounted) payload.lead_time = _leadTime;

    return payload;
  };

  const validate = (payload) => {
    if (!payload.product_name)  return 'Please enter a product name.';
    if (!payload.product_description) return 'Please enter a product description.';
    if (!payload.is_quote_based) {
      const p = payload.price;
      if (p == null || p <= 0) return 'Please enter a valid price, or check "Price on request".';
    }
    if (readVideoUrl() && !isValidVideoUrl(readVideoUrl()))
      return 'Your video link must be a YouTube or Vimeo URL (or leave it blank).';
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

      // Unified photos (Pro/Featured): the gallery is the cover source — the first
      // photo becomes the card/listing thumbnail. The standalone image field is hidden.
      // Edit mode reads the attached gallery; add mode reads the staged photos.
      if (_isProPlan) {
        if (Array.isArray(_galleryPhotos) && _galleryPhotos.length) {
          imageUrl = _galleryPhotos[0].image_url || imageUrl;
        } else if (_pendingGalleryPhotos.length) {
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

      // Add-mode staging: the product now exists, so attach the photos we staged
      // while it had no id. First staged photo is already the cover (set above).
      if (!editingId && _isProPlan && _pendingGalleryPhotos.length) {
        const newId = result.data?.id ?? result.data?.product?.id
          ?? (Array.isArray(result.data?.records) ? result.data.records[0]?.id : null) ?? null;
        if (newId != null) {
          for (let i = 0; i < _pendingGalleryPhotos.length; i++) {
            try { await window.LokaliAPI.products.addPhoto(newId, _pendingGalleryPhotos[i].url, i); } catch (e) {}
          }
        }
      }
      _pendingGalleryPhotos = [];

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
    // Both calls can transiently 429 on Xano's free tier (10 req/20s). If the
    // BILLING call loses that race, plan detection falls back to "free" and the
    // photo gallery wrongly locks for Pro/Featured vendors — so retry a few
    // times on a transient error before giving up. (vendors.me + billing are
    // memoized in the client, so retries don't re-hit the successful ones.)
    const isTransient = (r) =>
      r && r.error && /rate|429|whoa|requests per|timeout|network|cold/i.test(String(r.error));
    let productsRes, billingRes;
    for (let attempt = 0; ; attempt++) {
      [productsRes, billingRes] = await Promise.all([
        window.LokaliAPI.products.getMine(true),
        window.LokaliAPI.plans.getMyBilling(),
      ]);
      if (attempt >= 3 || !(isTransient(productsRes) || isTransient(billingRes))) break;
      await new Promise((r) => setTimeout(r, 1800 * (attempt + 1)));
    }

    if (productsRes.error) throw new Error(productsRes.error);

    products = normalizeProductList(productsRes.data);

    // Only trust the billing response when the call actually succeeded. On a
    // transient Xano free-tier 429/cold-start the call errors, and we must NOT
    // downgrade a paid vendor to "free" (that wrongly locks the photo gallery
    // mid-session). Cache the last-known-good plan and fall back to it instead.
    const PLAN_CACHE_KEY = 'lok_plan_products_v1';
    const billing = (billingRes && !billingRes.error) ? billingRes.data : null;

    if (billing) {
      _maxProducts = billing?.features?.max_products
                  ?? billing?.subscription?.max_products
                  ?? null;
      const planCode = String(
        billing?.plan_code
        ?? billing?.plan?.code
        ?? billing?.subscription?.plan_code
        ?? billing?.plan
        ?? 'free'
      ).toLowerCase();
      _isProPlan = planCode === 'pro' || planCode === 'featured';
      _maxProductPhotos = billing?.features?.max_product_photos
                       ?? billing?.subscription?.max_product_photos
                       ?? (_isProPlan ? 5 : 1);
      try {
        sessionStorage.setItem(PLAN_CACHE_KEY, JSON.stringify({ pro: _isProPlan, maxPhotos: _maxProductPhotos, maxItems: _maxProducts }));
      } catch (e) {}
    } else {
      // Billing call failed — reuse this session's last-known-good plan so a
      // hiccup doesn't lock a paid vendor's gallery. Only default to free/locked
      // if we've never seen a successful billing response this session.
      let cached = null;
      try { cached = JSON.parse(sessionStorage.getItem(PLAN_CACHE_KEY) || 'null'); } catch (e) {}
      _isProPlan = cached ? !!cached.pro : false;
      _maxProductPhotos = cached ? (cached.maxPhotos ?? (_isProPlan ? 5 : 1)) : 1;
      _maxProducts = cached ? (cached.maxItems ?? null) : null;
    }

    products.sort((a, b) => {
      const aOrder = a.sort_order ?? 9999;
      const bOrder = b.sort_order ?? 9999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    renderList();
    requestAnimationFrame(reconcileListDom);
  };

  // #61 required-field markers. Product name AND description are both required by
  // the Xano schema (validate() enforces both). Mark the static Webflow labels.
  const markRequiredFields = () => {
    ['product-name', 'product-description'].forEach((id) => {
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

  // ── #78: per-product LEAD TIME (free-text, display only) ──────────────────
  // "How long until this is ready?" — informational copy on the public listing
  // card + item page. SUPERSEDES the legacy numeric turnaround_days for
  // display: if the Webflow form still carries the old "Turnaround (days)"
  // number input, its wrapper is hidden here so vendors aren't asked the same
  // question twice — the stored value is left untouched (the public page falls
  // back to it when lead_time is empty), and any existing number seeds this
  // field's placeholder so the vendor can see what it used to say.
  let _leadUiMounted = false;
  let _leadTime = null;
  let _legacyTurnaroundDays = null;  // old numeric value, shown as a placeholder hint only
  const LEAD_PRESETS = ['Same day', '1–2 days', '3–5 days', 'About a week', '2–3 weeks'];
  const LEAD_MAXLEN = 60; // mirrors products_lead_time_shape in patch_lead_time.sql

  const hideLegacyTurnaroundField = () => {
    const t = el.fieldTurnaround();
    if (!t) return;
    // Hide the labelled cell, not just the input, so no orphan label remains.
    const cell = t.closest('.w-node, .form-field, .field-wrap, div') || t;
    if (cell && cell !== document.body) cell.style.display = 'none';
  };

  const ensureLeadTimeUI = () => {
    if (_leadUiMounted) return;
    // Same trap as the Specialty box: a stale cached client without lead_time
    // in PRODUCT_EDITABLE would strip the field in pick() and silently drop
    // the vendor's text under a success toast. No capability flag -> no box
    // (and the legacy Turnaround input stays visible as the fallback editor).
    if (!window.LokaliSupabaseAPI?.capabilities?.itemLeadTime) return;
    const anchor = el.fieldDescription();
    const host = anchor ? anchor.parentElement : null;
    if (!host) return;
    hideLegacyTurnaroundField();
    const wrap = document.createElement('div');
    wrap.id = 'lok-product-leadtime';
    wrap.style.cssText = "margin:14px 0 0;width:100%;box-sizing:border-box;font-family:'Plus Jakarta Sans',system-ui,sans-serif;";
    wrap.innerHTML =
      '<div style="font-size:13px;font-weight:600;color:#1A1829;margin-bottom:2px;">Lead time <span style="font-weight:400;color:#8E8BA6;">(optional)</span></div>' +
      '<p style="font-size:12.5px;color:#8E8BA6;margin:0 0 8px;">How long until this is ready for the customer? Shown on your listing so people know what to expect.</p>' +
      '<div data-lead-presets style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px;"></div>' +
      '<input data-lead-input class="w-input" maxlength="' + LEAD_MAXLEN + '" placeholder="e.g. Ready in ~2 weeks" style="width:100%;box-sizing:border-box;font-family:inherit;">' +
      '<p style="font-size:12px;color:#8E8BA6;margin:8px 0 0;line-height:1.45;">Tap a suggestion or write your own. This is a heads-up for customers — it doesn’t block anyone from ordering.</p>';
    host.appendChild(wrap);
    const inp = wrap.querySelector('[data-lead-input]');
    inp.addEventListener('input', () => {
      _leadTime = inp.value.trim() || null;
      renderLeadPresets();
    });
    _leadUiMounted = true;
    renderLeadPresets();
  };

  const renderLeadPresets = () => {
    const row = document.querySelector('#lok-product-leadtime [data-lead-presets]');
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
        _leadTime = on ? null : label;
        syncLeadInput();
        renderLeadPresets();
      });
      row.appendChild(b);
    });
  };

  const syncLeadInput = (legacyDays) => {
    const inp = document.querySelector('#lok-product-leadtime [data-lead-input]');
    if (!inp) return;
    inp.value = _leadTime || '';
    // Surface an old numeric turnaround as a hint so the vendor can see (and
    // re-type in their own words) what the listing is currently showing.
    inp.placeholder = (!_leadTime && legacyDays != null && legacyDays !== '')
      ? 'Currently showing: ' + legacyDays + ' days'
      : 'e.g. Ready in ~2 weeks';
  };

  // ── #96-LISTING: per-product specialty (one optional subcategory slug) ─────
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
  const SUBCAT_LABEL_RE = /^[A-Za-z0-9&'’\-+/() ]+$/;

  const loadSubcatTaxonomy = async () => {
    try {
      const sapi = window.LokaliSupabaseAPI;
      // capabilities.listingSubcategory: only mount when the LOADED client
      // whitelists products.subcategory — a stale cached client (7-day @v1.4
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
    wrap.id = 'lok-product-subcat';
    // Mounted INSIDE the description field's wrapper cell (below the textarea),
    // NOT as a sibling: the form is a Webflow grid (`_2-columns`) with
    // explicitly placed w-node cells — a new direct grid child gets
    // auto-placed into a leftover cell (it rendered top-right, clipped, on
    // first ship). Inside the cell = normal flow in SERVICE DETAILS.
    wrap.style.cssText = "margin:14px 0 0;width:100%;box-sizing:border-box;background:#eee6ff;border-radius:8px;padding:12px 14px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;";
    wrap.innerHTML =
      '<div style="font-size:13px;font-weight:600;color:#33254E;margin-bottom:2px;">Specialty</div>' +
      '<p style="font-size:12.5px;color:#5A5570;margin:0 0 10px;">Pick the one that fits this product best — customers filter The Market by these. Optional.</p>' +
      '<div data-subcat-pills role="radiogroup" aria-label="Specialty" style="display:flex;flex-wrap:wrap;gap:7px;"></div>' +
      '<div style="border-top:1px dashed #DCD2F2;margin-top:12px;padding-top:10px;">' +
        '<p style="font-size:12.5px;color:#5A5570;margin:0 0 8px;">Don’t see the right specialty?</p>' +
        '<div style="display:flex;gap:6px;">' +
          '<input data-subcat-suggest maxlength="40" placeholder="e.g. Power washing" style="flex:1;min-width:0;font-family:inherit;font-size:16px;padding:8px 12px;border:1px solid #C9BDE8;border-radius:8px;background:#fff;color:#1A1829;">' +
          '<button type="button" data-subcat-suggest-btn style="font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;border:1px solid #6002EE;background:#6002EE;color:#fff;cursor:pointer;">Suggest</button>' +
        '</div>' +
        '<p style="font-size:12px;color:#8E8BA6;margin:8px 0 0;line-height:1.45;">New specialties are reviewed first, so filters stay consistent — once approved, yours appears here for everyone.</p>' +
        '<p data-subcat-hint style="font-size:12px;color:#6B6787;margin:8px 0 0;line-height:1.45;"></p>' +
        '<div data-subcat-pending style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;"></div>' +
      '</div>';
    host.appendChild(wrap);
    wrap.querySelector('[data-subcat-suggest-btn]').addEventListener('click', submitSubcatSuggestion);
    const inp = wrap.querySelector('[data-subcat-suggest]');
    inp.addEventListener('input', subcatTypeahead);
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submitSubcatSuggestion(); } });
    _subcatUiMounted = true;
  };

  const renderSubcatPills = () => {
    const row = document.querySelector('#lok-product-subcat [data-subcat-pills]');
    if (!row || !_subcatList) return;
    row.innerHTML = '';
    const mk = (label, slug) => {
      const on = slug === _selectedSubcat;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('data-subcat-slug', slug == null ? '' : slug);
      b.style.cssText = 'font-family:inherit;font-size:14px;padding:8px 14px;border-radius:999px;cursor:pointer;line-height:1.3;transition:all .12s;' +
        (on ? 'background:#6002EE;border:1px solid #6002EE;color:#fff;font-weight:600;'
            : 'background:#fff;border:1px solid #C9BDE8;color:#5A5570;');
      b.addEventListener('click', () => {
        _selectedSubcat = slug;
        renderSubcatPills();
        const nb = row.querySelector('[data-subcat-slug="' + (slug == null ? '' : slug) + '"]');
        if (nb) nb.focus(); // re-render replaced the node — keep keyboard focus alive
      });
      row.appendChild(b);
    };
    mk('None', null);
    // A saved tag missing from the category's current list still renders —
    // visible + deselectable, never a silently-invisible current value.
    if (_selectedSubcat && !_subcatList.some(s => s.slug === _selectedSubcat)) mk(_selectedSubcat, _selectedSubcat);
    _subcatList.forEach(s => mk(s.label, s.slug));
    renderSubcatPending();
  };

  const renderSubcatPending = () => {
    const box = document.querySelector('#lok-product-subcat [data-subcat-pending]');
    if (!box) return;
    box.innerHTML = '';
    _subcatPendingSuggs.forEach(p => {
      const chip = document.createElement('span');
      const approved = p.status === 'approved';
      chip.textContent = approved
        ? ((p.final_label || p.suggested_label) + ' — approved ✓')
        : (p.suggested_label + ' — under review');
      chip.style.cssText = approved
        ? 'font-size:12px;padding:4px 12px;border-radius:999px;background:#EDFAF3;color:#1A6640;border:1px solid #A8DFC4;'
        : 'font-size:12px;padding:4px 12px;border-radius:999px;background:#FBF3D9;color:#8A6A00;border:1px solid #E8D48A;';
      box.appendChild(chip);
    });
  };

  const setSubcatHint = (text, tone) => {
    const hint = document.querySelector('#lok-product-subcat [data-subcat-hint]');
    if (!hint) return;
    hint.textContent = text || '';
    hint.style.color = tone === 'error' ? '#B3400F' : (tone === 'ok' ? '#1A6640' : '#6B6787');
  };

  const subcatTypeahead = () => {
    const inp = document.querySelector('#lok-product-subcat [data-subcat-suggest]');
    const hint = document.querySelector('#lok-product-subcat [data-subcat-hint]');
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
        renderSubcatPills();
        inp.value = '';
        setSubcatHint('Selected — it saves with this product.', 'ok');
      }
    });
    hint.appendChild(link);
    hint.appendChild(document.createTextNode('? Tap it to select.'));
    hint.style.color = '#6B6787';
  };

  const submitSubcatSuggestion = async () => {
    const inp = document.querySelector('#lok-product-subcat [data-subcat-suggest]');
    if (!inp) return;
    const label = String(inp.value || '').replace(/\s+/g, ' ').trim();
    if (_subcatCategoryId == null) { setSubcatHint('Pick your business category on the profile page first.', 'error'); return; }
    if (label.length < 3 || label.length > 40 || !SUBCAT_LABEL_RE.test(label) || !/[A-Za-z0-9]/.test(label)) {
      setSubcatHint('3–40 characters — letters, numbers and simple punctuation.', 'error');
      return;
    }
    const sapi = window.LokaliSupabaseAPI;
    if (!sapi?.subcategories?.suggest) return;
    setSubcatHint('Sending…');
    try {
      // Attach the listing being edited (if any) — approval then auto-tags it.
      const out = await sapi.subcategories.suggest(_subcatCategoryId, label,
        editingId ? { products_id: editingId } : null);
      const d = out?.data;
      if (!d || out.error) { setSubcatHint('Hit a snag — try again in a moment.', 'error'); return; }
      if (d.ok) {
        _subcatPendingSuggs.unshift({ category_id: _subcatCategoryId, suggested_label: label, status: 'pending' });
        renderSubcatPending();
        inp.value = '';
        setSubcatHint(editingId
          ? 'Thanks! Once approved, this product gets the specialty automatically.'
          : 'Thanks! We review suggestions so filters stay consistent — once approved it appears right here.', 'ok');
      } else if (d.reason === 'exists' && d.slug) {
        // Select the returned slug directly — even if this page's taxonomy is
        // stale, the unknown-slug pill renders it (never "reload" advice that
        // would destroy an unsaved draft).
        _selectedSubcat = d.slug;
        renderSubcatPills();
        inp.value = '';
        setSubcatHint('That one already exists — selected it for you.', 'ok');
      } else if (d.reason === 'already_suggested') setSubcatHint('You already suggested this one — it’s under review.', 'error');
      else if (d.reason === 'pending_limit') setSubcatHint('You have 3 suggestions under review — hang tight.', 'error');
      else if (d.reason === 'invalid_label') setSubcatHint('3–40 characters — letters, numbers and simple punctuation.', 'error');
      else setSubcatHint('Couldn’t submit that — try different wording.', 'error');
    } catch (e) { setSubcatHint('Hit a snag — try again in a moment.', 'error'); }
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
      loadSubcatTaxonomy(); // #96-LISTING — fire-and-forget; selector mounts when it lands
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
