# ADR-0045：由插件动态提供 App Action

## 状态

Accepted

## 背景

Desktop 的 App Action 当前由 `packages/desktop-app/src/main/app-actions` 静态注册，只能随应用升级。Action 与插件都包含“声明能力、运行处理器、管理生命周期和权限”的共同模型。官方内置 Action 插件又可以由独立服务发布，因此不应把 Action 内容更新继续绑定到 Desktop 版本。

## 决策

增加 `ctx.appActions.register()`：

1. 插件提交 JSON 可序列化的 Action 元数据、JSON Schema、effect 和 renderer handler。
2. 主进程把声明包装为 `ActionDefinition` 并注册到唯一的 `AppActionCatalog`。目录按 Action id 保存多个 provider，优先使用已激活的插件实现，插件退出后自动回退同 id 的内置实现。
3. 主进程拥有 JSON Schema 校验、权限复查、write/execute 审批、超时、取消和结果序列化。
4. renderer 只执行已经通过宿主边界的 handler。插件 Action activation 使用 `begin -> stage -> commit/abort`：全部声明注册成功后才一次切换；失败时丢弃 staging，不发布半套 Action。
5. 第三方插件公开 id 固定为 `plugin.<pluginId>.<localId>`。只有宿主判定为 `trustLevel: "official"` 的插件才可通过 `publicId` 占用稳定公共 id。信任级别由宿主生成，不能由插件 manifest 或用户可编辑的注册表声明。
6. 现有内置 Action 保留为 fallback。官方 Action 插件可按领域逐步提供同 id 的新版实现，不需要先删除静态注册；停用、卸载、权限撤销或 activation 清理后目录自动恢复内置 provider。
7. 插件下载、签名、灰度与回滚继续归插件分发链负责，不写入 Action Runtime。
8. 首个实现为随包 `vetta-actions` 系统插件，先覆盖 `general.query`；静态 `general.query` 保留为 fallback。插件通过受信任的 `ctx.official.general.getSettings()` 读取宿主数据，不反向调用同 id 的静态 Action。
9. 官方 Action 插件未来改为独立更新时，分发层必须把签名验证结果映射为 `trustLevel: "official"`；不能仅凭远端来源或插件 id 放宽覆盖权限。远端更新服务最后实施。

## 原因

- Action 目录必须在主进程，才能让 CLI/RPC 在不信任 renderer 返回元数据的情况下统一发现和审批。
- handler 留在插件 renderer，可复用现有插件 SDK 与更新生命周期，无需为每个 Action 扩展静态 IPC。
- JSON Schema 是跨进程、跨版本的稳定声明格式；Zod 函数不能序列化。
- 命名空间阻止第三方插件覆盖宿主或其它插件 Action；显式可信门控允许官方插件保持既有公共契约。
- provider fallback 让内置实现成为安全基线，插件版本可以在不制造目录空窗或半激活状态的前提下切换。
- 下载与执行解耦后，官方插件可以独立更新，同时宿主的安全边界保持稳定。

## 后果

- Desktop 仍需随协议演进更新 SDK，但新增或修改具体 Action 不再需要发版。
- `gui-renderer` Action 依赖主窗口 renderer；renderer 不可用时返回 `PLUGIN_ACTION_UNAVAILABLE`。
- 首版只提供通用审批，不允许插件注入审批组件或声明免审批。
- 当前变更建立动态 Action Runtime、事务激活和内置 fallback；官方托管插件的服务清单、签名、灰度、回滚与 bootstrap 登记仍需由分发层另行实现。
- 当前随包系统插件由宿主标记为 `trustLevel: "official"`；远端和本地插件分别为 `community` 与 `local`，均不能使用 `publicId`。来源与信任门控已经解耦，但远端签名验证尚未实施。
