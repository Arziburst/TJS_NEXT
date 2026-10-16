import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { OrderDetail } from "@/components/admin/order-detail";
import { ADMIN_ORDERS_HREF, adminOrderHref } from "@/components/admin/paths";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getAdminOrder } from "@/lib/admin/orders";
import { getAdmin, requireAdmin } from "@/lib/auth/session";

// No order is known at build time; a number no order has (they start at 10001) lets the build prerender the
// route's shell, every real number renders at request time behind the admin check.
const UNKNOWN_NUMBER = "0";

export function generateStaticParams() {
  return [{ number: UNKNOWN_NUMBER }];
}

/** The public order number of the URL, or null when it cannot be one. */
function parseNumber(value: string): number | null {
  if (!/^[1-9][0-9]{0,15}$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/orders/[number]">): Promise<Metadata> {
  // nothing about the admin area for anyone else, not even its title
  if (!(await getAdmin())) return {};
  const [{ number }, t] = await Promise.all([params, getTranslations("admin.orders.detail")]);
  return { title: t("title", { number }) };
}

export default function AdminOrderPage(props: PageProps<"/[locale]/admin/orders/[number]">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <AdminOrder {...props} />
    </Suspense>
  );
}

async function AdminOrder({ params }: PageProps<"/[locale]/admin/orders/[number]">) {
  const { locale, number: param } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const number = parseNumber(param);
  await requireAdmin(locale, `/${locale}${number === null ? ADMIN_ORDERS_HREF : adminOrderHref(number)}`);

  const [t, order] = await Promise.all([
    getTranslations("admin.orders.detail"),
    number === null ? Promise.resolve({ ok: true as const, data: null }) : getAdminOrder(number),
  ]);

  return (
    <AdminShell>
      <div className="grid gap-4">
        <Link
          href={ADMIN_ORDERS_HREF}
          className="inline-flex min-h-11 items-center gap-1.5 justify-self-start font-sans text-sm underline-offset-4 hover:text-accent-text hover:underline"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t("back")}
        </Link>
        {!order.ok ? (
          <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
            {t("loadError")}
          </p>
        ) : !order.data ? (
          <div className="grid gap-2" data-testid="order-not-found">
            <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{t("notFoundTitle")}</h1>
            <p className="font-input">{t("notFound", { number: param })}</p>
          </div>
        ) : (
          <OrderDetail order={order.data} locale={locale} />
        )}
      </div>
    </AdminShell>
  );
}
