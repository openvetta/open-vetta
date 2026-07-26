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

Runtime grep/find 只需要第一项的结果，不应导入旧下载器。因此新增通用
`CodingToolExecutableResolver`：

```text
Host resolver
  -> Promise<string | undefined>
  -> Runtime grep/find
  -> spawn rg/fd
```

Runtime 提供的本地 Adapter 只检查受管 bin 目录和 PATH，不下载、不修改文件、不输出日志。
宿主如果仍需要自动下载，可以在 Composition Root 实现同一 Port 并委托旧下载器；下载策略
不会进入 Runtime Tool。当前已在 `coding-agent` 增加
`createToolExecutableResolver`，以 `silent: true` 委托旧 `ensureTool`，形成不改变旧下载
行为的结构适配。适配器位于 `adapters/runtime-tools`，并通过
`@vetta/coding-agent/host` 作为组合层稳定入口提供；
旧的 `core/host` 子路径保留为迁移期转发入口。

`grep/find` 在注入解析器时于每次执行解析 `rg`/`fd`，因此宿主可以在运行时替换或移除可执行
文件，而不需要重建 Runtime Snapshot。未注入解析器时仍使用原有 `rg`/`fd` 默认命令名，
保证迁移期间的直接调用行为不变。

证据：

- 本地 Adapter 覆盖受管 bin 优先、PATH fallback、Windows 后缀和不可用返回。
- grep/find 合同测试确认解析器分别收到 `rg`/`fd`，不可用时保留原错误文本。
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
  注册 current_time/read/ls/glob/grep/find/bash/shell，并通过 FeatureCompiler 生成新 Profile；旧
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

当前已迁移的 `current_time/read/ls/glob/grep/find` 在所有场景的最终激活集合完全一致。
`current_time/read/glob/grep` 保持全场景默认激活，`ls/find` 保持空 scope，且后两者仍可由
新 Composition Root 显式激活。比较发生在模型调用贡献层，而不是只比较 Registry 元数据，
因此能发现 Feature 编排、默认 scope 或 Provider 输出造成的可观察差异。

同时审计了 `@vetta/runtime-tools` 包根：仓库内源码和测试当前没有直接消费者，但包根仍是已
发布的公共入口，并继续转发尚未迁移的 `bash/edit/write/tree` 等工具。新 Runtime 只有上述
6 个工具，直接删除或改写根导出会造成公开 API 和功能缺失。因此本阶段保留兼容导出，不用
“仓库内无人引用”替代公共兼容性判断。只有剩余工具完成行为差分迁移、产品 Composition Root
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

`task_output/task_stop` 的定义、Schema、增量读取和停止结果已迁到 Runtime；底层任务进程与
日志生命周期仍通过宿主 Adapter 委托旧 `BackgroundTaskManager`。

### 2.10 `bash/shell` 命令执行 Port、前台执行器与后台协调

旧 `bash` 不是单纯的 `spawn` 包装。它同时拥有命令前缀、环境覆盖、路径修正、输出更新、
尾部截断、完整输出文件、超时/取消、受保护目录检查、后台任务和自动转后台。直接在
Runtime Tools 重写其中一部分会形成新的功能实现，而不是架构迁移。

迁移先以 Anti-corruption Adapter 建立完整 Port，再由差分合同把前台行为移入 Runtime：

