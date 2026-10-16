// Used by src/proxy.ts only (no "server-only": the proxy bundle is not built with the react-server condition).
import type { NextRequest, NextResponse } from "next/server";
import { REQUEST_ID_HEADER } from "@/lib/monitoring/request-id";
import { createNonce, cspOptionsFromEnv, strictContentSecurityPolicy } from "./headers";

const REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

export type ApplySecurity = (response: NextResponse) => NextResponse;

/**
 * Per page request: a request id (src/lib/monitoring/ logs server errors with it) and the strict policy with
 * a fresh nonce, both put on the request before the routing steps forward it (Next reads the nonce from the
 * request's policy header and puts it on the scripts it renders) and, through the returned function, on the
 * response. The enforced policy comes from next.config.ts for every path.
 */
export function securePageRequest(request: NextRequest): ApplySecurity {
  const requestId = crypto.randomUUID();
  const policy = strictContentSecurityPolicy(cspOptionsFromEnv(), createNonce());
  // a client's own policy header would otherwise choose the nonce Next renders with
  request.headers.delete("content-security-policy");
  request.headers.set(REPORT_ONLY_HEADER, policy);
  request.headers.set(REQUEST_ID_HEADER, requestId);
  return (response) => {
    response.headers.set(REPORT_ONLY_HEADER, policy);
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  };
}
