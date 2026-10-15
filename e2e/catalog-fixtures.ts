import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { localStack } from "../tests/catalog/local-stack";

/*
 * 30 published brooches on the local stack, so the brooches listing has 31 products (with the seed's one):
 * two pages of 20. Fixture n is n + 9 days old (no "new" badge) and costs $100 + n, so newest first is
 * 01, 02, … and price high to low is 30, 29, …. Fixture 01 gets two photos for the hover cross-fade.
 * Fixed ids: setup is an upsert and teardown deletes exactly these rows.
 */
export const FIXTURE_COUNT = 30;
const ID_PREFIX = "f1500000-0000-4000-8000-0000000000";
const IMAGE_PREFIX = "e2e-15";

export function fixtureTitle(n: number): string {
  return `E2E brooch ${String(n).padStart(2, "0")}`;
}

function fixtureId(n: number): string {
  return `${ID_PREFIX}${String(n).padStart(2, "0")}`;
}

function adminClient() {
  const stack = localStack();
  if (!stack) return null;
  return createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } });
}

export async function insertCatalogFixtures(): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const { data: category, error: categoryError } = await admin
    .from("categories")
    .select("id")
    .eq("slug", "brooches")
    .single();
  if (categoryError) throw categoryError;

  const numbers = Array.from({ length: FIXTURE_COUNT }, (_, i) => i + 1);
  const products = await admin.from("products").upsert(
    numbers.map((n) => ({
      id: fixtureId(n),
      category_id: category.id,
      sku: `E2E-15-${n}`,
      status: "published" as const,
      price_usd: 100 + n,
      created_at: new Date(Date.now() - (n + 9) * 24 * 60 * 60 * 1000).toISOString(),
    })),
  );
  if (products.error) throw products.error;

  const translations = await admin.from("product_translations").upsert(
    numbers.map((n) => ({
      product_id: fixtureId(n),
      locale: "en" as const,
      slug: `e2e-brooch-${n}`,
      title: fixtureTitle(n),
      source: "human" as const,
    })),
  );
  if (translations.error) throw translations.error;

  const photos = ["src/assets/categories/brooches.jpg", "src/assets/categories/rings.jpg"];
  const images = [];
  for (const [index, file] of photos.entries()) {
    const path = `${IMAGE_PREFIX}/${index + 1}.jpg`;
    const upload = await admin.storage
      .from("product-images")
      .upload(path, readFileSync(file), { contentType: "image/jpeg", upsert: true });
    if (upload.error) throw upload.error;
    images.push({ id: `${ID_PREFIX}${90 + index}`, product_id: fixtureId(1), storage_path: path, position: index + 1, width: 200, height: 200 });
  }
  const imageRows = await admin.from("product_images").upsert(images);
  if (imageRows.error) throw imageRows.error;
  return true;
}

export async function deleteCatalogFixtures(): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const ids = Array.from({ length: FIXTURE_COUNT }, (_, i) => fixtureId(i + 1));
  // translations and images go with their product (on delete cascade)
  const products = await admin.from("products").delete().in("id", ids);
  if (products.error) throw products.error;
  await admin.storage.from("product-images").remove([`${IMAGE_PREFIX}/1.jpg`, `${IMAGE_PREFIX}/2.jpg`]);
}
