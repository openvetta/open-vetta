# Batch 08 — skeptic2 pure leaves

## 状态

**done**

## 迁入

| 组件 | theme-ui | desktop |
|------|----------|---------|
| `AchievementTitle` | `settings/achievements/`（layout/assets props） | adapter 注入 ACHIEVEMENT_* |
| `AchievementCurtains` | 同上 | adapter |
| `AchievementPromotionConfetti` | 同上（peer `canvas-confetti`） | re-export |
| `AddProjectMenuItem` | `sidebar/`（resolved label） | i18n adapter |
| `MultiplierTag` + `fmtMultiplier` | `shared/`（text prop） | i18n adapter |
| `PreviewErrorBoundary` | `file-preview/` | adapter 注入原中文 fallback |
| `SyntaxHighlightedCode` | `shared/`（peer `shiki`） | re-export |
| `CodePreview` | `activity/`（peer `shiki`） | re-export |

## residual 政策

本批关闭 skeptic2 点名项。其余见 `99-final-audit.md` 与 `{SCRATCH}/eligible-inventory-residual.txt`（逐项命名 deferral）。
