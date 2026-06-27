import type { ModelsConfigData } from "@preload/api";
import {
	type BatchProject,
	remoteProvidersAtom,
} from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	BatchProjectFormFields,
	type BatchProjectEditableData,
	normalizeConcurrency,
	normalizeTimeout,
	toBatchProjectApprovalJsonData,
} from "./BatchProjectFormFields";
import { useBatchTasks } from "../hooks/useBatchTasks";

interface BatchProjectDialogProps {
	open: boolean;
	project?: BatchProject;
	onClose: () => void;
}

function getProjectData(project: BatchProject | undefined): BatchProjectEditableData {
	return {
		name: project?.name ?? "",
		prompt: project?.prompt ?? "",
		modelKey: project?.modelKey,
		executionMode: project?.executionMode ?? "full-access",
		concurrency: project?.concurrency ?? 1,
		timeoutMinutes: project?.timeoutMinutes ?? 60,
		folders: project?.tasks.map((task) => task.sourcePath) ?? [],
		artifactPatterns: project?.artifactPatterns ?? [],
		notifyEnabled: project?.notifyEnabled ?? false,
		skill: project?.skill ?? null,
	};
}

function flattenModelKeys(config: ModelsConfigData, remoteProviders: ModelsConfigData["providers"]): string[] {
	const localKeys = Object.entries(config.providers).flatMap(([provider, providerConfig]) =>
		(providerConfig.models ?? []).map((model) => `${provider}/${model.id}`)
	);
	const localKeySet = new Set(localKeys);
	const remoteKeys = Object.entries(remoteProviders).flatMap(([provider, providerConfig]) =>
		(providerConfig.models ?? [])
			.map((model) => `${provider}/${model.id}`)
			.filter((key) => !localKeySet.has(key))
	);
	return [...localKeys, ...remoteKeys];
}

export function BatchProjectDialog({ open, project, onClose }: BatchProjectDialogProps): JSX.Element {
	const { t } = useTranslation("batch-tasks");
	const { createProject, updateProject } = useBatchTasks();
	const remoteProviders = useAtomValue(remoteProvidersAtom);
	const [data, setData] = useState<BatchProjectEditableData>(() => getProjectData(project));

	useEffect(() => {
		setData(getProjectData(project));
	}, [project]);

	useEffect(() => {
		if (!open) return;
		void window.vetta.models.get().then((config) => {
			const allModelKeys = flattenModelKeys(config, remoteProviders as ModelsConfigData["providers"]);
			const currentSelected = localStorage.getItem("vetta-selected-model") ?? undefined;
			const fallback = project?.modelKey ?? currentSelected ?? config.defaultModel;
			setData((current) => {
				if (current.modelKey && allModelKeys.includes(current.modelKey)) return current;
				if (fallback && allModelKeys.includes(fallback)) return { ...current, modelKey: fallback };
				return allModelKeys[0] ? { ...current, modelKey: allModelKeys[0] } : { ...current, modelKey: undefined };
			});
		});
	}, [open, project?.modelKey, remoteProviders]);

	const canSubmit = useMemo(
		() => Boolean(data.name?.trim() && data.prompt?.trim() && (data.folders?.length ?? 0) > 0),
		[data.folders?.length, data.name, data.prompt],
	);

	const handleSubmit = async (): Promise<void> => {
		if (!canSubmit) return;
		const normalized = toBatchProjectApprovalJsonData(data);
		const artifactPatterns = normalized.artifactPatterns ?? [];
		const safeTimeoutMinutes = normalizeTimeout(normalized.timeoutMinutes);
		const concurrency = normalizeConcurrency(normalized.concurrency);

		if (project) {
			const originalSources = new Set(project.tasks.map((task) => task.sourcePath));
			const newFolders = (normalized.folders ?? []).filter((folder) => !originalSources.has(folder));
			await updateProject(project.id, {
				name: normalized.name ?? "",
				prompt: normalized.prompt ?? "",
				modelKey: normalized.modelKey,
				executionMode: normalized.executionMode,
				concurrency,
				artifactPatterns,
				notifyEnabled: normalized.notifyEnabled ?? false,
				timeoutMinutes: safeTimeoutMinutes,
				newFolders,
				skill: normalized.skill ?? null,
			});
		} else {
			await createProject({
				name: normalized.name ?? "",
				prompt: normalized.prompt ?? "",
				modelKey: normalized.modelKey,
				executionMode: normalized.executionMode,
				folders: normalized.folders ?? [],
				concurrency,
				artifactPatterns,
				notifyEnabled: normalized.notifyEnabled ?? false,
				timeoutMinutes: safeTimeoutMinutes,
				skill: normalized.skill ?? undefined,
			});
		}
		onClose();
	};

	return (
		<Dialog open={open} onOpenChange={(value) => !value && onClose()}>
			<DialogContent
				className="flex max-h-[82vh] flex-col gap-0 overflow-hidden rounded-xl border border-border/60 bg-card/95 p-0 backdrop-blur-md sm:max-w-xl"
				showCloseButton={false}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>{project ? t("dialog.editTitle") : t("dialog.newTitle")}</DialogTitle>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto px-7 pt-6 pb-4">
					<BatchProjectFormFields
						value={data}
						onChange={setData}
						namePlaceholder={project ? t("dialog.namePlaceholderEdit") : t("dialog.namePlaceholderNew")}
					/>
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-border/40 px-5 py-3">
					<Button
						variant="ghost"
						onClick={onClose}
						className="h-9 rounded-lg px-3 text-[13px] text-muted-foreground hover:text-foreground"
					>
						<span className="icon-[mdi--close] h-4 w-4" />
						<span>{t("dialog.cancel")}</span>
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!canSubmit}
						className="h-9 rounded-lg bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary/90"
					>
						<span className="icon-[mdi--check] h-4 w-4" />
						<span>{project ? t("dialog.save") : t("dialog.create")}</span>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
