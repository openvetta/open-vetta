# 快速开始

从零搭建、构建、安装、调试一个 Vetta 桌面插件。

## 前置条件

- Node / Bun（仓库统一用 [Bun](https://bun.sh)）。
- 一个 Vetta 桌面 App（用于安装调试）。
- 插件用 React 19 + TypeScript + Vite，经 **Module Federation** 打成 remote。

## 1. 项目结构

一个最小插件项目：

```text
my-plugin/
  plugin.json          # 清单（见 manifest.md）
  package.json
  tsconfig.json
  vite.config.ts       # Module Federation 配置
  src/
    index.tsx          # 插件入口：export default definePlugin(...)
    style.css          # 可选样式
```

构建产物（`dist/`）形如：

```text
dist/
  mf-manifest.json     # MF 清单（plugin.json 的 entry 指向它）
  remoteEntry.js       # MF remote 入口
  style.css            # 若有样式
```

## 2. package.json

```json
{
  "name": "my-plugin",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bunx vite build",
    "check": "bunx tsc --noEmit"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.12",
    "@types/react": "^19.1.1",
    "@types/react-dom": "^19.1.1",
    "@vetta/plugin-sdk": "workspace:*",
    "@vetta/plugin-vite": "workspace:*",
    "react": "19.1.1",
    "react-dom": "19.1.1",
    "typescript": "^5.9.2",
    "vite": "^7.1.7"
  }
}
```

> `react` / `react-dom` 仅用于类型与本地构建——运行时由**宿主作为共享单例提供**，不会打进你的 bundle（见 [styling-and-pitfalls.md](./styling-and-pitfalls.md)）。`@vetta/plugin-sdk` 同理：构建时被 external 化，运行时由宿主提供。仓库内插件用 `workspace:*` 直链源码；仓库外插件改用发布版本号。

## 3. vite.config.ts

用 `@vetta/plugin-vite` 的 `vettaPluginFederation` 封装 Module Federation 配置：

```ts
import tailwindcss from "@tailwindcss/vite"; // 可选，用 Tailwind 时
import { vettaPluginFederation } from "@vetta/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    vettaPluginFederation({
      name: "my_plugin",        // MF remoteName，与 plugin.json.moduleFederation.remoteName 一致
      entry: "./src/index.tsx", // 入口（默认即此）
      expose: "./plugin",       // 暴露名（默认 "./plugin"，与 plugin.json.moduleFederation.expose 一致）
      // package: true,         // 见 §5：构建后自动产出 release/<id>-<version>.zip
    }),
  ],
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
});
```

`vettaPluginFederation` 自动：把 `react` / `react-dom` 设为 `singleton`、`import:false`（用宿主的），把 `@vetta/plugin-sdk` 设为 external，产出 `mf-manifest.json` + `remoteEntry.js`，CSS 落 `dist/style.css`。

## 4. 入口 src/index.tsx

```tsx
import { definePlugin } from "@vetta/plugin-sdk";
import { useState } from "react";
import "./style.css";

function MyPanel() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="vetta-plugin-my-plugin">
      <button type="button" onClick={() => setOpen(false)}>关闭</button>
    </div>
  );
}

export default definePlugin({
  activate(ctx) {
    // ctx 提供全部能力出口，按需注册贡献 / 调用能力
    ctx.ui.registerGlobalSlot({ id: "root", component: MyPanel });
  },
  deactivate() {
    // 可选：清理你自己起的副作用（定时器、监听等）。
    // 注册返回的 Disposable 已由宿主在卸载时统一处置，无需手动 dispose。
  },
});
```

`definePlugin` 只是身份函数，返回 `{ activate, deactivate? }`。也可不用它、直接 `export function activate(ctx) {}` —— 宿主两种形态都认。

> **顶层禁用共享依赖（含 JSX）**：MF 的 react / jsx-runtime 是异步填充的，bootstrap 完成前为 `undefined`。模块顶层写 `const ICON = <svg/>` 会在求值时抛 `TypeError: ... is not a function`，整个插件加载失败。把这类 JSX 放进 `activate()` 或组件函数体内。详见 [styling-and-pitfalls.md](./styling-and-pitfalls.md)。

## 5. 构建与打包

```bash
bunx vite build      # 产出 dist/（mf-manifest.json + remoteEntry.js + style.css）
```

发布需要一个 **zip**：根目录放 `plugin.json`，其下 `dist/`。两种方式：

- **自动**：`vettaPluginFederation({ ..., package: true })`，`vite build` 后自动产出 `release/<id>-<version>.zip`（打包 `plugin.json` + `dist/` + 清单声明的 `styles` / `agent.promptPaths` / `agent.skillPaths`）。
- **手动**：自行把 `plugin.json` 与 `dist/` 一起 zip：

  ```text
  my-plugin.zip
    plugin.json
    dist/
      mf-manifest.json
      remoteEntry.js
      style.css
  ```

> 归档根目录必须有 `plugin.json`，或只含**一个**顶层文件夹、`plugin.json` 在其中。

## 6. 安装

通过桌面 App **设置 → 插件** 页安装，两条用户路径：

- **本地 zip**：选择本地 `.zip` 文件。
- **远程 URL**：填写一个 zip 的下载地址。

安装后插件文件按版本落在：

```text
~/.vetta/plugins/<id>/versions/<version>/
```

随后在该页给插件**授予它声明的权限**（缺权限时对应 API 会抛错，见 [permissions.md](./permissions.md)），并启用。

> 仓库内**系统插件（presets）**走另一条集成路径，不经此安装流，见 [system-plugins.md](./system-plugins.md)。

## 7. 调试闭环（dev loop）

1. 改代码 → `bunx vite build` 重新产出 `dist/`。
2. 重装该 zip（或如果是 presets，走 preset 构建）。
3. **强制刷新缓存**：插件 bundle 经 `vetta-plugin://` 加载，Chromium 会缓存 `remoteEntry.js`，**改动不一定即时生效（重启也未必清）**。最稳的办法是**把 `plugin.json` 的 `version` 往上 bump**，强制宿主当作新版本重新拉取。
4. 在设置页触发 `window.vetta.plugins.reload(id)`（或重开 App）让宿主重新加载已启用插件。

> 安装更新版本只会被记录为 **pending**；App 持续加载 `activeVersion`，直到 `reload(id)` 才切换到新版本 UI。

## 下一步

- 清单全字段：[manifest.md](./manifest.md)
- 权限：[permissions.md](./permissions.md)
- 各 UI 扩展点：[ui-slots.md](./ui-slots.md)
- 消息卡片系统：[message-cards.md](./message-cards.md)
- 对话 / Agent 工具 / 文件 / 图像 / 设置：[conversation-and-agent.md](./conversation-and-agent.md)
- 样式与陷阱：[styling-and-pitfalls.md](./styling-and-pitfalls.md)
