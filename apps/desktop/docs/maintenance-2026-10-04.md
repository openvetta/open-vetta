# Desktop 页面与交互维护审查（2026-10-04 至 2026-10-05）

## 范围与结论

以 `Ling0925/open-vetta` 的 `cbb9712b19033349f44e28ba253f36aa096603ce` 为基线，按开发者日常目标检查会话、项目、能力管理和设置。当前路由表有 **24 条路由，其中 7 条是兼容重定向**；设置 registry 有 **19 个有效注册项**。下表同时覆盖重要对话框、抽屉和次级入口。

本轮保留既有导航、紧凑工作区、原生 agent loop、事件批处理和虚拟列表，先修复会导致错误状态、丢失输入或误导操作的细节，再统一相关控件和视觉规则。沿用现有视觉体系，并按独立行为适配上游改进。

**证据边界：**逐页源码审查、确定性 React/jsdom 交互测试、包类型检查；没有完成真实浏览器截图、Electron 打包窗口、像素布局、原生系统权限或屏幕阅读器实机验收。受管浏览器此前对本地预览返回 `ERR_BLOCKED_BY_CLIENT`，此次重新检查可用浏览器后保持该限制，没有改策略、换通路或公开部署。移动端与文档站不在逐页 UX 范围；第三方主题和插件的任意页面内容只能检查宿主合同。

## 实际可见改进

- 共享按钮使用危险色 token、统一小尺寸圆角，并限定颜色/边框/透明度/位移过渡；确认、更新和错误页面复用同一 Button
- 确认和更新弹窗拥有标准对话框语义、焦点圈定、安全默认焦点和关闭后的焦点返回；保留主题扩展合同与原有快捷键作用域
- 能力、场景和知识库搜索复用 Input；选择卡、设置开关、模型/MCP 字段具备名称和真实选择状态；可见标签通过 id/htmlFor 关联，点击即可聚焦
- 场景空态移除永久漂浮、光晕和夸张圆角；知识库卡片去 hover 阴影，卡片网格适应内容宽度
- 项目说明、只读会话与远程项目选择器按当前目标接收异步结果；错误可原地重试，迟到结果不会串入另一页
- 批量项目避免重复创建；知识导入失败保留草稿，部分完成后重试不重复建库；自动化历史失败不再冒充空历史
- 模型用量不再把写死的 $150 和“预算安全”当真实账户信息；明确费用来自本地估算
- 终端选区、成员提及、模型批选、阅读位置与流式渲染吸收独立的上游改进，并保留本分支行为

## 会话、项目与文件逐页覆盖

