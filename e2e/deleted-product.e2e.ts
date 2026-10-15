import { expect, test } from "@playwright/test";
import deErrors from "../messages/de/errors.json" with { type: "json" };

// A soft-deleted product (seed TEST-014) is hidden by RLS alone: since #13 the API roles cannot read or
// filter deleted_at (column grants), so no query names it any more. The document request is answered by the
// proxy's lookup (404, covered in product.e2e.ts); a client-side navigation skips the proxy lookup and is
// answered by the page itself, which must render the not-found page too.
const DELETED = "/de/product/steel-cuff-bracelet";

test("a client-side navigation to a soft-deleted product renders the not-found page", async ({ page }) => {
  await page.goto("/de");
  await page.waitForLoadState("networkidle");
  await page.evaluate((path) => (window as unknown as { next: { router: { push(p: string): void } } }).next.router.push(path), DELETED);

  await expect(page).toHaveURL(new RegExp(`${DELETED}$`));
  await expect(page.getByRole("heading", { name: deErrors.notFound.title })).toBeVisible();
  await expect(page.getByText("Steel cuff bracelet")).toHaveCount(0);
});

test("the document request for a soft-deleted product answers 404", async ({ request }) => {
  const response = await request.get(DELETED);
  expect(response.status()).toBe(404);
});
