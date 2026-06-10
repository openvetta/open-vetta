import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { defaultConversationCwdAtom, renamingSessionPathAtom, type SessionInfo } from "@shared/store/atoms";

interface SessionContextMenuProps {
	x: number;
	y: number;
	session: SessionInfo;
	onClose: () => void;
	onDelete: (session: SessionInfo) => void;
}

export function SessionContextMenu({ x, y, session, onClose, onDelete }: SessionContextMenuProps): JSX.Element {
	const menuRef = useRef<HTMLDivElement>(null);
	const setRenamingSessionPath = useSetAtom(renamingSessionPathAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);

	// ADR-0007: 「对话」项目下新建 session 的 cwd 是独立子目录（artifact dir）。
	// 仅当 session.cwd 是 conversation 根的严格子目录时才暴露「打开产物目录」入口；
	// 老 session（cwd 就是根）走 ChatView 旁路或直接 Finder 浏览，避免暴露根目录这个杂项 sink。
	const hasArtifactDir = (() => {
		if (!defaultConversationCwd) return false;
		if (!session.cwd || session.cwd === defaultConversationCwd) return false;
		const prefix = defaultConversationCwd.endsWith("/") ? defaultConversationCwd : `${defaultConversationCwd}/`;
		return session.cwd.startsWith(prefix);
	})();

	// Close on outside click
	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [onClose]);

	// Close on Escape
	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [onClose]);

	return createPortal(
		<AnimatePresence>
			<motion.div
				ref={menuRef}
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.95 }}
				transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
				className="fixed z-[1000] w-[170px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl"
				style={{
					left: `${x}px`,
					top: `${y}px`,
				}}
			>
				<button
					type="button"
					onClick={() => {
						setRenamingSessionPath(session.path);
						onClose();
					}}
					className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[solar--pen-2-linear] h-3.5 w-3.5" />
					重命名
				</button>
				{hasArtifactDir && (
					<button
						type="button"
						onClick={() => {
							void window.vetta.shell.showInFolder(session.cwd);
							onClose();
						}}
						className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
					>
						<span className="icon-[solar--folder-open-linear] h-3.5 w-3.5" />
						打开产物目录
					</button>
				)}
				<button
					type="button"
					onClick={() => onDelete(session)}
					className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-destructive transition-colors hover:bg-accent"
				>
					<span className="icon-[solar--trash-bin-trash-linear] h-3.5 w-3.5" />
					删除
				</button>
			</motion.div>
		</AnimatePresence>,
		document.body,
	);
}
