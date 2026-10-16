import type { Metadata } from "next";
import type { TranslationSource } from "@/lib/catalog/types";

/*
 * Which product translations search engines may index. A machine translation nobody has looked at yet is shown
 * to shoppers (better than the fallback language) but kept out of the index, of hreflang and of the sitemap
 * until the admin marks it reviewed: Google treats unreviewed automated text at scale as spam (scaled content).
 * A human text, or a machine one the admin has reviewed, is indexable.
 */

export type TranslationReview = { source: TranslationSource; reviewedAt: string | null };

export function isIndexable({ source, reviewedAt }: TranslationReview): boolean {
  return source !== "machine" || reviewedAt !== null;
}

/** The robots metadata of a page showing `translation`: none (the default, indexable) or noindex. */
export function translationRobots(translation: TranslationReview): Metadata["robots"] {
  // the links still count: the pages they lead to may well be indexable
  return isIndexable(translation) ? undefined : { index: false, follow: true };
}
