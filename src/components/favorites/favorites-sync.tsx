"use client";

import { useEffect, useRef } from "react";
import { mergeGuestFavorites } from "@/app/[locale]/favorites/actions";
import { setServerFavorites } from "./favorites-store";

type FavoritesSyncProps = {
  /** The visitor's favorites as the server read them on this render, newest first. */
  ids: readonly string[];
  /** A signed-in shopper still has a guest favorites cookie: write it into the account once. */
  pendingMerge: boolean;
};

/*
 * Rendered by the header's streamed favorites slot: hands the server's list to every heart on the page, and,
 * after a sign-in, merges the guest favorites into the account once (idempotent; the hearts already show the
 * merged list, so a failed or repeated call changes nothing visible).
 */
export function FavoritesSync({ ids, pendingMerge }: FavoritesSyncProps) {
  const key = ids.join(",");
  useEffect(() => {
    setServerFavorites(key ? key.split(",") : []);
  }, [key]);

  const merging = useRef(false);
  useEffect(() => {
    if (!pendingMerge || merging.current) return;
    merging.current = true;
    void mergeGuestFavorites();
  }, [pendingMerge]);
  return null;
}
