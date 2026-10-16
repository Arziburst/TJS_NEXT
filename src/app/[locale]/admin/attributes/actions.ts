"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { takenSlugs } from "@/lib/admin/taxonomy";
import { baseSlugFor, freeSlug, parseTermForm, type TermFieldErrors } from "@/lib/admin/taxonomy-form";
import { getAdmin } from "@/lib/auth/session";
import { CATALOG_TAG } from "@/lib/catalog/cache";
import { createSessionClient } from "@/lib/supabase/server";

/*
 * The admin's writes to the materials and colours (#25). Each action checks the admin itself, validates its
 * input with zod and writes through the caller's session (the database functions apply RLS and the audit
 * trigger), then expires the storefront's listings, filters and lists (CATALOG_TAG).
 */

export type TermFormError = "notAuthorized" | "notFound" | "nameTaken" | "invalid" | "unexpectedError";

export type SaveTermState =
  | { status: "idle" }
  | { status: "error"; error?: TermFormError; fields?: TermFieldErrors }
  | { status: "saved"; id: string; created: boolean; savedAt: number };

// unique (kind, slug): a slug taken between the read and the insert
const SLUG_CONSTRAINT = "taxonomy_terms_kind_slug_key";

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string") values[key] = value;
  return values;
}

/** Creates (no id) or renames a material or a colour. */
export async function saveTerm(_previous: SaveTermState, formData: FormData): Promise<SaveTermState> {
  if (!(await getAdmin())) return { status: "error", error: "notAuthorized" };
  const parsed = parseTermForm(formValues(formData));
  if (!parsed.ok) return { status: "error", error: parsed.invalid ? "invalid" : undefined, fields: parsed.fields };
  const { id, kind, names } = parsed.input;

  try {
    const supabase = await createSessionClient();
    // a new term gets a free slug; one retry when another took it meanwhile
    for (let attempt = 0; attempt < 2; attempt++) {
      let slug = "";
      if (id === null) {
        const taken = await takenSlugs(kind);
        if (!taken) return { status: "error", error: "unexpectedError" };
        slug = freeSlug(baseSlugFor(parsed.input), taken);
      }
      const { data, error } = await supabase.rpc("admin_save_taxonomy_term", {
        p_id: id as string,
        p_kind: kind,
        p_slug: slug,
        p_names: names,
      });
      if (!error) {
        updateTag(CATALOG_TAG);
        // the page's lists show the new name at once
        refresh();
        return { status: "saved", id: data, created: id === null, savedAt: Date.now() };
      }
      if (error.code === "23505" && error.message.includes(SLUG_CONSTRAINT) && id === null) continue;
      if (error.code === "23505") return { status: "error", error: "nameTaken" };
      if (error.code === "42501") return { status: "error", error: "notAuthorized" };
      if (error.code === "P0002") return { status: "error", error: "notFound" };
      return { status: "error", error: "unexpectedError" };
    }
  } catch {
    // fall through
  }
  return { status: "error", error: "unexpectedError" };
}

export type DeleteTermResult =
  | { ok: true }
  | { ok: false; reason: "notAuthorized" | "invalid" | "notFound" | "inUse" | "unexpectedError" };

const deleteInput = z.object({ id: z.uuid() });

/** Deletes a term no product uses (a soft-deleted product's link goes with it). */
export async function deleteTerm(input: unknown): Promise<DeleteTermResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.rpc("admin_delete_taxonomy_term", { p_id: parsed.data.id });
    if (error) return { ok: false, reason: error.code === "42501" ? "notAuthorized" : "unexpectedError" };
    if (data === "in_use") return { ok: false, reason: "inUse" };
    if (data === "not_found") return { ok: false, reason: "notFound" };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
  updateTag(CATALOG_TAG);
  refresh();
  return { ok: true };
}
