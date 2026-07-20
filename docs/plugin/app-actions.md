# 动态 App Action

插件可在 `activate(ctx)` 中调用 `ctx.appActions.register()`，把 Action 动态加入 Desktop 的 Action 目录。注册成功后，该 Action 会立即出现在 `vetta action search/describe/run`；插件重载、停用、卸载或权限被撤销时，宿主会同步注销 Action 并取消执行中的请求。

这使官方 Action 插件可以作为独立制品从插件服务更新，不必等待 Desktop 发版。Desktop 只维护稳定的注册协议、审批和执行边界。

## 权限

插件必须声明并获得两个权限：

```json
{
  "permissions": ["app.actions.register", "app.actionHandler.execute"]
}
```

- `app.actions.register`：向宿主 Action 目录提交可序列化声明。
- `app.actionHandler.execute`：允许宿主把通过校验和审批的请求送到插件 handler。

## 注册示例

```ts
import { definePlugin } from "@vetta-org/plugin-sdk";

export default definePlugin({
  activate(ctx) {
    ctx.appActions.register({
      id: "notes.list",
      title: "List notes",
      summary: "List notes from this plugin",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
      examples: [{ description: "List ten notes", input: { limit: 10 } }],
      async handler({ input, signal }) {
        if (signal.aborted) throw new Error("Action cancelled");
        return { notes: await listNotes(input.limit ?? 10, signal) };
      },
    });
  },
});
```

插件局部 id `notes.list` 会被宿主公开为 `plugin.<pluginId>.notes.list`，避免插件之间及插件与内置 Action 冲突。`describe` 会返回原始 `inputSchema`，调用方可据此生成输入。

## effect 与审批

`effect` 必须是：

- `read`：只读，不触发 Action 审批。
- `write`：修改应用或用户数据；从本地 Action RPC 调用时必须审批。
- `execute`：启动外部执行或有明显副作用；从本地 Action RPC 调用时必须审批。

插件不能自定义或绕过审批 UI。宿主根据 `effect` 决定是否审批，并在用户批准后再次使用同一 JSON Schema 校验输入。

## 运行时边界

- `inputSchema` 使用 JSON Schema，由主进程在注册时编译、在执行前校验。
- 输入、示例和返回值都必须可 JSON 序列化；否则宿主返回稳定 Action 错误。
- `timeoutMs` 默认 30 秒，最大 120 秒。
- 超时、调用方取消、插件重载或注销会触发 `signal.abort()`。
- 每次执行都会重新检查插件是否启用以及两个权限是否仍有效。
- handler 在插件 renderer 运行，可以继续使用闭包中的 `ctx.fs`、`ctx.settings` 等 API；这些 API 各自的权限边界不变。

## 独立发布建议

官方 Action 插件可以由 Desktop 的首装流程放入插件注册表，也可以由插件服务下发更新。更新服务负责版本、灰度、回滚和签名验证；Action Runtime 不承担下载职责，只消费已经通过插件安装链验证并激活的版本。这样发布机制与执行机制解耦，远端协议变化不会扩大 Action Runtime 的可信边界。

注意：当前 `source: "system"` 是 ADR-0024 定义的随包只读插件，禁止市场覆盖，不能直接承担独立更新。产品意义上的“内置 Action 插件”应当是**官方托管插件**：可附带 bootstrap 版本，但首装时进入可版本化的托管插件注册表；在更新服务协议确定前，不应放宽所有系统插件的只读边界。
