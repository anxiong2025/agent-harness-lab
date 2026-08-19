from datetime import datetime


class LocalClock:
    """Provide the current time from the machine running the Harness."""

    def current_time(self) -> str:
        return datetime.now().astimezone().isoformat(timespec="seconds")
