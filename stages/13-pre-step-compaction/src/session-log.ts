import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'
import type { SessionEvent } from './core/contracts.ts'

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labSession: SessionLog
  }
}

/** Append model-visible facts to a JSONL session log. */
export class SessionLog extends Service {
  private readonly path = process.env.HARNESS_LAB_EVENT_LOG
    ?? join(process.cwd(), 'events.jsonl')

  constructor(ctx: Context) {
    super(ctx, 'labSession')
    this.ensureDirectory()
  }

  append(event: SessionEvent): void {
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, 'utf8')
  }

  read(): SessionEvent[] {
    if (!existsSync(this.path)) return []
    return readFileSync(this.path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionEvent)
  }

  ensureDirectory(): void {
    // The demo keeps the log beside the command's working directory.
    // Creating its parent here also supports an explicit nested log path.
    const parent = dirname(this.path)
    if (parent !== '.') {
      mkdirSync(parent, { recursive: true })
    }
  }
}
