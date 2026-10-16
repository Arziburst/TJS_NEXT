import type { MetadataRoute } from "next";
import { getMetadataBase } from "@/i18n/metadata";
import { getSitemapCatalog } from "@/lib/catalog/sitemap";
import { buildSitemap } from "@/lib/seo/sitemap";
import { indexedAboutLocales } from "@/lib/settings/about";
import { getAboutContent } from "@/lib/settings/cache";

// One sitemap for every locale (src/lib/seo/sitemap.ts). Cached with the catalogue and the About page and expired by
// the admin's changes (CATALOG_TAG, ABOUT_TAG). A failed catalogue read answers 500, so a crawler comes back later
// instead of reading a sitemap without the products.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [catalog, about] = await Promise.all([getSitemapCatalog(), getAboutContent()]);
  if (!catalog.ok) throw new Error("sitemap: the catalogue could not be read");
  // an unreadable About page is left out until the next read: its pages are not the ones a crawler waits for
  return buildSitemap({ base: getMetadataBase(), ...catalog.data, aboutLocales: indexedAboutLocales(about) });
}
