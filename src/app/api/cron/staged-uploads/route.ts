import { sweepStagedUploads } from "@/lib/admin/staged-sweep";
import { isAuthorizedCron } from "@/lib/money/cron-auth";
import { createServiceClient } from "@/lib/supabase/server";

// Daily removal of abandoned photo uploads from the private staging bucket (vercel.json crons). Called by
// Vercel Cron only; answers 401 to anyone without CRON_SECRET.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = createServiceClient();
  } catch {
    console.error("staged-uploads sweep: Supabase is not configured");
    return Response.json({ error: "notConfigured" }, { status: 500 });
  }

  const result = await sweepStagedUploads(client, { now: new Date() });
  if (result.status !== "ok") console.error("staged-uploads sweep:", JSON.stringify(result));
  // a failed run leaves the files for the next day; 502 makes it visible in the cron log
  return Response.json(result, { status: result.status === "failed" ? 502 : 200 });
}
