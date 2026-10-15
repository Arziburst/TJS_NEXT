// Pure rules of the legacy catalogue import (scripts/import/legacy-catalogue.mjs): how a product of the legacy
// MongoDB export becomes a row of the new catalog. No I/O here, so every rule is unit-tested
// (tests/import/legacy-mapping.test.ts).
import { createHash } from "node:crypto";
import { z } from "zod";
import { divideDecimals, formatDecimal, parseDecimal } from "../../src/lib/money/decimal.ts";

/** Legacy `type` → slug of the category row of 20261016001202_catalog_categories.sql. */
export const CATEGORY_BY_LEGACY_TYPE = {
  bracelets: "bracelets",
  brooch: "brooches",
  corals: "corals",
  earrings: "earrings",
  necklace: "necklaces",
  rings: "rings",
};

/** The locales the legacy texts are translated into; the first is the shop's default. */
export const IMPORT_LOCALES = ["uk", "en"];

export const STORAGE_PREFIX = "legacy";

const SLUG_MAX_LENGTH = 60;

// MongoDB extended JSON (relaxed or canonical) as mongoexport writes it
const ejsonNumber = z.union([
  z.number(),
  z.object({ $numberInt: z.string() }).transform((v) => Number(v.$numberInt)),
  z.object({ $numberLong: z.string() }).transform((v) => Number(v.$numberLong)),
  z.object({ $numberDouble: z.string() }).transform((v) => Number(v.$numberDouble)),
]);
const ejsonDate = z
  .object({
    $date: z.union([z.string(), z.number(), z.object({ $numberLong: z.string() }).transform((v) => Number(v.$numberLong))]),
  })
  .transform((v) => new Date(v.$date));

const CLOUDINARY_URL = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?([A-Za-z0-9_-]+)\.(jpe?g|png|webp)$/;

const legacyProductSchema = z.object({
  _id: z.object({ $oid: z.string().regex(/^[0-9a-f]{24}$/) }),
  title: z.string(),
  description: z.string(),
  type: z.string(),
  price: ejsonNumber,
  weight: ejsonNumber.optional(),
  available: z.boolean(),
  images: z.array(z.string().regex(CLOUDINARY_URL, "a Cloudinary image upload URL")).min(1),
  created: ejsonDate,
});

/**
 * @typedef {{ legacyId: string, title: string, description: string, type: string, priceUah: number,
 *   weight: number | null, available: boolean, images: string[], created: Date }} LegacyProduct
 */

/**
 * The products of products.json, validated. Throws with every problem listed: the import never starts on a
 * product it would have to guess about.
 * @returns {LegacyProduct[]}
 */
