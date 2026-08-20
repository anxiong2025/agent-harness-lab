export type AgentScope = {
  agentId: string
  systemPrompt: string
  capabilities: ReadonlySet<string>
}

/** Resolve named agent compositions without leaking capabilities across scopes. */
export class ScopeRegistry {
  private readonly scopes = new Map<string, AgentScope>()

  register(scope: AgentScope): () => void {
    if (this.scopes.has(scope.agentId)) throw new Error(`duplicate agent scope: ${scope.agentId}`)
    this.scopes.set(scope.agentId, scope)
    return () => this.scopes.delete(scope.agentId)
  }

  resolve(agentId: string): AgentScope {
    const scope = this.scopes.get(agentId)
    if (!scope) throw new Error(`unknown agent scope: ${agentId}`)
    return scope
  }
}
