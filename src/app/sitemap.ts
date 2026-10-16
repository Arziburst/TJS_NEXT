import type { MetadataRoute } from "next";
import { getMetadataBase } from "@/i18n/metadata";
import { getSitemapCatalog } from "@/lib/catalog/sitemap";
import { buildSitemap } from "@/lib/seo/sitemap";

// One sitemap for every locale (src/lib/seo/sitemap.ts). Cached with the catalogue and expired by the admin's
// changes (CATALOG_TAG). A failed read answers 500, so a crawler comes back later instead of reading a sitemap
// without the products.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getSitemapCatalog();
  if (!catalog.ok) throw new Error("sitemap: the catalogue could not be read");
  return buildSitemap({ base: getMetadataBase(), ...catalog.data });
}
