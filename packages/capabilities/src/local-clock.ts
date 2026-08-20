/** Capability provider for the machine-local wall clock. */
export class LocalClock {
  currentTime(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  }
}
