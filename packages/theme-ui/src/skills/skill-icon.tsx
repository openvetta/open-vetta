import type { JSX } from "react";

/**
 * 与 admin `MarketIconField` 预设对齐的 30 个 Solar 实心图标。
 * 使用字面量 class，保证 Tailwind + @iconify/tailwind4 能扫到。
 */
export const SOLAR_SKILL_ICON_CLASS: Readonly<Record<string, string>> = {
	"solar:star-bold": "icon-[solar--star-bold]",
	"solar:magic-stick-3-bold": "icon-[solar--magic-stick-3-bold]",
	"solar:bolt-bold": "icon-[solar--bolt-bold]",
	"solar:fire-bold": "icon-[solar--fire-bold]",
	"solar:heart-bold": "icon-[solar--heart-bold]",
	"solar:cup-star-bold": "icon-[solar--cup-star-bold]",
	"solar:code-bold": "icon-[solar--code-bold]",
	"solar:widget-2-bold": "icon-[solar--widget-2-bold]",
	"solar:layers-bold": "icon-[solar--layers-bold]",
	"solar:cpu-bolt-bold": "icon-[solar--cpu-bolt-bold]",
	"solar:database-bold": "icon-[solar--database-bold]",
	"solar:cloud-bold": "icon-[solar--cloud-bold]",
	"solar:server-bold": "icon-[solar--server-bold]",
	"solar:shield-bold": "icon-[solar--shield-bold]",
	"solar:lock-keyhole-bold": "icon-[solar--lock-keyhole-bold]",
	"solar:key-bold": "icon-[solar--key-bold]",
	"solar:chat-round-bold": "icon-[solar--chat-round-bold]",
	"solar:letter-bold": "icon-[solar--letter-bold]",
	"solar:document-bold": "icon-[solar--document-bold]",
	"solar:folder-bold": "icon-[solar--folder-bold]",
	"solar:gallery-bold": "icon-[solar--gallery-bold]",
	"solar:camera-bold": "icon-[solar--camera-bold]",
	"solar:videocamera-record-bold": "icon-[solar--videocamera-record-bold]",
	"solar:music-note-bold": "icon-[solar--music-note-bold]",
	"solar:chart-2-bold": "icon-[solar--chart-2-bold]",
	"solar:graph-up-bold": "icon-[solar--graph-up-bold]",
	"solar:map-point-bold": "icon-[solar--map-point-bold]",
	"solar:global-bold": "icon-[solar--global-bold]",
	"solar:rocket-2-bold": "icon-[solar--rocket-2-bold]",
	"solar:lightbulb-bolt-bold": "icon-[solar--lightbulb-bolt-bold]",
};

export function isSolarSkillIcon(icon: string | null | undefined): boolean {
	return !!icon && icon.startsWith("solar:");
}

export function isImageSkillIcon(icon: string | null | undefined): boolean {
	if (!icon) return false;
	const v = icon.trim();
	return (
		v.startsWith("http://") ||
		v.startsWith("https://") ||
		v.startsWith("/") ||
		v.startsWith("data:") ||
		v.startsWith("blob:")
	);
}

export interface SkillTypeIconProps {
	readonly type: "skill" | "scene";
	/** 空 / 未识别 → 按 type 显示 desktop 默认能力图标 */
	readonly icon?: string | null;
	readonly className?: string;
}

/**
 * 技能卡片图标：自定义图 → Solar 实心 → type 默认 mdi。
 * 图片铺满父容器（h-full w-full）；字体/Solar 图标使用 className 尺寸。
 */
export function SkillTypeIcon({ type, icon, className = "h-4 w-4" }: SkillTypeIconProps): JSX.Element {
	const trimmed = icon?.trim() ?? "";
	if (trimmed && isImageSkillIcon(trimmed)) {
		return <img src={trimmed} alt="" className="h-full w-full object-contain" />;
	}
	if (trimmed && isSolarSkillIcon(trimmed)) {
		const cls = SOLAR_SKILL_ICON_CLASS[trimmed];
		if (cls) {
			return <span className={`${className} ${cls}`} />;
		}
	}
	return (
		<span
			className={`${className} ${
				type === "scene" ? "icon-[mdi--movie-open-outline]" : "icon-[mdi--puzzle-outline]"
			}`}
		/>
	);
}
