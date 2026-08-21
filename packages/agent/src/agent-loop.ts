import { randomUUID } from 'node:crypto'

import type { ModelChatMessage, ModelRequest } from '@agent-harness/core'
import type { AgentDriver, AgentRunInput } from './contracts.ts'
import type { AgentLoopDependencies } from './ports.ts'

/** The integrated request path assembled from capability seams. */
export class DefaultAgentLoop implements AgentDriver {
  constructor(private readonly dependencies: AgentLoopDependencies) {}

  async run({ prompt, budget: tokenBudget, agentId }: AgentRunInput): Promise<string> {
    const { session, scopes, clock, context, budget, compaction, tools, toolResults, llm, model, maxToolRounds } = this.dependencies
    const scope = scopes.resolve(agentId)
    session.append({ kind: 'agent_scope', agentId: scope.agentId, systemPrompt: scope.systemPrompt })
    session.append({ kind: 'message', role: 'user', content: prompt })

    const history = session.deriveMessages()
    const summary = session.latestContextSummary()
    const systemMessage = { role: 'system' as const, content: scope.systemPrompt }
    const blockList = context.build(systemMessage, summary?.content ?? null, clock.currentTime(), history)
    const decision = budget.decide(blockList, tokenBudget)
    const finalBlocks = decision.kind === 'compact'
      ? await compaction.compact(blockList, decision.plan)
      : blockList
    if (decision.kind === 'compact') {
      const summaryBlock = finalBlocks.find((block) => block.name === 'summary')
      const summaryContent = summaryBlock?.messages[0]?.content
      if (summaryContent) {
        session.append({ kind: 'context_summary', content: summaryContent, coversMessageCount: history.length })
      }
    }
    const messages = context.flatten(finalBlocks)
    let request: ModelRequest = {
      requestId: randomUUID(),
      model,
      messages,
      tools: tools.schemas(scope.capabilities),
    }
    for (let round = 0; round < maxToolRounds; round += 1) {
      session.append({ kind: 'model_request', request })
      const response = await llm.complete(request)
      session.append({ kind: 'model_response', response })
      if (response.toolCalls.length === 0) return response.content ?? ''

      const toolMessages: ModelChatMessage[] = [...request.messages, {
        role: 'assistant' as const,
        content: response.content ?? '',
        toolCalls: response.toolCalls,
      }]
      for (const call of response.toolCalls) {
        session.append({ kind: 'tool_call', requestId: request.requestId, callId: call.id, tool: call })
        let fullContent: string
        try {
          fullContent = await tools.execute(call.name, call.arguments, scope.capabilities)
        } catch (error) {
          fullContent = `[tool_error] ${error instanceof Error ? error.message : String(error)}`
        }
        session.append({ kind: 'tool_result', requestId: request.requestId, callId: call.id, content: fullContent })
        toolMessages.push({ role: 'tool', toolCallId: call.id, content: toolResults.limit(fullContent) })
      }
      request = { ...request, requestId: randomUUID(), messages: toolMessages }
    }
    throw new Error(`tool loop exceeded maximum rounds: ${maxToolRounds}`)
  }
}

/** Backwards-compatible name for the default implementation inside this lab. */
export { DefaultAgentLoop as AgentLoop }
