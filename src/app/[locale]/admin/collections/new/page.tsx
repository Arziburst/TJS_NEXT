import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveCollection } from "@/app/[locale]/admin/collections/actions";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { CollectionForm } from "@/components/admin/collection-form";
import { ADMIN_COLLECTIONS_HREF, NEW_COLLECTION_HREF } from "@/components/admin/paths";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getAdmin, requireAdmin } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getAdmin())) return {};
  const t = await getTranslations("admin.collections");
  return { title: t("newTitle") };
}

export default function NewCollectionPage(props: PageProps<"/[locale]/admin/collections/new">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <NewCollection {...props} />
    </Suspense>
  );
}

async function NewCollection({ params }: PageProps<"/[locale]/admin/collections/new">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${NEW_COLLECTION_HREF}`);
  const t = await getTranslations("admin.collections");

  return (
    <AdminShell>
      <div className="grid gap-5">
        <header className="grid gap-2">
          <Link
            href={ADMIN_COLLECTIONS_HREF}
            className="inline-flex min-h-11 items-center gap-1.5 justify-self-start font-sans text-sm underline-offset-4 hover:text-accent-text hover:underline"
          >
            <ArrowLeftIcon aria-hidden className="size-4" />
            {t("back")}
          </Link>
          <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{t("newTitle")}</h1>
          <p className="font-input text-sm">{t("saveFirst")}</p>
        </header>
        <CollectionForm collection={{ id: null, published: false, position: 0, translations: {} }} saveCollection={saveCollection} />
      </div>
    </AdminShell>
  );
}
