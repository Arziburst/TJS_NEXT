// Fills the missing locales of every product by machine translation, with the same code as the admin's
// Translate action (src/lib/translate/core.ts, the glossary, the slug rules). Rows are written as source =
// machine, reviewed_at = null: shown in the shop, kept out of search engines until the owner reviews them.
// How to run and what it costs: docs/dev-environment.md, "Machine translation".
//
//   node scripts/translate/missing.mjs [--apply] [--production] [--product <id>] [--limit <n>] [--source <locale>]
//
// Without --apply it is a dry run: it reads the catalogue and prints what it would translate, with a token and
// cost estimate, and calls no model. Target: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the
// environment, else from .env.local; a non-loopback URL is refused unless --production is given. The gateway:
// AI_GATEWAY_API_KEY (and, for a loopback target only, AI_GATEWAY_BASE_URL) from the same place.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { createGateway } from "ai";
import { SLUG_MAX_LENGTH, slugify } from "../../src/lib/admin/slug.ts";
import {
  LANGUAGE_NAMES,
  TRANSLATABLE_FIELDS,
  TRANSLATION_MODEL,
  TRANSLATION_MODEL_PRICE,
  estimateCall,
  pickSourceLocale,
  planTargets,
  slugCandidate,
  translateContent,
  uniqueSlug,
} from "../../src/lib/translate/core.ts";
import { GLOSSARY, GLOSSARY_RULES } from "../../src/lib/translate/glossary.ts";

// uk, en, then the rest: the admin editor's order
const LOCALES = Object.keys(LANGUAGE_NAMES);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const PAGE = 500;
const SLUG_CANDIDATES = 20;

const columnOf = (field) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

/**
 * The Supabase project and the gateway to use. Returns the settings or the reason they are refused.
 * @param {Record<string, string | undefined>} env
 * @param {{ production?: boolean, apply?: boolean, envFile?: string }} options
 */
export function resolveSettings(env, { production = false, apply = false, envFile = ".env.local" } = {}) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL && existsSync(envFile)) env = { ...readEnvFile(envFile), ...env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return { settings: null, reason: "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set" };
  }
  const { hostname } = new URL(url);
  const loopback = LOOPBACK_HOSTS.has(hostname);
  if (!loopback && !production) {
    return { settings: null, reason: `refusing the non-loopback Supabase URL ${hostname} without --production` };
  }
  const apiKey = env.AI_GATEWAY_API_KEY?.trim() || undefined;
  if (apply && !apiKey) return { settings: null, reason: "--apply needs AI_GATEWAY_API_KEY" };
  // a stand-in gateway only next to a local database: production always talks to the real gateway
  const baseURL = loopback ? env.AI_GATEWAY_BASE_URL?.trim() || undefined : undefined;
  return { settings: { url, serviceRoleKey, host: hostname, apiKey, baseURL }, reason: null };
}

async function readCatalogue(db, productId) {
  const products = [];
  for (let from = 0; ; from += PAGE) {
    let query = db
      .from("products")
      .select(
        `id, sku, product_translations(locale, slug, title, description, materials, care, clasp, lead_time_note,
           meta_title, meta_description, alt_text),
         product_images(id, position, product_image_alts(locale, alt))`,
      )
      .is("deleted_at", null)
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (productId) query = query.eq("id", productId);
    const { data, error } = await query;
    if (error) throw new Error(`reading the products: ${error.message}`);
    products.push(...data);
    if (data.length < PAGE) return products;
  }
}

function contentOf(row, images) {
  const texts = Object.fromEntries(TRANSLATABLE_FIELDS.map((field) => [field, row[columnOf(field)] ?? null]));
  const imageAlts = [...images]
    .sort((a, b) => a.position - b.position)
    .flatMap((image) => {
      const alt = image.product_image_alts.find((a) => a.locale === row.locale)?.alt;
      return alt ? [{ imageId: image.id, alt }] : [];
    });
  return { texts, imageAlts };
}

async function freeSlugs(db, productId, wanted) {
  if (wanted.length === 0) return new Map();
  const candidates = wanted.flatMap(({ base }) =>
    Array.from({ length: SLUG_CANDIDATES }, (_, i) => slugCandidate(base, i + 1, SLUG_MAX_LENGTH)),
  );
  const { data, error } = await db
    .from("product_translations")
    .select("product_id, locale, slug")
    .in("locale", wanted.map((w) => w.locale))
    .in("slug", [...new Set(candidates)]);
  if (error) throw new Error(`reading the slugs: ${error.message}`);
  const taken = new Set(data.filter((r) => r.product_id !== productId).map((r) => `${r.locale}:${r.slug}`));
  return new Map(wanted.map(({ locale, base }) => [locale, uniqueSlug(base, (s) => taken.has(`${locale}:${s}`), SLUG_MAX_LENGTH)]));
}

