import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

describe("isAuthorizedCron", () => {
  it("accepts the bearer secret", () => {
    expect(isAuthorizedCron("Bearer s3cret-value", "s3cret-value")).toBe(true);
  });

  it.each([
    ["no header", null, "s3cret-value"],
    ["a wrong secret", "Bearer other", "s3cret-value"],
    ["the secret without Bearer", "s3cret-value", "s3cret-value"],
    ["a prefix of the secret", "Bearer s3cret", "s3cret-value"],
    ["an unset secret", "Bearer ", undefined],
    ["an empty secret", "Bearer ", ""],
  ])("rejects %s", (_, header, secret) => {
    expect(isAuthorizedCron(header, secret)).toBe(false);
  });
});
