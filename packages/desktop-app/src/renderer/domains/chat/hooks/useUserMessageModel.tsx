import {
	chatMessagesAtom,
	filePreviewAtom,
	inputValueAtom,
	type ChatMessage,
	type FilePreviewItem,
} from "@shared/store/atoms";
import { pathBasename, pathNormalize } from "@shared/lib/utils";
import {
	SettingsAssistBadgeView,
	SkillBadgeView,
	type UserMessageEntryState,
	type UserMessageViewProps,
} from "@vetta/theme-ui/chat";
import { useSetAtom } from "jotai";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { parseUserPrefixes } from "../services/chat-service";
import { AppshotCard, type AppshotCardData } from "../components/AppshotCard";
import { TextBlockView } from "../components/blocks/TextBlock";
import { CopyButton, RelativeTimeLabel } from "../components/message-list/MessageActions";

const USER_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);

const SETTINGS_ASSIST_TAB_IDS = [
	"mcp",
	"models",
	"knowledge",
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

function toFileProtocolUrl(path: string): string {
	const normalized = pathNormalize(path);
	const prefix = normalized.startsWith("/") ? "" : "/";
	return `vetta-file://local${prefix}${encodeURI(normalized)}`;
}

function getPreviewImageSrc(item: FilePreviewItem): string {
	if (item.url) return item.url;
	if (item.path) return toFileProtocolUrl(item.path);
	return "";
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
	hasAssistantAfter = false,
	isLastUserMessage = false,
	isStreaming = false,
	onAbortEdit,
	onEntryComplete,
}: UserMessageModelInput): UserMessageModel {
	const { t } = useTranslation("chat");
	const { skillName, skillType, files, body } = parseUserPrefixes(message.text);
	const { appshotImage, rest: displayFiles } = splitAppshotFiles(files);
	const isImageCache = (path: string): boolean => /[/\\]image-cache[/\\]/.test(path);
	const imageFiles = displayFiles.filter((file) => isUserImageFile(file) && !isImageCache(file));
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
	const setInputValue = useSetAtom(inputValueAtom);
	const setChatMessages = useSetAtom(chatMessagesAtom);
	const setFilePreview = useSetAtom(filePreviewAtom);

	const handleEdit = useCallback(() => {
		if (hasAssistantAfter) {
			if (isStreaming) onAbortEdit?.();
			setInputValue(message.text);
			return;
		}
		if (isStreaming) {
			onAbortEdit?.();
			setChatMessages((prev) => {
				const index = prev.findIndex((item) => item.id === message.id);
				return index === -1 ? prev : prev.slice(0, index);
			});
		}
		setInputValue(message.text);
	}, [
		hasAssistantAfter,
		isStreaming,
		message.id,
		message.text,
		onAbortEdit,
		setChatMessages,
		setInputValue,
	]);

	const labels = {
		expand: t("messageList.userMessage.expand"),
		edit: t("messageList.editButton"),
		skillBadge: t("messageList.userMessage.skillBadge"),
		sceneBadge: t("messageList.userMessage.sceneBadge"),
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
		onActionsVisibleChange: setActionsVisible,
	};
}
