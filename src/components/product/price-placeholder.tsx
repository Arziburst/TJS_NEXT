import { getTranslations } from "next-intl/server";

// Stand-in for <Price> (#14) with the same props until it is merged.
export async function Price({ className }: { usdMinor: number; className?: string }) {
  const t = await getTranslations("common");
  return <span className={className}>{t("noData")}</span>;
}

export async function getJsonLdPrice(_usdMinor: number, _locale: string): Promise<{ price: string; priceCurrency: string } | null> {
  return null;
}
