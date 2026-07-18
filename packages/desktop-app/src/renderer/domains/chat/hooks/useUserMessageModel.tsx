import {
	activeSessionAtom,
	appshotAttachmentAtom,
	chatMessagesAtom,
	confirmDialogAtom,
	filePreviewAtom,
	inputValueAtom,
	isStreamingAtom,
	mentionedFilesAtom,
	openSessionFnRef,
	pendingMessageEditAtom,
	selectedSkillAtom,
	type ChatMessage,
	type FilePreviewItem,
} from "@shared/store/atoms";
import { pathBasename, toVettaFileUrl } from "@shared/lib/utils";
import {
	SettingsAssistBadgeView,
	SkillBadgeView,
	type UserMessageContextMenuViewProps,
	type UserMessageEntryState,
	type UserMessageViewProps,
} from "@vetta/theme-ui/chat";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	fullHistoryToChat,
	isSystemAttachmentPath,
	isUserImageFile,
	parseUserPrefixes,
} from "../services/chat-service";
import { AppshotCard, type AppshotCardData } from "../components/AppshotCard";
import { TextBlockView } from "../components/blocks/TextBlock";
import { CopyButton, RelativeTimeLabel } from "../components/message-list/MessageActions";

const DELETE_CONFIRMATION_SUPPRESSION_MS = 60_000;
const CONTEXT_MENU_WIDTH = 170;
const CONTEXT_MENU_HEIGHT = 112;
const CONTEXT_MENU_VIEWPORT_GAP = 8;

let deleteConfirmationSuppressedUntil = 0;

const SETTINGS_ASSIST_TAB_IDS = [
	"mcp",
	"models",
	"knowledge",
	"knowledgeBase",
	"batchTasks",
	"automation",
	"im",
	"webhook",
	"appearance",
	"plugins",
	"pet",
	"environment",
	"shortcuts",
	"agent",
] as const;

type SettingsAssistTabId = (typeof SETTINGS_ASSIST_TAB_IDS)[number];

function isSettingsAssistTabId(value: string): value is SettingsAssistTabId {
	return (SETTINGS_ASSIST_TAB_IDS as readonly string[]).includes(value);
}

function splitAppshotFiles(files: string[]): { appshotImage: string | null; rest: string[] } {
	const isAppshot = (path: string): boolean => /[/\\]image-cache[/\\]appshot[/\\]/.test(path);
	const appshotImage = files.find((path) => isAppshot(path) && /\.png$/i.test(path)) ?? null;
	return { appshotImage, rest: files.filter((path) => !isAppshot(path)) };
}

function getPreviewImageSrc(item: FilePreviewItem): string {
	// Prefer path → vetta-file so stale file:// urls never win after history reload.
	if (item.path) return toVettaFileUrl(item.path);
	if (item.url) return item.url;
	return "";
}

