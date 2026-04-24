# 编写 desktop-app 和 api 模块的开发规则

## 目标
根据仓库中 `packages/desktop-app` 与 `packages/api` 两个模块的实际代码实现，填充 `.trellis/spec/desktop-app/**` 与 `.trellis/spec/api/**` 下已经存在的 spec 模板文件，形成可供 AI agent 与新同事直接使用的中文开发规则。

## 范围

### desktop-app（Electron + React/TS）
填充以下**已存在**的模板文件（不新建文件）：
- `.trellis/spec/desktop-app/main/`
  - `index.md`
  - `directory-structure.md`
  - `error-handling.md`
  - `logging-guidelines.md`
  - `quality-guidelines.md`
- `.trellis/spec/desktop-app/renderer/`
  - `index.md`
  - `directory-structure.md`
  - `component-guidelines.md`
  - `hook-guidelines.md`
  - `state-management.md`
  - `quality-guidelines.md`
  - `type-safety.md`

### api（Go 后端）
填充以下**已存在**的模板文件（不新建文件）：
- `.trellis/spec/api/backend/`
  - `index.md`
  - `directory-structure.md`
  - `database-guidelines.md`
  - `error-handling.md`
  - `logging-guidelines.md`
  - `quality-guidelines.md`

## 要求
- **严格禁止新建文件**；只在现有模板文件上追加/替换内容。
- 所有文档使用**中文**。
- 内容来源于现有代码的**实际约定**（而非理想），包含真实的代码示例、目录路径、函数签名。
- 每个文件至少包括：约定、推荐写法、禁止写法、常见错误。
- `index.md` 保留导航表，状态列由 `To fill` 改为 `Done`。

## 验收
- [ ] 17 个目标文件均已填充中文实际规则
- [ ] 无新建文件
- [ ] 内容与代码库保持一致（引用路径真实存在）

## 技术备注
- desktop-app 主进程：Electron main + IPC + scheduler + runtime。
- desktop-app 渲染层：React + Vite + shadcn/ui（components.json 存在）。
- api：Go 模块（`cmd/ internal/ pkg/`），使用 Makefile 构建。
