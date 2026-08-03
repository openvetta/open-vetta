# Open Vetta

Vetta 的开源版本：一个在本地运行的 AI Agent 桌面应用与编码智能体。

**不连任何厂商服务端。** 没有登录、没有账号、没有订阅计费、没有管理后台。模型一律
BYOK（Bring Your Own Key）——你在设置里填自己的 API Key，请求直发服务商原站，
密钥只存在你本机。代码、工具调用、会话记录同样全部留在本地。

> 本仓库是商业版 `vetta-mono` 的**永久硬分叉**，服务端相关代码已物理移除而非开关关闭。
> 仓库内有一道常驻守卫（`scripts/quality/check-no-vetta-api.mjs`）阻止这类耦合再长回来。

---

## 快速开始

```bash
bun install                # 安装所有工作区依赖（需要 Bun 1.3+、Node 20+）
bun run build              # 构建所有核心库
bun run check              # Biome + 类型检查 + 架构守卫（开 PR 前必跑）
bun run test:unit          # 核心库单元测试（ai/agent/coding-agent/ecosystem-adapter）
bun run test:pkg ai        # 只跑单个包测试；test:pkg --list 查看可测包

# 应用
bun run build:desktop      # 构建 Electron 桌面应用
bun run build:cli          # 构建 CLI 应用

# IM 旁路网关（Go）
cd packages/im-gateway && make build
```

桌面应用入口：`packages/desktop-app`。质量门禁分层见 [docs/dev/quality-gates.md](docs/dev/quality-gates.md)。

---

## 产品矩阵

### 终端应用

| 包 | 角色 | 技术栈 |
|----|------|--------|
| [packages/desktop-app](packages/desktop-app) | 桌面应用。对话、文件浏览、批量任务、定时自动化、能力市场、工作流流转、知识库、IM 旁路宿主 | Electron + React + Vite + Jotai + TanStack Router + shadcn/ui + Tailwind v4 |
| [packages/coding-agent](packages/coding-agent) | 编码智能体核心。CLI、print/JSON、RPC、SDK 四种模式，Extensions/Skills/Themes 生态 | TypeScript |
| [packages/cli-app](packages/cli-app) | 基于 `coding-agent` 的纯 CLI 封装 | TypeScript |
| [packages/im-gateway](packages/im-gateway) | IM 平台旁路（飞书/微信）。作为桌面应用的 sidecar，把 IM 消息桥接到本地 `coding-agent --mode rpc` | Go · NDJSON IPC |

### 核心库

| 包 | 职责 | 不包含 |
|----|------|--------|
| [packages/ai](packages/ai) | 多 Provider LLM API、模型注册表、Provider Adapter | Agent Loop、UI、会话持久化 |
| [packages/agent](packages/agent) | 有状态 Agent Loop、工具调用、事件流 | 终端/桌面 UI、业务规则 |
| [packages/ui](packages/ui) · [theme-ui](packages/theme-ui) · [theme-sdk](packages/theme-sdk) | 可复用 UI 原语、主题视图层与主题 SDK | 宿主生命周期 |

### 运行时包（被宿主应用复用）

| 包 | 职责 |
|----|------|
| [packages/runtime-core](packages/runtime-core) | `RuntimeHost` 与 Session Facade，面向桌面宿主的运行时事件契约 |
| [packages/runtime-tools](packages/runtime-tools) | 内置工具重导出（bash/edit/write/todo/current-time/invoke-skill 等） |
| [packages/runtime-storage](packages/runtime-storage) | 会话与设置的存储原语 |
| [packages/runtime-mcp](packages/runtime-mcp) | MCP Manager 与 MCP Runtime 绑定 |
| [packages/runtime-telemetry](packages/runtime-telemetry) | 运行时日志抽象（仅本地落盘，不外发） |

依赖方向：应用 → runtime-\* → coding-agent / agent / ai。核心库不感知宿主。

---

## desktop-app 关键能力

承载以下 Domain（见 `src/renderer/domains/`）：

- **chat** — 主对话界面，消息流、Artifact、工具调用、回到底部与自动跟随
- **project** — 侧边栏项目/会话管理，支持普通、批量（batch）、定时（schedule）、流转（flowing）四类项目
- **batch-tasks** — 批量任务：一个 Prompt + 多个目标目录，按并发度执行，支持暂停/重试/全部重新开始
- **scheduler** — 自动化（Cron 定时触发执行）
- **flowing / flowing-chat** — 多 Agent 工作流流转（基于 `@xyflow/react` 的 DAG 编排）
- **abilities / skills** — 能力市场：从 GitHub 开放市场仓库同步 Skill / MCP / Plugin / Bundle
- **knowledge-base** — 本地知识库与后台惰性加工
- **file-explorer / file-preview** — 本地文件树、PDF/DOCX/表格预览
- **activity-panel** — 侧面板：工具调用、请求历史、批量任务进度、调试
- **plugins / pet** — 插件运行时、桌宠
- **settings** — 设置：模型、快捷键、IM 集成、插件、权限、系统

主进程（`src/main/`）职责：窗口/托盘/自动更新、共享 `RuntimeHost`、IPC 注册（`vetta:*` 通道）、
批量任务执行器、定时调度、IM 旁路子进程宿主。

渲染进程与主进程通过 preload 暴露的 `window.vetta.*` 通信。状态使用 Jotai atoms 按领域分层。

---

## 模型配置（BYOK）

