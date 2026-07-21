import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent, MouseEvent } from "react";
import type { SkillInfo } from "@preload/api";
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	activityPanelTabByProjectAtom,
	attachedImagesAtom,
	appshotAttachmentAtom,
	editImageAttachmentAtom,
	focusInputRequestAtom,
	getTodoItemsForSession,
	inputValueAtom,
	isStreamingAtom,
	mentionedFilesAtom,
	pendingMessageEditAtom,
	pendingQuestionsAtom,
	promptSuggestionsAtom,
	sandboxPermissionDrawerAtom,
	selectedSkillAtom,
	todoItemsBySessionAtom,
	type AttachedImage,
	type MentionedFile,
} from "@shared/store/atoms";
import { getQueueForSession, messageQueueBySessionAtom } from "@shared/store/message-queue-atoms";
import { filePreviewAtom, type FilePreviewItem } from "@shared/store/file-preview-atoms";
import { recordInputFilesAdded, recordInputImagesAdded } from "@shared/lib/app-monitor-events";
import { pathBasename, toVettaFileUrl } from "@shared/lib/utils";
import type { InputBarContextMenuViewProps } from "@vetta/theme-ui/chat";
import type { SelectedFile } from "../AtPanel";
import type { InputBarModel, InputBarProps, InputBarDrawerItem } from "./types";

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 140;
const CONTEXT_MENU_WIDTH = 160;
const CONTEXT_MENU_HEIGHT = 112;
const CONTEXT_MENU_VIEWPORT_GAP = 8;

interface InputBarContextMenuState {
	canCopy: boolean;
	canCut: boolean;
	canPaste: boolean;
	/** Snapshot selection at menu open — survives blur when clicking menu items. */
	selectionEnd: number;
	selectionStart: number;
	x: number;
	y: number;
}

function clampContextMenuPosition(clientX: number, clientY: number): { x: number; y: number } {
	return {
		x: Math.max(
			CONTEXT_MENU_VIEWPORT_GAP,
			Math.min(clientX, window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_VIEWPORT_GAP),
		),
		y: Math.max(
			CONTEXT_MENU_VIEWPORT_GAP,
			Math.min(clientY, window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_VIEWPORT_GAP),
		),
	};
}

async function clipboardHasText(): Promise<boolean> {
	try {
		const text = await navigator.clipboard.readText();
		return text.length > 0;
	} catch {
		// Permission denied or unsupported — still offer paste so user can try.
		return true;
	}
}

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

const INPUT_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);

function getPathExtension(path: string): string {
	const idx = path.lastIndexOf(".");
	if (idx < 0) return "";
	return path.slice(idx + 1).toLowerCase();
}

function isInputImageFile(file: MentionedFile): boolean {
	return INPUT_IMAGE_EXTENSIONS.has(getPathExtension(file.path));
}

async function readMentionedFileSize(path: string, isDirectory: boolean): Promise<number | undefined> {
	if (isDirectory) return undefined;
	const stat = await window.vetta.fs.stat(path).catch(() => null);
	return stat && stat.size > 0 ? stat.size : undefined;
}

