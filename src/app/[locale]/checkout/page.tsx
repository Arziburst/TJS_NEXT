import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CheckoutContents } from "@/components/checkout/checkout-contents";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout.request");
  // a visitor's own order: nothing for a search engine
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function CheckoutPage() {
  const t = await getTranslations("checkout.request");
  return (
    <main className="page-container flex flex-col gap-6 py-6 sb:gap-10 sb:py-10">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl uppercase sb:text-5xl">{t("title")}</h1>
        <p className="max-w-2xl">{t("intro")}</p>
      </div>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutContents />
      </Suspense>
    </main>
  );
}

function CheckoutSkeleton() {
  return (
    <div aria-hidden className="grid gap-10 sb:grid-cols-[minmax(0,1fr)_22rem] sb:gap-14">
      <div className="flex flex-col gap-5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-11 animate-pulse bg-hairline" />
        ))}
      </div>
      <span className="h-40 animate-pulse bg-hairline" />
    </div>
  );
}
