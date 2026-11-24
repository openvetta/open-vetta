---
name: vetta-release
description: 发布 Vetta 桌面端新版本的完整流程：预检、按开发流水定稿双语发布说明、dev 合并到 main、打 tag、推送、监视 desktop-release 流水线并重试瞬时故障、验证线上更新源、把发布说明标成已发布并开下一个版本；也用于「开下一个版本」「这一版改发 0.6.0」这类版本号变更。只在用户明确要求发版或改版本号时使用；写代码、开发期往发布说明里追加条目、普通推送都不用它。
---

# 发布 Vetta 桌面端

发版的每一步都由脚本判断，你负责按顺序执行、在检查点停下、把结果如实汇报。不要凭记忆或 git 历史推断「这个版本发没发」「下一个版本是几」，一律问脚本。

原理（渠道、R2、签名公证、自动更新）见 `docs/release/desktop-release-runbook.md`，这里只写执行步骤。

## 什么时候用

| 用户说 | 做什么 |
| --- | --- |
| 「发版」「发布 v0.5.70」「合并到 main 打 tag」 | 完整流程，第 1–9 步 |
| 「开下一个版本」「下个版本开 0.6.0」 | 只做第 8 步的 `--start-next` |
| 「这一版改发 0.6.0」「版本号改成 1.0.0」 | 只做下面的「改这一版的版本号」 |

用户只说了「改完提交」「推一下 dev」，不是发版，不要用这个 skill。

### 直接调用 `/vetta-release`

用户输入斜杠命令本身就是明确的发版指令，不要再问「要发吗」。按参数执行：

| 命令 | 做什么 |
| --- | --- |
| `/vetta-release` | 发布当前版本（第 1–8 步），发完标记已发布并开下一个修订版本（第 9 步），推送 main、tag 和 dev |
| `/vetta-release minor` / `major` / `0.6.0` | 同上，但下一个版本按参数开 |
| `/vetta-release next [minor\|major\|x.y.z]` | 不发版，只开下一个版本（要求当前版本已发布），推送 dev |
| `/vetta-release retarget 0.6.0` | 不发版，只改这一版的版本号，推送 dev |
| `/vetta-release status` | 只汇报当前版本号和发布状态，什么都不改 |

**直接调用就是无人值守发版。** 用户触发后通常已经离开电脑，期待回来时看到的是发版结果，不是一个等着回答的问题。所以直接调用时：

- **不要用 AskUserQuestion，也不要在回复末尾问「要继续吗」。** 结束本轮就等于把流程卡住，用户回来才发现什么都没发。
- 发布说明草稿与覆盖表照常贴进对话留档，门禁过了就直接提交、往下走，不等确认（见第 2 步）。拿不准是否用户可见的条目，按「写进去」处理，并在最终汇报里点名，方便用户发版后再判断。
- 参数里写明的版本（`minor`、`major`、`0.6.0`）本身就是确认，不必再问升的是哪一位。
- 遇到失败按第 7 步的「无人值守时的修复」处理，能修好就修好，接着发完。

只有以下情况才停下，而且停下时要写清楚停在哪一步、现场是什么样、用户回来后该怎么接着做：

- 不在 dev 上，或者工作区里的改动无法判断属于谁。
- 当前版本已经标成 `released`，而参数没让开新版本。
- 预检报跳号或版本号不一致，参数里也没有给出这个版本号。
- 合并 dev 到 main 时有冲突。
- 产物已经对外发布（GitHub Release 已生成，或者更新清单已经更新）之后才出现的失败。
- 同一个问题修了两轮仍然失败，或者瞬时故障的重试次数用完。

其余步骤一路执行，进度用一句话报，最后按「汇报」一节给结果。

用户在普通对话里说「发版」（不是斜杠命令）且人在场时，仍按下文各步的检查点停下确认。

## 两条不能破的线

1. **推送 main 和 tag 是对外发布。** 只有用户在当前对话里明确说了发版或推送才执行；以前说过不算。第 4 步的确认摘要和用户预期不一致时，停在推送之前。
2. **只重试已知的瞬时故障。** 其他失败一律停下、诊断、汇报，不改代码、不重新打 tag、不删 tag。唯一的例外是直接调用（无人值守）时，在产物对外发布之前出现的失败，按第 7 步「无人值守时的修复」处理。

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
| 状态 `unreleased`，远端没有 tag | 第 1 步；说明还没定稿就是第 2 步 |
| 远端已有 tag，run 在跑或失败了 | 第 6 步 |
| run 成功，状态仍是 `unreleased` | 第 8 步 |
| 状态 `released`，`package.json` 还是这个版本 | 第 9 步的 `--start-next` |

## 发版流程

### 1. 预检工作区（在 dev 上）

```bash
git branch --show-current     # 必须是 dev
git status --short
node scripts/release/release-notes.mjs --status
```

- 不在 dev 上就停下问用户。
- 工作区里有不属于这次发版的改动（常见的是别人留下的 `bun.lock`、未跟踪的 `.vetd` 目录），用 `git stash push <路径>` 只暂存已跟踪的那几个文件，最后第 9 步结束时 `git stash pop`。不要提交它们，也不要丢掉。
- `--status` 显示已发布或没有这个版本的文件，就停下，告诉用户先开下一个版本。

