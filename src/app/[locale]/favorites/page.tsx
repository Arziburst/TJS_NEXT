import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { FavoritesContents } from "@/components/favorites/favorites-contents";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("product.favorites");
  // a visitor's own list: nothing for a search engine
  return { title: t("title"), robots: { index: false, follow: true } };
}

export default async function FavoritesPage() {
  const [t, messages] = await Promise.all([getTranslations("product.favorites"), getMessages()]);
  return (
    <main className="page-container flex flex-col gap-6 py-6 sb:gap-10 sb:py-10">
      <h1 className="font-display text-4xl uppercase sb:text-5xl">{t("title")}</h1>
      <NextIntlClientProvider
        messages={{ product: { favorites: messages.product.favorites }, common: { actions: messages.common.actions } }}
      >
        <Suspense fallback={<FavoritesSkeleton />}>
          <FavoritesContents />
        </Suspense>
      </NextIntlClientProvider>
    </main>
  );
}

function FavoritesSkeleton() {
  return (
    <div aria-hidden className="grid gap-x-10 border-t border-hairline sb:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="flex gap-4 border-b border-hairline py-5 sb:gap-6">
          <span className="size-24 animate-pulse rounded bg-hairline sb:size-32" />
          <span className="h-5 w-1/2 animate-pulse bg-hairline" />
        </div>
      ))}
    </div>
  );
}
