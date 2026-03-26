import type { BatchTask } from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";

interface BatchTaskDetailProps {
	task: BatchTask;
}

function statusLabel(status: BatchTask["status"]): string {
	const labels: Record<BatchTask["status"], string> = {
		pending: "等待中",
		running: "运行中",
		paused: "已暂停",
		completed: "已完成",
		failed: "失败",
	};
	return labels[status];
}

export function BatchTaskDetail({ task }: BatchTaskDetailProps): JSX.Element {
	const hasSession = task.status === "running" && task.sessionPath;

	return (
		<div className="rounded-xl border border-border p-4">
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="relative flex h-2 w-2 shrink-0">
						<span
							className={`absolute inline-flex h-full w-full rounded-full ${
								task.status === "running" ? "animate-ping bg-green-400 opacity-50" : ""
							}`}
						/>
						<span
							className={`relative inline-flex h-2 w-2 rounded-full ${
								task.status === "completed"
									? "bg-green-500"
									: task.status === "running"
										? "bg-green-500"
										: task.status === "failed"
											? "bg-red-500"
											: task.status === "paused"
												? "bg-yellow-500"
												: "bg-muted-foreground/50"
							}`}
						/>
					</div>
					<span className="font-medium text-foreground">{task.name}</span>
					<span className="text-sm text-muted-foreground/50">
						{statusLabel(task.status)}
					</span>
				</div>
				<div className="flex items-center gap-1">
					{task.status === "running" ? (
						<Button variant="outline" size="sm">
							<span className="icon-[mdi--pause] mr-1.5 text-[14px]" />
							暂停
						</Button>
					) : task.status === "paused" ? (
						<Button variant="outline" size="sm">
							<span className="icon-[mdi--play] mr-1.5 text-[14px]" />
							继续
						</Button>
					) : (
						<Button variant="outline" size="sm">
							<span className="icon-[mdi--play] mr-1.5 text-[14px]" />
							执行
						</Button>
					)}
				</div>
			</div>

			<div className="mb-4 space-y-2">
				<div>
					<p className="text-xs font-medium text-muted-foreground/50">文件夹</p>
					<p className="truncate text-sm text-foreground">{task.cwd}</p>
				</div>
			</div>

			{hasSession ? (
				<div className="rounded-lg border border-border bg-muted/30 p-3">
					<div className="mb-2 flex items-center gap-2">
						<span className="icon-[mdi--chat-outline] text-sm text-muted-foreground" />
						<span className="text-xs font-medium text-muted-foreground">会话</span>
					</div>
					<div className="max-h-60 overflow-y-auto rounded-md bg-background p-2">
						<p className="text-xs text-muted-foreground/50">TODO: 会话内容</p>
					</div>
				</div>
			) : (
				<div className="rounded-lg border border-border bg-muted/30 p-3">
					<p className="text-xs text-muted-foreground/50">
						{task.status === "running"
							? "正在等待会话创建..."
							: "任务执行后将显示会话内容"}
					</p>
				</div>
			)}

			{task.error && (
				<div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
					<div className="mb-1 flex items-center gap-2">
						<span className="icon-[mdi--alert-circle-outline] text-sm text-red-400" />
						<span className="text-xs font-medium text-red-400">错误</span>
					</div>
					<p className="text-xs text-red-400/80">{task.error}</p>
				</div>
			)}
		</div>
	);
}
