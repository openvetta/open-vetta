# 行为兼容性审计

## 1. 审计原则

本次工作是架构重写，不是产品功能重写。默认迁移合同为：

> 允许改变包、类、依赖方向、生命周期和组合方式；不允许静默改变用户、模型、宿主或持久化数据能够观察到的行为。

行为不仅指最终文本，还包括：

- Tool 名称、模型可见描述和 JSON Schema。
- 成功 content、details、错误消息和重试提示。
- 文件、进程、网络与存储副作用。
- 路径、编码、图片、截断、取消和平台语义。
- Profile、scope、权限和默认启用条件。
- Session 事件顺序、输入排队、恢复和分支。
- 旧持久化数据的读取结果。

更严格的参数校验、更小的可访问路径、更少的文件格式或不同的取消行为都属于功能变化。

## 2. 本轮发现与处理

### 2.1 `current_time`

首次新实现存在三个差异：

| 行为 | 旧实现 | 首次新实现 | 处理 |
| --- | --- | --- | --- |
| 模型描述 | 完整使用指引 | 简短一句话 | 已恢复旧描述 |
| JSON Schema | 未声明 `additionalProperties: false` | 拒绝额外字段 | 已恢复旧 Schema |
| 已取消 Signal 下直接调用 | 仍返回时间 | 在时间源调用前抛出 | 已恢复旧直接执行语义 |

现已增加旧新差分合同，直接比较名称、label、完整描述、Schema、固定时间执行结果、
已取消直接调用、update、phase、`scope_use` 和 `category`。全部旧会话场景还会分别运行
旧 `resolveActiveToolNames` 与新注册选择器，比较最终激活工具集合。

注册元数据没有加入通用 `RuntimeToolDefinition`。新 `CodingToolRegistration` 在 Coding
能力层持有 `scopeUse` 和 `category`，组合根把会话场景传给 `CodingToolsFeature`。这避免
Kernel 绑定 Coding 场景词汇，也避免把 Agent Profile ID 错当作会话场景。

因此 `current_time` 可以认定为工具定义、执行和注册行为兼容；但完整 Coding Tools Feature
仍缺少其他旧工具，不能整体切换生产入口。

### 2.2 `read`

尝试实现的工作区纯文本 read 与旧工具存在以下功能差异：

- 旧工具允许基于 cwd 的相对路径、绝对路径和 `~`；尝试实现限制为 Workspace Root。
- 旧工具包含 macOS 空格、NFD、弯引号及 CJK 文件名空格模糊匹配；尝试实现没有。
- 旧工具支持 UTF-8 失败后按 GB18030 解码；尝试实现只按 UTF-8 解码。
- 旧工具按文件内容魔数识别 jpg/png/gif/webp，并返回 Image Content；尝试实现拒绝所有二进制。
- 旧工具支持图片自动缩放及关闭自动缩放；尝试实现没有。
- 旧工具对已知二进制扩展返回对应 Skill 提示；尝试实现直接抛错。
- 旧工具为每一文本行生成 edit 可使用的锚点；尝试实现返回原始文本。
- 旧工具使用既有 `TruncationResult` details 和既定提示文案；尝试实现改变了 details 结构和提示。
- 旧 Schema 对 offset/limit 使用 Number 且没有新增边界约束；尝试实现改成正整数约束。
- 旧工具的完整模型描述包含 read/edit/grep/PDF/文档协作规则；尝试实现只保留一句说明。

结论：该实现属于缩减功能，已撤下，`read` 仍标记为未迁移。后续实现必须让
`packages/coding-agent/test/tools.test.ts` 中的 read 行为用例以及路径模糊、图片处理、
锚点相关测试同时运行在旧新实现上。

现已提取参数化 Read Behavior Contract，并先由旧实现作为 Oracle 运行。基线覆盖：

- 完整定义关键字段、scope 和 category。
- UTF-8、GB18030、空文件与不存在文件。
- 相对、绝对、`~`、Unicode 空格、CJK 空格模糊匹配。
- macOS AM/PM 窄空格、NFD、弯引号及组合路径。
- offset、limit、行锚点、行数截断、字节截断和 continuation notice。
- 图片魔数、默认 Photon 处理、关闭自动缩放和伪图片扩展。
- 已知扩展与无扩展二进制提示。
- 自定义 Read Operations、调用顺序、提前取消和执行中取消。

合同运行时确认了 Windows 下 `~` 展开会保留 `/` 的旧混合分隔符。该细节暂时作为行为基线
保留，不能在架构迁移中顺手标准化。

现已在 `runtime-tools/coding/tools/read` 完成独立 Runtime 实现。生产源码不导入旧
`coding-agent`，路径解析、文本解码、锚点和截断位于包内纯行为模块；文件系统与 MIME 检测
通过 `ReadOperations` 注入，图片处理通过 `ReadImageProcessor` 注入。默认实现仍使用
`file-type` 和 Photon/WASM，不以抽象为由删除图片能力。

兼容性证据：

- 旧实现和新实现同时运行同一组 18 项 Read Behavior Contract。
- 旧新 name、label、完整 description、TypeBox Schema、scope 和 category 完全比较。
- 锚点、行截断、字节截断和二进制提示执行结果进行逐字节比较。
- 默认图片处理、关闭自动缩放、伪图片扩展和可注入图片处理器均有测试。
- 新 read 已通过真实 `AgentCoreTurnEngine` Tool Loop 读取相对路径文件。

新 read 已加入 Greenfield Coding Tools Feature；包根旧 `createReadTool` 和当前生产入口仍
保持不变。工具模块运行时行为已完成迁移，但独立可执行宿主的 Photon WASM 复制/定位尚未
进行产物级验证，因此仍是未来生产宿主切换的门禁，不能仅凭模块测试删除旧打包链路。

### 2.3 `ls`

旧 `ls` 不只是本地 `readdir` 包装，还包含以下可观察合同：

- 基于 cwd 的相对路径、绝对路径、`~`、Unicode 空格与模糊路径解析。
- macOS AM/PM 窄空格、NFD、弯引号及组合路径 fallback。
- 大小写不敏感排序、dotfile 保留和目录 `/` 后缀。
- 默认 500 项、自定义 Number limit 和 50KB 头部截断。
- entry limit 与 byte limit 的既定提示及 `LsToolDetails`。
- 单项 stat 失败时跳过、目录读取失败时的错误包装。
- 自定义 `LsOperations` 调用顺序。
- 提前取消和执行中取消。

现已完成独立 Runtime 实现，并让旧、新实现同时运行同一组 15 项 Ls Behavior Contract。
另有差分测试逐字段比较完整定义、注册元数据、所有场景的最终激活集合和典型执行结果；显式
选择的 Runtime ls 已通过真实 `AgentCoreTurnEngine` Tool Loop。

审计确认旧 `ls.scope_use` 是空数组。按旧 fail-closed 语义，它表示工具存在于可用工具集，
但默认不在任何场景激活。新 `LS_TOOL_SCOPES` 保持空数组，Coding Tools Feature 即使持有该
注册也不会把 `ls` 放入默认 Snapshot。将它改成全场景会扩大模型能力，属于功能变化。

旧实现还有一个非理想但已存在的取消行为：执行中取消会先拒绝调用 Promise，但已经开始的
Operations 仍会继续运行。新实现按合同保留该行为。若未来要让取消真正停止 Operations，
必须单独设计可取消 Port 并作为行为变更处理，不能夹带在本轮架构迁移中。

### 2.4 动态 Coding Tool Catalog

此前 `CodingToolsFeatureOptions` 逐项暴露 `currentTime`、`read` 和 `ls` Options，导致每迁移
一个工具都必须修改 Feature，并让能力编排层绑定具体实现。这一结构已替换为：

```text
Tool Factory + Tool Options
  -> CodingToolRegistration
  -> CodingToolRegistry
  -> versioned Catalog Snapshot
  -> Activation
  -> CodingToolsFeature
  -> ModelCallContributionProvider
  -> Model Call Frame
```

`CodingToolCatalog` 暴露成员 `snapshot()` 和执行前只读查询 `resolve()`；
`CodingToolRegistry` 才暴露 `register()` 和 `unregister()`。Feature 依赖只读接口，因此
不能在 prepare/contribute 中改变全局工具目录。

