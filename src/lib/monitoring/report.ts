// Server code (src/instrumentation.ts); no "server-only": instrumentation is not built with the react-server
// condition. SENTRY_DSN is read at run time and never sent to a client.
import { scrub } from "./mask";

/*
 * Server errors the app did not handle (#31): Next hands every one to onRequestError (src/instrumentation.ts) —
 * render errors of pages, route handlers, Server Actions, the proxy. Each is logged once, as one JSON line with
 * the request id and without personal data: the path without its query, the error's type and a message with
 * e-mail addresses, phone numbers and tokens masked; never headers, cookies or bodies. With SENTRY_DSN set the
 * same event also goes to that Sentry-compatible endpoint (the provider is the owner's choice, TBD); without
 * it nothing is sent anywhere.
 */

export type ErrorContext = {
  requestId: string;
  method: string;
  /** the request path; its query is dropped here */
  path: string;
  /** render | route | action | proxy */
  routeType?: string;
  /** the route file, e.g. /[locale]/product/[slug] */
  routePath?: string;
};

export type ErrorEvent = {
  eventId: string;
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  routeType?: string;
  routePath?: string;
  errorType: string;
  message: string;
  digest?: string;
  stack?: string;
};

export { scrub };

function pathOnly(path: string): string {
  const end = path.search(/[?#]/);
  return scrub(end === -1 ? path : path.slice(0, end));
}

const MAX_MESSAGE = 1_000;
const MAX_STACK = 4_000;

/** The log and report event of an error, already scrubbed. */
export function errorEvent(error: unknown, context: ErrorContext): ErrorEvent {
  const isError = error instanceof Error;
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  return {
    eventId: crypto.randomUUID().replaceAll("-", ""),
    timestamp: new Date().toISOString(),
    requestId: context.requestId,
    method: context.method,
    path: pathOnly(context.path),
    routeType: context.routeType,
    routePath: context.routePath,
    errorType: isError ? error.name : typeof error,
    message: scrub(isError ? error.message : String(error)).slice(0, MAX_MESSAGE),
    digest,
    stack: isError && error.stack ? scrub(error.stack).slice(0, MAX_STACK) : undefined,
  };
}

// the errors already reported: React may hand the same error to more than one boundary of a render
const reported = new WeakSet<object>();
const reportedDigests = new Set<string>();
const MAX_DIGESTS = 1_000;

function alreadyReported(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (reported.has(error)) return true;
  reported.add(error);
  const digest = "digest" in error ? String(error.digest) : undefined;
  if (digest === undefined) return false;
  if (reportedDigests.has(digest)) return true;
  if (reportedDigests.size >= MAX_DIGESTS) reportedDigests.clear();
  reportedDigests.add(digest);
  return false;
}

/** Logs the error once and, with SENTRY_DSN set, reports it. Never throws. */
export async function reportServerError(error: unknown, context: ErrorContext): Promise<void> {
  try {
    if (alreadyReported(error)) return;
    const event = errorEvent(error, context);
    console.error(JSON.stringify({ level: "error", event: "server_error", ...event }));
    await sendToSentry(event);
  } catch {
    // monitoring must never turn one failure into two
  }
}

type Dsn = { endpoint: string; key: string; dsn: string };

/** The envelope endpoint and key of a Sentry DSN (https://<key>@<host>[/<path>]/<project>), or null. */
export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const segments = url.pathname.split("/").filter(Boolean);
    const project = segments.pop();
    if (!url.username || !project || !["https:", "http:"].includes(url.protocol)) return null;
    const prefix = segments.length > 0 ? `/${segments.join("/")}` : "";
    return { endpoint: `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`, key: url.username, dsn };
  } catch {
    return null;
  }
}

const SEND_TIMEOUT_MS = 2_000;

/** The Sentry envelope (https://develop.sentry.dev/sdk/envelopes/) of one error event. */
export function sentryEnvelope(event: ErrorEvent, dsn: string): string {
  const payload = {
    event_id: event.eventId,
    timestamp: event.timestamp,
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    transaction: event.routePath ?? event.path,
    tags: { request_id: event.requestId, route_type: event.routeType ?? "unknown", digest: event.digest },
    request: { method: event.method, url: event.path },
    exception: { values: [{ type: event.errorType, value: event.message }] },
    extra: { stack: event.stack },
  };
  return [
    JSON.stringify({ event_id: event.eventId, sent_at: new Date().toISOString(), dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(payload),
  ].join("\n");
}

async function sendToSentry(event: ErrorEvent): Promise<void> {
  const target = parseDsn(process.env.SENTRY_DSN);
  if (!target) return;
  try {
    await fetch(target.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=tjs-next/1`,
      },
      body: sentryEnvelope(event, target.dsn),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    console.error(JSON.stringify({ level: "warn", event: "error_report_failed", eventId: event.eventId }));
  }
}
