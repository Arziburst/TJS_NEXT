import { getTranslations } from "next-intl/server";

type PriceProps = {
  // the price as the admin entered it, in USD cents (D4)
  usdMinor: number;
  className?: string;
};

/*
 * Stand-in for #14's <Price> (src/components/price.tsx) with the same props, until #14 is merged: shows "—"
 * because the displayed currency and rate (D4, D5) come with #14. Replace the import, then delete this file.
 */
export async function Price({ className }: PriceProps) {
  const t = await getTranslations("catalog.price");
  return (
    <span className={className} data-slot="price">
      <span aria-hidden>{t("none")}</span>
      <span className="sr-only">{t("unavailable")}</span>
    </span>
  );
}
