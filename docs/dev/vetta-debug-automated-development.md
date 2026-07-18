# Vetta Debug 自动化开发操作手册

本文面向第一次使用 Vetta Debug 的开发者和 Agent，说明如何通过开发环境专用的会话能力驱动真实 Vetta Agent，实现“提出任务 → 修改代码 → 运行验证 → 根据结果继续修正”的自动化闭环。

## 1. 功能定位

Vetta Debug 是开发环境专用能力，与 Vetta Action 共用同一个本地 RPC 服务器，但在业务和能力目录上独立。

会话 Debug 能力可以：

- 创建一个普通、持久化且在侧边栏可见的 Vetta 会话；
- 通过 `sessionPath` 继续已有会话，保留上下文和历史；
- 等待 Agent 完成一个回合，而不只检查请求是否成功发出；
- 在 Agent 调用 `ask_user_question` 时返回结构化问题；
- 由外层开发 Agent 回答问题，让内层 Vetta Agent 继续执行；
- 等待、恢复查询或中止正在运行的 Debug 会话操作。

它不提供生产入口。打包环境不会注册 Debug runtime，调用时会返回 `DEBUG_NOT_AVAILABLE`。

## 2. 核心概念

使用前先区分三个标识：

| 标识 | 生命周期 | 用途 |
|---|---|---|
| `sessionId` | 一个已打开的运行时会话 | 标识当前 Desktop runtime 中的会话 |
| `sessionPath` | 持久化 | 重新打开、继续会话；应从返回值或 `conversation.list` 获取 |
| `operationId` | 当前开发进程内，终态后保留约 30 分钟 | 回答、等待或中止某次 `create` / `continue` 操作 |

`sessionPath` 是长期恢复依据。开发 App 重启后，旧 `operationId` 会失效，但会话文件仍然存在，可以使用 `conversation.continue` 创建新的操作。

## 3. 前置条件

### 3.1 启动开发版 Desktop App

在仓库根目录执行：

```powershell
cd packages/desktop-app
bun run dev
```

这是常驻进程。需要自动化启动时，可以让它在后台运行，并把 stdout、stderr 重定向到临时日志文件。不要在每个 Debug 调用前重复启动 App。

注意：`dev:electron` 会在启动时构建主进程代码，但不会监听主进程源码变化。修改 `packages/desktop-app/src/main` 或 preload 后，需要重启开发进程；只修改 Vite Renderer 代码通常可以热更新。

### 3.2 准备 CLI

如果系统已经安装 `vetta` 命令，直接使用：

```powershell
vetta debug --help
```

在本仓库中也可以直接运行源码入口：

```powershell
bun packages/cli-app/src/cli.ts debug --help
```

本文后续统一使用 `vetta`。如果没有全局命令，把它替换为：

```text
bun packages/cli-app/src/cli.ts
```

CLI 会读取 `~/.vetta/action-server.json` 中的本地服务器地址和令牌。不要打印、提交或分享其中的 token。若同时运行多个使用同一 Vetta 配置目录的实例，端点文件通常指向最后启动的实例。

## 4. 先发现能力，再调用

不要依赖记忆猜测参数。推荐每个 Agent 都遵循以下发现流程。

列出全部会话能力：

```powershell
vetta debug search "" --category conversation
```

查看某个能力的说明和示例：

```powershell
vetta debug describe conversation.create
vetta debug describe conversation.answer
```

执行能力：

```powershell
vetta debug run <debug-id> '<json-input>'
```

CLI stdout 始终只有一个 JSON 对象：

```json
{"ok":true,"result":{}}
```

或者：

```json
{"ok":false,"error":{"code":"...","message":"..."}}
```

自动化程序必须先判断顶层 `ok`，再读取 `result`。不能只依赖退出码或自然语言输出。

## 5. 会话能力一览

| 能力 | 必填输入 | 作用 |
|---|---|---|
| `conversation.list` | `cwd` | 列出项目的持久化普通会话 |
| `conversation.create` | `cwd`、`prompt` | 创建可见会话并执行首轮 Agent |
| `conversation.continue` | `sessionPath`、`prompt` | 继续已有会话并执行下一轮 Agent |
| `conversation.answer` | `operationId`、`interactionId`、答案 | 回答当前 `ask_user_question` 并继续等待 |
| `conversation.wait` | `operationId` | 等待下一次可报告状态，可用于恢复查询 |
| `conversation.abort` | `operationId` | 中止运行中或等待回答的操作 |

