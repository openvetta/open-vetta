# Vetta Debug + Playwright CLI 常见问题

本文是本目录流程的**常驻踩坑说明**：Agent / 开发者在按 [README](./README.md) 做 UI 验收时，把已知问题与固定处理方式记在这里，避免重复踩坑。

- 操作步骤以 README 为准；这里只补充「会翻车的细节」。
- 专题场景见 [ui-automation/](./ui-automation/)。
- 下文问题多来自 Windows 开发版首次闭环验收（约 2026-07），之后有新坑继续往这里追加。

## 1. 默认 sandbox 阻断会话创建

第一次调用 `conversation.create` 可能失败：

```text
Sandbox is unavailable on win32 (unsupported_host_option).
unknown argument: --capabilities
```

这是当前 Windows sandbox host 与调用参数不兼容，不是 CDP 或 Playwright 问题。若本次 prompt 风险可接受，可显式使用 `executionMode: "full-access"`。

自动化流程不得把这种失败处理成无条件权限升级。正确策略：

1. 报告 sandbox 失败原因。
2. 判断任务是否允许 full access。
3. 只有用户授权或既定开发策略允许时才重试。

## 2. Debug CLI 的 JSON 是位置参数

错误尝试：

```powershell
vetta debug run ui.info --input '{}'
```

CLI 返回 `Unexpected argument: {}`。当前契约是：

```text
vetta debug run <debug-id> [json-input]
```

`ui.info` 无参数时直接运行 `vetta debug run ui.info`。复杂 JSON 在 PowerShell 中建议用 `ConvertTo-Json -Compress` 生成单一位置参数，减少引号转义问题。

## 3. Playwright 默认未必选中主窗口

CDP 常同时暴露多个页面 target，例如：

1. Vetta Quick Panel
2. Vetta Pet
3. Vetta Desktop
4. DevTools

附着后当前 tab 可能是 Pet 或 Quick Panel。如果直接 snapshot，会误以为主应用侧边栏不存在。

处理：每次操作主窗前运行 `tab-list`，按标题和 URL 选择 **Vetta Desktop**。不能长期写死 tab 下标。

## 4. 本机 Playwright CLI 可能没有 `find`

上游文档展示了 `playwright-cli find`，部分本机版本（如 `0.1.13`）返回 `Unknown command: find`。这是 CLI 版本与文档的差异。

可用替代：

- `snapshot --filename=...` 后读取 YAML 快照。
- 使用 snapshot ref 点击元素。
- 使用 `getByRole(...)` locator。
- 使用 `eval` 对明确文本或 DOM 状态做布尔断言。

团队若依赖 `find`，应锁定并统一 Playwright CLI 版本。

## 5. 新会话不在当前默认「对话」分组

会话以项目 `cwd` 创建（例如 monorepo 根目录），会归到对应侧边栏项目下。UI 若停在默认「对话」分组，首个主窗口快照里可能看不到目标会话。

处理：先展开或进入对应项目，再读该项目的会话列表。UI 验收必须包含业务归属上下文，不能只在整页模糊搜索标题。

## 6. 自动标题改变了侧边栏文本

完整用户消息例如：

```text
Playwright闭环验收 20260718-UI-CDP。请只回复：会话已创建。
```

完成后侧边栏可能变成短标题（如「Playwright闭环验收」）。完整 prompt 不适合作为长期侧边栏 locator。推荐：

- 自动标题定位侧边栏条目。
- 唯一 prompt 标记确认打开后的用户消息。
- 固定回复确认 Agent 输出。

## 7. 打开会话后的首个 snapshot 不完整

点击会话后路由已切换，但首个 snapshot 可能只稳定捕获到 heading，消息区稍后才加载。直接以第一次 snapshot 判失败会产生竞态。

处理：用 locator wait 或 `eval` 等待预期消息出现，再保存最终 snapshot。等业务状态，不要用固定长时间 sleep。

## 8. Renderer 可能已有无关控制台错误

例如既有 React 警告：

```text
Received true for a non-boolean attribute allowpopups.
```

「控制台零错误」不宜作为所有验收的统一门槛。更合适：

- 保存测试前后的错误集合。
- 本次验收只拒绝新增错误。
- 既有问题单独修复或登记。

## 9. Agent 环境里 session 不会「自动」长驻

`playwright-cli -s=vetta attach` 会拉起 daemon，设计上可跨命令复用。但在 Agent 包装的前台 shell 里，命令结束时常随 Job 收掉子进程，daemon 退出后下一轮就变成：

```text
Browser 'vetta' is not open.
```

处理：把 attach **挂为后台长任务**（attach 后 sleep 保活），前台只发 `-s=vetta` 业务命令；不要每次 close / re-attach。详见 [README §3.1](./README.md)。

## 10. 写 Action 超时：先看页面，不要堆脚本

现象：多个 `actions.run` 写操作全部超时；自动化「点确认」仍 fail。

常见真实原因（用 `snapshot` / `run-code` 列按钮可见）：

1. **当前 tab 不是 Vetta Desktop**（连在 Pet / Quick Panel 上点不到审批）。
2. **审批 FIFO 残留**：页面上是上一次的 `拒绝（0:00）` + 旧确认文案（如「保存实验功能」），新请求排在后面。
3. **确认文案不固定**，不是统一的「确认执行」。

正确做法：

1. `tab-list` → 选 **Vetta Desktop**。
2. 列出可见按钮；有超时残留则先拒绝排空或处理完队列。
3. 再发本次 RPC；**看到**本步按钮后再 `click`。
4. 不要封装批量自动审批脚本代替上述观察。详见 [README §3.3](./README.md) 与 [docs/actions](../../actions/README.md)。

## 附录：首次闭环验收摘要（参考）

仅作历史对照，不作为步骤手册。

| 项 | 结果 |
|----|------|
| 平台 | Windows / Electron 34.x / Playwright CLI 0.1.x |
| `ui.info` | `configured` / `reachable` / `targetFound` 均为 true，endpoint `http://127.0.0.1:9223` |
| Debug 会话 | 可创建并完成；侧边栏标题可能被自动缩短 |
| Playwright 断言 | `titleFound` / `promptFound` / `responseFound` 均曾为 true |

结论：Vetta Debug 业务驱动 + Playwright CLI 真实 UI 观察可以形成最小闭环；日常请按 README 操作，按本文处理异常。