激活支持：

- scope 默认集合。
- scope 默认集合加显式工具名。
- 完全显式工具名集合。

未知名称不会绕过注册表。`ls` 现在可以通过显式激活进入 Feature 和真实 Tool Loop，同时空
scope 的默认不激活行为保持不变。

原设计让 Feature prepare 绑定 Catalog 成员，并要求每次工具变化都重新编译整个 Profile。
这会重新 prepare 所有 Feature，也会让当前 Turn 通过旧函数引用继续执行已注销工具。现已
修正为：

- Feature prepare 只创建一个长生命周期 `ModelCallContributionProvider`。
- 每次模型调用前读取最新 Catalog 并生成不可变 Model Call Frame。
- Catalog 变化不重新编译 Runtime Snapshot，不重新初始化未变化的 Feature。
- 模型已经看到工具后，如果工具在执行前被删除，调用返回错误 Tool Result。
- 同名工具被替换时，旧 Schema 产生的调用不会路由到新实现。
- 下一次模型调用立即看到新工具清单。

一次已经发出的模型请求仍然使用发送时的提示词和 Tool Schema，这是不可消除的物理边界。
Skill、提示词和 MCP Tool 可以通过同一动态 Provider 合同在后续模型调用刷新；但对应具体
Feature 尚未迁移，不能把通用合同误记为 Skill/MCP 功能已经完成。

上一阶段执行前校验以 `resolve(toolName)` 返回的 registration 对象引用判断定义是否变化。
对象引用不是跨 Adapter、序列化或重建 Catalog 后稳定的能力身份，也无法表达 deactivate 与
revoke 的不同语义。现已改为：

- Model Call Frame 捕获 `sourceId + capabilityId + revision` 稳定绑定。
- Catalog Snapshot、Frame 和执行 Guard 即使复制 Entry，也按绑定值判断同一版本。
- Catalog `execute()` 原子完成实时状态校验与 in-flight 登记，不把 TOCTOU 竞态留给
  Feature。
- deactivate 只停止后续暴露和新执行，普通 unregister 不终止已开始操作。
- revoke 明确表示权限/安全撤销，轮换 revision 并协作取消所有在途执行。
- revoke 后即使底层实现忽略取消并返回，Catalog 也丢弃结果；已经产生的外部副作用仍不能
  自动回滚。

能力不可用错误现在保留稳定 `code`、`retryable` 和 `metadata`，经 runtime-core Adapter
传到 Agent Tool Result。普通工具错误仍保持旧文本和空 details，不把所有异常强行分类。

对应合同覆盖稳定绑定副本、deactivate/activate、revoke、unregister、注销后同名重注册、
执行中生命周期变化和结构化错误端到端桥接。以上变化只改变能力编排和错误表达，不修改
current_time、read、ls 的模型描述、Schema、输出、路径、取消或副作用合同。

### 2.5 `grep`

旧 grep 依赖 `coding-agent` 的工具下载器、ripgrep 子进程和本地文件读取，但这些依赖不应
成为 Runtime Tools 的包边界。迁移采用以下拆分：

```text
GrepToolOptions.rgPath
GrepOperations.isDirectory / readFile
  -> Runtime grep
  -> CodingToolRegistration
  -> Catalog / Model Call Frame
  -> AgentCoreTurnEngine Tool Loop
```

已保留的可观察合同包括：

- 完整模型描述、TypeBox Schema、`scope_use` 和 `category`。
- 单文件/目录路径格式、相对路径、regex、literal、ignoreCase、glob。
- 上下文行的锚点格式、匹配行锚点哈希和匹配限制提示。
- ripgrep 的空结果、非零错误、路径错误和取消语义。
- 文件读取失败时的 `(unable to read file)` 输出。
- 匹配结果的字节截断、单行截断和 `GrepToolDetails`。

Runtime 实现不导入旧 `coding-agent`，默认使用宿主 PATH 中的 `rg`，也允许组合根通过
`rgPath` 指定已管理的可执行文件。这样下载、版本选择和权限由宿主负责，Runtime 只拥有
搜索和结果格式化合同。远程文件场景可以注入 `GrepOperations.readFile`，不改变模型可见
结果格式。

证据：

- 旧实现与 Runtime 实现定义和注册元数据逐字段比较。
- 同一临时文件使用相同 pattern、context 和 limit 比较完整结果。
- Runtime grep 已通过真实 Agent Core Tool Loop。
- 取消在 Runtime Tool 边界生效，未把取消处理移入宿主下载器。

### 2.5.1 宿主可执行文件解析

审计发现旧 `ensureTool` 把三个职责混在一起：

```text
PATH / managed-bin discovery
  + download / version selection
  + user-facing logging
```

Runtime grep/find/tree 只需要第一项的结果，不应导入旧下载器。因此新增通用
`CodingToolExecutableResolver`：

```text
Host resolver
  -> Promise<string | undefined>
  -> Runtime grep/find/tree
  -> spawn rg/fd
```

Runtime 提供的本地 Adapter 只检查受管 bin 目录和 PATH，不下载、不修改文件、不输出日志。
宿主如果仍需要自动下载，可以在 Composition Root 实现同一 Port 并委托旧下载器；下载策略
不会进入 Runtime Tool。当前已在 `coding-agent` 增加
`createToolExecutableResolver`，以 `silent: true` 委托旧 `ensureTool`，形成不改变旧下载
行为的结构适配。适配器位于 `adapters/runtime-tools`，并通过
`@vetta/coding-agent/host` 作为组合层稳定入口提供；
旧的 `core/host` 子路径保留为迁移期转发入口。

`grep/find/tree` 在注入解析器时于每次执行解析 `rg`/`fd`，因此宿主可以在运行时替换或移除可执行
文件，而不需要重建 Runtime Snapshot。未注入解析器时仍使用原有 `rg`/`fd` 默认命令名，
保证迁移期间的直接调用行为不变。

证据：

- 本地 Adapter 覆盖受管 bin 优先、PATH fallback、Windows 后缀和不可用返回。
- grep/find/tree 合同测试确认解析器分别收到 `rg`/`fd`，不可用时保留原错误文本。
- coding-agent Adapter 测试确认每次解析静默委托 `ensureTool`，并透传路径或 `undefined`。
- `ensureToolWithDependencies` 行为测试确认受管路径优先、离线/Termux 不下载、下载成功
  透传路径以及下载失败返回 `undefined`；测试不触发真实网络。
- Runtime Host Resolver 测试确认受管文件移除后会回退到 PATH，再次移除 PATH 工具后返回
  `undefined`；grep/find 执行合同确认每次执行都会重新调用 Resolver，不依赖旧解析结果。
- 宿主下载计划合同覆盖 fd/rg 在 macOS、Linux、Windows 下的版本、架构、扩展名、归档
  路径和 GitHub 下载 URL；不触发网络或解压。
- `installToolArchive` 合同覆盖 tar.gz/zip 分支、嵌套二进制定位、Unix chmod、Windows
  不 chmod，以及成功和失败时的归档/临时目录清理。
- 网络边界合同覆盖 GitHub 版本响应解析、HTTP 503、瞬时 TypeError 重试、HTTP 404 不重试；
  本地真实 tar.gz 产物验证覆盖实际归档、安装二进制内容和 staging 清理。
- `cli-app` 已建立过渡 Composition Root，使用 coding-agent Adapter 创建 Runtime Resolver，
  注册 current_time/read/ls/glob/grep/find/tree/bash/shell，并通过 FeatureCompiler 生成新 Profile；旧
  CLI 入口仍未切换。
- Runtime 源码没有新增 `coding-agent` 或下载器导入。

### 2.6 `find`

旧 find 的重要行为不是“默认激活”，而是注册存在但 `scope_use: []`。Runtime 迁移保留这一
fail-closed 语义：

```text
Find Registration
  scopeUse = []
  -> 所有 scope 默认不暴露
  -> explicit activation 才进入 Model Call Frame
```

实现拆分为：

- `FindOperations.exists`：路径存在检查。
- `FindOperations.glob`：本地 glob、远程搜索或沙箱搜索的替换边界。
- `FindToolOptions.fdPath`：宿主管理的 fd 可执行文件路径。
- Runtime find：路径解析、相对化、结果限制、截断和标准结果。

