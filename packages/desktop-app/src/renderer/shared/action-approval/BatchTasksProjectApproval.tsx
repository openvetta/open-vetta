import type { DesktopActionApprovalRequest, DesktopActionJsonValue } from "@preload/api.js";
import { useActionApproval } from "./useActionApproval";
import { Button } from "../components/ui/button";

interface ProjectCreateData {
	name: string;
	prompt: string;
	folders: string[];
	concurrency: number;
	[key: string]: DesktopActionJsonValue | undefined;
}

interface ProjectInputBase {
	operation: string;
	projectId?: string;
	data?: ProjectCreateData | Record<string, DesktopActionJsonValue>;
	approvalUi?: string;
}

function parseProjectInput(input: DesktopActionApprovalRequest["input"]): ProjectInputBase | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	if (typeof record.operation !== "string") return null;
	if (record.operation === "create") {
		if (typeof record.data === "object" && record.data !== null) {
			return { operation: "create", data: record.data as ProjectCreateData };
		}
		return null;
	}
	if (record.operation === "update") {
		if (typeof record.projectId === "string" && typeof record.data === "object" && record.data !== null) {
			return { operation: "update", projectId: record.projectId, data: record.data as Record<string, DesktopActionJsonValue> };
		}
		return null;
	}
	if (record.operation === "delete") {
		if (typeof record.projectId === "string") {
			return { operation: "delete", projectId: record.projectId };
		}
		return null;
	}
	return null;
}

const operationLabels: Record<string, string> = {
	create: "创建项目",
	update: "更新项目",
	delete: "删除项目",
};

export function BatchTasksProjectApproval(): JSX.Element | null {
	const approval = useActionApproval("batch-tasks.project");
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = parseProjectInput(request.input);

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/50 px-4 backdrop-blur-sm">
			<div className="w-full max-w-[400px] rounded-lg border border-border bg-popover p-3 shadow-lg">
				<div className="flex items-center gap-2.5">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<span className="icon-[mdi--folder-table-outline] h-3.5 w-3.5" />
					</div>
					<div className="min-w-0">
						<h2 className="text-[13px] font-semibold text-foreground">批量项目操作确认</h2>
						<p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{request.summary}</p>
					</div>
				</div>

				{input && (
					<div className="mt-3 space-y-1.5">
						<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
							<span className="text-[11px] text-muted-foreground">操作类型</span>
							<span className="text-[11px] font-medium text-foreground">{operationLabels[input.operation] ?? input.operation}</span>
						</div>

						{input.operation === "create" && input.data && (
							<>
								<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
									<span className="text-[11px] text-muted-foreground">项目名称</span>
									<span className="text-[11px] font-medium text-foreground">{(input.data as ProjectCreateData).name}</span>
								</div>
								<div className="rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
									<span className="text-[11px] text-muted-foreground">提示词</span>
									<p className="mt-1 max-h-[80px] overflow-auto text-[11px] leading-4 text-foreground">{(input.data as ProjectCreateData).prompt}</p>
								</div>
								<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
									<span className="text-[11px] text-muted-foreground">文件夹数量</span>
									<span className="text-[11px] font-medium text-foreground">{(input.data as ProjectCreateData).folders.length}</span>
								</div>
								<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
									<span className="text-[11px] text-muted-foreground">并发数</span>
									<span className="text-[11px] font-medium text-foreground">{(input.data as ProjectCreateData).concurrency}</span>
								</div>
							</>
						)}

						{input.operation === "update" && input.projectId && (
							<>
								<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
									<span className="text-[11px] text-muted-foreground">项目路径</span>
									<span className="max-w-[200px] truncate text-[11px] font-medium text-foreground" title={input.projectId}>{input.projectId}</span>
								</div>
								{input.data && (
									<div className="rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
										<span className="text-[11px] text-muted-foreground">更新内容</span>
										<pre className="mt-1 max-h-[120px] overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-foreground">
											{JSON.stringify(input.data, null, 2)}
										</pre>
									</div>
								)}
							</>
						)}

						{input.operation === "delete" && input.projectId && (
							<div className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
								<span className="text-[11px] text-muted-foreground">项目路径</span>
								<span className="max-w-[200px] truncate text-[11px] font-medium text-foreground" title={input.projectId}>{input.projectId}</span>
							</div>
						)}
					</div>
				)}

				{!input && (
					<div className="mt-3">
						<pre className="max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 font-mono text-[10px] leading-4 text-foreground">
							{JSON.stringify(request.input, null, 2)}
						</pre>
					</div>
				)}

				<div className="mt-2.5 text-[10px] text-muted-foreground">权限：{request.permission}</div>
				{error && <div className="mt-1.5 text-[10px] text-destructive">{error}</div>}

				<div className="mt-3 flex justify-end gap-1.5">
					<Button variant="ghost" size="sm" className="h-7 px-2.5 text-[11px]" disabled={responding} onClick={reject}>
						拒绝
					</Button>
					<Button
						size="sm"
						className="h-7 px-2.5 text-[11px]"
						variant={input?.operation === "delete" ? "destructive" : "default"}
						disabled={responding}
						onClick={() => approve()}
					>
						{responding ? "处理中..." : `确认${operationLabels[input?.operation ?? ""] ?? "操作"}`}
					</Button>
				</div>
			</div>
		</div>
	);
}
