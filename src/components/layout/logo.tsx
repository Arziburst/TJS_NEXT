import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Text placeholder until the owner supplies a logo.
export function Logo({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const t = useTranslations("common");

  return (
    <Link
      href="/"
      onClick={onNavigate}
      className={cn(
        "font-sans text-xs font-bold tracking-[2.4px] whitespace-nowrap uppercase transition-opacity hover:opacity-70 sb:text-sm",
        className,
      )}
    >
      {t("brand")}
    </Link>
  );
}
