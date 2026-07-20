# Vetta Actions

Vetta 官方 App Action 插件。当前先迁移 `general.query`，并通过 `publicId` 覆盖同 id 的静态实现。

静态 Action 保留为 fallback：插件停用、加载失败或 activation 回滚后，Action 目录会自动恢复内置实现。

本插件只通过受信任的 `ctx.official` 能力读取宿主数据。远端更新、签名和灰度服务暂不在本插件内实现。
