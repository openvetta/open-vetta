# Changelog

All notable changes to `@vetta/desktop-app` are documented in this file.

## [Unreleased] — 内测版（未公证）

### Breaking Changes

- **批量任务状态模型简化为 4 态、项目级控制按钮重做**：`BatchTaskStatus` 联合类型移除 `"paused"`，新模型仅保留 `pending / running / completed / failed`（UI 上 pending+queued 仍展示为「等待中」，pending+无 session 展示为「未执行」）。`BatchProject.pausedAt` 字段、调度器 `pausedProjects` 集合、`pauseProjectScheduling` / `resumeProjectScheduling`、project 级 paused/resumed 事件全部下线。项目 banner 仅保留两个执行控制按钮——「开始 / 停止」合二为一的 toggle（队列活动态即 `running > 0` 或存在 queued 任务时显示「停止」并执行 abort + 清非已完成；空闲态显示「开始」，按并发把所有未执行入队，无未执行时 disabled），以及独立的「重置」（删全部 session 包括已完成重跑）；不再有「批量暂停 / 批量继续 / 批量重试失败下拉 / 清空队列状态」。单任务 hover 操作移除「暂停 / 继续」，仅保留「执行 / 重试 / 取消等待 / 删除」。后端 IPC `BATCH_PAUSE` / `BATCH_RESUME` / `PAUSE_TASK` / `RESUME_TASK` / `BATCH_RETRY_FAILED` / `BATCH_CLEAR_FAILED_AND_RETRY` / `BATCH_CLEAR_FAILED` / `BATCH_RUN_NEVER_EXECUTED` / `BATCH_RESTART_ALL` / `BATCH_CLEAR_UNFINISHED` 通道全部删除，对应 preload API（`batchPause` / `batchResume` / `pauseTask` / `resumeTask` / `batchRetryFailed` / `batchClearFailedAndRetry` / `batchClearFailed` / `batchRunNeverExecuted` / `batchRestartAll` / `batchClearUnfinished`）一并下线；新增 `BATCH_START` / `BATCH_STOP` / `BATCH_RESET` / `STOP_TASK` 通道，对应 `batchStart` / `batchStop` / `batchReset` / `stopTask`。executor 的 `pauseTask` 重命名为 `abortTask`（不再写持久化状态），停止流由 IPC 层 `cleanTaskFilesAndState` 统一收尾。`task.paused` / `task.resumed` / `project.paused` / `project.resumed` 事件类型从 `BatchTaskEvent` 联合中删除，renderer hook 不再监听。`.vetta/meta.json` 的 `pausedAt` 字段在 `readProjectMeta` 中静默剥离；`.vetta/task-states.json` 中 `status === "paused"` 的子任务在 `loadProjectTaskStates` 中静默迁移为 `pending`。详情页 `BatchQueueStatus` 也同步重构：移除 `isQueuePaused` 横幅 / 单任务 pause/resume 按钮 / 「暂停队列 / 继续 / 重试失败」按钮，对齐 banner 的「开始 / 停止 / 重置」三键模式。webhook 通知模板 `STATUS_ROWS` 与 `isProjectFinished` 删除 paused 行/分支。

### Added

- **会话页支持外部文件拖拽引用**：`ChatPage` / `NewSessionPage` 全页接管 OS 拖入事件，hover 时出现虚线虚化蒙层「松开以引用文件」提示。松开后非图片文件/目录通过 preload 新暴露的 `fs.pathForFile(file)`（Electron 32+ 移除 `File.path` 后由 `webUtils.getPathForFile` 接管）取到绝对路径，去重后追加进 `mentionedFilesAtom`，在 InputBar 顶部以胶囊形式展示并保留原有 hover 路径 tooltip；图片仍走 `attachedImagesAtom`（DataURL 多模态附件，不变）。文件夹通过 `webkitGetAsEntry` 检测，胶囊以目录形态显示。NewSessionPage 状态下拖入有效——文件暂存于 atom，由后续 `openSession + sendMessage` 串起。应用内 File Explorer 拖到 ChatPage 同样进 mentionedFiles：`FileTreeNode` 在 dragstart 新增第二条 MIME `application/vetta-path-meta`（JSON: `{ isDirectory, name }`），既不影响原有 in-tree move 逻辑，又让 chat drop zone 拿到目录标记。InputBar 自身的图片专属 drop overlay 下线，避免与全页 overlay 叠加。`mentionedFile` 语义随之从「cwd 内 @ 提及」放宽到「任意绝对路径引用」，CONTEXT.md 与 docs/adr/0002 已同步。

- **工具调用耗时元数据 UI 展示（含工具自报阶段）**：每个 tool_call block 现在自带 `startedAt / durationMs / phases / currentPhase` 四个可选字段。runtime-core 的 `tool.start` 事件加 `startedAt`、`tool.end` 加 `durationMs/phases`、新增 `tool.phase` 事件由工具内部 `ctx.phase(label)` 触发。renderer 端 `useSessionManager` 把三个事件喂给 chat-service 新接口（`handleToolStart` 扩展 `startedAt`、`handleToolEnd` 扩展 `timing` 选项、新增 `handleToolPhase` 维护 `currentPhase` + 累加 phases），历史加载侧 `fullHistoryToChat` 读取新的 `tool_timing` HistoryEntry 关联到对应 tool_call block。ToolCallBlock UI：header 在 duration > 1s 时显示紧凑耗时徽章（pending 状态每秒 tick 实时跳秒），展开面板顶部新增一行 `meta` 区显示 `HH:MM:SS · 12.345s · phase1 2.1s · phase2 12.3s ...`，title 文案明确「本地元数据，仅 UI 展示，不发送给大模型」；没有 result 但有 timing 数据时面板也可展开。所有 timing 信息存在 jsonl 的独立 `tool_timing` entry 里（参见 `@vetta/coding-agent` 的 ADR 0001），LLM 上下文永远看不到。

