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

### image budget

coding-agent 在每次 LLM 调用前（`transformContext` 钩子，`applyImageBudget`）对消息历史里的图片做的保留策略：对**看过的**旧图只保留最新 N 张（`maxRecentImages`，默认 2，desktop-app 设置页可调；`<=0` 禁用即全保留），其余替换为文本占位符以省视觉 token。是**只作用于本次发送 payload 的纯函数变换**，不 mutate 原始历史、不落盘（脏读不可能）。

ADR-0012 起判定依据从「留最新 N 张」改为引入 [[未看过的图]]：N 只约束「看过的」旧图，未看过的图无条件保留。原本附带的 OOM 硬保护（把批量读的图强砍到 N）被**刻意移除**——显存受限的本地模型改由部署方提示词软引导「一张一张读」来兜底，云端模型无显存墙不受影响。文档/代码里出现「图片预算」「视觉 token 封顶」时即指本机制。

### 系统通知（system notification）

desktop-app 经由 OS 原生通知中心（macOS / Windows）向用户推送的、APP 内事件的横向通知能力。设计为**类型化**：每条通知带一个 [[通知类型]] 判别字段，共用同一套「是否展示 → 构造内容 → 点击路由」基础设施。点击通知统一**前台化 APP** 并按该类型的路由意图跳转。首期只落地 [[agent 完成通知]] 一种类型，其余类型（更新提醒、错误告警等）为未来横向扩充预留位。

权限**交给操作系统**：不在代码层主动申请或检测授权，依赖 OS 首次弹窗接管。设置层面只提供一个全局总开关（「通用设置」下），不按类型拆分开关。

### 通知类型（NotificationType）

[[系统通知]] 的判别联合标签。每种类型自带 payload 形状与「点击后做什么」的路由意图。当前成员：[[agent 完成通知]] 与 [[agent 提问待确认通知]]（payload 均携带定位目标 session 所需的标识）。新增类型 = 加一个联合分支 + 在薄 dispatch 里补一段判定/构造/路由，**不触碰**已有类型。

### agent 提问待确认通知

[[通知类型]] 成员：[[交互式 session]] 的 agent 调用 [[ask_user_question]]、有问题待用户确认时触发的 [[系统通知]]。正文固定「有问题待确认，点击查看」，标题取 session 名。抑制规则与 [[agent 完成通知]] 同（聚焦且正停在该 session 聊天页时不弹——[[问答面板]] 已在眼前）。coalesceKey 用 `question:<sessionPath>` 与完成通知区分，二者互不覆盖。点击前台化并路由到该 session。

### agent 完成通知

[[通知类型]] 的首个成员：一个[[交互式 session]]「完成一轮回答」时触发的 [[系统通知]]。**触发**条件是该轮以正常结束（`agent_end`，对应 stopReason `stop`）或**出错**（stopReason `error`）收尾；用户主动中断（`aborted`）**不**触发。标题取 session 名（auto-title，回退首条用户消息截断），正文为固定文案。点击后前台化 APP 并路由到该 session 的聊天界面；若该 session 已被删除/文件不存在，则仅前台化、停留当前界面、不报错。

同一 session 的连续完成**合并为一条**（新通知替换该 session 的旧通知）；不同 session 各占一条。

### 通知抑制规则（前台同 session）

[[agent 完成通知]] 唯一**不**弹出的情形：APP 窗口当前**聚焦**（`isFocused`，窗口可见但失焦不算前台）**且**用户当前正停在**该 session 的聊天界面**上。两个条件缺一即通知——APP 在后台时即便看的就是该 session 也通知；APP 聚焦但停在设置页/自动化页等非聊天界面（即便内部 activeSession 仍指向该 session）也通知。「正在看哪个 session」由渲染进程上报给主进程，与主进程持有的窗口聚焦态合并判定。

### 交互式 session

用户在聊天界面**手动发起**的 session，与自动化/批量任务/定时任务等**非手动发起**的 session 相对。判别依据是创建路径：交互式 session 经渲染进程的 `session:create` 通道创建，批量/定时任务直接调运行时创建——故主进程可在 `session:create` 处天然圈定交互式 session。[[agent 完成通知]] **只针对交互式 session**，避免后台任务刷屏。

### 未看过的图（unseen image）

