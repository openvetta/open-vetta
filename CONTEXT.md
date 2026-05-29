# Context

This is a living glossary. Each term is a deliberately-chosen canonical name for a concept in the system. When you find yourself reaching for a vague word ("info", "data", "meta"), check here first.

## Glossary

### ToolTimingEntry

A `SessionEntry` (parallel to `thinking_level_change` / `model_change`, not a `message`) written to a session's jsonl by `agent-session` at `tool_execution_end`. Carries `toolCallId`, `startedAt` (absolute ms), `durationMs`, and `phases` (relative offsets, see `phase`).

ToolTimingEntry exists in a separate channel from `Message` deliberately so that LLM providers — which only consume `message` entries — never see it. This is a hard architectural boundary, not a filter to be maintained.

### phase

A user-defined interval inside a tool's `execute`. Tools call `ctx.phase(label)` to mark "from this moment on, I'm doing `label`"; the next call (or `tool_execution_end`) implicitly ends the previous interval. Persisted as `phases: [{ label, atMs }]` where `atMs` is the offset from `startedAt` in ms. Duration of each interval is computed at read time by diffing consecutive `atMs` (last interval uses `durationMs`).

### conspicuous duration

The user-facing threshold above which a tool call shows a duration badge on the `ToolCallBlock` header. Default 1000 ms. Below the threshold, the badge is hidden but the meta panel still has the data when expanded.

Threshold is a UI display rule, never a write-time filter. Every `tool_execution_end` produces a `ToolTimingEntry` regardless of duration.

### meta panel (of a tool_call block)

The region revealed when a user expands a `tool_call` block. First row is a labelled meta zone showing `startedAt` (absolute time), full-precision `durationMs`, and `phases` as a centred-dot string ("download 2.1s · ocr 12.3s · write 0.8s"). This row is explicitly out-of-band — never sent to the LLM.

### ctx (in a tool's `execute` signature)

The fourth positional argument introduced for timing support: `execute(toolCallId, input, signal, ctx)`. Currently exposes `ctx.phase(label)`. Older tools that don't accept `ctx` continue to work — their timing data is just `[startedAt, durationMs]` with empty `phases`.

### mentionedFile

A user-attached file or directory reference carried alongside a chat prompt. Shape: `{ path: string; name: string; isDirectory: boolean }`. `path` is always an **absolute filesystem path** and is **not constrained to the session's cwd** — it may originate from an `@`-mention inside cwd, an internal File Explorer drag, or an external OS drag-drop. Rendered in `InputBar` as a `Capsule` with a native `title` tooltip exposing the full path. Consumed in `sendPrompt` by being prepended to the user message as `@${path}` lines (one per entry) — the agent then decides whether to read each path via its own tools.

`mentionedFile` is distinct from `attachedImage`: dropping an `image/*` MIME file still routes to `attachedImage` (DataURL multimodal attachment), not to `mentionedFile`. The two channels coexist in `InputBar` capsules but serialize differently at send time.

### 结论 (assistant turn conclusion)

一轮 assistant 回答「已经有结论」的判定：本轮 streaming 已结束，即 `!(isLastAssistant && isStreaming)`。与 [[AssistantFoldTip]] 的 `state: "complete"` 同源，不引入新状态。

定义刻意**不**要求 `foldData.outputBlocks` 非空 —— 纯工具调用收尾（agent 调完工具就 stop、没有 final text）的轮次同样算「有结论」，仍允许用户对该轮内容触发操作（如复制工具输出摘要）。复制按钮在 streaming 期间隐藏，是为了避免用户复制到半句话；轮次结束后内容已稳定，即便没有 final text 也已稳定。

历史 assistant 消息天然满足该判定，不需要额外的 per-message "done" 标志。

### MessageActions

挂在每条 chat message（user / assistant）底部的一排 icon-only 操作按钮，hover 出 tooltip。当前只有「复制」一个按钮，设计为可扩展（后续可能加 regenerate / 评分 / 分享 等）。

与 `ActionButtonBar`（全局粘性条，受 `visibleActionButtonsAtom` 驱动，主色实心 pill）是**完全不同的概念** —— 不要混用 "ActionBar" 命名。前者是"消息附属工具"（灰、轻量），后者是"召唤主动操作"（主色、显眼）。

