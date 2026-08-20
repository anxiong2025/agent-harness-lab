import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labClock: LocalClock
  }
}

/** Cordis service plugin that exposes the machine clock. */
export class LocalClock extends Service {
  constructor(ctx: Context) {
    super(ctx, 'labClock')
    ctx.effect(() => {
      console.log('[clock] service available')
      return () => console.log('[clock] service removed')
    })
  }

  currentTime(): string {
    return new Date().toISOString()
  }
}
