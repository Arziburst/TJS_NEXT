import type { Metadata } from "next";
import { getPathname } from "./navigation";
import { defaultLocale, locales, type Locale } from "./routing";

type Href = Parameters<typeof getPathname>[0]["href"];

/**
 * Origin for absolute canonical/hreflang URLs: NEXT_PUBLIC_SITE_URL (the shop's domain, set on Vercel),
 * else the production domain Vercel assigns to the project, else the local server.
 */
export function getMetadataBase(): URL {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return new URL(siteUrl);
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return new URL(`https://${productionHost}`);
  return new URL(`http://localhost:${process.env.PORT ?? 3000}`);
}

/**
 * canonical + hreflang alternates for one page: every locale, plus x-default pointing at /en.
 * URLs are root-relative; Next.js resolves them against `metadataBase`.
 */
export function getAlternates(href: Href, locale: Locale): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const alternate of locales) {
    languages[alternate] = getPathname({ href, locale: alternate });
  }
  languages["x-default"] = getPathname({ href, locale: defaultLocale });

  return {
    canonical: getPathname({ href, locale }),
    languages,
  };
}
