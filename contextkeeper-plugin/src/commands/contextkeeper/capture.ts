import { AgentiaCommand } from "@copado/agentia-plugin-sdk";
import { Flags } from "@oclif/core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { saveHandover } from "../../lib/storage.js";

const execFileAsync = promisify(execFile);

export default class Capture extends AgentiaCommand {
  static description =
    "Save a development handover with automatically captured Git context";

  static flags = {
    title: Flags.string({ description: "Short handover title", required: true }),
    task: Flags.string({ description: "Current task", required: true }),
    completed: Flags.string({
      description: "Work completed so far",
      default: "Not specified",
    }),
    decisions: Flags.string({
      description: "Important decisions",
      default: "None recorded",
    }),
    blockers: Flags.string({
      description: "Current blockers",
      default: "None recorded",
    }),
    next: Flags.string({ description: "Next steps", required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Capture);

    const runGit = async (args: string[]) => {
      const { stdout } = await execFileAsync("git", args, {
        cwd: process.cwd(),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      return stdout.trim();
    };

    let gitContext: string;
    try {
      const repository = await runGit(["rev-parse", "--show-toplevel"]);
      const branch = await runGit(["branch", "--show-current"]);
      const status = await runGit(["status", "--short"]);

      let commits = "No commits yet.";
      try {
        commits =
          (await runGit([
            "log",
            "-5",
            "--pretty=format:%h | %s | %ad",
            "--date=short",
          ])) || "No commits yet.";
      } catch {
        // Empty Git history is valid.
      }

      gitContext = [
        `Repository: ${repository}`,
        `Branch: ${branch || "(detached HEAD)"}`,
        "",
        "Working tree:",
        status || "No uncommitted changes detected.",
        "",
        "Recent commits:",
        commits,
      ].join("\n");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(`Could not capture Git context: ${message}`);
    }

    const handover = {
      id: randomUUID().slice(0, 8),
      title: flags.title,
      task: flags.task,
      completed: flags.completed,
      decisions: flags.decisions,
      blockers: flags.blockers,
      nextSteps: flags.next,
      createdAt: new Date().toISOString(),
      gitContext,
    };

    await saveHandover(handover);

    const directory = path.join(process.cwd(), ".contextkeeper", "exports");
    await mkdir(directory, { recursive: true });

    const markdown = [
      `# ${handover.title}`,
      "",
      `**Created:** ${handover.createdAt}`,
      `**Handover ID:** ${handover.id}`,
      "",
      "## Current Task",
      handover.task,
      "",
      "## Completed Work",
      handover.completed,
      "",
      "## Key Decisions",
      handover.decisions,
      "",
      "## Blockers",
      handover.blockers,
      "",
      "## Next Steps",
      handover.nextSteps,
      "",
      "## Git Development Context",
      "",
      handover.gitContext,
      "",
    ].join("\n");

    const outputPath = path.join(directory, `${handover.id}.md`);
    await writeFile(outputPath, markdown, "utf8");

    this.log("ContextKeeper handover captured successfully.");
    this.log(`ID: ${handover.id}`);
    this.log(`Title: ${handover.title}`);
    this.log(`Git branch: ${gitContext.split("\n")[1]?.replace("Branch: ", "")}`);
    this.log(`Markdown: ${outputPath}`);
    this.log(`Resume with: agentia contextkeeper resume ${handover.id}`);
  }
}
