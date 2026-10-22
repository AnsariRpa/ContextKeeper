import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  writeFile,
  mkdir,
  readFile,
  readdir,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const storageUrl = pathToFileURL(path.resolve("dist/lib/storage.js")).href;
const storage = await import(`${storageUrl}?t=${Date.now()}`);

function handover(overrides = {}) {
  return {
    id: "test-1234",
    title: "Storage test",
    task: "Test persistence",
    completed: "Test created",
    decisions: "Use local JSON",
    blockers: "None",
    nextSteps: "Continue development",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function tempStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "contextkeeper-store-"));
  const previous = process.env.CONTEXTKEEPER_DIR;
  process.env.CONTEXTKEEPER_DIR = path.join(dir, ".contextkeeper");
  return {
    dir,
    file: path.join(dir, ".contextkeeper", "handovers.json"),
    restore() {
      if (previous === undefined) delete process.env.CONTEXTKEEPER_DIR;
      else process.env.CONTEXTKEEPER_DIR = previous;
      return rm(dir, { recursive: true, force: true });
    },
  };
}

test("save, list, and retrieve a handover", async () => {
  const store = await tempStore();
  try {
    const item = handover();
    await storage.saveHandover(item);

    const items = await storage.loadHandovers();
    assert.equal(items.length, 1);
    assert.equal(items[0].id, item.id);
    assert.deepEqual(await storage.getHandover(item.id), item);
    assert.equal(await storage.getHandover("missing"), undefined);
  } finally {
    await store.restore();
  }
});

test("loadHandovers returns an empty list when no store exists", async () => {
  const store = await tempStore();
  try {
    assert.deepEqual(await storage.loadHandovers(), []);
  } finally {
    await store.restore();
  }
});


test("loadHandovers raises a StorageError for corrupt JSON and keeps the file intact", async () => {
  const store = await tempStore();
  try {
    await mkdir(path.dirname(store.file), { recursive: true });
    await writeFile(store.file, "{ not valid json", "utf8");

    await assert.rejects(
      () => storage.loadHandovers(),
      (error) => {
        assert.equal(error.name, "StorageError");
        assert.match(error.message, /not valid JSON/);
        assert.ok(error.hint, "a StorageError should carry an actionable hint");
        return true;
      },
    );

    // The corrupt file must not be silently overwritten.
    assert.equal(await readFile(store.file, "utf8"), "{ not valid json");
  } finally {
    await store.restore();
  }
});

test("loadHandovers raises a StorageError when the store is not an array", async () => {
  const store = await tempStore();
  try {
    await mkdir(path.dirname(store.file), { recursive: true });
    await writeFile(store.file, JSON.stringify({ id: "nope" }), "utf8");

    await assert.rejects(
      () => storage.loadHandovers(),
      /should contain a JSON array/,
    );
  } finally {
    await store.restore();
  }
});

test("saveHandover rejects a duplicate ID instead of overwriting", async () => {
  const store = await tempStore();
  try {
    await storage.saveHandover(handover());
    await assert.rejects(
      () => storage.saveHandover(handover({ title: "Different title" })),
      /already exists/,
    );

    const items = await storage.loadHandovers();
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Storage test");
  } finally {
    await store.restore();
  }
});

test("concurrent saves do not drop handovers", async () => {
  const store = await tempStore();
  try {
    await Promise.all(
      Array.from({ length: 10 }, (_unused, index) =>
        storage.saveHandover(handover({ id: `id-${index}` })),
      ),
    );

    const items = await storage.loadHandovers();
    assert.equal(items.length, 10);
    assert.equal(new Set(items.map((item) => item.id)).size, 10);
  } finally {
    await store.restore();
  }
});

test("storage paths follow the working directory instead of a cached value", async () => {
  const first = await mkdtemp(path.join(os.tmpdir(), "contextkeeper-a-"));
  const second = await mkdtemp(path.join(os.tmpdir(), "contextkeeper-b-"));
  const previous = process.env.CONTEXTKEEPER_DIR;
  delete process.env.CONTEXTKEEPER_DIR;
  const originalCwd = process.cwd();
  try {
    process.chdir(first);
    assert.equal(
      storage.handoversFile(),
      path.join(first, ".contextkeeper", "handovers.json"),
    );

    process.chdir(second);
    assert.equal(
      storage.handoversFile(),
      path.join(second, ".contextkeeper", "handovers.json"),
    );
  } finally {
    process.chdir(originalCwd);
    if (previous === undefined) delete process.env.CONTEXTKEEPER_DIR;
    else process.env.CONTEXTKEEPER_DIR = previous;
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("CONTEXTKEEPER_DIR overrides the default storage location", async () => {
  const store = await tempStore();
  try {
    assert.equal(
      storage.handoversFile(),
      path.join(store.dir, ".contextkeeper", "handovers.json"),
    );
  } finally {
    await store.restore();
  }
});

test("searchHandovers matches titles, tasks, and tags case-insensitively", () => {
  const items = [
    handover({ id: "a", title: "Refactor storage", tags: ["backend"] }),
    handover({ id: "b", title: "Write docs", task: "Document the handover" }),
    handover({ id: "c", title: "Unrelated" }),
  ];

  assert.equal(storage.searchHandovers(items, "storage").length, 1);
  assert.equal(storage.searchHandovers(items, "BACKEND").length, 1);
  assert.equal(storage.searchHandovers(items, "handover").length, 1);
  assert.equal(storage.searchHandovers(items, "").length, 3);
  assert.equal(storage.searchHandovers(items, "nothing-matches").length, 0);
});

test("writeFileAtomically leaves no temporary files behind", async () => {
  const store = await tempStore();
  try {
    const target = path.join(store.dir, "nested", "out.md");
    await storage.writeFileAtomically(target, "hello");

    assert.equal(await readFile(target, "utf8"), "hello");

    const entries = await readdir(path.dirname(target));
    assert.deepEqual(entries, ["out.md"]);
  } finally {
    await store.restore();
  }
});