- **默认「对话」项目新增「清空会话」入口**：默认项目 label 右侧 ⋯ 弹出的 `ProjectContextMenu` 在 isDefault 分支新增「清空会话」项（destructive 样式，`mdi--broom` 图标）。点击弹 danger 风格确认弹窗，文案带上当前会话数量；确认后调用新增 IPC `vetta:session:clear-default-conversation`，主进程先 dispose 所有指向默认 cwd 的 session handle，再递归清空 `~/.vetta/conversation/` 下全部条目（保留目录本身），最后重建 `.vetta/sessions/`。若该项目存在 running 会话，菜单项置灰 + tooltip「请先停止运行中的会话」，主进程亦做兜底校验。清空后当前 active session 若属默认项目，自动跳回该项目的 NewSession 页。同步迁移默认项目的 session 落盘布局：在 `vetta:session:create` / `vetta:session:list-sessions` 两条 IPC 中识别默认 cwd 时透明注入 `sessionDir = <cwd>/.vetta/sessions`（与批量项目布局对齐），替代原先与设备相关的 `~/.vetta/agent/sessions/--*-.vetta-conversation--/` 编码路径；旧位置的会话不迁移、不再被读取。`SessionFacade.listSessions` 与 `RuntimeHost.listSessions` 签名扩展为接受可选 `sessionDir` 参数，透传给 `SessionManager.list`。

- **批量任务「失败 · 重置」徽章**：项目头部副标题里的失败计数文案改成红色可点击徽章「N 失败 · 重置」，仅在 `failed > 0` 时渲染；点击弹确认对话框，确认后清空所有失败任务的 session / 产物 / 状态（`status` 回到 `pending`，清 `sessionId` / `sessionPath` / `error`）并复用既有 `task.reset` 事件刷 UI。前端按点击瞬间快照取 failed 任务 ID 列表，与之后新失败的任务无关；后端按队列状态分流——若该项目还有 `running` 或 queued 任务（队列活动态）则把这些 ID 重新 `enqueueRunTask` 到队尾继续执行，否则仅重置等用户手动「开始」。当 `neverExecuted=0 && paused=0` 且「开始」按钮 disabled 时，按钮 `title` 提示「所有任务已完成或失败，点击「N 失败 · 重置」徽章可重置后重试」引导用户发现新入口。新增 IPC `vetta:batch-tasks:batch-reset-failed` 与 preload `batchResetFailed(projectId, taskIds)`。

- **侧边栏显示后台 streaming session 的运行指示**：runtime-host 维护 `runningSessionPaths` 集合，在 `attachInFlightBuffer` 里随 `agent_start`/`agent_end` 同步增删并通过 `onRunningChanged` 回调向上广播；desktop-app main 进程新增 `vetta:session:list-running` 与 `vetta:session:running-changed` 两个 IPC 通道（前者用于挂载时拉 snapshot，后者用于增量推送），preload 暴露 `session.listRunning` / `session.onRunningChanged`。renderer 新增 `runningSessionPathsAtom`，在 `Sidebar` 挂载时一次性拉取并订阅事件维护；`ProjectGroup` 中正在运行的 sessionItem 左侧 20px 槽位放 `mdi--loading` 旋转 spin（覆盖 `[定时]` 时钟图标），项目 row 的 folder/chevron 图标右上角叠加一个 primary 色微小 ping 脉动点表示「此项目内含运行中会话」；`DefaultSessionList`（底部默认对话）里的会话同样加 spin，标题行不加。批量项目复用同一通路（其 task session 也通过 `runtime.prompt` 触发 lifecycle 事件）。

- **批量任务已完成子任务支持「重新运行」**：批量任务页（`BatchTaskList`）与项目详情页（`BatchQueueStatus`）的子任务在 `status === "completed"` 时，hover 操作中新增「重新运行」按钮，复用既有 `retryTask` IPC 走 `cleanTaskFilesAndState`（删 session + 删 task-state + `resetTaskFiles` 清产物目录），随后重新入队。按钮视觉沿用 `mdi--restart` 图标但去掉 danger 红色（completed 是正常态，danger 色会误导为失败），破坏性语义通过二次确认弹窗兜底——标题「确认重新运行任务「xxx」」、描述「将删除该任务现有的会话和产物，并重新执行」、确认按钮「重新运行」。failed 重试沿用原"重试"文案与 danger 视觉不变。

- **批量重试失败下拉新增「仅清除失败状态」**：在原有「重试失败」/「清除失败状态并重试」基础上加入第三项，把所有失败任务的会话、task-state 与工作目录并行清理并广播 `task.reset` 事件把 UI 重置为未执行，但**不**触发重新运行——适合先批量清空再人工筛选哪些任务真要重跑的场景。新增 IPC `vetta:batch-tasks:batch-clear-failed` 与 preload `batchClearFailed`，复用既有的 `cleanTaskFilesAndState` + `task.reset` 通路。

- **批量重试失败按钮支持下拉两种模式**：批量任务列表项目头部的「批量重试失败」按钮改为下拉，提供两种重试策略：(1)「重试失败」沿用原行为——把每个失败任务的清理（删 session、删 task-state、清工作目录）放在 `pLimit(concurrency)` 内由 worker 拿到任务后再做，所以排队中的失败任务在轮到前 UI 上仍显示"失败"；(2)「清除失败状态并重试」先 `Promise.all` 并行清理所有失败任务的状态/会话/文件并向 renderer 广播新增的 `task.reset` 事件（renderer 收到后立即把 status 重置为 `pending`、清空 sessionId/sessionPath/error），再交给 `pLimit` 按并发数排队执行，UI 上能立刻看到所有失败标记消失。新增 IPC `vetta:batch-tasks:batch-clear-failed-and-retry` 与 preload `batchClearFailedAndRetry`，并在 `BatchTaskEvent` 联合类型里加入 `task.reset` 分支供 hook reducer 处理。

