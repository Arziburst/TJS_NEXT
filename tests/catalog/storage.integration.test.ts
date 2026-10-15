// The product-images bucket over the Storage API of the local stack: who may upload and delete, which file
// types and sizes pass. Skipped when no local stack is configured.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "./local-stack";

const stack = localStack();
const BUCKET = "product-images";
// The smallest valid PNG (1×1, transparent).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

describe.skipIf(!stack)("product-images bucket on the local stack", () => {
  const service = createClient<Database>(stack!.url, stack!.serviceRoleKey, { auth: { persistSession: false } });
  const userIds: string[] = [];
  const prefix = `it-${crypto.randomUUID()}`;
  let customer: SupabaseClient<Database>;
  let admin: SupabaseClient<Database>;

  async function signedIn(role: "customer" | "admin"): Promise<SupabaseClient<Database>> {
    const email = `${role}-${crypto.randomUUID()}@example.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    if (role === "admin") {
      const promoted = await service.from("profiles").update({ role: "admin" }).eq("id", created.data.user.id);
      if (promoted.error) throw promoted.error;
    }
    const client = createClient<Database>(stack!.url, stack!.anonKey, { auth: { persistSession: false } });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    return client;
  }

  beforeAll(async () => {
    customer = await signedIn("customer");
    admin = await signedIn("admin");
  });

  afterAll(async () => {
    const { data } = await service.storage.from(BUCKET).list(prefix);
    if (data?.length) await service.storage.from(BUCKET).remove(data.map((f) => `${prefix}/${f.name}`));
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  it("signs up users with a customer profile", async () => {
    const { data } = await service.from("profiles").select("role").in("id", userIds).order("role");
    expect(data?.map((p) => p.role)).toEqual(["customer", "admin"]);
  });

  it("refuses an upload by a customer", async () => {
    const { error } = await customer.storage.from(BUCKET).upload(`${prefix}/customer.png`, PNG, { contentType: "image/png" });
    expect(error?.message).toMatch(/row-level security/i);
  });

  it("refuses an anonymous upload", async () => {
    const anon = createClient<Database>(stack!.url, stack!.anonKey, { auth: { persistSession: false } });
    const { error } = await anon.storage.from(BUCKET).upload(`${prefix}/anon.png`, PNG, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("lets an admin upload, and anyone read it through the public URL", async () => {
    const { error } = await admin.storage.from(BUCKET).upload(`${prefix}/admin.png`, PNG, { contentType: "image/png" });
    expect(error).toBeNull();
    const url = admin.storage.from(BUCKET).getPublicUrl(`${prefix}/admin.png`).data.publicUrl;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("refuses a file type that is not a raster image", async () => {
    for (const [name, contentType] of [
      ["note.txt", "text/plain"],
      ["vector.svg", "image/svg+xml"],
    ]) {
      const { error } = await admin.storage.from(BUCKET).upload(`${prefix}/${name}`, PNG, { contentType });
      expect(error?.message, contentType).toMatch(/mime type/i);
    }
  });

  it("refuses a file over 5 MiB and accepts one at the limit", async () => {
    const over = await admin.storage
      .from(BUCKET)
      .upload(`${prefix}/big.png`, Buffer.alloc(5 * 1024 * 1024 + 1), { contentType: "image/png" });
    expect(over.error?.message).toMatch(/size/i);
    const at = await admin.storage
      .from(BUCKET)
      .upload(`${prefix}/limit.png`, Buffer.alloc(5 * 1024 * 1024), { contentType: "image/png" });
    expect(at.error).toBeNull();
  });

  it("does not let a customer delete, but lets an admin", async () => {
    await customer.storage.from(BUCKET).remove([`${prefix}/admin.png`]);
    const stillThere = await service.storage.from(BUCKET).list(prefix, { search: "admin.png" });
    expect(stillThere.data?.map((f) => f.name)).toEqual(["admin.png"]);

    const removed = await admin.storage.from(BUCKET).remove([`${prefix}/admin.png`]);
    expect(removed.error).toBeNull();
    expect(removed.data?.map((f) => f.name)).toEqual([`${prefix}/admin.png`]);
  });
});
