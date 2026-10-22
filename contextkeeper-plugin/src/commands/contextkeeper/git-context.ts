import { AgentiaCommand } from "@copado/agentia-plugin-sdk";
import { collectGitSnapshot } from "../../lib/git.js";

export default class GitContext extends AgentiaCommand {
  static description = "Capture recent Git activity for a development handover";

  async run(): Promise<void> {
    const snapshot = await collectGitSnapshot();

    if (!snapshot.available) {
      // Report the reason instead of failing: Git context is optional enrichment.
      this.log("GIT DEVELOPMENT CONTEXT");
      this.log("=======================");
      this.log(`Repository: ${process.cwd()}`);
      this.log(`Git context unavailable: ${snapshot.reason ?? "unknown"}`);
      this.log(
        "Make sure Git is installed and that you are inside a Git repository.",
      );
      return;
    }

    this.log("GIT DEVELOPMENT CONTEXT");
    this.log("=======================");
    this.log(`Repository: ${snapshot.repository}`);
    this.log(`Branch: ${snapshot.branch || "(detached HEAD)"}`);
    this.log("");
    this.log("WORKING TREE");
    this.log(
      snapshot.changes && snapshot.changes.length > 0
        ? snapshot.changes.join("\n")
        : "No uncommitted changes detected.",
    );
    this.log("");
    this.log("LAST FIVE COMMITS");
    this.log(
      snapshot.commits && snapshot.commits.length > 0
        ? snapshot.commits.join("\n")
        : "No commits yet.",
    );
  }
}
