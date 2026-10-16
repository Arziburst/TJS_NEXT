import { lineTitle } from "@/lib/cart/lines";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/money/format";
import { escapeHtml, truncate } from "./escape";
import type { NotificationOrder } from "./order";
import { deliveryMethodText, destinationLines, estimateText, orderMoney, placedAt, type NotificationsTranslator } from "./texts";

// The owner's message about a new order request (D11, D19), sent to the shop's Telegram group with parse_mode
// HTML. Every value from the order is escaped (the legacy message was not, D20); the tags come only from here.

// The owner reads the group in Ukrainian
export const TELEGRAM_LOCALE: Locale = "uk";

// Telegram refuses a text over 4096 characters: at most this many lines, each title cut to TITLE_MAX
// (a comment has at most 1000 characters), keeps the message well below it
export const TELEGRAM_MAX_LINES = 15;
const TITLE_MAX = 100;

export type TelegramConfig = { token: string; chatId: string; apiBaseUrl: string };

// retryAfterSeconds: the provider throttled the request and asks to wait that long (Telegram's 429)
export type SendResult = { ok: true } | { ok: false; error: string; retryAfterSeconds?: number };

/** The text of the owner's message about order `order`; `adminUrl` opens it in the admin (#27). */
export function renderTelegramOrder(
  order: NotificationOrder,
  { t, locale, adminUrl }: { t: NotificationsTranslator; locale: string; adminUrl: string },
): string {
  const e = escapeHtml;
  const name = [order.firstName, order.lastName].filter(Boolean).join(" ");
  const language = new Intl.DisplayNames([locale], { type: "language" }).of(order.locale) ?? order.locale;
  const tel = `tel:${order.phone.replace(/[^+0-9]/g, "")}`;

  const shown = order.lines.slice(0, TELEGRAM_MAX_LINES);
  const lines = shown.map(
    (line, index) =>
      `${index + 1}. ${e(t("telegram.line", { title: lineTitle(truncate(line.title, TITLE_MAX), line.variantLabel), quantity: line.quantity, total: orderMoney(order, line.lineMinor, locale) }))}`,
  );
  if (order.lines.length > shown.length) lines.push(e(t("telegram.moreLines", { count: order.lines.length - shown.length })));

  const total = orderMoney(order, order.totalMinor, locale);
  const totalUsd = formatMoney({ currency: "USD", amountMinor: order.totalUsdMinor, decimals: 2 }, locale);

  const blocks = [
    [`<b>${e(t("telegram.newOrder", { number: order.number }))}</b>`, e(t("telegram.placed", { date: placedAt(order, locale) }))],
    [
      `<b>${e(t("telegram.customer"))}:</b> ${e(name)}`,
      `${e(t("telegram.phone"))}: <a href="${e(tel)}">${e(order.phone)}</a>`,
      `${e(t("telegram.email"))}: ${e(order.email)}`,
      `${e(t("telegram.language"))}: ${e(language)}`,
    ],
    [
      `<b>${e(t("telegram.lines"))}:</b>`,
      ...lines,
      `<b>${e(t("telegram.goodsTotal"))}: ${e(total)}</b>${order.currency === "USD" ? "" : ` (${e(totalUsd)})`}`,
    ],
    [
      `<b>${e(t("telegram.delivery"))}:</b> ${e(deliveryMethodText(order, t))}`,
      ...destinationLines(order, t, locale).map(e),
      `${e(t("telegram.estimate"))}: ${e(estimateText(order.estimate, t, locale))}`,
    ],
    order.comment ? [`<b>${e(t("telegram.comment"))}:</b> ${e(order.comment)}`] : [],
    [`<a href="${e(adminUrl)}">${e(t("telegram.openAdmin"))}</a>`],
  ];
  return blocks
    .filter((block) => block.length > 0)
    .map((block) => block.join("\n"))
    .join("\n\n");
}

const TIMEOUT_MS = 10_000;
// a 429 without retry_after waits a minute; a retry_after beyond an hour is not trusted further than that
const TOO_MANY_REQUESTS_WAIT = 60;
const MAX_RETRY_AFTER = 3600;

/**
 * Sends `text` to the configured chat. The bot token is part of the API URL: no error, log line or result
 * ever carries the URL, and any text that comes back is scrubbed of the token.
 */
export async function sendTelegram(config: TelegramConfig, text: string, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const scrub = (message: string) => message.split(config.token).join("<token>").slice(0, 500);
  let response: Response;
  try {
    response = await fetchImpl(`${config.apiBaseUrl}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // the error's name and cause code only: a message could quote the request URL
    const code = (error as { cause?: { code?: unknown } })?.cause?.code;
    return { ok: false, error: scrub(`telegram: ${(error as Error)?.name ?? "Error"}${typeof code === "string" ? ` ${code}` : ""}`) };
  }
  const body = (await response.json().catch(() => null)) as { ok?: boolean; description?: unknown; parameters?: { retry_after?: unknown } } | null;
  if (response.ok && body?.ok === true) return { ok: true };
  const description = typeof body?.description === "string" ? `: ${body.description}` : "";
  const error = scrub(`telegram: HTTP ${response.status}${description}`);
  // flood control (about 20 messages a minute in a group): Telegram names how long to wait
  const retryAfter = body?.parameters?.retry_after;
  if (response.status === 429) {
    const seconds = typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : TOO_MANY_REQUESTS_WAIT;
    return { ok: false, error, retryAfterSeconds: Math.min(seconds, MAX_RETRY_AFTER) };
  }
  return { ok: false, error };
}
