import { useTranslation } from "@vetta-org/plugin-sdk";
import { memo, type ReactNode } from "react";
import { DesignSystemDemo, designSystemDemoHtml } from "../gallery/DesignSystemDemo";
import { StyleCover } from "../gallery/StyleCover";
import { designSystemCategoryLabel, designSystemTagline } from "../design-systems/labels";
import type { DesignSystem } from "../design-systems/types";

/**
 * 设计体系卡片的公共内容块：缩略预览 + 明暗点 + 名称 + 类目 + 标语。
 * 会话宫格与全局模板 Dialog 共用，选中/锁定等状态样式由外层按钮负责。
 */
export const DesignSystemTileContent = memo(function DesignSystemTileContent({
	system,
	badge,
	demoActive = false,
	demo = true,
}: {
	system: DesignSystem;
	/** 名称右侧的状态徽标（「已选择」/「当前」），没有就不占位。 */
	badge?: ReactNode;
	/** 悬停态：有 demo 时让预览自动滚动。 */
	demoActive?: boolean;
	/**
	 * 是否挂载 HTML demo（一个 iframe，一份完整文档）。
	 *
	 * 风格库那面墙是几十张连排，全挂 iframe 光解析文档就能把滚动拖垮，所以静态一律走封面
	 * （没有封面才是色板），悬停到哪张才把那一张叠上真 demo。
	 */
	demo?: boolean;
}) {
	const { t, locale } = useTranslation();
	const hasDemo = demo && designSystemDemoHtml(system) !== null;
	return (
		<>
			{/* 预览区弹性吃掉剩余高度：外层卡片是 4:3，文字两行定高在底部。
			    静态是封面（没有就是色板）；demo 打开（悬停）时在它上面叠一层真实渲染。 */}
			{/* w-full 不能省：卡片是 <button>，UA 默认 align-items:center，交叉轴不会 stretch；
			    这里的子元素全是 absolute，没有正常流内容撑宽，少了它整块宽度塌成 0（色板也看不见）。 */}
			<div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-md">
				<StyleCover system={system} />
				{hasDemo ? (
					<div className="absolute inset-0">
						<DesignSystemDemo system={system} active={demoActive} placeholder={false} className="h-full" />
					</div>
				) : null}
			</div>
			<div className="flex min-w-0 items-center gap-1.5 px-0.5">
				<span
					title={t(system.vibe === "dark" ? "ds.vibe.dark" : "ds.vibe.light")}
					className={`size-2 shrink-0 rounded-full border ${
						system.vibe === "dark" ? "border-zinc-500 bg-zinc-900" : "border-zinc-300 bg-zinc-50"
					}`}
				/>
				<span className="truncate text-xs font-semibold text-foreground">{system.name}</span>
				{badge}
				<span className="flex-1" />
				<span className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[10px] text-muted-foreground">
					{designSystemCategoryLabel(system, t)}
				</span>
			</div>
			<div className="min-w-0 truncate px-0.5 text-[11px] leading-tight text-muted-foreground">
				{designSystemTagline(system, locale, t)}
			</div>
		</>
	);
});
