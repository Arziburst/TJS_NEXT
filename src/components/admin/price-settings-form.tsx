"use client";

import { useLocale, useTranslations } from "next-intl";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import type { PriceSettingsFormState } from "@/app/[locale]/admin/settings/actions";
import { formatMoney, priceIn } from "@/lib/money/format";
import type { Currency } from "@/lib/money/currencies";
import {
  parsePriceSettingsForm,
  ruleFieldName,
  textToMinor,
  type PriceErrorCode,
  type RuleField,
} from "@/lib/settings/price-settings";
import { cn } from "@/lib/utils";
import { TextField, fieldId } from "./form-fields";
import { inputClass, labelClass } from "./styles";
import { SaveButton, SettingsFeedback } from "./settings-form-parts";

type PriceSettingsFormProps = {
  values: Record<string, string>;
  currencies: { currency: Currency; decimals: number }[];
  // the USD→X rate prices are shown at today, for the live example; a currency without one shows no example
  displayRates: Partial<Record<Currency, string>>;
  savePriceSettings: (previous: PriceSettingsFormState, formData: FormData) => Promise<PriceSettingsFormState>;
};

const idle: PriceSettingsFormState = { status: "idle" };

const MAIN_FIELDS = ["step", "ending"] as const satisfies readonly RuleField[];
const SMALL_FIELDS = ["smallBelow", "smallStep", "smallEnding"] as const satisfies readonly RuleField[];

/**
 * The markup (one for every display currency, D28) and the charm rounding of each currency (D4), with a live
 * example of one USD price in every currency as the values are typed.
 */
export function PriceSettingsForm({ values, currencies, displayRates, savePriceSettings }: PriceSettingsFormProps) {
  const t = useTranslations("admin.settings.prices");
  const locale = useLocale();
  const [state, dispatch, pending] = useActionState(savePriceSettings, idle);
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [example, setExample] = useState("29.00");
  const fields = state.status === "error" ? (state.fields ?? {}) : {};
  const shown = state.status === "saved" ? state.values : draft;
  const generation = state.status === "saved" ? state.savedAt : 0;
  const error = (name: string) => {
    const code = fields[name];
    return code ? t(`errors.${code}`) : undefined;
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (target.name) setDraft((current) => ({ ...current, [target.name]: target.value }));
  }

  // the example price in a currency with the values as typed; null while they do not parse
  function preview(currency: Currency, decimals: number): string | null {
    const usdMinor = textToMinor(example.trim(), 2);
    if (usdMinor === null) return null;
    const parsed = parsePriceSettingsForm(draft, { [currency]: decimals });
    const rule = parsed.ok ? parsed.input.rules[currency] : undefined;
    if (!parsed.ok || !rule) return null;
    const money = priceIn(usdMinor, currency, {
      settings: { [currency]: { decimals, markupBps: parsed.input.markupBps, ...rule } },
      displayRates: Object.fromEntries(Object.entries(displayRates).map(([c, rate]) => [c, { rate }])),
    });
    return money ? formatMoney(money, locale) : null;
  }

  function label(name: string): string {
    if (name === "markup") return t("markup");
    const [currency, field] = name.split(".");
    return `${currency} · ${t(field as RuleField)}`;
  }

  return (
    <form
      key={generation}
      onSubmit={onSubmit}
      onChange={onChange}
      noValidate
      aria-labelledby="settings-prices"
      aria-busy={pending}
      className="grid gap-5"
    >
      <header className="grid gap-1">
        <h2 id="settings-prices" className="font-sans text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="font-input text-sm">{t("hint")}</p>
      </header>
      <SettingsFeedback state={state} label={(name, code) => `${label(name)}: ${t(`errors.${code as PriceErrorCode}`)}`} />

      <div className="grid gap-4 sb:grid-cols-2">
        <TextField
          name="markup"
          label={t("markup")}
          hint={t("markupHint")}
          defaultValue={shown.markup}
          inputMode="decimal"
          autoComplete="off"
          error={error("markup")}
        />
        <div className="grid content-start gap-1.5">
          <label htmlFor="price-example" className={labelClass}>
            {t("example")}
          </label>
          {/* not part of the settings: no name, never submitted */}
          <input
            id="price-example"
            value={example}
            onChange={(event) => setExample(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            aria-describedby="price-example-hint"
            className={inputClass}
          />
          <p id="price-example-hint" className="font-input text-xs">
            {t("exampleHint")}
          </p>
        </div>
      </div>

      <section aria-labelledby="settings-rounding" className="grid gap-3">
        <h3 id="settings-rounding" className="font-sans text-base font-semibold">
          {t("rulesTitle")}
        </h3>
        <p className="font-input text-xs">{t("rulesHint")}</p>
        {currencies.map(({ currency, decimals }) => {
          const example = preview(currency, decimals);
          return (
            <fieldset key={currency} className="grid gap-3 border-2 border-hairline p-3">
              <legend className="px-1 font-sans text-base font-semibold">{currency}</legend>
              <div className="grid grid-cols-2 gap-3 sb:grid-cols-5">
                {[...MAIN_FIELDS, ...SMALL_FIELDS].map((field) => {
                  const name = ruleFieldName(currency, field);
                  return (
                    <TextField
                      key={name}
                      name={name}
                      label={t(field)}
                      defaultValue={shown[name] ?? ""}
                      inputMode="decimal"
                      autoComplete="off"
                      error={error(name)}
                      wrapperClassName={cn(field === "smallBelow" && "col-start-1 sb:col-start-auto")}
                    />
                  );
                })}
              </div>
              <p className="font-input text-sm" aria-live="polite" id={fieldId(`${currency}.preview`)}>
                {t("shownAs")}{" "}
                <span className="font-semibold tabular-nums">{example ?? t("noRate")}</span>
              </p>
            </fieldset>
          );
        })}
      </section>
      <SaveButton pending={pending} />
    </form>
  );
}
