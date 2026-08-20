import type { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type { TokenBudget } from './token-meter.ts'


function loadPositiveInt(name: string, defaultValue: number): number {
  const rawValue = process.env[name] ?? String(defaultValue)
  const value = Number.parseInt(rawValue, 10)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

function loadBudget(): TokenBudget {
  const contextWindowTokens = loadPositiveInt('LAB_CONTEXT_WINDOW_TOKENS', 160)
  const reservedOutputTokens = loadPositiveInt('LAB_RESERVED_OUTPUT_TOKENS', 40)
  if (reservedOutputTokens >= contextWindowTokens) {
    throw new Error('LAB_RESERVED_OUTPUT_TOKENS must be smaller than the context window')
  }
  return { contextWindowTokens, reservedOutputTokens }
}

/** Consume Context and budget services without knowing their implementations. */
export const Agent = Object.assign((ctx: Context) => {
  ctx.effect(() => {
    const budget = loadBudget()
    const decision = ctx.labBudgetPolicy.decide(ctx.labContextBlocks.build(), budget)
    console.log('[agent] token budget:', JSON.stringify(budget))
    console.log('[agent] budget decision:', JSON.stringify(decision, null, 2))
  })
}, {
  inject: ['labContextBlocks', 'labBudgetPolicy'],
})
