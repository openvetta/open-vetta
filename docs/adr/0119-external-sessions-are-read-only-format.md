# ADR-0119：外部工具会话是只读格式，摘要接续不走 Session Backend 路由

## 状态

已接受

## 背景

用户在 Claude Code、Codex、Grok、omp、pi 等工具里留下的会话彼此不通。Vetta 已有多会话格式共存机制，历史格式（`sessions/legacy`）是第一个适配器。外部工具会话是第二个格式，但产品目标与历史导入不同：用户要的是「找到并只读查看，必要时摘要后在新的 Vetta 会话里接着干」，而不是把外部路径打开、迁移、交给生产 Backend 原地续写。

外部工具可能正在写入同一份文件。任何加锁、写回或把外部记录当成可续写 Vetta 会话的设计，都会破坏对方工具，也让「单击即导入并扣额度」成为默认路径。

## 决策

1. 外部会话是只读格式，不是可续写的 Vetta 会话。统一声明 `readHistory: true`、`resume: false`、`rename: false`、`delete: false`。Desktop 既有的 access 三态分流据此送进只读查看，单击不会触发导入或模型调用。
2. 摘要接续不新增 Runtime Host Session Backend 路由。续作流程是「只读外部文件 → 生成前情提要 → 新建 Vetta 会话，把提要落成 compaction 条目」。不打开外部路径，不迁移进生产 Backend。历史格式那套「打开 → 迁移 → 交给 Backend」只服务于结构化迁移。
3. 公共合同按兼容方式演进：Session History Info 与 Plugin 会话摘要新增可选溯源字段 `origin`；`official.sessions.list` 新增来源参数且默认只返回 Vetta 原生会话。缺字段一律读作「Vetta 原生」。不推 Plugin API 版本。
4. Coding Agent 新增与 `sessions/legacy` 并列的 `sessions/external` 数据边界。该边界保持 Node-free，经宿主注入的文件端口访问磁盘，不得依赖 Agent 执行层。

## 备选方案

- 把外部会话当成可续写 Backend：能少建一个查看面，但会把对方正在写入的文件变成 Vetta 的会话身份，并让单击默认走到导入与模型调用。
- 复用历史格式的 Session Backend 路由做摘要接续：现成，但「打开外部路径」会把导入绑在打开动作上，也无法表达「新建 Vetta 会话 + compaction 种子」。
- 新建独立的外部会话子系统，不复用 Catalog / History Reader / Access Resolver：边界更干净，但会复制已经验证过的只读投影与分流。

## 后果

后续切片可以各自在 `sessions/external` 上扩展 catalog、降级投影和续作编排，而不必先打通 Backend 路由。插件在未显式声明来源时看不到外部会话，存量派单逻辑保持安全。代价是外部记录不能在 Vetta 里重命名、删除或原地续写；用户要接着做，必须新建会话。
