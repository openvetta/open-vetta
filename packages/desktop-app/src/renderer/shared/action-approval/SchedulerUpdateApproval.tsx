import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { Button } from "../components/ui/button";
import { useActionApproval } from "./useActionApproval";

interface UpdateTaskData {
	name?: string;
	prompt?: string;
	cron?: string;
	isOnce?: boolean;
	enabled?: boolean;
	cwd?: string;
	modelKey?: string | null;
	executionMode?: "inherit" | "sandbox" | "full-access";
	skill?: { name: string; alias?: string; type: "skill" | "scene" } | null;
}

interface UpdateTaskInput {
	operation: "update";
	taskId: string;
	data: UpdateTaskData;
	approvalUi?: string;
}

function parseUpdateInput(input: DesktopActionApprovalRequest["input"]): UpdateTaskInput | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	if (record.operation !== "update" || typeof record.taskId !== "string" || typeof record.data !== "object" || record.data === null) {
		return null;
	}
	return {
		operation: "update",
		taskId: record.taskId,
		data: record.data as UpdateTaskData,
		approvalUi: typeof record.approvalUi === "string" ? record.approvalUi : undefined,
	};
}

const executionModeLabels: Record<string, string> = {
	inherit: "继承项目设置",
	sandbox: "沙箱模式",
	"full-access": "完全访问",
};

const fieldLabels: Record<string, string> = {
	name: "任务名称",
	prompt: "任务提示词",
	cron: "Cron 表达式",
	isOnce: "执行模式",
	enabled: "启用状态",
	cwd: "工作目录",
	modelKey: "模型",
	executionMode: "权限模式",
	skill: "技能",
};

function formatFieldValue(key: string, value: unknown): string {
	if (value === null) return "已清除";
	if (value === undefined) return "未设置";
	if (key === "isOnce") return value ? "单次执行" : "重复执行";
	if (key === "enabled") return value ? "已启用" : "已禁用";
	if (key === "executionMode") return executionModeLabels[value as string] ?? String(value);
	if (key === "skill" && typeof value === "object" && value !== null) {
		const skill = value as { name: string; alias?: string; type: string };
		return `${skill.alias ?? skill.name} (${skill.type === "scene" ? "场景" : "技能"})`;
	}
	return String(value);
}

export function SchedulerUpdateApproval(): JSX.Element | null {
	const approval = useActionApproval("scheduler.update");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = parseUpdateInput(request.input);
	const changedFields = input ? Object.keys(input.data) : [];

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
			<div className="max-h-[90vh] w-full max-w-[560px] overflow-auto rounded-xl border border-border bg-popover shadow-xl">
				<div className="border-b border-border/60 p-5">
					<div className="flex items-start gap-3">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<span className="icon-[mdi--clock-edit-outline] h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1">
							<h2 className="text-[15px] font-semibold text-foreground">更新定时任务确认</h2>
							<p className="mt-1 text-[12px] leading-5 text-muted-foreground">{request.summary}</p>
						</div>
					</div>
				</div>

				<div className="space-y-3 p-5">
					{input && (
						<>
							<div className="rounded-lg border border-border/50 bg-background/50 p-3">
								<div className="flex items-start gap-3">
									<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
										<span className="icon-[mdi--clipboard-text-clock-outline] h-4 w-4 text-muted-foreground" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-[12px] font-semibold text-foreground">任务 ID</div>
										<div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{input.taskId}</div>
									</div>
									<span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
										{changedFields.length} 项变更
									</span>
								</div>
							</div>

							<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
								<div className="flex gap-2">
									<span className="icon-[mdi--information-outline] mt-0.5 h-4 w-4 shrink-0 text-primary" />
									<div className="min-w-0">
										<div className="text-[11px] font-semibold text-foreground">变更内容</div>
										<div className="mt-2 space-y-2">
											{changedFields.map((key) => (
												<div key={key} className="flex items-start justify-between gap-4 text-[11px]">
													<span className="shrink-0 text-muted-foreground">{fieldLabels[key] ?? key}</span>
													<span className="min-w-0 text-right text-foreground">
														{formatFieldValue(key, input.data[key as keyof UpdateTaskData])}
													</span>
												</div>
											))}
										</div>
									</div>
								</div>
							</div>

							{input.data.prompt && (
								<div className="rounded-lg border border-border/50 bg-background/50 p-3">
									<div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
										新提示词
									</div>
									<p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-foreground">
										{input.data.prompt}
									</p>
								</div>
							)}
						</>
					)}

					{!input && (
						<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[10px] leading-4 text-foreground">
							{JSON.stringify(request.input, null, 2)}
						</pre>
					)}
				</div>

				<div className="border-t border-border/60 px-5 py-4">
					<div className="mb-3 flex items-center justify-between text-[10px] text-muted-foreground">
						<span>请求权限</span>
						<span className="font-mono">{request.permission}</span>
					</div>
					{error && <div className="mb-3 text-[11px] text-destructive">{error}</div>}
					<div className="flex justify-end gap-2">
						<Button variant="ghost" size="sm" disabled={responding} onClick={reject}>
							拒绝
						</Button>
						<Button size="sm" disabled={responding} onClick={() => approve()}>
							{responding ? "更新中..." : "确认更新"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
