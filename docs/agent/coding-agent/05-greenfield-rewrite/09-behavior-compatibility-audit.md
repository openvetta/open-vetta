# 行为兼容性审计

## 1. 审计原则

本次工作是架构重写，不是产品功能重写。默认迁移合同为：

> 允许改变包、类、依赖方向、生命周期和组合方式；不允许静默改变用户、模型、宿主或持久化数据能够观察到的行为。

行为不仅指最终文本，还包括：

- Tool 名称、模型可见描述和 JSON Schema。
- 成功 content、details、错误消息和重试提示。
- 文件、进程、网络与存储副作用。
- 路径、编码、图片、截断、取消和平台语义。
- Profile、scope、权限和默认启用条件。
- Session 事件顺序、输入排队、恢复和分支。
- 旧持久化数据的读取结果。

更严格的参数校验、更小的可访问路径、更少的文件格式或不同的取消行为都属于功能变化。

## 2. 本轮发现与处理

### 2.1 `current_time`

首次新实现存在三个差异：

| 行为 | 旧实现 | 首次新实现 | 处理 |
| --- | --- | --- | --- |
| 模型描述 | 完整使用指引 | 简短一句话 | 已恢复旧描述 |
| JSON Schema | 未声明 `additionalProperties: false` | 拒绝额外字段 | 已恢复旧 Schema |
| 已取消 Signal 下直接调用 | 仍返回时间 | 在时间源调用前抛出 | 已恢复旧直接执行语义 |

现已增加旧新差分合同，直接比较名称、label、完整描述、Schema、固定时间执行结果、
已取消直接调用、update、phase、`scope_use` 和 `category`。全部旧会话场景还会分别运行
旧 `resolveActiveToolNames` 与新注册选择器，比较最终激活工具集合。

注册元数据没有加入通用 `RuntimeToolDefinition`。新 `CodingToolRegistration` 在 Coding
能力层持有 `scopeUse` 和 `category`，组合根把会话场景传给 `CodingToolsFeature`。这避免
Kernel 绑定 Coding 场景词汇，也避免把 Agent Profile ID 错当作会话场景。

因此 `current_time` 可以认定为工具定义、执行和注册行为兼容；但完整 Coding Tools Feature
仍缺少其他旧工具，不能整体切换生产入口。

### 2.2 `read`

尝试实现的工作区纯文本 read 与旧工具存在以下功能差异：

- 旧工具允许基于 cwd 的相对路径、绝对路径和 `~`；尝试实现限制为 Workspace Root。
- 旧工具包含 macOS 空格、NFD、弯引号及 CJK 文件名空格模糊匹配；尝试实现没有。
- 旧工具支持 UTF-8 失败后按 GB18030 解码；尝试实现只按 UTF-8 解码。
- 旧工具按文件内容魔数识别 jpg/png/gif/webp，并返回 Image Content；尝试实现拒绝所有二进制。
- 旧工具支持图片自动缩放及关闭自动缩放；尝试实现没有。
- 旧工具对已知二进制扩展返回对应 Skill 提示；尝试实现直接抛错。
- 旧工具为每一文本行生成 edit 可使用的锚点；尝试实现返回原始文本。
- 旧工具使用既有 `TruncationResult` details 和既定提示文案；尝试实现改变了 details 结构和提示。
- 旧 Schema 对 offset/limit 使用 Number 且没有新增边界约束；尝试实现改成正整数约束。
- 旧工具的完整模型描述包含 read/edit/grep/PDF/文档协作规则；尝试实现只保留一句说明。

结论：该实现属于缩减功能，已撤下，`read` 仍标记为未迁移。后续实现必须让
`packages/coding-agent/test/tools.test.ts` 中的 read 行为用例以及路径模糊、图片处理、
锚点相关测试同时运行在旧新实现上。

## 3. 已实施模块审计

| 模块 | 当前状态 | 与旧行为的差距 | 切换结论 |
| --- | --- | --- | --- |
| `current_time` Tool | 定义、执行和注册行为已差分验证 | 无已知 Tool 级差距 | Tool 级迁移完成；Feature 仍不可整体切换 |
| Coding Tools Feature | 仅贡献 `current_time` | read/edit/write/search/process 等未迁移 | 未完成 |
| `AgentSession` | 新状态机可执行 | 活动 Turn 输入目前拒绝；旧系统具有 queue、follow-up、steering 语义 | 不可切换 |
| Turn Pipeline | 固定阶段和持久化检查点已实现 | 输入队列、完整观察事件和恢复闭环未完成 | 不可切换 |
| `AgentCoreTurnEngine` | 模型和 Tool Loop 闭环通过 | Kernel 只映射完成消息；旧 UI 需要流式 text/thinking/tool progress 事件 | 不可切换宿主 |
| Runtime Snapshot | 编译、冻结、lease 和原子交换已实现 | Coding Profile 的完整默认能力与 scope 尚未编译 | 不可替代旧工具注册 |
| Conversation Repository | 新格式 create/load/append/save 已实现 | 旧 JSONL importer、Snapshot 读取、分支、未完成 Turn 恢复和跨进程锁未完成 | 不可读取并替代旧会话 |
| Context Strategy | 目前只有 passthrough 基础实现 | 旧 compaction、prefire、microcompact 和摘要行为未迁移 | 不可切换长会话 |
| MCP / Skill / Knowledge / Subagent | 尚未迁移 | 旧能力全部缺失 | 不可切换对应 Profile |
| Desktop / CLI / RPC / IM Adapter | 尚未切换 | 事件、交互和协议兼容尚未差分验证 | 不可切换入口 |

上述差距目前没有影响生产，因为旧入口仍在使用旧实现。但它们是切换阻断项，不能因为新模块
已有单元测试就视为功能迁移完成。

## 4. 新的迁移 Gate

每项能力按以下顺序实施：

1. 从旧实现和旧测试提取可观察行为矩阵。
2. 建立参数化合同测试，同一 fixture 同时运行旧实现和新实现。
3. 再进行 Port、Adapter、Feature 和文件结构调整。
4. 比较 Schema、描述、结果、错误、副作用和事件。
5. 任何差异默认修复；确需改变时单独提交决策，不夹带在架构重写中。
6. 差分测试全部通过后，才在实施日志中标记“已迁移”。

工具最低差分矩阵：

```text
definition
  name / label / description / schema / default exposure
execution
  success / failure / cancel / progress
input edges
  optional fields / extra fields / invalid values
environment
  Windows / Unix / cwd / absolute path / home path
output
  content / details / truncation / actionable notices
side effects
  filesystem / process / network / persistence
```

## 5. 下一步

通用 Tool Compatibility Contract 和 `current_time` 适配已经建立。下一阶段把现有 read
测试拆成共享 fixture，先让旧 read 单独通过完整合同，覆盖文本、GB18030、图片、二进制提示、
offset/limit、锚点、路径模糊匹配、取消及自定义 Read Operations。随后在不导入旧
`coding-agent` 源码的前提下实现新 read，并让旧新实现同时通过该合同。
