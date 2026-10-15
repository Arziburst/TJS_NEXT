import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  crons: { path: string; schedule: string }[];
};

describe("vercel.json crons", () => {
  it("runs the rates job daily at 14:15 UTC", () => {
    // Vercel Cron runs on UTC only: 14:15 UTC is 16:15 in Kyiv in winter (EET) and 17:15 in summer (EEST),
    // always after NBU publishes the next day's rates at 15:30 Kyiv
    expect(config.crons).toEqual([{ path: "/api/cron/fx-rates", schedule: "15 14 * * *" }]);
  });

  it("points at an existing route handler", () => {
    for (const { path } of config.crons) {
      expect(existsSync(new URL(`../../src/app${path}/route.ts`, import.meta.url))).toBe(true);
    }
  });
});
