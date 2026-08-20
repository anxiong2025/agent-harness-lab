# Agent Harness Lab

This repository is now organized as a production-oriented workspace. The earlier staged implementations remain in Git history; the working tree contains the unified architecture.

```text
packages/
  core/       durable event and model/tool contracts
  session/    append-only session log and reconstruction
  llm/        model provider seam and DeepSeek provider
  context/    request-context assembly
  compaction/ token budget and surface replacement
  llm/        model provider seam
  tools/      scoped registry and execution pipeline
  agent/      agent loop and recovery
apps/
  cli/        runnable host composition
```

Every package owns one capability seam. The application host composes providers; the agent loop consumes interfaces and does not own provider implementations.
