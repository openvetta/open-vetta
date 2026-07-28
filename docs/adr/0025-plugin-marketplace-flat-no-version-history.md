# 插件市场单表扁平、不保留版本历史

[[插件市场]]的服务端模型采用与 [[技能市场]] 同构的**单表扁平**结构：以 manifest `id` 为唯一键，一行一个插件，`version` 只是一列。同 id 重传**原地覆盖**（更新 version、覆盖 S3 上的 zip、保留 download_count 与创建时间），**不保留版本历史**，市场只暴露「当前版本」。详见 [[插件版本口径]]。

## 背景

desktop 端插件运行时本身带版本概念：`InstalledPlugin` 有 `activeVersion / availableVersion / pendingVersion`，用户插件有「装了旧版、远端出新版 → 切换激活」的更新流（见 ADR-0024 [[系统插件]]）。直觉上会推断市场侧也应建 Plugin + PluginVersion 双表、留版本历史来驱动这套更新流。

## 决策与理由

一期不建双表，按 [[技能市场]] 扁平模型落地：

- desktop 的更新流只需要市场回答「这个 id **当前**是哪个版本、zip 在哪」即可比对 `manifest.version !== market.version`，**不需要**市场自存历史版本。更新流与版本历史是两件事，前者不蕴含后者。
- 与已成熟的 Skill 模块逐字同构，能最大化复用 model/handler/service/admin 既有形态，最小化首期实现面与回归风险。
- 插件本质是单个 zip 整包，扁平「一行一 zip」比 skill 的散文件更自然。

## 考虑过的备选

- **Plugin + PluginVersion 双表**：保留版本历史，支持回滚与多版本并存。代价是 model/迁移/handler/admin 全部偏离 Skill 模板、首期工作量与复杂度显著上升，而当前并无回滚或并存需求。
- **拒绝重复 id**：要求 admin 先删旧再传新。操作繁琐，且对「发布插件新版本」这一最常见动作不友好。

## 影响

难回退方向是**功能而非数据**：一旦市场只存当前版本，要支持回滚或多版本并存需补建 PluginVersion 表并迁移存量数据。未来读者会困惑「desktop 明明有 availableVersion/pendingVersion 更新机制，为什么市场不存版本历史」——本 ADR 即解释这层刻意的不对称。
