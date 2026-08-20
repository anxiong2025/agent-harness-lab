import json
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI

from blocks import ContextBlockBuilder, flatten_blocks
from clock import LocalClock


load_dotenv()

DEFAULT_EVENT_LOG = Path(__file__).with_name("events.jsonl")
EVENT_LOG = Path(os.environ.get("HARNESS_LAB_EVENT_LOG", DEFAULT_EVENT_LOG))
SYSTEM_PROMPT = "你是一个简洁的助手，每次回答不超过三句话。"


def load_positive_int(name: str, default: int) -> int:
    raw_value = os.environ.get(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as error:
        raise SystemExit(f"{name} 必须是正整数。") from error
    if value <= 0:
        raise SystemExit(f"{name} 必须是正整数。")
    return value


BLOCK_BUILDER = ContextBlockBuilder(
    load_positive_int("HARNESS_LAB_RECENT_HISTORY_LIMIT", 4)
)
CLOCK = LocalClock()


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


def latest_summary(events: list[dict]) -> str | None:
    summaries = [event for event in events if event["kind"] == "context_summary"]
    if not summaries:
        return None
    return summaries[-1]["content"]


def create_model_request(history: list[dict[str, str]], summary: str | None) -> dict:
    system_message, *conversation = history
    blocks = BLOCK_BUILDER.build(
        system_message,
        summary,
        CLOCK.current_time(),
        conversation,
    )
    return {
        "kind": "model_request",
        "request_id": uuid4().hex,
        "model": os.environ.get("LOOPBASE_MODEL", "deepseek-chat"),
        "messages": flatten_blocks(blocks),
        "context_blocks": [block.descriptor() for block in blocks],
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
            "agent_id": "context-blocks-demo",
            "system_prompt": SYSTEM_PROMPT,
        }
    )
    configured_summary = os.environ.get("HARNESS_LAB_CONTEXT_SUMMARY")
    if configured_summary:
        append_event({"kind": "context_summary", "content": configured_summary})

print(
    f"近期历史上限：{BLOCK_BUILDER.recent_history_limit} 条。"
    "输入 /exit 退出。"
)

while True:
    message = input("你：").strip()
    if message == "/exit":
        break
    if not message:
        continue

    append_event({"kind": "message", "role": "user", "content": message})
    events = read_events()
    request = create_model_request(derive_history(events), latest_summary(events))
    append_event(request)
    answer = call_model(request)
    append_event(
        {
            "kind": "model_response",
            "request_id": request["request_id"],
            "content": answer,
        }
    )
    block_names = ", ".join(block["name"] for block in request["context_blocks"])
    print(f"Context Blocks：{block_names}")
    print(f"模型：{answer}")
