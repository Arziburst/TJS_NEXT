import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { countryOptions } from "@/components/delivery/nova-post/country-options";
import { InternationalDelivery } from "@/components/delivery/nova-post/international-delivery";
import { getNovaPostClient } from "@/lib/delivery/nova-post/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("shippingDetails"), robots: { index: false, follow: false } };
}

// The checkout's delivery step abroad until #24 builds the checkout: the API key is runtime configuration
async function DeliveryDemo() {
  await connection();
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider messages={{ checkout: { internationalDelivery: messages.checkout.internationalDelivery } }}>
      <InternationalDelivery countries={countryOptions(locale)} live={getNovaPostClient() !== null} />
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
