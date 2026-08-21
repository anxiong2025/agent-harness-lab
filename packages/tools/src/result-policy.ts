/** Limits tool output before it is added to a model-visible context. */
export class ToolResultLimiter {
  constructor(readonly maxCharacters: number) {
    if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) {
      throw new Error('maxCharacters must be a positive integer')
    }
  }

  limit(content: string): string {
    if (content.length <= this.maxCharacters) return content
    const omittedCharacters = content.length - this.maxCharacters
    const marker = `\n... [工具结果已截断，省略 ${omittedCharacters} 个字符] ...\n`
    const retainedCharacters = Math.max(0, this.maxCharacters - marker.length)
    const headCharacters = Math.ceil(retainedCharacters * 0.6)
    const tailCharacters = retainedCharacters - headCharacters
    return `${content.slice(0, headCharacters)}${marker}${content.slice(-tailCharacters)}`
  }
}
