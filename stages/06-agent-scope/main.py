import json
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI

from agent_scope import load_agent_scope
from clock import LocalClock
from recovery import find_pending_requests


load_dotenv()

AGENT = load_agent_scope()
DEFAULT_EVENT_LOG = Path(__file__).with_name(f"{AGENT.agent_id}.events.jsonl")
EVENT_LOG = Path(os.environ.get("HARNESS_LAB_EVENT_LOG", DEFAULT_EVENT_LOG))
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


def initialize_session() -> None:
    events = read_events()
    if not events:
        append_event(
            {
                "kind": "agent_scope",
                "agent_id": AGENT.agent_id,
                "system_prompt": AGENT.system_prompt,
                "can_read_current_time": AGENT.can_read_current_time,
            }
        )
        return

    session_scope = next(
        (event for event in events if event["kind"] == "agent_scope"), None
    )
    if session_scope is None:
        raise SystemExit("事件日志没有 Agent 作用域，不能安全地在此阶段继续使用。")
    if session_scope["agent_id"] != AGENT.agent_id:
        raise SystemExit(
            f"这份会话属于 Agent：{session_scope['agent_id']}，"
            f"不能用 {AGENT.agent_id} 打开。请使用另一份事件日志。"
        )


def derive_messages(events: list[dict]) -> list[dict[str, str]]:
    messages = []
    for event in events:
        if event["kind"] == "agent_scope":
            messages.append({"role": "system", "content": event["system_prompt"]})
        if event["kind"] == "message":
            messages.append({"role": event["role"], "content": event["content"]})
        if event["kind"] == "model_response":
            messages.append({"role": "assistant", "content": event["content"]})
    return messages


def create_model_request(history: list[dict[str, str]]) -> dict:
    messages = list(history)
    if AGENT.can_read_current_time:
        current_time = CLOCK.current_time()
        messages.insert(
            1,
            {
                "role": "system",
                "content": f"当前运行 Harness 的电脑本地时间是 {current_time}。涉及当前日期或时间时，以此为准。",
            },
        )

    return {
        "kind": "model_request",
        "request_id": uuid4().hex,
        "agent_id": AGENT.agent_id,
        "model": os.environ.get("LOOPBASE_MODEL", "deepseek-chat"),
        "messages": messages,
    }


def should_crash_after_request_logged() -> bool:
    return os.environ.get("HARNESS_LAB_CRASH_AFTER_REQUEST_LOGGED") == "1"


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


def complete_request(request: dict) -> None:
    answer = call_model(request)
    append_event(
        {
            "kind": "model_response",
            "request_id": request["request_id"],
            "content": answer,
        }
    )
    print(f"模型：{answer}")


def print_pending_requests() -> None:
    pending_requests = find_pending_requests(read_events())
    if not pending_requests:
        return

    print("检测到未完成的模型请求；为避免重复调用，不会自动重试：")
    for request in pending_requests:
        print(f"  /retry {request['request_id']}")


initialize_session()
print(f"Agent：{AGENT.agent_id}。已读取 {len(read_events())} 条事件。输入 /exit 退出。")
print_pending_requests()

while True:
    message = input("你：").strip()
    if message == "/exit":
        break

    if message.startswith("/retry "):
        request_id = message.removeprefix("/retry ").strip()
        pending_requests = {
            request["request_id"]: request
            for request in find_pending_requests(read_events())
        }
        request = pending_requests.get(request_id)
        if request is None:
            print("没有找到未完成的请求。")
            continue

        append_event({"kind": "recovery_retry_started", "request_id": request_id})
        complete_request(request)
        continue

    if not message:
        continue

    if find_pending_requests(read_events()):
        print("请先用 /retry <request_id> 处理未完成请求，或输入 /exit 退出。")
        continue

    append_event({"kind": "message", "role": "user", "content": message})
    request = create_model_request(derive_messages(read_events()))
    append_event(request)

    if should_crash_after_request_logged():
        print("模拟崩溃：完整模型请求已保存。", flush=True)
        os._exit(1)

    complete_request(request)
