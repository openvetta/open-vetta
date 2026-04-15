import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { pathBasename } from "@shared/lib/utils";

const COLLAPSED_VISIBLE_COUNT = 5;

interface ArtifactCardProps {
	files: readonly string[];
}

export function ArtifactCard({ files }: ArtifactCardProps): JSX.Element | null {
	if (files.length === 0) return null;

	const [expanded, setExpanded] = useState(false);
	const canCollapse = files.length > COLLAPSED_VISIBLE_COUNT;
	const visibleFiles = canCollapse && !expanded ? files.slice(0, COLLAPSED_VISIBLE_COUNT) : files;
	const hiddenCount = files.length - COLLAPSED_VISIBLE_COUNT;

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className="rounded-xl border border-border bg-muted/30 p-3"
		>
			<div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
				<span className="icon-[mdi--file-document-edit-outline] h-3.5 w-3.5" />
				<span>{files.length} 个文件被修改</span>
			</div>
			<ul className="flex flex-col gap-0.5">
				<AnimatePresence initial={false}>
					{visibleFiles.map((filePath) => (
						<FileRow key={filePath} path={filePath} />
					))}
				</AnimatePresence>
			</ul>
			{canCollapse && (
				<button
					type="button"
					onClick={() => setExpanded((prev) => !prev)}
					className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					<span className={`icon-[mdi--chevron-${expanded ? "up" : "down"}] text-sm`} />
					{expanded ? "收起" : `展开全部 (${hiddenCount} more)`}
				</button>
			)}
		</motion.div>
	);
}

function FileRow({ path }: { path: string }): JSX.Element {
	const name = pathBasename(path);

	return (
		<motion.li
			layout
			initial={{ opacity: 0, height: 0 }}
			animate={{ opacity: 1, height: "auto" }}
			exit={{ opacity: 0, height: 0 }}
			transition={{ duration: 0.2 }}
			className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted/30"
			title={path}
		>
			<span className="icon-[mdi--file-outline] h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
			<span className="truncate text-xs text-foreground">{name}</span>
			<span className="ml-auto truncate text-[10px] text-muted-foreground/40 max-w-[60%] text-right">
				{path}
			</span>
		</motion.li>
	);
}
