// Finds product photos in the product-images bucket that carry metadata (EXIF, XMP, IPTC; above all a GPS
// position) and, with --apply, replaces each photo row's file with a clean copy: turned upright and re-encoded
// without metadata by the same code as the admin upload (src/lib/images/encode.ts), stored under a NEW path
// (the image optimizer caches by URL for 31 days), the row pointed at it, the old file deleted.
//
//   node scripts/images/strip-metadata.mjs [--apply] [--gps-only] [--production]
//
// Dry run by default: it only reports. --gps-only limits --apply to photos with a GPS position. Files no row
// points at are reported, never changed. Target: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// the environment, else from .env.local; a non-loopback URL is refused unless --production is given.
//
// After --apply on production: storefront pages cached before the run still name the old URLs; the image
// optimizer may keep serving its cached (metadata-free) copies of them, and the pages pick up the new URLs when
// their cache entries expire or on the next deployment.
import { randomUUID } from "node:crypto";
import { posix } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { encodeForStorage, readMetadata } from "../../src/lib/images/encode.ts";
import { resolveTarget } from "../import/legacy-catalogue.mjs";

const BUCKET = "product-images";
const PAGE = 1000;

/**
 * @typedef {{ path: string, productId: string, legacyId: string | null }} PhotoEntry
 * @typedef {{ exif: boolean, xmp: boolean, iptc: boolean, gps: boolean }} Metadata
 * @typedef {{
 *   checked: number,
 *   withMetadata: (PhotoEntry & { metadata: Metadata })[],
 *   withGps: PhotoEntry[],
 *   cleaned: (PhotoEntry & { newPath: string })[],
 *   failed: (PhotoEntry & { error: string })[],
 *   orphans: { path: string, metadata?: Metadata, error?: string }[],
 * }} Report
 */

/**
 * The new path of a cleaned photo: the same folder, a new file name, the extension of its format.
 * @param {string} oldPath
 * @param {string} extension
 * @param {string} [id]
 */
export function cleanPathFor(oldPath, extension, id = randomUUID()) {
  const folder = posix.dirname(oldPath);
  return `${folder === "." ? "" : `${folder}/`}${id}.${extension}`;
}

/** Whether a photo needs cleaning: any metadata block, or with gpsOnly only a GPS position. */
export function needsCleaning(metadata, { gpsOnly = false } = {}) {
  return gpsOnly ? metadata.gps : metadata.exif || metadata.xmp || metadata.iptc;
}

async function allRows(client) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("product_images")
      .select("id, product_id, storage_path, products(legacy_id)")
      .order("storage_path")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`product_images: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Every file in the bucket (Storage lists one folder level at a time). */
async function allFiles(client, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // folders have no id
      if (entry.id === null) files.push(...(await allFiles(client, path)));
      else files.push(path);
    }
    if (data.length < PAGE) return files;
  }
}

async function download(client, path) {
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`download ${path}: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

/** Replaces one row's file with a clean copy under a new path; the old file is deleted last. */
async function cleanRow(client, row, bytes) {
  const encoded = await encodeForStorage(bytes);
  if (!encoded.ok) throw new Error(`cannot re-encode (${encoded.reason})`);
  const { image } = encoded;
  const newPath = cleanPathFor(row.storage_path, image.extension);
  const upload = await client.storage
    .from(BUCKET)
    .upload(newPath, image.bytes, { contentType: image.contentType, upsert: false, cacheControl: "31536000" });
  if (upload.error) throw new Error(`upload ${newPath}: ${upload.error.message}`);
  const { data, error } = await client
    .from("product_images")
    .update({ storage_path: newPath, width: image.width, height: image.height, blur_data_url: image.blurDataUrl })
    .eq("id", row.id)
    // only if nobody changed the row meanwhile
    .eq("storage_path", row.storage_path)
    .select("id");
  if (error || data.length !== 1) {
    await client.storage.from(BUCKET).remove([newPath]);
    throw new Error(`row ${row.id}: ${error?.message ?? "changed meanwhile"}`);
  }
  const removed = await client.storage.from(BUCKET).remove([row.storage_path]);
  if (removed.error) throw new Error(`old file ${row.storage_path} kept: ${removed.error.message}`);
  return newPath;
}

