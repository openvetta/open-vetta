# GitHub Issue 任务台：队列可靠性与执行体验

> 状态：待实现规格。实现落在系统插件 `packages/plugins/presets/github-issue-board`。
> 用户视角的既有能力见 [v0.5.58 发布说明](../../.github/release-notes/v0.5.58.md) 中「GitHub Issue 任务台」各条。
> 本文件是当前实现必须如何工作的合同，不以 ADR 代替。

## 1. 问题与范围

任务台已经能：选项目、拉开放 Issue、手动入队、一次一条运行、看对话。它还不是一个可长期用的队列。

当前会在真实使用中卡住或丢掉视野的点：

1. 进程退出时 `status: "running"` 会永远占着 `hasRunningTask`，整张表不能再跑。
2. 失败的 GitHub Issue 不能编辑，因此也不能重跑。
3. 运行中不能停。
4. `createSession` 默认跳进对话页，队列视野立刻丢了。
5. Issue 一多，只能靠「加载更多」，不能在当前仓库内搜或筛。

本规格把任务台补成「当前 GitHub 仓库的 Issue / 手动项 → 本地 Agent 串行队列」，不把它做成看板，也不做成批量任务。

### 1.1 产品身份（必须保持）

- 单位是**一条不同的需求**，不是同一提示词打 N 个目录。
- 同一时刻最多一条 `running`。切片 1–6 都不引入并发。
- 队列存在插件私有 `state.json`，不进项目目录。
- 换仓库只换项目或本地目录，不恢复 owner/repo 输入框。
- 不复用批量任务引擎，不复用看板泳道。

### 1.2 明确不做

| 不做 | 原因 |
| --- | --- |
| 三泳道 / 验收 / 打回 | 外置看板已覆盖 |
| 默认可并发 | 会把「看一眼再点运行」变成后台烧钱 |
| 切片 1–6 写回 GitHub | 没有可靠停止/重试/成功判定之前，评论或关 Issue 会误伤 |
| 默认开 PR | 现有 prompt 的核心约束是本地 commit、禁止 push/PR |
| 改宿主 IPC / plugin-sdk 合同 | 所需 API 已存在 |

### 1.3 切片与发布

每一片都能单独合、单独测、单独写发布说明。实现时按序落地；不要把后面切片的 UI 或状态字段提前铺进前面的 diff。

| 切片 | 内容 | GitHub 写 | 一次一条 |
| --- | --- | --- | --- |
| 1 | 重启回收 running、Issue 失败可重试、停止 | 否 | 保持 |
| 2 | 运行时不跳走、行内状态 | 否 | 保持 |
| 3 | 表内搜索 / 状态 / 标签过滤 | 否 | 保持 |
| 4 | 拉取支持 `@me` / label | 否 | 保持 |
| 5 | skill 选择器 + 评论进 prompt | 否 | 保持 |
| 6 | 可选自动下一条 | 否 | 保持（只是串行接力） |
| 7 | 可选成功后评论 / 关 Issue | **待拍板** | 保持 |

切片 1–3 是本轮默认要实现的最小集。4–6 可紧随其后，但仍是只读 GitHub。切片 7 写在本文末尾，**实现前必须再得到一次明确批准**。

---

## 2. 当前合同（实现时必须保持）

这些行为已经有测试，回归时必须继续绿：

- 手动任务可添加、编辑（pending/failed）、二次确认删除；Issue 不能在本地改或删。
- 运行只接受 `pending`，且 `hasRunningTask` 为真时拒绝。
- `stopReason === "stop"` → `completed`；其它 stop reason 或抛错 → `failed`，`error` 写入原因。
- 发给 Agent 的 skill token 只在发送时加，不写进 `promptText`。
- 拉取排除 PR、按 `owner/repo/number` 去重；pending/failed 刷新 prompt，running/completed 不改 prompt。
- 已关闭且没有 `sessionId`、也不是 running 的 Issue 不展示。
- 本机 `gh` 已登录走认证；否则未认证 `api.github.com`。
- 切换项目且解析到 GitHub 远程后自动拉第一页。

---

## 3. 切片 1：重启回收 + 重试 + 停止

