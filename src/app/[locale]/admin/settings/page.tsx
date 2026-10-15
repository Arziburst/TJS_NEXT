import { ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveContacts, savePriceSettings } from "@/app/[locale]/admin/settings/actions";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { ContactsForm } from "@/components/admin/contacts-form";
import { ADMIN_ABOUT_HREF, ADMIN_SETTINGS_HREF } from "@/components/admin/paths";
import { PriceSettingsForm } from "@/components/admin/price-settings-form";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getAdmin, requireAdmin } from "@/lib/auth/session";
import type { Currency } from "@/lib/money/currencies";
import { readMoneyTables } from "@/lib/money/store";
import { contactFormValues } from "@/lib/settings/contacts";
import { priceFormValues } from "@/lib/settings/price-settings";
import { readAdminPriceSettings, readShopSettingsAsService } from "@/lib/settings/store";

export async function generateMetadata(): Promise<Metadata> {
  // nothing about the admin area for anyone else, not even its title
  if (!(await getAdmin())) return {};
  const t = await getTranslations("admin.settings");
  return { title: t("title") };
}

export default function AdminSettingsPage(props: PageProps<"/[locale]/admin/settings">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <AdminSettings {...props} />
    </Suspense>
  );
}

async function AdminSettings({ params }: PageProps<"/[locale]/admin/settings">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${ADMIN_SETTINGS_HREF}`);

  const [t, settings, prices, tables] = await Promise.all([
    getTranslations("admin.settings"),
    // the chat id is readable only by the service role: after requireAdmin() above
    readShopSettingsAsService(),
    readAdminPriceSettings(),
    // today's display rates for the live example, read per request like the rest of this page
    readMoneyTables().catch(() => null),
  ]);

  const displayRates: Partial<Record<Currency, string>> = {};
  for (const [currency, rate] of Object.entries(tables?.displayRates ?? {})) displayRates[currency as Currency] = rate.rate;

  return (
    <AdminShell>
      <div className="grid gap-8">
        <header className="grid gap-2">
          <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{t("title")}</h1>
          <p className="max-w-prose font-input text-sm">{t("intro")}</p>
        </header>

        <Link
          href={ADMIN_ABOUT_HREF}
          className="flex min-h-16 items-center gap-3 border-2 border-primary px-4 py-3 outline-none hover:bg-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="grid flex-1 gap-0.5">
            <span className="font-sans text-base font-semibold">{t("about.edit")}</span>
            <span className="font-input text-sm">{t("about.cardHint")}</span>
          </span>
          <ChevronRightIcon aria-hidden className="size-5 shrink-0" />
        </Link>

        {settings ? (
          <ContactsForm values={contactFormValues(settings)} saveContacts={saveContacts} />
        ) : (
          <LoadError text={t("loadError")} />
        )}

        {prices ? (
          <PriceSettingsForm
            values={priceFormValues(
              prices.markupBps,
              Object.fromEntries(prices.currencies.map((c) => [c.currency, c.rule])),
              Object.fromEntries(prices.currencies.map((c) => [c.currency, c.decimals])),
            )}
            currencies={prices.currencies.map(({ currency, decimals }) => ({ currency, decimals }))}
            displayRates={displayRates}
            savePriceSettings={savePriceSettings}
          />
        ) : (
          <LoadError text={t("loadError")} />
        )}
      </div>
    </AdminShell>
  );
}

function LoadError({ text }: { text: string }) {
  return (
    <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
      {text}
    </p>
  );
}
