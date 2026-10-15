import { revalidateTag } from "next/cache";
import { FX_CACHE_TAG } from "@/lib/money/cache";
import { isAuthorizedCron } from "@/lib/money/cron-auth";
import { refreshRates } from "@/lib/money/rates-job";
import { createRatesStore } from "@/lib/money/store";

// Daily NBU rates (vercel.json crons). Called by Vercel Cron only; answers 401 to anyone without CRON_SECRET.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const store = createRatesStore();
  if (!store) {
    console.error("fx-rates: Supabase is not configured");
    return Response.json({ error: "notConfigured" }, { status: 500 });
  }

  try {
    const result = await refreshRates({ now: new Date(), store });
    if (result.stored > 0) revalidateTag(FX_CACHE_TAG, "max");
    if (result.status !== "ok") console.error("fx-rates:", JSON.stringify(result));
    // a failed run keeps every last stored rate; 502 makes it visible in the cron log
    return Response.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    console.error("fx-rates: storing failed", error);
    return Response.json({ error: "unexpectedError" }, { status: 500 });
  }
}
