import type { SendResult } from "./telegram";

// The customer's emails through the Resend REST API (POST /emails). A plain fetch: one endpoint, no SDK needed.

export type EmailConfig = { apiKey: string; from: string; replyTo: string | null; apiUrl: string };

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Resend answers a repeated key (within 24 hours) without sending again: a retry after a lost answer is safe
  idempotencyKey: string;
};

const TIMEOUT_MS = 10_000;

export async function sendEmail(config: EmailConfig, message: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const scrub = (text: string) => text.split(config.apiKey).join("<key>").slice(0, 500);
  let response: Response;
  try {
    response = await fetchImpl(`${config.apiUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const code = (error as { cause?: { code?: unknown } })?.cause?.code;
    return { ok: false, error: scrub(`email: ${(error as Error)?.name ?? "Error"}${typeof code === "string" ? ` ${code}` : ""}`) };
  }
  if (response.ok) return { ok: true };
  const body = (await response.json().catch(() => null)) as { name?: unknown; message?: unknown } | null;
  const detail = [body?.name, body?.message].filter((part) => typeof part === "string").join(": ");
  return { ok: false, error: scrub(`email: HTTP ${response.status}${detail ? ` ${detail}` : ""}`) };
}
