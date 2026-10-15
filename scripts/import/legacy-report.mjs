// The import report for the owner (Markdown): the rate used, the summary and every imported product.
// Pure, so it is unit-tested (tests/import/legacy-catalogue.test.ts).

const KIND_LABEL = { made_to_order: "made to order", one_of_a_kind: "one of a kind" };

/**
 * @typedef {{ legacyId: string, category: string, fulfillment: string, priceUah: number, priceUsd: string,
 *   weight: number, weightMissing: boolean, photos: number, titles: Record<string, string>,
 *   slugs: Record<string, string>, sources: Record<string, string> }} ReportProduct
 */

/** Counts per category and kind, the price range and the products with weight 0. */
export function summarize(/** @type {ReportProduct[]} */ products) {
  const perCategory = {};
  for (const p of products) {
    perCategory[p.category] ??= { made_to_order: 0, one_of_a_kind: 0 };
    perCategory[p.category][p.fulfillment] += 1;
  }
  const byUsd = [...products].sort((a, b) => Number(a.priceUsd) - Number(b.priceUsd));
  return {
    perCategory,
    total: products.length,
    madeToOrder: products.filter((p) => p.fulfillment === "made_to_order").length,
    oneOfAKind: products.filter((p) => p.fulfillment === "one_of_a_kind").length,
    photos: products.reduce((sum, p) => sum + p.photos, 0),
    cheapest: byUsd[0] ?? null,
    dearest: byUsd.at(-1) ?? null,
    weightZero: products.filter((p) => p.weight === 0),
    humanUk: products.filter((p) => p.sources?.uk === "human").length,
  };
}

const cell = (text) => String(text).replaceAll("|", "\\|").replaceAll("\n", " ");

/**
 * @param {{ exportName: string, target: string, generatedAt: string,
 *   rate: { rate: string, rateDate: string }, products: ReportProduct[],
 *   orphans: { registry: number, archive: number }, changes: Record<string, number> }} input
 */
export function renderReport({ exportName, target, generatedAt, rate, products, orphans, changes }) {
  const s = summarize(products);
  const lines = [
    `# Legacy catalogue import — ${exportName}`,
    "",
    `- Target: ${target}`,
    `- Run: ${generatedAt}`,
    `- Rate (D33): 1 USD = ${rate.rate} UAH, NBU rate of ${rate.rateDate}; USD = UAH / rate, half up to the cent`,
    `- Changes of this run: ${Object.entries(changes).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    "",
    "## Summary",
    "",
    `${s.total} products (${s.madeToOrder} made to order, ${s.oneOfAKind} one of a kind), ${s.photos} photos, all published.`,
    "",
    "| Category | Made to order | One of a kind | Total |",
    "|---|---:|---:|---:|",
    ...Object.entries(s.perCategory)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([c, n]) => `| ${c} | ${n.made_to_order} | ${n.one_of_a_kind} | ${n.made_to_order + n.one_of_a_kind} |`),
    "",
    s.cheapest && s.dearest
      ? `Prices: ${s.cheapest.priceUsd}–${s.dearest.priceUsd} USD (${s.cheapest.priceUah}–${s.dearest.priceUah} UAH).`
      : "Prices: none.",
    "",
    `Not imported: customers, orders, views and the legacy discount field; ${orphans.registry} entries of the legacy ` +
      `media registry and ${orphans.archive} archived Cloudinary files that no product uses (they stay in the archive).`,
    "",
    "## Questions for the owner",
    "",
    `- Lead time: the ${s.madeToOrder} made-to-order products have none yet (TBD in the admin).`,
    `- Weight 0: ${s.weightZero.length} products (${s.weightZero.filter((p) => p.weightMissing).length} had no weight at all): ` +
      "real weights are needed for delivery estimates.",
    `- Texts: machine translations (not reviewed; the review flow applies), except the ${s.humanUk} uk texts that were ` +
      "already the owner's Ukrainian (source human, reviewed at the import).",
    "",
    "## Products",
    "",
    "| Legacy id | Category | Kind | UAH | USD | Weight, g | Photos | Title (en) | Slug (uk) | Slug (en) |",
    "|---|---|---|---:|---:|---:|---:|---|---|---|",
    ...products.map(
      (p) =>
        `| ${p.legacyId} | ${p.category} | ${KIND_LABEL[p.fulfillment]} | ${p.priceUah} | ${p.priceUsd} | ` +
        `${p.weight}${p.weightMissing ? " (none)" : ""} | ${p.photos} | ${cell(p.titles.en)} | ${p.slugs.uk} | ${p.slugs.en} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