已保留的可观察合同包括：

- 完整描述、TypeBox Schema、`scope_use: []` 和 `category: "core"`。
- glob pattern、默认路径和 limit。
- 绝对路径转换为搜索根下的相对路径。
- 隐藏文件和 `.gitignore` 过滤交由 fd/Operations 遵守。
- 空结果 `No files found matching pattern`。
- 结果上限提示、字节截断 details 和路径错误。
- explicit activation 后通过真实 Agent Core Tool Loop。

Runtime find 不导入 `coding-agent` 的 fd 下载器，也没有因为迁移方便而把空 scope 改成
全场景默认激活。当前实现已经完成 Tool 级差分和新 Kernel 链路验证，但生产宿主仍需要
单独完成 fd 的下载、版本、打包和定位测试。

### 2.7 `glob`

旧 glob 比 find 更依赖路径和输出细节。Runtime 迁移保留以下行为：

- 完整模型描述、TypeBox Schema、全 scope `scope_use` 和 `category: "core"`。
- 绝对 glob pattern 的静态前缀拆分，以及基于搜索根的相对 pattern 执行。
- 相对路径输出、目录结果尾部 `/`、重复结果去重和 limit 截断。
- 隐藏文件包含、`.git` 排除、层级 `.gitignore` 匹配和取消传递。
- 空结果、路径不存在、非目录路径、50KB 头部截断和 `GlobToolDetails`。

实现拆分为：

```text
GlobOperations.isDirectory / glob
  -> Runtime glob
  -> CodingToolRegistration
  -> Catalog / Model Call Frame
  -> AgentCoreTurnEngine Tool Loop
```

Runtime glob 直接声明 `glob` 和 `ignore`，不再通过 `coding-agent` 的传递依赖或下载器
取得实现。组合根仍可注入 `GlobOperations`，用于远程、沙箱或受限文件系统；默认实现只
负责本地 glob、`.gitignore` 过滤和结果格式化。

证据：

- 旧实现与 Runtime 实现定义、注册元数据和自定义 Operations 结果逐字段比较。
- 临时工作区验证绝对 pattern、目录标记、去重和 `.gitignore`。
- Runtime glob 已通过真实 Agent Core Tool Loop，并保持全 scope 暴露行为。
- 取消语义按旧实现保留：自定义 Operations 收到已取消 Signal；默认 glob 在执行层处理取消。

### 2.8 Tool Profile 差分门禁

过渡 Composition Root 不能只验证默认 CLI 场景，因为工具可见性由场景决定。现已把旧
`resolveActiveToolNames` 作为迁移 Oracle，对 `ALL_SCENARIOS` 中的 7 个场景逐一比较：

```text
旧 Tool Factory
  -> scope_use
  -> resolveActiveToolNames
  -> active names

新 Tool Registration
  -> scopeUse
  -> CodingToolsFeature
  -> Model Call Contribution
  -> active names
```

当前已迁移的 `current_time/read/ls/glob/grep/find/tree/write/edit` 在所有场景的最终激活集合完全一致。
`current_time/read/glob/grep/tree/write/edit` 保持全场景默认激活，`ls/find` 保持空 scope，且后两者仍可由
新 Composition Root 显式激活。比较发生在模型调用贡献层，而不是只比较 Registry 元数据，
因此能发现 Feature 编排、默认 scope 或 Provider 输出造成的可观察差异。

同时审计了 `@vetta/runtime-tools` 包根：仓库内源码和测试当前没有直接消费者，但包根仍是已
发布的公共入口，并继续转发旧工具 Factory 和单例。Coding 子路径已有独立 tree/write/edit，但
产品 Composition Root 尚未切换，直接删除或改写根导出仍会造成公开 API 和生产功能缺失。因此本阶段
保留兼容导出，不用“仓库内无人引用”替代公共兼容性判断。只有产品 Composition Root
能够提供等价 Profile，并形成明确迁移窗口后，才能拆除该入口。

### 2.9 `requires` 与会话能力激活

旧 Runtime Manager 在按场景解析工具后，还会根据会话能力过滤工具。例如后台任务关闭时，
`task_output` 和 `task_stop` 不应进入普通 scope 的 Model Call Frame。此前新
`CodingToolRegistration` 只有 `scopeUse`，无法表达这一层合同。

现已补充：

- Registration 的可选 `requires` 能力列表。
- scope 激活的 `capabilities` 集合。
- 每次 Model Call 重新读取 capabilities，因此不需要重编译 Runtime Snapshot。
- `additionallyEnabledToolNames` 和 explicit activation 继续绕过 requires，保持旧的显式
  工具选择语义。
- Catalog Snapshot 冻结 requires 数组，避免注册对象被外部修改。

除合成测试外，Runtime `task_output/task_stop` 现已使用 `requires: ["bg-tasks"]` 注册并进入
过渡 Composition Root。合同覆盖以下行为：

- 没有能力时，scope 激活不暴露工具。
- 增加能力后，下一次 Model Call 立即暴露工具。
- 移除能力后，下一次 Model Call 立即隐藏工具。
- explicit 和 additionally-enabled 仍可选中工具。
- `bg-tasks` 可用时，7 个场景的新旧 Tool Profile 都包含相同的 task 工具。
- 能力不可用或自定义 Command Executor 未提供后台 Service 时，不注册脱离命令执行器的孤立
  task 工具。

`task_output/task_stop` 的定义、Schema、增量读取和停止结果已迁到 Runtime。任务 ID、状态、
waiter、事件节流、读取游标和通知仲裁现在也由 Runtime 生命周期引擎负责；宿主只提供进程与
日志 I/O，不再把旧 `BackgroundTaskManager` 适配给新 Composition Root。

### 2.10 `bash/shell` 命令执行 Port、前台执行器与后台协调

旧 `bash` 不是单纯的 `spawn` 包装。它同时拥有命令前缀、环境覆盖、路径修正、输出更新、
尾部截断、完整输出文件、超时/取消、受保护目录检查、后台任务和自动转后台。直接在
Runtime Tools 重写其中一部分会形成新的功能实现，而不是架构迁移。

迁移先以 Anti-corruption Adapter 建立完整 Port，再由差分合同把前台行为移入 Runtime：

```text
Runtime bash/shell Definition + Registration
  -> CommandToolExecutor Port
  -> Runtime ForegroundCommandExecutor / BackgroundCommandExecutor
  -> Runtime BackgroundCommandService lifecycle
  -> ForegroundCommandOperations / BackgroundCommandHost Ports
  -> coding-agent Host Adapters
```

Runtime Tools 现在独立拥有：

- bash/shell 各自的工具目录、TypeBox Schema、TypeScript description 和 Registration。
- `CommandToolExecutor` Port，不导入 coding-agent。
- 命令前缀、spawn context、路径修正、流式 update、GB18030 fallback、尾部截断、完整输出临时
  文件、退出码与超时/取消错误文本。
- 受保护 skill/scene 目录的前后快照、变化检测和告警文本。
- 显式后台结果、软等待自动提升、后台完成内联结果、事件到流式 update 的映射。
- 后台通知 XML 的纯格式化合同。
- `task_output/task_stop` 的独立目录、TypeScript description、TypeBox Schema 和 Registration。
- Windows 默认 shell、其他平台默认 bash 的互斥 scope。
- Runtime 执行上下文到 Port 的转发。

coding-agent 的新宿主适配器只负责本地进程能力：选择 shell、补齐受管 bin 环境、加入
PowerShell UTF-8 前缀、spawn 子进程以及在超时/取消时终止进程树。CLI 过渡 Composition Root
默认组合该 Adapter 与 Runtime 前台执行器，不再调用旧 `createBashTool/createShellTool`。
`LegacyCommandToolExecutor` 仍作为迁移期兼容入口保留；旧产品 CLI 入口也仍未切换。

后台路径已经完成两层拆分：上层 Tool 只依赖 `BackgroundCommandService`；该 Service 的独立
Runtime 实现负责任务 ID、状态迁移、waiter、软等待提升、事件节流、读取游标、停止原因和通知
仲裁。coding-agent Adapter 只实现 shell 选择、命令前缀、spawn、进程树终止，以及日志文件的
create/append/read/close。新 Composition Root 不再实例化或依赖旧 `BackgroundTaskManager`。

