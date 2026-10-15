import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCachedListingPage } from "@/lib/catalog/cache";
import type { CategorySlug } from "@/lib/catalog/categories";
import { getCategoryEntries, type CategoryEntry } from "./category-entries";
import { categoryHref, SHOP_HREF } from "./links";
import { MobileFilters, type FilterOption } from "./mobile-filters";
import { Pagination } from "./pagination";
import { ProductCard } from "./product-card";
import { CategoryNav, SORTS, SortNav } from "./shop-nav";
import { PAGE_SIZE, parseShopQuery, sortParam, toQuery, type SearchParams, type ShopQuery } from "./shop-query";

type ShopViewProps = {
  locale: Locale;
  /** The category from the URL, null for all products; read inside the Suspense boundary. */
  slug: Promise<CategorySlug | null>;
  searchParams: Promise<SearchParams>;
};

// the first row is above the fold on desktop: its photos load at once (LCP)
const EAGER_CARDS = 4;

const GRID = "flex flex-wrap justify-center gap-[14px] sb:gap-5";

function CardSkeleton() {
  return (
    <li aria-hidden className="flex w-[164px] flex-col gap-2 sb:w-[200px]">
      <span className="block h-[154px] animate-pulse rounded bg-muted sb:h-[200px]" />
      <span className="block h-4 w-3/4 animate-pulse bg-muted" />
      <span className="block h-4 w-1/3 animate-pulse bg-muted" />
    </li>
  );
}

// a whole page of cards, as tall as the listing it stands for: a shorter one would show the footer, which
// the results then push out of view (#57)
function GridSkeleton() {
  return (
    <ul className={GRID}>
      {Array.from({ length: PAGE_SIZE }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </ul>
  );
}

/** The catalog page: categories and sort on the left from 1024px, the product grid with its pager. */
export function ShopView(props: ShopViewProps) {
  return (
    <main className="page-container flex-1 py-8 sb:py-12">
      <Suspense fallback={<GridSkeleton />}>
        <ShopBody {...props} />
      </Suspense>
    </main>
  );
}

// Params and messages only (the category list): prerendered per category, no database read in the shell.
async function ShopBody({ locale, slug: slugParam, searchParams }: ShopViewProps) {
  const [slug, categories, t] = await Promise.all([slugParam, getCategoryEntries(locale), getTranslations("catalog")]);
  const active = slug ? (categories.find((c) => c.slug === slug) ?? null) : null;
  const pathname = slug ? categoryHref(slug) : SHOP_HREF;

  return (
    <div className="sb:grid sb:grid-cols-[minmax(180px,240px)_1fr] sb:gap-12">
      <aside className="hidden sb:flex sb:flex-col sb:gap-10">
        <CategoryNav categories={categories} active={slug} />
        <Suspense>
          <SortNavFor pathname={pathname} searchParams={searchParams} />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-col gap-6 sb:gap-8">
        <h1 className="text-center font-display text-4xl uppercase sb:text-left sb:text-5xl">
          {active?.name ?? t("title")}
        </h1>
        <Suspense fallback={<GridSkeleton />}>
          <ShopResults
            locale={locale}
            category={active}
            categories={categories}
            pathname={pathname}
            searchParams={searchParams}
          />
        </Suspense>
      </div>
    </div>
  );
}

async function SortNavFor({ pathname, searchParams }: { pathname: string; searchParams: Promise<SearchParams> }) {
  const query = parseShopQuery(await searchParams);
  return <SortNav pathname={pathname} current={query.sort} />;
}

type ShopResultsProps = {
  locale: Locale;
  category: CategoryEntry | null;
  categories: CategoryEntry[];
  pathname: string;
  searchParams: Promise<SearchParams>;
};

// Request time: reads the URL state, then the cached listing pages from..page.
async function ShopResults({ locale, category, categories, pathname, searchParams }: ShopResultsProps) {
  const query = parseShopQuery(await searchParams);
  const t = await getTranslations("catalog");

  const pages: number[] = [];
  for (let p = query.from; p <= query.page; p++) pages.push(p);
  const results = await Promise.all(
    pages.map((page) => getCachedListingPage(locale, category?.slug ?? null, query.sort, page, PAGE_SIZE)),
  );

  const filters = (
    <MobileFilters
      categoryLabel={t("filterShopBy")}
      category={category?.slug ?? ""}
      categories={[
        { value: "", label: t("categories.all"), href: { pathname: SHOP_HREF, query: toQuery({ ...query, from: 1, page: 1 }) } },
        ...categories.map((c) => ({
          value: c.slug,
          label: c.name,
          href: { pathname: categoryHref(c.slug), query: toQuery({ ...query, from: 1, page: 1 }) },
        })),
      ]}
      sortLabel={t("filterBy")}
      sort={sortParam(query.sort) ?? "newest"}
      sorts={SORTS.map(
        ({ sort, labelKey }): FilterOption => ({
          value: sortParam(sort) ?? "newest",
          label: t(`sort.${labelKey}`),
          href: { pathname, query: toQuery({ sort, from: 1, page: 1 }) },
        }),
      )}
    />
  );

  const failed = results.find((r) => !r.ok);
  if (failed || results.length === 0) {
    return (
      <>
        {filters}
        <p role="alert" className="py-16 text-center font-sans">
          {t("loadError")}
        </p>
      </>
    );
  }

  const ok = results.flatMap((r) => (r.ok ? [r.data] : []));
  const items = ok.flatMap((r) => r.items);
  const total = ok.at(-1)?.total ?? 0;

  return (
    <>
      {filters}
      {items.length === 0 ? (
        <EmptyState pathname={pathname} query={query} total={total} />
      ) : (
        <>
          <ul className={GRID} data-testid="product-grid">
            {items.map((product, index) => (
              <li key={product.id}>
                <ProductCard product={product} eager={index < EAGER_CARDS} />
              </li>
            ))}
          </ul>
          <Pagination pathname={pathname} query={query} total={total} />
        </>
      )}
    </>
  );
}

async function EmptyState({ pathname, query, total }: { pathname: string; query: ShopQuery; total: number }) {
  const [t, tCommon] = await Promise.all([getTranslations("catalog"), getTranslations("common")]);
  // a page past the end of a non-empty listing links back to its first page
  const pastTheEnd = total > 0;
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center font-sans" data-testid="empty-state">
      <p>{tCommon("noData")}</p>
      {(pastTheEnd || pathname !== SHOP_HREF) && (
        <Link
          href={pastTheEnd ? { pathname, query: toQuery({ ...query, from: 1, page: 1 }) } : SHOP_HREF}
          className="move-underline font-semibold"
        >
          {pastTheEnd ? t("pagination.first") : t("categories.all")}
        </Link>
      )}
    </div>
  );
}
