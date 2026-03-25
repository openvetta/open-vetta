import { useAtomValue, useSetAtom } from "jotai";
import { confirmDialogAtom, scheduledTasksAtom } from "../../store/atoms";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import type { ScheduledTask } from "../../store/atoms";
import { cn } from "../../lib/utils";

interface TaskListProps {
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onEditTask: (task: ScheduledTask) => void;
}

export function TaskList({ selectedTaskId, onSelectTask, onEditTask }: TaskListProps): JSX.Element {
  const tasks = useAtomValue(scheduledTasksAtom);
  const setConfirmDialog = useSetAtom(confirmDialogAtom);
  const { deleteTask, toggleTask, runNow } = useScheduledTasks();

  const formatLastRun = (timestamp: number | null): string => {
    if (!timestamp) return "从未执行";
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-[var(--text-3)]">
        <span className="icon-[mdi--clock-outline] mb-3 text-3xl" />
        <p className="text-sm">暂无定时任务</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className={`cursor-pointer rounded-lg border p-4 transition-all ${
            selectedTaskId === task.id
              ? "border-[var(--accent)] bg-[var(--hover)]"
              : "border-[var(--border)] hover:border-[var(--border-hover)]"
          }`}
          onClick={() => onSelectTask(task.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  task.enabled ? "bg-green-500" : "bg-gray-500"
                }`}
              />
              <span className="font-medium text-[var(--text-1)]">{task.name}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  runNow(task.id);
                }}
                className="rounded p-1.5 hover:bg-[var(--hover)]"
                title="立即执行"
              >
                <span className="icon-[mdi--play] text-sm text-[var(--text-2)]" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTask(task.id);
                }}
                className="rounded p-1.5 hover:bg-[var(--hover)]"
                title={task.enabled ? "暂停" : "启动"}
              >
                <span
                  className={cn(task.enabled ? "icon-[mdi--pause]" : "icon-[mdi--play]", "text-sm", task.enabled ? "text-yellow-500!" : "text-green-500!")}
                />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTask(task);
                }}
                className="rounded p-1.5 hover:bg-[var(--hover)]"
                title="编辑"
              >
                <span className="icon-[mdi--pencil] text-sm text-[var(--text-2)]" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDialog({
                    title: `确认删除任务「${task.name}」`,
                    message: "删除后无法撤回，请确认是否继续。",
                    confirmLabel: "删除",
                    cancelLabel: "取消",
                    variant: "danger",
                    onConfirm: () => deleteTask(task.id),
                  });
                }}
                className="rounded p-1.5 hover:bg-[var(--hover)]"
                title="删除"
              >
                <span className="icon-[mdi--delete] text-sm text-red-500" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-3)]">
            <span className="flex items-center gap-1">
              <span className="icon-[mdi--clock-outline]" />
              {task.cron}
            </span>
            <span>上次: {formatLastRun(task.lastRunAt)}</span>
            {task.lastRunStatus && (
              <span
                className={
                  task.lastRunStatus === "success" ? "text-green-500" : "text-red-500"
                }
              >
                {task.lastRunStatus === "success" ? "成功" : "失败"}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
