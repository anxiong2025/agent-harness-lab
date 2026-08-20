from dataclasses import dataclass


@dataclass
class ContextSummary:
    """A compact replacement for a contiguous prefix of conversation messages."""

    content: str
    covers_message_count: int


@dataclass
class ContextSelection:
    """The selected model context and the prefix that still needs compaction."""

    messages: list[dict[str, str]]
    selected_tail_count: int
    compact_through_message_count: int | None


class ContextBuilder:
    """Select a summary plus the newest consecutive messages within a character budget."""

    def __init__(self, max_chars: int) -> None:
        self.max_chars = max_chars

    def build(
        self,
        system_message: dict[str, str],
        conversation: list[dict[str, str]],
        summary: ContextSummary | None,
    ) -> ContextSelection:
        messages = [system_message]
        covered_count = 0
        if summary is not None:
            messages.append(
                {
                    "role": "system",
                    "content": f"以下是较早对话的摘要：\n{summary.content}",
                }
            )
            covered_count = summary.covers_message_count

        remaining_chars = self.max_chars - sum(
            self._message_chars(message) for message in messages
        )
        unsummarized = conversation[covered_count:]
        selected_reversed = []

        for message in reversed(unsummarized):
            message_chars = self._message_chars(message)
            if selected_reversed and message_chars > remaining_chars:
                break
            selected_reversed.append(message)
            remaining_chars -= message_chars

        selected_tail = list(reversed(selected_reversed))
        compacted_now = len(unsummarized) - len(selected_tail)
        compact_through_message_count = None
        if compacted_now:
            compact_through_message_count = covered_count + compacted_now

        return ContextSelection(
            messages=[*messages, *selected_tail],
            selected_tail_count=len(selected_tail),
            compact_through_message_count=compact_through_message_count,
        )

    @staticmethod
    def _message_chars(message: dict[str, str]) -> int:
        return len(message["role"]) + len(message["content"])