`create` 和 `continue` 还接受以下可选参数：

| 参数 | 含义 |
|---|---|
| `executionMode` | `sandbox` 或 `full-access`；默认 `sandbox` |
| `modelKey` | 指定已配置的模型；不确定时省略，使用桌面端默认模型 |
| `reasoning` | 指定模型支持的推理级别；不确定时省略 |
| `timeoutMs` | 1,000 至 1,800,000 毫秒；默认 600,000 毫秒 |

输入 schema 是严格模式，多余字段会导致 `DEBUG_INVALID_INPUT`。

## 6. 最小可用流程

### 6.1 创建正常可见的会话

Windows PowerShell 示例：

```powershell
vetta debug run conversation.create '{"cwd":"C:\\develop\\my-project","prompt":"检查当前实现，完成目标功能并运行相关验证。不要只报告类型检查结果。"}'
```

macOS / Linux 示例：

```bash
vetta debug run conversation.create '{"cwd":"/absolute/path/to/my-project","prompt":"检查当前实现，完成目标功能并运行相关验证。不要只报告类型检查结果。"}'
```

会话会像用户在输入框中创建的会话一样持久化并显示在侧边栏。首轮开始时使用用户消息作为临时标题，随后沿用自动标题流程。

### 6.2 识别返回状态

如果本轮直接完成，结果类似：

```json
{
  "operationId": "...",
  "sessionId": "...",
  "sessionPath": "...jsonl",
  "cwd": "...",
  "status": "completed",
  "stopReason": "stop",
  "assistantText": "...",
  "messageCount": 4
}
```

保存 `sessionPath`。后续发现验证失败时，应继续这个会话，而不是重新创建一个失去上下文的会话。

### 6.3 继续已有会话

```powershell
vetta debug run conversation.continue '{"sessionPath":"C:\\Users\\name\\.vetta\\agent\\sessions\\...jsonl","prompt":"刚才的实现仍有一个失败用例。请分析失败原因、修复并重新运行验证。失败输出：..."}'
```

不要手工猜测会话路径。可以从 `create` 返回值获取，也可以列出项目会话：

```powershell
vetta debug run conversation.list '{"cwd":"C:\\develop\\my-project","limit":20}'
```

`conversation.list` 返回项中的 `id` 是会话 ID，`sessionPath` 用于 `conversation.continue`。

## 7. 处理 Ask User

### 7.1 `input_required` 状态

当内层 Agent 调用 `ask_user_question` 时，`create`、`continue`、`answer` 或 `wait` 会返回：

```json
{
  "status": "input_required",
  "operationId": "11111111-1111-4111-8111-111111111111",
  "sessionId": "...",
  "sessionPath": "...jsonl",
  "cwd": "...",
  "interaction": {
    "id": "22222222-2222-4222-8222-222222222222",
    "type": "ask_user_question",
    "questions": [
      {
        "question": "采用哪种兼容方案？",
        "header": "实现方案",
        "multiSelect": false,
        "options": [
          { "label": "共享适配层", "description": "复用现有运行时" },
          { "label": "独立实现", "description": "维护单独链路" }
        ]
      }
    ]
  }
}
```

外层 Agent 应根据原始需求、代码现状和风险做出判断。不要默认选择第一个选项。

### 7.2 回答单选问题

```powershell
vetta debug run conversation.answer '{"operationId":"11111111-1111-4111-8111-111111111111","interactionId":"22222222-2222-4222-8222-222222222222","answers":[{"question":"采用哪种兼容方案？","answers":["共享适配层"]}]}'
```

必须原样使用返回的 `question` 文本。每个问题都要恰好回答一次。

### 7.3 回答多选或问题组

多选题把多个选项放入同一 `answers` 数组。问题组则为每个问题提供一项：

```json
{
  "operationId": "...",
  "interactionId": "...",
  "answers": [
    {
      "question": "需要兼容哪些 Hook？",
      "answers": ["PreToolUse", "PostToolUse"]
    },
    {
      "question": "失败时如何处理？",
      "answers": ["阻止继续执行"]
    }
  ]
}
```

