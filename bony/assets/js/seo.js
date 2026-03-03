import { getAbsoluteUrl } from "./data.js";

function ensureMeta({ name, property }) {
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    if (name) el.setAttribute("name", name);
    if (property) el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  return el;
}

function setMetaContent(key, content, type = "name") {
  if (!content) return;
  const meta = type === "property"
    ? ensureMeta({ property: key })
    : ensureMeta({ name: key });
  meta.setAttribute("content", String(content));
}

function ensureCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function setJsonLd(data) {
  let script = document.head.querySelector('script[data-seo-jsonld="1"]');
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.seoJsonld = "1";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export function applyBaseSeo({
  title,
  description,
  canonicalUrl,
  ogType = "website",
  image,
  twitterCard = "summary_large_image"
}) {
  if (title) document.title = title;
  if (description) setMetaContent("description", description, "name");

  if (canonicalUrl) ensureCanonical(canonicalUrl);

  setMetaContent("og:title", title, "property");
  setMetaContent("og:description", description, "property");
  setMetaContent("og:type", ogType, "property");
  if (canonicalUrl) setMetaContent("og:url", canonicalUrl, "property");
  if (image) setMetaContent("og:image", image, "property");

  setMetaContent("twitter:card", twitterCard, "name");
  setMetaContent("twitter:title", title, "name");
  setMetaContent("twitter:description", description, "name");
  if (image) setMetaContent("twitter:image", image, "name");
}

export function applyProductSeo({ product, brand = "BONY Atelier" }) {
  const url = getAbsoluteUrl(window.location.pathname + window.location.search);
  const canonical = getAbsoluteUrl(`/product.html?id=${encodeURIComponent(product.id)}`);
  const image = getAbsoluteUrl(product.images?.[0] || "/assets/img/placeholder.jpg");
  const description = (product.description || `${product.title} canvas artwork details`).slice(0, 155);
  const inStock = product.stock === null || product.stock > 0;
  const price = product.pricing?.effectivePrice ?? product.price ?? 0;
  const compareAt = product.pricing?.compareAtPrice ?? null;

  applyBaseSeo({
    title: `${product.title} | ${brand}`,
    description,
    canonicalUrl: canonical,
    ogType: "product",
    image
  });

  setJsonLd({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: (product.images || []).map((src) => getAbsoluteUrl(src)),
    description,
    sku: product.id,
    brand: { "@type": "Brand", name: brand },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: product.currency || "TRY",
      price: String(price),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock"
    },
    ...(compareAt ? {
      isSimilarTo: {
        "@type": "Offer",
        priceCurrency: product.currency || "TRY",
        price: String(compareAt)
      }
    } : {})
  });
}

export function applyCollectionSeo({ collection, products = [], brand = "BONY Atelier" }) {
  const handle = collection?.handle || "all";
  const titleText = collection?.title || "Gallery";
  const description = (collection?.description || `${titleText} curated canvas collection`).slice(0, 155);
  const canonical = getAbsoluteUrl(`/collection.html?handle=${encodeURIComponent(handle)}`);
  const firstImage = products[0]?.images?.[0] ? getAbsoluteUrl(products[0].images[0]) : null;

  applyBaseSeo({
    title: `${titleText} | ${brand}`,
    description,
    canonicalUrl: canonical,
    ogType: "website",
    image: firstImage
  });

  setJsonLd({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: titleText,
    description,
    url: canonical,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.slice(0, 20).map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: getAbsoluteUrl(`/product.html?id=${encodeURIComponent(product.id)}`),
        name: product.title
      }))
    }
  });
}

export function applyHomeSeo({ title = "BONY Atelier | Premium Canvas Art", description, image } = {}) {
  const canonical = getAbsoluteUrl("/index.html");
  applyBaseSeo({
    title,
    description: description || "Premium canvas artworks with curated selections and limited studio drops.",
    canonicalUrl: canonical,
    ogType: "website",
    image: image ? getAbsoluteUrl(image) : null
  });

  setJsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "BONY Atelier",
    url: canonical
  });
}
