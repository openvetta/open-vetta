# 预设服务商目录改为客户端内置，模型列表按服务商适配器动态拉取

取代 [ADR-0015](./0015-preset-provider-templates.md) 的「服务端下发模板目录」部分：预设服务商（Claude / OpenAI / DeepSeek / Z.ai(GLM) / Kimi / Gemini）的 `baseUrl`、`api`、图标 symbol 全部**内置在客户端** (`packages/desktop-app/src/main/models/presets/catalog.ts`)，`/providers/templates.json` 与启动时的在线合并一并删除。原因：模板目录本身是不含密钥的静态元数据，为它强依赖服务端换来的是「首启离线预设区为空」和「服务端挂了就没有预设」，收益为零。

**模型列表改为向服务商本人要。** 用户填完 key 立刻请求该家 `/models`，之后每 12 小时后台同步一次，设置页每行还有手动刷新。各家接口形状不一致，按 `fetcher` 分派到三个适配器：

- `anthropic`：`GET /v1/models`，`x-api-key` + `anthropic-version`，游标分页；元数据最全（`capabilities.thinking` / `image_input` / `effort` 等级、`max_input_tokens`）。
- `openai-compatible`：`GET {baseUrl}/models`，Bearer；OpenAI / DeepSeek / Z.ai 只返回 id，Kimi 额外给 `context_length` / `supports_reasoning` / `supports_image_in`，一并解析（多余字段对其它家无害）。
- `gemini`：`GET {baseUrl}/models?key=`，`pageToken` 分页，按 `supportedGenerationMethods` 含 `generateContent` 过滤，给 `inputTokenLimit` / `outputTokenLimit` / `thinking`。

**接口不给的字段用内置静态表补，接口给了的一律以接口为准**（`metadata.ts`，按模型 id 正则匹配）。价格只能来自这张表——没有一家 `/models` 返回价格；匹配不到就不显示价格，不臆造。这是 ADR-0015「纯动态 /models 拿不到能力元数据」那条否决理由的正解：动态拿 id + 静态补能力，而不是二选一。

**持久化沿用 snapshot-on-key**：填 key 即落成 `models.json` 里的普通 provider 条目（`source:"template"` + `templateId`），新增 `modelsSyncedAt` 记录同步时间。拉取只在主进程发生且**只拉不写**，由渲染层连同 key 一起落盘，避免两处各写一次 `models.json`；后台定时同步例外，它直接经 `ModelSettingsService` 写回。

## Consequences

- 冷启动断网也有预设服务商可选（展示内置种子模型），「免配置」承诺在离线下成立。
- 服务端不再能推送新模型或修正配置；换来的是模型列表跟着服务商自己走，比人工维护的目录更新更快。
- 内置价格表会过期。只覆盖主流模型族，宁可不显示也不显示错的；新模型价格需要跟版本发布走。
- 早期由服务端模板采纳、现已不在内置目录里的条目仍展示（标记「已下线」），但不提供刷新入口。
