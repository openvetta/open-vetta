---
name: install-ability
description: 在本机 Vetta 中安装能力——插件（plugin）、Skill 与 MCP 服务器。用户说「装一个插件 / install plugin / 从能力市场安装 / 加一个 MCP server / 配置 MCP / 装个 skill」，或插件装完没生效、需要 reload、pending 版本没应用时使用。不用于安装 npm 依赖、IDE 插件、浏览器扩展，也不用于开发插件（那是 plugin-workbench）或创作 Skill（那是 create-skill）。
metadata:
  version: 1.0.0
  author: Vetta
  category: 开发
---

# 在 Vetta 中安装能力

Vetta 的能力分三种，安装路径互不相同。**先分类，再动手**。

| 用户给的东西 | 类型 | 安装路径 |
| --- | --- | --- |
| npm 包名、`.zip`、http(s) zip 链接、本地插件工程目录 | 插件 | `vetta-plugin-cli add` → 按需 `reload`（§2） |
| 能力市场里的插件条目 | 插件 | 引导用户在能力市场页安装（§2.6） |
| 能力市场里的 skill（有 slug） | Skill | `skills.manage install-from-market`（§3） |
| 用户自己写的 / 仓库里的 SKILL.md | Skill / 场景 | 交给 `create-skill` skill（§3.2） |
| `command` + `args`，或一个 MCP 的 http url | MCP | 先定装到哪一层（§1.1），再 `mcp.manage upsert`（§4） |

分不清时**先问用户**，不要凭包名猜类型：npm 上的 `@modelcontextprotocol/server-*` 是 MCP，不是 Vetta 插件。

## 1. 通用前置

- **只在用户明确要求安装时执行**。当前任务缺某个工具，不构成自行安装能力的理由。
- 所有写操作都会弹宿主审批。用户拒绝就**停下并如实报告**，不要改走别的路子达成同一效果。
- **禁止直接改注册表**：`~/.vetta/plugins/`、`~/.vetta/plugins-manifest.json`、`~/.vetta/skills-manifest.json`（市场安装的部分）、`~/.vetta/agent/mcp.json` 都由宿主维护，手写会与宿主状态错位。
- 安装源来自用户。第三方 zip / http 链接在安装前把来源念给用户确认一次。
- **查看已装内容只用查询动作**（`mcp.query` / `skills.query` / `plugins.query`），不要去读 `~/.vetta/agent/mcp.json` 等配置文件：里面可能有明文密钥，读进来就进了对话上下文，还会发给模型供应商。查询动作返回的密钥字段已脱敏。

### 1.1 装到哪一层（scope）

MCP 可以装在两层：**全局**（`~/.vetta/agent/mcp.json`，我的所有项目都能用）或**项目**（`<项目根>/.vetta/mcp.json`，只对这个项目生效，文件在仓库里、可以随仓库提交给团队）。装之前先定层，不要默认替用户选：

| 用户的说法 | 层 |
| --- | --- |
| 「这个项目 / 这个仓库 / 给团队用 / 提交进仓库」 | project |
| 「我自己用 / 所有项目 / 全局 / 以后都要」 | global |
| 没说清，且当前会话有项目目录 | **先问**一句：装到全局，还是只装到当前项目（`<项目根>`）？ |
| 当前没有项目目录（纯对话） | global，不用问 |

- 问的时候写明两层的区别：全局只影响他自己；项目级会写进仓库里的 `.vetta/mcp.json`，同事拉下来也会启动它。
- 用户已经说清就**不要再问**，直接按他说的层执行。
- **插件只有全局**，不用问。**能力市场里的 skill 目前也只能装到全局**（`install-from-market` 没有 scope）。用户明确要「只给这个项目」时如实说明这个限制，由他决定改装全局，或自己写一份项目 skill（交给 `create-skill`）。
- 项目根用当前会话的工作目录（绝对路径）。

## 2. 插件

### 2.1 命令入口

