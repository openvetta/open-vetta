import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { inputValueAtom, isStreamingAtom, activeSessionAtom, attachedImagesAtom, modelSupportsImagesAtom, selectedSkillAtom, mentionedFilesAtom, type AttachedImage, type MentionedFile, todoItemsByCwdAtom, getTodoItemsForCwd, activityPanelOpenAtom, activityPanelTabByProjectAtom } from "@shared/store/atoms";
import { DrawerCard, type DrawerTab } from "@shared/components/DrawerCard";
import { TodoCard } from "@shared/components/TodoCard";
import { ModelSelector } from "./ModelSelector";
import { ContextRing } from "./ContextRing";
import { SlashPanel } from "./SlashPanel";
import { AtPanel, type SelectedFile } from "./AtPanel";
import { ActionButtonBar } from "./ActionButtonBar";
import type { SkillInfo } from "@preload/api";

interface InputBarProps {
	onSend: () => Promise<void>;
	onAbort: () => Promise<void>;
}

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 200;

let imageIdCounter = 0;
function nextImageId(): string {
	return `img-${++imageIdCounter}-${Date.now()}`;
}

/** Read a File (from paste/drop) as base64 + mimeType. */
function readFileAsImage(file: File): Promise<{ data: string; mimeType: string; name: string }> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			// result is "data:<mime>;base64,<data>"
			const commaIdx = result.indexOf(",");
			resolve({
				data: result.slice(commaIdx + 1),
				mimeType: file.type || "image/png",
				name: file.name || "Pasted image",
			});
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

