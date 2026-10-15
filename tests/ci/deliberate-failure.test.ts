import { expect, it } from "vitest";

// Throwaway (#11): proves that a failing unit test turns the required check `ci` red. Reverted next commit.
it("fails on purpose", () => {
  expect(1 + 1).toBe(3);
});
