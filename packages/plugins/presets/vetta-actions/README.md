# Vetta Actions

Vetta 官方 App Action 插件。当前已迁移 Desktop 全部 App Action 域：

- 首批：`general`、`agent`、`downloads`、`updater`、`webhook`
- 第二批：`skills`、`shortcuts`、`im`、`mcp`、`models`、`projects`、`knowledge`、`plugins`
- 第三批：`batch-tasks`、`scheduler`、`appearance`、`navigation`

均通过 `publicId` 覆盖同 id 静态实现。

静态 Action 保留为 fallback：插件停用、加载失败或 activation 回滚后，Action 目录会自动恢复内置实现。

本插件只通过受信任的 `ctx.official` 能力读写宿主数据。写操作仍由宿主根据 `effect`
统一审批，并复用宿主已有的领域审批界面。引用实体的写操作通过 `assertReady` 在审批前
确认实体存在。远端更新、签名和灰度服务暂不在本插件内实现。
