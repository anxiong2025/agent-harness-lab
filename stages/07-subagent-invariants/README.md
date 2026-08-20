# 07：子 Agent 的边界与不变量

## 它解决什么问题

没有明确边界的“子 Agent”通常只是主 Agent 把完整聊天历史复制一份，再多调用一次模型。这会带来三个问题：无关或敏感上下文被带入子任务；主 Agent 无法追踪某个子任务的开始、请求和完成；子 Agent 的内部过程与最终交付混在一起，难以审计或恢复。

本阶段把一次委派记录为一组关联事件：`subagent_started`、研究子 Agent 的 `model_request` / `model_response`、`subagent_completed`，以及主 Agent 的后续请求和回答。它们通过 `subagent_id` 关联。

## 三条不变量

1. 研究子 Agent 只收到委派任务，不继承主 Agent 的完整聊天历史。
2. 主 Agent 只接收 `subagent_completed.result` 这份正式交付，不读取子 Agent 的内部上下文。
3. 每次模型请求、模型返回和子任务交付都写入事件日志，且可通过 `request_id` 与 `subagent_id` 追踪。

这让子 Agent 成为可控的工作单元：可以限制它的上下文和能力，定位一次委派花费了什么，也能在以后为它增加超时、预算、审批和恢复策略。

## 它暂时没有解决什么

这个最小 Demo 还没有并发调度、预算限制、权限审批、子 Agent 崩溃恢复，或对交付内容的安全验证。这些都建立在上述三条不变量之上。

## 运行

```bash
uv run stages/07-subagent-invariants/main.py
```

输入下面的命令触发委派：

```text
/delegate 用两句话解释事件溯源的价值
```
