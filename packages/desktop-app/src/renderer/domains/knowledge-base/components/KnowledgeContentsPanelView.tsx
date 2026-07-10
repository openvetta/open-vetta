import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import type { useKnowledgeContentsModel } from "../hooks/useKnowledgeContentsModel";
import { KnowledgeBreadcrumb } from "./KnowledgeBreadcrumb";
import { KnowledgeContextMenu } from "./KnowledgeContextMenu";
import { KnowledgeFilesSkeleton } from "./KnowledgeFilesSkeleton";
import { KnowledgeGrid } from "./KnowledgeGrid";
import { KnowledgeList } from "./KnowledgeList";
import { KnowledgeRenameDialog } from "./KnowledgeRenameDialog";
import { KnowledgeSourcePicker } from "./KnowledgeSourcePicker";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

interface KnowledgeContentsPanelViewProps {
	hasNodes: boolean;
	model: ReturnType<typeof useKnowledgeContentsModel>;
	onPickFiles: () => void;
	onPickFolders: () => void;
}

export function KnowledgeContentsPanelView({
	hasNodes,
	model,
	onPickFiles,
	onPickFolders,
}: KnowledgeContentsPanelViewProps): JSX.Element {
	const { t } = useTranslation("settings");
	const View = model.viewMode === "list" ? KnowledgeList : KnowledgeGrid;

	return (
		<div className="flex min-h-0 flex-1 gap-4 px-8 pb-8">
			<motion.div
				initial={{ opacity: 0, scale: 0.995 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.32, delay: 0.04, ease: EASE_OUT }}
				className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
			>
				{model.path.length > 0 ? (
					<KnowledgeBreadcrumb
						baseName={model.baseName}
						path={model.path}
						onNavigate={model.navigateBreadcrumb}
					/>
				) : null}

				{!hasNodes ? (
					// biome-ignore lint/a11y/useKeyWithClickEvents: 背景点击仅用于取消选择，键盘可用 Esc
					<div className="min-h-0 flex-1 overflow-y-auto py-3" onClick={model.onBackgroundClick}>
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.45, ease: EASE_OUT }}
							className="flex h-full min-h-[260px] items-center justify-center"
						>
							<div className="flex max-w-sm flex-col items-center px-8 text-center">
								<div className="relative mb-5 flex h-20 w-20 items-center justify-center">
									<span className="absolute inset-0 rounded-[1.75rem] bg-primary/10" />
									<span className="absolute inset-2 rounded-3xl bg-background/60 ring-1 ring-inset ring-primary/15" />
									<span className="icon-[mdi--folder-open-outline] relative h-9 w-9 text-primary/70" />
								</div>
								<h2 className="text-[15px] font-semibold text-foreground">{t("kbEmptyBaseTitle")}</h2>
								<p className="mt-1.5 text-[12px] leading-5 text-muted-foreground/60">
									{t("kbEmptyBaseDesc")}
								</p>
								<div className="mt-5">
									<KnowledgeSourcePicker onPickFiles={onPickFiles} onPickFolders={onPickFolders} />
								</div>
							</div>
						</motion.div>
					</div>
				) : model.levelPending ? (
					// 进入未加载目录：骨架代替空态，避免「空目录」闪一下
					<div className="-mx-8 flex min-h-0 flex-1">
						<KnowledgeFilesSkeleton />
					</div>
				) : (
					<View
						nodes={model.visibleNodes}
						searching={model.query.length > 0}
						selectedIds={model.selectedIds}
						statusFor={model.statusFor}
						onItemClick={model.onItemClick}
						onOpen={model.openNode}
						onContextMenu={model.onContextMenu}
						onSelectIds={model.setSelectedIds}
						onClearSelection={model.clearSelection}
					/>
				)}
			</motion.div>

			{model.menu && (
				<KnowledgeContextMenu
					x={model.menu.x}
					y={model.menu.y}
					items={model.menuItems}
					onClose={() => model.setMenu(null)}
				/>
			)}

			{model.renameNode && (
				<KnowledgeRenameDialog
					title={t("kbMenuRename")}
					initialName={model.renameNode.name}
					onClose={() => model.setRenameNode(null)}
					onSubmit={model.submitRename}
				/>
			)}
		</div>
	);
}
