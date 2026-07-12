# Batch 06 — DrawerCard / TodoCard

## 状态

**done**

## 迁入

| 组件 | theme-ui | desktop |
|------|----------|---------|
| `DrawerCard` | `chat/DrawerCard.tsx` | re-export |
| `TodoCard` | `chat/TodoCard.tsx`（`TodoCardItem` + labels） | adapter：items 映射 + 保留原硬编码文案 |

## 布局/样式

- class / motion / DOM 结构不变
- Todo 文案仍为迁移前中文字符串（无 i18n key；adapter 注入）

## 暂缓（仍阻塞）

- `QueueCard`：jotai queue atoms
- 审批 Dialog views：host Dialog/Button
- settings SettingSection 体系
- ProjectsPanel 数据树

## check / commit

本批后
