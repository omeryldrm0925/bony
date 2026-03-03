import {
  buildCollectionUrl,
  firstImageOrPlaceholder,
  formatMoney,
  getStoreData,
  isInStock,
  pickRecommendedProducts
} from "./data.js";
import { renderProductGrid, setContainerState } from "./catalog.js";
import { applyProductSeo } from "./seo.js";
import { initStorefrontShell } from "./shell.js";
import { addItemToCart, openCartCheckout } from "./cart.js";

function $(id) {
  return document.getElementById(id);
}

function readParams() {
  return new URLSearchParams(window.location.search);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text ?? "";
  return el;
}

function setTagPills(container, tags) {
  if (!container) return;
  container.replaceChildren();
  (tags || []).slice(0, 6).forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "chip";
    pill.textContent = String(tag);
    container.appendChild(pill);
  });
}

function renderPrice(product) {
  const el = $("pPrice");
  if (!el) return;
  el.replaceChildren();

  const amount = product.pricing?.effectivePrice ?? product.price ?? 0;
  const current = document.createElement("span");
  current.className = "product-price__current";
  current.textContent = formatMoney(amount, product.currency || "TRY");
  el.appendChild(current);
}

function setupZoom() {
  const stage = $("pZoomStage");
  const img = $("pMainImg");
  if (!stage || !img) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const onMove = (event) => {
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = `${Math.max(0, Math.min(100, x))}% ${Math.max(0, Math.min(100, y))}%`;
  };

  stage.addEventListener("mouseenter", (event) => {
    stage.classList.add("is-zooming");
    onMove(event);
  });
  stage.addEventListener("mousemove", onMove);
  stage.addEventListener("mouseleave", () => {
    stage.classList.remove("is-zooming");
    img.style.transformOrigin = "50% 50%";
  });
}

