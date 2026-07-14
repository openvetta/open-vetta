# 样式与陷阱

把这页当 checklist：以下几条都踩过坑，足以让插件「加载失败」「元素不可见」「改了不生效」「污染宿主 UI」。

## 样式规则（强制）：只用 Tailwind，不要手写 CSS

**插件 UI 样式只能用 Tailwind 工具类写在 JSX 的 `className` 上。禁止让 agent / 作者手写业务 CSS 规则。**

原因：插件 CSS 经 `plugin.json` 的 `styles` 注入**宿主页面全局**，没有 Shadow DOM。一旦写 `button { … }`、`div { … }`、`* { … }` 或未隔离的选择器，会**污染整个 Vetta UI**。

| 允许 | 禁止 |
| --- | --- |
| JSX：`className="flex h-8 gap-2 rounded-lg bg-background text-foreground"` | 手写 `.my-btn { padding: 8px }` 等业务样式表 |
| `style.css` **仅**放 Tailwind 入口 import（见下） | `@import` 一整份 reset / preflight 进全局 |
| 极少数无法用工具类表达时：用 **强前缀类名**（如 `.vetta-plugin-<id>-…`）且**绝不**选择全局元素 | `body` / `html` / `button` / `a` / `*` 等全局选择器 |

主题色优先用 **宿主 CSS 变量**对应的 Tailwind 语义类（或 `var(--foreground)` 仅出现在不可避免的例外里）：`--foreground` / `--background` / `--border` / `--primary` / `--muted` 等。

### style.css 只做 Tailwind 管道

`src/style.css`（构建产物 `dist/style.css`）**不是**写业务样式的地方，只负责导入 Tailwind 层：

```css
/* 导入 theme + utilities。不要 preflight / base reset，避免 reset 污染宿主全局。 */
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
```

- **必须**带 `theme.css`：否则 `h-7`、`gap-1.5`、`rounded-lg` 等依赖设计令牌的类**生成不出来**（常见 0×0 不可见）。
- **不要** `@import "tailwindcss"` 全量（常含 preflight，会污染宿主）。
- Vite 配 `@tailwindcss/vite`；入口 `import "./style.css"` 一次即可。
- `plugin.json`：`"styles": ["dist/style.css"]`。

### JSX 示例

```tsx
// ✅ 仅 Tailwind className
function Panel() {
  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm text-foreground">
      <button type="button" className="rounded-md border border-border bg-accent px-2 py-1">
        刷新
      </button>
    </div>
  );
}

// ❌ 不要 import 自写业务 css
// import "./panel-styles.css";
```

Agent 写插件时：若需要样式 → **只加/改 className**；不要新建 `.css` / 往 style.css 里堆选择器。

---

## Module Federation 顶层 JSX 陷阱

**模块顶层不要使用共享依赖（含 JSX）。**

MF 的共享模块（`react` / `react/jsx-runtime`）是**异步填充**的——bootstrap 完成前为 `undefined`。模块顶层的 JSX 字面量会在模块求值时立即执行，此时 `jsx` 运行时还没就位：

```tsx
// ❌ 顶层 JSX：模块求值即抛 TypeError: ... is not a function，整个插件加载失败
const ICON = <svg viewBox="0 0 24 24" />;

// ✅ 放进组件函数体或 activate() 内（求值被推迟到运行时，依赖已就位）
function Icon() {
  return <svg viewBox="0 0 24 24" />;
}
```

同理，别在模块顶层直接调用任何共享依赖的运行时值。图标、常量化的 JSX、`React.createContext(...)` 等都放进函数体内或 `activate()`。

## React 是宿主单例

`react` / `react-dom` 运行时由**宿主作为共享单例**提供，不打进你的 bundle（`vettaPluginFederation` 已设 `singleton + import:false`）。因此：

- 你的插件与宿主用**同一个 React**，hook、context、状态都跨得过去（这正是 `useActiveConversation` 等能工作的前提）。
- `package.json` 里的 `react` 只用于类型与本地构建，别试图 bundle 一份自己的 React。
- `@vetta-org/plugin-sdk` 同样 external，运行时由宿主提供。

## 缓存刷新

插件 bundle 经 `vetta-plugin://` 协议加载，**Chromium 会缓存 `remoteEntry.js`**——你改了代码重装，**重启 App 也未必清掉旧缓存**，表现为「改动不生效」。

可靠的强刷办法：**把 `plugin.json` 的 `version` 往上 bump**，宿主当作新版本重新拉取。配合在设置页 `reload(id)`（或重开 App）。调试期每次有效改动都建议 bump 一下 patch 版本。

## 清理副作用

`ctx.ui.register*` 返回的 `Disposable` 由宿主在卸载时统一处置，**无需**手动 dispose。但你自己起的副作用（`setInterval`、`window.addEventListener`、订阅等）要在 `deactivate()` 里清掉。

> 注意 React StrictMode 下宿主可能 double-invoke load/dispose；别在 `deactivate()` 里把模块级共享引用永久置空（会让随后 re-activate 的实例读到空引用）。如需缓存模块级 `ctx`，让下一次 `activate()` 覆盖它，而不是在 `deactivate()` 里 null 掉。

## 权限缺失的两种后果

复习 [permissions.md](./permissions.md)：部分注册点缺权限**抛错**（中断该次调用）、部分**跳过+警告**（不影响其它能力）。把可选能力的注册各自独立，避免一处 throw 掉整段 `activate()`。
