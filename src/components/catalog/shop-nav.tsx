import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ListingSort } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import type { CategoryEntry } from "./category-entries";
import { categoryHref, SHOP_HREF } from "./links";
import { firstPage, listingQuery, sortsOf, type ListingContext, type ListingState } from "./shop-query";

const SORT_LABELS = {
  relevance: "relevance",
  newest: "newest",
  price_asc: "priceAsc",
  price_desc: "priceDesc",
  position: "featured",
} as const satisfies Record<ListingSort, string>;

/** The orders of a listing with their message keys (catalog.sort.*): relevance first for search results. */
export function sortOptions(context: ListingContext) {
  return sortsOf(context).map((sort) => ({ sort, labelKey: SORT_LABELS[sort] }));
}

const LINK = "move-underline font-sans text-sm font-semibold tracking-[1.6px] aria-[current=page]:text-accent-text";

/** Desktop "Shop by": all products and the six categories. */
export async function CategoryNav({ categories, active }: { categories: CategoryEntry[]; active: string | null }) {
  const t = await getTranslations("catalog");
  return (
    <nav aria-labelledby="shop-by" className="flex flex-col gap-3">
      <h2 id="shop-by" className="font-sans text-sm text-muted-foreground uppercase">
        {t("filterShopBy")}
      </h2>
      <ul className="flex flex-col gap-2">
        <li>
          <Link href={SHOP_HREF} aria-current={active === null ? "page" : undefined} className={LINK}>
            {t("categories.all")}
          </Link>
        </li>
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={categoryHref(category.slug)}
              aria-current={active === category.slug ? "page" : undefined}
              className={LINK}
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Desktop "Filter by": the sort orders; choosing one keeps the search and filters and starts again at page 1. */
export async function SortNav({ pathname, state }: { pathname: string; state: ListingState }) {
  const t = await getTranslations("catalog");
  return (
    <nav aria-labelledby="sort-by" className="flex flex-col gap-3">
      <h2 id="sort-by" className="font-sans text-sm text-muted-foreground uppercase">
        {t("filterBy")}
      </h2>
      <ul className="flex flex-col gap-2">
        {sortOptions(state.context).map(({ sort, labelKey }) => (
          <li key={sort}>
            <Link
              href={{ pathname, query: listingQuery(firstPage(state, { query: { ...state.query, sort } })) }}
              aria-current={sort === state.query.sort ? "true" : undefined}
              className={cn(LINK, "aria-[current=true]:text-accent-text")}
            >
              {t(`sort.${labelKey}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
