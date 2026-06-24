# UI 扩展点

`ctx.ui` 提供四类 UI 注册点（消息卡片单独见 [message-cards.md](./message-cards.md)）。每个注册都返回 `Disposable`（`{ dispose() }`）；插件卸载时宿主会统一处置，无需手动调用。

> 所有 slot 组件经 Module Federation 与宿主共享 React 单例，可直接用 hook、直接传组件实例。注意[顶层 JSX 陷阱](./styling-and-pitfalls.md#module-federation-顶层-jsx-陷阱)。

## 全局浮层 registerGlobalSlot

在 App 根部渲染一个组件（全局浮层 / 对话框 / 常驻 UI）。

- 权限：`ui.slot.global`
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

典型用途：设置缺失引导弹窗、全局悬浮工具、快捷面板。一个插件可注册多个。

## 文件预览 registerFilePreview

按**文件扩展名**贡献预览组件，渲染在活动面板的文件预览区。

- 权限：`ui.slot.file-preview`
- **优先级=仅补空白**：内置已支持的扩展名（image / audio / pdf / docx / markdown / json / 常见文本）插件**抢不到**；只有内置不认、本会掉进文本兜底的扩展名才查插件注册表，**首个匹配胜**。
- 组件收到 `file` prop —— 宿主**不**预读、不替你猜编码，你自决读什么（内容访问无需额外权限，因为是用户主动点开的这一个文件）。

```ts
interface PluginPreviewFile {
  path: string | null;     // 绝对路径（url-only 项为 null）
  name: string;
  extension: string;       // 小写、不含点
  mime: string;
  size: number;            // 字节（未知为 0）
  readText(): Promise<string>;
  readBytes(): Promise<ArrayBuffer>;
  getUrl(): string;        // 支持 Range 的流式 URL，可直接作 <img>/<video> src
}
interface PluginFilePreviewProps { file: PluginPreviewFile }
```

```tsx
import { definePlugin, type PluginFilePreviewProps } from "@vetta/plugin-sdk";
import { useEffect, useState } from "react";

function SvgPreview({ file }: PluginFilePreviewProps) {
  const [svg, setSvg] = useState("");
  useEffect(() => { void file.readText().then(setSvg); }, [file]);
  return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt={file.name} />;
}

export default definePlugin({
  activate(ctx) {
    ctx.ui.registerFilePreview({ extensions: ["svg"], component: SvgPreview });
  },
});
```

完整示例见 `packages/plugins/svg-viewer`。

## 活动面板 Tab registerActivityTab

向活动面板的「**可添加池**」注册一个 tab。

- 权限：`ui.slot.activity-tab`
- 与前两个不同：注册**不直接渲染**——用户在活动面板 tab 栏 hover 时点右侧"+"，从勾选列表手动 **attach** 后才出现（再次取消勾选即 remove）。
- attach 记录以**会话 cwd** 为 key（ADR-0026）：普通项目所有 session 共享、「对话」项目按 session 隔离。插件被禁用时 tab 隐藏，重新启用自动回来。
- 一个插件可注册多个 tab。

```ts
interface PluginActivityTabContribution {
  id: string;                 // 插件内唯一
  label: string;
  icon?: ReactNode;           // React 节点（不是 iconify class 字符串）
  component: ComponentType;   // 零 props，自包含
}
```

```tsx
ctx.ui.registerActivityTab({
  id: "stats",
  label: "统计",
  icon: <StatsIcon />,
  component: StatsPanel,
});
```

组件零 props。**面板作用域用 `useActivityTab()` 取**，不要用 `useActiveConversation().cwd` 代替（项目详情页面板 cwd 是项目的，活动会话可能属于别的项目或为 null）：

```tsx
import { useActivityTab } from "@vetta/plugin-sdk";

function StatsPanel() {
  const { cwd } = useActivityTab(); // 本 tab 所在面板的作用域 cwd（与 attach 记录同 key）
  // ...
}
```

也可用 `ctx.ui.openActivityTab(tabId)` **以编程方式** attach（若需要）并激活自己的某个 tab（任意载荷经插件自己的内存状态传递）。

完整示例见 `packages/plugins/externals/mobile-ui-preview`。

## 输入栏动作 registerInputAction

在 AI 输入栏下方加一个**开关型动作按钮**（toggle）。激活时，宿主在每次发送前调用 `decoratePrompt()` 把元数据合并进外发 prompt。

- 权限：`ui.slot.input-action`（缺权限**抛错**）

```ts
interface PluginInputActionContribution {
  id: string;
  label: string;
  icon?: ReactNode;                       // React 节点
  defaultActive?: boolean;                // 初始是否激活，默认 false
  requiresActiveTool?: string;            // 依赖的 agent 工具名；仅当该工具在当前会话激活时才显示这个 badge
  onToggle?(active: boolean): boolean | void;  // active=true 时返回 false 可“否决”激活（如未配置）
  decoratePrompt?(): { metadata?: Record<string, unknown> } | void; // 激活时每次发送前调用
}
```

```tsx
ctx.ui.registerInputAction({
  id: "image-mode",
  label: "图像生成",
  icon: <IconImage />,
  requiresActiveTool: "generate_image", // 工具被场景屏蔽（如批量任务）时不显示这个 badge
  onToggle: (active) => {
    if (active && notConfigured()) {
      showSettingsGuard();
      return false;            // 否决激活，toggle 不点亮
    }
  },
  decoratePrompt: () => ({ metadata: { imageMode: true } }), // 本轮 prompt 带上 imageMode
});
```

`decoratePrompt` 返回的 `metadata` 浅合并进外发 `PromptRequest.metadata`，agent 一侧可读（如内置图像工具读 `metadata.imageMode`）。插件自持任何 toggle 副作用状态（同一 MF 实例，与其它 slot 共享）。

**`requiresActiveTool`：让 badge 跟随工具 scope。** 输入栏开关通常对应某个 agent 工具（badge 注入 metadata，引导 agent 调那个工具）。设置 `requiresActiveTool` 为该工具名后，**仅当该工具在当前会话激活**（按工具的 `scope_use` 解析，见 [conversation-and-agent.md](./conversation-and-agent.md#scope_use按对话场景限定工具出现范围)）时才显示这个 badge——避免在工具被场景屏蔽（如批量任务里 `generate_image` 不可用）时仍显示一个点了也无效的开关。不设则始终显示。`image-gen` 插件即为「图像生成」设了 `requiresActiveTool: "generate_image"`。

`image-gen` 插件用它实现「图像生成」开关，并配合 `setEditImageAttachment` 实现「编辑选中图」（见 [message-cards.md](./message-cards.md) 与 [conversation-and-agent.md](./conversation-and-agent.md#图像-api)）。
