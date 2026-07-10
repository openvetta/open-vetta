# App Actions 开发说明

## Action 的作用

App Action 是 agent 调用 Vetta Desktop 能力的受控 RPC 边界。它负责：

- 向 agent 描述有哪些能力、如何调用以及调用结果的语义。
- 在主进程中校验不可信输入。
- 根据调用来源和操作风险决定是否请求用户确认。
- 将经过确认的输入交给现有 service 或桌面能力执行。
- 将业务错误转换为稳定、可理解的 Action 错误。

Action 不应复制 service 的业务实现，也不应把 renderer 的展示逻辑放进主进程。优先复用已有 service、IPC 和领域类型。

## Agent 接口与执行校验

两类定义用途不同，不要互相替代：

- `inputSchema`、`examples` 和 `help` 返回值是给 agent 阅读的能力说明。agent 不知道应用内部实现，因此所有影响正确调用的信息都必须在这里明确说明。
- Zod schema 和 `validateInput` 是运行时安全边界，负责拒绝无效输入。不要因为 service 内部还有参数校验就堆叠重复的手写类型校验。

Agent 说明只暴露完成操作所需的信息，包括：

- operation、必填参数、字段范围、默认值和清空语义。
- ID 应从哪个查询结果取得。
- 操作的关键副作用、前置状态和返回行为。
- 更新操作是局部更新还是完整替换。
- 需要 agent 主动选择的交互方式。

不要暴露 renderer 组件名、IPC 通道、存储格式等内部细节。若审批界面可由 operation 自动确定，不要要求 agent 传 `approvalUi`。

查询类 Action 宜提供 `help` operation，集中返回同一领域全部 Action 的 `inputSchema`、示例和必要 guidance。示例必须是有效且具有代表性的输入。

## 推荐目录结构

每个领域使用独立目录：

```text
<domain>/
  <domain>.schema.ts  # Zod schema、输入类型、validateInput
  <domain>.action.ts  # metadata、agent 帮助、审批策略、run
  actions.ts          # 注册该领域的 Action
```

在根目录 `index.ts` 的 `createAppActionRuntime` 中注册新领域。一个 Action 应围绕一致的权限和审批策略；如果查询、写入、执行控制的风险不同，应拆成多个 Action。

当前已注册领域：
`appearance`、`navigation`、`batch-tasks`、`scheduler`、`models`、`mcp`、`skills`、`projects`、`settings`、`knowledge`、`plugins`、`im`、`webhook`、`downloads`、`updater`。

审批 UI：
- `appearance` / `navigation` / `batch-tasks` / `scheduler`：各有专用 presentation 与组件。
- 其余 manage Action：**按 operation 拆 presentation**（如 `mcp.upsert` / `mcp.set-enabled` / `mcp.remove`），schema 为每种 operation 填默认 `approvalUi`；renderer 下 `shared/action-approval/manage/<domain>/` 一 operation 一组件（对齐 scheduler 拆分方式）。共用 Frame + ApprovalParts，禁止把 create/update/delete 堆进同一 god component。`generic` 仅兜底。

查询结果若含密钥字段必须脱敏（`***`），不要把脱敏值写回 upsert。市场安装 skill（需 archive buffer）与 Flowing 远端流转仍走 GUI，不在 Action 面硬做。

## 创建 Action

1. 在 schema 文件中用 Zod 定义输入，优先使用带 `operation` 的 discriminated union。
2. 导出 Zod 推导类型和 `validateInput`，失败时抛出 `ACTION_INVALID_INPUT`，并返回可定位字段的 issues。
3. 在 action 文件中定义稳定的 `id`、`domain`、`title`、`summary`、`availability` 和细粒度 `permission`。
4. 补充 `keywords`（中英文同义词、用户口头说法、常见 operation 名），供 `actions.search` 相关性检索；不要只靠 id/title。
5. 编写面向 agent 的 `inputSchema`、`examples`，必要时增加 `help` operation。
6. 只在有副作用且需要确认时配置 `approval` 和 `requiresApproval`。
7. `run` 调用已有 service，并把领域错误转换为 `ActionError`；返回值必须可序列化为 `JsonValue`。
8. 在领域 `actions.ts` 和根 `index.ts` 注册。
9. 若新增审批 presentation，同时在 renderer 的 action approval 路由中实现对应 UI。

## 审批与可编辑输入

运行流程为：

```text
查找 Action -> validateInput -> 判断是否审批 -> 用户确认/编辑
-> 再次 validateInput -> run
```

审批 UI 返回修改后的 `input` 时，runtime 会再次调用该 Action 的 `validateInput`。因此参数合法性只需由 Action schema 维护，不要在审批组件中复制完整的领域校验；UI 只做提供良好编辑体验所需的即时约束。

审批约定：

- 涉及创建或更新且允许用户调整内容时，使用右侧抽屉，并返回完整、可执行的 Action input。
- 仅请求用户确认的操作使用共享 `Dialog` 组件。
- 授权弹窗不得通过点击遮罩关闭，避免误操作；必须显式确认或拒绝。
- 使用 `renderer/shared/components/ui` 中的组件，不要手写弹窗、遮罩或焦点管理。
- `approval.defaultPresentation` 必须存在于 `presentations` 中，presentation id 不得重复。
- 同一个 Action 包含多种 operation 时，schema 应为每种 operation 填入正确的默认 `approvalUi`，避免全部落到 Action 级默认界面。
- 只有 agent 确实需要选择交互方式时，才在帮助中暴露 `approvalUi`。

## 更新操作

更新 Action 应优先采用 patch 语义：

- agent 只提交用户要求修改的字段，不要先查询并复制未修改字段。
- `inputSchema/help` 必须说明 `null`、空数组和字段省略分别代表清除、替换还是保持不变。
- 可编辑审批 UI 应根据稳定 ID 主动读取当前实体，将当前完整配置与 agent patch 合并后展示。
- 合并优先级为“当前配置 < agent patch < 用户最终编辑”。
- 无法取得当前实体时，不得让用户以不完整数据继续确认更新。
- 执行层仍提交 service 所需的 patch；不要把仅为 UI 补全的字段误当成 agent 修改意图。

renderer 页面中的 atom 可能尚未加载，不能作为获取完整实体的唯一来源。可将 atom 用作缓存，但审批 UI 必须能够通过 preload API 或已有查询接口独立加载数据。

## 错误与边界

- 使用稳定错误码，例如 `ACTION_INVALID_INPUT`、`ACTION_NOT_FOUND` 或领域 service 提供的错误码。
- 错误消息应告诉 agent 失败原因和可采取的下一步，不要泄露无关内部实现。
- `context.source` 用于区分内部调用和 `local-server` 调用；当前写操作通常只对 `local-server` 请求审批。
- 尊重 `context.signal`，不要吞掉取消和超时。
- 不要返回 class 实例、`undefined`、函数或其他非 JSON 数据。

## 验证清单

- Action 可被 catalog 搜索和 describe。
- agent 仅根据 metadata/help 就能构造正确输入。
- 每个 operation 的有效、无效输入均由 schema 正确处理。
- 有副作用的外部调用会进入正确审批 UI。
- 审批中编辑后的输入会再次通过同一个 schema 校验。
- 更新审批展示完整当前配置，但执行时保持正确的 patch 语义。
- 取消、拒绝、超时和 service 错误返回稳定错误。
- 修改 desktop 代码后，在 `packages/desktop-app` 运行 `bunx tsc --noEmit`，并在仓库根目录运行 `bun run check`。
