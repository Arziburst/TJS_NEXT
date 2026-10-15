"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useTransition, type ChangeEvent } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";

// Keeps the current path and switches only the locale; next-intl's router writes the NEXT_LOCALE cookie
export function LocaleSwitcher() {
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
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        {t("language")}
      </label>
      <select
        id={id}
        value={locale}
        onChange={onChange}
        disabled={isPending}
        className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
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
