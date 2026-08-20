import type { TokenBudget } from '@agent-harness/compaction'

export type AgentRunInput = {
  prompt: string
  budget: TokenBudget
  agentId: string
}

export interface AgentDriver {
  run(input: AgentRunInput): Promise<string>
}

export type AgentFactory = {
  agentId: string
  create(): AgentDriver
}
