import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type { CompactionPlan } from './compaction.ts'
import type { ContextBlock, ContextMeasurement, TokenBudget } from './token-meter.ts'

export type BudgetDecision =
  | { kind: 'send'; measurement: ContextMeasurement }
  | { kind: 'compact'; measurement: ContextMeasurement; plan: CompactionPlan }

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labBudgetPolicy: BudgetPolicy
  }
}

/** Decide whether to send the current Context or ask compaction to intervene. */
export class BudgetPolicy extends Service {
  static inject = ['labTokenMeter', 'labCompaction']

  constructor(ctx: Context) {
    super(ctx, 'labBudgetPolicy')
  }

  decide(blocks: ContextBlock[], budget: TokenBudget): BudgetDecision {
    const measurement = this.ctx.labTokenMeter.measure(blocks, budget)
    if (!measurement.underPressure) {
      return { kind: 'send', measurement }
    }
    return {
      kind: 'compact',
      measurement,
      plan: this.ctx.labCompaction.plan(measurement, blocks),
    }
  }
}
