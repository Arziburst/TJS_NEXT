import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Price } from "@/components/price";
import { categoryHref, productHref } from "@/components/catalog/links";
import { ProductDetails } from "@/components/product/product-details";
import { ProductSkeleton } from "@/components/product/product-skeleton";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { getMetadataBase } from "@/i18n/metadata";
import { getPathname, redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getProductPage, getProductSlugs } from "@/lib/catalog/product";
import { variantSku } from "@/lib/catalog/variants";
import { getJsonLdPrice } from "@/lib/money/prices";
import {
  productAlternates,
  productJsonLd,
  productOpenGraphLocales,
  productPath,
  serializeJsonLd,
} from "@/lib/seo/product";
import { translationRobots } from "@/lib/seo/indexing";

/*
 * Unknown and unpublished slugs answer 404 in the proxy (src/proxy/product-not-found.ts) before this page
 * renders: a notFound() thrown here comes after the static shell (status 200) and only helps client
 * navigations. A slug of another locale redirects to this locale's slug, in the proxy and here.
 */

// A slug no product can have: the build still validates the route when it cannot read the catalog.
const UNAVAILABLE_SLUG = "-";

// A page whose entry an admin save just expired renders anew on its next request, never from the build's
// generic fallback shell (docs/standards.md §3, "No build-time shell after an admin save")
export const unstable_paramMatching = { slug: "blocking" };

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = hasLocale(routing.locales, params.locale) ? params.locale : routing.defaultLocale;
  const slugs = await getProductSlugs(locale);
  if (!slugs.ok || slugs.data.length === 0) return [{ slug: UNAVAILABLE_SLUG }];
  return slugs.data.map((slug) => ({ slug }));
}

async function readParams(params: PageProps<"/[locale]/product/[slug]">["params"]) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return { locale, slug };
}

export async function generateMetadata({ params }: PageProps<"/[locale]/product/[slug]">): Promise<Metadata> {
  const { locale, slug } = await readParams(params);
  const page = await getProductPage(locale, slug);
  if (page.kind !== "ok") return {};
  const { product } = page;
  const { translation } = product;
  const description = translation.metaDescription ?? translation.description ?? undefined;

  return {
    title: translation.metaTitle ?? translation.title,
    description,
    alternates: productAlternates(page.translations, translation),
    // an unreviewed machine translation is shown, but not indexed (src/lib/seo/indexing.ts)
    robots: translationRobots(translation),
    openGraph: {
      title: translation.metaTitle ?? translation.title,
      description,
      url: productPath(translation.locale, translation.slug),
      ...productOpenGraphLocales(page.translations, translation.locale),
      // og:image: ./opengraph-image.tsx (the main photo with the title and the price)
    },
  };
}

export default function ProductPage({ params }: PageProps<"/[locale]/product/[slug]">) {
  return (
    <main className="page-container py-6 sb:py-10">
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent params={params} />
      </Suspense>
    </main>
  );
}

async function ProductContent({ params }: { params: PageProps<"/[locale]/product/[slug]">["params"] }) {
  const { locale, slug } = await readParams(params);
  const page = await getProductPage(locale, slug);
  if (page.kind === "notFound") notFound();
  if (page.kind === "redirect") redirect({ href: productHref(page.slug), locale });
  if (page.kind !== "ok") throw new Error(`product page: ${page.kind}`);

  return (
    <>
      {/* only the canonical page states the product: a fallback page (canonical = the en page) would give
          the same URL a second Offer in another currency */}
      {!page.product.translation.isFallback && <ProductJsonLd locale={locale} page={page} />}
      <ProductDetails
        product={page.product}
        categoryName={page.categoryName}
        price={(usdMinor, from) => <Price usdMinor={usdMinor} from={from} />}
      />
      <RecentlyViewed currentId={page.product.id} />
    </>
  );
}

async function ProductJsonLd({ locale, page }: { locale: Locale; page: Extract<Awaited<ReturnType<typeof getProductPage>>, { kind: "ok" }> }) {
  const { product } = page;
  const { translation } = product;
  const [tCommon, price, variantPrices] = await Promise.all([
    getTranslations("common"),
    getJsonLdPrice(product.priceUsdMinor, locale),
    Promise.all(product.variants.map((variant) => getJsonLdPrice(variant.priceUsdMinor, locale))),
  ]);
  const base = getMetadataBase();
  const absolute = (path: string) => new URL(path, base).href;
  const url = absolute(productPath(translation.locale, translation.slug));

  const breadcrumbs = [{ name: tCommon("brand"), url: absolute(getPathname({ href: "/", locale })) }];
  if (page.categoryName) {
    breadcrumbs.push({
      name: page.categoryName,
      url: absolute(getPathname({ href: categoryHref(product.category.slug), locale })),
    });
  }
  breadcrumbs.push({ name: translation.title, url });

  const data = productJsonLd({
    url,
    name: translation.title,
    description: translation.description,
    images: product.images.map((image) => image.url),
    sku: product.sku,
    brand: tCommon("brand"),
    fulfillment: product.fulfillment,
    availability: product.availability,
    price,
    variants: product.variants.map((variant, index) => ({
      name: variant.label,
      sku: variantSku(product.sku, variant.skuSuffix),
      price: variantPrices[index] ?? null,
      available: variant.available,
    })),
    breadcrumbs,
  });

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
