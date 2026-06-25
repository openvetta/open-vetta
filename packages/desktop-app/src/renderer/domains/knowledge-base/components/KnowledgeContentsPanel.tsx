import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { motion } from "motion/react";
import {
	confirmDialogAtom,
	filePreviewAtom,
	knowledgeFileStatusesAtom,
	knowledgeViewModeAtom,
	refreshKnowledgeBasesAtom,
} from "@shared/store/atoms";
import type {
	KnowledgeBase,
	KnowledgeNode,
	KnowledgeProcessStatus,
} from "@shared/types/knowledge-base";
import { cn } from "@shared/lib/utils";
import { KnowledgeSourcePicker } from "./KnowledgeSourcePicker";
import { KnowledgeGrid } from "./KnowledgeGrid";
import { KnowledgeList } from "./KnowledgeList";
import { KnowledgeRenameDialog } from "./KnowledgeRenameDialog";
import { type ContextMenuItem, KnowledgeContextMenu } from "./KnowledgeContextMenu";
import { knowledgeNodeMatches, nodesAtPath } from "../lib/knowledge-base";

interface KnowledgeContentsPanelProps {
	knowledgeBase: KnowledgeBase;
	/** 搜索词（在页面顶部右上角输入，过滤当前目录）。 */
	search: string;
	onPickFiles: () => void;
	onPickFolders: () => void;
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type MenuState = { x: number; y: number; node: KnowledgeNode };

export function KnowledgeContentsPanel({
	knowledgeBase,
	search,
	onPickFiles,
	onPickFolders,
}: KnowledgeContentsPanelProps): JSX.Element {
	const [path, setPath] = useState<string[]>([]);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [anchorId, setAnchorId] = useState<string | null>(null);
	const [menu, setMenu] = useState<MenuState | null>(null);
	const [renameNode, setRenameNode] = useState<KnowledgeNode | null>(null);
	const confirm = useSetAtom(confirmDialogAtom);
	const refresh = useSetAtom(refreshKnowledgeBasesAtom);
	const openPreview = useSetAtom(filePreviewAtom);
	const fileStatuses = useAtomValue(knowledgeFileStatusesAtom);
	const viewMode = useAtomValue(knowledgeViewModeAtom);

	// 文件加工态：key 为 source_path（`${kbId}/${node.id}`）。目录无加工态返回 null。
	const statusFor = useCallback(
		(node: KnowledgeNode): KnowledgeProcessStatus | null => {
			if (node.type !== "file") return null;
			return fileStatuses[`${knowledgeBase.id}/${node.id}`]?.status ?? "unprocessed";
		},
		[fileStatuses, knowledgeBase.id],
	);

	// 加工产物 wiki md 的绝对路径（无则未加工，不提供「查看 wiki」）。
	const wikiPathFor = useCallback(
		(node: KnowledgeNode): string | undefined =>
			node.type === "file" ? fileStatuses[`${knowledgeBase.id}/${node.id}`]?.wikiPath : undefined,
		[fileStatuses, knowledgeBase.id],
	);

	const openWiki = useCallback(
		(wikiPath: string) => {
			const name = wikiPath.split(/[/\\]/).pop() ?? "wiki.md";
			openPreview({ items: [{ name, path: wikiPath }], index: 0 });
		},
		[openPreview],
	);

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
		setAnchorId(null);
	}, []);

	// 切库回根目录。
	// biome-ignore lint/correctness/useExhaustiveDependencies: 仅在切库时重置
	useEffect(() => setPath([]), [knowledgeBase.id]);
	// 切目录/库后清空选中。
	useEffect(() => {
		clearSelection();
	}, [path, knowledgeBase.id, clearSelection]);

	// 后台加工每批完成重建索引后会广播；据此重取文件加工态，让侧边栏状态与索引同步推进。
	useEffect(() => window.vetta.knowledge.onStatusesChanged(() => void refresh()), [refresh]);

	const currentNodes = useMemo(
		() => nodesAtPath(knowledgeBase.nodes, path),
		[knowledgeBase.nodes, path],
	);
	const query = search.trim().toLocaleLowerCase();
	const visibleNodes = useMemo(
		() => (query ? currentNodes.filter((node) => knowledgeNodeMatches(node, query)) : currentNodes),
		[currentNodes, query],
	);
	const filesAtLevel = useMemo(
		() => currentNodes.filter((node) => node.type === "file"),
		[currentNodes],
	);

	const openNode = useCallback(
		(node: KnowledgeNode) => {
			if (node.type === "directory") {
				setPath((prev) => [...prev, node.name]);
				return;
			}
			if (!node.sourcePath) return;
			const index = filesAtLevel.findIndex((item) => item.id === node.id);
			if (index < 0) return;
			openPreview({
				items: filesAtLevel.map((item) => ({
					name: item.name,
					path: item.sourcePath,
					size: item.size,
				})),
				index,
			});
		},
		[filesAtLevel, openPreview],
	);

	const onItemClick = useCallback(
		(node: KnowledgeNode, event: React.MouseEvent) => {
			if (event.shiftKey && anchorId) {
				const a = visibleNodes.findIndex((n) => n.id === anchorId);
				const b = visibleNodes.findIndex((n) => n.id === node.id);
				if (a >= 0 && b >= 0) {
					const [lo, hi] = a < b ? [a, b] : [b, a];
					setSelectedIds(new Set(visibleNodes.slice(lo, hi + 1).map((n) => n.id)));
				}
				return;
			}
			if (event.metaKey || event.ctrlKey) {
				setSelectedIds((prev) => {
					const next = new Set(prev);
					if (next.has(node.id)) next.delete(node.id);
					else next.add(node.id);
					return next;
				});
				setAnchorId(node.id);
				return;
			}
			setSelectedIds(new Set([node.id]));
			setAnchorId(node.id);
		},
		[anchorId, visibleNodes],
	);

	const onContextMenu = useCallback(
		(node: KnowledgeNode, event: React.MouseEvent) => {
			// 右键未选中项时，先把它设为唯一选中（已选中则保留当前多选）。
			if (!selectedIds.has(node.id)) {
				setSelectedIds(new Set([node.id]));
				setAnchorId(node.id);
			}
			setMenu({ x: event.clientX, y: event.clientY, node });
		},
		[selectedIds],
	);

	const deleteIds = useCallback(
		(ids: string[], label: string) => {
			confirm({
				title: "删除",
				message: `确定从「${knowledgeBase.name}」删除${label}吗？该操作不可撤销。`,
				variant: "danger",
				confirmLabel: "删除",
				onConfirm: () => {
					void (async () => {
						for (const id of ids) {
							await window.vetta.knowledge.deleteEntry(knowledgeBase.id, id).catch(() => {});
						}
						clearSelection();
						await refresh();
					})();
				},
			});
		},
		[confirm, knowledgeBase.id, knowledgeBase.name, refresh, clearSelection],
	);

	const deleteWiki = useCallback(
		(ids: string[], label: string) => {
			confirm({
				title: "删除 wiki",
				message: `确定删除${label}已整理出的 wiki 笔记吗？原始文件保留，下次整理会重新整理。`,
				variant: "danger",
				confirmLabel: "删除 wiki",
				onConfirm: () => {
					void (async () => {
						await window.vetta.knowledge.deleteWiki(knowledgeBase.id, ids).catch(() => {});
						clearSelection();
						await refresh();
					})();
				},
			});
		},
		[confirm, knowledgeBase.id, refresh, clearSelection],
	);

	const submitRename = useCallback(
		(newName: string) => {
			const node = renameNode;
			setRenameNode(null);
			if (!node) return;
			void window.vetta.knowledge.renameEntry(knowledgeBase.id, node.id, newName).then(() => refresh());
		},
		[renameNode, knowledgeBase.id, refresh],
	);

	const menuItems = useMemo((): ContextMenuItem[] => {
		if (!menu) return [];
		const ids = [...selectedIds];
		if (ids.length > 1) {
			return [
				{
					label: `删除选中 ${ids.length} 项的 wiki`,
					icon: "icon-[mdi--file-document-remove-outline]",
					onClick: () => deleteWiki(ids, `选中的 ${ids.length} 项`),
				},
				{
					label: `删除选中的 ${ids.length} 项`,
					icon: "icon-[mdi--trash-can-outline]",
					danger: true,
					onClick: () => deleteIds(ids, `选中的 ${ids.length} 项`),
				},
			];
		}
		const node = menu.node;
		const wikiPath = wikiPathFor(node);
		return [
			...(wikiPath
				? [
						{
							label: "查看 wiki",
							icon: "icon-[mdi--text-box-search-outline]",
							onClick: () => openWiki(wikiPath),
						},
						{
							label: "删除 wiki",
							icon: "icon-[mdi--file-document-remove-outline]",
							onClick: () => deleteWiki([node.id], `「${node.name}」`),
						},
					]
				: []),
			{
				label: "重命名",
				icon: "icon-[mdi--rename-outline]",
				onClick: () => setRenameNode(node),
			},
			{
				label: "删除",
				icon: "icon-[mdi--trash-can-outline]",
				danger: true,
				onClick: () => deleteIds([node.id], `「${node.name}」`),
			},
		];
	}, [menu, selectedIds, deleteIds, deleteWiki, wikiPathFor, openWiki]);

	const onBackgroundClick = useCallback(
		(event: React.MouseEvent) => {
			if (!(event.target as HTMLElement).closest("[data-knode]")) clearSelection();
		},
		[clearSelection],
	);

	return (
		<div className="flex min-h-0 flex-1 gap-4 px-8 pb-8">
			<motion.div
				initial={{ opacity: 0, scale: 0.995 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.32, delay: 0.04, ease: EASE_OUT }}
				className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
			>
				{/* 仅进入子目录时显示面包屑（根目录无栏）；选中后批量操作走右键菜单 */}
				{path.length > 0 ? (
					<div className="flex shrink-0 items-center gap-1 py-1.5 text-[12px]">
						<button
							type="button"
							onClick={() => setPath([])}
							className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent/60"
						>
							<span className="icon-[mdi--folder-home-outline] h-3.5 w-3.5" />
							{knowledgeBase.name}
						</button>
						{path.map((segment, index) => (
							<span key={`${segment}-${index}`} className="flex items-center gap-1">
								<span className="icon-[mdi--chevron-right] h-3.5 w-3.5 text-muted-foreground/40" />
								<button
									type="button"
									onClick={() => setPath(path.slice(0, index + 1))}
									className={cn(
										"rounded px-1.5 py-0.5 transition-colors hover:bg-accent/60",
										index === path.length - 1 ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{segment}
								</button>
							</span>
						))}
					</div>
				) : null}

				{knowledgeBase.nodes.length === 0 ? (
					// biome-ignore lint/a11y/useKeyWithClickEvents: 背景点击仅用于取消选择，键盘可用 Esc
					<div className="min-h-0 flex-1 overflow-y-auto py-3" onClick={onBackgroundClick}>
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
								<h2 className="text-[15px] font-semibold text-foreground">这个知识库还是空的</h2>
								<p className="mt-1.5 text-[12px] leading-5 text-muted-foreground/60">
									拖入文件或文件夹，Vetta 会自动分析内容并整理归类
								</p>
								<div className="mt-5">
									<KnowledgeSourcePicker onPickFiles={onPickFiles} onPickFolders={onPickFolders} />
								</div>
							</div>
						</motion.div>
					</div>
				) : (
					(() => {
						const View = viewMode === "list" ? KnowledgeList : KnowledgeGrid;
						return (
							<View
								nodes={visibleNodes}
								searching={query.length > 0}
								selectedIds={selectedIds}
								statusFor={statusFor}
								onItemClick={onItemClick}
								onOpen={openNode}
								onContextMenu={onContextMenu}
								onSelectIds={setSelectedIds}
								onClearSelection={clearSelection}
							/>
						);
					})()
				)}
			</motion.div>

			{menu && (
				<KnowledgeContextMenu
					x={menu.x}
					y={menu.y}
					items={menuItems}
					onClose={() => setMenu(null)}
				/>
			)}

			{renameNode && (
				<KnowledgeRenameDialog
					title="重命名"
					initialName={renameNode.name}
					onClose={() => setRenameNode(null)}
					onSubmit={submitRename}
				/>
			)}
		</div>
	);
}
