import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { ADMIN_ATTRIBUTES_HREF } from "@/components/admin/paths";
import { TaxonomyList } from "@/components/admin/taxonomy-editor";
import { routing } from "@/i18n/routing";
import { listAdminTerms } from "@/lib/admin/taxonomy";
import { TAXONOMY_KINDS } from "@/lib/admin/taxonomy-form";
import { getAdmin, requireAdmin } from "@/lib/auth/session";
import { deleteTerm, saveTerm } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  // nothing about the admin area for anyone else, not even its title
  if (!(await getAdmin())) return {};
  const t = await getTranslations("admin.taxonomy");
  return { title: t("title") };
}

/** The materials and colours the shop's filters list (#25): the owner fills them; they start empty. */
export default function AdminAttributesPage(props: PageProps<"/[locale]/admin/attributes">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <AdminAttributes {...props} />
    </Suspense>
  );
}

async function AdminAttributes({ params }: PageProps<"/[locale]/admin/attributes">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${ADMIN_ATTRIBUTES_HREF}`);
  const [t, terms] = await Promise.all([getTranslations("admin.taxonomy"), listAdminTerms(locale)]);

  return (
    <AdminShell>
      <div className="grid gap-8">
        <header className="grid gap-2">
          <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{t("title")}</h1>
          <p className="font-input text-sm">{t("intro")}</p>
        </header>
        {terms.ok ? (
          TAXONOMY_KINDS.map((kind) => (
            <TaxonomyList
              key={kind}
              kind={kind}
              terms={terms.data.filter((term) => term.kind === kind)}
              saveTerm={saveTerm}
              deleteTerm={deleteTerm}
            />
          ))
        ) : (
          <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
            {t("loadError")}
          </p>
        )}
      </div>
    </AdminShell>
  );
}
