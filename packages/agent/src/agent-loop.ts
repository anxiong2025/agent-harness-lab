import { randomUUID } from 'node:crypto'

import type { ModelChatMessage, ModelRequest } from '@agent-harness/core'
import type { AgentDriver, AgentRunInput } from './contracts.ts'
import type { AgentLoopDependencies } from './ports.ts'

/** The integrated request path assembled from capability seams. */
export class DefaultAgentLoop implements AgentDriver {
  constructor(private readonly dependencies: AgentLoopDependencies) {}

  async run({ prompt, budget: tokenBudget, agentId }: AgentRunInput): Promise<string> {
    const { session, scopes, clock, context, budget, compaction, tools, llm, model } = this.dependencies
    const scope = scopes.resolve(agentId)
    session.append({ kind: 'agent_scope', agentId: scope.agentId, systemPrompt: scope.systemPrompt })
    session.append({ kind: 'message', role: 'user', content: prompt })

    const history = session.deriveMessages()
    const systemMessage = { role: 'system' as const, content: scope.systemPrompt }
    const blockList = context.build(systemMessage, null, clock.currentTime(), history)
    const decision = budget.decide(blockList, tokenBudget)
    const finalBlocks = decision.kind === 'compact'
      ? await compaction.compact(blockList, decision.plan)
      : blockList
    const messages = context.flatten(finalBlocks)
    const request: ModelRequest = {
      requestId: randomUUID(),
      model,
      messages,
      tools: tools.schemas(),
    }
    session.append({ kind: 'model_request', request })
    const response = await llm.complete(request)
    session.append({ kind: 'model_response', response })
    if (response.toolCalls.length === 0) return response.content ?? ''

    const toolMessages: ModelChatMessage[] = [...messages, {
      role: 'assistant' as const,
      content: response.content ?? '',
      toolCalls: response.toolCalls,
    }]
    for (const call of response.toolCalls) {
      session.append({ kind: 'tool_call', requestId: request.requestId, callId: call.id, tool: call })
      const content = await tools.execute(call.name, call.arguments)
      session.append({ kind: 'tool_result', requestId: request.requestId, callId: call.id, content })
      toolMessages.push({ role: 'tool', toolCallId: call.id, content })
    }
    const followup: ModelRequest = { ...request, requestId: randomUUID(), messages: toolMessages }
    session.append({ kind: 'model_request', request: followup })
    const finalResponse = await llm.complete(followup)
    session.append({ kind: 'model_response', response: finalResponse })
    return finalResponse.content ?? ''
  }
}

/** Backwards-compatible name for the default implementation inside this lab. */
export { DefaultAgentLoop as AgentLoop }
