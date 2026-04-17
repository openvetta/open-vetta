# 主进程日志规范

> 主进程目前使用 `console.log / warn / error`，IM 子系统使用 `LogBuffer`。此文档定义统一约定。

---

## 输出方式

- 通用模块（IPC、scheduler、batch-tasks、runtime）：`console.log` / `console.error`
- IM 子系统事件：`ImHost.logBuffer.push(...)`（`src/main/im-host/log-buffer.ts`），最近 500 条滚动，暴露给渲染层 `im-host.getRecentLogs()`

---

## 前缀约定

所有日志必须加模块前缀 `[Module]`，便于 stdout 中过滤：

| 前缀 | 示例 | 用于 |
|------|------|------|
| `[Scheduler]` | `[Scheduler] Initialized with 3 enabled tasks` | `src/main/scheduler/scheduler.ts` |
| `[BatchTaskIPC]` | `[BatchTaskIPC] RUN_TASK: project=... task=...` | `src/main/ipc/batch-tasks.ts` |
| `[IPC PROMPT]` | `[IPC PROMPT] images: 2, first type=image ...` | `src/main/ipc/session.ts` |
| `[im-host]` | `[im-host] bootstrap failed` | `src/main/im-host/*` |
| `[runtime]` | `[runtime] disposeSharedRuntime failed` | `src/main/main.ts` |

✅ 推荐：

```ts
console.log(`[Scheduler] Executing task: ${task.name} (${task.id})`);
console.error(`[Scheduler] Task error: ${task.name} (${task.id})`, error);
```

❌ 禁止：

```ts
console.log("task started", task);      // 无前缀
console.log(JSON.stringify(task));       // 大对象直接序列化
```

---

## 日志级别

| 级别 | 使用时机 |
|------|---------|
| `console.log` | 正常流程关键节点（IPC 调用、任务开始 / 结束、sidecar spawn） |
| `console.warn` | 可恢复异常或预期外状态（任务未找到、配置缺失走默认值） |
| `console.error` | 不可恢复异常、未捕获 promise、fatal 状态 |

IM 子系统对应 `LogBuffer` 的 `LogEvent.level`：`"info" | "warn" | "error"`（`host-protocol.ts` 定义）。

---

## 应当记录

- IPC handler 的入参摘要（不要全量 dump 大对象；关键字段即可），例：`[IPC PROMPT] images: 2, first mimeType=image/png, data.length=12345`
- 长耗时任务开始 / 结束（scheduler、batch-tasks）
- 异步错误栈（`console.error(..., error)`，不要 `String(error)`）
- sidecar 子进程 spawn / exit / fatal

---

## 不应记录

- ❌ Feishu `appSecret` / `verificationToken` / `encryptKey`、OAuth `token`、用户 API key（见 `im-host/credential-store.ts` 的处理方式：只写磁盘不打日志）
- ❌ 用户输入的 prompt 全文（可能含敏感内容；只记长度）
- ❌ 渲染层传来的 base64 图片 data（只记 `data.length`）
- ❌ 用户文件内容

---

## LogBuffer 用法（IM 子系统）

```ts
this.logBuffer.push({
  type: "log",
  level: "info",
  msg: `sidecar ready ${event.transport} v${event.version}`,
  time: new Date().toISOString(),
});
```

- `time` 必须 `new Date().toISOString()`
- `msg` 必须是单行字符串
- 订阅：`subscribeLog(handler)` 返回 unsubscribe，IPC 层转发给 renderer

---

## 常见错误

- 用 `console.log(err)` 而不是 `console.error("... failed", err)`：丢失栈
- 日志里泄露 token / secret：凡是 credential-store 读出来的字段不得出现在日志里
- 高频事件打印（`message.delta` 级别）不应 `console.log`，走事件通道即可
