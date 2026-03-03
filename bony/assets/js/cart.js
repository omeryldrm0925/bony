import { formatMoney } from "./data.js";

const STORAGE_KEY = "bony_cart_v1";
const SHIPPING_THRESHOLD = 3500;
const SHIPPING_FEE = 120;

const state = {
  initialized: false,
  items: [],
  step: "cart",
  drawer: null,
  overlay: null,
  content: null,
  orderNumber: null
};

function clampQty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(10, Math.floor(parsed)));
}

function itemKey(item) {
  return `${item.productId}::${item.edition}`;
}

function normalizeCartItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const productId = String(raw.productId || "").trim();
  const title = String(raw.title || "").trim();
  const edition = String(raw.edition || "Canvas").trim();
  if (!productId || !title) return null;

  const unitPrice = Number(raw.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;

  return {
    productId,
    title,
    edition: edition || "Canvas",
    quantity: clampQty(raw.quantity),
    image: String(raw.image || "").trim(),
    unitPrice,
    currency: String(raw.currency || "TRY").toUpperCase()
  };
}

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCartItem).filter(Boolean);
  } catch {
    return [];
  }
}

function persistCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

function getSubtotal() {
  return state.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
}

function getShipping(subtotal) {
  return subtotal >= SHIPPING_THRESHOLD || subtotal <= 0 ? 0 : SHIPPING_FEE;
}

function getCurrency() {
  return state.items[0]?.currency || "TRY";
}