目标：进程崩溃或退出后队列还能继续用；失败的 Issue 能再跑；运行中能停。

### 3.1 重启回收 running

**行为**

加载 `state.json` 后、写入 UI 之前，把所有 `status === "running"` 的任务收成 `failed`：

- `error` 固定为可 i18n 的中断原因键对应文案，中文：「上次运行被中断」，英文：`Interrupted by a previous session`。
- 保留 `sessionId`（若有），「查看对话」仍然可用。
- `updatedAt` 设为回收发生的时间。
- 回收后立刻 `savePluginState`。不要等用户点什么。

**不变量**

- pending / completed / failed 原样保留。
- 回收后 `hasRunningTask(state) === false`，否则切片 1 失败。
- 不要把 running 收成 pending：用户不知道上次跑到哪，自动再跑会重复花钱。重跑必须显式点「重试」。

**实现位置**

- 纯函数 `reclaimRunningTasks(state, now): PluginState` 放在 [`state.ts`](../../packages/plugins/presets/github-issue-board/src/state.ts)。
- `BoardView` 在 `loadPluginState` 成功后调用，再 `persist`。
- `parsePluginState` **不要**在解析时偷偷改 status：解析保持忠实，回收是显式的一次状态转换，便于测试和以后做迁移。

### 3.2 失败可重试

**行为**

`failed` 的任务（手动和 Issue 都算）显示「重试」。点下去：

1. 把该任务 `status` 置回 `pending`，清掉 `error`，保留 `sessionId`、`promptText`、标题、来源。
2. 不自动开跑。用户再点「运行」才发。

「运行」仍只接受 `pending`。重试是回到可运行态，不是直接 `runQueuedTask`。

**权限差**

| | 编辑原文 | 删除 | 重试 |
| --- | --- | --- | --- |
| 手动 pending / failed | 是 | 是（非 running） | failed 显示重试 |
| Issue pending | 否 | 否 | 否（已经能运行） |
| Issue failed | 否 | 否 | **是** |
| running / completed | 否 | 手动可删 completed | 否 |

手动 failed 继续能编辑；编辑仍按现有逻辑回到 pending。重试按钮与编辑并存，不互相替代。

**实现位置**

- `retryFailedTask(state, taskId, now): PluginState` 放在 `state.ts`。
- 非 failed、或不存在的 id → 原样返回。

### 3.3 停止

**行为**

`running` 的那一行显示「停止」，隐藏「运行」。点下去：

1. 调用当前这次运行使用的会话中止 API（切片 1 仍走 `ctx.conversation.abort()`，因为还在活动会话上跑）。
2. 等待已有的 `turn-end`；`stopReason` 不是 `stop` 时现有逻辑会标 `failed`。若 abort 之后没有 `turn-end`（例如会话已不在），`runQueuedTask` 必须在 abort 路径把任务标 `failed`，`error` 为「已停止」/ `Stopped`，并解除 running 锁。
3. 停止期间该行按钮禁用，避免连点。

**不变量**

- 停止不能新开第二条任务。锁要一直持有到状态离开 running。
- 用户在对话页手动 abort，任务台必须同样收到 `turn-end` 并标失败——这是现有 `waitForTurnEnd` 已经覆盖的路径，保持即可。

**实现位置**

- `runQueuedTask` 增加可选 `signal?: AbortSignal`（或显式 `abort()` 句柄）。`BoardView` 持有当前运行的 abort 函数。
- 不要在切片 1 切到 `official.sessions`；那是切片 2 的事。切片 1 只保证「能停、能回收、能重试」。

### 3.4 切片 1 测试

纯函数（`state.test.ts`）：

- Given 队列里有一条 running 且带 sessionId，When `reclaimRunningTasks`，Then 该条 failed、error 为中断文案、sessionId 仍在，其它任务不动。
- Given 没有 running，When 回收，Then 返回同一对象或深等价格相等（不无故改 `updatedAt`）。
- Given Issue failed，When `retryFailedTask`，Then pending、error 清空、prompt 不变。
- Given pending / running / completed，When 重试，Then 原样。

`run-task.test.ts`：

