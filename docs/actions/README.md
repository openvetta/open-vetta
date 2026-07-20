# App Action 测试

本目录存放 Vetta Desktop App Action（`vetta action` / 本地 Action RPC）的测试产物与约定。

UI 附着与 session 保活见 [docs/dev/vetta-debug-playwright](../dev/vetta-debug-playwright/README.md)。

## 原则：直接看页面，不要用脚本包一层

写路径（`effect: write`）会挂起审批弹窗。验收时 **Agent 必须用 `playwright-cli` 直接观察与点击主窗**，而不是再写一层「自动点确认」编排脚本。

| 应该做 | 不要做 |
|--------|--------|
| `snapshot` / `run-code` 列出当前按钮文案 | 封装 `run-with-ui-approve.ps1` / 黑盒 `--approve` 盲点 |
| 看到真实按钮后再 `click`（如 `确认开启`、`保存实验功能`） | 写死中文正则列表后批量空转 |
| 先清残留弹窗（尤其 `拒绝（0:00）`）再发新 RPC | 队列堵着还连发写 action，把超时全记成 fail |
| 固定 session 后台保活 + 每次确认 **Vetta Desktop** tab | 每次 close/re-attach、连到 Pet / Quick Panel |

原因（实测）：

1. 审批按钮文案随 presentation 变化（`确认开启` / `保存实验功能` / `打开` / `切换语言` / `全部恢复默认` 等），脚本猜不全。
2. 审批是 FIFO；上一次超时残留（`拒绝（0:00）`）会挡住后续 run，看起来像「全挂」。
3. 脚本把失败收成 `TIMEOUT`，看不清页面上实际是什么对话框。

## 推荐手工步骤（写 action）

```powershell
# 0) session 已后台 attach 保活（见 playwright 文档 §3.1）
playwright-cli list
playwright-cli -s=vetta tab-list
playwright-cli -s=vetta tab-select <Vetta Desktop 下标>

# 1) 若有残留审批：先看再点
playwright-cli -s=vetta run-code "async (page) => { const all=page.getByRole('button'); const n=await all.count(); const vis=[]; for (let i=0;i<n;i++){ const t=(await all.nth(i).innerText().catch(()=>'')).replace(/\s+/g,' ').trim(); if(t && await all.nth(i).isVisible()) vis.push(t);} return vis; }"
# 有「拒绝」则按需拒绝排空，或确认后点对应主按钮

# 2) 后台发起 actions.run（会挂起直到 UI 确认）
#    例如 bun/fetch 调 ~/.vetta/action-server.json 的 /rpc

# 3) 再看页面：确认出现的按钮，再点
playwright-cli -s=vetta snapshot
playwright-cli -s=vetta click "getByRole('button', { name: /确认开启|保存|打开|切换语言|确认执行|确认检查|恢复/ })"
# name 以本步 snapshot / run-code 看到的为准，不要照抄

# 4) 读 RPC 结果文件或 CLI 输出，记 pass/fail
```

只读 query（`*.query` 的 list/get/help）可直接：

```powershell
bun packages/cli-app/src/cli.ts action run general.query '{"operation":"get"}'
bun packages/cli-app/src/cli.ts action run appearance.query '{"type":"get"}'
bun packages/cli-app/src/cli.ts action run navigation.query '{"type":"help"}'
```

无需 Playwright，也不应弹出授权。

> **注意**：`appearance.theme` / `navigation.open` 仅保留写操作；`help`/`get` 已拆到 `appearance.query`、`navigation.query`（`effect: read`）。其余域本来就是 `*.query`（read）+ `*.manage`（write）分离。

## 文件

| 文件 | 说明 |
|------|------|
| [TEST-REPORT.md](./TEST-REPORT.md) | 最新测试报告（人读） |
| [test-results.json](./test-results.json) | 原始用例结果（机读，可选） |
| [run-all-action-tests.mjs](./run-all-action-tests.mjs) | **仅**批量 describe + 只读 run 的辅助脚本；**不要**用它代替写路径的页面操作 |

## 前置

1. 开发版 Desktop 已启动：`cd packages/desktop-app && bun run dev`
2. 系统插件 `vetta-actions` 已启用并能激活（否则 Catalog 为空）
3. CLI 可连本地 RPC（`~/.vetta/action-server.json`）
4. 写路径：`playwright-cli -s=vetta` 已附着且当前 tab 为 **Vetta Desktop**

## 结果含义

- **pass**：RPC 返回成功（写路径须在主窗完成真实确认点击）
- **fail**：错误；写路径失败时应用 snapshot/按钮列表说明原因
- **skip**：破坏性/复杂写操作未执行

## 相关文档

- [Playwright 附着与 session 保活](../dev/vetta-debug-playwright/README.md)
- [常见问题（含审批队列残留）](../dev/vetta-debug-playwright/troubleshooting.md)
