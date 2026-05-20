# 0001 — macOS 状态栏图标遵循平台惯例，不与 Win/Linux 行为对齐

- 状态: Accepted
- 日期: 2026-05-20

## 背景

桌面端在 Windows 系统托盘 / Linux 通知区已经有图标（`tray-manager.ts`）。需求是在 macOS 上「也有这个功能」。

macOS 上与 Win/Linux 系统托盘语义对等的位置是顶部菜单栏右侧的 NSStatusItem（Electron `Tray` API 在 Mac 上即映射到此），并非 Dock。但 macOS 状态栏在交互、视觉、应用生命周期上有强惯例：

- 图标应为 **template image**（单色 + alpha），由系统按菜单栏深/浅色自动反相
- 左键点击通常**直接展开菜单**，而非切换主窗口显隐
- 关闭主窗口默认即「隐藏窗口、应用留在 Dock」，不需要也不期望 Win/Linux 那种「关闭=隐藏到托盘」的拦截
- 状态栏图标是辅助入口，而非主入口；不替代 Dock

## 决策

macOS 也创建 `Tray`，但**与 Win/Linux 走分支化行为**，刻意不追求三平台 UI 一致：

1. **图标资产**：Mac 直接复用 `build/icon.png`（256×256 彩色 logo）缩放到 22×22，**不**走 template image。Win/Linux 继续使用 `icon.ico` / `icon.png`。

   备注：曾考虑用单色 template 图标（`setTemplateImage(true)`）以跟随菜单栏深/浅色反相，但现有品牌图标 `icon-dock.png` / `icon.png` 整个圆角方形背景都是不透明的，alpha 通道即整块方块，template 模式下渲染为实心圆角方块（见 2026-05-20 反馈截图）。在拿到设计师产出的单色矢量前，优先保留品牌色，放弃自动反相
2. **左键点击**：Mac 不绑定 `tray.on("click")`，由 `setContextMenu` 默认行为弹出菜单；Win/Linux 维持「切换主窗口显隐」
3. **关闭按钮**：Mac 不接入 `hideToTrayOnClose` 分支，保留 Electron 默认（隐藏窗口，应用留 Dock）；Win/Linux 维持现有 `!isMac && getHideToTrayOnClose()` 拦截
4. **菜单内容**：Mac 仅「显示/隐藏窗口 + 退出 Vetta」两项，不暴露 `hideToTrayOnClose` 切换（在 Mac 上该状态无实际作用，暴露反而误导）
5. **Dock 图标保留**，不走 LSUIElement 路线

## 备选方案

- **三平台行为对齐**（Mac 也走 `tray.on('click')` 切窗、菜单显示「隐藏到托盘/退出」切换）。被拒：菜单切换项在 Mac 上不会改变 close 行为，是死开关；左键切窗与 Mac 用户对菜单栏的肌肉记忆冲突
- **Mac 改为菜单栏 only 应用**（`app.dock.hide()` / `LSUIElement`）。被拒：超出「也要个托盘图标」的需求范围，且影响 Cmd+Tab 与主窗口体验
- **不在 Mac 加状态栏，仅增强 Dock 右键菜单**（`app.dock.setMenu`）。被拒：与 Win/Linux 「托盘」不对等，关闭窗口后入口消失

## 影响

- 跨平台代码出现明确的 `process.platform === "darwin"` 分支，`tray-manager.ts` 内集中维护
- `iconPath` 仍服务于窗口/Dock 图标，状态栏图标与之解耦（独立 `trayTemplate.png`）
- Mac 状态栏图标当前是 22×22 缩放后的彩色 logo，retina 屏上可能略糊；后续若需要单色 + 深浅色自适应，需补一份真正镂空（非全不透明背景）的单色矢量图标，并切回 `setTemplateImage(true)`