[[image budget]] 的核心判定：一张图若位于消息历史里**最后一条 assistant 消息之后**，则即将发起的这次 LLM 调用是模型**第一次**看到它 → 判为「未看过」→ 无条件保留，不受预算 N 约束。一旦其后出现了 assistant 消息（模型已处理过这一批），转为「看过」→ 才进入预算被砍候选。

这是消息数组结构的**确定性、无状态**信号，不需要额外标志位。它保证 agent 批量 `read` 多张图时，模型在第一次调用里能完整看到全部图，根治「读了=没读」（模型对本该现在看的图收到占位符的幻读不可能）。代价见 [[image budget]]：未看过的图全保留 ⇒ 算法层不再防 OOM。

### 个性化（personalization）

一个**全局、跨所有项目/session** 的系统提示词追加能力，入口在 desktop-app 设置页「Agent配置」最上方。由两部分组成：一个 [[人设]] 单选 + 一段 [[自定义指令]] 自由文本。配置写入 `~/.vetta/agent/settings.json` 的 `personalization` 块（`{ personaId, customPrompt }`），与 [[image budget]] 的 `maxRecentImages` 同文件不同字段。

生效走 [[个性化懒重建]]：点「应用」只落盘、不触发任何 session 重建；每个 session 在**下一个 user prompt** 时按需检测并重建系统提示词。语义刻意复刻 MCP 的懒重建（mcp.json 写盘不 fan-out，prompt 入口 diff-reload）。

默认态（`personaId = "default"` 且 `customPrompt` 为空）**什么都不追加**，系统提示词与未开启该功能时完全一致。

### 人设（persona）

[[个性化]] 的预设提示词项，**唯一编辑来源**是 coding-agent 的 `src/core/personas/*.md`（一人设一个 md，frontmatter 存 `id / label / description`，正文存提示词）。构建期由 `scripts/generate-personas.mjs` 把 md 内联成 `src/core/personas-data.ts`（`FILE_PERSONAS`），`personas.ts` 引入它合成 `PERSONAS`——**运行时零文件系统依赖**。settings.json 只存 `personaId`，提示词正文在系统提示词构建时由注册表解析。desktop 通过 IPC 拉取注册表渲染选择器，避免前后端清单漂移；日后改预设措辞对存量用户自动生效。

**为何 codegen 而非运行时读盘**：coding-agent 会被 desktop 的 `vite.main.config.ts` 打进 main bundle（不在 external 列表），打包后基于 `__dirname` 的 `readdirSync` 会落到 desktop 的 dist 路径、读不到 md（同 photon-node 的 `__dirname` 失效问题，注释已记载）。曾先用运行时读盘，desktop 里只显示「默认」即此故。内联成字面量后任何打包/二进制场景都稳。

特殊成员 `default`：no-op 占位，不落 md、在 `personas.ts` 里合成并永远置顶。首期除 `default` 外有 `务实`（回答精炼、切入准、不绕弯、专注任务）与 `交互`（主动提问对齐需求、附推荐方向、获授权再执行）。**人设正文用英文写**（label/description 保持中文供 UI 展示）。新增人设 = 往目录加一个 md（按文件名排序决定展示顺序）后重新构建（`bun run build` 会先跑 `generate:personas`），不触碰存储与注入逻辑。

人设正文是**预设、产品维护**的；与 [[自定义指令]] 正交——后者是用户自己写的。

### 自定义指令（custom instructions）

[[个性化]] 中用户在 [[人设]] 之上追加的一段自由文本（设置页 textarea），存于 settings.json `personalization.customPrompt`。与人设**相互独立**：即便选「默认」人设，只要本文本非空就照样追加。

刻意不叫「全局提示词」——「全局」在本系统里已指 [[个性化]] 的作用域，复用会歧义。

### 个性化懒重建（personalization lazy reload）

[[个性化]] 的生效机制，与 MCP 懒重建、`image budget` 懒重读同构：desktop 写 settings.json 后**不** fan-out 重建；coding-agent 在每次 `prompt()` 入口对 `personalization` 块做签名比对（缓存上次签名，相等走 fast-path、无副作用），变化时才重建系统提示词、令本轮 prompt 立即看到新人设/指令。

