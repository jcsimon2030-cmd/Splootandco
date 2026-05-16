/* =========================================================
   SPLOOT & CO — theme.js
   Vanilla + Web Components. No framework.
   ========================================================= */

(() => {
  'use strict';

  /* ----------------------------------------
     <site-header> — sticky shadow + mobile nav toggle
     ---------------------------------------- */
  class SiteHeader extends HTMLElement {
    connectedCallback() {
      this.toggle = this.querySelector('.header__menu-toggle');
      this.mobileNav = this.querySelector('.header__mobile-nav');

      if (this.toggle && this.mobileNav) {
        this.toggle.addEventListener('click', () => this.toggleNav());
      }

      this.cartLinks = this.querySelectorAll('[data-cart-toggle]');
      this.cartLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          // Open drawer only on desktop. Mobile keeps native /cart navigation.
          if (window.matchMedia('(min-width: 750px)').matches) {
            const drawer = document.getElementById('CartDrawer');
            if (drawer) {
              e.preventDefault();
              drawer.open();
            }
          }
        });
      });
    }

    toggleNav() {
      const open = this.toggle.getAttribute('aria-expanded') === 'true';
      this.toggle.setAttribute('aria-expanded', String(!open));
      if (open) {
        this.mobileNav.setAttribute('hidden', '');
      } else {
        this.mobileNav.removeAttribute('hidden');
      }
    }
  }
  customElements.define('site-header', SiteHeader);

  /* ----------------------------------------
     <product-form> — async add to cart + variant sync
     ---------------------------------------- */
  class ProductForm extends HTMLElement {
    connectedCallback() {
      this.form = this.querySelector('form');
      this.variantInput = this.querySelector('[data-variant-id]');
      this.submitBtn = this.querySelector('button[type="submit"]');
      this.label = this.querySelector('[data-add-label]');

      const dataEl = document.querySelector('[data-product-json]');
      try {
        this.product = dataEl ? JSON.parse(dataEl.textContent) : null;
      } catch (e) {
        this.product = null;
      }

      // Variant sync via option radios
      this.querySelectorAll('input[type="radio"][name^="options"]').forEach(radio => {
        radio.addEventListener('change', () => this.handleOptionChange());
      });

      if (this.form) {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
      }
    }

    selectedOptions() {
      const selected = [];
      this.querySelectorAll('fieldset[data-option-index]').forEach(set => {
        const checked = set.querySelector('input[type="radio"]:checked');
        if (checked) selected.push(checked.value);
      });
      return selected;
    }

    handleOptionChange() {
      if (!this.product) return;
      const chosen = this.selectedOptions();
      const match = this.product.variants.find(v =>
        v.options.length === chosen.length &&
        v.options.every((opt, i) => opt === chosen[i])
      );
      if (!match) return;

      this.variantInput.value = match.id;

      if (this.label) {
        if (match.available) {
          this.label.textContent = 'Add to cart';
          this.submitBtn.removeAttribute('disabled');
        } else {
          this.label.textContent = 'Sold out';
          this.submitBtn.setAttribute('disabled', '');
        }
      }

      // Update URL for sharing
      if (history.replaceState) {
        const url = new URL(window.location);
        url.searchParams.set('variant', match.id);
        history.replaceState({}, '', url);
      }

      this.dispatchEvent(new CustomEvent('variant:change', { detail: { variant: match }, bubbles: true }));
    }

    async handleSubmit(e) {
      e.preventDefault();
      if (!this.submitBtn || this.submitBtn.disabled) return;

      this.submitBtn.setAttribute('disabled', '');
      const original = this.label ? this.label.textContent : '';
      if (this.label) this.label.textContent = 'Adding…';

      try {
        const formData = new FormData(this.form);
        const res = await fetch(window.Shopify?.routes?.root ? `${Shopify.routes.root}cart/add.js` : '/cart/add.js', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: formData
        });
        if (!res.ok) throw new Error('Add to cart failed');
        await res.json();

        if (this.label) this.label.textContent = 'Added ✓';

        const drawer = document.getElementById('CartDrawer');
        if (drawer && window.matchMedia('(min-width: 750px)').matches) {
          await drawer.refresh();
          drawer.open();
        } else {
          // On mobile, just refresh count
          await refreshCartCount();
        }

        setTimeout(() => {
          if (this.label) this.label.textContent = original;
          this.submitBtn.removeAttribute('disabled');
        }, 1200);
      } catch (err) {
        console.error(err);
        if (this.label) this.label.textContent = 'Try again';
        this.submitBtn.removeAttribute('disabled');
      }
    }
  }
  customElements.define('product-form', ProductForm);

  /* ----------------------------------------
     <cart-drawer> — overlay slide-in cart
     ---------------------------------------- */
  class CartDrawer extends HTMLElement {
    constructor() {
      super();
      this._opened = false;
    }

    connectedCallback() {
      this.removeAttribute('hidden');
      this.style.visibility = 'hidden';
      this.refresh();

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._opened) this.close();
      });
    }

    async refresh() {
      try {
        const res = await fetch('/cart.js', { headers: { 'Accept': 'application/json' } });
        const cart = await res.json();
        this.render(cart);
        updateCartCountUI(cart.item_count);
      } catch (e) {
        console.warn('Cart fetch failed', e);
      }
    }

    render(cart) {
      const items = cart.items.map(item => `
        <li class="drawer-item">
          <a href="${item.url}" class="drawer-item__media">
            ${item.image ? `<img src="${item.image}" alt="" width="80" height="80" loading="lazy">` : ''}
          </a>
          <div class="drawer-item__detail">
            <a href="${item.url}" class="drawer-item__name">${escapeHTML(item.product_title)}</a>
            ${item.variant_title && item.variant_title !== 'Default Title' ? `<small>${escapeHTML(item.variant_title)}</small>` : ''}
            <div class="drawer-item__row">
              <span class="drawer-item__qty">Qty ${item.quantity}</span>
              <span class="drawer-item__price">${formatMoney(item.final_line_price)}</span>
            </div>
            <button type="button" class="drawer-item__remove" data-remove-key="${item.key}">Remove</button>
          </div>
        </li>
      `).join('');

      this.innerHTML = `
        <div class="drawer__overlay" data-close></div>
        <aside class="drawer__panel" role="dialog" aria-label="Cart">
          <header class="drawer__head">
            <h2 class="drawer__title">Cart · ${cart.item_count}</h2>
            <button type="button" class="drawer__close" data-close aria-label="Close">×</button>
          </header>
          <div class="drawer__body">
            ${cart.items.length === 0
              ? `<p class="drawer__empty">Your cart is empty.</p>`
              : `<ul class="drawer__items">${items}</ul>`}
          </div>
          <footer class="drawer__foot">
            <div class="drawer__total">
              <span>Subtotal</span>
              <strong>${formatMoney(cart.total_price)}</strong>
            </div>
            <a href="/checkout" class="btn btn--solid btn--lg drawer__checkout"${cart.items.length === 0 ? ' aria-disabled="true" style="pointer-events:none;opacity:.4;"' : ''}>Checkout</a>
            <a href="/cart" class="drawer__view-cart">View full cart →</a>
          </footer>
        </aside>
      `;

      this.style.visibility = 'visible';

      this.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => this.close()));
      this.querySelectorAll('[data-remove-key]').forEach(el => {
        el.addEventListener('click', () => this.removeItem(el.dataset.removeKey));
      });
    }

    async removeItem(key) {
      try {
        await fetch('/cart/change.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ id: key, quantity: 0 })
        });
        this.refresh();
      } catch (e) { console.warn(e); }
    }

    open() {
      this._opened = true;
      this.setAttribute('open', '');
      document.body.style.overflow = 'hidden';
    }

    close() {
      this._opened = false;
      this.removeAttribute('open');
      document.body.style.overflow = '';
    }
  }
  customElements.define('cart-drawer', CartDrawer);

  /* ----------------------------------------
     <quick-view> — fetch product, render modal,
     async add to cart without leaving the page
     ---------------------------------------- */
  class QuickView extends HTMLElement {
    constructor() {
      super();
      this._opened = false;
      this._cache = new Map();
    }

    connectedCallback() {
      this.removeAttribute('hidden');
      this.style.visibility = 'hidden';

      document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-quick-view]');
        if (trigger) {
          e.preventDefault();
          const handle = trigger.dataset.productHandle;
          if (handle) this.openHandle(handle);
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._opened) this.close();
      });
    }

    async openHandle(handle) {
      this.renderLoading();
      this.open();

      let product = this._cache.get(handle);
      if (!product) {
        try {
          const res = await fetch(`/products/${handle}.js`, { headers: { 'Accept': 'application/json' } });
          if (!res.ok) throw new Error('Product fetch failed');
          product = await res.json();
          this._cache.set(handle, product);
        } catch (e) {
          this.renderError();
          return;
        }
      }
      this.render(product);
    }

    renderLoading() {
      this.innerHTML = `
        <div class="qv__overlay" data-close></div>
        <aside class="qv__panel" role="dialog" aria-label="Quick view" aria-busy="true">
          <p class="qv__loading">Loading…</p>
        </aside>`;
      this.style.visibility = 'visible';
      this.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => this.close()));
    }

    renderError() {
      this.innerHTML = `
        <div class="qv__overlay" data-close></div>
        <aside class="qv__panel" role="dialog">
          <button type="button" class="qv__close" data-close aria-label="Close">×</button>
          <p class="qv__loading">Something went wrong. Try the full product page.</p>
        </aside>`;
      this.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => this.close()));
    }

    render(product) {
      const firstAvailable = product.variants.find(v => v.available) || product.variants[0];
      const optionsHTML = product.options.map((opt, idx) => {
        const values = [...new Set(product.variants.map(v => v.options[idx]))];
        const swatches = values.map(v => {
          const id = `qv-opt-${idx}-${v.replace(/\W+/g, '-')}`;
          const checked = firstAvailable.options[idx] === v ? 'checked' : '';
          return `
            <input type="radio" id="${id}" name="qv-opt-${idx}" value="${escapeHTML(v)}" ${checked}>
            <label for="${id}" class="product__swatch">${escapeHTML(v)}</label>`;
        }).join('');
        return `
          <fieldset class="product__option" data-option-index="${idx}">
            <legend class="product__option-name">${escapeHTML(opt)}</legend>
            <div class="product__option-values">${swatches}</div>
          </fieldset>`;
      }).join('');

      const img = product.featured_image || (product.images && product.images[0]);

      this.innerHTML = `
        <div class="qv__overlay" data-close></div>
        <aside class="qv__panel" role="dialog" aria-label="${escapeHTML(product.title)}">
          <button type="button" class="qv__close" data-close aria-label="Close">×</button>
          <div class="qv__layout">
            <div class="qv__media">
              ${img ? `<img src="${img}" alt="${escapeHTML(product.title)}" width="600" height="750">` : ''}
            </div>
            <div class="qv__info">
              ${product.vendor ? `<p class="product__vendor">${escapeHTML(product.vendor)}</p>` : ''}
              <h2 class="qv__title">${escapeHTML(product.title)}</h2>
              <p class="qv__price" data-qv-price>${formatMoney(firstAvailable.price)}</p>

              <form class="qv__form" data-qv-form>
                <input type="hidden" name="id" value="${firstAvailable.id}" data-qv-variant>
                ${product.has_only_default_variant ? '' : `<div class="product__options">${optionsHTML}</div>`}
                <div class="product__buy">
                  <label class="product__qty">
                    <span class="visually-hidden">Quantity</span>
                    <input type="number" name="quantity" value="1" min="1" inputmode="numeric">
                  </label>
                  <button type="submit" class="btn btn--solid btn--lg" data-qv-add>
                    <span data-qv-add-label>${firstAvailable.available ? 'Add to cart' : 'Sold out'}</span>
                  </button>
                </div>
              </form>

              <a href="/products/${product.handle}" class="qv__view-full">View full details →</a>
            </div>
          </div>
        </aside>`;

      this._product = product;
      this.bindForm();
    }

    bindForm() {
      this.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => this.close()));
      this.querySelectorAll('input[type="radio"][name^="qv-opt"]').forEach(r => {
        r.addEventListener('change', () => this.syncVariant());
      });
      const form = this.querySelector('[data-qv-form]');
      if (form) form.addEventListener('submit', (e) => this.handleAdd(e));
    }

    selectedOptions() {
      const selected = [];
      this.querySelectorAll('fieldset[data-option-index]').forEach(set => {
        const checked = set.querySelector('input[type="radio"]:checked');
        if (checked) selected.push(checked.value);
      });
      return selected;
    }

    syncVariant() {
      const chosen = this.selectedOptions();
      const match = this._product.variants.find(v =>
        v.options.length === chosen.length &&
        v.options.every((opt, i) => opt === chosen[i])
      );
      if (!match) return;
      const variantInput = this.querySelector('[data-qv-variant]');
      const priceEl = this.querySelector('[data-qv-price]');
      const label = this.querySelector('[data-qv-add-label]');
      const addBtn = this.querySelector('[data-qv-add]');
      if (variantInput) variantInput.value = match.id;
      if (priceEl) priceEl.textContent = formatMoney(match.price);
      if (label && addBtn) {
        if (match.available) {
          label.textContent = 'Add to cart';
          addBtn.removeAttribute('disabled');
        } else {
          label.textContent = 'Sold out';
          addBtn.setAttribute('disabled', '');
        }
      }
    }

    async handleAdd(e) {
      e.preventDefault();
      const form = e.target;
      const addBtn = form.querySelector('[data-qv-add]');
      const label = form.querySelector('[data-qv-add-label]');
      if (!addBtn || addBtn.disabled) return;

      addBtn.setAttribute('disabled', '');
      const original = label ? label.textContent : '';
      if (label) label.textContent = 'Adding…';

      try {
        const res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: new FormData(form)
        });
        if (!res.ok) throw new Error('add failed');
        await res.json();

        if (label) label.textContent = 'Added ✓';
        const drawer = document.getElementById('CartDrawer');
        if (drawer) {
          await drawer.refresh();
          this.close();
          if (window.matchMedia('(min-width: 750px)').matches) drawer.open();
        } else {
          await refreshCartCount();
        }
        setTimeout(() => {
          if (label) label.textContent = original;
          addBtn.removeAttribute('disabled');
        }, 1000);
      } catch (err) {
        console.error(err);
        if (label) label.textContent = 'Try again';
        addBtn.removeAttribute('disabled');
      }
    }

    open() {
      this._opened = true;
      this.setAttribute('open', '');
      document.body.style.overflow = 'hidden';
    }

    close() {
      this._opened = false;
      this.removeAttribute('open');
      document.body.style.overflow = '';
    }
  }
  customElements.define('quick-view', QuickView);

  /* ----------------------------------------
     <predictive-search> — header dropdown that
     queries /search/suggest.json
     ---------------------------------------- */
  class PredictiveSearch extends HTMLElement {
    connectedCallback() {
      this.input = this.querySelector('[data-predictive-input]');
      this.results = this.querySelector('[data-predictive-results]');
      this.toggle = document.querySelector('[data-search-toggle]');
      this.closeBtn = this.querySelector('[data-search-close]');

      if (this.toggle) this.toggle.addEventListener('click', () => this.toggleOpen());
      if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());

      let timer;
      if (this.input) {
        this.input.addEventListener('input', () => {
          clearTimeout(timer);
          const q = this.input.value.trim();
          if (q.length < 2) { this.results.hidden = true; this.results.innerHTML = ''; return; }
          timer = setTimeout(() => this.query(q), 200);
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.hasAttribute('hidden')) this.close();
      });
    }

    toggleOpen() {
      if (this.hasAttribute('hidden')) this.open(); else this.close();
    }

    open() {
      this.removeAttribute('hidden');
      if (this.toggle) this.toggle.setAttribute('aria-expanded', 'true');
      setTimeout(() => this.input && this.input.focus(), 50);
    }

    close() {
      this.setAttribute('hidden', '');
      if (this.toggle) this.toggle.setAttribute('aria-expanded', 'false');
      if (this.results) { this.results.hidden = true; this.results.innerHTML = ''; }
      if (this.input) this.input.value = '';
    }

    async query(q) {
      try {
        const url = `/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product,collection&resources[limit]=6`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        const data = await res.json();
        this.renderResults(data.resources.results, q);
      } catch (e) {
        console.warn('Predictive search failed', e);
      }
    }

    renderResults(results, q) {
      const products = (results.products || []).map(p => `
        <a href="${p.url}" class="ps-result">
          ${p.image ? `<img src="${p.image}" alt="" width="48" height="48" loading="lazy">` : '<span class="ps-result__placeholder"></span>'}
          <span class="ps-result__detail">
            <span class="ps-result__name">${escapeHTML(p.title)}</span>
            <span class="ps-result__price">${p.price}</span>
          </span>
        </a>`).join('');

      const collections = (results.collections || []).map(c => `
        <a href="${c.url}" class="ps-collection">${escapeHTML(c.title)}</a>`).join('');

      const empty = !products && !collections;

      this.results.innerHTML = `
        ${empty ? `<p class="ps-empty">No matches for &ldquo;${escapeHTML(q)}&rdquo;.</p>` : ''}
        ${collections ? `<div class="ps-group"><p class="ps-label">Collections</p>${collections}</div>` : ''}
        ${products ? `<div class="ps-group"><p class="ps-label">Products</p>${products}</div>` : ''}
        <a href="/search?q=${encodeURIComponent(q)}" class="ps-see-all">See all results for &ldquo;${escapeHTML(q)}&rdquo; →</a>
      `;
      this.results.hidden = false;
    }
  }
  customElements.define('predictive-search', PredictiveSearch);

  /* ----------------------------------------
     <cookies-banner> — bottom-fixed accept/decline
     persisted via localStorage
     ---------------------------------------- */
  class CookiesBanner extends HTMLElement {
    connectedCallback() {
      const stored = (() => { try { return localStorage.getItem('sploot:cookies'); } catch (e) { return null; } })();
      if (stored === 'accepted' || stored === 'declined') return;

      this.removeAttribute('hidden');
      requestAnimationFrame(() => this.setAttribute('visible', ''));

      this.querySelector('[data-cookies-accept]')?.addEventListener('click', () => this.choose('accepted'));
      this.querySelector('[data-cookies-decline]')?.addEventListener('click', () => this.choose('declined'));
    }

    choose(value) {
      try { localStorage.setItem('sploot:cookies', value); } catch (e) {}
      this.removeAttribute('visible');
      setTimeout(() => this.setAttribute('hidden', ''), 240);
    }
  }
  customElements.define('cookies-banner', CookiesBanner);

  /* ----------------------------------------
     Sticky add-to-cart on mobile (product page)
     Appears once the main Add to Cart scrolls out.
     ---------------------------------------- */
  function initStickyAtc() {
    const sticky = document.querySelector('[data-sticky-atc]');
    const mainBtn = document.querySelector('.product__add');
    const mainForm = document.getElementById('ProductForm');
    if (!sticky || !mainBtn || !mainForm) return;

    const stickyBtn = sticky.querySelector('[data-sticky-add]');
    const stickyPrice = sticky.querySelector('[data-sticky-price]');

    // Update price when main variant changes
    mainForm.addEventListener('variant:change', (e) => {
      if (stickyPrice && e.detail?.variant) {
        stickyPrice.textContent = formatMoney(e.detail.variant.price);
      }
      if (stickyBtn && e.detail?.variant) {
        if (e.detail.variant.available) {
          stickyBtn.textContent = 'Add to cart';
          stickyBtn.removeAttribute('disabled');
        } else {
          stickyBtn.textContent = 'Sold out';
          stickyBtn.setAttribute('disabled', '');
        }
      }
    });

    // Sticky button just triggers the real form submission
    stickyBtn?.addEventListener('click', () => {
      mainForm.requestSubmit ? mainForm.requestSubmit() : mainForm.submit();
    });

    // Show/hide based on intersection of the main Add to Cart
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          sticky.removeAttribute('hidden');
          requestAnimationFrame(() => sticky.setAttribute('visible', ''));
        } else {
          sticky.removeAttribute('visible');
          setTimeout(() => sticky.setAttribute('hidden', ''), 240);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -80px 0px' });
    io.observe(mainBtn);
  }
  document.addEventListener('DOMContentLoaded', initStickyAtc);

  /* ----------------------------------------
     Collection filters — auto-submit, mobile toggle
     ---------------------------------------- */
  function initFilters() {
    const form = document.querySelector('[data-filters-form]');
    if (!form) return;

    const toggle = document.querySelector('[data-filters-toggle]');
    const closeBtn = document.querySelector('[data-filters-close]');
    const aside = document.getElementById('CollectionFilters');
    const count = document.querySelector('[data-filter-count]');

    function updateCount() {
      const n = form.querySelectorAll('input[type="checkbox"]:checked').length;
      if (count) count.textContent = n > 0 ? `(${n})` : '';
    }

    function openPanel() {
      aside?.setAttribute('open', '');
      toggle?.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
    function closePanel() {
      aside?.removeAttribute('open');
      toggle?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    toggle?.addEventListener('click', () => {
      if (aside?.hasAttribute('open')) closePanel(); else openPanel();
    });
    closeBtn?.addEventListener('click', closePanel);

    // Auto-submit on desktop only; on mobile wait for Apply button
    let debounceTimer;
    form.addEventListener('change', () => {
      updateCount();
      if (window.matchMedia('(min-width: 990px)').matches) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => form.submit(), 300);
      }
    });

    updateCount();
  }
  document.addEventListener('DOMContentLoaded', initFilters);

  /* ----------------------------------------
     Helpers
     ---------------------------------------- */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function formatMoney(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function updateCartCountUI(count) {
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? '' : 'none';
    });
  }

  async function refreshCartCount() {
    try {
      const res = await fetch('/cart.js', { headers: { 'Accept': 'application/json' } });
      const cart = await res.json();
      updateCartCountUI(cart.item_count);
    } catch (e) { console.warn(e); }
  }

  /* ----------------------------------------
     Init: hide cart count if zero on load
     ---------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      if (Number(el.textContent.trim()) === 0) el.style.display = 'none';
    });
  });

  /* ----------------------------------------
     Drawer styles injected (kept tight here so the
     drawer markup ships ready to use without users
     having to edit theme.css).
     ---------------------------------------- */
  const drawerCSS = `
    cart-drawer .drawer__overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.55);
      opacity: 0; pointer-events: none;
      transition: opacity 280ms ease;
    }
    cart-drawer[open] .drawer__overlay { opacity: 1; pointer-events: auto; }
    cart-drawer .drawer__panel {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    cart-drawer .drawer__head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--color-line);
    }
    cart-drawer .drawer__title {
      font-family: var(--font-heading-family);
      text-transform: uppercase;
      font-size: 1.1rem;
      margin: 0;
      letter-spacing: .05em;
    }
    cart-drawer .drawer__close {
      font-size: 1.8rem;
      line-height: 1;
      padding: 4px 8px;
    }
    cart-drawer .drawer__body { flex: 1; overflow-y: auto; padding: 16px 24px; }
    cart-drawer .drawer__items { display: flex; flex-direction: column; gap: 20px; }
    cart-drawer .drawer-item {
      display: grid;
      grid-template-columns: 80px 1fr;
      gap: 16px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--color-line);
    }
    cart-drawer .drawer-item__media { background: #181818; }
    cart-drawer .drawer-item__media img { width: 80px; height: 80px; object-fit: cover; display: block; }
    cart-drawer .drawer-item__detail { display: flex; flex-direction: column; gap: 4px; }
    cart-drawer .drawer-item__name {
      font-family: var(--font-heading-family);
      font-weight: 700;
      text-transform: uppercase;
      font-size: .9rem;
      letter-spacing: .02em;
    }
    cart-drawer .drawer-item small { color: var(--color-muted); font-family: var(--type-mono); font-size: .75rem; }
    cart-drawer .drawer-item__row {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-top: 4px;
      font-family: var(--type-mono);
      font-size: .85rem;
    }
    cart-drawer .drawer-item__remove {
      align-self: start;
      font-family: var(--type-mono);
      font-size: .7rem;
      text-transform: uppercase;
      letter-spacing: .15em;
      color: var(--color-muted);
      text-decoration: underline;
      text-underline-offset: 3px;
      margin-top: 4px;
    }
    cart-drawer .drawer-item__remove:hover { color: var(--color-accent); }
    cart-drawer .drawer__empty { color: var(--color-muted); text-align: center; padding: 64px 0; }
    cart-drawer .drawer__foot { padding: 20px 24px 28px; border-top: 1px solid var(--color-line); display: flex; flex-direction: column; gap: 12px; }
    cart-drawer .drawer__total { display: flex; justify-content: space-between; font-family: var(--type-mono); font-size: 1rem; }
    cart-drawer .drawer__checkout { width: 100%; }
    cart-drawer .drawer__view-cart {
      text-align: center;
      font-family: var(--type-mono);
      font-size: .75rem;
      text-transform: uppercase;
      letter-spacing: .15em;
      color: var(--color-muted);
      padding-top: 4px;
    }

    /* Quick view */
    quick-view {
      position: fixed; inset: 0;
      z-index: 200;
      display: flex; align-items: center; justify-content: center;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      transition: opacity 240ms ease;
    }
    quick-view[open] { opacity: 1; pointer-events: auto; }
    quick-view .qv__overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,.65);
    }
    quick-view .qv__panel {
      position: relative;
      background: var(--color-bg);
      color: var(--color-fg);
      border: 1px solid var(--color-line);
      width: min(960px, 100% - 32px);
      max-height: 90vh;
      overflow-y: auto;
    }
    quick-view .qv__close {
      position: absolute; top: 12px; right: 16px;
      font-size: 1.8rem; line-height: 1;
      padding: 4px 10px;
      z-index: 2;
    }
    quick-view .qv__layout { display: grid; gap: 0; }
    @media (min-width: 750px) {
      quick-view .qv__layout { grid-template-columns: 1fr 1fr; }
    }
    quick-view .qv__media { background: #181818; aspect-ratio: 4/5; overflow: hidden; }
    quick-view .qv__media img { width: 100%; height: 100%; object-fit: cover; }
    quick-view .qv__info { padding: 32px clamp(20px, 4vw, 40px); display: flex; flex-direction: column; }
    quick-view .qv__title {
      font-family: var(--font-heading-family);
      font-weight: 900;
      text-transform: uppercase;
      font-size: var(--size-step-3);
      line-height: 1;
      margin: 0 0 12px;
    }
    quick-view .qv__price {
      font-family: var(--type-mono);
      font-size: 1.1rem;
      margin: 0 0 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--color-line);
    }
    quick-view .qv__form { display: flex; flex-direction: column; gap: 24px; }
    quick-view .qv__view-full {
      margin-top: 20px;
      font-family: var(--type-mono);
      font-size: .8rem;
      text-transform: uppercase;
      letter-spacing: .15em;
      color: var(--color-muted);
    }
    quick-view .qv__view-full:hover { color: var(--color-accent); }
    quick-view .qv__loading { padding: 80px 40px; text-align: center; color: var(--color-muted); }

    /* Predictive search */
    predictive-search {
      display: block;
      border-top: 1px solid var(--color-line);
      border-bottom: 1px solid var(--color-line);
      background: var(--color-bg);
      position: relative;
      z-index: 60;
    }
    predictive-search[hidden] { display: none; }
    predictive-search .predictive-search__form {
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: var(--container-w);
      margin: 0 auto;
      padding: 16px var(--container-gutter);
    }
    predictive-search .predictive-search__form input {
      flex: 1;
      background: transparent;
      border: 0;
      border-bottom: 1.5px solid var(--color-fg);
      color: var(--color-fg);
      padding: 12px 0;
      font-family: var(--type-mono);
      font-size: 1rem;
      letter-spacing: .05em;
    }
    predictive-search .predictive-search__form input:focus { outline: none; border-color: var(--color-accent); }
    predictive-search .predictive-search__close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px; height: 40px;
    }
    predictive-search .predictive-search__close:hover { color: var(--color-accent); }
    predictive-search .predictive-search__results {
      max-width: var(--container-w);
      margin: 0 auto;
      padding: 0 var(--container-gutter) 24px;
      display: grid;
      gap: 24px;
    }
    @media (min-width: 750px) {
      predictive-search .predictive-search__results { grid-template-columns: 1fr 2fr auto; align-items: start; }
    }
    predictive-search .ps-empty { color: var(--color-muted); grid-column: 1 / -1; padding: 20px 0; }
    predictive-search .ps-label {
      font-family: var(--type-mono);
      text-transform: uppercase;
      letter-spacing: .2em;
      font-size: .7rem;
      color: var(--color-muted);
      margin: 0 0 12px;
    }
    predictive-search .ps-collection {
      display: block;
      padding: 10px 0;
      font-family: var(--font-heading-family);
      font-weight: 700;
      text-transform: uppercase;
      border-bottom: 1px solid var(--color-line);
    }
    predictive-search .ps-collection:hover { color: var(--color-accent); }
    predictive-search .ps-result {
      display: grid;
      grid-template-columns: 48px 1fr;
      gap: 12px;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--color-line);
    }
    predictive-search .ps-result:hover { color: var(--color-accent); }
    predictive-search .ps-result img { width: 48px; height: 48px; object-fit: cover; }
    predictive-search .ps-result__placeholder { width: 48px; height: 48px; background: #181818; display: block; }
    predictive-search .ps-result__detail { display: flex; flex-direction: column; gap: 2px; }
    predictive-search .ps-result__name { font-weight: 600; }
    predictive-search .ps-result__price { font-family: var(--type-mono); font-size: .8rem; color: var(--color-muted); }
    predictive-search .ps-see-all {
      align-self: end;
      font-family: var(--type-mono);
      text-transform: uppercase;
      letter-spacing: .15em;
      font-size: .8rem;
      border-bottom: 1px solid currentColor;
      padding-bottom: 2px;
    }
    predictive-search .ps-see-all:hover { color: var(--color-accent); }
  `;
  const style = document.createElement('style');
  style.textContent = drawerCSS;
  document.head.appendChild(style);
})();
