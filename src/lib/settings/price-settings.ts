import type { CurrencySettings } from "@/lib/money/convert";
import { currencies, type Currency } from "@/lib/money/currencies";
import { formatDecimal, parseDecimal } from "@/lib/money/decimal";

/*
 * The price conversion settings of the admin page (D4, D28): one markup for every display currency and each
 * currency's charm rounding rule. The form shows amounts in major units ("10.00", "9.00"); the database keeps
 * minor units. Shared by the form (field names, display) and the server action (parsing). Pure.
 */

// currency_settings.markup_bps is 0..10 000 (0–100 %)
export const MARKUP_MAX_BPS = 10_000;

export const RULE_FIELDS = ["step", "ending", "smallBelow", "smallStep", "smallEnding"] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export type PriceErrorCode = "required" | "invalidNumber" | "outOfRange" | "endingTooLarge" | "smallTierIncomplete";
export type PriceFieldErrors = Partial<Record<string, PriceErrorCode>>;

/** The form field name of a rule field: `UAH.step`. */
export function ruleFieldName(currency: Currency, field: RuleField): string {
  return `${currency}.${field}`;
}

export type CurrencyRule = Pick<
  CurrencySettings,
  "roundIncrement" | "ending" | "smallPriceBelow" | "smallRoundIncrement" | "smallEnding"
>;

export type PriceSettingsInput = { markupBps: number; rules: Partial<Record<Currency, CurrencyRule>> };

/** Minor units as the form shows them: 1000 with 2 decimals → "10.00". */
export function minorToText(minor: number | null, decimals: number): string {
  return minor === null ? "" : formatDecimal({ units: BigInt(minor), scale: decimals });
}

/** Basis points as a percent: 300 → "3", 350 → "3.5". */
export function bpsToPercentText(bps: number): string {
  return formatDecimal({ units: BigInt(bps), scale: 2 }).replace(/\.?0+$/, "");
}

// "10", "9.9", "0.90" or "9,90" (a comma typed on a phone) → minor units; null when not a number of that precision
export function textToMinor(text: string, decimals: number): number | null {
  const parsed = parseDecimal(text.replace(",", "."));
  if (!parsed || parsed.scale > decimals) return null;
  const minor = Number(parsed.units * BigInt(10) ** BigInt(decimals - parsed.scale));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** The form's text for stored settings: the markup in percent, each rule in major units. */
export function priceFormValues(
  markupBps: number,
  rules: Partial<Record<Currency, CurrencyRule>>,
  decimalsOf: Partial<Record<Currency, number>>,
): Record<string, string> {
  const values: Record<string, string> = { markup: bpsToPercentText(markupBps) };
  for (const currency of currencies) {
    const rule = rules[currency];
    const decimals = decimalsOf[currency];
    if (!rule || decimals === undefined) continue;
    values[ruleFieldName(currency, "step")] = minorToText(rule.roundIncrement, decimals);
    values[ruleFieldName(currency, "ending")] = minorToText(rule.ending, decimals);
    values[ruleFieldName(currency, "smallBelow")] = minorToText(rule.smallPriceBelow, decimals);
    values[ruleFieldName(currency, "smallStep")] = minorToText(rule.smallRoundIncrement, decimals);
    values[ruleFieldName(currency, "smallEnding")] = minorToText(rule.smallEnding, decimals);
  }
  return values;
}

export type ParsedPriceSettings = { ok: true; input: PriceSettingsInput } | { ok: false; fields: PriceFieldErrors };

/** Validates the markup and the rule of every currency in `decimalsOf` (the currencies the shop has). */
export function parsePriceSettingsForm(
  values: Partial<Record<string, string>>,
  decimalsOf: Partial<Record<Currency, number>>,
): ParsedPriceSettings {
  const fields: PriceFieldErrors = {};
  const text = (name: string) => (values[name] ?? "").trim();

  let markupBps = 0;
  const markup = text("markup");
  if (markup === "") fields.markup = "required";
  else {
    const bps = textToMinor(markup, 2);
    if (bps === null) fields.markup = "invalidNumber";
    else if (bps > MARKUP_MAX_BPS) fields.markup = "outOfRange";
    else markupBps = bps;
  }

  const rules: Partial<Record<Currency, CurrencyRule>> = {};
  for (const currency of currencies) {
    const decimals = decimalsOf[currency];
    if (decimals === undefined) continue;
    const amounts: Partial<Record<RuleField, number | null>> = {};
    for (const field of RULE_FIELDS) {
      const name = ruleFieldName(currency, field);
      const value = text(name);
      if (value === "") {
        amounts[field] = null;
        continue;
      }
      const minor = textToMinor(value, decimals);
      if (minor === null) fields[name] = "invalidNumber";
      else if (minor > 2_000_000_000) fields[name] = "outOfRange";
      else amounts[field] = minor;
    }

    const { step = null, ending = null, smallBelow = null, smallStep = null, smallEnding = null } = amounts;
    const name = (field: RuleField) => ruleFieldName(currency, field);
    if (step === null && !fields[name("step")]) fields[name("step")] = "required";
    if (ending === null && !fields[name("ending")]) fields[name("ending")] = "required";
    if (step === 0) fields[name("step")] = "outOfRange";
    if (step !== null && ending !== null && step > 0 && ending >= step) fields[name("ending")] = "endingTooLarge";

    const small = [smallBelow, smallStep, smallEnding];
    const smallErrors = (["smallBelow", "smallStep", "smallEnding"] as const).some((f) => fields[name(f)]);
    if (!smallErrors && small.some((v) => v !== null) && small.some((v) => v === null)) {
      for (const field of ["smallBelow", "smallStep", "smallEnding"] as const) {
        if (amounts[field] === null) fields[name(field)] = "smallTierIncomplete";
      }
    }
    if (smallBelow === 0) fields[name("smallBelow")] = "outOfRange";
    if (smallStep === 0) fields[name("smallStep")] = "outOfRange";
    if (smallStep !== null && smallEnding !== null && smallStep > 0 && smallEnding >= smallStep) {
      fields[name("smallEnding")] = "endingTooLarge";
    }

    if (step !== null && ending !== null) {
      rules[currency] = {
        roundIncrement: step,
        ending,
        smallPriceBelow: smallBelow,
        smallRoundIncrement: smallStep,
        smallEnding,
      };
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: { markupBps, rules } };
}
