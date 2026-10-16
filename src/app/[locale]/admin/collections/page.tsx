import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { ADMIN_COLLECTIONS_HREF, editCollectionHref, NEW_COLLECTION_HREF } from "@/components/admin/paths";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { listAdminCollections } from "@/lib/admin/collections";
import { getAdmin, requireAdmin } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  // nothing about the admin area for anyone else, not even its title
  if (!(await getAdmin())) return {};
  const t = await getTranslations("admin.collections");
  return { title: t("title") };
}

/** The collections (#67) in the owner's order, each with its state, pieces and sale; a button adds one. */
export default function AdminCollectionsPage(props: PageProps<"/[locale]/admin/collections">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <AdminCollections {...props} />
    </Suspense>
  );
}

async function AdminCollections({ params }: PageProps<"/[locale]/admin/collections">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${ADMIN_COLLECTIONS_HREF}`);
  const [t, tStatus, collections] = await Promise.all([
    getTranslations("admin.collections"),
    getTranslations("admin.status"),
    listAdminCollections(locale),
  ]);

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header className="grid gap-3">
          <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{t("title")}</h1>
          <p className="font-input text-sm">{t("intro")}</p>
          <Link href={NEW_COLLECTION_HREF} className={cn(buttonVariants({ className: "min-h-12 justify-self-start" }))}>
            <PlusIcon aria-hidden />
            {t("new")}
          </Link>
        </header>
        {collections === null ? (
          <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
            {t("loadError")}
          </p>
        ) : collections.length === 0 ? (
          <p className="text-sm">{t("empty")}</p>
        ) : (
          <ul className="grid gap-2" data-testid="admin-collections">
            {collections.map((collection) => (
              <li key={collection.id}>
                <Link
                  href={editCollectionHref(collection.id)}
                  className="flex min-h-16 items-center gap-3 border-2 border-hairline p-2 outline-none hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
                  data-testid="admin-collection"
                >
                  <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded bg-muted">
                    {collection.cover && <Image src={collection.cover.url} alt="" fill sizes="80px" quality={75} className="object-cover" />}
                  </span>
                  <span className="grid min-w-0 grow gap-1">
                    <span className="font-sans font-semibold break-words">{collection.name}</span>
                    <span className="flex flex-wrap items-center gap-2 font-input text-xs">
                      <Badge variant={collection.published ? "success" : "secondary"}>
                        {tStatus(collection.published ? "published" : "draft")}
                      </Badge>
                      {collection.hasSale && <Badge variant="accent">{t("onSale")}</Badge>}
                      <span>{t("productCount", { count: collection.productCount })}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
