import type { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type { ContextBlock, TokenBudget } from '../../12-token-meter/src/token-meter.ts'

/** Mutable request draft shared by pre-step plugins in one agent step. */
export type AgentPreStep = {
  blocks: ContextBlock[]
  budget: TokenBudget
}

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Events {
    'lab/agent-pre-step'(
      step: AgentPreStep,
      next: () => Promise<ContextBlock[]>,
    ): Promise<ContextBlock[]>
  }
}
