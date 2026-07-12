# Batch 00 — 台账与已迁入盘点

## 状态

**done**（台账创建；历史迁入在 commit `9073e84c` 附近）

## 已在 `@vetta/theme-ui` 的模块

### layout

- `AppFrame`, `MainContentFrame`, `SidebarDock`, `SidebarOverlay`, `ResizeHandle`

### appearance

- `ThemeSurface`, image frames（corner / nine-slice / …）

### app

- `AppBackground`

### app-shell

- `DefaultPageHeader`, `PageHeaderFrame`, `PageHeaderContent`, `PageHeaderSidebarTrigger`
- `PageHeaderTitle`, `PageHeaderWindowActions`, `PageHeaderActionGroup`
- `DefaultWindowControls`, `WindowControlButton`

### sidebar

- `DefaultSidebar`（shell + slots：`topBar` / `projects` / `bottomBar`）
- `SidebarPanel`, `SidebarNavigation`, `SidebarNavItemButton`

### chat（部分）

- `InputBarBackground`, NewSession 类型/部分 building blocks

## desktop 保留模式

| 类型 | 位置示例 |
|------|----------|
| Container | `PageHeader`, `WindowControls`, `Sidebar` |
| Model | `usePageHeaderModel`, `useWindowControlsModel`, `useSidebarModel` |
| 注入 slots | desktop `DefaultSidebar` 组装 TopBar / Projects / BottomBar |

## 已知风险（已修 / 待观察）

| 风险 | 处理 |
|------|------|
| theme-ui 独有 iconify 类未生成（窗口最小化/最大化图标无色） | desktop `styles.css` 已 `@source "../../../theme-ui/src/**/*.{ts,tsx}"` |
| `PageHeaderWindowActions` 不再内嵌 connected WindowControls | host 经 `windowControls` / `trailing` 注入 |
| 导航文案 i18n | 在 `useSidebarModel` 解析 label/title |

## 后续批次顺序

1. sidebar 剩余纯叶子与 topBar 纯化  
2. overlays 中无 Dialog 依赖的纯 View  
3. chat  
4. settings / 其它已 Model+View 对  
5. 最终审计与显式暂缓项  

## check

台账文档本身；代码 check 随 batch 01+ 执行。