显示策略：
- User message：hover 整行才显示，绝对定位浮在 bubble 下方不占布局。复制源 = `displayText`（`parseUserPrefixes` 之后的 body，剥掉 `/skill:` 和 `@file` 行）。
- Assistant message：本轮[[结论]]已出现后常驻显示。复制源 = `foldData.outputBlocks` 拼接出的结论文本。

按钮不存在的情形（整条 bar 不渲染）：`role === "compaction"`、user 仅图片或完全空、assistant 仅含 error block、assistant 纯工具轮（outputBlocks 为空）。这是"按钮无可复制内容"的自然 fall-out，不是 hasConclusion 判定的例外。

### conversation cwd

`~/.vetta/conversation`，desktop-app 中虚拟注入的「对话」项目的**项目根 cwd**（常量 `DEFAULT_CONVERSATION_CWD`，`packages/desktop-app/src/main/ipc/fs.ts`）。session jsonl 文件集中落在 `<conversation cwd>/.vetta/sessions/`。

**项目根 cwd ≠ session 运行 cwd。** ADR-0007 起，「对话」下新建的每个 session 拿到自己的 [[session 产物子目录]] (`<conversation cwd>/<sessionId>/`) 作为运行 cwd，agent 产物落在那里，避免不同 session 在根目录互相窜味。读 session.cwd 而不是项目 cwd 才能拿到 agent 当时的真实工作目录。fs IPC 沙箱边界仍是项目根整体，不按 session 收紧——隔离的是状态不是权限。

**仅指 desktop 侧。** im-gateway 自 ADR-0005 起改用独立 cwd（见 [[im-gateway cwd]]），不再共用本目录。文档/代码里出现「conversation cwd」时默认指 desktop 这一份。

### session 产物子目录

「对话」项目下每个**新建** session 在 main 进程 eager `mkdir` 出来的独立工作目录：`~/.vetta/conversation/<sessionId>/`。session 的运行 cwd 指向这里，agent 工具默认写入 `./` 时落入本目录，自然按 session 隔离。

命名刻意用不可变 `sessionId` 而非 session title slug——session 可重命名而产物内的相对引用不可控，stability 优先。Finder 不可读由 UI"在 Finder 中打开本 session 产物目录"入口补偿。

ADR-0007 之前创建的老 session 不迁移，cwd 保留为 [[conversation cwd]] 根；其根目录残留产物在「对话」项目详情页 Files 面板与新的 `<sessionId>/` 子目录共存展示。删除 session 时一并递归删除其子目录。

**仅作用于「对话」默认项目。** 用户手动创建的项目（cwd 由用户选）不走 per-session 拆分——共享 cwd 是用户创建该项目时的初衷。

### im-gateway cwd

`~/.vetta/im-gateway/conversation/`，im-gateway 所有 IM 渠道（wechat / feishu / ilink ...）共用的工作目录。session 文件落在 `<im-gateway cwd>/.vetta/sessions/`，agent 生成的产物（html/py/md 等）落在 cwd 根。路由 key 仍是 `(im_user, chatID)`（继承自 ADR-0004），单一 cwd 内靠 sessions 文件名区分不同 IM 会话。

与 [[conversation cwd]] 物理分离：桌面「对话」与 IM 入口的 session / 产物互不可见，desktop sidebar 不再展示 IM session（ADR-0005 推翻了 ADR-0004 的混合展示形态）。

### im-gateway inbox

`~/.vetta/im-gateway/conversation/<YYYY-MM-DD>/`，im-gateway 把 IM 入站的图片/文件**原样字节**落盘到此（按本地日期分目录），文件名形如 `<msgId>-<原文件名或 ext>`。落盘后由 router（`router.go`，不是 bridge）在 prompt 文本头部为每个 `Attachment.URL` prepend 一行 `@<abspath>`，agent 通过 Read 工具自行读取（图片走 `resizeImageBuffer` 自动缩放）。落盘 + `Attachment` 填充是**各 transport 自己的职责**；router 的 `@<abspath>` 拼接是平台无关的，任何 transport 只要填好 `Attachment.URL` 就自动接入。