```bash
npx @vetta-org/plugin-cli add <npm-package|./local.zip|https://…/x.zip|.>
npx @vetta-org/plugin-cli reload <plugin-id>
```

`.` 表示「当前插件工程」（会先 pack）。加 `--json` 便于解析结果。

npx 不可用或离线时，用系统插件「制作插件」内置的同一份 CLI：先 `plugins.query` → `{"operation":"get","id":"plugin-workbench"}` 取 `rootPath`，再

```bash
node "{workbenchRoot}/agent/cli/vetta-plugin-cli.js" add <source> --json
```

CLI 不直接写插件目录，它把请求交给正在运行的宿主校验、审批、安装。npm 包会以关闭生命周期脚本的方式下载，只解出 `package.json#vetta.archive` 声明的那个归档。

### 2.2 安装后必须重载（本 skill 的核心）

- **首次安装**：宿主直接启用，输出 `Installed <id>@<version>.` —— 到此结束。
- **覆盖升级已装插件**：宿主把新版本挂成 **pending**，输出

  ```
  Installed <id>@<old>. Update <new> is pending reload. Run `vetta-plugin-cli reload <id>` to apply it.
  ```

  此刻插件**仍在跑旧代码**。安装动作没有完成，必须立刻重载：

  ```bash
  npx @vetta-org/plugin-cli reload <plugin-id>
  ```

`--json` 下的判据（不要靠读人类文案）：

| 字段 | 含义 | 动作 |
| --- | --- | --- |
| `result.plugin.pendingVersion` 非空 | 新版本待应用 | **必须** `reload` |
| `reload` 返回 `plugin.activeVersion` | 当前生效版本 | 应等于刚装的版本，否则报告异常 |

reload 走与 UI 相同的宿主审批流，用户确认后新版本才生效。

### 2.3 热更新是例外

改**已安装插件**、或对方是开发中的工程时，先 `plugins.query` → `get <id>`：

- 返回项含 `devWatch` → 热更新已开启，源码构建成功后自动重载。**不要** reload、不要重装。
- 无 `devWatch` → 走 §2.1 / §2.2 常规流程。

开发迭代（不是安装）可以直接开热更新：在插件工程目录 `npx @vetta-org/plugin-cli watch`，`--stop` 关闭。

### 2.4 没有 CLI 时的等价调用

```json
plugins.manage {"operation":"install-from-url","url":"https://…/x.zip"}
plugins.manage {"operation":"reload","id":"<plugin-id>"}
```

本地路径安装用 `install-from-path`（zip 绝对路径 + `"enable": true`）。若目标是「制作插件」工作台里的工程，改为引导用户点面板的「应用到 Vetta」，那条路径不弹确认。

### 2.5 退出码

`0` 成功 · `2` 参数错 · `3` 连不上宿主（Vetta 没运行，或 `VETTA_CONFIG_DIR`/`VETTA_HOME` 指到了别的环境）· `4` 宿主拒绝（权限、id 冲突、系统插件不可覆盖）· `5` 其它失败。遇到 `3` 先让用户确认 Vetta 桌面端在前台运行，不要反复重试。

### 2.6 能力市场里的插件

市场插件没有 Agent 侧的按 slug 安装动作。用 `navigation.open` 打开能力市场页，让用户点安装；装完再按 §2.7 校验即可。

### 2.7 校验

`plugins.query` → `{"operation":"get","id":"<id>"}`，确认 `enabled === true`、`activeVersion` 是目标版本、`pendingVersion` 不存在。

## 3. Skill 与场景

### 3.1 从能力市场装

```json
skills.manage {"operation":"install-from-market","type":"skill","slug":"<slug>"}
```

`type` 为 `"skill"`。**slug 不确定就别猜**：用 `navigation.open` 打开能力市场让用户挑，拿到准确 slug 再装。

市场 skill 一律装到全局（见 §1.1）。Skill 不需要 reload，装完即进入能力页。校验：`skills.query {"operation":"manifest"}`，确认目标 name 在清单里且 `enabled: true`。

