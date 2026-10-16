"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Suspense, useRef, useState } from "react";
import type { ProductImage } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

// The rendered width: the full page width less its 16px gutters below `sb`; from `sb` on one of two grid
// columns (56px gutters, 56px gap) of the page container, which stops growing at 2000px.
const GALLERY_SIZES = "(min-width: 125rem) 916px, (min-width: 64rem) calc(50vw - 84px), calc(100vw - 32px)";

/*
 * One list of photos, laid out by CSS only: a horizontal scroll-snap slider below `sb` (with arrows and
 * dots) and the photos stacked one under another from `sb` on. The controls only scroll the list.
 */
export function ProductGallery({ images, className }: { images: ProductImage[]; className?: string }) {
  const t = useTranslations("product.page.gallery");
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  const [main, ...rest] = images;
  if (!main) {
    return (
      <div className={cn("flex aspect-square w-full items-center justify-center bg-muted text-sm", className)}>
        {t("empty")}
      </div>
    );
  }

  function show(index: number) {
    const list = listRef.current;
    if (!list) return;
    const target = Math.min(Math.max(index, 0), images.length - 1);
    list.scrollTo({ left: target * list.clientWidth, behavior: "smooth" });
  }

  function onScroll() {
    const list = listRef.current;
    if (list && list.clientWidth > 0) setActive(Math.round(list.scrollLeft / list.clientWidth));
  }

  const many = rest.length > 0;

  return (
    <section aria-label={t("label")} className={cn("relative", className)}>
      <ul
        ref={listRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] sb:flex-col sb:gap-12 sb:overflow-visible"
      >
        <GalleryPhoto image={main} main />
        {/*
         * The other photos in a boundary of their own: React moves a large finished boundary out of the shell
         * and reveals it at least 300 ms after the first paint; the main photo alone stays in the shell (#127,
         * docs/standards.md §3). Off screen in the slider; below the main photo from `sb` on.
         */}
        <Suspense>
          {rest.map((image) => (
            <GalleryPhoto key={image.id} image={image} />
          ))}
        </Suspense>
      </ul>

      {/* the slider controls stream with the other photos; the fallback keeps the dots' line */}
      {many && (
        <Suspense fallback={<div aria-hidden className="mt-3 h-6 sb:hidden" />}>
          <div className="sb:hidden">
            <button
              type="button"
              onClick={() => show(active - 1)}
              disabled={active === 0}
              aria-label={t("previous")}
              className="absolute top-1/2 left-2 flex size-11 -translate-y-1/2 items-center justify-center bg-primary text-primary-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
            >
              <ChevronLeft aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => show(active + 1)}
              disabled={active === images.length - 1}
              aria-label={t("next")}
              className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center bg-primary text-primary-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
            >
              <ChevronRight aria-hidden />
            </button>
            <ol className="mt-3 flex justify-center gap-1">
              {images.map((image, index) => (
                <li key={image.id}>
                  <button
                    type="button"
                    onClick={() => show(index)}
                    aria-label={t("goTo", { index: index + 1, count: images.length })}
                    aria-current={index === active ? "true" : undefined}
                    className="group flex size-6 items-center justify-center outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full bg-primary/30 transition-colors",
                        index === active && "bg-primary",
                      )}
                    />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </Suspense>
      )}
    </section>
  );
}

// the main photo is the page's LCP element on every viewport
function GalleryPhoto({ image, main = false }: { image: ProductImage; main?: boolean }) {
  return (
    <li className="w-full shrink-0 snap-center">
      <Image
        src={image.url}
        alt={image.alt}
        width={image.width}
        height={image.height}
        quality={85}
        preload={main}
        fetchPriority={main ? "high" : undefined}
        placeholder={image.blurDataUrl ? "blur" : "empty"}
        blurDataURL={image.blurDataUrl ?? undefined}
        sizes={GALLERY_SIZES}
        className="aspect-square max-h-[60vh] w-full object-cover sb:max-h-none sb:rounded-lg"
      />
    </li>
  );
}
