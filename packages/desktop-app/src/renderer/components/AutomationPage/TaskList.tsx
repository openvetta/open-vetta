import { useAtomValue, useAtom } from "jotai";
import { scheduledTasksAtom, selectedTaskIdAtom } from "../../store/atoms";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import { TaskForm } from "./TaskForm";

interface TaskListProps {
  onSelectTask: (id: string | null) => void;
}

export function TaskList({ onSelectTask }: TaskListProps): JSX.Element {
  const tasks = useAtomValue(scheduledTasksAtom);
  const [selectedId] = useAtom(selectedTaskIdAtom);
  const { deleteTask, toggleTask, runNow } = useScheduledTasks();

  const formatLastRun = (timestamp: number | null): string => {
    if (!timestamp) return "从未执行";
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  };

  return (
    <div className="flex flex-col gap-2">
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[var(--text-3)]">
          <span className="icon-[mdi--clock-outline] mb-3 text-3xl" />
          <p className="text-sm">暂无定时任务</p>
          <p className="mt-1 text-xs">点击右上角「新建任务」创建</p>
        </div>
      ) : (
        tasks.map((task) => (
          <div
            key={task.id}
            className={`cursor-pointer rounded-lg border p-4 transition-all ${
              selectedId === task.id
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
                  <span className="icon-[mdi--play] text-sm" />
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
                    className={`icon-[mdi--${task.enabled ? "pause" : "play"}] text-sm`}
                  />
                </button>
                <TaskForm task={task} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTask(task.id);
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
        ))
      )}
    </div>
  );
}