- **批量任务接入 Webhook 消息推送**：新建 / 编辑批量项目 Dialog 新增「启用消息推送」开关（默认关）。开启后，每个子任务终态（成功 / 失败 / 超时 / 产物缺失）会向所有已启用的 Webhook 推送一条富文本卡片，含本次子任务名 + 结果 + 耗时 + 模型、总进度条与状态分布表、正在运行任务列表、等待队列长度；当 pending + running + paused 全部为 0 且至少有一次完成时额外推送一条「项目汇总」消息（成功/失败合计、总耗时、平均耗时、并发度、失败列表前 10 条）。用户主动暂停不推送。推送走 main 进程 `getWebhookManager().broadcast()` 直接调用，best-effort（失败仅 console.warn，不阻塞任务终态）；消息模板支持飞书 lark_md 卡片与钉钉 markdown，header 颜色按 success / warn / error 自动切换。`notifyEnabled` 字段持久化到 `.vetta/meta.json`，IPC / preload / atoms 全链路透传。

- **Webhook 消息推送基础设施**：设置页新增「消息推送」Tab，支持多条飞书 / 钉钉自定义机器人 endpoint 并行配置（每条独立启用、独立测试），URL 与签名 Secret 持久化到 `~/.vetta/desktop-app/webhook-credentials.json`（chmod 0600），非敏感字段（名称、@配置、钉钉关键词）写到 `webhook-config.json`。`WebhookProvider` 接口 + `WEBHOOK_PROVIDERS` 注册表使后续接入企业微信 / Slack / Discord 只需新增 provider 文件 + 注册一行；UI / IPC / 存储 / Manager 一律基于 kind 动态展开。飞书走 `msg_type:"interactive"` 卡片 + `lark_md` 元素（HMAC 签名 key=`timestamp\nsecret`、data=空 → body 内 timestamp/sign），钉钉走 `msgtype:"markdown"`（HMAC 签名 key=secret、data=`timestamp\nsecret` → URL append timestamp/sign），统一映射通用 `WebhookMessage { title, text, level }`；钉钉关键词模式会自动拼到 title 前满足安全校验。主进程任意模块通过 `getWebhookManager().broadcast(message, { onlyKinds?, onlyIds? })` 直接推送，不走 IPC；CRUD / toggle / test 走 `vetta:webhook:*` 通道。30s 超时、不重试。后续业务接入点（批量任务完成 / 定时任务失败 / 更新通知等）按需挂在 main 进程对应位置。

### Changed

- **主进程日志滚动策略增强**：保留 Electron 默认日志目录与当前文件 `main.log`，但归档文件从 `.old.log` 改为带中国时区时间戳与原因的文件名（如 `main.2026-05-25T143012+0800.size.log` / `.date.log`）。日志同时支持 5MB 大小滚动与按 Asia/Shanghai 日期跨日滚动，日志行时间戳也改为中国时区，并自动清理只保留最近 10 个归档文件。

- **项目详情页失败任务「重试」改为先清理再重跑**：`BatchQueueStatus` 中失败子任务的「重试」按钮原先调用 `runTask`（直接重新入队，旧 session / 产物原样保留），与批量任务页 `BatchTaskList` 调用 `retryTask`（先清 session + 清产物再重跑）的行为不一致——同一个标着"重试"的按钮在两处语义不同。现统一改为 `retryTask`，并补上和批量任务页一致的二次确认弹窗（标题「确认重试任务「xxx」」、danger 变体）。

- **批量任务页面 UI 紧凑化**：顶部 4 张 StatCard 卡片网格收敛为「新建项目」按钮左侧的内联紧凑 stat strip（总数 / 运行中 / 已完成 / 失败，pill 内分隔线），移除卡片背景与 hover 动画；项目 list 去掉外层卡片框（border + bg-card + 顶部 accent + 内部分隔线全部移除），只保留 header 行 + 进度条 + 任务网格的扁平结构；子任务网格固定 3 列（`sm:grid-cols-2 lg:grid-cols-3`），折叠阈值从 6 提升到 9（3×3 对齐 UI 网格）。子任务 item 去掉边框/ring，背景改 `bg-muted/40` 与主背景区分，padding 收紧到 `px-2.5 py-2`，字号下调（标题 12px / 状态 pill 9px / 时间 10px），不再展示 sourcePath，默认仅显示项目名 + 时间 + 状态 pill；hover 时整张卡片浮一层 `bg-background/70 backdrop-blur` 蒙层，操作按钮（跳转会话 / 执行 / 重试 / 取消等待 / 删除）以圆形 `OverlayActionButton` 居中排列在蒙层正中。失败错误从单独错误条改为时间右侧的内联红色省略式提示（hover 看完整 tooltip）。新增 `sortProjects` / `sortTasks` 两个本地排序函数：项目级与子任务级一律「运行中靠前，其次 createdAt latest」，让正在跑的批次和最近新建的子任务自动浮顶。

- **批量子任务完成消息标题带上项目名**：原标题 `✅ 子任务已完成` / `❌ 子任务失败` 在多项目并行时无法分辨是哪个项目，改为 `[${project.name}] ✅ 子任务已完成`；body 末尾的 `📁 项目：****` 同步去掉 mask 改为真实项目名（标题既已暴露，body 再 mask 已无意义）。子任务名仍以 `****` 脱敏，错误信息与模型 Key 保持原文不变。

