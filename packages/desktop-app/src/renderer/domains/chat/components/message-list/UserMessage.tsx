import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import { motion } from "motion/react";
import type { Transition } from "motion/react";
import { useTranslation } from "react-i18next";
import {
	chatMessagesAtom,
	filePreviewAtom,
	type ChatMessage,
	type FilePreviewItem,
	inputValueAtom,
} from "@shared/store/atoms";
import { pathBasename, pathNormalize } from "@shared/lib/utils";
import { TextBlockView } from "../blocks/TextBlock";
import { CopyButton, RelativeTimeLabel } from "./MessageActions";
import { AppshotCard, type AppshotCardData } from "../AppshotCard";

const HIDDEN_VISUAL_STATE = { opacity: 0, scale: 0.82, x: 14, y: 12 };
const VISIBLE_VISUAL_STATE = { opacity: 1, scale: 1, x: 0, y: 0 };
const ENTRY_TRANSITION = {
	type: "spring",
	stiffness: 520,
	damping: 24,
	mass: 0.8,
} satisfies Transition;
const TEXT_INITIAL = { filter: "blur(6px)" };
const TEXT_VISIBLE = { filter: "blur(0px)" };
const TEXT_TRANSITION = {
	duration: 0.22,
	ease: [0.25, 0.1, 0.25, 1] as const,
} satisfies Transition;
const MESSAGE_STYLE = { originX: 1, originY: 1 };
const USER_MESSAGE_COLLAPSED_LINES = 10;
const USER_MESSAGE_COLLAPSED_MAX_HEIGHT = `${USER_MESSAGE_COLLAPSED_LINES * 1.6}em`;
const USER_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);

export type UserMessageEntryState = "static" | "hidden" | "enter";

interface ParsedUserMessage {
	skillName: string | null;
	skillType: "skill" | "scene" | null;
	files: string[];
	body: string;
}

