# ADR-0045：由插件动态提供 App Action

## 状态

Accepted

## 背景

Desktop 的 App Action 当前由 `packages/desktop-app/src/main/app-actions` 静态注册，只能随应用升级。Action 与插件都包含“声明能力、运行处理器、管理生命周期和权限”的共同模型。官方内置 Action 插件又可以由独立服务发布，因此不应把 Action 内容更新继续绑定到 Desktop 版本。

## 决策

增加 `ctx.appActions.register()`：

1. 插件提交 JSON 可序列化的 Action 元数据、JSON Schema、effect 和 renderer handler。
2. 主进程把声明包装为 `ActionDefinition` 并注册到唯一的 `AppActionCatalog`；公开 id 为 `plugin.<pluginId>.<localId>`。
3. 主进程拥有 JSON Schema 校验、权限复查、write/execute 审批、超时、取消和结果序列化。
4. renderer 只执行已经通过宿主边界的 handler。插件 activation 变化、停用、卸载或权限撤销时，主进程注销目录项并中止待处理调用。
5. 现有内置 Action 暂不迁移。官方 Action 插件可作为后续独立制品逐步承接；迁移时按领域逐个移除静态注册，避免同 id 双写。
6. 插件下载、签名、灰度与回滚继续归插件分发链负责，不写入 Action Runtime。
7. 官方 Action 插件属于产品意义上的内置能力，但不复用 ADR-0024 的只读 `source: "system"` 语义；分发层应把 bootstrap 版本登记为可更新的官方托管插件。更新服务协议确定前，不放宽所有系统插件的覆盖限制。

## 原因

- Action 目录必须在主进程，才能让 CLI/RPC 在不信任 renderer 返回元数据的情况下统一发现和审批。
- handler 留在插件 renderer，可复用现有插件 SDK 与更新生命周期，无需为每个 Action 扩展静态 IPC。
- JSON Schema 是跨进程、跨版本的稳定声明格式；Zod 函数不能序列化。
- 命名空间阻止第三方插件覆盖宿主或其它插件 Action。
- 下载与执行解耦后，官方插件可以独立更新，同时宿主的安全边界保持稳定。

## 后果

- Desktop 仍需随协议演进更新 SDK，但新增或修改具体 Action 不再需要发版。
- `gui-renderer` Action 依赖主窗口 renderer；renderer 不可用时返回 `PLUGIN_ACTION_UNAVAILABLE`。
- 首版只提供通用审批，不允许插件注入审批组件或声明免审批。
- 当前变更只建立动态 Action Runtime；官方托管插件的服务清单、签名、灰度、回滚与 bootstrap 登记仍需由分发层另行实现。
- 迁移后的官方 Action id 若要保持旧契约，需要在迁移方案中提供显式兼容映射；本 ADR 不自动允许插件占用内置 id。
