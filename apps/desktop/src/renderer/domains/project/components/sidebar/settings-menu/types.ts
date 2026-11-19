export interface SettingsMenuModel {
	/** 当前路由是否在设置页，用于侧栏设置按钮的高亮状态。 */
	active: boolean;
	/** Claw（IM）是否在线，控制设置按钮内 Claw 状态点展示。 */
	clawOnline: boolean;
	/** Claw 状态点 tooltip 文案。 */
	clawTitle: string;
	actions: {
		openSettings(): void;
	};
}
