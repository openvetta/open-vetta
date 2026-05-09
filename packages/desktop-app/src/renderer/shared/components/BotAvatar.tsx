import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type AvatarMood = "idle" | "left" | "right" | "think" | "blink" | "bounce" | "sleep";

const ACTIVE_MOODS: AvatarMood[] = ["left", "right", "think", "blink", "bounce", "sleep"];

const HOLD_MS: Record<Exclude<AvatarMood, "idle">, number> = {
	left: 700,
	right: 700,
	think: 900,
	blink: 320,
	bounce: 760,
	sleep: 1500,
};

interface SizeConfig {
	wrapper: string;
	body: string;
	eye: string;
	gap: string;
	shadow: string;
	bubble: string;
	glowInset: string;
	glowBlur: string;
	factor: number;
}

const SIZES: Record<"sm" | "md" | "lg", SizeConfig> = {
	sm: {
		wrapper: "h-5 w-5",
		body: "h-5 w-5 rounded-md",
		eye: "h-[3px] w-[3px]",
		gap: "gap-[3px]",
		shadow: "shadow-[0_2px_6px_-2px_var(--primary)]",
		bubble: "h-1.5 w-1.5 -right-1 -top-1",
		glowInset: "-inset-1",
		glowBlur: "blur-[6px]",
		factor: 1,
	},
	md: {
		wrapper: "h-10 w-10",
		body: "h-10 w-10 rounded-[12px]",
		eye: "h-1.5 w-1.5",
		gap: "gap-1.5",
		shadow: "shadow-[0_6px_18px_-6px_var(--primary)]",
		bubble: "h-2 w-2 -right-1 -top-1",
		glowInset: "-inset-2",
		glowBlur: "blur-[12px]",
		factor: 2,
	},
	lg: {
		wrapper: "h-16 w-16",
		body: "h-16 w-16 rounded-[20px]",
		eye: "h-2.5 w-2.5",
		gap: "gap-2.5",
		shadow: "shadow-[0_12px_32px_-8px_var(--primary)]",
		bubble: "h-3 w-3 -right-1.5 -top-1.5",
		glowInset: "-inset-3",
		glowBlur: "blur-[18px]",
		factor: 3,
	},
};

interface BotAvatarProps {
	/** When true, plays an idle "streaming" glow halo and triggers random gestures. */
	active?: boolean;
	/** When true, randomly cycles gestures regardless of `active`. Useful on Welcome. */
	autoplay?: boolean;
	size?: "sm" | "md" | "lg";
	className?: string;
	/** Optional click override; default: trigger a random gesture. */
	onClick?: () => void;
	title?: string;
}

