import type { BatchProject, BatchTask } from "@shared/store/atoms";

interface BatchProjectGroupProps {
	project: BatchProject;
	tasks: BatchTask[];
	isExpanded: boolean;
	activeSessionPath?: string;
	onToggle: (projectId: string) => void;
	onSelectSession: (cwd: string, sessionPath: string) => void;
}

function relativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小时`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days} 天`;
	return `${Math.floor(days / 7)} 周`;
}

function BatchProjectBadge(): JSX.Element {
	return (
		<span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
			批量
		</span>
	);
}

function BatchTaskRow({
	task,
	isActive,
	onSelect,
}: {
	task: BatchTask;
	isActive: boolean;
	onSelect: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100 ${
				isActive ? "bg-accent dark:bg-accent/70" : "hover:bg-accent/50"
			}`}
		>
			<span className="icon-[mdi--chat-outline] h-3 w-3 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
				{task.name || task.id}
			</span>
			<span className="shrink-0 text-[11px] text-muted-foreground">
				{relativeTime(task.updatedAt)}
			</span>
		</button>
	);
}

export function BatchProjectGroup({
	project,
	tasks,
	isExpanded,
	activeSessionPath,
	onToggle,
	onSelectSession,
}: BatchProjectGroupProps): JSX.Element {
	const tasksWithSession = tasks.filter((t) => t.sessionPath);

	return (
		<div className="mb-1">
			<button
				type="button"
				onClick={() => onToggle(project.id)}
				className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left hover:bg-accent/50"
			>
				<BatchProjectBadge />

				<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-foreground" />
				<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
					{project.name}
				</span>

				<span className="shrink-0 text-[11px] text-muted-foreground">
					{tasksWithSession.length}
				</span>
			</button>

			{isExpanded && (
				<div className="mt-px space-y-px">
					{tasksWithSession.map((task) => (
						<BatchTaskRow
							key={task.id}
							task={task}
							isActive={activeSessionPath === task.sessionPath}
							onSelect={() => task.sessionPath && onSelectSession(task.cwd, task.sessionPath)}
						/>
					))}
				</div>
			)}
		</div>
	);
}
