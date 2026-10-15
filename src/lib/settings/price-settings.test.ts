import { describe, expect, it } from "vitest";
import { bpsToPercentText, minorToText, parsePriceSettingsForm, priceFormValues } from "./price-settings";

const decimals = { UAH: 2, EUR: 2 } as const;

const valid = {
  markup: "3",
  "UAH.step": "10",
  "UAH.ending": "9",
  "EUR.step": "10.00",
  "EUR.ending": "9.00",
  "EUR.smallBelow": "100",
  "EUR.smallStep": "1",
  "EUR.smallEnding": "0,90",
};

describe("parsePriceSettingsForm", () => {
  it("reads the markup in percent and the rules in major units", () => {
    expect(parsePriceSettingsForm(valid, decimals)).toEqual({
      ok: true,
      input: {
        markupBps: 300,
        rules: {
          UAH: { roundIncrement: 1000, ending: 900, smallPriceBelow: null, smallRoundIncrement: null, smallEnding: null },
          EUR: { roundIncrement: 1000, ending: 900, smallPriceBelow: 10000, smallRoundIncrement: 100, smallEnding: 90 },
        },
      },
    });
    const half = parsePriceSettingsForm({ ...valid, markup: "3.25" }, decimals);
    expect(half.ok && half.input.markupBps).toBe(325);
  });

  it("refuses a missing, malformed or out-of-range markup", () => {
    expect(parsePriceSettingsForm({ ...valid, markup: "" }, decimals)).toEqual({ ok: false, fields: { markup: "required" } });
    expect(parsePriceSettingsForm({ ...valid, markup: "3.125" }, decimals)).toEqual({ ok: false, fields: { markup: "invalidNumber" } });
    expect(parsePriceSettingsForm({ ...valid, markup: "-1" }, decimals)).toEqual({ ok: false, fields: { markup: "invalidNumber" } });
    expect(parsePriceSettingsForm({ ...valid, markup: "100.01" }, decimals)).toEqual({ ok: false, fields: { markup: "outOfRange" } });
  });

  it("refuses an ending not below its step and a zero step", () => {
    expect(parsePriceSettingsForm({ ...valid, "UAH.ending": "10" }, decimals)).toEqual({
      ok: false,
      fields: { "UAH.ending": "endingTooLarge" },
    });
    expect(parsePriceSettingsForm({ ...valid, "UAH.step": "0" }, decimals)).toEqual({
      ok: false,
      fields: { "UAH.step": "outOfRange" },
    });
    expect(parsePriceSettingsForm({ ...valid, "EUR.smallEnding": "1" }, decimals)).toEqual({
      ok: false,
      fields: { "EUR.smallEnding": "endingTooLarge" },
    });
  });

  it("needs the small-price tier complete or empty", () => {
    expect(parsePriceSettingsForm({ ...valid, "EUR.smallStep": "" }, decimals)).toEqual({
      ok: false,
      fields: { "EUR.smallStep": "smallTierIncomplete" },
    });
  });

  it("refuses more decimals than the currency has", () => {
    expect(parsePriceSettingsForm({ ...valid, "UAH.ending": "9.001" }, decimals)).toEqual({
      ok: false,
      fields: { "UAH.ending": "invalidNumber" },
    });
  });
});

describe("display", () => {
  it("shows minor units and basis points as the form's text", () => {
    expect(minorToText(1000, 2)).toBe("10.00");
    expect(minorToText(90, 2)).toBe("0.90");
    expect(minorToText(null, 2)).toBe("");
    expect(bpsToPercentText(300)).toBe("3");
    expect(bpsToPercentText(350)).toBe("3.5");
    expect(bpsToPercentText(0)).toBe("0");
  });
});

describe("priceFormValues", () => {
  it("round-trips the parsed settings through the form's text", () => {
    const parsed = parsePriceSettingsForm(valid, decimals);
    if (!parsed.ok) throw new Error("expected ok");
    const values = priceFormValues(parsed.input.markupBps, parsed.input.rules, decimals);
    expect(values).toMatchObject({ markup: "3", "UAH.step": "10.00", "UAH.smallBelow": "", "EUR.smallEnding": "0.90" });
    expect(parsePriceSettingsForm(values, decimals)).toEqual(parsed);
  });
});
