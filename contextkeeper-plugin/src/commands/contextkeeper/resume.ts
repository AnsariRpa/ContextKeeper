import {Args} from '@oclif/core'
import {AgentiaCommand} from '@copado/agentia-plugin-sdk'
import {getHandover} from '../../lib/storage.js'

export default class Resume extends AgentiaCommand {
  static override description = 'Resume work from a saved handover'
  static override args = {
    id: Args.string({description: 'Handover ID', required: true}),
  }

  public async run() {
    const {args} = await this.parse(Resume)
    const item = await getHandover(args.id)

    if (!item) this.error(`No handover found with ID "${args.id}". Run agentia contextkeeper list.`)

    this.log(`\n${item.title}`)
    this.log(`Created: ${item.createdAt}`)
    this.log(`\nCURRENT TASK\n${item.task}`)
    this.log(`\nCOMPLETED\n${item.completed}`)
    this.log(`\nDECISIONS\n${item.decisions}`)
    this.log(`\nBLOCKERS\n${item.blockers}`)
    this.log(`\nNEXT STEPS\n${item.nextSteps}`)
    return item
  }
}
