import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type { ModelMessage } from '../../12-token-meter/src/token-meter.ts'
import type { ToolDefinition } from './tool-runtime.ts'

export type ToolCall = { id: string; function: { name: string; arguments: string } }

export type ChatMessage =
  | ModelMessage
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ModelReply = { content: string | null; toolCalls: ToolCall[] }

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labLlm: DeepSeekLlm
  }
}

/** Minimal OpenAI-compatible provider used only to make the lab loop real. */
export class DeepSeekLlm extends Service {
  constructor(ctx: Context) {
    super(ctx, 'labLlm')
  }

  async complete(messages: ChatMessage[], tools: Array<Omit<ToolDefinition, 'execute'>>): Promise<ModelReply> {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required to run this demo')
    const response = await fetch(`${process.env.LOOPBASE_BASE_URL ?? 'https://api.deepseek.com'}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.LOOPBASE_MODEL ?? 'deepseek-chat',
        messages,
        tools: tools.map((tool) => ({ type: 'function', function: {
          name: tool.name,
          description: tool.description,
          parameters: { type: 'object', properties: tool.parameters, required: [] },
        } })),
      }),
    })
    if (!response.ok) throw new Error(`model request failed: ${response.status} ${await response.text()}`)
    const body = await response.json() as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }> }
    const message = body.choices[0]?.message
    if (!message) throw new Error('model response had no message choice')
    return { content: message.content, toolCalls: message.tool_calls ?? [] }
  }
}
