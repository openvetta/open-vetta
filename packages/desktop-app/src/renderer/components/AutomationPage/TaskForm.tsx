import { useState } from "react";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import { SchedulePicker } from "./CronPicker";
import type { ScheduledTask } from "../../store/atoms";

interface TaskFormProps {
	task?: ScheduledTask;
	embedded?: boolean;
	onClose?: () => void;
}

export function TaskForm({ task, embedded = false, onClose }: TaskFormProps): JSX.Element {
	const { createTask, updateTask } = useScheduledTasks();
	const [name, setName] = useState(task?.name ?? "");
	const [prompt, setPrompt] = useState(task?.prompt ?? "");
	const [cron, setCron] = useState(task?.cron ?? "0 9 * * *");
	const [isOnce, setIsOnce] = useState(task?.isOnce ?? false);
	const [enabled, setEnabled] = useState(task?.enabled ?? true);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !prompt.trim()) return;

		const taskData = { name, prompt, cron, isOnce, enabled };

		if (task) {
			await updateTask(task.id, taskData);
		} else {
			await createTask(taskData);
		}

		onClose?.();
		setName("");
		setPrompt("");
		setCron("0 9 * * *");
		setIsOnce(false);
		setEnabled(true);
	};

	const handleCancel = () => {
		onClose?.();
	};

	const formContent = (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<div>
				<label className="mb-1.5 block text-sm text-[var(--text-2)]">
					任务名称
				</label>
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--accent)] focus:outline-none"
					placeholder="例如：每日站会提醒"
					required
				/>
			</div>
			<div>
				<label className="mb-1.5 block text-sm text-[var(--text-2)]">
					执行时间
				</label>
				<SchedulePicker
					value={cron}
					isOnce={isOnce}
					onChange={setCron}
					onIsOnceChange={setIsOnce}
				/>
			</div>
			<div>
				<label className="mb-1.5 block text-sm text-[var(--text-2)]">
					Prompt
				</label>
				<textarea
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--accent)] focus:outline-none"
					placeholder="请输入要定期执行的提示词..."
					rows={4}
					required
				/>
			</div>
			<div className="flex items-center gap-2">
				<input
					type="checkbox"
					id="task-enabled"
					checked={enabled}
					onChange={(e) => setEnabled(e.target.checked)}
					className="h-4 w-4 rounded border-[var(--border)]"
				/>
				<label htmlFor="task-enabled" className="text-sm text-[var(--text-2)]">
					启用任务
				</label>
			</div>
			<div className="flex justify-end gap-2 pt-2">
				<button
					type="button"
					onClick={handleCancel}
					className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--hover)]"
				>
					取消
				</button>
				<button
					type="submit"
					className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
				>
					保存
				</button>
			</div>
		</form>
	);

	const title = task ? "编辑定时任务" : "新建定时任务";

	return (
		<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="font-semibold text-[var(--text-1)]">{title}</h3>
				<button
					onClick={handleCancel}
					className="rounded p-1 hover:bg-[var(--hover)]"
				>
					<span className="icon-[mdi--close] text-lg" />
				</button>
			</div>
			{formContent}
		</div>
	);
}
