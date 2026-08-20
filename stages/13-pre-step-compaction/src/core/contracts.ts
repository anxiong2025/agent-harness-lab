export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export type ToolCall = {
  id: string
  function: { name: string; arguments: string }
}

export type ToolSchema = {
  name: string
  description: string
  parameters: JsonObject
}

export type SessionEvent =
  | { kind: 'message'; role: 'system' | 'user' | 'assistant'; content: string }
  | { kind: 'model_request'; request_id: string; messages: JsonValue[]; tools: ToolSchema[] }
  | { kind: 'model_response'; request_id: string; content: string | null; tool_calls: ToolCall[] }
  | { kind: 'tool_call'; request_id: string; call_id: string; name: string; arguments: JsonObject }
  | { kind: 'tool_result'; request_id: string; call_id: string; content: string }
