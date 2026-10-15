import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  git: { deploymentEnabled: Record<string, boolean> };
};

// Vercel's rule: a branch deploys when at least one pattern it matches (minimatch) is true; unmatched ones deploy
function deploys(branch: string): boolean {
  const matches = Object.entries(config.git.deploymentEnabled).filter(([pattern]) => posix.matchesGlob(branch, pattern));
  return matches.length === 0 || matches.some(([, enabled]) => enabled);
}

describe("vercel.json git deployments (D14: no preview deployments)", () => {
  it("deploys main", () => {
    expect(deploys("main")).toBe(true);
  });

  it.each(["73-feat-vercel-insights", "assets/73", "dependabot/npm_and_yarn/next-16.5.0", "main-backup", "release"])(
    "never deploys %s",
    (branch) => {
      expect(deploys(branch)).toBe(false);
    },
  );
});
