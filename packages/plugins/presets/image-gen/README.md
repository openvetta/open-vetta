# 图像生成（image-gen）

类 Grok 的文生图 / 图改图系统插件。

## 能力

- **输入栏「图像生成」开关**：开启后，下一条提示词会触发图像生成（给本轮 `PromptRequest.metadata` 注入 `imageMode`，agent 优化 prompt 后调用内置 `generate_image` 工具）。
- **消息下方预览卡**：streaming 结束后，在生成图像的那条消息下渲染预览，带「编辑」「导出」。
- **活动面板「图像生成」选项卡**：点预览卡「编辑」后打开，可对图像做图改图（image-to-image），并查看该图的编辑谱系（历史版本）。

## 配置（插件设置）

在「设置 → 插件设置」中按服务商配置：

- `provider`：服务商，`openai` / `agnes-ai` / `custom`
- `apiKey`：API Key（secret），三个服务商都需要
- `openaiModel` / `agnesModel`：内置服务商的模型下拉选择（目前各一个选项，后续可扩充）
- `baseUrl`、`model`：仅 `custom` 时显示并需要填写（标准 OpenAI v1 图像生成格式）

选中 `agnes-ai` 时，设置页会显示一条 `desc` 说明项，附带申请 API Key 的链接（可点击跳转外部浏览器）。

内置服务商的接口地址已固定，用户只需填 `apiKey` 并选择模型：

| provider | baseUrl | 可选模型（默认） |
| --- | --- | --- |
| `openai` | `https://api.openai.com/v1` | `gpt-image-2` |
| `agnes-ai` | `https://apihub.agnes-ai.com/v1` | `agnes-image-2.1-flash` |

输出尺寸不在设置中选择：由 agent 通过 `generate_image` 工具的 `size` 参数决定并传给模型（缺省 `1024x1024`）。

## 架构

实际的 `/v1/images` 调用与落盘由 desktop 主进程图像服务完成（读本插件设置），插件只负责 UI。详见仓库 `docs/adr/0028`。插件 id 必须为 `image-gen`（与 agent 图像后端绑定一致）。