- **批量项目汇总消息的失败列表任务名也脱敏**：`buildProjectSummaryMessage` 在 `failed.length > 0` 时输出的 `**失败列表**：- \`${t.name}\`：…` 与子任务消息脱敏规则不一致，按相同规则改为 `- \`****\`：…`，仅保留错误信息原文。汇总标题 / body 项目名维持原样（与子任务消息一致地显示 `project.name`）。

- **对话消息中 bash 工具调用展开 UI 改造为终端卡片**：原先 bash/shell 工具的展开内容只是一个灰底 `<pre>` 命令块加另一个 `<pre>` 输出块。重做为带边框的终端卡片：标题栏（状态点 + 中文文案「执行命令 / 正在执行 / 命令失败：{首行≤40 字符}」+ hover 出现的复制命令按钮）、命令行区（amber 色 `$` 提示符 + 完整命令，`max-h-[180px]` 独立滚动，pending 时末尾 1s 闪烁方块光标）、输出区（`max-h-[300px]` 独立滚动）、底部脚注（pending 时显示「正在执行···」+ 旋转 loader，结束后显示原 meta 行）。配色全用 `bg-muted/*`、`text-foreground/*` 等主题 token，深浅色主题自适应。新增 `bash-cursor-blink` keyframe。同时按工具拆分 `ToolCallBlock.tsx`（原 ~700 行）：新建 `blocks/tool-views/` 目录，bash/edit/read-image/write 各一个 view 文件，公共 utils（format/parse-tool/parse-diff/use-elapsed/StatusIndicator/CopyIconButton/TextPreview）归到 `tool-views/shared/`，容器只负责 header + expand + 按 toolName dispatch（~180 行）。外部 `ToolCallBlockView` 导出保持不变。

### Fixed

- **packaged AppImage 里 photon-node 找不到，图片以原图喂模型导致主进程内存膨胀**：`@silvia-odwyer/photon-node` 在 `vite.main.config.ts` 里被 external，运行时由 `photon.ts` 通过 `createRequire(import.meta.url)("@silvia-odwyer/photon-node")` 加载；但打包 staging 的 `package.json` 原先没有声明该 production dependency，electron-builder 没把手动复制进 staging 的 `node_modules/@silvia-odwyer/photon-node` 收进最终 `app.asar` / `app.asar.unpacked`，packaged 后 createRequire 仍会 resolve 失败，photon.ts 走 catch 降级 → image-resize 失效 → 历史里的 base64 图片以**原始分辨率**重复拼进每一轮 LLM request body，长会话主进程 RSS 直线上涨，最终触发 OOM。`prepare-pack.js` 现在从 external 包自身的 `package.json` 读取版本并写入 staged app 的 `dependencies`，再复制包目录，配合 `asarUnpack` 让 `photon_rs_bg.wasm` 落在 `app.asar.unpacked/`，恢复图片缩放路径。photon-node 是纯 WASM、无平台二进制差异，跨平台打包安全。

- **主进程长跑后被 Linux OOM Killer 静默 SIGKILL**：主进程从未给 V8 设过老生代上限，长跑批量任务 + 图片预算未生效（photon WASM 在 packaged 路径 load 失败导致原图喂模型）后 RSS 自然膨胀，最终被 kernel SIGKILL，进程静默消失、连一行日志都来不及写。`main.ts` 在 app 启动前 `appendSwitch("js-flags", "--max-old-space-size=4096")`，超限时改由 V8 抛 `RangeError: JS heap out of memory`，可被 `uncaughtException` handler 接到并落盘栈；CLI 模式跑短任务沿用默认。`__filename is not defined` 那条错误文本来源待进一步定位，先前把 `dbus-next` / `bindings` 加进 vite external 的尝试因 bun 的 napi-rs 平台二进制 / native addon 在 cross-platform 打包链路下不齐而导致 packaged 启动 ERR_MODULE_NOT_FOUND，已回滚到只 external `@silvia-odwyer/photon-node`。

- **桌面端主进程日志改为 electron-log 滚动文件日志**：新增统一 `main/logger.ts` 封装 `electron-log/main` 配置，`main.log` 由 file transport 管理并按 5MB 自动滚动为 `.old.log`；主进程 `console.*` 统一 patch 到 scoped file logger，避免继续手写 `appendFileSync` 与临时目录 fallback。应用生命周期、窗口事件与 renderer console 捕获分别落到 `main` / `window` / `renderer` scope，`process.on("warning")` 现在也会进入日志文件，便于排查 `MaxListenersExceededWarning` 等 Node warning。仅在 `VETTA_DESKTOP_DEV_URL` 开发模式启用 console transport，打包与 PDF/OCR CLI 模式禁用 console transport，避免 stdout/stderr 被诊断日志污染。

- **历史会话里残留的"无名工具"块不再显示**：`chat-service.ts` 的 `messageToBlocks` 加载历史时，判断条件是 `typeof part.name === "string"`，空串也通过，于是 `@vetta/ai` `openai-completions` provider 旧版解析缺陷写进 session 文件的 `{id:"", name:"", arguments:{}}` 幽灵 toolCall 都会被还原成一个空名 tool_call block，UI 上呈现一排没有标签、点开也没内容的"无名工具"。判断改为 `name !== ""`，跳过这些块。注意：写入侧的根因已在 `@vetta/ai` 这次发版里修好，此项是对历史脏数据的渲染层兜底。

