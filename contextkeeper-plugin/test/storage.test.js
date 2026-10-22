import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("save, list, and retrieve a handover", async () => {
  const originalCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "contextkeeper-test-"));
  const storageUrl = pathToFileURL(
    path.resolve("dist/lib/storage.js")
  ).href;

  try {
    // Isolate this test from your real handovers.
    process.chdir(tempDir);
    const storage = await import(`${storageUrl}?test=${Date.now()}`);

    const handover = {
      id: "test-1234",
      title: "Storage test",
      task: "Test persistence",
      completed: "Test created",
      decisions: "Use local JSON",
      blockers: "None",
      nextSteps: "Continue development",
      createdAt: new Date().toISOString(),
    };

    await storage.saveHandover(handover);

    const items = await storage.loadHandovers();
    assert.equal(items.length, 1);
    assert.equal(items[0].id, handover.id);
    assert.deepEqual(await storage.getHandover(handover.id), handover);
    assert.equal(await storage.getHandover("missing"), undefined);
  } finally {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});
