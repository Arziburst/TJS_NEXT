import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  createCoverUpload,
  deleteCollection,
  finishCoverUpload,
  removeCollectionSale,
  removeCover,
  saveCollection,
  saveCollectionSale,
  setCollectionProducts,
} from "@/app/[locale]/admin/collections/actions";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { CollectionCover } from "@/components/admin/collection-cover";
import { CollectionForm } from "@/components/admin/collection-form";
import { CollectionProducts } from "@/components/admin/collection-products";
import { DeleteCollectionButton } from "@/components/admin/delete-collection-button";
import { ADMIN_COLLECTIONS_HREF, editCollectionHref } from "@/components/admin/paths";
import { SaleEditor } from "@/components/admin/sale-editor";
import { collectionHref } from "@/components/catalog/links";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getAdminCollection, listPickableProducts, type AdminCollection } from "@/lib/admin/collections";
import { getAdminSale } from "@/lib/admin/sales";
import { getAdmin, requireAdmin } from "@/lib/auth/session";
import { collectionSlugFor } from "@/lib/catalog/collection-path";
import { MAX_IMAGE_BYTES } from "@/lib/images/encode";
import { cn } from "@/lib/utils";

// No collection is known at build time; one id no collection has lets the build prerender the route's shell, every
// real id renders at request time behind the admin check (as the product edit page).
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

export function generateStaticParams() {
  return [{ id: UNKNOWN_ID }];
}

function nameOf(collection: AdminCollection, locale: Locale): string {
  return collection.translations[locale]?.name ?? collection.translations.uk?.name ?? Object.values(collection.translations)[0]?.name ?? "";
}

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/collections/[id]">): Promise<Metadata> {
  if (!(await getAdmin())) return {};
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const [t, collection] = await Promise.all([getTranslations("admin.collections"), getAdminCollection(id, locale)]);
  return { title: collection.ok ? t("editTitleOf", { name: nameOf(collection.data, locale) }) : t("editTitle") };
}

export default function EditCollectionPage(props: PageProps<"/[locale]/admin/collections/[id]">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <EditCollection {...props} />
    </Suspense>
  );
}

async function EditCollection({ params }: PageProps<"/[locale]/admin/collections/[id]">) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${editCollectionHref(id)}`);
  const [t, collection, pickable, sale] = await Promise.all([
    getTranslations("admin.collections"),
    getAdminCollection(id, locale),
    listPickableProducts(locale),
    getAdminSale("collection", id),
  ]);
  if (!collection.ok && collection.reason === "notFound") notFound();

  const loadError = (
    <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
      {t("loadError")}
    </p>
  );
  if (!collection.ok) {
    return <AdminShell>{loadError}</AdminShell>;
  }
  const { data } = collection;
  const name = nameOf(data, locale);
  const slugs = Object.entries(data.translations).map(([l, tr]) => ({ locale: l, slug: tr.slug }));
  const shopSlug = data.published ? collectionSlugFor(slugs, locale) : null;

  return (
    <AdminShell>
      <div className="grid gap-8">
        <header className="grid gap-2">
          <Link
            href={ADMIN_COLLECTIONS_HREF}
            className="inline-flex min-h-11 items-center gap-1.5 justify-self-start font-sans text-sm underline-offset-4 hover:text-accent-text hover:underline"
          >
            <ArrowLeftIcon aria-hidden className="size-4" />
            {t("back")}
          </Link>
          <h1 className="text-xl font-bold tracking-[0.2em] break-words uppercase sb:text-2xl">{name || t("editTitle")}</h1>
          {shopSlug && (
            <Link
              href={collectionHref(shopSlug)}
              className={cn(buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 justify-self-start" }))}
            >
              <ExternalLinkIcon aria-hidden />
              {t("viewInShop")}
            </Link>
          )}
        </header>

        <CollectionForm
          key="form"
          collection={{ id: data.id, published: data.published, position: data.position, translations: data.translations }}
          saveCollection={saveCollection}
        />

        {pickable === null ? (
          loadError
        ) : (
          <CollectionProducts
            key="products"
            collectionId={data.id}
            products={data.products}
            pickable={pickable}
            setCollectionProducts={setCollectionProducts}
          />
        )}

        {sale === undefined ? (
          loadError
        ) : (
          <SaleEditor
            key="sale"
            target="collection"
            id={data.id}
            sale={sale}
            regularUsdMinor={null}
            save={saveCollectionSale}
            remove={removeCollectionSale}
          />
        )}

        <CollectionCover
          key="cover"
          collectionId={data.id}
          cover={data.cover}
          maxBytes={MAX_IMAGE_BYTES}
          actions={{ createCoverUpload, finishCoverUpload, removeCover }}
        />

        <section aria-labelledby="collection-danger" className="grid gap-3 border-t-2 border-hairline pt-6">
          <h2 id="collection-danger" className="font-sans text-lg font-semibold">
            {t("sections.danger")}
          </h2>
          <DeleteCollectionButton collectionId={data.id} name={name} deleteCollection={deleteCollection} />
        </section>
      </div>
    </AdminShell>
  );
}
