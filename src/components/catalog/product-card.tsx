import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { ListedProduct } from "@/lib/catalog/cache";
import type { ProductImage } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { PRODUCT_PREFETCH, productHref } from "./links";
import { Price } from "./price";

const IMAGE_SIZES = "(min-width: 1024px) 200px, 164px";

function CardImage({ image, eager, className }: { image: ProductImage; eager?: boolean; className?: string }) {
  return (
    <Image
      src={image.url}
      alt={image.alt}
      fill
      sizes={IMAGE_SIZES}
      loading={eager ? "eager" : "lazy"}
      placeholder={image.blurDataUrl ? "blur" : "empty"}
      blurDataURL={image.blurDataUrl ?? undefined}
      className={cn("object-cover transition-opacity duration-500", className)}
    />
  );
}

/** A catalog tile: the first photo cross-fades to the second on hover, the "new" badge for 7 days (D9). */
export async function ProductCard({ product, eager = false }: { product: ListedProduct; eager?: boolean }) {
  const t = await getTranslations("catalog");
  const [first, second] = product.images;

  return (
    <Link
      href={productHref(product.translation.slug)}
      prefetch={PRODUCT_PREFETCH}
      className="group flex w-[164px] flex-col gap-2 sb:w-[200px]"
      data-testid="product-card"
    >
      {/* a fixed box, so images never shift the layout */}
      <span className="relative block h-[154px] w-full overflow-hidden rounded bg-muted sb:h-[200px]">
        {first && (
          <CardImage
            image={first}
            eager={eager}
            className={cn(second && "group-hover:opacity-0 group-focus-visible:opacity-0")}
          />
        )}
        {second && (
          <CardImage
            image={{ ...second, alt: "" }}
            className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
        {product.isNew && (
          <Badge variant="accent" className="absolute top-2 left-2" data-testid="new-badge">
            {t("newBadge")}
          </Badge>
        )}
      </span>
      <span className="font-sans text-[15px] leading-snug transition-colors group-hover:text-accent">
        {product.translation.title}
      </span>
      <Price usdMinor={product.priceUsdMinor} className="font-sans text-[15px] text-accent" />
    </Link>
  );
}
