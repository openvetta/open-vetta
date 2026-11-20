# 发布说明（Release Notes）

每个桌面端版本一个文件，命名为 `v<major>.<minor>.<patch>.md`，例如 `v0.6.14.md`。
`desktop-release` 工作流发布 GitHub Release 时直接把对应文件作为 Release 正文，
同时它会被打进安装包，用户在应用内「本版本功能」里读到的也是同一份内容。

所以这份文件**只有一个读者：用户**。规则也只在这里维护一份，其他文档只做指引。

## 什么时候写

**发版当天一次成稿，不在开发过程中逐条追加。**

开发期的记录留在该留的地方：commit 标题与正文（为什么改）、PR 模板里的
「What users will see」、ADR。发版前按这些原料一次性写出整版说明，才能合并同类、
按用户看到的区域归组、把内部术语换成用户语言；逐条追写只会得到流水账。

开新版本时 `release-version.mjs --start-next` 会建好带结构与 Footer 的空骨架，
定稿门禁会拦住没写条目的版本，所以「先空着」不会漏。

## 结构

```md
# Vetta 0.6.14
<!-- release-status: unreleased -->

## English

### New

- Plugins can now reuse the host's keycaps: the same keycap rendering as Settings, with ⌘ on macOS and Ctrl on Windows.

### Improvements

- Settings → Shortcuts now shows one raised keycap per key.

## 中文

### 新增

- 插件可以复用宿主的快捷键键帽：与设置页同一套质感，macOS 显示 ⌘、Windows 显示 Ctrl。

### 改进

- 设置 → 快捷键改为一键一枚的浮雕键帽。

**Full Changelog**: https://github.com/openvetta/open-vetta/compare/v0.6.13...v0.6.14
```

- 英文在上、中文在下，两段的条数与顺序一一对应。
- 允许的小节：`New` / `Improvements` / `Fixes`，对应 `新增` / `改进` / `修复`。
  有破坏性变更或用户需要动手的（重新登录、迁移配置、旧项目要重开）再加
  `Upgrade notes` / `升级注意`，没有就不写。
- 标题下面那行 `<!-- release-status: ... -->` 由脚本维护，见下文。
- 文末 `**Full Changelog**` 必须指向上一版到本版：GitHub 上它就是「本次全部改动」的入口。

## 怎么写

- **一条只讲用户看得见的一处变化**：现象、收益、代价。不写实现、不写文件名。
- **按用户看到的区域合并**：同一块界面上的几处调整写成一条，而不是一个 commit 一条。
- **判据是「用户会不会注意到」**：重构、测试、依赖升级、文档、内部工具一律不写。
  整个版本确实没有可见变化时，两段各写一句「本次只包含内部改进，界面没有可见变化」。
- 上限：每段 6 条；单条中文 90 字、英文 240 字符。超了说明还在写开发日志，先合并。
- 不出现文件路径、代码标识符、`#123` 这类编号，也不出现「重构 / 单测 / 守卫」等内部词。
  关联 PR 与 issue 放在 Release 之外的说明或 Footer 里。

## 开发流水放哪

| 想看什么 | 去哪看 |
| --- | --- |
| 这次改了什么、为什么 | commit 标题与正文、PR 描述里的「What users will see」 |
| 本版全部改动清单 | Release 底部的 `Full Changelog`（GitHub 自动对比两个 tag） |
| 起草素材（一次取全） | `node scripts/release/collect-release-commits.mjs` |
| 是否漏写了用户可见的变化 | 起草时逐条对账：每个 commit 对应哪一条说明，或判定为内部改动；这张表给发版的人看，不进正文 |

## 门禁

| 命令 | 作用 |
| --- | --- |
| `node scripts/release/release-notes.mjs --check` | 定稿门禁：双语两段、条数、长度、内部术语、占位文字、Footer 指向。发布流水线的 quality 阶段跑的就是它 |
| `node scripts/release/release-notes.mjs --status` | 查看当前版本是 `unreleased` 还是 `released` |
| `node scripts/release/release-notes.mjs --mark-released` | 发版完成后标为已发布（默认今天） |
| `node scripts/release/collect-release-commits.mjs` | 列出上一版到 HEAD 的提交、动机与触及区域，起草用 |
| `node scripts/release/release-preflight.mjs` | 打 tag 前预检，在合并好的 main 上运行，含说明定稿与上一版核对 |
| `node scripts/release/release-version.mjs --start-next [patch\|minor\|major\|x.y.z]` | 开下一个版本：改 `package.json`、`bun.lock`，按模板新建说明骨架 |
| `node scripts/release/release-version.mjs --retarget x.y.z` | 开发中途改这一版的版本号，已有条目与 Footer 原样带过去 |

## 发布状态标记

标题下一行是一条 HTML 注释，在 Release 页面与应用内都不显示：

```
# Vetta 0.6.14
<!-- release-status: unreleased -->
```

- `unreleased`：开发中，可以往里写条目，也只有这个状态能打 tag 发布。
- `released YYYY-MM-DD`：已发布，不能再写条目，也不能再发一次。
- 没有标记：0.5.69 之前的旧文件，按已发布处理。

标记由脚本维护，不要手改。

## 应用内怎么显示

应用读同一个文件，只显示界面语言对应的那一段，并去掉标题、状态标记与
`Full Changelog` 行（`apps/desktop/src/shared/release-note-language.ts`）。
0.6.13 之前的单语说明原样显示。

## 历史

历史版本（0.5.48 及更早）的记录留在 `apps/desktop/CHANGELOG.md`，该文件自 0.5.58 起冻结。
已发布的版本说明不再修改；发现写错，另起一条修订说明。
