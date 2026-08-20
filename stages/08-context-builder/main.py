import json
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI

from context import ContextBuilder


load_dotenv()

DEFAULT_EVENT_LOG = Path(__file__).with_name("events.jsonl")
EVENT_LOG = Path(os.environ.get("HARNESS_LAB_EVENT_LOG", DEFAULT_EVENT_LOG))
SYSTEM_PROMPT = "你是一个简洁的助手，每次回答不超过三句话。"


def load_context_char_budget() -> int:
    raw_budget = os.environ.get("HARNESS_LAB_CONTEXT_CHAR_BUDGET", "1200")
    try:
        budget = int(raw_budget)
    except ValueError as error:
        raise SystemExit("HARNESS_LAB_CONTEXT_CHAR_BUDGET 必须是正整数。") from error
    if budget <= 0:
        raise SystemExit("HARNESS_LAB_CONTEXT_CHAR_BUDGET 必须是正整数。")
    return budget


CONTEXT_BUILDER = ContextBuilder(load_context_char_budget())


def append_event(event: dict) -> None:
    EVENT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with EVENT_LOG.open("a", encoding="utf-8") as file:
        file.write(json.dumps(event, ensure_ascii=False) + "\n")


def read_events() -> list[dict]:
    if not EVENT_LOG.exists():
        return []
    with EVENT_LOG.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def derive_history(events: list[dict]) -> list[dict[str, str]]:
    messages = []
    for event in events:
        if event["kind"] == "agent_scope":
            messages.append({"role": "system", "content": event["system_prompt"]})
        if event["kind"] == "message":
            messages.append({"role": "user", "content": event["content"]})
        if event["kind"] == "model_response":
            messages.append({"role": "assistant", "content": event["content"]})
    return messages


def create_model_request(history: list[dict[str, str]]) -> dict:
    system_message, *conversation = history
    context = CONTEXT_BUILDER.build(system_message, conversation)
    return {
        "kind": "model_request",
        "request_id": uuid4().hex,
        "model": os.environ.get("LOOPBASE_MODEL", "deepseek-chat"),
        "messages": context.messages,
        "context_window": {
            "max_chars": CONTEXT_BUILDER.max_chars,
            "used_chars": context.used_chars,
            "omitted_message_count": context.omitted_message_count,
        },
    }


def call_model(request: dict) -> str:
    client = OpenAI(
        api_key=os.environ["DEEPSEEK_API_KEY"],
        base_url=os.environ.get("LOOPBASE_BASE_URL", "https://api.deepseek.com"),
    )
    response = client.chat.completions.create(
        model=request["model"],
        messages=request["messages"],
    )
    return response.choices[0].message.content or ""


if not EVENT_LOG.exists():
    append_event(
        {
            "kind": "agent_scope",
            "agent_id": "context-demo",
            "system_prompt": SYSTEM_PROMPT,
        }
    )

print(
    f"上下文预算：{CONTEXT_BUILDER.max_chars} 字符。"
    "输入 /exit 退出。"
)

while True:
    message = input("你：").strip()
    if message == "/exit":
        break
    if not message:
        continue

    append_event({"kind": "message", "role": "user", "content": message})
    request = create_model_request(derive_history(read_events()))
    append_event(request)
    answer = call_model(request)
    append_event(
        {
            "kind": "model_response",
            "request_id": request["request_id"],
            "content": answer,
        }
    )
    print(
        "上下文："
        f"保留 {len(request['messages'])} 条，"
        f"省略 {request['context_window']['omitted_message_count']} 条。"
    )
    print(f"模型：{answer}")
