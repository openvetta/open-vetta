# Agent Team 生命周期验证

日期：2026-10-05。此记录对应 `9528c60c2` 之后的本地深入检查；代码提交、远端发布、安装包和运行中的预览是不同验收对象。

## 验证口径

本轮沿生命周期检查失败边界，不以“正常流程通过”代替所有异常路径通过。重点保持四个不变量：

1. 恢复或重新配置失败不能释放可能被其他调用者采用的 Runtime；新建资源只在可证明的初始化边界补偿
2. 停止意图与取消记录未完成持久化、旧停止清理尚未结束时，不接受同一会话的新任务
3. 公开结果必须有可验证的成员、任务与来源归属；进度、来源缺失的聚合结果及无关旧回答不能当作完整结果
4. 迟到的请求只能更新原会话；导航不撤销已经接受的后台工作，也不让旧状态覆盖新界面

测试使用受控异步闸门、故障注入、真实领域服务及 RuntimeHost。模型、外部进程等边界使用替身。涉及重开的测试重建服务/存储对象；不等同于实际断电、进程强杀或真实磁盘写满。

## 阶段与证据

下列文件名均可在文末的测试入口中定位。“既有回归”包含前轮修复的保持验证；“本轮边界”表示本次先取得失败证据再修复。

| 生命周期阶段 | 要保持的事实与注入方式 | 可复核证据 | 覆盖性质 |
| --- | --- | --- | --- |
| 创建 | 新成员/协调 Runtime 的路径或工具策略校验失败，不留下未交付的新建实例；清理错误不掩盖原错误 | `team-runtime-manager.test.ts`：新建校验、真实 Host 初始化失败、清理错误 | 本轮边界 |
| 恢复 | 串行复用、pending 创建去重及保存前已被其他调用者采用的同路径实例，不被失败恢复关闭 | `team-runtime-restorer.test.ts`、`team-runtime-host.testing.ts`：真实 Host 的三种借用顺序及 Host 关闭后回收 | 本轮边界 |
| 配置与绑定 | 工具策略准备失败不提交新绑定；保存/所有权登记失败后保持可重试事实，历史文件不删除 | `team-runtime-manager.test.ts`、`team-member-runtime-reconfiguration.test.ts` | 本轮边界及既有配置回归 |
| 旧会话恢复 | 没有协调 Conversation 时先建立持久化入口，再保存恢复后的成员绑定 | `team-session-recovery-retry.test.ts`：`establishes the coordination store...` | 本轮边界 |
| 消息落盘 | Stop 与公开成员消息写入交错时保留路由分类，禁止产生新的 delivery/work；旧 question 不因新用户回合复活 | `team-session-concurrency.test.ts`：上一轮 stop-during-write、跨 stop 的 question 与 pending delivery 用例 | 前轮回归 |
| 准入与运行 | 已接收任务按成员执行；重复恢复只启动一次，停止运行者后不启动排队成员 | `team-session-concurrency.test.ts`：重复恢复、运行/排队取消、自动重试与外部条件唤醒 | 既有回归 |
| 结果准备与公开写入 | 公开写盘前失败，恢复后仍包含原来的多步公开内容；写盘后抛错不重复发布 | `team-publication-workflow.test.ts`：`preserves the complete public result...`；既有 concurrency 的 prepared publication 重启用例 | 本轮写入前边界＋既有写入后回归 |
| 结果来源 | 来源有序且唯一；缺任一来源保持 `needs-recovery`；来源补齐后只发布一次，其他成员/任务的来源不能混入 | `publication-record.test.ts`、`team-public-message.test.ts`、`team-publication-workflow.test.ts` | 本轮合同与隔离边界 |
| 结果终态 | `toolUse` 文字只是进度；准备中的完整发布不能被 legacy 补全降为 partial；没有可靠本轮 prompt 时不公开旧私有答案 | `team-member-result.test.ts`、`team-publication-workflow.test.ts` | 本轮边界 |
| 终态持久化与重开 | attempt 已完成而 work item 尚未完成时继续收敛；公开结果已落盘后允许 Runtime 重绑；恢复失败后同一服务再次 read 仍会重试 | `team-publication-workflow.test.ts`：attempt completion、rebound Runtime；`team-session-recovery-retry.test.ts`：同进程第二次 read | 本轮边界 |
| Stop 持久化 | 停止标记写成功而取消写失败、两者都失败、补偿再次失败时，不提前解停；停止标记已落盘时，重建服务后旧 work/delivery 仍被取消 | `team-admission-recovery.test.ts`：interrupted cancellations、double failure、still unwritable、in-memory admission | 本轮边界 |
| Stop 与新发送 | 两次新发送共享完成的停止修复；解停中再 Stop 仍保持停止；两次停止乱序完成时，新发送等待全部 Runtime/后台清理，其他会话不被阻塞 | `team-admission-recovery.test.ts`：concurrent sends、different session、every earlier runtime stop；既有 concurrency 的解停中再 Stop | 本轮边界＋既有回归 |
| UI 回执与导航 | A 的发送成功/失败及设置成功回执晚于切换 B，不清空 B、不污染草稿或错误；A→B→A 后新请求不被旧失败覆盖 | `useTeamChatModel.lifecycle.test.tsx`：late send/settings、leaving and returning | 本轮边界 |
| 新会话与继续协作 | A 仍在发送时，B 的首条 handoff 恰好创建并发送一次；A 不被导航取消；负责人结束后成员仍运行则保留 Stop | `useTeamChatModel.lifecycle.test.tsx`；原 `useTeamChatModel.test.tsx` 的 StrictMode、路由规范化；`TeamChatDelegationFlow.test.tsx` | 本轮 handoff 边界＋前轮回归 |

