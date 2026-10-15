import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteProduct, saveProduct } from "@/app/[locale]/admin/actions";
import {
  createImageUpload,
  deleteProductImage,
  finishImageUpload,
  reorderProductImages,
  saveProductImageAlts,
} from "@/app/[locale]/admin/image-actions";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { DeleteProductButton } from "@/components/admin/delete-product-button";
import { ADMIN_PRODUCTS_HREF, editProductHref } from "@/components/admin/paths";
import { ProductForm } from "@/components/admin/product-form";
import { ProductImages } from "@/components/admin/product-images";
import { productHref } from "@/components/catalog/links";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { routing, type Locale } from "@/i18n/routing";
import { getAdminProduct, type AdminProduct } from "@/lib/admin/products";
import { MAX_IMAGE_BYTES } from "@/lib/images/encode";
import { getAdmin, requireAdmin } from "@/lib/auth/session";
import { getCachedCategories } from "@/lib/catalog/cache";
import { productSlugFor } from "@/lib/catalog/product-path";

// No product is known at build time; one id no product has lets the build prerender the route's shell (the
// shared header reads the pathname), every real id renders at request time behind the admin check.
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

export function generateStaticParams() {
  return [{ id: UNKNOWN_ID }];
}

function titleOf(product: AdminProduct, locale: Locale): string | null {
  return (product.translations.find((t) => t.locale === locale) ?? product.translations[0])?.title ?? null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/products/[id]">): Promise<Metadata> {
  if (!(await getAdmin())) return {};
  const { locale, id } = await params;
  const [t, product] = await Promise.all([getTranslations("admin.form"), getAdminProduct(id)]);
  const title = product.ok && hasLocale(routing.locales, locale) ? titleOf(product.data, locale) : null;
  return { title: title ? t("editTitleOf", { title }) : t("editTitle") };
}

export default function EditProductPage(props: PageProps<"/[locale]/admin/products/[id]">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <EditProduct {...props} />
    </Suspense>
  );
}

async function EditProduct({ params }: PageProps<"/[locale]/admin/products/[id]">) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${editProductHref(id)}`);
  const [t, categories, product] = await Promise.all([
    getTranslations("admin.form"),
    getCachedCategories(locale),
    getAdminProduct(id),
  ]);
  if (!product.ok && product.reason === "notFound") notFound();

  const title = product.ok ? titleOf(product.data, locale) : null;
  // the storefront URL in this locale (or the fallback's), only for a published product
  const shopSlug =
    product.ok && product.data.status === "published" ? productSlugFor(product.data.translations, locale) : null;

  return (
    <AdminShell>
      <div className="grid gap-5">
        <header className="grid gap-2">
          <Link href={ADMIN_PRODUCTS_HREF} className="inline-flex min-h-11 items-center gap-1.5 justify-self-start font-sans text-sm underline-offset-4 hover:text-accent-text hover:underline">
            <ArrowLeftIcon aria-hidden className="size-4" />
            {t("back")}
          </Link>
          <h1 className="text-xl font-bold tracking-[0.2em] break-words uppercase sb:text-2xl">{title ?? t("editTitle")}</h1>
          {shopSlug && (
            <Link
              href={productHref(shopSlug)}
              className={cn(buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 justify-self-start" }))}>
              <ExternalLinkIcon aria-hidden />
              {t("viewInShop")}
            </Link>
          )}
        </header>
        {product.ok && categories.ok ? (
          <ProductForm
            product={product.data}
            categories={categories.data.map((c) => ({ id: c.id, name: c.name }))}
            saveProduct={saveProduct}
            photos={
              <ProductImages
                // its actions refresh() the page; the re-sent element lands among the form's children, which React
                // then checks for keys (dev warning without one)
                key="photos"
                productId={product.data.id}
                images={product.data.images}
                altDefaults={product.data.imageAltDefaults}
                maxBytes={MAX_IMAGE_BYTES}
                actions={{ createImageUpload, finishImageUpload, deleteProductImage, reorderProductImages, saveProductImageAlts }}
              />
            }
            deleteButton={<DeleteProductButton productId={product.data.id} title={title ?? ""} deleteProduct={deleteProduct} />}
          />
        ) : (
          <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
            {t("loadError")}
          </p>
        )}
      </div>
    </AdminShell>
  );
}