export function useInputBarModel({
	onSend,
	onAbort,
	onSendQueued,
	cwdOverride,
}: InputBarProps): InputBarModel {
	const { t } = useTranslation("chat");
	const [inputValue, setInputValue] = useAtom(inputValueAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const pendingQuestions = useAtomValue(pendingQuestionsAtom);
	const pendingQuestion = activeSession?.runtimeId ? pendingQuestions[activeSession.runtimeId] : undefined;
	const promptSuggestions = useAtomValue(promptSuggestionsAtom);
	const firstSuggestion = activeSession?.runtimeId ? promptSuggestions[activeSession.runtimeId]?.[0] : undefined;
	const [attachedImages, setAttachedImages] = useAtom(attachedImagesAtom);
	const [selectedSkill, setSelectedSkill] = useAtom(selectedSkillAtom);
	const [mentionedFiles, setMentionedFiles] = useAtom(mentionedFilesAtom);
	const [editImageAttachment, setEditImageAttachment] = useAtom(editImageAttachmentAtom);
	const [appshotAttachment, setAppshotAttachment] = useAtom(appshotAttachmentAtom);
	const [pendingMessageEdit, setPendingMessageEdit] = useAtom(pendingMessageEditAtom);
	const focusInputRequest = useAtomValue(focusInputRequestAtom);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [isFocused, setIsFocused] = useState(false);
	const [contextMenuState, setContextMenuState] = useState<InputBarContextMenuState | null>(null);
	const [slashOpen, setSlashOpen] = useState(false);
	const [slashFilter, setSlashFilter] = useState("");
	const [atOpen, setAtOpen] = useState(false);
	const slashDismissedRef = useRef(false);
	const atDismissedIndexRef = useRef<number | null>(null);
	const todoMap = useAtomValue(todoItemsBySessionAtom);
	const sandboxPermission = useAtomValue(sandboxPermissionDrawerAtom);
	const todoItems = useMemo(
		() => getTodoItemsForSession(todoMap, activeSession?.runtimeId ?? null),
		[todoMap, activeSession?.runtimeId],
	);
	const queueMap = useAtomValue(messageQueueBySessionAtom);
	const queueItems = useMemo(
		() => getQueueForSession(queueMap, activeSession?.runtimeId ?? null),
		[queueMap, activeSession?.runtimeId],
	);
	const setActivityPanelOpen = useSetAtom(activityPanelOpenAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);
	const [drawerActiveTab, setDrawerActiveTab] = useState<string | null>(null);

	const effectiveCwd = activeSession?.cwd ?? cwdOverride ?? "";
	const hasSession = Boolean(activeSession) || Boolean(cwdOverride);
	const canSend =
		hasSession &&
		!isStreaming &&
		(inputValue.trim().length > 0 || attachedImages.length > 0 || Boolean(appshotAttachment));
	const isEmpty = inputValue.trim().length === 0 && attachedImages.length === 0;
	/** 与原生 placeholder 一致：任意字符（含空格）即隐藏覆盖层 */
	const showPlaceholder = inputValue.length === 0;
	const hasCapsules =
		Boolean(selectedSkill) ||
		mentionedFiles.length > 0 ||
		Boolean(editImageAttachment) ||
		Boolean(appshotAttachment) ||
		Boolean(pendingMessageEdit);

	// 分离图片文件与非图片文件，图片在附件区独立作为缩略图行展示
	const imageFiles = useMemo(
		() => mentionedFiles.filter((f) => isInputImageFile(f)),
		[mentionedFiles],
	);
	const nonImageFiles = useMemo(
		() => mentionedFiles.filter((f) => !isInputImageFile(f)),
		[mentionedFiles],
	);
	const hasImages = imageFiles.length > 0;
	const imagePreviewItems: FilePreviewItem[] = useMemo(
		() =>
			imageFiles.map((f) => ({
				url: toVettaFileUrl(f.path),
				path: f.path,
				name: pathBasename(f.path),
			})),
		[imageFiles],
	);
	const setFilePreview = useSetAtom(filePreviewAtom);
	const openImagePreview = useCallback(
		(index: number) => {
			setFilePreview({ items: imagePreviewItems, index });
		},
		[imagePreviewItems, setFilePreview],
	);

	useEffect(() => {
		if (sandboxPermission) setDrawerActiveTab("sandbox-permission");
	}, [sandboxPermission]);

	const prevValueLenRef = useRef(inputValue.length);
	/**
	 * Auto-resize the textarea to content height.
	 *
	 * Shrinking must reset height before reading scrollHeight, but a bare
	 * `height: 0` reflows the flex column: MessageList expands, its scrollTop
	 * is clamped, then the height is restored and stick-to-bottom lerps back —
	 * visible list jitter on every Backspace while multi-line.
	 * Lock the parent box height for the measure so MessageList never sees the
	 * intermediate collapse.
	 */
	const resize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		const shrinking = el.value.length < prevValueLenRef.current;
		prevValueLenRef.current = el.value.length;

		if (shrinking) {
			const host = el.parentElement;
			const lockPx = host?.offsetHeight ?? el.offsetHeight;
			if (host) host.style.minHeight = `${lockPx}px`;
			el.style.height = "0px";
			const next = Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, MAX_HEIGHT));
			el.style.height = `${next}px`;
			if (host) host.style.minHeight = "";
			return;
		}

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

	useEffect(() => {
		if (focusInputRequest > 0) textareaRef.current?.focus();
	}, [focusInputRequest]);

	const handleSend = useCallback(() => {
		void onSend();
	}, [onSend]);

	const handleAbort = useCallback(() => {
		void onAbort();
	}, [onAbort]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>): void => {
			if (
				(slashOpen || atOpen) &&
				(e.key === "ArrowDown" ||
					e.key === "ArrowUp" ||
					e.key === "Escape" ||
					e.key === "Tab")
			) {
				e.preventDefault();
				return;
			}
			if (slashOpen && e.key === "Enter") {
				e.preventDefault();
				return;
			}
			if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault();
				if (canSend) void onSend();
				else if (isStreaming && hasSession && !isEmpty) void onSend();
				else if (hasSession && !isStreaming && isEmpty && firstSuggestion) void onSend(firstSuggestion);
			}
			if (e.key === "Backspace" && inputValue === "" && hasCapsules) {
				e.preventDefault();
				if (mentionedFiles.length > 0) {
					const last = mentionedFiles[mentionedFiles.length - 1];
					setMentionedFiles((prev) => prev.filter((f) => f.path !== last.path));
				} else if (selectedSkill) {
					setSelectedSkill(null);
				}
			}
		},
		[
			slashOpen,
			atOpen,
			canSend,
			isStreaming,
			hasSession,
			isEmpty,
			firstSuggestion,
			inputValue,
			hasCapsules,
			mentionedFiles,
			selectedSkill,
			onSend,
			setMentionedFiles,
			setSelectedSkill,
		],
	);

	const handleChange = useCallback(
		(e: ChangeEvent<HTMLTextAreaElement>): void => {
			const val = e.target.value;
			setInputValue(val);

			const cursorPos = e.target.selectionStart ?? val.length;
			const textBeforeCursor = val.slice(0, cursorPos);

			const slashActive =
				textBeforeCursor === "/" ||
				(textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" "));
			if (!slashActive) {
				setSlashFilter("");
				slashDismissedRef.current = false;
				if (slashOpen) setSlashOpen(false);
			} else if (!slashDismissedRef.current) {
				setSlashFilter(textBeforeCursor);
				if (!slashOpen) setSlashOpen(true);
				if (atOpen) setAtOpen(false);
			}

			const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
			const atIndex = atMatch ? (atMatch.index ?? null) : null;
			if (atIndex === null) {
				atDismissedIndexRef.current = null;
				if (atOpen) setAtOpen(false);
			} else if (atDismissedIndexRef.current === atIndex) {
				if (atOpen) setAtOpen(false);
			} else if (!slashActive) {
				if (!atOpen) setAtOpen(true);
			}
		},
		[atOpen, setInputValue, slashOpen],
	);

	const handleSlashClose = useCallback(() => {
		setSlashOpen(false);
		setSlashFilter("");
		const el = textareaRef.current;
		const cursorPos = el?.selectionStart ?? inputValue.length;
		const textBeforeCursor = inputValue.slice(0, cursorPos);
		if (
			textBeforeCursor === "/" ||
			(textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" "))
		) {
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

	const getAtFilter = useCallback((): string => {
		const val = inputValue;
		const el = textareaRef.current;
		const cursorPos = el?.selectionStart ?? val.length;
		const textBeforeCursor = val.slice(0, cursorPos);
		const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
		return atMatch ? atMatch[0] : "";
	}, [inputValue]);

	const handleSlashSelect = useCallback(
		(skill: SkillInfo) => {
			setSelectedSkill({ name: skill.name, alias: skill.alias, type: skill.type });
			setSlashOpen(false);
			if (inputValue.startsWith("/")) {
				setInputValue("");
			}
			textareaRef.current?.focus();
		},
		[inputValue, setInputValue, setSelectedSkill],
	);

	const handleRemoveSkill = useCallback(() => {
		setSelectedSkill(null);
		textareaRef.current?.focus();
	}, [setSelectedSkill]);

	const handleAtSelect = useCallback(
		async (file: SelectedFile) => {
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
			const sizeBytes = await readMentionedFileSize(file.path, file.isDirectory);
			const newFile: MentionedFile = {
				path: file.path,
				name: file.name,
				isDirectory: file.isDirectory,
				...(sizeBytes === undefined ? {} : { sizeBytes }),
			};
			setMentionedFiles((prev) => [...prev, newFile]);
			recordInputFilesAdded("at-panel", [newFile]);
			setAtOpen(false);
			const atFilter = getAtFilter();
			if (atFilter) {
				const el = textareaRef.current;
				const cursorPos = el?.selectionStart ?? inputValue.length;
				setInputValue(inputValue.slice(0, cursorPos - atFilter.length) + inputValue.slice(cursorPos));
			}
			textareaRef.current?.focus();
		},
		[getAtFilter, inputValue, mentionedFiles, setInputValue, setMentionedFiles],
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

	const drawerItems = useMemo((): InputBarDrawerItem[] => {
		const items: InputBarDrawerItem[] = [];
		if (sandboxPermission) {
			items.push({
				kind: "sandbox-permission",
				id: "sandbox-permission",
				label: t("inputBar.drawer.permissionLabel"),
				desc: t("inputBar.drawer.permissionDesc"),
				pulsing: true,
				request: sandboxPermission,
			});
		}
		if (queueItems.length > 0 && activeSession) {
			const runtimeId = activeSession.runtimeId;
			items.push({
				kind: "queue",
				id: "queue",
				label: t("inputBar.drawer.queueLabel"),
				desc: t("inputBar.drawer.queueDesc", { count: queueItems.length }),
				runtimeId,
				onSendNow: (id) => onSendQueued?.(runtimeId, id),
			});
		}
		if (todoItems.length === 0) return items;
		const inProgressItem = todoItems.find((i) => i.status === "in_progress");
		const doneCount = todoItems.filter((i) => i.status === "done").length;
		items.push({
			kind: "todo",
			id: "todo",
			label: t("inputBar.drawer.todoLabel"),
			desc: inProgressItem
				? t("inputBar.drawer.todoDesc", {
						done: doneCount,
						total: todoItems.length,
						content: inProgressItem.content,
					})
				: t("inputBar.drawer.todoDescSimple", { done: doneCount, total: todoItems.length }),
			pulsing: !!inProgressItem,
			items: todoItems,
			onViewMore: handleTodoViewMore,
		});
		return items;
	}, [activeSession, handleTodoViewMore, onSendQueued, queueItems.length, sandboxPermission, t, todoItems]);

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
		if (selected.length > 0) {
			addImages(selected);
			recordInputImagesAdded("image-dialog", selected);
		}
		textareaRef.current?.focus();
	}, [addImages, hasSession]);

	const handleSelectFiles = useCallback(async () => {
		if (!hasSession) return;
		const paths = await window.vetta.dialog.selectFiles(effectiveCwd || undefined);
		if (paths.length > 0) {
			const seen = new Set(mentionedFiles.map((f) => f.path));
			const additions: MentionedFile[] = [];
			for (const path of paths) {
				if (seen.has(path)) continue;
				seen.add(path);
				const sizeBytes = await readMentionedFileSize(path, false);
				additions.push({
					path,
					name: pathBasename(path),
					isDirectory: false,
					...(sizeBytes === undefined ? {} : { sizeBytes }),
				});
			}
			if (additions.length > 0) {
				setMentionedFiles((prev) => [...prev, ...additions]);
				recordInputFilesAdded("file-dialog", additions);
			}
		}
		textareaRef.current?.focus();
	}, [effectiveCwd, hasSession, mentionedFiles, setMentionedFiles]);

	const handlePaste = useCallback(
		async (e: ClipboardEvent) => {
			const items = Array.from(e.clipboardData.items);
			const imageFiles = items
				.filter((item) => item.kind === "file" && item.type.startsWith("image/"))
				.map((item) => item.getAsFile())
				.filter((f): f is File => f !== null);
			if (imageFiles.length === 0) return;
			e.preventDefault();
			const images = await Promise.all(imageFiles.map(readFileAsImage));
			addImages(images);
			recordInputImagesAdded(
				"paste",
				imageFiles.map((file, index) => ({ file, ...images[index] })),
			);
		},
		[addImages],
	);

	const closeContextMenu = useCallback(() => setContextMenuState(null), []);

	const handleContextMenu = useCallback(
		(e: MouseEvent<HTMLTextAreaElement>): void => {
			e.preventDefault();
			if (!hasSession) return;
			const el = textareaRef.current;
			if (!el) return;
			const selectionStart = el.selectionStart ?? 0;
			const selectionEnd = el.selectionEnd ?? 0;
			const hasSelection = selectionStart !== selectionEnd;
			const position = clampContextMenuPosition(e.clientX, e.clientY);
			void clipboardHasText().then((hasClipboard) => {
				setContextMenuState({
					...position,
					canCopy: hasSelection,
					canCut: hasSelection,
					canPaste: hasClipboard,
					selectionEnd,
					selectionStart,
				});
			});
		},
		[hasSession],
	);

	const handleMenuCut = useCallback(() => {
		const state = contextMenuState;
		closeContextMenu();
		if (!state || state.selectionStart === state.selectionEnd) return;
		const { selectionStart: start, selectionEnd: end } = state;
		const selected = inputValue.slice(start, end);
		void navigator.clipboard.writeText(selected).catch((error) => {
			console.warn("[useInputBarModel] cut clipboard write failed", error);
		});
		const next = inputValue.slice(0, start) + inputValue.slice(end);
		setInputValue(next);
		const el = textareaRef.current;
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(start, start);
		});
	}, [closeContextMenu, contextMenuState, inputValue, setInputValue]);

	const handleMenuCopy = useCallback(() => {
		const state = contextMenuState;
		closeContextMenu();
		if (!state || state.selectionStart === state.selectionEnd) return;
		void navigator.clipboard
			.writeText(inputValue.slice(state.selectionStart, state.selectionEnd))
			.catch((error) => {
				console.warn("[useInputBarModel] copy clipboard write failed", error);
			});
	}, [closeContextMenu, contextMenuState, inputValue]);

	const handleMenuPaste = useCallback(() => {
		const state = contextMenuState;
		closeContextMenu();
		const el = textareaRef.current;
		if (!el || !hasSession) return;
		const start = state?.selectionStart ?? el.selectionStart ?? inputValue.length;
		const end = state?.selectionEnd ?? el.selectionEnd ?? start;
		void (async () => {
			let clip = "";
			try {
				clip = await navigator.clipboard.readText();
			} catch (error) {
				console.warn("[useInputBarModel] paste clipboard read failed", error);
				return;
			}
			if (!clip) return;
			const next = inputValue.slice(0, start) + clip + inputValue.slice(end);
			setInputValue(next);
			const cursor = start + clip.length;
			requestAnimationFrame(() => {
				el.focus();
				el.setSelectionRange(cursor, cursor);
			});
		})();
	}, [closeContextMenu, contextMenuState, hasSession, inputValue, setInputValue]);

	const defaultPlaceholders = useMemo(() => {
		const raw = t("inputBar.placeholder.defaults", { returnObjects: true });
		const list = Array.isArray(raw) ? (raw as string[]) : [];
		return list.filter((item) => typeof item === "string" && item.length > 0);
	}, [t]);

	const { placeholderTexts, placeholderRotating } = useMemo(() => {
		if (!hasSession) {
			return {
				placeholderTexts: [t("inputBar.placeholder.noSession")] as const,
				placeholderRotating: false,
			};
		}
		if (isStreaming) {
			return {
				placeholderTexts: [t("inputBar.placeholder.thinking")] as const,
				placeholderRotating: false,
			};
		}
		if (showPlaceholder && firstSuggestion) {
			return {
				placeholderTexts: [
					t("inputBar.placeholder.suggestion", { suggestion: firstSuggestion }),
				] as const,
				placeholderRotating: false,
			};
		}
		return {
			placeholderTexts: defaultPlaceholders,
			placeholderRotating: defaultPlaceholders.length > 1,
		};
	}, [hasSession, isStreaming, showPlaceholder, firstSuggestion, defaultPlaceholders, t]);

	const contextMenu: InputBarContextMenuViewProps | null = contextMenuState
		? {
				canCopy: contextMenuState.canCopy,
				canCut: contextMenuState.canCut,
				canPaste: contextMenuState.canPaste,
				labels: {
					copy: t("inputBar.contextMenu.copy"),
					cut: t("inputBar.contextMenu.cut"),
					paste: t("inputBar.contextMenu.paste"),
				},
				onClose: closeContextMenu,
				onCopy: handleMenuCopy,
				onCut: handleMenuCut,
				onPaste: handleMenuPaste,
				x: contextMenuState.x,
				y: contextMenuState.y,
			}
		: null;

	return {
		inputValue,
		isStreaming,
		pendingQuestion,
		firstSuggestion,
		attachedImages,
		selectedSkill,
		mentionedFiles,
		imageFiles,
		nonImageFiles,
		imagePreviewItems,
		hasImages,
		appshotAttachment,
		hasSession,
		canSend,
		isEmpty,
		showPlaceholder,
		hasCapsules,
		effectiveCwd,
		placeholderTexts,
		placeholderRotating,
		isFocused,
		slashOpen,
		slashFilter,
		atOpen,
		drawerItems,
		drawerActiveTab,
		hasEditImageAttachment: Boolean(editImageAttachment),
		pendingMessageEdit: Boolean(pendingMessageEdit),
		pendingEditHint: t("messageList.edit.pendingHint"),
		cancelPendingEditLabel: t("messageList.interrupt.cancel"),
		textareaRef,
		contextMenu,
		labels: {
			capsule: {
				editImage: t("inputBar.capsule.editImage"),
				removeDefault: t("inputBar.capsule.removeDefault"),
				removeImage: t("inputBar.capsule.removeImage"),
				removeTooltip: (path) => t("inputBar.capsule.removeTooltip", { path }),
			},
			hint: {
				send: t("inputBar.hint.send"),
				newline: t("inputBar.hint.newline"),
			},
			permission: {
				deny: t("inputBar.permission.deny"),
				allow: t("inputBar.permission.allow"),
				allowSession: t("inputBar.permission.allowSession"),
			},
			toolbar: {
				skills: t("inputBar.toolbar.skills"),
				addImage: t("inputBar.toolbar.addImage"),
				attachFile: t("inputBar.toolbar.attachFile"),
				queue: t("inputBar.drawer.queueLabel"),
			},
		},
		actions: {
			setFocused: setIsFocused,
			setDrawerActiveTab,
			handleKeyDown,
			handleChange,
			handlePaste,
			handleContextMenu,
			handleSlashClose,
			handleSlashSelect,
			handleAtClose,
			handleAtSelect,
			getAtFilter,
			removeImage,
			removeSkill: handleRemoveSkill,
			removeFile: handleRemoveFile,
			removeEditImage: () => setEditImageAttachment(null),
			removeAppshot: () => setAppshotAttachment(null),
			openImagePreview,
			handlePlusClick,
			handleSelectImages,
			handleSelectFiles,
			handleSend,
			handleAbort,
			cancelPendingEdit: () => {
				setPendingMessageEdit(null);
				setInputValue("");
				setSelectedSkill(null);
				setMentionedFiles([]);
				setAppshotAttachment(null);
			},
		},
	};
}
