# Vetta Debug + Playwright CLI 首次实测记录

日期：2026-07-18  
平台：Windows  
Electron：34.5.8  
Playwright CLI：0.1.13

## 验收目标

1. 开发版 Electron 开放仅本机可访问的 Renderer CDP。
2. `ui.info` 能发现端点并确认主窗口 target。
3. Vetta Debug 创建正常、持久化、用户可见的项目会话。
4. Playwright CLI 附着同一个 Vetta 实例，在侧边栏找到会话并打开。
5. Playwright 验证完整用户消息和 Agent 回复已经渲染。

## 实际结果

`ui.info`：

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

成功创建的会话：

```text
sessionId:   a928bb67-e405-429c-9b07-8042da2fd551
operationId: 14056495-1e2b-495f-a002-d17fda693ee0
status:      completed
title:       Playwright闭环验收
prompt 标记: 20260718-UI-CDP
Agent 回复:  会话已创建。
```

Playwright 最终断言：

```json
{
  "titleFound": true,
  "promptFound": true,
  "responseFound": true
}
```

结论：Vetta Debug 业务驱动与 Playwright CLI 真实 UI 观察已经形成最小闭环。

## 遇到的问题与处理

### 1. 默认 sandbox 阻断会话创建

第一次调用 `conversation.create` 失败：

```text
Sandbox is unavailable on win32 (unsupported_host_option).
unknown argument: --capabilities
```

这是当前 Windows sandbox host 与调用参数不兼容，不是 CDP 或 Playwright 问题。本次 prompt 只要求返回固定文本，确认风险后显式使用 `executionMode: "full-access"` 完成验收。

自动化流程不得把这种失败处理成无条件权限升级。正确策略是：

1. 报告 sandbox 失败原因。
2. 判断任务是否允许 full access。
3. 只有用户授权或既定开发策略允许时才重试。

### 2. Debug CLI 的 JSON 是位置参数

错误尝试：

```powershell
vetta debug run ui.info --input '{}'
```

CLI 返回 `Unexpected argument: {}`。当前契约是：

```text
vetta debug run <debug-id> [json-input]
```

`ui.info` 无参数时直接运行 `vetta debug run ui.info`。复杂 JSON 在 PowerShell 中建议用 `ConvertTo-Json -Compress` 生成单一位置参数，减少引号转义问题。

### 3. Playwright 默认选中了 Quick Panel

CDP 暴露了四个页面 target：

1. Vetta Quick Panel
2. Vetta Pet
3. Vetta Desktop
4. DevTools

附着后当前页面是 tab `0` 的 Quick Panel。如果直接 snapshot，会误以为主应用侧边栏不存在。

处理方式：每次附着后运行 `tab-list`，按标题和 URL 选择 `Vetta Desktop`。不能长期写死 tab 下标。

### 4. 本机 Playwright CLI 不支持 `find`

上游文档展示了 `playwright-cli find`，但本机版本 `0.1.13` 返回 `Unknown command: find`。这是 CLI 版本与最新文档的差异。

可用替代方案：

- `snapshot --filename=...` 后读取 YAML 快照。
- 使用 snapshot ref 点击元素。
- 使用 `getByRole(...)` locator。
- 使用 `eval` 对明确文本或 DOM 状态做布尔断言。

团队后续如果依赖 `find`，应锁定并统一 Playwright CLI 版本，不能假设开发者的全局 CLI 与最新 README 一致。

### 5. 新会话不在当前默认“对话”分组

会话以 `cwd = C:\develop\yiyun\vetta-mono` 创建，因此它属于 `vetta-mono` 项目。测试开始时 UI 正停留在默认“对话”分组，首个主窗口快照中没有目标会话。

处理方式：先展开或进入 `vetta-mono` 项目，再读取该项目的会话列表。这说明 UI 验收必须包含业务归属上下文，不能只在整个页面模糊搜索标题。

### 6. 自动标题改变了侧边栏文本

完整用户消息是：

```text
Playwright闭环验收 20260718-UI-CDP。请只回复：会话已创建。
```

会话完成后侧边栏已经自动命名为：

```text
Playwright闭环验收
```

因此完整 prompt 不适合作为长期侧边栏 locator。最终采用：

- 自动标题定位侧边栏条目。
- 唯一 prompt 标记确认打开后的用户消息。
- 固定回复确认 Agent 输出。

### 7. 打开会话后的首个 snapshot 不完整

点击会话后，路由已经切换，但首个 snapshot 只稳定捕获到 heading，消息区随后才加载完成。直接以第一次 snapshot 判失败会产生竞态。

处理方式：使用 locator wait 或 `eval` 等待预期消息出现，再保存最终 snapshot。自动化应等待业务状态，不使用固定长时间 sleep。

### 8. Renderer 存在一个无关控制台错误

Playwright 捕获到已有 React 错误：

```text
Received true for a non-boolean attribute allowpopups.
```

它与本次 CDP 和会话创建无关，但说明“控制台零错误”暂时不能直接作为所有验收的统一门槛。更合适的策略是：

- 保存测试前后的错误集合。
- 本次验收只拒绝新增错误。
- 单独修复或登记既有 `allowpopups` 问题。

## 后续建议

1. 统一并锁定 Playwright CLI 版本，避免命令能力漂移。
2. 为项目条目、会话条目和关键会话状态补充少量稳定 `data-testid`，降低对自动标题和 i18n 文本的依赖。
3. 封装“读取 `ui.info` → attach → 选择 Vetta Desktop”的 Agent 操作模板。
4. 后续用同一套流程覆盖 Ask User 面板出现、Agent 回答后消失、历史结果保留。
5. 原生 Dialog、托盘和主进程状态另建 `_electron.launch()` 或 Debug 状态验收，不强行塞进 Renderer CDP 路线。
