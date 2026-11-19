# ADR-0156 桌面端移除 Vetta 服务端接入

## 背景

桌面端曾按「商业版 / 开源版」两种形态构建：`VETTA_CLOUD_ENABLED` 作为构建期常量，决定账号登录、订阅与积分、云端能力市场、远程模型目录和「云网关」模型渠道是否进入产物。服务端（业务 API、计费、管理台）拆到独立的 `vetta-serv` 仓库后，本仓库的开源构建不再维护这条链路，开关默认就是 `false`。

开关关闭只让入口不可达，没有删除实现：账户页、订阅卡、用量图表、团队管理、消息中心、SSE 通知、OAuth 回调、云网关桥接与官方市场下载都留在代码里，`settings-tab-loaders.ts` 仍无条件把账户页注册成独立 chunk，产物里因此还存在一个永远打不开的页面。文案、i18n 键、构建变量、CI 输入 `cloud_enabled` 也继续暗示「存在一个会连接服务端的版本」。

只要这条链路还在，任何一次页面重构、IPC 收口或主题改造都要为它保留一条分支，读代码的人也无法从产物判断客户端到底会连接什么。

## 决策

本仓库的桌面端不再连接 Vetta 服务端，构建期不再有「版本形态」开关。

- 删除整条服务端集成面：`main/cloud/**`（OAuth、会话刷新、网关中转）、`renderer/cloud/**`、preload 的 `auth` / `subscription` IPC 合同、`settings` 的 server URL / token 方法，以及账户、订阅、用量、团队、远端 MCP、消息中心、登录弹层对应的组件与 i18n。
- 设置页不再有 `account`、`team` 标签页，`SettingsTab` 与能力目录序列化里去掉 `personalOnly` / `requireAuth`；旧的深链 `?tab=account` 回落到 `general`。
- 官方能力市场的服务端下载实现（按 slug 拉取归档并校验签名）一并移除。`vetta:skills:install-from-market-slug` 保留为显式抛错的 SDK 兼容入口，能力目录只来自 GitHub 开放市场（`VETTA_OPEN_MARKETPLACE_*`）与本地安装状态。
- 构建与发布面去掉 `VETTA_CLOUD_ENABLED`、`VETTA_SERVER_URL`、`VETTA_SITE_URL`、`cloud_enabled` 与 `edition`：构建环境校验改为「配置服务端地址即报错」，`resolve-desktop-release-config` 的内置更新源固定为 GitHub Release（`release_target=r2` 仍可发布，用于仍读 R2 的旧客户端过渡）。
- 依赖服务端的内置技能（`publish-ability` 等）连同脚本与清单条目一并删除；`api.ts` 退化为纯类型模块，网页端渲染层不再持有任何 HTTP 客户端。
- 本地用量统计（`app-monitor` 的 `~/.vetta/app-monitor`）不受影响，继续是 token 与成本的本地事实源。

`packages/coding-agent` 的远程模型子系统（`setServerUrl` / `setServerToken` / `loadRemoteModels`）**本次保留**：没有 server URL 时它惰性失效，桌面端已不再调用。它的公共类型与 `settings.json` 字段被 CLI 与约 60 个契约测试引用，彻底删除属于独立变更，需要有各自的回归覆盖。

## 备选方案

只给设置页 loader 加 `cloudEnabled` 门禁。改动最小，但实现、文案与构建变量继续存在，产物仍然描述一个会连接服务端的客户端，下一次改动还要重新判断这些分支是否可达。

把云能力拆成可选插件包，开源构建不打包。当前没有第二个宿主或分发渠道需要它，属于为假设需求预留扩展点；而且插件包无法承载主进程的 OAuth 回环与 IPC 合同。

保留 `VETTA_CLOUD_ENABLED` 但不消费。校验器仍要求显式取值，CI 仍传 `cloud_enabled` 与 `server_url`，形成「配置看上去有效、代码里没有消费者」的误导。

## 后果

客户端无法再登录、查看订阅或使用 Vetta 托管的模型渠道，界面入口与相关文案全部消失；升级到该版本的用户会失去账户页，已保存的服务端令牌在启动时被一次性清掉。依赖官方云市场安装的技能需要在开放市场找到对应仓库。

服务端仍可通过别的客户端形态访问，桌面端不再是其中之一。构建与发布的语义因此变简单：一个形态、一套更新源、一组 CI 变量；`resolve-desktop-release-config`、`desktop-build-environment` 与 `theme-ui` 不再需要维护双形态分支。

`packages/coding-agent` 里的远程模型能力成为暂时无人调用的库能力，后续若确认没有其他宿主使用，应作为独立变更删除并按需迁移 `settings-schema`。
