import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { config } from 'dotenv'

import type { ModelRequest } from '@agent-harness/core'
import { DeepSeekProvider, defaultMessages } from '@agent-harness/llm'
import { SessionLog } from '@agent-harness/session'

config({ path: new URL('../../../.env', import.meta.url) })

const log = new SessionLog(process.env.HARNESS_LAB_EVENT_LOG ?? 'data/session.events.jsonl')
if (log.read().length === 0) {
  const [systemMessage] = defaultMessages()
  if (!systemMessage) throw new Error('default system message is missing')
  log.append({ kind: 'message', role: 'system', content: systemMessage.content })
}

const provider = new DeepSeekProvider()
const terminal = createInterface({ input, output })
console.log(`已读取 ${log.read().length} 条事件。输入 /exit 退出。`)

while (true) {
  let content: string
  try {
    content = (await terminal.question('你：')).trim()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_USE_AFTER_CLOSE') break
    throw error
  }
  if (content === '/exit') break
  if (!content) continue

  log.append({ kind: 'message', role: 'user', content })
  const request: ModelRequest = {
    requestId: randomUUID(),
    model: process.env.LOOPBASE_MODEL ?? 'deepseek-chat',
    messages: log.deriveMessages(),
    tools: [],
  }
  log.append({ kind: 'model_request', request })
  const response = await provider.complete(request)
  log.append({ kind: 'model_response', response })
  console.log(`模型：${response.content}`)
}

terminal.close()
