import type { SkillInfo } from "@preload/api";
import { cn } from "@shared/lib/utils";
import { useThemeComponent } from "@vetta/theme-sdk";
import { NewSessionPageLayoutView } from "@vetta/theme-ui/chat";
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
	renderHero: boolean;
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
	renderHero,
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
				renderHero ? (
					<NewSessionHero
						avatarAutoplay={avatarAutoplay}
						greetingTitle={greetingTitle}
						mounted={mounted}
						onSceneClick={onSceneClick}
						sceneActions={sceneActions}
						scenes={scenes}
						selectedSkill={selectedSkill}
						subtitle={subtitle}
					/>
				) : undefined
			}
			skillBadges={
				skillBadges.length > 0 ? (
					<SkillBadgeRow skills={skillBadges} selected={selectedSkill} onSelect={onSelectSkill} />
				) : undefined
			}
			inputBar={<InputBar onSend={onSend} onAbort={onAbort} cwdOverride={cwd} />}
			guidingWords={
				guidingGroups.length > 0 ? (
					<GuidingWords groups={guidingGroups} mounted={mounted} onPick={onGuidingWord} />
				) : undefined
			}
		/>
	);
}

function EmptyNewSessionBackground(): null {
	return null;
}
