from dataclasses import dataclass


@dataclass
class ContextBlock:
    """One named, ordered contribution to a model request."""

    name: str
    source: str
    cache_stable: bool
    messages: list[dict[str, str]]

    def descriptor(self) -> dict[str, str | bool | int]:
        return {
            "name": self.name,
            "source": self.source,
            "cache_stable": self.cache_stable,
            "message_count": len(self.messages),
        }


class ContextBlockBuilder:
    """Assemble stable context first, then dynamic facts and recent dialogue."""

    def __init__(self, recent_history_limit: int) -> None:
        self.recent_history_limit = recent_history_limit

    def build(
        self,
        system_message: dict[str, str],
        summary: str | None,
        current_time: str,
        conversation: list[dict[str, str]],
    ) -> list[ContextBlock]:
        blocks = [
            ContextBlock(
                name="system",
                source="agent_scope",
                cache_stable=True,
                messages=[system_message],
            )
        ]
        if summary is not None:
            blocks.append(
                ContextBlock(
                    name="summary",
                    source="context_summary",
                    cache_stable=True,
                    messages=[
                        {
                            "role": "system",
                            "content": f"以下是较早对话的摘要：\n{summary}",
                        }
                    ],
                )
            )
        blocks.extend(
            [
                ContextBlock(
                    name="runtime_time",
                    source="local_clock",
                    cache_stable=False,
                    messages=[
                        {
                            "role": "system",
                            "content": f"当前运行 Harness 的电脑本地时间是 {current_time}。涉及当前日期或时间时，以此为准。",
                        }
                    ],
                ),
                ContextBlock(
                    name="recent_history",
                    source="event_log",
                    cache_stable=False,
                    messages=conversation[-self.recent_history_limit :],
                ),
            ]
        )
        return blocks


def flatten_blocks(blocks: list[ContextBlock]) -> list[dict[str, str]]:
    return [message for block in blocks for message in block.messages]
