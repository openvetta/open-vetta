import { useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { activeSessionAtom, promptSuggestionsAtom } from "@shared/store/atoms";

interface SuggestionBubblesProps {
	/** 点击建议直发：以建议文本作为独立 prompt 立即发送。 */
	onSend: (overrideText?: string) => Promise<void>;
}

const BUBBLE_INITIAL = { opacity: 0, y: 6 };
const BUBBLE_ANIMATE = { opacity: 1, y: 0 };
const BUBBLE_EXIT = { opacity: 0, y: 4 };
const SOFT = { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] as const };

/**
 * 输入预测建议气泡：渲染在 MessageList 下方、InputBar 上方，垂直排列 0-3 个。
 * 点击即把该建议作为独立 prompt 直发。建议为空时整块不渲染。
 */
export function SuggestionBubbles({ onSend }: SuggestionBubblesProps): JSX.Element | null {
	const activeSession = useAtomValue(activeSessionAtom);
	const suggestionsMap = useAtomValue(promptSuggestionsAtom);
	const suggestions = activeSession?.runtimeId ? suggestionsMap[activeSession.runtimeId] : undefined;

	return (
		<div className="mx-auto w-full max-w-3xl px-5">
			<div className="w-full">
				<AnimatePresence initial={false}>
					{suggestions && suggestions.length > 0 && (
						<motion.div
							key="suggestion-bubbles"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={SOFT}
							className="flex flex-col items-start gap-1.5 overflow-hidden pt-1 pb-2"
						>
							{suggestions.map((s, i) => (
								<motion.button
									key={`${i}-${s}`}
									type="button"
									initial={BUBBLE_INITIAL}
									animate={BUBBLE_ANIMATE}
									exit={BUBBLE_EXIT}
									transition={{ ...SOFT, delay: i * 0.03 }}
									onClick={() => void onSend(s)}
									title="点击发送此建议"
									className="group flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent/60 hover:text-foreground"
								>
									<span className="icon-[solar--magic-stick-3-linear] h-3.5 w-3.5 shrink-0 text-primary/70" />
									<span className="truncate">{s}</span>
								</motion.button>
							))}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
