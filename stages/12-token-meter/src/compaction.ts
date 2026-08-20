import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type { ContextBlock, ContextMeasurement } from './token-meter.ts'

export type CompactionPlan = {
  reason: 'context_pressure'
  measuredTokens: number
  inputBudgetTokens: number
  requiredReductionTokens: number
  candidateBlocks: string[]
}

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labCompaction: CompactionEngine
  }
}

/** Own future context replacement without owning token measurement. */
export class CompactionEngine extends Service {
  constructor(ctx: Context) {
    super(ctx, 'labCompaction')
  }

  plan(measurement: ContextMeasurement, blocks: ContextBlock[]): CompactionPlan {
    return {
      reason: 'context_pressure',
      measuredTokens: measurement.totalEstimatedTokens,
      inputBudgetTokens: measurement.inputBudgetTokens,
      requiredReductionTokens: Math.abs(measurement.remainingTokens),
      candidateBlocks: blocks
        .filter((block) => block.compactable)
        .map((block) => block.name),
    }
  }
}
