import { definePlugin } from "@vetta-org/plugin-sdk";
import "./style.css";
import { GitPanel } from "./components/GitPanel";
import { GitSettingsView } from "./components/GitSettingsView";
import { GitTurnCard } from "./components/GitTurnCard";
import { GitIcon } from "./components/icons";
import { useGitTabMeta } from "./components/useGitTabMeta";
import {
	emitRefreshSignal,
	emitTurnPhase,
	invalidateGitTabProbe,
	setAiApi,
	setFsApi,
	setGitCommand,
	setOfficialApi,
	setPanelOpener,
	setPanelResizer,
	setStorageApi,
	setUiApi,
} from "./git/runtime";
import { CHANGES_TAB_ID } from "./git/tab-visibility";

export default definePlugin({
	activate(ctx) {
		// Stash the command API for panels (zero-prop activity-tab components read it
		// via the globalThis runtime holder).
		setGitCommand(ctx.command);
		// 同理：右键菜单的「忽略此文件」要写 .gitignore，「在文件管理器中显示」走官方窄口子。
		setFsApi(ctx.fs);
		setOfficialApi(ctx.official);
		// 提交信息草稿按仓库持久化，避免切会话/重启后白写一场。
		setStorageApi(ctx.storage);
		// 提交信息的一键生成走宿主推理，不建会话、不落 session 文件。
		setAiApi(ctx.ai);
		// 失败统一走宿主 toast（自带「复制堆栈」），不在面板里长期占位。
		setUiApi(ctx.ui);


		// Let panels resize their host activity panel (narrow click → max, close → narrow).
		// 面板内部改宽度走 setActivityPanelWidth：openActivityTab 语义是「打开某个标签卡」，
		// 在已经身处该标签卡里时用它拉宽，等于每次点文件都重新打开一次自己。
		setPanelResizer((width) => ctx.ui.setActivityPanelWidth(width));
		// 会话里的 turn 卡要的是「把 Git 面板拿到眼前」，不是改宽度：不覆盖用户拖出来的
		// 宽度，也不会把聊天区挤没。
		setPanelOpener(() => ctx.ui.openActivityTab(CHANGES_TAB_ID));

		// Refresh the panel after each agent turn (it may have edited files), and
		// surface turn start/end phases for the turn card's per-turn baseline diff.
		// 标签卡本身的显隐不再由这里驱动：它跟着面板工作空间走（见 useGitTabMeta），
		// 新会话页与项目详情页没有会话事件也能判断。turn 结束时仓库状态可能变了
		// （agent 可能刚跑过 git init），作废探测缓存让标签卡重新判定一次。
		ctx.conversation.on((event) => {
			if (event.type === "turn-start") {
				emitTurnPhase("start");
			} else if (event.type === "turn-end") {
				emitTurnPhase("end");
				invalidateGitTabProbe();
				emitRefreshSignal();
			}
		});

		ctx.ui.registerActivityTab({
			id: CHANGES_TAB_ID,
			label: "%tab.label%",
			icon: <GitIcon className="h-4 w-4" />,
			component: GitPanel,
			// 排在计划/待办之后、后台任务之前：写代码的项目里，Git 比后台任务更常看。
			order: 25,
			// 凡是可能出现真实代码目录的场景都放开：`project` 覆盖项目会话、新会话页与
			// 项目详情页（后两者现在都下推 project），另外批量与自动化会话也跑在项目里。
			// 「对话」项目（conversation）的 cwd 是宿主内部目录，永远不是仓库，
			// 列进来只会在那里多一个空的可选面板。
			scope_use: ["project", "batch", "automation"],
			// 默认不上栏：由 useMeta 按工作空间决定——Git 工作区里固定上栏且不可移除，
			// 其它目录只留在「+」可添加池里（「初始化仓库」仍需从那里进入）。
			initiallyVisible: false,
			useMeta: useGitTabMeta,
		});

		// Git 相关配置（提交信息模板、常用行为开关）。纯配置页，配好之后很少再来：
		// sidebar: false 只让它出现在 设置 → 扩展 里，不占侧边栏。
		ctx.ui.registerWorkspaceView({
			id: "settings",
			label: "%settings.title%",
			icon: "icon-[mdi--source-branch]",
			description: "%settings.tagline%",
			sidebar: false,
			component: GitSettingsView,
		});

		// 消息列表底部的 turn 卡：仅当目录是 Git 仓库且有变更时自显示。
		ctx.ui.registerTurnCard({
			id: "changes",
			component: GitTurnCard,
			scope_use: ["project"],
		});
	},
});
