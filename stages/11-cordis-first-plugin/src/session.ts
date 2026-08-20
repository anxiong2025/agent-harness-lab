import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type SessionEvent =
  | { kind: 'agent_scope'; systemPrompt: string }
  | { kind: 'message'; content: string }
  | { kind: 'model_request'; requestId: string; messages: ModelMessage[] }
  | { kind: 'model_response'; requestId: string; content: string }

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labSession: SessionLog
  }
}

/** Append-only in-memory session log owned by a Cordis service plugin. */
export class SessionLog extends Service {
  readonly events: SessionEvent[] = []

  constructor(ctx: Context) {
    super(ctx, 'labSession')
    ctx.effect(() => {
      console.log('[session] service available')
      return () => console.log('[session] service removed')
    })
  }

  append(event: SessionEvent): void {
    this.events.push(event)
    console.log(`[session] appended ${event.kind}`)
  }
}
