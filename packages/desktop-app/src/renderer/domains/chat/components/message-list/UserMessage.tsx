import { memo } from "react";
import { motion } from "motion/react";
import type { Transition } from "motion/react";
import type { ChatMessage } from "@shared/store/atoms";
import { pathBasename } from "@shared/lib/utils";
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

function SkillBadge({
	name,
	type = "skill",
}: {
	name: string;
	type?: "skill" | "scene";
}): JSX.Element {
	const icon =
		type === "scene"
			? "icon-[mdi--movie-open-outline]"
			: "icon-[mdi--puzzle-outline]";
	return (
		<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-muted-foreground">
			<span className={`${icon} h-3 w-3`} />
			{name}
		</span>
	);
}

function FileBadge({ path }: { path: string }): JSX.Element {
	return (
		<span
			className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground"
			title={path}
		>
			<span className="icon-[mdi--file-outline] h-3 w-3" />
			{pathBasename(path)}
		</span>
	);
}

interface UserMessageProps {
	entryState: UserMessageEntryState;
	message: ChatMessage;
	onEntryComplete?: () => void;
}

export const UserMessage = memo(function UserMessage({
	message,
	entryState,
	onEntryComplete,
}: UserMessageProps) {
	const hasImages = Boolean(message.images?.length);
	const { skillName, skillType, files, body } = parseUserMessage(message.text);
	const { appshotImage, rest: displayFiles } = splitAppshotFiles(files);
	const appshotData: AppshotCardData | null = message.appshot ?? (appshotImage ? { imagePath: appshotImage } : null);
	const hasBadges = Boolean(skillName || displayFiles.length > 0);
	const copyText = body.trim();
	const shouldAnimateIn = entryState === "enter";
	const shouldHoldHidden = entryState === "hidden";

	return (
		<motion.div
			className="group/user flex justify-end"
			initial={shouldAnimateIn ? HIDDEN_VISUAL_STATE : false}
			animate={shouldHoldHidden ? HIDDEN_VISUAL_STATE : VISIBLE_VISUAL_STATE}
			transition={ENTRY_TRANSITION}
			onAnimationComplete={shouldAnimateIn ? onEntryComplete : undefined}
			style={MESSAGE_STYLE}
		>
			<div className="relative max-w-[72%] before:absolute before:inset-x-0 before:top-full before:h-8 before:content-['']">
				{hasImages && (
					<div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
						{message.images?.map((image, index) => (
							<div
								key={`${image.name}-${index}`}
								className="h-20 w-20 overflow-hidden rounded-xl border border-border/50"
							>
								<img
									src={`data:${image.mimeType};base64,${image.data}`}
									alt={image.name}
									className="h-full w-full object-cover"
								/>
							</div>
						))}
					</div>
				)}
				{appshotData && (
					<div className="mb-1.5 flex justify-end">
						<AppshotCard data={appshotData} />
					</div>
				)}
				{(body || hasBadges) && (
					<div
						className="rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-[13px] leading-[1.6] text-foreground"
						style={{ wordBreak: "break-word" }}
					>
						{hasBadges && (
							<div className="mb-1 flex flex-wrap justify-end gap-1">
								{skillName && (
									<SkillBadge name={skillName} type={skillType ?? "skill"} />
								)}
								{displayFiles.map((file) => (
									<FileBadge key={file} path={file} />
								))}
							</div>
						)}
						{body && (
							<motion.div
								initial={shouldAnimateIn ? TEXT_INITIAL : false}
								animate={shouldHoldHidden ? TEXT_INITIAL : TEXT_VISIBLE}
								transition={TEXT_TRANSITION}
								style={{ whiteSpace: "pre-wrap" }}
							>
								{body}
							</motion.div>
						)}
					</div>
				)}
				{!body && !hasBadges && !hasImages && (
					<div
						className="rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-[13px] leading-[1.6] text-foreground"
						style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
					>
						{"\u2026"}
					</div>
				)}
				{copyText && (
					<div className="pointer-events-none absolute right-0 top-full mt-1 flex items-center justify-end gap-1 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/user:pointer-events-auto group-hover/user:opacity-100">
						{message.timestamp && <RelativeTimeLabel endedAt={message.timestamp} />}
						<CopyButton getText={() => copyText} />
					</div>
				)}
			</div>
		</motion.div>
	);
});
