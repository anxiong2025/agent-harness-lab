/** JSON values crossing model, tool, wire, or durable-storage boundaries. */
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export type ToolCall = {
  id: string
  name: string
  arguments: JsonObject
}

export type ToolSchema = {
  name: string
  description: string
  parameters: JsonObject
}

export type SessionEvent =
  | { kind: 'message'; role: 'system' | 'user' | 'assistant'; content: string }
  | { kind: 'model_request'; requestId: string; messages: JsonValue[]; tools: ToolSchema[] }
  | { kind: 'model_response'; requestId: string; content: string | null; toolCalls: ToolCall[] }
  | { kind: 'tool_call'; requestId: string; callId: string; tool: ToolCall }
  | { kind: 'tool_result'; requestId: string; callId: string; content: string }

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`)
}
