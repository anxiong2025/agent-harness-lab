import json
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI

from clock import LocalClock


load_dotenv()

DEFAULT_EVENT_LOG = Path(__file__).with_name("events.jsonl")
EVENT_LOG = Path(os.environ.get("HARNESS_LAB_EVENT_LOG", DEFAULT_EVENT_LOG))
CLOCK = LocalClock()
SYSTEM_MESSAGE = {
    "kind": "message",
    "role": "system",
    "content": "你是一个简洁的助手，每次回答不超过三句话。",
}


def append_event(event: dict) -> None:
    EVENT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with EVENT_LOG.open("a", encoding="utf-8") as file:
        file.write(json.dumps(event, ensure_ascii=False) + "\n")


def read_events() -> list[dict]:
    if not EVENT_LOG.exists():
        return []
    with EVENT_LOG.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def derive_messages(events: list[dict]) -> list[dict[str, str]]:
    messages = []
    for event in events:
        if event["kind"] == "message":
            messages.append({"role": event["role"], "content": event["content"]})
        if event["kind"] == "model_response":
            messages.append({"role": "assistant", "content": event["content"]})
    return messages


def create_model_request(history: list[dict[str, str]]) -> dict:
    # 阅读第二站：Harness 在这里向能力提供者要真实时间，再组装本轮出站请求。
    current_time = CLOCK.current_time()
    time_context = {
        "role": "system",
        "content": f"当前运行 Harness 的电脑本地时间是 {current_time}。涉及当前日期或时间时，以此为准。",
    }
    system_message, *conversation = history

    return {
        "kind": "model_request",
        "request_id": uuid4().hex,
        "model": os.environ.get("LOOPBASE_MODEL", "deepseek-chat"),
        "messages": [system_message, time_context, *conversation],
    }


def call_model(request: dict) -> str:
    # 阅读第三站：这里只发送已经冻结好的 request，不再修改它。
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

# 阅读入口：先看这一段。它描述一次用户输入从进入 Harness 到得到模型回答的完整路径。
while True:
    message = input("你：").strip()
    if message == "/exit":
        break
    if not message:
        continue

    # ① 把用户输入先记入事件日志。
    append_event({"kind": "message", "role": "user", "content": message})

    # ② 从已有事件重建对话历史；model_request 快照不会被重复加入历史。
    request = create_model_request(derive_messages(read_events()))

    # ③ 在网络调用前保存完整请求：包括本轮注入的真实时间。
    append_event(request)

    # ④ 发送这份已保存的请求给模型并等待回答。
    answer = call_model(request)

    # ⑤ 使用同一个 request_id 记录回答，从而把请求和回答配对。
    append_event(
        {
            "kind": "model_response",
            "request_id": request["request_id"],
            "content": answer,
        }
    )

    # ⑥ 最后才把回答显示给用户。
    print(f"模型：{answer}")
