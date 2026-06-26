import { useState } from "react";
import { fileDiff } from "../git/run";
import type { TreeNode } from "../git/types";
import { DiffView } from "./DiffView";
import { ChevronRightIcon, FileIcon, FolderIcon } from "./icons";
import { DescendantDot, StatusBadge } from "./StatusBadge";

function indentStyle(depth: number): React.CSSProperties {
	return { paddingLeft: `${depth * 12 + 8}px` };
}

function FileRow({ node, depth, root }: { node: TreeNode; depth: number; root: string }): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const [patch, setPatch] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const entry = node.entry;

	const toggle = (): void => {
		const next = !expanded;
		setExpanded(next);
		if (next && patch === null && !loading && entry) {
			setLoading(true);
			setError(null);
			fileDiff(root, entry)
				.then(setPatch)
				.catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
				.finally(() => setLoading(false));
		}
	};

	if (!entry) return <div />;
	return (
		<div>
			<button
				type="button"
				onClick={toggle}
				style={indentStyle(depth)}
				className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12px] text-foreground transition-colors hover:bg-accent"
				title={entry.origPath ? `${entry.origPath} → ${node.path}` : node.path}
			>
				<ChevronRightIcon
					className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${expanded ? "rotate-90" : ""}`}
				/>
				<FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
				<span className="flex-1 truncate">{node.name}</span>
				<StatusBadge code={entry.code} />
			</button>
			{expanded && (
				<div className="my-1 overflow-hidden rounded-md border border-border">
					{loading && <div className="px-3 py-2 text-[12px] text-muted-foreground">加载 diff…</div>}
					{error && <div className="px-3 py-2 text-[12px] text-rose-500">{error}</div>}
					{!loading && !error && patch !== null && <DiffView patch={patch} />}
				</div>
			)}
		</div>
	);
}

function DirRow({ node, depth, root }: { node: TreeNode; depth: number; root: string }): JSX.Element {
	const [open, setOpen] = useState(true);
	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				style={indentStyle(depth)}
				className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12px] text-foreground transition-colors hover:bg-accent"
				title={node.path}
			>
				<ChevronRightIcon
					className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-90" : ""}`}
				/>
				<FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
				<span className="flex-1 truncate">{node.name}</span>
				{!open && <DescendantDot />}
			</button>
			{open && <TreeNodes nodes={node.children} depth={depth + 1} root={root} />}
		</div>
	);
}

export function TreeNodes({ nodes, depth, root }: { nodes: TreeNode[]; depth: number; root: string }): JSX.Element {
	return (
		<>
			{nodes.map((node) =>
				node.isDir ? (
					<DirRow key={node.path} node={node} depth={depth} root={root} />
				) : (
					<FileRow key={node.path} node={node} depth={depth} root={root} />
				),
			)}
		</>
	);
}
