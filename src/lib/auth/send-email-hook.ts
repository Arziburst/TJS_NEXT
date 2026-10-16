import "server-only";

import { hasLocale } from "next-intl";
import { z } from "zod";
import { renderAuthEmail, type AuthEmailKind } from "@/emails/auth";
import type { RenderedEmail } from "@/emails/layout";
import { getMetadataBase } from "@/i18n/metadata";
import { loadMessages } from "@/i18n/messages";
import { routing, type Locale } from "@/i18n/routing";
import { readShopContacts } from "@/lib/notifications/contacts";
import type { EmailMessage } from "@/lib/notifications/resend";
import type { SendResult } from "@/lib/notifications/telegram";
import { notificationsTranslator } from "@/lib/notifications/texts";
import { authUrl } from "./site-url";
import { verifyWebhook, type WebhookHeaders } from "./webhook-signature";

// Supabase Auth's Send Email Hook (https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook): Auth hands
// every email to POST /api/auth/send-email instead of sending its one-language templates. Here the request is
// verified (Standard Webhooks signature, age, a replayed id), the email is rendered in the user's locale with the
// token-hash link to /<locale>/auth/confirm (#13, #28: it works on any device) and sent through the shop's email
// transport (#26). The token and the link are never logged.

// The part of the hook's payload this handler reads (the rest is ignored).
const payloadSchema = z.object({
  user: z.object({
    email: z.string().nullish(),
    new_email: z.string().nullish(),
    user_metadata: z.record(z.string(), z.unknown()).nullish(),
  }),
  email_data: z.object({
    email_action_type: z.string(),
    token_hash: z.string().nullish(),
    token_hash_new: z.string().nullish(),
    redirect_to: z.string().nullish(),
  }),
});

export type SendEmailHookPayload = z.infer<typeof payloadSchema>;

/** The `type` the confirm route passes to verifyOtp for each kind of email. */
export type ConfirmType = "email" | "recovery" | "email_change";

export type PlannedEmail = { kind: AuthEmailKind; to: string; tokenHash: string; confirmType: ConfirmType };

export type EmailPlan = { ok: true; emails: PlannedEmail[] } | { ok: false; reason: string };

