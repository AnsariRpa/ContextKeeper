import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'

export type Handover = {
  id: string
  title: string
  task: string
  completed: string
  decisions: string
  blockers: string
  nextSteps: string
  createdAt: string
}

const folder = path.join(process.cwd(), '.contextkeeper')
const file = path.join(folder, 'handovers.json')

export async function loadHandovers(): Promise<Handover[]> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Handover[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function saveHandover(item: Handover): Promise<void> {
  await mkdir(folder, {recursive: true})
  const items = await loadHandovers()
  items.unshift(item)
  await writeFile(file, JSON.stringify(items, null, 2), 'utf8')
}

export async function getHandover(id: string): Promise<Handover | undefined> {
  return (await loadHandovers()).find(item => item.id === id)
}
