import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CartItemImage } from "@/components/cart/cart-item-image";
import { productHref } from "@/components/catalog/links";
import { Price } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getCartProducts } from "@/lib/cart/products";
import { readRecentlyViewed } from "@/lib/favorites/recently-viewed";
import { RecordView } from "./record-view";

// 128px boxes, 160px from `sb` (64rem)
const IMAGE_SIZES = "(min-width: 64rem) 160px, 128px";

/*
 * The product page's "recently viewed" strip: the pieces of the visitor's cookie, newest first, without the
 * current one and only those still published (sold ones say so). The cookie is request-time data, so the strip
 * streams in below the cached product; this page's view is recorded in the browser for the next page.
 */
export function RecentlyViewed({ currentId }: { currentId: string }) {
  return (
    <>
      <RecordView productId={currentId} />
      <Suspense>
        <RecentlyViewedStrip currentId={currentId} />
      </Suspense>
    </>
  );
}

async function RecentlyViewedStrip({ currentId }: { currentId: string }) {
  const [viewed, requested, t, tStatus] = await Promise.all([
    readRecentlyViewed(),
    getLocale(),
    getTranslations("product.recentlyViewed"),
    getTranslations("product.page"),
  ]);
  const ids = viewed.filter((id) => id !== currentId);
  if (ids.length === 0) return null;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const read = await getCartProducts(ids, locale);
  // a failed read leaves the strip out: it is a convenience, the product page stands without it
  if (!read.ok) return null;
  const products = ids.flatMap((id) => read.products.get(id) ?? []);
  if (products.length === 0) return null;

  return (
    <section aria-labelledby="recently-viewed-title" className="mt-14 flex flex-col gap-5 border-t border-hairline pt-8">
      <h2 id="recently-viewed-title" className="font-sans text-base font-semibold tracking-[0.2em] uppercase">
        {t("title")}
      </h2>
      <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sb:mx-0 sb:px-0" data-testid="recently-viewed">
        {products.map((product) => (
          <li key={product.id} className="w-32 shrink-0 sb:w-40">
            <Link
              href={productHref(product.slug)}
              lang={product.locale !== locale ? product.locale : undefined}
              className="group flex flex-col gap-2"
            >
              <CartItemImage image={product.image} alt="" sizes={IMAGE_SIZES} className="size-32 sb:size-40" />
              <span className="font-sans text-sm leading-snug break-words group-hover:text-accent-text">{product.title}</span>
              {product.availability === "available" ? (
                <span className="font-sans text-sm text-accent-text">
                  <Price usdMinor={product.listPrice.usdMinor} from={product.listPrice.from} />
                </span>
              ) : (
                <Badge variant="outline" className="self-start">
                  {tStatus(product.availability)}
                </Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
