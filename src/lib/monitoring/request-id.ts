/** The request header carrying the id src/proxy.ts gives every page request (also sent back on the response). */
export const REQUEST_ID_HEADER = "x-request-id";

// Vercel's own id of the request, on every request there (pages, API routes, crons)
const HOST_REQUEST_ID_HEADER = "x-vercel-id";

type HeaderBag = { [key: string]: string | string[] | undefined };

// an id is only ever correlated, never trusted; this keeps a client-sent one from forging log lines
const SAFE_ID = /^[\w:.-]{1,128}$/;

function first(value: string | string[] | undefined): string | undefined {
  const id = Array.isArray(value) ? value[0] : value;
  return id !== undefined && SAFE_ID.test(id) ? id : undefined;
}

/** The request's id: the proxy's, else the host's, else a new one (an API route outside the proxy, locally). */
export function requestIdOf(headers: HeaderBag): string {
  return first(headers[REQUEST_ID_HEADER]) ?? first(headers[HOST_REQUEST_ID_HEADER]) ?? crypto.randomUUID();
}
