import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { CartItemImage } from "@/components/cart/cart-item-image";
import { countryOptions } from "@/components/delivery/nova-post/country-options";
import { PriceTotal } from "@/components/price";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { getCartView, orderableLines, type CartItem, type CartProduct } from "@/lib/cart";
import { parcelFromCart } from "@/lib/delivery/nova-poshta/parcel";
import { isDeliveryCountry } from "@/lib/delivery/nova-post/countries";
import { getNovaPostClient } from "@/lib/delivery/nova-post/config";
import { goodsOf } from "@/lib/delivery/nova-post/parcel";
import { getMoneyTables } from "@/lib/money/cache";
import { priceIn } from "@/lib/money/format";
import type { MoneyTables } from "@/lib/money/store";
import { cn } from "@/lib/utils";
import { CheckoutForm, type CheckoutCountry } from "./checkout-form";

// Vercel sets the visitor's country on every request (D5)
const COUNTRY_HEADER = "x-vercel-ip-country";
const IMAGE_SIZES = "64px";

type Orderable = CartItem & { product: CartProduct };

/** The Nova Poshta parcel of the orderable lines (D35, D37); null without a UAH rate. */
function ukraineParcel(items: readonly Orderable[], tables: MoneyTables) {
  const lines = [];
  for (const { product, quantity } of items) {
    const uah = priceIn(product.priceUsdMinor, "UAH", tables);
    if (!uah) return null;
    lines.push({ weightGrams: product.weightGrams, quantity, unitPriceUahMinor: uah.amountMinor });
  }
  return parcelFromCart(lines);
}

/** The visitor's country when it is a market (D2), else Ukraine for the Ukrainian locale, else none yet. */
function defaultCountry(country: string | null, locale: Locale): CheckoutCountry | null {
  const code = country?.toUpperCase() ?? null;
  if (code === "UA" || isDeliveryCountry(code)) return code;
  return locale === "uk" ? "UA" : null;
}

/** "Olena Kovalenko" → first and last name, as the profile keeps one name field. */
function splitName(name: string | null): { firstName: string; lastName: string } {
  const [first = "", ...rest] = (name ?? "").trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}

/*
 * The order request page body: the cart re-read from the database, the form with a signed-in customer's
 * profile filled in, and the summary with the server's total. Request-time data: render inside <Suspense>.
 */
export async function CheckoutContents() {
  const [view, tables, user, requested, headerList, messages, t] = await Promise.all([
    getCartView(),
    getMoneyTables(),
    getCurrentUser(),
    getLocale(),
    headers(),
    getMessages(),
    getTranslations("checkout.request"),
  ]);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  if (!view.ok || !tables) {
    return (
      <p role="alert" className="py-10">
        {t("loadError")}
      </p>
    );
  }

  const orderable = view.items.filter((item): item is Orderable => item.status === "available" && item.product !== null);
  if (orderable.length === 0) {
    return (
      <div className="flex flex-col items-start gap-5 py-10" data-testid="checkout-empty">
        <p className="text-lg">{t("empty")}</p>
        <Link href={routes.cart.path} className={cn(buttonVariants())}>
          {t("backToCart")}
        </Link>
      </div>
    );
  }
  const parcel = ukraineParcel(orderable, tables);
  if (!parcel) {
    return (
      <p role="alert" className="py-10">
        {t("loadError")}
      </p>
    );
  }

  const ukraine = new Intl.DisplayNames([locale], { type: "region" }).of("UA") ?? "UA";
  const countries = [{ code: "UA" as const, label: ukraine }, ...countryOptions(locale)];
  const goods = goodsOf(
    orderable.map(({ product, quantity }) => ({ priceUsdMinor: product.priceUsdMinor, weightGrams: product.weightGrams, quantity })),
    tables,
  );
  const prefill = user
    ? { ...splitName(user.name), phone: user.phone ?? "", email: user.email ?? "" }
    : { firstName: "", lastName: "", phone: "", email: "" };
  const pieces = orderable.reduce((sum, item) => sum + item.quantity, 0);
  const hasUnavailable = view.items.length > orderable.length;

  const total = (testId?: string) => (
    <dl className="flex items-baseline justify-between gap-4 border-t-2 border-primary pt-4" data-testid={testId}>
      <dt>
        {t("summary.goodsTotal")}
        <span className="block text-sm">{t("summary.pieces", { count: pieces })}</span>
      </dt>
      <dd className="font-sans text-xl text-accent-text">
        <PriceTotal lines={orderableLines(orderable)} />
      </dd>
    </dl>
  );

  return (
    <div className="grid gap-10 sb:grid-cols-[minmax(0,1fr)_22rem] sb:items-start sb:gap-14">
      <section aria-labelledby="checkout-summary-title" className="flex flex-col gap-5 sb:sticky sb:top-28 sb:order-2">
        <h2 id="checkout-summary-title" className="font-sans text-base font-semibold tracking-[0.2em] uppercase">
          {t("summary.lines")}
        </h2>
        <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
          {orderable.map(({ product, quantity }) => (
            <li key={product.id} className="flex gap-3 py-3" data-testid="checkout-line">
              <CartItemImage image={product.image} alt="" sizes={IMAGE_SIZES} className="size-16 shrink-0" />
              <div className="flex min-w-0 grow flex-col gap-1">
                <span lang={product.locale !== locale ? product.locale : undefined} className="font-sans font-semibold break-words">
                  {product.title}
                </span>
                <span className="text-sm">{t("summary.quantity", { quantity })}</span>
              </div>
              <PriceTotal lines={[{ usdMinor: product.priceUsdMinor, quantity }]} className="shrink-0 font-sans text-accent-text" />
            </li>
          ))}
        </ul>
        {total("checkout-total")}
        <p className="text-sm">{t("summary.deliveryNote")}</p>
        {hasUnavailable ? (
          <p role="note" className="text-sm">
            {t("summary.unavailableNote")}
          </p>
        ) : null}
        <Link href={routes.cart.path} className="text-sm underline underline-offset-4 hover:text-accent-text">
          {t("summary.editCart")}
        </Link>
      </section>

      <div className="sb:order-1">
        <NextIntlClientProvider
          messages={{
            checkout: {
              contactDetails: messages.checkout.contactDetails,
              shippingDetails: messages.checkout.shippingDetails,
              fields: messages.checkout.fields,
              request: messages.checkout.request,
              delivery: messages.checkout.delivery,
              internationalDelivery: messages.checkout.internationalDelivery,
            },
            auth: { errors: { rateLimited: messages.auth.errors.rateLimited } },
          }}
        >
          <CheckoutForm
            countries={countries}
            defaultCountry={defaultCountry(headerList.get(COUNTRY_HEADER), locale)}
            prefill={prefill}
            parcel={parcel}
            goods={goods}
            novaPostLive={getNovaPostClient() !== null}
            expected={orderable.map(({ product, quantity }) => ({ productId: product.id, quantity }))}
            // on a phone the summary is far above the button: the total is repeated next to it
            total={<div className="sb:hidden">{total()}</div>}
          />
        </NextIntlClientProvider>
      </div>
    </div>
  );
}
