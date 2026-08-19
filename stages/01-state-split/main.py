import json
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

DEFAULT_STATE_FILE = Path(__file__).with_name("messages.json")
STATE_FILE = Path(os.environ.get("HARNESS_LAB_STATE_FILE", DEFAULT_STATE_FILE))
SYSTEM_MESSAGE = {
    "role": "system",
    "content": "你是一个简洁的助手，每次回答不超过三句话。",
}


def load_messages() -> list[dict[str, str]]:
    if not STATE_FILE.exists():
        return [SYSTEM_MESSAGE]
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def save_messages(messages: list[dict[str, str]]) -> None:
    STATE_FILE.write_text(
        json.dumps(messages, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def should_crash_after_response() -> bool:
    return os.environ.get("HARNESS_LAB_CRASH_AFTER_RESPONSE") == "1"


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


messages = load_messages()
print(f"已恢复 {len(messages) - 1} 条对话消息。输入 /exit 退出。")

while True:
    message = input("你：").strip()
    if message == "/exit":
        break
    if not message:
        continue

    messages.append({"role": "user", "content": message})
    save_messages(messages)

    answer = call_model(messages)
    print(f"模型：{answer}", flush=True)
    if should_crash_after_response():
        print("模拟崩溃：回答尚未保存到快照。", flush=True)
        os._exit(1)

    messages.append({"role": "assistant", "content": answer})
    save_messages(messages)
