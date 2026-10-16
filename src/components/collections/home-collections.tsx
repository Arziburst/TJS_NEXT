import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { collectionHref } from "@/components/catalog/links";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCachedCollections } from "@/lib/catalog/collections";

// a tile: the full width of the phone column (two per row from 768px, three from `sb`)
const COVER_SIZES = "(min-width: 64rem) 30vw, (min-width: 48rem) 45vw, 100vw";

/**
 * The home page's collections (#67): one tile per published collection with its cover and name, in the owner's
 * order; nothing at all while there are none. A cached read without a stale window, streamed into the static page.
 */
export async function HomeCollections({ locale }: { locale: Locale }) {
  const [collections, t] = await Promise.all([getCachedCollections(locale), getTranslations("home")]);
  if (!collections.ok || collections.data.length === 0) return null;

  return (
    <section aria-labelledby="home-collections" className="flex flex-col gap-6" data-testid="home-collections">
      <h2 id="home-collections" className="font-display text-4xl uppercase sb:text-5xl">
        {t("collections")}
      </h2>
      <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 sb:grid-cols-3">
        {collections.data.map((collection) => (
          <li key={collection.id}>
            <Link href={collectionHref(collection.slug)} className="group flex flex-col gap-3" data-testid="collection-tile">
              <span className="relative block aspect-[4/3] w-full overflow-hidden rounded bg-muted">
                {collection.cover && (
                  <Image
                    src={collection.cover.url}
                    alt=""
                    fill
                    sizes={COVER_SIZES}
                    quality={75}
                    placeholder={collection.cover.blurDataUrl ? "blur" : "empty"}
                    blurDataURL={collection.cover.blurDataUrl ?? undefined}
                    className="object-cover transition duration-500 group-hover:brightness-110 group-focus-visible:brightness-110"
                  />
                )}
              </span>
              <span
                lang={collection.locale !== locale ? collection.locale : undefined}
                className="font-sans text-sm font-semibold tracking-[1.6px] uppercase transition-colors group-hover:text-accent-text"
              >
                {collection.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
