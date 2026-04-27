# 主进程错误处理

> IPC 参数校验、异步异常传播、子进程错误与优雅退出。

---

## 总体原则

- IPC handler 必须先做参数校验再调用业务逻辑；校验失败直接 `throw new Error(...)`，`ipcMain.handle` 会把异常传回 renderer 作为 rejected promise。
- 文件系统、子进程、第三方库异常一律不向上冒泡到 Electron runtime，改为记录日志 + 返回可恢复结果。
- 对长期订阅型资源（`runtime.subscribe` / child process / watchers）必须在 teardown 时逐一解绑。

---

## 参数校验：`assertXxx` 模式

IPC handler 统一使用 `assert*` 断言函数收窄类型，参见 `packages/desktop-app/src/main/ipc/session.ts`：

```ts
function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}`);
  }
}

ipcMain.handle(CHANNELS.PROMPT, async (_event, sessionId: unknown, request: unknown) => {
  assertNonEmptyString(sessionId, "sessionId");
  assertPromptRequest(request);
  await runtime.prompt(sessionId, request);
});
```

✅ 推荐：

- 每个 handler 第一行断言所有入参
- 复杂对象写专用断言：`assertPromptRequest(value)`（见 `session.ts` L35）
- 用户传入的 `cwd` / `path` 必须先走 `allowProjectRoot` 或 `assertPathWithinProject`（见 `ipc/fs.ts` L179）

❌ 禁止：

- `ipcMain.handle("...", async (_e, x: string) => ...)`，直接把 `unknown` 标成具体类型
- 直接 `JSON.parse(...)` 渲染层传来的字符串而不校验

---

## 文件系统与权限错误

`ipc/fs.ts` 约定所有路径操作必须处于"已登记项目根"内：

```ts
function assertPathWithinProject(targetPath: string): void {
  const resolved = normalizeForComparison(targetPath);
  for (const root of allowedRoots) {
    const rel = relative(normalizedRoot, resolved);
    const isWithinRoot = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    if (isWithinRoot) return;
  }
  throw new Error("Path is outside any known project directory");
}
```

- `ENOENT`：`read-file` 允许以空字符串兜底（L242）；`stat` 返回 `null`（L281）
- `EXDEV`：跨盘 move 时走 `copyFile + rm` 兜底（L310）
- 大文件：`> 10MB` 直接抛 `File too large to preview`（L247）

---

## 订阅资源清理

`runtime.subscribe` 必须在 teardown 时解绑，否则在 session 已 dispose 后事件仍会尝试 `webContents.send` 导致 "Object has been destroyed"。

参见 `src/main/ipc/session.ts`：

```ts
const subscriptionMap = new Map<string, () => void>();

ipcMain.handle(CHANNELS.SUBSCRIBE, async (_event, sessionId: unknown) => {
  assertNonEmptyString(sessionId, "sessionId");
  const subscriptionId = `${sessionId}:${randomUUID()}`;
  const unsubscribe = runtime.subscribe(sessionId, (runtimeEvent) => {
    webContents.send(CHANNELS.EVENT, subscriptionId, runtimeEvent);
  });
  subscriptionMap.set(subscriptionId, unsubscribe);
  return { subscriptionId };
});

return () => {
  for (const unsubscribe of subscriptionMap.values()) unsubscribe();
  subscriptionMap.clear();
  // 不在这里 disposeAllSessions —— 共享 runtime 可能正被 scheduler/batch-tasks 使用
};
```

定时任务同理，执行完毕后必须 `safeUnsubscribe()`，见 `scheduler/task-executor.ts` L129。

---

## 子进程（IM sidecar）错误

`im-host` 使用非阻塞方式启动：

```ts
void getImHost()
  .bootstrap()
  .catch((err: unknown) => {
    console.error("[im-host] bootstrap failed", err);
  });
```

- bootstrap 失败**不应**让 desktop-app 崩溃；IM 是可选能力
- `before-quit` 必须先 `await host.shutdownForQuit()` 再 `app.exit(0)`，保证子进程先退出
- 单次 `before-quit` 防抖：用 `quitCleanupStarted` 标志位避免递归（`main.ts` L257）

---

## 全局退出钩子

`main.ts` 的 `before-quit` 必须同时：

1. 关闭 IM sidecar
2. 释放共享 `RuntimeHost` 的所有 session 文件锁（否则下次启动 `.lock` 残留需走 stale-detection 回收）

```ts
app.on("before-quit", async (event) => {
  if (quitCleanupStarted) return;
  quitCleanupStarted = true;
  event.preventDefault();
  try { await host.shutdownForQuit(); } catch (err) { console.error(...); }
  try { await disposeSharedRuntime(); } catch (err) { console.error(...); }
  app.exit(0);
});
```

---

## 常见错误与规避

| 错误 | 规避 |
|------|------|
| 在未 `allowProjectRoot` 的目录做 `readFile` → `Path is outside any known project directory` | `config.projects` 变化、`list-sub-dirs`、`session.create(cwd)` 路径都要 `allowProjectRoot` |
| 渲染进程崩溃后 subscribe 仍在持续调用 `webContents.send` | teardown 时清空 `subscriptionMap` |
| 定时任务执行完后渲染层里用户又点进 session，旧回调把历史覆盖掉 | 任务进入终态立刻 `safeUnsubscribe()` |
| 在 `ipc/*` 里 `new RuntimeHost()` 导致同 session 被多份 runtime 打开 → `SessionLockError` | 必须 `getSharedRuntime()` |
| `atomicWriteJSON` 抛错未被捕获 | 调用方 try/catch 并记录日志（见 `im-host/index.ts` L154 的 `saveImState` 错误处理） |
