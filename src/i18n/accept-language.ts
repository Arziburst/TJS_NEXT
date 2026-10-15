import { locales } from "./routing";

const supported = new Set<string>(locales);

/*
 * D27: a browser language outside the 11 locales resolves to /en. next-intl matches Accept-Language with
 * CLDR language distance ("best fit"), which sends Russian to /uk; keeping only the ranges whose primary
 * language is one of ours leaves it nothing to match but those, and an empty header falls back to /en.
 * Regional variants still match their language (de-AT → de, pt-BR → pt). Null when nothing is left.
 */
export function supportedAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  const kept = header
    .split(",")
    .map((range) => range.trim())
    .filter((range) => supported.has(range.split(";")[0].split("-")[0].trim().toLowerCase()));
  return kept.length > 0 ? kept.join(",") : null;
}
