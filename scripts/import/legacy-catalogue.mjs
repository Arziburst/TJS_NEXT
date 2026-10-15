// Imports the legacy catalogue (MongoDB products + archived Cloudinary photos) from a read-only export folder
// into a Supabase project. Idempotent: products are keyed by products.legacy_id, photos by their storage path;
// a second run changes nothing. Rows that differ from the export (edited in the admin since) are kept unless
// --overwrite is given. Never calls MongoDB or Cloudinary. How to run: docs/dev-environment.md.
//
//   node scripts/import/legacy-catalogue.mjs <export dir> [--dry-run] [--production] [--overwrite]
//        [--rate-date YYYY-MM-DD] [--state <dir>]
//
// Target: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment, else from .env.local.
// A non-loopback URL is refused unless --production is given.
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { businessDate } from "../../src/lib/money/business-date.ts";
import {
  IMPORT_LOCALES,
  byCreation,
  categorySlugOf,
  cloudinaryFile,
  parseLegacyProducts,
  productRowOf,
  slugify,
  sourceHash,
  storagePathOf,
  uniqueSlugs,
} from "./legacy-mapping.mjs";
import { renderReport } from "./legacy-report.mjs";

const BUCKET = "product-images";
const BUCKET_FILE_LIMIT = 5 * 1024 * 1024;
const BLUR_SIZE = 8;
const PAGE = 1000;
const NBU_EXCHANGE_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange";
// NBU answers bare server clients with errors (src/lib/money/nbu.ts)
const NBU_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
// Fields an import run owns; created_at is fixed by the audit trigger after the insert.
const PRODUCT_FIELDS = ["category_id", "status", "fulfillment", "availability", "price_usd", "weight_g", "published_at"];

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The Supabase project to write: from the environment, else from .env.local. A non-loopback URL needs
 * `production: true`. Returns the target or the reason it is refused.
 * @param {Record<string, string | undefined>} env
 * @param {{ production?: boolean, envFile?: string }} [options]
 */
export function resolveTarget(env, { production, envFile = ".env.local" } = {}) {
  let source = "environment";
  if (!env.NEXT_PUBLIC_SUPABASE_URL && existsSync(envFile)) {
    env = { ...env, ...readEnvFile(envFile) };
    source = envFile;
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return { target: null, reason: "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set" };
  }
  const { hostname } = new URL(url);
  const loopback = LOOPBACK_HOSTS.has(hostname);
  if (!loopback && !production) {
    return { target: null, reason: `refusing the non-loopback Supabase URL ${hostname} without --production` };
  }
  return { target: { url, serviceRoleKey, host: hostname, loopback, source }, reason: null };
}

function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

