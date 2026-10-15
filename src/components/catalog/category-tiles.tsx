import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CATEGORY_IMAGES } from "./category-images";
import type { CategoryEntry } from "./category-entries";
import { categoryHref } from "./links";

// Zig-zag from 768px: two tiles share a row (left, right), every third tile has a row of its own.
const PLACEMENT = ["md:justify-self-start", "md:justify-self-end md:after:hidden", "md:col-span-2 md:justify-self-center"];

function counter(index: number): string {
  return `(${String(index + 1).padStart(2, "0")})`;
}

/** The home grid: one link per category with its photo, name and counter. */
export function CategoryTiles({ categories }: { categories: CategoryEntry[] }) {
  return (
    <ul className="grid grid-cols-1 gap-y-6 md:grid-cols-2 sb:gap-y-8">
      {categories.map((category, index) => (
        <li
          key={category.slug}
          className={cn(
            // a full-bleed 2px rule under each row
            "relative pb-6 after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-[200vw] after:-translate-x-1/2 after:bg-separator sb:pb-8",
            PLACEMENT[index % 3],
          )}
        >
          <Link
            href={categoryHref(category.slug)}
            className="group inline-flex items-center gap-4 sb:gap-6"
            data-testid="category-tile"
          >
            <span className="relative aspect-[10/8] w-[60px] shrink-0 overflow-hidden rounded sb:w-[100px]">
              <Image
                src={CATEGORY_IMAGES[category.slug]}
                alt=""
                fill
                sizes="(min-width: 1024px) 100px, 60px"
                placeholder="blur"
                className="object-cover transition duration-500 group-hover:brightness-110 group-focus-visible:brightness-110"
              />
            </span>
            <span
              className={cn(
                "font-display text-[40px] leading-[54px] uppercase max-[420px]:text-3xl max-[350px]:text-xl",
                // gradient text on hover: coral into brown
                "bg-[linear-gradient(96deg,var(--color-tjs-coral)_3.15%,var(--color-tjs-brown)_86.85%)] bg-clip-text transition-colors duration-1000 ease-out group-hover:text-transparent group-focus-visible:text-transparent",
              )}
            >
              {category.name}
            </span>
            <span className="self-start font-sans text-sm text-accent">{counter(index)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
