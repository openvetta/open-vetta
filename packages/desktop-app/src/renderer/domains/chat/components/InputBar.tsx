import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { memo, useRef, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import {
	inputValueAtom,
	isStreamingAtom,
	activeSessionAtom,
	attachedImagesAtom,
	selectedSkillAtom,
	mentionedFilesAtom,
	editImageAttachmentAtom,
	type AttachedImage,
	type MentionedFile,
	todoItemsBySessionAtom,
	getTodoItemsForSession,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	sandboxPermissionDrawerAtom,
	pendingQuestionsAtom,
	promptSuggestionsAtom,
} from "@shared/store/atoms";
import { DrawerCard, type DrawerTab } from "@shared/components/DrawerCard";
import { TodoCard } from "@shared/components/TodoCard";
import { ModelSelector } from "./ModelSelector";
import { ExecutionModeSelector } from "./ExecutionModeSelector";
import { ContextRing } from "./ContextRing";
import { SlashPanel } from "./SlashPanel";
import { AtPanel, type SelectedFile } from "./AtPanel";
import { ActionButtonBar } from "./ActionButtonBar";
import { ActiveInputActionChips, InputActionBar } from "./InputActionBar";
import { SendButton } from "./SendButton";
import { QuestionPanel } from "./QuestionPanel";
import { pathBasename } from "@shared/lib/utils";
import type { SkillInfo } from "@preload/api";
import "./InputBar.css";

interface InputBarProps {
	onSend: (overrideText?: string) => Promise<void>;
	onAbort: () => Promise<void>;
	/**
	 * 当无 activeSession 但仍希望放行输入与发送时（例如 NewSessionPage），
	 * 把该项目的 cwd 传进来：InputBar 把它视为「有会话」、@ 文件面板用它作为根目录。
	 */
	cwdOverride?: string;
}

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 140;

const SPRING = { type: "spring" as const, stiffness: 460, damping: 32, mass: 0.9 };
const SOFT = { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] as const };
const COLLAPSE_INITIAL = { height: 0, opacity: 0 };
const COLLAPSE_ANIMATE = { height: "auto", opacity: 1 };
const COLLAPSE_EXIT = { height: 0, opacity: 0 };
const IMAGE_INITIAL = { scale: 0.8, opacity: 0 };
const IMAGE_ANIMATE = { scale: 1, opacity: 1 };
const TOOLBAR_BUTTON_HOVER = { scale: 1.06 };
const TOOLBAR_BUTTON_TAP = { scale: 0.92 };
const SEND_HINT_INITIAL = { opacity: 0, y: 2 };
const SEND_HINT_ANIMATE = { opacity: 1, y: 0 };
const CAPSULE_INITIAL = { scale: 0.85, opacity: 0, y: 4 };
const CAPSULE_ANIMATE = { scale: 1, opacity: 1, y: 0 };
const CAPSULE_EXIT = { scale: 0.85, opacity: 0, y: -2 };
const CAPSULE_HOVER = { y: -1 };
const CAPSULE_TAP = { scale: 0.96 };

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
	const { t } = useTranslation("chat");
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const pendingQuestions = useAtomValue(pendingQuestionsAtom);
	const pendingQuestion = activeSession?.runtimeId ? pendingQuestions[activeSession.runtimeId] : undefined;
	const promptSuggestions = useAtomValue(promptSuggestionsAtom);
	// 首条输入预测建议：用作 placeholder + 空输入回车直发。
	const firstSuggestion = activeSession?.runtimeId ? promptSuggestions[activeSession.runtimeId]?.[0] : undefined;
	const [attachedImages, setAttachedImages] = useAtom(attachedImagesAtom);
	const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
	const [mentionedFiles, setMentionedFiles] = useAtom(mentionedFilesAtom);
	const [editImageAttachment, setEditImageAttachment] = useAtom(editImageAttachmentAtom);
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
	const hasCapsules = Boolean(selectedSkill) || mentionedFiles.length > 0 || Boolean(editImageAttachment);

	useEffect(() => {
		if (sandboxPermission) setDrawerActiveTab("sandbox-permission");
	}, [sandboxPermission]);

	// 记录上一次内容长度，用于判断本次编辑是否「可能变短」。
	const prevValueLenRef = useRef(inputValue.length);
	const resize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		// 仅在内容可能变短（删除 / 替换为更短文本）时才把高度归零重测。
		// 归零会让 textarea 瞬间塌陷，放大下方消息列表滚动容器的 clientHeight，
		// 浏览器随即把其 scrollTop 上限夹小（原生 clamp，JS 探针抓不到）；还原高度后
		// 列表便「掉离底部」再被跟随动画拉回，表现为每次按键抖一下。
		// 增长 / 行数不变时直接按当前高度量 scrollHeight：内容溢出则自然增高，
		// 行数不变则量得与现高相等、不改动布局，下方列表纹丝不动。
		if (el.value.length < prevValueLenRef.current) {
			el.style.height = "0";
		}
		prevValueLenRef.current = el.value.length;
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
			// 空输入回车：若有输入预测建议，按首条建议直发（placeholder 即该建议）。
			else if (hasSession && !isStreaming && isEmpty && firstSuggestion) void onSend(firstSuggestion);
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
				label: t("inputBar.drawer.permissionLabel"),
				color: "bg-amber-400",
				desc: t("inputBar.drawer.permissionDesc"),
				pulsing: true,
				content: <SandboxPermissionCard request={sandboxPermission} />,
			});
		}
		if (todoItems.length === 0) return tabs;
		const inProgressItem = todoItems.find((i) => i.status === "in_progress");
		const doneCount = todoItems.filter((i) => i.status === "done").length;
		const todoDesc = inProgressItem
			? t("inputBar.drawer.todoDesc", {
					done: doneCount,
					total: todoItems.length,
					content: inProgressItem.content,
				})
			: t("inputBar.drawer.todoDescSimple", { done: doneCount, total: todoItems.length });
		tabs.push({
			id: "todo",
			label: t("inputBar.drawer.todoLabel"),
			color: "bg-emerald-400",
			desc: todoDesc,
			pulsing: !!inProgressItem,
			content: <TodoCard items={todoItems} compact onViewMore={handleTodoViewMore} />,
		});
		return tabs;
	}, [todoItems, handleTodoViewMore, sandboxPermission, t]);

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

	const handleSelectFiles = useCallback(async () => {
		if (!hasSession) return;
		const paths = await window.vetta.dialog.selectFiles(effectiveCwd || undefined);
		if (paths.length > 0) {
			setMentionedFiles((prev) => {
				const seen = new Set(prev.map((f) => f.path));
				const additions: MentionedFile[] = [];
				for (const path of paths) {
					if (seen.has(path)) continue;
					seen.add(path);
					additions.push({ path, name: pathBasename(path), isDirectory: false });
				}
				return additions.length > 0 ? [...prev, ...additions] : prev;
			});
		}
		textareaRef.current?.focus();
	}, [hasSession, effectiveCwd, setMentionedFiles]);

	const handlePaste = useCallback(
		async (e: React.ClipboardEvent) => {
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
		[addImages],
	);

	const handleSend = useCallback(() => {
		void onSend();
	}, [onSend]);

	const handleAbort = useCallback(() => {
		void onAbort();
	}, [onAbort]);

	const placeholder = !hasSession
		? t("inputBar.placeholder.noSession")
		: isStreaming
			? t("inputBar.placeholder.thinking")
			: isEmpty && firstSuggestion
				? t("inputBar.placeholder.suggestion", { suggestion: firstSuggestion })
				: t("inputBar.placeholder.default");

	// Card visual class composition
	const cardClass = [
		// 浅色下 card(白) 与主背景(近白)几乎相同，改用与侧边栏一致的实心 muted 填充；
		// 深色下 card 本就比主背景亮一档，保持 card。边框统一用细 border。
		"input-card relative z-10 rounded-[20px] bg-muted dark:bg-card border transition-[border-color,box-shadow,transform] duration-200",
		isFocused ? "border-primary/20" : "border-border",
	].join(" ");

	return (
		<div className="relative px-2 pb-3 pt-1 sm:px-4 sm:pb-4">
			{/* 待答的 ask_user_question：问答面板绝对定位贴底悬浮接管输入栏——
			    不占文档流（不把上方消息区顶起来），跳出/关闭走渐入渐出动画。 */}
			<AnimatePresence>
				{pendingQuestion && (
					<motion.div
						key="ask-user-question"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 12 }}
						transition={SOFT}
						className="absolute inset-x-0 bottom-0 z-20"
					>
						<QuestionPanel pending={pendingQuestion} />
					</motion.div>
				)}
			</AnimatePresence>

			<div
				className={`relative mx-auto w-full max-w-2xl transition-opacity duration-150 ${
					pendingQuestion ? "pointer-events-none opacity-0" : ""
				}`}
				aria-hidden={pendingQuestion ? true : undefined}
			>
				<SlashPanel
					open={slashOpen}
					onClose={handleSlashClose}
					onSelect={handleSlashSelect}
					filter={inputValue.startsWith("/") ? inputValue : ""}
					cwd={effectiveCwd || undefined}
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
								initial={COLLAPSE_INITIAL}
								animate={COLLAPSE_ANIMATE}
								exit={COLLAPSE_EXIT}
								transition={SOFT}
								className="overflow-hidden"
							>
								<div className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
									<AnimatePresence initial={false}>
										{editImageAttachment && (
											<Capsule
												key="edit-image-capsule"
												icon="icon-[solar--gallery-linear]"
												label={t("inputBar.capsule.editImage")}
												tone="primary"
												onRemove={() => setEditImageAttachment(null)}
											/>
										)}
										{selectedSkill && (
											<Capsule
												key="skill-capsule"
												icon={
													selectedSkill.type === "scene"
														? "icon-[solar--clapperboard-open-linear]"
														: "icon-[solar--magic-stick-linear]"
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
														? "icon-[solar--folder-linear]"
														: "icon-[solar--file-linear]"
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
												initial={IMAGE_INITIAL}
												animate={IMAGE_ANIMATE}
												exit={IMAGE_INITIAL}
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
														title={t("inputBar.capsule.removeImage")}
														style={{ height: 18, width: 18 }}
													>
														<span className="icon-[solar--close-circle-linear] h-3 w-3" />
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
								icon="icon-[solar--add-circle-linear]"
								title={t("inputBar.toolbar.skills")}
								disabled={!hasSession}
								onClick={handlePlusClick}
								active={slashOpen}
							/>
							<ToolbarButton
								icon="icon-[solar--gallery-linear]"
								title={t("inputBar.toolbar.addImage")}
								disabled={!hasSession}
								onClick={handleSelectImages}
							/>
							<ToolbarButton
								icon="icon-[solar--paperclip-linear]"
								title={t("inputBar.toolbar.attachFile")}
								disabled={!hasSession}
								onClick={handleSelectFiles}
							/>
							<div className="ml-1 h-4 w-px shrink-0 bg-border/70" />
							<div className="min-w-0 flex-shrink">
								<ExecutionModeSelector />
							</div>
							<ActiveInputActionChips />
						</div>

						<div className="ml-auto flex min-w-0 flex-shrink items-center gap-1">
							<div className="min-w-0 flex-shrink">
								<ModelSelector />
							</div>
							<ContextRing className="mr-1" />
							<motion.span
								key={isStreaming ? "s" : isEmpty ? "e" : "n"}
								initial={SEND_HINT_INITIAL}
								animate={SEND_HINT_ANIMATE}
								transition={SOFT}
								className="mx-1 hidden text-[10.5px] text-muted-foreground/50 select-none md:inline"
							>
								{isStreaming ? "" : isEmpty ? t("inputBar.hint.send") : t("inputBar.hint.newline")}
							</motion.span>
							<SendButton
								canSend={canSend}
								isStreaming={isStreaming}
								onSend={handleSend}
								onAbort={handleAbort}
							/>
						</div>
					</div>
				</div>

				<InputActionBar />
			</div>
		</div>
	);
}

const Capsule = memo(function Capsule({
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
	const { t } = useTranslation("chat");
	const toneClass =
		tone === "primary"
			? "bg-primary/10 text-primary border-primary/20"
			: "bg-muted text-muted-foreground border-border/60";
	return (
		<motion.button
			type="button"
			layout
			initial={CAPSULE_INITIAL}
			animate={CAPSULE_ANIMATE}
			exit={CAPSULE_EXIT}
			transition={SPRING}
			whileHover={CAPSULE_HOVER}
			whileTap={CAPSULE_TAP}
			onClick={onRemove}
			title={title ? t("inputBar.capsule.removeTooltip", { path: title }) : t("inputBar.capsule.removeDefault")}
			className={`group flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${toneClass}`}
		>
			<span className={`${icon} h-3 w-3 shrink-0`} />
			<span className="max-w-[140px] truncate">{label}</span>
			<span className="icon-[solar--close-circle-linear] h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
		</motion.button>
	);
});

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
	const { t } = useTranslation("chat");
	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2">
				<div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
					<span className="icon-[solar--shield-keyhole-minimalistic-linear] h-4 w-4" />
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
					{t("inputBar.permission.deny")}
				</button>
				<button
					type="button"
					onClick={request.onConfirm}
					className="h-7 rounded-lg bg-amber-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-amber-600"
				>
					{t("inputBar.permission.allow")}
				</button>
				{!request.sensitive && request.onAllowSession ? (
					<button
						type="button"
						onClick={request.onAllowSession}
						className="h-7 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-[12px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
					>
						{t("inputBar.permission.allowSession")}
					</button>
				) : null}
			</div>
		</div>
	);
}

const ToolbarButton = memo(function ToolbarButton({
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
			whileHover={!disabled ? TOOLBAR_BUTTON_HOVER : undefined}
			whileTap={!disabled ? TOOLBAR_BUTTON_TAP : undefined}
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
});