刻意与 `APPEND_SYSTEM.md` 文件注入分离：那条路径只在 session 初始化/显式 `reload()` 时读盘，无 per-prompt 懒重载；个性化需要「应用后下一轮即生效」故走独立的轻量签名路径。注入位置见 [[个性化]]——拼在系统提示词末尾，顺序为 `APPEND_SYSTEM.md → 人设 → 自定义指令`。

### 预设模板（provider template）

服务端下发的、用于「免配置接入大模型服务商」的**目录条目**:每个模板描述一个服务商的 `baseUrl`、模型列表(含上下文/输入形态/是否思考/价格等能力元数据)、`api` 类型、供应商图标等——但**不含 key**。客户端启动时 fetch 一份(BYOK 直连,见下),用户只需填入**自己的 key** 即可使用该服务商的预设模型。

与 [[远程网关]] 是**两个独立、并存**的来源,术语上刻意不复用 "remote":
- **预设模板 = BYOK 直连**:请求直发服务商原站(`api.anthropic.com` / `api.deepseek.com` …),用**用户自己的 key**,服务端只提供目录、**不碰 key、不转发流量、不扣 credits**。
- **远程网关**:请求经服务端代理(`gatewayUrl`),用登录 JWT 当 key,服务端可计费。

**采纳即持久化(snapshot-on-key)**:用户给某模板填入 key 的那一刻,该模板被落成本地 [[models.json]] 里的一个普通 provider 条目(带 `apiKey`),并打上来源标记 `source:"template"` + `templateId`。由此 `getAvailable()` / `ModelSelector` / 离线 fallback 全部复用既有机制。手搓的自定义服务商无此标记,**任何同步逻辑都不得触碰**。

**在线合并 / 离线回退快照**:每次 fetch 成功,用服务端最新的 url/模型/参数**覆写** `source:"template"` 的本地条目(只保留用户填的 `apiKey`);服务端删除该模板或 fetch 失败时,本地已持久化的快照照常可用——「服务端能修正错误配置」与「离线/下线不影响存量用户」二者兼得。

设置页中作为**独立的「预设服务商」区**呈现,与「服务商」(手搓自定义、models.json 中无 `source` 标记)、[[远程网关]]「远程服务商」三区语义并列、互不重复:`source:"template"` 的条目只在预设区显示、从手搓区隐藏。fetch / 合并 / 写回 [[models.json]] **只发生在 desktop-app main 进程**;coding-agent 不感知模板,仅需其 ProviderConfigSchema 容忍 `source`/`templateId`/`icon` 字段,复用同一份已持久化的 models.json。无内置种子目录:首启离线且 fetch 失败时预设区为空 + 提示重试。填入 key 即持久化启用、**不做 /models 校验**,首次真实请求才暴露无效 key。

### 远程网关（remote gateway）

见 [[预设模板]] 的对比定义。指现有的 `fetchRemote → /providers/models.json` 机制:登录后服务端下发模型,请求经服务端代理转发(`gatewayUrl`),以登录 JWT 为 key,服务端可计费。是与预设模板**并存**的另一条链路。同样携带 [[icon symbol]]。

### icon symbol

供应商图标的下发方式:**客户端内置一套图标资源,每个资源有唯一 symbol 字符串**(可无限扩充)。服务端的 [[预设模板]] 配置与 [[远程网关]] 供应商配置都只填这个 symbol;客户端按 symbol 解析到内置图标渲染。`icon` 字段**可选**,空则不显示图标。symbol 随 [[预设模板]] 快照一并持久化进 [[models.json]],离线照常渲染。刻意不下发图片字节/URL——客户端资源 + 服务端 slug,既离线安全又省带宽,新增图标=客户端加一张资源。是**供应商(provider)级**,非模型级。

### ask_user_question

coding-agent 的一个内置工具，让 agent 在执行途中**主动向用户提一组多选题并阻塞等待回答**。借鉴 Claude Code 的 `AskUserQuestion`，转成本仓 snake_case 命名。input schema 是 Claude Code 的**核心子集**：`questions[1-4]`，每题 `{ question, header(短标签), options[2-4]{ label, description, badges? }, multiSelect }`；自动附「Other」自由输入；**不做** Claude Code 的选项级 preview / notes 批注 / metadata。回传给模型走自然语言拼接（`"Q"="A"` 串联，多选逗号连，取消回传明确措辞），[[option badge]] 不进回传。

