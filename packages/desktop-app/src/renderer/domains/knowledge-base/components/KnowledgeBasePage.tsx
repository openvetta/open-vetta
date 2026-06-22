import { useCallback } from "react";
import { useAtom } from "jotai";
import {
	activeKnowledgeBaseIdAtom,
	knowledgeBasesAtom,
	knowledgeImportDraftAtom,
} from "@shared/store/atoms";
import type { KnowledgeBase } from "@shared/types/knowledge-base";
import { Button } from "@shared/components/ui/button";
import { useKnowledgeImportSources } from "../hooks/useKnowledgeImportSources";
import { createKnowledgeId } from "../lib/knowledge-base";
import { KnowledgeBaseEmptyState } from "./KnowledgeBaseEmptyState";
import { KnowledgeContentsPanel } from "./KnowledgeContentsPanel";
import {
	KnowledgeImportDialog,
	type KnowledgeImportConfirmation,
} from "./KnowledgeImportDialog";
import { KnowledgeSourcePicker } from "./KnowledgeSourcePicker";

export function KnowledgeBasePage(): JSX.Element {
	const [knowledgeBases, setKnowledgeBases] = useAtom(knowledgeBasesAtom);
	const [activeId, setActiveId] = useAtom(activeKnowledgeBaseIdAtom);
	const [draft, setDraft] = useAtom(knowledgeImportDraftAtom);
	const { fileInputRef, openFilePicker, openFolderPicker, onFilesPicked } =
		useKnowledgeImportSources();

	const activeBase = knowledgeBases.find((base) => base.id === activeId) ?? knowledgeBases[0] ?? null;

	const openCreateDialog = useCallback(() => {
		setDraft({ items: [], targetKnowledgeBaseId: null, source: "create" });
	}, [setDraft]);

	const selectKnowledgeBase = useCallback(
		(id: string) => {
			setActiveId(id);
		},
		[setActiveId],
	);

	const confirmImport = useCallback(
		({ targetId, name, description, nodes }: KnowledgeImportConfirmation) => {
			if (targetId) {
				setKnowledgeBases((current) =>
					current.map((base) =>
						base.id === targetId
							? { ...base, updatedAt: Date.now(), nodes: [...base.nodes, ...nodes] }
							: base,
					),
				);
				setActiveId(targetId);
			} else {
				const newBase: KnowledgeBase = {
					id: createKnowledgeId("kb"),
					name,
					description,
					updatedAt: Date.now(),
					nodes,
				};
				setKnowledgeBases((current) => [...current, newBase]);
				setActiveId(newBase.id);
			}
			setDraft(null);
		},
		[setActiveId, setDraft, setKnowledgeBases],
	);

	const pickFilesForActiveBase = () => openFilePicker(activeBase?.id ?? null);
	const pickFoldersForActiveBase = () => void openFolderPicker(activeBase?.id ?? null);

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFilesPicked} />

			<header className="flex shrink-0 items-center justify-between gap-4 px-8 pb-4 pt-7">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h1 className="text-[24px] font-bold tracking-tight text-foreground">知识库</h1>
						{knowledgeBases.length > 0 && (
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
								{knowledgeBases.length}
							</span>
						)}
					</div>
					<p className="mt-1 text-[12px] text-muted-foreground/60">
						以熟悉的文件与目录结构管理资料，新增内容会自动完成整理
					</p>
				</div>
				{activeBase && (
					<div className="flex shrink-0 items-center gap-2">
						<KnowledgeSourcePicker
							onPickFiles={pickFilesForActiveBase}
							onPickFolders={pickFoldersForActiveBase}
						/>
						<Button variant="primary" onClick={openCreateDialog}>
							<span className="icon-[mdi--plus] h-4 w-4" />
							新建知识库
						</Button>
					</div>
				)}
			</header>

			{activeBase ? (
				<KnowledgeContentsPanel
					key={activeBase.id}
					knowledgeBases={knowledgeBases}
					knowledgeBase={activeBase}
					onSelectKnowledgeBase={selectKnowledgeBase}
					onCreateKnowledgeBase={openCreateDialog}
					onPickFiles={pickFilesForActiveBase}
					onPickFolders={pickFoldersForActiveBase}
				/>
			) : (
				<KnowledgeBaseEmptyState
					onCreate={openCreateDialog}
					onPickFiles={() => openFilePicker(null)}
					onPickFolders={() => void openFolderPicker(null)}
				/>
			)}

			{draft && (
				<KnowledgeImportDialog
					draft={draft}
					knowledgeBases={knowledgeBases}
					activeKnowledgeBaseId={activeBase?.id ?? null}
					onClose={() => setDraft(null)}
					onConfirm={confirmImport}
				/>
			)}
		</div>
	);
}
