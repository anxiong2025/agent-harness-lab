import type { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type { ContextBlock, TokenBudget } from '../../12-token-meter/src/token-meter.ts'

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Events {
    'lab/agent-pre-step'(
      blocks: ContextBlock[],
      budget: TokenBudget,
      next: () => Promise<ContextBlock[]>,
    ): Promise<ContextBlock[]>
  }
}
