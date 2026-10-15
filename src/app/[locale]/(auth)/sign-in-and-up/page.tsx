import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAuthProviders } from "@/lib/auth/providers";
import { safeNextPath } from "@/lib/auth/schemas";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthMessages } from "../_components/auth-messages";
import { AuthTabs } from "./auth-tabs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("title"), robots: { index: false } };
}

export default async function SignInAndUpPage({ searchParams }: PageProps<"/[locale]/sign-in-and-up">) {
  const t = await getTranslations("auth");
  return (
    <main className="page-container flex flex-1 flex-col items-center py-10 sb:py-16">
      <h1 className="sr-only">{t("title")}</h1>
      <Suspense fallback={<div className="min-h-[560px] w-full max-w-[400px]" />}>
        <GuestOnly searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const LINK_ERRORS = ["linkInvalid", "oauthFailed"] as const;

// Signed-in visitors have nothing to do here (legacy: the page belonged to guests only).
async function GuestOnly({ searchParams }: Pick<PageProps<"/[locale]/sign-in-and-up">, "searchParams">) {
  const [locale, user, providers, params] = await Promise.all([
    getLocale(),
    getCurrentUser(),
    getAuthProviders(),
    searchParams,
  ]);
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  if (user) redirect(next ?? `/${locale}`);
  const linkError = LINK_ERRORS.find((code) => code === params.error);

  return (
    <AuthMessages>
      <AuthTabs googleEnabled={providers.google} next={next} linkError={linkError} />
    </AuthMessages>
  );
}
