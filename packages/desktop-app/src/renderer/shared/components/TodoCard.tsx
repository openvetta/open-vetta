import type { TodoItem } from "@shared/store/todo-atoms";
import { motion } from "motion/react";

interface TodoCardProps {
	items: readonly TodoItem[];
	/** Compact mode for inline display in message list */
	compact?: boolean;
}

export function TodoCard({ items, compact = false }: TodoCardProps): JSX.Element | null {
	if (items.length === 0) return null;

	const doneCount = items.filter((i) => i.status === "done").length;
	const total = items.length;
	const allDone = doneCount === total;

	if (compact) {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
				className="rounded-xl border border-border bg-muted/30 p-3"
			>
				<ProgressHeader doneCount={doneCount} total={total} allDone={allDone} />
				<ProgressBar doneCount={doneCount} total={total} height="h-1" animated />
				<ul className="mt-2 flex flex-col gap-1">
					{items.map((item) => (
						<TodoItemRow key={item.id} item={item} size="sm" />
					))}
				</ul>
			</motion.div>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-y-auto">
			<div className="border-b border-border px-4 py-3">
				<ProgressHeader doneCount={doneCount} total={total} allDone={allDone} />
				<ProgressBar doneCount={doneCount} total={total} height="h-1.5" />
			</div>
			<ul className="flex flex-col gap-0.5 p-2">
				{items.map((item) => (
					<TodoItemRow key={item.id} item={item} size="md" />
				))}
			</ul>
		</div>
	);
}

function ProgressHeader({
	doneCount,
	total,
	allDone,
}: { doneCount: number; total: number; allDone: boolean }): JSX.Element {
	return (
		<div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
			<span>{allDone ? "All done" : "Todo"}</span>
			<span>
				{doneCount}/{total}
			</span>
		</div>
	);
}

function ProgressBar({
	doneCount,
	total,
	height,
	animated,
}: { doneCount: number; total: number; height: string; animated?: boolean }): JSX.Element {
	const pct = total > 0 ? (doneCount / total) * 100 : 0;
	return (
		<div className={`${height} overflow-hidden rounded-full bg-muted/50`}>
			{animated ? (
				<motion.div
					className={`${height} rounded-full bg-primary`}
					initial={{ width: 0 }}
					animate={{ width: `${pct}%` }}
					transition={{ duration: 0.4, ease: "easeOut" }}
				/>
			) : (
				<div
					className={`${height} rounded-full bg-primary transition-all duration-500 ease-out`}
					style={{ width: `${pct}%` }}
				/>
			)}
		</div>
	);
}

function TodoItemRow({ item, size }: { item: TodoItem; size: "sm" | "md" }): JSX.Element {
	const isDone = item.status === "done";
	const isInProgress = item.status === "in_progress";
	const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
	const textSize = size === "sm" ? "text-xs leading-normal" : "text-sm leading-relaxed";
	const padding = size === "sm" ? "px-2 py-1" : "px-3 py-2";

	return (
		<motion.li layout className={`flex items-start gap-2 rounded-lg ${padding} transition-colors hover:bg-muted/30`}>
			<div className="mt-0.5 shrink-0">
				{isDone ? (
					<motion.div
						initial={{ scale: 0 }}
						animate={{ scale: 1 }}
						transition={{ type: "spring", stiffness: 500, damping: 25 }}
						className={`flex ${iconSize} items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400`}
					>
						<span className="icon-[mdi--check] text-[10px]" />
					</motion.div>
				) : isInProgress ? (
					<div
						className={`flex ${iconSize} items-center justify-center rounded-full border border-blue-400/50 text-blue-400`}
					>
						<span className="icon-[mdi--loading] animate-spin text-[10px]" />
					</div>
				) : (
					<div className={`${iconSize} rounded-full border border-muted-foreground/30`} />
				)}
			</div>
			<span
				className={`${textSize} transition-all duration-300 ${
					isDone ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"
				}`}
			>
				{item.content}
			</span>
		</motion.li>
	);
}
