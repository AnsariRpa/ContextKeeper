import { AgentiaCommand } from "@copado/agentia-plugin-sdk";
import { Flags } from "@oclif/core";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  saveHandover,
  exportsDir,
  writeFileAtomically,
} from "../../lib/storage.js";
import { collectGitSnapshot, renderGitContext } from "../../lib/git.js";
import { renderHandoverMarkdown } from "../../lib/markdown.js";

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
    tags: Flags.string({
      description: "Comma-separated tags to make the handover easier to find",
      default: "",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Capture);

    // Git context is enrichment, never a requirement: when Git is unavailable the
    // handover is still captured and the reason is recorded alongside it.
    const gitSnapshot = await collectGitSnapshot();
    const gitContext = renderGitContext(gitSnapshot);

    const tags = flags.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag !== "");

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
      gitSnapshot,
      ...(tags.length > 0 ? { tags } : {}),
    };

    await saveHandover(handover);

    const outputPath = path.join(exportsDir(), `${handover.id}.md`);
    await writeFileAtomically(outputPath, renderHandoverMarkdown(handover));

    this.log("ContextKeeper handover captured successfully.");
    this.log(`ID: ${handover.id}`);
    this.log(`Title: ${handover.title}`);
    if (gitSnapshot.available) {
      this.log(`Git branch: ${gitSnapshot.branch || "(detached HEAD)"}`);
    } else {
      this.log(`Git context unavailable: ${gitSnapshot.reason ?? "unknown"}`);
    }
    this.log(`Markdown: ${outputPath}`);
    this.log(`Resume with: agentia contextkeeper resume ${handover.id}`);
  }
}
