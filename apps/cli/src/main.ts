import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

import { DefaultAgentLoop } from '@agent-harness/agent'
import type { AgentLoopDependencies } from '@agent-harness/agent/ports'
import { AgentRegistry } from '@agent-harness/agent/registry'
import { BasicCompactionProvider, BudgetPolicy, CompactionEngine, TokenMeter } from '@agent-harness/compaction'
import { ContextBlockBuilder } from '@agent-harness/context'
import { createHongKongWeatherTool, createLocalTimeTool, createReadFileTool, LocalClock } from '@agent-harness/capabilities'
import { DeepSeekProvider, defaultMessages } from '@agent-harness/llm'
import { SessionLog } from '@agent-harness/session'
import { ScopeRegistry } from '@agent-harness/scope'
import { ToolRegistry } from '@agent-harness/tools'
import { ToolResultLimiter } from '@agent-harness/tools/result-policy'
import { findPendingToolCalls, repairPendingToolCalls } from '@agent-harness/recovery'
import { registerCliAgentScopes } from './agents.js'

config({ path: new URL('../../../.env', import.meta.url) })

const log = new SessionLog(process.env.HARNESS_LAB_EVENT_LOG ?? 'data/session.events.jsonl')
let existingEvents = log.read()
if (existingEvents.length === 0) {
  const [systemMessage] = defaultMessages()
  if (!systemMessage) throw new Error('default system message is missing')
  const initialEvent = { kind: 'message' as const, role: 'system' as const, content: systemMessage.content }
  log.append(initialEvent)
  existingEvents = [initialEvent]
}
const repairedToolResults = repairPendingToolCalls(existingEvents)
for (const result of repairedToolResults) log.append(result)
existingEvents = [...existingEvents, ...repairedToolResults]
const pendingToolCalls = findPendingToolCalls(existingEvents)

const provider = new DeepSeekProvider()
const clock = new LocalClock()
const tools = new ToolRegistry()
const toolResults = new ToolResultLimiter(4000)
tools.register(createLocalTimeTool(clock))
tools.register(createHongKongWeatherTool())
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))
tools.register(createReadFileTool(workspaceRoot))
const scopes = new ScopeRegistry()
registerCliAgentScopes(scopes)
const agents = new AgentRegistry()
const contextBlocks = new ContextBlockBuilder(12)
const dependencies: AgentLoopDependencies = {
  session: log,
  llm: provider,
  tools,
  toolResults,
  scopes,
  clock,
  context: contextBlocks,
  budget: new BudgetPolicy(new TokenMeter(), new CompactionEngine()),
  compaction: new BasicCompactionProvider(),
  model: process.env.LOOPBASE_MODEL ?? 'deepseek-chat',
  maxToolRounds: 4,
}
agents.register({
  agentId: 'concise',
  create: () => new DefaultAgentLoop(dependencies),
})
agents.register({
  agentId: 'coding',
  create: () => new DefaultAgentLoop(dependencies),
})
let activeAgentId = 'concise'
let agent = agents.create(activeAgentId)
const terminal = createInterface({ input, output })
console.log(`已读取 ${existingEvents.length} 条事件。当前 Agent：${activeAgentId}。输入 /agent coding 或 /agent concise 切换。`)
if (repairedToolResults.length > 0) {
  console.log(`已为 ${repairedToolResults.length} 个中断工具调用写入 unknown 结果，未自动重试。`)
}
if (pendingToolCalls.length > 0) {
  console.log(`发现 ${pendingToolCalls.length} 个未完成工具调用：${pendingToolCalls.map((pending) => pending.tool.name).join(', ')}`)
}

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

  if (content.startsWith('/agent ')) {
    const requestedAgentId = content.slice('/agent '.length).trim()
    try {
      agent = agents.create(requestedAgentId)
      activeAgentId = requestedAgentId
      console.log(`已切换到 Agent：${activeAgentId}`)
    } catch (error) {
      console.log(error instanceof Error ? error.message : String(error))
    }
    continue
  }

  const answer = await agent.run({
    prompt: content,
    agentId: activeAgentId,
    budget: { contextWindowTokens: 800, reservedOutputTokens: 400 },
  })
  console.log(`模型：${answer}`)
}

terminal.close()
