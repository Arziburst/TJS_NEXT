import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/** "Size: 17" of a cart, checkout or order line (#66). */
export async function VariantLabel({ label, className }: { label: string; className?: string }) {
  const t = await getTranslations("common");
  return (
    <span className={cn("text-sm", className)} data-testid="line-variant">
      {t("variant", { label })}
    </span>
  );
}