### 2. 发布说明定稿（在 dev 上，合并之前）

定稿必须在合并到 main 之前完成：第 4 步的预检要求 HEAD 与 dev 完全一致，合并后再改说明只能退回 main 重来。

发布说明是给用户看的，不是开发日志。**一次成稿**：先筛、再合并、再双语，不要按 commit 逐条追写。

1. 取素材：

   ```bash
   node scripts/release/collect-release-commits.mjs
   ```

   它列出上一版到 HEAD 的提交、每条正文里的「为什么」和触及区域。需要用户语言时，再用 `gh pr view <编号>` 读 PR 里的「What users will see」。

2. 按 `.github/release-notes/README.md` 的结构起草 `v<版本>.md`（英文在上，中文在下）：

   - 先筛：只留用户会注意到的变化。重构、测试、依赖升级、开发文档、内部工具一律不写。
   - 再合并：同一块界面、同一类操作的几处调整写成一条，按用户看到的区域归组，不要一个 commit 一条。
   - 再双语：两段条数与顺序一一对应；每段最多 6 条；单条中文 ≤90 字、英文 ≤240 字符。
   - 破坏性变更或需要用户动手的（重新登录、迁移配置、旧项目要重开）写进「升级注意 / Upgrade notes」。

3. 做覆盖对账，把这张表贴进对话：

   ```text
   <短 hash> <标题> → 第 N 条（新增 / 改进 / 修复）｜内部改动，不写
   ```

   这张表是判断有没有漏写的唯一依据，不进发布说明。有拿不准是否用户可见的条目：人在场就直接问用户；直接调用时按「写进去」处理，在表里标「存疑」，并在最终汇报里列出来。

4. 过门禁，改了再跑：

   ```bash
   node scripts/release/release-notes.mjs --check
   ```

5. 在 dev 上跑一遍流水线 quality 阶段的同款检查。它比发版预检严（比如 test-assertion-depth 门禁），在这里挂掉只损失几分钟；等 tag 推出去再挂，就要白跑一轮流水线，还得删 tag 重打：

   ```bash
   bun run check:full
   ```

   没过就在 dev 上修好、单独提交，再继续。

6. 提交定稿，下一步才合并进 main：

   ```bash
   git add .github/release-notes/v<版本>.md
   git commit -m "docs(release): 定稿 v<版本> 的双语发布说明"
   ```

   - 人在场：草稿和覆盖表给用户看过、确认后才提交。这份文字会直接出现在 GitHub Release 和每个用户的更新对话框里。
   - 直接调用（无人值守）：草稿和覆盖表贴进对话留档，门禁通过就提交，不等确认。已发布版本的说明不能改，所以宁可写得保守：只写确定用户能看到的变化，措辞贴着 commit 正文里的「为什么」，不要自己加推测。

### 3. 合并 dev 到 main

```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff dev -m "chore(release): 合并 dev 发布 v<版本>"
```

提交信息固定是这个格式，历次发版都一样。合并有冲突就停下汇报，不要自行解决。

### 4. 预检要发的版本，给用户看确认摘要

```bash
node scripts/release/release-preflight.mjs
```

它检查五件事，任何一项不过都会列出来并以非零退出：

1. tag、`apps/desktop/package.json`、`bun.lock`、发布说明的文件名和标题，版本号处处一致。**这一项最要紧**：`desktop-release` 对版本号不符的 tag 会直接失败。
2. 本地、远端都没有这个 tag，GitHub 上没有同名 Release，发布说明标着 `unreleased`。
3. 版本比上一个已发布的大，且是正常的下一个修订号、次版本号或主版本号。跳号或没归零（0.5.69 → 0.5.72、0.5.69 → 0.6.1）会被拦下，用户确认是有意的才加 `--allow-irregular`。
4. 当前在 main 上，dev 已完整合并，main 与 dev 文件内容一致，工作区干净。
5. 发布说明已按双语格式定稿：`## English` / `## 中文` 两段齐全、条数对齐、单条长度与内部术语合规、文末 Full Changelog 指向上一版，没有 TODO / 待补之类的占位文字。

预检不过：退回 main（`git reset --hard origin/main`，只在这一步、合并提交还没推送时可以这样做），回到 dev 修好再来。

预检通过：把它打印的摘要原样贴给用户（版本、升了哪一位、上一个版本、提交数、发布说明条目数、插件版本变化）。

- 直接调用（无人值守）：升的是修订号，或者和参数一致，就直接进第 5 步。
- 人在场：用户已经在当前对话里确认了草稿并说了发版，就继续第 5 步；摘要里有用户没预料到的内容（比如升的是次版本号、提交数明显不对），先问。

### 5. 打 tag 并推送

```bash
git tag v<版本>
git push origin main
git push origin v<版本>
```

tag 打在第 3 步的合并提交上。推送后 `gh run list --limit 3` 确认 `desktop-release` 已经触发。

### 6. 用 Monitor 监视流水线

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

### 7. 只重试已知的瞬时故障