- Given 任务已 running，When abort，Then 最终 failed，且之后可以再对另一条 pending 调用 `runQueuedTask`。

DOM（`board-view.dom.test.tsx`）——用户路径：

- Given 持久化里有一条 running Issue，When 挂载任务台，Then 看到失败 +「上次运行被中断」，其它行的「运行」可点。
- Given 失败的 Issue，When 点「重试」再点「运行」→「直接运行」，Then 会建会话并发原文。
- Given 一条 running，When 点「停止」，Then 该条失败，其它「运行」恢复可点。

---

## 4. 切片 2：运行时不跳走 + 行内状态

目标：点运行后人还在任务台，能看见哪条在跑、能否停、能否回头看对话。

### 4.1 会话 API

切片 2 **改用** `ctx.official.sessions`，与看板同一条后台编排路径。理由：

- `conversation.createSession` 即使传 `{ navigate: false }` 仍会把该会话设为活动会话，用户当前正在看的对话会被切走。
- `official.sessions.create` + `prompt` 按 `sessionId` 寻址，与当前路由无关；会话在主进程跑到自然停止。
- 任务台已是系统插件，`trustLevel === "official"` 成立。
- 不新增权限。现有 `agent.session.read` / `agent.session.write` 足够。

**运行路径**

```text
official.sessions.create({ cwd, title: task.title })
  → persist sessionId = session.sessionPath（跨重启稳定）以及 runtime sessionId（仅本次 abort 用）
  → official.sessions.prompt(sessionId, promptForRun(...))
  → 订阅 official.sessions.onRunningChanged
  → running: false 且本次 prompt 已发出 → 按现有规则标 completed / failed
```

完成判定：

- `prompt` 返回 `{ status: "failed" }` → 立即 failed。
- 否则等 `onRunningChanged` 把该 `sessionPath` 翻成 `running: false`。
- 若宿主没有给出更细的 stopReason，切片 2 **暂且**把「prompt 已 sent 且 running 结束」视为 completed；abort 路径显式标 failed。不要在这里发明产物校验（本地 commit 检查不在本规格）。

`runQueuedTask` 的依赖从 `PluginConversationApi` 换成一个窄端口，便于单测：

```ts
interface BoardSessionPort {
  create(input: { cwd: string; title?: string }): Promise<{ sessionId: string; sessionPath: string }>;
  prompt(sessionId: string, text: string): Promise<{ status: "sent" | "queued" | "failed"; error?: { message: string } }>;
  abort(sessionId: string): Promise<void>;
  onRunningChanged(handler: (event: { sessionPath: string; running: boolean }) => void): () => void;
}
```

`BoardView` 把 `ctx.official.sessions` 适配进去。「查看对话」改走 `official.sessions.open({ cwd, sessionPath })`。不要混用两套 API。

### 4.2 不跳走

- 运行、重试、停止、自动下一条（切片 6）都不得调用 `open` / 不得把宿主路由切到对话页。
- 只有「查看对话」跳转。
- 运行中用户可以继续筛表、展开 Issue、加手动任务；不能再点另一条「运行」（一次一条仍在）。

### 4.3 行内状态

running 行必须同时能看出：

- 状态徽章「执行中」（已有）
- 「停止」
- 一旦有 `sessionId`，「查看对话」（运行中也可以跳去看，不中断）

失败行：状态徽章 + `error` 文本 +「重试」+ 若有会话则「查看对话」。

不要加进度条、token 计数或工具名实时列表。任务台不是会话页。

### 4.4 离开页面

因为会话在主进程跑，用户切到其它工作区视图时任务应继续。回到任务台时：

1. `loadPluginState`（或内存 state，若插件未卸载）。
2. 若仍有 `running`，用 `official.sessions.listRunning()` 核对 `sessionPath`。
   - 仍在跑：保持 running，重新挂上 `onRunningChanged`。
   - 不在跑：按切片 1 的回收规则标 failed（中断），**不要**在「对不上」时标 completed。宁可误标失败让用户重试，也不要把一次没跑完的标成完成。

### 4.5 切片 2 测试

