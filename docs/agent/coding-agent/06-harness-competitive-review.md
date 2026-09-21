# Agent Harness 竞品对照

> 状态：调研笔记，不是 ADR。  
> 日期：2026-09-20  
> 问题：本仓生产 harness 做得如何；若要做好 harness，该从 Pi、Claude Code、Codex 吸收什么。

本文的 “harness” 取 Claude Code 的公开定义：把语言模型变成可执行 coding agent 的那一层——**工具、上下文管理、执行环境**，再加上中断、权限、持久化与恢复。它不是测试脚手架，也不是 Pi 尚未落地的 `AgentHarness` v2 脚手架。

事实源优先级：本仓库源码与包级 README > 本仓库已固定 SHA 的 Pi 评审 > 上游公开文档。Pi 生产对照仍锚定 [`docs/agent/extension/01-scope-and-baseline.md`](../extension/01-scope-and-baseline.md) 的 `936aff00918de1187f085f123c2812d8f2d67745`（package `0.84.1`）。未运行跨仓行为测试。

---

## 1. 结论

Vetta 的 **内部 harness 已经比 Pi 生产循环更分层**，也比 Claude Code / Codex 更明确地把「一次 Tool Loop」和「多轮 Session」拆开。短板不在 while 循环，而在 **作者入口不统一、崩溃后的 operation 状态不够显式、项目本地代码执行缺少 trust 门**。

不要把 Pi `AgentHarness` v2 当竞品完成态。上游设计文档把 durable run / lane / effect boundary 写得很完整，但 `packages/agent/src/harness/agent-harness.ts` 的主路径仍抛 `HarnessNotImplemented`；文档自己写明 **不把 coding-agent 迁到该 harness**。本仓 [`docs/agent/extension/05-gap-and-adoption-roadmap.md`](../extension/05-gap-and-adoption-roadmap.md) 的跟踪门槛仍然有效。

| 若目标是 | 现在谁更强 | 原因 |
| --- | --- | --- |
| 第三方用一个 API 改终端工作流 | Pi 生产 | Extension + Skill + Package 叙事简单 |
| 同一套 loop 服务 Desktop / CLI / IM / SDK | Vetta | `runtime-core` + 窄 Port，Pi 仍偏 TUI |
| 上下文窗口与无人值守收尾 | Claude Code | 把 context 当主资源；Stop hook / `/goal` 关闭循环 |
| 默认执行隔离 | Codex | OS sandbox 与 approval policy 正交；网络默认关 |

做好 harness 的路线：**迁移语义，不迁移单体结构**。吸收 Pi 已验证的 lifecycle / trust / sourceInfo，吸收 Claude 的验证门和「扩展叠在 loop 之上」，吸收 Codex 的 sandbox×approval 两层；不要引入第二条 Agent loop，也不要把 Plugin、MCP、Skill 合成一个万能 Extension。

---

## 2. 本仓生产 harness 实际长什么样

生产路径（不是重写方案口号）：

```text
宿主 prompt / steer / abort
  → RuntimeHost Session 队列
  → TurnPipeline
        admission → snapshot_binding → conversation_loading
        → context_assembly → context_preparation
        → execution（TurnEnginePort → runAgentTurn）
        → finalization
  → Conversation Document 追加
```

| 层 | 包 | 拥有 | 不拥有 |
| --- | --- | --- | --- |
| Provider | `@vetta/ai` | 流、tool call、usage、stop、取消 | Session |
| 执行内核 | `@vetta/agent-core` | `runAgentTurn`：限额、steering 边界、checkpoint、tool execute | 磁盘、MCP、Skill |
| 运行时内核 | `@vetta/runtime-core` | Session 状态机、7 段 Turn Pipeline、Snapshot lease、Repository Port | Todo / Coding Prompt |
| 产品策略 | `@vetta/coding-agent` | microcompact、LLM compaction、Plugin/MCP 贡献、权限策略 | 最终 Composition Root |
| 环境 | `runtime-node` / `runtime-desktop` / apps | 文件、进程、sandbox、窗口、IPC | Loop |

关键生产不变量已经落地：

