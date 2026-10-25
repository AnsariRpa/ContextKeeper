import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  installFakeHost,
  removeFakeHost,
  withTempDir,
  loadCommand,
  runCommand,
} from "./harness.js";

installFakeHost();
test.after(() => removeFakeHost());

async function readStore(dir) {
  const file = path.join(dir, ".contextkeeper", "handovers.json");
  return JSON.parse(await readFile(file, "utf8"));
}

test("capture with --ai-summary generates and persists an AI summary", async () => {
  await withTempDir(async (dir) => {
    const originalFetch = global.fetch;
    let calls = 0;
    let requestBody = "";
    global.fetch = async (_url, options) => {
      calls += 1;
      requestBody = options?.body ?? "";
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: "AI summary text" }),
      };
    };
    try {
      const Capture = await loadCommand("commands/contextkeeper/capture.js");
      const Resume = await loadCommand("commands/contextkeeper/resume.js");
      const Export = await loadCommand("commands/contextkeeper/export.js");

      const captured = await runCommand(Capture, [
        "--title",
        "AI handover",
        "--task",
        "Implement feature",
        "--completed",
        "Wrote code",
        "--decisions",
        "Use Ollama",
        "--blockers",
        "None",
        "--next",
        "Run tests",
        "--ai-summary",
      ]);

      assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);
      assert.match(captured.stdout, /AI summary generated/);
      assert.equal(calls, 1, "Ollama should be called once");

      assert.match(requestBody, /Implement feature/);
      assert.match(requestBody, /Use Ollama/);

      const [item] = await readStore(dir);
      assert.equal(item.summary, "AI summary text");
      assert.equal(item.summarySource, "ai");
      assert.equal(item.summaryProvider, "ollama");
      assert.equal(item.aiProvider, "ollama");
      assert.equal(item.summaryModel, "qwen2.5:3b");
      assert.equal(item.aiModel, "qwen2.5:3b");
      assert.ok(item.summaryTimestamp, "a timestamp should be persisted");
      assert.equal(item.summaryTimestamp, item.summaryGeneratedAt);
      assert.equal(item.summaryProvenance.provider, "ollama");
      assert.equal(item.summaryProvenance.model, "qwen2.5:3b");

      const exportPath = path.join(dir, ".contextkeeper", "exports", `${item.id}.md`);
      const markdown = await readFile(exportPath, "utf8");
      assert.match(markdown, /## AI Summary/);
      assert.match(markdown, /AI summary text/);

      const exported = await runCommand(Export, [item.id]);
      assert.equal(exported.error, undefined, `export failed: ${exported.error?.message}`);

      const resumed = await runCommand(Resume, [item.id]);
      assert.equal(resumed.error, undefined, `resume failed: ${resumed.error?.message}`);
      assert.match(resumed.stdout, /AI SUMMARY/);
      assert.match(resumed.stdout, /AI summary text/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});


test("capture with --ai-summary warns and preserves notes when Ollama fails", async () => {
  await withTempDir(async (dir) => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    try {
      const Capture = await loadCommand("commands/contextkeeper/capture.js");
      const captured = await runCommand(Capture, [
        "--title",
        "Failure handover",
        "--task",
        "Keep notes",
        "--next",
        "Retry later",
        "--ai-summary",
      ]);

      assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);
      const output = `${captured.stdout}\n${captured.stderr}`;
      assert.match(output, /could not be generated/i);

      const [item] = await readStore(dir);
      assert.equal(item.title, "Failure handover");
      assert.equal(item.task, "Keep notes");
      assert.equal(item.nextSteps, "Retry later");
      assert.equal(item.summary, undefined);
      assert.equal(item.summarySource, undefined);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("capture with --ai-summary warns on malformed Ollama responses", async () => {
  await withTempDir(async (dir) => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: "shape" }),
    });
    try {
      const Capture = await loadCommand("commands/contextkeeper/capture.js");
      const captured = await runCommand(Capture, [
        "--title",
        "Malformed handover",
        "--task",
        "Keep notes",
        "--next",
        "Retry later",
        "--ai-summary",
      ]);

      assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);
      const output = `${captured.stdout}\n${captured.stderr}`;
      assert.match(output, /could not be generated/i);

      const [item] = await readStore(dir);
      assert.equal(item.summary, undefined);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("capture with --ai-summary warns when Ollama returns invalid JSON", async () => {
  await withTempDir(async (dir) => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Unexpected token");
      },
    });
    try {
      const Capture = await loadCommand("commands/contextkeeper/capture.js");
      const captured = await runCommand(Capture, [
        "--title",
        "Bad JSON handover",
        "--task",
        "Keep notes",
        "--next",
        "Retry later",
        "--ai-summary",
      ]);

      assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);
      const output = `${captured.stdout}\n${captured.stderr}`;
      assert.match(output, /could not be generated/i);

      const [item] = await readStore(dir);
      assert.equal(item.summary, undefined);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("capture without --ai-summary does not call Ollama and leaves no summary", async () => {
  await withTempDir(async (dir) => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw new Error("should not be called");
    };
    try {
      const Capture = await loadCommand("commands/contextkeeper/capture.js");
      const captured = await runCommand(Capture, [
        "--title",
        "Plain handover",
        "--task",
        "No AI",
        "--next",
        "Continue",
      ]);

      assert.equal(captured.error, undefined, `capture failed: ${captured.error?.message}`);
      assert.equal(calls, 0, "Ollama must not be called without the flag");

      const [item] = await readStore(dir);
      assert.equal(item.summary, undefined);
      assert.equal(item.summarySource, undefined);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
