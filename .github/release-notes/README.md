# 发布说明（Release Notes）

每个桌面端版本一个文件，命名为 `v<major>.<minor>.<patch>.md`，例如 `v0.5.58.md`。
`desktop-release` 工作流发布 GitHub Release 时，直接把对应文件作为 Release 正文，
所以这里写的就是用户在 Release 页面读到的内容。

## 什么时候写

新增功能、修复缺陷、合并 PR、关闭 issue 之后，把对应条目补进**当前开发中版本**的文件里
（版本号以 `apps/desktop/package.json` 的 `version` 为准）。文件不存在就新建。
发布流水线会校验该文件存在，缺失即发版失败。

## 怎么写

- 标题用 `# Vetta <版本号>`，下一行是发布状态标记（见下）。
- 分 `## 新增` / `## 改进` / `## 修复` / `## 其他` 四节，没有内容的小节直接省略。
- 面向用户描述影响：说清楚用户会看到什么变化，而不是改了哪个函数。行为有取舍时把代价一并写出来。
- 关联 PR 或 issue 时统一用 `owner/repo#123` 格式，例如 `openvetta/open-vetta#8`。
- 已发布版本的文件不再修改；发现写错另起一条修订说明。唯一的例外是发版完成后把状态标记改成 `released`。

## 发布状态标记

标题下一行是一条 HTML 注释，在 Release 页面上不显示：

```
# Vetta 0.5.70
<!-- release-status: unreleased -->
```

- `unreleased`：开发中，可以往里写条目，也只有这个状态能打 tag 发布。
- `released YYYY-MM-DD`：已发布，不能再写条目，也不能再发一次。
- 没有标记：0.5.69 之前的旧文件，按已发布处理。

标记由脚本维护，不要手改：

| 命令 | 作用 |
| --- | --- |
| `node scripts/release/release-notes.mjs --status` | 查看当前版本的状态 |
| `node scripts/release/release-notes.mjs --mark-released` | 发版完成后标为已发布（默认今天） |
| `node scripts/release/release-version.mjs --start-next [patch\|minor\|major\|x.y.z]` | 开下一个版本：改 `package.json`、`bun.lock`，新建带 `unreleased` 的说明文件 |
| `node scripts/release/release-version.mjs --retarget x.y.z` | 开发中途改这一版的版本号，条目原样带过去 |
| `node scripts/release/release-preflight.mjs` | 打 tag 前的预检，在合并好的 main 上运行 |

完整流程见 `vetta-release` skill。

历史版本（0.5.48 及更早）的记录留在 `apps/desktop/CHANGELOG.md`。
