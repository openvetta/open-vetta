import { useCallback, useEffect, useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
	activeKnowledgeBaseIdAtom,
	confirmDialogAtom,
	knowledgeBasesAtom,
	knowledgeImportDraftAtom,
	pageHeaderTitleBadgeAtom,
	refreshKnowledgeBasesAtom,
} from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { cn } from "@shared/lib/utils";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { useKnowledgeImportSources } from "../hooks/useKnowledgeImportSources";
import { KnowledgeBaseSwitcher } from "./KnowledgeBaseSwitcher";
import { KnowledgeContentsPanel } from "./KnowledgeContentsPanel";
import { KnowledgeProcessingBadge } from "./KnowledgeProcessingBadge";
import { KnowledgeImportDialog, type KnowledgeImportConfirmation } from "./KnowledgeImportDialog";
import { KnowledgeSourcePicker } from "./KnowledgeSourcePicker";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function KnowledgeBasePage(): JSX.Element {
	const [knowledgeBases] = useAtom(knowledgeBasesAtom);
	const [activeId, setActiveId] = useAtom(activeKnowledgeBaseIdAtom);
	const [draft, setDraft] = useAtom(knowledgeImportDraftAtom);
	const refresh = useSetAtom(refreshKnowledgeBasesAtom);
	const confirm = useSetAtom(confirmDialogAtom);
	const setTitleBadge = useSetAtom(pageHeaderTitleBadgeAtom);
	const narrow = useNarrowScreen();
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const { fileInputRef, openFilePicker, openFolderPicker, onFilesPicked } =
		useKnowledgeImportSources();

	const activeBase = knowledgeBases.find((base) => base.id === activeId) ?? knowledgeBases[0] ?? null;

	// 进页从磁盘重读（反向重建）。
	useEffect(() => {
		void refresh();
	}, [refresh]);

	// 仅本页向顶栏标题右侧插槽注入「正在建立索引…」徽标，离开即清除。
	useEffect(() => {
		setTitleBadge(<KnowledgeProcessingBadge />);
		return () => setTitleBadge(null);
	}, [setTitleBadge]);

	const showError = useCallback(
		(err: unknown) => {
			confirm({
				title: "操作失败",
				message: err instanceof Error ? err.message : String(err),
				confirmLabel: "知道了",
				onConfirm: () => {},
			});
		},
		[confirm],
	);

	const openCreateDialog = useCallback(() => {
		setDraft({ sourcePaths: [], defaultTargetId: null, createOnly: true });
	}, [setDraft]);

	const confirmImport = useCallback(
		async ({ targetId, name, sourcePaths }: KnowledgeImportConfirmation) => {
			setDraft(null);
			try {
				let kbId = targetId;
				if (!kbId) {
					await window.vetta.knowledge.create(name);
					kbId = name;
				}
				if (sourcePaths.length > 0) {
					await window.vetta.knowledge.addFiles(kbId, sourcePaths, false);
				}
				await refresh();
				setActiveId(kbId);
			} catch (err) {
				showError(err);
			}
		},
		[refresh, setActiveId, setDraft, showError],
	);

	const renameBase = useCallback(
		async (newName: string) => {
			if (!activeBase) return;
			try {
				await window.vetta.knowledge.rename(activeBase.id, newName);
				await refresh();
				setActiveId(newName);
			} catch (err) {
				showError(err);
			}
		},
		[activeBase, refresh, setActiveId, showError],
	);

	const deleteBase = useCallback(async () => {
		if (!activeBase) return;
		const remaining = knowledgeBases.filter((base) => base.id !== activeBase.id);
		try {
			await window.vetta.knowledge.delete(activeBase.id);
			setActiveId(remaining[0]?.id ?? null);
			await refresh();
		} catch (err) {
			showError(err);
		}
	}, [activeBase, knowledgeBases, refresh, setActiveId, showError]);

	const pickFilesForActiveBase = () => openFilePicker(activeBase?.id ?? null);
	const pickFoldersForActiveBase = () => void openFolderPicker(activeBase?.id ?? null);

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<Input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFilesPicked} />

			<header
				className={cn(
					"flex shrink-0 gap-4 px-8 pb-4 pt-7",
					narrow ? "flex-col items-stretch" : "items-center justify-between",
				)}
			>
				<motion.div
					initial={{ opacity: 0, y: -8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, ease: EASE_OUT }}
					className="min-w-0"
				>
					{activeBase ? (
						<KnowledgeBaseSwitcher
							bases={knowledgeBases}
							activeBase={activeBase}
							onSelect={setActiveId}
							onCreate={openCreateDialog}
							onViewAll={() => void navigate({ to: "/knowledge/all" })}
							onRenameBase={renameBase}
							onDeleteBase={deleteBase}
						/>
					) : (
						<h1 className="whitespace-nowrap text-[24px] font-bold tracking-tight text-foreground">
							知识库
						</h1>
					)}
					<p className="mt-1 text-[12px] text-muted-foreground/60">
						以熟悉的文件与目录结构管理资料，新增内容会自动完成整理
					</p>
				</motion.div>
				{activeBase && (
					<motion.div
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4, delay: 0.06, ease: EASE_OUT }}
						className={cn(
							"flex shrink-0 items-center gap-2",
							narrow ? "flex-wrap justify-end" : "",
						)}
					>
						<Button variant="ghost" size="icon-sm" title="刷新" onClick={() => void refresh()}>
							<span className="icon-[mdi--refresh] h-4 w-4" />
						</Button>
						<KnowledgeSourcePicker
							onPickFiles={pickFilesForActiveBase}
							onPickFolders={pickFoldersForActiveBase}
						/>
						<div className="relative w-28 sm:w-40">
							<span className="icon-[mdi--magnify] absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
							<Input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="搜索"
								className="h-8 border-transparent bg-muted/55 pl-7 pr-2.5 text-[12px] shadow-none placeholder:text-muted-foreground/45 hover:bg-muted/75 focus-visible:border-primary/25 focus-visible:bg-background/70 focus-visible:ring-1 focus-visible:ring-primary/15"
							/>
						</div>
					</motion.div>
				)}
			</header>

			<AnimatePresence mode="popLayout" initial={false}>
				{activeBase && (
					<motion.div
						key={activeBase.id}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.24, ease: EASE_OUT }}
						className="flex min-h-0 flex-1"
					>
						<KnowledgeContentsPanel
							knowledgeBase={activeBase}
							search={search}
							onPickFiles={pickFilesForActiveBase}
							onPickFolders={pickFoldersForActiveBase}
						/>
					</motion.div>
				)}
			</AnimatePresence>

			{draft && (
				<KnowledgeImportDialog
					draft={draft}
					activeKnowledgeBaseId={activeBase?.id ?? null}
					knowledgeBases={knowledgeBases}
					onClose={() => setDraft(null)}
					onConfirm={confirmImport}
				/>
			)}
		</div>
	);
}
