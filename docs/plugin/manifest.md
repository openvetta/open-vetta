# 清单参考（plugin.json）

`plugin.json` 是插件的唯一清单，位于 zip 归档根（或唯一顶层文件夹内）。

## 完整示例

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "0.1.0",
  "pluginApiVersion": "^1.0.0",
  "runtime": "module-federation",
  "entry": "dist/mf-manifest.json",
  "moduleFederation": {
    "remoteName": "my_plugin",
    "expose": "./plugin"
  },
  "styles": ["dist/style.css"],
  "permissions": ["ui.slot.global", "agent.session.read"],
  "description": "一句话说明这个插件做什么",
  "author": "你的名字",
  "guidingWords": ["帮我总结当前对话", "把这段代码加上注释"],
  "contributes": {
    "settings": [
      { "key": "apiKey", "type": "secret", "title": "API Key", "description": "服务的密钥" }
    ]
  },
  "agent": {
    "systemPrompt": { "promptPaths": ["prompts/extra.md"] },
    "skillPaths": ["skills/"],
    "toolPolicy": { "allow": [], "deny": [] }
  }
}
```

## 字段

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `id` | ✅ | string | 全局唯一插件 id。决定安装目录、id 冲突时的去重，建议小写短横线。 |
| `name` | ✅ | string | 展示名。 |
| `version` | ✅ | string | 语义化版本。**bump 它可强制宿主重新拉取**绕过缓存（见下与 [styling-and-pitfalls.md](./styling-and-pitfalls.md)）。 |
| `pluginApiVersion` | ✅ | string | 兼容的 SDK API 版本范围（如 `^1.0.0`）。 |
| `runtime` | ✅ | `"module-federation"` \| `"esm"` | 加载模式，见 [运行时](#运行时runtime)。 |
| `entry` | ✅ | string | 入口路径。MF 模式指向 `dist/mf-manifest.json`。 |
| `moduleFederation` | MF 必填 | `{ remoteName, expose }` | `remoteName` 与 vite 配置 `name` 一致；`expose` 与 vite `expose` 一致（默认 `./plugin`）。 |
| `styles` | ❌ | string[] | 要注入的 CSS 文件路径（相对插件根）。 |
| `permissions` | ❌ | string[] | 声明需要的权限，见 [permissions.md](./permissions.md)。未声明即不可用。 |
| `description` | ❌ | string | 简介，展示在插件管理页。 |
| `author` | ❌ | string | 作者。 |
| `guidingWords` | ❌ | string[] | 新会话引导词，见 [下文](#guidingwords引导词)。 |
| `contributes.settings` | ❌ | object[] | 插件设置项 schema，见 [配置项](#contributessettings配置项)。 |
| `agent` | ❌ | object | Agent 侧贡献（系统提示词片段 / skill / 工具策略），见 [Agent 清单](#agent-agent-侧贡献)。 |

## 运行时（runtime）

- **`module-federation`（推荐）**：宿主用 `@module-federation/enhanced/runtime` 动态注册你的 remote 并加载 `expose`。`entry` 指向 `dist/mf-manifest.json`。React / React DOM / `@vetta/plugin-sdk` 由宿主作为共享单例提供。
- **`esm`（兼容保留）**：旧加载模式，把 `react`、`react/jsx-runtime`、`react/jsx-dev-runtime`、`@vetta/plugin-sdk` 映射到 `vetta-host://` 模块。新插件用 MF。

## 安装目录与版本机制

已安装插件按版本存放：

```text
~/.vetta/plugins/<id>/versions/<version>/
```

- 安装一个**更新版本**只被记录为 **pending**；App 持续加载当前 `activeVersion`。
- 直到用户（或代码）触发 `window.vetta.plugins.reload(id)` 才切换到新版本 UI。
- 因此调试时改了代码要 bump `version` + reload 才稳妥生效（缓存原因见 [styling-and-pitfalls.md](./styling-and-pitfalls.md#缓存刷新)）。

## guidingWords（引导词）

`guidingWords?: string[]` 是插件的**第一个声明式 UI 贡献**——与命令式 `ctx.ui.register*` 不同：**纯静态清单数据、无权限位、无运行时注册**。

- 唯一消费者是**新会话欢迎页**：在技能徽章下方按插件**分组**展示（组标题取插件 `name`），入选条件 = 插件已启用且 `guidingWords` 非空。
- 点击一条引导词＝以其文本立即发起一轮对话（不填入输入框）。
- 展示限额（轮播，非数据截断）：同时最多 3 组、每组最多 4 词；超出则组级 / 词级轮播。

## contributes.settings（配置项）

声明插件设置项，宿主在**设置页**统一渲染，值持久化后由插件经 `ctx.settings` 读取（见 [conversation-and-agent.md](./conversation-and-agent.md#设置-api)）。

每个设置项：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | string | 设置键（`ctx.settings.get(key)` 用它读）。`desc` 类型可省。 |
| `type` | `"string"` \| `"secret"` \| `"enum"` \| `"desc"` | 控件类型。 |
| `title` | string | 标签。`desc` 类型可选。 |
| `description` | string | 说明文本。`desc` 类型里其中的 http(s) 链接会渲染成可点外链。 |
| `default` | any | 默认值。 |
| `enum` | string[] | `type:"enum"` 的可选值。 |
| `visibleWhen` | `{ key, in }` | 按**另一个设置项**的当前值决定本项是否显示（`in` 是允许值数组）。 |

示例（按服务商显隐不同字段）：

```json
{
  "contributes": {
    "settings": [
      {
        "key": "provider", "type": "enum", "title": "服务商",
        "enum": ["openai", "custom"], "default": "openai"
      },
      {
        "key": "openaiApiKey", "type": "secret", "title": "API Key",
        "visibleWhen": { "key": "provider", "in": ["openai"] }
      },
      {
        "key": "baseUrl", "type": "string", "title": "API Base URL",
        "visibleWhen": { "key": "provider", "in": ["custom"] }
      },
      {
        "key": "note", "type": "desc",
        "description": "需要 Key？前往 https://example.com/keys 申请。"
      }
    ]
  }
}
```

- `secret` 值加密存储、UI 以密码框呈现。
- 值按**插件 id 命名空间**隔离；写入只能经宿主设置 UI，插件侧**只读**。

## agent（Agent 侧贡献）

可选，向 agent 会话注入插件打包的资源（路径相对插件根，主进程聚合解析）：

| 字段 | 说明 |
| --- | --- |
| `agent.systemPrompt.promptPaths` | 追加进系统提示词的提示片段文件路径。 |
| `agent.skillPaths` | 加入 agent 资源图的 skill 文件 / 目录。 |
| `agent.toolPolicy.allow` / `.deny` | 声明式工具可见性策略（名字是工具注册后的 id）。 |

> 在 JS 里**动态**注册 agent 工具走 `ctx.agent.registerTool`（见 [conversation-and-agent.md](./conversation-and-agent.md#注册-agent-工具)），与此处的**声明式**清单字段是两条不同路径。
