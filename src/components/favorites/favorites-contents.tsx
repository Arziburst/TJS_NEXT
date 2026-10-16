import { getLocale, getTranslations } from "next-intl/server";
import { CartItemImage } from "@/components/cart/cart-item-image";
import { productHref, SHOP_HREF } from "@/components/catalog/links";
import { Price } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Link } from "@/i18n/navigation";
import { getFavoritesView, type FavoriteItem } from "@/lib/favorites";
import { cn } from "@/lib/utils";
import { RemoveFavoriteButton } from "./remove-favorite-button";

// 96px boxes, 128px from `sb` (64rem)
const IMAGE_SIZES = "(min-width: 64rem) 128px, 96px";

/*
 * The favorites page body: every piece re-checked against the catalog on this render, with its current price,
 * or why it can no longer be ordered (sold, reserved, no longer available). Request-time data: render inside
 * <Suspense>.
 */
export async function FavoritesContents() {
  const [view, t] = await Promise.all([getFavoritesView(), getTranslations("product.favorites")]);
  if (!view.ok) {
    return (
      <p role="alert" className="py-10">
        {t("loadError")}
      </p>
    );
  }
  if (view.items.length === 0) return <EmptyFavorites />;

  return (
    <ul aria-label={t("list")} className="grid gap-x-10 border-t border-hairline sb:grid-cols-2">
      {view.items.map((item) => (
        <li key={item.productId} data-testid="favorite-item" data-status={item.status} className="border-b border-hairline">
          <FavoriteRow item={item} />
        </li>
      ))}
    </ul>
  );
}

async function FavoriteRow({ item }: { item: FavoriteItem }) {
  const [t, tStatus, locale] = await Promise.all([
    getTranslations("product.favorites"),
    getTranslations("product.page"),
    getLocale(),
  ]);
  const { product } = item;

  if (!product) {
    return (
      <div className="flex gap-4 py-5 sb:gap-6">
        <CartItemImage image={null} alt="" sizes={IMAGE_SIZES} className="size-24 sb:size-32" />
        <div className="flex grow flex-col gap-3">
          <p className="font-sans font-semibold">{t("unavailablePiece")}</p>
          <Badge variant="outline">{t("unavailable")}</Badge>
          <RemoveFavoriteButton productId={item.productId} title={t("unavailablePiece")} />
        </div>
      </div>
    );
  }

  // a fallback title keeps its own language for screen readers
  const lang = product.locale !== locale ? product.locale : undefined;
  return (
    <div className="flex gap-4 py-5 sb:gap-6">
      <Link href={productHref(product.slug)} tabIndex={-1} aria-hidden className="shrink-0">
        <CartItemImage image={product.image} alt="" sizes={IMAGE_SIZES} className="size-24 sb:size-32" />
      </Link>
      <div className="flex min-w-0 grow flex-col gap-3">
        <Link
          href={productHref(product.slug)}
          lang={lang}
          className="font-sans font-semibold break-words underline-offset-4 hover:text-accent-text hover:underline"
        >
          {product.title}
        </Link>
        {product.availability === "available" ? (
          <span className="font-sans text-lg text-accent-text">
            <Price usdMinor={product.listPrice.usdMinor} regularUsdMinor={product.listPrice.regularUsdMinor} from={product.listPrice.from} />
          </span>
        ) : (
          <Badge variant="outline">{tStatus(product.availability)}</Badge>
        )}
        <RemoveFavoriteButton productId={product.id} title={product.title} />
      </div>
    </div>
  );
}

async function EmptyFavorites() {
  const t = await getTranslations("product.favorites");
  return (
    <div className="flex flex-col items-start gap-5 py-10" data-testid="favorites-empty">
      <p className="text-lg">{t("empty")}</p>
      <p>{t("emptyHint")}</p>
      <Link href={SHOP_HREF} className={cn(buttonVariants())}>
        {t("continueShopping")}
      </Link>
    </div>
  );
}
