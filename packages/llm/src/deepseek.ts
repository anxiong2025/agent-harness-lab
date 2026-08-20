import type { ModelMessage, ModelRequest, ModelResponse } from '@agent-harness/core'

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
      body: JSON.stringify({ model: request.model, messages: request.messages }),
    })
    if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status} ${await response.text()}`)
    const body = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('DeepSeek response did not contain text content')
    return { requestId: request.requestId, content }
  }
}

export function defaultMessages(): ModelMessage[] {
  return [{ role: 'system', content: '你是一个简洁的助手，每次回答不超过三句话。' }]
}
