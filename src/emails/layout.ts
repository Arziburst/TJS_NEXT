import { escapeHtml } from "@/lib/notifications/escape";
import type { ContactChannel, ShopContacts } from "@/lib/notifications/contacts";
import type { NotificationsTranslator } from "@/lib/notifications/texts";

// The frame of every customer email: plain HTML with inline styles and tables (what mail clients render), and the
// parts the emails share. Every text passed in is plain text and is escaped here; only these helpers write tags.

export type RenderedEmail = { subject: string; html: string; text: string };

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#1f1f1f";
const MUTED = "#5c5652";
const HAIRLINE = "#e5e0da";
const PAPER = "#f6f4f1";

export const e = escapeHtml;

export function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:normal;color:${INK};">${e(text)}</h1>`;
}

export function subheading(text: string): string {
  return `<h2 style="margin:28px 0 8px;font-family:${FONT};font-size:13px;line-height:1.4;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${INK};">${e(text)}</h2>`;
}

export function paragraph(text: string, { muted = false, small = false } = {}): string {
  return `<p style="margin:0 0 12px;font-size:${small ? 14 : 16}px;color:${muted ? MUTED : INK};">${e(text)}</p>`;
}

/** A two-column row: a label (with an optional note under it) and an amount on the right. */
export function amountRow(label: string, amount: string, { note, strong = false }: { note?: string; strong?: boolean } = {}): string {
  const weight = strong ? "bold" : "normal";
  const noteHtml = note ? `<br><span style="font-size:14px;color:${MUTED};">${e(note)}</span>` : "";
  return `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};font-weight:${weight};vertical-align:top;">${e(label)}${noteHtml}</td>
<td align="right" style="padding:10px 0 10px 16px;border-bottom:1px solid ${HAIRLINE};font-weight:${weight};white-space:nowrap;vertical-align:top;">${e(amount)}</td>
</tr>`;
}

export function amountTable(rows: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${HAIRLINE};font-size:16px;color:${INK};">
${rows.join("\n")}
</table>`;
}

function channelText(channel: ContactChannel, t: NotificationsTranslator): string {
  const name = t(`email.channel.${channel.kind}`);
  return "text" in channel ? `${name}: ${channel.text}` : name;
}

/** The shop's channels as links (D19), or the visible TBD line while none is configured. */
export function contactsHtml(contacts: ShopContacts | null, t: NotificationsTranslator): string {
  const title = subheading(t("email.contactTitle"));
  if (!contacts || contacts.channels.length === 0) return `${title}${paragraph(t("email.contactTbd"))}`;
  const items = contacts.channels
    .map(
      (channel) =>
        `<li style="margin:0 0 6px;"><a href="${e(channel.href)}" style="color:${INK};text-decoration:underline;">${e(channelText(channel, t))}</a></li>`,
    )
    .join("\n");
  return `${title}<ul style="margin:0;padding:0 0 0 18px;font-size:16px;color:${INK};">\n${items}\n</ul>`;
}

export function contactsText(contacts: ShopContacts | null, t: NotificationsTranslator): string[] {
  if (!contacts || contacts.channels.length === 0) return [t("email.contactTitle"), t("email.contactTbd")];
  return [
    t("email.contactTitle"),
    ...contacts.channels.map((channel) => ("text" in channel ? channelText(channel, t) : `${channelText(channel, t)}: ${channel.href}`)),
  ];
}

/** The whole document around `body` (already HTML from the helpers above). */
export function emailDocument({
  locale,
  title,
  preheader,
  body,
  footer,
}: {
  locale: string;
  title: string;
  preheader: string;
  body: string;
  footer: string;
}): string {
  return `<!DOCTYPE html>
<html lang="${e(locale)}" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${HAIRLINE};">
<tr><td style="padding:32px 24px;font-family:${FONT};font-size:16px;line-height:1.5;color:${INK};">
${body}
</td></tr>
</table>
<p style="max-width:600px;margin:16px auto 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">${e(footer)}</p>
</td></tr>
</table>
</body>
</html>`;
}
