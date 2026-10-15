import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveProduct } from "@/app/[locale]/admin/actions";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { NEW_PRODUCT_HREF } from "@/components/admin/paths";
import { ProductForm } from "@/components/admin/product-form";
import { ProductTermsFields } from "@/components/admin/product-terms-fields";
import { listAdminTerms } from "@/lib/admin/taxonomy";
import { routing } from "@/i18n/routing";
import { getAdmin, requireAdmin } from "@/lib/auth/session";
import { getCachedCategories } from "@/lib/catalog/cache";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getAdmin())) return {};
  const t = await getTranslations("admin.form");
  return { title: t("newTitle") };
}

export default function NewProductPage(props: PageProps<"/[locale]/admin/products/new">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <NewProduct {...props} />
    </Suspense>
  );
}

async function NewProduct({ params }: PageProps<"/[locale]/admin/products/new">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${NEW_PRODUCT_HREF}`);
  const [t, categories, terms] = await Promise.all([
    getTranslations("admin.form"),
    getCachedCategories(locale),
    listAdminTerms(locale),
  ]);

  return (
    <AdminShell>
      <div className="grid gap-5">
        <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{t("newTitle")}</h1>
        {categories.ok ? (
          <ProductForm
            product={null}
            categories={categories.data.map((c) => ({ id: c.id, name: c.name }))}
            saveProduct={saveProduct}
            taxonomy={<ProductTermsFields terms={terms.ok ? terms.data : null} selected={[]} />}
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
