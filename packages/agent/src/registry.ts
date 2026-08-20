import type { AgentDriver, AgentFactory } from './contracts.ts'

/** Resolve a replaceable Agent implementation by its configured identity. */
export class AgentRegistry {
  private readonly factories = new Map<string, AgentFactory>()

  register(factory: AgentFactory): () => void {
    if (this.factories.has(factory.agentId)) throw new Error(`duplicate agent factory: ${factory.agentId}`)
    this.factories.set(factory.agentId, factory)
    return () => this.factories.delete(factory.agentId)
  }

  create(agentId: string): AgentDriver {
    const factory = this.factories.get(agentId)
    if (!factory) throw new Error(`no agent factory registered for: ${agentId}`)
    return factory.create()
  }
}
