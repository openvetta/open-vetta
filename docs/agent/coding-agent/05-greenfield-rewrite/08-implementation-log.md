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

## 维护约定

- 每一轮已验证实施对应一个文件，编号递增，文件名用英文短 slug。
- 单文件只记录该轮：目标、修改范围、明确未修改、测试、结果、未解决问题、下一步。
- 不把多轮修改合并进同一文件；本索引保持轻量，细节只写在对应轮次文件中。
