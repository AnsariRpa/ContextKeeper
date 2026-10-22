import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  installFakeHost,
  removeFakeHost,
  withTempDir,
  initGitRepo,
  runGitIn,
  loadCommand,
  runCommand,
} from "./harness.js";

installFakeHost();
test.after(() => removeFakeHost());

/** Reads the handover store written by the commands under test. */
async function readStore(dir) {
  const file = path.join(dir, ".contextkeeper", "handovers.json");
  return JSON.parse(await readFile(file, "utf8"));
}

test("capture stores a handover and writes the Markdown report", async () => {
  await withTempDir(async (dir) => {
    const Capture = await loadCommand("commands/contextkeeper/capture.js");
    const { stdout, error } = await runCommand(Capture, [
      "--title",
      "Refactor storage",
      "--task",
      "Make writes atomic",
      "--next",
      "Add tests",
    ]);

    assert.equal(error, undefined, `capture failed: ${error?.message}`);
    assert.match(stdout, /captured successfully/);
    assert.match(stdout, /Markdown:/);

    const items = await readStore(dir);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Refactor storage");
    assert.equal(items[0].task, "Make writes atomic");
    assert.equal(items[0].nextSteps, "Add tests");
    assert.ok(items[0].id, "a handover should get an ID");

    const exports = await readdir(path.join(dir, ".contextkeeper", "exports"));
    assert.deepEqual(exports, [`${items[0].id}.md`]);

    const markdown = await readFile(
      path.join(dir, ".contextkeeper", "exports", `${items[0].id}.md`),
      "utf8",
    );
    assert.match(markdown, /^# Refactor storage$/m);
    assert.match(markdown, /## Current Task/);
    assert.match(markdown, /Make writes atomic/);
    assert.match(markdown, /## Git Development Context/);
  });
});

test("capture succeeds when Git is unavailable and records the reason", async () => {
  await withTempDir(async (dir) => {
    // The temp directory is not a Git repository: Git context must not block capture.
    const Capture = await loadCommand("commands/contextkeeper/capture.js");
    const { stdout, error } = await runCommand(Capture, [
      "--title",
      "No Git here",
      "--task",
      "Test",
      "--next",
      "Continue",
    ]);

    assert.equal(error, undefined, `capture failed: ${error?.message}`);
    assert.match(stdout, /Git context unavailable/);

    const items = await readStore(dir);
    assert.equal(items.length, 1);
    assert.equal(items[0].gitSnapshot.available, false);
    assert.ok(items[0].gitSnapshot.reason, "the reason should be recorded");
    assert.match(items[0].gitContext, /Git context unavailable/);
  });
});

test("capture stores tags and export renders the same Markdown", async () => {
  await withTempDir(async (dir) => {
    const Capture = await loadCommand("commands/contextkeeper/capture.js");
    const Export = await loadCommand("commands/contextkeeper/export.js");

    const captured = await runCommand(Capture, [
      "--title",
      "Tagged handover",
      "--task",
      "Ship it",
      "--next",
      "Deploy",
      "--tags",
      " release , urgent ",
    ]);
    assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);

    const [item] = await readStore(dir);
    assert.deepEqual(item.tags, ["release", "urgent"]);

    const exportPath = path.join(dir, ".contextkeeper", "exports", `${item.id}.md`);
    const fromCapture = await readFile(exportPath, "utf8");

    const exported = await runCommand(Export, [item.id]);
    assert.equal(exported.error, undefined, `export failed: ${exported.error?.message}`);
    assert.match(exported.stdout, /Handover exported/);

    const fromExport = await readFile(exportPath, "utf8");
    assert.equal(
      fromExport,
      fromCapture,
      "capture and export must render identical Markdown",
    );
    assert.match(fromExport, /\*\*Tags:\*\* release, urgent/);
  });
});

test("resume shows the saved handover and the Git context recorded with it", async () => {
  await withTempDir(async (dir) => {
    const Capture = await loadCommand("commands/contextkeeper/capture.js");
    const Resume = await loadCommand("commands/contextkeeper/resume.js");

    const captured = await runCommand(Capture, [
      "--title",
      "Resume me",
      "--task",
      "Continue the work",
      "--next",
      "Finish it",
    ]);
    assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);

    const [item] = await readStore(dir);
    const { stdout, error } = await runCommand(Resume, [item.id]);

    assert.equal(error, undefined, `resume failed: ${error?.message}`);
    assert.match(stdout, /Resume me/);
    assert.match(stdout, /CURRENT TASK/);
    assert.match(stdout, /Continue the work/);
    assert.match(stdout, /NEXT STEPS/);
    assert.match(stdout, /GIT CONTEXT AT HANDOVER/);
  });
});

test("resume reports drift when the working tree changed since the handover", async () => {
  await withTempDir(async (dir) => {
    await initGitRepo(dir);

    const Capture = await loadCommand("commands/contextkeeper/capture.js");
    const Resume = await loadCommand("commands/contextkeeper/resume.js");

    const captured = await runCommand(Capture, [
      "--title",
      "Drift check",
      "--task",
      "Task",
      "--next",
      "Next",
    ]);
    assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);
    const [item] = await readStore(dir);
    assert.equal(item.gitSnapshot.available, true, "Git should be available here");

    // Simulate the working tree moving on after the handover was taken.
    await writeFile(path.join(dir, "new-file.txt"), "changed\n", "utf8");

    const { stdout, error } = await runCommand(Resume, [item.id]);
    assert.equal(error, undefined, `resume failed: ${error?.message}`);
    assert.match(stdout, /WORKING TREE DRIFT SINCE HANDOVER/);
    assert.match(stdout, /New change:/);
    assert.match(stdout, /new-file\.txt/);
  });
});

