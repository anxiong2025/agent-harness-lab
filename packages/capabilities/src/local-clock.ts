/** Capability provider for the machine-local wall clock. */
export class LocalClock {
  currentTime(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  }
}

/** A tool definition for exposing the injected local clock to an agent. */
export type LocalTimeTool = {
  name: 'get_local_time'
  description: string
  parameters: Record<string, never>
  execute(arguments_: Record<string, never>): Promise<string>
}

/** Create the local-time tool without coupling the capability to a registry. */
export function createLocalTimeTool(clock = new LocalClock()): LocalTimeTool {
  return {
    name: 'get_local_time',
    description: 'Read the local date and time of the computer running the harness.',
    parameters: {},
    async execute() {
      return clock.currentTime()
    },
  }
}