function present(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * The emails one hook call sends. An email change with Secure Email Change on (double_confirm_changes) sends two:
 * the current address gets token_hash_new and the new one token_hash. The names are reversed in Auth's payload
 * for backward compatibility (the docs say so); with it off, only the new address gets token_hash.
 */
export function planAuthEmails(payload: SendEmailHookPayload): EmailPlan {
  const { user, email_data: data } = payload;
  const email = present(user.email);
  const tokenHash = present(data.token_hash);
  const one = (kind: AuthEmailKind, confirmType: ConfirmType): EmailPlan =>
    email && tokenHash ? { ok: true, emails: [{ kind, to: email, tokenHash, confirmType }] } : { ok: false, reason: "no address or token" };

  switch (data.email_action_type) {
    case "signup":
      return one("signup", "email");
    case "recovery":
      return one("recovery", "recovery");
    // not used by the shop today (no sign-in by email link); rendered in case it is switched on
    case "magiclink":
      return one("magicLink", "email");
    case "email_change": {
      const newEmail = present(user.new_email);
      const tokenHashNew = present(data.token_hash_new);
      const emails: PlannedEmail[] = [];
      if (email && tokenHashNew) emails.push({ kind: "emailChangeCurrent", to: email, tokenHash: tokenHashNew, confirmType: "email_change" });
      if (newEmail && tokenHash) emails.push({ kind: "emailChangeNew", to: newEmail, tokenHash, confirmType: "email_change" });
      return emails.length > 0 ? { ok: true, emails } : { ok: false, reason: "no address or token" };
    }
    default:
      return { ok: false, reason: `unsupported email type ${data.email_action_type}` };
  }
}

function localeFrom(value: unknown): Locale | null {
  return typeof value === "string" && hasLocale(routing.locales, value) ? value : null;
}

/**
 * The locale of the user's emails: the one stored in user_metadata (at sign-up, then on every change of
 * language while signed in), else the locale of the page the email was asked from (the redirect to
 * /<locale>/auth/confirm), else English.
 */
export function emailLocale(payload: SendEmailHookPayload): Locale {
  const stored = localeFrom(payload.user.user_metadata?.locale);
  if (stored) return stored;
  const redirect = present(payload.email_data.redirect_to);
  if (redirect && URL.canParse(redirect)) {
    const fromPage = localeFrom(new URL(redirect).pathname.split("/")[1]);
    if (fromPage) return fromPage;
  }
  return routing.defaultLocale;
}

/** The link in the email, on the shop's own origin (never the payload's redirect host). */
export function confirmLink(locale: Locale, tokenHash: string, type: ConfirmType): string {
  const url = new URL(authUrl(locale, "confirm"));
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}

export type EmailTransport = { ok: true; send: (message: EmailMessage) => Promise<SendResult> } | { ok: false; reason: string };

export type SendEmailHookDeps = {
  keys: Buffer[];
  /** true the first time an id is seen; false for a replay. May throw (then nothing is sent). */
  claim: (webhookId: string) => Promise<boolean>;
  render: (email: PlannedEmail, context: { locale: Locale; payload: SendEmailHookPayload }) => Promise<RenderedEmail>;
  transport: EmailTransport;
  now?: Date;
};

export type HookResponse = { status: number; body: Record<string, unknown> };

// The error shape Supabase Auth reads from a hook; its message may reach the API caller, so it never names more
// than the kind of failure.
function failure(status: number, message: string): HookResponse {
  return { status, body: { error: { http_code: status, message } } };
}

/** One call of the hook: verifies it, then sends its emails. Never throws. */
export async function handleSendEmailHook(
  request: { headers: WebhookHeaders; body: string },
  deps: SendEmailHookDeps,
): Promise<HookResponse> {
  const verified = verifyWebhook({ keys: deps.keys, headers: request.headers, body: request.body, now: deps.now });
  if (!verified.ok) {
    if (verified.reason === "no_secret") {
      console.error("auth email hook: SEND_EMAIL_HOOK_SECRET is not set");
      return failure(500, "the hook is not configured");
    }
    console.warn(`auth email hook: refused (${verified.reason})`);
    return failure(401, "invalid signature");
  }

  try {
    if (!(await deps.claim(verified.id))) {
      console.warn("auth email hook: refused (replayed id)");
      return failure(401, "invalid signature");
    }
  } catch (error) {
    console.error("auth email hook: the replay check failed", (error as Error)?.name ?? "Error");
    return failure(500, "the email could not be sent");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(request.body);
  } catch {
    return failure(400, "invalid payload");
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return failure(400, "invalid payload");
  const payload = parsed.data;
  const type = payload.email_data.email_action_type;

  const plan = planAuthEmails(payload);
  if (!plan.ok) {
    console.error(`auth email hook: ${type}: ${plan.reason}`);
    return failure(400, plan.reason.startsWith("unsupported") ? "unsupported email type" : "invalid payload");
  }
  if (!deps.transport.ok) {
    console.error(`auth email hook: ${type}: email ${deps.transport.reason}`);
    return failure(500, "email sending is not configured");
  }

  const locale = emailLocale(payload);
  const { send } = deps.transport;
  try {
    const results = await Promise.all(
      plan.emails.map(async (email) => {
        const rendered = await deps.render(email, { locale, payload });
        // a repeated key is answered without a second send (Resend keeps it for 24 hours)
        return send({ to: email.to, ...rendered, idempotencyKey: `auth-email/${verified.id}/${email.kind}` });
      }),
    );
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) {
      console.error(`auth email hook: ${type}: ${failed.error}`);
      return failure(500, "the email could not be sent");
    }
  } catch (error) {
    console.error(`auth email hook: ${type}: rendering or sending failed`, (error as Error)?.name ?? "Error");
    return failure(500, "the email could not be sent");
  }
  return { status: 200, body: {} };
}

/** The shop's own rendering of a planned email: the user's locale, the shop's name and contacts. */
export async function renderPlannedEmail(
  email: PlannedEmail,
  { locale, payload }: { locale: Locale; payload: SendEmailHookPayload },
): Promise<RenderedEmail> {
  const [t, messages, contacts] = await Promise.all([notificationsTranslator(locale), loadMessages(locale), readShopContacts()]);
  return renderAuthEmail(email.kind, {
    t,
    locale,
    link: confirmLink(locale, email.tokenHash, email.confirmType),
    email: present(payload.user.email) ?? email.to,
    newEmail: present(payload.user.new_email),
    shopName: contacts?.shopName ?? messages.common.brand,
    contacts,
    siteUrl: getMetadataBase(),
  });
}
