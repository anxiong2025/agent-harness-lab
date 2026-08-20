import type { JsonObject, ToolSchema } from '@agent-harness/core'

export type ToolDefinition = ToolSchema & {
  execute(arguments_: JsonObject): Promise<string>
}

/** Scoped tool registry; callers see schemas and execute only registered names. */
export class ToolRegistry {
  private readonly definitions = new Map<string, ToolDefinition>()

  register(definition: ToolDefinition): () => void {
    if (this.definitions.has(definition.name)) throw new Error(`duplicate tool: ${definition.name}`)
    this.definitions.set(definition.name, definition)
    return () => this.definitions.delete(definition.name)
  }

  schemas(): ToolSchema[] {
    return [...this.definitions.values()].map(({ execute: _execute, ...schema }) => schema)
  }

  async execute(name: string, arguments_: JsonObject): Promise<string> {
    const definition = this.definitions.get(name)
    if (!definition) throw new Error(`tool not found: ${name}`)
    return definition.execute(arguments_)
  }
}
