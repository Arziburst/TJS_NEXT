import { getLocale, getTranslations } from "next-intl/server";
import type { DeliveryChoice } from "@/lib/checkout/schema";
import { cn } from "@/lib/utils";
import { deliveryKind, deliveryLang, deliveryLines } from "./delivery-lines";

/** A saved or ordered destination: the service, then the point or address (names as the carrier gave them). */
export async function DeliverySummary({ choice, className }: { choice: DeliveryChoice; className?: string }) {
  const [t, locale] = await Promise.all([getTranslations("account.addresses.kinds"), getLocale()]);
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const [first, second] = deliveryLines(choice, (code) => names.of(code) ?? code);
  const lang = deliveryLang(choice);
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)} data-testid="delivery-summary">
      <span className="font-sans text-xs font-semibold tracking-wider uppercase">{t(deliveryKind(choice))}</span>
      <span lang={lang} className="break-words">
        {first}
      </span>
      <span lang={lang} className="text-sm break-words">
        {second}
      </span>
    </div>
  );
}
