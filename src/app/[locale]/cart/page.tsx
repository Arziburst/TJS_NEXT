import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CartContents } from "@/components/cart/cart-contents";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart");
  // a visitor's own cart: nothing for a search engine
  return { title: t("title"), robots: { index: false, follow: true } };
}

export default async function CartPage() {
  const [t, messages] = await Promise.all([getTranslations("cart"), getMessages()]);
  return (
    <main className="page-container flex flex-col gap-6 py-6 sb:gap-10 sb:py-10">
      <h1 className="font-display text-4xl uppercase sb:text-5xl">{t("title")}</h1>
      <NextIntlClientProvider messages={{ cart: messages.cart, common: { actions: messages.common.actions } }}>
        <Suspense fallback={<CartSkeleton />}>
          <CartContents />
        </Suspense>
      </NextIntlClientProvider>
    </main>
  );
}

function CartSkeleton() {
  return (
    <div aria-hidden className="grid gap-10 sb:grid-cols-[minmax(0,1fr)_22rem] sb:gap-14">
      <div className="flex flex-col gap-5 border-y border-hairline py-5">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-4 sb:gap-6">
            <span className="size-24 animate-pulse rounded bg-hairline sb:size-32" />
            <span className="h-5 w-1/2 animate-pulse bg-hairline" />
          </div>
        ))}
      </div>
      <span className="h-40 animate-pulse bg-hairline" />
    </div>
  );
}
