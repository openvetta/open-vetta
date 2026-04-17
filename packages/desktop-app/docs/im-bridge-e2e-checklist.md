# IM Bridge — Cross-platform E2E Checklist

This checklist must be executed manually before each release that touches
the IM bridge. Each row corresponds to a task in the
`add-desktop-im-settings` OpenSpec change (group 10).

The harness cannot run these in CI: each one requires a real (or virtual)
desktop session, a real Feishu app, and a real network. Estimate ~1–2 hours
per platform.

## Prerequisites

- A Feishu self-built app with bot enabled, App ID + App Secret in hand
- Build the desktop-app for the target platform: `bun run dist:mac`,
  `dist:win`, or `dist:linux`
- Install the produced artifact like an end user (drag dmg → Applications,
  install nsis, etc.)

## Per-platform matrix

| # | Platform | Status |
|---|----------|--------|
| 10.1 | macOS arm64 | ☐ |
| 10.2 | macOS x64 | ☐ |
| 10.3 | Windows 11 x64 | ☐ |
| 10.4 | Linux x64 (Ubuntu, libsecret installed) | ☐ |
| 10.5 | Linux x64 (no libsecret — degraded plaintext mode) | ☐ |

## Per-row procedure

1. Launch Vetta from a clean install.
2. Open Settings → IM 集成.
3. Toggle 启用 IM 桥接 → 输入 App ID + App Secret → 保存.
4. Confirm the status badge transitions: `connecting` → `online` within
   ~10s.
5. From a Feishu chat with the bot, send `/help`. Confirm a markdown reply
   with the 5 commands.
6. Add a project in Vetta, then send `/projects` in feishu. Confirm the
   new project appears in the list (no sidecar restart needed).
7. Send `/use <project>` then a real prompt. Confirm the agent reply
   streams back into the IM thread.
8. Click 重启桥接 in settings. Confirm sidecar PID changes and status
   returns to `online`.
9. Modify App Secret → 保存. Confirm sidecar restarts (PID changes,
   `connecting` → `online` again).
10. Right-click tray → 完全退出 (or `app.quit()`). Run a process probe and
    confirm no `im-gateway` process remains:
    - macOS / Linux: `ps aux | grep im-gateway`
    - Windows: `tasklist | findstr im-gateway`
11. Confirm no launchd / systemd / Windows service was registered:
    - macOS: `ls ~/Library/LaunchAgents/ | grep -i vetta`
    - Linux: `systemctl --user list-units | grep -i vetta`
    - Windows: `Get-Service | Where-Object Name -like '*vetta*'`

## 10.5 — Linux degraded mode special procedure

1. Boot a Linux VM that does **not** have libsecret installed.
2. Launch Vetta. In settings, the credential warning banner must appear
   (`当前系统未提供密钥服务...`).
3. Save credentials. Confirm `~/.vetta/desktop-app/im-credentials.enc` was
   created.
4. `stat -c '%a' ~/.vetta/desktop-app/im-credentials.enc` → must be `600`.
5. `head -c 20 ~/.vetta/desktop-app/im-credentials.enc` should start with
   `VETTAIMP1` (the plaintext magic), confirming we did not silently
   encrypt with a degraded key.

## 10.6 — Crash recovery

1. With sidecar online, run `kill -9 <pid>` (or `taskkill /f /pid <pid>`).
2. Within ~5 seconds the status badge should switch to `error` then
   `connecting` then `online` again.
3. The 实时日志 抽屉 should contain "sidecar restart scheduled..."
   followed by the new ready event.

## 10.7 — Persistent failure UX

1. Enter an obviously invalid App Secret.
2. Save. Watch the status flap through `connecting` → `error` 5 times.
3. After 5 failures the status badge stays `error` and the log shows
   `sidecar failed to start 5 times in a row`.
4. Click 重启桥接 to verify the user-controlled retry path works.

## 10.8 — Hot config switch

1. With sidecar online and 一次正常对话已完成, change App Secret to a
   different valid value.
2. Confirm sidecar PID changes and the new App Secret is in effect (test
   by sending another prompt from Feishu).

## 10.9 — Project hot update

1. With sidecar online, add a new project in Vetta's project list.
2. Without restarting sidecar, send `/projects` in Feishu.
3. The new project must appear immediately.

## 10.10 — Legacy migration

1. On a fresh install, place mock files at:
   - `~/.vetta/im-gateway/config.yaml`
   - `~/.vetta/im-gateway/credentials.yaml` containing `app_id: cli_test`
     and `app_secret: secret_test` (one per line, simple yaml)
2. Launch Vetta and open Settings → IM 集成.
3. The blue "检测到旧版 im-gateway 配置" banner must appear with the
   detected App ID.
4. Click 导入到新设置.
5. Verify the form is now populated and the old yaml files have been
   renamed with `.bak` suffix.
