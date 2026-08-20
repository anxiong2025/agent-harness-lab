import json
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI

from context import ContextBuilder, ContextSummary


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


CONTEXT_BUILDER = ContextBuilder(
    load_positive_int("HARNESS_LAB_CONTEXT_CHAR_BUDGET", 1200)
)
SUMMARY_CHAR_LIMIT = load_positive_int("HARNESS_LAB_SUMMARY_CHAR_LIMIT", 240)


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


def latest_summary(events: list[dict]) -> ContextSummary | None:
    summaries = [event for event in events if event["kind"] == "context_summary"]
    if not summaries:
        return None
    summary = summaries[-1]
    return ContextSummary(
        content=summary["content"],
        covers_message_count=summary["covers_message_count"],
    )


def create_compaction_request(
    previous_summary: ContextSummary | None,
    messages_to_compact: list[dict[str, str]],
    covers_message_count: int,
) -> dict:
    previous_summary_text = "（没有已有摘要）"
    if previous_summary is not None:
        previous_summary_text = previous_summary.content

    transcript = "\n".join(
        f"{message['role']}: {message['content']}" for message in messages_to_compact
    )
    return {
        "kind": "context_compaction_request",
        "request_id": uuid4().hex,
        "model": os.environ.get("LOOPBASE_MODEL", "deepseek-chat"),
        "covers_message_count": covers_message_count,
        "messages": [
            {
                "role": "system",
                "content": f"把给定对话压缩成不超过 {SUMMARY_CHAR_LIMIT} 个字符的事实摘要。保留用户目标、已确认事实、约束和未完成事项；不要添加新事实。",
            },
            {
                "role": "user",
                "content": f"已有摘要：\n{previous_summary_text}\n\n新增待压缩对话：\n{transcript}",
            },
        ],
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


def compact_history(
    previous_summary: ContextSummary | None,
    conversation: list[dict[str, str]],
    covers_message_count: int,
) -> ContextSummary:
    previous_covered_count = 0
    if previous_summary is not None:
        previous_covered_count = previous_summary.covers_message_count

    request = create_compaction_request(
        previous_summary,
        conversation[previous_covered_count:covers_message_count],
        covers_message_count,
    )
    append_event(request)
    summary_text = call_model(request)[:SUMMARY_CHAR_LIMIT]
    append_event(
        {
            "kind": "context_summary",
            "request_id": request["request_id"],
            "content": summary_text,
            "covers_message_count": covers_message_count,
        }
    )
    return ContextSummary(summary_text, covers_message_count)


def create_model_request(messages: list[dict[str, str]], summary: ContextSummary | None) -> dict:
    summary_event = None
    if summary is not None:
        summary_event = {
            "covers_message_count": summary.covers_message_count,
            "content": summary.content,
        }
    return {
        "kind": "model_request",
        "request_id": uuid4().hex,
        "model": os.environ.get("LOOPBASE_MODEL", "deepseek-chat"),
        "messages": messages,
        "context_summary": summary_event,
    }


if not EVENT_LOG.exists():
    append_event(
        {
            "kind": "agent_scope",
            "agent_id": "context-summary-demo",
            "system_prompt": SYSTEM_PROMPT,
        }
    )

print(
    f"上下文预算：{CONTEXT_BUILDER.max_chars} 字符；"
    f"摘要上限：{SUMMARY_CHAR_LIMIT} 字符。输入 /exit 退出。"
)

while True:
    message = input("你：").strip()
    if message == "/exit":
        break
    if not message:
        continue

    append_event({"kind": "message", "role": "user", "content": message})
    history = derive_history(read_events())
    system_message, *conversation = history
    summary = latest_summary(read_events())
    selection = CONTEXT_BUILDER.build(system_message, conversation, summary)

    if selection.compact_through_message_count is not None:
        summary = compact_history(
            summary, conversation, selection.compact_through_message_count
        )
        selection = CONTEXT_BUILDER.build(system_message, conversation, summary)

    request = create_model_request(selection.messages, summary)
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
        f"摘要覆盖 {summary.covers_message_count if summary else 0} 条，"
        f"保留尾部 {selection.selected_tail_count} 条。"
    )
    print(f"模型：{answer}")
