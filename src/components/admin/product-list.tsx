import { ImageOffIcon } from "lucide-react";
import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { setProductStatus } from "@/app/[locale]/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { PUBLISH_LOCALE } from "@/lib/admin/product-form";
import type { AdminProductListItem } from "@/lib/admin/products";
import type { Category } from "@/lib/catalog/types";
import { editProductHref } from "./paths";
import { StatusToggle } from "./status-toggle";

const STATUS_VARIANT = { published: "success", draft: "secondary", archived: "outline" } as const;

/** The admin's product list: one card per product, the title links to its form, one tap (un)publishes it. */
export async function ProductList({ items, categories }: { items: AdminProductListItem[]; categories: Category[] }) {
  const [t, tAdmin, tLocales, format] = await Promise.all([
    getTranslations("admin.list"),
    getTranslations("admin"),
    getTranslations("nav.localeNames"),
    getFormatter(),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <ul className="grid gap-3">
      {items.map((item) => {
        const title = item.title?.text ?? t("untitled");
        const missingUk = item.missingLocales.includes(PUBLISH_LOCALE);
        return (
          <li
            key={item.id}
            className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-3 border-2 border-hairline p-3 sb:grid-cols-[4rem_minmax(0,1fr)_auto] sb:items-center"
          >
            <div className="relative size-16 overflow-hidden bg-muted">
              {item.image ? (
                <Image src={item.image.url} alt="" fill sizes="64px" quality={75} className="object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center" title={t("noPhoto")}>
                  <ImageOffIcon aria-hidden className="size-5 opacity-50" />
                  <span className="sr-only">{t("noPhoto")}</span>
                </span>
              )}
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Link
                href={editProductHref(item.id)}
                lang={item.title?.locale}
                className="truncate font-sans text-base font-semibold underline-offset-4 hover:text-accent-text hover:underline"
              >
                {title}
              </Link>
              <p className="flex flex-wrap gap-x-3 gap-y-1 font-input text-sm">
                <span>{format.number(item.priceUsdMinor === null ? 0 : item.priceUsdMinor / 100, { style: "currency", currency: "USD" })}</span>
                <span>{categoryName.get(item.categoryId) ?? t("unknownCategory")}</span>
                {item.sku && <span>{t("sku", { sku: item.sku })}</span>}
              </p>
              <p className="flex flex-wrap items-center gap-1.5">
                <Badge variant={STATUS_VARIANT[item.status]}>{tAdmin(`status.${item.status}`)}</Badge>
                <Badge variant="outline">{tAdmin(`fulfillment.${item.fulfillment}`)}</Badge>
                {item.fulfillment === "one_of_a_kind" && (
                  <Badge variant={item.availability === "available" ? "outline" : "secondary"}>
                    {tAdmin(`availability.${item.availability}`)}
                  </Badge>
                )}
              </p>
              {item.missingLocales.length > 0 && (
                <p className="font-input text-xs">
                  {missingUk && <strong>{t("missingUk")} </strong>}
                  {t("missing", {
                    count: item.missingLocales.length,
                    locales: format.list(item.missingLocales.map((l) => tLocales(l))),
                  })}
                </p>
              )}
            </div>
            <StatusToggle
              productId={item.id}
              status={item.status}
              canPublish={!missingUk}
              title={title}
              setProductStatus={setProductStatus}
              className="col-span-2 sb:col-span-1"
            />
          </li>
        );
      })}
    </ul>
  );
}
