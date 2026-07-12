import type { Button } from "@shared/components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import { memo } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Transition } from "motion/react";
import { useTranslation } from "react-i18next";
import { PluginTurnCardHost } from "../../../plugins/components/PluginTurnCardHost";
import { StreamingIndicator } from "./AssistantMessage";

const INDICATOR_INITIAL = { opacity: 0, y: 6 };
const INDICATOR_ANIMATE = { opacity: 1, y: 0 };
const INDICATOR_EXIT = { opacity: 0, y: 6 };
const INDICATOR_TRANSITION = {
	duration: 0.25,
	ease: [0.25, 0.1, 0.25, 1] as const,
} satisfies Transition;

function CompactionIndicator(): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<motion.div
			initial={INDICATOR_INITIAL}
			animate={INDICATOR_ANIMATE}
			exit={INDICATOR_EXIT}
			transition={INDICATOR_TRANSITION}
			className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
		>
			<svg
				width={14}
				height={14}
				style={{ animation: "context-ring-spin 1s linear infinite" }}
			>
				<circle
					cx={7}
					cy={7}
					r={5}
					fill="none"
					stroke="currentColor"
					strokeWidth={1}
					opacity={0.3}
					className="text-muted-foreground"
				/>
				<circle
					cx={7}
					cy={7}
					r={5}
					fill="none"
					stroke="currentColor"
					strokeWidth={1}
					strokeDasharray={`${Math.PI * 5 * 0.25} ${Math.PI * 5 * 0.75}`}
					strokeLinecap="round"
					className="text-amber-500"
				/>
			</svg>
			<span className="text-[12px] text-amber-500/80">
				{t("messageList.compactionIndicator")}
			</span>
		</motion.div>
	);
}

export const MessageListFooter = memo(function MessageListFooter({
	isCompacting,
	showWaiting,
}: {
	isCompacting: boolean;
	showWaiting: boolean;
}) {
	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 pt-1 pb-16">
			<AnimatePresence initial={false}>
				{isCompacting && <CompactionIndicator key="compacting" />}
			</AnimatePresence>
			{showWaiting && !isCompacting && (
				<div className="flex items-center">
					<StreamingIndicator />
				</div>
			)}
			<PluginTurnCardHost />
		</div>
	);
});
