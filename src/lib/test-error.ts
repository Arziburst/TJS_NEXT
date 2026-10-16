import "server-only";

import { cookies } from "next/headers";

/*
 * Test-only (#112): lets an e2e test make a request fail on the server, to see the error pages
 * (e2e/error-boundary.e2e.ts). Off unless the server runs with TJS_TEST_ERROR_TRIGGER=true, which only the e2e
 * web server gets (playwright.config.ts), never a deployment; a production deployment refuses it outright.
 * With it on, the request's `tjs-test-error` cookie names the failure:
 * - `session`: reading the session fails as in an Auth outage (getCurrentUser throws SessionUnavailableError);
 * - `shell`: the header fails, so the root layout fails and the global error page shows.
 */
export const TEST_ERROR_COOKIE = "tjs-test-error";
export type TestErrorScope = "session" | "shell";

export async function testErrorRequested(scope: TestErrorScope): Promise<boolean> {
  if (process.env.TJS_TEST_ERROR_TRIGGER !== "true") return false;
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("TJS_TEST_ERROR_TRIGGER must never be set on a production deployment");
  }
  return (await cookies()).get(TEST_ERROR_COOKIE)?.value === scope;
}
