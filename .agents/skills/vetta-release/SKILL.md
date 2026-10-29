---
name: vetta-release
description: 发布 Vetta 桌面端新版本的完整流程：预检、dev 合并到 main、打 tag、推送、监视 desktop-release 流水线并重试瞬时故障、验证线上更新源、把发布说明标成已发布并开下一个版本；也用于「开下一个版本」「这一版改发 0.6.0」这类版本号变更。只在用户明确要求发版或改版本号时使用；写代码、写发布说明条目、普通推送都不用它。
---

# 发布 Vetta 桌面端

发版的每一步都由脚本判断，你负责按顺序执行、在检查点停下、把结果如实汇报。不要凭记忆或 git 历史推断「这个版本发没发」「下一个版本是几」，一律问脚本。

原理（渠道、R2、签名公证、自动更新）见 `docs/release/desktop-release-runbook.md`，这里只写执行步骤。

## 什么时候用

| 用户说 | 做什么 |
| --- | --- |
| 「发版」「发布 v0.5.70」「合并到 main 打 tag」 | 完整流程，第 1–8 步 |
| 「开下一个版本」「下个版本开 0.6.0」 | 只做第 8 步的 `--start-next` |
| 「这一版改发 0.6.0」「版本号改成 1.0.0」 | 只做下面的「改这一版的版本号」 |

用户只说了「改完提交」「推一下 dev」，不是发版，不要用这个 skill。

### 直接调用 `/vetta-release`

用户输入斜杠命令本身就是明确的发版指令，不要再问「要发吗」。按参数执行：

| 命令 | 做什么 |
| --- | --- |
| `/vetta-release` | 发布当前版本（第 1–7 步），发完标记已发布并开下一个修订版本（第 8 步），推送 main、tag 和 dev |
| `/vetta-release minor` / `major` / `0.6.0` | 同上，但下一个版本按参数开 |
| `/vetta-release next [minor\|major\|x.y.z]` | 不发版，只开下一个版本（要求当前版本已发布），推送 dev |
| `/vetta-release retarget 0.6.0` | 不发版，只改这一版的版本号，推送 dev |
| `/vetta-release status` | 只汇报当前版本号和发布状态，什么都不改 |

直接调用时只在这几种情况停下来问：预检没过、确认摘要里升的不是修订号（次版本号、主版本号或跳号）、出现不可重试的失败。其余步骤一路执行，进度用一句话报，最后按「汇报」一节给结果。

## 两条不能破的线

1. **推送 main 和 tag 是对外发布。** 只有用户在当前对话里明确说了发版或推送才执行；以前说过不算。第 3 步的确认摘要和用户预期不一致时，停在推送之前。
2. **只重试已知的瞬时故障。** 其他失败一律停下、诊断、汇报，不改代码、不重新打 tag、不删 tag。

## 先判断现在在哪一步

流程可能被中断过（会话结束、Monitor 过期）。开始前先看状态，从断点接着走，已经做过的步骤不要重做：

```bash
node scripts/release/release-notes.mjs --status      # 当前版本 unreleased / released
git fetch origin --tags
git ls-remote --tags origin "refs/tags/v<版本>"      # tag 推了没有
gh run list --workflow desktop-release.yml --limit 3  # 流水线跑到哪了
```

| 看到的 | 从哪一步继续 |
| --- | --- |
| 状态 `unreleased`，远端没有 tag | 第 1 步 |
| 远端已有 tag，run 在跑或失败了 | 第 5 步 |
| run 成功，状态仍是 `unreleased` | 第 7 步 |
| 状态 `released`，`package.json` 还是这个版本 | 第 8 步的 `--start-next` |

## 发版流程

### 1. 预检工作区（在 dev 上）

```bash
git branch --show-current     # 必须是 dev
git status --short
node scripts/release/release-notes.mjs --check
```

- 不在 dev 上就停下问用户。
- 工作区里有不属于这次发版的改动（常见的是别人留下的 `bun.lock`、未跟踪的 `.vetd` 目录），用 `git stash push <路径>` 只暂存已跟踪的那几个文件，最后第 8 步结束时 `git stash pop`。不要提交它们，也不要丢掉。
- `--check` 不过（版本已发布或没有发布说明）就停下，告诉用户先开下一个版本或补发布说明。

### 2. 合并 dev 到 main

```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff dev -m "chore(release): 合并 dev 发布 v<版本>"
```

提交信息固定是这个格式，历次发版都一样。合并有冲突就停下汇报，不要自行解决。

### 3. 预检要发的版本，给用户看确认摘要

```bash
node scripts/release/release-preflight.mjs
```

它检查五件事，任何一项不过都会列出来并以非零退出：

1. tag、`apps/desktop/package.json`、`bun.lock`、发布说明的文件名和标题，版本号处处一致。**这一项最要紧**：`desktop-release` 对版本号不符的 tag 会直接失败。
2. 本地、远端都没有这个 tag，GitHub 上没有同名 Release，发布说明标着 `unreleased`。
3. 版本比上一个已发布的大，且是正常的下一个修订号、次版本号或主版本号。跳号或没归零（0.5.69 → 0.5.72、0.5.69 → 0.6.1）会被拦下，用户确认是有意的才加 `--allow-irregular`。
4. 当前在 main 上，dev 已完整合并，main 与 dev 文件内容一致，工作区干净。
5. 发布说明至少有一条条目，没有 TODO / 待补之类的占位文字。

预检不过：退回 main（`git reset --hard origin/main`，只在这一步、合并提交还没推送时可以这样做），回到 dev 修好再来。

