import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PLUGIN_ROOT } from "./harness.js";

const gitUrl = pathToFileURL(path.join(PLUGIN_ROOT, "dist", "lib", "git.js")).href;
const git = await import(`${gitUrl}?t=${Date.now()}`);

/** A repository root that is never inside the project under test. */
const repo = path.resolve(path.parse(process.cwd()).root, "repos", "project");
const dataDir = path.join(repo, ".contextkeeper");

test("renderGitContext reports the reason when Git is unavailable", () => {
  const rendered = git.renderGitContext({
    available: false,
    reason: "This directory is not inside a Git repository.",
  });

  assert.match(rendered, /Git context unavailable/);
  assert.match(rendered, /not inside a Git repository/);
});

test("renderGitContext lists the working tree and commits", () => {
  const rendered = git.renderGitContext({
    available: true,
    repository: repo,
    branch: "main",
    headCommit: "abc1234",
    changes: [" M src/index.ts"],
    commits: ["abc1234 | Initial commit | 2026-01-01"],
  });

  assert.match(rendered, /Repository: /);
  assert.match(rendered, /Branch: main/);
  assert.match(rendered, /HEAD: abc1234/);
  assert.match(rendered, / M src\/index\.ts/);
  assert.match(rendered, /abc1234 \| Initial commit/);
});

test("renderGitContext marks a detached HEAD", () => {
  const rendered = git.renderGitContext({
    available: true,
    repository: repo,
    detached: true,
  });

  assert.match(rendered, /Branch: \(detached HEAD\)/);
});

test("diffGitSnapshots reports branch, HEAD, and working tree differences", () => {
  const saved = {
    available: true,
    repository: repo,
    branch: "main",
    headCommit: "aaa1111",
    changes: [" M src/index.ts"],
  };
  const current = {
    available: true,
    repository: repo,
    branch: "feature",
    headCommit: "bbb2222",
    changes: ["?? src/new.ts"],
  };

  const differences = git.diffGitSnapshots(saved, current);

  assert.ok(differences.some((line) => /Branch changed: main -> feature/.test(line)));
  assert.ok(differences.some((line) => /HEAD moved: aaa1111 -> bbb2222/.test(line)));
  assert.ok(differences.some((line) => /New change: \?\? src\/new\.ts/.test(line)));
  assert.ok(
    differences.some((line) => /Resolved change: M src\/index\.ts/.test(line)),
  );
});

test("diffGitSnapshots returns no differences for an unchanged repository", () => {
  const snapshot = {
    available: true,
    repository: repo,
    branch: "main",
    headCommit: "aaa1111",
    changes: [" M src/index.ts"],
  };

  assert.deepEqual(git.diffGitSnapshots(snapshot, { ...snapshot }), []);
});

test("diffGitSnapshots explains why the current Git state is unavailable", () => {
  const saved = { available: true, repository: repo, branch: "main" };
  const current = { available: false, reason: "Git is not installed." };

  const differences = git.diffGitSnapshots(saved, current);

  assert.equal(differences.length, 1);
  assert.match(differences[0], /Git state unavailable now: Git is not installed/);
});

test("diffGitSnapshots ignores an unavailable saved snapshot", () => {
  const saved = { available: false, reason: "No repository" };
  const current = { available: true, repository: repo, branch: "main" };

  assert.deepEqual(git.diffGitSnapshots(saved, current), []);
});

test("parsePorcelainStatus reads the NUL-delimited porcelain format", () => {
  const output = [" M src/index.ts", "?? new file.ts", "A  added.ts", ""].join("\0");

  assert.deepEqual(git.parsePorcelainStatus(output), [
    { status: " M", path: "src/index.ts" },
    { status: "??", path: "new file.ts" },
    { status: "A ", path: "added.ts" },
  ]);
});

test("parsePorcelainStatus keeps a path with spaces and non-ASCII characters intact", () => {
  const output = [" M sub dir/café.ts", ""].join("\0");

  assert.deepEqual(git.parsePorcelainStatus(output), [
    { status: " M", path: "sub dir/café.ts" },
  ]);
});

test("parsePorcelainStatus reads the source path of a rename", () => {
  // A rename is reported as `R  <destination>` followed by the source path
  // in the next NUL-delimited field.
  const output = ["R  renamed.ts", "original.ts", ""].join("\0");

  assert.deepEqual(git.parsePorcelainStatus(output), [
    { status: "R ", path: "renamed.ts", originalPath: "original.ts" },
  ]);
});

test("parsePorcelainStatus reads the source path of a copy", () => {
  const output = ["C  copy.ts", "source.ts", " M src/index.ts", ""].join("\0");

  assert.deepEqual(git.parsePorcelainStatus(output), [
    { status: "C ", path: "copy.ts", originalPath: "source.ts" },
    { status: " M", path: "src/index.ts" },
  ]);
});

