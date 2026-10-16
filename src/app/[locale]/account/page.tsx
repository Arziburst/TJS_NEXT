import { KeyRoundIcon, LogOutIcon } from "lucide-react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountFrame, AccountSkeleton, SectionTitle } from "@/components/account/account-frame";
import { EmailForm } from "@/components/account/email-form";
import { ACCOUNT_HREF } from "@/components/account/paths";
import { ProfileForm } from "@/components/account/profile-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import { readAccountProfile } from "@/lib/account/profile";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.profile");
  return { title: t("title") };
}

export default function AccountProfilePage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <ProfileContents />
    </Suspense>
  );
}

async function ProfileContents() {
  const locale = await getLocale();
  await requireUser(locale, `/${locale}${ACCOUNT_HREF}`);
  const [t, messages] = await Promise.all([getTranslations("account"), getMessages()]);

  const profile = await readAccountProfile(await createSessionClient()).catch(() => null);

  return (
    <AccountFrame current="profile">
      {!profile ? (
        <p role="alert">{t("loadError")}</p>
      ) : (
        <NextIntlClientProvider messages={{ account: { profile: messages.account.profile, email: messages.account.email } }}>
          <section aria-labelledby="profile-title" className="grid gap-5">
            <div className="grid gap-2">
              <SectionTitle id="profile-title">{t("profile.title")}</SectionTitle>
              <p>{t("profile.intro")}</p>
            </div>
            <ProfileForm initial={{ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone }} />
          </section>

          <section aria-labelledby="email-title" className="grid gap-5 border-t-2 border-hairline pt-8">
            <SectionTitle id="email-title">{t("email.title")}</SectionTitle>
            <EmailForm current={profile.email} pending={profile.newEmail} />
          </section>
        </NextIntlClientProvider>
      )}

      <section aria-labelledby="security-title" className="grid gap-5 border-t-2 border-hairline pt-8">
        <SectionTitle id="security-title">{t("security.title")}</SectionTitle>
        <div className="flex flex-wrap gap-4">
          <Link href={routes.updatePassword.path} className={cn(buttonVariants({ variant: "outline" }))}>
            <KeyRoundIcon aria-hidden />
            {t("security.changePassword")}
          </Link>
          <form action={signOut}>
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" variant="ghost">
              <LogOutIcon aria-hidden />
              {t("security.signOut")}
            </Button>
          </form>
        </div>
      </section>
    </AccountFrame>
  );
}
