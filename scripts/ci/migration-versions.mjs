// Pure rules for supabase/migrations file names and versions. Supabase keys migration history on the
// 14-digit version prefix, not the file name, so two branches that pick the same version collide only
// at merge or `db push`. check-migration-versions.mjs feeds these rules from git and gh.

export const MIGRATIONS_DIR = "supabase/migrations";

const MIGRATION_NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

/**
 * @param {string} fileName base name, e.g. "20261015100000_create_products.sql"
 * @returns {string | null} the version, or null when the name is not valid
 */
export function migrationVersion(fileName) {
  const match = MIGRATION_NAME.exec(fileName);
  return match ? match[1] : null;
}

/** Dotfiles such as .gitkeep are not migrations. */
export function isMigrationCandidate(fileName) {
  return !fileName.startsWith(".");
}

/**
 * @typedef {{ status: string, file: string }} BaseChange  a `git diff --name-status` entry (base name)
 * @typedef {{ number: number, files: string[] }} OpenPr  migration base names an open PR adds
 * @typedef {{
 *   localFiles: string[],
 *   baseFiles: string[],
 *   changes: BaseChange[],
 *   openPrs: OpenPr[] | null,
 *   openPrsError?: string,
 *   strictOpenPrs?: boolean,
 * }} MigrationInput
 * @typedef {{ errors: string[], warnings: string[] }} MigrationReport
 */

/**
 * @param {MigrationInput} input
 * @returns {MigrationReport}
 */
export function checkMigrations({
  localFiles,
  baseFiles,
  changes,
  openPrs,
  openPrsError,
  strictOpenPrs = false,
}) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  const local = localFiles.filter(isMigrationCandidate);
  const base = baseFiles.filter(isMigrationCandidate);
  const baseSet = new Set(base);

  for (const file of local) {
    if (migrationVersion(file) === null) {
      errors.push(`${file}: bad name, expected YYYYMMDDHHMMSS_snake_case.sql (14 digits, lowercase).`);
    }
  }

  /** @type {Map<string, string[]>} */
  const byVersion = new Map();
  for (const file of local) {
    const version = migrationVersion(file);
    if (version === null) continue;
    byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
  }
  for (const [version, files] of byVersion) {
    if (files.length > 1) errors.push(`version ${version} is used by more than one file: ${files.join(", ")}.`);
  }

  for (const { status, file } of changes) {
    if (!baseSet.has(file)) continue;
    if (status.startsWith("D")) {
      errors.push(`${file}: deleted, but it exists on the base branch. Migrations are never removed; add a new one.`);
    } else if (status.startsWith("M") || status.startsWith("T")) {
      errors.push(`${file}: edited, but it exists on the base branch. Never edit a merged migration; add a new one.`);
    }
  }

  /** @type {Map<string, string>} */
  const baseVersions = new Map();
  for (const file of base) {
    const version = migrationVersion(file);
    if (version !== null) baseVersions.set(version, file);
  }
  const latestBase = [...baseVersions.keys()].sort().at(-1);

  const added = local.filter((file) => !baseSet.has(file) && migrationVersion(file) !== null);
  for (const file of added) {
    const version = /** @type {string} */ (migrationVersion(file));
    const onBase = baseVersions.get(version);
    if (onBase) errors.push(`${file}: version ${version} is already used on the base branch by ${onBase}.`);
    if (latestBase && version < latestBase) {
      warnings.push(`${file}: version ${version} is older than the latest on the base branch (${latestBase}); it will apply out of order.`);
    }
  }

  if (openPrs === null) {
    const message = `open pull requests not checked${openPrsError ? `: ${openPrsError}` : ""}.`;
    (strictOpenPrs ? errors : warnings).push(message);
  } else {
    for (const file of added) {
      const version = migrationVersion(file);
      for (const pr of openPrs) {
        const clash = pr.files.find((other) => !baseSet.has(other) && migrationVersion(other) === version);
        if (clash) errors.push(`${file}: version ${version} is already claimed by open PR #${pr.number} (${clash}).`);
      }
    }
  }

  return { errors, warnings };
}
