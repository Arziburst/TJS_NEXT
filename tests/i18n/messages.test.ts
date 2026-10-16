import { readdirSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { loadMessages, namespaces } from "@/i18n/messages";
import { locales } from "@/i18n/routing";

const messagesDir = new URL("../../messages/", import.meta.url);

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(path, value);
    else for (const [leaf, text] of leaves(value, path)) result.set(leaf, text);
  }
  return result;
}

// The distinct arguments (`{name}` and the head of `{name, plural, …}`) and tags of a message. A set, not a
// list: a plural repeats them once per branch, and the number of branches differs by locale (uk: one, few,
// many, other). A branch body (`one {…}`) is not an argument.
function placeholders(text: string): string[] {
  const args = [...text.matchAll(/(?<!\b(?:zero|one|two|few|many|other)\s*|=\d+\s*)\{(\w+)(?:\}|,\s*\w+)/g)].map(
    (match) => `{${match[1]}}`,
  );
  const tags = [...text.matchAll(/<(\w+)>/g)].map((match) => `<${match[1]}>`);
  return [...new Set([...args, ...tags])].sort();
}

describe("message catalogs", () => {
  it("has exactly the 11 locales of D3, without Russian", () => {
    expect([...locales].sort()).toEqual(["cs", "de", "en", "es", "fr", "it", "nl", "pl", "pt", "ro", "uk"]);
    const dirs = readdirSync(messagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual([...locales].sort());
    expect(dirs).not.toContain("ru");
  });

  it("splits every locale into the same namespace files", () => {
    for (const locale of locales) {
      const files = readdirSync(new URL(`${locale}/`, messagesDir))
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.replace(/\.json$/, ""))
        .sort();
      expect(files, locale).toEqual([...namespaces].sort());
    }
  });

  it.each(locales)("%s has the same keys and placeholders as en", async (locale) => {
    const en = leaves((await loadMessages("en")) as unknown as Tree);
    const other = leaves((await loadMessages(locale)) as unknown as Tree);

    expect([...other.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, text] of en) {
      expect(placeholders(other.get(key) ?? ""), `${locale}:${key}`).toEqual(placeholders(text));
      expect(other.get(key)?.trim(), `${locale}:${key} is empty`).toBeTruthy();
    }
  });

  it.each(locales)("%s messages are valid ICU and format", async (locale) => {
    const messages = await loadMessages(locale);
    const errors: string[] = [];
    const t = createTranslator({
      locale,
      messages,
      onError: (error) => errors.push(error.message),
    });
    const args = {
      min: 2,
      max: 100,
      email: "olena@example.test",
      currency: "USD",
      shown: 12,
      total: 40,
      index: 1,
      count: 5,
      days: 3,
      page: 2,
      category: "Rings",
      value: "30 mm",
      title: "Coral drop earrings",
      sku: "TJS-1",
      locales: "Deutsch, Français",
      field: "Price",
      error: "Enter a number",
      quantity: 2,
      url: "https://example.com/a.jpg",
      country: "Polska",
      date: "21 October 2026",
      kg: 30,
      price: "96,45 ₴",
      query: "coral",
      language: "English",
      slug: "brass",
      titles: "Coral drop earrings, Pearl ring",
      maxMb: 15,
      // a file name (admin.images) and a person's first name (checkout.done) alike
      name: "IMG_0042.jpg",
      done: 3,
      position: 2,
      current: 3,
      failed: 1,
      // the notifications (#26): an order number, its status, money and the shop's host
      number: 10042,
      status: "Accepted",
      amount: "80 ₴",
      flat: "12",
      site: "shop.example.test",
      // a size's name (#66)
      label: "17",
      // the page count of the order history (account)
      pages: 3,
      // Auth's emails (#99): the shop's name and the new address of an email change
      shop: "TJS",
      newEmail: "olena.new@example.com",
      link: (chunks: string) => `<a>${chunks}</a>`,
      b: (chunks: string) => `<b>${chunks}</b>`,
    };

    for (const key of leaves(messages as unknown as Tree).keys()) {
      // keys are checked against en above; here every one is formatted at runtime (markup covers rich tags)
      expect(t.markup(key as never, args as never), `${locale}:${key}`).not.toBe(key);
    }
    expect(errors).toEqual([]);
  });
});
