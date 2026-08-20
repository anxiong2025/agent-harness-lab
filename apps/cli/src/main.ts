import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { config } from 'dotenv'

import { DefaultAgentLoop } from '@agent-harness/agent'
import type { AgentLoopDependencies } from '@agent-harness/agent/ports'
import { BasicCompactionProvider, BudgetPolicy, CompactionEngine, TokenMeter } from '@agent-harness/compaction'
import { ContextBlockBuilder } from '@agent-harness/context'
import { AgentRegistry } from '@agent-harness/agent/registry'
import { createHongKongWeatherTool, createLocalTimeTool, LocalClock } from '@agent-harness/capabilities'
import { DeepSeekProvider, defaultMessages } from '@agent-harness/llm'
import { SessionLog } from '@agent-harness/session'
import { ScopeRegistry } from '@agent-harness/scope'
import { ToolRegistry } from '@agent-harness/tools'

config({ path: new URL('../../../.env', import.meta.url) })

const log = new SessionLog(process.env.HARNESS_LAB_EVENT_LOG ?? 'data/session.events.jsonl')
if (log.read().length === 0) {
  const [systemMessage] = defaultMessages()
  if (!systemMessage) throw new Error('default system message is missing')
  log.append({ kind: 'message', role: 'system', content: systemMessage.content })
}

const provider = new DeepSeekProvider()
const clock = new LocalClock()
const tools = new ToolRegistry()
tools.register(createLocalTimeTool(clock))
tools.register(createHongKongWeatherTool())
const scopes = new ScopeRegistry()
scopes.register({
  agentId: 'concise',
  systemPrompt: defaultMessages()[0]?.content ?? '你是一个简洁的助手。',
  capabilities: new Set(['get_local_time', 'get_hong_kong_weather']),
})
const agents = new AgentRegistry()
const contextBlocks = new ContextBlockBuilder(12)
const dependencies: AgentLoopDependencies = {
  session: log,
  llm: provider,
  tools,
  scopes,
  clock,
  context: contextBlocks,
  budget: new BudgetPolicy(new TokenMeter(), new CompactionEngine()),
  compaction: new BasicCompactionProvider(),
  model: process.env.LOOPBASE_MODEL ?? 'deepseek-chat',
}
agents.register({
  agentId: 'concise',
  create: () => new DefaultAgentLoop(dependencies),
})
const agent = agents.create('concise')
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

  const answer = await agent.run({
    prompt: content,
    agentId: 'concise',
    budget: { contextWindowTokens: 800, reservedOutputTokens: 400 },
  })
  console.log(`模型：${answer}`)
}

terminal.close()
