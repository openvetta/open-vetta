# 版本发布指南

本文档说明如何在当前私域仓库（`origin` 指向 Gitee）发布新版本，并生成可上传到发行页的产物。

## 版本策略

- 版本号以 `@vetta/coding-agent` 为基准。
- 发布脚本会将版本同步到 monorepo 相关包（lockstep）。
- 默认不会发布到包注册表（私域默认安全）。

## 发布前准备

1. 确保在目标分支（通常是 `main`）：

   ```bash
   git branch --show-current
   ```

2. 同步远端并确保工作区干净：

   ```bash
   git pull --rebase origin main
   git status --short
   ```

3. 确保变更已经提交。

## 执行发布

### Patch 发布（常用）

```bash
bun run release:patch
```

### Minor 发布

```bash
bun run release:minor
```

### Major 发布

```bash
bun run release:major
```

## 发布脚本会做什么

运行 `bun run release:*` 后，脚本会自动执行：

1. 检查工作区是否干净
2. 递增版本（以 `@vetta/coding-agent` 当前版本为准）
3. 同步各包依赖版本
4. 更新 `packages/*/CHANGELOG.md` 的 `[Unreleased]`
5. 创建发布提交并打 tag（`vX.Y.Z`）
6. 默认跳过 registry 发布（私域默认）
7. 补回新的 `[Unreleased]` 并提交
8. 推送当前分支与 tag 到 `origin`
9. 生成发布产物与安装说明

## 产物位置

每次发布后会生成目录：

```text
releases/vX.Y.Z/
```

通常包含：

- `vetta-coding-agent-X.Y.Z.tgz`
- `INSTALL.md`
- `RELEASE_NOTES.md`

## 在 Gitee 创建发行版

1. 打开仓库的 Releases 页面。
2. 基于刚推送的 tag（例如 `v0.55.3`）创建新发行版。
3. 上传 `releases/vX.Y.Z/` 里的产物文件。
4. 将 `RELEASE_NOTES.md` 内容作为发行说明（可按需补充）。
5. 保留 `INSTALL.md` 作为安装指引附件。

## 可选：发布到私有 registry

默认不发布到 registry。若需要发布到已配置的私有 registry：

```bash
RELEASE_PUBLISH=true bun run release:patch
```

可选指定推送分支：

```bash
RELEASE_BRANCH=release bun run release:patch
```

## 常见问题

### 1) 提示工作区不干净

先提交或清理本地改动，再重新执行发布命令。

### 2) tag 已存在

说明该版本已发布。请提升版本后重新发布。

### 3) 想只推送 tag

```bash
git push origin vX.Y.Z
```

### 4) 验证当前已发布版本

```bash
git tag --list --sort=version:refname
```
