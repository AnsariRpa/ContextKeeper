import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Structured snapshot of the Git state at handover time. */
export type GitSnapshot = {
  /** False when Git was unavailable (not a repository, Git not installed, ...). */
  available: boolean;
  repository?: string;
  branch?: string;
  detached?: boolean;
  headCommit?: string;
  commits?: string[];
  changes?: string[];
  /** Human-readable reason why Git context is unavailable. */
  reason?: string;
};

export type Handover = {
  id: string;
  title: string;
  task: string;
  completed: string;
  decisions: string;
  blockers: string;
  nextSteps: string;
  createdAt: string;
  gitContext?: string;
  /** Structured Git facts, used to detect drift between handover and working tree. */
  gitSnapshot?: GitSnapshot;
  /** Optional AI-generated summary. Only set when a model actually produced it. */
  summary?: string;
  /** Provenance of `summary`, so the UI never implies AI that did not run. */
  summarySource?: "ai";
  /** Free-form labels that make handovers easier to find. */
  tags?: string[];
};

/** Raised for storage problems the user can act on (corrupt file, unwritable path, ...). */
export class StorageError extends Error {
  override readonly name = "StorageError";
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

/**
 * Root of the ContextKeeper runtime data. Resolved on every call (never cached) so
 * that changing the working directory is honoured, and overridable with
 * CONTEXTKEEPER_DIR so runtime data can be kept outside the repository.
 */
export function contextKeeperDir(cwd: string = process.cwd()): string {
  const override = process.env.CONTEXTKEEPER_DIR;
  if (override && override.trim() !== "") return path.resolve(override);
  return path.join(cwd, ".contextkeeper");
}

export function handoversFile(cwd: string = process.cwd()): string {
  return path.join(contextKeeperDir(cwd), "handovers.json");
}

export function exportsDir(cwd: string = process.cwd()): string {
  return path.join(contextKeeperDir(cwd), "exports");
}

/**
 * Serialises writes inside this process. Two concurrent captures would otherwise
 * read the same file and the second write would silently drop the first handover.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  // Keep the chain alive even when an operation rejects.
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function loadHandovers(cwd?: string): Promise<Handover[]> {
  const file = handoversFile(cwd);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new StorageError(
      `Could not read the handover store at ${file}.`,
      "Check that the directory exists and is readable, or set CONTEXTKEEPER_DIR to a writable location.",
    );
  }

  if (raw.trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new StorageError(
      `The handover store at ${file} is not valid JSON (${reason}).`,
      "Fix or move that file, or delete it to start a fresh store. It was left untouched so no handover data is lost.",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new StorageError(
      `The handover store at ${file} should contain a JSON array of handovers.`,
      "Fix or move that file, or delete it to start a fresh store. It was left untouched so no handover data is lost.",
    );
  }

  return parsed as Handover[];
}

export async function saveHandover(item: Handover, cwd?: string): Promise<void> {
  const file = handoversFile(cwd);
  await enqueue(async () => {
    await mkdir(path.dirname(file), { recursive: true });
    const items = await loadHandovers(cwd);
    if (items.some((existing) => existing.id === item.id)) {
      throw new StorageError(
        `A handover with ID ${item.id} already exists.`,
        "Use a different ID or remove the duplicate entry before saving again.",
      );
    }
    items.unshift(item);
    await writeFileAtomically(file, JSON.stringify(items, null, 2));
  });
}

/**
 * Writes to a temporary file in the same directory and renames it into place, so an
 * interrupted write can never leave a half-written handover store behind.
 */
export async function writeFileAtomically(
  file: string,
  contents: string,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(temporary, contents, "utf8");
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    throw new StorageError(
      `Could not write ${file} (${reason}).`,
      "Check directory permissions, or set CONTEXTKEEPER_DIR to a writable location.",
    );
  }
}

export async function getHandover(
  id: string,
  cwd?: string,
): Promise<Handover | undefined> {
  return (await loadHandovers(cwd)).find((item) => item.id === id);
}

/** Case-insensitive search across the free-text fields of a handover. */
export function searchHandovers(
  items: Handover[],
  query: string,
): Handover[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return items;
  return items.filter((item) =>
    [
      item.id,
      item.title,
      item.task,
      item.completed,
      item.decisions,
      item.blockers,
      item.nextSteps,
      ...(item.tags ?? []),
    ]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(needle)),
  );
}
