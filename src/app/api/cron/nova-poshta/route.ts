import { novaPoshtaClient } from "@/lib/delivery/nova-poshta/client";
import { createDictionaryStore } from "@/lib/delivery/nova-poshta/dictionary-store";
import { refreshDictionary } from "@/lib/delivery/nova-poshta/refresh-job";
import { isAuthorizedCron } from "@/lib/money/cron-auth";

// Daily refresh of the cached Nova Poshta dictionaries (vercel.json crons). Called by Vercel Cron only; answers
// 401 to anyone without CRON_SECRET.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const store = createDictionaryStore();
  if (!store) {
    console.error("nova-poshta refresh: Supabase is not configured");
    return Response.json({ error: "notConfigured" }, { status: 500 });
  }

  try {
    const result = await refreshDictionary({ now: new Date(), store, client: novaPoshtaClient() });
    if (result.status !== "ok") console.error("nova-poshta refresh:", JSON.stringify(result));
    // a failed run keeps every cached answer; 502 makes it visible in the cron log
    return Response.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    console.error("nova-poshta refresh: the cache failed", error);
    return Response.json({ error: "unexpectedError" }, { status: 500 });
  }
}