旧 `BackgroundTaskManager` 仍保留在尚未切换的旧 `AgentSession`、旧 bash/shell 和 UI 任务
路径中，并继续作为差分测试 Oracle。这里删除的是新 Runtime 对旧 Manager 的过渡适配，不是
提前删除仍在生产路径使用的旧功能。

兼容性证据：

- bash/shell 的 name、label、完整 description、TypeBox Schema、category 和当前平台 scope
  与旧工具逐字段相等。
- 成功输出、details、流式 update、命令前缀、spawn hook 和环境覆盖逐项比较。
- 非零退出、显式超时、取消和无后台能力时的错误逐项比较。
- CJK 空格路径修正、2000 行尾部截断和受保护目录告警逐项比较。
- Windows/Unix scope 矩阵验证同一时刻只默认暴露一个命令工具。
- 真实本地前台命令通过 Runtime Definition、独立前台执行器和本地进程 Adapter 执行成功。
- 显式后台、短命令内联完成、软等待自动提升、失败退出和行数截断与旧实现逐项比较。
- 完成通知、内联完成时通知抑制、提升后通知和通知 XML 与旧实现相等。
- `task_output` 定义、Registration、完整读取、增量游标和无新增输出结果相等。
- `task_stop` 对运行中、已完成和不存在任务的结果、停止原因与旧实现相等。
- Runtime 生命周期单元合同覆盖输出游标、完成通知抑制/提升、失败映射、user/dispose 停止
  原因和重复停止。
- 7 个旧会话场景的 Composition Root Tool Profile 差分继续为零。

当前新 Runtime 已拥有前台行为、后台协调和后台任务生命周期；宿主只持有不可避免的本地
进程与文件系统能力。旧 `AgentSession` 尚未切换，因此旧 bash/shell 和
`BackgroundTaskManager` 仍不可删除，后续只能在完整生产 Profile 与会话事件适配完成后移除。

### 2.11 `dir_tree`

旧 `dir_tree` 不是文件系统递归包装。它分别执行 fd 目录扫描和文件扫描，再在内存中重建树，
因此其行为合同同时包含扫描参数与渲染算法：

- 完整 TypeScript description、TypeBox Schema、全场景 scope 和 `core` category。
- 路径模糊解析、存在性检查和目录类型检查。
- fd 的目录/文件双扫描、`.gitignore` 默认语义、hidden 开关和额外 exclude pattern。
- 目录优先、同类名称不区分大小写排序，以及 `[D]/[F]`、即时子目录/文件计数和 node type tag。
- `maxDepth`、node limit、scan limit 和 50KB output limit 的独立 details 与组合提示。
- directory-only 模式、fd 不可用、非零/null 退出和提前取消错误文本。

新实现拆分为：

```text
Tree Tool / TypeBox Schema / Registration
  -> TreeOperations.exists / stat / runFd
  -> CodingToolExecutableResolver.resolve("fd")
  -> tree model parse / rebuild / sort / render
  -> Runtime truncation and details
```

纯树模型与 Tool 编排分别位于独立模块。Runtime 不导入旧 `ensureTool`；Composition Root 注入
现有宿主 Resolver，并在每次执行重新解析 fd，所以运行时移除或恢复 fd 不要求重编译 Snapshot。
描述已由 `.txt` 迁为 TypeScript 常量，但内容、Schema 和模型可见工具名没有变化。

兼容性证据：

- 旧、新定义与 Registration 元数据逐字段比较。
- 同一 Operations fixture 比较完整结果和每次 fd 参数。
- 合同覆盖层级、排序、计数、node tag、directory-only、参数取整和四类限制。
- 路径不存在、非目录、fd 不可用、目录/文件扫描失败和提前取消错误相等。
- 7 个场景的 Composition Root Tool Profile 加入 tree 后差分继续为零。

### 2.12 `write`

旧 `write` 不只是一次 `writeFile`。它还负责路径归一化、模糊路径重定向、父目录创建、Skill/Scene
保护、知识库 Wiki 保护、取消传播和稳定结果文本。迁移必须完整保留这些可观察行为，但不能让独立
Runtime 反向依赖 Coding Agent 的业务策略。

本阶段将职责拆为三层：

```text
Runtime write
  -> resolveToCwd / resolveWritablePath
  -> required WritePathPolicy
  -> WriteOperations.mkdir / writeFile

Coding Agent host adapter
  -> legacy Skill/Scene protection
  -> legacy Knowledge Wiki protection
```

Runtime 保留 TypeBox schema、路径解析和模糊重定向、执行顺序、取消检查、错误传播以及通用结果封装；
宿主适配器注入原有路径保护规则及拒绝文本；`WriteOperations` 隔离真实文件系统副作用。`WritePathPolicy` 是
必需依赖，不提供静默放行的默认值，避免其他 Composition Root 直接创建工具时意外绕过宿主保护。
该 Port 只返回通用的拒绝原因，不向 Runtime 暴露 Skill、Scene 或 Knowledge Wiki 概念。

兼容性证据：

- 工具名、描述、参数 schema、scope 和 core 标记与旧实现一致。
- 相对路径、绝对路径、`~`、Unicode 内容、模糊目标重定向及重定向提示保持一致。
- 仍先递归创建父目录，再原样写入内容；成功文本继续使用 JavaScript `content.length`，没有借重构改变
  旧有的 UTF-16 code unit 计数语义。
- `.vetta/skills`、`.agents/skills`、Scene 和知识库 Wiki 保护继续返回原有工具结果，不改为抛错。
- 执行前、创建目录后和文件写入中的取消行为，以及 mkdir/write 错误传播均由合同测试覆盖。
- Runtime Tools 全量测试 166 项通过；CLI Composition Root 9 项通过；7 个场景的 Tool Profile 差分为零。

### 2.13 `edit`

旧 `edit` 同时承载锚点批量编辑和精确文本替换，不能简化为 `String.replace`。迁移识别出的完整合同
包括：

- 锚点解析、纯哈希降级、漂移找回、歧义与 stale 判定。
- 多编辑原子校验、范围重叠检查、行号增量补偿和新鲜锚点回执。
- 防止无意丢弃 `}`、`]`、JSX/Fragment 关闭行的结构闭合保护。
- 精确匹配优先，以及尾部空白、智能引号、Unicode 横线和特殊空格的模糊匹配。
- 文本唯一性、无变化检测、UTF-8 BOM、LF/CRLF 保持和既有 unified diff details。
- 现有路径模糊解析、Skill/Scene 与 Knowledge Wiki 保护、文件访问顺序和协作式取消。

实现拆分为：

```text
Edit Tool / TypeBox Schema / Registration
  -> anchor-edit pure engine
  -> exact-text transformation + diff
  -> EditOperations.access / readFile / writeFile
  -> required EditPathPolicy

Coding Agent host adapter
  -> legacy path protection + rejection messages
```

共享锚点模块在原有 read/grep 哈希与渲染能力上补齐 parse、validate、漂移恢复和区域回执；编辑算法不
依赖文件系统。Runtime 的 `EditPathPolicy` 只接收通用拒绝原因，不感知 Skill、Scene 或 Knowledge
Wiki；该 Port 与 write 一样是必需依赖，没有静默放行默认值。`diff` 作为 Runtime Tools 的直接依赖
声明，不再依赖旧 Coding Agent 的传递安装。

兼容性证据：

- 22 项旧/新差分合同逐字段比较定义、schema、scope、成功结果、错误文本、文件内容和 Operations。
- 29 项旧锚点测试继续通过；既有 tools 测试中的 edit、模糊匹配、BOM 和换行相关用例均通过。
- Runtime Tools 全量测试 17 个文件、188 项通过；CLI Composition Root 9 项通过。
- 7 个场景的 Tool Profile 加入 edit 后差分继续为零。

### 2.14 Session 观察事件与 Greenfield 宿主适配

旧 `RuntimeHost` 原先直接把 `AgentSessionEvent` 映射成宿主 `SessionEvent`，Greenfield Kernel
则只输出最终消息，导致 Desktop 所需的 text/thinking delta、工具生命周期和回合生命周期没有
稳定迁移边界。本阶段改为：

