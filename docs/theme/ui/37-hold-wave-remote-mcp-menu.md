# Batch 37 — SettingsMenuPopover + RemoteMcp 脱 hold

## 状态

**done**

## 变更

| 组件 | 处理 |
|------|------|
| `SettingsMenuPopover` | `PopoverContent` 改 `@vetta/ui`（组装壳，含 theme 子件） |
| `RemoteMcpSectionView` | 布局迁 `@vetta/theme-ui/settings` |
| `RemoteMcpSection` | desktop 薄 adapter，直接用 theme View |

## 计数

- `host_primitive_hold`: **48 → 45**
- `migrated`: **217 → 220**
- open / bad: 0
