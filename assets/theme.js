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
  `;
  const style = document.createElement('style');
  style.textContent = drawerCSS;
  document.head.appendChild(style);
})();
