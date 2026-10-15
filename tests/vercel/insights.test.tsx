import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VercelInsights } from "@/components/layout/vercel-insights";

function renderedTypes(): unknown[] {
  const element = VercelInsights();
  if (element === null) return [];
  const { children } = (element as ReactElement<{ children: ReactNode }>).props;
  return (Array.isArray(children) ? children : [children]).filter(isValidElement).map(({ type }) => type);
}

describe("VercelInsights", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders Web Analytics and Speed Insights on a Vercel production deployment", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(renderedTypes()).toEqual([Analytics, SpeedInsights]);
  });

  it.each(["preview", "development", ""])("renders nothing when VERCEL_ENV is %j", (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    expect(VercelInsights()).toBeNull();
  });

  it("renders nothing outside Vercel (local builds, CI, next dev)", () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    expect(VercelInsights()).toBeNull();
  });
});
