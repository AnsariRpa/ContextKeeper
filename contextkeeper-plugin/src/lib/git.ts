import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { GitSnapshot } from "./storage.js";
import { contextKeeperDir } from "./storage.js";

const execFileAsync = promisify(execFile);

/**
 * Runs a Git command and returns its raw stdout. Throws when Git fails.
 *
 * The output is returned untouched: trimming would strip the leading status
 * column of `git status` output, where the whitespace is significant.
 */
export async function runGitRaw(
  args: string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    encoding: "utf8",
  });
  return stdout;
}

/** Runs a Git command and returns trimmed stdout. Throws when Git fails. */
export async function runGit(
  args: string[],
  cwd: string = process.cwd(),
): Promise<string> {
  return (await runGitRaw(args, cwd)).trim();
}

/** A single working-tree change, as reported by Git's porcelain format. */
export type GitChange = {
  /** Two-character porcelain status code, for example ` M`, `??` or `R `. */
  status: string;
  /** Repository-relative path of the file that exists in the working tree. */
  path: string;
  /** Repository-relative path a renamed or copied file came from. */
  originalPath?: string;
};

/** True when the porcelain status code marks a rename or a copy. */
function isRenameStatus(status: string): boolean {
  return status.includes("R") || status.includes("C");
}

/**
 * Parses the output of `git status --porcelain=v1 -z`.
 *
 * The NUL-delimited format is used on purpose: unlike the human-readable
 * output, it never quotes or escapes a path, so a file name with spaces,
 * quotes or non-ASCII characters is reported exactly as it exists on disk.
 *
 * Every record is `XY <path>`. Renames and copies carry a second path in the
 * following NUL-delimited field: the record holds the destination (the file
 * that exists in the working tree) and the next field holds the source.
 */
export function parsePorcelainStatus(output: string): GitChange[] {
  const changes: GitChange[] = [];
  const fields = output.split("\0");

  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    // A record is at least `XY <one character>`; the trailing empty field
    // after the final NUL is not a record.
    if (record === undefined || record.length < 4) continue;

    const status = record.slice(0, 2);
    const filePath = record.slice(3);

    let originalPath: string | undefined;
    if (isRenameStatus(status)) {
      const source = fields[index + 1];
      if (source !== undefined && source !== "") {
        originalPath = source;
        index += 1;
      }
    }

    changes.push(
      originalPath === undefined
        ? { status, path: filePath }
        : { status, path: filePath, originalPath },
    );
  }

  return changes;
}

/**
 * Renders a change as a single `XY <path>` line.
 *
 * The path is the destination of a rename, because that is the file that
 * exists in the working tree; the source is recorded separately on the change
 * itself.
 */
export function formatChange(change: GitChange): string {
  return `${change.status} ${change.path}`;
}

/**
 * Builds the absolute paths that ContextKeeper treats as its own runtime data.
 *
 * Both the configured data directory and the repository-local default are
 * returned, because the store usually lives inside the repository but can be
 * moved out of it with `CONTEXTKEEPER_DIR`.
 */
function runtimeDirectories(
  repository: string,
  dataDir: string,
): { data: string; fallback: string } {
  // Resolve first and compare case-insensitively afterwards: lower-casing a
  // Windows path before resolving it would rewrite the drive letter, and a data
  // directory on another drive can never match a repository-relative path.
  const resolvedRoot = path.resolve(repository);
  const resolvedData = path.resolve(dataDir);

  const normalize = (value: string): string =>
    path.resolve(value).toLowerCase().replace(/[\\/]+$/, "");

  return {
    data: normalize(resolvedData),
    fallback: normalize(path.join(resolvedRoot, ".contextkeeper")),
  };
}

/** True when a repository-relative path points at ContextKeeper's own data. */
function isRuntimePath(
  filePath: string,
  root: string,
  directories: { data: string; fallback: string },
): boolean {
  if (filePath === "") return false;

  const normalize = (value: string): string =>
    path.resolve(value).toLowerCase().replace(/[\\/]+$/, "");

  // Git collapses an untracked directory into a single `dir/` entry, so the
  // trailing separator has to survive the comparison.
  const absolute = normalize(path.resolve(root, filePath));
  if (absolute === directories.data || absolute === directories.fallback) {
    return true;
  }

  return (
    absolute.startsWith(`${directories.data}\\`) ||
    absolute.startsWith(`${directories.data}/`) ||
    absolute.startsWith(`${directories.fallback}\\`) ||
    absolute.startsWith(`${directories.fallback}/`)
  );
}

/**
 * Removes ContextKeeper's own runtime directory from parsed Git changes.
 *
 * The handover store usually lives inside the repository. Reporting it as a
 * working-tree change would invent drift on every resume, because the store is
 * written by the very command that takes the snapshot.
 *
 * A rename is reported by its destination, because that is the file that exists
 * in the working tree. A rename *out of* the runtime directory stays visible.
 */
export function filterRuntimeChanges(
  changes: GitChange[],
  repository: string,
  dataDir: string = contextKeeperDir(),
): GitChange[] {
  if (changes.length === 0) return changes;

  const root = path.resolve(repository);
  const directories = runtimeDirectories(repository, dataDir);

  return changes.filter(
    (change) => !isRuntimePath(change.path, root, directories),
  );
}

