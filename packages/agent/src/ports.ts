import type {
  ModelChatMessage,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  SessionEvent,
  ToolCall,
  ToolSchema,
} from '@agent-harness/core'
import type { ContextBlock } from '@agent-harness/context'
import type { BudgetDecision, CompactionPlan, TokenBudget } from '@agent-harness/compaction'
import type { AgentScope } from '@agent-harness/scope'

/** Minimum session surface required by the agent loop. */
export interface SessionPort {
  append(event: SessionEvent): void
  deriveMessages(): ModelChatMessage[]
  latestContextSummary(): { content: string; coversMessageCount: number } | null
}

/** Model capability used by the loop; providers translate this request themselves. */
export interface LlmPort {
  complete(request: ModelRequest): Promise<ModelResponse>
}

/** Tool capability exposed to one agent scope. */
export interface ToolPort {
  schemas(allowedNames: ReadonlySet<string>): ToolSchema[]
  execute(name: string, arguments_: ToolCall['arguments'], allowedNames: ReadonlySet<string>): Promise<string>
}

/** Converts full tool output into bounded model-visible content. */
export interface ToolResultPort {
  limit(content: string): string
}

/** Agent-scope resolver used to select prompts and capabilities. */
export interface ScopePort {
  resolve(agentId: string): AgentScope
}

/** Runtime clock injected into context assembly. */
export interface ClockPort {
  currentTime(): string
}

/** Context assembly surface; the loop does not know how blocks are produced. */
export interface ContextPort {
  build(
    systemMessage: ModelMessage,
    summary: string | null,
    currentTime: string,
    conversation: ModelChatMessage[],
  ): ContextBlock[]
  flatten(blocks: ContextBlock[]): ModelChatMessage[]
}

/** Token-budget decision surface. */
export interface BudgetPort {
  decide(blocks: ContextBlock[], budget: TokenBudget): BudgetDecision
}

/** Context rewrite surface used when the budget is under pressure. */
export interface CompactionPort {
  compact(blocks: ContextBlock[], plan: CompactionPlan): Promise<ContextBlock[]>
}

/** All runtime capabilities required by the default loop. */
export type AgentLoopDependencies = {
  session: SessionPort
  llm: LlmPort
  tools: ToolPort
  toolResults: ToolResultPort
  scopes: ScopePort
  clock: ClockPort
  context: ContextPort
  budget: BudgetPort
  compaction: CompactionPort
  model: string
  maxToolRounds: number
}
