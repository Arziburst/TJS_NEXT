import { HeartIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CountBadge } from "@/components/cart/cart-icon";
import { FavoritesSlot } from "@/components/layout/header-slots";
import { routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import { getFavoriteIds } from "@/lib/favorites";
import { FavoritesSync } from "./favorites-sync";

/*
 * The header's favorites: the heart with the number of favorites, a link to the favorites page. The list is
 * request-time data, so it streams in; the placeholder is the plain heart link in the same 44px box, so nothing
 * shifts (#57). It also hands the list to the hearts of the page (FavoritesSync): the catalog stays cached.
 */
export function FavoritesHeaderSlot() {
  return (
    <Suspense fallback={<FavoritesSlot />}>
      <FavoritesHeaderValue />
    </Suspense>
  );
}

async function FavoritesHeaderValue() {
  const [favorites, t, format] = await Promise.all([getFavoriteIds(), getTranslations("nav"), getFormatter()]);
  const ids = favorites.ok ? favorites.ids : [];
  const count = ids.length;

  return (
    <>
      {favorites.ok && <FavoritesSync ids={ids} pendingMerge={favorites.pendingMerge} />}
      <Link
        href={routes.favorites.path}
        aria-label={t("favoritesCount", { count })}
        className="relative inline-flex size-11 items-center justify-center transition-opacity hover:opacity-70 focus-visible:opacity-70 [&_svg]:size-5"
      >
        <HeartIcon aria-hidden />
        {count > 0 && <CountBadge formatted={format.number(count)} testId="favorites-count" />}
      </Link>
    </>
  );
}
