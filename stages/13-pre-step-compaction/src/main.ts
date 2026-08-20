import { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import { AgentLoop } from './agent-loop.ts'
import { CompactionBasic } from './compaction-basic.ts'
import { BudgetPolicy } from '../../12-token-meter/src/budget-policy.ts'
import { CompactionEngine } from '../../12-token-meter/src/compaction.ts'
import { ContextBlocks } from '../../12-token-meter/src/context-blocks.ts'
import { TokenMeter } from '../../12-token-meter/src/token-meter.ts'


const root = new Context()
await root.plugin(CompactionBasic)
await root.plugin(AgentLoop)
await root.plugin(TokenMeter)
await root.plugin(CompactionEngine)
await root.plugin(BudgetPolicy)
await root.plugin(ContextBlocks)

await root.labAgentLoop.run({
  contextWindowTokens: 60,
  reservedOutputTokens: 40,
})
await root.fiber.dispose()
