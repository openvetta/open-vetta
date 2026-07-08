import type { DesktopActionApprovalRequest, DesktopActionJsonValue } from "@preload/api.js";
import {
	BatchProjectFormFields,
	type BatchProjectEditableData,
	toBatchProjectApprovalJsonData,
} from "@domains/batch-tasks/components/BatchProjectFormFields";
import { batchProjectsAtom, type BatchProject } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Drawer, DrawerContent } from "../../components/ui/drawer";
import { BatchTasksApprovalFrameView } from "./BatchTasksApprovalFrameView";
import { useActionApproval, type ActiveActionApproval } from "../useActionApproval";

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
	const parsedInput = useMemo(
		() => (approval ? parseProjectInput(approval.request.input) : null),
		[approval?.request.input],
	);
	if (!approval) return null;
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
	const { t } = useTranslation("common");
	const needsProject = parsedInput?.operation === "update" || parsedInput?.operation === "delete";
	const [currentProject, setCurrentProject] = useState<BatchProject | undefined>(cachedProject);
	const [loading, setLoading] = useState(needsProject && !cachedProject);
	const [loadError, setLoadError] = useState<string | null>(null);
	const { request, responding, error, approve, reject } = approval;
	const ThemedBatchTasksApprovalFrameView = useThemeComponent(
		"root.approval.batchTasksFrameView",
		BatchTasksApprovalFrameView,
	);

	useEffect(() => {
		console.info("[action-approval:batch-tasks.project] request " + JSON.stringify({
			approvalId: request.approvalId,
			input: request.input,
			parsedInput,
			cachedProject,
		}));
	}, [cachedProject, parsedInput, request.approvalId, request.input]);

	useEffect(() => {
		if (!needsProject) return;
		if (cachedProject) {
			console.info("[action-approval:batch-tasks.project] source " + JSON.stringify({
				approvalId: request.approvalId,
				source: "atom",
				project: cachedProject,
			}));
			return;
		}
		let cancelled = false;
		void window.vetta.batchTasks
			.getProjects()
			.then((projects) => {
				if (cancelled) return;
				const project = getCurrentProject(projects, parsedInput?.projectId);
				console.info("[action-approval:batch-tasks.project] query " + JSON.stringify({
					approvalId: request.approvalId,
					requestedProjectId: parsedInput?.projectId,
					returnedProjectIds: projects.map((candidate) => candidate.id),
					matchedProject: project,
				}));
				setCurrentProject(project);
				if (!project) setLoadError(t("batchTasksApproval.projectLoadNotFound"));
			})
			.catch((error: unknown) => {
				console.error("[action-approval:batch-tasks.project] query-failed " + JSON.stringify({
					approvalId: request.approvalId,
					requestedProjectId: parsedInput?.projectId,
					error,
				}));
				if (!cancelled) setLoadError(t("batchTasksApproval.projectLoadFailed"));
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
		console.info(`[action-approval:batch-tasks.project] merged ${JSON.stringify({
			approvalId: request.approvalId,
			currentProject,
			agentPatch: parsedInput?.data,
			mergedInput: input,
		})}`);
	}, [currentProject, input, parsedInput?.data, request.approvalId]);

	if (loading) {
		return (
			<Drawer open direction="right" dismissible={false}>
				<DrawerContent className="w-[min(560px,calc(100vw-2rem))] sm:max-w-[560px]">
					<div className="min-h-0 flex-1 overflow-y-auto">
						<div className="py-10 text-center text-[12px] text-muted-foreground">
							{t("batchTasksApproval.projectLoading")}
						</div>
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	if (parsedInput?.operation === "update" && !currentProject) {
		return (
			<ThemedBatchTasksApprovalFrameView
				presentation="drawer"
				title={t("batchTasksApproval.projectUpdateTitle")}
				summary={request.summary}
				icon="icon-[mdi--folder-cog-outline]"
				labels={{
					reject: t("actionApproval.reject"),
					confirm: t("batchTasksApproval.confirmAction", { action: t("batchTasksApproval.fallbackAction") }),
					responding: t("actionApproval.processing"),
					permission: t("actionApproval.permission", { permission: request.permission }),
				}}
				responding={responding}
				countdown={approval.countdown.formatted}
				canApprove={false}
				onReject={reject}
				onApprove={() => approve()}
			>
				<div className="py-10 text-center text-[12px] text-destructive">{loadError}</div>
			</ThemedBatchTasksApprovalFrameView>
		);
	}

	const approveInput = (): void => {
		if (!input || !isEditable) {
			approve();
			return;
		}
		const approvedInput = buildApprovedInput(input, formData, currentProject);
		console.info(`[action-approval:batch-tasks.project] submit ${JSON.stringify({
			approvalId: request.approvalId,
			input: approvedInput,
		})}`);
		approve(approvedInput);
	};

	const canApprove =
		!responding &&
		(!isEditable || hasCreateRequiredData(formData));
	const operationLabel = input ? getProjectOperationLabel(input.operation, t) : null;
	const display = input ? getProjectOperationDisplay(input.operation, t) : null;

	const body = (
		<>
				{input?.operation === "create" && (
					<>
						{(formData.executionMode === "full-access" || formData.executionMode === undefined) && (
							<div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/15 p-3 text-amber-400">
								<span className="icon-[mdi--shield-alert-outline] mt-0.5 h-4 w-4 shrink-0" />
								<p className="text-[11px] leading-5">
									{t("batchTasksApproval.projectFullAccessWarning")}
								</p>
							</div>
						)}
						<BatchProjectFormFields
							value={formData}
							onChange={setFormData}
							namePlaceholder={t("batchTasksApproval.newProjectNamePlaceholder")}
							folderLabel={t("batchTasksApproval.sourceFolders")}
						/>
					</>
				)}

				{input?.operation === "update" && (
					<>
						<div className="rounded-lg border border-border/50 bg-background/50 px-3">
							<ValueRow label={t("batchTasksApproval.targetProject")} value={currentProject?.name ?? t("batchTasksApproval.notFoundInCurrentList")} />
							<div className="h-px bg-border/40" />
							<ValueRow label={t("batchTasksApproval.projectPath")} value={input.projectId ?? t("batchTasksApproval.unknown")} />
							<div className="h-px bg-border/40" />
							<ValueRow label={t("batchTasksApproval.existingTasks")} value={t("batchTasksApproval.count", { count: currentProject?.tasks.length ?? t("batchTasksApproval.unknown") })} />
						</div>
						<BatchProjectFormFields
							value={formData}
							onChange={setFormData}
							namePlaceholder={t("batchTasksApproval.projectNamePlaceholder")}
							folderLabel={t("batchTasksApproval.folderList")}
						/>
					</>
				)}

				{input?.operation === "delete" && (
					<>
						<div className="rounded-lg border border-border/50 bg-background/50 px-3">
							<ValueRow label={t("batchTasksApproval.targetProject")} value={currentProject?.name ?? t("batchTasksApproval.notFoundInCurrentList")} />
							<div className="h-px bg-border/40" />
							<ValueRow label={t("batchTasksApproval.projectPath")} value={input.projectId ?? t("batchTasksApproval.unknown")} />
							<div className="h-px bg-border/40" />
							<ValueRow label={t("batchTasksApproval.includedTasks")} value={t("batchTasksApproval.count", { count: currentProject?.tasks.length ?? t("batchTasksApproval.unknown") })} />
						</div>
						<div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
							<span className="icon-[mdi--alert-outline] mt-0.5 h-4 w-4 shrink-0" />
							<p className="text-[11px] leading-5">
								{t("batchTasksApproval.projectDeleteWarning")}
							</p>
						</div>
					</>
				)}

				{!input && (
					<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[10px] leading-4 text-foreground">
						{JSON.stringify(request.input, null, 2)}
					</pre>
				)}
		</>
	);

	return (
		<ThemedBatchTasksApprovalFrameView
			presentation={isEditable ? "drawer" : "dialog"}
			title={display?.title ?? t("batchTasksApproval.projectFallbackTitle")}
			summary={display?.summary ?? request.summary}
			icon={isDelete ? "icon-[mdi--folder-remove-outline]" : "icon-[mdi--folder-cog-outline]"}
			badge={operationLabel ?? undefined}
			destructive={isDelete}
			labels={{
				reject: t("actionApproval.reject"),
				confirm: t("batchTasksApproval.confirmAction", { action: operationLabel ?? t("batchTasksApproval.fallbackAction") }),
				responding: t("actionApproval.processing"),
				permission: t("actionApproval.permission", { permission: request.permission }),
			}}
			responding={responding}
			countdown={approval.countdown.formatted}
			canApprove={canApprove}
			error={error}
			onReject={reject}
			onApprove={approveInput}
		>
			{body}
		</ThemedBatchTasksApprovalFrameView>
	);
}

function getProjectOperationLabel(operation: ProjectInput["operation"], t: ReturnType<typeof useTranslation<"common">>["t"]): string {
	switch (operation) {
		case "create":
			return t("batchTasksApproval.projectCreateLabel");
		case "update":
			return t("batchTasksApproval.projectUpdateLabel");
		case "delete":
			return t("batchTasksApproval.projectDeleteLabel");
	}
}

function getProjectOperationDisplay(operation: ProjectInput["operation"], t: ReturnType<typeof useTranslation<"common">>["t"]): { title: string; summary: string } {
	switch (operation) {
		case "create":
			return {
				title: t("batchTasksApproval.projectCreateTitle"),
				summary: t("batchTasksApproval.projectCreateSummary"),
			};
		case "update":
			return {
				title: t("batchTasksApproval.projectUpdateTitle"),
				summary: t("batchTasksApproval.projectUpdateSummary"),
			};
		case "delete":
			return {
				title: t("batchTasksApproval.projectDeleteTitle"),
				summary: t("batchTasksApproval.projectDeleteSummary"),
			};
	}
}
