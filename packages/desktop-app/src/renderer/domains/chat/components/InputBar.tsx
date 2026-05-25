import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
	inputValueAtom,
	isStreamingAtom,
	activeSessionAtom,
	attachedImagesAtom,
	modelSupportsImagesAtom,
	selectedSkillAtom,
	mentionedFilesAtom,
	type AttachedImage,
	type MentionedFile,
	todoItemsBySessionAtom,
	getTodoItemsForSession,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	sandboxPermissionDrawerAtom,
} from "@shared/store/atoms";
import { DrawerCard, type DrawerTab } from "@shared/components/DrawerCard";
import { TodoCard } from "@shared/components/TodoCard";
import { ModelSelector } from "./ModelSelector";
import { ExecutionModeSelector } from "./ExecutionModeSelector";
import { ContextRing } from "./ContextRing";
import { SlashPanel } from "./SlashPanel";
import { AtPanel, type SelectedFile } from "./AtPanel";
import { ActionButtonBar } from "./ActionButtonBar";
import type { SkillInfo } from "@preload/api";

interface InputBarProps {
	onSend: () => Promise<void>;
	onAbort: () => Promise<void>;
	/**
	 * 当无 activeSession 但仍希望放行输入与发送时（例如 NewSessionPage），
	 * 把该项目的 cwd 传进来：InputBar 把它视为「有会话」、@ 文件面板用它作为根目录。
	 */
	cwdOverride?: string;
}

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 200;

const SPRING = { type: "spring" as const, stiffness: 460, damping: 32, mass: 0.9 };
const SOFT = { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] as const };

let imageIdCounter = 0;
function nextImageId(): string {
	return `img-${++imageIdCounter}-${Date.now()}`;
}

function readFileAsImage(file: File): Promise<{ data: string; mimeType: string; name: string }> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
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

