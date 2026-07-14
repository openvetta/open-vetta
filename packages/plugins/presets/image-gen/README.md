# 图像生成（image-gen）

类 Grok 的文生图 / 图改图系统插件。

## 能力

- **输入栏「图像生成」开关（软隔离）**：开启后给 `PromptRequest.metadata` 注入 `imageMode`，由 input-pipeline 注入隐形意图提示（本轮要产出图像）。**未开启时**工具仍可用——用户自然语言明确要求生图/改图也可调用；开启则加强引导。无显式编辑目标时，agent **自感知**——按 prompt 语义自行决定调用内置 `generate_image`（全新画面）还是 `edit_image`（在最近一张图上修改）。
- **消息下方版本 swiper**：在生成图像的那条消息下横向排列该图编辑谱系的全部版本（超出可左右翻看），每张 hover 出「编辑」「导出」。同一谱系只在最新一条消息下渲染，生成中时最前面插入「生成中」骨架卡。
- **图改图统一从输入栏触发**：点某张图的「编辑」icon → 该图作为编辑目标 attach 到输入栏顶部胶囊（`ui.setEditImageAttachment`），发送时注入 `metadata.editImageId`，agent 强制调用 `edit_image` 以该图为 source。一次性，发送后释放。

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

实际的 `/v1/images` 调用与落盘由 desktop 主进程图像服务完成（读本插件设置），插件只负责 UI。生成与编辑都走 coding-agent 内置 tool（`generate_image` / `edit_image`）→ 主进程服务，成为正式会话轮次。详见仓库 `docs/adr/0028`、`docs/adr/0029`。插件 id 必须为 `image-gen`（与 agent 图像后端绑定一致）。
