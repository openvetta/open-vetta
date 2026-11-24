# 主题示例

目前没有内置主题包。原先的 Xianxia 主题包已移除，`packages/themes/builtin/` 为空。

新增内置主题时放在 `packages/themes/builtin/<id>/`，由 `build:themes` 独立构建为主题归档：开发环境从 `.artifacts/system-themes/<id>` 发现，发布环境从 `Resources/system-themes/<id>` 发现；desktop 不导入它的源码。

## 依赖边界

主题只依赖 `@vetta-org/theme-sdk` 和 `@vetta-org/theme-ui`。`AppBackground`、`InputBarBackground` 等应用 UI view 及其 registry contract 由 `@vetta-org/theme-ui` 导出。

远程主题不应 import `@shared/*`、`@domains/*` 或 desktop 内部 hook。需要数据时调用 SDK facade hook；需要复用 UI 时，把 hook 返回的 model 作为 props 传给官方 view。

## 当前约束

- 内置主题由主进程扫描和 runtime loader 加载，但设置页 UI 主题选择尚未接入。
- 远程主题包下载和 Module Federation 加载尚未接入。
- 新增可见文案仍必须走 i18n。
