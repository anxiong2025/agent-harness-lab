import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { SessionEvent } from '@agent-harness/core'

/** Durable append-only event store used to reconstruct a session surface. */
export class SessionLog {
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true })
  }

  append(event: SessionEvent): void {
    appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, 'utf8')
  }

  read(): SessionEvent[] {
    if (!existsSync(this.filePath)) return []
    return readFileSync(this.filePath, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as SessionEvent)
  }
}