function getItemCount() {
  return state.items.reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartCountBadges() {
  const count = getItemCount();
  document.querySelectorAll('[data-role="cart-count"]').forEach((el) => {
    el.textContent = String(count);
  });
}

function setBodyScrollLocked(locked) {
  document.body.classList.toggle("has-cart-open", locked);
}

function ensureCartShell() {
  if (state.drawer && state.overlay && state.content) return;

  state.overlay = document.createElement("div");
  state.overlay.className = "cart-overlay";
  state.overlay.hidden = true;
  state.overlay.addEventListener("click", () => closeCart());

  state.drawer = document.createElement("aside");
  state.drawer.className = "cart-drawer";
  state.drawer.hidden = true;
  state.drawer.setAttribute("aria-hidden", "true");
  state.drawer.setAttribute("aria-label", "Cart and checkout");
  state.drawer.innerHTML = `
    <div class="cart-drawer__header">
      <h2 id="cartDrawerTitle">Cart</h2>
      <button class="cart-drawer__close" type="button" data-action="close-cart" aria-label="Close cart">Close</button>
    </div>
    <div class="cart-drawer__content" data-role="cart-content"></div>
  `;

  state.content = state.drawer.querySelector('[data-role="cart-content"]');

  state.drawer.addEventListener("click", onDrawerClick);
  state.drawer.addEventListener("submit", onDrawerSubmit);
  document.addEventListener("keydown", onEscapeClose);

  document.body.append(state.overlay, state.drawer);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function cartItemHtml(item) {
  const key = itemKey(item);
  const lineTotal = item.unitPrice * item.quantity;
  return `
    <article class="cart-item">
      <div class="cart-item__media">
        <img src="${escapeAttr(item.image || "/assets/img/placeholder.jpg")}" alt="${escapeAttr(item.title)}" loading="lazy" decoding="async" />
      </div>
      <div class="cart-item__meta">
        <div class="cart-item__title">${escapeHtml(item.title)}</div>
        <div class="cart-item__detail">Edition: ${escapeHtml(item.edition)}</div>
        <div class="cart-item__price">${escapeHtml(formatMoney(lineTotal, item.currency))}</div>
        <div class="cart-item__controls">
          <button type="button" data-action="decrease-qty" data-key="${escapeAttr(key)}" aria-label="Decrease quantity">-</button>
          <span>${item.quantity}</span>
          <button type="button" data-action="increase-qty" data-key="${escapeAttr(key)}" aria-label="Increase quantity">+</button>
          <button type="button" class="cart-item__remove" data-action="remove-item" data-key="${escapeAttr(key)}">Remove</button>
        </div>
      </div>
    </article>
  `;
}

function cartStepHtml() {
  if (!state.items.length) {
    return `
      <div class="cart-empty">
        <h3>Your cart is empty</h3>
        <p>Add a canvas artwork to continue to checkout.</p>
        <button class="btn btn--ghost" type="button" data-action="close-cart">Continue browsing</button>
      </div>
    `;
  }

  const subtotal = getSubtotal();
  const shipping = getShipping(subtotal);
  const total = subtotal + shipping;
  const currency = getCurrency();

  return `
    <div class="cart-items">
      ${state.items.map(cartItemHtml).join("")}
    </div>
    <div class="cart-summary">
      <div class="cart-summary__row"><span>Subtotal</span><strong>${escapeHtml(formatMoney(subtotal, currency))}</strong></div>
      <div class="cart-summary__row"><span>Shipping</span><strong>${shipping ? escapeHtml(formatMoney(shipping, currency)) : "Complimentary"}</strong></div>
      <div class="cart-summary__row cart-summary__row--total"><span>Total</span><strong>${escapeHtml(formatMoney(total, currency))}</strong></div>
    </div>
    <div class="cart-actions">
      <button class="btn btn--primary" type="button" data-action="start-checkout">Proceed to Checkout</button>
      <button class="btn btn--ghost" type="button" data-action="clear-cart">Clear Cart</button>
    </div>
  `;
}

function checkoutStepHtml() {
  const subtotal = getSubtotal();
  const shipping = getShipping(subtotal);
  const total = subtotal + shipping;
  const currency = getCurrency();

  return `
    <form class="checkout-form" id="cartCheckoutForm">
      <h3>Collector Details</h3>
      <div class="checkout-form__grid">
        <label>Full Name<input class="input" name="fullName" required /></label>
        <label>Email<input class="input" type="email" name="email" required /></label>
      </div>
      <div class="checkout-form__grid">
        <label>Phone<input class="input" name="phone" required /></label>
        <label>City<input class="input" name="city" required /></label>
      </div>
      <label>Address<textarea class="input" name="address" required></textarea></label>
      <div class="checkout-form__grid">
        <label>Postal Code<input class="input" name="postalCode" required /></label>
        <label>Country
          <select class="select" name="country" required>
            <option value="TR">Turkey</option>
            <option value="DE">Germany</option>
            <option value="NL">Netherlands</option>
            <option value="FR">France</option>
          </select>
        </label>
      </div>

      <h3>Payment</h3>
      <div class="checkout-form__grid">
        <label>Name on Card<input class="input" name="cardName" required /></label>
        <label>Card Number<input class="input" name="cardNumber" inputmode="numeric" minlength="12" required /></label>
      </div>
      <div class="checkout-form__grid">
        <label>Expiry<input class="input" name="cardExpiry" placeholder="MM/YY" required /></label>
        <label>CVV<input class="input" name="cardCvv" inputmode="numeric" minlength="3" maxlength="4" required /></label>
      </div>

      <div class="cart-summary">
        <div class="cart-summary__row"><span>Subtotal</span><strong>${escapeHtml(formatMoney(subtotal, currency))}</strong></div>
        <div class="cart-summary__row"><span>Shipping</span><strong>${shipping ? escapeHtml(formatMoney(shipping, currency)) : "Complimentary"}</strong></div>
        <div class="cart-summary__row cart-summary__row--total"><span>Charge Total</span><strong>${escapeHtml(formatMoney(total, currency))}</strong></div>
      </div>

      <p class="checkout-note">Checkout is currently in demo mode; no real payment is processed.</p>
      <div class="cart-actions">
        <button class="btn btn--ghost" type="button" data-action="back-to-cart">Back to Cart</button>
        <button class="btn btn--primary" type="submit">Complete Order</button>
      </div>
    </form>
  `;
}

function successStepHtml() {
  return `
    <div class="cart-success">
      <h3>Your order is confirmed</h3>
      <p>Order number: <strong>${escapeHtml(state.orderNumber || "BONY-0000")}</strong></p>
      <button class="btn btn--primary" type="button" data-action="close-cart">Continue browsing</button>
    </div>
  `;
}

function renderCart() {
  if (!state.content) return;
  updateCartCountBadges();

  if (state.step === "checkout" && !state.items.length) {
    state.step = "cart";
  }

  if (state.step === "checkout") {
    state.content.innerHTML = checkoutStepHtml();
    return;
  }
  if (state.step === "success") {
    state.content.innerHTML = successStepHtml();
    return;
  }
  state.content.innerHTML = cartStepHtml();
}

function syncAndRender() {
  persistCart();
  renderCart();
}

function setQtyByKey(key, delta) {
  const index = state.items.findIndex((item) => itemKey(item) === key);
  if (index < 0) return;
  const nextQty = clampQty(state.items[index].quantity + delta);
  state.items[index].quantity = nextQty;
  syncAndRender();
}

function removeByKey(key) {
  state.items = state.items.filter((item) => itemKey(item) !== key);
  syncAndRender();
}

function clearCart() {
  state.items = [];
  state.step = "cart";
  syncAndRender();
}

function onDrawerClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const actionEl = target.closest("[data-action]");
  if (!(actionEl instanceof HTMLElement)) return;

  const action = actionEl.dataset.action;
  const key = actionEl.dataset.key || "";

  if (action === "close-cart") {
    closeCart();
  } else if (action === "increase-qty") {
    setQtyByKey(key, 1);
  } else if (action === "decrease-qty") {
    setQtyByKey(key, -1);
  } else if (action === "remove-item") {
    removeByKey(key);
  } else if (action === "start-checkout") {
    state.step = "checkout";
    renderCart();
  } else if (action === "back-to-cart") {
    state.step = "cart";
    renderCart();
  } else if (action === "clear-cart") {
    clearCart();
  }
}

function onDrawerSubmit(event) {
  const target = event.target;
  if (!(target instanceof HTMLFormElement)) return;
  if (target.id !== "cartCheckoutForm") return;

  event.preventDefault();
  if (!target.reportValidity()) return;

  state.orderNumber = `BONY-${Date.now().toString().slice(-8)}`;
  state.items = [];
  state.step = "success";
  syncAndRender();
}

function onEscapeClose(event) {
  if (event.key !== "Escape") return;
  if (!state.drawer || state.drawer.hidden) return;
  closeCart();
}

function openDrawer() {
  ensureCartShell();
  if (!state.drawer || !state.overlay) return;
  state.overlay.hidden = false;
  state.drawer.hidden = false;
  state.drawer.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    state.overlay.classList.add("is-visible");
    state.drawer.classList.add("is-open");
  });
  setBodyScrollLocked(true);
}

