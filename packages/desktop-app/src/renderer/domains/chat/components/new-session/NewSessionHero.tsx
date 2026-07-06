import { motion } from "motion/react";
import { BotAvatar } from "@shared/components/BotAvatar";
import { GuideBadgeSwiper } from "../GuideBadgeSwiper";
import { easeOut } from "./constants";
import { SceneCarousel } from "./SceneCarousel";
import type { SceneActionState, SceneItem, SkillSelection } from "./types";

interface NewSessionHeroProps {
	avatarAutoplay: boolean;
	greetingTitle: string;
	mounted: boolean;
	onSceneClick: (scene: SceneItem) => void;
	sceneActions: Record<string, SceneActionState>;
	scenes: SceneItem[];
	selectedSkill: SkillSelection;
	subtitle: string;
}

export function NewSessionHero({
	avatarAutoplay,
	greetingTitle,
	mounted,
	onSceneClick,
	sceneActions,
	scenes,
	selectedSkill,
	subtitle,
}: NewSessionHeroProps): JSX.Element {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 12 }}
			transition={{ duration: 0.5, ease: easeOut }}
			className="mb-3 flex w-full max-w-2xl flex-col items-start"
		>
			{/* 欢迎语上方的引导 badge 轮播 */}
			<GuideBadgeSwiper mounted={mounted} />

			{/* 标题/副标题在左、BotAvatar 在最右，同一行左右对齐 */}
			<div className="flex w-full items-center justify-between gap-4">
				<div className="flex min-w-0 flex-col">
					<motion.h1
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.1, ease: easeOut }}
						className="bg-gradient-to-br from-primary via-primary to-primary/30 bg-clip-text text-[24px] font-semibold tracking-[-0.02em] text-transparent"
					>
						{greetingTitle}
					</motion.h1>
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
				<SceneCarousel
					scenes={scenes}
					selected={selectedSkill}
					actions={sceneActions}
					onSceneClick={onSceneClick}
				/>
			)}
		</motion.div>
	);
}
