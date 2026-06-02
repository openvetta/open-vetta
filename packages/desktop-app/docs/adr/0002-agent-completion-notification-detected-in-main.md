# Agent 完成通知在主进程常驻订阅中检测

## Status

accepted

## 决策

[[agent 完成通知]]（见 CONTEXT.md）的「某 session 完成了一轮」检测放在**主进程**：在 `vetta:session:create` IPC 处给每个新建 session 额外挂一个**常驻的、不随视图切换销毁**的通知订阅，从其完整事件流中区分正常完成（`agent_end` / stopReason `stop`）、出错（stopReason `error`）与中断（`aborted`），只对前两者触发通知。是否弹出由主进程持有的窗口聚焦态 + 渲染进程上报的「当前所在 session」按[[通知抑制规则]]合并判定；点击后经 IPC 通知渲染进程路由到目标 session。**不改动 runtime-core**。

## 背景约束

- 渲染进程**只订阅当前正在看的 session**，切走后台 session 即 `unsubscribe`，后台 session 的 `agent_end` 渲染进程根本收不到 → 检测不能放渲染进程。
- 主进程现成的全局信号 `onRunningChanged` 把 `agent_end` / `aborted` / `error` 三种结束都压成 `running=false`，无法区分 → 不能只复用它。
- `RuntimeHost` 不记录 session 创建来源（交互 vs 批量/定时），但交互式 session 全部经 `session:create` 创建、批量/定时直接调 `runtime.createSession` → 在 `session:create` 处天然圈定[[交互式 session]]，满足「只通知交互式」而无需新增来源元数据。

## Considered Options

- **runtime-core 加全局完成事件 + SessionConfig 加 origin 字段**：更「正规」、可复用，但要改共享包契约与所有创建调用点，改动面大；否决。
- **渲染进程检测**：拿不到后台 session 的完成事件（视图切走即退订），语义上无法满足「后台 session 完成也通知」；否决。
- **仅复用 `onRunningChanged`**：无法区分正常完成 / 中断 / 出错，与「中断不通知、出错通知」的需求冲突；否决。

## Consequences

- 通知逻辑全部落在 desktop-app 主进程,runtime-core 保持纯净;代价是主进程要为每个交互式 session 维持一条与渲染视图订阅并存的常驻订阅,需在 session dispose 时一并清理,避免泄漏。
- 「检测交互式 session」绑定在「经 session:create 创建」这一约定上;若将来批量/定时任务也改走 session:create,需另加来源标记,否则会误通知。
