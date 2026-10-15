import Image from "next/image";
import type { CartProduct } from "@/lib/cart";
import { cn } from "@/lib/utils";

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
