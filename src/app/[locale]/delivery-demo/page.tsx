import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { DeliveryMessages } from "@/components/delivery/delivery-messages";
import { NovaPoshtaDelivery } from "@/components/delivery/nova-poshta-delivery";
import { parcelFromCart } from "@/lib/delivery/nova-poshta/parcel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout.delivery");
  return { title: t("title"), robots: { index: false, follow: false } };
}

// A sample order for the showcase: two pieces of 35 g, 1 289 ₴ in total, packed in the standard box (D37)
const DEMO_PARCEL = parcelFromCart([{ weightGrams: 35, quantity: 2, unitPriceUahMinor: 64450 }])!;

/*
 * The Nova Poshta delivery pieces for the checkout (#24), shown on their own. A dev showcase like /ui-kit: on only
 * where TJS_UI_KIT is "true" (local dev, CI); production leaves it unset and answers 404.
 */
export default async function DeliveryDemoPage() {
  if (process.env.TJS_UI_KIT !== "true") notFound();
  const t = await getTranslations("checkout.delivery");

  return (
    <main className="page-container flex flex-col gap-6 pb-10">
      <h1 className="pt-6 text-center font-display text-[40px] leading-[54px] uppercase sb:text-left sb:text-[56px] sb:leading-[76px]">
        {t("title")}
      </h1>
      <div className="w-full max-w-2xl">
        <DeliveryMessages>
          <NovaPoshtaDelivery parcel={DEMO_PARCEL} />
        </DeliveryMessages>
      </div>
    </main>
  );
}
