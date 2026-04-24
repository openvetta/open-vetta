# 组件开发约定

> React 组件编写规范（函数组件 + TypeScript + Tailwind v4 + shadcn/ui）。

---

## 组件结构

所有组件使用**具名导出**、显式 `JSX.Element` 返回类型、Props 接口置于文件内：

```tsx
// packages/desktop-app/src/renderer/shared/components/ResizeHandle.tsx
interface ResizeHandleProps {
  side: "left" | "right";
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
}

export function ResizeHandle({ side, onResize, onResizeEnd }: ResizeHandleProps): JSX.Element {
  // ...
}
```

✅ 推荐：

- 具名导出：`export function Foo()`
- Props 接口用 `interface FooProps`，命名 `<组件名>Props`
- 返回类型显式写 `JSX.Element` / `JSX.Element | null`
- 内部子组件放同文件内，只在自身需要时拆出（见 `TodoCard.tsx` 里的 `CompactTodoCard` / `ProgressBar` / `TodoItemRow`）

❌ 禁止：

- `export default function Foo()`
- `const Foo: React.FC<Props> = ...`（本项目全部使用 `function` 声明 + 显式返回类型）
- Props 类型直接写在参数位并复用不方便

---

## Props 约定

- 布尔命名用肯定式 + 语义（`compact`、`animated`、`isDirectory`）
- 回调命名 `on<Event>`：`onResize` / `onResizeEnd` / `onOpenSession` / `onViewMore`
- 可选 prop 用 `?` 而非 `prop: X | undefined`
- 不要把 atom 本身通过 prop 传递，组件内部自己 `useAtom` 即可（见 `App.tsx` 里对子组件的用法）

---

## 样式

使用 Tailwind v4（类名），动态拼接统一走 `cn` 工具：

```tsx
import { cn } from "@shared/lib/utils";

<div className={cn("flex items-center", isActive && "bg-primary", className)} />
```

- `cn` = `twMerge(clsx(...))`，见 `shared/lib/utils.ts`
- 图标使用 **iconify mdi** class：`<span className="icon-[mdi--chevron-up] text-sm" />`（见 `TodoCard.tsx` L85）
- 主题变量：使用 `bg-background` / `text-foreground` / `border-border` / `text-muted-foreground` / `bg-primary` 等 shadcn 语义 token，避免写死颜色
- 动画：使用 `motion/react`（`<motion.div initial={...} animate={...}>`），不使用 framer-motion / CSS 关键帧

❌ 禁止：

- `style={{ color: "#fff" }}` 内联颜色（走 Tailwind token）
- 手动拼字符串 className：`` className={`flex ${cond ? "x" : "y"}`} `` → 用 `cn()`
- 引入新的样式方案（styled-components / emotion / CSS Modules）

---

## shadcn/ui 基础组件

`shared/components/ui/` 下是 shadcn 基础组件（配置在 `packages/desktop-app/components.json`）。

✅ 推荐：`import { Button } from "@shared/components/ui/button";`

❌ 禁止：

- 修改 `shared/components/ui/*` 后不同步 shadcn 的升级规范
- 绕过这些基础组件直接 `<button>` 构建需要交互样式的按钮

---

## 可访问性（A11y）

- 按钮必须 `type="button"` 除非是表单提交：

```tsx
<button type="button" onClick={...}>  {/* TodoCard.tsx L81 */}
```

- 图标按钮需要 `aria-label`（实际项目中大量 icon-only 按钮需要补齐）
- Dialog / Tooltip 使用 shadcn 组件，已内置 a11y；不要自写 `role="dialog"` 的 div

---

## 根布局模式

`App.tsx` 展示了根布局的推荐模式：

- 只在根布局初始化跨页 hook：`useTheme()` / `useAuth()` / `useAppInit()` / `useDownloadsInit()` / `useFlowingInit()`
- 全局 Dialog（`ConfirmDialog` / `LoginDialog` / `FilePreviewDialog`）放在根布局末尾，由 atom 驱动显隐
- 全局快捷键注册用 `useGlobalShortcuts((actionId) => { switch ... })`

---

## 常见错误

| 错误 | 规避 |
|------|------|
| 把 `useAtom(xxxAtom)` 写在深层 list item 里导致整列表跟 atom 一起重渲染 | 在父组件读 atom，把切片通过 prop 传给 item；或 item 内用 `useAtomValue` 读派生 atom |
| `useEffect(() => ..., [callback])` 导致回调变更引发死循环 | 用 ref 把回调稳住（`handlerRef.current = handler`，见 `useShortcuts.ts` L26） |
| 使用 `default` 导出导致 import 名字不一致 | 全部具名导出 |
| 在组件内直接 `window.vetta.xxx` 发起副作用却没放 `useEffect` | 副作用必须进 `useEffect` 或 event handler |
