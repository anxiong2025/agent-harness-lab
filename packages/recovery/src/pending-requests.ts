import type { ModelRequest, SessionEvent, ToolCall } from '@agent-harness/core'

export type PendingToolCall = {
  requestId: string
  callId: string
  tool: ToolCall
}

/** Find frozen requests that have no authoritative response event. */
export function findPendingRequests(events: SessionEvent[]): ModelRequest[] {
  const requests = new Map<string, ModelRequest>()
  const completed = new Set<string>()
  for (const event of events) {
    if (event.kind === 'model_request') requests.set(event.request.requestId, event.request)
    if (event.kind === 'model_response') completed.add(event.response.requestId)
  }
  return [...requests.entries()]
    .filter(([requestId]) => !completed.has(requestId))
    .map(([, request]) => request)
}

/** Find tool calls that were logged without a matching result event. */
export function findPendingToolCalls(events: SessionEvent[]): PendingToolCall[] {
  const calls = new Map<string, PendingToolCall>()
  const completed = new Set<string>()
  for (const event of events) {
    if (event.kind === 'tool_call') {
      calls.set(toolKey(event.requestId, event.callId), {
        requestId: event.requestId,
        callId: event.callId,
        tool: event.tool,
      })
    }
    if (event.kind === 'tool_result') completed.add(toolKey(event.requestId, event.callId))
  }
  return [...calls.entries()]
    .filter(([key]) => !completed.has(key))
    .map(([, call]) => call)
}

/**
 * Create durable placeholder results for calls interrupted before their result was logged.
 * The placeholder preserves the message pairing without replaying a possibly side-effecting tool.
 */
export function repairPendingToolCalls(events: SessionEvent[]): SessionEvent[] {
  return findPendingToolCalls(events).map(({ requestId, callId, tool }) => ({
    kind: 'tool_result',
    requestId,
    callId,
    outcome: 'unknown',
    content: [
      'TOOL_OUTCOME_UNKNOWN',
      `工具 ${tool.name} 在上次运行中被中断，执行结果未知。`,
      '如果该工具是只读或幂等操作，可以重试；如果可能产生副作用，请先查询外部状态或请求用户确认。不要盲目重试。',
    ].join('\n'),
  }))
}

function toolKey(requestId: string, callId: string): string {
  return `${requestId}:${callId}`
}
