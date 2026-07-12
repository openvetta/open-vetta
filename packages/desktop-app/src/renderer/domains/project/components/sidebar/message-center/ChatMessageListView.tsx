import type { Button } from "@shared/components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import { motion } from "motion/react";
import { MessageCenterEmptyState } from "./MessageCenterEmptyState";
import { MESSAGE_CENTER_SPRING } from "./types";
import type { ChatMessageListModel } from "./useChatMessageListModel";

export function ChatMessageListView(model: ChatMessageListModel): JSX.Element {
	if (model.items.length === 0) {
		return <MessageCenterEmptyState text={model.emptyText} icon={model.emptyIcon} />;
	}

	return (
		<div className="flex flex-col gap-1.5 p-3">
			{model.items.map((item) => (
				<motion.button
					key={item.flowingId}
					layout
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={MESSAGE_CENTER_SPRING}
					type="button"
					onClick={() => model.onSelect(item.flowingId)}
					className="group rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
				>
					<div className="flex items-start gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
							<span className="icon-[solar--chat-round-line-linear] h-4 w-4 text-primary" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-2">
								<p className="truncate text-[12px] font-semibold text-foreground">{item.title}</p>
								<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
									{item.unreadCount}
								</span>
							</div>
							<p className="mt-1 truncate text-[11px] text-muted-foreground">{item.preview}</p>
							{item.relativeTime && (
								<p className="mt-1 text-[10px] text-muted-foreground/50">{item.relativeTime}</p>
							)}
						</div>
					</div>
				</motion.button>
			))}
		</div>
	);
}
