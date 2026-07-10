import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import type { Project } from "@shared/store/atoms";

const isMac = navigator.platform.toUpperCase().includes("MAC");

interface ProjectContextMenuProps {
	x: number;
	y: number;
	project: Project;
	onClose: () => void;
	onArchive: (cwd: string) => void;
	onRemove: (cwd: string) => void;
	onDelete: (cwd: string) => void;
	/** 默认「对话」项目专用：左侧 dropdown 当前选中（conversation / claw），决定菜单内容。 */
	defaultScope?: "conversation" | "claw";
	/** 默认「对话」项目专用：仅清空非 IM 会话（保留产物，保留 claw session 文件）。 */
	onClearConversation?: (cwd: string) => void;
	/** 默认「对话」项目专用：仅清空 IM (claw) session 文件（保留产物）。 */
	onClearClaw?: (cwd: string) => void;
	/** Claw 设置入口；点击后跳转到 /settings/im。 */
	onOpenClawSettings?: () => void;
	/** 当 scope=conversation 且存在非 IM running session 时为 true，菜单项置灰。 */
	clearConversationDisabled?: boolean;
	/** 当 scope=claw 且存在 IM running session 时为 true，菜单项置灰。 */
	clearClawDisabled?: boolean;
}

export function ProjectContextMenu({
	x,
	y,
	project,
	onClose,
	onArchive,
	onRemove,
	onDelete,
	defaultScope,
	onClearConversation,
	onClearClaw,
	onOpenClawSettings,
	clearConversationDisabled,
	clearClawDisabled,
}: ProjectContextMenuProps): JSX.Element {
	const { t } = useTranslation("project");
	const menuRef = useRef<HTMLDivElement>(null);
	const [adjustedPos, setAdjustedPos] = useState({ x, y });

	useLayoutEffect(() => {
		const el = menuRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		setAdjustedPos({
			x: x + rect.width > vw ? vw - rect.width - 4 : x,
			y: y + rect.height > vh ? vh - rect.height - 4 : y,
		});
	}, [x, y]);

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [onClose]);

	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [onClose]);

	const isDefault = project.isDefault === true;

	return createPortal(
		<AnimatePresence>
			<motion.div
				ref={menuRef}
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.95 }}
				transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
				className="fixed z-[1000] w-[160px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl"
				style={{
					left: `${adjustedPos.x}px`,
					top: `${adjustedPos.y}px`,
				}}
			>
				{!isDefault && (
					<button
						type="button"
						onClick={() => {
							void window.vetta.shell.showInFolder(project.cwd);
							onClose();
						}}
						className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
					>
						<span className="icon-[solar--folder-open-linear] h-3.5 w-3.5" />
						{isMac ? t("contextMenu.openInFinder") : t("contextMenu.openInExplorer")}
					</button>
				)}
				{isDefault && defaultScope === "conversation" && onClearConversation && (
					<>
						<button
							type="button"
							disabled={clearConversationDisabled}
							title={clearConversationDisabled ? t("contextMenu.clearConversationDisabled") : undefined}
							onClick={() => {
								if (clearConversationDisabled) return;
								onClearConversation(project.cwd);
								onClose();
							}}
							className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-destructive transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:hover:bg-transparent"
						>
							<span className="icon-[solar--broom-linear] h-3.5 w-3.5" />
							{t("contextMenu.clearConversation")}
						</button>
					</>
				)}
				{isDefault && defaultScope === "claw" && (
					<>
						{onClearClaw && (
							<>
								<button
									type="button"
									disabled={clearClawDisabled}
									title={clearClawDisabled ? t("contextMenu.clearClawDisabled") : undefined}
									onClick={() => {
										if (clearClawDisabled) return;
										onClearClaw(project.cwd);
										onClose();
									}}
									className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-destructive transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:hover:bg-transparent"
								>
									<span className="icon-[solar--broom-linear] h-3.5 w-3.5" />
									{t("contextMenu.clearClaw")}
								</button>
							</>
						)}
						{onOpenClawSettings && (
							<button
								type="button"
								onClick={() => {
									onOpenClawSettings();
									onClose();
								}}
								className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
							>
								<span className="icon-[solar--settings-linear] h-3.5 w-3.5" />
								{t("contextMenu.clawSettings")}
							</button>
						)}
					</>
				)}
				{!isDefault && (
					<button
						type="button"
						onClick={() => {
							onArchive(project.cwd);
							onClose();
						}}
						className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
					>
						<span className="icon-[solar--archive-minimalistic-linear] h-3.5 w-3.5" />
						{t("contextMenu.archiveProject")}
					</button>
				)}
				{!isDefault && (
					<button
						type="button"
						onClick={() => {
							onRemove(project.cwd);
							onClose();
						}}
						className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
					>
						<span className="icon-[solar--list-cross-minimalistic-linear] h-3.5 w-3.5" />
						{t("contextMenu.removeFromList")}
					</button>
				)}
				{!isDefault && (
					<>
						<div className="mx-1.5 my-1 h-px bg-border" />
						<button
							type="button"
							onClick={() => {
								onDelete(project.cwd);
								onClose();
							}}
							className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-destructive transition-colors hover:bg-accent"
						>
							<span className="icon-[solar--trash-bin-trash-linear] h-3.5 w-3.5" />
							{t("contextMenu.deleteProject")}
						</button>
					</>
				)}
			</motion.div>
		</AnimatePresence>,
		document.body,
	);
}