test("parsePorcelainStatus returns an empty list for a clean working tree", () => {
  assert.deepEqual(git.parsePorcelainStatus(""), []);
});

test("formatChange renders a change as a single status line", () => {
  assert.equal(
    git.formatChange({ status: " M", path: "src/index.ts" }),
    " M src/index.ts",
  );
  assert.equal(
    git.formatChange({ status: "??", path: "new file.ts" }),
    "?? new file.ts",
  );
});

test("filterRuntimeChanges removes the runtime directory from changes", () => {
  const changes = [
    { status: " M", path: "src/index.ts" },
    { status: "??", path: ".contextkeeper/handovers.json" },
    { status: "??", path: ".contextkeeper/exports/abc.md" },
  ];

  assert.deepEqual(git.filterRuntimeChanges(changes, repo, dataDir), [
    { status: " M", path: "src/index.ts" },
  ]);
});

test("filterRuntimeChanges removes the default runtime directory even when the data directory is elsewhere", () => {
  const changes = [
    { status: " M", path: "src/index.ts" },
    { status: "??", path: ".contextkeeper/handovers.json" },
    { status: "??", path: ".contextkeeper/exports/abc.md" },
  ];

  const result = git.filterRuntimeChanges(
    changes,
    repo,
    path.resolve(path.parse(process.cwd()).root, "elsewhere", "data"),
  );

  assert.deepEqual(result, [{ status: " M", path: "src/index.ts" }]);
});

test("filterRuntimeChanges keeps a directory that only shares the prefix", () => {
  const changes = [
    { status: "??", path: ".contextkeeper-notes/todo.md" },
    { status: " M", path: "src/index.ts" },
  ];

  assert.deepEqual(git.filterRuntimeChanges(changes, repo, dataDir), [
    { status: "??", path: ".contextkeeper-notes/todo.md" },
    { status: " M", path: "src/index.ts" },
  ]);
});

test("filterRuntimeChanges compares paths case-insensitively on Windows", () => {
  const changes = [
    { status: "??", path: ".ContextKeeper/handovers.json" },
    { status: " M", path: "src/index.ts" },
  ];

  assert.deepEqual(git.filterRuntimeChanges(changes, repo, dataDir), [
    { status: " M", path: "src/index.ts" },
  ]);
});

test("filterRuntimeChanges keeps the repository default directory when the data directory is elsewhere", () => {
  const changes = [
    { status: "??", path: ".contextkeeper/handovers.json" },
    { status: " M", path: "src/index.ts" },
  ];
  const other = path.resolve(path.parse(process.cwd()).root, "contextkeeper-data");

  // The repository copy is still the default runtime directory, so it is
  // filtered, while a data directory outside the repository never matches a
  // repository-relative path.
  assert.deepEqual(git.filterRuntimeChanges(changes, repo, other), [
    { status: " M", path: "src/index.ts" },
  ]);
});

test("filterRuntimeChanges keeps changes outside both data directories", () => {
  const changes = [
    { status: "??", path: "../shared/notes.md" },
    { status: " M", path: "src/index.ts" },
  ];
  const other = path.resolve(path.parse(process.cwd()).root, "contextkeeper-data");

  assert.deepEqual(git.filterRuntimeChanges(changes, repo, other), [
    { status: "??", path: "../shared/notes.md" },
    { status: " M", path: "src/index.ts" },
  ]);
});

test("filterRuntimeChanges keeps a rename out of the runtime directory", () => {
  const changes = [
    { status: "R ", path: "src/new.ts", originalPath: "old.ts" },
    { status: "R ", path: ".contextkeeper/handovers.json", originalPath: "old.ts" },
  ];

  assert.deepEqual(git.filterRuntimeChanges(changes, repo, dataDir), [
    { status: "R ", path: "src/new.ts", originalPath: "old.ts" },
  ]);
});

test("filterRuntimeChanges returns an empty list unchanged", () => {
  assert.deepEqual(git.filterRuntimeChanges([], repo, dataDir), []);
});

test("diffGitSnapshots renders a change without a double space", () => {
  const saved = {
    available: true,
    repository: repo,
    branch: "main",
    changes: [" M src/index.ts"],
  };
  const current = {
    available: true,
    repository: repo,
    branch: "main",
    changes: ["?? src/new.ts"],
  };

  const differences = git.diffGitSnapshots(saved, current);

  assert.ok(differences.some((line) => line === "New change: ?? src/new.ts"));
  assert.ok(differences.some((line) => line === "Resolved change: M src/index.ts"));
});
