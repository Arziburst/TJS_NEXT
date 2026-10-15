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

  it("passes over the notifications outbox daily at 06:00 UTC", () => {
    // the morning in Kyiv (08:00 or 09:00): retries that came due overnight reach the owner and the customers then
    expect(config.crons).toContainEqual({ path: "/api/cron/notifications", schedule: "0 6 * * *" });
  });

  it("has no other cron", () => {
    expect(config.crons.map((cron) => cron.path).sort()).toEqual([
      "/api/cron/fx-rates",
      "/api/cron/notifications",
      "/api/cron/nova-poshta",
    ]);
  });

  it("runs each cron at most once a day (Vercel Hobby, D32)", () => {
    for (const { schedule } of config.crons) {
      const [minute, hour] = schedule.split(" ");
      expect(minute, schedule).toMatch(/^\d+$/);
      expect(hour, schedule).toMatch(/^\d+$/);
    }
  });

  it("points at an existing route handler", () => {
    for (const { path } of config.crons) {
      expect(existsSync(new URL(`../../src/app${path}/route.ts`, import.meta.url))).toBe(true);
    }
  });
});
