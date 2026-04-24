# 渲染层质量红线

> 必须遵守的代码质量约束。

---

## 组件与导出

- ✅ 具名导出（`export function Foo()`）
- ✅ 显式返回类型（`: JSX.Element` / `: JSX.Element | null`）
- ✅ Props 用 `interface FooProps`
- ❌ 禁止 `export default`
- ❌ 禁止 `React.FC` / `React.FunctionComponent`

---

## 状态

- ✅ 全局状态用 Jotai atom，按 domain 分文件放 `shared/store/`，统一 `atoms.ts` re-export
- ✅ 只写 setter → `useSetAtom`
- ❌ 禁止引入 Redux / Zustand / Context-based global state / React Query
- ❌ 禁止直接访问 `localStorage`（除 atom 初始值或受控 hook 内）

---

## 样式

- ✅ Tailwind v4 class + `cn()`（`@shared/lib/utils`）
- ✅ 语义化 token：`bg-background` / `text-foreground` / `border-border` / `text-muted-foreground` …
- ✅ 图标走 iconify mdi class（`icon-[mdi--chevron-up]`）
- ❌ 禁止内联 `style={{ color: "..." }}` 写死颜色
- ❌ 禁止字符串拼接 className
- ❌ 禁止引入 CSS-in-JS / CSS Modules

---

## 与主进程交互

- ✅ 只能通过 `window.vetta.*`（`DesktopApi` 类型，见 `src/preload/api.ts`）
- ✅ HTTP 服务器通过 `shared/lib/api.ts::request<T>()`，自动处理 `401` 与 `code !== 0`
- ❌ 禁止 `new SSE()` / `new EventSource()` 自造 SSE（用 `shared/lib/sse-client.ts` 或 `useSSEEvent`）
- ❌ 禁止 `window.electron` / `ipcRenderer` 原生访问（preload 已封装）

---

## 路由

- ✅ 路由定义在 `router.tsx`，用 `createRoute` + `rootRoute.addChildren`
- ✅ 用 `useNavigate()` 编程式跳转
- ❌ 禁止 `window.location.href = ...`
- ❌ 禁止在组件文件里定义 route，统一进 `router.tsx`

---

## Effect 与清理

- ✅ 所有订阅类 API（IPC subscribe / DOM listener / SSE / observer）必须返回清理函数
- ✅ 稳定回调用 `useRef` 兜住
- ❌ 禁止 `useEffect` 没 deps 数组（React 会每次 render 都跑）

---

## TypeScript（见 AGENTS.md）

- ❌ 禁 `any`
- ❌ 禁 `await import(...)` 动态 import
- ✅ `unknown` → 类型守卫 / 断言 `assert*`
- ✅ 入参类型从 `shared/lib/api.ts` 或 `runtime-core` 导入复用，避免重复声明

---

## 路径与别名

- ✅ 用别名：`@shared` / `@domains` / `@`
- ❌ 禁止 `../../../` 穿透多级的相对路径

---

## 快捷键

- ✅ 通过 `useGlobalShortcuts((actionId) => {...})` + `SHORTCUT_ACTIONS` 注册
- ❌ 禁止在组件里硬编码 `if (e.key === "n" && e.metaKey)`；所有快捷键必须在 `shared/lib/shortcuts.ts` 的 `SHORTCUT_ACTIONS` 注册，支持用户自定义

---

## 日志

- 渲染层允许 `console.log / warn / error` 调试
- 不要把用户输入的 prompt 全文打进日志
- 生产代码应清理掉 debug `console.log`（影响性能 & 污染 devtools）

---

## 代码审查清单

- [ ] 组件具名导出 + 显式返回类型 + Props 接口
- [ ] 使用 Jotai atom，不引入其它状态库
- [ ] 只写 setter 用 `useSetAtom`
- [ ] 样式只用 Tailwind + `cn()`
- [ ] 副作用 `useEffect` 都返回 cleanup
- [ ] 跨进程调用走 `window.vetta.*`
- [ ] 用 `@shared` / `@domains` 别名
- [ ] 不直接读 `localStorage`
- [ ] 新增 atom 在 `shared/store/atoms.ts` 登记
- [ ] 新快捷键加入 `SHORTCUT_ACTIONS`
