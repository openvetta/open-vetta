import { type TodoItem, getTodoItemsForCwd, todoItemsByCwdAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

interface TodoTabPanelProps {
	cwd: string;
}

export function TodoTabPanel({ cwd }: TodoTabPanelProps): JSX.Element {
	const todoMap = useAtomValue(todoItemsByCwdAtom);
	const items = useMemo(() => getTodoItemsForCwd(todoMap, cwd), [todoMap, cwd]);

	const doneCount = items.filter((i) => i.status === "done").length;
	const total = items.length;

	if (total === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
				暂无待办事项
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-y-auto">
			{/* Progress bar */}
			<div className="border-b border-border px-4 py-3">
				<div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
					<span>进度</span>
					<span>
						{doneCount}/{total}
					</span>
				</div>
				<div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
					<div
						className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
						style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
					/>
				</div>
			</div>

			{/* Todo items */}
			<ul className="flex flex-col gap-0.5 p-2">
				{items.map((item) => (
					<TodoItemRow key={item.id} item={item} />
				))}
			</ul>
		</div>
	);
}

function TodoItemRow({ item }: { item: TodoItem }): JSX.Element {
	const isDone = item.status === "done";
	const isInProgress = item.status === "in_progress";

	return (
		<li className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-muted/30">
			{/* Checkbox */}
			<div className="mt-0.5 shrink-0">
				{isDone ? (
					<div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 animate-in zoom-in-50 duration-300">
						<span className="icon-[mdi--check] text-xs" />
					</div>
				) : isInProgress ? (
					<div className="flex h-4 w-4 items-center justify-center rounded-full border border-blue-400/50 text-blue-400">
						<span className="icon-[mdi--loading] animate-spin text-xs" />
					</div>
				) : (
					<div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
				)}
			</div>

			{/* Content */}
			<span
				className={`text-sm leading-relaxed transition-all duration-300 ${
					isDone ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"
				}`}
			>
				{item.content}
			</span>
		</li>
	);
}
