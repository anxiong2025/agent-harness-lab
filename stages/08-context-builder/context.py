from dataclasses import dataclass


@dataclass
class ContextWindow:
    """The exact conversation view selected for one model request."""

    messages: list[dict[str, str]]
    omitted_message_count: int
    used_chars: int


class ContextBuilder:
    """Keep the system prompt and the newest consecutive messages within a character budget."""

    def __init__(self, max_chars: int) -> None:
        self.max_chars = max_chars

    def build(
        self, system_message: dict[str, str], conversation: list[dict[str, str]]
    ) -> ContextWindow:
        remaining_chars = self.max_chars - self._message_chars(system_message)
        selected_reversed = []

        for message in reversed(conversation):
            message_chars = self._message_chars(message)
            if selected_reversed and message_chars > remaining_chars:
                break
            selected_reversed.append(message)
            remaining_chars -= message_chars

        selected = list(reversed(selected_reversed))
        omitted_message_count = len(conversation) - len(selected)
        messages = [system_message]
        if omitted_message_count:
            while selected:
                omitted_message_count = len(conversation) - len(selected)
                omission_notice = self._omission_notice(omitted_message_count)
                projected_chars = sum(
                    self._message_chars(message)
                    for message in [system_message, omission_notice, *selected]
                )
                if projected_chars <= self.max_chars or len(selected) == 1:
                    break
                selected.pop(0)
            messages.append(self._omission_notice(omitted_message_count))
        messages.extend(selected)

        return ContextWindow(
            messages=messages,
            omitted_message_count=omitted_message_count,
            used_chars=sum(self._message_chars(message) for message in messages),
        )

    @staticmethod
    def _message_chars(message: dict[str, str]) -> int:
        return len(message["role"]) + len(message["content"])

    @staticmethod
    def _omission_notice(omitted_message_count: int) -> dict[str, str]:
        return {
            "role": "system",
            "content": f"由于上下文预算，已省略 {omitted_message_count} 条较早的对话消息。不要假设其中的内容。",
        }
