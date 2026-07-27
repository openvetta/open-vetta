import type { SkillInfo } from "@preload/api";
import { cn } from "@shared/lib/utils";
import { useThemeComponent } from "@vetta/theme-sdk";
import {
	NEW_SESSION_GUIDING_WORDS_SLOT_MIN_H_CLASS,
	NEW_SESSION_SKILL_BADGE_SLOT_MIN_H_CLASS,
	NewSessionPageLayoutView,
} from "@vetta/theme-ui/chat";
import { GuidingWords } from "./GuidingWords";
import { NewSessionBackground } from "./NewSessionBackground";
import { NewSessionHero } from "./NewSessionHero";
import { SkillBadgeRow } from "./SkillBadgeRow";
import type { GuidingGroup, SceneActionState, SceneItem, SkillSelection } from "./types";
import { InputBar } from "../InputBar";
import { SessionDropZone } from "../SessionDropZone";

interface NewSessionPageViewProps {
	avatarAutoplay: boolean;
	className?: string;
	cwd: string;
	greetingTitle: string;
	guidingGroups: GuidingGroup[];
	isShort: boolean;
	mounted: boolean;
	onAbort: () => Promise<void>;
	onGuidingWord: (word: string) => Promise<void>;
	onSceneClick: (scene: SceneItem) => void;
	onSelectSkill: (skill: SkillInfo) => void;
	onSend: () => Promise<void>;
	reserveGuidingWords: boolean;
	reserveSceneSlot: boolean;
	reserveSkillBadges: boolean;
	sceneActions: Record<string, SceneActionState>;
	scenes: SceneItem[];
	selectedSkill: SkillSelection;
	skillBadges: SkillInfo[];
	subtitle: string;
}

export function NewSessionPageView({
	avatarAutoplay,
	className,
	cwd,
	greetingTitle,
	guidingGroups,
	isShort,
	mounted,
	onAbort,
	onGuidingWord,
	onSceneClick,
	onSelectSkill,
	onSend,
	reserveGuidingWords,
	reserveSceneSlot,
	reserveSkillBadges,
	sceneActions,
	scenes,
	selectedSkill,
	skillBadges,
	subtitle,
}: NewSessionPageViewProps): JSX.Element {
	const ThemedNewSessionBackground = useThemeComponent(
		"chat.newSessionBackground",
		EmptyNewSessionBackground,
	);

	const skillBadgesNode =
		skillBadges.length > 0 ? (
			<SkillBadgeRow skills={skillBadges} selected={selectedSkill} onSelect={onSelectSkill} />
		) : reserveSkillBadges ? (
			<div
				aria-hidden
				className={cn("mt-4 w-full", NEW_SESSION_SKILL_BADGE_SLOT_MIN_H_CLASS)}
			/>
		) : undefined;

	const guidingWordsNode =
		guidingGroups.length > 0 ? (
			<GuidingWords groups={guidingGroups} mounted={mounted} onPick={onGuidingWord} />
		) : reserveGuidingWords ? (
			<div
				aria-hidden
				className={cn("mt-5 w-full", NEW_SESSION_GUIDING_WORDS_SLOT_MIN_H_CLASS)}
			/>
		) : undefined;

	return (
		<NewSessionPageLayoutView
			isShort={isShort}
			background={<NewSessionBackground />}
			themedBackground={<ThemedNewSessionBackground />}
			dropZone={(children) => (
				<SessionDropZone
					cwdOverride={cwd}
					className={cn(
						"relative flex h-full flex-1 flex-col overflow-hidden bg-background",
						className,
					)}
				>
					{children}
				</SessionDropZone>
			)}
			hero={
				<NewSessionHero
					avatarAutoplay={avatarAutoplay}
					greetingTitle={greetingTitle}
					mounted={mounted}
					onSceneClick={onSceneClick}
					reserveSceneSlot={reserveSceneSlot}
					sceneActions={sceneActions}
					scenes={scenes}
					selectedSkill={selectedSkill}
					subtitle={subtitle}
				/>
			}
			skillBadges={skillBadgesNode}
			inputBar={<InputBar onSend={onSend} onAbort={onAbort} cwdOverride={cwd} />}
			guidingWords={guidingWordsNode}
		/>
	);
}

function EmptyNewSessionBackground(): null {
	return null;
}