| 页面/入口 | 本轮实际审查的状态与交互 | 自动验证/结果边界 |
| --- | --- | --- |
| `/` 普通会话：ChatPage/ChatPageView/ChatView/DefaultChatComposer | active/pending 会话呈现、共享发送/取消入口、页头/活动面板、草稿工作区、流式成员 mention、导出与队列入口；未修改 session 事件合并 | 现有 ChatView.composer 与 UserMessageView.runtime-readiness 定向跑测；stream 修复归本轮统一验证 |
| `/new-session`、旧 `/new-session/$cwd` 重定向 | 页面 hero/身份、项目选择、普通与团队 composer、准备中发送禁用、窄插槽项目入口、command panel 展开、活动面板 cwd | NewSessionOptionsRow/NewSessionProjectSelector 现有组件测试；没有真实布局验收 |
| 团队 `/agent-teams/$teamId`、`/sessions/$sessionId`、`/members/$memberId` | 同一 TeamChatPage 的会话规范化导航、成员 roster、成员只读视角、回团队/设置、共享输入与活动面板、model 错误与 loading 入口 | TeamChatPage 既有测试；未变更 agent-team 权限或发送实现 |
| `/viewer/$path`（含 subagent origin） | 无 path、加载、读取失败、重试、正常历史、订阅更新、切换/卸载、导出禁用、活动面板与返回入口 | 新增 4 项真实 model + theme shell 回归；既有页头 2 项 |
| `/project/$cwd` | 项目身份/目录、会话计数、批任务状态嵌入、AGENTS 编辑器加载/未保存/保存中/成功/失败、切项目与二次编辑 | 新增 hook 与真实 ProjectDetailPageView 编辑/保存/失败重试回归；包括读取失败禁止覆盖 |
| 侧栏导航/项目与会话列表 | DefaultSidebar/SidebarTopBar/ProjectsPanelEmptyState/ProjectsPanelMenus，项目与会话菜单装配、筛选和标签入口；查阅既有重命名/选择/展开测试分布 | 源码审查，不声称本轮逐条重新验证所有菜单分支 |
| 新建/打开远程项目弹窗 | 主机 loading/无主机/失败、选择主机、目录/软链接、进入/返回/换主机、目录失败/重试、确认/取消、迟到响应 | 新增 RemoteProjectPickerDialog 4 项常见与竞态流程 |
| 孤儿远程项目恢复页 | 不可用主机说明、选择绑定目标、绑定中、host-in-use/not-orphaned/error、前往设置入口 | 静态审查，保持绑定和授权策略 |
| 会话标签编辑/通知中心 | 标签创建/改名/换色/删除连接层，MessageCenterDialog/Tabs/Content 的空态与通知分区、未读/标为已读/清理入口 | 静态审查；保留标签操作异步错误反馈缺口，见下 |
| 文件浏览面板/树/右键/删除/传输/显示设置 | 无项目、目录 loading/空树、选择/多选/键盘、预览、创建/重命名、复制粘贴、外部拖入冲突策略、删除确认、隐藏/排除规则/icon theme 保存恢复 | 既有 file-explorer-display.flow；其余是源码走查，未访问真实 FS/原生拖拽 |
| 文件预览弹窗/侧栏编辑器 | 图组前后/缩略图、关闭/下载/显示文件、支持/不支持/读取失败、plugin preview error boundary、文本草稿/保存/冲突/重载、快捷作用域 | 新增错误边界中英文与恢复 1 项；既有 usePreviewBodyModel |
| CodexWorkspacePage（未挂生产路由） | loading/reconnect/technical error、profile/source/model/browse/sandbox、saved session/native入口、草稿/发送/停止/审批卡/转录 | 既有 CodexWorkspacePage/CodexProfileForm；fake preload；未动授权/Provider |
| cloud/auth 登录浮层、LoginStep | idle/waiting/浏览器重开/retry、失败返回、成功推进、i18n/隐藏可选文案 | 仅静态审查实现，既有 useOAuthLogin 测试使用 fake API；无真实登录 |
| 独立 onboarding 权限窗 | 初次检测/焦点刷新/推送、跳系统设置、拖拽失败、两项授权完成自动关闭 | 仅静态检查；按本轮统一验证要求不扩 auth/onboarding 实现 |

## 能力与任务管理逐页覆盖

