import { AgentiaCommand } from "@copado/agentia-plugin-sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default class GitContext extends AgentiaCommand {
  static description = "Capture recent Git activity for a development handover";

  async run(): Promise<void> {
    const runGit = async (args: string[]) => {
      const { stdout } = await execFileAsync("git", args, {
        cwd: process.cwd(),
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      return stdout.trim();
    };

    try {
      const branch = await runGit(["branch", "--show-current"]);
      const status = await runGit(["status", "--short"]);

      let commits = "No commits yet.";
      try {
        commits = await runGit([
          "log",
          "-5",
          "--pretty=format:%h | %s | %ad",
          "--date=short",
        ]) || "No commits yet.";
      } catch {
        // A new repository can legitimately have no commits.
      }

      this.log("GIT DEVELOPMENT CONTEXT");
      this.log("=======================");
      this.log(`Repository: ${process.cwd()}`);
      this.log(`Branch: ${branch || "(detached HEAD)"}`);
      this.log("");
      this.log("WORKING TREE");
      this.log(status || "No uncommitted changes detected.");
      this.log("");
      this.log("LAST FIVE COMMITS");
      this.log(commits);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.error(
        `Could not read Git context. Make sure you're inside a Git repository.\n${message}`,
      );
    }
  }
}
