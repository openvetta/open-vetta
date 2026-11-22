import type { SettingsTab } from "@shared/store/atoms";
import type { DesktopSessionSearchResult } from "@/shared/session-search";
import type { DesktopTeamSidebarConversation } from "@/shared/sidebar-conversation";

/**
 * Command Menu 的领域模型。
 *
 * 条目的动作用**数据描述**而不是闭包表达：适配层因此保持纯函数、可直接断言，
 * 真正的导航副作用只发生在 model 层一处。
 */

/**
 * 分组顺序是常量，永不因相关性重排。
 *
 * 五个源的延迟差两个数量级（同步内存数组 vs 流式 IPC 会话检索），若让它们竞争
 * 同一条全局相关性排序，异步结果到达时会把光标下的行顶走，用户回车打开的将是
 * 从未看见的东西。固定组序 + 组内排序是这个不变量的实现方式。
 *
 * 「进行中」组置顶：运行中 / 等用户回答的会话是面板兼做全局监视入口的部分，
 * 打开面板第一眼就该看到；加载期间保留骨架位，避免到达时把下面的组顶走。
 * 「最近打开」紧随其后（只在空查询时出现）：跑完的会话被打开后离开「进行中」，仍能在这里一键回去。
 */
export const COMMAND_MENU_GROUP_ORDER = [
	"activeSessions",
	"recentSessions",
	"projects",
	"sessions",
	"abilities",
	"settings",
	"workspaceViews",
] as const;

export type CommandMenuGroupKey = (typeof COMMAND_MENU_GROUP_ORDER)[number];

/** 每组渲染上限；超出的部分折成一行「还有 N 条」。 */
export const COMMAND_MENU_GROUP_LIMIT = 6;

export type CommandMenuAction =
	| { readonly kind: "openProject"; readonly cwd: string }
	| { readonly kind: "openTeamSession"; readonly session: DesktopTeamSidebarConversation }
	| { readonly kind: "openSession"; readonly result: DesktopSessionSearchResult }
	| { readonly kind: "openSettingsSection"; readonly tab: SettingsTab; readonly section: string }
	/**
	 * 能力条目与市场逃生行共用：跳能力页并预填搜索词。
	 * scope 区分落地分区——面板内列出的都是**已装**能力，落到「发现」会搜不到自己。
	 */
	| { readonly kind: "openAbilities"; readonly query?: string; readonly scope?: "discover" | "mine" }
	| { readonly kind: "openWorkspaceView"; readonly pluginId: string; readonly viewId: string };

export interface CommandMenuEntry {
	/** 全局稳定且唯一；选中态锚在它上面，而不是列表下标。 */
	readonly id: string;
	readonly groupKey: CommandMenuGroupKey;
	readonly title: string;
	readonly subtitle?: string;
	/** iconify 类名。 */
	readonly icon: string;
	readonly badge?: string;
	readonly badgeTone?: "neutral" | "accent";
	/** 会话的进行中状态；有值的会话归入「进行中」组。 */
	readonly status?: "running" | "waiting" | "unread";
	readonly statusLabel?: string;
	/**
	 * 组内先于相关性分数比较的优先级（越小越靠前）。只有「进行中」组用到：
	 * 等用户回答的会话要排在只是在跑的会话前面，无论查询词命中得多好。
	 */
	readonly priority?: number;
	/** 命中但当前不可用（例如无权限的会话）：显示并禁用，不静默过滤。 */
	readonly disabled?: boolean;
	readonly disabledReason?: string;
	/**
	 * 组内同分时的次序（越小越靠前）。项目按最近使用、设置按注册顺序，
	 * 由各适配器在构建目录时一次性写好。
	 */
	readonly order: number;
	/** 恒定置底的行（例如「在能力市场中搜索…」），不参与匹配打分。 */
	readonly pinnedToBottom?: boolean;
	readonly action: CommandMenuAction;
}
