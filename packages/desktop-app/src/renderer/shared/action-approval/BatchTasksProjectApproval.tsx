import type { DesktopActionApprovalRequest, DesktopActionJsonValue } from "@preload/api.js";
import {
	BatchProjectFormFields,
	type BatchProjectEditableData,
	toBatchProjectApprovalJsonData,
} from "@domains/batch-tasks/components/BatchProjectFormFields";
import { batchProjectsAtom, type BatchProject } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Drawer, DrawerContent } from "../components/ui/drawer";
import { useActionApproval, type ActiveActionApproval } from "./useActionApproval";

type ProjectData = BatchProjectEditableData;

interface ProjectInput {
	operation: "create" | "update" | "delete";
	projectId?: string;
	data?: ProjectData;
	approvalUi?: string;
}

function mergeCurrentProjectData(
	input: ProjectInput | null,
	project: BatchProject | undefined,
): ProjectInput | null {
	if (input?.operation !== "update" || !project) return input;
	const currentFolders = project.tasks.map((task) => task.sourcePath);
	const folders = input.data?.folders ?? [...new Set([...currentFolders, ...(input.data?.newFolders ?? [])])];
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
			folders,
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
		return {
			operation: "create",
			data: record.data as ProjectData,
			approvalUi: typeof record.approvalUi === "string" ? record.approvalUi : undefined,
		};
	}
	if (record.operation === "update" && typeof record.projectId === "string" && isRecord(record.data)) {
		return {
			operation: "update",
			projectId: record.projectId,
			data: record.data as ProjectData,
			approvalUi: typeof record.approvalUi === "string" ? record.approvalUi : undefined,
		};
	}
	if (record.operation === "delete" && typeof record.projectId === "string") {
		return {
			operation: "delete",
			projectId: record.projectId,
			approvalUi: typeof record.approvalUi === "string" ? record.approvalUi : undefined,
		};
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

function ValueRow({ label, value }: { label: string; value: string | number }): JSX.Element {
	return (
		<div className="flex items-start justify-between gap-4 py-1.5">
			<span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
			<span className="min-w-0 break-words text-right text-[11px] font-medium text-foreground">{value}</span>
		</div>
	);
}

function toEditableData(data: ProjectData | undefined): BatchProjectEditableData {
	return {
		name: data?.name ?? "",
		prompt: data?.prompt ?? "",
		modelKey: data?.modelKey,
		executionMode: data?.executionMode ?? "full-access",
		concurrency: data?.concurrency ?? 1,
		artifactPatterns: data?.artifactPatterns ?? [],
		notifyEnabled: data?.notifyEnabled ?? false,
		timeoutMinutes: data?.timeoutMinutes ?? 60,
		folders: data?.folders ?? [],
		newFolders: data?.newFolders ?? [],
		skill: data?.skill ?? null,
	};
}

function hasCreateRequiredData(data: BatchProjectEditableData): boolean {
	return Boolean(data.name?.trim() && data.prompt?.trim() && (data.folders?.length ?? 0) > 0);
}

function buildApprovedInput(
	input: ProjectInput,
	data: BatchProjectEditableData,
	currentProject: BatchProject | undefined,
): DesktopActionJsonValue {
	const normalized = toBatchProjectApprovalJsonData(data);
	if (input.operation === "create") {
		const { newFolders: _newFolders, skill, ...createData } = normalized;
		return {
			operation: "create",
			data: skill ? { ...createData, skill } : createData,
			approvalUi: input.approvalUi ?? "batch-tasks.project",
		} as DesktopActionJsonValue;
	}
	if (input.operation === "update") {
		const { folders: _folders, ...updateData } = normalized;
		const originalSources = new Set(currentProject?.tasks.map((task) => task.sourcePath) ?? []);
		const newFolders = (normalized.folders ?? []).filter((folder) => !originalSources.has(folder));
		return {
			operation: "update",
			projectId: input.projectId,
			data: { ...updateData, newFolders },
			approvalUi: input.approvalUi ?? "batch-tasks.project",
		} as DesktopActionJsonValue;
	}
	return input as unknown as DesktopActionJsonValue;
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
	approval: ActiveActionApproval;
	parsedInput: ProjectInput | null;
	cachedProject: BatchProject | undefined;
}): JSX.Element {
	const needsProject = parsedInput?.operation === "update" || parsedInput?.operation === "delete";
	const [currentProject, setCurrentProject] = useState<BatchProject | undefined>(cachedProject);
	const [loading, setLoading] = useState(needsProject && !cachedProject);
	const [loadError, setLoadError] = useState<string | null>(null);
	const { request, responding, error, approve, reject } = approval;

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
	const initialFormData = useMemo(() => toEditableData(input?.data), [input?.data]);
	const [formData, setFormData] = useState<BatchProjectEditableData>(initialFormData);

	useEffect(() => {
		setFormData(initialFormData);
	}, [initialFormData]);

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
								拒绝（{approval.countdown.formatted}）
							</Button>
						</div>
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	const approveInput = (): void => {
		if (!input || !isEditable) {
			approve();
			return;
		}
		const approvedInput = buildApprovedInput(input, formData, currentProject);
		console.info("[action-approval:batch-tasks.project] submit", {
			approvalId: request.approvalId,
			input: approvedInput,
		});
		approve(approvedInput);
	};

	const canApprove =
		!responding &&
		(!isEditable || hasCreateRequiredData(formData));

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
				{input?.operation === "create" && (
					<>
						{(formData.executionMode === "full-access" || formData.executionMode === undefined) && (
							<div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
								<span className="icon-[mdi--shield-alert-outline] mt-0.5 h-4 w-4 shrink-0" />
								<p className="text-[11px] leading-5">
									任务将以完全访问模式运行，可读取和修改文件夹内外的文件。请确认提示词和目录来源可信。
								</p>
							</div>
						)}
						<BatchProjectFormFields
							value={formData}
							onChange={setFormData}
							namePlaceholder="新建批量项目"
							folderLabel="源文件夹"
						/>
					</>
				)}

				{input?.operation === "update" && (
					<>
						<div className="rounded-lg border border-border/50 bg-background/50 px-3">
							<ValueRow label="目标项目" value={currentProject?.name ?? "未在当前列表中找到"} />
							<div className="h-px bg-border/40" />
							<ValueRow label="项目路径" value={input.projectId ?? "未知"} />
							<div className="h-px bg-border/40" />
							<ValueRow label="现有任务" value={`${currentProject?.tasks.length ?? "未知"} 个`} />
						</div>
						<BatchProjectFormFields
							value={formData}
							onChange={setFormData}
							namePlaceholder="项目名称"
							folderLabel="文件夹列表"
						/>
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
			</div>

			<div className="border-t border-border/60 px-5 py-4">
				<div className="mb-3 flex items-center justify-between text-[10px] text-muted-foreground">
					<span>请求权限</span>
					<span className="font-mono">{request.permission}</span>
				</div>
				{error && <div className="mb-3 text-[11px] text-destructive">{error}</div>}
				<div className="flex justify-end gap-2">
					<Button variant="outline" size="sm" disabled={responding} onClick={reject}>
						拒绝（{approval.countdown.formatted}）
					</Button>
					<Button
						size="sm"
						variant={isDelete ? "destructive" : "default"}
						disabled={!canApprove}
						onClick={approveInput}
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
