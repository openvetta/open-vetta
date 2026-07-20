# Vetta Debug + Playwright CLI 自动化验收

本文说明如何让外层 Agent 同时使用 Vetta Debug 和 Playwright CLI，对正在运行的开发版 Vetta Desktop 做真实 UI 验收。

- Vetta Debug 负责创建、继续和等待真实 Agent 会话。
- Playwright CLI 通过 CDP 附着当前 Electron，负责观察、点击和断言 Renderer UI。
- 两者结合后，Agent 可以根据失败证据继续修改代码并重复验收。

会话操作的完整参数与 Ask User 闭环见 [Vetta Debug 自动化开发手册](../vetta-debug-automated-development.md)。踩坑与已知问题见 [常见问题](troubleshooting.md)。

## 专题文档

- [常见问题（踩坑与处理）](troubleshooting.md)
- [右侧活动面板：打开、断言与单独截图](ui-automation/activity-panel.md)
- [左侧“更多”下拉层：进入插件页](ui-automation/more-menu-to-plugins.md)

## 1. 边界与启用条件

CDP 入口满足以下约束：

- 仅标准 Desktop 开发启动启用；打包版不注册 Vetta Debug，也不开放本入口。
- Electron CLI 子进程不启用。
- 仅监听 `127.0.0.1`。
- 默认端口为 `9223`。
- `VETTA_DEBUG_CDP_PORT` 可以覆盖端口；设为 `0`、`off` 或 `false` 可以关闭。

**Agent 必读：应用未启动时自行启动。** 使用本目录流程前，先按 [自动化开发手册 §3.1.1](../vetta-debug-automated-development.md) 探测本地 RPC / `ui.info`；若 App 未运行，在 `packages/desktop-app` 后台执行 `bun run dev` 并轮询就绪，**禁止**只向用户报“请先启动开发版 Vetta”后结束。已在运行则不要重复启动。

PowerShell 覆盖端口：

```powershell
$env:VETTA_DEBUG_CDP_PORT = "9333"
bun run dev
```

Bash 覆盖端口：

```bash
VETTA_DEBUG_CDP_PORT=9333 bun run dev
```

CDP 没有复用本地 Action RPC 的 bearer token。它虽然只监听本机，但仍允许本机进程操作 Renderer，因此不得在打包环境启用，也不要改为监听 `0.0.0.0`。

## 2. 发现并确认 Vetta Renderer

不要把端口写死在 Agent 提示词里。先通过 Debug capability 获取实际配置：

```powershell
vetta debug describe ui.info
vetta debug run ui.info
```

仓库内 CLI 等价命令：

```powershell
bun packages/cli-app/src/cli.ts debug run ui.info
```

成功结果的关键字段如下：

```json
{
  "configured": true,
  "endpoint": "http://127.0.0.1:9223",
  "reachable": true,
  "targetFound": true,
  "mainWindow": {
    "title": "Vetta Desktop",
    "url": "http://127.0.0.1:3000/"
  }
}
```

开始自动化前必须同时检查：

- `configured === true`
- `reachable === true`
- `targetFound === true`

`reachable` 只能说明端口上存在 CDP 服务，`targetFound` 才能排除端口被其他 Chromium 占用、Agent 实际连错应用的情况。

## 3. 附着正在运行的 Electron

使用固定 session 名，保证后续命令操作同一个 Playwright 会话：

```powershell
playwright-cli -s=vetta attach --cdp=http://127.0.0.1:9223
playwright-cli -s=vetta tab-list
```

### 3.1 Agent 环境：session 必须后台保活

`playwright-cli -s=vetta` 的会话由 **daemon** 承载，attach 成功后可跨 shell 复用，不必每次重新 attach。

但在 **Agent / 工具包装的 shell** 里，前台命令结束后 Job 往往会收掉子进程，daemon 随之退出，后续就会报：

```text
Browser 'vetta' is not open.
```

因此 Agent 侧应把 attach **挂为后台长任务**保活，而不是在每次短命令里 attach 完就结束进程树：

```powershell
# 后台任务（background / 长驻）：attach 后 sleep 保活 Job
playwright-cli -s=vetta attach --cdp=http://127.0.0.1:9223
while ($true) { Start-Sleep -Seconds 3600 }
```

前台业务命令直接用同一 session（**不要**无故 `close`）：

```powershell
playwright-cli list                          # 应看到 vetta: status open
playwright-cli -s=vetta tab-list
playwright-cli -s=vetta tab-select <index>
playwright-cli -s=vetta snapshot
playwright-cli -s=vetta click "getByRole('button', { name: /确认/ })"
```

注意：

- 仅当 App/CDP 挂掉、或主动 `close` / `kill-all` 后才需要重新 attach。
- 不要用「每次 tool 调用都 close + attach」代替后台保活；那既慢又容易连错 tab。
- 本机交互式终端里 daemon 通常能自行存活；**后台保活是给 Agent Job 生命周期用的**。

### 3.2 选择主窗口 tab

Vetta Desktop 会同时创建主窗口、Quick Panel、桌宠窗口，开发模式还可能创建 DevTools。附着后不要假设 tab `0` 是主窗口，应根据标题和 URL 选择：

```powershell
playwright-cli -s=vetta tab-select 2
```

目标应满足：

```text
Title: Vetta Desktop
URL:   http://127.0.0.1:3000/
```

tab 下标会随窗口启停变化；session 保活期间若只开关了 Pet/Quick Panel，下标也可能变。**每次操作主窗前先 `tab-list`，不要写死 index。**

### 3.3 写 Action / 审批弹窗：直接看页面，不要用脚本

App Action 写路径会在主窗弹出审批 UI。验收时：

