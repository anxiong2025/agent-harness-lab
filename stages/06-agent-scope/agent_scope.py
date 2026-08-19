import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentScope:
    """Configuration and capabilities owned by one kind of agent."""

    agent_id: str
    system_prompt: str
    can_read_current_time: bool


AGENT_SCOPES = {
    "concise": AgentScope(
        agent_id="concise",
        system_prompt="你是一个简洁的助手，每次回答不超过三句话。",
        can_read_current_time=False,
    ),
    "time-aware": AgentScope(
        agent_id="time-aware",
        system_prompt="你是一个简洁的助手，每次回答不超过三句话。",
        can_read_current_time=True,
    ),
}


def load_agent_scope() -> AgentScope:
    agent_id = os.environ.get("HARNESS_LAB_AGENT", "concise")
    scope = AGENT_SCOPES.get(agent_id)
    if scope is None:
        available = ", ".join(AGENT_SCOPES)
        raise SystemExit(f"未知 Agent：{agent_id}。可选值：{available}")
    return scope
