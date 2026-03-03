const PLACEHOLDER_IMAGE = "/assets/img/placeholder.jpg";

const DATASETS = {
  products: { url: "/data/products.json", draftKey: "bony_draft_products_art_v1" },
  collections: { url: "/data/collections.json", draftKey: "bony_draft_collections_art_v1" },
  campaigns: { url: "/data/campaigns.json", draftKey: "bony_draft_campaigns_art_v1" }
};
const SETTINGS_DATASET = { url: "/data/settings.json", draftKey: "bony_draft_settings_art_v1" };

const memoryCache = new Map();

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function deleteStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function toString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\-]+/g, "-")
    .replace(/\-+/g, "-")
    .replace(/^\-|\-$/g, "");
}

export function normalizeCurrency(currency) {
  const cur = String(currency || "").toUpperCase().trim();
  return ["TRY", "USD", "EUR"].includes(cur) ? cur : "TRY";
}

function normalizeStringArray(value, { limit = 20 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeDate(value) {
  if (!value) return null;
  const iso = String(value).trim();
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeScope(rawScope) {
  if (rawScope === "all") return "all";

  if (!rawScope || typeof rawScope !== "object") {
    return "all";
  }

  const collectionHandles = normalizeStringArray(rawScope.collectionHandles, { limit: 50 }).map(slug);
  const productIds = normalizeStringArray(rawScope.productIds, { limit: 200 });

  if (productIds.length) return { productIds };
  if (collectionHandles.length) return { collectionHandles };
  return "all";
}

export function normalizeProduct(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = slug(raw.id);
  if (!id) return null;

  const title = toString(raw.title, "Artwork") || "Artwork";
  const price = toNumber(raw.price);
  const currency = normalizeCurrency(raw.currency);

  const images = Array.isArray(raw.images)
    ? raw.images.map((img) => String(img || "").trim()).filter(Boolean).slice(0, 20)
    : (toString(raw.image) ? [toString(raw.image)] : []);

  let tags = normalizeStringArray(raw.tags, { limit: 30 });
  if (!tags.length && toString(raw.collection)) tags = [toString(raw.collection)];

  const stock = toNumber(raw.stock);

  return {
    id,
    title,
    category: toString(raw.category, "") || null,
    price: price === null ? 0 : Math.max(0, price),
    currency,
    compareAtPrice: (() => {
      const n = toNumber(raw.compareAtPrice);
      return n === null ? null : Math.max(0, n);
    })(),
    discountPercent: (() => {
      const n = toNumber(raw.discountPercent);
      return n === null ? null : Math.max(0, Math.min(100, Math.round(n)));
    })(),
    images,
    description: toString(raw.description),
    tags,
    stock: stock === null ? null : Math.max(0, Math.floor(stock)),
    isActive: raw.isActive !== false,
    createdAt: normalizeDate(raw.createdAt),
    _legacyCollection: toString(raw.collection) || null
  };
}

export function normalizeCollection(raw) {
  if (!raw || typeof raw !== "object") return null;

  const handle = slug(raw.handle);
  if (!handle) return null;

  let rules = { type: "all" };
  if (raw.rules && typeof raw.rules === "object") {
    const type = raw.rules.type === "manual"
      ? "manual"
      : (raw.rules.type === "tags" ? "tags" : "all");
    if (type === "tags") {
      rules = {
        type: "tags",
        tags: normalizeStringArray(raw.rules.tags, { limit: 50 })
      };
    } else if (type === "manual") {
      rules = {
        type: "manual",
        productIds: normalizeStringArray(raw.rules.productIds, { limit: 200 }).map(slug)
      };
    } else {
      rules = { type: "all" };
    }
  }

  const sortDefault = ["newest", "price-asc", "price-desc", "title-asc"].includes(raw.sortDefault)
    ? raw.sortDefault
    : "newest";

  return {
    handle,
    title: toString(raw.title, handle) || handle,
    description: toString(raw.description),
    rules,
    sortDefault
  };
}

export function normalizeSiteSettings(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  return {
    homeBannerCollectionHandle: slug(input.homeBannerCollectionHandle || "all") || "all"
  };
}

export function normalizeCampaign(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = slug(raw.id);
  if (!id) return null;

  const discountType = raw.discountType === "fixed" ? "fixed" : "percent";
  const discountValue = toNumber(raw.discountValue);

  if (discountValue === null || discountValue < 0) return null;

  return {
    id,
    title: toString(raw.title, id) || id,
    isActive: raw.isActive !== false,
    startAt: normalizeDate(raw.startAt),
    endAt: normalizeDate(raw.endAt),
    scope: normalizeScope(raw.scope),
    discountType,
    discountValue,
    badgeText: toString(raw.badgeText) || null,
    priority: (() => {
      const p = toNumber(raw.priority);
      return p === null ? 0 : Math.round(p);
    })()
  };
}

export function normalizeDataset(name, raw) {
  const input = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];

  for (const item of input) {
    const normalized =
      name === "products" ? normalizeProduct(item)
      : name === "collections" ? normalizeCollection(item)
      : name === "campaigns" ? normalizeCampaign(item)
      : null;

    if (!normalized) continue;
    const key = normalized.id || normalized.handle;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  if (name === "collections" && !out.some((c) => c.handle === "all")) {
    out.unshift({
      handle: "all",
      title: "All Works",
      description: "All active canvas artworks",
      rules: { type: "all" },
      sortDefault: "newest"
    });
  }

  return out;
}

export function readDraftDataset(name) {
  const config = DATASETS[name];
  if (!config) return null;
  const raw = readStorage(config.draftKey);
  if (!raw) return null;
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) return null;
  return normalizeDataset(name, parsed);
}

export function saveDraftDataset(name, data) {
  const config = DATASETS[name];
  if (!config) return false;
  const normalized = normalizeDataset(name, data);
  memoryCache.delete(name);
  memoryCache.delete("store");
  return writeStorage(config.draftKey, JSON.stringify(normalized, null, 2));
}

export function clearDraftDataset(name) {
  const config = DATASETS[name];
  if (!config) return false;
  memoryCache.delete(name);
  memoryCache.delete("store");
  return deleteStorage(config.draftKey);
}

export function listDatasetNames() {
  return Object.keys(DATASETS);
}

async function fetchDatasetFromNetwork(name, { signal } = {}) {
  const config = DATASETS[name];
  if (!config) throw new Error(`Unknown dataset: ${name}`);

  const res = await fetch(config.url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal
  });
  if (!res.ok) throw new Error(`${name}.json fetch failed: ${res.status}`);

  const json = await res.json();
  if (!Array.isArray(json)) throw new Error(`${name}.json root must be array`);
  return normalizeDataset(name, json);
}

async function fetchSiteSettingsFromNetwork({ signal } = {}) {
  const res = await fetch(SETTINGS_DATASET.url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal
  });
  if (!res.ok) throw new Error(`settings.json fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("settings.json root must be object");
  }
  return normalizeSiteSettings(json);
}

export async function getDataset(name, { forceRefresh = false, useDraft = true } = {}) {
  if (!forceRefresh && memoryCache.has(name)) {
    return memoryCache.get(name);
  }

  if (useDraft) {
    const draft = readDraftDataset(name);
    if (draft) {
      memoryCache.set(name, draft);
      return draft;
    }
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 7000);
  try {
    const data = await fetchDatasetFromNetwork(name, { signal: ctrl.signal });
    memoryCache.set(name, data);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export function readSiteSettingsDraft() {
  const raw = readStorage(SETTINGS_DATASET.draftKey);
  if (!raw) return null;
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return normalizeSiteSettings(parsed);
}

export function saveSiteSettingsDraft(settings) {
  const normalized = normalizeSiteSettings(settings);
  memoryCache.delete("settings");
  return writeStorage(SETTINGS_DATASET.draftKey, JSON.stringify(normalized, null, 2));
}

export function clearSiteSettingsDraft() {
  memoryCache.delete("settings");
  return deleteStorage(SETTINGS_DATASET.draftKey);
}

export async function getSiteSettings({ forceRefresh = false, useDraft = true } = {}) {
  if (!forceRefresh && memoryCache.has("settings")) return memoryCache.get("settings");

  if (useDraft) {
    const draft = readSiteSettingsDraft();
    if (draft) {
      memoryCache.set("settings", draft);
      return draft;
    }
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 7000);
  try {
    const data = await fetchSiteSettingsFromNetwork({ signal: ctrl.signal });
    memoryCache.set("settings", data);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function isCampaignActiveAt(campaign, nowTs) {
  if (!campaign.isActive) return false;
  const startTs = campaign.startAt ? Date.parse(campaign.startAt) : null;
  const endTs = campaign.endAt ? Date.parse(campaign.endAt) : null;
  if (startTs !== null && nowTs < startTs) return false;
  if (endTs !== null && nowTs > endTs) return false;
  return true;
}

function matchesCollectionRules(product, collection) {
  if (!product.isActive) return false;
  if (!collection || !collection.rules) return false;
  if (collection.handle === "all" || collection.rules.type === "all") return true;
  if (collection.rules.type === "tags") {
    const productTags = new Set((product.tags || []).map((t) => t.toLowerCase()));
    return (collection.rules.tags || []).some((tag) => productTags.has(String(tag).toLowerCase()));
  }
  if (collection.rules.type === "manual") {
    return (collection.rules.productIds || []).includes(product.id);
  }
  return false;
}

function computeCollectionMembership(products, collections) {
  const membership = new Map();
  for (const product of products) membership.set(product.id, new Set());

  for (const collection of collections) {
    for (const product of products) {
      if (matchesCollectionRules(product, collection)) {
        membership.get(product.id)?.add(collection.handle);
      }
    }
  }

  return membership;
}

function campaignMatchesProduct(campaign, product, productCollectionHandles) {
  if (campaign.scope === "all") return true;
  if (campaign.scope?.productIds) return campaign.scope.productIds.includes(product.id);
  if (campaign.scope?.collectionHandles) {
    return campaign.scope.collectionHandles.some((handle) => productCollectionHandles.has(handle));
  }
  return false;
}

function computeCampaignPrice(basePrice, campaign) {
  if (!campaign) return basePrice;
  if (campaign.discountType === "fixed") {
    return Math.max(0, basePrice - campaign.discountValue);
  }
  return Math.max(0, basePrice * (1 - (campaign.discountValue / 100)));
}

function selectBestCampaign(product, activeCampaigns, productCollectionHandles) {
  if (!activeCampaigns.length) return null;

  const matches = activeCampaigns.filter((campaign) =>
    campaignMatchesProduct(campaign, product, productCollectionHandles)
  );
  if (!matches.length) return null;

  return matches.sort((a, b) => {
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    const aPrice = computeCampaignPrice(product.price, a);
    const bPrice = computeCampaignPrice(product.price, b);
    return aPrice - bPrice;
  })[0];
}

function enrichProduct(product, { membership, campaigns, nowTs }) {
  const productCollectionHandles = membership.get(product.id) || new Set();
  const activeCampaigns = campaigns.filter((c) => isCampaignActiveAt(c, nowTs));
  const appliedCampaign = selectBestCampaign(product, activeCampaigns, productCollectionHandles);

  const basePrice = Number(product.price || 0);
  const campaignPrice = computeCampaignPrice(basePrice, appliedCampaign);
  let effectivePrice = basePrice;
  let compareAtPrice = product.compareAtPrice;
  let discountPercent = product.discountPercent;

  if (appliedCampaign && campaignPrice < effectivePrice) {
    compareAtPrice = compareAtPrice && compareAtPrice > basePrice ? compareAtPrice : basePrice;
    effectivePrice = Math.round(campaignPrice * 100) / 100;
    discountPercent = Math.round(((compareAtPrice - effectivePrice) / compareAtPrice) * 100);
  } else if (compareAtPrice && compareAtPrice > basePrice) {
    effectivePrice = basePrice;
    discountPercent = discountPercent ?? Math.round(((compareAtPrice - basePrice) / compareAtPrice) * 100);
  } else if (discountPercent && discountPercent > 0) {
    compareAtPrice = compareAtPrice && compareAtPrice > basePrice ? compareAtPrice : basePrice;
    effectivePrice = Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
  }

  const hasDiscount = Number.isFinite(effectivePrice) && effectivePrice < basePrice || (
    compareAtPrice && compareAtPrice > effectivePrice
  );

  const finalCompare = compareAtPrice && compareAtPrice > effectivePrice ? compareAtPrice : null;
  const finalDiscount = hasDiscount && finalCompare
    ? Math.max(1, Math.round(((finalCompare - effectivePrice) / finalCompare) * 100))
    : null;

  return {
    ...product,
    images: product.images?.length ? product.images : [PLACEHOLDER_IMAGE],
    collectionHandles: [...productCollectionHandles],
    pricing: {
      basePrice,
      effectivePrice,
      compareAtPrice: finalCompare,
      discountPercent: finalDiscount,
      hasDiscount: Boolean(hasDiscount && finalCompare),
      campaignId: appliedCampaign?.id || null,
      campaignTitle: appliedCampaign?.title || null,
      badgeText: appliedCampaign?.badgeText || null
    }
  };
}

export async function getStoreData({ forceRefresh = false } = {}) {
  if (!forceRefresh && memoryCache.has("store")) {
    return memoryCache.get("store");
  }

  const [productsBase, collections, campaigns] = await Promise.all([
    getDataset("products", { forceRefresh }),
    getDataset("collections", { forceRefresh }),
    getDataset("campaigns", { forceRefresh })
  ]);

  const membership = computeCollectionMembership(productsBase, collections);
  const nowTs = Date.now();
  const products = productsBase.map((product) =>
    enrichProduct(product, { membership, campaigns, nowTs })
  );

  const store = {
    products,
    collections,
    campaigns,
    productsById: new Map(products.map((p) => [p.id, p])),
    collectionsByHandle: new Map(collections.map((c) => [c.handle, c]))
  };

  memoryCache.set("store", store);
  return store;
}

export function getCollectionProducts(store, handle = "all") {
  const collection = store.collectionsByHandle.get(handle) || store.collectionsByHandle.get("all");
  if (!collection) return { collection: null, products: [] };

  const products = store.products.filter((product) => matchesCollectionRules(product, collection));
  return { collection, products };
}

export function getAllTags(products) {
  const counts = new Map();
  for (const product of products) {
    if (!product.isActive) continue;
    for (const tag of product.tags || []) {
      const key = String(tag).trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "tr"))
    .map(([value, count]) => ({ value, count }));
}

export function filterProducts(products, { tags = [], priceMin = null, priceMax = null } = {}) {
  const selectedTags = new Set(tags.map((t) => String(t).toLowerCase()));
  return products.filter((product) => {
    if (!product.isActive) return false;
    if (selectedTags.size) {
      const productTags = new Set((product.tags || []).map((t) => String(t).toLowerCase()));
      for (const tag of selectedTags) {
        if (!productTags.has(tag)) return false;
      }
    }

    const price = product.pricing?.effectivePrice ?? product.price ?? 0;
    if (priceMin !== null && price < priceMin) return false;
    if (priceMax !== null && price > priceMax) return false;
    return true;
  });
}

export function sortProducts(products, sortKey = "newest") {
  const items = [...products];
  const byPrice = (p) => p.pricing?.effectivePrice ?? p.price ?? 0;

  if (sortKey === "price-asc") {
    items.sort((a, b) => byPrice(a) - byPrice(b));
  } else if (sortKey === "price-desc") {
    items.sort((a, b) => byPrice(b) - byPrice(a));
  } else if (sortKey === "title-asc") {
    items.sort((a, b) => a.title.localeCompare(b.title, "tr"));
  } else {
    items.sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bt - at || a.title.localeCompare(b.title, "tr");
    });
  }
  return items;
}

export function pickRecommendedProducts(currentProduct, allProducts, { limit = 4 } = {}) {
  const others = allProducts.filter((p) => p.id !== currentProduct.id && p.isActive);
  const currentTags = new Set((currentProduct.tags || []).map((t) => String(t).toLowerCase()));

  const sameTag = others
    .map((product) => {
      const score = (product.tags || []).reduce(
        (sum, tag) => sum + (currentTags.has(String(tag).toLowerCase()) ? 1 : 0),
        0
      );
      return { product, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.product);

  const unique = new Map();
  for (const product of sameTag) unique.set(product.id, product);

  if (unique.size < limit) {
    const currentPrice = currentProduct.pricing?.effectivePrice ?? currentProduct.price ?? 0;
    const byPriceProximity = [...others].sort((a, b) => {
      const aDiff = Math.abs((a.pricing?.effectivePrice ?? a.price ?? 0) - currentPrice);
      const bDiff = Math.abs((b.pricing?.effectivePrice ?? b.price ?? 0) - currentPrice);
      return aDiff - bDiff;
    });
    for (const product of byPriceProximity) {
      if (unique.size >= limit) break;
      unique.set(product.id, product);
    }
  }

  return [...unique.values()].slice(0, Math.min(Math.max(limit, 4), 8));
}

export function formatMoney(amount, currency = "TRY") {
  if (!Number.isFinite(Number(amount))) return "-";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function firstImageOrPlaceholder(images) {
  return (Array.isArray(images) && images[0]) ? images[0] : PLACEHOLDER_IMAGE;
}

export function isInStock(product) {
  if (product.stock === null) return true;
  return Number(product.stock) > 0;
}

export function buildCollectionUrl(handle = "all") {
  return `/collection.html?handle=${encodeURIComponent(handle)}`;
}

export function buildProductUrl(productId, { from } = {}) {
  const params = new URLSearchParams({ id: productId });
  if (from) params.set("from", from);
  return `/product.html?${params.toString()}`;
}

export function getAbsoluteUrl(pathOrUrl) {
  try {
    return new URL(pathOrUrl, window.location.origin).toString();
  } catch {
    return pathOrUrl;
  }
}
