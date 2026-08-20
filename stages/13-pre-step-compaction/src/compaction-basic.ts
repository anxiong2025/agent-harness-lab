import type { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type {} from './events.ts'

/** DSH-style pre-step pressure listener; summary replacement comes next. */
export const CompactionBasic = Object.assign((ctx: Context) => {
  ctx.on('lab/agent-pre-step', async (blocks, budget, next) => {
    const decision = ctx.labBudgetPolicy.decide(blocks, budget)
    console.log(`[compaction-basic] ${decision.kind}`)
    return next()
  })
}, {
  inject: ['labBudgetPolicy'],
})