## 兼容与明确边界

- 新 publication 记录可包含 `sourceMessageEntryIds`：仅存有序来源 ID，不复制私有正文。旧记录不迁移，保留单来源读取，不能据此宣称恢复了旧记录未保存的完整聚合范围
- 对已有路径恢复，不推测 Runtime 的独占所有权。失败后实例可能继续常驻并被同路径重试复用，最终由宿主关闭回收。完整的并发资源回收需要当前接口不具备的 lease；本轮未引入该架构
- 停止标记和取消都未落盘、随后进程状态直接丢失时，无法从磁盘恢复这次停止意图。停止调用会报告错误
- Runtime abort 永不返回时，同会话后续发送会等待停止屏障；本轮未设计无限挂起的超时策略
- 未穷举每次 append 前后崩溃的组合，未进行真实断电、fsync 故障、真实 Provider 或原生后台进程故障测试
- publication prepare 记录自身写入失败、最终 completed 账本写失败、并发重复 recover、completed 之后的 direct-context receipt 补写失败，均不列为本轮已覆盖。最后一项是待验证边界，不是已完成修复
- 原生 Electron 预览与安装包不会因本地源码提交自动更新；本轮没有用真实团队或模型调用代替确定性回归

## 测试入口

- [Runtime 创建与恢复](../../apps/desktop/src/main/agent-teams/team-runtime-manager.test.ts)、[恢复所有权](../../apps/desktop/src/main/agent-teams/team-runtime-restorer.test.ts)、[重新配置](../../apps/desktop/src/main/agent-teams/team-member-runtime-reconfiguration.test.ts)
- [停止准入故障注入](../../apps/desktop/src/main/agent-teams/team-admission-recovery.test.ts)、[并发与既有生命周期](../../apps/desktop/src/main/agent-teams/team-session-concurrency.test.ts)
- [结果发布恢复](../../apps/desktop/src/main/agent-teams/team-publication-workflow.test.ts)、[同服务重开重试](../../apps/desktop/src/main/agent-teams/team-session-recovery-retry.test.ts)、[结果终态](../../apps/desktop/src/main/agent-teams/team-member-result.test.ts)
- [来源引用合同](../../packages/agent-team/test/publication-record.test.ts)、[聚合来源](../../apps/desktop/src/main/agent-teams/team-public-message.test.ts)
- [UI 异步生命周期](../../apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.lifecycle.test.tsx)、[现有聊天 Hook](../../apps/desktop/src/renderer/domains/conversation/connectors/team/useTeamChatModel.test.tsx)、[委派到界面的连续流程](../../apps/desktop/src/renderer/domains/conversation/connectors/team/TeamChatDelegationFlow.test.tsx)

复跑遵循 [质量门禁](./quality-gates.md)，使用仓库 `scripts/quality/run-vitest.mjs`，不使用裸 `bun test`。公共记录变更需检查 Agent Team 包及其消费者；定向测试、整包测试、类型检查与真实环境验收分别报告，不能互相替代。

## 本轮执行记录

代码快照：`b84dee95fe92b8316fb023c3b60d4948af571e5b`。下列分组有重叠，不能相加作为总覆盖数。

- 原工作区定向验证通过：UI 54 项、停止与恢复 95 项、结果发布及服务恢复 105 项、Runtime 三个直接文件 31 项；相关 package 合同 31 项通过
- `agent-team` 整包通过：13 文件、85 项。当前改动的 26 个 TypeScript/TSX 文件 Biome 通过，独立复核未发现本轮范围内剩余阻断
- 焦点 Desktop 类型检查通过：继承原编译选项与类型根，限定 28 个根文件及其依赖。它不是全量标准 `tsc` 通过；全量 Desktop 类型检查此前在本机耗尽内存，本轮没有继续反复重跑
- 保守 `test:changed` 扩到 Desktop 整包后未完成：现有 Marketplace 用例只替换 archive 下载，install 路径仍可能调用未替换的 manifest `fetch`，该用例出现超时。测试及该实现与检查前基线相同；本轮没有扩大外部请求授权或修改这个无关用例
- 固定快照上额外执行 Team 正向文件列表：48 文件、388 项通过，另 14 个套件在收集/初始化阶段失败。其中包括外部依赖软链触发 Vite SVG 路径拒绝、旧用例依赖 package 工作目录、模块加载超时；未绕过路径限制，不能把这次联合执行记为全绿

复跑组件用例应使用正常安装依赖的 checkout，并从 `apps/desktop` 运行其测试入口；不要用跨工作树的依赖软链代替完整测试环境。以上限制不抹掉已有故障注入证据，也不能由单项通过推断未完成的整包、标准类型或真实环境验收已经通过。
