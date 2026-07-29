# 桌面应用发布与自动更新

桌面端统一使用 `electron-updater`。业务 API 不保存版本、不代理安装包，也不决定更新源；更新源在构建时写入安装包，同一套客户端代码可以产出官方 R2 版本或公开 GitHub Releases 版本。

## 发布拓扑

| 构建目标 | `VETTA_UPDATE_PROVIDER` | 更新源 | 适用场景 |
|---|---|---|---|
| 官方版本 | `generic` | `https://releases.example.invalid/desktop/stable` | R2 + Cloudflare CDN |
| 开源版本 | `github` | 公开 GitHub Releases | fork、自托管社区版本 |
| 开发/QA | `none` | 无 | 不检查更新 |

这是构建期选择，不是运行时平台开关。官方包与开源包共享代码，但各自的 `app-update.yml` 固定指向自己的发布源，避免平台服务或业务 API 成为运行时依赖。

## R2 布局

Cloudflare 资源：

- Bucket：`vetta-releases`
- 自定义域名：`releases.example.invalid`
- 发布前缀：`desktop/stable`
- 客户端更新 URL：`https://releases.example.invalid/desktop/stable`

对象布局：

```text
desktop/stable/
  latest.yml
  latest-mac.yml
  latest-linux.yml
  Vetta Setup <version>.exe
  Vetta Setup <version>.exe.blockmap
  Vetta-<version>.dmg
  Vetta-<version>-mac.zip
  Vetta-<version>.AppImage
  ...
```

安装包和 blockmap 使用一年 immutable 缓存；`latest*.yml` 使用 60 秒短缓存并重新验证。自定义域名的 CDN 缓存命中不会触发 R2 Class B 读取，回源未命中仍会产生 R2 操作次数；R2 公网出口本身不收流量费。

## GitHub Actions 配置

工作流：`.github/workflows/desktop-release.yml`。推送 `v*` tag 或手动触发后，Windows、macOS、Linux runner 分别构建，全部成功后才发布。

官方 R2 仓库变量：

```text
VETTA_RELEASE_TARGET=r2
VETTA_UPDATE_URL=https://releases.example.invalid/desktop/stable
VETTA_R2_BUCKET=vetta-releases
VETTA_R2_PREFIX=desktop/stable
```

官方 R2 仓库 Secret：

```text
VETTA_R2_ACCOUNT_ID
VETTA_R2_ACCESS_KEY_ID
VETTA_R2_SECRET_ACCESS_KEY
```

R2 API Token 只授予 `vetta-releases` 的对象读写权限。Secret 不写入仓库，也不会进入桌面安装包。

开源仓库不设置 `VETTA_RELEASE_TARGET` 时默认发布到当前仓库的 GitHub Releases。客户端读取公开 Release 不需要 GitHub Token。

## 发布原子性

`publish-update-artifacts-r2.mjs` 解析各平台 `latest*.yml`，只上传清单实际引用的安装包及其 blockmap，不会把 `release/` 中残留的旧产物误发。大文件通过 S3 multipart 分片上传：

1. 上传版本化安装包和 blockmap。
2. 通过公开更新域名验证这些对象可读取。
3. 最后覆盖 `latest*.yml`。
4. 再验证更新清单可读取。

因此客户端不会先看到一个引用尚未上传安装包的新清单。

## Release Notes

打包时从 `packages/desktop-app/CHANGELOG.md` 精确提取当前 `package.json` 版本对应的 `## [version]` 区段，写入 electron-builder 的 `releaseInfo.releaseNotes`。发布脚本应先完成版本号与 Changelog 定版，再创建 tag；本地尚未定版的 QA 构建找不到对应区段时只告警，不阻断打包。

## 未签名阶段

当前配置允许先生成未签名安装包：

- Windows NSIS 可以下载和校验，但 SmartScreen 会提示未知发布者。
- macOS 未签名/未公证包仍受 Gatekeeper 限制；自动替换是否成功不能作为正式发布保证。
- Linux AppImage 由更新清单的 SHA-512 校验完整性。

后续提供证书后，应在 CI Secret 中接入 Windows 代码签名，以及 macOS Developer ID、hardened runtime 与 notarization。签名不会改变 R2/GitHub 双更新源架构。

## 回滚

发布清单是更新入口。发现问题时可立即把 `latest*.yml` 恢复为上一版以停止旧客户端继续升级，但 `allowDowngrade=false`，已经安装新版本的客户端不会自动降级。正式修复应发布更高版本号；不要用同一版本覆盖不同二进制。