1. **Turn Snapshot**：动态 Tool / MCP / Plugin 在 admission 冻结；外部更新对下一 Turn 才可见。见 `packages/runtime-core/src/kernel/turn-pipeline.ts` 的 `TurnPipelineStage`。
2. **Conversation Document 是真相**，送给模型的 messages 是投影。`runtime-core` README 明确拥有 document 与 history projection。
3. **Steering 发生在工具边界**。RPC 暴露 `steer` / `follow_up` / `set_steering_mode`（[`packages/coding-agent/docs/rpc.md`](../../../packages/coding-agent/docs/rpc.md)）。`agent-core` 的 `AgentTurnRequest.takeSteeringMessages` 在 tool 批次后取输入。
4. **两层压缩**：Layer1 `microcompact` 是纯函数，裁旧 tool result / thinking；Layer2 才是 LLM 摘要。见 `packages/coding-agent/src/compaction/`。
5. **权限不是单一开关**：工具 `toolPolicy.authorize`、Desktop Capability Grant、sandbox 环境分属不同层。`runtime-desktop` README 写明 sandbox Tool 由平台工厂提供，Coding Agent 只叠加产品策略。
6. **一进程一活动会话 writer**。RPC 文档写明同文件禁止多 writer；与 Pi harness 设计的 single-writer 目标一致，但本仓没有 lane。

已知内部裂缝（源码级，不是竞品口号）：

- `packages/agent` 仍同时导出较老的 `agentLoop` 和较新的 `engine/runAgentTurn`。生产 Runtime 走后者；前者是 Pi 血缘残留。
- Coding Extension 的 `registerTool()` 先写 Extension 自己的 registry，没有完整继承 Runtime catalog 的 generation / in-flight 语义。见 [`docs/agent/extension/03-dimension-review.md`](../extension/03-dimension-review.md) 第 3 节。
- 添加一把 Agent 工具有多条路：Coding Extension、Desktop `ctx.agent.registerTool`、MCP、Runtime Feature。缺少全局 contribution catalog。

---

## 3. Pi：生产循环 vs 未交付 Harness v2

### 3.1 生产循环（可学）

