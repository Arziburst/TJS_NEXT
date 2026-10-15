import { describe, expect, it } from "vitest";
import { checkMigrations, migrationVersion } from "../../scripts/ci/migration-versions.mjs";

const A = "20261015100000_create_products.sql";
const B = "20261015110000_create_orders.sql";
const C = "20261016100000_add_stock.sql";

function check(overrides: Partial<Parameters<typeof checkMigrations>[0]> = {}) {
  return checkMigrations({ localFiles: [], baseFiles: [], changes: [], openPrs: [], ...overrides });
}

describe("migrationVersion", () => {
  it("reads the 14-digit version of a valid name", () => {
    expect(migrationVersion(A)).toBe("20261015100000");
  });

  it.each([
    "2026101510000_short.sql",
    "202610151000000_long.sql",
    "20261015100000-dash.sql",
    "20261015100000_CamelCase.sql",
    "20261015100000_name.SQL",
    "20261015100000_.sql",
    "create_products.sql",
  ])("rejects %s", (name) => {
    expect(migrationVersion(name)).toBeNull();
  });
});

describe("checkMigrations", () => {
  it("passes a clean branch that adds a new version", () => {
    expect(check({ localFiles: [A, B, C, ".gitkeep"], baseFiles: [A, B, ".gitkeep"] })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("fails on a bad file name", () => {
    const { errors } = check({ localFiles: ["20261015_products.sql"] });
    expect(errors).toEqual([expect.stringContaining("20261015_products.sql: bad name")]);
  });

  it("fails on a duplicate version in the branch", () => {
    const { errors } = check({ localFiles: [A, "20261015100000_other.sql"] });
    expect(errors).toEqual([expect.stringContaining("version 20261015100000 is used by more than one file")]);
  });

  it("fails on an edited migration that exists on the base branch", () => {
    const { errors } = check({ localFiles: [A], baseFiles: [A], changes: [{ status: "M", file: A }] });
    expect(errors).toEqual([expect.stringContaining(`${A}: edited`)]);
  });

  it("fails on a deleted migration that exists on the base branch", () => {
    const { errors } = check({ localFiles: [], baseFiles: [A], changes: [{ status: "D", file: A }] });
    expect(errors).toEqual([expect.stringContaining(`${A}: deleted`)]);
  });

  it("ignores edits to the branch's own new migration", () => {
    const { errors } = check({ localFiles: [C], baseFiles: [A], changes: [{ status: "A", file: C }] });
    expect(errors).toEqual([]);
  });

  it("fails when an added version is already used on the base branch", () => {
    const { errors } = check({ localFiles: [A, "20261015100000_my_products.sql"], baseFiles: [A] });
    expect(errors).toContainEqual(
      expect.stringContaining("20261015100000_my_products.sql: version 20261015100000 is already used on the base branch"),
    );
  });

  it("fails when an added version is claimed by another open PR", () => {
    const { errors } = check({
      localFiles: [C],
      openPrs: [{ number: 42, files: ["20261016100000_their_change.sql"] }],
    });
    expect(errors).toEqual([expect.stringContaining("already claimed by open PR #42 (20261016100000_their_change.sql)")]);
  });

  it("does not count a PR's file that is already on the base branch", () => {
    const { errors } = check({ localFiles: [A, C], baseFiles: [A], openPrs: [{ number: 7, files: [A] }] });
    expect(errors).toEqual([]);
  });

  it("warns on an added version older than the latest on the base branch", () => {
    const { errors, warnings } = check({ localFiles: [A, C, "20261015120000_late.sql"], baseFiles: [A, C] });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining("20261015120000_late.sql: version 20261015120000 is older")]);
  });

  it("warns locally and fails in CI when open PRs could not be read", () => {
    const local = check({ localFiles: [C], openPrs: null, openPrsError: "gh not found" });
    expect(local.errors).toEqual([]);
    expect(local.warnings).toEqual(["open pull requests not checked: gh not found."]);

    const ci = check({ localFiles: [C], openPrs: null, openPrsError: "gh not found", strictOpenPrs: true });
    expect(ci.errors).toEqual(["open pull requests not checked: gh not found."]);
  });
});
