# Changelog

All notable changes to `@vetta-org/theme-ui` are documented in this file.

## [Unreleased]

### Added

- `./plugin-ui` 新增 `VettaKbd`（及 `VettaKbdProps` / `VettaKbdSize` / `VettaKbdKey` / `VettaKbdPlatform` 类型）：插件可以把快捷键绑定渲染成宿主同款浮雕键帽，平台符号由组件自己处理，插件不必自己维护 ⌘ / Ctrl 映射。按「只开放组件」的约定，键位解析函数（`resolveKbdKeys` / `describeKbdKeys`）仍在 `./shared`，不进插件合同。
- `./plugin-ui` 新增 `MotionSelect`、`SettingSection`、`SettingRow`、`SettingHeading`（及相应类型）：设置页同款的下拉与设置项卡片开放给插件，与已有的模型选择器视图一样是纯展示组件。
- 新增 `./markdown` 公开入口：局部 Markdown definition、remark/rehype 与元素扩展，以及可组合的 `CodeBlock`。Chat 与活动面板预览共享扩展定义，原 `chat/TextBlockView` 保留转导出。
- 流式 Markdown 只把已经闭合的代码围栏冻成稳定块，后续 token 只重跑尾块；空行不再拆段，避免把松散列表和缩进代码拆进多个文档。代码高亮在围栏仍在增长或滚出视口时改为等宽纯文本，避免热路径反复跑 Shiki。
- `MessageFeed.VirtualList` 开放 `totalListHeightChanged` 事件，宿主可以在动态消息完成测量后维护自己的滚动锚点策略。
- `./shared` 新增 `VettaKbd`：把 `"mod+shift+k"` 这类快捷键串渲染成浮雕键帽（与应用快照键盘预览同一套键帽阴影），`mod` / `ctrl` / `alt` 等 token 按平台取值——macOS 用 ⌘ ⌥ ⌃ ⇧ ⏎ ⎋ 等硬件符号，Windows/Linux 用单词；单个键位也可写成 `{ mac, windows, linux }` 对象表达分系统文案。键面用前景色叠层而非固定底色，放在 card、muted 字段或 popover 菜单上都看得出凸起。

### Changed

- `ShortcutRecorderView` 不再接收 `formatShortcut`：绑定值改由 `VettaKbd` 渲染成键帽，宿主只需提供 `eventToShortcut`。触发器外观改为与设置页下拉（`SELECT_TRIGGER_CLASS`）同皮：无可见边框、`bg-muted` 底、悬停 `bg-accent`。
- 思考中卡片的入场改为 CSS grid 过渡
- 文件树改为按行高虚拟化：只挂载可见文件行，框选按几何命中，滚出视口的文件仍能被选中；重命名、拖拽和目录展开顺序与原来一致。选中后的拖拽快照按行与选区记忆，目录刷新时不再重建无关条目。
- `SidebarPanel` 新增 `panelRef`，`SidebarModel` 新增 `setPanelRef`：宿主在拖拽宽度时直接往面板元素写 `style.width`，`width` 作为 committed 值只在松手时由 React 写回。左栏占位仍用 committed 值，因此拖拽期主内容区不重排。
- `SidebarDock` 改为抽屉式过渡并新增必填 `width`（px，与侧边栏面板宽度同源）：占位宽度在切换瞬间落到终值、不参与过渡，面板脱离占位盒子用 `transform` 滑动，主内容区因此只重排一次；子树挂过一次不再随收起卸载，收起态带 `inert` + `aria-hidden`（也是「左栏不在位」的样式钩子）。宿主需传入 `width`，并把依赖「收起时左栏节点不存在」的选择器改为按 `inert` 判定。
- `MessageFeed.VirtualList.children` 改为单一逐项渲染函数，不再接受声明式 List/Footer 子元素；Footer 在同一 Root 中正常组合并 Portal 到虚拟列表末尾。外部消费者需按 Desktop 的消息列表扩展指南迁移。
- 为 Footer Portal 声明 ReactDOM 19 peer dependency。

## [0.1.1] — 2026-09-14

### Fixed

- 依赖 `@vetta-org/theme-sdk` 与 `@vetta-org/ui` 改用 registry semver。0.1.0 把它们以
  `workspace:*` 发了出去，而那是 bun/pnpm 的协议、npm 不认，导致该版本在任何地方都装不上。
  仓库内仍解析到本地包（版本匹配），行为不变。

## [0.1.0] — 2026-09-14

首次发布到 npm。此前只作为 workspace 包在仓库内引用，但官方能力市场里的 shimo 插件依赖它，
没有它该插件在任何干净环境都装不上。

宿主成品 UI。其中 `./plugin-ui` 是**有意收窄**的插件面：插件通过 Module Federation 共享宿主的同一份实例，npm 依赖只用于编译期类型。

### Changed

- 包名由 `@vetta/theme-ui` 改为 `@vetta-org/theme-ui`：`@vetta` scope 不属于本账号，公开包统一
  发在 `@vetta-org` 下（与 plugin-sdk / plugin-vite / plugin-cli / ui 一致）。
