import { useEffect } from "react";
import { useAtomValue, useAtom } from "jotai";
import { scheduledTasksAtom, selectedTaskIdAtom } from "../../store/atoms";
import { useScheduledTasks } from "../../hooks/useScheduledTasks";
import { TaskList } from "./TaskList";
import { TaskForm } from "./TaskForm";
import { ExecutionHistory } from "./ExecutionHistory";

export function AutomationPage(): JSX.Element {
  const tasks = useAtomValue(scheduledTasksAtom);
  const [selectedTaskId, setSelectedTaskId] = useAtom(selectedTaskIdAtom);
  const { refreshTasks } = useScheduledTasks();
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-xl font-semibold text-[var(--text-1)]">自动化</h1>
        {!selectedTask && <TaskForm />}
      </div>

      <div className="flex flex-1 overflow-hidden p-4">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
          <TaskList onSelectTask={setSelectedTaskId} />
          {selectedTask && (
            <ExecutionHistory
              taskId={selectedTask.id}
              onBack={() => setSelectedTaskId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
