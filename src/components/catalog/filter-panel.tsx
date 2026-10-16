"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { Currency } from "@/lib/money/currencies";
import { cn } from "@/lib/utils";
import { filtersQuery, parseShopFilters, type SearchParams } from "./shop-query";

export type FilterOptionView = { value: string; label: string; count: number; checked: boolean };

/** One list of the filters: its URL parameter, its legend and the options worth showing. */
export type FilterGroupView = { param: "material" | "colour" | "availability"; legend: string; options: FilterOptionView[] };

export type PriceView = {
  legend: string;
  currency: Currency;
  min: string;
  max: string;
  minLabel: string;
  maxLabel: string;
  /** Shown when the range could not be applied (no rate for its currency). */
  notice: string | null;
};

export type FilterPanelProps = {
  /** Distinguishes the ids of the sidebar's panel from the sheet's (both are in the page). */
  idPrefix: string;
  /** The listing's localized path: the form's target without JavaScript (a plain GET). */
  action: string;
  /** The same path without the locale, for the client navigation. */
  pathname: string;
  /** The URL parameters kept on every change (the search query, the sort); a change starts at page 1. */
  base: Record<string, string>;
  groups: FilterGroupView[];
  price: PriceView;
  applyLabel: string;
  /** Sidebar: a ticked box applies at once. Sheet: everything applies with the button. */
  autoApply: boolean;
  /** Called once the navigation of an apply has started (the sheet closes). */
  onApply?: () => void;
  className?: string;
};

type Selection = Record<FilterGroupView["param"], string[]>;

function selectionOf(groups: FilterGroupView[]): Selection {
  const selection: Selection = { material: [], colour: [], availability: [] };
  for (const group of groups) selection[group.param] = group.options.filter((o) => o.checked).map((o) => o.value);
  return selection;
}

const LEGEND = "mb-2 font-sans text-sm text-muted-foreground uppercase";

/**
 * The listing's filters as one form: checkboxes for materials, colours and availability (each with its
 * product count) and a price range. The state is the URL: applying navigates to the canonical URL of the new
 * filters (src/components/catalog/shop-query.ts); without JavaScript the form submits as a GET.
 */
export function FilterPanel({
  idPrefix,
  action,
  pathname,
  base,
  groups,
  price,
  applyLabel,
  autoApply,
  onApply,
  className,
}: FilterPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = useId();
  // controlled, and reset whenever the URL's filters change (a navigation, back and forward)
  const urlState = JSON.stringify([selectionOf(groups), price.min, price.max]);
  const [shown, setShown] = useState(urlState);
  const [selection, setSelection] = useState(() => selectionOf(groups));
  const [min, setMin] = useState(price.min);
  const [max, setMax] = useState(price.max);
  if (shown !== urlState) {
    setShown(urlState);
    setSelection(selectionOf(groups));
    setMin(price.min);
    setMax(price.max);
  }

  function apply(next: Selection, range: { min: string; max: string }) {
    const params: SearchParams = {
      material: next.material,
      colour: next.colour,
      availability: next.availability,
      min: range.min,
      max: range.max,
      cur: price.currency,
    };
    const query = { ...base, ...filtersQuery(parseShopFilters(params)) };
    startTransition(() => router.push({ pathname, query }, { scroll: false }));
    onApply?.();
  }

  function toggle(param: FilterGroupView["param"], value: string, checked: boolean) {
    const next = {
      ...selection,
      [param]: checked ? [...selection[param], value] : selection[param].filter((v) => v !== value),
    };
    setSelection(next);
    if (autoApply) apply(next, { min, max });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(selection, { min, max });
  }

  return (
    <form
      method="get"
      action={action}
      onSubmit={onSubmit}
      aria-busy={pending}
      className={cn("flex flex-col gap-8", className)}
      data-testid={`${idPrefix}-filters`}
    >
      {Object.entries(base).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {groups.map((group) => (
        <fieldset key={group.param} className="flex flex-col">
          <legend className={LEGEND}>{group.legend}</legend>
          <ul className="flex flex-col">
            {group.options.map((option) => {
              const inputId = `${id}-${group.param}-${option.value}`;
              return (
                <li key={option.value}>
                  <label
                    htmlFor={inputId}
                    className="flex min-h-11 cursor-pointer items-center gap-3 font-sans text-sm has-checked:font-semibold sb:min-h-9"
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      name={group.param}
                      value={option.value}
                      checked={selection[group.param].includes(option.value)}
                      onChange={(event) => toggle(group.param, option.value, event.target.checked)}
                      className="size-4 shrink-0 cursor-pointer accent-primary"
                    />
                    <span className="min-w-0 flex-1 break-words">{option.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{option.count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}

      <fieldset className="flex flex-col">
        <legend className={LEGEND}>{price.legend}</legend>
        <input type="hidden" name="cur" value={price.currency} />
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["min", price.minLabel, min, setMin],
              ["max", price.maxLabel, max, setMax],
            ] as const
          ).map(([name, label, value, set]) => (
            <div key={name} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-${name}`} className="font-sans text-xs text-muted-foreground">
                {label}
              </label>
              <input
                id={`${id}-${name}`}
                name={name}
                value={value}
                onChange={(event) => set(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                pattern="[0-9]+([.,][0-9]{1,2})?"
                className="h-11 w-full min-w-0 border-2 border-input bg-transparent px-2.5 font-sans text-base tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sb:text-sm"
              />
            </div>
          ))}
        </div>
        {price.notice && <p className="mt-2 font-sans text-xs">{price.notice}</p>}
      </fieldset>

      <Button type="submit" variant={autoApply ? "outline" : "default"} disabled={pending} className="w-full">
        {applyLabel}
      </Button>
    </form>
  );
}
