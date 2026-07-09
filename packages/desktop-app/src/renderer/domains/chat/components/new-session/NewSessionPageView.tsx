import type { SkillInfo } from "@preload/api";
import { cn } from "@shared/lib/utils";
import { useThemeComponent } from "@vetta/theme-sdk";
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
		<SessionDropZone
			cwdOverride={cwd}
			className={cn("relative flex h-full flex-1 flex-col overflow-hidden bg-background", className)}
		>
			<NewSessionBackground />
			<ThemedNewSessionBackground />

			{/* 整页垂直居中：单一滚动容器内 min-h-full + justify-center，内容始终居中
			    （hero → 技能胶囊 → 输入框 → 引导词），无论窗口多大都在中间。
			    InputBar 变高时整列变高、保持居中；内容超出视口则可滚动。整列与输入框同宽（max-w-2xl）。 */}
			<div className="no-drag relative z-[1] flex flex-1 flex-col overflow-y-auto">
				<div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-6">
					{renderHero && (
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
					)}

					{skillBadges.length > 0 && (
						<div className="mx-auto w-full max-w-2xl px-2 sm:px-4">
							<SkillBadgeRow skills={skillBadges} selected={selectedSkill} onSelect={onSelectSkill} />
						</div>
					)}

					<div className="w-full">
						<InputBar onSend={onSend} onAbort={onAbort} cwdOverride={cwd} />
					</div>

					{!isShort && guidingGroups.length > 0 && (
						<div className="mx-auto w-full max-w-2xl px-2 sm:px-4">
							<GuidingWords groups={guidingGroups} mounted={mounted} onPick={onGuidingWord} />
						</div>
					)}
				</div>
			</div>
		</SessionDropZone>
	);
}

function EmptyNewSessionBackground(): null {
	return null;
}
