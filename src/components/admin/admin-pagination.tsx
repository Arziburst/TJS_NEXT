import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_PRODUCTS_HREF } from "./paths";

type AdminPaginationProps = {
  page: number;
  pageCount: number;
  /** The list's search and filters, kept on every page link. */
  filters: { query?: string; categoryId?: string; status?: string };
};

/** Previous / next page of the admin list, with the filters kept; nothing for a single page. */
export async function AdminPagination({ page, pageCount, filters }: AdminPaginationProps) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("admin.list.pagination");
  const href = (target: number) => {
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    if (filters.categoryId) params.set("category", filters.categoryId);
    if (filters.status) params.set("status", filters.status);
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return search ? `${ADMIN_PRODUCTS_HREF}?${search}` : ADMIN_PRODUCTS_HREF;
  };
  const link = cn(buttonVariants({ variant: "outline" }), "min-w-12 px-3");

  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={link} aria-label={t("previous")}>
          <ChevronLeftIcon aria-hidden />
        </Link>
      ) : (
        <span className="min-w-12" />
      )}
      <p className="font-input text-sm" aria-current="page">
        {t("page", { page, count: pageCount })}
      </p>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={link} aria-label={t("next")}>
          <ChevronRightIcon aria-hidden />
        </Link>
      ) : (
        <span className="min-w-12" />
      )}
    </nav>
  );
}
