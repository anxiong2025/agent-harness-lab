export type PluginHost = {
  registerService<T>(name: string, service: T): void
  service<T>(name: string): T
}

export type Plugin = {
  name: string
  dependencies?: string[]
  apply(host: PluginHost): void | Promise<void>
}

/** Compose capability providers with explicit dependencies and lifecycle ownership. */
export class Runtime implements PluginHost {
  private readonly services = new Map<string, unknown>()
  private readonly plugins = new Map<string, Plugin>()

  registerService<T>(name: string, service: T): void {
    if (this.services.has(name)) throw new Error(`duplicate service: ${name}`)
    this.services.set(name, service)
  }

  service<T>(name: string): T {
    const service = this.services.get(name)
    if (service === undefined) throw new Error(`service is not mounted: ${name}`)
    return service as T
  }

  async mount(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.name)) return
    for (const dependency of plugin.dependencies ?? []) {
      if (!this.plugins.has(dependency)) throw new Error(`plugin ${plugin.name} requires ${dependency}`)
    }
    await plugin.apply(this)
    this.plugins.set(plugin.name, plugin)
  }
}