「原样字节」的获取方式按平台而异：wechat 需先 CDN 下载再 AES-128-ECB 解密（见 ADR-0006）；feishu 走鉴权后的 `Im.MessageResource.Get`（image_key/file_key + Type），SDK 直接回放明文流，**无解密步骤**。

**刻意不走 RPC `images[]`**：避免 im-gateway 重复造缩放轮子，复用 Read 既有图像处理，且把"是否要看图"的决策权留给 agent。与 desktop 的 `attachedImage` 多模态直投是不同路径——两者刻意不统一，IM 端走 [[mentionedFile]] 单轨。

### im_send_attachment

coding-agent 内置工具（`packages/coding-agent/src/core/tools/...`），仅在 `--mode rpc --enable-host-bridge` 启动时注册，对 TUI / CLI / desktop 启动的 agent 不可见。签名：`im_send_attachment({path: string, kind: "image"|"file", caption?: string})`。

实现通过 [[host_request / host_response]] 同步等待宿主（im-gateway）真实发送结果（30s 超时）；成功返回 `messageId`，失败返回结构化 error（如 `quota_exhausted` / `peer_unreachable`）。Agent 拿到真实结果再决定收尾文本怎么说，避免"声称已发送实际没发"。

每次成功调用占用 1 次 wechat per-peer quota，与最终 digest 文本独立计数。

### host_request / host_response

agent ↔ host 之间的反向 RPC 通道，扩自 coding-agent 的 RPC 协议（`packages/coding-agent/docs/rpc.md` 待补）。形状：

- agent → host（stdout event line）：`{"type":"host_request","id":"hr-N","method":"send_attachment","params":{...}}`
- host → agent（stdin command line）：`{"type":"host_response","id":"hr-N","success":bool,"data":{...},"error":""}`

`method` 字段预留扩展（未来可能有 `send_typing` / `query_peer` 等）。`id` 由 agent 侧生成，host 必须原样回填。无应答时 agent 工具侧 30s 超时。

与 RPC 现有的 `command/response` 是镜像方向：现有是 host→agent（驱动），新增是 agent→host（回调）。共用 stdin/stdout，靠 `type` 字段区分。

### drop overlay (of ChatPage)

A full-`ChatPage` overlay rendered while an OS-level drag carrying `Files` (or an internal drag carrying the `application/vetta-path` MIME) is hovering. Provides the visual affordance "release to reference"; on drop, each dragged item becomes a `mentionedFile` (or an `attachedImage` for image MIME). Triggers regardless of whether a session is currently active — items dropped on `NewSessionPage` stay in `mentionedFilesAtom` and are picked up by the next `sendPrompt`. Internal drags from File Explorer are detected via the `application/vetta-path` MIME and bypass `webUtils.getPathForFile`, reading the path directly from the dataTransfer payload.

### memory-mode

coding-agent 的一个**门控开关**（拟 `--memory-mode` 启动参数，默认关）。开启后激活下面整套「记忆 + 滚动」机制：[[MEMORY.md]] 注入、[[memory 工具]]、[[memory flush]]、[[session rollover]] 接管 [[Layer2 压缩]]、[[日期工作史]]。

刻意做成门控而非全局默认：仅 im-gateway 为 [[im-gateway cwd]]（Claw 这一个固定且唯一的项目）spawn coding-agent 时传入；desktop / TUI 永不传，行为完全不变。靠**显式 flag 而非 cwd 探测**——不引入「按目录猜行为」的魔法。与 [[host_request / host_response]] 所依赖的 `--enable-host-bridge` 是两个正交的门控（记忆不必依赖出站 IM 工具，反之亦然）。

记忆的归属是**项目级单一**：Claw 是单 owner 的客户端，不区分 user/project、不考虑多租户，全部 IM 会话共享同一份 [[MEMORY.md]] 与 [[日期工作史]]。

### MEMORY.md

[[im-gateway cwd]] 根下的**单一项目级记忆文件**（策展式 Markdown），是 Claw 跨会话记忆的常驻层。由 coding-agent 的 `resource-loader` 在 session 启动时**作为冻结快照**注入 system prompt——与现有 `AGENTS.md / CLAUDE.md` 注入走同一通道。

