# 图像生成（image-gen）

类 Grok 的文生图 / 图改图系统插件。

## 能力

- **输入栏「图像生成」开关**：开启后，下一条提示词会触发图像生成（给本轮 `PromptRequest.metadata` 注入 `imageMode`，agent 优化 prompt 后调用内置 `generate_image` 工具）。
- **消息下方预览卡**：streaming 结束后，在生成图像的那条消息下渲染预览，带「编辑」「导出」。
- **活动面板「图像生成」选项卡**：点预览卡「编辑」后打开，可对图像做图改图（image-to-image），并查看该图的编辑谱系（历史版本）。

## 配置（插件设置）

在「设置 → 插件设置」中配置：

- `baseUrl`：OpenAI 兼容图像 API 基址（不含 `/images`），默认 `https://api.openai.com/v1`
- `apiKey`：API Key（secret）
- `model`：图像模型，默认 `gpt-image-1`
- `size`：输出尺寸

## 架构

实际的 `/v1/images` 调用与落盘由 desktop 主进程图像服务完成（读本插件设置），插件只负责 UI。详见仓库 `docs/adr/0028`。插件 id 必须为 `image-gen`（与 agent 图像后端绑定一致）。
