import { randomUUID } from 'node:crypto'

import { LocalClock } from '@agent-harness/capabilities'
import { BasicCompactionProvider, BudgetPolicy, CompactionEngine, TokenMeter, type TokenBudget } from '@agent-harness/compaction'
import { ContextBlockBuilder, ContextBuilder, flattenBlocks } from '@agent-harness/context'
import type { ModelChatMessage, ModelRequest } from '@agent-harness/core'
import { DeepSeekProvider } from '@agent-harness/llm'
import { ScopeRegistry } from '@agent-harness/scope'
import { SessionLog } from '@agent-harness/session'
import { ToolRegistry } from '@agent-harness/tools'
import type { AgentDriver, AgentRunInput } from './contracts.ts'

/** The integrated request path assembled from capability seams. */
export class DefaultAgentLoop implements AgentDriver {
  constructor(
    private readonly session: SessionLog,
    private readonly llm: DeepSeekProvider,
    private readonly tools: ToolRegistry,
    private readonly scopes: ScopeRegistry,
    private readonly clock = new LocalClock(),
    private readonly blocks = new ContextBlockBuilder(12),
    private readonly context = new ContextBuilder(480),
    private readonly budget = new BudgetPolicy(new TokenMeter(), new CompactionEngine()),
    private readonly compaction = new BasicCompactionProvider(),
  ) {}

  async run({ prompt, budget: tokenBudget, agentId }: AgentRunInput): Promise<string> {
    const scope = this.scopes.resolve(agentId)
    this.session.append({ kind: 'agent_scope', agentId: scope.agentId, systemPrompt: scope.systemPrompt })
    this.session.append({ kind: 'message', role: 'user', content: prompt })

    const history = this.session.deriveMessages()
    const systemMessage = { role: 'system' as const, content: scope.systemPrompt }
    const blockList = this.blocks.build(systemMessage, null, this.clock.currentTime(), history)
    const decision = this.budget.decide(blockList, tokenBudget)
    const finalBlocks = decision.kind === 'compact'
      ? await this.compaction.compact(blockList, decision.plan)
      : blockList
    const messages = flattenBlocks(finalBlocks)
    const request: ModelRequest = {
      requestId: randomUUID(),
      model: process.env.LOOPBASE_MODEL ?? 'deepseek-chat',
      messages,
      tools: this.tools.schemas(),
    }
    this.session.append({ kind: 'model_request', request })
    const response = await this.llm.complete(request)
    this.session.append({ kind: 'model_response', response })
    if (response.toolCalls.length === 0) return response.content ?? ''

    const toolMessages: ModelChatMessage[] = [...messages, {
      role: 'assistant' as const,
      content: response.content ?? '',
      toolCalls: response.toolCalls,
    }]
    for (const call of response.toolCalls) {
      this.session.append({ kind: 'tool_call', requestId: request.requestId, callId: call.id, tool: call })
      const content = await this.tools.execute(call.name, call.arguments)
      this.session.append({ kind: 'tool_result', requestId: request.requestId, callId: call.id, content })
      toolMessages.push({ role: 'tool', toolCallId: call.id, content })
    }
    const followup: ModelRequest = { ...request, requestId: randomUUID(), messages: toolMessages }
    this.session.append({ kind: 'model_request', request: followup })
    const finalResponse = await this.llm.complete(followup)
    this.session.append({ kind: 'model_response', response: finalResponse })
    return finalResponse.content ?? ''
  }
}

/** Backwards-compatible name for the default implementation inside this lab. */
export { DefaultAgentLoop as AgentLoop }
