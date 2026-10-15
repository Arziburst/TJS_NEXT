import { NextIntlClientProvider } from "next-intl";
import { getFormatter, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { addToCart } from "@/app/[locale]/product/[slug]/actions";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/lib/catalog/types";
import { AddToCartButton } from "./add-to-cart-button";
import { GoBackButton } from "./go-back-button";
import { ProductGallery } from "./product-gallery";

type ProductDetailsProps = {
  product: Product;
  categoryName: string | null;
  /** The price element (`<Price>`), rendered by the page. */
  price: ReactNode;
};

/*
 * The product page body: the gallery and the info column side by side from `sb` on (the info column
 * sticks below the header while the photos scroll), stacked below it.
 */
export async function ProductDetails({ product, categoryName, price }: ProductDetailsProps) {
  const [t, tProduct, format, messages] = await Promise.all([
    getTranslations("product.page"),
    getTranslations("product"),
    getFormatter(),
    getMessages(),
  ]);
  const { translation } = product;
  // fallback content keeps its own language for screen readers and translators
  const contentLang = translation.isFallback ? translation.locale : undefined;
  const status = availabilityStatus(product);
  const canOrder = status === null || status === "oneOfAKind";

  return (
    <NextIntlClientProvider messages={{ common: { actions: messages.common.actions }, product: messages.product }}>
      <div className="grid gap-6 sb:grid-cols-2 sb:gap-14">
        <ProductGallery images={product.images} />

        <div className="flex flex-col gap-5 sb:sticky sb:top-24 sb:self-start">
          <GoBackButton className="self-start" />
          {translation.isFallback && (
            <p role="note" className="text-sm">
              {t("untranslated")}
            </p>
          )}
          <div className="flex flex-col gap-2" lang={contentLang}>
            {categoryName && <p className="font-sans text-sm tracking-[0.2em] uppercase">{categoryName}</p>}
            <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{translation.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl text-accent">{price}</span>
            {status && <Badge variant="secondary">{t(status)}</Badge>}
          </div>
          {product.fulfillment === "made_to_order" && (
            <p className="flex flex-wrap gap-x-3 text-sm">
              <span>{tProduct("card.onlyOrder")}</span>
              {product.leadTimeDays !== null && <span>{t("leadTime", { days: product.leadTimeDays })}</span>}
            </p>
          )}
          {translation.description && (
            <p className="whitespace-pre-line" lang={contentLang}>
              {translation.description}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {product.materials && (
              <>
                <dt className="font-semibold">{t("materials")}</dt>
                <dd lang={contentLang}>{product.materials}</dd>
              </>
            )}
            {product.care && (
              <>
                <dt className="font-semibold">{t("care")}</dt>
                <dd lang={contentLang}>{product.care}</dd>
              </>
            )}
            {product.weightG > 0 && (
              <>
                <dt className="font-semibold">{t("weight")}</dt>
                <dd>{format.number(product.weightG, { style: "unit", unit: "gram" })}</dd>
              </>
            )}
          </dl>
          {canOrder && <AddToCartButton productId={product.id} addToCart={addToCart} className="sb:self-start" />}
        </div>
      </div>
    </NextIntlClientProvider>
  );
}

// a one-of-a-kind piece says so, and whether it is still available; made-to-order work needs no badge
function availabilityStatus(product: Product): "oneOfAKind" | "reserved" | "sold" | null {
  if (product.fulfillment !== "one_of_a_kind") return null;
  if (product.availability === "available") return "oneOfAKind";
  return product.availability;
}