async function fetchNbuUsdRate(date) {
  const url = `${NBU_EXCHANGE_URL}?valcode=USD&date=${date.replaceAll("-", "")}&json`;
  const response = await fetch(url, {
    headers: { "User-Agent": NBU_USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`NBU answered ${response.status} for ${date}`);
  const row = (await response.json()).find?.((item) => item.cc === "USD");
  if (!row || typeof row.rate !== "number" || !(row.rate > 0)) throw new Error(`NBU has no USD rate for ${date}`);
  const [day, month, year] = row.exchangedate.split(".");
  return { currency: "USD", rate: String(row.rate), rateDate: `${year}-${month}-${day}`, source: "NBU" };
}

/**
 * The rate of the import (D33). Pinned in <state>/rate.json by the first real run, so re-runs and the later
 * production run price exactly what the owner reviewed; --rate-date fetches (and on a real run re-pins) another day.
 */
async function resolveRate(stateDir, rateDate) {
  const file = join(stateDir, "rate.json");
  if (!rateDate && existsSync(file)) return { rate: JSON.parse(readFileSync(file, "utf8")), file, pinned: true };
  const rate = await fetchNbuUsdRate(rateDate ?? businessDate(new Date()));
  return { rate: { ...rate, fetchedAt: new Date().toISOString() }, file, pinned: false };
}

async function selectAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function imageFacts(path) {
  const meta = await sharp(path).metadata();
  // EXIF orientations 5–8 turn the picture a quarter: browsers and the image optimizer show it turned
  const turned = (meta.orientation ?? 1) >= 5;
  const blur = await sharp(path)
    .rotate()
    .resize(BLUR_SIZE, BLUR_SIZE, { fit: "inside" })
    .png()
    .toBuffer();
  return {
    width: turned ? meta.height : meta.width,
    height: turned ? meta.width : meta.height,
    blur_data_url: `data:image/png;base64,${blur.toString("base64")}`,
    contentType: `image/${meta.format}`,
  };
}

function sameValue(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  const time = (v) => (/^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? new Date(v).getTime() : NaN);
  return !Number.isNaN(time(a)) && time(a) === time(b);
}

function differingFields(existing, wanted, fields) {
  return fields.filter((f) => !sameValue(existing[f], wanted[f]));
}

function loadTranslations(stateDir, products) {
  const file = join(stateDir, "translations.json");
  if (!existsSync(file)) throw new Error(`no translations file: ${file} (see docs/dev-environment.md)`);
  const { translations } = JSON.parse(readFileSync(file, "utf8"));
  const problems = [];
  for (const product of products) {
    const t = translations?.[product.legacyId];
    if (!t) problems.push(`${product.legacyId}: no translation`);
    else if (t.sourceHash !== sourceHash(product)) problems.push(`${product.legacyId}: stale (the legacy text changed)`);
    else
      for (const locale of IMPORT_LOCALES)
        if (!t[locale]?.title?.trim() || !t[locale]?.description?.trim())
          problems.push(`${product.legacyId}: no ${locale} title or description`);
  }
  if (problems.length) throw new Error(`${file}:\n  ${problems.join("\n  ")}`);
  return translations;
}

/** Everything the run would do, computed from the export and the target's current rows; writes nothing. */
async function buildPlan({ client, exportDir, products, translations, rate }) {
  const categories = await selectAll(() => client.from("categories").select("id, slug").order("slug"));
  const categoryIds = Object.fromEntries(categories.map((c) => [c.slug, c.id]));
  const existingProducts = await selectAll(() =>
    client
      .from("products")
      .select(`id, legacy_id, ${PRODUCT_FIELDS.join(", ")}`)
      .not("legacy_id", "is", null)
      .order("id"),
  );
  const productByLegacyId = new Map(existingProducts.map((p) => [p.legacy_id, p]));
  const existingTranslations = await selectAll(() =>
    client
      .from("product_translations")
      .select("product_id, locale, slug, title, description, source, reviewed_at")
      .in("locale", IMPORT_LOCALES)
      .order("product_id")
      .order("locale"),
  );
  const existingImages = await selectAll(() =>
    client
      .from("product_images")
      .select("id, product_id, storage_path, position, width, height, blur_data_url, product_image_alts(locale, alt)")
      .like("storage_path", "legacy/%")
      .order("storage_path"),
  );
  const imageByPath = new Map(existingImages.map((i) => [i.storage_path, i]));

  const plans = [...products].sort(byCreation).map((product) => {
    const existing = productByLegacyId.get(product.legacyId);
    const row = { id: existing?.id ?? crypto.randomUUID(), ...productRowOf(product, { rate: rate.rate, categoryIds }) };
    const diffs = existing ? differingFields(existing, row, PRODUCT_FIELDS) : [];
    return {
      product,
      row,
      action: !existing ? "create" : diffs.length ? "differs" : "unchanged",
      diffs,
      translations: [],
      images: [],
    };
  });

  for (const locale of IMPORT_LOCALES) {
    const mine = new Map(existingTranslations.filter((t) => t.locale === locale).map((t) => [t.product_id, t]));
    const missing = plans.filter((plan) => !mine.has(plan.row.id));
    const slugs = uniqueSlugs(
      missing.map((plan) => slugify(translations[plan.product.legacyId][locale].title, locale)),
      existingTranslations.filter((t) => t.locale === locale).map((t) => t.slug),
    );
    const newSlug = new Map(missing.map((plan, i) => [plan, slugs[i]]));
    for (const plan of plans) {
      const text = translations[plan.product.legacyId][locale];
      const current = mine.get(plan.row.id);
      const row = {
        product_id: plan.row.id,
        locale,
        slug: current?.slug ?? newSlug.get(plan),
        title: text.title.trim(),
        description: text.description.trim(),
        source: "machine",
        reviewed_at: null,
      };
      const diffs = current ? differingFields(current, row, ["title", "description"]) : [];
      plan.translations.push({ row, action: !current ? "create" : diffs.length ? "differs" : "unchanged", diffs });
    }
  }

  for (const plan of plans) {
    for (const [position, url] of plan.product.images.entries()) {
      const { fileName } = cloudinaryFile(url);
      const file = join(exportDir, "cloudinary", "image", fileName);
      if (!existsSync(file)) throw new Error(`${plan.product.legacyId}: ${fileName} is not in the archive`);
      if (statSync(file).size > BUCKET_FILE_LIMIT) throw new Error(`${fileName} is larger than the bucket limit`);
      const facts = await imageFacts(file);
      const storagePath = storagePathOf(plan.row.id, position, fileName);
      const row = {
        product_id: plan.row.id,
        storage_path: storagePath,
        position,
        width: facts.width,
        height: facts.height,
        blur_data_url: facts.blur_data_url,
      };
      const alts = plan.translations.map((t) => ({ locale: t.row.locale, alt: t.row.title }));
      const current = imageByPath.get(storagePath);
      const diffs = current ? differingFields(current, row, ["position", "width", "height", "blur_data_url"]) : [];
      const currentAlts = new Map((current?.product_image_alts ?? []).map((a) => [a.locale, a.alt]));
      const altActions = alts.map((a) =>
        !currentAlts.has(a.locale) ? "create" : currentAlts.get(a.locale) === a.alt ? "unchanged" : "differs",
      );
      plan.images.push({
        file,
        contentType: facts.contentType,
        row,
        id: current?.id ?? null,
        action: !current ? "create" : diffs.length ? "differs" : "unchanged",
        diffs,
        alts: alts.map((a, i) => ({ ...a, action: altActions[i] })),
      });
    }
  }
  return plans;
}

function emptyChanges() {
  return {
    "products created": 0,
    "products updated": 0,
    "texts created": 0,
    "texts updated": 0,
    "photos uploaded": 0,
    "photo rows updated": 0,
    "alts written": 0,
  };
}

/** What a real run would change (with `overwrite`, the differing rows too) and what it keeps. */
function countPlan(plans, overwrite) {
  const changes = emptyChanges();
  const kept = [];
  const write = (action) => action === "create" || (action === "differs" && overwrite);
  const tally = (action, counter, keptLine) => {
    if (action === "create") changes[counter.create] += 1;
    else if (action === "differs" && overwrite) changes[counter.update] += 1;
    else if (action === "differs") kept.push(keptLine);
  };
  for (const plan of plans) {
    const id = plan.product.legacyId;
    tally(plan.action, { create: "products created", update: "products updated" }, `${id} product: ${plan.diffs.join(", ")}`);
    for (const t of plan.translations) {
      tally(t.action, { create: "texts created", update: "texts updated" }, `${id} ${t.row.locale} text: ${t.diffs.join(", ")}`);
    }
    for (const image of plan.images) {
      const path = image.row.storage_path;
      tally(image.action, { create: "photos uploaded", update: "photo rows updated" }, `${path}: ${image.diffs.join(", ")}`);
      for (const alt of image.alts) {
        if (image.action === "create" || write(alt.action)) changes["alts written"] += 1;
        else if (alt.action === "differs") kept.push(`${path} ${alt.locale} alt`);
      }
    }
  }
  return { changes, kept };
}

async function check(promise, what) {
  const { error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function applyPlan(client, plans, overwrite) {
  const write = (action) => action === "create" || (action === "differs" && overwrite);
  for (const plan of plans) {
    const { row } = plan;
    if (plan.action === "create") await check(client.from("products").insert(row), `insert ${row.legacy_id}`);
    else if (plan.action === "differs" && overwrite) {
      const update = Object.fromEntries(PRODUCT_FIELDS.map((f) => [f, row[f]]));
      await check(client.from("products").update(update).eq("id", row.id), `update ${row.legacy_id}`);
    }
    for (const t of plan.translations) {
      if (t.action === "create") await check(client.from("product_translations").insert(t.row), `texts of ${row.legacy_id}`);
      else if (t.action === "differs" && overwrite) {
        const { title, description, source, reviewed_at } = t.row;
        await check(
          client
            .from("product_translations")
            .update({ title, description, source, reviewed_at })
            .eq("product_id", row.id)
            .eq("locale", t.row.locale),
          `texts of ${row.legacy_id}`,
        );
      }
    }
    for (const image of plan.images) {
      let imageId = image.id;
      if (image.action === "create") {
        // a file without its row is left from an interrupted run and was never served: replace it
        const upload = await client.storage
          .from(BUCKET)
          .upload(image.row.storage_path, readFileSync(image.file), { contentType: image.contentType, upsert: true });
        if (upload.error) throw new Error(`upload ${image.row.storage_path}: ${upload.error.message}`);
        const { data, error } = await client.from("product_images").insert(image.row).select("id").single();
        if (error) throw new Error(`photo row ${image.row.storage_path}: ${error.message}`);
        imageId = data.id;
      } else if (image.action === "differs" && overwrite) {
        const { position, width, height, blur_data_url } = image.row;
        await check(
          client.from("product_images").update({ position, width, height, blur_data_url }).eq("id", imageId),
          `photo row ${image.row.storage_path}`,
        );
      }
      const alts = image.alts
        .filter((a) => image.action === "create" || write(a.action))
        .map((a) => ({ image_id: imageId, locale: a.locale, alt: a.alt }));
      if (alts.length) await check(client.from("product_image_alts").upsert(alts), `alts of ${image.row.storage_path}`);
    }
  }
}

function orphanCounts(exportDir, products) {
  const used = new Set(products.flatMap((p) => p.images.map((url) => cloudinaryFile(url).publicId)));
  const read = (name) => JSON.parse(readFileSync(join(exportDir, name), "utf8"));
  const registry = read("images.json").filter((i) => !used.has(i.public_id)).length;
  const archive = read("cloudinary-resources.json").filter((r) => !used.has(r.public_id)).length;
  return { registry, archive };
}

function reportProducts(plans) {
  return plans.map((plan) => ({
    legacyId: plan.product.legacyId,
    category: categorySlugOf(plan.product.type),
    fulfillment: plan.row.fulfillment,
    priceUah: plan.product.priceUah,
    priceUsd: plan.row.price_usd,
    weight: plan.row.weight_g,
    weightMissing: plan.product.weight === null,
    photos: plan.images.length,
    titles: Object.fromEntries(plan.translations.map((t) => [t.row.locale, t.row.title])),
    slugs: Object.fromEntries(plan.translations.map((t) => [t.row.locale, t.row.slug])),
  }));
}

function printPlan(plans, overwrite) {
  for (const plan of plans) {
    const p = plan.product;
    const images = plan.images.filter((i) => i.action !== "unchanged").length;
    const texts = plan.translations.map((t) => `${t.row.locale}:${t.row.slug}`).join(" ");
    console.log(
      `${plan.action.padEnd(9)} ${p.legacyId} ${categorySlugOf(p.type).padEnd(9)} ${plan.row.fulfillment.padEnd(13)} ` +
        `${String(p.priceUah).padStart(6)} UAH -> ${plan.row.price_usd.padStart(7)} USD  ` +
        `${plan.images.length} photos (${images} to write)  ${texts}`,
    );
  }
  const { changes, kept } = countPlan(plans, overwrite);
  console.log(`\nplan: ${Object.entries(changes).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  if (kept.length) console.log(`differs from the export, kept (--overwrite resets):\n  ${kept.join("\n  ")}`);
  return changes;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      overwrite: { type: "boolean", default: false },
      "rate-date": { type: "string" },
      state: { type: "string" },
    },
  });
  if (positionals.length !== 1) throw new Error("usage: legacy-catalogue.mjs <export dir> [--dry-run] [--production] …");
  if (values["rate-date"] && !/^\d{4}-\d{2}-\d{2}$/.test(values["rate-date"])) throw new Error("--rate-date is YYYY-MM-DD");
  const exportDir = resolve(positionals[0]);
  const stateDir = resolve(values.state ?? `${exportDir}-import`);
  const dryRun = values["dry-run"];

  const { target, reason } = resolveTarget(process.env, { production: values.production });
  if (!target) throw new Error(reason);
  console.log(
    `${dryRun ? "DRY RUN — nothing is written. " : ""}target: ${target.url} (${target.loopback ? "local" : "PRODUCTION"}, ` +
      `from ${target.source}); export: ${exportDir}; state: ${stateDir}`,
  );

  const products = parseLegacyProducts(JSON.parse(readFileSync(join(exportDir, "products.json"), "utf8")));
  const translations = loadTranslations(stateDir, products);
  const { rate, file: rateFile, pinned } = await resolveRate(stateDir, values["rate-date"]);
  console.log(`rate: 1 USD = ${rate.rate} UAH (NBU, ${rate.rateDate}${pinned ? ", pinned in rate.json" : ", fetched"})\n`);

  const client = createClient(target.url, target.serviceRoleKey, { auth: { persistSession: false } });
  const plans = await buildPlan({ client, exportDir, products, translations, rate });
  const planned = printPlan(plans, values.overwrite);
  if (dryRun) return;

  mkdirSync(stateDir, { recursive: true });
  if (!pinned) writeFileSync(rateFile, `${JSON.stringify(rate, null, 2)}\n`);
  await applyPlan(client, plans, values.overwrite);

  const reportFile = join(stateDir, `report-${target.loopback ? "local" : "production"}.md`);
  writeFileSync(
    reportFile,
    renderReport({
      exportName: basename(exportDir),
      target: `${target.host}${target.loopback ? " (local)" : " (production)"}`,
      generatedAt: new Date().toISOString(),
      rate,
      products: reportProducts(plans),
      orphans: orphanCounts(exportDir, products),
      changes: planned,
    }),
  );
  console.log(`done: ${Object.entries(planned).map(([k, v]) => `${k} ${v}`).join(", ")}\nreport: ${reportFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`import: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
