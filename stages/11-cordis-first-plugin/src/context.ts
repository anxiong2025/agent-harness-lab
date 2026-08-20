import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type { ModelMessage } from './session.ts'

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labContext: RequestContext
  }
}

/** Context service that consumes the clock instead of importing its provider. */
export class RequestContext extends Service {
  static inject = ['labClock', 'labSession']

  constructor(ctx: Context) {
    super(ctx, 'labContext')
    ctx.effect(() => {
      console.log('[context] service available')
      return () => console.log('[context] service removed')
    })
  }

  build(): ModelMessage[] {
    const messages: ModelMessage[] = [
      {
        role: 'system',
        content: `当前运行 Harness 的时间是 ${this.ctx.labClock.currentTime()}。`,
      },
    ]
    for (const event of this.ctx.labSession.events) {
      if (event.kind === 'agent_scope') {
        messages.unshift({ role: 'system', content: event.systemPrompt })
      }
      if (event.kind === 'message') {
        messages.push({ role: 'user', content: event.content })
      }
      if (event.kind === 'model_response') {
        messages.push({ role: 'assistant', content: event.content })
      }
    }
    return messages
  }
}
