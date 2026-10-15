import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// The stack scripts in scripts/dev/ (pwsh). Stop-WorktreeSupabase.ps1 runs from a copy inside a throwaway
// worktree folder named "50-…", with fake `docker` / `npx` first on PATH that record every call and keep the
// containers of two stacks, tjs-50 and tjs-150, in a state file. No real Docker is touched.

const DEV = path.resolve(__dirname, "../../scripts/dev");
// As committed: a worktree that ran supabase:start:worktree has its own project_id in the working copy.
const PROJECT_ID_LINE = /^project_id = "[^"]*"/m;
const CONFIG = readFileSync(path.resolve(__dirname, "../../supabase/config.toml"), "utf8").replace(
  PROJECT_ID_LINE,
  'project_id = "tjs-main"',
);

const FAKE_DOCKER = `
Add-Content -LiteralPath $env:TJS_FAKE_LOG -Value ("docker " + ($args -join ' '))
switch ($args[0]) {
    'ps' {
        Get-Content -LiteralPath $env:TJS_FAKE_CONTAINERS | Where-Object { $_ } |
            ForEach-Object { "$_|running|2026-10-15 07:39:00 +0300 EEST" }
    }
    'rm' {
        $name = $args[-1]
        $keep = @(Get-Content -LiteralPath $env:TJS_FAKE_CONTAINERS | Where-Object { $_ -and $_ -ne $name })
        Set-Content -LiteralPath $env:TJS_FAKE_CONTAINERS -Value $keep
    }
}
exit 0
`;
const FAKE_NPX = `
Add-Content -LiteralPath $env:TJS_FAKE_LOG -Value ("npx " + ($args -join ' '))
exit 0
`;
const CONTAINERS = ["supabase_db_tjs-50", "supabase_kong_tjs-50", "supabase_db_tjs-150", "supabase_kong_tjs-150"];

function pwsh(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync("pwsh", ["-NoProfile", "-NonInteractive", ...args], { encoding: "utf8", ...options });
}

// Each test below spawns pwsh (and git): about 1 s warm on the CI runner, over vitest's default 5 s when
// the runner is loaded. One explicit budget for every subprocess test of this file.
const SUBPROCESS_TEST_TIMEOUT = 30_000;
// The first pwsh on a fresh runner pays PowerShell's cold start (5-12 s seen in CI: the binaries, then the
// startup and module-analysis caches it writes on first use, which the lookup of the fake `docker` / `npx`
// needs). Paid once here, under its own budget, not inside whichever test runs first.
const PWSH_WARM_UP_TIMEOUT = 60_000;

beforeAll(() => {
  // A lookup that misses, as `docker` / `npx` do among the commands: it walks every module once.
  const warm = pwsh(["-Command", "$null = Get-Command tjs-no-such-command -ErrorAction SilentlyContinue; exit 0"]);
  if (warm.error || warm.status !== 0) {
    throw new Error(`pwsh warm-up failed (status ${warm.status}): ${warm.error?.message ?? warm.stderr}`);
  }
}, PWSH_WARM_UP_TIMEOUT);

// pwsh colours an error message and wraps it over "     | " lines at a width that differs per platform:
// compare without colours, gutters and whitespace.
const squash = (text: string) => text.replace(/\s+/g, "");
const message = (stderr: string) =>
  squash(
    stderr
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\|/, ""))
      .join(""),
  );

function withProjectId(projectId: string) {
  if (!PROJECT_ID_LINE.test(CONFIG)) throw new Error("supabase/config.toml has no top-level project_id");
  return CONFIG.replace(PROJECT_ID_LINE, `project_id = "${projectId}"`);
}