「冻结快照」是硬纪律：当前进程内 system prompt 里的 MEMORY.md 内容**不随写入实时变化**，agent 通过 [[memory 工具]] 的返回值看到自己的写入，新内容**下一次进程加载时**才进 system prompt。目的是保住 Anthropic 前缀缓存（每次改写 system prompt 会令缓存失效，吃掉约 75% token 成本节省）。因 im-gateway `closeOnIdle` 每条消息重启进程，「下一次加载」≈ 下一条 IM 消息，故记忆跨消息近实时生效。

借鉴 Hermes 的 `MEMORY.md`，但**合并掉 `USER.md`**——单 owner 下「关于用户」与「关于项目」无意义区分。

### memory 工具

memory-mode 下注册给 agent 的工具，签名 `add / replace / remove` 操作 [[MEMORY.md]] 条目，原子写盘。agent 主动决定何时记。与 [[memory flush]] 互补：flush 是保证写入点，工具是随时写入。

### memory flush

[[session rollover]] 前的**抢救步骤**：注入一条系统消息邀请 agent 把即将被滚动掉的重要信息写进 [[MEMORY.md]]，再执行滚动。借鉴 Hermes `flush_memories()`。是 MEMORY.md 不会长期为空的保证写入点。

### session rollover

memory-mode 下取代 [[Layer2 压缩]] 的会话滚动：上下文逼近压缩阈值时，不在原 jsonl 原地做 LLM 压缩，而是 ① 先 [[memory flush]]；② 复用 compaction 现成逻辑生成「保留近期尾巴（`keepRecentTokens`，默认 ~20k）+ LLM 摘要」；③ 把尾巴+摘要**写进一条新 jsonl**，`SessionHeader.parentSession` 指回旧文件，旧 jsonl 归档不再追加。

承接进新会话起始上下文的 = 近期尾巴 + 摘要 + （resource-loader 注入的）[[MEMORY.md]]。

存在的**理由是 im-gateway 专属**，不同于 Hermes：im-gateway `closeOnIdle` 每条消息 spawn 新进程并**全量解析整条 jsonl**，而原地压缩只追加 entry、不截断文件 → jsonl 无限增长 → 每条消息冷启动解析成本随时间上涨。rollover 给单文件大小封顶。Hermes 是长驻进程不付此成本，故不做 rollover。

[[Layer1 microcompact]]（免费裁旧工具输出）在 memory-mode 下**照常运行**，只有 [[Layer2 压缩]] 被 rollover 取代。`session_search`（跨 jsonl 全文回溯，借 parentSession 链）**延后到二期**，一期只留好指针。

### Layer1 microcompact

coding-agent 现有压缩的第一层：纯函数、零成本，每次 LLM 调用前裁掉旧的工具结果 / bash 输出、删旧 thinking block（留 signature）。memory-mode 下保留。

### Layer2 压缩

coding-agent 现有压缩的第二层：Layer1 后仍超阈值时触发的 LLM 摘要压缩，结果以 `compaction` entry 写回**同一** jsonl。默认阈值贴近上下文 80%（`minFreePercent:20`），是「逼近阈值后每轮都重压缩」卡顿的根因。memory-mode 下被 [[session rollover]] 取代。

### 日期工作史

memory-mode 下的**按需渐进披露记忆层**，与常驻的 [[MEMORY.md]] 互补。物理形态：agent 的**运行 cwd 设为今日日期目录** `<im-gateway cwd>/<YYYY-MM-DD>/`，故 agent 写 `./` 产物自然落今日目录、读 `../<昨天>/` 回溯。与 [[im-gateway inbox]] 的按日分目录天然同构（入站媒体、出站产物、当日 [[JOURNAL.md]] 同处一个日期目录——刻意**按日期而非按 session 物理隔离**）。

「问 agent 昨天干了什么」即由此成立：agent 自助翻昨天的日期目录（读 [[JOURNAL.md]] + 产物文件）。产物被视为记忆的一部分。

借鉴 ADR-0007 desktop 的 per-cwd 隔离思路，但轴是**日期**而非 sessionId（IM 不做 per-session 产物隔离）。

### JOURNAL.md

[[日期工作史]] 每个日期目录下的当日日报，是「昨天干了什么」的渐进披露索引。填充来源：**每个 turn-end coding-agent append 一行精简摘要**（做了什么 / 生成了什么文件）+ [[session rollover]] 时额外写一段提炼。两路保证轻聊日子也有记录、重度日子有提炼。

