import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthMessages } from "../_components/auth-messages";
import { ForgotPasswordForm } from "./forgot-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgotPassword");
  return { title: t("title"), robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgotPassword");
  return (
    <main className="page-container flex flex-1 flex-col items-center py-10 sb:py-16">
      <div className="grid w-full max-w-[400px] gap-6">
        <h1 className="text-center font-sans text-xl font-semibold">{t("title")}</h1>
        <AuthMessages>
          <ForgotPasswordForm />
        </AuthMessages>
      </div>
    </main>
  );
}
