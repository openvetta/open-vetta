/**
 * Command Menu 的视图契约。
 *
 * 视图层不认识“项目 / 会话 / 设置项”这些业务概念，只认识分组、行、命中区间；
 * 五个数据源的差异全部在宿主的 model 层抹平（见 desktop 的 `domains/command-menu`）。
 */

export interface CommandMenuHighlightRange {
	readonly start: number;
	readonly end: number;
}

export interface CommandMenuItemView {
	/** 稳定 id：选中态锚在它上面，而不是列表下标。 */
	readonly id: string;
	readonly title: string;
	readonly titleHighlights: readonly CommandMenuHighlightRange[];
	readonly subtitle?: string;
	readonly subtitleHighlights?: readonly CommandMenuHighlightRange[];
	/** iconify 类名，例如 `icon-[solar--folder-linear]`。 */
	readonly icon: string;
	readonly badge?: string;
	/** badge 的色调：accent 用主题强调色（如「技能」），默认是中性灰。 */
	readonly badgeTone?: "neutral" | "accent";
	/**
	 * 会话的进行中状态：有值时行首图标换成与侧栏一致的状态图标，并在行尾显示 statusLabel。
	 * waiting 指会话正等着用户处理（提问 / 审批 / 询问 / 授权）；unread 指一轮已跑完、用户还没打开看。
	 */
	readonly status?: "running" | "waiting" | "unread";
	readonly statusLabel?: string;
	/** 行尾的标签色点（管理会话用），按给定顺序排列。 */
	readonly tagColors?: readonly string[];
	/** 命中了但当前打不开（例如无权限的会话）：显示但禁用，不静默过滤。 */
	readonly disabled?: boolean;
	readonly disabledReason?: string;
}

export interface CommandMenuGroupView {
	readonly key: string;
	readonly label: string;
	readonly items: readonly CommandMenuItemView[];
	/** 异步源尚未收敛（目前只有会话组会用到）。 */
	readonly loading?: boolean;
	/** 超出每组上限时的提示文案，例如「还有 12 条」。 */
	readonly overflowLabel?: string;
}

export interface CommandMenuViewLabels {
	readonly placeholder: string;
	readonly empty: string;
	readonly emptyHint: string;
	readonly loading: string;
	readonly title: string;
	/** 右下角操作按钮组的无障碍名称。 */
	readonly actionsLabel: string;
	/** 左下角「新会话」按钮文案。 */
	readonly newSession: string;
	/** 按钮文案只写动作（「打开」），键帽由视图按平台渲染。 */
	readonly hintSelect: string;
	readonly hintClose: string;
}