function setupGallery(product) {
  const mainImg = $("pMainImg");
  const thumbsWrap = $("pThumbs");
  const zoomStage = $("pZoomStage");
  if (!mainImg) return;

  const images = Array.isArray(product.images) && product.images.length
    ? product.images
    : [firstImageOrPlaceholder(product.images)];

  const setMainImage = (src) => {
    mainImg.src = src || "/assets/img/placeholder.jpg";
    mainImg.alt = product.title;
    mainImg.onerror = () => {
      mainImg.onerror = null;
      mainImg.src = "/assets/img/placeholder.jpg";
    };
    if (zoomStage) zoomStage.classList.remove("is-zooming");
  };

  setMainImage(images[0]);

  if (thumbsWrap) {
    thumbsWrap.innerHTML = "";
    images.forEach((src, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `gallery-thumb${idx === 0 ? " is-active" : ""}`;

      const img = document.createElement("img");
      img.src = src;
      img.alt = `${product.title} ${idx + 1}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => { img.src = "/assets/img/placeholder.jpg"; };

      btn.appendChild(img);
      btn.addEventListener("click", () => {
        setMainImage(src);
        thumbsWrap.querySelectorAll(".gallery-thumb").forEach((el) => el.classList.remove("is-active"));
        btn.classList.add("is-active");
      });
      thumbsWrap.appendChild(btn);
    });
  }
}

function availableEditions(product) {
  const editions = ["Canvas", "Studio Collection"];
  if (product.tags?.includes("Limited Edition")) editions.unshift("Limited Edition");
  if (product.tags?.includes("Signature Pieces")) editions.push("Signature Piece");
  return [...new Set(editions)];
}

function renderEditionOptions(product) {
  const select = $("pEdition");
  if (!select) return;
  select.innerHTML = availableEditions(product)
    .map((edition) => `<option value="${edition}">${edition}</option>`)
    .join("");
}

function artworkDimensions(product) {
  const seed = [...String(product.id || "art")].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const widths = [60, 70, 80, 90, 100];
  const heights = [80, 90, 100, 110, 120];
  return `${widths[seed % widths.length]} x ${heights[seed % heights.length]} cm`;
}

function renderArtworkNotes(product) {
  const list = $("pSpecsList");
  if (!list) return;

  const category = product.category || product.tags?.[0] || "Abstract Series";
  const notes = [
    product.description || "A premium canvas composition created for contemporary interiors.",
    `${category} from the BONY Atelier archive.`,
    "Museum-grade pigment print on gallery-stretched canvas.",
    "Balanced for high-contrast, natural-light spaces."
  ];
  list.innerHTML = notes.map((item) => `<li>${item}</li>`).join("");
}

function renderMetaTable(product) {
  const table = $("pMetaTable");
  if (!table) return;

  const rows = [
    ["Medium", "Archival pigment on canvas"],
    ["Dimensions", artworkDimensions(product)],
    ["Certificate", "Signed certificate of authenticity"],
    ["Edition", product.tags?.includes("Limited Edition") ? "Limited Edition release" : "Studio open edition"],
    ["Collection", product.tags?.includes("Studio Collection") ? "Studio Collection" : "Signature Pieces"]
  ];

  table.innerHTML = `
    <thead>
      <tr><th scope="col">Detail</th><th scope="col">Value</th></tr>
    </thead>
    <tbody>
      ${rows.map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td></tr>`).join("")}
    </tbody>
  `;
}

function setActionFeedback(message, type = "info") {
  const el = $("pActionFeedback");
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function setupPurchaseActions(product) {
  const addBtn = $("pAddToCartBtn");
  const checkoutBtn = $("pCheckoutBtn");
  const qtyInput = $("pQty");
  const editionSelect = $("pEdition");
  if (!addBtn || !checkoutBtn || !qtyInput || !editionSelect) return;

  const addSelectionToCart = () => {
    const quantity = Math.max(1, Math.min(10, Math.floor(Number(qtyInput.value) || 1)));
    qtyInput.value = String(quantity);
    const edition = editionSelect.value || "Canvas";
    const unitPrice = product.pricing?.effectivePrice ?? product.price ?? 0;
    const success = addItemToCart({
      productId: product.id,
      title: product.title,
      image: firstImageOrPlaceholder(product.images),
      edition,
      quantity,
      unitPrice,
      currency: product.currency || "TRY"
    }, { openDrawer: false });

    if (success) {
      setActionFeedback(`${quantity} piece(s) added as ${edition}.`, "success");
    } else {
      setActionFeedback("Could not add this artwork to cart.", "error");
    }
    return success;
  };

  if (!isInStock(product)) {
    addBtn.disabled = true;
    checkoutBtn.disabled = true;
    setActionFeedback("This artwork is currently reserved.", "error");
    return;
  }

  addBtn.addEventListener("click", () => {
    addSelectionToCart();
  });

  checkoutBtn.addEventListener("click", () => {
    const added = addSelectionToCart();
    if (added) openCartCheckout();
  });
}

function renderProductInfo(product) {
  setText("pTitle", product.title);
  setText("pDesc", product.description || "Artwork description coming soon.");
  renderPrice(product);
  const tags = [...new Set([product.category, ...(product.tags || [])].filter(Boolean))];
  setTagPills($("pTags"), tags);
  renderEditionOptions(product);
  renderArtworkNotes(product);
  renderMetaTable(product);
  setupPurchaseActions(product);
}

function renderBackLinks(product) {
  const from = readParams().get("from") || product.collectionHandles?.[0] || "all";
  const href = buildCollectionUrl(from);
  const backLink = $("pBackLink");
  const otherBtn = $("pOtherProductsBtn");
  if (backLink instanceof HTMLAnchorElement) backLink.href = href;
  if (otherBtn instanceof HTMLAnchorElement) otherBtn.href = href;
}

function setErrorState(message) {
  setText("pTitle", message);
  setText("pDesc", "");
  setContainerState($("recommendedGrid"), "empty", "Related artworks are unavailable.");
  const img = $("pMainImg");
  if (img) {
    img.removeAttribute("src");
    img.alt = message;
  }
  const addBtn = $("pAddToCartBtn");
  const checkoutBtn = $("pCheckoutBtn");
  if (addBtn) addBtn.disabled = true;
  if (checkoutBtn) checkoutBtn.disabled = true;
}

function renderRecommended(product, allProducts) {
  const recommended = pickRecommendedProducts(product, allProducts, { limit: 4 });
  renderProductGrid($("recommendedGrid"), recommended, {
    fromHandle: readParams().get("from") || "all",
    emptyMessage: "No related artworks found.",
    variant: "minimal"
  });
}

async function initProductPage() {
  if (document.body?.dataset.page !== "product") return;

  setupZoom();
  setContainerState($("recommendedGrid"), "loading", "Loading related artworks...");

  const id = readParams().get("id");
  if (!id) {
    setErrorState("Artwork not found.");
    return;
  }

  try {
    const [store] = await Promise.all([getStoreData(), initStorefrontShell()]);
    const product = store.productsById.get(id);
    if (!product || !product.isActive) {
      setErrorState("Artwork not found.");
      return;
    }

    setupGallery(product);
    renderProductInfo(product);
    renderBackLinks(product);
    renderRecommended(product, store.products);
    applyProductSeo({ product, brand: "BONY Atelier" });
  } catch (error) {
    console.error(error);
    setErrorState("Artwork could not be loaded.");
  }
}

initProductPage().catch((err) => console.error(err));
