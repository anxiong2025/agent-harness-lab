# DSH Context 策略规划

这份文档描述 DeepSeek Harness（DSH）在 Context、预算、压缩、恢复和缓存方面的架构策略，并说明学习项目如何逐步对齐。这里区分 DSH 的架构原则和本项目当前已经实现的功能，不把学习版实现误认为 DSH 的完整实现。

## 一、DSH 的基本原则

### 1. 模型请求前决定模型可见内容

DSH 不把“历史消息数组”当作唯一上下文。每次模型请求前，由 Agent 生命周期中的 pre-step 阶段重新决定本轮模型可以看到什么：

```text
session event log
    ↓
context projection
    ↓
agent/pre-step
    ↓
budget and compaction policy
    ↓
ModelRequest
```

这意味着 Context 是一次请求的投影结果，而不是永久不变的内存列表。

### 2. 模型可见内容必须可重建

任何发送给模型的内容都应该有对应的事件、状态或可重建来源。这样可以支持：

```text
进程重启后的恢复
失败请求的诊断
会话重放
上下文投影变更
审计和问题定位
```

### 3. 每一部分能力都通过插件接入

DSH 将相关能力拆成可替换的插件或服务：

```text
session       会话事件和持久化
context       请求上下文构建
compaction    上下文压缩
llm           Provider 和流式模型协议
tools         工具注册和执行
agent-loop    默认 Agent 驱动
recovery      请求恢复和失败处理
guard         超时、循环和安全保护
```

Agent Loop 负责生命周期，不应该直接持有某个模型 Provider 或具体压缩实现。

## 二、DSH 的请求生命周期

```text
用户事件进入 Session
    ↓
agent/pre-step
    ↓
读取 Session Event Log
    ↓
生成 Context Blocks
    ↓
应用 Scope、权限和工具定义
    ↓
计算 Token Budget
    ↓
选择 Send / Compact / Reject
    ↓
生成 ModelRequest
    ↓
llm/stream
    ↓
记录 assistant message 或 tool call
    ↓
工具执行和 tool result
    ↓
回到下一次 pre-step
```

关键点是：工具执行完成后，不是直接把结果拼接到内存数组里继续发送，而是先记录事件，再重新进入下一次上下文决策。

## 三、DSH 的 Context 策略

### 1. Context Block 化

上下文应该按来源和生命周期拆分，而不是全部拼成一段字符串：

```text
system prompt
agent scope
permission context
task state
context summary
recent history
tool results
runtime state
```

每个 Block 可以有不同属性：

```text
是否稳定
是否可压缩
是否必须保留
是否可以重新获取
是否可以缓存
```

### 2. 稳定内容和动态内容分离

稳定内容通常放在前面：

```text
system prompt
工具定义
固定规则
Agent 身份
```

动态内容放在后面：

```text
当前时间
最近消息
工具结果
临时任务状态
```

这样有利于 Provider 复用稳定前缀，也便于只重建变化部分。

## 四、DSH 的预算和压缩策略

### 1. 预算不是固定数字

DSH 不应该假设所有模型使用同一组上下文预算。预算需要根据以下因素解析：

```text
模型上下文窗口
预留输出空间
Agent 配置
工具调用预期
Provider 限制
任务类型
```

基本计算关系是：

```text
可用输入预算
  = 上下文窗口
  - 预留输出
  - 安全余量
```

### 2. 每次请求前主动检查

请求前执行：

```text
测量当前 Context
    ↓
判断是否接近压力阈值
    ↓
必要时执行低成本裁剪
    ↓
重新测量
    ↓
仍然超限才调用压缩 Provider
```

### 3. Provider 超限是被动兜底

本地估算可能与 Provider 的真实 Token 计量不同，因此还需要：

```text
Provider 返回 context overflow
    ↓
记录错误事件
    ↓
扩大压缩范围或降低工具结果大小
    ↓
重新构建 ModelRequest
    ↓
限制次数后重试
```

主动预算和被动重试是两道不同的保护机制。

## 五、DSH 的压缩策略

### 1. 压缩目标

压缩的目标不是删除尽可能多的历史，而是生成一份足够继续任务的 Context：

```text
当前用户目标
关键约束
已完成工作
未完成工作
任务状态
重要工具结果
下一步动作
```

