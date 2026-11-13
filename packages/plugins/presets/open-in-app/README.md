# 从外部应用打开（open-in-app）

随 Vetta Desktop 发布的系统插件，也是声明式 `registerHeaderAction`（`useAction` hook）的官方示例。

会话页顶栏的统一按钮组里多一格（用户可以把它收纳或拖到别的位置），点开是下拉菜单，把当前项目目录交给：

- Finder（在访达中显示）
- VS Code、Cursor、Zed、Xcode
- 终端

菜单里列出全部应用，用 `open -Ra <应用>` 探测哪些装了（一次运行只测一次，不会真的启动它们），没装的置灰、不可点；图标取自应用本身（`ctx.command.appIcon`）。

限制：仅 macOS；SSH 远程项目的目录不在本机，整个按钮不显示；没有活动目录时同样不显示。`useAction` 返回 `null` 时宿主不显示它，也不占顶栏名额。

权限：`ui.slot.header-action`、`agent.command.run`（只声明了 `open` 一个命令，用户可在插件设置里关掉），要求 Plugin API `^2.9.0`。

```bash
bun run build   # 生成 dist/ 与 release/open-in-app-<version>.vettapkg
bun run test
bun run check
```

想加别的应用：在 `src/apps.ts` 的 `EXTERNAL_APPS` 里加一项（`appName` 是 `open -a` 用的应用名），再在 `locales/` 补 `app.<id>`。
