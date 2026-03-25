import { useEffect, useState } from "react";
import type { TaskExecutionRecord } from "@shared/store/atoms";

interface ExecutionHistoryProps {
  taskId: string;
  onSelectRecord: (record: TaskExecutionRecord) => void;
}

export function ExecutionHistory({ taskId, onSelectRecord }: ExecutionHistoryProps): JSX.Element {
  const [records, setRecords] = useState<TaskExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecords();
  }, [taskId]);

  useEffect(() => {
    const unsubscribe = window.vetta.scheduler.onTaskEvent((event) => {
      if (event.taskId === taskId && (event.type === "task.started" || event.type === "record.updated")) {
        loadRecords();
      }
    });
    return unsubscribe;
  }, [taskId]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const loaded = await window.vetta.scheduler.getRecords(taskId);
      setRecords(loaded);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (ms?: number): string => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusIcon = (
    status: TaskExecutionRecord["status"],
  ): JSX.Element => {
    switch (status) {
      case "success":
        return <span className="icon-[mdi--check-circle] text-green-500" />;
      case "failed":
        return <span className="icon-[mdi--close-circle] text-red-500" />;
      case "running":
        return <span className="icon-[mdi--loading] animate-spin text-blue-500" />;
      case "aborted":
        return <span className="icon-[mdi--cancel] text-yellow-500" />;
    }
  };

  const getStatusText = (status: TaskExecutionRecord["status"]): string => {
    switch (status) {
      case "success":
        return "成功";
      case "failed":
        return "失败";
      case "running":
        return "执行中";
      case "aborted":
        return "已中止";
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <h3 className="font-medium text-[var(--text-1)]">执行历史</h3>
        <button
          onClick={loadRecords}
          className="ml-auto rounded p-1 hover:bg-[var(--hover)]"
          title="刷新"
        >
          <span className="icon-[mdi--refresh] text-sm" />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="icon-[mdi--loading] animate-spin text-xl text-[var(--text-3)]" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--text-3)]">
            <span className="icon-[mdi--history] mb-2 text-2xl" />
            <p className="text-sm">暂无执行记录</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {records.map((record) => (
              <div
                key={record.id}
                className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-[var(--hover)]"
                onClick={() => onSelectRecord(record)}
              >
                <div className="mt-0.5">{getStatusIcon(record.status)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-2)]">
                      {formatTime(record.startedAt)}
                    </span>
                    <span className="text-[var(--text-3)]">
                      {getStatusText(record.status)}
                    </span>
                    <span className="text-[var(--text-3)]">
                      {formatDuration(record.durationMs)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--text-3)]">
                    {record.responsePreview || record.prompt}
                  </p>
                  {record.error && (
                    <p className="mt-1 truncate text-xs text-red-500">{record.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