- **发消息无反应（核心 bug 修复）**：prod DMG 装好、用户登录 OK、能看到 remote 模型，但点发送后聊天里没任何反应——既没气泡、没 spinner、也没报错。三个独立缺陷叠加导致：(1) renderer `useSessionManager.sendMessage` 里 `await window.vetta.session.prompt(...)` 没有 try/catch，IPC reject 直接成 unhandled promise rejection；(2) `RuntimeHost.prompt` 把 `session.prompt` 的同步抛错（"No model selected" / "No API key found" / "Agent is already processing"）原样向上抛，而这些抛错发生在 `agent.start()` 之前，根本不会经由 session 事件流转成 `error` 事件，subscribe 链路完全捕获不到；(3) coding-agent SDK 的 `createAgentSession` 退回到内置硬编码的 `http://REDACTED-HOST:8080/api/v1` LAN 默认值并把它静默写入 `~/.vetta/agent/settings.json`，于是 prod 构建里 desktop-app 自己（env 注入的 `VETTA_SERVER_URL`，prod = `REDACTED-HOST:8080`）和 SDK（写死 LAN）指向两个不同 server——renderer 拉到的 remote 模型来自 prod，但 ModelRegistry / LLM streaming 用的是 LAN，prod 用户网络下 `loadRemoteModels` 静默超时 → `findInitialModel` 返回 undefined → `session.prompt` 第一行抛 "No model selected" → 沿 (1)(2) 路径吞掉。修复：runtime-core 新增 `RuntimeHostOptions.serverUrl` 与外部订阅者表，`prompt` 路径 try/catch 后合成 `error` 事件广播给所有订阅者再 rethrow（scheduler / batch-tasks 等已有 try/catch 的调用方仍能拿到 reject 做重试）；desktop-app `runtime.ts` 把编译期注入的 `DEFAULT_SERVER_URL` 显式喂给 `RuntimeHost`；coding-agent SDK 新增 `CreateAgentSessionOptions.serverUrl` 选项，调用方传入时既不读 settings 也不写 settings，彻底切断对 settings.json `serverUrl` 字段的静默污染路径；renderer `sendMessage` 保留 try/catch 作为 IPC 自身出错的兜底，在 chat 里 `appendError` + `setIsStreaming(false)`，杜绝任何 prompt 路径上的失败导致死寂体验。

- **批量项目处于 paused 态时，"清空队列状态/执行全部/重试失败/重新开始"被静默 skip**：`pausedAt` 是项目级标志，但只有 `BATCH_RESUME` 一条路径清；其他"批量执行/批量重置"类 IPC handler（`BATCH_RUN_NEVER_EXECUTED` / `BATCH_RETRY_FAILED` / `BATCH_CLEAR_FAILED_AND_RETRY` / `BATCH_CLEAR_UNFINISHED` / `BATCH_RESTART_ALL`）都没碰它。结果用户在 BatchTaskList（非详情页）点"清空队列状态"清掉任务级状态后，项目仍卡在 paused 态，再点"批量运行" → 220 次 `enqueueRunTask` 全被 paused gate skip，UI 看不出任何反应。新增 `clearProjectPausedFlag(projectId)` helper（`setProjectPaused(undefined)` + `resumeProjectScheduling` + emit `project.resumed`），在上述五个 handler 开头统一调用——这些操作的语义本身就覆盖了"项目暂停"意图（用户主动要求重置或跑任务）。`BATCH_CLEAR_FAILED`（仅清失败状态、不入队）和 `BATCH_PAUSE` 本身不调用，保持暂停意图。

- **批量项目暂停时其他批量操作按钮没禁用，点了 UI 没反应**：项目处于 `pausedAt` 状态时，`enqueueJob` 会被 paused gate 拒绝，但 `BatchQueueStatus` 的「执行全部 / 重试失败 / 全部重新开始」按钮没跟着 disable，用户点了之后所有任务被 `enqueueJob` 静默 skip，UI 看不出来。改为这三个按钮在 `isQueuePaused` 时一律置灰；banner 文案改为「请先点『恢复队列』才能执行、重试或重新开始任务」，把行动路径写清楚。

- **批量项目「暂停」无法真正停下整个队列**：原 `BATCH_PAUSE` 只对 `task.status === "running"` 调 `pauseTask`，没有同步阻断调度器。当前任务被 abort 后，`startJob` 的 `finally { drainQueue() }` 立刻从内存 `pendingByProject` 队列里拉出下一个 pending 任务替补，导致用户点了"暂停"队列仍在继续推进。修复方案：(1) `BatchProjectMeta` 增加 `pausedAt` 字段并通过新 `setProjectPaused()` 持久化到 `.vetta/meta.json`，重启后 `registerBatchTasksIpc` 读回 meta 重建内存级 `pausedProjects` 集合保持暂停态；(2) executor 新增 `pauseProjectScheduling(projectId)` / `resumeProjectScheduling(projectId)` 维护内存集合，`enqueueJob` 与 `drainQueue` 入口都加 paused gate 拒绝调度，从根本上切断 worker 完成后的替补链路；(3) 暂停时被赶出内存队列的 pending 任务也持久化为 `status === "paused"`，与"从未执行过的 pending"区分，恢复时凭 `status === "paused"` 一次性 `enqueueResumeTask` / `enqueueRunTask`，避免把用户根本没启动过的任务带跑；(4) 新增 `project.paused` / `project.resumed` 事件，`useBatchTasks` hook 收到后更新 `BatchProject.pausedAt`，`BatchQueueStatus` 在暂停态显示「队列已暂停」横幅，并把"暂停全部"/"继续"按钮文案切换为"暂停队列"/"恢复队列"。

- **Linux AppImage 启动找不到 `dbus-next` / `x11`**：`dbus-next` 现在随主进程 bundle 内联打包，避免 AppImage 运行时查找外置 `node_modules`；同时用本地 `x11` shim 保留 `dbus-next` 的旧式 DBus 地址发现 fallback 边界，避免打包器提前解析其惰性 `require("x11")`。

