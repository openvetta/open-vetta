import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react";
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
	pendingQuestionsAtom,
	promptSuggestionsAtom,
	sandboxPermissionDrawerAtom,
	selectedSkillAtom,
	todoItemsBySessionAtom,
	type AttachedImage,
	type MentionedFile,
} from "@shared/store/atoms";
import { getQueueForSession, messageQueueBySessionAtom } from "@shared/store/message-queue-atoms";
import { pathBasename } from "@shared/lib/utils";
import type { SelectedFile } from "../AtPanel";
import type { InputBarModel, InputBarProps, InputBarDrawerItem } from "./types";

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 140;

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
	const focusInputRequest = useAtomValue(focusInputRequestAtom);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [isFocused, setIsFocused] = useState(false);
	const [slashOpen, setSlashOpen] = useState(false);
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
	const hasCapsules =
		Boolean(selectedSkill) || mentionedFiles.length > 0 || Boolean(editImageAttachment) || Boolean(appshotAttachment);

	useEffect(() => {
		if (sandboxPermission) setDrawerActiveTab("sandbox-permission");
	}, [sandboxPermission]);

	const prevValueLenRef = useRef(inputValue.length);
	const resize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
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

			const slashActive = val === "/" || (val.startsWith("/") && !val.includes(" "));
			if (!slashActive) {
				slashDismissedRef.current = false;
				if (slashOpen) setSlashOpen(false);
			} else if (!slashDismissedRef.current) {
				if (!slashOpen) setSlashOpen(true);
				if (atOpen) setAtOpen(false);
			}

			const cursorPos = e.target.selectionStart ?? val.length;
			const textBeforeCursor = val.slice(0, cursorPos);
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
		if (selected.length > 0) addImages(selected);
		textareaRef.current?.focus();
	}, [addImages, hasSession]);

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
	}, [effectiveCwd, hasSession, setMentionedFiles]);

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
		},
		[addImages],
	);

	const placeholder = !hasSession
		? t("inputBar.placeholder.noSession")
		: isStreaming
			? t("inputBar.placeholder.thinking")
			: isEmpty && firstSuggestion
				? t("inputBar.placeholder.suggestion", { suggestion: firstSuggestion })
				: t("inputBar.placeholder.default");

	return {
		inputValue,
		isStreaming,
		pendingQuestion,
		firstSuggestion,
		attachedImages,
		selectedSkill,
		mentionedFiles,
		appshotAttachment,
		hasSession,
		canSend,
		isEmpty,
		hasCapsules,
		effectiveCwd,
		placeholder,
		isFocused,
		slashOpen,
		atOpen,
		drawerItems,
		drawerActiveTab,
		hasEditImageAttachment: Boolean(editImageAttachment),
		textareaRef,
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
			handlePlusClick,
			handleSelectImages,
			handleSelectFiles,
			handleSend,
			handleAbort,
		},
	};
}
