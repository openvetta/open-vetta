# 通过左侧“更多”进入插件页

本文记录如何用 Playwright CLI 操作 Vetta Desktop 左侧主导航的“更多”下拉层，并进入插件页。CDP 附着和主窗口选择见 [总操作手册](../README.md)。

## 推荐操作

当前页面可能同时存在多个 `navigation` 和多个名为“更多”的按钮。应先限定左侧主导航，再打开弹层；随后按实际可访问结构从 `dialog` 中点击“插件”：

```powershell
playwright-cli -s=vetta run-code "async (page) => { const primaryNavigation = page.getByRole('navigation').first(); const more = primaryNavigation.getByRole('button', { name: '更多', exact: true }); await more.click(); if (await more.getAttribute('aria-expanded') !== 'true') throw new Error('更多弹层未打开'); const plugin = page.getByRole('dialog').getByRole('button', { name: '插件', exact: true }); await plugin.click(); await page.waitForFunction(() => location.hash.toLowerCase().includes('plugin')); return { url: page.url(), headings: await page.getByRole('heading').allTextContents(), dialogVisible: await page.getByRole('dialog').isVisible().catch(() => false) }; }"
```

成功结果应同时满足：

- URL 以 `#/plugins` 结尾。
- 页面包含一级标题“插件”。
- “更多”弹层已经关闭。

本次实测结果：

```json
{
  "url": "http://127.0.0.1:3000/#/plugins",
  "headings": ["插件", "移动UI预览", "Lottie Studio"],
  "dialogVisible": false
}
```

## 问题与难点

### 1. 页面上存在两个“更多”按钮

左侧主导航有一个“更多”，会话列表标题区域也有一个“更多”。直接使用以下 locator 会产生歧义：

```text
getByRole('button', { name: '更多' })
```

应通过容器限定目标。本次使用第一个 `navigation` 作为左侧主导航，再查找名称完全匹配的按钮：

```text
page.getByRole('navigation').first().getByRole('button', { name: '更多', exact: true })
```

### 2. 弹层不是标准 menu

第一次尝试假设它使用 `role=menu`，点击后等待：

```text
[role=menu]:visible
```

等待最终超时。重新捕获 snapshot 后确认，实际结构是：

```text
dialog
  button "批量任务"
  button "场景"
  button "插件"
```

因此不能根据视觉外观预设 ARIA 语义。正确做法是点击触发器后重新 snapshot，再按真实的 `dialog → button` 结构定位。

### 3. 打开弹层和完成导航需要分别验证

按钮的 `aria-expanded="true"` 只能证明弹层已打开，不能证明已经进入插件页。点击“插件”后还需要验证：

- 路由切换到 `#/plugins`。
- 页面标题出现“插件”。
- `dialog` 消失。

三项结合可以区分“点击被接收”“路由已切换”和“目标页面已渲染”。

### 4. 不应依赖 tab 下标或当前业务页面

本次主窗口恰好是 tab `2`，操作前页面恰好位于 `#/settings/appearance`，这些都不是稳定前提。重新附着时应按标题和 URL 选择 `Vetta Desktop`，进入插件页时只依赖全局左侧导航的语义结构。

## 下拉层自动化通用原则

1. 先用容器和可访问名称精确定位触发器。
2. 点击后检查 `aria-expanded` 或弹层可见性。
3. 不预设 `menu`、`listbox` 或 `dialog`，先读取 snapshot。
4. 在实际弹层容器内定位目标项，避免全页同名元素。
5. 最终同时验证目标路由、关键内容和弹层消失。
