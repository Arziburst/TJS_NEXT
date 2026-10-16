import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { cache, Suspense } from "react";
import { SearchForm } from "@/components/search/search-form";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCachedFacets, getCachedListingPage, getCachedTaxonomyTerms } from "@/lib/catalog/cache";
import type { CategorySlug } from "@/lib/catalog/categories";
import type { Facets, ListingFilters, TaxonomyTerm } from "@/lib/catalog/types";
import { getCategoryEntries, type CategoryEntry } from "./category-entries";
import type { FilterGroupView, FilterPanelProps } from "./filter-panel";
import { FilterPanel } from "./filter-panel";
import { FilterSheet } from "./filter-sheet";
import { categoryHref, SEARCH_HREF, SHOP_HREF } from "./links";
import { listingFiltersFor, type PriceContext } from "./listing";
import { MobileFilters, type FilterOption } from "./mobile-filters";
import { Pagination } from "./pagination";
import { ProductCard } from "./product-card";
import { CategoryNav, SortNav, sortOptions } from "./shop-nav";
import {
  activeFilterCount,
  AVAILABILITY_FILTERS,
  availabilityParam,
  firstPage,
  listingQuery,
  NO_FILTERS,
  PAGE_SIZE,
  parseListingState,
  sortParam,
  type ListingContext,
  type ListingState,
  type SearchParams,
} from "./shop-query";

