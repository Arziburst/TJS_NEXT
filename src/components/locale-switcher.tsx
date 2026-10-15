"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useTransition, type ChangeEvent } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type LocaleSwitcherProps = {
  className?: string;
  // the label stays for screen readers when the surrounding UI already shows it or has no room
  hideLabel?: boolean;
};

// Keeps the current path and switches only the locale; next-intl's router writes the NEXT_LOCALE cookie
export function LocaleSwitcher({ className, hideLabel = false }: LocaleSwitcherProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [isPending, startTransition] = useTransition();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as Locale;
    startTransition(() => {
      // without localized `pathnames` the current pathname already carries its dynamic segments
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <div className={cn("flex items-center gap-2 font-sans text-sm", className)}>
      <label htmlFor={id} className={cn("text-muted-foreground", hideLabel && "sr-only")}>
        {t("language")}
      </label>
      <select
        id={id}
        value={locale}
        onChange={onChange}
        disabled={isPending}
        className="h-11 cursor-pointer bg-transparent font-semibold tracking-[1.6px] transition-opacity hover:opacity-70 disabled:opacity-50"
      >
        {locales.map((option) => (
          <option key={option} value={option} lang={option}>
            {t(`localeNames.${option}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
