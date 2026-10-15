import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs, run } from "../../scripts/ci/check-migration-versions.mjs";
import type { OpenPr } from "../../scripts/ci/migration-versions.mjs";

// End-to-end against a throwaway git repository: base branch "main", work branch "feature".

const BASE_A = "20261015100000_create_products.sql";
const BASE_B = "20261015110000_create_orders.sql";
const env = { CI: "false" };
const noPrs = () => [];

let repo: string;

function git(...args: string[]) {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

function head() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
}

function migration(name: string, sql = "select 1;\n") {
  writeFileSync(path.join(repo, "supabase/migrations", name), sql);
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "tjs-migrations-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  git("config", "core.autocrlf", "false");
  mkdirSync(path.join(repo, "supabase/migrations"), { recursive: true });
  migration(".gitkeep", "");
  migration(BASE_A);
  migration(BASE_B);
  git("add", ".");
  git("commit", "-q", "-m", "base");
  git("switch", "-q", "-c", "feature");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("check-migration-versions against a git repository", () => {
  it("passes a branch that adds a new, later version", () => {
    migration("20261016100000_add_stock.sql");
    git("add", ".");
    git("commit", "-q", "-m", "feature");
    expect(run({ cwd: repo, baseRef: "main", env, listOpenPrs: noPrs })).toMatchObject({ errors: [], warnings: [] });
  });

  it("fails on an edited base migration, committed or not", () => {
    appendFileSync(path.join(repo, "supabase/migrations", BASE_A), "select 2;\n");
    expect(run({ cwd: repo, baseRef: "main", env, listOpenPrs: noPrs }).errors).toEqual([
      expect.stringContaining(`${BASE_A}: edited`),
    ]);
    git("commit", "-q", "-am", "edit");
    expect(run({ cwd: repo, baseRef: "main", env, listOpenPrs: noPrs }).errors).toEqual([
      expect.stringContaining(`${BASE_A}: edited`),
    ]);
  });

  it("fails on a deleted base migration", () => {
    unlinkSync(path.join(repo, "supabase/migrations", BASE_B));
    expect(run({ cwd: repo, baseRef: "main", env, listOpenPrs: noPrs }).errors).toEqual([
      expect.stringContaining(`${BASE_B}: deleted`),
    ]);
  });

  it("fails on a bad name, a duplicate and a version used on base", () => {
    migration("2026-10-16_bad.sql");
    migration("20261016100000_one.sql");
    migration("20261016100000_two.sql");
    migration("20261015100000_reused.sql");
    const { errors } = run({ cwd: repo, baseRef: "main", env, listOpenPrs: noPrs });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("2026-10-16_bad.sql: bad name"),
        expect.stringContaining("version 20261016100000 is used by more than one file"),
        expect.stringContaining("version 20261015100000 is used by more than one file"),
        expect.stringContaining("20261015100000_reused.sql: version 20261015100000 is already used on the base branch"),
      ]),
    );
  });

  it("does not count a migration added on base after the branch started", () => {
    git("switch", "-q", "main");
    migration("20261017100000_later_on_main.sql");
    git("add", ".");
    git("commit", "-q", "-m", "main moves on");
    git("switch", "-q", "feature");
    migration("20261018100000_mine.sql");
    expect(run({ cwd: repo, baseRef: "main", env, listOpenPrs: noPrs }).errors).toEqual([]);
  });

  it("warns on an out-of-order version and fails on one claimed by another PR", () => {
    migration("20261015103000_between.sql");
    const report = run({
      cwd: repo,
      baseRef: "main",
      env,
      listOpenPrs: () => [{ number: 12, headRefName: "other", files: ["20261015103000_theirs.sql"] }],
    });
    expect(report.warnings).toEqual([expect.stringContaining("is older than the latest on the base branch")]);
    expect(report.errors).toEqual([expect.stringContaining("already claimed by open PR #12")]);
  });

  describe("this branch's own PR is not a conflict", () => {
    const MINE = "20261016100000_mine.sql";
    let prHead: string;

    beforeEach(() => {
      migration(MINE);
      git("add", ".");
      git("commit", "-q", "-m", "feature");
      prHead = head();
    });

    function report(prs: OpenPr[], options: { prNumber?: number } = {}) {
      return run({ cwd: repo, baseRef: "main", env, listOpenPrs: () => prs, ...options });
    }

    it("by its head ref", () => {
      expect(report([{ number: 21, headRefName: "feature", headSha: "0".repeat(40), files: [MINE] }]).errors).toEqual(
        [],
      );
    });

    it("by its head commit, on a branch under another name (a verifier's worktree)", () => {
      git("switch", "-q", "-c", "21-verify");
      expect(report([{ number: 21, headRefName: "feature", headSha: prHead, files: [MINE] }]).errors).toEqual([]);
    });

    it("by a head commit that HEAD contains (main merged in on an integration branch)", () => {
      git("switch", "-q", "main");
      migration("20261017100000_later_on_main.sql");
      git("add", ".");
      git("commit", "-q", "-m", "main moves on");
      git("switch", "-q", "-c", "integration", prHead);
      git("merge", "-q", "--no-edit", "main");
      expect(report([{ number: 21, headRefName: "feature", headSha: prHead, files: [MINE] }]).errors).toEqual([]);
    });

    it("but another PR with the same version still is, also when its head commit is unknown here", () => {
      git("switch", "-q", "-c", "21-verify");
      const other = { number: 22, headRefName: "other", headSha: "f".repeat(40), files: ["20261016100000_theirs.sql"] };
      const own = { number: 21, headRefName: "feature", headSha: prHead, files: [MINE] };
      expect(report([own, other]).errors).toEqual([expect.stringContaining("already claimed by open PR #22")]);
    });

    it("by an explicit --pr, which alone decides", () => {
      git("switch", "-q", "-c", "21-verify");
      git("commit", "-q", "--allow-empty", "-m", "verifier note");
      const own = { number: 21, headRefName: "feature", headSha: "e".repeat(40), files: [MINE] };
      expect(report([own]).errors).toEqual([expect.stringContaining("already claimed by open PR #21")]);
      expect(report([own], { prNumber: 21 }).errors).toEqual([]);
      const sameHead = { number: 23, headRefName: "21-verify", headSha: head(), files: [MINE] };
      expect(report([own, sameHead], { prNumber: 21 }).errors).toEqual([
        expect.stringContaining("already claimed by open PR #23"),
      ]);
    });
  });
});