`run-task.test.ts` 用 Fake `BoardSessionPort`：

- create + prompt sent + running 翻转 false → completed，且测试替身没有 `open`。
- prompt failed → failed，不依赖 running 事件。
- abort → failed「已停止」，之后可跑下一条。

DOM：

- 点「直接运行」后，页面标题仍是任务台，不调用会话 `open`；该行变成执行中并出现「停止」。
- 运行中点「查看对话」才调用 `open`。
- 现有「建会话后跳对话页」的断言必须改掉，这是本切片的行为变化。

---

## 5. 切片 3：表内搜索 / 状态 / 标签过滤

目标：在**已经进队列的当前仓库任务**上缩小视野。不碰 GitHub。

### 5.1 控件

放在队列表格正上方，从左到右：

1. 搜索框。placeholder：「搜索标题或编号」。对标题、Issue `#N`、手动原文第一行做不区分大小写包含匹配。空字符串 = 不过滤。
2. 状态。选项：全部 / 待处理 / 执行中 / 已完成 / 失败。默认「全部」。
3. 标签。选项：全部 + 当前**可见队列**里出现过的标签去重排序。默认「全部」。手动任务没有标签，选具体标签时不出现。

过滤是视图状态，**不写** `state.json`。刷新、切项目、重新拉取后控件回到默认（全部 / 空搜索）。切项目本来就会换一批任务，记住旧筛选会让人以为队列空了。

### 5.2 计算顺序

```text
tasksVisibleForBoard(tasks, repoTarget, cwd)  // 已有：仓库 / cwd / 关闭 Issue
  → 状态
  → 标签
  → 搜索
```

空结果文案与「还没拉取 / 仓库没有开放 Issue」分开：

- 队列本身为空：沿用现有 `board.empty.*`。
- 队列有行但筛空了：「没有符合筛选的任务」，并保留筛选控件。不要显示「拉取 Issues」。

「加载更多」仍对仓库分页生效，不受筛选影响。

### 5.3 实现位置

- 纯函数 `filterBoardTasks(tasks, { query, status, label })` 放在 `workspace.ts`（或新建 `filter.ts`，不要塞进 `BoardView`）。
- DOM 只负责控件和把结果交给现有表格。

### 5.4 切片 3 测试

纯函数：

- 搜索 `#12` 只留下 issueNumber 12。
- 状态 `failed` 只留下失败。
- 标签 `bug` 只留下带该标签的 Issue。
- 三者同时生效（AND）。
- query 只含空白视为无搜索。

DOM：

- 队列有「Fix login」和「Add docs」，输入 `login` 后只看到前者。
- 选「失败」后只看到失败行；清空后全部回来。
- 筛空时出现「没有符合筛选的任务」，不出现「还没有拉取 Issues」。

---

## 6. 切片 4：拉取支持 @me / label

目标：减少「把整个仓库的开放 Issue 倒进队列」。仍只读。

### 6.1 拉取范围

在「拉取 Issues」按钮左侧（或上方同一行）增加：

- 范围：`全部开放`（默认）/ `指派给我`
- 标签：可选；空 = 不限。输入一个 GitHub 标签名，不做本地自动完成（避免未拉完时误导）。

这两个值**要持久化**到 `PluginState`，因为它们影响「自动拉第一页」和「加载更多」的查询，刷新后必须还是同一视野。

```ts
interface IssueFetchFilter {
  assignee: "any" | "me";
  label: string | null; // trim 后空则 null
}
```

缺字段的旧 `state.json` 读作 `{ assignee: "any", label: null }`。

### 6.2 查询

继续排除 PR、只要 open。

**`gh` 可用时**（现有 `command.run("gh", ...)` 成功且非 unavailable）：

- 全部开放：保持 `repos/:owner/:repo/issues?state=open&per_page=100&page=N`
- 指派给我：`repos/:owner/:repo/issues?state=open&assignee=@me&per_page=100&page=N`
- 带 label：追加 `labels=<url-encoded>`。多个标签不在本切片支持（一个输入框，一个标签）。

**未认证 fallback**：

