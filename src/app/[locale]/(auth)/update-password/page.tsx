import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { AuthMessages } from "../_components/auth-messages";
import { UpdatePasswordForm } from "./update-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.updatePassword");
  return { title: t("title"), robots: { index: false } };
}

// Reached from the password-reset email (auth/confirm signs the user in first) or by a signed-in user.
export default async function UpdatePasswordPage() {
  const t = await getTranslations("auth.updatePassword");
  return (
    <main className="page-container flex flex-1 flex-col items-center py-10 sb:py-16">
      <div className="grid w-full max-w-[400px] gap-6">
        <h1 className="text-center font-sans text-xl font-semibold">{t("title")}</h1>
        <Suspense fallback={<div className="min-h-[320px]" />}>
          <SignedInOnly />
        </Suspense>
      </div>
    </main>
  );
}

async function SignedInOnly() {
  const locale = await getLocale();
  await requireUser(locale, `/${locale}/update-password`);
  return (
    <AuthMessages>
      <UpdatePasswordForm />
    </AuthMessages>
  );
}
