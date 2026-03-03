import {
  buildCollectionUrl,
  buildProductUrl,
  firstImageOrPlaceholder,
  formatMoney,
  getStoreData
} from "./data.js";
import { applyHomeSeo } from "./seo.js";
import { initStorefrontShell } from "./shell.js";
import { addItemToCart } from "./cart.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

export function setContainerState(container, type, message, { showRetry = false } = {}) {
  if (!container) return;
  container.innerHTML = `
    <div class="state state-${escapeAttr(type)}">
      <p>${escapeHtml(message)}</p>
      ${showRetry ? `<button class="btn btn--ghost btn--small" type="button" data-action="retry">Retry</button>` : ``}
    </div>
  `;
}

function priceLabel(product) {
  const amount = product.pricing?.effectivePrice ?? product.price ?? 0;
  return formatMoney(amount, product.currency || "TRY");
}

function cardCategory(product) {
  return product.category || product.tags?.[0] || "Signature Pieces";
}

export function productCardHtml(product, { fromHandle = "all", variant = "default" } = {}) {
  const image = firstImageOrPlaceholder(product.images);
  const href = buildProductUrl(product.id, { from: fromHandle });
  const minimal = variant === "minimal";

  return `
    <article class="product-card${minimal ? " product-card--minimal" : ""}" data-product-id="${escapeAttr(product.id)}">
      <div class="product-card__media">
        <a class="product-card__mediaLink" href="${href}" aria-label="${escapeAttr(product.title)}">
          <img class="product-card__img product-card__img--main" src="${escapeAttr(image)}" alt="${escapeAttr(product.title)}" loading="lazy" decoding="async" />
        </a>
        <button
          class="product-card__quickAdd"
          type="button"
          data-action="quick-add"
          data-product-id="${escapeAttr(product.id)}"
          aria-label="Add ${escapeAttr(product.title)} to cart"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7h10l-1 11H8L7 7Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M9 7a3 3 0 1 1 6 0" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M12 11v6M9 14h6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="product-card__body">
        <div class="product-card__category">${escapeHtml(cardCategory(product))}</div>
        <a class="product-card__name" href="${href}">${escapeHtml(product.title)}</a>
        <div class="product-card__price">${escapeHtml(priceLabel(product))}</div>
      </div>
    </article>
  `;
}

function bindQuickAdd(container, products) {
  if (!container) return;
  const map = new Map(products.map((product) => [String(product.id), product]));

  container.querySelectorAll('[data-action="quick-add"]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.productId || "";
      const product = map.get(id);
      if (!product) return;
      const amount = product.pricing?.effectivePrice ?? product.price ?? 0;
      addItemToCart({
        productId: product.id,
        title: product.title,
        image: firstImageOrPlaceholder(product.images),
        edition: product.tags?.includes("Limited Edition") ? "Limited Edition" : "Canvas",
        quantity: 1,
        unitPrice: amount,
        currency: product.currency || "TRY"
      });
    });
  });
}

export function renderProductGrid(container, products, options = {}) {
  if (!container) return;
  const {
    fromHandle = "all",
    emptyMessage = "No artworks found.",
    limit = null,
    variant = "default"
  } = options;

  const items = limit ? products.slice(0, limit) : products;
  if (!items.length) {
    setContainerState(container, "empty", emptyMessage);
    return;
  }

  container.innerHTML = items.map((product) => productCardHtml(product, { fromHandle, variant })).join("");
  container.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", () => {
      if (img.dataset.fallbackApplied === "1") return;
      img.dataset.fallbackApplied = "1";
      img.src = "/assets/img/placeholder.jpg";
    }, { once: true });
  });
  bindQuickAdd(container, items);
}

export function collectionTileHtml(collection) {
  return `
    <a class="collection-tile" href="${buildCollectionUrl(collection.handle)}" aria-label="${escapeAttr(collection.title)}">
      <div class="collection-tile__inner">
        <div class="collection-tile__title">${escapeHtml(collection.title)}</div>
        <div class="collection-tile__meta">${escapeHtml(collection.description || "Gallery curation")}</div>
      </div>
    </a>
  `;
}

function renderCollectionTiles(container, collections) {
  if (!container) return;
  const visible = collections.filter((item) =>
    item.handle !== "all" &&
    ["curated-selections", "studio-highlights", "limited-drops"].includes(item.handle)
  );
  container.innerHTML = visible.map(collectionTileHtml).join("");
}

export async function initHomePage() {
  const body = document.body;
  if (!body || body.dataset.page !== "home") return;

  const productGrid = document.getElementById("homeProductGrid");
  const collectionGrid = document.getElementById("homeCollectionGrid");
  const heroVideo = document.getElementById("homeHeroVideo");

  if (heroVideo instanceof HTMLVideoElement) {
    heroVideo.addEventListener("error", () => {
      heroVideo.closest(".hero-video")?.classList.add("is-fallback");
    }, { once: true });
    heroVideo.play().catch(() => {
      heroVideo.closest(".hero-video")?.classList.add("is-fallback");
    });
  }

  if (productGrid) setContainerState(productGrid, "loading", "Loading artworks...");

  try {
    const [store] = await Promise.all([getStoreData(), initStorefrontShell()]);
    const activeProducts = store.products.filter((item) => item.isActive);
    renderProductGrid(productGrid, activeProducts, {
      fromHandle: "all",
      emptyMessage: "No artworks available at the moment.",
      variant: "minimal"
    });
    renderCollectionTiles(collectionGrid, store.collections);
    applyHomeSeo({
      title: "BONY Atelier | Premium Canvas Art",
      image: activeProducts[0]?.images?.[0] || null,
      description: "Luxury canvas artworks, limited editions, and curated signature collections."
    });
  } catch (error) {
    console.error(error);
    setContainerState(productGrid, "error", "Artworks could not be loaded.", { showRetry: true });
    productGrid?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.action === "retry") {
        initHomePage();
      }
    }, { once: true });
  }
}

initHomePage().catch((err) => console.error(err));