- `assignee=any` 且无 label：保持现有公开接口。
- `assignee=me`：不发未认证请求，notify「指派给我需要本机已登录 GitHub CLI」，队列不变。
- 仅 label：公开接口支持 `labels=`，可以用。

`issueSync.seenNumbers` 仍按**本次过滤条件下的开放集合**理解。换 filter 等于换视野：重置 `issueSync`、`issueNextPage`、`lastFetch` 的页码，但**不要清空队列里已有任务**。已入队的其它 Issue 继续按现有可见性规则显示；新的拉取只导入/刷新匹配当前过滤的条目。

不要在 `assignee=me` 时把未指派给我的已入队 Issue 藏掉——隐藏是切片 3 的事。切片 4 只改变「拉什么进来」。

### 6.3 自动拉取

切换项目后的自动第一页，必须带上当前 `IssueFetchFilter`。用户改范围或标签后，等他点「拉取 Issues」，不要每敲一个字母就自动拉。

### 6.4 切片 4 测试

`github-issues.test.ts`：

- `assignee=me` 时 `gh api` 路径含 `assignee=@me`。
- 带 label 时路径/URL 含编码后的标签。
- 未认证 + `assignee=me` 返回结构化错误，不打 `api.github.com`。

DOM：

- 选「指派给我」再拉取，请求带 assignee。
- 未登录选「指派给我」时出现提示，队列不变。

---

## 7. 切片 5：skill 选择器 + 评论进 prompt

目标：运行方式不再写死 `implement`；Issue 的讨论可以进发给 Agent 的文本。队列里的原文仍不变。

### 7.1 Skill 选择器

点「运行」后的气泡：

1. 「直接运行」（无 token）——第一项，保持现状。
2. 当前工作目录下 `official.skills.list(cwd)` 返回的 `type === "skill"` 且 `enabled !== false` 的项，按 name 排序。展示 `alias ?? name`。点某一项即 `promptForRun(text, skill.name)`。
3. 列表失败或为空：只显示「直接运行」。**不要**再写死「用 implement 运行」。

本机没有 implement 时，不得假装有。这是对 v0.5.58 行为的修正，发布说明写进「修复」。

气泡交互（再点运行 / 点空白 / Esc 收起）保持不变。

### 7.2 评论是否进 prompt

运行气泡里、两条运行方式之上，Issue 任务多一个复选框：「带上评论」。手动任务不出现。

- 默认：**不勾选**。现有 Issue 运行路径行为不变。
- 勾选后，这次运行在 `send` 前拉取评论（复用 `fetchIssueComments`，最多 30 条）。失败则 notify「评论加载失败，已按正文发送」，仍继续跑，不中断。
- 勾选状态是这次气泡的局部 state，不写 `state.json`。

### 7.3 Prompt 拼接

保持 `ISSUE_PROMPT_MAX_CHARS = 4000`。新预算分配：

```text
标题\n
URL\n
\n
正文\n          ← 与评论共享剩余预算；标题、URL、提交说明不截
\n
Comments:\n    ← 仅勾选时
login: body    ← 按时间正序，逐条加入直到预算用尽
\n
提交说明
```

正文或评论被截断时，在截断处追加 `\n\n[truncated]`，让模型知道后面还有。标题、URL、提交说明永不截断；若三者已超过 4000（极端），整段 slice 到 4000——这是现有 `clipPrompt` 的兜底，保持。

提交说明本切片仍用 `ISSUE_COMMIT_INSTRUCTION`，不改文案、不做模板。

`promptText` 存盘仍是「标题 + URL + 正文 + 提交说明」，**不含**评论、不含 skill token。评论只在发送时附加。刷新 Issue 时也不把评论写进 `promptText`。

抽出 `buildIssueRunPrompt({ title, url, body, comments, commitInstruction, includeComments })`，`mapGithubIssueItems` 继续用无评论版本写 `promptText`。

### 7.4 切片 5 测试

- skills 列表含 implement 与其它 skill 时，气泡出现对应项；点其中一项，发出的文本带 `@skill:name `，存盘 prompt 不变。
- skills 为空时气泡只有「直接运行」。
- 勾选「带上评论」时，发出的文本含评论作者与正文；`promptText` 不含 Comments。
- 评论请求失败时仍发出正文，且 notify。
- 超长正文 + 评论时，标题和 URL 完整，末尾有 `[truncated]`，总长 ≤ 4000。

