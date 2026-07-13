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
	type UserMessageEntryState,
	type UserMessageViewProps,
} from "@vetta/theme-ui/chat";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { fullHistoryToChat, parseUserPrefixes } from "../services/chat-service";
import { AppshotCard, type AppshotCardData } from "../components/AppshotCard";
import { TextBlockView } from "../components/blocks/TextBlock";
import { CopyButton, RelativeTimeLabel } from "../components/message-list/MessageActions";

const USER_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);

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

function getPathExtension(path: string): string {
	const basename = pathBasename(path);
	const dotIndex = basename.lastIndexOf(".");
	return dotIndex === -1 ? "" : basename.slice(dotIndex + 1).toLowerCase();
}

function isUserImageFile(path: string): boolean {
	return USER_IMAGE_EXTENSIONS.has(getPathExtension(path));
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

function fillInputFromUserText(rawText: string): void {
	const store = getDefaultStore();
	const { skillName, skillType, files, body } = parseUserPrefixes(rawText);
	store.set(inputValueAtom, body);
	store.set(
		selectedSkillAtom,
		skillName ? { name: skillName, type: skillType ?? "skill" } : null,
	);
	// Appshot capsule needs full AppshotAttachment; on re-edit we re-attach the image path
	// via mentionedFiles @prefix instead (sendMessage will include it).
	store.set(appshotAttachmentAtom, null);
	// Restore @attachments for re-send (workspace files + image-cache / appshot paths).
	store.set(
		mentionedFilesAtom,
		files.map((path) => ({
			path,
			name: pathBasename(path),
			isDirectory: false,
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

export type UserMessageModel = UserMessageViewProps;

export function useUserMessageModel({
	message,
	entryState,
	isLastUserMessage = false,
	isStreaming = false,
	onAbortEdit,
	onEntryComplete,
}: UserMessageModelInput): UserMessageModel {
	const { t } = useTranslation("chat");
	const { skillName, skillType, files, body } = parseUserPrefixes(message.text);
	const { appshotImage, rest: displayFiles } = splitAppshotFiles(files);
	// image-cache (persistImages) must still render as thumbnails; appshot is already split out.
	const imageFiles = displayFiles.filter((file) => isUserImageFile(file));
	const hasExplicitMentionedFiles = message.mentionedFiles !== undefined;
	const fileBadges = hasExplicitMentionedFiles
		? message.mentionedFiles?.map((file) => file.path).filter((path) => !isUserImageFile(path)) ?? []
		: displayFiles.filter((file) => !isUserImageFile(file));
	const displayText = body;
	const appshotData: AppshotCardData | null =
		message.appshot ?? (appshotImage ? { imagePath: appshotImage } : null);
	const imageItems = useMemo<FilePreviewItem[]>(
		() => [
			...(message.images ?? []).map((image) => ({
				name: image.name,
				url: `data:${image.mimeType};base64,${image.data}`,
				kind: "image" as const,
				mime: image.mimeType,
			})),
			...imageFiles.map((path) => ({ name: pathBasename(path), path, kind: "image" as const })),
		],
		[imageFiles, message.images],
	);
	const hasImages = imageItems.length > 0;
	const hasSkillBadge = Boolean(skillName);
	const settingsAssistTabId = message.settingsAssistTabId?.trim() ?? "";
	const hasSettingsAssistBadge = settingsAssistTabId.length > 0;
	const hasFileBadges = fileBadges.length > 0;
	const copyText = displayText.trim();
	const [actionsVisible, setActionsVisible] = useState(false);
	const setFilePreview = useSetAtom(filePreviewAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const pendingEdit = useAtomValue(pendingMessageEditAtom);

	const canEdit = Boolean(message.entryId);
	const branch = message.branch;
	const canSwitchBranch = Boolean(branch && branch.siblings.length > 1 && message.entryId);
	const isPendingEdit = Boolean(pendingEdit && message.entryId && pendingEdit.entryId === message.entryId);

	const applyEditFill = useCallback(() => {
		if (!message.entryId) return;
		fillInputFromUserText(message.text);
		getDefaultStore().set(pendingMessageEditAtom, { entryId: message.entryId });
	}, [message.entryId, message.text]);

	const runWithInterruptConfirm = useCallback(
		(kind: "edit" | "switch" | "fork", action: () => void | Promise<void>) => {
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
					kind === "edit"
						? "messageList.interrupt.editTitle"
						: kind === "switch"
							? "messageList.interrupt.switchTitle"
							: "messageList.interrupt.forkTitle",
				),
				message: t(
					kind === "edit"
						? "messageList.interrupt.editBody"
						: kind === "switch"
							? "messageList.interrupt.switchBody"
							: "messageList.interrupt.forkBody",
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
		if (!message.entryId) return;
		const startEdit = (): void => {
			runWithInterruptConfirm("edit", () => {
				applyEditFill();
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
	}, [applyEditFill, isPendingEdit, message.entryId, runWithInterruptConfirm, setConfirmDialog, t]);

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
			// belong to the source session and would break navigateForEdit after open.
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
		isLastUserMessage,
		canEdit,
		canSwitchBranch,
		canFork: canEdit,
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
		onEdit: handleEdit,
		onFork: handleFork,
		onBranchPrev: () => handleSwitchBranch(-1),
		onBranchNext: () => handleSwitchBranch(1),
		onActionsVisibleChange: setActionsVisible,
	};
}
