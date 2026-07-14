# UI 扩展点

`ctx.ui` 提供 UI 注册点（消息卡片另见 [message-cards.md](./message-cards.md)）。每个注册都返回 `Disposable`（`{ dispose() }`）；插件卸载时宿主会统一处置，无需手动调用。

> 所有 slot 组件经 Module Federation 与宿主共享 React 单例，可直接用 hook、直接传组件实例。注意[顶层 JSX 陷阱](./styling-and-pitfalls.md#module-federation-顶层-jsx-陷阱)。

会话页相关 slot（活动 Tab、输入栏 toggle、Turn 卡）支持 **`scope_use`**：**fail-closed**——未声明或空数组 = **任何对话场景都不显示**；声明后仅在列出的场景出现（如 `["project", "conversation"]`）。场景 slug 见 [conversation-and-agent.md](./conversation-and-agent.md#scope_use按对话场景限定工具出现范围)。

## 全局浮层 registerGlobalSlot

在 App 根部渲染一个组件（全局浮层 / 对话框 / 常驻 UI）。

- 权限：`ui.slot.global`（缺权限 **warn+noop**）
- 组件：**零 props，自包含**。

```tsx
ctx.ui.registerGlobalSlot({ id: "panel", component: MyPanel });
```

```ts
interface PluginGlobalSlotContribution {
  id: string;                  // 插件内唯一；宿主命名空间化为 `${pluginId}:${id}`
  component: ComponentType;    // 零 props
}
```

典型用途：设置缺失引导弹窗、全局悬浮工具。一个插件可注册多个。

## 文件预览 registerFilePreview

按**文件扩展名**贡献预览组件，渲染在活动面板的文件预览区。

- 权限：`ui.slot.file-preview`（缺权限 **warn+noop**）
- **优先级=仅补空白**：内置已支持的扩展名（image / audio / pdf / docx / markdown / json / 常见文本）插件**抢不到**；只有内置不认、本会掉进文本兜底的扩展名才查插件注册表，**首个匹配胜**。
- 组件收到 `file` prop —— 宿主**不**预读、不替你猜编码。

```ts
interface PluginPreviewFile {
  path: string | null;
  name: string;
  extension: string;       // 小写、不含点
  mime: string;
  size: number;
  readText(): Promise<string>;
  readBytes(): Promise<ArrayBuffer>;
  getUrl(options?: { mediaKind?: "audio" | "video" }): string; // Range 流式 URL
  /** 磁盘变更时回调（防抖）；无真实 path 时为 no-op。返回 Disposable。 */
  watch(listener: () => void): Disposable;
  /** 本地音频元数据（标题/封面等）；不支持时返回 null。 */
  getAudioMetadata?(): Promise<PluginAudioMetadata | null>;
}
```

```tsx
ctx.ui.registerFilePreview({ extensions: ["svg"], component: SvgPreview });
```

完整示例见 `packages/plugins/presets/svg-viewer`、`media-viewer`。

## 活动面板 Tab registerActivityTab

向活动面板注册一个 tab。

- 权限：`ui.slot.activity-tab`（注册 **warn+noop**；`openActivityTab` **抛错**）
- **`scope_use` fail-closed**（必写，否则任何场景不显示）
- 宿主用响应式 TabBar 管理展示；可用 `openActivityTab` 主动打开。attach/可见性与 **会话 cwd** 相关（ADR-0026）
- 插件禁用时 tab 隐藏，重新启用可回来

```ts
interface PluginActivityTabContribution {
  id: string;
  label: string;              // 可用 %catalogKey%（见 i18n）
  icon?: ReactNode;
  component: ComponentType;   // 零 props
  scope_use?: readonly ConversationScenario[]; // fail-closed
}
```

```tsx
ctx.ui.registerActivityTab({
  id: "stats",
  label: "%tab.label%",
  icon: <StatsIcon />,
  component: StatsPanel,
  scope_use: ["project", "conversation"],
});
```

组件零 props。**面板作用域用 `useActivityTab()` 取 cwd**，不要用 `useActiveConversation().cwd` 代替（项目详情页面板 cwd 是项目的，活动会话可能属于别的项目）：

```tsx
import { useActivityTab } from "@vetta-org/plugin-sdk";

function StatsPanel() {
  const { cwd } = useActivityTab();
  // ...
}
```

### openActivityTab

```ts
ctx.ui.openActivityTab(tabId, options?: { width?: number | "max" });
```

编程方式 attach（如需）并激活本插件某个 tab；`width: "max"` 尽量拉满（宿主仍 clamp）。载荷经插件自己的内存状态传递。

示例：`packages/plugins/presets/git`、`externals/mobile-ui-preview`。

## 输入栏动作 registerInputAction

在 AI 输入栏下方加一个**开关型动作按钮**（toggle）。激活时，宿主在每次发送前调用 `decoratePrompt()` 把元数据合并进外发 prompt。

- 权限：`ui.slot.input-action`（缺权限**抛错**）
- **`scope_use` fail-closed**；与 `requiresActiveTool` **取「与」**才显示

```ts
interface PluginInputActionContribution {
  id: string;
  label: string;
  icon?: ReactNode;
  defaultActive?: boolean;
  requiresActiveTool?: string;   // 仅当该 agent 工具在本会话激活时显示
  scope_use?: readonly ConversationScenario[];
  /** 见下文「插件贡献硬隔离」 */
  hardIsolation?: boolean;
  onToggle?(active: boolean): boolean | void;  // 返回 false 可否决激活
  decoratePrompt?(): { metadata?: Record<string, unknown> } | void;
}
```

```tsx
ctx.ui.registerInputAction({
  id: "image-mode",
  label: "%action.imageMode.label%",
  icon: <IconImage />,
  scope_use: ["conversation", "project"],
  requiresActiveTool: "generate_image",
  onToggle: (active) => {
    if (active && notConfigured()) {
      showSettingsGuard();
      return false;
    }
  },
  decoratePrompt: () => ({ metadata: { imageMode: true } }),
});
```

### 软隔离 vs 硬隔离（内置对照）

- **图像生成（软）**：工具不因 toggle 关闭而剥离；`imageMode` 只注入隐形意图提示。
- **知识检索（硬，宿主内置）**：未开 toggle 时本轮剥离 `kb-read` 工具。

### 插件贡献硬隔离 hardIsolation

`hardIsolation: true` 时（ADR-0041）：

- Toggle **默认关**时，该插件的 **tools / skills / MCP / systemPrompt 贡献**不进入 agent；**Activity Tab 也隐藏**。
- Toggle 打开后恢复贡献（宿主 `setContributionMode` + `reconfigureAgentPlugins`）。
- 可与清单 `contributionMode.hardIsolation` 联用（冷启动即 gate，见 [manifest](./manifest.md#contributionmode)）。
- **用户自建插件默认不要开**；模式型系统插件（如插件工作台）使用。

`requiresActiveTool`：badge 跟随工具 `scope_use`，避免工具被场景屏蔽时仍显示无效开关。

配套：`setEditImageAttachment`（编辑目标胶囊）、`previewImage`（全屏预览）——见 [conversation-and-agent 图像 API](./conversation-and-agent.md#图像-api)。

## 工具行内渲染 registerToolCallSlot

按 **toolName** 替换宿主默认的工具调用行内 UI（transcript 内嵌渲染）。**首个注册胜**。

- 权限：`ui.slot.tool-call`（缺权限**抛错**）
- 与消息卡片互补：卡片挂在消息下方；本槽替换**工具调用那一行**的渲染
- 插件工具也可返回 `cards` 走消息卡片（见 [message-cards](./message-cards.md)）；需要行内富 UI 时用本 API

```ts
ctx.ui.registerToolCallSlot({
  id: "my-tool-ui",
  toolName: "my_tool",
  component: MyToolCallView, // props: { toolCall: { toolCallId, toolName, args, status, result?, isError? } }
});
```

## 本轮 Turn 卡 registerTurnCard

在消息列表底部（**最新一轮**）挂一张**不绑定 tool 调用**的卡片。宿主挂载组件；插件自行决定可见性（不适用时 `return null`）。

- 权限：`ui.slot.turn-card`（缺权限**抛错**）
- **`scope_use` fail-closed**
- 典型：git「本轮变更」卡（只在仓库有变更时显示）

```ts
ctx.ui.registerTurnCard({
  id: "changes",
  component: GitTurnCard,
  scope_use: ["project"],
});
```

示例：`packages/plugins/presets/git`。
