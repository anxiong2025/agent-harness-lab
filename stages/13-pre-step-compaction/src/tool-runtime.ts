import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

export type ToolDefinition = {
  name: string
  description: string
  parameters: Record<string, never>
  execute(arguments_: Record<string, never>): Promise<string>
}

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labTools: ToolRuntime
  }
}

/** Register model-visible tools and dispatch the calls the model selects. */
export class ToolRuntime extends Service {
  private readonly definitions = new Map<string, ToolDefinition>()

  constructor(ctx: Context) {
    super(ctx, 'labTools')
  }

  register(definition: ToolDefinition): () => void {
    if (this.definitions.has(definition.name)) throw new Error(`duplicate tool: ${definition.name}`)
    this.definitions.set(definition.name, definition)
    return () => this.definitions.delete(definition.name)
  }

  schemas(): Array<Omit<ToolDefinition, 'execute'>> {
    return [...this.definitions.values()].map(({ execute: _execute, ...schema }) => schema)
  }

  async execute(name: string, arguments_: Record<string, never>): Promise<string> {
    const definition = this.definitions.get(name)
    if (!definition) throw new Error(`tool not found: ${name}`)
    return definition.execute(arguments_)
  }
}
