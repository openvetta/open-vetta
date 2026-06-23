import { useCallback, useEffect, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { knowledgeImportDraftAtom } from "@shared/store/atoms";

function hasExternalFiles(event: DragEvent): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function toSourcePaths(dataTransfer: DataTransfer): string[] {
	return Array.from(dataTransfer.files)
		.map((file) => window.vetta.fs.pathForFile(file))
		.filter(Boolean);
}

/**
 * 知识库页的全窗口拖拽接收层。挂在 RootLayout，避免被页面内部滚动容器裁切。
 * 仅在知识库相关路由生效，不抢占聊天页现有的附件拖拽语义。
 */
export function KnowledgeDropOverlay(): JSX.Element {
	const matches = useMatches();
	const path = matches[matches.length - 1]?.pathname ?? "/";
	const enabled = path.startsWith("/knowledge");
	const navigate = useNavigate();
	const setDraft = useSetAtom(knowledgeImportDraftAtom);
	const dragDepth = useRef(0);
	const [visible, setVisible] = useState(false);

	const reset = useCallback(() => {
		dragDepth.current = 0;
		setVisible(false);
	}, []);

	useEffect(() => {
		if (!enabled) {
			reset();
			return;
		}

		const onDragEnter = (event: DragEvent) => {
			if (!hasExternalFiles(event)) return;
			event.preventDefault();
			dragDepth.current += 1;
			setVisible(true);
		};
		const onDragOver = (event: DragEvent) => {
			if (!hasExternalFiles(event)) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
		};
		const onDragLeave = (event: DragEvent) => {
			if (!hasExternalFiles(event)) return;
			dragDepth.current = Math.max(0, dragDepth.current - 1);
			if (dragDepth.current === 0) setVisible(false);
		};
		const onDrop = (event: DragEvent) => {
			if (!hasExternalFiles(event) || !event.dataTransfer) return;
			event.preventDefault();
			const sourcePaths = toSourcePaths(event.dataTransfer);
			reset();
			if (sourcePaths.length === 0) return;
			setDraft({ sourcePaths, defaultTargetId: null });
			void navigate({ to: "/knowledge" });
		};

		window.addEventListener("dragenter", onDragEnter);
		window.addEventListener("dragover", onDragOver);
		window.addEventListener("dragleave", onDragLeave);
		window.addEventListener("drop", onDrop);
		return () => {
			window.removeEventListener("dragenter", onDragEnter);
			window.removeEventListener("dragover", onDragOver);
			window.removeEventListener("dragleave", onDragLeave);
			window.removeEventListener("drop", onDrop);
		};
	}, [enabled, navigate, reset, setDraft]);

	return (
		<AnimatePresence>
			{visible && enabled && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="pointer-events-none fixed inset-2 z-[80] flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/60 bg-background/88 backdrop-blur-md"
				>
					<motion.div
						initial={{ y: 8, scale: 0.98 }}
						animate={{ y: 0, scale: 1 }}
						className="flex max-w-sm flex-col items-center text-center"
					>
						<div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
							<span className="icon-[mdi--folder-arrow-down-outline] h-8 w-8" />
						</div>
						<h2 className="text-[18px] font-semibold text-foreground">松开，让 Vetta 先整理</h2>
						<p className="mt-2 text-[12px] leading-5 text-muted-foreground">
							文件不会立即写入知识库。你可以先确认目标知识库、目录结构和整理建议。
						</p>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
