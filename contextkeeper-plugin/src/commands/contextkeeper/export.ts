import { AgentiaCommand } from "@copado/agentia-plugin-sdk";
import { Args } from "@oclif/core";
import { getHandover } from "../../lib/storage.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export default class Export extends AgentiaCommand {
  static description = "Export a saved handover as a Markdown file";

  static args = {
    id: Args.string({
      description: "Handover ID to export",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Export);
    const handover = await getHandover(args.id);

    if (!handover) this.error(`No handover found with ID: ${args.id}`);

    const directory = path.join(process.cwd(), ".contextkeeper", "exports");
    await mkdir(directory, { recursive: true });

    const sections = [
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
    ];

    if (handover.gitContext) {
      sections.push("## Git Development Context", "", handover.gitContext, "");
    }

    const outputPath = path.join(directory, `${handover.id}.md`);
    await writeFile(outputPath, sections.join("\n"), "utf8");
    this.log(`Handover exported: ${outputPath}`);
  }
}
