import type { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

/** Consume Context and budget services without knowing their implementations. */
export const Agent = Object.assign((ctx: Context) => {
  ctx.effect(() => {
    const decision = ctx.labBudgetPolicy.decide(ctx.labContextBlocks.build(), {
      contextWindowTokens: 160,
      reservedOutputTokens: 40,
    })
    console.log('[agent] budget decision:', JSON.stringify(decision, null, 2))
  })
}, {
  inject: ['labContextBlocks', 'labBudgetPolicy'],
})