```text
旧 AgentSessionEvent ─┐
                      ├─> RuntimeSessionObservationEvent ─> SessionEvent
Greenfield TurnEngine ┘               │
                                      └─ transient EventSink envelope（不落盘）
Greenfield Stored KernelEvent ─────────────────────────────> SessionEvent
```

已固定和实现的合同：

- 旧事件特征测试覆盖生命周期与 timing 落盘、text/thinking/toolcall delta、assistant final、usage、
  provider error、abort、工具 start/update/phase/end、Todo、后台任务、子代理、compaction、MCP reload
  和 retry。
- `RuntimeSessionObservationEvent` 不依赖旧 `coding-agent.AgentSessionEvent`，也不包含宿主生成的
  `eventId/sessionId/schemaVersion`。
- `AgentCoreTurnEngine` 输出 agent/turn 生命周期、文本与思考增量、toolcall start 和工具执行
  生命周期；最终 assistant/toolResult 仍使用 `message` 事件交给 Pipeline 持久化。
- `TurnPipeline` 把 observation 包装为 `session.observation` 并只发布到 `EventSink`，不会写入
  `ConversationRepository` 或 Snapshot。
- Greenfield Adapter 将 observation、持久化 assistant message、cancel/failure 和 compaction
  结果统一转换为现有 `SessionEvent`，宿主消费者不需要直接理解 Kernel 内部事件。

仍存在的差距：Greenfield 会话尚未装配到 `RuntimeHost`；新 Repository 目前不能计算旧
`getContextUsage()`，所以 Greenfield usage 暂以 `contextPercent: null/contextWindow: 0` 表示未知；
`context.compacted` 只有成功结果，尚不能单独表达 compaction start；MCP/Todo/后台任务/子代理的
观察合同已经可以承载事件，但对应 Greenfield Feature 还未迁移。

### 2.15 活动 Turn 输入并发

旧实现将活动 Turn 的输入分为 steering 与 follow-up 两类。前者在模型/工具循环检查点进入上下文，
后者只在自然响应结束后触发后续调用；assistant 以 aborted/error 结束时不会继续消费 follow-up。
两类队列默认逐条 FIFO，也都支持一次消费全部。

Greenfield 实现没有把队列塞入 Turn Pipeline 或具体 Provider，而是拆为：

```text
AgentSession -> SessionInputQueue -> TurnInputQueue Port -> AgentCoreTurnEngine
```

Session 拥有 enqueue、clear、模式和生命周期；Engine 只能在 Agent Core 已有检查点消费。排队回执不是
持久事件，只有实际消费的 user message 才由 Engine 输出并经 Pipeline 写入 Repository。cancel/error
保留未消费队列，close 清空队列。空闲状态携带 `streamingBehavior` 仍正常启动 Turn，活动状态未携带
该字段仍返回 `SESSION_BUSY`。

合同覆盖两类队列隔离、FIFO、one-at-a-time/all、运行时模式切换、活动 Turn 回执、取消保留、关闭清理、
真实 Agent Core 的 steer 优先和自然结束 follow-up，以及 error 终态不消费 follow-up。本阶段没有引入
TypeBox/Zod，因为输入已经越过外部协议边界并成为受信任的 Kernel 类型；运行时校验应放在后续 Backend
Adapter 的外部 payload 边界。

### 2.16 Greenfield Session Backend 与 Continue Turn

审计确认阶段 33 的 `RuntimeSessionBackend` 只是返回旧 AgentSession 的创建工厂，并不是 prompt、事件、
状态和外围能力的完整后端。RuntimeHost 仍直接依赖旧会话的模型、历史、Todo、后台任务、子代理、插件和
分支接口。让 Greenfield 用类型断言或空实现满足该别名会隐藏功能缺失，因此没有这样接线。

本阶段将创建工厂泛型化，并新增独立 `GreenfieldRuntimeSessionBackend`：

```text
PromptRequest -> required PromptAdapter -> Kernel Session
KernelEvent -> per-session EventSink -> existing SessionEvent
RuntimeFactory -> AgentSession + Repository + disposer
```

Greenfield 门面已经覆盖 prompt、continue、abort、事件订阅、状态/消息读取和释放。Prompt Adapter 与
Runtime Factory 都是必需依赖，因此 Backend 不会自行猜测或忽略 PromptRef、附件、Skill、metadata、
模型或 Profile。监听器失败被隔离，状态和消息来自 Repository；活动 Turn 的排队和 abort 保留沿用阶段
35 合同。

阶段 50 进一步增加同步 Greenfield Session Projection：create/resume 完成后先从 Repository 初始化，
后续只在 `message.appended` 已持久化并发布时更新。阶段 51/52 补齐 Conversation Document 的树形读取、
写命令和真实 History Reader/Controller。阶段 53 新增独立 Model Runtime：Model Controller、Model View、
State Reader 与 Turn Pipeline 共享同一事实源，切模通过轻量冻结 binding 只影响后续 Turn，不重建
Capability Snapshot。能力矩阵目前仍把 Host Interaction、Execution、Configuration、Todo 和 Background
Work 标记为未实现，所以 Greenfield Backend 仍不能直接注入完整 RuntimeHost。

Kernel 新增真正的 continue Turn：它从已存上下文继续运行，只写 `turn.started`，不追加伪 user message；
Context Provider 通过可选 input 区分 prompt 和 continue。测试确认一次 prompt 加一次 continue 的消息角色
为 user/assistant/assistant。

未完成 Turn 的恢复边界也已固定：create/resume 必须显式分离；resume 识别无终态的 started Turn 后以乐观
版本追加 interrupted 终态；禁止自动重放模型或工具、禁止恢复进程内队列、禁止合成 user message；多个
未闭合 Turn、顺序错误或版本冲突 fail closed。恢复执行器和真实文件 Repository 集成已经实现并验证；
当前切换阻断来自完整历史图、旧 JSONL 兼容和外围 Assembly 能力，而不是 resume 本身。

### 2.17 Session-local Ecosystem Hook Runtime

旧 Greenfield 组合只有 Stop Hook 局部 invoker，没有保证 Prompt、Tool、Stop 与 Session lifecycle 共享
同一 Runtime。该结构会割裂 SessionStart pending 状态、Stop continuation 计数和 Hook 配置。本阶段改为：

```text
one EcosystemHookRuntime per Session
  -> Prompt SessionStart / UserPromptSubmit
  -> final Model Call Tool surface
  -> Stop continuation
  -> SessionEnd dispose
```

Tool Hook 包装发生在动态插件、MCP、Todo 等能力完成调用级组合之后，因此运行时新增或撤销工具会在下一次
Model Call 自然生效。Greenfield wrapper 复用旧 `wrapToolsWithEcosystemHooks()`，并用差分合同验证输入改写、
MCP descriptor、Post feedback、additional context、真实执行失败和 Pre 阻断，没有复制第二套 Hook 语义。

Tool Hook additional context 不直接写 Repository。Runtime Core 新增 Session-local append-only context
边界，Turn Pipeline 在 toolResult 等持久消息之后、Turn 终态之前，以同一 revision 序列追加
`context.appended`。记录只有在持久化成功后才从 Buffer 移除，Turn 结束清理残留，避免跨 Turn 泄漏。与旧
运行语义一致，这些内容不会倒灌到已执行中的 Tool Loop，而会对下一个外部 Turn 可见。

Prompt 合同覆盖 SessionStart/UserPromptSubmit 顺序、阻断与空闲/排队注入顺序；CLI 真实组合覆盖
create/resume source、静态及动态工具、Stop continuation、context 持久化和幂等 SessionEnd。尚未接入
Pre/PostCompact、PermissionRequest、SubagentStart/SubagentStop，以及只有真实宿主切换操作才能表达的
`new_session`/`switch_session`/`fork_session` SessionEnd 原因。

### 2.18 Session-local Context Runtime 与原生压缩

早期 Greenfield `ContextStrategy` 只是 passthrough，`context.compacted` 也只保存消息计数，无法确定
活动分支切点或在重开后重建模型上下文。本阶段把持久压缩事实改为：

