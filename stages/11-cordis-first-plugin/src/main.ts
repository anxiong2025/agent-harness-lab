import { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import { Agent } from './agent.ts'
import { LocalClock } from './clock.ts'
import { RequestContext } from './context.ts'
import { SessionLog } from './session.ts'


const root = new Context()

// 先挂消费者；它会因 labContext 尚不存在而停在 PENDING 状态。
const agentFiber = root.plugin(Agent)
console.log('[main] agent mounted before its dependencies')

const clockFiber = await root.plugin(LocalClock)
await root.plugin(SessionLog)
await root.plugin(RequestContext)
await agentFiber

console.log('[main] session event log:', JSON.stringify(root.labSession.events, null, 2))
console.log('[main] removing clock; dependent plugins should unload automatically')
await clockFiber.dispose()
await root.fiber.dispose()
