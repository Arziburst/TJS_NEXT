import { describe, expect, it } from "vitest";
import { supportedAcceptLanguage } from "@/i18n/accept-language";

describe("supportedAcceptLanguage (D27)", () => {
  it.each([
    { header: null, expected: null },
    { header: "", expected: null },
    { header: "ru-RU,ru", expected: null },
    { header: "ru-RU,ru;q=0.9", expected: null },
    { header: "ja-JP,ja;q=0.9", expected: null },
    { header: "*", expected: null },
    { header: "de-DE,de;q=0.9,en;q=0.8", expected: "de-DE,de;q=0.9,en;q=0.8" },
    { header: "ru-RU, ru;q=0.9, uk;q=0.8, en;q=0.7", expected: "uk;q=0.8,en;q=0.7" },
    { header: "pt-BR,pt;q=0.9", expected: "pt-BR,pt;q=0.9" },
    { header: "DE-at", expected: "DE-at" },
  ])("$header → $expected", ({ header, expected }) => {
    expect(supportedAcceptLanguage(header)).toBe(expected);
  });
});
