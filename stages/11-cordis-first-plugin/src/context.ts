import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labContext: RequestContext
  }
}

/** Context service that consumes the clock instead of importing its provider. */
export class RequestContext extends Service {
  static inject = ['labClock']

  constructor(ctx: Context) {
    super(ctx, 'labContext')
    ctx.effect(() => {
      console.log('[context] service available')
      return () => console.log('[context] service removed')
    })
  }

  build(userMessage: string): Array<{ role: string; content: string }> {
    return [
      { role: 'system', content: '你是一个简洁的助手。' },
      {
        role: 'system',
        content: `当前运行 Harness 的时间是 ${this.ctx.labClock.currentTime()}。`,
      },
      { role: 'user', content: userMessage },
    ]
  }
}
