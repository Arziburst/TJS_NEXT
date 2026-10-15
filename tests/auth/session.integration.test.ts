// The session helpers and the profile rules over the real Auth and Data API of the local stack.
// Skipped when no local stack is configured.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "../catalog/local-stack";

vi.mock("server-only", () => ({}));

const stack = localStack();

describe.skipIf(!stack)("session and profiles on the local stack", async () => {
  // a skipped describe still runs its body to collect the tests: nothing below may touch the stack
  if (!stack) return;
  const { resolveUser } = await import("@/lib/auth/session");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient<Database>(stack.url, stack.serviceRoleKey, options);
  const userIds: string[] = [];

  async function signedInUser(name: string): Promise<{ id: string; client: SupabaseClient<Database> }> {
    const email = `session-${crypto.randomUUID()}@example.test`;
    const password = `pw-${crypto.randomUUID()}`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    const client = createClient<Database>(stack!.url, stack!.anonKey, options);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    return { id: created.data.user.id, client };
  }

  afterAll(async () => {
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  it("reads a guest as null", async () => {
    expect(await resolveUser(createClient<Database>(stack.url, stack.anonKey, options))).toBeNull();
  });

  it("reads the user with name and role from the profile; the role comes from the database only", async () => {
    const { id, client } = await signedInUser("Olena Koval");
    expect(await resolveUser(client)).toMatchObject({ id, name: "Olena Koval", phone: null, role: "customer" });

    // a role claimed in the user's own metadata changes nothing
    const claimed = await client.auth.updateUser({ data: { role: "admin" } });
    expect(claimed.error).toBeNull();
    expect((await resolveUser(client))?.role).toBe("customer");

    const promoted = await service.from("profiles").update({ role: "admin" }).eq("id", id);
    expect(promoted.error).toBeNull();
    expect((await resolveUser(client))?.role).toBe("admin");
  });

  it("reads a deleted user's still-held session as signed out, without throwing", async () => {
    const { id, client } = await signedInUser("Stale Session");
    const deleted = await service.auth.admin.deleteUser(id);
    expect(deleted.error).toBeNull();
    await expect(resolveUser(client)).resolves.toBeNull();
  });

  it("lets a customer edit their own name and phone, never their role", async () => {
    const { id, client } = await signedInUser("Edit Self");
    const own = await client.from("profiles").update({ name: "Edited", phone: "+48500600700" }).eq("id", id).select("name, phone");
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ name: "Edited", phone: "+48500600700" }]);

    const role = await client.from("profiles").update({ role: "admin" }).eq("id", id);
    expect(role.error?.code).toBe("42501");
    expect((await resolveUser(client))?.role).toBe("customer");
  });

  it("hides the internal catalog columns from the API, while the storefront columns stay readable", async () => {
    const anon = createClient<Database>(stack.url, stack.anonKey, options);
    for (const column of ["sku", "hs_code", "deleted_at", "created_by", "updated_by"] as const) {
      const { error } = await anon.from("products").select(column).limit(1);
      expect(error?.code, column).toBe("42501");
    }
    const { error, data } = await anon.from("products").select("id, price_usd, status").limit(1);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
});
