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

## 内置来源配置

内置 GitHub 来源不在代码中设置仓库地址，完全由环境变量提供：

- `VETTA_OPEN_MARKETPLACE_REPOSITORY`：GitHub 仓库 URL；未设置时不创建内置来源。
- `VETTA_OPEN_MARKETPLACE_REF`：分支或 ref，默认 `main`。
- `VETTA_OPEN_MARKETPLACE_ARCHIVE_URL`：可选归档地址；未设置时根据仓库与 ref 推导。