describe("Stop-WorktreeSupabase.ps1", () => {
  let root: string;
  let worktree: string;
  let log: string;
  let containers: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "tjs-stack-"));
    worktree = path.join(root, "50-fix-proof");
    mkdirSync(path.join(worktree, "scripts/dev"), { recursive: true });
    mkdirSync(path.join(worktree, "supabase"));
    for (const file of ["Stop-WorktreeSupabase.ps1", "TjsStack.ps1"]) {
      copyFileSync(path.join(DEV, file), path.join(worktree, "scripts/dev", file));
    }
    const bin = path.join(root, "bin");
    mkdirSync(bin);
    writeFileSync(path.join(bin, "docker.ps1"), FAKE_DOCKER);
    writeFileSync(path.join(bin, "npx.ps1"), FAKE_NPX);
    log = path.join(root, "calls.log");
    containers = path.join(root, "containers.txt");
    writeFileSync(log, "");
    writeFileSync(containers, CONTAINERS.join("\n") + "\n");

    const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
    env = {
      ...process.env,
      [pathKey]: bin + path.delimiter + (process.env[pathKey] ?? ""),
      TJS_FAKE_LOG: log,
      TJS_FAKE_CONTAINERS: containers,
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function stop(projectId: string, ...args: string[]) {
    writeFileSync(path.join(worktree, "supabase/config.toml"), withProjectId(projectId));
    return pwsh(["-File", path.join(worktree, "scripts/dev/Stop-WorktreeSupabase.ps1"), ...args], {
      cwd: worktree,
      env,
    });
  }

  const calls = () => readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean);
  const left = () => readFileSync(containers, "utf8").split(/\r?\n/).filter(Boolean);

  it("stops the configured stack without a number, not the one of the folder name", () => {
    const result = stop("tjs-150");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("tjs-150 stopped");
    expect(left()).toEqual(["supabase_db_tjs-50", "supabase_kong_tjs-50"]);
    expect(calls()).toContain("npx supabase stop --project-id tjs-150 --no-backup --yes");
    expect(calls().join("\n")).not.toMatch(/tjs-50\b/);
  }, SUBPROCESS_TEST_TIMEOUT);

  it("stops the configured stack with the matching number", () => {
    const result = stop("tjs-150", "150");

    expect(result.status, result.stderr).toBe(0);
    expect(left()).toEqual(["supabase_db_tjs-50", "supabase_kong_tjs-50"]);
  }, SUBPROCESS_TEST_TIMEOUT);

  it("refuses a number that differs from the configured project_id and touches nothing", () => {
    const result = stop("tjs-150", "50");

    expect(result.status).not.toBe(0);
    expect(message(result.stderr)).toContain(squash("Refusing to stop tjs-50:"));
    expect(message(result.stderr)).toContain(squash('project_id = "tjs-150"'));
    expect(calls()).toEqual([]);
    expect(left()).toEqual(CONTAINERS);
  }, SUBPROCESS_TEST_TIMEOUT);

  it.each([[[]], [["50"]]])("refuses when config.toml was not rewritten (args %j) and touches nothing", (args) => {
    const result = stop("tjs-main", ...args);

    expect(result.status).not.toBe(0);
    expect(message(result.stderr)).toContain(squash('project_id = "tjs-main"'));
    expect(message(result.stderr)).toContain(squash("never guessed from the folder name"));
    expect(calls()).toEqual([]);
    expect(left()).toEqual(CONTAINERS);
  }, SUBPROCESS_TEST_TIMEOUT);
});

describe("Get-TjsWorktreeStackIds (supabase:cleanup)", () => {
  let repo: string;
  let worktrees: string;

  function git(...args: string[]) {
    execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  }

  function addWorktree(folder: string, projectId: string) {
    const at = path.join(worktrees, folder);
    git("worktree", "add", "-q", "-b", folder, at);
    writeFileSync(path.join(at, "supabase/config.toml"), withProjectId(projectId));
  }

  beforeEach(() => {
    const root = mkdtempSync(path.join(tmpdir(), "tjs-cleanup-"));
    repo = path.join(root, "repo");
    worktrees = path.join(root, "worktrees");
    mkdirSync(path.join(repo, "supabase"), { recursive: true });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "test");
    git("config", "core.autocrlf", "false");
    writeFileSync(path.join(repo, "supabase/config.toml"), CONFIG);
    git("add", ".");
    git("commit", "-q", "-m", "init");
  });

  afterEach(() => {
    rmSync(path.dirname(repo), { recursive: true, force: true });
  });

  it("keeps each worktree's configured stack, and the folder number only without a rewritten config", () => {
    addWorktree("15-feat-a", "tjs-15");
    addWorktree("20-verify", "tjs-120");
    addWorktree("30-docs-b", "tjs-main");

    const result = pwsh([
      "-Command",
      `. '${path.join(DEV, "TjsStack.ps1")}'; (Get-TjsWorktreeStackIds -RepoPath '${repo}') -join ','`,
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split(",")).toEqual(["tjs-120", "tjs-15", "tjs-30"]);
  }, SUBPROCESS_TEST_TIMEOUT);
});
