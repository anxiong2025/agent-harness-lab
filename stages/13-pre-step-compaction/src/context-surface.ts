import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type { CompactionPlan } from '../../12-token-meter/src/compaction.ts'
import type { ContextBlock } from '../../12-token-meter/src/token-meter.ts'

export type SurfaceReplacement = {
  generation: number
  blocks: ContextBlock[]
}

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labContextSurface: ContextSurface
  }
}

/**
 * Own the mutable conversation surface that may be replaced before a request.
 *
 * The full durable event log is deliberately outside this small stage.  This
 * service represents the derived, model-visible surface that compaction edits.
 */
export class ContextSurface extends Service {
  private generation = 0
  private blocks: ContextBlock[] = [
    {
      name: 'system',
      compactable: false,
      messages: [{ role: 'system', content: '你是一个简洁的助手。' }],
    },
    {
      name: 'summary',
      compactable: true,
      messages: [{ role: 'system', content: '用户叫安德鲁，偏好徒步和摄影。' }],
    },
    {
      name: 'runtime_time',
      compactable: false,
      messages: [{ role: 'system', content: '当前时间是 2026-08-20T01:30:00-07:00。' }],
    },
    {
      name: 'recent_history',
      compactable: true,
      messages: [
        { role: 'user', content: '我计划十月去日本旅行，预算两万元。' },
        { role: 'assistant', content: '建议优先京都赏枫，搭配东京或北海道。' },
        { role: 'user', content: '请推荐一个适合我的旅行主题，并说明理由。' },
      ],
    },
  ]

  constructor(ctx: Context) {
    super(ctx, 'labContextSurface')
  }

  /** Return the current request surface without granting mutation rights. */
  build(): ContextBlock[] {
    return structuredClone(this.blocks)
  }

  /** Add the current user turn to the model-visible conversation surface. */
  acceptUserInput(content: string): void {
    const history = this.blocks.find((block) => block.name === 'recent_history')
    if (!history) {
      this.blocks.push({
        name: 'recent_history',
        compactable: true,
        messages: [{ role: 'user', content }],
      })
      return
    }
    history.messages.push({ role: 'user', content })
  }

  /**
   * Replace selected past context with a shorter durable summary.
   *
   * A production provider would ask an LLM to produce this summary and append
   * replacement events before this in-memory surface is rebuilt.  The fixed
   * summary lets this stage demonstrate the lifecycle deterministically.
   */
  replace(plan: CompactionPlan): SurfaceReplacement {
    const candidates = new Set(plan.candidateBlocks)
    if (!candidates.has('summary') || !candidates.has('recent_history')) {
      return { generation: this.generation, blocks: this.build() }
    }

    this.generation += 1
    const latestUserMessage = this.blocks
      .find((block) => block.name === 'recent_history')
      ?.messages.findLast((message) => message.role === 'user')

    this.blocks = this.blocks.flatMap((block) => {
      if (block.name === 'summary') {
        return [{
          name: 'summary',
          compactable: true,
          messages: [{
            role: 'system',
            content: '对话摘要：安德鲁偏好徒步摄影；计划十月以两万元预算去日本，希望获得旅行主题建议。',
          }],
        }]
      }
      if (block.name === 'recent_history') {
        // The latest turn is a required tail: the model must still see the
        // question that caused this step, even after older history is folded.
        return latestUserMessage
          ? [{ name: 'recent_history', compactable: true, messages: [latestUserMessage] }]
          : []
      }
      return [block]
    })
    return { generation: this.generation, blocks: this.build() }
  }
}
