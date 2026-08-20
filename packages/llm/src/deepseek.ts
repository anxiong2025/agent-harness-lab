import type { JsonObject, ModelMessage, ModelRequest, ModelResponse, ToolCall } from '@agent-harness/core'

export interface LlmProvider {
  complete(request: ModelRequest): Promise<ModelResponse>
}

/** DeepSeek's OpenAI-compatible chat completion provider. */
export class DeepSeekProvider implements LlmProvider {
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required')
    const response = await fetch(`${process.env.LOOPBASE_BASE_URL ?? 'https://api.deepseek.com'}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages.map((message) => {
            if ('toolCalls' in message) {
              return {
                role: 'assistant',
                content: message.content,
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: 'function',
                  function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                })),
              }
            }
            if ('toolCallId' in message) {
              return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
            }
            return message
          }),
          ...(request.tools.length > 0 ? {
            tools: request.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                  type: 'object',
                  properties: tool.parameters,
                  additionalProperties: false,
                },
              },
            })),
          } : {}),
        }),
    })
    if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status} ${await response.text()}`)
    const body = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | null
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
        }
      }>
    }
    const content = body.choices?.[0]?.message?.content
    const toolCalls: ToolCall[] = (body.choices?.[0]?.message?.tool_calls ?? []).map((call) => {
      const parsed = JSON.parse(call.function.arguments) as unknown
      if (!isJsonObject(parsed)) throw new Error(`tool arguments for ${call.function.name} must be an object`)
      return { id: call.id, name: call.function.name, arguments: parsed }
    })
    if (typeof content !== 'string' && toolCalls.length === 0) {
      throw new Error('DeepSeek response contained neither text nor a tool call')
    }
    return { requestId: request.requestId, content: content ?? null, toolCalls }
  }
}

export function defaultMessages(): ModelMessage[] {
  return [{ role: 'system', content: '你是一个简洁的助手，每次回答不超过三句话。' }]
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
