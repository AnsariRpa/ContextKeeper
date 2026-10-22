import { AgentiaCommand } from "@copado/agentia-plugin-sdk";
import { Flags } from "@oclif/core";
import { loadHandovers, searchHandovers } from "../../lib/storage.js";

export default class List extends AgentiaCommand {
  static override description = "List saved development handovers";

  static override flags = {
    search: Flags.string({
      description: "Only show handovers matching this text",
      default: "",
    }),
  };

  public async run() {
    const { flags } = await this.parse(List);
    const all = await loadHandovers();
    const items = searchHandovers(all, flags.search);

    if (all.length === 0) {
      this.log(
        "No handovers saved yet. Use agentia contextkeeper save --help",
      );
      return { handovers: [] };
    }

    if (items.length === 0) {
      this.log(`No handovers match "${flags.search}".`);
      return { handovers: [] };
    }

    for (const item of items) {
      this.log(`${item.id} | ${item.title} | ${item.createdAt}`);
    }
    return { handovers: items };
  }
}
