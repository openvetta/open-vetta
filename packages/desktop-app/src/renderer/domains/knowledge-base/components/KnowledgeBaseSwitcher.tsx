import { useState } from "react";
import { useSetAtom } from "jotai";
import { confirmDialogAtom } from "@shared/store/atoms";
import type { KnowledgeBase } from "@shared/types/knowledge-base";
import { Button } from "@shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { cn } from "@shared/lib/utils";
import { KnowledgeRenameDialog } from "./KnowledgeRenameDialog";
import { countKnowledgeNodes } from "../lib/knowledge-base";

interface KnowledgeBaseSwitcherProps {
	bases: KnowledgeBase[];
	activeBase: KnowledgeBase;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onViewAll: () => void;
	onRenameBase: (newName: string) => void;
	onDeleteBase: () => void;
}

const QUICK_LIST_LIMIT = 6;

/** 顶部标题即知识库切换器：大号库名下拉，融合切换 / 查看全部 / 新建 / 改名 / 删除。 */
export function KnowledgeBaseSwitcher({
	bases,
	activeBase,
	onSelect,
	onCreate,
	onViewAll,
	onRenameBase,
	onDeleteBase,
}: KnowledgeBaseSwitcherProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const confirm = useSetAtom(confirmDialogAtom);

	const quickBases = [
		activeBase,
		...bases.filter((base) => base.id !== activeBase.id).sort((a, b) => b.updatedAt - a.updatedAt),
	].slice(0, QUICK_LIST_LIMIT);

	const close = () => setOpen(false);

	const confirmDelete = () => {
		close();
		confirm({
			title: "删除知识库",
			message: `确定删除知识库「${activeBase.name}」及其全部文件吗？该操作不可撤销。`,
			variant: "danger",
			confirmLabel: "删除",
			onConfirm: onDeleteBase,
		});
	};

	return (
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="group flex max-w-full items-center gap-2 text-left"
					>
						<h1 className="truncate text-[24px] font-bold tracking-tight text-foreground">
							{activeBase.name}
						</h1>
						<span
							className={cn(
								"icon-[mdi--chevron-down] h-5 w-5 shrink-0 text-muted-foreground transition-transform",
								open && "rotate-180",
							)}
						/>
						{bases.length > 1 && (
							<span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
								{bases.length}
							</span>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-80 gap-1 p-1.5">
					<div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
						切换知识库
					</div>
					{quickBases.map((base) => {
						const fileCount = countKnowledgeNodes(base.nodes).files;
						const active = base.id === activeBase.id;
						return (
							<Button
								key={base.id}
								type="button"
								variant="ghost"
								onClick={() => {
									onSelect(base.id);
									close();
								}}
								className={cn(
									"h-auto w-full justify-start gap-2.5 px-2 py-2 text-left",
									active ? "bg-primary/10" : "hover:bg-accent",
								)}
							>
								<span
									className={cn(
										"h-4 w-4 shrink-0",
										base.isDefault ? "icon-[mdi--account-circle-outline]" : "icon-[mdi--book-outline]",
										active ? "text-primary" : "text-muted-foreground",
									)}
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-[12px] font-medium text-foreground">{base.name}</p>
									<p className="mt-0.5 text-[10px] text-muted-foreground/55">{fileCount} 个文件</p>
								</div>
								{active && <span className="icon-[mdi--check] h-4 w-4 text-primary" />}
							</Button>
						);
					})}

					<div className="my-1 h-px bg-border/60" />

					{!activeBase.isDefault && (
						<>
							<Button
								type="button"
								variant="ghost"
								onClick={() => {
									close();
									setRenaming(true);
								}}
								className="h-8 w-full justify-start gap-2 px-2 text-[12px] text-foreground"
							>
								<span className="icon-[mdi--rename-outline] h-4 w-4 text-muted-foreground" />
								重命名当前知识库
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={confirmDelete}
								className="h-8 w-full justify-start gap-2 px-2 text-[12px] text-red-600 hover:bg-red-500/10 hover:text-red-600"
							>
								<span className="icon-[mdi--trash-can-outline] h-4 w-4" />
								删除当前知识库
							</Button>
							<div className="my-1 h-px bg-border/60" />
						</>
					)}

					<Button
						type="button"
						variant="ghost"
						onClick={() => {
							onViewAll();
							close();
						}}
						className="h-8 w-full justify-start gap-2 px-2 text-[12px] text-foreground"
					>
						<span className="icon-[mdi--view-grid-outline] h-4 w-4 text-muted-foreground" />
						<span className="flex-1 text-left">查看全部知识库</span>
						<span className="text-[10px] tabular-nums text-muted-foreground/45">{bases.length}</span>
					</Button>
					<Button
						type="button"
						variant="ghost"
						onClick={() => {
							onCreate();
							close();
						}}
						className="h-8 w-full justify-start gap-2 px-2 text-[12px] font-medium text-primary hover:bg-primary/10 hover:text-primary"
					>
						<span className="icon-[mdi--plus] h-4 w-4" />
						新建知识库
					</Button>
				</PopoverContent>
			</Popover>

			{renaming && (
				<KnowledgeRenameDialog
					title="重命名知识库"
					initialName={activeBase.name}
					onClose={() => setRenaming(false)}
					onSubmit={(newName) => {
						setRenaming(false);
						onRenameBase(newName);
					}}
				/>
			)}
		</>
	);
}
