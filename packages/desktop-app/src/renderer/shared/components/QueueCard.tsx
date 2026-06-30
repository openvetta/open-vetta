import {
	getQueueForSession,
	messageQueueBySessionAtom,
	type QueuedMessage,
	removeQueuedMessageAtom,
	setQueueForSessionAtom,
} from "@shared/store/message-queue-atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { Reorder, useDragControls } from "motion/react";
import { useTranslation } from "react-i18next";

interface QueueCardProps {
	runtimeId: string;
	onSendNow: (id: string) => void;
}

export function QueueCard({ runtimeId, onSendNow }: QueueCardProps): JSX.Element {
	const { t } = useTranslation("chat");
	const queueMap = useAtomValue(messageQueueBySessionAtom);
	const setQueue = useSetAtom(setQueueForSessionAtom);
	const items = getQueueForSession(queueMap, runtimeId);

	if (items.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center px-4 py-6 text-xs text-muted-foreground">
				{t("inputBar.drawer.queueEmpty")}
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-y-auto">
			<Reorder.Group
				axis="y"
				values={items}
				onReorder={(next) => setQueue({ runtimeId, items: next })}
				className="flex flex-col p-1.5"
			>
				{items.map((item) => (
					<QueueItemRow key={item.id} item={item} runtimeId={runtimeId} onSendNow={onSendNow} />
				))}
			</Reorder.Group>
		</div>
	);
}

function QueueItemRow({
	item,
	runtimeId,
	onSendNow,
}: { item: QueuedMessage; runtimeId: string; onSendNow: (id: string) => void }): JSX.Element {
	const { t } = useTranslation("chat");
	const removeQueued = useSetAtom(removeQueuedMessageAtom);
	const dragControls = useDragControls();

	return (
		<Reorder.Item
			value={item}
			dragListener={false}
			dragControls={dragControls}
			initial={{ opacity: 0, height: 0 }}
			animate={{ opacity: 1, height: "auto" }}
			exit={{ opacity: 0, height: 0 }}
			transition={{ duration: 0.15 }}
			className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/30"
		>
			<button
				type="button"
				onPointerDown={(e) => dragControls.start(e)}
				className="flex shrink-0 cursor-grab touch-none items-center text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing"
			>
				<span className="icon-[solar--hamburger-menu-linear] text-sm" />
			</button>
			<button
				type="button"
				onClick={() => onSendNow(item.id)}
				title={t("inputBar.drawer.queueSendNow")}
				className="min-w-0 flex-1 truncate text-left text-[12px] leading-snug text-foreground"
			>
				{item.displayText}
			</button>
			<button
				type="button"
				onClick={() => removeQueued({ runtimeId, id: item.id })}
				title={t("inputBar.drawer.queueDelete")}
				aria-label={t("inputBar.drawer.queueDelete")}
				className="flex shrink-0 items-center text-muted-foreground/50 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
			>
				<span className="icon-[solar--trash-bin-trash-linear] text-sm" />
			</button>
		</Reorder.Item>
	);
}
