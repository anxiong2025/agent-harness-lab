import type { ModelChatMessage, ModelMessage } from '@agent-harness/core'

export type ContextSummary = {
  content: string
  coversMessageCount: number
}

export type ContextSelection = {
  messages: ModelChatMessage[]
  selectedTailCount: number
  compactThroughMessageCount: number | null
  usedCharacters: number
}

/** Select a system prompt, summary, and newest contiguous tail for one request. */
export class ContextBuilder {
  constructor(readonly maxCharacters: number) {
    if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) {
      throw new Error('maxCharacters must be a positive integer')
    }
  }

  build(
    systemMessage: ModelMessage,
    conversation: ModelChatMessage[],
    summary: ContextSummary | null,
  ): ContextSelection {
    const messages: ModelChatMessage[] = [systemMessage]
    const coveredCount = summary?.coversMessageCount ?? 0
    if (summary) {
      messages.push({ role: 'system', content: `以下是较早对话的摘要：\n${summary.content}` })
    }

    let remaining = this.maxCharacters - messages.reduce((total, message) => total + messageCharacters(message), 0)
    const unsummarized = conversation.slice(coveredCount)
    const selectedReversed: ModelChatMessage[] = []
    for (const message of [...unsummarized].reverse()) {
      const size = messageCharacters(message)
      if (selectedReversed.length > 0 && size > remaining) break
      selectedReversed.push(message)
      remaining -= size
    }

    const selectedTail = selectedReversed.reverse()
    const compactedNow = unsummarized.length - selectedTail.length
    const result = [...messages, ...preserveCompleteToolGroups(selectedTail)]
    return {
      messages: result,
      selectedTailCount: selectedTail.length,
      compactThroughMessageCount: compactedNow > 0 ? coveredCount + compactedNow : null,
      usedCharacters: result.reduce((total, message) => total + messageCharacters(message), 0),
    }
  }
}

export type ContextBlock = {
  name: string
  source: string
  cacheStable: boolean
  compactable: boolean
  messages: ModelChatMessage[]
}

/** Build named prompt blocks so stable prefixes remain independently observable. */
export class ContextBlockBuilder {
  constructor(readonly recentHistoryLimit: number) {
    if (!Number.isInteger(recentHistoryLimit) || recentHistoryLimit < 0) {
      throw new Error('recentHistoryLimit must be a non-negative integer')
    }
  }

  build(
    systemMessage: ModelMessage,
    summary: string | null,
    currentTime: string,
    conversation: ModelChatMessage[],
  ): ContextBlock[] {
    const blocks: ContextBlock[] = [{
      name: 'system',
      source: 'agent_scope',
      cacheStable: true,
      compactable: false,
      messages: [systemMessage],
    }]
    if (summary !== null) {
      blocks.push({
        name: 'summary',
        source: 'context_summary',
        cacheStable: true,
        compactable: true,
        messages: [{ role: 'system', content: `以下是较早对话的摘要：\n${summary}` }],
      })
    }
    blocks.push(
      {
        name: 'runtime_time',
        source: 'local_clock',
        cacheStable: false,
        compactable: false,
        messages: [{ role: 'system', content: `当前运行 Harness 的电脑本地时间是 ${currentTime}。涉及当前日期或时间时，以此为准。` }],
      },
      {
        name: 'recent_history',
        source: 'event_log',
        cacheStable: false,
        compactable: true,
        messages: selectRecentHistory(conversation, this.recentHistoryLimit),
      },
    )
    return blocks
  }

  /** Flatten named blocks into the ordered model-visible message list. */
  flatten(blocks: ContextBlock[]): ModelChatMessage[] {
    return flattenBlocks(blocks)
  }
}

export function flattenBlocks(blocks: ContextBlock[]): ModelChatMessage[] {
  return blocks.flatMap((block) => block.messages)
}

function messageCharacters(message: ModelChatMessage): number {
  return message.role.length + (message.content ?? '').length
}

function selectRecentHistory(messages: ModelChatMessage[], limit: number): ModelChatMessage[] {
  if (limit === 0) return []
  let start = Math.max(0, messages.length - limit)
  while (start > 0 && messages[start]?.role === 'tool') start -= 1
  return preserveCompleteToolGroups(messages.slice(start))
}

/** Remove incomplete tool-call groups from a model-visible message selection. */
export function preserveCompleteToolGroups(messages: ModelChatMessage[]): ModelChatMessage[] {
  const result = [...messages]
  while (result[0]?.role === 'tool') result.shift()
  for (const message of [...result]) {
    if (message.role !== 'assistant' || !('toolCalls' in message)) continue
    const callIds = new Set(message.toolCalls.map((call) => call.id))
    const resultIds = new Set(
      result
        .filter((candidate): candidate is Extract<ModelChatMessage, { role: 'tool' }> => candidate.role === 'tool')
        .map((candidate) => candidate.toolCallId),
    )
    if ([...callIds].every((callId) => resultIds.has(callId))) continue
    const index = result.indexOf(message)
    result.splice(index, 1)
    for (let cursor = result.length - 1; cursor >= 0; cursor -= 1) {
      const candidate = result[cursor]
      if (candidate?.role === 'tool' && callIds.has(candidate.toolCallId)) result.splice(cursor, 1)
    }
  }
  return result
}