工具是否对 agent 可见由 [[user question handler]] 的存在与否门控（能力=注册），按 [[实验性功能]] 开关动态启停。交互界面是 [[问答面板]]，transcript 里另留一个富视图 tool_call block 永久记录问题与所选答案。

### user question handler

设在 `getSharedRuntime()` 上的、承载 ask_user_question「阻塞等回答」能力的回调（拟 `setUserQuestionHandler`），与既有 `setUserConfirmationHandler` 同构——但 confirm 只传 bool，本 handler 承载 `questions/options` 富结构与结构化答案。新增 IPC channel（question-request / question-response）承载该结构，与 [[host_request / host_response]] 同属「agent 阻塞等宿主响应」家族。

**「能力=注册」是门控核心**：[[ask_user_question]] 是否进 agent 的 active tool set + system prompt，唯一取决于共享 runtime 上此 handler 是否存在；[[实验性功能]] 开关开→desktop 注入 handler，关→清除。AgentSession 在**每个 prompt 入口**比对「handler 是否存在」与上次构建态，变化即 `_buildRuntime` 重建——与 MCP 懒重建（`_maybeReloadMcpForPrompt`）、[[个性化懒重建]] 同一机制族，故新旧会话都能在下一轮 prompt 动态生效，不向 coding-agent 额外透传布尔 flag。

### 问答面板

ask_user_question 待答时，desktop-app 聊天页**输入栏被完全接管**转换成的 Q&A 选择 UI。多问题(问题组)以**紧凑可折叠的堆叠列表**呈现、可在问题间自由切换，不占过大篇幅；已答问题折叠成所选答案摘要。逃生出口=**显式取消按钮**（→ 触发 abort 语义，工具回传「用户拒绝回答」）+ 每题 Other 自由输入；接管期间隐藏普通文本输入。

**绑定所属 [[交互式 session]]**：请求携 sessionId，切到别的 session 只是隐藏面板（该 agent 仍阻塞），切回恢复待答；后台 session 提问时在侧边栏该会话上打待答徽标。App 关闭/刷新（webContents 销毁）视为取消。

### option badge

[[ask_user_question]] 每个 option 上的结构化标记列表（`badges?: string[]`）。取代 Claude Code「把 `(Recommended)` 塞进 label 文本」的写死做法：agent 可给某选项 append 任意 badge（「推荐」只是其一），既作 [[问答面板]] 展示的引导 badge、也是模型表达倾向性的结构化通道。仅用于展示与引导，**不进**回传给模型的 tool_result。

### 实验性功能（experimental features）

desktop-app 设置页「Agent配置」下的一个分类，首个成员是 [[ask_user_question]] 的开关。配置存储预留分组结构 `experimental.askUserQuestion`，将来加实验项只是加一个键、UI 同区域追加一行。**默认关、用户手动开**——「实验性」只是标签，不代表工具不可用或有额外使用成本，开关只控制是否把工具加载给 agent（经 [[user question handler]] 的注入/清除生效）。

### Vetta Go / Token Plan

新增的订阅式计费方式，仿主流 token plan。用户开通某 [[档位]] 后，在该档位的[[窗口配额]]内使用其[[模型分组 tag]]覆盖的模型，**不走积分钱包扣减**。desktop 中作为独立服务商「Vetta Go」呈现；开通后有特殊标记与卡片。

### 模型分组 tag（model group tag）

模型的分类标签，一个模型可打多个。**独立受管实体**（id + 名称），与现有自由文本 `ProviderModel.tags`（"free,fast,vision" 展示标签）完全分离，模型与分组多对多（中间表）。在「模型设置」页有「模型分组」配置入口预设 n 个分组，模型设置中给模型多选打 tag。

**通用概念，不与 Go 强绑定**：分组本身是独立特性，[[档位]]关联若干分组 tag 决定可用模型只是当前**第一个消费者**；未来可能有其他业务按分组处理。建模时保持解耦——分组实体不依赖订阅，订阅单向引用分组。当前仅约束 Go 可用范围，[[Vetta Zen / 按需付费]] 仍暴露所有启用模型、与分组无关。