### 3.2 本地 / 自己写的 Skill

不要在这里手搓目录和清单——按 `create-skill` skill 的流程做（全局 `~/.vetta/skills/<name>/`、项目 `<root>/.vetta/skills/<name>/`、插件 `agent/skills/<name>/` 各有各的注册方式）。

### 3.3 启停与卸载

```json
skills.manage {"operation":"set-enabled","name":"<name>","enabled":false}
skills.manage {"operation":"uninstall","name":"<name>"}
```

卸载前先 `skills.query manifest` 核对真实 `type`，类型对不上宿主会直接拒绝。

## 4. MCP 服务器

```json
mcp.manage {"operation":"upsert","name":"filesystem",
  "data":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/abs/dir"]}}

mcp.manage {"operation":"upsert","name":"remote",
  "data":{"type":"http","url":"https://example.com/mcp","headers":{"Authorization":"Bearer …"}}}

mcp.manage {"operation":"upsert","name":"docs","scope":"project","cwd":"/abs/project",
  "data":{"command":"npx","args":["-y","docs-mcp"],"env":{"DOCS_TOKEN":"${DOCS_TOKEN}"}}}
```

- 缺省是 stdio；远程必须显式写 `"type":"http"`（Streamable HTTP，**首选**）。只有服务器文档明说只提供 SSE 端点、或用户给的是 `.../sse` 地址时才用 `"type":"sse"`（旧传输，已被官方弃用，仅为兼容）；不要为了「保险」默认选 sse。可选字段：`env`、`cwd`、`disabled`、`autoApprove`、`startupTimeout`、`debug`。
- **层由 §1.1 决定**，写在 `scope`（`global` | `project`）上：不写等于 `global`；`scope:"project"` **必须**同时传项目根 `cwd`（绝对路径），否则会被拒绝而不是悄悄退回全局。注意这个 `cwd` 是项目根，`data.cwd` 才是 server 进程的工作目录，别混。
- **密钥只从用户处取**，放进 `env` / `headers`，不要回显到聊天里。**项目级文件会进仓库**，所以 `scope:"project"` 时密钥一律写成 `${VAR}` 引用（如 `"DOCS_TOKEN":"${DOCS_TOKEN}"`），并告诉用户把真实值放进环境变量；不要把明文写进项目文件。全局文件只在他本机，才可以由用户在审批弹窗里手填。
- `upsert` 同名即覆盖，用它做「更新配置」，不要先 remove 再加。
- 装之前先 `mcp.query {"operation":"list","cwd":"<项目根>"}`：它把全局和项目的 server 一起列出并标明 `scope`，用来发现重名。来自项目根 `.mcp.json` 的条目带 `readOnly:true`——那是别的工具维护的文件，**Vetta 不会改写它**，`mcp.manage` 也改不了；要改请让用户直接编辑那个文件。
- 校验：`mcp.query {"operation":"get","name":"<name>","scope":"…","cwd":"…"}`（密钥字段会脱敏）。**不要主动启动用户的可执行文件去做握手探测**——`get` 能返回配置就算装好了，能否连上要等宿主重连后才知道。只有用户要求排错、或工具确实起不来时，才把 `command args` 在终端手跑一次看报错，再改配置；不要靠反复 upsert 试。
- 停用 / 删除：`mcp.manage set-enabled` / `remove`。只传 `cwd` 不传 `scope` 时按名字自动定位；全局和项目里**同名**则必须指明 `scope`，否则会报错——这时问用户要动哪一个，不要替他猜。
- 新装 MCP 的工具在**当前会话**里可能要等宿主重连才出现。这不是安装失败，别为了让工具出现而重装。

## 5. 报告

安装结束后向用户说明：装了什么类型、**装在哪一层（全局，还是哪个项目的 `.vetta/mcp.json`）**、id/name 与版本、**是否执行了 reload 及重载后的 activeVersion**、校验结果，以及任何被用户拒绝或未能执行的步骤。不要把「已提交安装请求」说成「已安装成功」。
