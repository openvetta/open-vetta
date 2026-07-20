# 动态 App Action

插件可在 `activate(ctx)` 中调用 `ctx.appActions.register()`，把 Action 动态加入 Desktop 的 Action 目录。宿主会先暂存本次 activation 的全部 Action，待 `activate` 和所有注册都成功后一次发布；任一注册失败则整次 activation 回滚。插件重载、停用、卸载或权限被撤销时，宿主会同步注销 Action 并取消执行中的请求。

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

可信官方插件还可声明 `publicId`，例如 `publicId: "general.query"`。目录会优先使用该插件实现，并保留同 id 的内置实现作为 fallback；插件停用、卸载、权限撤销或激活失败后自动回退。普通插件使用 `publicId` 会被拒绝。门控依据宿主生成的 `trustLevel: "official"`，而不是插件 id 或安装来源；当前随包系统插件会获得该级别，远端和本地插件不会。

官方插件需要读写宿主数据时使用 `ctx.official`。该 API 在 SDK 中可见，但普通插件调用会被宿主拒绝；目前提供首个迁移领域所需的 `ctx.official.general.getSettings()` 与 `setSettings()`，不一次性暴露通用 IPC。

## effect 与审批

`effect` 必须是：

- `read`：只读，不触发 Action 审批。
- `write`：修改应用或用户数据；从本地 Action RPC 调用时必须审批。
- `execute`：启动外部执行或有明显副作用；从本地 Action RPC 调用时必须审批。

插件不能绕过审批。宿主根据 `effect` 决定是否审批，并在用户批准后再次使用同一 JSON Schema 校验输入。普通插件固定使用通用审批；可信官方插件可通过 `approval` 引用宿主已有 presentation，并用 `presentationByOperation` 自动选择领域专用界面。该能力不能注入新组件，也不能把 `write` / `execute` 改为免审批。

## 运行时边界

- `inputSchema` 使用 JSON Schema，由主进程在注册时编译、在执行前校验。
- 输入、示例和返回值都必须可 JSON 序列化；否则宿主返回稳定 Action 错误。
- `timeoutMs` 默认 30 秒，最大 120 秒。
- 超时、调用方取消、插件重载或注销会触发 `signal.abort()`。
- 每次执行都会重新检查插件是否启用以及两个权限是否仍有效。
- Action 按 activation 两阶段发布，不会把注册到一半的声明暴露给 search/describe/run。
- handler 在插件 renderer 运行，可以继续使用闭包中的 `ctx.fs`、`ctx.settings` 等 API；这些 API 各自的权限边界不变。

## 独立发布建议

官方 Action 插件可以由 Desktop 的首装流程放入插件注册表，也可以由插件服务下发更新。更新服务负责版本、灰度、回滚和签名验证；Action Runtime 不承担下载职责，只消费已经通过插件安装链验证并激活的版本。这样发布机制与执行机制解耦，远端协议变化不会扩大 Action Runtime 的可信边界。

当前 `vetta-actions` 以随包系统插件形式提供 `general.query` 与 `general.manage`，对应静态 Action 仍是 fallback。产品意义上的“内置 Action 插件”最终应当是**官方托管插件**：可附带 bootstrap 版本，更新包经过签名验证后获得 `trustLevel: "official"`。远端更新服务最后实施；在此之前远端插件不能使用公共 Action id。