| 页面/入口 | 用户目标与主要流程 | 加载/空/错态审查 | 操作与风格审查、结果 | 验证 |
|---|---|---|---|---|
| 能力 /abilities；旧 /skills 重定向；?detail 抽屉 | 查找能力→发现/我的→打开详情→安装/启停/配置 | 已有加载、空搜索和来源部分失败；补 status/alert 语义 | 搜索复用 Input 并命名；固定2/3列改自适应240px网格；保留分页、导入与来源入口 | useAbilitiesModel 5例，含真实页面清空搜索→无匹配→恢复；详情壳3例；来源8例；安装配置1例 |
| 场景 /scenes；旧 /skills?tab=scene | 查找场景→查看能力详情→安装/启停/卸载 | 加载/无匹配/无内容/局部回退均审查；补 status/alert | 搜索统一Input与名称；空态去掉永久漂浮、模糊光晕和rounded-3xl，改静态token表面；保留场景/Agent只读分组 | SkillsPageView 2例；merge-scenes 6例 |
| 知识库 /knowledge | 启用→切库→搜文件/切视图→导入→浏览/重命名/删除 | 冷启骨架、禁用态、空库和失败对话已读；导入失败丢草稿已修 | 搜索与工具栏命名/焦点；导入期间busy、失败保持名称/文件/目标，失败可重试；新库成功但文件失败不重复创建库 | KnowledgeImportRecovery 3例（创建失败重试、部分成功重试、搜索/视图/刷新） |
| 全部知识库 /knowledge/all | 查找库→打开→创建或返回 | 空库与搜索无匹配已检查；读取加载/错误仍依赖现有atom，无独立页反馈 | 搜索统一Input，返回命名；卡片去hover阴影及非法透明度/字号，网格随容器宽度收缩 | KnowledgeBaseListPageView 1例 |
| 知识库导入/重命名/待加工/切库弹窗 | 选择已有或新库→命名→导入；查找待加工文件；安全重命名/删除 | 导入失败现在内联反馈且保留草稿；其他现有空态和确认流程保留 | 导入Connector持有异步状态，theme仅接收submitting/error；无新增结构region；重命名与待加工使用原theme叶子 | 导入回归同上；其他弹窗仅源码走读 |
| 自动化 /automation；编辑/创建分屏；执行历史 | 选模板/新建→输入任务与计划→创建→查历史→打开会话 | 主列表、分屏保存错误已读；历史读取错误不再伪装空记录，失败保留已有记录，可刷新 | 历史刷新用共享Button与可访问名称；旧任务请求不能覆盖新选任务；上游标题选填从首行派生，单独分组 | 历史3例；详情model既有2例；标题新纯函数3例和完整详情Pane创建1例均通过 |
| 批量任务 /batch-tasks；新建/编辑项目弹窗 | 配置任务→选择文件夹→创建→执行/重试/停止 | 列表统计/空态/任务状态与危险确认已读；提交失败由未处理拒绝改内联错误，保留草稿 | 同步并发锁和busy防双建；成功才关闭；名称字段有可访问名称和1px focus；pending禁用关闭/再次提交 | BatchProjectDialog 3例：连续点击只建一次、提交中不可编辑、失败保稿后重试、取消重开清旧错误 |
| 智能体 /agents；?agent/?team抽屉；团队深链 | 选团队/智能体→编辑阵容/档案→保存→开团队会话 | loading/error/空库/只读提供方档案已读，保留当前语义 | 保留选卡即编辑、组队区域点击语义、提供方只读、删除影响确认；本轮未改该域 | AgentCenterView 11例、AgentProfileEditor 14例、TeamSettingsSheet 12例、资源hook1例全部通过 |
| 插件工作区 /workspace/$pluginId/$viewId；活动面板插件tab | 打开插件界面→切到另一视图；单插件失败不阻断其他插件 | 宿主未就绪/缺失/崩溃已读；错误boundary现在随view/tab身份重建 | 崩溃插件→正常插件可恢复；活动面板错误文案走i18n并标alert；保留宿主注册和唯一执行loop | PluginViewRecovery 2例 |

## 设置逐页覆盖

