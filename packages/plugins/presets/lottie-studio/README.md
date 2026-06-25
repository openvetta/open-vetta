# Lottie Studio（系统插件）

用 AI 生成 Lottie（Bodymovin）动画，并在侧边活动面板用 Skia / Skottie 实时预览与编辑可调属性（slot）。迁移自 [diffusionstudio/lottie](https://github.com/diffusionstudio/lottie) 的 text-to-lottie 技能。

## 能力

- **AI 生成**：注册 agent 工具 `save_lottie_animation`。工具描述承载完整的 bodymovin 创作约定与 few-shot 模板；agent 先把动画 JSON 写成草稿文件，再调用本工具校验、落盘、自动打开预览。
- **输入栏开关**：「Lottie」badge（`registerInputAction`），仅当生成工具在当前会话激活时显示。
- **侧边预览**：「Lottie Studio」活动面板 Tab（`registerActivityTab`），扫描工作目录下的 `*.lottie`，用 Skottie 渲染播放，并按 `getSlotInfo()` 自动生成可调属性面板（取色器 / 滑块 / 数字 / 文本框）。
- **文件预览**：`.lottie` 文件可在文件树直接点开预览（`registerFilePreview`）。
- **slot 回写**：拖动控件即时改动画并防抖写回磁盘（磁盘为真相源）。

## 格式说明

`.lottie` 文件存的是**裸 bodymovin JSON 文本**（非标准 dotLottie zip）。原因：插件 fs API 的 `writeFile` 只支持 utf8 字符串，无法写二进制 zip。该扩展名避开了内置 `.json` 预览的抢占，并能被本插件的文件预览接管。

## 渲染引擎

CanvasKit「full」构建（含 Skottie + slots），`canvaskit.wasm`（约 8MB）随插件 bundle 打包到 `dist/assets/`，运行时通过 `locateFile` 重定位到本插件的 `vetta-plugin://` 源加载。

## 构建

```bash
bun run build   # bunx vite build → dist/ + release/lottie-studio-<version>.zip
bun run check   # bunx tsc --noEmit
```

随 App 的 `build:presets` 自动构建并 staging（需在 `packages/plugins/tenants.json` 的对应租户列表中列出 `lottie-studio`）。
