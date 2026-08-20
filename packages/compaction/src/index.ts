import type { ContextBlock } from '@agent-harness/context'

export type TokenBudget = {
  contextWindowTokens: number
  reservedOutputTokens: number
}

export type ContextMeasurement = {
  inputBudgetTokens: number
  totalEstimatedTokens: number
  remainingTokens: number
  underPressure: boolean
  blocks: Array<{ name: string; estimatedTokens: number }>
}

/** Estimate and attribute input tokens without deciding how to compact them. */
export class TokenMeter {
  measure(blocks: ContextBlock[], budget: TokenBudget): ContextMeasurement {
    const inputBudgetTokens = budget.contextWindowTokens - budget.reservedOutputTokens
    if (inputBudgetTokens <= 0) throw new Error('reserved output must leave input budget')
    const measurements = blocks.map((block) => ({
      name: block.name,
      estimatedTokens: block.messages.reduce(
        (total, message) => total + Math.ceil((message.role.length + message.content.length) / 4),
        0,
      ),
    }))
    const totalEstimatedTokens = measurements.reduce((total, block) => total + block.estimatedTokens, 0)
    const remainingTokens = inputBudgetTokens - totalEstimatedTokens
    return { inputBudgetTokens, totalEstimatedTokens, remainingTokens, underPressure: remainingTokens < 0, blocks: measurements }
  }
}

export type CompactionPlan = {
  reason: 'context_pressure'
  measuredTokens: number
  inputBudgetTokens: number
  requiredReductionTokens: number
  candidateBlocks: string[]
}

/** Produce a pressure plan; a separate provider owns summary replacement. */
export class CompactionEngine {
  plan(measurement: ContextMeasurement, blocks: ContextBlock[]): CompactionPlan {
    return {
      reason: 'context_pressure',
      measuredTokens: measurement.totalEstimatedTokens,
      inputBudgetTokens: measurement.inputBudgetTokens,
      requiredReductionTokens: Math.abs(measurement.remainingTokens),
      candidateBlocks: blocks.filter((block) => block.compactable).map((block) => block.name),
    }
  }
}

export type BudgetDecision =
  | { kind: 'send'; measurement: ContextMeasurement }
  | { kind: 'compact'; measurement: ContextMeasurement; plan: CompactionPlan }

/** Decide whether an assembled context can be sent or needs a pre-step rewrite. */
export class BudgetPolicy {
  constructor(
    private readonly meter: TokenMeter,
    private readonly compaction: CompactionEngine,
  ) {}

  decide(blocks: ContextBlock[], budget: TokenBudget): BudgetDecision {
    const measurement = this.meter.measure(blocks, budget)
    if (!measurement.underPressure) return { kind: 'send', measurement }
    return { kind: 'compact', measurement, plan: this.compaction.plan(measurement, blocks) }
  }
}

export interface CompactionProvider {
  compact(blocks: ContextBlock[], plan: CompactionPlan): Promise<ContextBlock[]>
}

/** Deterministic provider used until an LLM summarization provider is composed. */
export class BasicCompactionProvider implements CompactionProvider {
  async compact(blocks: ContextBlock[], plan: CompactionPlan): Promise<ContextBlock[]> {
    if (plan.candidateBlocks.length === 0) throw new Error('context pressure has no compactable block')
    const recentMessages = blocks.find((block) => block.name === 'recent_history')?.messages ?? []
    const latestUser = [...recentMessages].reverse().find((message) => message.role === 'user')
    return blocks.flatMap((block) => {
      if (block.name === 'summary') return [{ ...block, messages: [{ role: 'system', content: '较早对话已压缩；请以最近消息为准。' }] }]
      if (block.name === 'recent_history') {
        return latestUser ? [{ ...block, messages: [latestUser] }] : []
      }
      return [block]
    })
  }
}