### 7.4 取消问题

```powershell
vetta debug run conversation.answer '{"operationId":"...","interactionId":"...","cancelled":true}'
```

取消会作为 `ask_user_question` 的取消结果返回给内层 Agent，不等同于中止整个操作。需要停止整个回合时使用 `conversation.abort`。

### 7.5 UI 行为

问题会进入正常 Renderer 问答面板。用户和外层 Agent 都可以回答，先完成的答案生效。

任一方回答后：

- 底部待回答面板自动关闭，不需要刷新页面；
- 内层 Agent 收到相同格式的工具结果并继续；
- 消息历史中的 Ask User 卡片保留，并显示最终答案；
- UI 不区分答案来自用户还是外层 Agent。

如果用户抢先回答，外层 Agent 随后调用 `conversation.answer` 可能收到 `DEBUG_INTERACTION_NOT_PENDING`。这时不要重复回答，改用 `conversation.wait` 获取后续状态。

## 8. 等待、恢复与中止

### 8.1 等待

```powershell
vetta debug run conversation.wait '{"operationId":"..."}'
```

`wait` 会等到以下任一状态：

- `completed`：本轮完成；
- `input_required`：出现新的问题；
- `aborted`：操作已中止；
- 错误：操作失败或等待被取消。

终态操作在当前进程中保留约 30 分钟，因此 `wait` 可以重复查询并得到相同终态结果。

### 8.2 中止

```powershell
vetta debug run conversation.abort '{"operationId":"..."}'
```

中止同时覆盖正在生成内容和等待回答的状态。会话历史仍然持久化，之后可以通过 `conversation.continue` 发起新一轮。

## 9. Agent 应遵循的自动化状态机

外层 Agent 可以把以下规则作为操作协议：

```text
1. 通过 debug search / describe 确认能力和输入。
2. 调用 conversation.create，保存 sessionPath 和 operationId。
3. 若 status=input_required：
   a. 阅读全部问题、选项和原始需求；
   b. 形成有依据的答案；
   c. 调用 conversation.answer；
   d. 回到步骤 3，直到进入终态。
4. 若调用断开但 operationId 仍有效，调用 conversation.wait 恢复。
5. 若 status=completed：
   a. 检查 assistantText 中是否包含实际验证证据；
   b. 独立检查 diff、产物、日志或目标功能；
   c. 若验收失败，使用 sessionPath 调用 conversation.continue；
   d. 直到所有验收条件通过。
6. 无法安全继续时调用 conversation.abort，并报告具体阻塞条件。
```

状态流如下：

```text
create / continue
       |
       +--> input_required --answer--> input_required
       |                         |
       |                         +----> completed
       |
       +--> completed --验收失败--> continue
       |
       +--> aborted / error
```

`completed` 只表示 Agent 回合结束，不表示功能一定正确。自动化开发必须额外判断验收标准。

## 10. 如何写适合闭环开发的 Prompt

一个有效的开发 Prompt 至少应包含：

1. 目标：要实现或修复什么；
2. 范围：允许修改哪些模块；
3. 成功标准：怎样证明功能正确；
4. 验证方式：需要运行哪些检查或复现场景；
5. 限制：禁止的命令、权限和不相关改动；
6. 遇到歧义时的处理：调用 `ask_user_question`，而不是自行扩大范围。

推荐模板：

```text
请在当前项目中完成以下开发任务：

目标：<明确目标>
范围：<允许修改的模块或文件>
成功标准：
- <可观察结果 1>
- <可观察结果 2>

要求：
1. 先阅读项目规则和现有实现；
2. 先复现或定义可验证条件，再修改代码；
3. 修改后运行与风险匹配的验证，不能只停在类型通过；
4. 保留无关改动，不做顺手重构；
5. 若存在会显著改变方案的歧义，调用 ask_user_question；
6. 最终报告修改文件、验证命令、结果和仍存在的限制。
```

## 11. 示例：自动开发 Claude Code Hook 兼容

### 第一轮：分析并实施

