import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { pathBasename, pathJoin } from "@shared/lib/utils";
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	filePreviewAtom,
	inlineFilePreviewAtom,
	type FilePreviewItem,
} from "@shared/store/atoms";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";

function isAbsolutePath(p: string): boolean {
	return p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(p);
}

function resolveAgainstCwd(p: string, cwd: string | undefined): string {
	if (!cwd || isAbsolutePath(p)) return p;
	return pathJoin(cwd, p);
}

const COLLAPSED_VISIBLE_COUNT = 5;

interface ArtifactCardProps {
	files: readonly string[];
}

export function ArtifactCard({ files }: ArtifactCardProps): JSX.Element | null {
	if (files.length === 0) return null;

	const [expanded, setExpanded] = useState(false);
	const setPreview = useSetAtom(inlineFilePreviewAtom);
	const setGlobalPreview = useSetAtom(filePreviewAtom);
	const narrow = useNarrowScreen();
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const cwd = activeSession?.cwd;
	const canCollapse = files.length > COLLAPSED_VISIBLE_COUNT;
	const visibleFiles = canCollapse && !expanded ? files.slice(0, COLLAPSED_VISIBLE_COUNT) : files;
	const hiddenCount = files.length - COLLAPSED_VISIBLE_COUNT;

	const openPreview = useCallback(
		(path: string) => {
			const items: FilePreviewItem[] = files.map((p) => ({
				name: pathBasename(p),
				path: resolveAgainstCwd(p, cwd),
			}));
			const index = files.indexOf(path);
			const ctx = { items, index: index >= 0 ? index : 0 };
			// 窄屏：活动面板是底部 sheet，内嵌分屏预览会把内容挤窄，
			// 改走全局预览 Dialog（覆盖整屏），跟 FilesPanel 的行为对齐。
			if (narrow) {
				setGlobalPreview(ctx);
				return;
			}
			// 宽屏：打开活动面板、切到 file 标签，走内嵌侧边预览
			setActivityPanelOpen(true);
			if (cwd) {
				setTabByProject((prev) => {
					const map = new Map(prev);
					map.set(cwd, "file");
					return map;
				});
			}
			setPreview(ctx);
		},
		[files, cwd, narrow, setPreview, setGlobalPreview, setActivityPanelOpen, setTabByProject],
	);

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className="rounded-xl border border-border bg-muted p-3"
		>
			<div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
				<span className="icon-[mdi--file-document-edit-outline] h-3.5 w-3.5" />
				<span>{files.length} 个文件被修改</span>
			</div>
			<ul className="flex flex-col gap-0.5">
				<AnimatePresence initial={false}>
					{visibleFiles.map((filePath) => (
						<FileRow key={filePath} path={filePath} onClick={openPreview} />
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

function FileRow({ path, onClick }: { path: string; onClick: (path: string) => void }): JSX.Element {
	const name = pathBasename(path);

	return (
		<motion.li
			layout
			initial={{ opacity: 0, height: 0 }}
			animate={{ opacity: 1, height: "auto" }}
			exit={{ opacity: 0, height: 0 }}
			transition={{ duration: 0.2 }}
			className="block w-full"
		>
			<button
				type="button"
				onClick={() => onClick(path)}
				title={path}
				className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted/50"
			>
				<span className="icon-[mdi--file-outline] h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
				<span className="min-w-0 truncate text-xs text-foreground">{name}</span>
				<span className="ml-auto min-w-0 max-w-[60%] truncate text-right text-[10px] text-muted-foreground/40">
					{path}
				</span>
			</button>
		</motion.li>
	);
}
