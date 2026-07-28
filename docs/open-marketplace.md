# GitHub 开源能力市场格式

Desktop 从 GitHub 下载完整仓库归档，并在本地读取 `.vetta/marketplace.json`。GitHub 不承担搜索、筛选或分页；这些操作全部基于客户端已校验的本地快照完成。

## Manifest

```json
{
  "schemaVersion": 1,
  "name": "example-abilities",
  "displayName": "Example Abilities",
  "marketplaceVersion": "2026.08.1",
  "repository": "https://github.com/example/abilities",
  "minAppVersion": "0.5.11",
  "abilities": []
}
```

版本字段职责不同：

- `schemaVersion`：JSON 结构版本。当前只支持 `1`。
- `marketplaceVersion`：仓库内容发布版本；同一版本的归档内容不得变化。
- `minAppVersion`：必填，能够读取该内容的最低 Desktop SemVer 版本。
- `abilities[].version`：单个能力的产物版本。
- `abilities[].configVersion`：仅表示单个能力本地配置的结构版本，不用于选择客户端兼容性。

## Plugin 与 Bundle

Plugin 的 `source.path` 指向一个可直接安装的插件目录。目录至少包含 `plugin.json` 以及清单声明的已构建入口文件。客户端同步时校验 `plugin.json` 的 `id`、`version`、入口、样式路径，并从清单派生权限和命令展示信息；安装时复用 Desktop Plugin Store，默认保持禁用且不授予权限。

```json
{
  "type": "plugin",
  "slug": "demo-plugin",
  "name": "Demo Plugin",
  "version": "1.0.0",
  "source": { "path": "abilities/plugins/demo-plugin" }
}
```

Bundle 没有 `source` 和独立安装产物，只声明同一 Manifest 中的成员。当前成员只支持 `skill`、`scene` 和 `plugin`，不允许嵌套 Bundle。

```json
{
  "type": "bundle",
  "slug": "starter-bundle",
  "name": "Starter Bundle",
  "version": "1.0.0",
  "config": {
    "members": [
      { "type": "skill", "slug": "hello-vetta" },
      { "type": "plugin", "slug": "demo-plugin" }
    ]
  }
}
```

## 兼容规则

- 新增字段应优先设计为可选字段，不改变已有字段含义。
- 客户端版本低于 `minAppVersion` 时不会激活新快照；存在旧的兼容快照时继续使用旧快照。
- 开发期不兼容缺少 `minAppVersion` 或使用旧字段名的 Manifest；直接修改仓库中的 `.vetta/marketplace.json`。
- 当前不使用 `marketplace-index.json`。只有同一仓库确实需要并存互不兼容的 Schema 时才重新评估。

## 发布规则

1. 修改能力内容或 Manifest 后必须生成新的 `marketplaceVersion`。
2. 每个 Manifest 都必须设置对应的 `minAppVersion`。
3. 不从 GitHub 仓库执行 JavaScript 或其它迁移脚本。
4. 发布前必须校验 Manifest、能力目录、能力版本和来源路径。

## 本地缓存身份

客户端将 `sourceId`、`repository`、`ref` 和 `archiveUrl` 共同作为市场来源身份。每一种来源配置都使用独立的指纹缓存目录；修改仓库、分支或归档地址后，不会继续读取旧配置的缓存。

同一来源身份下，`marketplaceVersion` 对应的内容仍然不可变。来源身份发生变化时，即使新来源暂时使用相同的 `marketplaceVersion`，也允许下载并建立新的缓存快照。

能力页打开时优先立即返回本地快照，并在后台读取 GitHub 上的 `.vetta/marketplace.json`。只有远端 `marketplaceVersion` 变化时才下载完整仓库归档；更新成功不发送通知，已打开的能力页只静默重读本地快照，未打开时则在下次进入时读取。后台检查失败时继续使用已有快照，不向用户产生干扰；用户主动点击刷新仍会立即执行完整同步并返回结果。

## 内置来源配置

内置 GitHub 来源不在代码中设置仓库地址，完全由环境变量提供：

- `VETTA_OPEN_MARKETPLACE_REPOSITORY`：GitHub 仓库 URL；未设置时不创建内置来源。
- `VETTA_OPEN_MARKETPLACE_REF`：分支或 ref，默认 `main`。
- `VETTA_OPEN_MARKETPLACE_ARCHIVE_URL`：可选归档地址；未设置时根据仓库与 ref 推导。
