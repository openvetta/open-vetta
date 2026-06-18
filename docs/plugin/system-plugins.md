# 系统插件（presets）

除用户自行安装的插件外，还有**系统插件**——随 App 一起发布、用户**不可删除/修改**（ADR-0024）。它与普通插件用**完全相同**的 SDK 与清单，区别只在分发方式与运行时语义。

## 源码位置

源码放在 monorepo 的 `packages/plugins/presets/<id>/`，结构与普通插件包一致：

```text
packages/plugins/presets/
  svg-viewer/
    plugin.json
    vite.config.ts
    src/index.tsx
  image-gen/
    plugin.json
    vite.config.ts
    src/index.tsx
```

放进该目录即自动作为系统插件集成——这是该目录的约定语义。

## 构建与集成

- **构建制品**：`bun run build:presets` 先构建插件 workspace 的 SDK / 构建包，再逐个产出 `release/<id>-<version>.zip`。`dev` / `start` / 打包流程都会先跑它。
- **依赖隔离**：presets 属于 `packages/plugins` 的独立 workspace，用单独的 `bun.lock`；`@vetta/plugin-sdk` 和 `@vetta/plugin-vite` 经 `workspace:*` 直链仓库源码，不进入根 workspace 依赖图。
- **校验**：Desktop 按 preset 的 `plugin.json` 精确定位 zip，拒绝路径穿越、id/version 不一致、入口或样式缺失的归档。
- **dev**：zip 解压到 `packages/desktop-app/.artifacts/system-plugins/<id>/`，主进程只读该 staging，不直接读 preset 源码或 `dist/`。
- **打包**：`prepare-pack.js` 从 zip 解压到打包 staging 的 `system-plugins/<id>/`，再随 `extraResources` 进入 `Resources/system-plugins/<id>/`。

## 运行时语义

- `source: "system"`，`listPlugins()` 运行时发现并与用户插件合并展示。
- **不落用户态目录**：不进 `~/.vetta/plugins`、不写 `plugins-manifest.json`；每次启动从开发或安装包内的只读 staging 重新发现。
- **id 冲突**：系统插件优先、id 保留——用户安装同 id 被拒，已存在的同 id 用户插件被遮蔽。
- **权限**：`plugin.json` 声明的权限**自动全量授予**，用户不可撤。
- **停用**：默认启用，用户可在设置里关闭（偏好存 `~/.vetta/system-plugin-prefs.json`），但**不可卸载、不可改文件/权限**。
- **更新**：版本随 App，不走用户插件的 pending/reload 更新流。

## 何时做成系统插件

- 想随 App 默认提供、对所有用户开箱即用、且权限敏感（自动全量授予）→ 系统插件。
- 想由用户自行选择安装、独立于 App 发版迭代 → 普通插件（[getting-started.md](./getting-started.md) 的 zip 安装路径）。