```text
exact summary message
  + firstKeptEntryId
  + tokensBefore / details / reason
  -> Conversation Document compaction node
  -> summary + kept tail model projection
```

完整聊天投影继续保留所有 user/assistant 消息。旧计数记录仍通过 TypeBox 联合 Schema 读取，但只推进
journal，不改变分支。原生记录关闭并重开后恢复相同模型输入，摘要消息保存实际内容而不是按当前代码重新
生成。

Kernel 将可持久化的 Turn Context Strategy 与逐模型调用 transient Transformer 分开。Coding Agent 的
Session-local Context Runtime 复用旧 threshold、prefire、摘要、microcompact 和 circuit breaker 算法；
Pre/PostCompact 使用第 68 轮的同一 Hook Runtime。microcompact 每次模型调用执行且不改写 Repository，
阈值摘要经 Pipeline 提交后才执行 Post Hook。成功 end 由持久 `context.compacted` 统一映射，避免重复事件。

当前输入仍与 `turn.started` 原子写入；压缩决策使用写入前的 Document/历史，因此不把新 Prompt 摘入旧
上下文。即时模型视图再补回 Provider 与当前输入 tail。Context Runtime 同时作为 Document Participant 与
Observer，在 create/resume 时从投影恢复用量，运行中采用有效 assistant usage，CLI 状态不再返回未知比例。

第 70 轮已把 Layer 2 threshold/prefire 与 provider overflow 自动恢复接入模型调用检查点，详见下一节。
第 71 轮已补齐手动压缩和 Extension 自定义压缩，详见 `2.20`。第 72 轮建立通用的跨
Conversation Turn 续接事务，详见 `2.21`；memory-mode 的 flush、触发策略和 JOURNAL 仍未
迁移，因此完整长会话生产路径仍不可切换。

### 2.19 模型调用级 Compaction Orchestrator

审计确认 Agent Core 的 EventStream 是非背压队列。Tool Result 事件先 `push` 不等于 Repository 已完成
append；如果直接在下一次 `transformContext` 中持久压缩，会产生“模型已使用新摘要、日志尚未提交摘要”
的崩溃窗口。

本阶段增加默认关闭的请求—应答检查点：

```text
Agent Loop pause
  -> AgentCoreTurnEngine bridge
  -> Turn Pipeline persist prior messages
  -> ContextStrategy.prepare
  -> context.compacted commit
  -> PostCompact
  -> Agent Loop resume
```

Kernel 只定义暂停/应答、消息视图和恢复次数，不解释 Coding Agent 压缩算法。Coding Agent
Session-local Context Runtime 继续拥有 threshold、prefire、summary、circuit breaker、同模型 overflow
识别和 Pre/PostCompact。普通 Agent Loop 默认不启用检查点，旧生产 `AgentSession` 行为不变。

已恢复的旧行为包括：

- 同一 Tool Loop 的 assistant/toolResult 先持久化，再判断下一次模型调用是否跨阈值。
- 自然结束 assistant 根据最终 usage 执行 threshold 压缩，但不自动重放成功响应。
- 同模型 error pattern overflow 先保存错误，再压缩并从重试上下文移除错误。
- input usage 超过 context window 的 silent overflow 走相同恢复路径。
- 同一外部 Agent Loop 最多恢复一次，防止持续 overflow 无限重试。
- PostCompact 请求停止时保留已提交摘要但不重试。
- 压缩期间到达的 steering 在重试模型调用前注入；follow-up 继续在自然停止后消费。
- Provider transient context 在 Document 重投影后重新插入，不因摘要提交丢失。
- 取消/检查点失败不会放行额外模型调用。

检查点和 Strategy 输入都是进程内已类型化对象，不新增 TypeBox/Zod；持久 compaction record 继续使用
既有 TypeBox Schema。

### 2.20 Session 手动压缩与 Extension 兼容

旧手动压缩在开始前中止活动 Agent 操作，并在两个 Turn 之间直接追加 compaction entry。它不会发送
`auto_compaction_start/end`，但必须保留自定义摘要指令、Pre/PostCompact、Extension 覆盖/取消、
`session_compact` 回调、自动压缩开关和既有错误文本。

Greenfield 没有把该操作塞进 Turn Pipeline，也没有暴露 Repository 给宿主，而是新增：

```text
RuntimeSessionContextController
  -> ManualContextCompactionRuntime
  -> ContextCompactionCommitter
```

Controller 负责取消活动 Turn、压缩忙碌态、Snapshot lease、乐观版本和显式取消；Coding Agent Context
Runtime 负责压缩算法、Hook 与 Extension；Committer 被 Turn-start、model checkpoint 和 manual 三条路径
共用。手动 `context.compacted` 不携带伪 `turnId`，恢复策略只允许它出现在 Turn 外；threshold/overflow
记录仍必须处于活动 Turn。

Extension Runner 通过窄 Adapter 留在 Coding Agent：`session_before_compact` 可以取消或提供摘要，成功
提交后才发送 `session_compact`。TypeBox 只在持久事件 Schema 边界放宽可选 `turnId`，进程内 Controller
输入继续使用 TypeScript 合同。

合同覆盖持久化重开、恢复协议、并发拒绝、显式取消、Extension 覆盖/取消、自定义指令、提交后回调、
自动压缩开关、无额外手动 SessionEvent，以及 CLI 真实 Composition Root。旧 `AgentSession.compact()`
生产路径保持不变。

### 2.21 跨 Conversation Turn 续接

旧 memory-mode 会在自动压缩完成后立刻创建新会话文件，并让当前 Tool Loop 继续写入新文件。
该行为不能实现为第二个 `turn.started`，也不能只替换路径。第 72 轮建立以下通用协议：

```text
source: context.compacted -> turn.transferred
target: continuation seed -> turn.continued -> same Turn terminal
```

源 transfer 是终态，目标 continued 是同一 `turnId/snapshotId` 的活动起点。Storage 在源
version 与文件锁下提取最近 compaction 和 kept tail，使用 TypeBox 校验 seed，并保存
`parentSessionPath/parentEntryId`。Pipeline 在事务成功后更新共享 Session Identity，后续模型调用、
工具、Policy、Prompt Provider、Observer 和终态都读取目标 ID。

Greenfield 投影先用 target seed 替换事实源，再应用已落盘的 `turn.continued`；宿主收到
`session.path_changed`，Lifecycle path、History 命令和 Document Participant 同步切换。恢复策略
不会自动重放任何一侧的模型或工具：source transfer 已闭合，未闭合 target 只会被标记为
interrupted。

本轮只迁移通用事务边界，没有启用 memory-mode，没有改变压缩阈值，也没有迁移 MEMORY flush、
memory tool、JOURNAL 或日期 cwd。旧生产 `SessionManager.rolloverToNewFile()` 保持不变。

### 2.22 Memory Rollover 产品 Orchestrator

第 73 轮在 Coding Agent Adapter 层新增 Session-local Memory Rollover Orchestrator，复用旧 memory
store、flush、journal 和 Tool，并只向 Runtime Core 提供压缩设置调整与通用 continuation directive：

```text
memory-mode Session
  -> frozen MEMORY prompt snapshot
  -> existing memory Tool
  -> 70% auto-compaction policy
  -> best-effort MEMORY flush
  -> generic cross-Conversation continuation
  -> completed-turn / rollover JOURNAL
```

已恢复的旧行为：

- Session 启动时冻结 MEMORY 内容，运行期 Tool 修改只影响后续 Session。
- memory Tool 的描述、TypeBox Schema、文件操作与字符限制继续使用既有实现。
- 自动压缩使用 `minFreePercent >= 30` 和 `reserveTokens >= ceil(contextWindow * 0.3)`；手动压缩不应用
  memory 阈值、flush 或 rollover。
- flush 输入是即将被摘要丢弃的消息前缀，失败不阻止压缩。
- rollover 通过第 72 轮事务保持同一 Turn；源文件以 `turn.transferred` 结束，目标文件从
  `turn.continued` 继续。
- 每个成功 Turn 写一条 JOURNAL，成功 rollover 写摘要段落；文件副作用失败不改变 Turn 结果。
- `memoryMode` 默认关闭，未启用 Session 不增加工具、提示词或 JOURNAL。

