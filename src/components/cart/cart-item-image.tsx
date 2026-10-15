import Image from "next/image";
import type { CartProduct } from "@/lib/cart";
import { cn } from "@/lib/utils";

/*
 * Product links in the cart are not prefetched. Every cart visitor carries a cookie, and with a cookie the
 * client's prefetch of a product page sometimes never finishes after a reload (Next 16.4.1; the product page
 * reads the catalog through "use cache"), which would keep the cart page from ever going network-idle. A
 * cart link is followed rarely; it loads on click.
 */
export const CART_PRODUCT_PREFETCH = false;

type CartItemImageProps = {
  image: CartProduct["image"];
  alt: string;
  /** The box's CSS width at every breakpoint, as an image `sizes`. */
  sizes: string;
  className?: string;
};

// A product photo in a box sized by the caller's CSS (so it never shifts the layout); an empty box without one.
export function CartItemImage({ image, alt, sizes, className }: CartItemImageProps) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded bg-muted", className)}>
      {image && (
        <Image
          src={image.url}
          alt={alt}
          fill
          sizes={sizes}
          quality={75}
          placeholder={image.blurDataUrl ? "blur" : "empty"}
          blurDataURL={image.blurDataUrl ?? undefined}
          className="object-cover"
        />
      )}
    </span>
  );
}