| 页面/入口 | 已检查的内容、状态与主要依赖 | 本轮结果与证据 |
| --- | --- | --- |
| 设置主壳/导航 | registry 可见性、SettingsPage/View、Sidebar、SettingsContent、lazy tab loaders；窄栏/填充式插件内容/scroll | 静态检查；保留统一导航与内容滚动。侧栏有原有测试，本轮未声称重跑全部导航测试 |
| 账户 | AccountSettingsView、订阅卡与 SubscriptionActions、UsageStats/TokenActivityChart 适配器；未登录/刷新/昵称弹窗 | 静态检查；Auth 边界不动。昵称 label/Enter保存保护仍见保留问题 |
| 通用 | GeneralSettingsView/theme View、ProxySettings；路径、沙盒、通知、诊断、升级、引导 | 命名沙盒/通知/调试；SettingsControls 流程；ProxySettingsSection 现有 7例补跑 |
| 远程连接 | RemotePairingSettings；idle/ready/connected、二维码生成、输入授权、撤销 | 仅补输入开关名称；组件验证 idle 禁用不变；不执行真实配对 |
| Web 访问 | WebAccessSettings、现有组件测试；LAN、HTTPS高级项、启停、配对、授权撤销、错误 | 静态确认已有可见label、status/error、禁用控制和完整流程测试；本轮无新改动，既有测试本轮未重跑 |
| 外观 | AppearanceSettingsView及七类选择卡、语言、预览、禁用主题 | 修复选中/焦点/语言名称；6例通过，包括 Space/Enter切换与非相关预览不重渲染 |
| Agent配置 | AgentSettingsView、RuntimeConfigurationSections、ImageGenerationSettingsSection | 名称修复 + 实际 hook 保存个性化/逐项开关1例；runtime现有1例及image generation现有2例通过 |
| 模型配置 | ModelsSettingsView、ProviderForm/Row、ModelsModelForm、PresetProviders/ModelsList、FetchedModelsPanel | 字段/Checkbox语义修复；真实新增并编辑模型定价流程1例通过。拉取模型默认不选/全选清空由独立改进组负责，本报告不计为本节统计 |
| 模型用量总览 | ModelUsageSettings、OverviewView，range/metric/slot、loading/error/empty、明细表region | 保留已有查询/导出/路由。预算修复独立；ModelUsageSettings现有流程测试更新验无假预算 |
| 模型价格标准/账单拆解 | PricingView、热力矩阵、单价目录、费用组成、CSV | 删除伪预算；保持真实预算调用兼容与超额安全判定；新增预算组件用例 |
| SSH主机 | SshHostsSettingsView、SshHostForm/List、useSshHostsSettingsModel测试；新增/编辑/导入/测试/移除 | 静态确认具名Input、语义form、错误alert、连接不可验证状态与stderr折叠；本轮无改动 |
| Claw | ImBridgeSettingsView、channels/catalog、卡片、状态条、配置/绑定入口、日志 | 总开关补名称；现有5例通过。日志抽屉/旧飞书表单保留问题见下 |
| 消息推送 | WebhookSettingsView、EndpointList、EditorDialog、useWebhookSettingsModel | 完整创建/编辑/保存错误及重试3例通过；无真实发送 |
| 归档 | ArchivedProjectsSettingsView/theme View、还原/删除回调 | 静态确认空态、列表、路径截断和共享Button；无本轮新增问题修复，未执行真实删除 |
| 快捷键 | ShortcutsSettingsView、Recorder、QuickPanelSettings | 面板两个select具名，禁用保留；设置控件测试覆盖。Recorder旧全局事件与字段识别待后续 |
| 应用快照 | AppshotSettingsView/theme View、手势选择、权限状态/引导 | select具名；测试验证名称；真实macOS权限未测 |
| 应用环境 | EnvironmentSettingsView/theme View、Node/Python状态、busy/error、镜像 | 静态检查：有错误和进度显示；公共Button迁移及实时状态语义为存量改进项，没有行为扩大 |
| 知识库设置 | KnowledgeBaseSettingsView/model；启停、频率/并发、模型探测、扫描/重试/记录/清理 | 隐藏结果文字修复，实际hook调整频率→失败→重试成功→关闭流程1例通过；保留现有清理确认 |
| Vetta Vivi | PetSettingsView/theme View、BubbleStylePreview | 开关具名；开启→解除相关禁用→置顶/调试状态流程通过；预览本来已有aria-pressed |
| 系统权限 | PermissionsSettingsView/theme View；unknown/granted/denied、跳系统授权 | 静态检查；状态有文字；真实OS授权未运行，通用错误公告与Button仍为存量 |
| 更多选项 | ExtensionsSettingsView；插件导航/空态/长文案 | 静态确认可见标签、focus、截断、空态；无本轮改动 |
| 团队（隐藏入口） | TeamSettings/List/Detail与create/join弹窗 | 静态发现无名/空危险按钮、输入无标签等，入口在registry注释，不本轮扩展；详见保留高问题 |
| MCP（当前扩展→连接器入口） | McpSettingsView、Store/List、ManualMcpDialog、McpEditDialog、ServerForm、JsonEditor、BuiltinSecrets、RemoteMcp | 手动表单具名/expanded/原生checkbox；实际hook新建保存1例通过；OAuth、凭据、托管运行时不改 |
| 成就/晋升 | AchievementSettingsView/Carousel适配、PromotionDialog/theme实现 | 静态核对现有选择器与3D对话框；减弱动画与键盘退出需专门实机验证，见保留项 |

## 其他全局表面与兼容入口

| 表面 | 检查内容 | 验证边界 |
| --- | --- | --- |
| 通用确认、更新重启 | 危险操作/取消、checkbox、嵌套对话框、Tab 圈定、Escape、焦点返回；共享按钮和可收缩宽度 | 新的真实组件流程验证；未启动安装更新 |
| 路由失败页面 | 主要恢复动作、错误详情、回首页、中英文切换 | 新组件验证中英标签和重试；不调用外部服务 |
| 命令菜单 | combobox/listbox 名称、选择与查询、loading、关闭和输入焦点装配 | 源码审查与既有组件/Hook 回归；真实键盘布局待验收 |
| 底部面板与终端 | 展开/折叠保活、分割、空面板选择、实例错误隔离、主题选区 | 终端颜色回归与已有面板流程；真实 PTY、WebGL 和拖拽未运行 |
| 首次设置向导、独立权限窗 | 步骤/返回/跳过、权限状态、登录槽位与关闭路径 | 源码审查；未改变登录、授权或权限配置 |
| Vivi 独立窗口 | 尺寸/气泡/视频失败、隐藏/暂停、用户动作与自动呈现 | 源码入口与已有布局组件测试；透明原生窗口未视觉验收 |
| Action Approval Center | 请求/超时订阅、审批组件的 busy/拒绝/同意与说明 | 源码审查；没有扩大权限，未对真实操作批准 |
| SSH 交互提示 | 密码/验证码/指纹确认、超时撤回、取消与可见主机名 | 源码审查；未读取或输入真实凭据 |
| 动态主题页面 | 等待主题就绪、选择主题、缺失页面回首页 | 检查宿主路由与既有主题 model 测试；第三方页面不作整体认证 |
| 7 条旧路由 | 团队列表/新建/设置、旧能力详情、skills、plugins、带 cwd 的新会话 | 检查目标路由与参数；保持兼容，不删除入口 |

