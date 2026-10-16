"use client";

import { useId, useTransition, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";

export type FilterOption = { value: string; label: string; href: { pathname: string; query: Record<string, string> } };

type FilterSelectProps = { label: string; value: string; options: FilterOption[] };

function FilterSelect({ label, value, options }: FilterSelectProps) {
  const id = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const option = options.find((o) => o.value === event.target.value);
    if (option) startTransition(() => router.push(option.href));
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={id} className="font-sans text-xs text-muted-foreground uppercase">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        disabled={isPending}
        className="h-11 w-full cursor-pointer border-2 border-input bg-transparent px-2.5 font-sans text-sm disabled:opacity-50"
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

type MobileFiltersProps = {
  /** The shop's category list; the search results have none. */
  category?: { label: string; value: string; options: FilterOption[] };
  sortLabel: string;
  sort: string;
  sorts: FilterOption[];
  /** The filter sheet's trigger, a row of its own under the selects. */
  filters?: ReactNode;
};

/**
 * Below 1024px the category and sort lists become two selects side by side, stacked under 360px, with the
 * button of the filter sheet below them.
 */
export function MobileFilters({ category, sortLabel, sort, sorts, filters }: MobileFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sb:hidden" data-testid="mobile-filters">
      <div className="flex gap-3 max-[360px]:flex-col">
        {category && <FilterSelect label={category.label} value={category.value} options={category.options} />}
        <FilterSelect label={sortLabel} value={sort} options={sorts} />
      </div>
      {filters}
    </div>
  );
}