/**
 * Checks every photo row's file (and reports files no row points at); with apply, cleans the rows' files that
 * need it. Returns the findings; `log` gets one line per photo with a GPS position and per cleaned photo.
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {{ apply?: boolean, gpsOnly?: boolean, log?: (line: string) => void }} [options]
 * @returns {Promise<Report>}
 */
export async function stripMetadata(client, { apply = false, gpsOnly = false, log = () => {} } = {}) {
  /** @type {Report} */
  const report = { checked: 0, withMetadata: [], withGps: [], cleaned: [], failed: [], orphans: [] };
  const rows = await allRows(client);
  const referenced = new Set(rows.map((r) => r.storage_path));

  for (const row of rows) {
    report.checked += 1;
    const entry = { path: row.storage_path, productId: row.product_id, legacyId: row.products?.legacy_id ?? null };
    let bytes;
    let metadata;
    try {
      bytes = await download(client, row.storage_path);
      metadata = await readMetadata(bytes);
    } catch (error) {
      report.failed.push({ ...entry, error: String(error.message ?? error) });
      continue;
    }
    if (metadata.exif || metadata.xmp || metadata.iptc) report.withMetadata.push({ ...entry, metadata });
    if (metadata.gps) {
      report.withGps.push(entry);
      log(`GPS  ${row.storage_path} (product ${row.product_id}${entry.legacyId ? `, legacy ${entry.legacyId}` : ""})`);
    }
    if (!apply || !needsCleaning(metadata, { gpsOnly })) continue;
    try {
      const newPath = await cleanRow(client, row, bytes);
      report.cleaned.push({ ...entry, newPath });
      log(`done ${row.storage_path} -> ${newPath}`);
    } catch (error) {
      report.failed.push({ ...entry, error: String(error.message ?? error) });
    }
  }

  for (const path of await allFiles(client)) {
    if (referenced.has(path)) continue;
    try {
      const metadata = await readMetadata(await download(client, path));
      report.orphans.push({ path, metadata });
    } catch (error) {
      report.orphans.push({ path, error: String(error.message ?? error) });
    }
  }
  return report;
}

export function summarize(report, { apply }) {
  const lines = [
    `checked ${report.checked} photo rows`,
    `with metadata (EXIF/XMP/IPTC): ${report.withMetadata.length}`,
    `with a GPS position: ${report.withGps.length}`,
    ...report.withGps.map((e) => `  - ${e.path} (product ${e.productId}${e.legacyId ? `, legacy ${e.legacyId}` : ""})`),
    apply ? `cleaned: ${report.cleaned.length}` : "dry run: nothing changed (--apply cleans)",
    `failed: ${report.failed.length}`,
    ...report.failed.map((e) => `  - ${e.path}: ${e.error}`),
    `files no row points at: ${report.orphans.length}` +
      (report.orphans.some((o) => o.metadata?.gps) ? " (some with GPS, left as they are)" : ""),
    ...report.orphans.filter((o) => o.metadata?.gps || o.error).map((o) => `  - ${o.path}${o.error ? `: ${o.error}` : " (GPS)"}`),
  ];
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      "gps-only": { type: "boolean", default: false },
      production: { type: "boolean", default: false },
    },
  });
  const { target, reason } = resolveTarget(process.env, { production: values.production });
  if (!target) {
    console.error(`strip-metadata: ${reason}`);
    process.exit(1);
  }
  console.log(`strip-metadata: ${target.host}${target.loopback ? " (local)" : " (production)"}${values.apply ? ", applying" : ", dry run"}`);
  const client = createClient(target.url, target.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await stripMetadata(client, { apply: values.apply, gpsOnly: values["gps-only"], log: (line) => console.log(line) });
  console.log(summarize(report, { apply: values.apply }));
  if (report.failed.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
