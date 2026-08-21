import { preserveCompleteToolGroups, type ContextBlock } from '@agent-harness/context'
import type { ModelChatMessage } from '@agent-harness/core'

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
        (total, message) => total + Math.ceil((message.role.length + (message.content ?? '').length) / 4),
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

/** Structured state extracted by the deterministic compaction provider. */
export type StructuredSummary = {
  taskGoal: string
  constraints: string[]
  completed: string[]
  openItems: string[]
  nextAction: string
}

/** Build a conservative summary without inventing facts that are absent from history. */
export function createStructuredSummary(messages: ModelChatMessage[]): StructuredSummary {
  const userMessages = messages.filter((message) => message.role === 'user')
  const assistantMessages = messages.filter((message) => message.role === 'assistant')
  const latestUser = userMessages.at(-1)
  const latestAssistant = assistantMessages.at(-1)
  return {
    taskGoal: latestUser?.content ?? '当前任务未明确。',
    constraints: ['保留用户原始目标；不要假设历史中没有出现的事实。'],
    completed: latestAssistant ? [`最近一次助手输出：${latestAssistant.content}`] : ['暂无可确认的已完成工作。'],
    openItems: ['需要根据当前任务继续确认未完成事项。'],
    nextAction: '从最近的用户目标继续执行，并在产生新结果后更新摘要。',
  }
}

/** Serialize structured state into a stable model-visible summary document. */
export function formatStructuredSummary(summary: StructuredSummary): string {
  return [
    `任务目标：${summary.taskGoal}`,
    `关键约束：${summary.constraints.join('；')}`,
    `已完成工作：${summary.completed.join('；')}`,
    `未完成事项：${summary.openItems.join('；')}`,
    `下一步动作：${summary.nextAction}`,
  ].join('\n')
}

/** Deterministic provider used until an LLM summarization provider is composed. */
export class BasicCompactionProvider implements CompactionProvider {
  async compact(blocks: ContextBlock[], plan: CompactionPlan): Promise<ContextBlock[]> {
    if (plan.candidateBlocks.length === 0) throw new Error('context pressure has no compactable block')
    const recentMessages = blocks.find((block) => block.name === 'recent_history')?.messages ?? []
    let latestUserIndex = -1
    recentMessages.forEach((message, index) => {
      if (message.role === 'user') latestUserIndex = index
    })
    const retainedMessages = latestUserIndex >= 0
      ? preserveCompleteToolGroups(recentMessages.slice(latestUserIndex))
      : []
    const summaryContent = formatStructuredSummary(createStructuredSummary(recentMessages))
    const hasSummary = blocks.some((block) => block.name === 'summary')
    const compacted = blocks.flatMap((block) => {
      if (block.name === 'summary') return [{ ...block, messages: [{ role: 'system' as const, content: summaryContent }] }]
      if (block.name === 'recent_history') {
        return retainedMessages.length > 0 ? [{ ...block, messages: retainedMessages }] : []
      }
      return [block]
    })
    if (hasSummary) return compacted
    const runtimeIndex = compacted.findIndex((block) => block.name === 'runtime_time')
    compacted.splice(runtimeIndex < 0 ? 1 : runtimeIndex, 0, {
      name: 'summary',
      source: 'context_summary',
      cacheStable: true,
      compactable: true,
      messages: [{ role: 'system' as const, content: summaryContent }],
    })
    return compacted
  }
}
