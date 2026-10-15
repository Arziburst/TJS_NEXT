import "server-only";

import { cookies } from "next/headers";
import { RECENTLY_VIEWED_COOKIE, RECENTLY_VIEWED_LIMIT, parseIdList } from "./ids";

/** The visitor's recently viewed product ids, newest first. Request-time data: render callers inside <Suspense>. */
export async function readRecentlyViewed(): Promise<string[]> {
  return parseIdList((await cookies()).get(RECENTLY_VIEWED_COOKIE)?.value, RECENTLY_VIEWED_LIMIT);
}