Kernel 和 Storage 没有新增 MEMORY/JOURNAL 概念。内部编排继续使用 TypeScript 合同；memory Tool
参数和 continuation 持久数据沿用既有 TypeBox 校验，没有在受信任内部对象上重复引入 Zod。

仍有三个切换阻断项：

1. 旧 RPC/IM 的主动 `flush_memory` 能力尚未形成 Greenfield 宿主 Port。
2. 旧实现会先完成 rollover，再运行 Extension committed 回调和 PostCompact Hook；当前 Greenfield
   continuation 在 `onCompactionCommitted()` 返回后才执行，因此回调相对 Conversation 切换的顺序仍有
   差异。
3. 默认生产 Desktop/RPC/IM/CLI 入口仍使用旧 `AgentSession`，本轮只为并行 Greenfield 组合增加显式
   memory-mode 配置。

### 2.23 Rollover 后置时序与主动 Memory Flush

第 74 轮先从旧 `CompactionController` 固定真实顺序：

```text
context.compacted
  -> rollover JOURNAL
  -> Conversation rollover / path changed
  -> Extension session_compact
  -> PostCompact
  -> retry decision
```

Runtime Core 的 `ContextStrategy` 现在可以分别观察通用 continuation 事务成功和失败。成功回调只在
Storage 事务、Session identity、投影和宿主路径完成重绑定后执行；它返回的 `continueExecution` 会成为
overflow retry 的最终依据。失败通知是 best-effort，不能替换 Store 的原始错误。该合同没有 Memory、
JOURNAL、Extension 或 Hook 字段。

Coding Agent Memory Orchestrator 在 continuation 前写 JOURNAL；Context Runtime 在 continuation 成功后
从目标 seed document 解析重写后的 compaction entry，再执行 Extension committed、PostCompact 和熔断
成功记录。Store 失败时不执行成功回调并记录熔断失败。合同覆盖成功顺序、Store 失败和 PostCompact stop。

主动 flush 新增独立 `CodingAgentGreenfieldMemoryController`。它读取当前活动 Conversation 的模型投影、
当前模型和对应凭据，并复用 Orchestrator 的 `flushMessages()`；CLI Greenfield Composition Root 以
`flushMemory(sessionId)` 暴露给宿主。非 memory-mode 和 rollover 后失效的旧 id 返回 `0`，新 id 继续
可用。该 Controller 没有加入 Runtime Core Assembly。

本轮没有新增 TypeBox/Zod：新增合同均为进程内 TypeScript 对象；外部 RPC 命令仍需在后续真实宿主
Adapter 接入时使用现有协议校验边界。

仍未完成的是默认生产 RPC/IM/CLI 接线和旧新宿主差分，而不是 Memory Orchestrator 内部时序。

### 2.24 RPC 宿主反腐层与 Legacy 协议基线

生产 RPC 原先在单个 `runRpcMode()` 内同时处理 JSONL、命令、Extension UI、Host Bridge、Tool 注册、
进程生命周期和旧 `AgentSession` 字段。该入口无法直接接受 Greenfield Session；仅把
`flushMemory(sessionId)` 塞进 switch 分支会重新形成具体实现耦合。

第 75 轮将协议路径改为：

```text
JSONL Transport
  -> TypeBox inbound frame validation
  -> command dispatcher
  -> grouped RpcSessionCapabilities
  -> LegacyRpcSessionAdapter
```

Extension UI 与 Host Bridge 各自持有 request correlation 和关闭清理。全部命令 Schema 由受
`RpcCommand["type"]` 约束的单一 Map 提供，TypeBox 只校验外部 JSONL；内部仍为 TypeScript 合同。
`runRpcMode(session)` 和生产 `main()` 保持原签名与 Legacy 默认路径。

无模型合同覆盖完整命令面、prompt 延迟失败、Memory、非法/未知 Frame、UI/Host timeout/dispose、
JSONL 边界、事件透传、关闭清理和 Legacy 委托。现有真实 provider RPC 测试继续保留，但不再是重构的
唯一验证手段。

本轮只建立宿主接入缝，没有实现 Greenfield RPC Adapter。稳定 `SessionEvent` 到旧 wire event 的映射、
IM Host Bridge Tool、恢复/rollover identity 和外围 Capability 仍是显式 opt-in 的阻断项。

### 2.25 MCP Runtime-native 迁移与切换差分门禁

第 98～106 轮已把 MCP 从旧 `McpManager` 单体职责中拆出，并形成以下边界：

```text
模型数据面
  -> McpRuntimeToolSource / Synchronizer / Deferred Controller

宿主控制面
  -> 文件配置、OAuth 交互、Server Supervisor、Client/Transport

Legacy 兼容面
  -> McpManager / LegacyMcpManagerRuntimeToolSource
```

Greenfield CLI、Desktop 和 IM 的生产候选组合已经使用 Runtime-native 文件 MCP Source；插件 MCP 使用
Session-local Runtime；子代理只在创建或重开时捕获父 Session 的只读 Tool Binding，不创建第二套 Source、
Supervisor 或 Client。Legacy Adapter 目前只被兼容测试使用，但仍是已发布入口的一部分，因此不能根据仓库内
生产消费者数量直接删除。

第 107 轮新增同输入、同变更序列的切换差分门禁，直接运行旧 `McpManager + AgentTool Adapter` 与新
`McpServerSupervisor + Runtime Tool Source` 两条完整路径，比较：

- Ready、Error、Needs Auth、Disabled 和工具发现失败状态；
- Tool 名称、label、描述、TypeBox Schema 与 Ecosystem Hook 来源元数据；
- 文本、图片、Resource 成功结果和调用失败结果；
- 文件 Server 的稳定复用、新增、替换、删除和 Client close；
- 配置加载失败时保留当前 Tool Surface 与现有连接；
- Shutdown 后的 Client 关闭集合。

核心差分没有发现需要修改生产实现的行为偏差。插件动态替换、`agent_mode`、渐进披露、提示词工具索引、
子代理投影和父 Session 生命周期所有权继续由第 105、106 轮的 Composition 集成测试覆盖，不在同一个测试中
复制第二套产品组合。

本轮没有新增外部配置或协议边界，因此没有引入新的 TypeBox/Zod Schema。MCP 配置、持久 OAuth 状态和 Tool
输入继续使用既有校验边界。

## 3. 已实施模块审计

