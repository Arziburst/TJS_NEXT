import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { countryOptions } from "@/components/delivery/nova-post/country-options";
import { InternationalDelivery } from "@/components/delivery/nova-post/international-delivery";
import type { Locale } from "@/i18n/routing";
import { getProducts } from "@/lib/catalog";
import { getNovaPostClient } from "@/lib/delivery/nova-post/config";
import { goodsOf, type OrderGoods } from "@/lib/delivery/nova-post/parcel";
import { getMoneyTables } from "@/lib/money/cache";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("shippingDetails"), robots: { index: false, follow: false } };
}

// A one-line cart for the demo: the newest published product, until #24 passes the real cart
async function demoGoods(locale: Locale): Promise<OrderGoods | null> {
  const [products, tables] = await Promise.all([
    getProducts({ locale }, "newest", { page: 1, pageSize: 1 }),
    getMoneyTables(),
  ]);
  const product = products.ok ? products.data.items[0] : undefined;
  if (!product || !tables) return null;
  return goodsOf([{ priceUsdMinor: product.priceUsdMinor, weightGrams: product.weightG, quantity: 1 }], tables);
}

// The checkout's delivery step abroad until #24 builds the checkout: the API key is runtime configuration
async function DeliveryDemo() {
  await connection();
  const [locale, messages] = await Promise.all([getLocale() as Promise<Locale>, getMessages()]);
  return (
    <NextIntlClientProvider
      messages={{
        checkout: { internationalDelivery: messages.checkout.internationalDelivery },
        auth: { errors: { rateLimited: messages.auth.errors.rateLimited } },
      }}
    >
      <InternationalDelivery
        countries={countryOptions(locale)}
        live={getNovaPostClient() !== null}
        goods={await demoGoods(locale)}
      />
    </NextIntlClientProvider>
  );
}

async function Heading() {
  const t = await getTranslations("checkout");
  return (
    <h1 className="py-6 text-center font-display text-[40px] leading-[54px] uppercase sb:text-left">{t("shippingDetails")}</h1>
  );
}

export default function NovaPostDeliveryDemoPage() {
  // A dev-only showcase like /ui-kit: on only where TJS_UI_KIT is "true" (local dev, CI); production leaves it unset.
  if (process.env.TJS_UI_KIT !== "true") notFound();

  return (
    <main className="page-container flex max-w-2xl flex-col pb-10">
      <Heading />
      <Suspense fallback={<div className="h-20" />}>
        <DeliveryDemo />
      </Suspense>
    </main>
  );
}
