import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { loadMessages } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";

// catalog.shownCount agrees its noun with {total} by the locale's plural rules
async function shown(locale: Locale, shownCount: number, total: number) {
  const t = createTranslator({ locale, messages: await loadMessages(locale), namespace: "catalog" });
  return t.markup("shownCount", { shown: shownCount, total, b: (chunks) => chunks });
}

describe("catalog.shownCount plural forms", () => {
  it.each([
    ["en", 1, 1, "Showed 1 of 1 product"],
    ["en", 20, 31, "Showed 20 of 31 products"],
    ["uk", 1, 1, "Показано 1 з 1 товару"],
    ["uk", 2, 2, "Показано 2 з 2 товарів"],
    ["uk", 20, 25, "Показано 20 з 25 товарів"],
    ["uk", 20, 31, "Показано 20 з 31 товару"],
    ["pl", 1, 1, "Wyświetlono 1 z 1 produktu"],
    ["pl", 3, 3, "Wyświetlono 3 z 3 produktów"],
    ["cs", 4, 4, "Zobrazeno 4 z 4 produktů"],
    ["ro", 20, 21, "Se afișează 20 din 21 de produse"],
    ["ro", 2, 2, "Se afișează 2 din 2 produse"],
    ["de", 1, 1, "1 von 1 Produkt angezeigt"],
  ] as const)("%s: %i of %i", async (locale, shownCount, total, expected) => {
    expect(await shown(locale, shownCount, total)).toBe(expected);
  });
});