| 模块 | 当前状态 | 与旧行为的差距 | 切换结论 |
| --- | --- | --- | --- |
| `current_time` Tool | 定义、执行和注册行为已差分验证 | 无已知 Tool 级差距 | Tool 级迁移完成；Feature 仍不可整体切换 |
| `read` Tool | 独立实现、旧新行为合同和真实 Tool Loop 已通过 | 独立可执行宿主的 Photon WASM 产物打包尚未验证 | 工具模块迁移完成；生产宿主不可切换 |
| `ls` Tool | 独立实现、旧新行为合同、空 scope 和 Feature 显式激活 Tool Loop 已通过 | 生产宿主尚未装配新 Profile | 工具模块迁移完成；默认不激活 |
| `glob` Tool | 独立实现、绝对 pattern、`.gitignore` 和真实 Tool Loop 合同已通过 | 生产宿主尚未装配新 Profile | 工具模块迁移完成；全 scope 暴露保持旧语义 |
| `dir_tree` Tool | 独立 Runtime Tool、树模型、fd Operations/Resolver、限制合同和全场景 Profile 差分已通过 | 旧 AgentSession 和生产入口仍使用旧 Tool Factory | 工具模块迁移完成；旧生产入口尚不可删除 |
| `write` Tool | 独立 Runtime Tool、WriteOperations、必需的宿主 WritePathPolicy、路径/取消/错误合同和全场景 Profile 差分已通过 | 旧 AgentSession 和生产入口仍使用旧 Tool Factory | 工具模块迁移完成；旧生产入口尚不可删除 |
| `edit` Tool | 独立 Runtime Tool、双模式纯编辑引擎、EditOperations、必需的宿主 EditPathPolicy、22 项差分合同和全场景 Profile 差分已通过 | 旧 AgentSession 和生产入口仍使用旧 Tool Factory | 工具模块迁移完成；旧生产入口尚不可删除 |
| `bash/shell` Tool | Runtime Definition、Registration、前台执行器、后台协调、独立后台生命周期、task 工具、通知格式、低层 Host Adapter、平台 scope 和过渡 Composition Root 已通过 | 旧 AgentSession 和生产入口仍使用旧工具/Manager | 新 Runtime 工具链迁移完成；旧生产路径尚不可删除 |
| 宿主可执行文件解析 | Runtime Port、本地 PATH/managed-bin Adapter、grep/find 注入合同、旧 ensureTool 适配、网络/归档合同和 cli-app Composition Root 已通过 | 真实 GitHub 网络、最终独立可执行发布物和完整 Tool Profile 迁移尚未完成；包根兼容导出必须继续保留 | 新 Profile 可并行验证；旧宿主仍不可切换 |
| Coding Tools Feature | 只依赖版本化 Catalog，按 Model Call 动态解析 scope/explicit 激活和 requires/capabilities，使用稳定 binding 和原子 Catalog 执行仲裁，并支持 deactivate/revoke/unregister；current_time/read/ls/grep/find/glob/tree/write/edit/bash/shell/task_output/task_stop 已进入全场景 Profile 差分门禁 | 生产 Profile 尚未切换 | 动态编排与当前默认工具迁移完成；生产接入未完成 |
| `AgentSession` | 新状态机、活动 Turn 输入队列、无伪 user message 的 continue、显式 resume 与同 Turn 持久化身份重绑定已实现 | 尚缺旧外围能力的 Greenfield 实现 | 内核 Turn/恢复语义已具备；生产入口不可切换 |
| Turn Pipeline | 固定阶段、模型调用请求—应答检查点、持久化压缩提交、跨 Conversation 续接及成功/失败 finalization、非持久化 observation、输入队列、continue、recovery、独立 Turn Model Binding 和 Session-local 运行期 Context 串行持久化已实现 | 完整生产 Composition Root 尚未接入 | 不可切换 |
| `AgentCoreTurnEngine` | 模型和 Tool Loop 闭环、动态 Model Call Frame、完整观察事件、输入队列、Context checkpoint 桥接和 Turn model binding 已接入真实 Greenfield Composition 与 RuntimeHost | 默认生产选择仍是 Legacy | 内核执行与候选宿主接线完成；等待整体默认切换门禁 |
| Greenfield Session Backend | 独立门面、可重绑定投影、显式 resume、Session-local Todo/Hook/Context/Subagent Runtime，以及完整 RuntimeHost Core/外围 Ports 均已交付 | Legacy 会话兼容与默认生产路由仍待整体迁移 | Assembly Ready，并已进入 Desktop/CLI/IM opt-in 验证 |
| Runtime Snapshot | 编译、冻结、lease、原子交换和动态 Model Call Provider 已实现 | Coding Profile 的完整默认能力与 scope 尚未装配 | 不可替代旧工具注册 |
| Conversation Repository | V2 create/load/append/save、树形 Document 读写、活动分支、fork、跨实例文件锁、跨 Conversation seed/transfer/continued 事务和 Legacy importer 已实现 | Legacy/V1 历史结构写命令保持只读；跨文件崩溃 orphan reconciliation 与模型配置异步持久化尚未实现 | 不可直接替代全部旧会话写路径 |
| Context Strategy | Session-local Runtime 已接入原生摘要持久化、重开投影、外部/同 Turn threshold/prefire、逐模型调用 microcompact、error/silent overflow 单次恢复、手动/Extension 压缩、Pre/PostCompact 和 usage 状态；Coding Agent Memory Orchestrator 已接入冻结 Prompt、既有 Tool、70% 策略、自动/主动 flush、通用 rollover、JOURNAL 与 rollover 后置 finalization | 默认生产 RPC/IM 尚未接入 Greenfield Controller | memory-mode 内部链路可并行验证；生产宿主仍不可切换 |
| MCP | 协议、配置、Client/Transport、OAuth、Supervisor、Runtime-native Tool Source、插件动态 Server、渐进披露、Hook 元数据和子代理 Binding 投影均已完成；第 107 轮旧新端到端差分通过 | 旧 `AgentSession` 和公开兼容 API 仍保留 `McpManager`；默认 Runtime 尚未切换 | Greenfield MCP 迁移验证完成；旧兼容入口随整体生产切换移除 |
| Skill / Knowledge | Session 级 Skill/Scene Prompt 与现有 Knowledge Tool Source 已进入动态并行组合，并通过进程重启重新装配验证 | 仍需纳入完整生产 Profile 差分和默认 Runtime 切换门禁 | 能力组合可用；暂不删除 Legacy 来源 |
| Subagent | Session-local Runtime、Explorer/Workflow、Hook、Todo、增量状态日志、恢复、通知去重及父 MCP Binding 投影已实现 | 默认 Legacy Backend 尚未切换 | Greenfield 能力已完整接入；随整体宿主切换启用 |
| Ecosystem Hook Runtime | 每 Session 唯一实例已贯通 Prompt、最终动态 Tool Surface、Stop、SubagentStart/SubagentStop、运行期 Context、自动/手动 Pre/PostCompact 和 dispose | PermissionRequest Hook 与宿主切换原因仍需纳入完整生产 Profile 差分 | 并行组合已验证；默认生产入口不变 |
| Desktop / CLI / RPC / IM Adapter | RuntimeHost 稳定 Ports、Greenfield RPC/IM Adapter、显式 Runtime selector、IM Sidecar、Desktop Backend Pool、真实进程 Canary、独立安装产物和跨进程恢复均已完成 | 默认 selector 仍是 Legacy；完整生产 Profile、公开 API 和旧存储消费者尚未完成最终切换审计 | Greenfield 可显式启用并回退；暂不改变默认入口 |

上述差距目前没有影响生产，因为旧入口仍在使用旧实现。但它们是切换阻断项，不能因为新模块
已有单元测试就视为功能迁移完成。

## 4. 新的迁移 Gate

每项能力按以下顺序实施：

1. 从旧实现和旧测试提取可观察行为矩阵。
2. 建立参数化合同测试，同一 fixture 同时运行旧实现和新实现。
3. 再进行 Port、Adapter、Feature 和文件结构调整。
4. 比较 Schema、描述、结果、错误、副作用和事件。
5. 任何差异默认修复；确需改变时单独提交决策，不夹带在架构重写中。
6. 差分测试全部通过后，才在实施日志中标记“已迁移”。

工具最低差分矩阵：

```text
definition
  name / label / description / schema / default exposure
execution
  success / failure / cancel / progress
input edges
  optional fields / extra fields / invalid values
environment
  Windows / Unix / cwd / absolute path / home path
output
  content / details / truncation / actionable notices
side effects
  filesystem / process / network / persistence
```

## 5. 下一步

Greenfield 已通过 CLI、IM Sidecar、Desktop opt-in、真实 Provider Tool Loop、独立安装产物、真实 Desktop
进程和跨进程恢复门禁。MCP 也已完成 Runtime-native 迁移与旧新差分；下一阶段不应继续整理即将淘汰的
`McpManager` 内部结构。

下一阶段应建立“完整生产 Profile 与默认 Runtime 切换准备度”门禁：

1. 从当前 Legacy 默认会话提取 CLI、Desktop、RPC、IM 各场景的最终 Prompt、Tool、Skill、Knowledge、
   Plugin、MCP、Todo、Subagent、Hook 和 Context 能力矩阵。
2. 让同一宿主请求分别运行 Legacy 与 Greenfield，比较模型调用 Frame、SessionEvent、持久化结果、恢复、
   关闭和多会话隔离；外部 Provider 测试只验证真实协议，确定性 Fixture 负责完整行为矩阵。
3. 审计公开 API 与旧存储消费者，区分仍有外部合同的兼容入口和纯内部旧实现。只有默认入口及下游完成迁移
   后，才删除 `McpManager`、旧 `AgentSession` 和 Legacy Adapter。
4. 保持 Runtime selector 默认值不变；先形成可重复的切换/回退 Gate，再单独决定默认值变更。

TypeBox/Zod 只用于外部 RPC、配置和持久化反序列化边界；生产 Profile 比较使用已经类型化的 Model Call
Frame 与 Session 合同，不为内部对象重复增加 Schema。
