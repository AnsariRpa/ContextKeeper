import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PLUGIN_ROOT, initGitRepo, runGitIn, withTempDir } from "./harness.js";

const gitUrl = pathToFileURL(path.join(PLUGIN_ROOT, "dist", "lib", "git.js")).href;
const git = await import(`${gitUrl}?t=${Date.now()}`);

test("collectGitSnapshot reports the repository, branch, and HEAD", async () => {
  await withTempDir(async (dir) => {
    const head = await initGitRepo(dir);

    const snapshot = await git.collectGitSnapshot(dir);

    assert.equal(snapshot.available, true);
    assert.equal(path.resolve(snapshot.repository), path.resolve(dir));
    assert.equal(snapshot.branch, "main");
    assert.equal(snapshot.detached, false);
    assert.equal(snapshot.headCommit, head);
    assert.ok(snapshot.commits.length > 0);
  });
});

test("collectGitSnapshot never throws outside a Git repository", async () => {
  await withTempDir(async (dir) => {
    const snapshot = await git.collectGitSnapshot(dir);

    assert.equal(snapshot.available, false);
    assert.ok(snapshot.reason, "an unavailable snapshot must explain itself");
  });
});

test("collectGitSnapshot hides the runtime directory from the working tree", async () => {
  await withTempDir(async (dir) => {
    await initGitRepo(dir);

    // The store is written inside the repository by the very command that
    // takes the snapshot, so it must never show up as a working-tree change.
    const store = path.join(dir, ".contextkeeper");
    await mkdir(path.join(store, "exports"), { recursive: true });
    await writeFile(path.join(store, "handovers.json"), "[]", "utf8");
    await writeFile(path.join(store, "exports", "abc.md"), "# Handover\n", "utf8");

    const snapshot = await git.collectGitSnapshot(dir);

    assert.equal(snapshot.available, true);
    assert.deepEqual(snapshot.changes, []);
  });
});

test("collectGitSnapshot reports a real change in the working tree", async () => {
  await withTempDir(async (dir) => {
    await initGitRepo(dir);
    await writeFile(path.join(dir, "new-file.txt"), "changed\n", "utf8");

    const snapshot = await git.collectGitSnapshot(dir);

    assert.equal(snapshot.available, true);
    assert.equal(snapshot.changes.length, 1);
    assert.match(snapshot.changes[0], /new-file\.txt/);
  });
});

test("collectGitSnapshot resolves a rename to its destination path", async () => {
  await withTempDir(async (dir) => {
    await initGitRepo(dir);
    await writeFile(path.join(dir, "original.ts"), "x\n", "utf8");
    await runGitIn(dir, "add", "original.ts");
    await runGitIn(dir, "commit", "-m", "Add original");
    await runGitIn(dir, "mv", "original.ts", "renamed.ts");

    const snapshot = await git.collectGitSnapshot(dir);

    assert.equal(snapshot.available, true);
    assert.equal(snapshot.changes.length, 1);
    assert.match(snapshot.changes[0], /renamed\.ts/);
    assert.doesNotMatch(snapshot.changes[0], /original\.ts/);
  });
});

test("collectGitSnapshot decodes a quoted path with non-ASCII characters", async () => {
  await withTempDir(async (dir) => {
    await initGitRepo(dir);
    await writeFile(path.join(dir, "caf\u00e9.ts"), "x\n", "utf8");

    const snapshot = await git.collectGitSnapshot(dir);

    assert.equal(snapshot.available, true);
    assert.equal(snapshot.changes.length, 1);
    assert.match(snapshot.changes[0], /caf\u00e9\.ts/);
    assert.doesNotMatch(snapshot.changes[0], /\\303\\251/);
  });
});

test("collectGitSnapshot reports a detached HEAD", async () => {
  await withTempDir(async (dir) => {
    await initGitRepo(dir);
    const head = await runGitIn(dir, "rev-parse", "HEAD");
    await runGitIn(dir, "checkout", "--detach", head);

    const snapshot = await git.collectGitSnapshot(dir);

    assert.equal(snapshot.available, true);
    assert.equal(snapshot.detached, true);
    assert.equal(snapshot.branch, undefined);
  });
});
