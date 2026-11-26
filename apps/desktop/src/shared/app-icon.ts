// 应用图标（设置 → 外观 → 应用图标）。主进程持久化并应用，renderer 只读写同一个 id。

/**
 * 可选图标，按风格分组（设置页 popover 里一组一个页签）：
 * - classic：default 是出厂图标（蓝底眼镜水滴），red / black / light 是它的红、黑、浅色底版，
 *   dark 是深色底的小圆脸，binary 是二进制背景版；
 * - animals：ermine 是旧版出厂的白鼬，router … translator 是黑底毛绒动物头像（柯基、猫头鹰、狐狸等）；
 * - pixel：场景像素白鼬。
 * 图片在 build/app-icons/<id>.png。
 */
export const APP_ICON_GROUPS = [
	{ id: "classic", icons: ["default", "red", "black", "light", "dark", "binary"] },
	{
		id: "animals",
		icons: [
			"ermine",
			"router",
			"researcher",
			"architect",
			"executor",
			"auditor",
			"optimizer",
			"synthesizer",
			"translator",
		],
	},
	{
		id: "pixel",
		icons: ["coding", "design", "work", "study", "read", "game", "sport", "cook", "travel", "sleep"],
	},
] as const;

export type AppIconGroupId = (typeof APP_ICON_GROUPS)[number]["id"];

export type AppIconId = (typeof APP_ICON_GROUPS)[number]["icons"][number];

export const APP_ICON_IDS: readonly AppIconId[] = APP_ICON_GROUPS.flatMap((group) => group.icons);

export const APP_ICON_DEFAULT: AppIconId = "default";

export function isAppIconId(value: unknown): value is AppIconId {
	return typeof value === "string" && (APP_ICON_IDS as readonly string[]).includes(value);
}

/** 未知或缺失的值回落默认，兼容将来删减图标后的旧配置。 */
export function normalizeAppIconId(value: unknown): AppIconId {
	return isAppIconId(value) ? value : APP_ICON_DEFAULT;
}
