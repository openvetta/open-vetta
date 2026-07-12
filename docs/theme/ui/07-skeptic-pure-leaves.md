# Batch 07 — skeptic pure leaves 补迁

## 状态

**done**

## 本批迁入（skeptic 点名）

| 组件 | theme-ui | desktop |
|------|----------|---------|
| `InputBarCapsule` | `chat/InputBarCapsule.tsx` | re-export |
| `NewSessionBackground` | `chat/NewSessionBackground.tsx` | re-export |
| `KnowledgeFilesSkeleton` | `knowledge/…` | re-export |
| `SkillToggleSwitch` | `skills/…` | re-export |
| `ProjectsPanelSplitHandle` | `sidebar/…` | re-export |
| `SettingsFormFields`（Select/Input/Textarea/Checkbox） | `settings/…` | re-export |
| `MacKeyboardPreview` | `shared/…` | re-export |
| `CodeBlockCopyButtonView` | `shared/…` | desktop 保留 `useCodeClipboard` adapter |

## 布局/样式

- class/DOM/动画与迁移前一致
- CodeBlock 文案仍为原英文 Copy/Copied

## residual 说明

仍暂缓项见 `99-final-audit.md`（Dialog 审批、QueueCard、Projects 数据树、InputBar/MessageList 大块、CodePreview/shiki、ChatPage/Root shell 等）。
