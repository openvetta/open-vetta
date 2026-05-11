# 发版资产规范

desktop-app 的无感更新走客户端拉取 + 本地替换的链路，对 admin 上传的资产文件格式有约束。**请严格遵守下表，否则客户端会拒绝下载或落地安装失败**。

## 资产命名约定（按 platform + arch + 文件扩展名）

| 平台 (`platform`) | 架构 (`arch`) | 资产格式 | electron-builder target | 客户端用途 |
|---|---|---|---|---|
| `darwin` | `arm64` | `.zip`（含 `Vetta.app`） | `zip` | 无感更新（解压 → 替换 `/Applications/Vetta.app`） |
| `darwin` | `arm64` | `.dmg`（可选） | `dmg` | 首次安装或用户从官网下载 |
| `darwin` | `x64` | `.zip` / `.dmg` | 同上 | 同上 |
| `win32` | `x64` | `.exe`（NSIS 安装包） | `nsis` | 无感更新（`/S` 静默安装，NSIS 自启动新版） |
| `linux` | `arm64` / `x64` | `.AppImage` | `AppImage` | 无感更新（覆盖 `$APPIMAGE` + relaunch） |

**客户端选择规则**（`updater.ts:pickAsset`）：

1. 先按 `platform` + `arch` 精确匹配；
2. 在匹配集合里，按平台首选扩展名进一步过滤（mac `.zip` / win `.exe` / linux `.AppImage`）；
3. 若首选扩展名缺失，回退到匹配集合里 `file_size` 最大的（最后一道兜底，可能装不上）。

## 上传流程（admin 后台）

1. 进入 `/releases`，点"新建版本"，填 `version`（三段式数字，例如 `0.13.2`）+ `release_note`
2. **每个平台/架构组合**上传对应资产（建议至少：darwin-arm64、darwin-x64、win32-x64、linux-x64 各一个 zip/exe/AppImage）
3. mac 至少上传 `.zip`（无感更新依赖它），`.dmg` 可选作为给非客户端用户的官网下载格式
4. 全部上传完毕后点"发布"。客户端的 `GET /releases/latest` 才会返回此版本

## 打包侧产出（在 `packages/desktop-app/` 跑）

```bash
# mac 默认就会产出 dmg + zip
bun run dist:mac

# win NSIS 安装包
bun run dist:win:nsis

# linux AppImage
bun run dist:linux:appimage
```

产物在 `packages/desktop-app/release/` 下。

## 已知限制

- **无 hash 校验**：当前服务端 `AppReleaseAsset` 没有 sha256/md5 字段，客户端只做 `Content-Length` 等值检查作为兜底完整性。建议后续给 `app_release_assets` 表加 `sha256` 字段、上传时计算、下载完客户端校验。
- **无 HTTP Range / 断点续传**：API server 直接流式代理 S3，下载中断需重头开始。一次下载量级约 100-200MB，可接受。
- **mac 自动更新只覆盖 `/Applications` 下的 .app**：如果用户把 Vetta 装在自定义目录（如 `~/Applications/Vetta.app`），客户端会从 `process.execPath` 推断 bundle 路径，仍然能工作；但写入需要对该目录有写权限。
- **Windows oneClick NSIS 安装到用户目录**：electron-builder 默认 `oneClick: true` 安装到 `%LOCALAPPDATA%\Programs\Vetta`，无需管理员权限。如果改为 perMachine 安装，无感更新会被 UAC 弹框打断。
- **Linux 仅支持 AppImage**：deb / rpm 的更新要走包管理器，不在客户端处理范围内。如果用户从 deb 安装，客户端会显示"当前平台不支持无感更新"。
