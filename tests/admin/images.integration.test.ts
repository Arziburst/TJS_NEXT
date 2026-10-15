// The admin's photo writes over the real Storage and Data API of the local stack: who may stage an upload,
// what the server refuses by content (a renamed executable, a file over the limit), what it stores (upright,
// no metadata, width/height/blur, a new path), and ordering, alt texts and deletion. Skipped without a stack.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { MAX_IMAGE_BYTES, readMetadata } from "@/lib/images/encode";
import { localStack } from "../catalog/local-stack";

vi.mock("server-only", () => ({}));

const stack = localStack();
const PUBLIC_BUCKET = "product-images";
const STAGING = "product-image-uploads";

describe.skipIf(!stack)("admin product photos on the local stack", async () => {
  // a skipped describe still runs its body to collect the tests: nothing below may touch the stack
  if (!stack) return;
  const images = await import("@/lib/admin/images");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient<Database>(stack.url, stack.serviceRoleKey, options);
  const userIds: string[] = [];
  const productIds: string[] = [];
  let admin: { id: string; client: SupabaseClient<Database> };
  let otherAdmin: { id: string; client: SupabaseClient<Database> };
  let customer: { id: string; client: SupabaseClient<Database> };
  let productId: string;

  async function signedIn(role: "customer" | "admin") {
    const email = `images-${role}-${crypto.randomUUID()}@example.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const id = created.data.user.id;
    userIds.push(id);
    if (role === "admin") {
      const promoted = await service.from("profiles").update({ role: "admin" }).eq("id", id);
      if (promoted.error) throw promoted.error;
    }
    const client = createClient<Database>(stack!.url, stack!.anonKey, options);
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    return { id, client };
  }

  /** What the browser does: a signed URL from the server, then a plain PUT of the file to Storage. */
  async function stage(bytes: Uint8Array, contentType: string): Promise<{ uploadId: string; response: Response }> {
    const created = await images.createStagedUpload(admin.client, admin.id);
    if (!created.ok) throw new Error("no signed upload URL");
    const response = await fetch(created.signedUrl, {
      method: "PUT",
      body: bytes,
      headers: { "content-type": contentType, "x-upsert": "false" },
    });
    return { uploadId: created.uploadId, response };
  }

  async function stagedFiles(adminId: string): Promise<string[]> {
    const { data } = await service.storage.from(STAGING).list(adminId);
    return (data ?? []).map((f) => f.name);
  }

  async function rows() {
    const { data, error } = await service
      .from("product_images")
      .select("id, storage_path, position, width, height, blur_data_url, product_image_alts(locale, alt)")
      .eq("product_id", productId)
      .order("position");
    if (error) throw error;
    return data;
  }

  /** A 60×30 phone photo stored sideways (EXIF orientation 6) with a GPS position. */
  function phonePhoto(): Promise<Buffer> {
    return sharp({ create: { width: 60, height: 30, channels: 3, background: { r: 180, g: 90, b: 70 } } })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 27/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "30/1 31/1 0/1" } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
  }

  beforeAll(async () => {
    [admin, otherAdmin, customer] = await Promise.all([signedIn("admin"), signedIn("admin"), signedIn("customer")]);
    const { data: category } = await service.from("categories").select("id").eq("slug", "rings").single();
    const { data, error } = await service
      .from("products")
      .insert({ category_id: category!.id, sku: `IT-18-${crypto.randomUUID().slice(0, 8)}`, status: "draft", price_usd: 10 })
      .select("id")
      .single();
    if (error) throw error;
    productId = data.id;
    productIds.push(productId);
  });

  afterAll(async () => {
    const { data } = await service.storage.from(PUBLIC_BUCKET).list(`products/${productId}`);
    if (data?.length) await service.storage.from(PUBLIC_BUCKET).remove(data.map((f) => `products/${productId}/${f.name}`));
    for (const user of [admin, otherAdmin, customer]) {
      const staged = await stagedFiles(user.id);
      if (staged.length) await service.storage.from(STAGING).remove(staged.map((name) => `${user.id}/${name}`));
    }
    if (productIds.length) await service.from("products").delete().in("id", productIds);
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  it("the staging bucket is private and lets only an admin stage, into their own folder", async () => {
    const { data: bucket } = await service.storage.getBucket(STAGING);
    expect(bucket).toMatchObject({ public: false, file_size_limit: MAX_IMAGE_BYTES });

    // signing an upload URL checks the caller's insert policy
    expect((await images.createStagedUpload(customer.client, customer.id)).ok).toBe(false);
    const anon = createClient<Database>(stack.url, stack.anonKey, options);
    expect((await images.createStagedUpload(anon, crypto.randomUUID())).ok).toBe(false);
    expect((await images.createStagedUpload(admin.client, otherAdmin.id)).ok).toBe(false);

    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const direct = await customer.client.storage.from(STAGING).upload(`${customer.id}/x.png`, png, { contentType: "image/png" });
    expect(direct.error?.message).toMatch(/row-level security/i);
  });

  it("an admin cannot read or delete another admin's staged file, a customer neither", async () => {
    const { uploadId, response } = await stage(await phonePhoto(), "image/jpeg");
    expect(response.ok).toBe(true);
    const path = images.stagedPath(admin.id, uploadId);
    for (const intruder of [otherAdmin, customer]) {
      expect((await intruder.client.storage.from(STAGING).download(path)).error).not.toBeNull();
      await intruder.client.storage.from(STAGING).remove([path]);
      expect(await stagedFiles(admin.id)).toContain(uploadId);
    }
    // and another admin cannot turn it into a photo
    const stolen = await images.storeStagedUpload(otherAdmin.client, { adminId: admin.id, productId, uploadId });
    expect(stolen).toEqual({ ok: false, reason: "uploadMissing" });
    await service.storage.from(STAGING).remove([path]);
  });

  it("refuses a renamed executable on the server, and keeps nothing of it", async () => {
    const exe = Buffer.concat([Buffer.from("MZ\x90\x00\x03\x00\x00\x00", "latin1"), Buffer.alloc(4096)]);
    // the browser names it photo.jpg, so it claims image/jpeg: Storage cannot know better
    const { uploadId, response } = await stage(exe, "image/jpeg");
    expect(response.ok).toBe(true);
    const result = await images.storeStagedUpload(admin.client, { adminId: admin.id, productId, uploadId });
    expect(result).toEqual({ ok: false, reason: "unsupportedType" });
    expect(await stagedFiles(admin.id)).not.toContain(uploadId);
    expect(await rows()).toEqual([]);
    const { data: published } = await service.storage.from(PUBLIC_BUCKET).list(`products/${productId}`);
    expect(published ?? []).toEqual([]);
  });

  it("refuses a file over 15 MiB, and a type that is not a photo, before it is staged", async () => {
    const over = await stage(new Uint8Array(MAX_IMAGE_BYTES + 1), "image/jpeg");
    expect(over.response.ok).toBe(false);
    expect(await over.response.text()).toMatch(/size|large/i);
    const svg = await stage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml");
    expect(svg.response.ok).toBe(false);
    expect(await svg.response.text()).toMatch(/mime/i);
    expect(await stagedFiles(admin.id)).toEqual([]);
  });

  it("stores a phone photo upright, without metadata, under a new path, with its size and blur", async () => {
    const first = await stage(await phonePhoto(), "image/jpeg");
    expect(first.response.ok).toBe(true);
    expect(await images.storeStagedUpload(admin.client, { adminId: admin.id, productId, uploadId: first.uploadId })).toMatchObject({
      ok: true,
    });
    const second = await stage(await phonePhoto(), "image/jpeg");
    expect(await images.storeStagedUpload(admin.client, { adminId: admin.id, productId, uploadId: second.uploadId })).toMatchObject({
      ok: true,
    });
    expect(await stagedFiles(admin.id)).toEqual([]);

    const stored = await rows();
    expect(stored.map((r) => [r.position, r.width, r.height])).toEqual([
      [0, 30, 60],
      [1, 30, 60],
    ]);
    expect(new Set(stored.map((r) => r.storage_path)).size).toBe(2);
    for (const row of stored) {
      expect(row.storage_path).toMatch(new RegExp(`^products/${productId}/[0-9a-f-]{36}\\.jpg$`));
      expect(row.blur_data_url).toMatch(/^data:image\/png;base64,/);
      const url = service.storage.from(PUBLIC_BUCKET).getPublicUrl(row.storage_path).data.publicUrl;
      const response = await fetch(url);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(await readMetadata(new Uint8Array(await response.arrayBuffer()))).toEqual({
        exif: false,
        xmp: false,
        iptc: false,
        gps: false,
      });
    }
    // the audit columns name the admin
    const { data: audit } = await service.from("product_images").select("created_by").eq("product_id", productId);
    expect(audit?.every((r) => r.created_by === admin.id)).toBe(true);
  });

  it("orders the photos, refusing a stale list and a customer", async () => {
    const [a, b] = (await rows()).map((r) => r.id);
    expect(await images.reorderImages(admin.client, { productId, imageIds: [b!, a!] })).toEqual({ ok: true });
    expect((await rows()).map((r) => r.id)).toEqual([b, a]);

    expect(await images.reorderImages(admin.client, { productId, imageIds: [a!] })).toEqual({ ok: false, reason: "conflict" });
    expect(await images.reorderImages(admin.client, { productId, imageIds: [a!, a!] })).toEqual({ ok: false, reason: "conflict" });
    expect(await images.reorderImages(customer.client, { productId, imageIds: [a!, b!] })).toEqual({
      ok: false,
      reason: "notAuthorized",
    });
    expect((await rows()).map((r) => r.id)).toEqual([b, a]);
  });

  it("replaces the alt texts of a photo, for admins only", async () => {
    const [main] = await rows();
    const saved = await images.saveImageAlts(admin.client, {
      productId,
      imageId: main!.id,
      alts: [
        { locale: "uk", alt: "Каблучка з коралом" },
        { locale: "en", alt: "Coral ring" },
      ],
    });
    expect(saved).toEqual({ ok: true });
    expect(await images.saveImageAlts(admin.client, { productId, imageId: main!.id, alts: [{ locale: "en", alt: "Ring" }] })).toEqual({
      ok: true,
    });
    expect((await rows())[0]!.product_image_alts).toEqual([{ locale: "en", alt: "Ring" }]);

    expect(await images.saveImageAlts(customer.client, { productId, imageId: main!.id, alts: [] })).toEqual({
      ok: false,
      reason: "notAuthorized",
    });
    // an image of another product is not found
    expect(await images.saveImageAlts(admin.client, { productId: crypto.randomUUID(), imageId: main!.id, alts: [] })).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect((await rows())[0]!.product_image_alts).toEqual([{ locale: "en", alt: "Ring" }]);
  });

  it("deletes a photo's row and file; a customer deletes nothing", async () => {
    const [main, other] = await rows();
    expect(await images.deleteImage(customer.client, { productId, imageId: main!.id })).toEqual({ ok: false, reason: "notFound" });
    expect(await rows()).toHaveLength(2);

    expect(await images.deleteImage(admin.client, { productId, imageId: main!.id })).toEqual({ ok: true });
    expect((await rows()).map((r) => r.id)).toEqual([other!.id]);
    const url = service.storage.from(PUBLIC_BUCKET).getPublicUrl(main!.storage_path).data.publicUrl;
    expect((await fetch(url)).status).toBe(400);
    const { data: alts } = await service.from("product_image_alts").select("image_id").eq("image_id", main!.id);
    expect(alts).toEqual([]);
  });
});
