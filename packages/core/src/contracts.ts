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

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ModelChatMessage =
  | ModelMessage
  | { role: 'assistant'; content: string | null; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

export type ModelRequest = {
  requestId: string
  model: string
  messages: ModelChatMessage[]
  tools: ToolSchema[]
}

export type ModelResponse = {
  requestId: string
  content: string | null
  toolCalls: ToolCall[]
}

export type SessionEvent =
  | { kind: 'message'; role: 'system' | 'user' | 'assistant'; content: string }
  | { kind: 'model_request'; request: ModelRequest }
  | { kind: 'model_response'; response: ModelResponse }
  | { kind: 'tool_call'; requestId: string; callId: string; tool: ToolCall }
  | { kind: 'tool_result'; requestId: string; callId: string; content: string }
  | { kind: 'agent_scope'; agentId: string; systemPrompt: string }
  | { kind: 'subagent_started'; subagentId: string; agentId: string; task: string }
  | { kind: 'subagent_completed'; subagentId: string; agentId: string; result: string }

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`)
}