### 2. 工具调用边界

工具调用必须保持关系完整：

```text
assistant tool call
    ↕
tool result
```

压缩范围不能切断这对消息。未完成工具调用还需要保留为恢复状态，不能被当作普通历史清除。

### 3. 摘要是检查点，不是普通聊天文本

摘要应该是结构化任务状态，并且具有：

```text
覆盖范围
生成时间或版本
关联 Session
关联 Agent Scope
```

摘要可以作为新的事件追加到 Session，但原始事件仍然保留用于重放和审计。

### 4. 防止摘要级联失真

再次压缩时，应将已有摘要作为上一次检查点合并、去重，而不是把摘要当作普通聊天文本反复转述。

需要保留：

```text
摘要版本
覆盖的事件或消息范围
当前任务状态
```

## 六、DSH 的缓存策略

### 1. 缓存和压缩负责不同目标

```text
压缩：减少模型本轮需要处理的内容
缓存：复用稳定内容，减少重复处理
```

### 2. 适合缓存的内容

```text
稳定 system prompt
工具 Schema
Agent 规则
项目索引
历史摘要
短 TTL 的只读工具结果
```

### 3. Cache Key 需要包含版本和权限

一个可行的 Key 需要考虑：

```text
model
agentId
promptVersion
toolSchemaVersion
permissionVersion
contextSummaryVersion
externalDataVersion
```

不能只用用户问题作为 Key，否则会把不同 Agent、不同权限或不同工具版本的结果混在一起。

### 4. 缓存失效

以下情况应该失效或重新计算：

```text
模型变更
system prompt 变更
工具 Schema 变更
Agent 权限变更
摘要版本变更
外部数据超过 TTL
```

压缩会改变上下文中间的 Token 序列，可能使前缀缓存从变化位置之后失效。因此压缩阈值需要同时考虑：

```text
上下文超限风险
摘要调用成本
缓存命中率
任务质量
```

## 七、DSH 和本项目的对齐表

| DSH 原则 | 本项目当前对应 | 还需要补充 |
| --- | --- | --- |
| pre-step 决策模型可见上下文 | `DefaultAgentLoop` 请求前组装 | 事件化扩展点 |
| Session Event Log | `SessionLog` JSONL | 更完整的事件投影 |
| Context Blocks | `ContextBlockBuilder` | 更多 Block 类型和优先级 |
| Token Budget | `TokenMeter`、`BudgetPolicy` | Provider 真实计量 |
| Compaction Provider | `BasicCompactionProvider` | 结构化摘要 Provider |
| 摘要持久化 | `context_summary` 事件 | 覆盖范围和版本管理 |
| Provider 兜底 | 尚未完成 | overflow 捕获和重试 |
| Prefix Cache | 尚未完成 | Cache Key、TTL、失效和指标 |
| 插件化扩展 | 当前有接口和简化 Runtime | Cordis 服务和事件机制 |

## 八、学习项目的实现顺序

```text
1. Context Block 和 Token Budget
2. 结构化摘要
3. 摘要事件持久化
4. 下一轮摘要恢复
5. 工具结果裁剪
6. tool_call/tool_result 成对边界
7. Provider overflow 重试
8. 基础 Cache Key 和 TTL
9. 缓存失效与权限版本
10. Context 指标和完整测试
```

每完成一个阶段，都需要验证：

```text
模型看到的消息可以从日志重建
压缩后任务仍能继续
工具消息序列合法
失败后不会无限重试
缓存不会跨权限或版本错误复用
```

## 九、和面试表达的关系

面试时可以先讲主线：

> DSH 在每次模型请求前从 Session Event Log 重建 Context，通过 pre-step 做预算裁决，必要时执行压缩，并把摘要作为事件持久化。压缩需要保留当前任务状态和完整工具调用关系；缓存则用于复用稳定前缀，二者需要在上下文大小、成本、延迟和任务完成率之间权衡。

如果面试官继续追问，再展开：

```text
为什么压缩会影响 Prefix Cache
Cache Key 如何包含 Prompt、工具和权限版本
Provider overflow 如何兜底
摘要如何避免级联失真
如何从原始事件恢复模型可见上下文
```
