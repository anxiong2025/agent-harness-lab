import type { ModelMessage } from '@agent-harness/core'

export type ContextSummary = {
  content: string
  coversMessageCount: number
}

export type ContextSelection = {
  messages: ModelMessage[]
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
    conversation: ModelMessage[],
    summary: ContextSummary | null,
  ): ContextSelection {
    const messages: ModelMessage[] = [systemMessage]
    const coveredCount = summary?.coversMessageCount ?? 0
    if (summary) {
      messages.push({ role: 'system', content: `以下是较早对话的摘要：\n${summary.content}` })
    }

    let remaining = this.maxCharacters - messages.reduce((total, message) => total + messageCharacters(message), 0)
    const unsummarized = conversation.slice(coveredCount)
    const selectedReversed: ModelMessage[] = []
    for (const message of [...unsummarized].reverse()) {
      const size = messageCharacters(message)
      if (selectedReversed.length > 0 && size > remaining) break
      selectedReversed.push(message)
      remaining -= size
    }

    const selectedTail = selectedReversed.reverse()
    const compactedNow = unsummarized.length - selectedTail.length
    const result = [...messages, ...selectedTail]
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
  messages: ModelMessage[]
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
    conversation: ModelMessage[],
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
        messages: conversation.slice(-this.recentHistoryLimit),
      },
    )
    return blocks
  }
}

export function flattenBlocks(blocks: ContextBlock[]): ModelMessage[] {
  return blocks.flatMap((block) => block.messages)
}

function messageCharacters(message: ModelMessage): number {
  return message.role.length + message.content.length
}