```text
Runtime bash/shell Definition + Registration
  -> CommandToolExecutor Port
  -> Runtime ForegroundCommandExecutor / BackgroundCommandExecutor
  -> ForegroundCommandOperations / BackgroundCommandService Port
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

后台路径采用更窄的宿主边界：Runtime 只依赖 `BackgroundCommandService` 的 spawn、wait、事件
订阅、通知订阅、输出读取、stop 和 dispose。coding-agent Adapter 当前把这些操作映射到旧
`BackgroundTaskManager`，并保留其通知抑制规则、读取游标、停止原因、shell 和进程树行为。
因此 Runtime 已不依赖该具体类，但底层任务引擎尚未独立实现。

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
- 7 个旧会话场景的 Composition Root Tool Profile 差分继续为零。

当前前台行为与后台协调已经由 Runtime 拥有，但旧 `BackgroundTaskManager` 仍负责实际后台
进程、日志文件、状态存储和通知仲裁。只有在同一 Service Port 后实现独立任务引擎并通过现有
差分合同后，才能删除旧 bash/shell 的完整后台实现。

## 3. 已实施模块审计

| 模块 | 当前状态 | 与旧行为的差距 | 切换结论 |
| --- | --- | --- | --- |
| `current_time` Tool | 定义、执行和注册行为已差分验证 | 无已知 Tool 级差距 | Tool 级迁移完成；Feature 仍不可整体切换 |
| `read` Tool | 独立实现、旧新行为合同和真实 Tool Loop 已通过 | 独立可执行宿主的 Photon WASM 产物打包尚未验证 | 工具模块迁移完成；生产宿主不可切换 |
| `ls` Tool | 独立实现、旧新行为合同、空 scope 和 Feature 显式激活 Tool Loop 已通过 | 生产宿主尚未装配新 Profile | 工具模块迁移完成；默认不激活 |
| `glob` Tool | 独立实现、绝对 pattern、`.gitignore` 和真实 Tool Loop 合同已通过 | 生产宿主尚未装配新 Profile | 工具模块迁移完成；全 scope 暴露保持旧语义 |
| `bash/shell` Tool | Runtime Definition、Registration、前台执行器、后台协调、task 工具、通知格式、本地 Host Adapter、平台 scope 和过渡 Composition Root 已通过 | 底层后台任务引擎仍由旧 `BackgroundTaskManager` Adapter 提供 | Tool 协调层迁移完成；旧后台引擎仍不可删除 |
| 宿主可执行文件解析 | Runtime Port、本地 PATH/managed-bin Adapter、grep/find 注入合同、旧 ensureTool 适配、网络/归档合同和 cli-app Composition Root 已通过 | 真实 GitHub 网络、最终独立可执行发布物和完整 Tool Profile 迁移尚未完成；包根兼容导出必须继续保留 | 新 Profile 可并行验证；旧宿主仍不可切换 |
| Coding Tools Feature | 只依赖版本化 Catalog，按 Model Call 动态解析 scope/explicit 激活和 requires/capabilities，使用稳定 binding 和原子 Catalog 执行仲裁，并支持 deactivate/revoke/unregister；current_time/read/ls/grep/find/glob/bash/shell/task_output/task_stop 已进入全场景 Profile 差分门禁 | edit/write/tree 未迁移，后台任务底层引擎和生产 Profile 尚未切换 | 动态编排边界完成；整体能力未完成 |
| `AgentSession` | 新状态机可执行 | 活动 Turn 输入目前拒绝；旧系统具有 queue、follow-up、steering 语义 | 不可切换 |
| Turn Pipeline | 固定阶段和持久化检查点已实现 | 输入队列、完整观察事件和恢复闭环未完成 | 不可切换 |
| `AgentCoreTurnEngine` | 模型和 Tool Loop 闭环、每次模型调用刷新 Model Call Frame 已通过 | Kernel 只映射完成消息；旧 UI 需要流式 text/thinking/tool progress 事件 | 不可切换宿主 |
| Runtime Snapshot | 编译、冻结、lease、原子交换和动态 Model Call Provider 已实现 | Coding Profile 的完整默认能力与 scope 尚未装配 | 不可替代旧工具注册 |
| Conversation Repository | 新格式 create/load/append/save 已实现 | 旧 JSONL importer、Snapshot 读取、分支、未完成 Turn 恢复和跨进程锁未完成 | 不可读取并替代旧会话 |
| Context Strategy | 目前只有 passthrough 基础实现 | 旧 compaction、prefire、microcompact 和摘要行为未迁移 | 不可切换长会话 |
| MCP / Skill / Knowledge / Subagent | 尚未迁移 | 旧能力全部缺失 | 不可切换对应 Profile |
| Desktop / CLI / RPC / IM Adapter | 尚未切换 | 事件、交互和协议兼容尚未差分验证 | 不可切换入口 |

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

`current_time`、`read`、`ls`、`grep`、`find`、`glob`、bash/shell 前后台协调、task 工具、requires/capabilities 和动态注册/激活编排合同已经建立。
宿主适配器已从 `core/host` 调整到 `adapters/runtime-tools`，并建立了不触发网络的基础
`ensureTool` 行为合同、下载计划合同、归档安装合同、网络边界合同和 cli-app 过渡
Composition Root。新旧 Tool Profile 已对全部场景建立差分门禁；runtime-tools 包根兼容导出
因仍承载未迁移工具而保留。下一阶段应在现有 `BackgroundCommandService` Port 后实现 Runtime
独立任务生命周期引擎，并把 shell spawn、日志存储和进程树终止降为宿主 Operations；差分通过
后再迁移 write/edit/tree 并完成 CLI/桌面入口适配，
最后根据完整 Profile 差分结果设计兼容入口迁移；真实 GitHub 网络、最终独立可执行发布物和
其他外部依赖的产物级解析/打包测试仍需单独执行，重点覆盖下载、并发解析、版本锁定、离线
模式和 Windows/Unix 产物。生产 Profile 接线时由组合根创建 Registry；
普通 Catalog 成员变化直接在下一次模型调用生效，不再触发全 Profile 重编译。

生产切换前还必须增加宿主产物级测试，验证 Photon WASM 在现有独立可执行打包方式中的复制与
定位行为。该验证属于 Host Adapter/Packaging Gate，不应重新塞回 read 的领域实现。
