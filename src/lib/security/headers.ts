/*
 * The security headers of every response (#31, docs/standards.md "Security headers"). Imported by
 * next.config.ts (the static headers and the enforced policy, on every path) and src/proxy.ts (the strict
 * policy with a per-request nonce, report-only, on pages). No "server-only": next.config.ts and the proxy
 * bundle are not built with the react-server condition; nothing here is secret.
 *
 * Why scripts are enforced with 'unsafe-inline': a page is served as its prerendered static shell (PPR,
 * Cache Components) whose inline scripts (the Turbopack bootstrap, React's $RC runtime with page-dependent
 * boundary ids) were rendered at build or regeneration time, without a request and so without a nonce; only
 * the per-request part gets one. Hashes of those scripts change with the page's content and every build.
 * The strict nonce policy therefore runs as Content-Security-Policy-Report-Only until the pages render per
 * request (the follow-up of #31); every other directive is enforced now.
 */

type HeaderEntry = { key: string; value: string };

export type CspOptions = {
  /** Origins of the Supabase projects the browser talks to (Storage images, the photo upload's signed PUT). */
  supabaseOrigins: readonly string[];
  /** next dev: React needs eval for its error overlays and server stacks. */
  dev: boolean;
};

/** The origin of a URL, or null for a missing or malformed one. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function policy(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");
}

function directives({ supabaseOrigins, dev }: CspOptions, scriptSources: string[]): Record<string, string[]> {
  const supabase = [...new Set(supabaseOrigins)];
  return {
    "default-src": ["'self'"],
    "script-src": [...scriptSources, ...(dev ? ["'unsafe-eval'"] : [])],
    // React and Base UI set style attributes, next/font and Next inject inline <style>
    "style-src": ["'self'", "'unsafe-inline'"],
    // the image optimizer is same-origin (/_next/image); Storage URLs and the admin's local previews (blob:)
    "img-src": ["'self'", "data:", "blob:", ...supabase],
    "font-src": ["'self'", "data:"],
    // Server Actions, route handlers and Vercel Insights (/_vercel/*) are same-origin; the admin photo upload PUTs
    // to a signed Storage URL. Nova Poshta, Nova Post, Resend, Telegram and the AI Gateway are called from the
    // server only, so they are never listed here. next dev's HMR socket is same-origin (ws: for http).
    "connect-src": ["'self'", ...supabase, ...(dev ? ["ws:"] : [])],
    "frame-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
}

/**
 * The options of this deployment: the configured Supabase project (production's on production; the browser
 * sees other projects' photos only through the same-origin image optimizer).
 */
export function cspOptionsFromEnv(): CspOptions {
  const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return { supabaseOrigins: supabase ? [supabase] : [], dev: process.env.NODE_ENV === "development" };
}

/** The enforced Content-Security-Policy (see the comment at the top for 'unsafe-inline' in script-src). */
export function contentSecurityPolicy(options: CspOptions): string {
  return policy(directives(options, ["'self'", "'unsafe-inline'"]));
}

/**
 * The strict policy the shop moves to: scripts only from this origin or carrying the request's nonce. Sent as
 * Content-Security-Policy-Report-Only (violations show in the browser console, nothing is blocked); Next reads
 * the nonce from the request's copy of this header and puts it on the scripts it renders per request.
 */
export function strictContentSecurityPolicy(options: CspOptions, nonce: string): string {
  return policy(directives(options, ["'self'", `'nonce-${nonce}'`]));
}

/** A fresh nonce: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Headers for every response, whatever its type. */
export const BASE_SECURITY_HEADERS: readonly HeaderEntry[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // the shop uses none of these; the admin photo upload is a file input (the camera app opens through the OS
  // file picker, which no permission governs)
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()",
  },
  // the same as frame-ancestors 'none', for browsers without CSP level 2
  { key: "X-Frame-Options", value: "DENY" },
];

/**
 * HSTS, sent only on a request that reached the host over https (see next.config.ts). Two years, without
 * includeSubDomains: the shop's domain is not chosen yet and the flag would bind its other subdomains too
 * (docs/launch.md).
 */
export const HSTS_HEADER: HeaderEntry = { key: "Strict-Transport-Security", value: "max-age=63072000" };
