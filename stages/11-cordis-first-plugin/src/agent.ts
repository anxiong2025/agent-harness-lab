import type { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

/** Consumer plugin: it needs a context builder, not a clock implementation. */
export const Agent = Object.assign((ctx: Context) => {
  ctx.effect(() => {
    const request = ctx.labContext.build('我的电脑现在几点？')
    console.log('[agent] model request:', JSON.stringify(request, null, 2))
    return () => console.log('[agent] consumer removed')
  })
}, {
  inject: ['labContext'],
})
