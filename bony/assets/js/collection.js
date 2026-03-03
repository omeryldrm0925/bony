import {
  filterProducts,
  getAllTags,
  getCollectionProducts,
  getStoreData,
  sortProducts
} from "./data.js";
import { renderProductGrid, setContainerState } from "./catalog.js";
import { applyCollectionSeo } from "./seo.js";
import { initStorefrontShell } from "./shell.js";

function $(id) {
  return document.getElementById(id);
}

function readHandle() {
  const params = new URLSearchParams(window.location.search);
  return params.get("handle") || "all";
}

function formatRangeValue(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : "";
}

function renderTagFilters(container, tags, selected) {
  if (!container) return;
  if (!tags.length) {
    container.innerHTML = `<p class="muted">No series tags found.</p>`;
    return;
  }

  container.innerHTML = tags.map(({ value, count }) => `
    <label class="filter-check">
      <input type="checkbox" value="${value}" ${selected.has(value) ? "checked" : ""} />
      <span>${value} <small>(${count})</small></span>
    </label>
  `).join("");
}

function attachRetry(button, fn) {
  if (!button) return;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    fn();
  });
}

export async function initCollectionPage() {
  if (document.body?.dataset.page !== "collection") return;

  const grid = $("collectionProductGrid");
  const titleEl = $("collectionTitle");
  const descEl = $("collectionDesc");
  const countEl = $("collectionCount");
  const tagsBox = $("tagFilters");
  const sortSelect = $("sortSelect");
  const minInput = $("priceMin");
  const maxInput = $("priceMax");
  const retryBtn = $("collectionRetry");
  const filterToggleBtn = $("toggleFiltersBtn");
  const filterPanel = $("collectionFiltersPanel");

  let store = null;
  let collectionHandle = readHandle();

  const state = {
    selectedTags: new Set(),
    priceMin: null,
    priceMax: null,
    sortKey: "newest"
  };

  const applyFilters = () => {
    if (!store) return;
    const { collection, products } = getCollectionProducts(store, collectionHandle);
    const base = products.filter((item) => item.isActive);

    const filtered = filterProducts(base, {
      tags: [...state.selectedTags],
      priceMin: state.priceMin,
      priceMax: state.priceMax
    });

    const sortKey = sortSelect?.value || state.sortKey || collection?.sortDefault || "newest";
    state.sortKey = sortKey;
    const sorted = sortProducts(filtered, sortKey);

    if (titleEl) titleEl.textContent = collection?.title || "Gallery";
    if (descEl) descEl.textContent = collection?.description || "Curated artworks selected for this view.";
    if (countEl) countEl.textContent = `${sorted.length} works`;

    renderProductGrid(grid, sorted, {
      fromHandle: collection?.handle || "all",
      emptyMessage: "No artworks match your current filters.",
      variant: "minimal"
    });

    if (collection) {
      applyCollectionSeo({ collection, products: sorted, brand: "BONY Atelier" });
    }
  };

  const boot = async () => {
    if (grid) setContainerState(grid, "loading", "Loading gallery...");
    try {
      const results = await Promise.all([getStoreData({ forceRefresh: false }), initStorefrontShell()]);
      store = results[0];
      const resolved = getCollectionProducts(store, collectionHandle);
      const collection = resolved.collection;
      if (!collection) throw new Error("Collection not found");

      collectionHandle = collection.handle;
      const activeProducts = resolved.products.filter((item) => item.isActive);
      const allTags = getAllTags(activeProducts);
      renderTagFilters(tagsBox, allTags, state.selectedTags);

      const prices = activeProducts.map((item) => item.pricing?.effectivePrice ?? item.price ?? 0);
      const minPrice = prices.length ? Math.floor(Math.min(...prices)) : 0;
      const maxPrice = prices.length ? Math.ceil(Math.max(...prices)) : 0;

      if (minInput && !minInput.dataset.initialized) {
        minInput.placeholder = formatRangeValue(minPrice);
        minInput.dataset.initialized = "1";
      }
      if (maxInput && !maxInput.dataset.initialized) {
        maxInput.placeholder = formatRangeValue(maxPrice);
        maxInput.dataset.initialized = "1";
      }

      if (sortSelect && !sortSelect.value) {
        sortSelect.value = collection.sortDefault || "newest";
      }

      tagsBox?.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const input = checkbox;
          if (input.checked) state.selectedTags.add(input.value);
          else state.selectedTags.delete(input.value);
          applyFilters();
        });
      });

      applyFilters();
    } catch (error) {
      console.error(error);
      setContainerState(grid, "error", "Gallery could not be loaded.", { showRetry: false });
      const pageError = $("collectionError");
      if (pageError) {
        pageError.hidden = false;
        pageError.textContent = "Data could not be loaded. Please refresh.";
      }
    }
  };

  sortSelect?.addEventListener("change", applyFilters);
  minInput?.addEventListener("input", () => {
    const value = Number(minInput.value);
    state.priceMin = Number.isFinite(value) ? value : null;
    applyFilters();
  });
  maxInput?.addEventListener("input", () => {
    const value = Number(maxInput.value);
    state.priceMax = Number.isFinite(value) ? value : null;
    applyFilters();
  });
  $("clearFiltersBtn")?.addEventListener("click", () => {
    state.selectedTags.clear();
    state.priceMin = null;
    state.priceMax = null;
    if (minInput) minInput.value = "";
    if (maxInput) maxInput.value = "";
    tagsBox?.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
    applyFilters();
  });

  filterToggleBtn?.addEventListener("click", () => {
    const nextHidden = !(filterPanel?.hidden);
    if (filterPanel) filterPanel.hidden = nextHidden;
    filterToggleBtn.setAttribute("aria-expanded", String(!nextHidden));
  });

  attachRetry(retryBtn, boot);
  await boot();
}

initCollectionPage().catch((err) => console.error(err));

