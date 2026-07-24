# @vetta/desktop-app

Electron desktop host for the Vetta runtime.

## What It Owns

- Electron main/preload/renderer wiring
- desktop-specific IPC bridges
- file explorer, scheduler, project, and chat renderer domains
- integration of runtime packages into a desktop shell

## What It Does Not Own

- provider protocol implementations
- core agent loop logic
- business backend rules

## Who Depends On It

- end users running the desktop application

## Internal Boundaries

- `src/main`: Electron main process and native capabilities
- `src/preload`: safe bridge surface for the renderer
- `src/renderer`: React application domains and UI

## Development

Run `bun dev` from this package after installing the monorepo dependencies. The development startup
builds changed workspace prerequisites, stages plugin and theme manifests, then starts the renderer,
theme server, and Electron process in parallel.

Main-process sourcemaps are disabled by default to keep startup builds fast. Set
`VETTA_MAIN_SOURCEMAP=true` when source-mapped Electron stack traces are needed.

## Electron E2E (WebdriverIO)

Uses WebdriverIO + `@wdio/electron-service` (see `wdio.conf.ts`, `e2e/`).

```bash
# 1) 构建 main / preload / renderer 产物
bun run build

# 2) 未打包入口冒烟（默认，使用 dist/main/index.js）
bun run test:e2e

# 或对 electron-builder 解包二进制冒烟
bun run pack:win:test   # 或 pack:linux:test / 对应平台
bun run test:e2e:packaged
```

运行时会设置 `VETTA_E2E=1`、`VETTA_CONFIG_DIR=.vetta-e2e`，并用 `.wdio-electron-user-data` 隔离 Chromium 用户数据。
Agent 日常 UI 自验仍走仓库根目录的 `verify:ui:*`（Playwright）；本套件面向正式 E2E / CI。