GitHub 要等**整个 run 结束**才允许重跑。run 结束后：

```bash
gh run rerun <run id> --failed
```

然后重新启动第 6 步的 Monitor。

可以重试的只有这些（看日志里的原文）：

| 特征 | 原因 |
| --- | --- |
| `The staple and validate action failed! Error 68`，伴随 `api.apple-cloudkit.com` 和 `NSURLErrorDomain Code=-1005` | macOS 公证装订时 Apple CloudKit 断线，出现在「Build updater artifacts」或「Verify updater artifacts」 |
| `ETIMEDOUT`、`ECONNRESET`、`502 Bad Gateway`、`503` 出现在下载依赖或上传产物的步骤 | 网络抖动 |
| runner 被取消或丢失（`The runner has received a shutdown signal`） | GitHub 基础设施 |

- 同一个 job 最多重试 3 次（0.5.69 的 macOS x64 用了 3 次）。用完还失败就停下汇报。
- 其他任何失败（测试挂了、类型检查、签名证书、版本号校验、构建报错）：人在场时停下，把失败步骤和关键日志贴给用户，不重试；直接调用时看下面。

#### 无人值守时的修复

直接调用时，如果失败发生在产物对外发布之前（`gh release view v<版本>` 显示 not found，三份更新清单也还是旧版本），而且是能在仓库里修的问题（测试、门禁、类型检查、lint、版本号对不上），就修好，用同一个版本号重发：

1. 回到 dev，从根上修。不要放宽门禁基线、跳过测试或者加 `--no-verify` 来让它变绿；改测试的话，测的东西只能更严，不能更松。
2. 本地跑通 validate job 的全部步骤（看 `.github/workflows/desktop-release.yml` 里 validate job 的 `run:`，至少要有 `bun run check:full` 和 `bun run test:quality`），然后单独提交这个修复。
3. 重新合并到 main（同样的合并提交信息），删掉旧 tag 再在新的合并提交上重打：

   ```bash
   git tag -d v<版本> && git push origin :refs/tags/v<版本>
   node scripts/release/release-preflight.mjs
   git tag v<版本> && git push origin main && git push origin v<版本>
   ```

4. 回到第 6 步继续监视。同一个问题修两轮还是失败就停下汇报。

签名证书、公证凭据、runner 配置这类仓库之外的问题修不了，停下汇报。

### 8. 验证线上更新源

run 成功后，确认旧版本真的能更新。现在内置的更新源是 GitHub Release（`release_target=github`）：更新清单由 `publish update metadata to GitHub Release` 上传，`promote update metadata` 只在 `release_target=r2` 时运行，显示 skipped 是正常的。R2 的 `releases.openvetta.com/desktop/stable` 已停用，清单停在 0.5.72，不要拿它判断这次发版成没成功。

```bash
B=https://github.com/openvetta/open-vetta/releases/latest/download
for f in latest.yml latest-mac.yml latest-linux.yml; do curl -fsSL --max-time 60 "$B/$f" | grep -E '^version|url:|size:'; done
gh release view v<版本> --json isDraft,isPrerelease,assets --jq '.isDraft, .isPrerelease, (.assets | length)'
gh api repos/openvetta/open-vetta/releases/latest --jq .tag_name
```

- 三份清单的 `version` 都是新版本，`releases/latest` 指向这次的 tag。
- 清单里每个文件 `https://github.com/openvetta/open-vetta/releases/download/v<版本>/<url>` 用 `curl -sSIL` 拿到 200，最后一跳的 `content-length` 与清单里的 `size` 一致。
- GitHub Release 不是草稿、不是预发布，资源齐全（0.6.18 是 19 个）。
- 网络超时或 TLS 中断就重试几次，不算发版失败；但要在汇报里提一句。

如果构建日志里的 `release_target` 是 `r2`，改为核对 `VETTA_UPDATE_URL` 指向的 R2 清单，并且要等 `promote update metadata` 成功。

### 9. 收尾：标记已发布，开下一个版本（在 dev 上）

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
- `--start-next` 新建的是带双语结构和 Full Changelog 的空骨架，条目留到下一次第 2 步再写；不要顺手往里编内容。
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

脚本会把发布说明改名、改标题，已有条目与 Full Changelog 的终点一起改掉，并同步 `package.json` 与 `bun.lock`。它只接受还没发布的版本，并要求新版本比上一个已发布的大；跳号要用户确认后加 `--allow-irregular`。

## 汇报

结束时说清楚：

- 发了哪个版本，tag 指向哪个提交，Release 链接。
- 发布说明定稿成什么样（中英各几条、合并了哪些同类改动），以及覆盖表里哪些提交被判为内部改动。
- 无人值守时自行拍板的地方：标「存疑」的条目、为了让流水线过而做的修复提交、有没有删 tag 重打。
- 哪些 job 失败过、原因、各重试了几次。
- 线上更新源验证的结果，以及没能验证的部分（比如没在装着旧版本的机器上实际点过「检查更新」）。
- dev 上新开的版本号，dev 推没推。
- 按 CLAUDE.md 的格式列出本次产生的提交。
