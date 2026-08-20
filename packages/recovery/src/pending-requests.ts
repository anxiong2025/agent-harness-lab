import type { ModelRequest, SessionEvent } from '@agent-harness/core'

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