function closeDrawer() {
  if (!state.drawer || !state.overlay) return;
  state.overlay.classList.remove("is-visible");
  state.drawer.classList.remove("is-open");
  state.drawer.setAttribute("aria-hidden", "true");
  setBodyScrollLocked(false);
  window.setTimeout(() => {
    if (!state.overlay || !state.drawer) return;
    state.overlay.hidden = true;
    state.drawer.hidden = true;
  }, 180);
}

function bindCartButtons() {
  document.querySelectorAll('[data-role="cart-button"]').forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    if (button.dataset.cartBound === "1") return;
    button.dataset.cartBound = "1";
    button.addEventListener("click", () => {
      state.step = "cart";
      renderCart();
      openDrawer();
    });
  });
}

export function initCartShell() {
  if (!state.initialized) {
    state.items = loadCart();
    ensureCartShell();
    state.initialized = true;
  }
  bindCartButtons();
  renderCart();
}

export function addItemToCart(item, { openDrawer = true } = {}) {
  const normalized = normalizeCartItem(item);
  if (!normalized) return false;

  const key = itemKey(normalized);
  const existing = state.items.find((row) => itemKey(row) === key);
  if (existing) {
    existing.quantity = clampQty(existing.quantity + normalized.quantity);
  } else {
    state.items.unshift(normalized);
  }

  state.step = "cart";
  syncAndRender();
  if (openDrawer) openDrawer();
  return true;
}

export function openCartCheckout() {
  if (!state.items.length) return;
  state.step = "checkout";
  renderCart();
  openDrawer();
}

export function closeCart() {
  closeDrawer();
}

