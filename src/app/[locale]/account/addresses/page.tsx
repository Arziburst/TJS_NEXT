import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountFrame, AccountSkeleton, SectionTitle } from "@/components/account/account-frame";
import { AddressActions } from "@/components/account/address-actions";
import { deliveryLines } from "@/components/account/delivery-lines";
import { DeliverySummary } from "@/components/account/delivery-summary";
import { NewAddressForm } from "@/components/account/new-address-form";
import { ACCOUNT_ADDRESSES_HREF } from "@/components/account/paths";
import { countryOptions } from "@/components/delivery/nova-post/country-options";
import { routing } from "@/i18n/routing";
import { listSavedAddresses } from "@/lib/account/addresses";
import { SAVED_ADDRESSES_MAX } from "@/lib/account/schemas";
import { requireUser } from "@/lib/auth/session";
import { getNovaPostClient } from "@/lib/delivery/nova-post/config";
import { createSessionClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.addresses");
  return { title: t("title") };
}

export default function AccountAddressesPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AddressesContents />
    </Suspense>
  );
}

async function AddressesContents() {
  const requested = await getLocale();
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  await requireUser(locale, `/${locale}${ACCOUNT_ADDRESSES_HREF}`);
  const [t, messages, result] = await Promise.all([
    getTranslations("account"),
    getMessages(),
    createSessionClient().then(listSavedAddresses),
  ]);
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const countries = [{ code: "UA" as const, label: names.of("UA") ?? "UA" }, ...countryOptions(locale)];

  return (
    <AccountFrame current="addresses">
      <section aria-labelledby="addresses-title" className="grid gap-5">
        <div className="grid gap-2">
          <SectionTitle id="addresses-title">{t("addresses.title")}</SectionTitle>
          <p>{t("addresses.intro", { max: SAVED_ADDRESSES_MAX })}</p>
        </div>
        {!result.ok ? (
          <p role="alert">{t("loadError")}</p>
        ) : result.addresses.length === 0 ? (
          <p data-testid="addresses-empty">{t("addresses.empty")}</p>
        ) : (
          <NextIntlClientProvider messages={{ account: { addresses: messages.account.addresses } }}>
            <ul className="flex flex-col divide-y divide-hairline border-y border-hairline" data-testid="addresses-list">
              {result.addresses.map((address) => {
                const name = address.label ?? deliveryLines(address.delivery, (code) => names.of(code) ?? code)[0];
                return (
                  <li
                    key={address.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                    data-testid="saved-address"
                    data-default={address.isDefault || undefined}
                  >
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        {address.label ? <span className="font-sans text-lg font-semibold break-words">{address.label}</span> : null}
                        {address.isDefault ? (
                          <span className="border-2 border-primary px-2 py-0.5 font-sans text-xs font-semibold tracking-wider uppercase">
                            {t("addresses.default")}
                          </span>
                        ) : null}
                      </div>
                      <DeliverySummary choice={address.delivery} />
                    </div>
                    <AddressActions id={address.id} name={name} isDefault={address.isDefault} />
                  </li>
                );
              })}
            </ul>
          </NextIntlClientProvider>
        )}
      </section>

      {result.ok ? (
        <section aria-labelledby="new-address-title" className="grid gap-5 border-t-2 border-hairline pt-8">
          <SectionTitle id="new-address-title">{t("addresses.add")}</SectionTitle>
          {result.addresses.length >= SAVED_ADDRESSES_MAX ? (
            <p data-testid="addresses-full">{t("addresses.full", { max: SAVED_ADDRESSES_MAX })}</p>
          ) : (
            <NextIntlClientProvider
              messages={{
                account: { addresses: messages.account.addresses },
                checkout: { delivery: messages.checkout.delivery, internationalDelivery: messages.checkout.internationalDelivery },
                auth: { errors: { rateLimited: messages.auth.errors.rateLimited } },
              }}
            >
              <NewAddressForm countries={countries} novaPostLive={getNovaPostClient() !== null} />
            </NextIntlClientProvider>
          )}
        </section>
      ) : null}
    </AccountFrame>
  );
}
