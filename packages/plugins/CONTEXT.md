# 插件平台 — 上下文术语表

> 本文件是 glossary，只定义语言、不放实现细节。

## 命令能力 (Command Capability)

插件 renderer 经新 IPC 触发**宿主主进程**执行命令的能力。出口为通用的
`ctx.command.run(file, args[], opts)`（execFile 语义：不走 shell、参数数组传递、buffered
返回 `{ stdout, stderr, exitCode }`）。是 git/python/node 等「内置运行时」调用的统一通道。

对应权限值 `agent.command.run`（此前是占位符，本次为其补上真实 API）。

## 命令声明 (Declared Command)

插件在 `plugin.json` 中**显式声明**它需要执行的命令。声明之外的命令一律拒执行。
声明的命令会在宿主插件配置页向用户暴露，用户可**逐条勾选 / 关闭**。

**粒度 = 可执行文件名**（如 `git`）。声明一个二进制即放开它的全部子命令
（`git status` 与 `git push` 不区分）。授权 / 拦截也以二进制为单位。

## 命令拦截 (Command Interception)

运行时门控：当插件调用一条**被用户关闭**的已声明命令时，宿主拦截该次调用并**通知用户**，
而非静默失败。区别于「未声明命令」——后者是硬拒绝。

---

# Git 插件 — 上下文术语表

## 变更文件 (Changed Files) — 原需求口语「暂存区文件」

实际范围 = `git status` 的**全部变更**：已暂存（索引）+ 未暂存（工作区）+ 未跟踪。
**不是**狭义暂存区（git index）。面板把同一文件的 XY 两列状态**合并**成单一状态码展示。

状态码图例：`M` 修改 / `A` 新增(已暂存) / `D` 删除 / `R` 重命名 / `U` 未跟踪 /
`ignored`(gitignore，弱化样式) / `●` descendant（文件夹含已变更后代）。

数据源 `git status --porcelain=v2 --untracked-files=all -z`（**不加 `--ignored`**）。
`ignored` 仅为设计语言保留，v1 **不**把忽略文件铺进树（否则 node_modules 淹没面板）。

`●` descendant 暗示面板是**文件树**结构（文件夹可折叠，含变更后代时打点）。

## 面板挂载

Git 面板 = 一个 activity tab（`registerActivityTab`）。

- **不需要手动 attach**（doc/ui-slots.md 过时）：当前 `ActivityPanel.tsx` 按面板宽度用
  响应式 `TabBar` 自动展开/收纳 tab；插件 tab 已按 `scope_use` × 当前 scenario 过滤。
- Git tab 设 `scope_use: ["project"]` → **仅在 project 类型对话出现**（fail-closed）。
- **非 git 项目**：tab 仍出现，但面板内渲染「初始化仓库」CTA，点击执行 `git init`
  （写命令，仍归 `git` 二进制声明覆盖）。

## Diff 组件

设计意向是 `@pierre/diffs`（开源 React 库，基于 Shiki 高亮）。**v1 实际未采用**：该库依赖
shiki + web worker，在 Module Federation preset 下打包风险高（同 [[project_lottie_studio_plugin]]
的大依赖/wasm-in-MF 坑）且无法无头验证。v1 改用**自包含的轻量 unified-diff 渲染器**
（`components/DiffView.tsx` + `git/parseDiff.ts`，无语法高亮），隔离良好，日后可平滑替换。

## 打包形态

系统插件（preset）：`packages/plugins/presets/git/`，`source: "system"`，随 App 发布、
权限（含 `agent.command.run`）自动全量授予；用户仍可在设置页逐条关闭声明的命令。

## 刷新策略

触发重跑 `git status` → 重建树（不轮询）。**v1 实际**：
1. 对话轮结束：订阅 `conversation.on` 的 `turn-end`，接住 agent 改动（经 globalThis 刷新总线）。
2. 窗口重新聚焦：`window focus` 监听，接住外部编辑器改动。
3. 手动刷新按钮：兜底。

**偏差**：原计划的「fs 文件监听自动刷新」未实现——插件 activity-tab 的 `ctx.fs` 不暴露
watch；要做需给插件 API 补 fs.watch（后续）。window-focus 作为其替身覆盖大部分外部改动场景。

## 单文件 diff 来源

工作区 vs HEAD（`git diff HEAD -- <path>`），与合并视图一致。未跟踪文件用
`git diff --no-index /dev/null <file>` 合成「新增」patch。点击文件在树内
**inline 手风琴展开** diff（贴合「点击展开看 diff」）。

## v1 动作边界

只读：状态树 + 展开 diff。唯一写操作 = 非 git 项目的「初始化仓库」CTA（`git init`）。
**不含** stage/unstage/commit/discard（留待后续版本）。