现有「用 implement 运行」DOM 测试改为「列表里有 implement 时可选」。

---

## 8. 切片 6：可选自动下一条

目标：去掉「点 20 次运行」的操作税，仍一次一条。

### 8.1 开关

表格上方、筛选行附近：复选框「跑完自动下一条」。默认关。写入 `PluginState.autoAdvance: boolean`，缺字段 = `false`。

### 8.2 接力规则

当且仅当同时满足：

- `autoAdvance === true`
- 刚结束的任务变为 `completed`（不是 failed、不是停止）
- 当前没有 running
- 存在下一条可跑的 pending

则自动对下一条调用与用户刚才相同的运行方式（skill 名、是否带评论）。

「下一条」= `tasksVisibleForBoard` 之后、**未应用切片 3 筛选**的列表里，第一条 `pending`。筛选是看表用的，不能让看不见的 pending 被跳过、也不能只跑筛出来的子集——否则用户关掉筛选会发现一半没跑。若以后要「只跑当前筛选结果」，另开切片。

失败、停止、无项目、`create/prompt` 抛错：停，不接力。用户修完再点运行。

接力不得 `open` 对话页。

### 8.3 切片 6 测试

- 开着自动下一条，第一条 completed 后第二条变 running，全程没有 `open`。
- 第一条 failed 或被停止后，第二条仍 pending。
- 关着开关，第一条 completed 后第二条仍 pending。

DOM：勾选后跑一条会自动开始下一条；取消勾选后不再接力。

---

## 9. 切片 7：可选成功后评论 / 关 Issue（停住）

**本切片默认不实现。** 下面只冻结一旦批准后的合同，避免实现时再争论。

前置：切片 1–2 已落地（能停、能重试、重启不会假完成）。没有这两项就不要写 GitHub。

### 9.1 开关（默认关）

仅 Issue 任务、且本机 `gh` 可用时展示：

- 「完成后评论」默认关
- 「完成后关闭」默认关；关闭隐含会先评论（没有评论的关单没有审计痕迹）

写入 `PluginState`。未认证路径永远不写；若用户打开了开关但 `gh` 不可用，运行结束时 notify「无法更新 GitHub：未登录 GitHub CLI」，本地状态仍按 1–6 流转。

### 9.2 写什么

成功（`completed`）之后、接力下一条之前：

1. 若「完成后评论」：`gh api` POST `repos/:owner/:repo/issues/:number/comments`，正文为固定模板，中英按插件 locale：
   - 中文：`已在本地任务台完成。请查看对应 Vetta 会话；未推送、未打开 Pull Request。`
   - 英文：`Completed locally on the Issue Board. See the Vetta conversation. No push and no pull request.`
2. 若「完成后关闭」：先评论（若还没评），再 `PATCH` Issue `state=closed`。
3. 写回失败：本地仍是 completed，notify 失败原因。不要把本地打回 failed——代码已经落地，只是远端没记上。
4. 不要改 `promptText`，不要开 PR，不要 push。

权限：切片 7 落地时 `plugin.json` 的 `commands` 仍是 `git` / `gh`；GitHub 写通过已声明的 `gh`。不要为写回去加 PAT 设置页。

### 9.3 批准前禁止

- 不要提前把写回开关画到 UI 上。
- 不要把 POST/PATCH 路径加进 `github-issues.ts`。
- 不要扩大 `network.allowedHosts` 以外的写权限（继续只用 `gh api`）。

---

## 10. 状态与兼容

`PluginState` 新增字段（全部可选，旧文件能读）：

| 字段 | 切片 | 缺省 |
| --- | --- | --- |
| `autoAdvance` | 6 | `false` |
| `fetchFilter` | 4 | `{ assignee: "any", label: null }` |
| （切片 7）`commentOnComplete` / `closeOnComplete` | 7 | `false` / `false` |

`GithubTask` 不新增 status。中断和停止都走现有 `failed` + `error` 字符串。

