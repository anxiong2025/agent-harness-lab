import os

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()


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


messages = [
    {
        "role": "system",
        "content": "你是一个简洁的助手，每次回答不超过三句话。",
    }
]

while True:
    message = input("你：").strip()
    if message == "/exit":
        break
    if not message:
        continue

    messages.append({"role": "user", "content": message})
    answer = call_model(messages)
    messages.append({"role": "assistant", "content": answer})
    print(f"模型：{answer}")
