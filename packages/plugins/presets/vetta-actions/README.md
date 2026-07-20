# Vetta Actions

Vetta 官方 App Action 插件。当前已迁移完整的 `general` 领域，通过 `publicId` 覆盖
`general.query` 与 `general.manage` 的同 id 静态实现。

静态 Action 保留为 fallback：插件停用、加载失败或 activation 回滚后，Action 目录会自动恢复内置实现。

本插件只通过受信任的 `ctx.official` 能力读写宿主数据。写操作仍由宿主根据 `effect`
统一审批，并复用宿主已有的通用设置审批界面。远端更新、签名和灰度服务暂不在本插件内实现。
