export type SubagentHandoff = {
  subagentId: string
  agentId: string
  task: string
  result: string
}

type RunningSubagent = Omit<SubagentHandoff, 'result'>

/** Enforce that a parent consumes only an explicit, completed subagent result. */
export class SubagentHandoffRegistry {
  private readonly running = new Map<string, RunningSubagent>()

  start(input: RunningSubagent): void {
    if (this.running.has(input.subagentId)) throw new Error(`duplicate subagent: ${input.subagentId}`)
    this.running.set(input.subagentId, input)
  }

  complete(handoff: SubagentHandoff): void {
    const running = this.running.get(handoff.subagentId)
    if (!running) throw new Error(`subagent is not running: ${handoff.subagentId}`)
    if (running.agentId !== handoff.agentId || running.task !== handoff.task) {
      throw new Error(`subagent handoff does not match its start record: ${handoff.subagentId}`)
    }
    this.running.delete(handoff.subagentId)
  }

  isRunning(subagentId: string): boolean {
    return this.running.has(subagentId)
  }
}