async function saveTranslations(db, product, sourceRow, translations) {
  const locales = Object.keys(translations);
  const slugs = await freeSlugs(
    db,
    product.id,
    locales.map((locale) => ({ locale, base: slugify(translations[locale].texts.title ?? "") || sourceRow.slug })),
  );
  const rows = locales.map((locale) => {
    const { texts } = translations[locale];
    return {
      product_id: product.id,
      locale,
      slug: slugs.get(locale),
      ...Object.fromEntries(TRANSLATABLE_FIELDS.map((field) => [columnOf(field), texts[field]])),
      title: texts.title ?? sourceRow.title,
      source: "machine",
      reviewed_at: null,
    };
  });
  // only missing locales are translated here, so a plain insert: a row the admin added meanwhile wins
  const { error } = await db.from("product_translations").insert(rows);
  if (error) throw new Error(`saving ${product.id}: ${error.message}`);
  const alts = locales.flatMap((locale) =>
    translations[locale].imageAlts.map(({ imageId, alt }) => ({ image_id: imageId, locale, alt })),
  );
  if (alts.length > 0) {
    const saved = await db.from("product_image_alts").upsert(alts, { onConflict: "image_id,locale" });
    if (saved.error) throw new Error(`saving the alts of ${product.id}: ${saved.error.message}`);
  }
}

const usd = (value) => `$${value.toFixed(value < 1 ? 4 : 2)}`;

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      product: { type: "string" },
      limit: { type: "string" },
      source: { type: "string" },
    },
  });
  if (values.source && !LOCALES.includes(values.source)) throw new Error(`unknown --source ${values.source}`);
  const limit = values.limit ? Number(values.limit) : Infinity;
  if (!(limit > 0)) throw new Error("--limit must be a positive number");

  const { settings, reason } = resolveSettings(process.env, { production: values.production, apply: values.apply });
  if (!settings) throw new Error(reason);
  const db = createClient(settings.url, settings.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(`${values.apply ? "APPLY" : "dry run"} on ${settings.host}, model ${TRANSLATION_MODEL}`);

  const catalogue = await readCatalogue(db, values.product);
  const plan = [];
  let skipped = 0;
  for (const product of catalogue) {
    const existing = product.product_translations.map((t) => t.locale);
    const sourceLocale = values.source && existing.includes(values.source) ? values.source : pickSourceLocale(existing, LOCALES);
    const sourceRow = product.product_translations.find((t) => t.locale === sourceLocale);
    const targets = sourceRow ? planTargets({ allLocales: LOCALES, existing, sourceLocale, overwrite: false }) : [];
    if (targets.length === 0) {
      skipped++;
      continue;
    }
    const content = contentOf(sourceRow, product.product_images);
    plan.push({ product, sourceRow, sourceLocale, targets, content });
    if (plan.length >= limit) break;
  }

  const estimate = { inputTokens: 0, outputTokens: 0, usd: 0, locales: 0 };
  for (const item of plan) {
    const e = estimateCall({ ...item, glossary: GLOSSARY, rules: GLOSSARY_RULES });
    estimate.inputTokens += e.inputTokens;
    estimate.outputTokens += e.outputTokens;
    estimate.usd += e.usd;
    estimate.locales += item.targets.length;
    if (!values.apply) {
      console.log(`  ${item.product.sku ?? item.product.id}  ${item.sourceLocale} → ${item.targets.join(",")}  ~${usd(e.usd)}`);
    }
  }
  console.log(
    `${plan.length} products to translate (${estimate.locales} locale texts), ${skipped} complete or without a source; ` +
      `estimate ~${estimate.inputTokens} input + ~${estimate.outputTokens} output tokens ≈ ${usd(estimate.usd)} ` +
      `at $${TRANSLATION_MODEL_PRICE.inputPerMillion}/$${TRANSLATION_MODEL_PRICE.outputPerMillion} per million tokens`,
  );
  if (!values.apply) {
    console.log("dry run: nothing was translated. Add --apply to run it.");
    return;
  }

  const model = createGateway({ apiKey: settings.apiKey, baseURL: settings.baseURL })(TRANSLATION_MODEL);
  const used = { inputTokens: 0, outputTokens: 0 };
  let failures = 0;
  for (const [index, item] of plan.entries()) {
    const label = `[${index + 1}/${plan.length}] ${item.product.sku ?? item.product.id}`;
    const result = await translateContent({
      model,
      sourceLocale: item.sourceLocale,
      targets: item.targets,
      content: item.content,
      glossary: GLOSSARY,
      rules: GLOSSARY_RULES,
    });
    used.inputTokens += result.usage.inputTokens;
    used.outputTokens += result.usage.outputTokens;
    if (!result.ok) {
      failures++;
      console.log(`${label} FAILED: ${result.reason} after ${result.attempts} attempts`);
      continue;
    }
    try {
      await saveTranslations(db, item.product, item.sourceRow, result.translations);
    } catch (error) {
      failures++;
      console.log(`${label} NOT SAVED: ${error.message}`);
      continue;
    }
    const failed = result.failed.map((f) => `${f.locale} (${f.reason})`).join(", ");
    console.log(`${label} ${Object.keys(result.translations).join(",")}${failed ? `; failed: ${failed}` : ""}`);
  }
  const cost =
    (used.inputTokens * TRANSLATION_MODEL_PRICE.inputPerMillion + used.outputTokens * TRANSLATION_MODEL_PRICE.outputPerMillion) /
    1_000_000;
  console.log(`done: ${plan.length - failures} products saved, ${failures} failed; used ${used.inputTokens} + ${used.outputTokens} tokens ≈ ${usd(cost)}`);
  if (failures > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`translate:missing: ${error.message}`);
    process.exitCode = 1;
  });
}
