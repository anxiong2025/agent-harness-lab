import type { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'
import { randomUUID } from 'node:crypto'

/** Consumer plugin: it needs a context builder, not a clock implementation. */
export const Agent = Object.assign((ctx: Context) => {
  ctx.effect(() => {
    const userMessage = process.argv
      .slice(2)
      .filter((argument) => argument !== '--')
      .join(' ') || '我的电脑现在几点？'
    ctx.labSession.append({
      kind: 'agent_scope',
      systemPrompt: '你是一个简洁的助手。',
    })
    ctx.labSession.append({ kind: 'message', content: userMessage })

    const requestId = randomUUID()
    const messages = ctx.labContext.build()
    ctx.labSession.append({ kind: 'model_request', requestId, messages })
    console.log('[agent] model request:', JSON.stringify(messages, null, 2))

    ctx.labSession.append({
      kind: 'model_response',
      requestId,
      content: '这是尚未接入真实 LLM 的演示回答。',
    })
    return () => console.log('[agent] consumer removed')
  })
}, {
  inject: ['labSession', 'labContext'],
})
