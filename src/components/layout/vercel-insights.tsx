import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/*
 * Vercel Web Analytics (visits) and Speed Insights (real-user Web Vitals), on production deployments only:
 * Vercel sets VERCEL_ENV for the build and the functions; local builds, CI and next dev leave it unset, so they
 * never load the scripts or count visits. Both are cookieless and the shop sends no custom events.
 */
export function VercelInsights() {
  if (process.env.VERCEL_ENV !== "production") return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