1. **先看页面**：`snapshot` 或 `run-code` 列出可见按钮文案（不要假设一定是「确认执行」）。
2. **再点对的按钮**：如 `确认开启`、`保存实验功能`、`打开`、`切换语言`、`全部恢复默认` 等。
3. **清干净再测下一个**：若看到 `拒绝（0:00）`，说明上一笔已超时但弹窗还在，FIFO 会堵死后续写 action。

**禁止**再包一层「自动点审批」脚本（PowerShell / 黑盒 `--approve` 批量盲点）。脚本猜不全文案、也看不到残留队列，只会把问题记成超时。

约定与只读复跑说明见 [docs/actions/README.md](../../actions/README.md)。

```powershell
# 示例：看当前主窗按钮
playwright-cli -s=vetta tab-select <Desktop下标>
playwright-cli -s=vetta run-code "async (page) => { const all=page.getByRole('button'); const n=await all.count(); const vis=[]; for (let i=0;i<n;i++){ const t=(await all.nth(i).innerText().catch(()=>'')).replace(/\s+/g,' ').trim(); if (t && await all.nth(i).isVisible()) vis.push(t);} return vis; }"
# 再按看到的 name 点击
playwright-cli -s=vetta click "getByRole('button', { name: '确认开启' })"
```

## 4. 用 Vetta Debug 创建待验收会话

建议在 prompt 中加入本次验收唯一标记，后续可同时验证侧边栏标题和完整消息内容。

PowerShell：

```powershell
$payload = @{
  cwd = "C:\develop\yiyun\vetta-mono"
  prompt = "Playwright闭环验收 20260718-UI-CDP。请只回复：会话已创建。"
  executionMode = "sandbox"
  timeoutMs = 120000
} | ConvertTo-Json -Compress

vetta debug run conversation.create $payload
```

Bash：

```bash
vetta debug run conversation.create '{
  "cwd":"/absolute/path/to/vetta-mono",
  "prompt":"Playwright闭环验收 20260718-UI-CDP。请只回复：会话已创建。",
  "timeoutMs":120000
}'
```

默认应优先使用 `sandbox`。只有 sandbox 已被确认不可用、且任务风险允许时，才显式改用 `full-access`；不要让自动化流程静默升级权限。

保存返回的以下字段：

- `operationId`
- `sessionId`
- `sessionPath`
- `status`
- `assistantText`

这些字段用于业务层验证；UI 层验证不能替代它们。

## 5. 在真实 UI 中定位会话

先捕获快照：

```powershell
playwright-cli -s=vetta snapshot --filename=vetta-main.yml
```

如果会话创建在项目 cwd 下，需要先展开或进入对应项目。可以使用快照 ref：

```powershell
playwright-cli -s=vetta click e86
playwright-cli -s=vetta snapshot --filename=vetta-project-expanded.yml
```

也可以直接使用语义 locator：

```powershell
playwright-cli -s=vetta click "getByRole('button', { name: 'vetta-mono' })"
```

自动标题生成完成后，侧边栏名称可能不再等于完整用户消息。例如本次 prompt 自动命名为“Playwright闭环验收”。因此推荐两步确认：

1. 在正确项目分组内找到自动标题并点击。
2. 打开会话后，用完整唯一标记验证用户消息，用预期文本验证 Agent 回复。

```powershell
playwright-cli -s=vetta eval "() => ({
  titleFound: document.body.innerText.includes('Playwright闭环验收'),
  promptFound: document.body.innerText.includes('20260718-UI-CDP'),
  responseFound: document.body.innerText.includes('会话已创建。')
})"
```

三个字段都必须为 `true`。随后保存验收证据：

```powershell
playwright-cli -s=vetta snapshot --filename=vetta-conversation-loaded.yml
playwright-cli -s=vetta screenshot --filename=vetta-conversation-loaded.png
playwright-cli -s=vetta console error
```

不要只断言“侧边栏出现了某个标题”。那只能证明列表刷新，不能证明打开的是目标 `sessionPath`，也不能证明 Agent 回复正确渲染。

## 6. 推荐的 Agent 闭环

```text
探测 Desktop 是否在线（debug search / action-server.json / ui.info）
  → 未在线：自行后台 bun run dev，轮询直到 RPC 与 CDP 就绪（见手册 §3.1.1）
  → 已在线：不要重复启动
修改实现
  → bun run check
  → 改了 main/preload 时再重启 Desktop 主进程
  → ui.info 确认 CDP target
  → conversation.create / conversation.continue 驱动业务
  → Playwright 选择主窗口
  → snapshot / locator / eval 验证 UI
  → console error + screenshot 保存证据
  → 失败则把证据交回同一开发会话
  → 修复后重复
```

每个验收任务至少应写明：

- 前置状态。
- Vetta Debug 要执行的业务动作。
- Playwright 要查找或点击的元素。
- 最终必须出现和必须消失的 UI 状态。
- 允许忽略的已知控制台错误。
- 截图或 snapshot 的输出位置。

## 7. 结束附着

当前 Vetta 是外部常驻应用，验收完成后使用 `detach`：

```powershell
playwright-cli -s=vetta detach
```

不要使用 `close` 或 `kill-all`，否则可能关闭用户正在使用的 Vetta 窗口或其他 Playwright 会话。

## 8. 当前不能覆盖的范围

CDP 路线主要验证 Electron Renderer：

- 原生文件选择器和系统 Dialog。
- 系统托盘菜单。
- 全局快捷键。
- Electron 主进程内部状态。
- 外部进程是否真实收到 Claude Code Hook。

这些场景需要结合 Vetta Debug 状态、持久化数据、主进程日志或后续 `_electron.launch()` 集成测试，不能仅凭截图判定正确。
