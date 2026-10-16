import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCachedCollections } from "@/lib/catalog/collections";
import type { ListingSort } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import type { CategoryEntry } from "./category-entries";
import { categoryHref, collectionHref, SHOP_HREF } from "./links";
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

type CategoryNavProps = {
  categories: CategoryEntry[];
  active: string | null;
  /** The collection whose page this is (#67), else null. */
  activeCollection: string | null;
  locale: Locale;
};

/** Desktop "Shop by": all products, the six categories and the published collections (#67). */
export async function CategoryNav({ categories, active, activeCollection, locale }: CategoryNavProps) {
  const t = await getTranslations("catalog");
  return (
    <nav aria-labelledby="shop-by" className="flex flex-col gap-3">
      <h2 id="shop-by" className="font-sans text-sm text-muted-foreground uppercase">
        {t("filterShopBy")}
      </h2>
      <ul className="flex flex-col gap-2">
        <li>
          <Link
            href={SHOP_HREF}
            aria-current={active === null && activeCollection === null ? "page" : undefined}
            className={LINK}
          >
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
      {/* the shell stays static: the collections stream in (a cached read without a stale window) */}
      <Suspense>
        <CollectionNav active={activeCollection} locale={locale} />
      </Suspense>
    </nav>
  );
}

/** The published collections under the categories; nothing at all while there are none. */
async function CollectionNav({ active, locale }: { active: string | null; locale: Locale }) {
  const [collections, t] = await Promise.all([getCachedCollections(locale), getTranslations("catalog")]);
  if (!collections.ok || collections.data.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="collection-nav">
      <h3 className="font-sans text-sm text-muted-foreground uppercase">{t("collections.title")}</h3>
      <ul className="flex flex-col gap-2">
        {collections.data.map((collection) => (
          <li key={collection.id}>
            <Link
              href={collectionHref(collection.slug)}
              lang={collection.locale !== locale ? collection.locale : undefined}
              aria-current={active === collection.id ? "page" : undefined}
              className={LINK}
            >
              {collection.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
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