export function InputBar({ onSend, onAbort }: InputBarProps): JSX.Element {
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const [attachedImages, setAttachedImages] = useAtom(attachedImagesAtom);
	const modelSupportsImages = useAtomValue(modelSupportsImagesAtom);
	const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
	const [mentionedFiles, setMentionedFiles] = useAtom(mentionedFilesAtom);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [isFocused, setIsFocused] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const [slashOpen, setSlashOpen] = useState(false);
	const [atOpen, setAtOpen] = useState(false);
	const todoMap = useAtomValue(todoItemsByCwdAtom);
	const todoItems = useMemo(
		() => getTodoItemsForCwd(todoMap, activeSession?.cwd ?? null),
		[todoMap, activeSession?.cwd],
	);
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);
	const [drawerActiveTab, setDrawerActiveTab] = useState<string | null>(null);

	const hasSession = Boolean(activeSession);
	const canSend = hasSession && !isStreaming && (inputValue.trim().length > 0 || attachedImages.length > 0);
	const isEmpty = inputValue.trim().length === 0 && attachedImages.length === 0;

	// Auto-resize textarea to fit content
	const resize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "0";
		el.style.height = `${Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, MAX_HEIGHT))}px`;
	}, []);

	useEffect(() => {
		resize();
	}, [inputValue, resize]);

	// Focus textarea on mount and when session changes
	useEffect(() => {
		if (hasSession && !isStreaming) {
			textareaRef.current?.focus();
		}
	}, [hasSession, isStreaming]);

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
		// AtPanel/SlashPanel use stopPropagation in capture phase, so when they're
		// open the event never reaches here. This guard is a safety fallback.
		if ((slashOpen || atOpen) && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape" || e.key === "Tab")) {
			e.preventDefault();
			return;
		}
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			if (canSend) void onSend();
		}
	}

	function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
		const val = e.target.value;
		setInputValue(val);

		// Open slash panel when "/" is typed at position 0
		if (val === "/" || (val.startsWith("/") && !val.includes(" "))) {
			if (!slashOpen) setSlashOpen(true);
			if (atOpen) setAtOpen(false);
		} else if (slashOpen && !val.startsWith("/")) {
			setSlashOpen(false);
		}

		// Detect "@" trigger: last word starts with "@"
		const cursorPos = e.target.selectionStart ?? val.length;
		const textBeforeCursor = val.slice(0, cursorPos);
		const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
		if (atMatch && !slashOpen) {
			if (!atOpen) setAtOpen(true);
		} else if (atOpen) {
			setAtOpen(false);
		}
	}

	/** Extract the @filter text from current cursor position. */
	function getAtFilter(): string {
		const val = inputValue;
		const el = textareaRef.current;
		const cursorPos = el?.selectionStart ?? val.length;
		const textBeforeCursor = val.slice(0, cursorPos);
		const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
		return atMatch ? atMatch[0] : "";
	}

	const handleSlashSelect = useCallback(
		(skill: SkillInfo) => {
			setSelectedSkill({ name: skill.name, type: skill.type });
			setSlashOpen(false);
			// Clear the "/" filter text
			if (inputValue.startsWith("/")) {
				setInputValue("");
			}
			textareaRef.current?.focus();
		},
		[setSelectedSkill, inputValue, setInputValue],
	);

	const handleRemoveSkill = useCallback(() => {
		setSelectedSkill(null);
		textareaRef.current?.focus();
	}, [setSelectedSkill]);

	const handleAtSelect = useCallback(
		(file: SelectedFile) => {
			// Avoid duplicates
			if (mentionedFiles.some((f) => f.path === file.path)) {
				setAtOpen(false);
				// Still remove the @filter text
				const atFilter = getAtFilter();
				if (atFilter) {
					const el = textareaRef.current;
					const cursorPos = el?.selectionStart ?? inputValue.length;
					setInputValue(inputValue.slice(0, cursorPos - atFilter.length) + inputValue.slice(cursorPos));
				}
				textareaRef.current?.focus();
				return;
			}
			const newFile: MentionedFile = { path: file.path, name: file.name, isDirectory: file.isDirectory };
			setMentionedFiles((prev) => [...prev, newFile]);
			setAtOpen(false);
			// Remove the @filter text from input
			const atFilter = getAtFilter();
			if (atFilter) {
				const el = textareaRef.current;
				const cursorPos = el?.selectionStart ?? inputValue.length;
				setInputValue(inputValue.slice(0, cursorPos - atFilter.length) + inputValue.slice(cursorPos));
			}
			textareaRef.current?.focus();
		},
		[mentionedFiles, setMentionedFiles, inputValue, setInputValue],
	);

	const handleRemoveFile = useCallback(
		(path: string) => {
			setMentionedFiles((prev) => prev.filter((f) => f.path !== path));
			textareaRef.current?.focus();
		},
		[setMentionedFiles],
	);

	const handlePlusClick = useCallback(() => {
		if (!hasSession) return;
		setSlashOpen((prev) => !prev);
	}, [hasSession]);

	// ── Drawer tabs ──

	const handleTodoViewMore = useCallback(() => {
		const cwd = activeSession?.cwd;
		if (!cwd) return;
		setDrawerActiveTab(null);
		setActivityPanelOpen(true);
		setTabByProject((prev) => {
			const map = new Map(prev);
			map.set(cwd, "todo");
			return map;
		});
	}, [activeSession?.cwd, setActivityPanelOpen, setTabByProject]);

	const drawerTabs = useMemo((): DrawerTab[] => {
		if (todoItems.length === 0) return [];
		const inProgressItem = todoItems.find((i) => i.status === "in_progress");
		const doneCount = todoItems.filter((i) => i.status === "done").length;
		const todoDesc = inProgressItem
			? `${doneCount}/${todoItems.length} ${inProgressItem.content}`
			: `${doneCount}/${todoItems.length}`;
		return [{
			id: "todo",
			label: "代办",
			color: "bg-emerald-400",
			desc: todoDesc,
			pulsing: !!inProgressItem,
			content: <TodoCard items={todoItems} compact onViewMore={handleTodoViewMore} />,
		}];
	}, [todoItems, handleTodoViewMore]);

	// ── Image helpers ──

	const addImages = useCallback(
		(newImages: Array<{ data: string; mimeType: string; name: string }>) => {
			const items: AttachedImage[] = newImages.map((img) => ({
				id: nextImageId(),
				...img,
			}));
			setAttachedImages((prev) => [...prev, ...items]);
		},
		[setAttachedImages],
	);

	const removeImage = useCallback(
		(id: string) => {
			setAttachedImages((prev) => prev.filter((img) => img.id !== id));
		},
		[setAttachedImages],
	);

	// ── Select images via dialog ──
	const handleSelectImages = useCallback(async () => {
		if (!hasSession) return;
		const selected = await window.vetta.dialog.selectImages();
		if (selected.length > 0) {
			addImages(selected);
		}
		textareaRef.current?.focus();
	}, [hasSession, addImages]);

	// ── Paste images ──
	const handlePaste = useCallback(
		async (e: React.ClipboardEvent) => {
			if (!modelSupportsImages) return;
			const items = Array.from(e.clipboardData.items);
			const imageFiles = items
				.filter((item) => item.kind === "file" && item.type.startsWith("image/"))
				.map((item) => item.getAsFile())
				.filter((f): f is File => f !== null);

			if (imageFiles.length === 0) return;
			e.preventDefault();
			const images = await Promise.all(imageFiles.map(readFileAsImage));
			addImages(images);
		},
		[addImages, modelSupportsImages],
	);

	// ── Drag and drop ──
	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (hasSession && !isDragOver) setIsDragOver(true);
		},
		[hasSession, isDragOver],
	);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	}, []);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);
			if (!hasSession || !modelSupportsImages) return;

			const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
			if (files.length === 0) return;
			const images = await Promise.all(files.map(readFileAsImage));
			addImages(images);
			textareaRef.current?.focus();
		},
		[hasSession, addImages, modelSupportsImages],
	);

	return (
		<div className="relative px-4 pb-4 pt-1">
			<div className="relative mx-auto max-w-2xl">
				{/* ── Slash panel (above input card) ── */}
				<SlashPanel
					open={slashOpen}
					onClose={() => setSlashOpen(false)}
					onSelect={handleSlashSelect}
					filter={inputValue.startsWith("/") ? inputValue : ""}
				/>

				{/* ── @ file panel (above input card) ── */}
				<AtPanel
					open={atOpen}
					onClose={() => setAtOpen(false)}
					onSelect={handleAtSelect}
					filter={getAtFilter()}
					cwd={activeSession?.cwd ?? ""}
				/>

				{/* ── Action button bar (above input card) ── */}
				<ActionButtonBar />

				{/* ── Drawer card (floating above input card) ── */}
				<DrawerCard
					tabs={drawerTabs}
					activeTabId={drawerActiveTab}
					onActiveTabChange={setDrawerActiveTab}
				/>

				{/* ── Card container ── */}
				<div
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={(e) => void handleDrop(e)}
					style={{
						opacity: hasSession ? 1 : 0.5,
					}}
					className={`input-card rounded-2xl transition-all duration-200 bg-card border ${
						isDragOver
							? "border-primary"
							: isFocused
								? "border-border shadow-md"
								: "border-border shadow-sm"
					}`}
				>
					{/* ── Attached images preview ── */}
					<AnimatePresence>
						{attachedImages.length > 0 && (
							<motion.div
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ duration: 0.2 }}
								className="overflow-hidden"
							>
								<div className="flex flex-wrap gap-2 px-4 pt-3">
									{attachedImages.map((img) => (
										<ImageThumbnail
											key={img.id}
											image={img}
											onRemove={() => removeImage(img.id)}
										/>
									))}
								</div>
							</motion.div>
						)}
					</AnimatePresence>

					{/* ── Textarea area ── */}
					<div className="px-4 pt-3 pb-2">
						<textarea
							ref={textareaRef}
							rows={1}
							value={inputValue}
							onChange={handleChange}
							onKeyDown={handleKeyDown}
							onPaste={(e) => void handlePaste(e)}
							onFocus={() => setIsFocused(true)}
							onBlur={() => setIsFocused(false)}
							disabled={!hasSession}
							placeholder={
								hasSession
									? "Message Vetta..."
									: "Select or create a session to start"
							}
							className="w-full resize-none bg-transparent text-[13.5px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
							style={{
								minHeight: `${MIN_HEIGHT}px`,
								maxHeight: `${MAX_HEIGHT}px`,
							}}
						/>
					</div>

					{/* ── Toolbar ── */}
					<div className="flex items-center justify-between px-3 pb-2.5">
						{/* Left: action buttons + skill capsule */}
						<div className="flex items-center gap-0.5">
							<ToolbarButton
								icon="icon-[mdi--plus]"
								title="技能/场景"
								disabled={!hasSession}
								onClick={handlePlusClick}
							/>
							<ToolbarButton
								icon={modelSupportsImages ? "icon-[mdi--image-outline]" : "icon-[mdi--image-off-outline]"}
								title={modelSupportsImages ? "Attach image" : "Current model does not support image input"}
								disabled={!hasSession || !modelSupportsImages}
								onClick={() => void handleSelectImages()}
							/>
							{/* Skill capsule */}
							<AnimatePresence>
								{selectedSkill && (
									<motion.div
										key="skill-capsule"
										initial={{ scale: 0.8, opacity: 0, width: 0 }}
										animate={{ scale: 1, opacity: 1, width: "auto" }}
										exit={{ scale: 0.8, opacity: 0, width: 0 }}
										transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
										className="overflow-hidden"
									>
										<button
											type="button"
											onClick={handleRemoveSkill}
											title="点击移除"
											className="ml-1 flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-2 text-[11px] font-medium transition-colors hover:opacity-80 bg-primary/10 text-muted-foreground"
										>
											<span
												className={`${selectedSkill.type === "scene" ? "icon-[mdi--movie-open-outline]" : "icon-[mdi--puzzle-outline]"} h-3 w-3`}
											/>
											<span className="max-w-[120px] truncate">{selectedSkill.name}</span>
											<span className="icon-[mdi--close] h-3 w-3 opacity-60" />
										</button>
									</motion.div>
								)}
							</AnimatePresence>
							{/* File capsules */}
							<AnimatePresence>
								{mentionedFiles.map((file) => (
									<motion.div
										key={`file-${file.path}`}
										initial={{ scale: 0.8, opacity: 0, width: 0 }}
										animate={{ scale: 1, opacity: 1, width: "auto" }}
										exit={{ scale: 0.8, opacity: 0, width: 0 }}
										transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
										className="overflow-hidden"
									>
										<button
											type="button"
											onClick={() => handleRemoveFile(file.path)}
											title={file.path}
											className="ml-1 flex items-center gap-1 rounded-full py-0.5 pr-2 pl-2 text-[11px] font-medium transition-colors hover:opacity-80 bg-muted text-muted-foreground"
										>
											<span className={`${file.isDirectory ? "icon-[mdi--folder-outline]" : "icon-[mdi--file-outline]"} h-3 w-3`} />
											<span className="max-w-[100px] truncate">{file.name}</span>
											<span className="icon-[mdi--close] h-3 w-3 opacity-60" />
										</button>
									</motion.div>
								))}
							</AnimatePresence>
						</div>

						{/* Right: model selector + send / stop */}
						<div className="flex items-center gap-1.5">
							<ModelSelector />
							<ContextRing />
							{/* Character hint */}
							<span className="mr-1 text-[11px] text-muted-foreground/50 select-none">
								{isStreaming ? "" : isEmpty ? "⏎ Send" : `⇧⏎ Newline`}
							</span>

							<AnimatePresence mode="wait">
								{isStreaming ? (
									<motion.button
										key="stop"
										type="button"
										onClick={() => void onAbort()}
										initial={{ scale: 0.8, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										exit={{ scale: 0.8, opacity: 0 }}
										transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
										className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-80"
										title="Stop generating"
									>
										<motion.span
											className="icon-[mdi--stop] h-4 w-4"
											animate={{ scale: [1, 0.9, 1] }}
											transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
										/>
									</motion.button>
								) : (
									<motion.button
										key="send"
										type="button"
										onClick={() => void onSend()}
										disabled={!canSend}
										initial={{ scale: 0.8, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										exit={{ scale: 0.8, opacity: 0 }}
										transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
										className="send-button flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 disabled:opacity-30"
										style={{
											background: canSend ? "var(--foreground)" : "var(--secondary)",
											color: canSend ? "var(--background)" : "var(--muted-foreground)",
										}}
										title="Send message"
									>
										<motion.span
											className="icon-[mdi--arrow-up] h-4 w-4"
											animate={canSend ? { y: [0, -1, 0] } : {}}
											transition={{ duration: 0.6, delay: 0.1 }}
										/>
									</motion.button>
								)}
							</AnimatePresence>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/** Thumbnail preview for an attached image with remove button */
function ImageThumbnail({
	image,
	onRemove,
}: {
	image: AttachedImage;
	onRemove: () => void;
}): JSX.Element {
	return (
		<motion.div
			initial={{ scale: 0.8, opacity: 0 }}
			animate={{ scale: 1, opacity: 1 }}
			exit={{ scale: 0.8, opacity: 0 }}
			transition={{ duration: 0.15 }}
			className="group relative"
		>
			<div className="h-16 w-16 overflow-hidden rounded-lg border border-border">
				<img
					src={`data:${image.mimeType};base64,${image.data}`}
					alt={image.name}
					className="h-full w-full object-cover"
				/>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-accent"
				title="Remove image"
			>
				<span className="icon-[mdi--close] h-3 w-3" />
			</button>
		</motion.div>
	);
}

/** Small icon button for the toolbar row */
function ToolbarButton({
	icon,
	title,
	disabled,
	onClick,
}: {
	icon: string;
	title: string;
	disabled?: boolean;
	onClick?: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			title={title}
			disabled={disabled}
			onClick={onClick}
			className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-30"
		>
			<span className={`${icon} h-[18px] w-[18px]`} />
		</button>
	);
}
