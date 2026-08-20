import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type {} from './events.ts'
import type { ContextBlock, TokenBudget } from '../../12-token-meter/src/token-meter.ts'

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labAgentLoop: AgentLoop
  }
}

/** Own the pre-step waterfall that decides which Context reaches the model. */
export class AgentLoop extends Service {
  static inject = ['labContextBlocks']

  constructor(ctx: Context) {
    super(ctx, 'labAgentLoop')
  }

  async run(budget: TokenBudget): Promise<ContextBlock[]> {
    const blocks = this.ctx.labContextBlocks.build()
    return this.ctx.waterfall('lab/agent-pre-step', blocks, budget, async () => {
      console.log('[agent-loop] request accepted')
      return blocks
    })
  }
}
