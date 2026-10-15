import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FooterProps = {
  className?: string;
  // the shop's contact channels come from the admin settings (D19)
  contacts?: ReactNode;
};

// Mobile: stacked and centred in coral. From 1024px: three columns, contacts in the middle.
export function Footer({ className, contacts }: FooterProps) {
  const t = useTranslations("common");

  return (
    <footer className={cn("page-container mt-6", className)}>
      <div className="grid gap-[18px] border-t-2 border-foreground/10 pt-6 pb-3.5 text-center font-sans text-xs text-accent-text sb:grid-cols-3 sb:items-center sb:gap-2.5 sb:pb-6 sb:text-left sb:text-foreground">
        <p className="text-xs font-bold tracking-[2.4px] uppercase sb:hidden">{t("brand")}</p>
        <address
          data-slot="footer-contacts"
          className="flex flex-wrap items-end justify-evenly gap-4 font-medium tracking-[1.2px] text-accent-text not-italic sb:order-2 sb:items-center sb:justify-center sb:text-[10px] xl:gap-8"
        >
          {contacts ?? t("footer.contactsTbd")}
        </address>
        <p className="tracking-[0.24px] sb:order-1">{t("footer.rights")}</p>
        <p className="tracking-[0.24px] sb:order-3 sb:justify-self-end">
          {t.rich("footer.developedBy", {
            link: (chunks) => (
              <a
                href="https://github.com/Arziburst"
                target="_blank"
                rel="noreferrer"
                className="font-bold underline hover:opacity-70"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </footer>
  );
}
