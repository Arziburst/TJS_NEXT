// CATEGORY_SLUGS (routing, no database) must equal the categories reference data on the local stack.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { CATEGORY_SLUGS } from "@/lib/catalog/categories";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "./local-stack";

const stack = localStack();

describe.skipIf(!stack)("category slugs", () => {
  it("are the categories table in its order", async () => {
    const client = createClient<Database>(stack!.url, stack!.anonKey, { auth: { persistSession: false } });
    const { data, error } = await client.from("categories").select("slug").order("position");
    expect(error).toBeNull();
    expect(data?.map((c) => c.slug)).toEqual([...CATEGORY_SLUGS]);
  });
});
