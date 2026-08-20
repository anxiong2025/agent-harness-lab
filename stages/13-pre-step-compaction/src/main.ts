import { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'
import { config } from 'dotenv'

import { AgentLoop } from './agent-loop.ts'
import { CompactionBasic } from './compaction-basic.ts'
import { BudgetPolicy } from '../../12-token-meter/src/budget-policy.ts'
import { CompactionEngine } from '../../12-token-meter/src/compaction.ts'
import { TokenMeter } from '../../12-token-meter/src/token-meter.ts'
import { ContextSurface } from './context-surface.ts'
import { DeepSeekLlm } from './llm-provider.ts'
import { LocalTimeTool } from './local-time-tool.ts'
import { ToolRuntime } from './tool-runtime.ts'
import { SessionLog } from './session-log.ts'

config({ path: new URL('../../../.env', import.meta.url) })
const root = new Context()
await root.plugin(CompactionBasic)
await root.plugin(AgentLoop)
await root.plugin(TokenMeter)
await root.plugin(CompactionEngine)
await root.plugin(BudgetPolicy)
await root.plugin(ContextSurface)
await root.plugin(DeepSeekLlm)
await root.plugin(ToolRuntime)
await root.plugin(LocalTimeTool)
await root.plugin(SessionLog)

const promptArguments = process.argv.slice(2)
if (promptArguments[0] === '--') promptArguments.shift()
const prompt = promptArguments.join(' ') || '帮我为十月日本旅行设计一个适合徒步摄影的主题。'
console.log(`[inbox] user: ${prompt}`)
root.labSession.append({ kind: 'message', role: 'user', content: prompt })
root.labContextSurface.acceptUserInput(prompt)

await root.labAgentLoop.run({
  contextWindowTokens: 80,
  reservedOutputTokens: 40,
})
await root.fiber.dispose()
