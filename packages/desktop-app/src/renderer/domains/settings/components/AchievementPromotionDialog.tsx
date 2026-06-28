import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@shared/components/ui/dialog";
import type { Achievement } from "../achievements";
import { AchievementPromotionBadge3D } from "./AchievementPromotionBadge3D";
import { AchievementPromotionConfetti } from "./AchievementPromotionConfetti";

interface AchievementPromotionDialogProps {
	achievement: Achievement;
	onComplete: () => void;
}

export function AchievementPromotionDialog({
	achievement,
	onComplete,
}: AchievementPromotionDialogProps): JSX.Element {
	const { t } = useTranslation("settings");
	const [confettiTriggerToken, setConfettiTriggerToken] = useState(0);
	const [textVisible, setTextVisible] = useState(false);
	const textRef = useRef<HTMLDivElement>(null);
	const name = t(`achievement.stages.${achievement.id}.name`);
	const revealText = useCallback(() => {
		textRef.current?.animate(
			[
				{ opacity: 0, transform: "translateY(16px)" },
				{ opacity: 1, transform: "translateY(0)" },
			],
			{
				duration: 500,
				easing: "cubic-bezier(0.22, 1, 0.36, 1)",
			},
		);
		setTextVisible(true);
	}, []);
	const hideText = useCallback(() => {
		setTextVisible(false);
	}, []);
	const celebrate = useCallback(() => {
		setConfettiTriggerToken((token) => token + 1);
	}, []);

	return (
		<Dialog open onOpenChange={(open) => !open && onComplete()}>
			<DialogContent
				className="h-[min(680px,calc(100vh-2rem))] overflow-visible border-transparent bg-transparent p-0 sm:max-w-[760px]"
				overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
				showCloseButton={false}
				onEscapeKeyDown={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => event.preventDefault()}
			>
				<div
					ref={textRef}
					className={`pointer-events-none absolute inset-x-0 bottom-12 z-20 text-center transition-opacity ease-out ${
						textVisible ? "opacity-100" : "opacity-0"
					}`}
					style={{
						WebkitTextStroke: "2px var(--background)",
						paintOrder: "stroke fill",
						transitionDuration: textVisible ? "500ms" : "950ms",
					}}
				>
					<DialogTitle className="text-[20px] font-semibold text-primary">
						{t("achievement.promotion.title")}
					</DialogTitle>
					<DialogDescription className="mt-2 text-[15px] text-foreground">
						{t("achievement.promotion.stageName", { name })}
					</DialogDescription>
				</div>
				<div className="relative z-10 h-full w-full">
					<AchievementPromotionBadge3D
						imageUrl={achievement.imageUrl}
						onCelebrate={celebrate}
						onComplete={onComplete}
						onHideText={hideText}
						onRevealText={revealText}
					/>
				</div>
				<div className="pointer-events-none absolute inset-0 z-15">
					<AchievementPromotionConfetti triggerToken={confettiTriggerToken} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
