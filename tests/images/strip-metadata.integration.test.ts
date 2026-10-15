// scripts/images/strip-metadata.mjs: its pure helpers, and a run on the local stack against a photo row whose
// file carries EXIF with a GPS position (dry run reports it, --apply cleans it under a new path) and a clean one
// it leaves alone. The stack part is skipped without a local stack.
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { readMetadata } from "@/lib/images/encode";
import { cleanPathFor, needsCleaning, stripMetadata, summarize } from "../../scripts/images/strip-metadata.mjs";
import { localStack } from "../catalog/local-stack";

describe("strip-metadata helpers", () => {
  it("puts the clean copy next to the old file under a new name", () => {
    expect(cleanPathFor("legacy/abc/photo.JPG", "jpg", "11111111-2222-4333-8444-555555555555")).toBe(
      "legacy/abc/11111111-2222-4333-8444-555555555555.jpg",
    );
    expect(cleanPathFor("top.png", "png", "x")).toBe("x.png");
    expect(cleanPathFor("a/b.jpg", "jpg")).toMatch(/^a\/[0-9a-f-]{36}\.jpg$/);
  });

  it("cleans any metadata, or with --gps-only only a GPS position", () => {
    const exifOnly = { exif: true, xmp: false, iptc: false, gps: false };
    const gps = { exif: true, xmp: false, iptc: false, gps: true };
    const none = { exif: false, xmp: false, iptc: false, gps: false };
    expect([needsCleaning(exifOnly), needsCleaning(gps), needsCleaning(none)]).toEqual([true, true, false]);
    expect([needsCleaning(exifOnly, { gpsOnly: true }), needsCleaning(gps, { gpsOnly: true })]).toEqual([false, true]);
  });
});

const stack = localStack();
const BUCKET = "product-images";

describe.skipIf(!stack)("strip-metadata on the local stack", () => {
  if (!stack) return;
  const service = createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } });
  const folder = `it-strip-${crypto.randomUUID()}`;
  const gpsPath = `${folder}/gps.jpg`;
  const cleanPath = `${folder}/clean.png`;
  let productId: string;
  let gpsRowId: string;

  beforeAll(async () => {
    const { data: category } = await service.from("categories").select("id").eq("slug", "rings").single();
    const { data: product, error } = await service
      .from("products")
      .insert({ category_id: category!.id, sku: `IT-STRIP-${crypto.randomUUID().slice(0, 8)}`, status: "draft", price_usd: 10 })
      .select("id")
      .single();
    if (error) throw error;
    productId = product.id;

    const gps = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 200, g: 100, b: 80 } } })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 27/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "30/1 31/1 0/1" } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const clean = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    for (const [path, bytes, contentType] of [
      [gpsPath, gps, "image/jpeg"],
      [cleanPath, clean, "image/png"],
    ] as const) {
      const upload = await service.storage.from(BUCKET).upload(path, bytes, { contentType });
      if (upload.error) throw upload.error;
    }
    const { data: rows, error: rowError } = await service
      .from("product_images")
      .insert([
        { product_id: productId, storage_path: gpsPath, position: 0, width: 40, height: 20 },
        { product_id: productId, storage_path: cleanPath, position: 1, width: 10, height: 10 },
      ])
      .select("id, storage_path");
    if (rowError) throw rowError;
    gpsRowId = rows.find((r) => r.storage_path === gpsPath)!.id;
  });

  afterAll(async () => {
    const { data } = await service.storage.from(BUCKET).list(folder);
    if (data?.length) await service.storage.from(BUCKET).remove(data.map((f) => `${folder}/${f.name}`));
    await service.from("products").delete().eq("id", productId);
  });

  it("a dry run reports the GPS photo and changes nothing", async () => {
    const report = await stripMetadata(service, { prefix: folder });
    expect(report.withGps.map((e) => e.path)).toContain(gpsPath);
    expect(report.withMetadata.map((e) => e.path)).not.toContain(cleanPath);
    expect(report.cleaned).toEqual([]);
    expect(summarize(report, { apply: false })).toContain(`- ${gpsPath} (product ${productId})`);
    const { data } = await service.from("product_images").select("storage_path").eq("id", gpsRowId).single();
    expect(data?.storage_path).toBe(gpsPath);
  });

  it("--apply stores a clean, upright copy under a new path, points the row at it and deletes the old file", async () => {
    const report = await stripMetadata(service, { apply: true, prefix: folder });
    const newPath = report.cleaned.find((e) => e.path === gpsPath)?.newPath ?? "";
    expect(newPath).toMatch(new RegExp(`^${folder}/[0-9a-f-]{36}\\.jpg$`));
    expect(report.cleaned.map((e) => e.path)).not.toContain(cleanPath);
    // the clean copy is the row's file now, not a file without a row
    expect(report.orphans.map((o) => o.path)).not.toContain(newPath);

    const { data: row } = await service
      .from("product_images")
      .select("storage_path, width, height, blur_data_url")
      .eq("id", gpsRowId)
      .single();
    expect(row).toMatchObject({ storage_path: newPath, width: 20, height: 40 });
    expect(row?.blur_data_url).toMatch(/^data:image\/png;base64,/);
    const { data: blob } = await service.storage.from(BUCKET).download(newPath);
    expect(await readMetadata(new Uint8Array(await blob!.arrayBuffer()))).toEqual({ exif: false, xmp: false, iptc: false, gps: false });
    const { data: files } = await service.storage.from(BUCKET).list(folder);
    expect(files?.map((f) => f.name).sort()).toEqual(["clean.png", newPath.split("/").pop()].sort());

    // a second run finds nothing more to do here
    const again = await stripMetadata(service, { apply: true, prefix: folder });
    expect(again.withGps.map((e) => e.productId)).not.toContain(productId);
  });
});
