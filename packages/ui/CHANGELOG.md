# Changelog

All notable changes to `@vetta-org/ui` are documented in this file.

## [Unreleased]

### Added

- 新增 `ColorSwatchPicker` / `ColorPickerPanel`（`./color-swatch-picker` 入口，根入口同时导出）：色点选择器 + 宿主取色面板。预设色点用同色描边标出选中态，`allowCustom` 时末尾多一枚彩虹色点可点开面板——支持吸管取屏幕色（`EyeDropper` 不可用时按钮不渲染）、明度/饱和度拖拽（含方向键）、色相滑轨，以及粘贴 hex / `rgb()` / `hsl()`。面板按「去线留白」做：无边框，靠圆角、留白与底色分层。`defaultOption` 可在最前面多一枚空心色点表示「跟随主题」，选中时回传 `null`——`value: string | null` 里的 null 终于有了产出它的入口；`showLabel={false}` 供外层已有标题的场景去掉色点下方的颜色名。
- 新增 `./color` 颜色纯函数（根入口同时导出）：`parseColor` / `normalizeColor` / `toHex` / `isSameColor` / `rgbToHsv` / `hsvToRgb` / `hueColor`。只做无状态换算，不碰 DOM；alpha 一律忽略，输出统一为 `#rrggbb`。
- 新增 `Stepper`（`./stepper` 入口，根入口同时导出）：数字步进器，`− 数值 +` 三段式，受控 `value` / `onValueChange` 配 `min` / `max` / `step`，数值可点进去直接改（回车或失焦提交、Esc 撤销，非法输入按撤销处理），按住加减号连续变化，到边界时按钮禁用。`precision` 缺省按 `step` 推断小数位，避开浮点尾巴。
- 新增 `SessionTopItem` / `SessionTopGroup`（`./session-top-item` 入口，根入口同时导出）：会话页顶栏的一项，在 `ButtonGroupItem` 之上加三种点击行为——`menuItems` 下拉菜单、`popoverContent` 向下弹出的气泡（内容自定义，传函数可拿到 `close`）、或普通 `onClick`；单独使用时自带胶囊，放进 `ButtonGroup` 则是组内一格。`ButtonGroup` 同时导出 `useInButtonGroup`。
- 新增 `ButtonGroup` / `ButtonGroupItem`（`./button-group` 入口，根入口同时导出）：半透明胶囊按钮组，支持图标、文字、数字 / 红点角标、选中态，`shape` 可选 `pill`（默认）或 `square`。

## [0.1.0] — 2026-09-14

首次发布到 npm。此前它只作为 workspace 包在仓库内被引用，但官方能力市场里的 feishu 与 shimo
两个插件真的 import 了它的组件，没有它们在任何干净环境都装不上。

### Changed

- 包名由 `@vetta/ui` 改为 `@vetta-org/ui`：`@vetta` scope 不属于本账号，公开包统一发在
  `@vetta-org` 下（与 plugin-sdk / plugin-vite / plugin-cli 一致）。

### Added

- 共享 React 组件库，随包发布 TypeScript 源码（`files: ["src"]`），由消费方自行编译。
