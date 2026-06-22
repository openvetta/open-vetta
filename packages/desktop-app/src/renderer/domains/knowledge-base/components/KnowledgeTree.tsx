import type { KnowledgeNode } from "@shared/types/knowledge-base";
import { getFileIcon } from "@domains/file-explorer/components/fileIcons";
import { cn } from "@shared/lib/utils";
import { knowledgeNodeMatches } from "../lib/knowledge-base";

interface KnowledgeTreeProps {
	nodes: KnowledgeNode[];
	search: string;
	expanded: Set<string>;
	selectedNodeId: string | null;
	onToggle: (id: string) => void;
	onSelect: (node: KnowledgeNode) => void;
	depth?: number;
}

export function KnowledgeTree({
	nodes,
	search,
	expanded,
	selectedNodeId,
	onToggle,
	onSelect,
	depth = 0,
}: KnowledgeTreeProps): JSX.Element {
	const query = search.trim().toLocaleLowerCase();
	const visibleNodes = query ? nodes.filter((node) => knowledgeNodeMatches(node, query)) : nodes;

	return (
		<div role="tree">
			{visibleNodes.map((node) => {
				const isExpanded = expanded.has(node.id) || Boolean(query);
				return (
					<div key={node.id}>
						<button
							type="button"
							onClick={() => {
								if (node.type === "directory") onToggle(node.id);
								onSelect(node);
							}}
							className={cn(
								"group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[12px] transition-colors",
								selectedNodeId === node.id ? "bg-accent text-foreground" : "hover:bg-accent/60",
							)}
							style={{ paddingLeft: depth * 18 + 8 }}
						>
							{node.type === "directory" ? (
								<span
									className={cn(
										"icon-[mdi--chevron-right] h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
										isExpanded && "rotate-90",
									)}
								/>
							) : (
								<span className="h-3.5 w-3.5 shrink-0" />
							)}
							<span
								className={cn(
									getFileIcon(node.name, node.type === "directory", isExpanded),
									"h-4 w-4 shrink-0",
									node.type === "directory" ? "text-primary" : "text-muted-foreground",
								)}
							/>
							<span className="min-w-0 flex-1 truncate">{node.name}</span>
							{node.type === "directory" && (
								<span className="text-[10px] tabular-nums text-muted-foreground/45">
									{node.children?.length ?? 0}
								</span>
							)}
						</button>
						{node.type === "directory" && isExpanded && node.children && (
							<KnowledgeTree
								nodes={node.children}
								search={search}
								expanded={expanded}
								selectedNodeId={selectedNodeId}
								onToggle={onToggle}
								onSelect={onSelect}
								depth={depth + 1}
							/>
						)}
					</div>
				);
			})}
			{visibleNodes.length === 0 && (
				<div className="py-10 text-center text-[11px] text-muted-foreground/50">没有匹配的文件</div>
			)}
		</div>
	);
}
