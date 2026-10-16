import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveAbout } from "@/app/[locale]/admin/settings/actions";
import { AboutForm } from "@/components/admin/about-form";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { ADMIN_ABOUT_HREF, ADMIN_SETTINGS_HREF } from "@/components/admin/paths";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getAdmin, requireAdmin } from "@/lib/auth/session";
import { readAdminAbout } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getAdmin())) return {};
  const t = await getTranslations("admin.settings.about");
  return { title: t("title") };
}

export default function AdminAboutPage(props: PageProps<"/[locale]/admin/settings/about">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <AdminAbout {...props} />
    </Suspense>
  );
}

async function AdminAbout({ params }: PageProps<"/[locale]/admin/settings/about">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${ADMIN_ABOUT_HREF}`);
  const [t, tSettings, content] = await Promise.all([
    getTranslations("admin.settings.about"),
    getTranslations("admin.settings"),
    readAdminAbout(),
  ]);

  return (
    <AdminShell>
      <div className="grid gap-6">
        <Link
          href={ADMIN_SETTINGS_HREF}
          className="inline-flex min-h-11 items-center gap-2 justify-self-start font-sans text-sm font-semibold outline-none hover:text-accent-text focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-2">
            <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{t("title")}</h1>
            <p className="max-w-prose font-input text-sm">{t("hint")}</p>
          </div>
          <Link href={routes.aboutUs.path} target="_blank" className={cn(buttonVariants({ variant: "outline" }))}>
            <ExternalLinkIcon aria-hidden />
            {t("view")}
          </Link>
        </header>
        {content ? (
          <AboutForm content={content} saveAbout={saveAbout} />
        ) : (
          <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
            {tSettings("loadError")}
          </p>
        )}
      </div>
    </AdminShell>
  );
}
