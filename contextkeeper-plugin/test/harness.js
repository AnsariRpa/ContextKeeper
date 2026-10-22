import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { Config } from "@oclif/core";

const HOST_KEY = Symbol.for("copado.agentia.pluginHost");

/** The plugin root: the directory that holds `dist/` and `package.json`. */
export const PLUGIN_ROOT = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);

/**
 * Builds a fake Agentia plugin host.
 *
 * `AgentiaCommand` resolves the host through the `copado.agentia.pluginHost`
 * well-known symbol, so a command cannot run at all in a test without one.
 * The stub implements only the surface ContextKeeper touches, and every method
 * fails loudly so a test can never silently pass on a missing capability.
 */
export function createFakeHost(overrides = {}) {
  const notImplemented = (namespace) => async () => {
    throw new Error(`Host method ${namespace} is not available in tests`);
  };

  const host = {
    apiVersion: 1,
    cliVersion: "0.0.0-test",
    getTransactionId: () => undefined,
    runWithTransaction: async (_options, action) => action(),
    auth: {
      status: async () => ({ ai: { configured: false } }),
    },
    ai: {
      ask: async () => {
        throw new Error("AI host is not available in tests");
      },
      quota: async () => ({ limit: 0, usage: 0 }),
    },
    environment: { get: notImplemented("environment.get") },
    format: { table: notImplemented("format.table") },
    job: { get: notImplemented("job.get") },
    organization: { get: notImplemented("organization.get") },
    pipeline: { get: notImplemented("pipeline.get") },
    project: { get: notImplemented("project.get") },
    promotion: { get: notImplemented("promotion.get") },
    stage: { get: notImplemented("stage.get") },
    user: { get: notImplemented("user.get") },
    work: { get: notImplemented("work.get") },
    workspace: { get: notImplemented("workspace.get") },
    ...overrides,
  };
  return host;
}

/** Installs a fake host on `globalThis` so commands can resolve it. */
export function installFakeHost(overrides = {}) {
  const host = createFakeHost(overrides);
  globalThis[HOST_KEY] = host;
  return host;
}

export function removeFakeHost() {
  delete globalThis[HOST_KEY];
}

/**
 * Creates an isolated working directory and points `CONTEXTKEEPER_DIR` at it so
 * no test ever reads or writes the developer's real handovers.
 *
 * The working directory is switched to the temp directory as well, so commands
 * resolve their paths the way they would in a real project. Pass
 * `chdir: false` to keep the current directory, or `subdir` to switch into a
 * sub-directory of the temp directory (useful to keep a Git repository and the
 * runtime data in separate places).
 */
export async function withTempDir(run, { chdir = true, subdir } = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "contextkeeper-test-"));
  const previousDir = process.env.CONTEXTKEEPER_DIR;
  const previousCwd = process.cwd();
  process.env.CONTEXTKEEPER_DIR = path.join(tempDir, ".contextkeeper");
  const workingDir = subdir ? path.join(tempDir, subdir) : tempDir;
  if (chdir) {
    await mkdir(workingDir, { recursive: true });
    process.chdir(workingDir);
  }
  try {
    return await run(tempDir);
  } finally {
    if (chdir) process.chdir(previousCwd);
    if (previousDir === undefined) delete process.env.CONTEXTKEEPER_DIR;
    else process.env.CONTEXTKEEPER_DIR = previousDir;
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Runs a Git command in `dir` and returns its trimmed stdout.
 *
 * Used by tests to change the repository state between a capture and a resume.
 */
export async function runGitIn(dir, ...args) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("git", args, {
    cwd: dir,
    windowsHide: true,
  });
  return stdout.trim();
}

/**
 * Initializes a Git repository in `dir` with one commit, so Git context can be
 * exercised for real. Returns the short commit hash.
 */
export async function initGitRepo(dir) {
  const git = (...args) => runGitIn(dir, ...args);

  await mkdir(dir, { recursive: true });
  await git("init", "--initial-branch=main");
  await git("config", "user.email", "test@contextkeeper.local");
  await git("config", "user.name", "ContextKeeper Test");
  await writeFile(path.join(dir, "README.md"), "# test\n", "utf8");
  await git("add", "README.md");
  await git("commit", "-m", "Initial commit");
  return git("rev-parse", "--short", "HEAD");
}

/**
 * Imports a compiled command class from `dist`, bypassing any caching.
 *
 * The path is resolved from the plugin root (the directory holding `dist`),
 * not the current working directory, so it keeps working inside tests that
 * change the working directory.
 */
export async function loadCommand(relativePath) {
  const url = pathToFileURL(path.join(PLUGIN_ROOT, "dist", relativePath)).href;
  const module = await import(`${url}?t=${Date.now()}${Math.random()}`);
  return module.default;
}

/**
 * Builds an oclif `Config` rooted at the plugin.
 *
 * `Command.run` loads a config by discovering the plugin root from the current
 * working directory, which breaks as soon as a test changes it. Building the
 * config once, from the plugin root, keeps command behaviour identical to a
 * real `agentia` invocation.
 */
let cachedConfig;

export async function getConfig() {
  if (!cachedConfig) {
    cachedConfig = await Config.load(PLUGIN_ROOT);
  }
  return cachedConfig;
}

/** Captures everything a command writes to stdout and stderr. */
export function captureOutput() {
  const stdout = [];
  const stderr = [];
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk, ...rest) => {
    stdout.push(chunk.toString());
    return true;
  };
  process.stderr.write = (chunk, ...rest) => {
    stderr.push(chunk.toString());
    return true;
  };

  return {
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
    restore() {
      process.stdout.write = originalOut;
      process.stderr.write = originalErr;
    },
  };
}

/**
 * Runs a command with stdout/stderr captured.
 *
 * The command is instantiated directly with the plugin config, exactly as oclif
 * would, so flag parsing and error handling behave the same as in production.
 * Returns the command output plus the error it threw, if any.
 */
export async function runCommand(CommandClass, argv = []) {
  const config = await getConfig();
  const capture = captureOutput();
  // oclif's error handler sets `process.exitCode`, which would otherwise leak out
  // of the test run and make the whole file look failed.
  const previousExitCode = process.exitCode;
  try {
    const command = new CommandClass(argv, config);
    const result = await command._run();
    return {
      result,
      stdout: capture.stdout(),
      stderr: capture.stderr(),
      error: undefined,
    };
  } catch (error) {
    return {
      result: undefined,
      stdout: capture.stdout(),
      stderr: capture.stderr(),
      error,
    };
  } finally {
    capture.restore();
    process.exitCode = previousExitCode;
  }
}
