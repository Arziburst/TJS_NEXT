import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { ADMIN_PRODUCTS_HREF, NEW_PRODUCT_HREF } from "@/components/admin/paths";
import { ProductList } from "@/components/admin/product-list";
import { inputClass, labelClass, selectClass } from "@/components/admin/styles";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { STATUSES, type ProductStatus } from "@/lib/admin/product-form";
import { listAdminProducts } from "@/lib/admin/products";
import { getAdmin, requireAdmin } from "@/lib/auth/session";
import { getCachedCategories } from "@/lib/catalog/cache";

export async function generateMetadata(): Promise<Metadata> {
  // nothing about the admin area for anyone else, not even its title
  if (!(await getAdmin())) return {};
  const t = await getTranslations("admin.list");
  return { title: t("title") };
}

function single(value: string | string[] | undefined): string | undefined {
  const text = typeof value === "string" ? value.trim() : undefined;
  return text ? text : undefined;
}

function statusOf(value: string | undefined): ProductStatus | undefined {
  return STATUSES.find((s) => s === value);
}

export default function AdminProductsPage(props: PageProps<"/[locale]/admin">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <AdminProducts {...props} />
    </Suspense>
  );
}

async function AdminProducts({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${ADMIN_PRODUCTS_HREF}`);

  const query = await searchParams;
  const filters = { query: single(query.q), categoryId: single(query.category), status: statusOf(single(query.status)) };
  const [t, tAdmin, categories, products] = await Promise.all([
    getTranslations("admin.list"),
    getTranslations("admin"),
    getCachedCategories(locale),
    listAdminProducts({ locale, ...filters }),
  ]);
  const categoryList = categories.ok ? categories.data : [];
  const filtered = filters.query !== undefined || filters.categoryId !== undefined || filters.status !== undefined;

  return (
    <AdminShell>
      <div className="grid gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{t("title")}</h1>
            {products.ok && (
              <p className="font-input text-sm" role="status">
                {t("count", { count: products.data.length })}
              </p>
            )}
          </div>
          {/* on a phone the bottom bar has it */}
          <div className="hidden sb:block">
            <Link href={NEW_PRODUCT_HREF} className={buttonVariants()}>
              <PlusIcon aria-hidden />
              {t("add")}
            </Link>
          </div>
        </header>

        <search>
          <form method="get" className="grid gap-3 border-2 border-hairline p-3 sb:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sb:items-end">
            <div className="grid gap-1.5">
              <label htmlFor="admin-search" className={labelClass}>
                {t("searchLabel")}
              </label>
              <input
                id="admin-search"
                name="q"
                type="search"
                defaultValue={filters.query}
                placeholder={t("searchPlaceholder")}
                enterKeyHint="search"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sb:contents">
              <div className="grid gap-1.5">
                <label htmlFor="admin-category" className={labelClass}>
                  {t("category")}
                </label>
                <select id="admin-category" name="category" defaultValue={filters.categoryId ?? ""} className={selectClass}>
                  <option value="">{t("allCategories")}</option>
                  {categoryList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="admin-status" className={labelClass}>
                  {t("status")}
                </label>
                <select id="admin-status" name="status" defaultValue={filters.status ?? ""} className={selectClass}>
                  <option value="">{t("allStatuses")}</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tAdmin(`status.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className={buttonVariants({ className: "flex-1 sb:flex-none" })}>
                {t("apply")}
              </button>
              {filtered && (
                <Link href={ADMIN_PRODUCTS_HREF} className={buttonVariants({ variant: "outline", className: "flex-1 sb:flex-none" })}>
                  {t("reset")}
                </Link>
              )}
            </div>
          </form>
        </search>

        {!products.ok ? (
          <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
            {t("loadError")}
          </p>
        ) : products.data.length === 0 ? (
          <p className="font-input text-sm">{filtered ? t("noMatch") : t("empty")}</p>
        ) : (
          <ProductList items={products.data} categories={categoryList} />
        )}
      </div>
    </AdminShell>
  );
}