### 活动回合（live turn）

im-gateway 一个 IM 会话（路由 key `(userID, chatID)`）从**首条消息**起、到 agent 交付**本轮最终答复**（`agent_end`，最终回复「落定」）止的这段区间。判定刻意**不依赖时间间隔**，只看「本轮是否已答复」这一个状态——因为时间间隔无法区分「用户分多条说同一需求 / 中途想纠偏」与「另起新需求」。

「已答复」在两平台统一以 `agent_end` 为界，故飞书流式打字途中、微信 defer 整轮期间都属于活动回合、都可被 [[消息折叠]]。活动回合不设时长上限：用户持续追加就持续延长，这正是「只要没答复就能一直打断补充」的体现。

### 消息折叠（message folding）

活动回合期间所有入站 IM 消息**并入同一回合、最终只产出一组回复**的策略，取代「一条消息=一轮=一组回复」的旧行为。落点分两段：

- **prompt 未发出**（仍在 acquire host session 的冷启动窗口）：新消息**并入首个 prompt**。冷启动延迟本身充当免费合并窗，不额外加防抖定时器。
- **prompt 已发、agent 运行中**：新消息走 coding-agent RPC 现成的 `steer` 命令注入，agent 在下一个工具边界重新规划并纳入，**保留已做的工作**（不 abort 重跑）。飞书在同一条消息气泡内续写，不另起气泡。

活动回合期间的消息**一律 steer**，不再过 slash 命令解析；命令只在 `IDLE`（无活动回合）时生效。`agent_end` 后到达的消息才另起新回合。无「硬取消」出口——纠偏即发消息。

### 托管运行时（managed runtime）

由 desktop-app 替普通用户托管、落在用户目录下的语言运行时（v1 = Node、Python）。与「系统运行时」（用户机器上原本就有的、由用户自己装的 node/python）对立。bash tool 执行命令时优先让托管运行时可见，目的是让缺少开发环境的普通用户也能跑依赖 node/python 的 agent 能力。

刻意**不含原生编译工具链**（gcc/make/MSVC）——那是另一类问题（见 [[源重定向]] 不解决编译，只解决「源不可达」）。git/ffmpeg 等通用 CLI 可作为同构的可选附加项，但不属 v1「运行时」叙事。

### 运行时来源三层（runtime source tiers）

[[托管运行时]] 的获取按优先级分三层，互补而非互斥：

1. **内置 vendor**：随安装包打入当前构建平台的运行时二进制，首次启动**本地拷贝**进托管目录——零下载、秒级可用，是普通用户首启的主路径。
2. **下载源列表**：一个 `urlTemplate + priority` 的有序回退列表，仅用于「升级/装非内置版本/其他平台」。源是**配置项**——「现在填公共镜像、将来插一个自建 CDN 作 priority-0」对它只是加一行，不是重写。
3. **系统探测**：扫描用户机器已有的 node/python，能复用则不下载。

「下载下来就有环境」这一体验来自第①层；第②层是 Node（npmmirror 稳定）与 Python（python-build-standalone 仅 GitHub 发布、国内无稳定公共镜像）**可靠性不对称**的兜底，也是自建 CDN 的最终归宿。

### 源重定向（source redirection）

在 bash tool spawn 子进程的瞬间注入临时环境变量，把包管理器指向国内可达镜像、并把 [[托管运行时]] 的 bin 前置进 PATH 的机制。复用既有的 `getShellEnv()`（已把 `~/.vetta/agent/bin` 前置）这一注入点扩展。

只解决「官方源不可达」，**不解决「需要现场编译」**。典型注入项：`npm_config_registry`、`npm_config_prefix`（全局包落私有目录、与运行时版本解耦、不污染系统）、`npm_config_cache`，以及 pip 侧的 index/trusted-host。

### 环境管理（Environment Management）

desktop-app 系统设置中新增的面板，普通用户在此查看/获取 [[托管运行时]]。是「专业性太强、依赖开发环境」这一痛点的用户入口。面板暴露的是运行时本身，[[源重定向]] 对用户透明（在 bash 执行时自动发生）。
