import type { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type {} from './events.ts'

/** Replace pressure-causing conversation surface before request derivation. */
export const CompactionBasic = Object.assign((ctx: Context) => {
  ctx.on('lab/agent-pre-step', async (step, next) => {
    const decision = ctx.labBudgetPolicy.decide(step.blocks, step.budget)
    if (decision.kind === 'send') {
      console.log(`[compaction-basic] send: ${decision.measurement.totalEstimatedTokens}/${decision.measurement.inputBudgetTokens} tokens`)
      return next()
    }

    console.log(`[compaction-basic] pressure: ${decision.measurement.totalEstimatedTokens}/${decision.measurement.inputBudgetTokens} tokens`)
    const replacement = ctx.labContextSurface.replace(decision.plan)
    const after = ctx.labBudgetPolicy.decide(replacement.blocks, step.budget)

    if (after.kind === 'compact') {
      throw new Error('compaction did not produce a request that fits the input budget')
    }
    console.log(`[compaction-basic] replacement #${replacement.generation}: ${after.measurement.totalEstimatedTokens}/${after.measurement.inputBudgetTokens} tokens`)
    step.blocks = replacement.blocks
    return next()
  })
}, {
  inject: ['labBudgetPolicy', 'labContextSurface'],
})
