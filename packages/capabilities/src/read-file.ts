import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { JsonObject } from '@agent-harness/core'

type ReadFileArguments = JsonObject & {
  path?: unknown
  max_chars?: unknown
}

/** Tool definition for reading text files within an explicitly configured root. */
export type ReadFileTool = {
  name: 'read_file'
  description: string
  parameters: JsonObject
  execute(arguments_: JsonObject): Promise<string>
}

/** Restricts file reads to a workspace root and rejects symlink escapes. */
export class WorkspaceFileReader {
  constructor(private readonly rootDirectory: string) {}

  async read(arguments_: ReadFileArguments): Promise<string> {
    if (typeof arguments_.path !== 'string' || arguments_.path.length === 0) {
      throw new Error('read_file requires a non-empty path')
    }
    const maxChars = arguments_.max_chars === undefined ? 12000 : arguments_.max_chars
    if (typeof maxChars !== 'number' || !Number.isInteger(maxChars) || maxChars <= 0 || maxChars > 50000) {
      throw new Error('read_file max_chars must be an integer between 1 and 50000')
    }

    const root = await realpath(this.rootDirectory)
    const candidate = resolve(root, arguments_.path)
    const target = await realpath(candidate)
    const relativeTarget = relative(root, target)
    const outsideRoot = relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)
    if (outsideRoot) throw new Error('read_file path must stay inside the workspace root')
    if (!(await stat(target)).isFile()) throw new Error('read_file path must identify a regular file')

    const content = await readFile(target, 'utf8')
    return content.length > maxChars
      ? `${content.slice(0, maxChars)}\n[内容已截断，共 ${content.length} 个字符]`
      : content
  }
}

/** Create a read-only workspace file tool for a coding Agent scope. */
export function createReadFileTool(rootDirectory = process.cwd()): ReadFileTool {
  const reader = new WorkspaceFileReader(rootDirectory)
  return {
    name: 'read_file',
    description: 'Read a UTF-8 text file inside the workspace. Paths outside the workspace are rejected.',
    parameters: {
      path: { type: 'string', description: 'Workspace-relative file path.' },
      max_chars: { type: 'number', description: 'Optional maximum characters to return, from 1 to 50000.' },
    },
    execute(arguments_) {
      return reader.read(arguments_)
    },
  }
}
