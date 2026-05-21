/* ============================================================
   SPLOOT & CO — theme.js
   Vanilla JS + Web Components. Drives the storefront design:
   mobile nav, cart drawer, product form, gallery, filters,
   quick view. No framework.
   ============================================================ */
(() => {
  'use strict';

  const FREE_SHIP = 12000; // cents — matches the cart free-ship threshold

  /* ---------- helpers ---------- */
  const money = (c) => '$' + (Number(c) / 100).toFixed(2);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const isDesktop = () => window.matchMedia('(min-width: 750px)').matches;
  const lockScroll = (on) => { document.body.style.overflow = on ? 'hidden' : ''; };

  function setCartCount(count) {
    document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = count; });
    const cartLink = document.querySelector('.hdr-cart');
    if (cartLink && count > 0 && !cartLink.querySelector('[data-cart-count]')) {
      const span = document.createElement('span');
      span.className = 'hdr-cart-count';
      span.setAttribute('data-cart-count', '');
      span.textContent = count;
      cartLink.appendChild(span);
    }
    if (count === 0) {
      document.querySelectorAll('[data-cart-count]').forEach((el) => el.remove());
    }
  }

  async function getCart() {
    const res = await fetch(`${window.Shopify?.routes?.root || '/'}cart.js`, { headers: { Accept: 'application/json' } });
    return res.json();
  }

  /* ---------- mobile nav ---------- */
  class SiteHeader extends HTMLElement {
    connectedCallback() {
      this.nav = this.querySelector('[data-mobile-nav]');
      this.scrim = this.querySelector('[data-menu-scrim]');
      this.querySelectorAll('[data-menu-open]').forEach((b) => b.addEventListener('click', () => this.openNav()));
      this.querySelectorAll('[data-menu-close]').forEach((b) => b.addEventListener('click', () => this.closeNav()));
      if (this.scrim) this.scrim.addEventListener('click', () => this.closeNav());
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeNav(); });

      this.querySelectorAll('[data-cart-open]').forEach((link) => {
        link.addEventListener('click', (e) => {
          const drawer = document.getElementById('CartDrawer');
          if (drawer && isDesktop()) { e.preventDefault(); drawer.open(); }
        });
      });
    }
    openNav() {
      if (!this.nav) return;
      this.nav.classList.add('is-on');
      this.scrim && this.scrim.classList.add('is-on');
      this.querySelector('[data-menu-open]')?.setAttribute('aria-expanded', 'true');
      lockScroll(true);
    }
    closeNav() {
      if (!this.nav) return;
      this.nav.classList.remove('is-on');
      this.scrim && this.scrim.classList.remove('is-on');
      this.querySelector('[data-menu-open]')?.setAttribute('aria-expanded', 'false');
      lockScroll(false);
    }
  }
  customElements.define('site-header', SiteHeader);

  /* ---------- cart drawer ---------- */
  class CartDrawer extends HTMLElement {
    connectedCallback() {
      this.removeAttribute('hidden');
      this._loaded = false;
      this._open = false;
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this._open) this.close(); });
    }
    async open() {
      if (!this._loaded) { await this.refresh(); this._loaded = true; }
      this._open = true;
      const d = this.querySelector('.drawer'); const s = this.querySelector('.scrim');
      d && d.classList.add('is-on'); s && s.classList.add('is-on');
      lockScroll(true);
    }
    close() {
      this._open = false;
      const d = this.querySelector('.drawer'); const s = this.querySelector('.scrim');
      d && d.classList.remove('is-on'); s && s.classList.remove('is-on');
      lockScroll(false);
    }
    async refresh() {
      try { this.render(await getCart()); } catch (e) { console.warn('Cart fetch failed', e); }
    }
    async change(key, qty) {
      const res = await fetch(`${window.Shopify?.routes?.root || '/'}cart/change.js`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: key, quantity: qty })
      });
      this.render(await res.json());
    }
    render(cart) {
      setCartCount(cart.item_count);
      const unlocked = cart.total_price >= FREE_SHIP;
      const pct = Math.min(100, (cart.total_price / FREE_SHIP) * 100);
      const ship = unlocked
        ? '<p class="ship-msg done">✦ FREE SHIPPING UNLOCKED</p>'
        : `<p class="ship-msg">${money(FREE_SHIP - cart.total_price)} more for free packwide shipping</p>`;

      const rows = cart.items.map((it, i) => `
        <article class="cart-row">
          <a href="${it.url}" class="cart-row-media">${it.image ? `<img src="${it.image}" alt="" loading="lazy">` : ''}</a>
          <div class="cart-row-detail">
            <h4 class="cart-row-name"><a href="${it.url}">${esc(it.product_title)}</a></h4>
            ${it.variant_title && it.variant_title !== 'Default Title' ? `<p class="cart-row-variant">${esc(it.variant_title)}</p>` : ''}
            <div class="cart-row-bottom">
              <div class="qty qty-sm">
                <button type="button" data-d-down data-key="${it.key}" aria-label="Decrease">−</button>
                <span>${it.quantity}</span>
                <button type="button" data-d-up data-key="${it.key}" aria-label="Increase">+</button>
              </div>
              <button type="button" class="cart-remove" data-d-remove data-key="${it.key}">Remove</button>
            </div>
          </div>
          <div class="cart-row-price">${money(it.final_line_price)}</div>
        </article>`).join('');

      this.innerHTML = `
        <div class="scrim" data-d-close></div>
        <aside class="drawer" role="dialog" aria-label="Cart">
          <header class="drawer-head">
            <div><p class="eyebrow">YOUR PACK</p>
              <h3 class="drawer-h">Cart · ${cart.item_count} ${cart.item_count === 1 ? 'piece' : 'pieces'}</h3></div>
            <button type="button" class="drawer-close" data-d-close aria-label="Close">✕</button>
          </header>
          <div class="ship-progress">${ship}<div class="ship-bar"><div class="ship-fill" style="width:${pct}%"></div></div></div>
          <div class="drawer-body">
            ${cart.items.length === 0
              ? `<div class="drawer-empty"><p class="empty-h">Your cart is empty.</p>
                  <p class="empty-p">Nothing in the pack yet. Enter the armory.</p>
                  <a class="btn btn-fill" href="/collections/heavy-armor">Browse Heavy Armor →</a></div>`
              : rows}
          </div>
          ${cart.items.length === 0 ? '' : `
          <footer class="drawer-foot">
            <div class="totals">
              <div><span>Subtotal</span><span>${money(cart.total_price)}</span></div>
              <div class="totals-total"><span>Total</span><span>${money(cart.total_price)}</span></div>
            </div>
            <p class="cart-note">Taxes &amp; shipping calculated at checkout.</p>
            <a class="btn btn-blood btn-block" href="${window.Shopify?.routes?.root || '/'}checkout">Checkout — ${money(cart.total_price)}</a>
            <a class="link-btn" href="${window.Shopify?.routes?.root || '/'}cart">View full cart</a>
          </footer>`}
        </aside>`;

      if (this._open) {
        this.querySelector('.drawer').classList.add('is-on');
        this.querySelector('.scrim').classList.add('is-on');
      }
      this.querySelectorAll('[data-d-close]').forEach((b) => b.addEventListener('click', () => this.close()));
      this.querySelectorAll('[data-d-up]').forEach((b) => b.addEventListener('click', () => this.bump(b, 1)));
      this.querySelectorAll('[data-d-down]').forEach((b) => b.addEventListener('click', () => this.bump(b, -1)));
      this.querySelectorAll('[data-d-remove]').forEach((b) => b.addEventListener('click', () => this.change(b.dataset.key, 0)));
    }
    bump(btn, dir) {
      const span = btn.parentElement.querySelector('span');
      const next = Math.max(0, (parseInt(span.textContent, 10) || 0) + dir);
      this.change(btn.dataset.key, next);
    }
  }
  customElements.define('cart-drawer', CartDrawer);

  function openDrawerAfterAdd() {
    const drawer = document.getElementById('CartDrawer');
    if (drawer) { drawer.refresh().then(() => { if (isDesktop()) drawer.open(); }); }
  }

  /* ---------- product form (PDP) ---------- */
  class ProductForm extends HTMLElement {
    connectedCallback() {
      this.form = this.querySelector('form');
      this.variantInput = this.querySelector('[data-variant-id]');
      this.addBtn = this.querySelector('[data-add-btn]');
      this.addLabel = this.querySelector('[data-add-label]');
      this.errorEl = this.querySelector('[data-form-error]');
      const json = document.querySelector('[data-product-json]');
      try { this.product = json ? JSON.parse(json.textContent) : null; } catch (e) { this.product = null; }

      this.querySelectorAll('input[type="radio"][name^="options"]').forEach((r) =>
        r.addEventListener('change', () => this.onOptionChange()));

      const qIn = this.querySelector('[data-qty-input]');
      this.querySelector('[data-qty-up]')?.addEventListener('click', () => { qIn.value = (parseInt(qIn.value, 10) || 1) + 1; });
      this.querySelector('[data-qty-down]')?.addEventListener('click', () => { qIn.value = Math.max(1, (parseInt(qIn.value, 10) || 1) - 1); });

      if (this.form) this.form.addEventListener('submit', (e) => this.onSubmit(e));
    }
    selectedOptions() {
      const sel = [];
      this.querySelectorAll('fieldset[data-option-index]').forEach((fs) => {
        const checked = fs.querySelector('input[type="radio"]:checked');
        if (checked) sel.push(checked.value);
      });
      return sel;
    }
    onOptionChange() {
      // update each fieldset legend label
      this.querySelectorAll('fieldset[data-option-index]').forEach((fs) => {
        const checked = fs.querySelector('input[type="radio"]:checked');
        const strong = fs.querySelector('[data-opt-selected]');
        if (checked && strong) strong.textContent = checked.value;
      });
      if (!this.product) return;
      const chosen = this.selectedOptions();
      const match = this.product.variants.find((v) =>
        v.options.length === chosen.length && v.options.every((o, i) => o === chosen[i]));
      if (!match) return;
      this.variantInput.value = match.id;

      const priceEl = document.querySelector('[data-pdp-price]');
      if (priceEl) {
        const sale = match.compare_at_price && match.compare_at_price > match.price;
        priceEl.innerHTML = `<span class="price${sale ? ' price--sale' : ''}">
          <span class="price-now">${money(match.price)}</span>
          ${sale ? `<s class="price-was">${money(match.compare_at_price)}</s>` : ''}</span>`;
      }
      if (this.addLabel) {
        this.addLabel.textContent = match.available ? 'Add to cart' : 'Sold out';
        this.addBtn.disabled = !match.available;
      }
      if (match.featured_image) {
        const main = document.querySelector('[data-pdp-main]');
        if (main) main.src = match.featured_image.replace(/(\.[a-z]+)(\?|$)/i, '_1400x$1$2');
      }
      if (history.replaceState) {
        const url = new URL(window.location);
        url.searchParams.set('variant', match.id);
        history.replaceState({}, '', url);
      }
    }
    async onSubmit(e) {
      e.preventDefault();
      if (this.addBtn.disabled) return;
      const original = this.addLabel ? this.addLabel.textContent : '';
      this.addBtn.disabled = true;
      if (this.addLabel) this.addLabel.textContent = 'Adding…';
      if (this.errorEl) this.errorEl.hidden = true;
      try {
        const res = await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
          method: 'POST', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: new FormData(this.form)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.description || 'Could not add to cart');
        }
        if (this.addLabel) this.addLabel.textContent = 'Added ✓';
        openDrawerAfterAdd();
        setTimeout(() => { if (this.addLabel) this.addLabel.textContent = original; this.addBtn.disabled = false; }, 1200);
      } catch (err) {
        if (this.errorEl) { this.errorEl.textContent = err.message; this.errorEl.hidden = false; }
        if (this.addLabel) this.addLabel.textContent = original;
        this.addBtn.disabled = false;
      }
    }
  }
  customElements.define('product-form', ProductForm);

  /* ---------- PDP gallery + tabs ---------- */
  function initGallery() {
    const main = document.querySelector('[data-pdp-main]');
    if (!main) return;
    document.querySelectorAll('[data-pdp-thumb]').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        main.src = thumb.dataset.full;
        main.removeAttribute('srcset');
        document.querySelectorAll('[data-pdp-thumb]').forEach((t) => t.classList.remove('is-active'));
        thumb.classList.add('is-active');
      });
    });
  }
  function initTabs() {
    document.querySelectorAll('[data-tabs]').forEach((tabs) => {
      const heads = tabs.querySelectorAll('[data-tab]');
      heads.forEach((head) => head.addEventListener('click', () => {
        heads.forEach((h) => h.classList.remove('is-on'));
        head.classList.add('is-on');
        tabs.querySelectorAll('[data-tab-panel]').forEach((p) => {
          p.hidden = p.dataset.tabPanel !== head.dataset.tab;
        });
      }));
    });
  }

  /* ---------- cart page qty / remove ---------- */
  function initCartPage() {
    const form = document.getElementById('cart-form');
    if (!form) return;
    const change = (key, qty) => fetch(`${window.Shopify?.routes?.root || '/'}cart/change.js`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity: qty })
    }).then(() => window.location.reload());

    form.addEventListener('click', (e) => {
      const up = e.target.closest('[data-cart-qty-up]');
      const down = e.target.closest('[data-cart-qty-down]');
      const rm = e.target.closest('[data-cart-remove]');
      if (!up && !down && !rm) return;
      e.preventDefault();
      if (rm) return void change(rm.dataset.cartRemove, 0);
      const key = (up || down).dataset.key;
      const input = form.querySelector(`input[data-key="${key}"]`);
      let n = parseInt(input ? input.value : '1', 10) || 1;
      n += up ? 1 : -1;
      change(key, Math.max(0, n));
    });
    form.addEventListener('change', (e) => {
      const input = e.target.closest('input[data-key]');
      if (input) change(input.dataset.key, Math.max(0, parseInt(input.value, 10) || 0));
    });
  }

  /* ---------- collection filters ---------- */
  function initFilters() {
    const form = document.querySelector('[data-facet-form]');
    if (!form) return;
    const toggle = document.querySelector('[data-filter-toggle]');
    const layout = document.querySelector('[data-col-layout]');
    const filters = document.querySelector('[data-filters]');
    const grid = form.querySelector('.pgrid');

    if (toggle && filters && layout) {
      const open = () => {
        filters.hidden = false;
        layout.classList.add('with-filters');
        grid && grid.classList.replace('pgrid-4', 'pgrid-3');
        toggle.setAttribute('aria-expanded', 'true');
      };
      const close = () => {
        filters.hidden = true;
        layout.classList.remove('with-filters');
        grid && grid.classList.replace('pgrid-3', 'pgrid-4');
        toggle.setAttribute('aria-expanded', 'false');
      };
      // open by default on desktop
      if (isDesktop()) open();
      toggle.addEventListener('click', () => {
        toggle.getAttribute('aria-expanded') === 'true' ? close() : open();
      });
    }
    form.querySelectorAll('[data-auto-submit]').forEach((el) => {
      const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'change';
      el.addEventListener(evt, () => form.submit());
    });
  }

  /* ---------- quick view ---------- */
  class QuickView extends HTMLElement {
    connectedCallback() {
      this.removeAttribute('hidden');
      this.classList.add('qv');
      document.addEventListener('click', (e) => {
        const t = e.target.closest('[data-quick-view]');
        if (t) { e.preventDefault(); e.stopPropagation(); this.load(t.dataset.productHandle); }
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this._open) this.close(); });
    }
    open() { this._open = true; this.classList.add('is-on'); lockScroll(true); }
    close() { this._open = false; this.classList.remove('is-on'); lockScroll(false); }
    async load(handle) {
      this.innerHTML = `<div class="qv-scrim" data-qv-close></div><div class="qv-panel"><p class="qv-loading">Loading…</p></div>`;
      this.bindClose();
      this.open();
      try {
        const res = await fetch(`${window.Shopify?.routes?.root || '/'}products/${handle}.js`, { headers: { Accept: 'application/json' } });
        this.render(await res.json());
      } catch (e) {
        this.querySelector('.qv-panel').innerHTML = '<p class="qv-loading">Could not load. Open the full product page.</p>';
      }
    }
    render(p) {
      this._product = p;
      const v = p.variants.find((x) => x.available) || p.variants[0];
      const img = (p.featured_image || (p.images && p.images[0]) || '');
      const opts = p.has_only_default_variant ? '' : p.options.map((opt, idx) => {
        const vals = [...new Set(p.variants.map((x) => x.options[idx]))];
        return `<fieldset class="pdp-opt" data-option-index="${idx}">
          <legend>${esc(opt)}</legend>
          <div class="pdp-swatches">${vals.map((val, j) => {
            const id = `qv-${idx}-${j}`;
            return `<input type="radio" class="visually-hidden" id="${id}" name="qv-opt-${idx}" value="${esc(val)}" ${v.options[idx] === val ? 'checked' : ''}>
              <label for="${id}" class="swatch">${esc(val)}</label>`;
          }).join('')}</div></fieldset>`;
      }).join('');

      this.innerHTML = `
        <div class="qv-scrim" data-qv-close></div>
        <div class="qv-panel">
          <button type="button" class="qv-close" data-qv-close aria-label="Close">✕</button>
          <div class="qv-media">${img ? `<img src="${img}" alt="${esc(p.title)}">` : ''}</div>
          <div class="qv-info">
            ${p.vendor ? `<p class="pdp-vendor">${esc(p.vendor)}</p>` : ''}
            <h2 class="pdp-title" style="font-size:clamp(1.6rem,3vw,2.4rem)">${esc(p.title)}</h2>
            <div class="pdp-price" data-qv-price>${money(v.price)}</div>
            <form data-qv-form>
              <input type="hidden" name="id" value="${v.id}" data-qv-id>
              ${opts}
              <div class="pdp-buy" style="margin-top:8px">
                <div class="qty">
                  <button type="button" data-qv-down aria-label="Decrease">−</button>
                  <input type="number" name="quantity" value="1" min="1" data-qv-qty>
                  <button type="button" data-qv-up aria-label="Increase">+</button>
                </div>
                <button type="submit" class="btn btn-fill btn-block" data-qv-add>
                  <span data-qv-add-label>${v.available ? 'Add to cart' : 'Sold out'}</span>
                </button>
              </div>
            </form>
            <a href="/products/${p.handle}" class="link-btn" style="color:var(--ash);margin-top:12px;display:inline-block">View full details →</a>
          </div>
        </div>`;
      this.bindClose();
      this.bindForm();
    }
    bindClose() {
      this.querySelectorAll('[data-qv-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    }
    bindForm() {
      const qty = this.querySelector('[data-qv-qty]');
      this.querySelector('[data-qv-up]')?.addEventListener('click', () => { qty.value = (parseInt(qty.value, 10) || 1) + 1; });
      this.querySelector('[data-qv-down]')?.addEventListener('click', () => { qty.value = Math.max(1, (parseInt(qty.value, 10) || 1) - 1); });
      this.querySelectorAll('input[name^="qv-opt"]').forEach((r) => r.addEventListener('change', () => this.sync()));
      this.querySelector('[data-qv-form]')?.addEventListener('submit', (e) => this.add(e));
    }
    sync() {
      const chosen = [];
      this.querySelectorAll('fieldset[data-option-index]').forEach((fs) => {
        const c = fs.querySelector('input:checked'); if (c) chosen.push(c.value);
      });
      const m = this._product.variants.find((v) => v.options.every((o, i) => o === chosen[i]));
      if (!m) return;
      this.querySelector('[data-qv-id]').value = m.id;
      this.querySelector('[data-qv-price]').textContent = money(m.price);
      const lbl = this.querySelector('[data-qv-add-label]');
      if (lbl) lbl.textContent = m.available ? 'Add to cart' : 'Sold out';
    }
    async add(e) {
      e.preventDefault();
      const btn = this.querySelector('[data-qv-add]');
      const lbl = this.querySelector('[data-qv-add-label]');
      btn.disabled = true; const orig = lbl.textContent; lbl.textContent = 'Adding…';
      try {
        const res = await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
          method: 'POST', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: new FormData(e.target)
        });
        if (!res.ok) throw new Error('add failed');
        lbl.textContent = 'Added ✓';
        this.close();
        openDrawerAfterAdd();
      } catch (err) {
        lbl.textContent = orig; btn.disabled = false;
      }
    }
  }
  customElements.define('quick-view', QuickView);

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    initGallery();
    initTabs();
    initCartPage();
    initFilters();
  });
})();
