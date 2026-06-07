import type { DesktopActionApprovalRequest, DesktopActionJsonValue } from "@preload/api.js";
import { batchProjectsAtom, type BatchProject } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Drawer, DrawerContent } from "../components/ui/drawer";
import { Textarea } from "../components/ui/textarea";
import { useActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

interface ProjectSkill {
	name: string;
	alias?: string;
	type: "skill" | "scene";
}

interface ProjectData {
	name?: string;
	prompt?: string;
	modelKey?: string;
	folders?: string[];
	concurrency?: number;
	executionMode?: "inherit" | "sandbox" | "full-access";
	artifactPatterns?: string[];
	notifyEnabled?: boolean;
	timeoutMinutes?: number;
	newFolders?: string[];
	skill?: ProjectSkill | null;
}

interface ProjectInput {
	operation: "create" | "update" | "delete";
	projectId?: string;
	data?: ProjectData;
}

function mergeCurrentProjectData(
	input: ProjectInput | null,
	project: BatchProject | undefined,
): ProjectInput | null {
	if (input?.operation !== "update" || !project) return input;
	return {
		...input,
		data: {
			name: project.name,
			prompt: project.prompt,
			modelKey: project.modelKey,
			concurrency: project.concurrency,
			executionMode: project.executionMode,
			artifactPatterns: project.artifactPatterns ?? [],
			notifyEnabled: project.notifyEnabled ?? false,
			timeoutMinutes: project.timeoutMinutes ?? 60,
			skill: project.skill ?? null,
			...input.data,
		},
	};
}

function getCurrentProject(projects: BatchProject[], projectId: string | undefined): BatchProject | undefined {
	return projectId ? projects.find((project) => project.id === projectId) : undefined;
}

function parseProjectInput(input: DesktopActionApprovalRequest["input"]): ProjectInput | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	if (record.operation === "create" && isRecord(record.data)) {
		return { operation: "create", data: record.data as ProjectData };
	}
	if (record.operation === "update" && typeof record.projectId === "string" && isRecord(record.data)) {
		return { operation: "update", projectId: record.projectId, data: record.data as ProjectData };
	}
	if (record.operation === "delete" && typeof record.projectId === "string") {
		return { operation: "delete", projectId: record.projectId };
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, DesktopActionJsonValue> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const operationLabels = {
	create: "创建项目",
	update: "更新项目",
	delete: "删除项目",
} as const;

const executionModeLabels = {
	inherit: "跟随全局设置",
	sandbox: "沙盒",
	"full-access": "完全访问",
} as const;

function ValueRow({ label, value }: { label: string; value: string | number }): JSX.Element {
	return (
		<div className="flex items-start justify-between gap-4 py-1.5">
			<span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
			<span className="min-w-0 break-words text-right text-[11px] font-medium text-foreground">{value}</span>
		</div>
	);
}

function TextBlock({ label, children }: { label: string; children: string }): JSX.Element {
	return (
		<div className="rounded-lg border border-border/50 bg-background/50 p-3">
			<div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
			<p className="max-h-28 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-foreground">
				{children}
			</p>
		</div>
	);
}

function PathList({ label, paths }: { label: string; paths: string[] }): JSX.Element {
	return (
		<div className="rounded-lg border border-border/50 bg-background/50 p-3">
			<div className="mb-2 flex items-center justify-between">
				<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
				<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
					{paths.length} 个
				</span>
			</div>
			<div className="max-h-28 space-y-1 overflow-auto">
				{paths.map((path) => (
					<div key={path} className="flex items-start gap-1.5 text-[11px] leading-4 text-foreground">
						<span className="icon-[mdi--folder-outline] mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
						<span className="break-all">{path}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function BatchTasksProjectApproval(): JSX.Element | null {
	const approval = useActionApproval("batch-tasks.project");
	const projects = useAtomValue(batchProjectsAtom);
	if (!approval) return null;
	const parsedInput = parseProjectInput(approval.request.input);
	const cachedProject = getCurrentProject(projects, parsedInput?.projectId);
	return (
		<BatchTasksProjectApprovalContent
			key={approval.request.approvalId}
			approval={approval}
			parsedInput={parsedInput}
			cachedProject={cachedProject}
		/>
	);
}

function BatchTasksProjectApprovalContent({
	approval,
	parsedInput,
	cachedProject,
}: {
	approval: NonNullable<ReturnType<typeof useActionApproval>>;
	parsedInput: ProjectInput | null;
	cachedProject: BatchProject | undefined;
}): JSX.Element {
	const editorRef = useRef<HTMLTextAreaElement>(null);
	const [editorError, setEditorError] = useState<string | null>(null);
	const needsProject = parsedInput?.operation === "update" || parsedInput?.operation === "delete";
	const [currentProject, setCurrentProject] = useState<BatchProject | undefined>(cachedProject);
	const [loading, setLoading] = useState(needsProject && !cachedProject);
	const [loadError, setLoadError] = useState<string | null>(null);
	const { request, responding, error, approve, reject } = approval;
	const countdown = useApprovalCountdown(request.approvalId);

	useEffect(() => {
		console.info("[action-approval:batch-tasks.project] request", {
			approvalId: request.approvalId,
			input: request.input,
			parsedInput,
			cachedProject,
		});
	}, [cachedProject, parsedInput, request.approvalId, request.input]);

	useEffect(() => {
		if (!needsProject) return;
		if (cachedProject) {
			console.info("[action-approval:batch-tasks.project] source", {
				approvalId: request.approvalId,
				source: "atom",
				project: cachedProject,
			});
			return;
		}
		let cancelled = false;
		void window.vetta.batchTasks
			.getProjects()
			.then((projects) => {
				if (cancelled) return;
				const project = getCurrentProject(projects, parsedInput?.projectId);
				console.info("[action-approval:batch-tasks.project] query", {
					approvalId: request.approvalId,
					requestedProjectId: parsedInput?.projectId,
					returnedProjectIds: projects.map((candidate) => candidate.id),
					matchedProject: project,
				});
				setCurrentProject(project);
				if (!project) setLoadError("未找到当前批量项目，无法加载完整配置。");
			})
			.catch((error: unknown) => {
				console.error("[action-approval:batch-tasks.project] query-failed", {
					approvalId: request.approvalId,
					requestedProjectId: parsedInput?.projectId,
					error,
				});
				if (!cancelled) setLoadError("加载当前批量项目配置失败。");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [cachedProject, needsProject, parsedInput?.projectId, request.approvalId]);

	const input = useMemo(
		() => mergeCurrentProjectData(parsedInput, currentProject),
		[currentProject, parsedInput],
	);
	const isDelete = input?.operation === "delete";
	const isEditable = input?.operation === "create" || input?.operation === "update";
	const data = input?.data;
	const editableInput = input ?? request.input;

	useEffect(() => {
		if (input?.operation !== "update" || !currentProject) return;
		console.info("[action-approval:batch-tasks.project] merged", {
			approvalId: request.approvalId,
			currentProject,
			agentPatch: parsedInput?.data,
			mergedInput: input,
		});
	}, [currentProject, input, parsedInput?.data, request.approvalId]);

	if (loading) {
		return (
			<Drawer open direction="right" dismissible={false}>
				<DrawerContent className="w-[min(560px,calc(100vw-2rem))] sm:max-w-[560px]">
					<div className="min-h-0 flex-1 overflow-y-auto">
						<div className="py-10 text-center text-[12px] text-muted-foreground">正在加载当前项目配置...</div>
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	if (parsedInput?.operation === "update" && !currentProject) {
		return (
			<Drawer open direction="right" dismissible={false}>
				<DrawerContent className="w-[min(560px,calc(100vw-2rem))] sm:max-w-[560px]">
					<div className="min-h-0 flex-1 overflow-y-auto">
						<div className="py-10 text-center text-[12px] text-destructive">{loadError}</div>
						<div className="flex justify-end border-t border-border/60 px-5 py-4">
							<Button variant="outline" size="sm" disabled={responding} onClick={reject}>
								拒绝（{countdown}）
							</Button>
						</div>
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	const approveEditedInput = (): void => {
		if (!isEditable) {
			approve();
			return;
		}
		try {
			const editedInput = JSON.parse(editorRef.current?.value ?? "") as DesktopActionJsonValue;
			console.info("[action-approval:batch-tasks.project] submit", {
				approvalId: request.approvalId,
				input: editedInput,
			});
			setEditorError(null);
			approve(editedInput);
		} catch {
			setEditorError("参数不是有效的 JSON，请检查后重试。");
		}
	};

	const content = (
		<>
			<div className="border-b border-border/60 p-5">
				<div className="flex items-start gap-3">
					<div
						className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
							isDelete ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
						}`}
					>
						<span
							className={`${isDelete ? "icon-[mdi--folder-remove-outline]" : "icon-[mdi--folder-cog-outline]"} h-5 w-5`}
						/>
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-[15px] font-semibold text-foreground">批量项目操作确认</h2>
							{input && (
								<span
									className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
										isDelete ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
									}`}
								>
									{operationLabels[input.operation]}
								</span>
							)}
						</div>
						<p className="mt-1 text-[12px] leading-5 text-muted-foreground">{request.summary}</p>
					</div>
				</div>
			</div>

			<div className="space-y-3 p-5">
				{input?.operation === "create" && data && (
					<>
						<div className="rounded-lg border border-border/50 bg-background/50 px-3">
							<ValueRow label="项目名称" value={data.name ?? "未提供"} />
							<div className="h-px bg-border/40" />
							<ValueRow label="任务数量" value={`${data.folders?.length ?? 0} 个文件夹`} />
							<div className="h-px bg-border/40" />
							<ValueRow label="最大并发" value={`${data.concurrency ?? "未提供"} 个任务`} />
							<div className="h-px bg-border/40" />
							<ValueRow label="单任务超时" value={`${data.timeoutMinutes ?? 60} 分钟`} />
							<div className="h-px bg-border/40" />
							<ValueRow label="模型" value={data.modelKey ?? "应用默认模型"} />
							<div className="h-px bg-border/40" />
							<ValueRow
								label="执行权限"
								value={executionModeLabels[data.executionMode ?? "full-access"]}
							/>
							<div className="h-px bg-border/40" />
							<ValueRow
								label="技能 / 场景"
								value={
									data.skill
										? `${data.skill.type === "scene" ? "场景" : "技能"}：${data.skill.alias ?? data.skill.name}`
										: "未设置"
								}
							/>
							<div className="h-px bg-border/40" />
							<ValueRow label="完成通知" value={data.notifyEnabled ? "已开启" : "未开启"} />
						</div>
						{data.executionMode === "full-access" || data.executionMode === undefined ? (
							<div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
								<span className="icon-[mdi--shield-alert-outline] mt-0.5 h-4 w-4 shrink-0" />
								<p className="text-[11px] leading-5">
									任务将以完全访问模式运行，可读取和修改文件夹内外的文件。请确认提示词和目录来源可信。
								</p>
							</div>
						) : null}
						{data.prompt !== undefined && <TextBlock label="将应用到每个任务的提示词">{data.prompt}</TextBlock>}
						{data.folders && <PathList label="源文件夹" paths={data.folders} />}
						<div className="rounded-lg border border-border/50 bg-background/50 px-3">
							<ValueRow
								label="产物校验"
								value={
									data.artifactPatterns?.length
										? data.artifactPatterns.join("、")
										: "不校验产物文件"
								}
							/>
						</div>
					</>
				)}

				{input?.operation === "update" && data && (
					<>
						<div className="rounded-lg border border-border/50 bg-background/50 px-3">
							<ValueRow label="目标项目" value={currentProject?.name ?? "未在当前列表中找到"} />
							<div className="h-px bg-border/40" />
							<ValueRow label="项目路径" value={input.projectId ?? "未知"} />
							<div className="h-px bg-border/40" />
							<ValueRow label="现有任务" value={`${currentProject?.tasks.length ?? "未知"} 个`} />
						</div>
						<div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
							<div className="mb-2 text-[11px] font-semibold text-foreground">本次修改</div>
							{data.name !== undefined && <ValueRow label="项目名称" value={data.name} />}
							{data.modelKey !== undefined && <ValueRow label="模型" value={data.modelKey} />}
							{data.concurrency !== undefined && (
								<ValueRow
									label="最大并发"
									value={`${currentProject?.concurrency ?? "未知"} → ${data.concurrency}`}
								/>
							)}
							{data.timeoutMinutes !== undefined && (
								<ValueRow
									label="单任务超时"
									value={`${currentProject?.timeoutMinutes ?? 60} → ${data.timeoutMinutes} 分钟`}
								/>
							)}
							{data.executionMode !== undefined && (
								<ValueRow label="执行权限" value={executionModeLabels[data.executionMode]} />
							)}
							{data.notifyEnabled !== undefined && (
								<ValueRow label="完成通知" value={data.notifyEnabled ? "开启" : "关闭"} />
							)}
							{data.artifactPatterns !== undefined && (
								<ValueRow
									label="产物校验"
									value={data.artifactPatterns.length ? data.artifactPatterns.join("、") : "清除全部规则"}
								/>
							)}
							{data.skill !== undefined && (
								<ValueRow
									label="技能 / 场景"
									value={
										data.skill
											? `${data.skill.type === "scene" ? "场景" : "技能"}：${data.skill.alias ?? data.skill.name}`
											: "清除现有设置"
									}
								/>
							)}
						</div>
						{data.prompt !== undefined && <TextBlock label="新的提示词">{data.prompt}</TextBlock>}
						{data.newFolders && data.newFolders.length > 0 && (
							<PathList label="新增文件夹（不会移除现有任务）" paths={data.newFolders} />
						)}
					</>
				)}

				{input?.operation === "delete" && (
					<>
						<div className="rounded-lg border border-border/50 bg-background/50 px-3">
							<ValueRow label="目标项目" value={currentProject?.name ?? "未在当前列表中找到"} />
							<div className="h-px bg-border/40" />
							<ValueRow label="项目路径" value={input.projectId ?? "未知"} />
							<div className="h-px bg-border/40" />
							<ValueRow label="包含任务" value={`${currentProject?.tasks.length ?? "未知"} 个`} />
						</div>
						<div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
							<span className="icon-[mdi--alert-outline] mt-0.5 h-4 w-4 shrink-0" />
							<p className="text-[11px] leading-5">
								该操作会永久删除项目目录、全部任务记录、会话状态和任务产物，无法撤销。存在运行中或排队任务时操作会被拒绝。
							</p>
						</div>
					</>
				)}

				{!input && (
					<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[10px] leading-4 text-foreground">
						{JSON.stringify(request.input, null, 2)}
					</pre>
				)}
				{isEditable && (
					<div className="rounded-lg border border-border/50 bg-card/40 p-3">
						<label className="text-[11px] font-medium text-foreground" htmlFor="batch-project-approval-input">
							编辑操作参数
						</label>
						<p className="mt-1 text-[10px] leading-4 text-muted-foreground">
							可在执行前修改 agent 提供的项目配置。
						</p>
						<Textarea
							key={request.approvalId}
							id="batch-project-approval-input"
							ref={editorRef}
							defaultValue={JSON.stringify(editableInput, null, 2)}
							className="mt-2 min-h-48 resize-y font-mono text-[11px]"
						/>
						{editorError && <div className="mt-2 text-[11px] text-destructive">{editorError}</div>}
					</div>
				)}
			</div>

			<div className="border-t border-border/60 px-5 py-4">
				<div className="mb-3 flex items-center justify-between text-[10px] text-muted-foreground">
					<span>请求权限</span>
					<span className="font-mono">{request.permission}</span>
				</div>
				{error && <div className="mb-3 text-[11px] text-destructive">{error}</div>}
				<div className="flex justify-end gap-2">
				<Button variant="outline" size="sm" disabled={responding} onClick={reject}>
					拒绝（{countdown}）
				</Button>
				<Button
					size="sm"
					variant={isDelete ? "destructive" : "default"}
					disabled={responding}
					onClick={approveEditedInput}
				>
					{responding ? "处理中..." : `确认${input ? operationLabels[input.operation] : "操作"}`}
				</Button>
				</div>
			</div>
		</>
	);

	if (isEditable) {
		return (
			<Drawer open direction="right" dismissible={false}>
				<DrawerContent className="w-[min(560px,calc(100vw-2rem))] sm:max-w-[560px]">
					<div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-auto sm:max-w-[560px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				{content}
			</DialogContent>
		</Dialog>
	);
}
