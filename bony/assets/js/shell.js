import { buildCollectionUrl, getDataset, getSiteSettings } from "./data.js";
import { initCartShell } from "./cart.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function menuLinkHtml(collection) {
  return `<a class="site-nav__link" href="${buildCollectionUrl(collection.handle)}">${escapeHtml(collection.title)}</a>`;
}

export async function hydrateStorefrontMenus() {
  const rows = [...document.querySelectorAll('[data-role="collections-menu-row"]')];
  if (!rows.length) return;

  try {
    const collections = await getDataset("collections");
    const unique = new Map();
    for (const item of collections) {
      if (!unique.has(item.handle)) unique.set(item.handle, item);
    }
    if (!unique.has("all")) {
      unique.set("all", { handle: "all", title: "All Works" });
    }
    const ordered = [
      unique.get("all"),
      ...[...unique.values()].filter((c) => c.handle !== "all")
    ].filter(Boolean);

    const html = ordered.map(menuLinkHtml).join("");
    rows.forEach((row) => { row.innerHTML = html; });
  } catch (error) {
    console.error(error);
    rows.forEach((row) => {
      row.innerHTML = `<a class="site-nav__link" href="${buildCollectionUrl("all")}">All Works</a>`;
    });
  }
}

export async function hydrateHomeBannerLink() {
  const links = [
    ...document.querySelectorAll('[data-role="home-banner-link"]'),
    ...document.querySelectorAll('[data-role="home-hero-link"]')
  ];
  if (!links.length) return;
  try {
    const settings = await getSiteSettings();
    const handle = settings.homeBannerCollectionHandle || "all";
    const href = buildCollectionUrl(handle);
    links.forEach((link) => {
      if (link instanceof HTMLAnchorElement) link.href = href;
    });
  } catch (error) {
    console.error(error);
  }
}

export async function initStorefrontShell() {
  await Promise.all([hydrateStorefrontMenus(), hydrateHomeBannerLink()]);
  initCartShell();
}
