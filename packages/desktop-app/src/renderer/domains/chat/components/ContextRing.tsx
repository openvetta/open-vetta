import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { contextUsageAtom, isCompactingAtom } from "@shared/store/atoms";

const SIZE = 16;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Arc length for the spinning indicator (roughly 1/4 of the circle) */
const SPIN_ARC = CIRCUMFERENCE * 0.25;

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

export function ContextRing({ className }: { className?: string } = {}): JSX.Element | null {
	const { t } = useTranslation("chat");
	const ctx = useAtomValue(contextUsageAtom);
	const isCompacting = useAtomValue(isCompactingAtom);
	const [hovered, setHovered] = useState(false);

	if (!ctx || !ctx.contextWindow) return null;

	const percent = ctx.percent ?? 0;
	const clamped = Math.min(100, Math.max(0, percent));
	const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

	// Progress arc color: themed neutral, warm/red when high usage
	const color =
		percent > 90
			? "#ef4444"
			: percent > 70
				? "#f59e0b"
				: "var(--primary)";

	const tooltip = isCompacting
		? t("contextRing.tooltip.compacting")
		: ctx.percent !== null
			? t("contextRing.tooltip.usage", { percent: percent.toFixed(1), window: formatTokens(ctx.contextWindow) })
			: t("contextRing.tooltip.unknown", { window: formatTokens(ctx.contextWindow) });

	return (
		<div
			className={`relative flex items-center cursor-default${className ? ` ${className}` : ""}`}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<svg
				width={SIZE}
				height={SIZE}
				className={isCompacting ? "" : "rotate-[-90deg]"}
				style={isCompacting ? { animation: "context-ring-spin 1s linear infinite" } : undefined}
			>
				<circle
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={RADIUS}
					fill="none"
					stroke="var(--secondary, #333)"
					strokeWidth={STROKE}
					opacity={0.5}
				/>
				{isCompacting ? (
					<circle
						cx={SIZE / 2}
						cy={SIZE / 2}
						r={RADIUS}
						fill="none"
						stroke="#f59e0b"
						strokeWidth={STROKE}
						strokeDasharray={`${SPIN_ARC} ${CIRCUMFERENCE - SPIN_ARC}`}
						strokeLinecap="round"
					/>
				) : (
					<circle
						cx={SIZE / 2}
						cy={SIZE / 2}
						r={RADIUS}
						fill="none"
						stroke={color}
						strokeWidth={STROKE}
						strokeDasharray={CIRCUMFERENCE}
						strokeDashoffset={offset}
						strokeLinecap="round"
						style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease" }}
					/>
				)}
			</svg>
			<AnimatePresence>
				{hovered && (
					<motion.div
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 4 }}
						transition={{ duration: 0.15 }}
						className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] text-foreground pointer-events-none"
						style={{
							background: "var(--secondary, #2a2a2a)",
							boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
						}}
					>
						{tooltip}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
