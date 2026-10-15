import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PAGE_SIZE, pagerItems, toQuery, totalPagesFor, type ShopQuery } from "./shop-query";

type PaginationProps = {
  pathname: string;
  query: ShopQuery;
  total: number;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ArrowLink({ href, label, children }: { href: Parameters<typeof Link>[0]["href"] | null; label: string; children: ReactNode }) {
  const className = "inline-flex size-11 items-center justify-center transition hover:opacity-70";
  if (!href) {
    return (
      <span aria-disabled className={cn(className, "opacity-30")} aria-label={label} role="link">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

/** "Show more" appends the next page; the pager jumps to one page. Both are plain links: the state is the URL. */
export async function Pagination({ pathname, query, total }: PaginationProps) {
  const t = await getTranslations("catalog");
  const totalPages = totalPagesFor(total);
  const shown = Math.min(query.page * PAGE_SIZE, total);
  const at = (page: number, from = page) => ({ pathname, query: toQuery({ ...query, page, from }) });

  return (
    <div className="flex flex-col items-center gap-6 font-sans" data-testid="pagination">
      <p className="text-sm" data-testid="shown-count">
        {t.rich("shownCount", { shown, total, b: (chunks) => <b>{chunks}</b> })}
      </p>
      {query.page < totalPages && (
        <Link
          href={at(query.page + 1, query.from)}
          scroll={false}
          className={cn(buttonVariants({ variant: "outline" }), "w-full max-w-[540px]")}
        >
          {t("showMore")}
        </Link>
      )}
      {totalPages > 1 && (
        <nav aria-label={t("pagination.label")} className="flex items-center gap-2">
          <ArrowLink href={query.from > 1 ? at(query.from - 1) : null} label={t("pagination.previous")}>
            <ChevronLeft aria-hidden />
          </ArrowLink>
          <ol className="hidden items-center gap-1 sb:flex">
            {pagerItems(query.page, totalPages).map((item, index) =>
              item === "gap" ? (
                <li key={`gap-${index}`} aria-hidden className="px-2">
                  {t("pagination.gap")}
                </li>
              ) : (
                <li key={item}>
                  <Link
                    href={at(item)}
                    aria-label={t("pagination.page", { page: item })}
                    aria-current={item >= query.from && item <= query.page ? "page" : undefined}
                    className="inline-flex size-11 items-center justify-center font-semibold tabular-nums transition hover:opacity-70 aria-[current=page]:text-accent"
                  >
                    {pad(item)}
                  </Link>
                </li>
              ),
            )}
          </ol>
          <p className="text-sm tabular-nums sb:hidden">
            {t.rich("pagination.position", { page: pad(query.page), total: pad(totalPages), b: (chunks) => <b>{chunks}</b> })}
          </p>
          <ArrowLink href={query.page < totalPages ? at(query.page + 1) : null} label={t("pagination.next")}>
            <ChevronRight aria-hidden />
          </ArrowLink>
        </nav>
      )}
    </div>
  );
}
