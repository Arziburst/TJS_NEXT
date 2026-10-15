/**
 * A redirect with a relative Location, so the browser stays on the host it used (the session cookies were
 * just set for that host; `request.url` may name another one, e.g. localhost behind 127.0.0.1).
 */
export function redirectTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}