预检通过：把它打印的摘要原样贴给用户（版本、升了哪一位、上一个版本、提交数、发布说明条目数、插件版本变化）。用户已经在当前对话里说了发版，就继续第 4 步；摘要里有用户没预料到的内容（比如升的是次版本号、提交数明显不对），先问。

### 4. 打 tag 并推送

```bash
git tag v<版本>
git push origin main
git push origin v<版本>
```

tag 打在第 2 步的合并提交上。推送后 `gh run list --limit 3` 确认 `desktop-release` 已经触发。

### 5. 用 Monitor 监视流水线

用 Monitor 轮询这次 run 的每个 job，输出状态变化，run 结束（任何结论）时退出：

```bash
RUN=<run id>; prev=""; while true; do
  out=$(gh run view $RUN --json status,conclusion,jobs --jq '(.jobs[] | "\(.name): \(.status) \(.conclusion // "")"), "RUN: \(.status) \(.conclusion // "")"' 2>/dev/null) || { sleep 30; continue; }
  cur=$(echo "$out" | sort); comm -13 <(echo "$prev") <(echo "$cur"); prev="$cur"
  echo "$out" | grep -q '^RUN: completed' && break
  sleep 45
done
```

- `timeout_ms` 设最大值（30 分钟）。一次完整发版通常要 40 分钟以上，过期了就用同一个命令重新启动，不要以为结束了。
- 收到事件后不要另外轮询，等下一个事件。
- 某个 job 失败时，立刻用 `gh api repos/openvetta/open-vetta/actions/jobs/<job id>` 看失败的步骤，用 `.../jobs/<job id>/logs` 看日志（run 没结束时 `gh run view --log-failed` 拿不到日志）。

### 6. 只重试已知的瞬时故障

GitHub 要等**整个 run 结束**才允许重跑。run 结束后：

```bash
gh run rerun <run id> --failed
```

然后重新启动第 5 步的 Monitor。

可以重试的只有这些（看日志里的原文）：

| 特征 | 原因 |
| --- | --- |
| `The staple and validate action failed! Error 68`，伴随 `api.apple-cloudkit.com` 和 `NSURLErrorDomain Code=-1005` | macOS 公证装订时 Apple CloudKit 断线，出现在「Build updater artifacts」或「Verify updater artifacts」 |
| `ETIMEDOUT`、`ECONNRESET`、`502 Bad Gateway`、`503` 出现在下载依赖或上传产物的步骤 | 网络抖动 |
| runner 被取消或丢失（`The runner has received a shutdown signal`） | GitHub 基础设施 |

- 同一个 job 最多重试 3 次（0.5.69 的 macOS x64 用了 3 次）。用完还失败就停下汇报。
- 其他任何失败（测试挂了、类型检查、签名证书、版本号校验、构建报错）：停下，把失败步骤和关键日志贴给用户，不重试。

### 7. 验证线上更新源

run 成功（包括最后的 `promote update metadata`）后，确认旧版本真的能更新：

```bash
B=https://releases.openvetta.com/desktop/stable
for f in latest.yml latest-mac.yml latest-linux.yml; do curl -fsS --max-time 40 "$B/$f" | grep -E '^version|url:|size:'; done
gh release view v<版本> --json isDraft,isPrerelease,assets --jq '.isDraft, .isPrerelease, (.assets | length)'
```

- 三份清单的 `version` 都是新版本。
- 清单里每个文件用 `curl -sSI` 拿到 200，`content-length` 与清单里的 `size` 一致。
- GitHub Release 不是草稿、不是预发布，资源齐全（0.5.69 是 19 个）。
- 从国内直连 `releases.openvetta.com` 偶尔超时或 TLS 中断，重试几次即可，不算发版失败；但要在汇报里提一句。

更新地址以构建日志里的 `VETTA_UPDATE_URL` 为准，默认是上面这个。

### 8. 收尾：标记已发布，开下一个版本（在 dev 上）

```bash
git checkout dev
node scripts/release/release-notes.mjs --mark-released
git add .github/release-notes/v<版本>.md
git commit -m "docs(release): v<版本> 标记为已发布"

node scripts/release/release-version.mjs --start-next     # 默认修订号 +1
git add apps/desktop/package.json bun.lock .github/release-notes/v<下一版本>.md
git commit -m "chore(release): 桌面端版本推进到 <下一版本>"
```

- 用户说了下个版本要升次版本号或主版本号，用 `--start-next minor` / `--start-next major` / `--start-next 0.6.0`。没说就用默认值，并在汇报里写明开的是哪个版本。
- 这两个提交在 dev 上。要不要推 dev，按第一条线：用户说了才推。
- 最后 `git stash pop` 还原第 1 步暂存的改动。

## 改这一版的版本号

开发中途决定这一版不叫 0.5.70、改叫 0.6.0：

```bash
git branch --show-current     # 必须是 dev
node scripts/release/release-version.mjs --retarget 0.6.0
git add -A .github/release-notes apps/desktop/package.json bun.lock
git commit -m "chore(release): 这一版的版本号改为 0.6.0"
```

脚本会把发布说明改名、改标题，已有条目原样保留，并同步 `package.json` 与 `bun.lock`。它只接受还没发布的版本，并要求新版本比上一个已发布的大；跳号要用户确认后加 `--allow-irregular`。

## 汇报

结束时说清楚：

- 发了哪个版本，tag 指向哪个提交，Release 链接。
- 哪些 job 失败过、原因、各重试了几次。
- 线上更新源验证的结果，以及没能验证的部分（比如没在装着旧版本的机器上实际点过「检查更新」）。
- dev 上新开的版本号，dev 推没推。
- 按 CLAUDE.md 的格式列出本次产生的提交。
