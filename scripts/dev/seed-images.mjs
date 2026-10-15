// Seeds product photos on a LOCAL stack: generated PNGs uploaded to the product-images bucket, plus their
// product_images rows (width, height, a tiny blur placeholder). For dev, e2e and browser walks only; the
// seeded products of supabase/seed.sql have no images because Storage files cannot be seeded by SQL.
// Usage: npm run seed:images   (reads .env.local; refuses any non-loopback Supabase URL)
// Idempotent: files are upserted, rows are upserted on storage_path.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "product-images";
const PREFIX = "seed";
const SIZE = 800;
const BLUR_SIZE = 8;
const IMAGES_PER_PRODUCT = 3;

/** The local stack of .env.local, or null (with the reason) when there is none or it is not loopback. */
export function localStackEnv(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { stack: null, reason: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set" };
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    return { stack: null, reason: `refusing to seed a non-local stack (${hostname})` };
  }
  return { stack: { url, serviceRoleKey }, reason: null };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An RGB PNG of `size`×`size` whose pixel colour is `pixel(x, y)` → [r, g, b]. */
export function encodePng(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw.set([r, g, b], row + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit, RGB, deflate, no filter set, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// TJS palette: beige background, brown / coral / slate "pieces"
const PALETTE = [
  [255, 97, 74],
  [99, 90, 89],
  [54, 71, 92],
  [0, 200, 83],
  [255, 214, 0],
];
const BEIGE = [244, 240, 235];

/** A beige square with a soft shadow and a round "piece" whose colour and place vary per product and photo. */
function photo(productIndex, imageIndex) {
  const colour = PALETTE[(productIndex + imageIndex) % PALETTE.length];
  const cx = 0.5 + 0.18 * Math.cos(imageIndex * 2.1 + productIndex);
  const cy = 0.5 + 0.18 * Math.sin(imageIndex * 2.1 + productIndex);
  const radius = 0.16 + 0.04 * imageIndex;
  return (u, v) => {
    const d = Math.hypot(u - cx, v - cy);
    if (d < radius) {
      const shade = 0.75 + 0.25 * (1 - d / radius);
      return colour.map((c) => Math.round(c * shade));
    }
    const shadow = Math.max(0, 1 - Math.hypot(u - cx - 0.03, v - cy - 0.04) / (radius * 1.6)) * 0.25;
    const vignette = 1 - 0.08 * Math.hypot(u - 0.5, v - 0.5);
    return BEIGE.map((c) => Math.round(c * vignette * (1 - shadow)));
  };
}

function render(size, shape) {
  return encodePng(size, (x, y) => shape((x + 0.5) / size, (y + 0.5) / size));
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const { stack, reason } = localStackEnv();
  if (!stack) {
    console.error(`seed:images: ${reason}`);
    process.exit(1);
  }
  const client = createClient(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } });

  // the synthetic products of supabase/seed.sql (SKU TEST-…), in SKU order
  const { data: products, error } = await client.from("products").select("id, sku").like("sku", "TEST-%").order("sku");
  if (error) throw error;
  if (products.length === 0) {
    console.error("seed:images: no seeded products (run npm run db:reset first)");
    process.exit(1);
  }

  const rows = [];
  for (const [productIndex, product] of products.entries()) {
    for (let imageIndex = 0; imageIndex < IMAGES_PER_PRODUCT; imageIndex++) {
      const shape = photo(productIndex, imageIndex);
      const storagePath = `${PREFIX}/${product.id}/${imageIndex + 1}.png`;
      const upload = await client.storage
        .from(BUCKET)
        .upload(storagePath, render(SIZE, shape), { contentType: "image/png", upsert: true });
      if (upload.error) throw upload.error;
      rows.push({
        product_id: product.id,
        storage_path: storagePath,
        position: imageIndex,
        width: SIZE,
        height: SIZE,
        blur_data_url: `data:image/png;base64,${render(BLUR_SIZE, shape).toString("base64")}`,
      });
    }
  }
  const { error: upsertError } = await client.from("product_images").upsert(rows, { onConflict: "storage_path" });
  if (upsertError) throw upsertError;
  console.log(`seed:images: ${rows.length} images for ${products.length} products in ${BUCKET}/${PREFIX}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
