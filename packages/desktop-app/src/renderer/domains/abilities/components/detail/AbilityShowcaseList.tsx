import type { AbilityShowcase } from "@shared/lib/api";
import { isRenderableImageIcon } from "../../lib/ability-presentation";
import { ShowcaseChatOverCanvas, ShowcaseChatThread } from "./templates/ShowcaseChatOverCanvas";

/**
 * `raw.detail.showcases`：结构化头图，由宿主呈现模板渲染（CSS 构图，非真实截图）。
 * 未知 template 直接跳过，保证服务端先行扩展不会炸客户端。
 */
export function AbilityShowcaseList({
	showcases,
	fallbackBrandIconUrl,
	fallbackBrandName,
}: {
	showcases: AbilityShowcase[];
	fallbackBrandIconUrl?: string;
	fallbackBrandName?: string;
}): JSX.Element | null {
	if (showcases.length === 0) return null;

	const brandIcon = (showcase: AbilityShowcase): string | undefined => {
		if (showcase.brand_icon_url) return showcase.brand_icon_url;
		return isRenderableImageIcon(fallbackBrandIconUrl) ? fallbackBrandIconUrl : undefined;
	};

	return (
		<div className="flex flex-col gap-4">
			{showcases.map((showcase, index) => {
				const key = `${showcase.template}-${index}`;
				if (showcase.template === "chat-over-canvas") {
					return (
						<ShowcaseChatOverCanvas
							key={key}
							userPrompt={showcase.user_prompt}
							assistantReply={showcase.assistant_reply}
							canvas={showcase.canvas ?? "generic"}
							brandIconUrl={brandIcon(showcase)}
							brandName={showcase.brand_name ?? fallbackBrandName}
						/>
					);
				}
				if (showcase.template === "chat-thread") {
					return (
						<ShowcaseChatThread
							key={key}
							userPrompt={showcase.user_prompt}
							assistantReply={showcase.assistant_reply}
							brandIconUrl={brandIcon(showcase)}
							brandName={showcase.brand_name ?? fallbackBrandName}
						/>
					);
				}
				return null;
			})}
		</div>
	);
}
