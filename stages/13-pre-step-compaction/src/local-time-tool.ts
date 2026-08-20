import type { Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

/** Contribute a real local capability without changing the agent loop. */
export const LocalTimeTool = Object.assign((ctx: Context) => {
  ctx.effect(() => ctx.labTools.register({
    name: 'get_local_time',
    description: 'Read the local date and time of the computer running the harness.',
    parameters: {},
    async execute() {
      return new Date().toString()
    },
  }))
}, {
  inject: ['labTools'],
})
