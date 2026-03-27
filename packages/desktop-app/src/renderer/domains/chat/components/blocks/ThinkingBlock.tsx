import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

interface ThinkingBlockProps {
	text: string;
}

export function ThinkingBlockView({ text }: ThinkingBlockProps): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const lines = text.split("\n");

	return (
		<div className="group">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="inline-flex items-center gap-2 rounded-lg pr-2 py-1 text-left transition-colors hover:bg-muted/60"
			>
				<span className="icon-[mdi--lightbulb-outline] h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
				<span className="text-[12px] text-muted-foreground/50">
					思考过程
				</span>
				<span className="text-[11px] text-muted-foreground/30">
					{lines.length} 行
				</span>
				<span
					className={`icon-[mdi--chevron-right] h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
				/>
			</button>
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
						className="overflow-hidden"
					>
						<div className="ml-2 border-l-2 border-muted-foreground/10 pl-4 pt-1 pb-2">
							<div className="whitespace-pre-wrap break-words text-[12px] leading-[1.6] text-muted-foreground/60">
								{text}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
