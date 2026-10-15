import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("px-2", false, undefined, "py-1")).toBe("px-2 py-1");
  });

  it("lets a later Tailwind class override a conflicting earlier one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
