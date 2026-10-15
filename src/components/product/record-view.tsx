"use client";

import { useEffect } from "react";
import { RECENTLY_VIEWED_COOKIE, RECENTLY_VIEWED_LIMIT, parseIdList, recordView, serializeIdList } from "@/lib/favorites/ids";

// technical: the recently viewed pieces outlive a browsing session, as the guest cart does
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

/*
 * Puts the product the visitor is looking at first in the recently viewed cookie, in the browser: a view costs
 * no request and nothing about it leaves the visitor's device until their next page load sends the cookie.
 */
export function RecordView({ productId }: { productId: string }) {
  useEffect(() => {
    const ids = recordView(parseIdList(readCookie(RECENTLY_VIEWED_COOKIE), RECENTLY_VIEWED_LIMIT), productId);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${RECENTLY_VIEWED_COOKIE}=${serializeIdList(ids, RECENTLY_VIEWED_LIMIT)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  }, [productId]);
  return null;
}
