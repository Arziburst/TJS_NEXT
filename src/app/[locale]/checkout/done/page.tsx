import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrderConfirmation } from "@/components/checkout/order-confirmation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout.done");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default function OrderDonePage({ searchParams }: PageProps<"/[locale]/checkout/done">) {
  return (
    <main className="page-container flex flex-col gap-6 py-6 sb:py-10">
      <Suspense fallback={<span aria-hidden className="block h-40 animate-pulse bg-hairline" />}>
        <OrderConfirmation searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
