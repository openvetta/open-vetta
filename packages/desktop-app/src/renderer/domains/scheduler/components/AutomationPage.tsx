import { useEffect, useState } from "react";
import { useAtomValue, useAtom } from "jotai";
import { scheduledTasksAtom, selectedTaskIdAtom, formOpenAtom, type TaskExecutionRecord } from "@shared/store/atoms";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import { TaskList } from "./TaskList";
import { ExecutionHistory } from "./ExecutionHistory";
import { TaskExecutionView } from "./TaskExecutionView";
import { TaskForm } from "./TaskForm";

export function AutomationPage(): JSX.Element {
  const tasks = useAtomValue(scheduledTasksAtom);
  const [selectedTaskId, setSelectedTaskId] = useAtom(selectedTaskIdAtom);
  const [selectedRecord, setSelectedRecord] = useState<TaskExecutionRecord | null>(null);
  const [formEditingTask, setFormEditingTask] = useAtom(formOpenAtom);
  const { refreshTasks } = useScheduledTasks();
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-xl font-semibold text-[var(--text-1)]">自动化</h1>
        {formEditingTask === undefined && (
          <button
            onClick={() => setFormEditingTask(null)}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            + 新建任务
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden p-4">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {formEditingTask !== undefined && (
            <TaskForm
              task={formEditingTask ?? undefined}
              onClose={() => setFormEditingTask(undefined)}
            />
          )}
          <TaskList
            selectedTaskId={selectedTaskId}
            onSelectTask={(id) => {
              setSelectedTaskId(selectedTaskId === id ? null : id);
            }}
            onEditTask={(task) => setFormEditingTask(task)}
          />
          {selectedTask && !selectedRecord && (
            <ExecutionHistory
              taskId={selectedTask.id}
              onSelectRecord={setSelectedRecord}
            />
          )}
          {selectedRecord && (
            <TaskExecutionView
              record={selectedRecord}
              onBack={() => setSelectedRecord(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
