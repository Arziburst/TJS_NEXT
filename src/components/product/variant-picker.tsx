"use client";

import { useTranslations } from "next-intl";
import { createContext, use, useState, type ReactNode } from "react";

// The size the visitor chose on a product page (#66): the picker sets it, the price and the add-to-cart button
// read it. Outside a product with sizes there is no selection and no choice to make.

type Selection = { required: boolean; selected: string | null; select: (id: string) => void };

const SelectionContext = createContext<Selection>({ required: false, selected: null, select: () => {} });

export function useVariantSelection(): Selection {
  return use(SelectionContext);
}

/** Holds the chosen size for its children; nothing is chosen at first (the visitor picks, never a default). */
export function VariantSelection({ children }: { children: ReactNode }) {
  const [selected, select] = useState<string | null>(null);
  return <SelectionContext value={{ required: true, selected, select }}>{children}</SelectionContext>;
}

/** The chosen size's price (each rendered by the server in the visitor's currency), else the "from" price. */
export function SelectedPrice({ prices, fallback }: { prices: Record<string, ReactNode>; fallback: ReactNode }) {
  const { selected } = useVariantSelection();
  return <span data-testid="product-price">{(selected && prices[selected]) || fallback}</span>;
}

export type VariantOption = {
  id: string;
  label: string;
  /** The label's language when it is not the page's (a fallback label). */
  lang?: string;
  available: boolean;
  /** Shown next to the label when the sizes differ in price. */
  price?: ReactNode;
};

/**
 * The sizes as a radio group of large tiles, native radios underneath (arrow keys, screen readers). A size the
 * owner cannot make now stays visible, disabled, and says so.
 */
export function VariantPicker({ options }: { options: VariantOption[] }) {
  const t = useTranslations("product.variants");
  const { selected, select } = useVariantSelection();
  const noneAvailable = options.every((option) => !option.available);

  return (
    <fieldset className="grid gap-2" data-testid="variant-picker">
      <legend className="mb-2 font-sans text-sm font-semibold tracking-[0.2em] uppercase">{t("legend")}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-12 min-w-12 cursor-pointer flex-col items-center justify-center border-2 border-input px-3 py-1.5 text-center font-sans text-sm transition hover:border-primary has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-disabled:cursor-not-allowed has-disabled:border-dashed has-disabled:opacity-60 has-disabled:hover:border-input has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
          >
            <input
              type="radio"
              name="variant"
              value={option.id}
              checked={selected === option.id}
              disabled={!option.available}
              onChange={() => select(option.id)}
              className="sr-only"
            />
            <span lang={option.lang} className="font-semibold">
              {option.label}
            </span>
            {option.price && <span className="text-xs">{option.price}</span>}
            {!option.available && <span className="text-xs">{t("unavailable")}</span>}
          </label>
        ))}
      </div>
      {noneAvailable ? (
        <p className="text-sm">{t("noneAvailable")}</p>
      ) : (
        selected === null && (
          <p className="text-sm" id="variant-hint">
            {t("choose")}
          </p>
        )
      )}
    </fieldset>
  );
}
