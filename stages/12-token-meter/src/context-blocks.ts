import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

import type { ContextBlock } from './token-meter.ts'

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labContextBlocks: ContextBlocks
  }
}

/** Provide named Context Blocks without deciding whether they fit a budget. */
export class ContextBlocks extends Service {
  constructor(ctx: Context) {
    super(ctx, 'labContextBlocks')
  }

  build(): ContextBlock[] {
    return [
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
  }
}
