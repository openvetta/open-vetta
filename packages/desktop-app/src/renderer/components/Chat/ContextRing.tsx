import { useState } from "react";
import { useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { contextUsageAtom } from "../../store/atoms";

const SIZE = 16;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

export function ContextRing(): JSX.Element | null {
	const ctx = useAtomValue(contextUsageAtom);
	const [hovered, setHovered] = useState(false);

	if (!ctx || !ctx.contextWindow) return null;

	const percent = ctx.percent ?? 0;
	const clamped = Math.min(100, Math.max(0, percent));
	const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

	// Bright colors for the progress arc
	const color =
		percent > 90
			? "#ef4444"
			: percent > 70
				? "#f59e0b"
				: "#22d3ee";

	const tooltip =
		ctx.percent !== null
			? `上下文已使用 ${percent.toFixed(1)}%（${formatTokens(ctx.contextWindow)} 窗口）`
			: `上下文窗口 ${formatTokens(ctx.contextWindow)}（使用量未知）`;

	return (
		<div
			className="relative flex items-center cursor-default"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<svg width={SIZE} height={SIZE} className="rotate-[-90deg]">
				<circle
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={RADIUS}
					fill="none"
					stroke="var(--surface-raised, #333)"
					strokeWidth={STROKE}
					opacity={0.5}
				/>
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
			</svg>
			<AnimatePresence>
				{hovered && (
					<motion.div
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 4 }}
						transition={{ duration: 0.15 }}
						className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] text-[var(--text-1)] pointer-events-none"
						style={{
							background: "var(--surface-raised, #2a2a2a)",
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