export const BotAvatar = memo(function BotAvatar({
	active = false,
	autoplay = false,
	size = "sm",
	className = "",
	onClick,
	title = "戳一下",
}: BotAvatarProps): JSX.Element {
	const cfg = SIZES[size];
	const [mood, setMood] = useState<AvatarMood>("idle");
	const [, forceTick] = useState(0);
	const lastPlayedRef = useRef<AvatarMood>("idle");

	const shouldSchedule = active || autoplay;

	const pickRandomMood = useCallback((): AvatarMood => {
		const choices = ACTIVE_MOODS.filter((m) => m !== lastPlayedRef.current);
		return choices[Math.floor(Math.random() * choices.length)] ?? "blink";
	}, []);

	const triggerMood = useCallback((m: AvatarMood) => {
		lastPlayedRef.current = m;
		setMood(m);
		forceTick((t) => t + 1);
	}, []);

	useEffect(() => {
		if (mood === "idle") return;
		const id = setTimeout(() => setMood("idle"), HOLD_MS[mood]);
		return () => clearTimeout(id);
	}, [mood]);

	useEffect(() => {
		if (!shouldSchedule || mood !== "idle") return;
		const id = setTimeout(
			() => triggerMood(pickRandomMood()),
			280 + Math.random() * 420,
		);
		return () => clearTimeout(id);
	}, [shouldSchedule, mood, triggerMood, pickRandomMood]);

	useEffect(() => {
		if (!shouldSchedule) setMood("idle");
	}, [shouldSchedule]);

	const handleClick = useCallback(() => {
		if (onClick) {
			onClick();
			return;
		}
		triggerMood(pickRandomMood());
	}, [onClick, triggerMood, pickRandomMood]);

	const f = cfg.factor;
	const headAnim = (() => {
		switch (mood) {
			case "left":
				return { rotate: -10, scale: 1, y: 0, scaleX: 1, scaleY: 1 };
			case "right":
				return { rotate: 10, scale: 1, y: 0, scaleX: 1, scaleY: 1 };
			case "think":
				return {
					rotate: [0, 5, -5, 0],
					y: [0, -1.5 * f, 0, -1 * f, 0],
					scaleX: 1,
					scaleY: 1,
				};
			case "blink":
				return { rotate: 0, scale: [1, 0.96, 1], y: 0 };
			case "bounce":
				return {
					rotate: 0,
					y: [0, -8 * f, 0, -2 * f, 0],
					scaleX: [1, 0.92, 1.28, 0.96, 1],
					scaleY: [1, 1.18, 0.72, 1.08, 1],
				};
			case "sleep":
				return {
					rotate: -6,
					y: [0, -0.5 * f, 0, -0.5 * f, 0],
					scaleX: 1,
					scaleY: 1,
				};
			default:
				return { rotate: 0, scale: 1, y: 0, scaleX: 1, scaleY: 1 };
		}
	})();

	const eyesShift = mood === "left" ? -1.4 * f : mood === "right" ? 1.4 * f : 0;
	const eyesScaleY =
		mood === "blink"
			? [1, 0.1, 1]
			: mood === "sleep"
				? [1, 0.1, 0.1, 0.1, 1]
				: 1;
	const showThoughtBubble = mood === "think";
	const showSleepZ = mood === "sleep";

	return (
		<button
			type="button"
			onClick={handleClick}
			title={title}
			className={`no-drag relative flex shrink-0 items-center justify-center focus:outline-none ${cfg.wrapper} ${className}`}
		>
			{active && (
				<motion.span
					aria-hidden
					className={`absolute ${cfg.glowInset} rounded-[20px] bg-primary/30 ${cfg.glowBlur}`}
					animate={{ opacity: [0.35, 0.65, 0.35], scale: [0.95, 1.05, 0.95] }}
					transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
				/>
			)}
			<motion.div
				className={`relative flex items-center justify-center ${cfg.body} bg-gradient-to-br from-primary to-primary/85 text-primary-foreground ${cfg.shadow}`}
				animate={headAnim}
				transition={{
					type:
						mood === "think" || mood === "blink" || mood === "bounce" || mood === "sleep"
							? "tween"
							: "spring",
					stiffness: 280,
					damping: 16,
					duration:
						mood === "bounce"
							? 0.7
							: mood === "sleep"
								? 1.4
								: mood === "think"
									? 0.8
									: mood === "blink"
										? 0.32
										: undefined,
					ease: mood === "bounce" ? "easeOut" : "easeInOut",
					times: mood === "bounce" ? [0, 0.28, 0.55, 0.8, 1] : undefined,
				}}
				style={{ transformOrigin: mood === "bounce" ? "50% 100%" : "50% 50%" }}
			>
				<div className={`flex items-center ${cfg.gap}`}>
					<motion.span
						className={`block rounded-full bg-primary-foreground ${cfg.eye}`}
						animate={{ x: eyesShift, scaleY: eyesScaleY }}
						transition={{
							type: mood === "sleep" ? "tween" : "spring",
							stiffness: 380,
							damping: 22,
							duration:
								mood === "blink" ? 0.3 : mood === "sleep" ? 1.4 : undefined,
							ease: "easeInOut",
						}}
					/>
					<motion.span
						className={`block rounded-full bg-primary-foreground ${cfg.eye}`}
						animate={{ x: eyesShift, scaleY: eyesScaleY }}
						transition={{
							type: mood === "sleep" ? "tween" : "spring",
							stiffness: 380,
							damping: 22,
							duration:
								mood === "blink" ? 0.3 : mood === "sleep" ? 1.4 : undefined,
							ease: "easeInOut",
						}}
					/>
				</div>
			</motion.div>
			<AnimatePresence>
				{showThoughtBubble && (
					<motion.span
						aria-hidden
						className={`pointer-events-none absolute rounded-full bg-primary/70 ${cfg.bubble}`}
						initial={{ opacity: 0, scale: 0.4, y: 0 }}
						animate={{
							opacity: [0, 1, 0],
							scale: [0.4, 1, 0.7],
							y: [-1 * f, -5 * f, -8 * f],
						}}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.9, ease: "easeOut" }}
					/>
				)}
				{showSleepZ && (
					<motion.span
						key="sleep-z"
						aria-hidden
						className="pointer-events-none absolute select-none font-bold leading-none text-primary/75"
						style={{
							right: -2 * f,
							top: -2 * f,
							fontSize: size === "lg" ? 13 : size === "md" ? 10 : 7,
						}}
						initial={{ opacity: 0, scale: 0.4, y: 0 }}
						animate={{
							opacity: [0, 1, 1, 0],
							scale: [0.4, 1, 1.05, 0.8],
							y: [0, -3 * f, -7 * f, -11 * f],
							x: [0, 1 * f, -1 * f, 1 * f],
						}}
						exit={{ opacity: 0 }}
						transition={{
							duration: 1.4,
							ease: "easeOut",
							repeat: Infinity,
							repeatDelay: 0.1,
						}}
					>
						z
					</motion.span>
				)}
			</AnimatePresence>
		</button>
	);
});
