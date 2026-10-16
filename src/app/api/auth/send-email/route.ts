import { claimWebhookReceipt } from "@/lib/auth/rate-limit";
import { handleSendEmailHook, hookTransport, renderPlannedEmail } from "@/lib/auth/send-email-hook";
import { webhookKeys } from "@/lib/auth/webhook-signature";
import { notificationConfig } from "@/lib/notifications/config";

// Supabase Auth's Send Email Hook (#99, src/lib/auth/send-email-hook.ts): called by Auth only, signed with
// SEND_EMAIL_HOOK_SECRET (docs/dev-environment.md). Everything else is refused with 401.
export async function POST(request: Request) {
  const result = await handleSendEmailHook(
    {
      headers: {
        id: request.headers.get("webhook-id"),
        timestamp: request.headers.get("webhook-timestamp"),
        signature: request.headers.get("webhook-signature"),
      },
      body: await request.text(),
    },
    {
      keys: webhookKeys(process.env.SEND_EMAIL_HOOK_SECRET),
      claim: (id) => claimWebhookReceipt("send-email", id),
      render: renderPlannedEmail,
      transport: hookTransport(notificationConfig().email),
    },
  );
  return Response.json(result.body, { status: result.status });
}
