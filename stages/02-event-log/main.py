import json
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

DEFAULT_EVENT_LOG = Path(__file__).with_name("events.jsonl")
EVENT_LOG = Path(os.environ.get("HARNESS_LAB_EVENT_LOG", DEFAULT_EVENT_LOG))
SYSTEM_MESSAGE = {
    "kind": "message",
    "role": "system",
    "content": "你是一个简洁的助手，每次回答不超过三句话。",
}


def append_event(event: dict[str, str]) -> None:
    EVENT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with EVENT_LOG.open("a", encoding="utf-8") as file:
        file.write(json.dumps(event, ensure_ascii=False) + "\n")


def read_events() -> list[dict[str, str]]:
    if not EVENT_LOG.exists():
        return []
    with EVENT_LOG.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def derive_messages(events: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        {"role": event["role"], "content": event["content"]}
        for event in events
        if event["kind"] == "message"
    ]


def call_model(messages: list[dict[str, str]]) -> str:
    client = OpenAI(
        api_key=os.environ["DEEPSEEK_API_KEY"],
        base_url=os.environ.get("LOOPBASE_BASE_URL", "https://api.deepseek.com"),
    )
    response = client.chat.completions.create(
        model=os.environ.get("LOOPBASE_MODEL", "deepseek-chat"),
        messages=messages,
    )
    return response.choices[0].message.content or ""


if not EVENT_LOG.exists():
    append_event(SYSTEM_MESSAGE)

print(f"已读取 {len(read_events())} 条事件。输入 /exit 退出。")

while True:
    message = input("你：").strip()
    if message == "/exit":
        break
    if not message:
        continue

    append_event({"kind": "message", "role": "user", "content": message})
    answer = call_model(derive_messages(read_events()))
    append_event({"kind": "message", "role": "assistant", "content": answer})
    print(f"模型：{answer}")
