import { describe, expect, it } from "vitest";
import { orderDateTime } from "./order-time";

describe("orderDateTime", () => {
  it("shows the time on the Kyiv clock, summer and winter, whatever the server's zone", () => {
    // 09:30 UTC is 12:30 in Kyiv in summer (UTC+3) and 11:30 in winter (UTC+2)
    expect(orderDateTime("2026-10-15T09:30:00Z", "uk")).toMatch(/15.*2026.*12:30/);
    expect(orderDateTime("2026-12-15T09:30:00Z", "uk")).toMatch(/15.*2026.*11:30/);
  });

  it("is formatted per locale", () => {
    expect(orderDateTime("2026-10-15T09:30:00Z", "en")).toBe("Oct 15, 2026, 12:30 PM");
    expect(orderDateTime("2026-10-15T09:30:00Z", "de")).toBe("15.10.2026, 12:30");
  });

  it("puts a step just after midnight in Kyiv on the Kyiv date", () => {
    // 22:10 UTC on the 15th is 01:10 on the 16th in Kyiv
    expect(orderDateTime("2026-10-15T22:10:00Z", "de")).toBe("16.10.2026, 01:10");
  });
});
