// npm run check:migrations [-- --base <ref>] [-- --pr <n>]
// Checks supabase/migrations against the base branch and the open pull requests (rules in
// migration-versions.mjs). Base ref: --base, else $MIGRATIONS_BASE_REF, else origin/$GITHUB_BASE_REF,
// else origin/main. Open PRs come from `gh`; when gh is missing or fails this is a warning locally and
// an error in CI ($CI=true). This branch's own PR is not a conflict: --pr <n> names it, else it is the PR
// whose head ref is the current branch or whose head commit HEAD is or contains (a verifier's worktree,
// an integration branch). Remote migration history and unpushed branches stay a manual check.

import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MIGRATIONS_DIR, checkMigrations, isOwnPr } from "./migration-versions.mjs";

/**
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** @param {string} text */
function lines(text) {
  return text.split(/\r?\n/).filter(Boolean);
}

/**
 * Every open PR with its head and the migration files it adds or changes.
 * @param {{ cwd: string }} options
 * @returns {import("./migration-versions.mjs").OpenPr[]}
 */
export function listOpenPrsWithGh({ cwd }) {
  const out = execFileSync(
    "gh",
    ["pr", "list", "--state", "open", "--limit", "200", "--json", "number,headRefName,headRefOid,files"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  /** @type {{ number: number, headRefName: string, headRefOid: string, files: { path: string }[] }[]} */
  const prs = JSON.parse(out);
  return prs.map((pr) => ({
    number: pr.number,
    headRefName: pr.headRefName,
    headSha: pr.headRefOid,
    files: pr.files
      .map((f) => f.path)
      .filter((p) => p.startsWith(`${MIGRATIONS_DIR}/`))
      .map((p) => path.posix.basename(p)),
  }));
}

/**
 * True when HEAD is, or contains, the commit; false for a commit that is unknown here.
 * @param {string} cwd
 * @param {string} sha
 */
function headContains(cwd, sha) {
  try {
    git(cwd, ["merge-base", "--is-ancestor", sha, "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   cwd?: string,
 *   baseRef?: string,
 *   prNumber?: number,
 *   env?: Record<string, string | undefined>,
 *   listOpenPrs?: (options: { cwd: string }) => import("./migration-versions.mjs").OpenPr[],
 * }} [options]
 * @returns {import("./migration-versions.mjs").MigrationReport & { baseRef: string }}
 */
export function run({
  cwd = process.cwd(),
  baseRef,
  prNumber,
  env = process.env,
  listOpenPrs = listOpenPrsWithGh,
} = {}) {
  const base =
    baseRef ?? env.MIGRATIONS_BASE_REF ?? (env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : "origin/main");

  try {
    git(cwd, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  } catch {
    return {
      baseRef: base,
      errors: [`base ref ${base} not found. Fetch it (git fetch origin main) or pass --base <ref>.`],
      warnings: [],
    };
  }

  const dir = path.join(cwd, MIGRATIONS_DIR);
  const localFiles = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
    : [];
  const baseFiles = lines(git(cwd, ["ls-tree", "--name-only", base, `${MIGRATIONS_DIR}/`])).map((p) =>
    path.posix.basename(p),
  );

  // Against the merge base, including uncommitted edits, so only this branch's own changes count.
  const mergeBase = git(cwd, ["merge-base", base, "HEAD"]);
  const changes = lines(git(cwd, ["diff", "--name-status", "--no-renames", mergeBase, "--", MIGRATIONS_DIR])).map(
    (line) => {
      const [status, file] = line.split("\t");
      return { status, file: path.posix.basename(file) };
    },
  );

  const currentBranch = env.GITHUB_HEAD_REF || git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const own = { currentBranch, prNumber, headContains: (/** @type {string} */ sha) => headContains(cwd, sha) };
  /** @type {import("./migration-versions.mjs").OpenPr[] | null} */
  let openPrs = null;
  let openPrsError;
  try {
    openPrs = listOpenPrs({ cwd }).filter((pr) => !isOwnPr(pr, own));
  } catch (error) {
    openPrsError = `gh pr list failed (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`;
  }

  return {
    baseRef: base,
    ...checkMigrations({
      localFiles,
      baseFiles,
      changes,
      openPrs,
      openPrsError,
      strictOpenPrs: env.CI === "true",
    }),
  };
}

/**
 * @param {string[]} args
 * @returns {{ baseRef?: string, prNumber?: number }}
 */
export function parseArgs(args) {
  /** @param {string} name */
  const value = (name) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${name} needs a value.`);
    return next;
  };
  const baseRef = value("--base");
  const pr = value("--pr");
  if (pr !== undefined && !/^[1-9]\d*$/.test(pr)) throw new Error(`--pr expects a PR number, got "${pr}".`);
  return { baseRef, prNumber: pr === undefined ? undefined : Number(pr) };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }

  const { baseRef: base, errors, warnings } = run(options);
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  if (errors.length > 0) {
    console.error(`check:migrations failed against ${base} (${errors.length} error(s)).`);
    process.exit(1);
  }
  console.log(`check:migrations passed against ${base}${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
