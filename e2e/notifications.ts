// What the notifications stand-in (e2e/notifications-mock.ts, started by playwright.config.ts) got for an order.
const port = Number(process.env.E2E_PORT || 3000);
const mockUrl = `http://127.0.0.1:${Number(process.env.NOTIFICATIONS_MOCK_PORT || port + 2000)}`;

export type SentNotifications = {
  telegram: { chatId: string; text: string; parseMode: string }[];
  email: { to: string[]; subject: string; html: string; text: string; idempotencyKey: string | null }[];
};

export async function sentFor(number: number): Promise<SentNotifications> {
  const response = await fetch(`${mockUrl}/sent?number=${number}`);
  if (!response.ok) throw new Error(`notifications mock: HTTP ${response.status}`);
  return (await response.json()) as SentNotifications;
}