Pi 自称 “minimal terminal coding harness”（[`packages/coding-agent/README.md`](https://github.com/earendil-works/pi/blob/936aff00918de1187f085f123c2812d8f2d67745/packages/coding-agent/README.md) @ `936aff00`）。默认四件套 `read/write/edit/bash`，**核心故意不做 MCP、subagent、plan mode**；这些交给 Extension / Package。

生产 `packages/agent/src/agent-loop.ts` 仍是双层 while：

```text
outer: follow-up 续跑
  inner: 注入 steering → 流式 assistant → 执行 tool 批次
         → prepareNextTurn() 可换 model/context
         → shouldStopAfterTurn()
         → 再取 steering
```

相对本仓 `runAgentTurn`，Pi 生产循环多了这些已落地挂钩：

| 挂钩 | Pi 生产 | Vetta 生产 |
| --- | --- | --- |
| `prepareNextTurn` | 可换 context / model / thinking | Snapshot 在 Turn 开始冻结；中途换模型走下一 Turn |
| `beforeToolCall` | 可改参数、拦截 | `toolPolicy.authorize` + 产品拦截管线 |
| `shouldStopAfterTurn` | Extension 可阻止自然停止 | continuation provider / Stop hook 产品层 |
| `length` 截断 | 整批 tool call 失败，不执行残缺参数 | 需核对本仓是否同等 fail-closed |
| 项目 trust | 加载项目本地 Extension/Package 前批准 | 文档已记录缺口，生产未见等价门 |
| `sourceInfo` | 贡献对象自带来源 | 旁路 path map，未统一附着 |
| 作者模型 | 一个 Extension API | 多套贡献面 |

Pi 明确 **No MCP**：用 CLI+README（Skill）或自己写 Extension。这和 Vetta「MCP 是一等协议能力」是产品分叉，不是 Vetta 落后。

Steering 语义与本仓同源：Enter 排队，当前 assistant 的 tool 批次跑完再投递；`steeringMode` / `followUpMode` 为 `one-at-a-time` 或 `all`。

### 3.2 Harness v2（设计优秀，不能当完成态）

[Harness v2 设计](https://github.com/earendil-works/pi/blob/936aff00918de1187f085f123c2812d8f2d67745/packages/agent/docs/harness-v2.md) 的目标值得记，但 scaffold 未实现：

- **Durable operation**：prompt 被接受即持久化；崩溃后从记录恢复。
- **Session 四件套**：append-only tree、named lanes、lane records、global facts。
- **Events 只观察，Hooks 才能改行为**。
- **每个 effect 穿过注入边界**；`drive: "manual"` 可逐步驱动，用于崩溃测试。
- **Single writer**；多线程用 lane，不用多进程写同一 session。
- **非目标**：hook 副作用 exactly-once、provider 流恢复、多 writer、把 coding-agent 迁过去。

`AgentHarness` scaffold 定义了完整的 `prompt/steer/compact/navigate/resume` 类型，但 `on()` 与主操作抛 `HarnessNotImplemented`。状态机文档自称 “working handoff”，还不是 canonical spec。

对 Vetta：**学 record/effect 测试方法和「operation 程序计数器显式化」；不要新建并行 loop。** 本仓已有 Conversation Document + Turn Pipeline + fail-closed resume。缺的是把「半截 Turn」收成一条总 `OperationStateRecord`，而不是从一堆事件反推。

---

## 4. Claude Code：把 harness 定义成产品

[How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works.md) 直说：Claude Code 是套在模型外面的 **agentic harness**——工具、上下文、执行环境。Loop 到处相同，变的是执行地点（本机 / 云 VM / Remote Control）和界面。

公开架构要点：

1. **三相 loop**：gather context → take action → verify。用户可随时打断。
2. **扩展叠在 loop 之上**，不改 loop：Skill、MCP、Hooks、Subagents。
3. **上下文窗口是主资源**。[Best practices](https://code.claude.com/docs/en/best-practices.md) 开篇即此；性能随窗口变满而下降。
4. **关闭循环靠验证，不靠模型自称完成**：测试/构建/截图；`/goal` 每轮复检；Stop hook 用脚本挡住收尾（连续 8 次后宿主覆盖）。
5. **Plan mode 是权限模式**，不是内核分支：先只读探索，再改文件。
6. **Session = JSONL**（`~/.claude/projects/`）+ 改文件前的 filesystem snapshot，支持 rewind。
7. **Hook 面极大**：[Hooks reference](https://code.claude.com/docs/en/hooks.md) 把 SessionStart、PreToolUse、PermissionRequest、Stop、PreCompact、MCP elicitation 等做成用户可配的 shell/HTTP/MCP/prompt 处理器。同一套 hook 在终端、IDE、Desktop、云会话触发。

对 Vetta 的启示：

- 产品层补 **verify-to-stop**（continuation / Stop hook 已有雏形，缺「目标未达成就不停」的一等合同）。
- Plan mode 应是 **toolPolicy + 工具可见集**，不要在 `runAgentTurn` 加 `if (plan)`。
- 不要把 Claude 那种全量 hook 表搬进内核。本仓已有 Observer / Policy / Contribution Provider；公开 hook 应是产品适配，且失败不得破坏主流程。
- 「同一 loop、多种执行环境」本仓已经在走（Desktop / CLI / IM）。Claude 更强的是 **用户可感知的环境切换**（云 VM、Remote Control），不是循环本身。

---

## 5. Codex：harness 的安全内核是两层正交控制

[Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security.md)：

- **Sandbox mode**：技术上能碰什么（工作区写入、网络）。
- **Approval policy**：什么时候必须停下来问人。
- 本机默认 **无网络**、写入限制在工作区。
- Cloud 两阶段：setup 可联网装依赖，agent 阶段默认离线；secret 在 agent 阶段前撤掉。
- 项目 `trust_level = "untrusted"` 会禁用项目本地配置，并强制命令审批。
- 带 destructive 注解的 app/MCP 调用默认要批准。

Vetta 已有 sandbox 工厂和 Capability Grant，但用户心智上还没有 Codex 这么干净的「沙箱 × 审批」矩阵。Plugin 权限、tool sandbox、project trust 三件事目前容易被讲成同一种「安全」。它们不是。

---

## 6. 分项对照（生产行为）

| 维度 | Vetta 生产 | Pi 生产 | Claude Code 公开 | Codex 公开 |
| --- | --- | --- | --- | --- |
| Tool loop | `runAgentTurn` + 限额/checkpoint | `agentLoop` + prepareNextTurn | 三相 loop，用户可随时打断 | 未公开循环细节；强调沙箱内执行 |
| 动态能力 | Turn Snapshot lease | 热刷新工具/Provider；Extension generation | Skill/MCP/hooks 叠在 loop 上 | MCP 走审批 |
| Context | Document 真相 + microcompact + LLM compact | JSONL + 有损 compaction，tree 可回看 | 窗口当主资源；PreCompact hook | 未作为公开卖点 |
| Steering | RPC `steer` / follow_up，工具边界投递 | 同源队列 | 随时 interrupt | 任务可被 safety monitor pause |
| Permissions | toolPolicy + capability grant + sandbox | 项目 trust；获批代码=用户进程 | 权限模式含 plan；PermissionRequest hook | sandbox × approval；网络默认关 |
| MCP | 一等 Runtime Feature + 渐进披露 | 核心不做 | 一等扩展 | 有副作用注解的调用要批准 |
| Plugin | Desktop 受信 Renderer + Agent 贡献 | 无桌面插件；Extension 改 TUI | Desktop/IDE 是同一 loop 的界面 | ChatGPT 插件生态，agent 安全另算 |
| Session 恢复 | fail-closed interrupted Turn；subagent journal | session tree / replace runtime | JSONL resume/fork + 文件 snapshot | cloud 隔离容器 |
| 多宿主 | Desktop/CLI/IM/SDK 共用产品包 | 终端中心；remote protocol 实验中 | 终端/Desktop/IDE/云/Slack 同一 loop | CLI/IDE/云 |

Pi Harness v2 的 lane / durable operation / manual drive **不列入上表**，以免把设计分数算进生产。

---

## 7. 若要把 harness 做好：可执行吸收清单

按「改变用户可观察正确性」排序，不按竞品热度。

### P0 正确性（本仓 roadmap 已写，仍然成立）

1. **Coding Extension generation / teardown**  
   reload 后旧闭包不能操作新 session。Pi `0.69–0.70` 已验证。不要复制 runner 结构。
2. **动态注册可见性四问统一**  
   何时可见、in-flight 如何处理、同名替换、卸载后旧调用如何失败。MCP / Plugin / Extension 必须同一套答案。底层 Runtime 已接近，外部 API 未映射完。
3. **Project trust 门**  
   加载项目本地可执行 Extension/Package 之前。宿主无关 Port，Desktop UI / CLI flag / 非交互 deny。不要叫沙箱。

### P1 把「好 harness」补成产品合同

4. **Verify-to-stop**（学 Claude，用本仓 continuation）  
   自然停止前跑确定性检查；失败则续跑。连续 N 次失败才允许停。这是产品 Feature，不是 `agent-core` 新阶段。
5. **Sandbox × Approval 矩阵**（学 Codex）  
   对用户暴露两维：能做什么 / 要不要问。网络默认拒绝应成为可配置默认，而不是藏在实现里。
6. **ContributionSourceInfo**（学 Pi）  
   tool/skill/MCP/plugin 对象自带来源。诊断、RPC、权限 UI 共用。
7. **Events vs Hooks**（学 Pi v2 设计，本仓已部分做到）  
   Observer 不得改 Turn；只有 Policy / Hook 能改。公开文档按这个讲，避免第三套事件总线。
8. **截断 tool call fail-closed**（核对 Pi `length` 行为）  
   输出被截断时不要执行可能残缺的参数。

### P2 跟踪，不要提前做

9. **显式 OperationStateRecord**  
   等本仓 Turn 恢复测试先证明「半截 Turn」的每一种崩溃前缀都可恢复，再考虑把程序计数器收成一条总状态。不要为了对齐 Pi 文档先改存储格式。
10. **Pi Harness v2 / remote CBOR**  
    仅当上游主操作不再抛 `HarnessNotImplemented`，且生产 coding-agent 至少有一条接入路径后再差分。

### 明确不要做

- 不把 Pi `coding-agent/src/core` 搬回来。
- 不把 Plugin、MCP、Skill、Coding Extension 合成一个 API。
- 不把 TUI Component 放进宿主无关 Runtime。
- 不把 permission UI 或 project trust 宣传成进程隔离。
- 不新增与 `runAgentTurn` 并行的第二条执行内核。

---

## 8. 证据

- 本仓：`packages/agent/src/engine/run-agent-turn.ts`、`packages/runtime-core/src/kernel/contracts.ts`（`TurnPipelineStage`）、`packages/runtime-core/README.md`、`packages/coding-agent/src/compaction/microcompact.ts`、`packages/coding-agent/docs/rpc.md`、ADR-0077。
- 本仓已有评审：[`docs/agent/extension/03-dimension-review.md`](../extension/03-dimension-review.md)、[`04-pi-updates-since-rewrite.md`](../extension/04-pi-updates-since-rewrite.md)、[`05-gap-and-adoption-roadmap.md`](../extension/05-gap-and-adoption-roadmap.md)。
- Pi @ `936aff00`：`packages/agent/src/agent-loop.ts`、`packages/agent/docs/harness-v2.md`、`packages/agent/src/harness/agent-harness.ts`、`packages/coding-agent/README.md`。
- Claude Code：<https://code.claude.com/docs/en/how-claude-code-works.md>、<https://code.claude.com/docs/en/best-practices.md>、<https://code.claude.com/docs/en/hooks.md>。
- Codex：<https://learn.chatgpt.com/docs/agent-approvals-security.md>。
