import { useCallback } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { BotAvatar } from "@shared/components/BotAvatar";
import { cn } from "@shared/lib/utils";
import { useThemeComponent } from "@vetta/theme-sdk";
import type { NewSessionHeroProps, NewSessionSceneItem } from "@vetta/theme-ui";
import { GuideBadgeSwiper } from "../GuideBadgeSwiper";
import { AgentModeIconToggle } from "./AgentModeIconToggle";
import { DefaultSceneCarousel } from "./SceneCarousel";
import { easeOut } from "./constants";
import type { SceneActionState, SceneItem, SkillSelection } from "./types";

interface NewSessionHeroHostProps {
	avatarAutoplay: boolean;
	greetingTitle: string;
	mounted: boolean;
	onSceneClick: (scene: SceneItem) => void;
	sceneActions: Record<string, SceneActionState>;
	scenes: SceneItem[];
	selectedSkill: SkillSelection;
	subtitle: string;
}

/** Host 入口：解析主题 override，补齐 i18n labels 后交给 public props contract。 */
export function NewSessionHero({
	avatarAutoplay,
	greetingTitle,
	mounted,
	onSceneClick,
	sceneActions,
	scenes,
	selectedSkill,
	subtitle,
}: NewSessionHeroHostProps): JSX.Element {
	const { t } = useTranslation("chat");
	const ThemedHero = useThemeComponent("chat.newSessionHero", DefaultNewSessionHero);
	const handleSceneClick = useCallback(
		(scene: NewSessionSceneItem) => {
			const matched = scenes.find((item) => item.name === scene.name);
			if (matched) {
				onSceneClick(matched);
			}
		},
		[onSceneClick, scenes],
	);

	return (
		<ThemedHero
			avatarAutoplay={avatarAutoplay}
			greetingTitle={greetingTitle}
			mounted={mounted}
			onSceneClick={handleSceneClick}
			sceneActions={sceneActions}
			sceneLabels={{
				installPrompt: t("newSession.sceneInstallPrompt"),
				next: t("newSession.sceneCarouselNext"),
				previous: t("newSession.sceneCarouselPrev"),
			}}
			scenes={scenes}
			selected={selectedSkill}
			subtitle={subtitle}
		/>
	);
}

export function DefaultNewSessionHero({
	avatarAutoplay,
	className,
	greetingTitle,
	mounted,
	onSceneClick,
	sceneActions,
	sceneLabels,
	scenes,
	selected,
	subtitle,
	...props
}: NewSessionHeroProps): JSX.Element {
	// 继续走 carousel override，避免只覆盖 scene carousel 时被 hero 默认实现绕过。
	const ThemedSceneCarousel = useThemeComponent("chat.newSessionSceneCarousel", DefaultSceneCarousel);

	return (
		<div className={cn("mb-3 flex w-full max-w-2xl flex-col items-start", className)} {...props}>
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 12 }}
				transition={{ duration: 0.5, ease: easeOut }}
				className="flex w-full flex-col items-start"
			>
				{/* 欢迎语上方的引导 badge 轮播 */}
				<GuideBadgeSwiper mounted={mounted} />

				{/* 标题行：问候语 + 工作模式切换，右侧 BotAvatar */}
				<div className="flex w-full items-center justify-between gap-4">
					<div className="flex min-w-0 flex-col">
						<div className="flex min-w-0 items-center gap-2.5">
							<motion.h1
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
								className="min-w-0 truncate bg-gradient-to-br from-primary via-primary to-primary/30 bg-clip-text text-[24px] font-semibold tracking-[-0.02em] text-transparent"
							>
								{greetingTitle}
							</motion.h1>
							<AgentModeIconToggle />
						</div>
						<motion.p
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.5, delay: 0.2 }}
							className="mt-1 text-[12px] text-muted-foreground/70"
						>
							{subtitle}
						</motion.p>
					</div>
					<BotAvatar size="lg" autoplay={avatarAutoplay} />
				</div>
				{scenes.length > 0 && (
					<ThemedSceneCarousel
						actions={sceneActions}
						labels={sceneLabels}
						onSceneClick={onSceneClick}
						scenes={scenes}
						selected={selected}
					/>
				)}
			</motion.div>
		</div>
	);
}
