# 系统插件源在 monorepo presets，构建期解压态直服，不 seed-copy 进 ~/.vetta

需要一类**随 App 发布、用户不可删改**的插件（[[系统插件]]）。仓库已有「内置 vendor 首启拷进 `~/.vetta` 托管目录」的 seed 先例（ADR-0011），但那是因为运行时需要可写的执行位置；插件无此需要。

决定：[[系统插件]]的源以 [[预置插件]]形式放在 `packages/plugins/presets/<id>/`（monorepo 内维护）。构建期逐个 build 产出**解压态** `dist/ + plugin.json`，打包时拷进 desktop-app 的 `resources/system-plugins/<id>/` 随包发布；dev 下直接就地读 `packages/plugins/presets/<id>/`。运行时**不解压、不拷贝进 `~/.vetta`、不写 `plugins-manifest.json`**：`vetta-plugin://` 解析器按记录的 `source` 选 base 目录（打包 `process.resourcesPath/system-plugins`、dev `packages/plugins/presets`），`listPlugins()` 在运行时发现系统插件并与用户插件注册表合并返回。

配套语义：
- **来源**：`InstalledPlugin.source` 新增 `"system"`，与 `"archive" | "remote"` 并列。
- **id 冲突**：系统插件优先、id 保留——用户安装同 id 被拒，已存在的同 id 用户插件被系统遮蔽。守住「用户不可修改系统插件」不变量。
- **权限**：manifest 声明的权限启动即全量视为 granted，用户不可撤（一方随包发的可信代码，再走授权弹窗无意义）。
- **停用**：默认启用，用户可在设置里关闭（偏好作为 override 持久化进 `plugins-manifest.json` 的用户态），但不可卸载、不可改文件、不可改权限。
- **更新**：版本随 App，不走用户插件的 `availableVersion / pendingVersion` 更新流。

## Considered Options

- **seed 进 `~/.vetta/plugins`（复刻 ADR-0011 vendor 模式）**：把内置插件 zip/dist 首启拷进用户插件目录、写进 `plugins-manifest.json`、打 `source:"system"`。复用现有协议解析与加载链最多、零 resolver 改动。被否：① 物理落进用户可写目录，「不可修改」只能靠每次启动重新 seed 覆盖兜底，存在篡改窗口；② 系统与用户文件混在一处，污染 `manifest.json`（本应只存用户态）与卸载/覆盖逻辑；③ 与「插件无需可写执行位」的事实不符——seed 是为 vendor 的可写需求设计的，照搬属过度机制。
- **发预构建 .vetta zip，启动解压**：presets 打包成 zip 随包发，启动时解压进托管目录。被否：源既在 monorepo、产物形态我们自控，再 zip 再解压是多此一举，且产物体积翻倍、多一道启动解压。
- **App 启动时现场 build presets**：运行时需带 node/vite 工具链，慢且脆，直接否。

## Consequences

- `vetta-plugin://` 解析器要从「单一 `pluginsBaseDir`」改为「按 source 选 base 目录」，且需持有一份运行时发现的系统插件 id 集合（解析器只拿到 pluginId）。
- `plugins-manifest.json` 语义收紧为「用户态」：用户插件记录 + 用户对系统插件的偏好 override（如停用）。系统插件本体不入库，每次启动从 `system-plugins` / `presets` 重新发现，故改预置插件集对存量用户自动生效。
- 打包脚本（`prepare-pack.js`）需新增一步：遍历 `packages/plugins/presets/*` 逐个构建并把 `dist + plugin.json` 暂存到 `resources/system-plugins/<id>/`，再经 `extraResources` 随包。
- dev 依赖 presets 已构建：新增 `build:presets` 步骤，未构建的 preset（无 `dist`）在发现阶段跳过并告警，不阻断启动。
- 既有 `svg-viewer` 示例迁入 `packages/plugins/presets/svg-viewer` 成为首个系统插件；`global-slot-demo` 留作纯示例不随包。
- 安全面：系统插件自动全量授权且不可停文件级修改，其可信度完全由「随 App 发布 + 代码评审」这道闸保证，与 [[可信插件]]（ADR-0023）同一信任前提的延伸。
