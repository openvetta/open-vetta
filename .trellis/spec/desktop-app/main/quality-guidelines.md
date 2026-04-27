# 主进程质量红线

> 必须遵守的代码质量约束。

---

## 共享 Runtime（最高优先级）

所有需要 `RuntimeHost` 的模块（session IPC / scheduler / batch-tasks）**必须**复用 `getSharedRuntime()`。

```ts
// packages/desktop-app/src/main/runtime.ts
let sharedRuntime: RuntimeHost | null = null;
export function getSharedRuntime(): RuntimeHost {
  if (!sharedRuntime) sharedRuntime = new RuntimeHost();
  return sharedRuntime;
}
```

✅ 推荐：

```ts
import { getSharedRuntime } from "../runtime.js";
const runtime = getSharedRuntime();
```

❌ 禁止：

```ts
const runtime = new RuntimeHost();  // 进程内出现多份 runtime
                                     // 同 sessionPath 被多实例 open → SessionLockError
                                     // 典型症状：定时任务历史跳转走到 Welcome 页
```

---

## 原子写入

所有 JSON 配置 / 状态文件**必须**通过 `atomicWriteJSON`（`src/main/utils/atomic-write.ts`）：

```ts
import { atomicWriteJSON } from "../utils/atomic-write.js";
atomicWriteJSON(CONFIG_PATH, config);
```

语义：`write-temp (pid 后缀) → fsync → rename`，崩溃 / 断电最多留下 `.tmp` 文件，目标文件永远不会半写。

❌ 禁止：

```ts
await fs.writeFile(CONFIG_PATH, JSON.stringify(config));  // 可能留半个 JSON
```

---

## IPC handler 模板

```ts
const CHANNELS = {
  FOO: "vetta:<domain>:foo",
} as const;

export function registerFooIpc(webContents: WebContents): () => void {
  ipcMain.handle(CHANNELS.FOO, async (_event, arg: unknown) => {
    assertNonEmptyString(arg, "arg");
    return doWork(arg);
  });

  return () => {
    ipcMain.removeHandler(CHANNELS.FOO);
  };
}
```

必须：

- 通道名常量化，集中在 `const CHANNELS` 对象内
- 入参先 `assert*` 校验
- 返回 teardown 函数，调用方 `ipcMain.removeHandler`
- 在 `ipc/index.ts` 的 `registerAllIpc` / `teardownAllIpc` 登记

---

## TypeScript

- 遵循仓库 `AGENTS.md`：禁 `any`，类型定义不足查 `node_modules` 再写
- 禁止 `await import("...")` 动态 import，**唯一例外**是 `scheduler/task-executor.ts` 内用于打破与 `scheduler.ts` 的循环依赖的局部动态 import（`disableTaskInCron` / `updateTaskEnabled`）
- IPC 入参统一先标 `unknown`，断言后收窄
- 共享业务类型（`PromptRequest`、`SessionConfig`、`SessionEvent`）从 `runtime-core/src/index.js` import，不要自己再定义一份

---

## 路径安全

- 所有来自渲染层的路径在使用前：`allowProjectRoot(cwd)` 登记 + `assertPathWithinProject(path)` 校验
- `config.projects` / `archivedProjects` / `workspacePath` 读到时要立刻登记所有项目根
- Windows / macOS 大小写：`assertPathWithinProject` 已通过 `normalizeForComparison` 在 Win 上 `toLowerCase()`，实现跨平台比较

---

## 清理与生命周期

- 每个 `register*Ipc` 返回 teardown，teardown 里**只**负责移除 handler 和解绑本模块订阅
- 不得在 session teardown 里 `disposeAllSessions()`（共享 runtime，其他模块还在用）
- 进程级 dispose 统一由 `main.ts` 的 `before-quit` 调 `disposeSharedRuntime()` + `host.shutdownForQuit()`

---

## 禁止事项速查

- ❌ `new RuntimeHost()`（除 `runtime.ts` 内部）
- ❌ 直接 `fs.writeFile` 写 JSON 配置
- ❌ `ipcMain.handle` 不校验 `unknown` 入参
- ❌ 渲染层传来的路径未做 `allowProjectRoot` / `assertPathWithinProject`
- ❌ `console.log(token)` / `console.log(appSecret)`
- ❌ 在 session IPC teardown 里释放全局 session
- ❌ `await import()` 动态 import（循环依赖的临时 workaround 除外，应加注释说明）
- ❌ 在 `main.ts` 之外调 `app.exit` / `app.quit`

---

## 自查清单

- [ ] 新增 IPC handler 在 `const CHANNELS` 里登记，并在 teardown 里 `removeHandler`
- [ ] 入参先 `assert*`
- [ ] 使用 `getSharedRuntime()`
- [ ] 配置 / 状态写入走 `atomicWriteJSON`
- [ ] 路径做了 `allowProjectRoot` + `assertPathWithinProject`
- [ ] 日志有模块前缀且不含敏感数据
- [ ] `register*Ipc` 在 `ipc/index.ts` 里连接到 `registerAllIpc` / `teardownAllIpc`