function parseUserMessage(text: string): ParsedUserMessage {
	let remaining = text;
	let skillName: string | null = null;
	let skillType: "skill" | "scene" | null = null;
	const files: string[] = [];
	const skillMatch = remaining.match(/^\/(skill|scene):([^\n]+)\n?([\s\S]*)$/);
	if (skillMatch) {
		skillType = skillMatch[1] as "skill" | "scene";
		skillName = skillMatch[2].trim();
		remaining = skillMatch[3];
	}
	while (true) {
		const fileMatch = remaining.match(/^@([^\n]+)\n?([\s\S]*)$/);
		if (!fileMatch) break;
		files.push(fileMatch[1].trim());
		remaining = fileMatch[2];
	}
	return { skillName, skillType, files, body: remaining };
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

function SkillBadge({
	name,
	type = "skill",
}: {
	name: string;
	type?: "skill" | "scene";
}): JSX.Element {
	const { t } = useTranslation("chat");
	const icon =
		type === "scene"
			? "icon-[solar--clapperboard-open-linear]"
			: "icon-[solar--magic-stick-linear]";
	const label = t(type === "scene" ? "messageList.userMessage.sceneBadge" : "messageList.userMessage.skillBadge");
	return (
		<span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
			<span className={`${icon} h-3 w-3`} />
			<span className="text-primary/75">{label}</span>
			{name}
		</span>
	);
}

function FileBadge({ path }: { path: string }): JSX.Element {
	const setFilePreview = useSetAtom(filePreviewAtom);
	const name = pathBasename(path);
	return (
		<button
			type="button"
			className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
			title={path}
			onClick={() => setFilePreview({ name, path })}
		>
			<span className="icon-[solar--file-linear] h-3 w-3" />
			{name}
		</button>
	);
}

function ImageAttachmentGroup({ items }: { items: FilePreviewItem[] }): JSX.Element {
	const setFilePreview = useSetAtom(filePreviewAtom);
	return (
		<div className="flex max-w-full justify-end gap-2 overflow-x-auto">
			{items.map((item, index) => {
				const src = getPreviewImageSrc(item);
				return (
					<button
						key={item.path ?? item.url ?? `${item.name}-${index}`}
						type="button"
						onClick={() => setFilePreview({ items, index })}
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
}

function EditButton({ onClick }: { onClick: () => void }): JSX.Element {
	const { t } = useTranslation("chat");
	const label = t("messageList.editButton");
	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/45 transition-colors hover:bg-muted/60 hover:text-foreground"
		>
			<span className="icon-[solar--pen-2-linear] h-3.5 w-3.5" />
		</button>
	);
}

interface UserMessageTextProps {
	text: string;
	shouldAnimateIn: boolean;
	shouldHoldHidden: boolean;
}

function UserMessageText({ text, shouldAnimateIn, shouldHoldHidden }: UserMessageTextProps): JSX.Element {
	const { t } = useTranslation("chat");
	const contentRef = useRef<HTMLDivElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [canExpand, setCanExpand] = useState(false);

	const measureOverflow = useCallback(() => {
		const content = contentRef.current;
		if (!content) return;
		const fontSize = Number.parseFloat(window.getComputedStyle(content).fontSize);
		const collapsedHeight = fontSize * 1.6 * USER_MESSAGE_COLLAPSED_LINES;
		setCanExpand(content.scrollHeight > collapsedHeight + 1);
	}, []);

	useLayoutEffect(() => {
		setExpanded(false);
		measureOverflow();
		const content = contentRef.current;
		if (!content) return;
		const observer = new ResizeObserver(measureOverflow);
		observer.observe(content);
		return () => observer.disconnect();
	}, [measureOverflow, text]);

	return (
		<div
			className="relative min-w-0 max-w-full overflow-hidden"
			style={{ maxHeight: expanded ? undefined : USER_MESSAGE_COLLAPSED_MAX_HEIGHT }}
		>
			<motion.div
				ref={contentRef}
				className="min-w-0 max-w-full"
				initial={shouldAnimateIn ? TEXT_INITIAL : false}
				animate={shouldHoldHidden ? TEXT_INITIAL : TEXT_VISIBLE}
				transition={TEXT_TRANSITION}
			>
				<TextBlockView
					text={text}
					className="max-w-full overflow-x-auto [overflow-wrap:anywhere] [&_code]:break-all"
				/>
			</motion.div>
			{canExpand && !expanded && (
				<div className="absolute inset-x-0 bottom-0 flex h-20 items-end justify-center rounded-b-2xl bg-gradient-to-t from-secondary via-secondary/80 to-secondary/0 pb-1.5">
					<button
						type="button"
						onClick={() => setExpanded(true)}
						className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[12px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
					>
						<span className="icon-[solar--alt-arrow-down-linear] h-3.5 w-3.5" />
						<span>{t("messageList.userMessage.expand")}</span>
					</button>
				</div>
			)}
		</div>
	);
}

interface UserMessageProps {
	entryState: UserMessageEntryState;
	hasAssistantAfter?: boolean;
	isLastUserMessage?: boolean;
	isStreaming?: boolean;
	message: ChatMessage;
	onAbortEdit?: () => void;
	onEntryComplete?: () => void;
}

export const UserMessage = memo(function UserMessage({
	message,
	entryState,
	hasAssistantAfter = false,
	isLastUserMessage = false,
	isStreaming = false,
	onAbortEdit,
	onEntryComplete,
}: UserMessageProps) {
	const { skillName, skillType, files, body } = parseUserMessage(message.text);
	const { appshotImage, rest: displayFiles } = splitAppshotFiles(files);
	const isImageCache = (path: string): boolean => /[/\\]image-cache[/\\]/.test(path);
	const imageFiles = displayFiles.filter((file) => isUserImageFile(file) && !isImageCache(file));
	const hasExplicitMentionedFiles = message.mentionedFiles !== undefined;
	const fileBadges = hasExplicitMentionedFiles
		? message.mentionedFiles?.map((file) => file.path).filter((path) => !isUserImageFile(path)) ?? []
		: displayFiles.filter((file) => !isUserImageFile(file));
	const hasSystemAttachments = Boolean(message.appshot || (message.images && message.images.length > 0));
	const displayText = hasExplicitMentionedFiles && message.mentionedFiles?.length === 0 && !hasSystemAttachments
		? message.text
		: body;
	const appshotData: AppshotCardData | null = message.appshot ?? (appshotImage ? { imagePath: appshotImage } : null);
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
	const hasFileBadges = fileBadges.length > 0;
	const copyText = displayText.trim();
	const shouldAnimateIn = entryState === "enter";
	const shouldHoldHidden = entryState === "hidden";
	const setInputValue = useSetAtom(inputValueAtom);
	const setChatMessages = useSetAtom(chatMessagesAtom);

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
	}, [hasAssistantAfter, isStreaming, message.id, message.text, onAbortEdit, setChatMessages, setInputValue]);

	return (
		<motion.div
			className="group/user relative z-0 -mb-8 flex min-w-0 justify-end pb-8 hover:z-20"
			initial={shouldAnimateIn ? HIDDEN_VISUAL_STATE : false}
			animate={shouldHoldHidden ? HIDDEN_VISUAL_STATE : VISIBLE_VISUAL_STATE}
			transition={ENTRY_TRANSITION}
			onAnimationComplete={shouldAnimateIn ? onEntryComplete : undefined}
			style={MESSAGE_STYLE}
		>
			<div className="relative flex min-w-0 max-w-[72%] flex-col items-end">
				{appshotData && (
					<div className="mb-1.5 flex justify-end">
						<AppshotCard data={appshotData} />
					</div>
				)}
				{hasImages && (
					<div className="mb-1.5 flex justify-end">
						<ImageAttachmentGroup items={imageItems} />
					</div>
				)}
				{hasSkillBadge && (
					<div className="mb-1 flex flex-wrap justify-end gap-1">
						{skillName && <SkillBadge name={skillName} type={skillType ?? "skill"} />}
					</div>
				)}
				{displayText && (
					<div
						className="min-w-0 max-w-full cursor-text rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-[13px] leading-[1.6] text-foreground"
						style={{ wordBreak: "break-word" }}
					>
						<UserMessageText
							text={displayText}
							shouldAnimateIn={shouldAnimateIn}
							shouldHoldHidden={shouldHoldHidden}
						/>
					</div>
				)}
				{!displayText && !hasSkillBadge && !hasFileBadges && !hasImages && !appshotData && (
					<div
						className="cursor-text rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-[13px] leading-[1.6] text-foreground"
						style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
					>
						{"\u2026"}
					</div>
				)}
				{hasFileBadges && (
					<div className="mt-1 flex flex-wrap justify-end gap-1">
						{fileBadges.map((file) => (
							<FileBadge key={file} path={file} />
						))}
					</div>
				)}
				{copyText && (
					<div className="pointer-events-none absolute right-0 top-full z-30 mt-1 flex items-center justify-end gap-1 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/user:pointer-events-auto group-hover/user:opacity-100">
						{message.timestamp && <RelativeTimeLabel endedAt={message.timestamp} />}
						{isLastUserMessage && <EditButton onClick={handleEdit} />}
						<CopyButton getText={() => copyText} />
					</div>
				)}
			</div>
		</motion.div>
	);
});