- **Linux 批量项目多目录选择报错**：批量项目选择多个文件夹时，Linux Electron/Chromium portal 后端会把 `openDirectory + multiSelections` 错误收尾为单选目录选择，触发 `Got >1 file URI from a single-file chooser` 并丢弃结果。现在 Linux 下改为主进程直接调用 `org.freedesktop.portal.FileChooser.OpenFile`，同时传 `directory=true` 与 `multiple=true`，保留系统原生文件选择器体验；portal 不可用或失败时再回退到 Electron dialog。

- **Linux AppImage / unpacked 应用名统一为 Vetta**：packaged 主进程现在会把 console、未捕获异常、renderer/child process 退出、窗口加载失败、preload 错误等关键事件写入 Electron `logs/main.log`，启动时同步输出日志路径；同时修正打包 staging 的包名并显式设置 `executableName: "Vetta"`，避免 Linux unpacked 产物生成 scoped package 派生名称并触发 `xdg-settings: invalid application name`。

- **技能广场场景安装 / 卸载报 EACCES**：历史版本把临时 tar 包写到 `~/.vetta/scene/` 内，少数环境下该目录的 owner 写位被破坏（变成 `dr-xr-xr-x`）后，后续 install-from-market 写 `_tmp_*.tar.gz` 与 uninstall rmdir 子目录都会报 `EACCES: permission denied`。修复两点：(1) 临时 tar 改写到独立的 `~/.vetta/tmp/_install_*.tar.gz`，不再污染 baseDir；(2) install 与 uninstall 在动 baseDir / skillDir 之前先 `ensureDirWritable` 自愈，只补 owner 写位（`u+w`）不放宽其他权限位，自愈失败时让真正的写操作抛出更具体的错误。

- **Ubuntu 打包后显示 Electron 默认图标**：Linux electron-builder 配置现在显式使用 `build/icon.png` 作为应用图标，并把 `build/icon*` 作为 `extraResources` 打入安装包；主进程在 packaged 模式下从 `process.resourcesPath/build` 解析窗口 / 托盘图标，避免继续访问被排除在 `app.asar` 外的 `app.asar/build/icon.png`。

- **批量任务 Webhook 推送的状态分布表在飞书不渲染**：飞书 `lark_md` 与钉钉 markdown 都不识别 GFM 表格语法，子任务终态与项目汇总两条消息里 `| 状态 | 数量 |` 三行被原样输出。改成 `- 标签：**N**` 列表展示，两端渲染一致。

- **无感更新装完后启动仍弹"立即重启"对话框**：mac/linux 的 detached swap.sh 是异步执行的，安装成功后 `pending-install.json` 未必被及时清理；新版本启动时 `onAppReady` 仍读到该记录、又进入 ready 状态、再弹 Dialog。改为用版本号比较作为权威信号：若 `currentVersion ≥ pending.version` 说明已升级成功，直接清掉 `pending-install.json` 与 staging 目录；否则才恢复 ready 状态展示对话框。

### Added

- **无感更新（in-place auto-update）**：发现新版本后侧边栏左上角出现下载图标，点击触发后台静默下载（不打开浏览器、不打开 Finder），下载完成后弹出"立即重启 / 稍后"对话框；点稍后则保留下载产物，下次启动会再次提示。三平台均支持：mac 解压 `.zip` 内的 `.app`、清 quarantine 后通过 detached shell 覆盖 `/Applications/Vetta.app` 并 relaunch；win 走 NSIS `/S` 静默安装 + `--force-run` 自启动；linux 覆盖 `$APPIMAGE` 指向的文件后 relaunch。启动时自动 `GET /releases/latest?platform=&arch=` 检查一次，命中新版本（按三段式版本号比较）即激活 sidebar icon。下载产物写到 `app.getPath("userData")/updates/<version>/`，pending-install.json 记录"待重启"状态，文件丢失时自动重置。客户端按 platform/arch + 平台首选扩展名（mac `.zip` / win `.exe` / linux `.AppImage`）从 `assets[]` 里挑资产；未匹配平台或后端未上传对应资产时返回友好错误。配套发版资产规范见 `docs/release-guide.md`。

- **侧边栏会话默认折叠**：项目展开后默认只显示前 5 个 session，超过则底部出现「展开更多（N）」按钮；点击展开全部后按钮变为「折叠会话」，再次点击恢复 5 个。避免项目下 session 过多时一次性渲染导致的卡顿。

### Fixed

- **侧边栏无法拖拽收缩**：两层原因叠加导致 `ResizeHandle` 完全失效——(1) `ResizeHandle` 用 `translate-x-1/2` 让 5px 命中区域骑在 `<aside>` 右边缘，但 `<aside>` 与外层 `motion.div` 都是 `overflow-hidden`，外侧那 2.5px 被裁切；(2) 更关键的是 `styles.css` 中 `.sidebar-surface > *` 对 sidebar 所有直接子元素强制 `position: relative; z-index: 1`，把 ResizeHandle 的 `absolute z-30` 直接覆盖回 relative，导致它沦为 flex 流末尾的普通块、`right-0` 完全失去意义、根本拦不到拖拽。修复：把这条规则改为 `:not(.absolute)`（保留对玻璃质感 `::before` 的层级压制能力，但放过绝对定位子元素），同时把 `ResizeHandle` 改为完全位于父容器内部、宽度 6px，hover/active 高亮提升至 `primary/40`、`primary/60`。侧边栏宽度持久化到 `localStorage[vetta-sidebar-width]`，仅在拖拽结束时落盘。

