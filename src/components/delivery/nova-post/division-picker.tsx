"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { listNovaPostDivisions } from "@/lib/delivery/nova-post/actions";
import type { DeliveryCountry } from "@/lib/delivery/nova-post/countries";
import { DIVISION_CATEGORIES, type Division, type DivisionCategory } from "@/lib/delivery/nova-post/types";
import { cn } from "@/lib/utils";

type DivisionPickerProps = {
  country: DeliveryCountry;
  settlementId: number;
  value: Division | null;
  onChange: (division: Division | null) => void;
  className?: string;
};

type Loaded =
  | { settlementId: number; divisions: Division[] }
  | { settlementId: number; failed: "error" | "rateLimited" };

const FILTERS = ["all", ...DIVISION_CATEGORIES] as const;
type Filter = (typeof FILTERS)[number];

// The branch, parcel locker or pick-up point in the chosen town, filtered by its type
export function DivisionPicker({ country, settlementId, value, onChange, className }: DivisionPickerProps) {
  const t = useTranslations("checkout.internationalDelivery");
  // the shop's one "too many attempts" text, shared with the auth forms and the Nova Poshta pieces
  const tAuth = useTranslations("auth.errors");
  const locale = useLocale();
  const id = useId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    startTransition(async () => {
      const result = await listNovaPostDivisions({ country, settlementId, categories: [...DIVISION_CATEGORIES], locale });
      if (!current) return;
      setLoaded(
        result.ok
          ? { settlementId, divisions: result.divisions }
          : { settlementId, failed: result.reason === "rateLimited" ? "rateLimited" : "error" },
      );
    });
    return () => {
      current = false;
    };
  }, [country, settlementId, locale]);

  const ready = loaded?.settlementId === settlementId ? loaded : null;
  const divisions = ready && "divisions" in ready ? ready.divisions : [];
  const shown = filter === "all" ? divisions : divisions.filter((division) => division.category === filter);
  const present = new Set<DivisionCategory>(divisions.map((division) => division.category));

  return (
    <fieldset className={cn("grid gap-3", className)} aria-busy={isPending || undefined}>
      <legend className="mb-2 font-sans text-sm font-semibold">{t("division")}</legend>

      <div role="group" aria-label={t("divisionTypeFilter")} className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            disabled={option !== "all" && !present.has(option)}
            onClick={() => setFilter(option)}
            className="h-9 border-2 border-primary px-3 font-sans text-xs font-medium transition hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {t(`divisionTypes.${option}`)}
          </button>
        ))}
      </div>

      {!ready ? (
        <p className="font-input text-sm text-foreground/70">{t("loading")}</p>
      ) : "failed" in ready ? (
        <p role="alert" className="font-input text-sm">
          {ready.failed === "rateLimited" ? tAuth("rateLimited") : t("loadError")}
        </p>
      ) : shown.length === 0 ? (
        <p className="font-input text-sm">{t("noDivisions")}</p>
      ) : (
        <ul className="grid max-h-80 overflow-y-auto overscroll-contain border-2 border-input">
          {shown.map((division) => {
            const inputId = `${id}-${division.id}`;
            return (
              <li key={division.id} className="border-b border-hairline last:border-b-0">
                <label
                  htmlFor={inputId}
                  className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-3 py-2.5 font-input text-sm has-checked:bg-hairline"
                >
                  <input
                    id={inputId}
                    type="radio"
                    name={`${id}-division`}
                    value={division.id}
                    checked={value?.id === division.id}
                    onChange={() => onChange(division)}
                    className="row-span-2 mt-0.5 size-4 accent-primary"
                  />
                  <span className="font-semibold">
                    {division.name}
                    <span className="ml-2 text-xs font-normal opacity-80">{t(`divisionTypes.${division.category}`)}</span>
                  </span>
                  <span className="text-xs opacity-80">{division.address}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
