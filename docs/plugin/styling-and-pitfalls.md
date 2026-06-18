# 样式与陷阱

把这页当 checklist：以下几条都踩过坑，足以让插件「加载失败」「元素不可见」「改了不生效」。

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
- `@vetta/plugin-sdk` 同样 external，运行时由宿主提供。

## 缓存刷新

插件 bundle 经 `vetta-plugin://` 协议加载，**Chromium 会缓存 `remoteEntry.js`**——你改了代码重装，**重启 App 也未必清掉旧缓存**，表现为「改动不生效」。

可靠的强刷办法：**把 `plugin.json` 的 `version` 往上 bump**，宿主当作新版本重新拉取。配合在设置页 `reload(id)`（或重开 App）。调试期每次有效改动都建议 bump 一下 patch 版本。

## 样式：用 CSS 变量、避免全局选择器

插件应使用 Vetta 的 CSS 变量（自动适配明暗主题），并把样式**限定在自己的命名空间类名**下：

```css
.vetta-plugin-my-plugin {
  color: var(--foreground);
  background: var(--background);
  border-color: var(--border);
}
```

常用变量：`--foreground` / `--background` / `--border` / `--primary` / `--primary-foreground` / `--muted` / `--muted-foreground` / `--accent` / `--ring` 等。

**不要**从插件 CSS 给 `body`、`button`、`*`、`a` 等全局选择器加样式——会污染整个宿主 UI。

## Tailwind：必须导入 theme.css

如果用 Tailwind（`@tailwindcss/vite`），插件的 `style.css` **必须导入 `tailwindcss/theme.css`**：

```css
@import "tailwindcss";
/* 或至少 @import "tailwindcss/theme.css"; —— 缺了它 spacing/radius/blur 等设计令牌全无 */
```

否则 `h-7`、`w-7`、`rounded-lg`、`right-1.5`、`blur-md` 这类依赖设计令牌的工具类**生成不出来**，常见症状是按钮 `h-7 w-7` 实际渲染成 0×0、整个元素不可见。

## 清理副作用

`ctx.ui.register*` 返回的 `Disposable` 由宿主在卸载时统一处置，**无需**手动 dispose。但你自己起的副作用（`setInterval`、`window.addEventListener`、订阅等）要在 `deactivate()` 里清掉。

> 注意 React StrictMode 下宿主可能 double-invoke load/dispose；别在 `deactivate()` 里把模块级共享引用永久置空（会让随后 re-activate 的实例读到空引用）。如需缓存模块级 `ctx`，让下一次 `activate()` 覆盖它，而不是在 `deactivate()` 里 null 掉。

## 权限缺失的两种后果

复习 [permissions.md](./permissions.md)：部分注册点缺权限**抛错**（中断该次调用）、部分**跳过+警告**（不影响其它能力）。把可选能力的注册各自独立，避免一处 throw 掉整段 `activate()`。