type ShopViewProps = {
  locale: Locale;
  /** The category from the URL, null for all products (and for search); read inside the Suspense boundary. */
  slug: Promise<CategorySlug | null>;
  searchParams: Promise<SearchParams>;
  /** The shop's listings (default) or the search results. */
  context?: ListingContext;
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

/**
 * The catalog page: categories, sort and filters on the left from 1024px, the product grid with its pager.
 * The search results page is the same view with its query (`context: "search"`).
 */
export function ShopView({ context = "shop", ...props }: ShopViewProps) {
  return (
    <main className="page-container flex-1 py-8 sb:py-12">
      <Suspense fallback={<GridSkeleton />}>
        <ShopBody {...props} context={context} />
      </Suspense>
    </main>
  );
}

type BodyProps = Required<ShopViewProps>;

// Params and messages only (the category list): prerendered per category, no database read in the shell.
async function ShopBody({ locale, slug: slugParam, searchParams, context }: BodyProps) {
  const [slug, categories, t] = await Promise.all([slugParam, getCategoryEntries(locale), getTranslations("catalog")]);
  const active = slug ? (categories.find((c) => c.slug === slug) ?? null) : null;
  const pathname = context === "search" ? SEARCH_HREF : slug ? categoryHref(slug) : SHOP_HREF;
  const listing = { locale, category: active, pathname, searchParams, context };

  return (
    <div className="sb:grid sb:grid-cols-[minmax(180px,240px)_1fr] sb:gap-12">
      <aside className="hidden sb:flex sb:flex-col sb:gap-10">
        {context === "shop" && <CategoryNav categories={categories} active={slug} />}
        <Suspense>
          <Sidebar {...listing} />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-col gap-6 sb:gap-8">
        <h1 className="text-center font-display text-4xl uppercase sb:text-left sb:text-5xl">
          {context === "search" ? t("search.title") : (active?.name ?? t("title"))}
        </h1>
        <Suspense fallback={<GridSkeleton />}>
          <ShopResults {...listing} categories={categories} />
        </Suspense>
      </div>
    </div>
  );
}

type ListingProps = {
  locale: Locale;
  category: CategoryEntry | null;
  pathname: string;
  searchParams: Promise<SearchParams>;
  context: ListingContext;
};

type Listing = {
  state: ListingState;
  filters: ListingFilters;
  price: PriceContext;
  terms: TaxonomyTerm[];
  facets: Facets | null;
};

// Request time: the URL state, its database filters, the lists and the counts. Once per request: the sidebar
// and the results both need it (the reads behind it are shared cache entries).
const loadListing = cache(
  async (locale: Locale, categorySlug: string | null, context: ListingContext, params: SearchParams): Promise<Listing> => {
    const state = parseListingState(params, context);
    const { filters, price } = await listingFiltersFor(locale, categorySlug, state);
    // the search page without a query lists nothing, so it counts nothing
    const listed = context === "shop" || filters.terms.length > 0;
    const [terms, facets] = await Promise.all([
      getCachedTaxonomyTerms(locale),
      listed ? getCachedFacets(filters) : null,
    ]);
    return { state, filters, price, terms: terms.ok ? terms.data : [], facets: facets?.ok ? facets.data : null };
  },
);

async function listingOf({ locale, category, searchParams, context }: ListingProps): Promise<Listing> {
  return loadListing(locale, category?.slug ?? null, context, await searchParams);
}

/** The panel's lists: an option is shown when products have it under the other filters, or when it is ticked. */
async function filterPanelProps(listing: Listing, locale: Locale, pathname: string): Promise<Omit<FilterPanelProps, "idPrefix" | "autoApply">> {
  const t = await getTranslations("catalog.filters");
  const { state, terms, facets, price } = listing;
  const { filters } = state;

  const termGroup = (kind: "material" | "colour", selected: string[]): FilterGroupView => ({
    param: kind,
    legend: t(kind),
    options: terms
      .filter((term) => term.kind === kind)
      .map((term) => ({
        value: term.slug,
        label: term.name,
        count: facets?.[kind][term.slug] ?? 0,
        checked: selected.includes(term.slug),
      }))
      .filter((option) => option.count > 0 || option.checked),
  });
  const availability: FilterGroupView = {
    param: "availability",
    legend: t("availability"),
    options: AVAILABILITY_FILTERS.map((filter) => ({
      value: availabilityParam(filter),
      label: t(`availabilityOptions.${filter}`),
      count: facets?.availability[filter] ?? 0,
      checked: filters.availability.includes(filter),
    })).filter((option) => option.count > 0 || option.checked),
  };

  return {
    action: getPathname({ href: pathname, locale }),
    pathname,
    base: listingQuery(firstPage({ ...state, filters: NO_FILTERS })),
    groups: [termGroup("material", filters.materials), termGroup("colour", filters.colours), availability].filter(
      (group) => group.options.length > 0,
    ),
    price: {
      legend: t("price", { currency: price.currency }),
      currency: price.currency,
      min: filters.price.min ?? "",
      max: filters.price.max ?? "",
      minLabel: t("priceMin"),
      maxLabel: t("priceMax"),
      notice: price.applied ? null : t("priceUnavailable"),
    },
    applyLabel: t("apply"),
  };
}

async function Sidebar(props: ListingProps) {
  const listing = await listingOf(props);
  const [panel, t] = await Promise.all([filterPanelProps(listing, props.locale, props.pathname), getTranslations("catalog.filters")]);
  return (
    <>
      <SortNav pathname={props.pathname} state={listing.state} />
      {(props.context === "shop" || listing.filters.terms.length > 0) && (
        <section aria-labelledby="filters-title" className="flex flex-col gap-3">
          <h2 id="filters-title" className="sr-only">
            {t("title")}
          </h2>
          <FilterPanel {...panel} idPrefix="desktop" autoApply />
          <ClearFilters pathname={props.pathname} state={listing.state} />
        </section>
      )}
    </>
  );
}

async function ClearFilters({ pathname, state }: { pathname: string; state: ListingState }) {
  if (activeFilterCount(state.filters) === 0) return null;
  const t = await getTranslations("catalog.filters");
  return (
    <Link
      href={{ pathname, query: listingQuery(firstPage(state, { filters: NO_FILTERS })) }}
      scroll={false}
      className="move-underline self-start font-sans text-sm font-semibold"
    >
      {t("clear")}
    </Link>
  );
}

// Request time: reads the URL state, then the cached listing pages from..page.
async function ShopResults(props: ListingProps & { categories: CategoryEntry[] }) {
  const { locale, category, categories, pathname, context } = props;
  const listing = await listingOf(props);
  const { state, filters: dbFilters } = listing;
  const { query } = state;
  const [t, messages] = await Promise.all([getTranslations("catalog"), getMessages()]);

  const searchBox =
    context === "search" ? <SearchForm id="search-page-input" defaultValue={state.q} className="w-full max-w-[540px]" /> : null;
  // the search page without a query: only the box and a hint
  if (context === "search" && dbFilters.terms.length === 0) {
    return (
      <>
        {searchBox}
        <p className="py-16 text-center font-sans" data-testid="search-prompt">
          {t("search.prompt")}
        </p>
      </>
    );
  }

  const pages: number[] = [];
  for (let p = query.from; p <= query.page; p++) pages.push(p);
  const results = await Promise.all(pages.map((page) => getCachedListingPage(dbFilters, query.sort, page, PAGE_SIZE)));

  const panel = await filterPanelProps(listing, locale, pathname);
  const filterCount = activeFilterCount(state.filters);
  const sheet = (
    <>
      <FilterSheet
        {...panel}
        applyLabel={t("filters.showResults")}
        openLabel={t("filters.open", { count: filterCount })}
        title={t("filters.title")}
        closeLabel={t("filters.close")}
      />
      <ClearFilters pathname={pathname} state={state} />
    </>
  );
  const restart = (changes: Parameters<typeof firstPage>[1]) => listingQuery(firstPage(state, changes));
  const filters = (
    <MobileFilters
      category={
        context === "shop"
          ? {
              label: t("filterShopBy"),
              value: category?.slug ?? "",
              options: [
                { value: "", label: t("categories.all"), href: { pathname: SHOP_HREF, query: restart({}) } },
                ...categories.map((c) => ({ value: c.slug, label: c.name, href: { pathname: categoryHref(c.slug), query: restart({}) } })),
              ],
            }
          : undefined
      }
      sortLabel={t("filterBy")}
      sort={sortParam(query.sort) ?? "newest"}
      sorts={sortOptions(context).map(
        ({ sort, labelKey }): FilterOption => ({
          value: sortParam(sort) ?? "newest",
          label: t(`sort.${labelKey}`),
          href: { pathname, query: restart({ query: { ...query, sort } }) },
        }),
      )}
      filters={sheet}
    />
  );

  const failed = results.find((r) => !r.ok);
  if (failed || results.length === 0) {
    return (
      <>
        {searchBox}
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
      {searchBox}
      {/* without results the empty state says it */}
      {context === "search" && total > 0 && (
        <p role="status" className="font-sans text-sm" data-testid="search-summary">
          {t("search.found", { count: total, query: state.q })}
        </p>
      )}
      {filters}
      {items.length === 0 ? (
        <EmptyState pathname={pathname} state={state} total={total} />
      ) : (
        <>
          {/* the cards' hearts are client islands: only their texts go to the browser */}
          <NextIntlClientProvider messages={{ product: { favorites: messages.product.favorites } }}>
            <ul className={GRID} data-testid="product-grid">
              {items.map((product, index) => (
                <li key={product.id}>
                  <ProductCard
                    product={product}
                    eager={index < EAGER_CARDS}
                    highlight={context === "search" ? dbFilters.terms : undefined}
                  />
                </li>
              ))}
            </ul>
          </NextIntlClientProvider>
          <Pagination pathname={pathname} state={state} total={total} />
        </>
      )}
    </>
  );
}

async function EmptyState({ pathname, state, total }: { pathname: string; state: ListingState; total: number }) {
  const [t, tCommon] = await Promise.all([getTranslations("catalog"), getTranslations("common")]);
  // a page past the end of a non-empty listing links back to its first page
  const pastTheEnd = total > 0;
  const filtered = activeFilterCount(state.filters) > 0;

  let message = tCommon("noData");
  let link: { href: Parameters<typeof Link>[0]["href"]; label: string } | null = null;
  if (pastTheEnd) {
    link = { href: { pathname, query: listingQuery(firstPage(state)) }, label: t("pagination.first") };
  } else if (filtered) {
    message = t("filters.noMatch");
    link = { href: { pathname, query: listingQuery(firstPage(state, { filters: NO_FILTERS })) }, label: t("filters.clear") };
  } else if (state.context === "search") {
    message = t("search.noResults", { query: state.q });
    link = { href: SHOP_HREF, label: t("search.browseShop") };
  } else if (pathname !== SHOP_HREF) {
    link = { href: SHOP_HREF, label: t("categories.all") };
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center font-sans" data-testid="empty-state">
      <p>{message}</p>
      {state.context === "search" && !pastTheEnd && !filtered && <p className="text-sm">{t("search.noResultsHint")}</p>}
      {link && (
        <Link href={link.href} className="move-underline font-semibold">
          {link.label}
        </Link>
      )}
    </div>
  );
}

