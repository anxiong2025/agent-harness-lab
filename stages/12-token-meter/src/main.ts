import { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import { Agent } from './agent.ts'
import { BudgetPolicy } from './budget-policy.ts'
import { CompactionEngine } from './compaction.ts'
import { ContextBlocks } from './context-blocks.ts'
import { TokenMeter } from './token-meter.ts'


const root = new Context()

const agentFiber = root.plugin(Agent)
console.log('[main] agent mounted before its dependencies')

await root.plugin(TokenMeter)
await root.plugin(CompactionEngine)
await root.plugin(BudgetPolicy)
await root.plugin(ContextBlocks)
await agentFiber

await root.fiber.dispose()
