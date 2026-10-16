import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_PRODUCTS_HREF } from "./paths";

type AdminPaginationProps = {
  page: number;
  pageCount: number;
  /** The list's search and filters as URL params, kept on every page link. */
  search: Record<string, string | undefined>;
  /** The list's page (default: the product list). */
  path?: string;
};

/** Previous / next page of an admin list, with the filters kept; nothing for a single page. */
export async function AdminPagination({ page, pageCount, search, path = ADMIN_PRODUCTS_HREF }: AdminPaginationProps) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("admin.list.pagination");
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) if (value && key !== "page") params.set(key, value);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${path}?${query}` : path;
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
