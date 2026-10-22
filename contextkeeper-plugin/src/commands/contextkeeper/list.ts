import {AgentiaCommand} from '@copado/agentia-plugin-sdk'
import {loadHandovers} from '../../lib/storage.js'

export default class List extends AgentiaCommand {
  static override description = 'List saved development handovers'

  public async run() {
    const items = await loadHandovers()
    if (items.length === 0) {
      this.log('No handovers saved yet. Use agentia contextkeeper save --help')
      return {handovers: []}
    }

    for (const item of items) {
      this.log(`${item.id} | ${item.title} | ${item.createdAt}`)
    }
    return {handovers: items}
  }
}