- **导入项目后打开会话报 EPERM**：批量项目的 `.vetta/task-states.json:sessionPath` 与 session JSONL 首行的 `cwd` / 历史 tool_call 内嵌的文件路径都是绝对路径；跨机器或跨 workspace 导入时这些路径仍指向原项目根，导致 `SessionManager.open` 在 mkdir 旧 sessions 目录时报 `EPERM: operation not permitted`。修复：导入解压完成后，对 `.vetta/task-states.json` 与 `.vetta/sessions/*.jsonl` 做 path-rewrite——递归扫描 JSON / JSONL 中的字符串值，把以 manifest.originalPath 开头的绝对路径前缀替换成新项目根，并按目标平台规则化分隔符（macOS `/` ↔ Windows `\`）。重写策略保守：只匹配"完整等于"或"以原根 + 分隔符开头"的字符串，不影响指向原机器其它资源的外部绝对路径。

### Added

- **项目导入 / 导出**：项目详情页右上角新增「导出」按钮，点击二次确认后通过原生保存对话框输出 `<项目名>.vetta.zip`，包内含 `_vetta-export.json` manifest（format/version/type/name/originalPath/exportedAt）+ 项目目录全量内容（.vetta/sessions、batch 任务工作目录与 task-states.json 等），自动剔除 `*.lock` 文件锁与符号链接。侧边栏「新建项目」下拉菜单新增「导入项目」入口，原生打开对话框只接受 `.zip`，命中非本应用导出的 zip / 损坏的 zip / 缺失 manifest 时统一报「不支持的项目」。导入路径走 `desktop-config.json` 单一注册路径并解决重名（自动追加 `-2`/`-3`），导入完成后联动刷新普通与批量两个 atom 列表，提供「查看项目」直跳。仅支持 `normal` 与 `batch` 两种类型，flowing/schedule 类型在导出端自检拒绝、导入端 manifest 校验拒绝。Batch 项目导入后会扫描 `meta.json:items[].sourcePath`，对本机不存在的源路径以模态形式列出，便于用户后续重链或删除（不修改 meta，保留原路径以支持回链）。导入解压前对每条 zip 条目做 path-traversal 校验（zip slip 防护），失败时回滚已解压目录。

### Changed

- **批量项目改由 `desktop-config.json:projects` 单一注册**：批量项目以前完全靠扫描 `workspacePath` 子目录的 `.vetta/meta.json` 自动发现，导致用户切换 `workspacePath` 后已有批量项目从侧边栏消失。重构后批量项目与普通项目共用同一注册入口（绝对路径写入 `projects` 数组），workspace 仅作为迁移源——`discoverBatchProjects` 启动时仍会扫描 workspace，把未注册的 `type:"batch"` 目录幂等回填进 config，老安装无感升级。`createProject` 写盘后追加注册，`deleteProject` 删盘前先反注册（双向最终一致）。`useBatchTasks` 在 create/delete 后联动刷新 `useProjects` 的项目原子，避免新建/删除批量项目后侧边栏其它分组数据陈旧。`ProjectsPanel` 同步过滤掉 `type:"batch"` 的普通项目条目，保证批量分组与普通分组不重复渲染。

### Fixed

- 修复 desktop-app 开发模式不会写入可直接执行的 `vettaAppPath` 的问题；开发启动时会自动生成本地 CLI shim，并让 `vettaAppPath` 与生产模式一样指向单一可执行入口。
- 修复同一 desktop-app 进程内重复打开同一 session 时抛 `SessionLockError` 的问题。`RuntimeHost.createSession` 现在按 sessionPath 去重，已开的 session 直接复用 handle，不再二次申请文件锁；`renameSession` / `renameSessionById` / `deleteSession` 不再泄漏 SessionManager 与孤儿 `.lock` 文件；`WebContents` 销毁时会通过新增的 `disposeAllSessions()` 释放本进程持有的全部 session 文件锁。新增 `vetta:session:dispose` IPC 通道与 `window.vetta.session.dispose(sessionId)`，供 renderer 在关闭/切换 session 时主动归还锁。

### Added

- **HTML 转 PDF 命令行入口**：desktop-app 新增 `--html-to-pdf` / `pdf html-to-pdf` CLI 模式，使用内置 Electron Chromium 将 HTML 文件渲染为 PDF，并支持 `-h` / `--help`、`--output`、`--page-size` 与页边距参数，以及 JSON stdout 协议；packaged 启动时会向 `desktop-config.json` 写入 `vettaAppPath`，供独立进程发现桌面端可执行文件。
- **对话回答外层折叠**：桌面对话页现在会记录每轮 assistant 回答的起止时间，并在回答完成后自动折叠中间过程，只保留最后一次工具调用 / 思考后的结论文本；折叠提示支持“正在处理 Ns”的流式状态和“展开 / 收起 N 条内容”的完成态。

- **可配置的 Electron 打包入口**：desktop-app 新增统一的 `dist:desktop` 打包脚本，并补充 `dist:linux` / `dist:win` / `pack:linux` / `pack:win` 入口；支持通过命令行参数 `--platform`、`--arch`、`--target` 动态指定目标平台、架构与安装包格式，并为 Linux 提供 `dist:linux:appimage` / `dist:linux:deb` / `dist:linux:rpm` / `dist:linux:tar.gz`，为 Windows 提供 `dist:win:nsis` / `dist:win:portable` / `dist:win:zip` 快捷命令。Linux 打包前会校验 `packages/runtime-core/sandbox/linux/<arch>/bwrap` 是否齐备，避免产出缺少对应沙盒二进制的安装包。
- **Windows 前置依赖构建**：desktop-app 新增 `prepare:windows`，在 Windows 主机上会先执行仓库根目录的 [`scripts/build.ps1`](C:/yiyun/vetta-mono/scripts/build.ps1) `desktop` 目标，再启动 `dev` / `start` 或进入打包链；非 Windows 主机自动跳过，避免 Electron 开发和打包时缺少上游依赖产物。
- **Windows 沙盒资源打包与显式路径解析**：desktop-app 打包阶段现在会将 `packages/runtime-core/sandbox/bin` 整体复制到安装包 `Resources/sandbox/windows/`，并由主进程新的 Windows sandbox resolver 从 `process.resourcesPath/sandbox/windows/codex-windows-sandbox-host.exe` 解析 host 路径后显式注入 `RuntimeHost`。这样安装包与开发环境统一走 Electron `extraResources` 模型，不再依赖源码目录猜测路径。
- **Linux 沙盒内置 `bubblewrap` + 启动期能力探测**：desktop-app 主进程在应用启动阶段执行 Linux sandbox probe，区分 `binary_not_found` / `binary_not_executable` / `userns_unavailable` 等失败原因，并通过 `config.get()` 向 renderer 暴露 `linuxSandbox` 运行时状态；`session` IPC、scheduler 和 batch tasks 在请求 `sandbox` 模式前统一校验该状态，避免静默降级为 `full-access`。`prepare-pack.js` 同时预留了将 `packages/runtime-core/sandbox/linux/<arch>/bwrap` 打入安装包 `Resources/sandbox/linux/<arch>/bwrap` 的资源路径。
- **微信（iLink）渠道卡片 + 扫码绑定对话框**：`Settings → IM 集成` 新增「微信」渠道卡片，与飞书并列。点击「扫码绑定」打开对话框，对话框内通过 NDJSON 长轮询从 sidecar 实时接收 `wechat_qr` / `wechat_bind_status` / `wechat_bound` 事件，渲染 QR 图（`qrcode` 包，新增依赖），按状态机展示 idle → starting → waiting → scanned → confirmed → 自动关闭，过期自动刷新。
  - 「活动」徽章：标识当前激活的 transport（飞书 / 微信，互斥）。点击非活动卡片的「激活」按钮可在不重新填写凭据的前提下切换到该 transport。
  - 「管理 / 解绑」：已绑定后对话框显示 `ilink_bot_id` / `ilink_user_id` 与 24h/10 条配额提醒，并提供解绑按钮。解绑触发 `wechat_logout` 帧，sidecar 清空 `~/.vetta/desktop-app/im-wechat.json` 后回到 awaiting_bind 状态。
  - 总开关在微信模式下无需任何长效凭据：选中微信、未绑定时点击「启用」会自动弹出绑定对话框；已绑定后启用即拉起 wechat transport 长轮询。
- **IM 集成设置页**（`Settings → IM 集成`）：支持启用 / 停用 IM 桥接、填写飞书 App ID / App Secret / Verification Token / Encrypt Key、查看连接状态、测试连接、重启桥接、查看实时日志（最近 500 条），跨 macOS / Windows / Linux 三端可用。
- **嵌入式 im-gateway 桥接子进程**：desktop-app 主进程通过 `child_process.spawn` 启动 `im-gateway host` 子进程，stdio NDJSON 协议双向通信。完整生命周期由父进程管理：app 完全退出 → 桥接进程在 5s 内被发送 shutdown 帧 → 退出。
  - 健康检查：spawn 后 10s 内未收到 `ready` 事件视为启动失败。
  - 自动重启：异常退出 / 启动失败按指数退避（5s / 15s / 60s）重试，连续 5 次失败后停止并切换到 `error` 状态等待用户手动重启。
  - 跨平台终止策略：POSIX 走 SIGTERM → SIGKILL，Windows 走 `child.kill()` + stdin EOF。
- **凭据安全存储**：飞书 App Secret / Verification Token / Encrypt Key 通过 Electron `safeStorage` 加密后写入 `~/.vetta/desktop-app/im-credentials.enc`（chmod 0600）。
  - macOS Keychain / Windows DPAPI / Linux libsecret 自动选择。
  - Linux 无密钥服务时降级为强制 0600 明文存储，UI 显式弹窗告知。
  - im-gateway 子进程不直接访问任何凭据文件，全部由父进程注入。
- **跨平台二进制打包**：`prepare-pack.js` 在 electron-builder 之前调用 `make -C packages/im-gateway cross-build`，产出 5 个目标 arch 的 `im-gateway-<os>-<arch>[.exe]` 二进制，通过 `extraResources` 进入 `.app` / `.exe` / `.AppImage` 内 `Resources/im-gateway/`。运行时由 `binary-resolver` 按 `process.platform` + `process.arch` 解析。
- **旧版数据迁移**：检测 `~/.vetta/im-gateway/{config,credentials}.yaml` 与 `state.json`，弹出导入向导，导入成功后将旧文件重命名为 `.<timestamp>.bak`，避免重复提示。
- **IM IPC**：`vetta:im:get-config` / `set-config` / `get-status` / `subscribe-status` / `test-connection` / `restart` / `get-recent-logs` / `get-paths` / `detect-legacy` / `import-legacy` 端点，全部通过 preload 暴露为 `window.vetta.im.*`。
- **`SettingsTab` 类型扩展**：新增 `"im"` 标签项与对应导航条目。
- **`before-quit` 钩子**：确保完全退出 desktop-app 时 IM 桥接 sidecar 已被回收，无残留进程。

### Notes

- macOS 公证暂未启用：本期为内测版，分发的 `.app` 未通过 `notarytool` 公证。首次启动时 macOS Gatekeeper 会拦截，用户需手动在「系统设置 → 隐私与安全性」中放行（详见 [`docs/macos-bypass-guide.md`](docs/macos-bypass-guide.md)）。CI 配置与 entitlements 已为后续切换公证预留。
- 不接入 Sparkle / 任何自更新机制：未公证 .app 走自更新会触发更严格的 Gatekeeper 检查；当前的 `updater.ts` 是手动「检查 + 下载」模式，不会触发 Gatekeeper 重新校验。
