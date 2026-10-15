"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRef, useState } from "react";
import type { ProductImage } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

/*
 * One list of photos, laid out by CSS only: a horizontal scroll-snap slider below `sb` (with arrows and
 * dots) and the photos stacked one under another from `sb` on. The controls only scroll the list.
 */
export function ProductGallery({ images, className }: { images: ProductImage[]; className?: string }) {
  const t = useTranslations("product.page.gallery");
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  if (images.length === 0) {
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

  const many = images.length > 1;

  return (
    <section aria-label={t("label")} className={cn("relative", className)}>
      <ul
        ref={listRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] sb:flex-col sb:gap-12 sb:overflow-visible"
      >
        {images.map((image, index) => (
          <li key={image.id} className="w-full shrink-0 snap-center">
            <Image
              src={image.url}
              alt={image.alt}
              width={image.width}
              height={image.height}
              // Storage serves the files as uploaded; resizing needs a decision on an image service
              unoptimized
              preload={index === 0}
              placeholder={image.blurDataUrl ? "blur" : "empty"}
              blurDataURL={image.blurDataUrl ?? undefined}
              sizes="(min-width: 64rem) 50vw, 100vw"
              className="aspect-square max-h-[60vh] w-full object-cover sb:max-h-none sb:rounded-lg"
            />
          </li>
        ))}
      </ul>

      {many && (
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
      )}
    </section>
  );
}
