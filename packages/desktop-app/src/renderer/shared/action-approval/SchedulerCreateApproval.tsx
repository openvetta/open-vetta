import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { Button } from "../components/ui/button";
import { useActionApproval } from "./useActionApproval";

interface CreateTaskData {
	name: string;
	prompt: string;
	cron: string;
	isOnce: boolean;
	enabled?: boolean;
	cwd: string;
	modelKey?: string;
	executionMode?: "inherit" | "sandbox" | "full-access";
	skill?: { name: string; alias?: string; type: "skill" | "scene" };
}

interface CreateTaskInput {
	operation: "create";
	data: CreateTaskData;
	approvalUi?: string;
}

function parseCreateInput(input: DesktopActionApprovalRequest["input"]): CreateTaskInput | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	if (record.operation !== "create" || typeof record.data !== "object" || record.data === null) return null;
	const data = record.data as Record<string, unknown>;
	if (
		typeof data.name !== "string" ||
		typeof data.prompt !== "string" ||
		typeof data.cron !== "string" ||
		typeof data.isOnce !== "boolean" ||
		typeof data.cwd !== "string"
	) {
		return null;
	}
	return {
		operation: "create",
		data: {
			name: data.name,
			prompt: data.prompt,
			cron: data.cron,
			isOnce: data.isOnce,
			enabled: typeof data.enabled === "boolean" ? data.enabled : undefined,
			cwd: data.cwd,
			modelKey: typeof data.modelKey === "string" ? data.modelKey : undefined,
			executionMode:
				data.executionMode === "inherit" ||
				data.executionMode === "sandbox" ||
				data.executionMode === "full-access"
					? data.executionMode
					: undefined,
			skill:
				typeof data.skill === "object" && data.skill !== null
					? (data.skill as CreateTaskData["skill"])
					: undefined,
		},
		approvalUi: typeof record.approvalUi === "string" ? record.approvalUi : undefined,
	};
}

const executionModeLabels: Record<string, string> = {
	inherit: "继承项目设置",
	sandbox: "沙箱模式",
	"full-access": "完全访问",
};

export function SchedulerCreateApproval(): JSX.Element | null {
	const approval = useActionApproval("scheduler.create");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = parseCreateInput(request.input);

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
			<div className="max-h-[90vh] w-full max-w-[560px] overflow-auto rounded-xl border border-border bg-popover shadow-xl">
				<div className="border-b border-border/60 p-5">
					<div className="flex items-start gap-3">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<span className="icon-[mdi--clock-plus-outline] h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1">
							<h2 className="text-[15px] font-semibold text-foreground">创建定时任务确认</h2>
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
										<div className="truncate text-[13px] font-semibold text-foreground">{input.data.name}</div>
										<div className="mt-0.5 text-[11px] text-muted-foreground">{input.data.cwd}</div>
									</div>
									<span
										className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${
											input.data.enabled !== false
												? "bg-primary/10 text-primary"
												: "bg-muted text-muted-foreground"
										}`}
									>
										{input.data.enabled !== false ? "已启用" : "已禁用"}
									</span>
								</div>
							</div>

							<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
								<div className="flex gap-2">
									<span className="icon-[mdi--information-outline] mt-0.5 h-4 w-4 shrink-0 text-primary" />
									<div className="min-w-0">
										<div className="text-[11px] font-semibold text-foreground">任务配置</div>
										<div className="mt-2 space-y-2 text-[11px]">
											<div className="flex items-start justify-between gap-4">
												<span className="shrink-0 text-muted-foreground">Cron 表达式</span>
												<span className="font-mono text-[10px] text-foreground">{input.data.cron}</span>
											</div>
											<div className="flex items-center justify-between gap-4">
												<span className="text-muted-foreground">执行模式</span>
												<span className="text-foreground">
													{input.data.isOnce ? "单次执行" : "重复执行"}
												</span>
											</div>
											{input.data.executionMode && (
												<div className="flex items-center justify-between gap-4">
													<span className="text-muted-foreground">权限模式</span>
													<span className="text-foreground">
														{executionModeLabels[input.data.executionMode] ?? input.data.executionMode}
													</span>
												</div>
											)}
											{input.data.modelKey && (
												<div className="flex items-center justify-between gap-4">
													<span className="text-muted-foreground">模型</span>
													<span className="text-foreground">{input.data.modelKey}</span>
												</div>
											)}
											{input.data.skill && (
												<div className="flex items-center justify-between gap-4">
													<span className="text-muted-foreground">技能</span>
													<span className="text-foreground">
														{input.data.skill.alias ?? input.data.skill.name}
														<span className="ml-1 text-[9px] text-muted-foreground">
															({input.data.skill.type === "scene" ? "场景" : "技能"})
														</span>
													</span>
												</div>
											)}
										</div>
									</div>
								</div>
							</div>

							<div className="rounded-lg border border-border/50 bg-background/50 p-3">
								<div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									任务提示词
								</div>
								<p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-foreground">
									{input.data.prompt}
								</p>
							</div>
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
							{responding ? "创建中..." : "确认创建"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
