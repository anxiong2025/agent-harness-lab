import { Service, type Context } from '../../../../deepseek-harness/vendor/cordis/lib/index.js'

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ContextBlock = {
  name: string
  messages: ModelMessage[]
}

export type TokenBudget = {
  contextWindowTokens: number
  reservedOutputTokens: number
}

export type BlockMeasurement = {
  name: string
  estimatedTokens: number
}

export type ContextMeasurement = {
  inputBudgetTokens: number
  totalEstimatedTokens: number
  remainingTokens: number
  underPressure: boolean
  blocks: BlockMeasurement[]
}

declare module '../../../../deepseek-harness/vendor/cordis/lib/index.js' {
  interface Context {
    labTokenMeter: TokenMeter
  }
}

/** Measure named context blocks before a model request is assembled. */
export class TokenMeter extends Service {
  constructor(ctx: Context) {
    super(ctx, 'labTokenMeter')
  }

  measure(blocks: ContextBlock[], budget: TokenBudget): ContextMeasurement {
    const inputBudgetTokens = budget.contextWindowTokens - budget.reservedOutputTokens
    const measurements = blocks.map((block) => ({
      name: block.name,
      estimatedTokens: block.messages.reduce(
        (total, message) => total + this.estimateMessageTokens(message),
        0,
      ),
    }))
    const totalEstimatedTokens = measurements.reduce(
      (total, block) => total + block.estimatedTokens,
      0,
    )
    const remainingTokens = inputBudgetTokens - totalEstimatedTokens

    return {
      inputBudgetTokens,
      totalEstimatedTokens,
      remainingTokens,
      underPressure: remainingTokens < 0,
      blocks: measurements,
    }
  }

  private estimateMessageTokens(message: ModelMessage): number {
    return Math.ceil((message.role.length + message.content.length) / 4)
  }
}
