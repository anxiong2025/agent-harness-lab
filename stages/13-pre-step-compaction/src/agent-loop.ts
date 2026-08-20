import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'
import { randomUUID } from 'node:crypto'

import type {} from './events.ts'
import type { AgentPreStep } from './events.ts'
import type { ContextBlock, TokenBudget } from '../../12-token-meter/src/token-meter.ts'
import type { ChatMessage } from './llm-provider.ts'
import type { JsonObject } from './core/contracts.ts'

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labAgentLoop: AgentLoop
  }
}

/** Own the pre-step waterfall that decides which Context reaches the model. */
export class AgentLoop extends Service {
  static inject = ['labContextSurface', 'labLlm', 'labTools', 'labSession']

  constructor(ctx: Context) {
    super(ctx, 'labAgentLoop')
  }

  async run(budget: TokenBudget): Promise<ContextBlock[]> {
    const step: AgentPreStep = {
      blocks: this.ctx.labContextSurface.build(),
      budget,
    }
    return this.ctx.waterfall('lab/agent-pre-step', step, async () => {
      console.log('[agent-loop] request accepted')
      console.log('[agent-loop] model-visible messages:')
      for (const block of step.blocks) {
        for (const message of block.messages) {
          console.log(`  [${block.name}] ${message.role}: ${message.content}`)
        }
      }
      const messages: ChatMessage[] = step.blocks.flatMap((block) => block.messages)
      const tools = this.ctx.labTools.schemas()
      const requestId = randomUUID()
      this.ctx.labSession.append({
        kind: 'model_request',
        request_id: requestId,
        messages: structuredClone(messages),
        tools: structuredClone(tools),
      })
      const firstReply = await this.ctx.labLlm.complete(messages, tools)
      this.ctx.labSession.append({
        kind: 'model_response',
        request_id: requestId,
        content: firstReply.content,
        tool_calls: structuredClone(firstReply.toolCalls),
      })
      if (firstReply.toolCalls.length === 0) {
        console.log(`[assistant] ${firstReply.content}`)
        return step.blocks
      }

      messages.push({ role: 'assistant', content: firstReply.content, tool_calls: firstReply.toolCalls })
      for (const call of firstReply.toolCalls) {
        console.log(`[model tool_call] ${call.function.name}(${call.function.arguments})`)
        const arguments_ = JSON.parse(call.function.arguments) as JsonObject
        this.ctx.labSession.append({
          kind: 'tool_call',
          request_id: requestId,
          call_id: call.id,
          name: call.function.name,
          arguments: structuredClone(arguments_),
        })
        const result = await this.ctx.labTools.execute(call.function.name, arguments_)
        console.log(`[tool result] ${result}`)
        messages.push({ role: 'tool', tool_call_id: call.id, content: result })
        this.ctx.labSession.append({
          kind: 'tool_result',
          request_id: requestId,
          call_id: call.id,
          content: result,
        })
      }

      const followupRequestId = randomUUID()
      this.ctx.labSession.append({
        kind: 'model_request',
        request_id: followupRequestId,
        messages: structuredClone(messages),
        tools: structuredClone(tools),
      })
      const finalReply = await this.ctx.labLlm.complete(messages, tools)
      this.ctx.labSession.append({
        kind: 'model_response',
        request_id: followupRequestId,
        content: finalReply.content,
        tool_calls: structuredClone(finalReply.toolCalls),
      })
      console.log(`[assistant] ${finalReply.content}`)
      return step.blocks
    })
  }
}
