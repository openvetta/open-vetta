# ADR-0151：在 OpenAI 兼容协议上放开自定义图片服务

## 状态

已采纳。部分修订 ADR-0057（Vetta Provider 内置于 desktop）与 `image-gen` README 中「自定义 API 逃生舱已撤」的结论；不改变 ADR-0056（服务端按积分计量，服务端仓库中）与 ADR-0059（通用媒体协议）。

## 背景

「设置 → Agent 配置 → 图片」的下拉只列出已注册的媒体 Provider，实际只有内置的 `desktop-app:vetta` 网关 Provider。用户要用自己的生图服务（官方 OpenAI、聚合站、自建网关）无处可填（openvetta/open-vetta#75、openvetta/open-vetta#71）。

此前撤掉「自定义 API」的理由有两条：客户端不应持有 key；一旦允许自带 key，客户端就要自养一套 provider 适配，而改图协议各家不同，与服务端已有适配形成长期双维护。项目负责人评估后决定：**只在 OpenAI 兼容这一种协议上放开**，其余协议仍不支持。

## 决策

### 1. 一种协议，两个端点

新增主进程内的 OpenAI 兼容图片 Provider 工厂（`openai-compatible-image-provider.ts`），只发：

- 文生图：`POST {baseUrl}/images/generations`，JSON：`model`、`prompt`、`n=1`、`size`；
- 图生图：`POST {baseUrl}/images/edits`，`multipart/form-data`：`model`、`prompt`、`n`、`size`、`image`。

响应只认 `data[0].b64_json` 或 `data[0].url`。Base URL 由用户填写并包含版本段（如 `https://api.example.com/v1`）。不做路径改写、不做其他协议（Replicate、Gemini、聚合站私有改图形态等）的适配——这些仍是明确不支持。

### 2. 每个用户配置对应一个注册到现有 Registry 的 Provider

用户可添加多条服务：名称、Base URL、API Key、模型名，并标注支持文生图 / 图生图。每条注册为 `custom-openai:<uuid>`，`ownerId = desktop-app`，模型目录里有且仅有用户填的那个模型。因此：

- 设置页两个下拉、`image-gen` 插件的 `selectImageProvider` / `selectImageModel`、Registry 的模型校验全部沿用，**不改插件、不改协议**；
- 插件仍然不感知 key、不能指定 URL（ADR-0057 的「媒体 API 不接受 path、URL、header、token」不变）；
- 未标注的模式不会出现在对应下拉里，Registry 会拒绝该模式的提交。

### 3. 机密边界

- API Key 只写入 `CredentialVault`（Electron safeStorage 加密，命名空间 `image-providers`，与模型 key 同一机制）。
- 非机密字段存 `~/.vetta/desktop-app/custom-image-providers.json`，**不**进 `desktop-config.json`，key 绝不进任何明文文件。
- 渲染进程是单向写入：`save` 可带 `apiKey`，`list` 只返回 `hasApiKey`；编辑时 key 留空表示沿用。
- key 只在发请求时从 Vault 取出，写入 `Authorization` 头；不进 Provider 描述符、Registry 日志、Job 元数据。上游错误文本若回显了 key，会在进入错误信息前被替换为 `***`，且只回显 JSON 错误里的 `message`、不回显整页 HTML。
- 图片响应是 URL 时，仅当与 Base URL 同源才附带 `Authorization`，避免把 key 发给 CDN 等第三方。
- 编辑时若 Base URL 的主机（origin）变了，必须重新输入 key，避免把旧 key 悄悄发给另一个服务。
- Base URL 仅允许 `http(s)`，禁止内嵌用户名密码、query、fragment。允许 `http` 是为了本机/内网自建网关。
- 安全存储不可用（`safeStorage` 无后端）时拒绝保存，不降级为明文。

### 4. 网络栈

请求走 Electron `net.fetch`（Chromium 网络栈），跟随应用代理设置；超时 300 秒，可随任务取消。

## 边界与不做

- 不做协议探测、模型列表拉取、连通性测试按钮。
- 不做按次计费、尺寸白名单：尺寸原样转发给上游，由上游决定是否接受；价格由用户自己的账户承担。
- 不做视频；不做 OpenAI 之外的协议。
- 自定义服务与内置 Vetta 网关并存；「自动选择」仍优先内置 Vetta Provider，不会因用户添加了自定义服务而静默改走用户 key。

## 结果

- `image-gen` README 关于「逃生舱已撤」的描述改为「仅在 OpenAI 兼容协议上由宿主提供」；插件侧仍无凭据设置项、无 `network.fetch` 权限。
- 双维护风险被限定在两个端点、一种响应形态内；改图的私有形态差异继续只在服务端适配。
- 遗留：未在真实第三方服务上做联调；各家对 `size`、`n`、`images/edits` 字段的容忍度不同，不兼容时会以上游错误信息的形式返回给 Agent。
