import json
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

DEFAULT_EVENT_LOG = Path(__file__).with_name("events.jsonl")
EVENT_LOG = Path(os.environ.get("HARNESS_LAB_EVENT_LOG", DEFAULT_EVENT_LOG))
# system 也是一条事件：因此重启后仍可从日志还原它。
SYSTEM_MESSAGE = {
    "kind": "message",
    "role": "system",
    "content": "你是一个简洁的助手，每次回答不超过三句话。",
}


def append_event(event: dict) -> None:
    # JSON Lines 每次只追加一条事实，不回头修改旧记录。
    EVENT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with EVENT_LOG.open("a", encoding="utf-8") as file:
        file.write(json.dumps(event, ensure_ascii=False) + "\n")


def read_events() -> list[dict]:
    if not EVENT_LOG.exists():
        return []
    with EVENT_LOG.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def derive_messages(events: list[dict]) -> list[dict[str, str]]:
    # 日志还包含请求快照；这里只重建会成为下一轮对话历史的内容，避免重复请求。
    messages = []
    for event in events:
        if event["kind"] == "message":
            messages.append({"role": event["role"], "content": event["content"]})
        if event["kind"] == "model_response":
            # 返回内容会成为下一轮模型调用中的 assistant 历史。
            messages.append({"role": "assistant", "content": event["content"]})
    return messages


def create_model_request(messages: list[dict[str, str]]) -> dict:
    # 在网络调用前冻结完整出站请求，request_id 用来关联随后收到的回答。
    return {
        "kind": "model_request",
        "request_id": uuid4().hex,
        "model": os.environ.get("LOOPBASE_MODEL", "deepseek-chat"),
        "messages": list(messages),
    }


def should_crash_after_request_logged() -> bool:
    # 教学开关：稳定复现“请求已记账、但尚未收到回答”的中断现场。
    return os.environ.get("HARNESS_LAB_CRASH_AFTER_REQUEST_LOGGED") == "1"


def call_model(request: dict) -> str:
    # 此处只把模型 API 所需的 model 和 messages 发给供应商；
    # kind 和 request_id 留在 Harness 的本地事件日志中。
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
    append_event(SYSTEM_MESSAGE)

print(f"已读取 {len(read_events())} 条事件。输入 /exit 退出。")

while True:
    message = input("你：").strip()
    if message == "/exit":
        break
    if not message:
        continue

    append_event({"kind": "message", "role": "user", "content": message})
    request = create_model_request(derive_messages(read_events()))
    # 先持久化请求快照，随后才可能发生网络调用。
    append_event(request)

    if should_crash_after_request_logged():
        print("模拟崩溃：完整模型请求已保存。", flush=True)
        os._exit(1)

    answer = call_model(request)
    # 返回时仍持有同一个 request，因此 Harness 能把回答写回该 request_id。
    append_event(
        {
            "kind": "model_response",
            "request_id": request["request_id"],
            "content": answer,
        }
    )
    print(f"模型：{answer}")