/** Describes why a Git command failed in terms a developer can act on. */
export function describeGitFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT|not found|is not recognized/i.test(message)) {
    return "Git is not installed or is not on PATH.";
  }
  if (/not a git repository/i.test(message)) {
    return "This directory is not inside a Git repository.";
  }
  return message;
}

/**
 * Collects the Git facts ContextKeeper records with a handover.
 *
 * Never throws: when Git is unavailable the snapshot reports `available: false`
 * together with a reason, so a handover can still be saved without Git context.
 */
export async function collectGitSnapshot(
  cwd: string = process.cwd(),
): Promise<GitSnapshot> {
  let repository: string;
  try {
    repository = await runGit(["rev-parse", "--show-toplevel"], cwd);
  } catch (error) {
    return { available: false, reason: describeGitFailure(error) };
  }

  const branch = await runGit(["branch", "--show-current"], cwd).catch(() => "");
  const detached = branch === "";

  const headCommit = await runGit(["rev-parse", "--short", "HEAD"], cwd).catch(
    () => undefined,
  );

  const commits = await runGit(
    ["log", "-5", "--pretty=format:%h | %s | %ad", "--date=short"],
    cwd,
  )
    .then((value) => value.split("\n").filter((line) => line.trim() !== ""))
    .catch(() => []);

  // `git status` prints paths relative to the current directory, so it is run
  // from the repository root to get consistent, root-relative paths.
  // The NUL-delimited porcelain format is used because it never quotes or
  // escapes a path, so names with spaces or non-ASCII characters survive.
  const changes = await runGitRaw(
    ["status", "--porcelain=v1", "-z"],
    repository,
  )
    .then((value) => filterRuntimeChanges(
      parsePorcelainStatus(value),
      repository,
      contextKeeperDir(cwd),
    ))
    .catch(() => [] as GitChange[]);

  return {
    available: true,
    repository,
    branch: detached ? undefined : branch,
    detached,
    headCommit,
    commits,
    // ContextKeeper's own data directory is never a change worth reporting.
    changes: changes.map((change) => formatChange(change)),
  };
}

/** Renders a snapshot as the Markdown-friendly text block stored on a handover. */
export function renderGitContext(snapshot: GitSnapshot): string {
  if (!snapshot.available) {
    return [
      "Git context unavailable.",
      `Reason: ${snapshot.reason ?? "unknown"}`,
    ].join("\n");
  }

  const lines = [
    `Repository: ${snapshot.repository}`,
    `Branch: ${snapshot.branch || "(detached HEAD)"}`,
  ];

  if (snapshot.headCommit) lines.push(`HEAD: ${snapshot.headCommit}`);

  lines.push("", "Working tree:");
  lines.push(
    snapshot.changes && snapshot.changes.length > 0
      ? snapshot.changes.join("\n")
      : "No uncommitted changes detected.",
  );

  lines.push("", "Recent commits:");
  lines.push(
    snapshot.commits && snapshot.commits.length > 0
      ? snapshot.commits.join("\n")
      : "No commits yet.",
  );

  return lines.join("\n");
}

/**
 * Renders a change line inside a sentence.
 *
 * A porcelain status code starts with the index status, which is a space when
 * nothing is staged. That leading space is significant in the working-tree
 * listing, where it distinguishes an unstaged change from a staged one, but it
 * would turn into a double space inside a sentence like `New change: ...`.
 *
 * Only the leading whitespace is removed, so the two status columns still
 * separate a staged change (`M  path`) from an unstaged one (`M path`).
 */
function describeChange(line: string): string {
  return line.replace(/^[ \t]+/, "");
}

/**
 * Compares the Git state captured with a handover against the current state so a
 * resuming developer can see how far the working tree has drifted.
 */
export function diffGitSnapshots(
  saved: GitSnapshot | undefined,
  current: GitSnapshot | undefined,
): string[] {
  if (!saved?.available || !current?.available) {
    if (saved?.available && current && !current.available) {
      return [`Git state unavailable now: ${current.reason ?? "unknown"}`];
    }
    return [];
  }

  const differences: string[] = [];

  if (saved.branch !== current.branch) {
    differences.push(
      `Branch changed: ${saved.branch || "(detached HEAD)"} -> ${current.branch || "(detached HEAD)"}`,
    );
  }

  if (saved.headCommit && current.headCommit && saved.headCommit !== current.headCommit) {
    differences.push(`HEAD moved: ${saved.headCommit} -> ${current.headCommit}`);
  }

  const savedChanges = new Set(saved.changes ?? []);
  const currentChanges = new Set(current.changes ?? []);

  const added = [...currentChanges].filter((line) => !savedChanges.has(line));
  const removed = [...savedChanges].filter((line) => !currentChanges.has(line));

  for (const line of added) differences.push(`New change: ${describeChange(line)}`);
  for (const line of removed) {
    differences.push(`Resolved change: ${describeChange(line)}`);
  }

  return differences;
}