async function abortAndWait(runtimeId: string): Promise<void> {
	const store = getDefaultStore();
	if (!store.get(isStreamingAtom)) return;
	await new Promise<void>((resolve) => {
		let settled = false;
		let unsubscribe: () => void = () => {};
		const finish = (): void => {
			if (settled) return;
			settled = true;
			unsubscribe();
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(finish, 8000);
		unsubscribe = window.vetta.session.onRunningChanged((p) => {
			if (p.sessionId === runtimeId && p.running === false) finish();
		});
		if (!store.get(isStreamingAtom)) {
			finish();
			return;
		}
		void window.vetta.session.abort(runtimeId).catch((err) => {
			console.error("[useUserMessageModel] abort failed:", err);
		});
	});
}

async function reloadChatHistory(runtimeId: string): Promise<void> {
	const history = await window.vetta.session.getFullHistory(runtimeId);
	getDefaultStore().set(chatMessagesAtom, fullHistoryToChat(history));
}

function fillInputFromUserText(
	rawText: string,
	promptRef?: ChatMessage["promptRef"],
	attachments?: ChatMessage["attachments"],
): void {
	const store = getDefaultStore();
	const { skillName, skillType, files, body } = parseUserPrefixes(rawText);
	store.set(inputValueAtom, body);
	store.set(
		selectedSkillAtom,
		promptRef
			? { name: promptRef.name, type: promptRef.kind }
			: skillName
				? { name: skillName, type: skillType ?? "skill" }
				: null,
	);
	// Appshot capsule needs full AppshotAttachment; on re-edit we re-attach the image path
	// via mentionedFiles @prefix instead (sendMessage will include it).
	store.set(appshotAttachmentAtom, null);
	// Restore structured attachments for re-send; legacy @prefixes remain compatible.
	const restoredAttachments =
		attachments ??
		files.map((path) => ({
			kind: isUserImageFile(path) ? ("image" as const) : ("file" as const),
			path,
		}));
	store.set(
		mentionedFilesAtom,
		restoredAttachments.map((attachment) => ({
			path: attachment.path,
			name: pathBasename(attachment.path),
			isDirectory: attachment.kind === "directory",
		})),
	);
}

function inputHasDraft(): boolean {
	const store = getDefaultStore();
	return (
		store.get(inputValueAtom).trim().length > 0 ||
		store.get(selectedSkillAtom) !== null ||
		store.get(mentionedFilesAtom).length > 0 ||
		store.get(appshotAttachmentAtom) !== null
	);
}

export interface UserMessageModelInput {
	entryState: UserMessageEntryState;
	hasAssistantAfter?: boolean;
	isLastUserMessage?: boolean;
	isStreaming?: boolean;
	message: ChatMessage;
	onAbortEdit?: () => void;
	onEntryComplete?: () => void;
}

export interface UserMessageModel extends UserMessageViewProps {
	contextMenu: UserMessageContextMenuViewProps | null;
}

export function useUserMessageModel({
	message,
	entryState,
	isLastUserMessage = false,
	isStreaming = false,
	onAbortEdit,
	onEntryComplete,
}: UserMessageModelInput): UserMessageModel {
	const { t } = useTranslation("chat");
	const parsedUser = parseUserPrefixes(message.text);
	const promptRef =
		message.promptRef ??
		(parsedUser.skillName && parsedUser.skillType
			? { kind: parsedUser.skillType, name: parsedUser.skillName }
			: undefined);
	const skillName = promptRef?.name ?? null;
	const skillType = promptRef?.kind ?? null;
	const { files, body } = parsedUser;
	const attachmentPaths = message.attachments?.map((attachment) => attachment.path) ?? files;
	const { appshotImage, rest: displayFiles } = splitAppshotFiles(attachmentPaths);
	// image-cache (persistImages) must still render as thumbnails; appshot is already split out.
	const imageFiles = displayFiles.filter((file) => isUserImageFile(file));
	const hasExplicitMentionedFiles = message.mentionedFiles !== undefined;
	const fileBadges = message.attachments
		? displayFiles.filter((file) => !isUserImageFile(file))
		: hasExplicitMentionedFiles
			? message.mentionedFiles?.map((file) => file.path).filter((path) => !isUserImageFile(path)) ?? []
			: displayFiles.filter((file) => !isUserImageFile(file));
	const displayText = body;
	const appshotData: AppshotCardData | null =
		message.appshot ?? (appshotImage ? { imagePath: appshotImage } : null);
	// Path-based thumbs are the canonical source (history reload + optimistic after
	// persistImages). Base64 on message.images is only for optimistic display when
	// persist failed. Merging both doubles thumbnails while streaming.
	const imageItems = useMemo<FilePreviewItem[]>(() => {
		const fromPaths = imageFiles.map((path) => ({
			name: pathBasename(path),
			path,
			kind: "image" as const,
		}));
		const hasPersistedImagePaths = imageFiles.some(isSystemAttachmentPath);
		if (hasPersistedImagePaths) {
			return fromPaths;
		}
		const fromBase64 = (message.images ?? []).map((image) => ({
			name: image.name,
			url: `data:${image.mimeType};base64,${image.data}`,
			kind: "image" as const,
			mime: image.mimeType,
		}));
		return [...fromBase64, ...fromPaths];
	}, [imageFiles, message.images]);
	const hasImages = imageItems.length > 0;
	const hasSkillBadge = Boolean(skillName);
	const settingsAssistTabId = message.settingsAssistTabId?.trim() ?? "";
	const hasSettingsAssistBadge = settingsAssistTabId.length > 0;
	const hasFileBadges = fileBadges.length > 0;
	const copyText = displayText.trim();
	const [actionsVisible, setActionsVisible] = useState(false);
	const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
	const setFilePreview = useSetAtom(filePreviewAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const pendingEdit = useAtomValue(pendingMessageEditAtom);

	const hasPersistedEntry = Boolean(message.entryId);
	const canEdit = isLastUserMessage && Boolean(activeSession?.runtimeId);
	const canDelete = hasPersistedEntry && Boolean(activeSession?.runtimeId);
	const canFork = hasPersistedEntry && Boolean(activeSession?.runtimeId);
	const branch = message.branch;
	const canSwitchBranch = Boolean(branch && branch.siblings.length > 1 && message.entryId);
	const isPendingEdit = Boolean(
		pendingEdit && isLastUserMessage && (!message.entryId || pendingEdit.entryId === message.entryId),
	);

	const applyEditFill = useCallback(async () => {
		let entryId = message.entryId;
		if (!entryId && activeSession?.runtimeId) {
			const history = await window.vetta.session.getFullHistory(activeSession.runtimeId);
			for (let index = history.length - 1; index >= 0; index--) {
				const entry = history[index];
				if (entry.type === "message" && entry.message.role === "user" && entry.entryId) {
					entryId = entry.entryId;
					break;
				}
			}
		}
		if (!entryId) return;
		fillInputFromUserText(message.text, message.promptRef, message.attachments);
		getDefaultStore().set(pendingMessageEditAtom, { entryId });
	}, [activeSession?.runtimeId, message.attachments, message.entryId, message.promptRef, message.text]);

	const runWithInterruptConfirm = useCallback(
		(kind: "switch" | "fork", action: () => void | Promise<void>) => {
			const run = (): void => {
				void (async () => {
					const runtimeId = activeSession?.runtimeId;
					if (isStreaming && runtimeId) {
						onAbortEdit?.();
						await abortAndWait(runtimeId);
					}
					await action();
				})();
			};
			if (!isStreaming) {
				run();
				return;
			}
			setConfirmDialog({
				title: t(
					kind === "switch" ? "messageList.interrupt.switchTitle" : "messageList.interrupt.forkTitle",
				),
				message: t(
					kind === "switch" ? "messageList.interrupt.switchBody" : "messageList.interrupt.forkBody",
				),
				confirmLabel: t("messageList.interrupt.confirm"),
				cancelLabel: t("messageList.interrupt.cancel"),
				variant: "danger",
				onConfirm: run,
			});
		},
		[activeSession?.runtimeId, isStreaming, onAbortEdit, setConfirmDialog, t],
	);

	const handleEdit = useCallback(() => {
		const startEdit = (): void => {
			void applyEditFill().catch((error) => {
				console.error("[useUserMessageModel] prepare edit failed:", error);
			});
		};
		if (inputHasDraft() && !isPendingEdit) {
			setConfirmDialog({
				title: t("messageList.edit.overwriteDraftTitle"),
				message: t("messageList.edit.overwriteDraftBody"),
				confirmLabel: t("messageList.edit.overwriteDraftConfirm"),
				cancelLabel: t("messageList.interrupt.cancel"),
				onConfirm: startEdit,
			});
			return;
		}
		startEdit();
	}, [applyEditFill, isPendingEdit, setConfirmDialog, t]);

	const handleSwitchBranch = useCallback(
		(direction: -1 | 1) => {
			if (!branch || !message.entryId || !activeSession?.runtimeId) return;
			const nextIndex = branch.index + direction;
			if (nextIndex < 0 || nextIndex >= branch.siblings.length) return;
			const targetId = branch.siblings[nextIndex];
			if (!targetId || targetId === message.entryId) return;
			// Cancel pending edit when switching branches
			getDefaultStore().set(pendingMessageEditAtom, null);
			runWithInterruptConfirm("switch", async () => {
				const runtimeId = activeSession.runtimeId;
				await window.vetta.session.switchBranch(runtimeId, targetId);
				await reloadChatHistory(runtimeId);
			});
		},
		[activeSession?.runtimeId, branch, message.entryId, runWithInterruptConfirm],
	);

	const handleFork = useCallback(() => {
		if (!message.entryId || !activeSession?.runtimeId) return;
		runWithInterruptConfirm("fork", async () => {
			// Drop any in-progress re-edit before switching sessions — pending entryIds
			// belong to the source session and cannot be replaced after opening the fork.
			const store = getDefaultStore();
			store.set(pendingMessageEditAtom, null);
			store.set(inputValueAtom, "");
			store.set(selectedSkillAtom, null);
			store.set(mentionedFilesAtom, []);
			store.set(appshotAttachmentAtom, null);

			const runtimeId = activeSession.runtimeId;
			const cwd = activeSession.cwd;
			const { path } = await window.vetta.session.forkSession(runtimeId, message.entryId!);
			const open = openSessionFnRef.current;
			if (open) {
				await open(cwd, path);
			}
			// Fork file includes the selected user message; leaf is that message.
			// Do not set pendingMessageEdit — next send is a normal follow-up.
			store.set(pendingMessageEditAtom, null);
		});
	}, [activeSession?.cwd, activeSession?.runtimeId, message.entryId, runWithInterruptConfirm]);

	const closeContextMenu = useCallback(() => setContextMenuPosition(null), []);

	const handleOpenContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		setContextMenuPosition({
			x: Math.max(
				CONTEXT_MENU_VIEWPORT_GAP,
				Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_VIEWPORT_GAP),
			),
			y: Math.max(
				CONTEXT_MENU_VIEWPORT_GAP,
				Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_VIEWPORT_GAP),
			),
		});
	}, []);

	const handleMenuEdit = useCallback(() => {
		closeContextMenu();
		handleEdit();
	}, [closeContextMenu, handleEdit]);

	const handleMenuCopy = useCallback(() => {
		closeContextMenu();
		if (!copyText) return;
		void navigator.clipboard.writeText(copyText).catch((error) => {
			console.warn("[useUserMessageModel] copy failed", error);
		});
	}, [closeContextMenu, copyText]);

	const performDelete = useCallback(
		async (suppressForOneMinute: boolean): Promise<void> => {
			if (!message.entryId || !activeSession?.runtimeId) return;
			const runtimeId = activeSession.runtimeId;
			if (isStreaming) {
				onAbortEdit?.();
				await abortAndWait(runtimeId);
			}
			await window.vetta.session.deleteMessage(runtimeId, message.entryId);
			if (suppressForOneMinute) {
				deleteConfirmationSuppressedUntil = Date.now() + DELETE_CONFIRMATION_SUPPRESSION_MS;
			}
			if (pendingEdit?.entryId === message.entryId) {
				getDefaultStore().set(pendingMessageEditAtom, null);
			}
			await reloadChatHistory(runtimeId);
		},
		[activeSession?.runtimeId, isStreaming, message.entryId, onAbortEdit, pendingEdit?.entryId],
	);

	const runDelete = useCallback(
		(suppressForOneMinute: boolean) => {
			void performDelete(suppressForOneMinute).catch((error) => {
				console.error("[useUserMessageModel] delete failed:", error);
			});
		},
		[performDelete],
	);

	const handleMenuDelete = useCallback(() => {
		closeContextMenu();
		if (!canDelete) return;
		if (Date.now() < deleteConfirmationSuppressedUntil) {
			runDelete(false);
			return;
		}
		setConfirmDialog({
			title: t("messageList.delete.title"),
			message: t(isStreaming ? "messageList.delete.streamingBody" : "messageList.delete.body"),
			confirmLabel: t("messageList.delete.confirm"),
			cancelLabel: t("messageList.interrupt.cancel"),
			checkbox: {
				label: t("messageList.delete.suppressForOneMinute"),
				checked: false,
			},
			variant: "danger",
			onConfirm: runDelete,
		});
	}, [canDelete, closeContextMenu, isStreaming, runDelete, setConfirmDialog, t]);

	const labels = {
		expand: t("messageList.userMessage.expand"),
		edit: t("messageList.editButton"),
		fork: t("messageList.forkButton"),
		skillBadge: t("messageList.userMessage.skillBadge"),
		sceneBadge: t("messageList.userMessage.sceneBadge"),
		branchPrev: t("messageList.branch.prev"),
		branchNext: t("messageList.branch.next"),
		branchPosition: branch
			? t("messageList.branch.position", { current: branch.index + 1, total: branch.siblings.length })
			: "",
		pendingEdit: t("messageList.edit.pendingHint"),
	};

	const settingsLabel = hasSettingsAssistBadge
		? t(
				isSettingsAssistTabId(settingsAssistTabId)
					? (`messageList.userMessage.settingsAssist.${settingsAssistTabId}` as const)
					: "messageList.userMessage.settingsAssist.unknown",
			)
		: "";

	const badges: ReactNode = (
		<>
			{hasSettingsAssistBadge && <SettingsAssistBadgeView label={settingsLabel} />}
			{skillName && (
				<SkillBadgeView
					name={skillName}
					type={skillType ?? "skill"}
					skillLabel={labels.skillBadge}
					sceneLabel={labels.sceneBadge}
				/>
			)}
		</>
	);

	const images: ReactNode = (
		<div className="flex max-w-full justify-end gap-2 overflow-x-auto">
			{imageItems.map((item, index) => {
				const src = getPreviewImageSrc(item);
				return (
					<button
						key={item.path ?? item.url ?? `${item.name}-${index}`}
						type="button"
						onClick={() => setFilePreview({ items: imageItems, index })}
						className="group relative h-20 w-20 overflow-hidden rounded-xl border border-border/60 bg-muted/60 transition-colors hover:border-primary/50"
						title={item.path ?? item.name}
					>
						<img src={src} alt={item.name} className="h-full w-full object-cover" />
						<span className="pointer-events-none absolute inset-0 bg-foreground/0 transition-colors group-hover:bg-foreground/10" />
					</button>
				);
			})}
		</div>
	);

	const fileBadgeNodes: ReactNode = (
		<>
			{fileBadges.map((file) => {
				const name = pathBasename(file);
				return (
					<button
						key={file}
						type="button"
						className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
						title={file}
						onClick={() => setFilePreview({ name, path: file })}
					>
						<span className="icon-[solar--file-linear] h-3 w-3" />
						{name}
					</button>
				);
			})}
		</>
	);

	return {
		entryState,
		displayText,
		hasImages,
		hasSkillBadge,
		hasSettingsAssistBadge,
		hasFileBadges,
		hasAppshot: Boolean(appshotData),
		copyText,
		contextMenu: contextMenuPosition
			? {
					canCopy: Boolean(copyText),
					canDelete,
					canEdit,
					labels: {
						copy: t("messageList.contextMenu.copy"),
						delete: t("messageList.contextMenu.delete"),
						edit: t("messageList.contextMenu.edit"),
					},
					onClose: closeContextMenu,
					onCopy: handleMenuCopy,
					onDelete: handleMenuDelete,
					onEdit: handleMenuEdit,
					x: contextMenuPosition.x,
					y: contextMenuPosition.y,
				}
			: null,
		isLastUserMessage,
		canEdit,
		canSwitchBranch,
		canFork,
		isPendingEdit,
		branchIndex: branch?.index ?? 0,
		branchTotal: branch?.siblings.length ?? 0,
		actionsVisible,
		labels,
		appshot: appshotData ? <AppshotCard data={appshotData} /> : null,
		images,
		badges,
		fileBadges: fileBadgeNodes,
		textBody: (
			<TextBlockView
				text={displayText}
				className="max-w-full overflow-x-auto [overflow-wrap:anywhere] [&_code]:break-all"
			/>
		),
		relativeTime: message.timestamp ? <RelativeTimeLabel endedAt={message.timestamp} /> : null,
		copyButton: <CopyButton getText={() => copyText} />,
		onEntryComplete,
		onContextMenu: handleOpenContextMenu,
		onEdit: handleEdit,
		onFork: handleFork,
		onBranchPrev: () => handleSwitchBranch(-1),
		onBranchNext: () => handleSwitchBranch(1),
		onActionsVisibleChange: setActionsVisible,
	};
}
