// npm run check:migrations [-- --base <ref>]
// Checks supabase/migrations against the base branch and the open pull requests (rules in
// migration-versions.mjs). Base ref: --base, else $MIGRATIONS_BASE_REF, else origin/$GITHUB_BASE_REF,
// else origin/main. Open PRs come from `gh`; when gh is missing or fails this is a warning locally and
// an error in CI ($CI=true). Remote migration history and unpushed branches stay a manual check.

import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MIGRATIONS_DIR, checkMigrations } from "./migration-versions.mjs";

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
 * Open PRs other than the current branch's, with the migration files each one adds or changes.
 * @param {{ cwd: string, currentBranch: string }} options
 * @returns {import("./migration-versions.mjs").OpenPr[]}
 */
export function listOpenPrsWithGh({ cwd, currentBranch }) {
  const out = execFileSync(
    "gh",
    ["pr", "list", "--state", "open", "--limit", "200", "--json", "number,headRefName,files"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  /** @type {{ number: number, headRefName: string, files: { path: string }[] }[]} */
  const prs = JSON.parse(out);
  return prs
    .filter((pr) => pr.headRefName !== currentBranch)
    .map((pr) => ({
      number: pr.number,
      files: pr.files
        .map((f) => f.path)
        .filter((p) => p.startsWith(`${MIGRATIONS_DIR}/`))
        .map((p) => path.posix.basename(p)),
    }));
}

/**
 * @param {{
 *   cwd?: string,
 *   baseRef?: string,
 *   env?: Record<string, string | undefined>,
 *   listOpenPrs?: (options: { cwd: string, currentBranch: string }) => import("./migration-versions.mjs").OpenPr[],
 * }} [options]
 * @returns {import("./migration-versions.mjs").MigrationReport & { baseRef: string }}
 */
export function run({ cwd = process.cwd(), baseRef, env = process.env, listOpenPrs = listOpenPrsWithGh } = {}) {
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
  /** @type {import("./migration-versions.mjs").OpenPr[] | null} */
  let openPrs = null;
  let openPrsError;
  try {
    openPrs = listOpenPrs({ cwd, currentBranch });
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

function main() {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf("--base");
  const baseRef = baseIndex >= 0 ? args[baseIndex + 1] : undefined;

  const { baseRef: base, errors, warnings } = run({ baseRef });
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
