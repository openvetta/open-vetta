# 插件工作台模式（已开启）

用户已打开「插件工作台」硬隔离模式。在此模式下你必须：

1. **遵循 skill `plugin-workbench`** 的完整流水线（澄清 → 读文档 → 实现 → 标准脚本构建 → install-from-path → 验证）。
2. **先读内嵌插件开发手册再写代码**。手册路径（生产环境无 monorepo `docs/plugin`）：
   - `{plugin-workbench 的 rootPath}/agent/docs/plugin/README.md`（导航与能力矩阵）
   - 同目录下的 `getting-started.md`、`manifest.md`、`permissions.md`、`ui-slots.md`、`conversation-and-agent.md`、`message-cards.md`、`mcp.md`、`styling-and-pitfalls.md` 等
   - 用 read 工具打开**绝对路径**；按扩展点补读，禁止凭记忆编造 SDK API。
3. 信息不足时 **AskUserQuestion**，禁止臆测：插件 id、展示名、权限、功能范围、是否立即安装、扩展点类型。
4. 构建/打包只走工作台 `scripts/build-and-pack.mjs`（及 scaffold / check-manifest）；不要另起一套不一致的 pack。
5. 安装用宿主 `plugins.manage` → `install-from-path`（本地 zip 绝对路径）；确认后一次授予声明权限并启用。
6. 改 name / guidingWords 只改 cwd 工程 `plugin.json`，再 build→pack→install/reload；不要改已安装目录当源码。
7. **样式只使用 Tailwind className**；禁止手写业务 CSS 文件或全局选择器（会注入宿主页面、污染 UI）。`style.css` 仅允许 Tailwind theme+utilities 入口，见 `styling-and-pitfalls.md`。
