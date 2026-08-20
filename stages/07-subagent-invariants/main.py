import json
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

DEFAULT_EVENT_LOG = Path(__file__).with_name("events.jsonl")
EVENT_LOG = Path(os.environ.get("HARNESS_LAB_EVENT_LOG", DEFAULT_EVENT_LOG))
PARENT_AGENT_ID = "parent"
RESEARCHER_AGENT_ID = "researcher"
PARENT_SYSTEM_PROMPT = "你是一个简洁的主助手，每次回答不超过三句话。"
RESEARCHER_SYSTEM_PROMPT = "你是研究子助手。只回答被委派的任务，给出简洁、可核查的结论。"


def append_event(event: dict) -> None:
    EVENT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with EVENT_LOG.open("a", encoding="utf-8") as file:
        file.write(json.dumps(event, ensure_ascii=False) + "\n")


def read_events() -> list[dict]:
    if not EVENT_LOG.exists():
        return []
    with EVENT_LOG.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def derive_parent_messages(events: list[dict]) -> list[dict[str, str]]:
    """Build parent context without exposing raw subagent conversations."""
    messages = []
    for event in events:
        if event["kind"] == "agent_scope":
            messages.append({"role": "system", "content": event["system_prompt"]})
        if event["kind"] == "message":
            messages.append({"role": "user", "content": event["content"]})
        if event["kind"] == "model_response" and event["agent_id"] == PARENT_AGENT_ID:
            messages.append({"role": "assistant", "content": event["content"]})
    return messages


def create_model_request(
    agent_id: str, messages: list[dict[str, str]], subagent_id: str | None = None
) -> dict:
    request = {
        "kind": "model_request",
        "request_id": uuid4().hex,
        "agent_id": agent_id,
        "model": os.environ.get("LOOPBASE_MODEL", "deepseek-chat"),
        "messages": list(messages),
    }
    if subagent_id is not None:
        request["subagent_id"] = subagent_id
    return request


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


def complete_model_request(request: dict) -> str:
    answer = call_model(request)
    response_event = {
        "kind": "model_response",
        "request_id": request["request_id"],
        "agent_id": request["agent_id"],
        "content": answer,
    }
    if "subagent_id" in request:
        response_event["subagent_id"] = request["subagent_id"]
    append_event(response_event)
    return answer


def run_research_subagent(task: str) -> tuple[str, str]:
    """Run an isolated researcher and return only its explicit handoff result."""
    subagent_id = uuid4().hex
    append_event(
        {
            "kind": "subagent_started",
            "subagent_id": subagent_id,
            "agent_id": RESEARCHER_AGENT_ID,
            "task": task,
        }
    )

    researcher_messages = [
        {"role": "system", "content": RESEARCHER_SYSTEM_PROMPT},
        {"role": "user", "content": task},
    ]
    researcher_request = create_model_request(
        RESEARCHER_AGENT_ID, researcher_messages, subagent_id
    )
    append_event(researcher_request)
    result = complete_model_request(researcher_request)
    append_event(
        {
            "kind": "subagent_completed",
            "subagent_id": subagent_id,
            "agent_id": RESEARCHER_AGENT_ID,
            "result": result,
        }
    )
    return subagent_id, result


def answer_as_parent(subagent_id: str | None = None, result: str | None = None) -> None:
    messages = derive_parent_messages(read_events())
    if subagent_id is not None and result is not None:
        # The parent receives only the declared handoff, not the researcher's raw history.
        messages.insert(
            1,
            {
                "role": "system",
                "content": f"研究子助手提交了以下结果，可据此回答用户：\n{result}",
            },
        )

    parent_request = create_model_request(PARENT_AGENT_ID, messages, subagent_id)
    append_event(parent_request)
    answer = complete_model_request(parent_request)
    print(f"模型：{answer}")


if not EVENT_LOG.exists():
    append_event(
        {
            "kind": "agent_scope",
            "agent_id": PARENT_AGENT_ID,
            "system_prompt": PARENT_SYSTEM_PROMPT,
        }
    )

print("输入问题直接由主助手回答；输入 /delegate <任务> 让研究子助手先处理。")

while True:
    message = input("你：").strip()
    if message == "/exit":
        break
    if not message:
        continue

    if message.startswith("/delegate "):
        task = message.removeprefix("/delegate ").strip()
        if not task:
            print("请在 /delegate 后写明任务。")
            continue

        append_event({"kind": "message", "role": "user", "content": task})
        subagent_id, result = run_research_subagent(task)
        answer_as_parent(subagent_id, result)
        continue

    append_event({"kind": "message", "role": "user", "content": message})
    answer_as_parent()
