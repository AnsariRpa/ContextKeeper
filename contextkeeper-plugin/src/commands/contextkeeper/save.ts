import { randomUUID } from "node:crypto";
import { Flags } from "@oclif/core";
import { AgentiaCommand } from "@copado/agentia-plugin-sdk";
import { saveHandover, handoversFile } from "../../lib/storage.js";

export default class Save extends AgentiaCommand {
  static override description = "Save a development session handover locally";

  static override flags = {
    title: Flags.string({ description: "Short handover title", required: true }),
    task: Flags.string({ description: "Current task", required: true }),
    completed: Flags.string({ description: "Work completed", default: "Not specified" }),
    decisions: Flags.string({ description: "Important decisions", default: "None recorded" }),
    blockers: Flags.string({ description: "Unresolved issues", default: "None recorded" }),
    next: Flags.string({ description: "Next steps", required: true }),
    tags: Flags.string({
      description: "Comma-separated tags to make the handover easier to find",
      default: "",
    }),
  };

  public async run() {
    const { flags } = await this.parse(Save);
    const tags = flags.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag !== "");

    const item = {
      id: randomUUID().slice(0, 8),
      title: flags.title,
      task: flags.task,
      completed: flags.completed,
      decisions: flags.decisions,
      blockers: flags.blockers,
      nextSteps: flags.next,
      createdAt: new Date().toISOString(),
      ...(tags.length > 0 ? { tags } : {}),
    };
    await saveHandover(item);
    this.log(`Handover saved: ${item.id}`);
    this.log(`Title: ${item.title}`);
    this.log(`Stored locally in ${handoversFile()}`);
    return item;
  }
}
