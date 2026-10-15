"use client";

import { useSyncExternalStore } from "react";

/*
 * The visitor's favorites in the browser, shared by every heart on the page. The server's list arrives with the
 * header's streamed slot (FavoritesSync), so the cached catalog pages never render per-visitor state; a heart
 * shows its own pending wish on top (optimistic) until the server answers, and falls back to the server's list
 * when the change fails.
 */

let serverIds: ReadonlySet<string> = new Set();
// the latest wish per product while its change is on the way, with the number of that request
const pending = new Map<string, { favorite: boolean; request: number }>();
let requests = 0;
// the request whose answer last set serverIds: an older answer that arrives later is ignored
let appliedRequest = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isFavorite(productId: string): boolean {
  return pending.get(productId)?.favorite ?? serverIds.has(productId);
}

/** The server's list, as the header rendered it (on every load and refresh). */
export function setServerFavorites(ids: readonly string[]) {
  serverIds = new Set(ids);
  emit();
}

/** Marks a wish as pending and answers its request number for `settleFavorite`. */
export function wishFavorite(productId: string, favorite: boolean): number {
  const request = ++requests;
  pending.set(productId, { favorite, request });
  emit();
  return request;
}

/**
 * Ends a wish: with the server's new list on success, without one on failure (the heart then shows the server's
 * state again — the rollback). Only the latest wish of a product clears its pending state.
 */
export function settleFavorite(productId: string, request: number, ids: readonly string[] | null) {
  if (ids && request > appliedRequest) {
    appliedRequest = request;
    serverIds = new Set(ids);
  }
  if (pending.get(productId)?.request === request) pending.delete(productId);
  emit();
}

/** Whether the product is a favorite; false while the server's list has not arrived (and on the server). */
export function useIsFavorite(productId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isFavorite(productId),
    () => false,
  );
}
