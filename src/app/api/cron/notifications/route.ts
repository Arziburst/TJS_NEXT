import { isAuthorizedCron } from "@/lib/money/cron-auth";
import { runNotifications } from "@/lib/notifications/run";

// The daily pass over the notifications outbox (vercel.json crons): sends what the run after an order could not,
// once its retry is due. Every placed order also starts a run right away (after() in the checkout action).
// Called by Vercel Cron only; answers 401 to anyone without CRON_SECRET.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const report = await runNotifications();
    // counts only: no order data and no setting in the cron log
    if (report.failed > 0 || report.retried > 0) console.error("notifications:", JSON.stringify(report));
    // a message that failed for good makes the run visible in the cron log
    return Response.json(report, { status: report.failed > 0 ? 502 : 200 });
  } catch (error) {
    console.error("notifications: the run failed", error);
    return Response.json({ error: "unexpectedError" }, { status: 500 });
  }
}
