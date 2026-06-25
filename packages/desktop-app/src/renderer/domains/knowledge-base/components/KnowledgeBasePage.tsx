import { useCallback, useEffect, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
	activeKnowledgeBaseIdAtom,
	activityPanelOpenAtom,
	confirmDialogAtom,
	knowledgeBasesAtom,
	knowledgeImportDraftAtom,
	knowledgeViewModeAtom,
	pageHeaderRightSlotAtom,
	pageHeaderTitleBadgeAtom,
	refreshKnowledgeBasesAtom,
	type SessionInfo,
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
import { KnowledgeHowItWorksDialog } from "@shared/components/KnowledgeHowItWorksDialog";
import { knowledgeBaseEnabledAtom } from "@shared/store/plugin-atoms";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function KnowledgeBasePage(): JSX.Element {
	const [knowledgeBases] = useAtom(knowledgeBasesAtom);
	const [activeId, setActiveId] = useAtom(activeKnowledgeBaseIdAtom);
	const [draft, setDraft] = useAtom(knowledgeImportDraftAtom);
	const refresh = useSetAtom(refreshKnowledgeBasesAtom);
	const confirm = useSetAtom(confirmDialogAtom);
	const setTitleBadge = useSetAtom(pageHeaderTitleBadgeAtom);
	const setHeaderRightSlot = useSetAtom(pageHeaderRightSlotAtom);
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const knowledgeBaseEnabled = useAtomValue(knowledgeBaseEnabledAtom);
	const setKnowledgeBaseEnabled = useSetAtom(knowledgeBaseEnabledAtom);
	const [viewMode, setViewMode] = useAtom(knowledgeViewModeAtom);
	const narrow = useNarrowScreen();
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const [howItWorksOpen, setHowItWorksOpen] = useState(false);

	const enableKnowledgeBase = useCallback(() => {
		void (async () => {
			await window.vetta.config.set({ knowledgeBase: { enabled: true } });
			await window.vetta.knowledge.reload();
			setKnowledgeBaseEnabled(true);
		})();
	}, [setKnowledgeBaseEnabled]);

	// 定位最新一轮加工 session 的只读视图并展开活动面板；无记录则弹信息框。
	const openProcessingRecords = useCallback(() => {
		void (async () => {
			const config = await window.vetta.config.get();
			const cwd = config.knowledgeProcessingCwd;
			const list = cwd ? ((await window.vetta.session.listSessions(cwd)) as SessionInfo[]) : [];
			if (list.length === 0) {
				confirm({
					title: "整理记录",
					message: "暂无加工记录。开启知识库并整理资料后，这里会显示每一轮的整理过程。",
					confirmLabel: "知道了",
					onConfirm: () => {},
				});
				return;
			}
			setActivityPanelOpen(true);
			void navigate({ to: "/viewer/$path", params: { path: encodeURIComponent(list[0].path) } });
		})();
	}, [confirm, navigate, setActivityPanelOpen]);

	const openKnowledgeSettings = useCallback(() => {
		void navigate({ to: "/settings/$tab", params: { tab: "knowledge" } });
	}, [navigate]);
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

	// 顶栏右侧插槽：整理记录 / 设置 两个入口，离开即清除。
	useEffect(() => {
		setHeaderRightSlot(
			<>
				<Button variant="ghost" size="sm" onClick={openProcessingRecords}>
					<span className="icon-[mdi--history] h-4 w-4" />
					整理记录
				</Button>
				<Button variant="ghost" size="sm" onClick={openKnowledgeSettings}>
					<span className="icon-[mdi--cog-outline] h-4 w-4" />
					设置
				</Button>
			</>,
		);
		return () => setHeaderRightSlot(null);
	}, [setHeaderRightSlot, openProcessingRecords, openKnowledgeSettings]);

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

	if (!knowledgeBaseEnabled) {
		return (
			<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
				<div className="flex flex-1 items-center justify-center px-8 py-10">
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4, ease: EASE_OUT }}
						className="flex w-full max-w-[420px] flex-col items-center text-center"
					>
						<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
							<span className="icon-[solar--library-linear] h-8 w-8" />
						</div>
						<h1 className="mt-5 text-[20px] font-bold tracking-tight text-foreground">
							知识库尚未开启
						</h1>
						<p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
							开启后，放入的资料会自动整理成 AI 能查阅的知识，聊天时自动参考。知识库会消耗较多
							Token，请按需开启。
						</p>
						<div className="mt-6 flex items-center gap-2.5">
							<Button variant="primary" onClick={enableKnowledgeBase}>
								<span className="icon-[mdi--power] h-4 w-4" />
								开启知识库
							</Button>
							<Button
								variant="ghost"
								onClick={() =>
									void navigate({ to: "/settings/$tab", params: { tab: "knowledge" } })
								}
							>
								前往知识库设置
							</Button>
						</div>
						<button
							type="button"
							onClick={() => setHowItWorksOpen(true)}
							className="mt-4 text-[12px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
						>
							了解它如何工作
						</button>
					</motion.div>
				</div>

				<KnowledgeHowItWorksDialog
					open={howItWorksOpen}
					onClose={() => setHowItWorksOpen(false)}
				/>
			</div>
		);
	}

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
					<p className="mt-0.5 text-[12px] text-muted-foreground/60">
						使用知识库会消耗大量的 Token。
						<button
							type="button"
							onClick={() => setHowItWorksOpen(true)}
							className="font-medium text-primary underline-offset-2 hover:underline"
						>
							查看详情
						</button>
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
						{/* 视图切换：宫格 / 列表，偏好持久化 */}
						<div className="flex items-center rounded-lg bg-muted/55 p-0.5">
							{(
								[
									{ mode: "grid", icon: "icon-[mdi--view-grid-outline]", title: "宫格视图" },
									{ mode: "list", icon: "icon-[mdi--view-list-outline]", title: "列表视图" },
								] as const
							).map(({ mode, icon, title }) => (
								<button
									key={mode}
									type="button"
									title={title}
									aria-pressed={viewMode === mode}
									onClick={() => setViewMode(mode)}
									className={cn(
										"flex h-7 w-7 items-center justify-center rounded-md transition-colors",
										viewMode === mode
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground/60 hover:text-foreground",
									)}
								>
									<span className={cn(icon, "h-4 w-4")} />
								</button>
							))}
						</div>
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

			<KnowledgeHowItWorksDialog
				open={howItWorksOpen}
				onClose={() => setHowItWorksOpen(false)}
			/>
		</div>
	);
}
