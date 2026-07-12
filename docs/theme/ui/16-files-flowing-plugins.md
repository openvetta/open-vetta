# Batch 16 — file-explorer / file-preview / downloads / flowing / flowing-chat / plugins

## 状态

**done**

## 本批拆分 + 迁入

| 组件 | 数据层（desktop） | UI 层（theme-ui / desktop View） | 状态 |
|------|-------------------|----------------------------------|------|
| ConfirmDeleteDialog | `useConfirmDeleteDialogModel`（i18n + host Button slots） | `file-explorer/ConfirmDeleteDialogView` | split_ok |
| FileContextMenu | `useFileContextMenuModel`（IPC / rename atom / i18n） | `file-explorer/FileContextMenuView` | split_ok |
| FilesPanel | `useFilesPanelModel`（atoms / tree / Button slots） | `file-explorer/FilesPanelView` | split_ok |
| FileTree | `useFileTreeViewModel`（rename atom / empty label） | `file-explorer/FileTreeView` | split_ok |
| FileTreeNode | `useFileTreeNodeModel`（context menu / rename atoms） | `file-explorer/FileTreeNodeView` | split_ok |
| FilePreviewDialogView | desktop adapter：lightbox / body / thumbnails | `file-preview/FilePreviewDialogView` + slots | migrated |
| FilePreviewView | labels + `renderBody` → `PreviewBody` | `file-preview/FilePreviewView` | migrated |
| LightboxImage | `useLightboxImageModel` / `useImageSrc`（fs.readFile） | `file-preview/LightboxImageView` | split_ok |
| PluginFilePreview | `usePluginFilePreviewModel`（PluginPreviewFile IPC） | `file-preview/PluginFilePreviewView` | split_ok |
| PreviewContent / PreviewBody | `usePreviewBodyModel`（atoms / watch / load） | `file-preview/PreviewBodyView` | split_ok |
| DownloadsPage | `useDownloadsPageModel`（list atom / router / IPC） | `downloads/DownloadsPageView` | split_ok |
| FlowingPanel | `useFlowingPanelModel`（pending atom + Button slots） | `flowing/FlowingPanelView` | split_ok |
| FlowingWorkflow | `useFlowingWorkflowModel`（API + FlowGraph slot） | `flowing/FlowingWorkflowView` | split_ok |
| WorkflowBindDialog | `useWorkflowBindDialogModel` | desktop `WorkflowBindDialogView`（Dialog） | split_ok + host_primitive_hold |
| WorkflowProgress | `useWorkflowProgressModel`（API + Button slots） | `flowing/WorkflowProgressView` | split_ok |
| ChatBubble | `useChatBubbleModel`（attachment URL / preview atoms） | `flowing-chat/ChatBubbleView` | split_ok |
| ChatPanel | `useChatPanelModel`（SSE / API / slots） | `flowing-chat/ChatPanelView` | split_ok |

### Plugins（non_goal）

| 路径 | 状态 |
|------|------|
| `plugins/components/PluginActivityTabPanel.tsx` | non_goal |
| `plugins/components/PluginGlobalSlotHost.tsx` | non_goal |
| `plugins/components/PluginTurnCardHost.tsx` | non_goal |
| `plugins/runtime/plugin-i18n.tsx` | non_goal |

reason: `plugin private host shell / i18n runtime; out of default themable UI`（非 FORBIDDEN_SPLIT_WAIT）

### 路径速查

**theme-ui（新增域）**

- `packages/theme-ui/src/file-explorer/*`
- `packages/theme-ui/src/file-preview/{FilePreviewDialogView,FilePreviewView,LightboxImageView,PluginFilePreviewView,PreviewBodyView,types}.ts(x)`
- `packages/theme-ui/src/downloads/*`
- `packages/theme-ui/src/flowing/*`
- `packages/theme-ui/src/flowing-chat/*`

**desktop model**

- `packages/desktop-app/src/renderer/domains/file-explorer/hooks/use*Model*`
- `packages/desktop-app/src/renderer/domains/file-preview/hooks/use*Model*`
- `packages/desktop-app/src/renderer/domains/downloads/hooks/useDownloadsPageModel.ts`
- `packages/desktop-app/src/renderer/domains/flowing/hooks/use*Model*`
- `packages/desktop-app/src/renderer/domains/flowing-chat/hooks/use*Model*`

### 模式

- model：atoms / IPC / router / API / i18n → plain props（labels / slots / 预解析）
- container：`useXxxModel()` → `*View`（≤50 行 thin-model-container → `split_ok`）
- view：plain props；禁止 jotai / `window.vetta` / router / react-i18next / `@shared/*` / `@domains/*`
- host Button/Dialog：slots 或 desktop View + `host_primitive_hold`
- file-preview：对齐既有 `@vetta/theme-ui/file-preview` 导出；`package.json` 新增 file-explorer / downloads / flowing / flowing-chat
- inventory：`non_goal` deferral 对 dataHeavy 也生效（scripts 补丁）

### 验收

- inventory：本批 A 路径 → `split_ok` / `migrated` / `host_primitive_hold`；B 路径 → `non_goal`
- `bun packages/theme-ui/scripts/verify-purity.mjs`
- `bun run check`
