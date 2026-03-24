import { useState } from "react";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import { CronPicker } from "./CronPicker";
import type { ScheduledTask } from "../../store/atoms";

interface TaskFormProps {
  task?: ScheduledTask;
}

export function TaskForm({ task }: TaskFormProps): JSX.Element {
  const { createTask, updateTask, CRON_PRESETS } = useScheduledTasks();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(task?.name ?? "");
  const [prompt, setPrompt] = useState(task?.prompt ?? "");
  const [cron, setCron] = useState(task?.cron ?? CRON_PRESETS[3].value);
  const [enabled, setEnabled] = useState(task?.enabled ?? true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) return;

    if (task) {
      await updateTask(task.id, { name, prompt, cron, enabled });
    } else {
      await createTask({ name, prompt, cron, enabled });
    }

    setIsOpen(false);
    setName("");
    setPrompt("");
    setCron(CRON_PRESETS[3].value);
    setEnabled(true);
  };

  if (!isOpen && !task) {
    return (
      <button
        onClick={() => {
          setIsOpen(true)
          console.log(123);
        }}
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        + 新建任务
      </button>
    );
  }

  return (
    <>
      {task && !isOpen && (
        <button
          onClick={() => {
            setIsOpen(true)
          }}
          className="rounded p-1.5 hover:bg-[var(--hover)]"
          title="编辑"
        >
          <span className="icon-[mdi--pencil] text-sm" />
        </button>
      )}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-md flex-1 rounded-lg bg-[var(--content-bg)] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">
                {task ? "编辑任务" : "新建定时任务"}
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1 hover:bg-[var(--hover)]"
              >
                <span className="icon-[mdi--close] text-lg" />
              </button>
            </div>
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
                <CronPicker value={cron} onChange={setCron} />
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
                  onClick={() => setIsOpen(false)}
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
          </div>
        </div>
      )}
    </>
  );
}
