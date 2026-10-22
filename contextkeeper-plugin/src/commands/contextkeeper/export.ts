import { AgentiaCommand } from "@copado/agentia-plugin-sdk";
import { Args } from "@oclif/core";
import path from "node:path";
import {
  getHandover,
  exportsDir,
  writeFileAtomically,
} from "../../lib/storage.js";
import { renderHandoverMarkdown } from "../../lib/markdown.js";

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

    const outputPath = path.join(exportsDir(), `${handover.id}.md`);
    await writeFileAtomically(
      outputPath,
      renderHandoverMarkdown(handover),
    );
    this.log(`Handover exported: ${outputPath}`);
  }
}