```powershell
vetta debug run conversation.create '{"cwd":"C:\\develop\\vetta-mono","prompt":"实现 Vetta 对 Claude Code Hook 的兼容。先阅读项目规则与 docs/adapter/claude，梳理现有生命周期和目标 Hook 语义；只修改必要模块。为关键映射建立可验证场景，完成实现后运行允许的检查，并说明每个 Hook 如何验证。遇到会改变协议语义的选择时调用 ask_user_question。","timeoutMs":1200000}'
```

### 第二轮：根据真实失败继续修正

假设第一轮完成后，实际验收发现 `PostToolUse` 的失败结果没有传递。继续同一会话：

```powershell
vetta debug run conversation.continue '{"sessionPath":"<第一轮返回的 sessionPath>","prompt":"实际验收发现 PostToolUse 在工具失败时没有收到 error 信息。请先定位事件映射和持久化记录，修复后重新运行对应验证。不要重做已经通过的部分。失败证据：<粘贴日志或断言>。"}'
```

这种方式让内层 Agent 保留第一轮的代码理解、设计选择和验证上下文，同时由外层 Agent 持续提供新的真实证据。

## 12. 安全建议

- 默认使用 `sandbox`，不要为了绕过环境问题自动升级权限。
- 只有在用户明确授权、目标路径明确且验证命令可信时才使用 `full-access`。
- Prompt 中明确禁止破坏性命令、提交、推送或访问范围外数据。
- 对外层 Agent 自动生成的 Ask User 答案同样进行权限判断；问题不能成为扩大授权的方式。
- 不要读取或输出 `action-server.json` 中的 token。
- 会话是普通可见会话，Prompt、工具调用和结果会进入持久化历史，不要写入密钥。

## 13. 常见错误

| 错误码 | 常见原因 | 处理方式 |
|---|---|---|
| `LOCAL_RPC_SERVER_NOT_FOUND` | 端点文件不存在或配置目录不一致 | 启动开发 App，确认 CLI 与 App 使用同一 Vetta 配置目录 |
| `LOCAL_RPC_SERVER_UNREACHABLE` | 端点指向已退出的进程 | 重启开发 App，再调用 `debug search` |
| `DEBUG_NOT_AVAILABLE` | 连接的是打包版或未注册 Debug runtime 的实例 | 改为运行开发版 Desktop App |
| `DEBUG_NOT_FOUND` | 能力 ID 错误或连接到旧实例 | 执行 `debug search`，必要时重启开发 App |
| `DEBUG_INVALID_INPUT` | JSON 无效、字段多余、UUID 或参数范围错误 | 执行 `debug describe`，按 schema 修正输入 |
| `DEBUG_SESSION_BUSY` | 同一会话已有 Debug 操作 | 保存现有 `operationId` 并 `wait` / `abort`，不要并发 continue |
| `DEBUG_SESSION_LOCKED` | 会话被其他运行时持有写锁 | 结束占用方后重试，不要复制或直接改写 JSONL |
| `DEBUG_OPERATION_NOT_FOUND` | App 已重启、ID 写错或终态记录过期 | 使用 `sessionPath` 重新 `continue` |
| `DEBUG_INTERACTION_NOT_PENDING` | 问题已由用户或另一个回答方解决 | 调用 `conversation.wait`，不要重复提交答案 |
| `DEBUG_CONVERSATION_TIMEOUT` | 本轮超过 `timeoutMs` | 检查是否卡在工具、网络或权限；合理增加超时或中止 |
| `DEBUG_CONVERSATION_FAILED` | 模型、工具或运行时失败 | 保留错误证据，修复环境后通过 `sessionPath` 继续 |

## 14. 验收清单

一次自动化开发任务只有满足以下条件才算闭环：

- [ ] 会话出现在预期项目的普通会话列表中；
- [ ] `create` / `continue` 到达明确终态；
- [ ] 所有 `input_required` 都已回答或明确取消；
- [ ] Agent 回答 Ask User 后，Renderer 面板自动关闭；
- [ ] 历史 Ask User 卡片显示最终答案；
- [ ] 代码修改与任务范围一致；
- [ ] 执行了功能级验证，而不只是格式或类型检查；
- [ ] 验证失败时使用同一 `sessionPath` 继续修正；
- [ ] 最终结果包含可复查的命令、日志、产物或行为证据；
- [ ] 没有未经授权的提交、推送或权限扩大。
