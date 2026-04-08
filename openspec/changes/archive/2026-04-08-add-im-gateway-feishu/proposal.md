## Why

当前 vetta 的 AI 能力被锁在 desktop-app 内，用户必须打开 Electron 客户端才能和本地 agent 对话。我们希望让用户在不打开桌面端的情况下，通过日常使用的 IM（首期：飞书）就能驱动本地的 coding-agent，沿用已有的本地 CLI 工具链与项目上下文，无需把代码上云。

这件事现在能做的前置条件已经齐了：`coding-agent` 已经有 `--mode rpc` 子进程协议（`packages/coding-agent/docs/rpc.md`），SessionManager 已经加了单写者 lockfile 保护（前序 commit `f0c4f02`），desktop-app 的所有 config 写入也都是原子的（commit `b78dec5`）。剩下的就是把 IM 消息翻译成 RPC 调用，并把 agent 事件流翻译成 IM 消息回写。

## What Changes

- 新增 `packages/im-gateway/`：独立 Go module，承载 IM 网关全部逻辑。**desktop-app / coding-agent / 现有 packages/api 一行都不动**。
- 新增 IM 网关核心：transport 抽象、session 路由、命令路由、agent ↔ IM 消息桥接、`coding-agent --mode rpc` 子进程池
- 新增飞书 transport：基于飞书开放平台**长连接接收事件**模式，无需公网 IP / webhook，个人模式下用户在客户端配置 App ID/Secret 即可
- 新增 Mock transport：stdin/stdout 假 IM，用于本地开发和倒逼接口纪律（"两个 transport 才能验证抽象是否泄漏"）
- 新增私聊命令集：`/projects` `/use <name>` `/new` `/whoami` `/help`
- 新增对话路由模型：`(im_user, project) → 独立 agent session`，切换项目不丢上下文
- 新增本地配置读取：从 `~/.vetta/desktop-config.json` 读取用户的项目列表（与 desktop-app 共享单一来源）
- 新增进程池：每个活跃 `(cwd, sessionPath)` 对应一个 `coding-agent --mode rpc` 子进程，遵守 SessionManager 的单写者契约
- 新增结构化日志和最小可用的运维输出（启动横幅、连接状态、错误聚合）
- 第一期**不做企业模式 / 反向通道**，但 transport 接口和 hostclient 接口的设计要为它留口，未来加远端模式只在 hostclient 增一个实现

## Capabilities

### New Capabilities

- `im-gateway`: IM 网关全部能力——transport 抽象、Feishu / Mock 两个 transport 实现、session 路由、命令路由、agent 事件桥接、`coding-agent --mode rpc` 子进程池、个人模式启动入口

### Modified Capabilities

无。本变更不修改任何已有 spec（仓库目前也无既有 spec）。所有改动局限在新建的 `packages/im-gateway/` 内。

## Impact

**新增代码**：
- `packages/im-gateway/` 全新 Go module（独立 `go.mod`，不复用 `packages/api/go.mod`）
- 仓库根 `README.md` 在 Backend services 一节追加 `im-gateway` 条目（一行）

**零侵入的现有包**：
- `packages/desktop-app`：不动
- `packages/coding-agent`：不动（依赖其已存在的 `--mode rpc` 协议作为外部接口）
- `packages/api`：不动（独立 SaaS 后端，与本变更无任何耦合）
- `packages/runtime-*`、`packages/agent`、`packages/ai`：不动

**外部依赖**：
- Go 标准库
- 飞书开放平台 SDK（首选官方 `larksuite/oapi-sdk-go/v3`，长连接客户端在 `card.go` / `event.go` 模块；如版本差异显著则回退到自建 ws + 接口签名）
- 一个轻量 yaml / koanf 配置库
- 不引入数据库；个人模式状态全部在 `~/.vetta/im-gateway/` 下用 JSON 文件持久化

**运行时影响**：
- 用户启动 IM 网关后，在飞书私聊里发消息会直接在本机产生 `coding-agent --mode rpc` 子进程，读写本机 `~/.vetta/agent/sessions/...jsonl`
- 由于已有 lockfile 保护，desktop-app 和 IM 网关同时操作同一 session 会被 lockfile 拒绝（本期可接受，UX 上由命令引导用户避开）

**未来演进的预留**：
- transport 抽象 + capabilities 协商：未来加 telegram / 钉钉只新增 transport 实现，上层零改动
- hostclient 抽象：未来加企业模式只新增"远端 hostclient"实现，路由器和命令层零改动