export function InputBar({ onSend, onAbort, cwdOverride }: InputBarProps): JSX.Element {
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const [attachedImages, setAttachedImages] = useAtom(attachedImagesAtom);
	const modelSupportsImages = useAtomValue(modelSupportsImagesAtom);
	const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
	const [mentionedFiles, setMentionedFiles] = useAtom(mentionedFilesAtom);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [isFocused, setIsFocused] = useState(false);
	const [slashOpen, setSlashOpen] = useState(false);
	const [atOpen, setAtOpen] = useState(false);
	// 记录用户主动关闭浮层时的「触发标识」，避免后续按键反复重开
	// slash：只要 val 仍以 `/` 开头，就保持驳回；val 不再以 `/` 开头时清除
	const slashDismissedRef = useRef(false);
	// at：记录被驳回时光标前 `@` 的位置；该 `@` 仍在原位则保持驳回
	const atDismissedIndexRef = useRef<number | null>(null);
	const todoMap = useAtomValue(todoItemsBySessionAtom);
	const sandboxPermission = useAtomValue(sandboxPermissionDrawerAtom);
	const todoItems = useMemo(
		() => getTodoItemsForSession(todoMap, activeSession?.runtimeId ?? null),
		[todoMap, activeSession?.runtimeId],
	);
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);
	const [drawerActiveTab, setDrawerActiveTab] = useState<string | null>(null);

	const effectiveCwd = activeSession?.cwd ?? cwdOverride ?? "";
	const hasSession = Boolean(activeSession) || Boolean(cwdOverride);
	const canSend = hasSession && !isStreaming && (inputValue.trim().length > 0 || attachedImages.length > 0);
	const isEmpty = inputValue.trim().length === 0 && attachedImages.length === 0;
	const hasCapsules = Boolean(selectedSkill) || mentionedFiles.length > 0;

	useEffect(() => {
		if (sandboxPermission) setDrawerActiveTab("sandbox-permission");
	}, [sandboxPermission]);

	const resize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "0";
		el.style.height = `${Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, MAX_HEIGHT))}px`;
	}, []);

	useEffect(() => {
		resize();
	}, [inputValue, resize]);

	useEffect(() => {
		if (hasSession && !isStreaming) {
			textareaRef.current?.focus();
		}
	}, [hasSession, isStreaming]);

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
		if (
			(slashOpen || atOpen) &&
			(e.key === "ArrowDown" ||
				e.key === "ArrowUp" ||
				e.key === "Enter" ||
				e.key === "Escape" ||
				e.key === "Tab")
		) {
			e.preventDefault();
			return;
		}
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			if (canSend) void onSend();
		}
		// Backspace at start removes the rightmost capsule for fluid editing
		if (e.key === "Backspace" && inputValue === "" && hasCapsules) {
			e.preventDefault();
			if (mentionedFiles.length > 0) {
				const last = mentionedFiles[mentionedFiles.length - 1];
				setMentionedFiles((prev) => prev.filter((f) => f.path !== last.path));
			} else if (selectedSkill) {
				setSelectedSkill(null);
			}
		}
	}

	function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
		const val = e.target.value;
		setInputValue(val);

		// slash 触发：仅当 val 形如 `/xxx`（无空格）时算激活
		const slashActive = val === "/" || (val.startsWith("/") && !val.includes(" "));
		if (!slashActive) {
			// 触发条件失效，清除驳回记忆
			slashDismissedRef.current = false;
			if (slashOpen) setSlashOpen(false);
		} else if (!slashDismissedRef.current) {
			if (!slashOpen) setSlashOpen(true);
			if (atOpen) setAtOpen(false);
		}

		// at 触发：光标前最后一个连续 `@xxx` 段
		const cursorPos = e.target.selectionStart ?? val.length;
		const textBeforeCursor = val.slice(0, cursorPos);
		const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
		const atIndex = atMatch ? (atMatch.index ?? null) : null;
		if (atIndex === null) {
			atDismissedIndexRef.current = null;
			if (atOpen) setAtOpen(false);
		} else if (atDismissedIndexRef.current === atIndex) {
			// 用户已主动驳回当前这个 `@` 的浮层
			if (atOpen) setAtOpen(false);
		} else if (!slashActive) {
			if (!atOpen) setAtOpen(true);
		}
	}

	const handleSlashClose = useCallback(() => {
		setSlashOpen(false);
		// 仅当当前 val 仍处于触发状态时，才记忆为「已驳回」
		if (inputValue === "/" || (inputValue.startsWith("/") && !inputValue.includes(" "))) {
			slashDismissedRef.current = true;
		}
	}, [inputValue]);

	const handleAtClose = useCallback(() => {
		setAtOpen(false);
		const el = textareaRef.current;
		const cursorPos = el?.selectionStart ?? inputValue.length;
		const textBeforeCursor = inputValue.slice(0, cursorPos);
		const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
		atDismissedIndexRef.current = atMatch?.index ?? null;
	}, [inputValue]);

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
			setSelectedSkill({ name: skill.name, alias: skill.alias, type: skill.type });
			setSlashOpen(false);
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
			if (mentionedFiles.some((f) => f.path === file.path)) {
				setAtOpen(false);
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
		const tabs: DrawerTab[] = [];
		if (sandboxPermission) {
			tabs.push({
				id: "sandbox-permission",
				label: "权限请求",
				color: "bg-amber-400",
				desc: "等待确认",
				pulsing: true,
				content: <SandboxPermissionCard request={sandboxPermission} />,
			});
		}
		if (todoItems.length === 0) return tabs;
		const inProgressItem = todoItems.find((i) => i.status === "in_progress");
		const doneCount = todoItems.filter((i) => i.status === "done").length;
		const todoDesc = inProgressItem
			? `${doneCount}/${todoItems.length} ${inProgressItem.content}`
			: `${doneCount}/${todoItems.length}`;
		tabs.push({
			id: "todo",
			label: "代办",
			color: "bg-emerald-400",
			desc: todoDesc,
			pulsing: !!inProgressItem,
			content: <TodoCard items={todoItems} compact onViewMore={handleTodoViewMore} />,
		});
		return tabs;
	}, [todoItems, handleTodoViewMore, sandboxPermission]);

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

	const handleSelectImages = useCallback(async () => {
		if (!hasSession) return;
		const selected = await window.vetta.dialog.selectImages();
		if (selected.length > 0) addImages(selected);
		textareaRef.current?.focus();
	}, [hasSession, addImages]);

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

	const placeholder = !hasSession
		? "选择或创建会话以开始"
		: isStreaming
			? "Vetta 正在思考…"
			: "向 Vetta 提问，使用 / 唤出技能，@ 引用文件";

	// Card visual class composition
	const cardClass = [
		"input-card relative rounded-[20px] bg-card border transition-[border-color,box-shadow,transform] duration-200",
		isFocused ? "border-primary/20" : "border-border",
		isStreaming ? "input-aurora" : "",
	].join(" ");

	return (
		<div className="relative px-2 pb-3 pt-1 sm:px-4 sm:pb-4">
			<div className="relative mx-auto w-full max-w-2xl">
				<SlashPanel
					open={slashOpen}
					onClose={handleSlashClose}
					onSelect={handleSlashSelect}
					filter={inputValue.startsWith("/") ? inputValue : ""}
				/>

				<AtPanel
					open={atOpen}
					onClose={handleAtClose}
					onSelect={handleAtSelect}
					filter={getAtFilter()}
					cwd={effectiveCwd}
				/>

				<ActionButtonBar />

				<DrawerCard
					tabs={drawerTabs}
					activeTabId={drawerActiveTab}
					onActiveTabChange={setDrawerActiveTab}
				/>

				<div
					style={{ opacity: hasSession ? 1 : 0.55 }}
					className={cardClass}
				>
					{/* Capsule strip — appears above textarea, like the reference top variant */}
					<AnimatePresence initial={false}>
						{(hasCapsules || attachedImages.length > 0) && (
							<motion.div
								key="capsules"
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={SOFT}
								className="overflow-hidden"
							>
								<div className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
									<AnimatePresence initial={false}>
										{selectedSkill && (
											<Capsule
												key="skill-capsule"
												icon={
													selectedSkill.type === "scene"
														? "icon-[mdi--movie-open-outline]"
														: "icon-[mdi--puzzle-outline]"
												}
												label={selectedSkill.alias || selectedSkill.name}
												tone="primary"
												onRemove={handleRemoveSkill}
											/>
										)}
										{mentionedFiles.map((file) => (
											<Capsule
												key={`file-${file.path}`}
												icon={
													file.isDirectory
														? "icon-[mdi--folder-outline]"
														: "icon-[mdi--file-outline]"
												}
												label={file.name}
												title={file.path}
												tone="muted"
												onRemove={() => handleRemoveFile(file.path)}
											/>
										))}
										{attachedImages.map((img) => (
											<motion.div
												key={img.id}
												initial={{ scale: 0.8, opacity: 0 }}
												animate={{ scale: 1, opacity: 1 }}
												exit={{ scale: 0.8, opacity: 0 }}
												transition={SPRING}
												className="group relative"
											>
													<div className="h-12 w-12 overflow-hidden rounded-lg border border-border ring-1 ring-black/5 dark:ring-white/5">
														<img
															src={`data:${img.mimeType};base64,${img.data}`}
															alt={img.name}
															className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
														/>
													</div>
													<button
														type="button"
														onClick={() => removeImage(img.id)}
														className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-all duration-150 group-hover:opacity-100 hover:scale-110 hover:text-destructive"
														title="移除图片"
														style={{ height: 18, width: 18 }}
													>
														<span className="icon-[mdi--close] h-3 w-3" />
													</button>
												</motion.div>
											))}
										</AnimatePresence>
									</div>
							</motion.div>
						)}
					</AnimatePresence>

					{/* Textarea */}
					<div className="relative px-4 pt-3 pb-1">
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
							placeholder={placeholder}
							className="w-full resize-none bg-transparent text-[13.5px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/45 disabled:cursor-not-allowed"
							style={{
								minHeight: `${MIN_HEIGHT}px`,
								maxHeight: `${MAX_HEIGHT}px`,
							}}
						/>
					</div>

					{/* Toolbar — wraps onto two rows when crowded */}
					<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 pb-2 pt-1 sm:px-2.5">
						<div className="flex min-w-0 flex-shrink items-center gap-0.5">
							<ToolbarButton
								icon="icon-[mdi--plus]"
								title="技能/场景"
								disabled={!hasSession}
								onClick={handlePlusClick}
								active={slashOpen}
							/>
							<ToolbarButton
								icon={
									modelSupportsImages
										? "icon-[mdi--image-outline]"
										: "icon-[mdi--image-off-outline]"
								}
								title={
									modelSupportsImages ? "添加图片" : "当前模型不支持图片输入"
								}
								disabled={!hasSession || !modelSupportsImages}
								onClick={() => void handleSelectImages()}
							/>
							<div className="ml-1 h-4 w-px shrink-0 bg-border/70" />
							<div className="min-w-0 flex-shrink">
								<ExecutionModeSelector />
							</div>
						</div>

						<div className="ml-auto flex min-w-0 flex-shrink items-center gap-1">
							<div className="min-w-0 flex-shrink">
								<ModelSelector />
							</div>
							<ContextRing />
							<motion.span
								key={isStreaming ? "s" : isEmpty ? "e" : "n"}
								initial={{ opacity: 0, y: 2 }}
								animate={{ opacity: 1, y: 0 }}
								transition={SOFT}
								className="mx-1 hidden text-[10.5px] text-muted-foreground/50 select-none md:inline"
							>
								{isStreaming ? "" : isEmpty ? "⏎ 发送" : "⇧⏎ 换行"}
							</motion.span>
							<SendButton
								canSend={canSend}
								isStreaming={isStreaming}
								onSend={() => void onSend()}
								onAbort={() => void onAbort()}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function Capsule({
	icon,
	label,
	title,
	tone,
	onRemove,
}: {
	icon: string;
	label: string;
	title?: string;
	tone: "primary" | "muted";
	onRemove: () => void;
}): JSX.Element {
	const toneClass =
		tone === "primary"
			? "bg-primary/10 text-primary border-primary/20"
			: "bg-muted text-muted-foreground border-border/60";
	return (
		<motion.button
			type="button"
			layout
			initial={{ scale: 0.85, opacity: 0, y: 4 }}
			animate={{ scale: 1, opacity: 1, y: 0 }}
			exit={{ scale: 0.85, opacity: 0, y: -2 }}
			transition={SPRING}
			whileHover={{ y: -1 }}
			whileTap={{ scale: 0.96 }}
			onClick={onRemove}
			title={title ? `${title}\n点击移除` : "点击移除"}
			className={`group flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${toneClass}`}
		>
			<span className={`${icon} h-3 w-3 shrink-0`} />
			<span className="max-w-[140px] truncate">{label}</span>
			<span className="icon-[mdi--close] h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
		</motion.button>
	);
}

function SendButton({
	canSend,
	isStreaming,
	onSend,
	onAbort,
}: {
	canSend: boolean;
	isStreaming: boolean;
	onSend: () => void;
	onAbort: () => void;
}): JSX.Element {
	return (
		<AnimatePresence mode="wait" initial={false}>
			{isStreaming ? (
				<motion.button
					key="stop"
					type="button"
					onClick={onAbort}
					initial={{ scale: 0.6, opacity: 0, rotate: -45 }}
					animate={{ scale: 1, opacity: 1, rotate: 0 }}
					exit={{ scale: 0.6, opacity: 0, rotate: 45 }}
					transition={SPRING}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.92 }}
					className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_14px_-4px_color-mix(in_srgb,var(--primary)_60%,transparent)]"
					title="停止生成"
				>
					<motion.span
						aria-hidden
						className="absolute inset-0 rounded-full"
						style={{
							background: "color-mix(in srgb, var(--primary) 50%, transparent)",
						}}
						animate={{ scale: [1, 1.35], opacity: [0, 0.7, 0] }}
						transition={{
							duration: 1.4,
							times: [0, 0.15, 1],
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeOut",
						}}
					/>
					<span className="relative h-2.5 w-2.5 rounded-[3px] bg-primary-foreground" />
				</motion.button>
			) : (
				<motion.button
					key="send"
					type="button"
					onClick={onSend}
					disabled={!canSend}
					initial={{ scale: 0.6, opacity: 0, rotate: 45 }}
					animate={{ scale: 1, opacity: 1, rotate: 0 }}
					exit={{ scale: 0.6, opacity: 0, rotate: -45 }}
					transition={SPRING}
					whileHover={canSend ? { scale: 1.05, y: -1 } : undefined}
					whileTap={canSend ? { scale: 0.92 } : undefined}
					className="flex h-8 w-8 items-center justify-center rounded-full transition-shadow disabled:cursor-not-allowed"
					style={{
						background: canSend
							? "var(--primary)"
							: "color-mix(in srgb, var(--muted-foreground) 18%, transparent)",
						color: canSend ? "var(--primary-foreground)" : "var(--muted-foreground)",
						boxShadow: canSend
							? "0 6px 18px -6px color-mix(in srgb, var(--primary) 70%, transparent)"
							: "none",
					}}
					title="发送消息"
				>
					<motion.span
						className="icon-[mdi--arrow-up] h-4 w-4"
						animate={canSend ? { y: [0, -1.5, 0] } : { y: 0 }}
						transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					/>
				</motion.button>
			)}
		</AnimatePresence>
	);
}

