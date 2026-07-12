# Batch 25+ — Phase δ 验收台账

## 状态

**done**（结构验收 + 门禁；非 GUI e2e）

## 验收命令（与 plan Verification plan 对齐）

```bash
bun packages/theme-ui/scripts/survey-renderer-ui.mjs
bun packages/theme-ui/scripts/eligible-inventory.mjs
bun packages/theme-ui/scripts/verify-purity.mjs
bun run check
```

## 观察摘要

| 项 | 结果 |
|----|------|
| residual map | `23-residual-map.md` + `host-primitive-hold-list.json` |
| inventory open | must_split/migrate/host_hold/bad = 0 |
| purity | theme-ui 无 jotai/IPC/router/i18n/@shared/@domains |
| FlowingMessageList | 真 model + View；**不撤回** Batch23 |
| 假 hold | 无 `_HostPrimitiveHold` / type-only Button 标记 |
| γ 路线 | 文档 `24-phase-gamma-path.md`：hold+slot，不硬迁 Dialog 进 theme-ui |
| settings 迁 | 多批 View 进 theme-ui；desktop 容器注入 host 原语 |

## 剩余（有意）

- ~80 条 `host_primitive_hold`：等 `@vetta/ui` 落地 Dialog/Button/Select 后再清
- permanent_desktop / non_goal：壳与边界外
- 全量 GUI 零回归：本环境无 headless app 跑通；以 className/slot 结构保留 + check 为准

## scratch 证据路径

`{SCRATCH}/` = implementer scratch（goal 会话目录下）

- residual-survey.txt
- eligible-inventory.txt
- verify-purity.txt
- check-final.log
- host-hold-markers.txt
- split-sample.txt
- commits.log
- zero-diff-notes.txt
