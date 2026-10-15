import "server-only";

import type { Locale } from "@/i18n/routing";
import { getAdmin } from "@/lib/auth/session";
import { isLocale } from "@/lib/catalog/mappers";
import { termName } from "@/lib/catalog/search";
import type { TaxonomyKind } from "@/lib/catalog/types";
import { createServiceClient } from "@/lib/supabase/server";
import type { AdminResult } from "./products";

/*
 * The admin's reads of the materials and colours (#25). How many products use a term needs the products'
 * deleted_at, which the API roles cannot read: so the reads go through the service-role client, after the
 * admin check (as src/lib/admin/products.ts).
 */

export type AdminTerm = {
  id: string;
  kind: TaxonomyKind;
  slug: string;
  /** The name in the admin's locale, else en, else uk. */
  name: string;
  names: Partial<Record<Locale, string>>;
  /** Products that are not deleted and have the term: it can be deleted only when none. */
  usedBy: number;
};

/** Every term of both lists, in the shop's order (position, then name in the admin's locale). */
export async function listAdminTerms(locale: Locale): Promise<AdminResult<AdminTerm[]>> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  try {
    const { data, error } = await createServiceClient()
      .from("taxonomy_terms")
      .select("id, kind, slug, position, taxonomy_term_translations(locale, name), product_taxonomy_terms(products(deleted_at))")
      .order("position")
      .order("slug");
    if (error) return { ok: false, reason: "unexpectedError" };
    const collator = new Intl.Collator(locale);
    const terms = data.map((row) => {
      const names: Partial<Record<Locale, string>> = {};
      for (const t of row.taxonomy_term_translations) if (isLocale(t.locale)) names[t.locale] = t.name;
      return {
        position: row.position,
        term: {
          id: row.id,
          kind: row.kind,
          slug: row.slug,
          name: termName(row.taxonomy_term_translations, locale)?.name ?? row.slug,
          names,
          usedBy: row.product_taxonomy_terms.filter((link) => link.products && link.products.deleted_at === null).length,
        } satisfies AdminTerm,
      };
    });
    terms.sort((a, b) => a.position - b.position || collator.compare(a.term.name, b.term.name));
    return { ok: true, data: terms.map((t) => t.term) };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** The slugs a list already has (for the slug of a new term). Null when unreadable. */
export async function takenSlugs(kind: TaxonomyKind): Promise<Set<string> | null> {
  try {
    const { data, error } = await createServiceClient().from("taxonomy_terms").select("slug").eq("kind", kind);
    if (error) return null;
    return new Set(data.map((row) => row.slug));
  } catch {
    return null;
  }
}

/** The ids of a product's terms, for its edit form. */
export async function getProductTermIds(productId: string): Promise<AdminResult<string[]>> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  try {
    const { data, error } = await createServiceClient()
      .from("product_taxonomy_terms")
      .select("term_id")
      .eq("product_id", productId);
    if (error) return { ok: false, reason: "unexpectedError" };
    return { ok: true, data: data.map((row) => row.term_id) };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}