客户端内置六家[[预设服务商]]目录（Claude / OpenAI / DeepSeek / Z.ai(GLM) / Kimi / Gemini），
只含 `baseUrl` 与 `api` 类型，**不含任何 key**。填入你自己的 key 后：

- 立即向该服务商的 `/models` 拉取你账号实际可用的模型，之后每 12 小时后台同步一次；
- 价格与能力元数据由 [models.dev](https://models.dev) 公共目录补齐，随包带快照兜底；
- 请求直发服务商原站，本应用不代理、不转发、不计费。

也可以手搓自定义服务商（任何 OpenAI 兼容端点，包括 Ollama / vLLM / LM Studio 等本地推理服务）。
详见 [ADR-0050](docs/adr/0050-preset-providers-move-client-side-with-dynamic-model-lists.md)。

---

## 能力市场（开放市场）

能力（Skill / MCP Server / Plugin / Bundle）来自 **GitHub 仓库归档**：客户端下载
仓库压缩包，读取其中的 `.vetta/marketplace.json`，搜索与筛选全部在本地快照上完成。
你可以添加任意多个市场来源，也可以完全不加。

清单格式见 [docs/open-marketplace.md](docs/open-marketplace.md)，
统一模型见 [ADR-0049](docs/adr/0049-abilities-unify-storage-and-presentation-not-installation.md)。

---

## 编码 Agent 与扩展生态

`packages/coding-agent` 支持交互、print/JSON、RPC、SDK 四种运行模式。通过 Extensions（TypeScript）、
Skills（指令集）、Prompt Templates、Themes 四类扩展机制，可在不 fork 源码的前提下定制工作流。

仓库内置扩展示例：`packages/coding-agent/examples/extensions/`（`with-deps`、
`custom-provider-anthropic` / `custom-provider-gitlab-duo` / `custom-provider-qwen-cli`）。

### MCP 支持

```jsonc
// ~/.vetta/agent/mcp.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"]
    }
  }
}
```

交互模式下用 `/mcp` 查看状态，MCP 工具会自动暴露给 Agent。
详见 [`packages/coding-agent/docs/MCP.md`](packages/coding-agent/docs/MCP.md)。

---

## 网络行为

本应用只在以下情况发起网络请求，全部由你的配置决定：

| 用途 | 目标 | 可否关闭 |
|------|------|----------|
| LLM 推理 | 你配置的服务商原站 | 不配 key 即不发生 |
| 模型元数据 | `models.dev` 公共目录 | 失败回退随包快照 |
| 能力市场 | 你添加的 GitHub 仓库 | 不加来源即不发生 |
| 便携运行时下载 | Node/Python 官方发行源 | 用系统已装运行时即可跳过 |
| 自动更新 | 你自己配置的 `VETTA_UPDATE_URL` / GitHub Releases | 不配即不检查 |
| MCP / 插件 / IM / Webhook | 由你安装的扩展与填写的凭据决定 | 不装即不发生 |

没有遥测，没有崩溃上报，没有使用统计。

---

## 开发约定

- **包管理器**：统一使用 Bun（`bun` / `bunx`）。
- **代码质量**：TypeScript 侧禁止 `any`（除非确有必要）、禁止内联动态 `import()`；Go 侧改完必须跑 `make check`。整仓改完必须 `bun run check`。
- **测试**：`bun run check` 不含测试。请从对应包根目录运行 `bunx vitest --run test/xxx.test.ts`。
- **禁止命令**：不要直接 `bun run dev` / `bun run build` / `bun test`。
- **提交规范**：中文 commit message；关联工单请写 `fixes #N` / `closes #N`。
- 详见 [`AGENTS.md`](AGENTS.md)。

### Changelog

每个包独立维护 `packages/*/CHANGELOG.md`。新条目写入 `## [Unreleased]`，按
`Breaking Changes / Added / Changed / Fixed / Removed` 分节；已发布版本段不再改动。

### 版本与发布（Lockstep）

所有包共用版本号，版本源以 `@vetta/coding-agent` 为准（不做 major 发版）：

```bash
bun run release:patch    # Bug 修复与新增功能
bun run release:minor    # API Breaking
```

桌面安装包由 `.github/workflows/desktop-release.yml` 在三个操作系统分别构建并发布到
GitHub Releases；自动更新链路见 [`docs/desktop/README.md`](docs/desktop/README.md)。

---

## 目录速览

```
open-vetta-mono/
├── packages/
│   ├── ai · agent · ui · theme-ui · theme-sdk     # 核心库
│   ├── runtime-core · runtime-tools · runtime-mcp · runtime-storage · runtime-telemetry
│   ├── coding-agent · cli-app · desktop-app       # 终端应用
│   ├── im-gateway                                 # IM 旁路（Go）
│   ├── plugins · themes · skill-presets           # 扩展生态
│   └── coding-agent/examples/extensions/*         # 扩展示例
├── docs/                                          # 架构文档与 ADR
├── scripts/                                       # 构建、发布与质量守卫
├── AGENTS.md                                      # 开发与 AI 协作规范
├── CONTEXT.md                                     # 领域术语表
└── CLAUDE.md                                      # Claude Code 指令
```

架构文档：

- [`docs/capabilities/README.md`](docs/capabilities/README.md) — 基础/领域能力与权限层
- [`docs/open-marketplace.md`](docs/open-marketplace.md) — GitHub 开源能力市场格式
- [`docs/adr/`](docs/adr) — 架构决策记录
- [`CONTEXT.md`](CONTEXT.md) — 领域术语表（写代码前先查这里的既有命名）
