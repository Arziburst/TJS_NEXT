import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  crons: { path: string; schedule: string }[];
};

describe("vercel.json crons", () => {
  it("runs the rates job daily at 14:15 UTC", () => {
    // Vercel Cron runs on UTC only: 14:15 UTC is 16:15 in Kyiv in winter (EET) and 17:15 in summer (EEST),
    // always after NBU publishes the next day's rates at 15:30 Kyiv
    expect(config.crons).toContainEqual({ path: "/api/cron/fx-rates", schedule: "15 14 * * *" });
  });

  it("refreshes the Nova Poshta dictionaries daily at 02:30 UTC", () => {
    // a quiet hour in Kyiv (04:30 or 05:30), once a day as the Hobby plan allows
    expect(config.crons).toContainEqual({ path: "/api/cron/nova-poshta", schedule: "30 2 * * *" });
  });

  it("sweeps abandoned photo uploads daily at 03:45 UTC", () => {
    // once a day as the Hobby plan allows (up to 100 daily crons per project)
    expect(config.crons).toContainEqual({ path: "/api/cron/staged-uploads", schedule: "45 3 * * *" });
  });

  it("has no other cron", () => {
    expect(config.crons.map((cron) => cron.path).sort()).toEqual([
      "/api/cron/fx-rates",
      "/api/cron/nova-poshta",
      "/api/cron/staged-uploads",
    ]);
  });

  it("points at an existing route handler", () => {
    for (const { path } of config.crons) {
      expect(existsSync(new URL(`../../src/app${path}/route.ts`, import.meta.url))).toBe(true);
    }
  });
});