describe("parseArgs", () => {
  it("reads --base and --pr", () => {
    expect(parseArgs([])).toEqual({ baseRef: undefined, prNumber: undefined });
    expect(parseArgs(["--base", "origin/main", "--pr", "42"])).toEqual({ baseRef: "origin/main", prNumber: 42 });
  });

  it("rejects a missing or non-numeric value", () => {
    expect(() => parseArgs(["--pr"])).toThrow("--pr needs a value");
    expect(() => parseArgs(["--pr", "--base", "main"])).toThrow("--pr needs a value");
    expect(() => parseArgs(["--pr", "#42"])).toThrow("--pr expects a PR number");
    expect(() => parseArgs(["--pr", "0"])).toThrow("--pr expects a PR number");
  });

  it("reports a gh failure as a warning locally and an error in CI", () => {
    const failing = () => {
      throw new Error("gh: command not found");
    };
    expect(run({ cwd: repo, baseRef: "main", env, listOpenPrs: failing }).warnings).toEqual([
      expect.stringContaining("open pull requests not checked: gh pr list failed (gh: command not found)"),
    ]);
    expect(run({ cwd: repo, baseRef: "main", env: { CI: "true" }, listOpenPrs: failing }).errors).toEqual([
      expect.stringContaining("open pull requests not checked"),
    ]);
  });

  it("fails clearly when the base ref is missing", () => {
    expect(run({ cwd: repo, baseRef: "origin/nope", env, listOpenPrs: noPrs }).errors).toEqual([
      expect.stringContaining("base ref origin/nope not found"),
    ]);
  });
});
