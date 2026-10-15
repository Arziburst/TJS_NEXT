import { useTranslations } from "next-intl";
import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * DAP (D8): the recipient may have to pay import VAT and duty to the carrier. The CRD notice wording
 * (eu-legal research: "may be payable" when they cannot be calculated) — shown with every estimate abroad.
 */
export function CustomsNotice({ className }: { className?: string }) {
  const t = useTranslations("checkout.internationalDelivery");
  return (
    <p data-slot="customs-notice" className={cn("flex items-start gap-2 font-input text-sm", className)}>
      <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {t("customsNotice")}
    </p>
  );
}
