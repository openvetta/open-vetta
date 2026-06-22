import { useCallback, useMemo, useState } from "react";
import { useSetAtom } from "jotai";
import type { FilePreviewContext, FilePreviewItem } from "@shared/store/atoms";
import { filePreviewAtom } from "@shared/store/atoms";
import type { KnowledgeBase, KnowledgeNode } from "@shared/types/knowledge-base";
import { FilePreviewView, usePreviewNav } from "@domains/file-preview/components/FilePreviewView";
import { ResizeHandle } from "@shared/components/ResizeHandle";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { Input } from "@shared/components/ui/input";
import { KnowledgeSourcePicker } from "./KnowledgeSourcePicker";
import { KnowledgeTree } from "./KnowledgeTree";
import { KnowledgeBasePicker } from "./KnowledgeBasePicker";
import { countKnowledgeNodes } from "../lib/knowledge-base";

const TREE_DEFAULT_WIDTH = 300;
const TREE_MIN_WIDTH = 220;
const TREE_MAX_WIDTH = 420;

interface KnowledgeContentsPanelProps {
	knowledgeBases: KnowledgeBase[];
	knowledgeBase: KnowledgeBase;
	onSelectKnowledgeBase: (id: string) => void;
	onCreateKnowledgeBase: () => void;
	onViewAllKnowledgeBases: () => void;
	onPickFiles: () => void;
	onPickFolders: () => void;
}

interface PreviewEntry {
	nodeId: string;
	item: FilePreviewItem;
}

function collectPreviewEntries(nodes: KnowledgeNode[]): PreviewEntry[] {
	const entries: PreviewEntry[] = [];
	for (const node of nodes) {
		if (node.type === "directory") {
			entries.push(...collectPreviewEntries(node.children ?? []));
			continue;
		}
		if (!node.sourcePath) continue;
		entries.push({
			nodeId: node.id,
			item: { name: node.name, path: node.sourcePath, size: node.size },
		});
	}
	return entries;
}

export function KnowledgeContentsPanel({
	knowledgeBases,
	knowledgeBase,
	onSelectKnowledgeBase,
	onCreateKnowledgeBase,
	onViewAllKnowledgeBases,
	onPickFiles,
	onPickFolders,
}: KnowledgeContentsPanelProps): JSX.Element {
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [search, setSearch] = useState("");
	const [previewContext, setPreviewContext] = useState<FilePreviewContext | null>(null);
	const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT_WIDTH);
	const [treeCollapsed, setTreeCollapsed] = useState(false);
	const setGlobalPreview = useSetAtom(filePreviewAtom);
	const narrow = useNarrowScreen();
	const stats = useMemo(() => countKnowledgeNodes(knowledgeBase.nodes), [knowledgeBase.nodes]);
	const previewEntries = useMemo(() => collectPreviewEntries(knowledgeBase.nodes), [knowledgeBase.nodes]);
	const selectedNodeId = previewContext ? (previewEntries[previewContext.index]?.nodeId ?? null) : null;
	const { goPrev, goNext } = usePreviewNav(setPreviewContext);

	const toggleDirectory = useCallback((id: string) => {
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const selectNode = useCallback(
		(node: KnowledgeNode) => {
			if (node.type === "directory" || !node.sourcePath) return;
			const index = previewEntries.findIndex((entry) => entry.nodeId === node.id);
			if (index < 0) return;
			const context = { items: previewEntries.map((entry) => entry.item), index };
			if (narrow) {
				setGlobalPreview(context);
				return;
			}
			setPreviewContext(context);
		},
		[narrow, previewEntries, setGlobalPreview],
	);

	const closePreview = useCallback(() => {
		setPreviewContext(null);
		setTreeCollapsed(false);
	}, []);

	const resizeTree = useCallback((delta: number) => {
		setTreeWidth((width) => Math.max(TREE_MIN_WIDTH, Math.min(TREE_MAX_WIDTH, width + delta)));
	}, []);

	const showTree = !previewContext || !treeCollapsed;

	return (
		<div className="flex min-h-0 flex-1 flex-col px-8 pb-8">
			<div className="mb-3 flex items-center justify-between gap-3">
				<KnowledgeBasePicker
					bases={knowledgeBases}
					activeBase={knowledgeBase}
					onSelect={onSelectKnowledgeBase}
					onCreate={onCreateKnowledgeBase}
					onViewAll={onViewAllKnowledgeBases}
				/>
				<div className="relative w-56">
					<span className="icon-[mdi--magnify] absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="搜索当前知识库"
						className="h-8 border-transparent bg-muted/55 pl-8 pr-3 text-[12px] shadow-none placeholder:text-muted-foreground/45 hover:bg-muted/75 focus-visible:border-primary/25 focus-visible:bg-background/70 focus-visible:ring-1 focus-visible:ring-primary/15"
					/>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted/30">
				{showTree && (
					<section
						className={
							previewContext
								? "relative flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-border/60"
								: "flex min-h-0 flex-1 flex-col overflow-hidden"
						}
						style={previewContext ? { width: treeWidth } : undefined}
					>
						<div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-2.5 text-[11px] text-muted-foreground">
							<span>{stats.directories} 个目录</span>
							<span className="text-muted-foreground/30">·</span>
							<span>{stats.files} 个文件</span>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
							{knowledgeBase.nodes.length > 0 ? (
								<KnowledgeTree
									nodes={knowledgeBase.nodes}
									search={search}
									expanded={expanded}
									selectedNodeId={selectedNodeId}
									onToggle={toggleDirectory}
									onSelect={selectNode}
								/>
							) : (
								<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
									<span className="icon-[mdi--folder-open-outline] h-9 w-9 text-muted-foreground/35" />
									<div>
										<p className="text-[13px] font-medium text-foreground">这个知识库还是空的</p>
										<p className="mt-1 text-[11px] text-muted-foreground/55">
											拖入文件或文件夹，系统会自动整理
										</p>
									</div>
									<KnowledgeSourcePicker
										size="sm"
										onPickFiles={onPickFiles}
										onPickFolders={onPickFolders}
									/>
								</div>
							)}
						</div>
						{previewContext && <ResizeHandle side="right" onResize={resizeTree} />}
					</section>
				)}
				{previewContext && (
					<div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background/60">
						<FilePreviewView
							ctx={previewContext}
							onPrev={goPrev}
							onNext={goNext}
							onClose={closePreview}
							canPrev={previewContext.index > 0}
							canNext={previewContext.index < previewContext.items.length - 1}
							enableKeyboard
							onToggleSidebar={() => setTreeCollapsed((collapsed) => !collapsed)}
							sidebarCollapsed={treeCollapsed}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
