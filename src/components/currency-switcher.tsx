"use client";

import { useTranslations } from "next-intl";
import { useId, useOptimistic, useTransition, type ChangeEvent } from "react";
import { setCurrency } from "@/lib/money/actions";
import type { Currency } from "@/lib/money/currencies";
import { cn } from "@/lib/utils";

export type CurrencyOption = { value: Currency; label: string };

type CurrencySwitcherProps = {
  current: Currency;
  options: CurrencyOption[];
  className?: string;
  // the label stays for screen readers when the surrounding UI already shows it or has no room
  hideLabel?: boolean;
};

// Stores the choice in a cookie through a Server Action and re-renders the page; the URL never changes (D5)
export function CurrencySwitcher({ current, options, className, hideLabel = false }: CurrencySwitcherProps) {
  const t = useTranslations("nav");
  const id = useId();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(current);

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as Currency;
    startTransition(async () => {
      setSelected(next);
      await setCurrency(next);
    });
  }

  return (
    <div className={cn("flex items-center gap-2 font-sans text-sm", className)}>
      <label htmlFor={id} className={cn("text-muted-foreground", hideLabel && "sr-only")}>
        {t("currency")}
      </label>
      <select
        id={id}
        value={selected}
        onChange={onChange}
        disabled={isPending}
        aria-busy={isPending}
        className="h-11 cursor-pointer bg-transparent font-semibold tracking-[1.6px] transition-opacity hover:opacity-70 disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
