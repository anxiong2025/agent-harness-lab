import { defaultMessages } from '@agent-harness/llm'
import type { ScopeRegistry } from '@agent-harness/scope'

/** Register the Agent compositions exposed by the CLI application. */
export function registerCliAgentScopes(scopes: ScopeRegistry): void {
  scopes.register({
    agentId: 'concise',
    systemPrompt: defaultMessages()[0]?.content ?? '你是一个简洁的助手。',
    capabilities: new Set(['get_local_time', 'get_hong_kong_weather']),
  })
  scopes.register({
    agentId: 'coding',
    systemPrompt: '你是一个专业的编程助手。请先理解问题，再给出清晰、可执行的代码建议。',
    capabilities: new Set(['get_local_time', 'read_file']),
  })
}