## 上游选取与兼容判断

直接上游为 [openvetta/open-vetta](https://github.com/openvetta/open-vetta)。审查时 main 为 `a2d314a8521aa438c78dd51ed18c9e523a2cfab9`，dev 为 `a0cb4618955fb411becf997880cec67b39ce4f94`。main 与本分支已有 484 / 93 个独有提交，不能把整个上游当作一枚安全的 UI 补丁。

| 来源 | 本轮处理 | 保留/补充 |
| --- | --- | --- |
| [2543c5a](https://github.com/openvetta/open-vetta/commit/2543c5aecdfbb2d17e9a0055f429b01300d43af7) 自动化标题选填 | 独立采纳 | 显式标题优先，首行派生，技能 token/Unicode 边界，实际创建流程 |
| [0b2315b](https://github.com/openvetta/open-vetta/commit/0b2315bdd7ce2bc36d2312e9d1a81ea9d4e39947) 拉取模型批选 | 适配 | 保留 API 继承；默认零选，已添加项不可再选，支持全选/取消 |
| [3f0b78e](https://github.com/openvetta/open-vetta/commit/3f0b78ee452b7b7529732cb8eddaf565317bdee1) 终端选区 | 适配 | 给 xterm 具体 RGBA，验证 HEX/RGB/百分比及无效回退 |
| [1e1f3be](https://github.com/openvetta/open-vetta/commit/1e1f3bebb4cf06d2b6c5331b1efc68a07d83ca5f) 成员提及颜色 | 采纳 | 输入与消息继续共享 token，深浅主题由 primary 决定 |
| [f4dfc26](https://github.com/openvetta/open-vetta/commit/f4dfc2690e976943728cac1ac680fe2d73c48942) 工具阶段终态 | 适配 | toolUse 累计 usage 但保持消息运行，后续调用才结束计时 |
| [94d7e13](https://github.com/openvetta/open-vetta/commit/94d7e1381d372aa97a197b92fef3f484bae235b7) 重试后恢复终态 | 适配 | 正常 assistant done 清旧 error；保留 abort 和既有事件兼容分支 |
| [1531717](https://github.com/openvetta/open-vetta/commit/15317178d2d89a189c6b722d8336cb396ff7be66) 主动阅读位置 | 适配 | 不缓存自动到底的中间位置；补齐键盘滚动意图，并由独立回归复核 |
| [00ebe0b](https://github.com/openvetta/open-vetta/commit/00ebe0b88978bc3b5ed24461d44e8a986e19bfdf) 稳定 usage 引用 | 适配 | 值/顺序未变时复用数组，保留本分支模型切换文字和消息身份 |

没有合并上游的整体 Conversation/attach/reducer 架构、默认远控策略或 CI 变动。`firstItemIndex` 锚定方案已被上游撤回，未采纳。项目列表删除磁盘功能涉及既有能力与安全边界，没有随样式提交移除。配置写入事务、文件预览挂载重构与 MCP JSON 导入分别需要后续独立验证。两仓库 Apache-2.0 与既有 NOTICE 保留。

## 已知剩余问题

本轮不声称全产品无缺陷。后续按实际影响排序：

1. 文件树读取失败与标签写失败仍有静默路径；知识库全列表首次读取、场景动作及自动化非保存动作的错误反馈还不一致
2. 文件预览首次挂载/卸载竞争及编辑器跨文件保存提示，需要独立状态归属回归；没有直接套用依赖上游架构的新补丁
3. 账户昵称、Claw 日志抽屉、MCP 凭据/JSON/AI协助等次级表面，仍有标签、焦点或失败公告欠缺；真实登录/权限未变更
4. 隐藏团队设置页有空白或未命名动作；成就晋升依赖 3D 动效结束，键盘退出需要专门验证
5. 自动化固定分栏、设置窄宽/放大文本、原生拖拽和虚拟列表真实像素几何仍需视觉验收，不能由 jsdom 推导通过
6. 配置跨服务读改写事务、项目根目录删除的目标保护不属于这轮样式补丁；保留功能并列为单独维护项

## 验证结果

### 已验证

- Desktop：103 个明确文件、540 个去重用例最终通过，文件清单见 [maintenance-test-files-2026-10-04.json](maintenance-test-files-2026-10-04.json)
- Runtime Host 终态：8 个用例通过；独立真实组件夹具：4 个用例通过；合计 **552 个不同用例**
- 26 个所需 workspace 依赖构建成功，锁文件未改变；隔离会话夹具 Vite build 成功，保留其已有大 chunk 警告，没有修改阈值
- 本轮 100 个 TS/TSX 文件显式 Biome 检查通过；保留 3 处精确、说明原因的兼容/可访问性例外（两个键盘横向滚动区域，以及公共 InputField 的调用方显式 autoFocus 合同）
- root 与 Desktop 同 tsconfig 的 tsgo 最终检查均通过。CLI、Docs、Mobile 类型检查和 Mobile lint 已通过；全部 guards 通过
- 独立交叉审查发现的键盘阅读位置回归、批量提交中的编辑丢失和重开残留错误均已修正，并由对应回归复核

### 未通过的门禁与诊断

`bun run check` 没有整体通过：全仓仍有 117 个既有 lint error、1 warning、2 info；这批改动没有放宽全仓配置或基线。默认并行 root/Desktop 类型进程被资源限制中止；root 已独立跑通。标准 Desktop tsc 独立再跑仍遇堆内存限制，因此不声称标准 tsc/完整 check 成功，以同配置的本地 tsgo 结果明确补充类型证据。

103 文件首次双 worker 回归为 102 文件通过；队列 suite 首例超时并使后续用例串扰。隔离单 worker 也失败。进一步在 `cbb9712b` 原基线、相同依赖与基线 UI 包源码下，重现完全相同的 9 失败 / 3 通过；直接计时显示首次 atoms 模块加载耗时 5569ms，业务 hook 尚未开始便耗尽首例原有 5 秒预算。仅将冷模块准备移到原有 beforeEach fixture 阶段后，基线和本次代码的队列 12/12 均通过，**超时、业务断言和模块重置均未放宽**。上述 540 项是最终不同文件通过结果的合并统计，不是宣称首次单次组合全绿。

验证全程使用临时 HOME、清空继承环境与显式包/文件列表，没有读取真实凭据或调用真实模型、代理、账号、远程主机。已有错误分支日志和 jsdom canvas 未实现提示仍有输出；它们不等同于真实 Electron 验收。

### 可复跑入口

准备仓库锁定的 Bun 1.3.14 依赖与所需 workspace 构建后，从仓库根目录运行：

```sh
# 使用 Node 读取明确列表，避免 shell 通配符扫描其他包
node --input-type=module -e 'import fs from "node:fs"; import { spawnSync } from "node:child_process"; const files=JSON.parse(fs.readFileSync("apps/desktop/docs/maintenance-test-files-2026-10-04.json","utf8")); const r=spawnSync("bun",["scripts/quality/run-vitest.mjs","--run","--config","apps/desktop/vitest.config.ts","--maxWorkers=1","--minWorkers=1",...files],{stdio:"inherit"}); process.exit(r.status ?? 1)'

bun scripts/quality/run-vitest.mjs --run --config apps/desktop/test/fixtures/conversation-ux/vitest.config.mts test/fixtures/conversation-ux/fixture.test.tsx --maxWorkers=1 --minWorkers=1
bunx tsgo --noEmit
bunx tsgo --noEmit -p apps/desktop/tsconfig.json
bun run check:guards
```

Runtime 8 项从 `packages/runtime-core` 目录使用该包配置和明确文件 `test/runtime-host/running-changed-reason.test.ts`，仍通过 `../../scripts/quality/run-vitest.mjs` 运行。以上针对性命令不替代全量发布、三平台打包或真实 UI 验收。

## 人工验收建议

在自己的隔离开发实例中，按表逐页检查暗色/亮色、紧凑窗口与 200% 缩放；优先验证搜索焦点、设置选择、错误后重试、确认弹窗返回焦点，以及键盘上翻会话后的恢复位置。真实远程/权限与插件用现有测试账号或安全演示数据单独验收。本轮未启动真实用户 Desktop，也没有改变其设置。
