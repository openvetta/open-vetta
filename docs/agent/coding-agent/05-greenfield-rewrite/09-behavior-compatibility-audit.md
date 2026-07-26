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
`@vetta/coding-agent/adapters/runtime-tools/executable-resolver.js` 作为组合层入口提供；
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

## 3. 已实施模块审计

| 模块 | 当前状态 | 与旧行为的差距 | 切换结论 |
| --- | --- | --- | --- |
| `current_time` Tool | 定义、执行和注册行为已差分验证 | 无已知 Tool 级差距 | Tool 级迁移完成；Feature 仍不可整体切换 |
| `read` Tool | 独立实现、旧新行为合同和真实 Tool Loop 已通过 | 独立可执行宿主的 Photon WASM 产物打包尚未验证 | 工具模块迁移完成；生产宿主不可切换 |
| `ls` Tool | 独立实现、旧新行为合同、空 scope 和 Feature 显式激活 Tool Loop 已通过 | 生产宿主尚未装配新 Profile | 工具模块迁移完成；默认不激活 |
| `glob` Tool | 独立实现、绝对 pattern、`.gitignore` 和真实 Tool Loop 合同已通过 | 生产宿主尚未装配新 Profile | 工具模块迁移完成；全 scope 暴露保持旧语义 |
| 宿主可执行文件解析 | Runtime Port、本地 PATH/managed-bin Adapter、grep/find 注入合同、旧 ensureTool 适配和基础宿主策略测试已通过 | 产物级下载/打包、并发解析和版本锁定尚未验证 | Port 与旧适配完成；宿主切换阻断 |
| Coding Tools Feature | 只依赖版本化 Catalog，按 Model Call 动态解析 scope/explicit 激活，使用稳定 binding 和原子 Catalog 执行仲裁，并支持 deactivate/revoke/unregister；current_time/read/ls/grep/find/glob 已形成独立注册和 Tool Loop 合同 | edit/write/search/process 等未迁移，生产 Profile 尚未装配 Registry | 动态编排边界完成；整体能力未完成 |
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

`current_time`、`read`、`ls`、`grep`、`find`、`glob` 和动态注册/激活编排合同已经建立。
宿主适配器已从 `core/host` 调整到 `adapters/runtime-tools`，并建立了不触发网络的基础
`ensureTool` 行为合同。下一阶段应完成 `rg`、`fd`、Photon 和其他外部依赖的产物级解析/打包测试，重点覆盖下载、
并发解析、版本锁定、离线模式和 Windows/Unix 产物。生产 Profile 接线时由组合根创建 Registry；
普通 Catalog 成员变化直接在下一次模型调用生效，不再触发全 Profile 重编译。

生产切换前还必须增加宿主产物级测试，验证 Photon WASM 在现有独立可执行打包方式中的复制与
定位行为。该验证属于 Host Adapter/Packaging Gate，不应重新塞回 read 的领域实现。
