import "server-only";

import type { ServerSupabaseClient } from "@/lib/supabase/server";

/*
 * Staged uploads that never became a photo (the tab was closed, the connection dropped before the finishing
 * action ran) stay in the private staging bucket. A daily cron removes those older than a day: an upload in
 * progress takes seconds, and its signed URL expires after two hours.
 */

/** The private bucket the browser uploads a photo to before the server checks it (src/lib/admin/images.ts). */
export const STAGING_BUCKET = "product-image-uploads";
/** Age after which a staged file is abandoned (a technical limit). */
export const STAGED_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Storage lists at most this many entries per request; removes are batched the same way
const PAGE = 1000;

export type SweepResult = { status: "ok" | "failed"; checked: number; removed: number; error?: string };

async function list(client: ServerSupabaseClient, prefix: string) {
  const entries = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage
      .from(STAGING_BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
    entries.push(...data);
    if (data.length < PAGE) return entries;
  }
}

/**
 * Removes every staged file older than `maxAgeMs` at `now`; the staging folders are one level deep (admin
 * ids). `folders` limits the sweep to some admins' folders (the stack test sweeps only its own).
 */
export async function sweepStagedUploads(
  client: ServerSupabaseClient,
  { now, maxAgeMs = STAGED_UPLOAD_MAX_AGE_MS, folders }: { now: Date; maxAgeMs?: number; folders?: readonly string[] },
): Promise<SweepResult> {
  const cutoff = now.getTime() - maxAgeMs;
  let checked = 0;
  let removed = 0;
  try {
    const abandoned: string[] = [];
    for (const folder of await list(client, "")) {
      // a file at the top level cannot be staged (the policies require a folder); only folders have no id
      if (folder.id !== null || (folders && !folders.includes(folder.name))) continue;
      for (const file of await list(client, folder.name)) {
        if (file.id === null) continue;
        checked += 1;
        const created = file.created_at ? Date.parse(file.created_at) : Number.NaN;
        if (Number.isFinite(created) && created < cutoff) abandoned.push(`${folder.name}/${file.name}`);
      }
    }
    for (let i = 0; i < abandoned.length; i += PAGE) {
      const { data, error } = await client.storage.from(STAGING_BUCKET).remove(abandoned.slice(i, i + PAGE));
      if (error) throw new Error(`remove: ${error.message}`);
      removed += data.length;
    }
    return { status: "ok", checked, removed };
  } catch (error) {
    return { status: "failed", checked, removed, error: error instanceof Error ? error.message : String(error) };
  }
}
