---
status: accepted
---

# 活动面板插件 tab 的「该不该出现」由贡献方按工作空间声明

活动面板的插件 tab 有两套出现机制：`initiallyVisible` / 用户上栏记录（ADR-0026，按工作空间 cwd 持久化），以及插件用 `ctx.ui.setActivityTabVisible()` 主动写入的显式记录。两者都假定**有一份会话在场**：显式写入前，宿主需要把会话 cwd 翻成挂载中的工作空间键，没有会话就没有可寻址的目标。

于是「这个工作空间里有没有 .git」这类**取决于目录本身**的条件出了问题。Git 面板此前只在 `ctx.conversation.on('conversation-changed')` 里探测并写可见性，结果是：

- 新会话页和项目详情页没有会话事件，插件永远收不到触发，面板在这两个页面上不出现；
- 即便收到事件，写入也是异步的，切换工作空间后到达的结果必须自己丢弃，实现里为此维护了 `latestCwd` 与「每个 cwd 只自动 attach 一次」的补丁；
- 用户的减号记录优先级高于插件的判断，仓库里也无法保证面板一定在栏上。

根因不是探测写得不对，而是**可见性判断依赖了一个并不总存在的上下文（会话）**，而它真正需要的是工作空间本身。

决定：

1. `registerActivityTab` 新增可选的 `useMeta({ cwd })`。宿主在解析标签栏时对每个已注册定义各调用一次（与内置 tab 的 `useMeta` 同一 fold，hook 归属宿主组件），返回 `null` 表示本帧不进入候选——既不上栏，也不进「+」可添加池；返回 `{ pinned: true }` 表示固定上栏且不可移除。
2. `PluginActivityTabMeta.pinned` 是贡献方对宿主的**强断言**：它忽略 attach 记录与 `initiallyVisible`，宿主同时撤掉该 tab 的减号（`removable: false`）。语义是「工作空间里有这个东西，用户就必须看得到它」，只在条件由工作空间本身决定时使用；`pinned: false` 仍走原有记录管道。
3. 场景过滤与可见性保持分离：`scope_use` 仍按对话场景 fail-closed 过滤，`useMeta` 只管「这个工作空间里该不该有」。因此声明了 `useMeta` 的贡献应当把 `scope_use` 扩到所有可能出现该工作空间的场景，而不是挑一个。
4. Git preset 改为 `useMeta` 驱动：`scope_use` 扩到 `project` / `batch` / `automation`（「对话」项目的 cwd 永远不是仓库，不列），探测结论缓存在插件运行时（按 cwd）；结论为 `not-repo` 时返回 `{ pinned: false }`（退回「+」池，保留「初始化仓库」入口），其它结论返回 `{ pinned: true }`。仓库状态可变（`git init`、agent 自己跑的命令），因此缓存需可作废：面板内 `git init` 后立即作废，插件在每轮结束（`turn-end`）作废一次。

配套修正（同一根因的另一面）：对话场景此前在 UI 侧有两份推导——`useSessionOpener` 用 cwd/批量项目判定，新会话页把 `currentScenarioAtom` 临时置为 `conversation`，项目详情页直接读全局 atom（可能是 `null` 或上一个会话的残留）。新建会话按项目判定为 `project`，而同一批页面的活动面板按 `conversation` 过滤，`scope_use: ["project"]` 的插件 tab 就在这些页面上整片消失。现在抽出 `resolveConversationScenario` 单一事实源，三处（建会话、新会话页、项目详情页）共用。

备选方案：

- **继续用 `setActivityTabVisible`，把无会话页面也登记成工作空间**：需要给每个页面伪造会话上下文，写入的记录还会污染真实会话键；且「无会话时写在哪个键上」本身就是这次要消除的隐含前提。
- **宿主自己判断目录是不是 Git 仓库**：把某个插件的领域知识塞进通用的面板注册管道，且无法覆盖「没装 git 但目录里有 .git」这类插件侧判断。
- **用 `initiallyVisible: true` 让 Git 在非仓库目录也占位**：与产品意图相反（非仓库项目不该有 Git 面板），且仍不能解决不可移除。

后果：

- `useMeta` 是 hook，宿主按「已注册定义」的固定顺序各调一次，插件不得在其中条件式调用 hook；异步探测必须落回自己的 store，否则标签栏会随渲染漂移。
- `pinned` 拿走了用户的移除权。贡献方误报（比如路径判断写错）会让一个不相关的工作空间里长期存在不可关闭的 tab，因此它只在「工作空间本身证明该面板必须存在」时使用；纯 UI 偏好仍走原来的记录管道。
- 插件显隐记录仍是 ADR-0026 的 cwd 键，本轮不改；`pinned` 只是在其之上加了一层覆盖，记录本身保留原值，条件不再成立时旧记录立即重新生效。
- `registerActivityTab` 的 `useMeta` 需要 Plugin API `^2.10.0`；旧宿主会忽略未知字段（清单校验不受影响），因此插件在不同宿主上的表现会不同，符合既有版本声明惯例。
