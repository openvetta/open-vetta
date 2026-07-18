# 右侧活动面板自动化

本文记录如何用 Playwright CLI 打开、断言并单独截取 Vetta Desktop 的右侧活动面板。CDP 附着和主窗口选择见 [总操作手册](../README.md)。

## 最短打开路径

前提是当前 Playwright session 已经选中 `Vetta Desktop` 主窗口。面板确定为关闭状态时，应用内只需要一次点击：

```powershell
playwright-cli -s=vetta click "getByRole('button', { name: '打开活动面板' })"
```

如果 Agent 不知道面板当前是否已经打开，使用幂等命令。它只在宽度为 `0` 时点击，避免把已经打开的面板再次关闭：

```powershell
playwright-cli -s=vetta run-code "async (page) => { const panel = page.locator('aside'); const before = await panel.boundingBox(); const clicked = !before || before.width === 0; if (clicked) await page.getByRole('button', { name: '打开活动面板' }).click(); const after = await panel.boundingBox(); return { clicked, visible: Boolean(after && after.width > 0), width: after?.width ?? 0 }; }"
```

成功条件：

- `visible === true`
- `width > 0`
- “文件”“浏览器”“Git”等标签可见
- 切换按钮的可访问名称变为“关闭活动面板”

## 单独截图

直接对 `aside` 执行 locator screenshot 时，本次实测曾因面板布局持续被判断为不稳定而超时。更稳定的方法是取得 bounding box，再用页面级截图的 `clip` 参数裁剪：

```powershell
playwright-cli -s=vetta run-code "async (page) => { const panel = page.locator('aside'); const box = await panel.boundingBox(); if (!box || box.width === 0) throw new Error('活动面板不可见'); const output = 'C:/path/to/activity-panel.png'; await page.screenshot({ path: output, clip: { x: box.x, y: box.y, width: box.width, height: box.height }, animations: 'disabled', caret: 'hide' }); return { output, width: box.width, height: box.height }; }"
```

实测生成的独立截图尺寸为 `360 × 734`，只包含活动面板，没有包含左侧导航和会话正文。

## 问题与难点

### 1. 关闭状态仍出现在 snapshot 中

面板关闭时，`aside` 的后代仍可能保留在 accessibility tree，snapshot 中依然会出现“文件”“浏览器”“Git”等文案。仅检查文本会产生假阳性。

本次实测尺寸变化：

```text
关闭：width = 0
打开：width = 360
```

因此应以 bounding box 宽度大于 `0` 作为主要可见性断言。

### 2. 切换按钮不是幂等操作

“打开活动面板”和“关闭活动面板”是同一个切换按钮。无条件点击会让自动化结果依赖初始状态。需要先检查面板宽度，或者根据按钮当前可访问名称决定是否点击。

### 3. 元素截图可能等待稳定性超时

Playwright CLI 的元素截图会等待目标稳定；活动面板的布局或动画可能使该等待超时。页面级截图加固定 `clip` 不需要再次滚动目标元素，适合这种已经位于视口内的固定面板。

## 实测结果

日期：2026-07-18

```json
{
  "clicked": true,
  "visible": true,
  "width": 360,
  "height": 734
}
```

在面板保持打开时再次执行幂等命令，返回 `clicked: false`，没有改变页面状态。
