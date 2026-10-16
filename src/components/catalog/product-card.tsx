import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { FavoriteToggle } from "@/components/favorites/favorite-toggle";
import { Price } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { ListedProduct } from "@/lib/catalog/cache";
import type { ProductImage } from "@/lib/catalog/types";
import { highlightSegments } from "@/lib/search/query";
import { cn } from "@/lib/utils";
import { PRODUCT_PREFETCH, productHref } from "./links";

// the card box: 164px wide, 200px from `sb` (64rem)
const IMAGE_SIZES = "(min-width: 64rem) 200px, 164px";

type CardImageProps = {
  image: ProductImage;
  /** "high": a first-row photo (the LCP candidate), loaded at once; "low": the hidden hover photo. */
  priority?: "high" | "low";
  className?: string;
};

function CardImage({ image, priority, className }: CardImageProps) {
  return (
    <Image
      src={image.url}
      alt={image.alt}
      fill
      sizes={IMAGE_SIZES}
      quality={75}
      loading={priority === "high" ? "eager" : "lazy"}
      fetchPriority={priority}
      placeholder={image.blurDataUrl ? "blur" : "empty"}
      blurDataURL={image.blurDataUrl ?? undefined}
      className={cn("object-cover transition-opacity duration-500", className)}
    />
  );
}

type ProductCardProps = {
  product: ListedProduct;
  eager?: boolean;
  /** Search results: the words whose matches the title marks. */
  highlight?: readonly string[];
};

/** A catalog tile: the first photo cross-fades to the second on hover, the "new" badge for 7 days (D9). */
export async function ProductCard({ product, eager = false, highlight }: ProductCardProps) {
  const t = await getTranslations("catalog");
  const [first, second] = product.images;

  return (
    // the heart sits over the photo next to the link, never inside it (a button in a link is not allowed)
    <div className="relative w-[164px] sb:w-[200px]">
      <Link
        href={productHref(product.translation.slug)}
        prefetch={PRODUCT_PREFETCH}
        className="group flex w-full flex-col gap-2"
        data-testid="product-card"
      >
        {/* a fixed box, so images never shift the layout */}
        <span className="relative block h-[154px] w-full overflow-hidden rounded bg-muted sb:h-[200px]">
          {first && (
            <CardImage
              image={first}
              priority={eager ? "high" : undefined}
              className={cn(second && "group-hover:opacity-0 group-focus-visible:opacity-0")}
            />
          )}
          {/* hidden until hover: lazy, behind every visible photo even in the first row, no placeholder */}
          {second && (
            <CardImage
              image={{ ...second, alt: "", blurDataUrl: null }}
              priority="low"
              className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          )}
          {product.isNew && (
            <Badge variant="accent" className="absolute top-2 left-2" data-testid="new-badge">
              {t("newBadge")}
            </Badge>
          )}
        </span>
        <span className="font-sans text-[15px] leading-snug transition-colors group-hover:text-accent-text">
          {highlight && highlight.length > 0
            ? highlightSegments(product.translation.title, highlight).map((segment, index) =>
                segment.match ? (
                  <mark key={index} className="bg-transparent font-semibold text-accent-text">
                    {segment.text}
                  </mark>
                ) : (
                  segment.text
                ),
              )
            : product.translation.title}
        </span>
        {/* a line of its own: the streamed price and its placeholder are then the same height (#57) */}
        <span className="font-sans text-[15px] text-accent-text">
          <Price usdMinor={product.priceUsdMinor} />
        </span>
      </Link>
      <FavoriteToggle productId={product.id} title={product.translation.title} className="absolute top-0 right-0" />
    </div>
  );
}
