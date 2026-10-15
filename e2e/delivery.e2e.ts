import { expect, test, type Page } from "@playwright/test";

// The Nova Poshta delivery pieces on the dev showcase /delivery-demo, answered from the recorded API fixtures
// (NOVA_POSHTA_FIXTURES=true in the web server's env, playwright.config.ts). Prices are the recorded tariffs:
// from Kyiv (D35) for the demo parcel of 70 g and 1 289 ₴.

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test.describe("Nova Poshta delivery", () => {
  // the delivery actions are limited per client IP (src/lib/delivery/rate-limit.ts): each test is its own client
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `e2e-delivery-${crypto.randomUUID()}` });
  });

  test("city, a parcel locker of the city and the quote", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/uk/delivery-demo");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const quote = page.locator('[data-slot="delivery-quote"]');
    await expect(quote.getByRole("status")).toHaveText("Виберіть, куди доставити, щоб побачити ціну");

    const city = page.getByRole("combobox", { name: "Місто", exact: true });
    await city.pressSequentially("К");
    await expect(page.getByText("Введіть щонайменше 2 літери")).toBeVisible();
    await city.pressSequentially("и");
    await page.getByRole("option", { name: "Київ м. Київ, Київська обл." }).click();
    await expect(city).toHaveValue("Київ");

    await expect(page.getByRole("radio", { name: "У відділенні або поштоматі" })).toBeChecked();
    await page.getByText("Поштомати", { exact: true }).click();
    await page.getByRole("combobox", { name: "Відділення або поштомат" }).click();
    const lockers = page.getByRole("option");
    await expect(lockers.first()).toContainText("Поштомат");
    await expect(page.getByRole("option", { name: /Відділення №/ })).toHaveCount(0);
    await page.getByRole("option", { name: /№1001:/ }).click();

    await expect(quote.getByRole("status")).toHaveText("≈ 86,45 ₴");
    await expect(quote).toContainText("фактичну вартість ви сплачуєте у відділенні");

    // searching a branch by its number
    await page.getByText("Відділення", { exact: true }).click();
    const warehouse = page.getByRole("combobox", { name: "Відділення або поштомат" });
    await expect(warehouse).toHaveValue("");
    await warehouse.fill("1");
    await page.getByRole("option", { name: /^Відділення №1: вул. Пирогівський шлях, 135/ }).click();
    await expect(quote.getByRole("status")).toHaveText("≈ 76,45 ₴");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBe(0);
    expect(errors).toEqual([]);
  });

  test("courier delivery to a street, house and flat", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/uk/delivery-demo");

    await page.getByRole("combobox", { name: "Місто", exact: true }).pressSequentially("Львів");
    await page.getByRole("option", { name: "Львів м. Львів, Львівська обл." }).click();
    await page.getByText("Кур'єром за адресою").click();

    await page.getByRole("combobox", { name: "Вулиця" }).pressSequentially("Шевч");
    await page.getByRole("option").first().click();
    await expect(page.getByRole("combobox", { name: "Вулиця" })).toHaveValue(/Шевченка/);
    await page.getByRole("textbox", { name: "Будинок" }).fill("16А");
    await page.getByRole("textbox", { name: "Квартира (необов'язково)" }).fill("2");

    await expect(page.locator('[data-slot="delivery-quote"]').getByRole("status")).toHaveText("≈ 156,45 ₴");
    expect(errors).toEqual([]);
  });

  test("a Latin search asks for the Ukrainian name", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/en/delivery-demo");
    await page.getByRole("combobox", { name: "City", exact: true }).pressSequentially("Kyiv");
    await expect(page.getByText("Type the name in Ukrainian")).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
