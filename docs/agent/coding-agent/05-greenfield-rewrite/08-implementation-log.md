# 全面重写实施日志

本索引只指向已经实施并验证的事实。尚未实现的设计仍以本目录其他方案文档为准。

按「一次修改一个文件」拆分后的日志位于 [`08-implementation-log/`](./08-implementation-log/)。后续每一轮已验证实施新增一个文件，并在本索引登记。

## 日志列表

| 文件 | 轮次 |
| --- | --- |
| [01-greenfield-kernel-slice.md](./08-implementation-log/01-greenfield-kernel-slice.md) | Greenfield Kernel 第一纵向切片 |
| [02-snapshot-lease-and-storage.md](./08-implementation-log/02-snapshot-lease-and-storage.md) | Snapshot Lease 与文件会话仓储 |
| [03-agent-core-turn-engine.md](./08-implementation-log/03-agent-core-turn-engine.md) | Agent Core Turn Engine Adapter |
| [04-runtime-schema-boundary.md](./08-implementation-log/04-runtime-schema-boundary.md) | 运行时 Schema 边界 |
| [05-coding-tools-feature.md](./08-implementation-log/05-coding-tools-feature.md) | 第一个独立 Coding Tools Feature |
| [06-behavior-compatibility-correction.md](./08-implementation-log/06-behavior-compatibility-correction.md) | 行为兼容性纠偏 |
| [07-coding-tool-registration.md](./08-implementation-log/07-coding-tool-registration.md) | Coding Tool 注册边界与差分合同 |
| [08-read-behavior-baseline.md](./08-implementation-log/08-read-behavior-baseline.md) | Read 参数化行为基线 |
| [09-runtime-read.md](./08-implementation-log/09-runtime-read.md) | 独立 Runtime Read 与 Feature 接入 |
| [10-runtime-ls.md](./08-implementation-log/10-runtime-ls.md) | 独立 Runtime Ls 与默认暴露兼容 |
| [11-coding-tool-catalog.md](./08-implementation-log/11-coding-tool-catalog.md) | 动态 Coding Tool Catalog 与 Feature 解耦 |
| [12-model-call-frame.md](./08-implementation-log/12-model-call-frame.md) | Model Call Frame 与实时能力校验 |
| [13-capability-lifecycle.md](./08-implementation-log/13-capability-lifecycle.md) | 稳定能力绑定、生命周期与在途执行仲裁 |
| [14-runtime-grep.md](./08-implementation-log/14-runtime-grep.md) | Grep 行为兼容、独立 Runtime 实现与 Tool Loop 接入 |
| [15-runtime-find.md](./08-implementation-log/15-runtime-find.md) | Find 行为兼容、空 scope 与显式 Tool Loop 接入 |
| [16-runtime-glob.md](./08-implementation-log/16-runtime-glob.md) | Glob 行为兼容、绝对模式与 `.gitignore` Tool Loop 接入 |
| [17-host-executable-resolver.md](./08-implementation-log/17-host-executable-resolver.md) | 宿主 `rg`/`fd` 解析 Port 与 Runtime 注入 |
| [18-coding-agent-executable-adapter.md](./08-implementation-log/18-coding-agent-executable-adapter.md) | 旧 `ensureTool` 到 Resolver Port 的宿主适配 |
| [19-host-adapter-boundary-and-behavior-tests.md](./08-implementation-log/19-host-adapter-boundary-and-behavior-tests.md) | 宿主适配器目录边界与 `ensureTool` 行为合同 |
| [20-runtime-executable-re-resolution.md](./08-implementation-log/20-runtime-executable-re-resolution.md) | Runtime 可执行文件实时重解析合同 |
| [21-host-download-plan-contract.md](./08-implementation-log/21-host-download-plan-contract.md) | 宿主下载计划与跨平台产物合同 |
| [22-host-archive-installation-contract.md](./08-implementation-log/22-host-archive-installation-contract.md) | 宿主归档安装与清理合同 |
| [23-network-artifact-and-composition-root.md](./08-implementation-log/23-network-artifact-and-composition-root.md) | 网络边界、独立产物验证与 CLI Composition Root |
| [24-tool-profile-differential-gate.md](./08-implementation-log/24-tool-profile-differential-gate.md) | 旧新 Tool Profile 差分门禁与兼容导出审计 |
| [25-capability-aware-tool-activation.md](./08-implementation-log/25-capability-aware-tool-activation.md) | Tool requires/capabilities 激活合同 |
| [26-command-tool-port-and-compatibility-adapter.md](./08-implementation-log/26-command-tool-port-and-compatibility-adapter.md) | Bash/Shell Port、兼容适配器与 Profile 接入 |
| [27-independent-foreground-command-executor.md](./08-implementation-log/27-independent-foreground-command-executor.md) | 独立 Runtime 前台命令执行器与宿主进程适配 |
| [28-background-command-service-and-task-tools.md](./08-implementation-log/28-background-command-service-and-task-tools.md) | 后台命令 Service Port、Runtime 协调与 Task Tools |
| [29-runtime-background-command-lifecycle.md](./08-implementation-log/29-runtime-background-command-lifecycle.md) | Runtime 后台任务生命周期与低层宿主端口 |
| [30-runtime-dir-tree.md](./08-implementation-log/30-runtime-dir-tree.md) | Dir Tree 行为兼容、独立 Runtime 实现与 Profile 接入 |
| [31-runtime-write.md](./08-implementation-log/31-runtime-write.md) | Write 行为兼容、宿主路径策略与独立 Runtime 实现 |
| [32-runtime-edit.md](./08-implementation-log/32-runtime-edit.md) | Edit 双模式行为兼容、纯编辑引擎与独立 Runtime 实现 |
| [33-runtime-session-backend-boundary.md](./08-implementation-log/33-runtime-session-backend-boundary.md) | RuntimeHost 可注入 Session Backend 创建边界与旧实现适配器 |
| [34-session-observation-and-greenfield-events.md](./08-implementation-log/34-session-observation-and-greenfield-events.md) | 旧会话事件特征基线、独立观察合同与 Greenfield SessionEvent 适配 |
| [35-session-input-concurrency.md](./08-implementation-log/35-session-input-concurrency.md) | 活动 Turn 的 steer、follow-up、队列模式与终态仲裁 |
| [36-greenfield-session-backend.md](./08-implementation-log/36-greenfield-session-backend.md) | Greenfield 并行后端、Continue Turn 与恢复边界 |
| [37-session-resume-and-recovery.md](./08-implementation-log/37-session-resume-and-recovery.md) | 类型基线修复、显式 Session Resume 与未完成 Turn 恢复 |
| [38-runtime-session-core-ports.md](./08-implementation-log/38-runtime-session-core-ports.md) | RuntimeHost Turn Control、Event Stream 与 State Read Port |
| [39-runtime-session-backend-assembly.md](./08-implementation-log/39-runtime-session-backend-assembly.md) | Backend Assembly、旧 Backend 兼容适配与 Composition Root 解耦 |
| [40-session-identity-lifecycle-and-history-read.md](./08-implementation-log/40-session-identity-lifecycle-and-history-read.md) | Session Identity/Lifecycle、History Read Port 与 Assembly 交付 |

## 维护约定

- 每一轮已验证实施对应一个文件，编号递增，文件名用英文短 slug。
- 单文件只记录该轮：目标、修改范围、明确未修改、测试、结果、未解决问题、下一步。
- 不把多轮修改合并进同一文件；本索引保持轻量，细节只写在对应轮次文件中。