运行期 abort 用的 runtime `sessionId` 不要写进 `state.json`；只持久化 `sessionPath` 到现有 `task.sessionId` 字段（该字段今日已存 path）。

`parsePluginState` 忽略未知字段，保持向前兼容。

---

## 11. UI 与文案

所有新字符串进 [`locales/zh.json`](../../packages/plugins/presets/github-issue-board/locales/zh.json) 与 [`locales/en.json`](../../packages/plugins/presets/github-issue-board/locales/en.json)，key 用 `board.*`。不要把中文写进组件。

建议 key（实现时可微调，但中英必须成对）：

| key | zh | en |
| --- | --- | --- |
| `board.retry` | 重试 | Retry |
| `board.stop` | 停止 | Stop |
| `board.error.interrupted` | 上次运行被中断 | Interrupted by a previous session |
| `board.error.stopped` | 已停止 | Stopped |
| `board.filter.search` | 搜索标题或编号 | Search title or number |
| `board.filter.status` | 状态 | Status |
| `board.filter.status.all` | 全部 | All |
| `board.filter.label` | 标签 | Label |
| `board.filter.label.all` | 全部 | All |
| `board.empty.filtered` | 没有符合筛选的任务 | No tasks match the current filters |
| `board.fetch.assignee.any` | 全部开放 | All open |
| `board.fetch.assignee.me` | 指派给我 | Assigned to me |
| `board.fetch.label` | 标签 | Label |
| `board.error.assigneeNeedsGh` | 指派给我需要本机已登录 GitHub CLI | “Assigned to me” needs a logged-in GitHub CLI |
| `board.run.includeComments` | 带上评论 | Include comments |
| `board.autoAdvance` | 跑完自动下一条 | Run the next task automatically |
| `board.error.commentsFallback` | 评论加载失败，已按正文发送 | Could not load comments; sent the description only |

文案原则：说结果，不说 `abort`、`sessionPath`、`turn-end`。见 [`docs/user-facing-copy.md`](../user-facing-copy.md)。

---

## 12. 文件边界

| 文件 | 允许改什么 |
| --- | --- |
| `state.ts` | 回收、重试、`autoAdvance` / `fetchFilter` 解析 |
| `run-task.ts` | 会话端口、abort、不导航、评论/skill 只影响发送文本 |
| `github-issues.ts` | 查询串、`buildIssueRunPrompt`；切片 7 之前无 POST/PATCH |
| `workspace.ts` | `filterBoardTasks` |
| `BoardView.tsx` | 编排、新控件；业务规则不在这里长出来 |
| `plugin.json` | 切片 1–6 不改权限 |
| `locales/*` | 成对中英 |
| `test/*` | 纯函数 + DOM 用户路径 |

不要改 `packages/plugins/plugin-sdk`、不要改批量任务、不要改看板。

---

## 13. 验证

每一切片结束：

```bash
bun run test:impact -- packages/plugins/presets/github-issue-board/src/BoardView.tsx
bun run check:quick -- packages/plugins/presets/github-issue-board
```

整包做完再：

```bash
bun run check
```

不跑 `verify:ui:*`，除非用户明确要求。不跑全量 `bun test`。

发布说明写入当前开发中版本 [`.github/release-notes/v0.5.58.md`](../../.github/release-notes/v0.5.58.md)（以 `apps/desktop/package.json` 的 `version` 为准；若版本已升，写新文件）。按切片用用户语言追加：

- 切片 1：修复「退出后任务一直执行中」、Issue 失败可重试、运行中可停止
- 切片 2：改进「运行后留在任务台」
- 切片 3：新增表内搜索和筛选
- 切片 5：修复「没有 implement 仍显示用它运行」

---

## 14. 实现顺序与暂停点

1. 切片 1 → 2 → 3。这三片不增加 GitHub 写，不改变一次一条。做完任务台才是能用的队列。
2. 然后 4 → 5 → 6。仍只读。
3. **停住。** 切片 7 要单独批准。批准前把成功判定是否够用（现在仍是「prompt 成功且 running 结束」）讲清楚：误关 Issue 的代价高于少一条评论。