export function parseLegacyProducts(json) {
  const parsed = z.array(legacyProductSchema).safeParse(json);
  if (!parsed.success) {
    throw new Error(`products.json: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data.map((p) => ({
    legacyId: p._id.$oid,
    title: p.title,
    description: p.description,
    type: p.type,
    priceUah: p.price,
    weight: p.weight ?? null,
    available: p.available,
    images: p.images,
    created: p.created,
  }));
}

/** The file of a Cloudinary URL in the archive (`cloudinary/image/<public_id>.<ext>`). */
export function cloudinaryFile(url) {
  const match = CLOUDINARY_URL.exec(url);
  if (!match) throw new Error(`not a Cloudinary image URL: ${url}`);
  return { publicId: match[1], fileName: `${match[1]}.${match[2]}` };
}

export function categorySlugOf(legacyType) {
  const slug = CATEGORY_BY_LEGACY_TYPE[legacyType];
  if (!slug) throw new Error(`unknown legacy type "${legacyType}"`);
  return slug;
}

/**
 * D34: `available: false` (the legacy "Only order" badge) is made to order, with no lead time yet (the admin
 * sets it); `available: true` is a one-of-a-kind ready piece, available.
 */
export function kindOf(available) {
  return available
    ? { fulfillment: "one_of_a_kind", availability: "available" }
    : { fulfillment: "made_to_order", availability: "available" };
}

/** D33: UAH → USD at the NBU rate (UAH per USD, a decimal string), half up to the cent; e.g. "92.15". */
export function uahToUsd(priceUah, rate) {
  if (!Number.isSafeInteger(priceUah) || priceUah < 0) throw new RangeError(`not a whole UAH price: ${priceUah}`);
  const divisor = parseDecimal(rate);
  if (!divisor || divisor.units <= BigInt(0)) throw new RangeError(`not a rate: ${rate}`);
  return formatDecimal(divideDecimals({ units: BigInt(priceUah), scale: 0 }, divisor, 2));
}

/** The weight as the legacy shop stored it; a product saved before the field existed has the schema default 0. */
export function weightOf(weight) {
  return weight ?? 0;
}

/** The hash a translation is tied to: a changed legacy text makes its translation stale. */
export function sourceHash(product) {
  return createHash("sha256").update(`${product.title}\n${product.description}`).digest("hex");
}

// Ukrainian national transliteration (Cabinet of Ministers resolution 55, 2010): word-initial forms for є ї й ю я,
// "зг" → "zgh", soft sign and apostrophe dropped. Russian-only letters (legacy leftovers) get the nearest form.
const UK_LATIN = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i",
  й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ы: "y", э: "e", ё: "io", ъ: "",
};
const UK_LATIN_INITIAL = { є: "ye", ї: "yi", й: "y", ю: "yu", я: "ya" };

function transliterateUk(text) {
  let out = "";
  let previous = "";
  for (const char of text.toLowerCase().replace(/['’ʼ`]/g, "")) {
    const wordStart = !/[\p{L}\p{N}]/u.test(previous);
    if (char === "г" && previous === "з") out += "gh";
    else if (wordStart && char in UK_LATIN_INITIAL) out += UK_LATIN_INITIAL[char];
    else out += UK_LATIN[char] ?? char;
    previous = char;
  }
  return out;
}

/** A URL slug of `title` in `locale`: Latin letters, digits and single hyphens, at most 60 characters. */
export function slugify(title, locale) {
  const latin = (locale === "uk" ? transliterateUk(title) : title.toLowerCase())
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  let slug = latin.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > SLUG_MAX_LENGTH) {
    const cut = slug.slice(0, SLUG_MAX_LENGTH + 1);
    slug = cut.includes("-") ? cut.slice(0, cut.lastIndexOf("-")) : cut.slice(0, SLUG_MAX_LENGTH);
  }
  return slug || "product";
}

/**
 * Slugs that do not collide: `wanted` in order, each the base slug or base-2, base-3 … skipping every slug in
 * `taken` (the locale's slugs already in the database). Returns the slugs in the order of `wanted`.
 */
export function uniqueSlugs(wanted, taken) {
  const used = new Set(taken);
  return wanted.map((base) => {
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  });
}

/** Storage path of a legacy photo: under legacy/<product id>/, ordered, named after its Cloudinary file. */
export function storagePathOf(productId, position, fileName) {
  return `${STORAGE_PREFIX}/${productId}/${position + 1}-${fileName}`;
}

/** Oldest first (ties by legacy id), so slug suffixes go to the later copies of a repeated title. */
export function byCreation(a, b) {
  return a.created.getTime() - b.created.getTime() || a.legacyId.localeCompare(b.legacyId);
}

/**
 * The catalog row of a legacy product, without its id and texts.
 * @param {LegacyProduct} product
 * @param {{ rate: string, categoryIds: Record<string, string> }} context
 */
export function productRowOf(product, { rate, categoryIds }) {
  const categorySlug = categorySlugOf(product.type);
  const categoryId = categoryIds[categorySlug];
  if (!categoryId) throw new Error(`category "${categorySlug}" is missing in the target database`);
  const created = product.created.toISOString();
  return {
    legacy_id: product.legacyId,
    category_id: categoryId,
    status: "published",
    ...kindOf(product.available),
    price_usd: uahToUsd(product.priceUah, rate),
    weight_g: weightOf(product.weight),
    created_at: created,
    published_at: created,
  };
}
