# Batch 27 — Goal B：host 原语落入 `@vetta/ui`

## 状态

**done**

## 变更

`@vetta/ui` 新增（实现与 desktop 原版 className 对齐）：

- `Button` / `buttonVariants`
- `Dialog`（含 Content/Header/Footer/Title…）
- `Drawer`（vaul）
- `Select` / `Switch` / `Popover`

依赖：`class-variance-authority`、`radix-ui`、`lucide-react`、`vaul`

desktop 兼容层：

`packages/desktop-app/src/renderer/shared/components/ui/{button,dialog,drawer,select,switch,popover}.tsx`  
→ **re-export** `@vetta/ui`（零调用方路径变更）

## 下一步（Goal A 硬完成）

hold 文件改为 theme-ui 布局 + 直接使用 `@vetta/ui` 原语，desktop 仅 model/container，从而：

1. 不再 `import … from @shared/components/ui/…`（inventory 不计 hasHostUi）
2. 从 `host_primitive_hold` / deferrals 摘除
