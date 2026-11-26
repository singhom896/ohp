// SERVER-ONLY: public website data from Laravel (no login), cached in Next.js.
//
// `use cache` keeps each result in memory for a few minutes, so visitors do
// not wait for Laravel on every page view. Saving content or menus in the
// admin console clears the "cms" tag right away (app/api/[...path]/route.ts),
// so edits show up on the next page view.
import { cacheLife, cacheTag } from "next/cache";
import { backendFetch } from "./backend";

export const CMS_TAG = "cms";

export type CmsPage = { slug: string; title: string; content: string; updated_at: string | null };
export type FooterLink = { title: string; url: string; target: "_self" | "_blank" };

/** One active CMS page by slug, or null when it does not exist / is inactive. */
export async function getCmsPage(slug: string): Promise<CmsPage | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CMS_TAG);

  const res = await backendFetch<CmsPage>(`/public/pages/${encodeURIComponent(slug)}`);
  return res.body.success ? res.body.data : null;
}

export type GalleryPhoto = {
  id: number;
  title: string;
  location: string | null;
  type: string | null;
  date: string | null;
  image: string;
};

/** Active photos from CMS Management -> Gallery, in the admin's sort order. Empty when Laravel is down. */
export async function getGallery(limit = 7): Promise<GalleryPhoto[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CMS_TAG);

  const res = await backendFetch<{ items: GalleryPhoto[] }>("/public/gallery", { search: `?limit=${limit}` });
  return res.body.success ? res.body.data.items : [];
}

export type HomeBanner = { id: number; title: string; image: string };

/** Active home page banners from CMS Management -> Banners. Empty when none / Laravel is down. */
export async function getBanners(): Promise<HomeBanner[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CMS_TAG);

  const res = await backendFetch<{ items: HomeBanner[] }>("/public/banners");
  return res.body.success ? res.body.data.items : [];
}

export type MenuEntry = FooterLink & { children: FooterLink[] };

/** Header menu from Administration -> Menus ("Main Menu"). Empty when Laravel is down. */
export async function getMainMenu(): Promise<MenuEntry[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CMS_TAG);

  const res = await backendFetch<{ items: MenuEntry[] }>("/public/main-menu");
  return res.body.success ? res.body.data.items : [];
}

/** Footer menu items from the CMS (Menus module, "Footer Menu"). Empty when Laravel is down. */
export async function getFooterLinks(): Promise<FooterLink[]> {
  return (await getFooterData()).links;
}

/** Date (YYYY-MM-DD) of the latest change to website content, for the footer. */
export async function getSiteLastUpdated(): Promise<string | null> {
  return (await getFooterData()).last_updated;
}

/** Footer menu tree (Administration -> Menus, "Footer Menu"): a menu with children is a column. */
export async function getFooterMenu(): Promise<MenuEntry[]> {
  return (await getFooterData()).items;
}

type FooterData = { items: MenuEntry[]; links: FooterLink[]; last_updated: string | null };

async function getFooterData(): Promise<FooterData> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CMS_TAG);

  const res = await backendFetch<Partial<FooterData>>("/public/footer-links");
  const d = res.body.success ? res.body.data : {};
  return { items: d.items ?? [], links: d.links ?? [], last_updated: d.last_updated ?? null };
}
