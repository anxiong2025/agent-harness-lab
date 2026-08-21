import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { ModelMessage, ModelRequest, SessionEvent } from '@agent-harness/core'

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

  deriveMessages(events = this.read()): ModelMessage[] {
    return events.flatMap((event) => {
      if (event.kind === 'message') return [{ role: event.role, content: event.content }]
      if (event.kind === 'model_response' && event.response.content !== null) {
        return [{ role: 'assistant' as const, content: event.response.content }]
      }
      return []
    })
  }

  latestContextSummary(events = this.read()): { content: string; coversMessageCount: number } | null {
    for (const event of [...events].reverse()) {
      if (event.kind === 'context_summary') {
        return { content: event.content, coversMessageCount: event.coversMessageCount }
      }
    }
    return null
  }

  pendingRequests(events = this.read()): ModelRequest[] {
    const requests = new Map<string, ModelRequest>()
    const responses = new Set<string>()
    for (const event of events) {
      if (event.kind === 'model_request') requests.set(event.request.requestId, event.request)
      if (event.kind === 'model_response') responses.add(event.response.requestId)
    }
    return [...requests.entries()]
      .filter(([requestId]) => !responses.has(requestId))
      .map(([, request]) => request)
  }
}