function SandboxPermissionCard({
	request,
}: {
	request: {
		title: string;
		message: string;
		sensitive?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
		onAllowSession?: () => void;
	};
}): JSX.Element {
	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2">
				<div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
					<span className="icon-[mdi--shield-lock-outline] h-4 w-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[13px] font-medium text-foreground">{request.title}</div>
					<div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
						{request.message}
					</div>
				</div>
			</div>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={request.onCancel}
					className="h-7 rounded-lg px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					拒绝
				</button>
				<button
					type="button"
					onClick={request.onConfirm}
					className="h-7 rounded-lg bg-amber-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-amber-600"
				>
					允许本次
				</button>
				{!request.sensitive && request.onAllowSession ? (
					<button
						type="button"
						onClick={request.onAllowSession}
						className="h-7 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-[12px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
					>
						本会话不再询问
					</button>
				) : null}
			</div>
		</div>
	);
}

function ToolbarButton({
	icon,
	title,
	disabled,
	onClick,
	active,
}: {
	icon: string;
	title: string;
	disabled?: boolean;
	onClick?: () => void;
	active?: boolean;
}): JSX.Element {
	return (
		<motion.button
			type="button"
			title={title}
			disabled={disabled}
			onClick={onClick}
			whileHover={!disabled ? { scale: 1.06 } : undefined}
			whileTap={!disabled ? { scale: 0.92 } : undefined}
			transition={SPRING}
			className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-30 ${
				active
					? "bg-primary/10 text-primary"
					: "text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground"
			}`}
		>
			<span className={`${icon} h-[17px] w-[17px]`} />
		</motion.button>
	);
}