test("resume does not report drift for ContextKeeper's own data directory", async () => {
  await withTempDir(async (dir) => {
    await initGitRepo(dir);

    const Capture = await loadCommand("commands/contextkeeper/capture.js");
    const Resume = await loadCommand("commands/contextkeeper/resume.js");

    const captured = await runCommand(Capture, [
      "--title",
      "No false drift",
      "--task",
      "Task",
      "--next",
      "Next",
    ]);
    assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);
    const [item] = await readStore(dir);

    // The store lives inside the repository and was just written: that is not drift.
    const { stdout, error } = await runCommand(Resume, [item.id]);
    assert.equal(error, undefined, `resume failed: ${error?.message}`);
    assert.match(stdout, /No differences detected/);
    assert.doesNotMatch(stdout, /\.contextkeeper/);
  });
});

test("resume reports branch drift when the branch changed", async () => {
  await withTempDir(async (dir) => {
    await initGitRepo(dir);

    const Capture = await loadCommand("commands/contextkeeper/capture.js");
    const Resume = await loadCommand("commands/contextkeeper/resume.js");

    const captured = await runCommand(Capture, [
      "--title",
      "Branch drift",
      "--task",
      "Task",
      "--next",
      "Next",
    ]);
    assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);
    const [item] = await readStore(dir);

    await runGitIn(dir, "checkout", "-b", "feature/other");

    const { stdout, error } = await runCommand(Resume, [item.id]);
    assert.equal(error, undefined, `resume failed: ${error?.message}`);
    assert.match(stdout, /Branch changed: main -> feature\/other/);
  });
});

test("resume fails with a clear message for an unknown ID", async () => {
  await withTempDir(async () => {
    const Resume = await loadCommand("commands/contextkeeper/resume.js");
    const { error } = await runCommand(Resume, ["missing-id"]);

    assert.ok(error, "resume should fail for an unknown handover");
    assert.match(error.message, /No handover found with ID "missing-id"/);
  });
});

test("list reports an empty store and can filter with --search", async () => {
  await withTempDir(async (dir) => {
    const Save = await loadCommand("commands/contextkeeper/save.js");
    const List = await loadCommand("commands/contextkeeper/list.js");

    const empty = await runCommand(List, []);
    assert.equal(empty.error, undefined, `list failed: ${empty.error?.message}`);
    assert.match(empty.stdout, /No handovers saved yet/);

    await runCommand(Save, [
      "--title",
      "Fix the parser",
      "--task",
      "Parse JSON",
      "--next",
      "Ship",
      "--tags",
      "parser",
    ]);
    await runCommand(Save, [
      "--title",
      "Write the docs",
      "--task",
      "Document it",
      "--next",
      "Publish",
    ]);

    const all = await runCommand(List, []);
    assert.equal(all.error, undefined, `list failed: ${all.error?.message}`);
    assert.equal((await readStore(dir)).length, 2);
    assert.match(all.stdout, /Fix the parser/);
    assert.match(all.stdout, /Write the docs/);

    const filtered = await runCommand(List, ["--search", "parser"]);
    assert.equal(filtered.error, undefined, `list failed: ${filtered.error?.message}`);
    assert.match(filtered.stdout, /Fix the parser/);
    assert.doesNotMatch(filtered.stdout, /Write the docs/);

    const noMatch = await runCommand(List, ["--search", "nothing-matches"]);
    assert.match(noMatch.stdout, /No handovers match "nothing-matches"/);
  });
});

test("save reports the storage path and stores the handover", async () => {
  await withTempDir(async (dir) => {
    const Save = await loadCommand("commands/contextkeeper/save.js");
    const { stdout, error } = await runCommand(Save, [
      "--title",
      "Saved handover",
      "--task",
      "Do the thing",
      "--next",
      "Then the other thing",
    ]);

    assert.equal(error, undefined, `save failed: ${error?.message}`);
    assert.match(stdout, /Handover saved:/);
    assert.match(
      stdout,
      /Stored locally in .*\.contextkeeper[\\/]handovers\.json/,
    );

    const items = await readStore(dir);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Saved handover");
    assert.equal(items[0].createdAt, items[0].createdAt);
    assert.ok(!Number.isNaN(Date.parse(items[0].createdAt)));
  });
});

test("git-context reports unavailable Git information without failing", async () => {
  await withTempDir(async () => {
    const GitContext = await loadCommand("commands/contextkeeper/git-context.js");
    const { stdout, error } = await runCommand(GitContext, []);

    assert.equal(error, undefined, `git-context failed: ${error?.message}`);
    assert.match(stdout, /GIT DEVELOPMENT CONTEXT/);
    assert.match(stdout, /Git context unavailable/);
    assert.match(stdout, /Make sure Git is installed/);
  });
});

test("export fails with a clear message for an unknown ID", async () => {
  await withTempDir(async () => {
    const Export = await loadCommand("commands/contextkeeper/export.js");
    const { error } = await runCommand(Export, ["does-not-exist"]);

    assert.ok(error, "export should fail for an unknown handover");
    assert.match(error.message, /No handover found with ID: does-not-exist/);
  });
});
