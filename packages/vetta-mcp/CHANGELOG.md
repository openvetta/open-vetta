# Changelog

## [Unreleased]

### Added

- 首个版本：Vetta 内置 MCP server（stdio）。宿主自动拉起，用户无需配置，也不作为可安装条目出现在能力市场。
  - `upload_ability`：把 skill / scene / mcp / plugin / bundle 提交到能力市场。入参在本地做严格校验并**一次性列全所有问题**，agent 一轮即可补齐重试，不必靠 HTTP 400 来回试探。
  - `list_my_abilities`：查看自己提交过的条目、审核状态与驳回理由。
  - 鉴权与客户端共享：读 `~/.vetta/auth.json`（由 desktop 主进程在登录/刷新时写入），也支持 `VETTA_API_BASE_URL` / `VETTA_API_TOKEN` 环境变量覆盖。凭据不经环境变量传给子进程，避免 token 出现在进程列表里。
