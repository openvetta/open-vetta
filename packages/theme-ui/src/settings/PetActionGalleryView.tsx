import type { FocusEvent, JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@vetta-org/ui";

export interface PetActionView {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	/** 缺素材时为空，预览区显示占位文字。 */
	readonly videoUrl?: string;
}

export interface PetActionGroupView {
	readonly id: string;
	readonly label: string;
	readonly actions: readonly PetActionView[];
}

export interface PetActionGalleryViewLabels {
	readonly play: string;
	readonly played: string;
	readonly previewHint: string;
	readonly needShowPet: string;
	readonly videoMissing: string;
}

export interface PetActionGalleryViewProps {
	readonly groups: readonly PetActionGroupView[];
	readonly labels: PetActionGalleryViewLabels;
	/** 桌宠没显示时不能播放，只能预览。 */
	readonly playDisabled: boolean;
	readonly onPlay: (actionId: string) => void;
}

/** 悬停切换预览前的等待时间：鼠标快速划过多个动作时不逐个加载视频。 */
const PREVIEW_SWITCH_DELAY_MS = 90;
const PLAYED_FEEDBACK_MS = 1600;

function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * 预览区 + 当前动作说明 + 紧凑的动作标签。
 *
 * 动作再多也只是多一行标签，右侧高度和预览区基本一致。
 * 性能约束：整页只有一个 `<video>`，平时停在当前帧，只在指针位于画廊内或键盘聚焦动作时播放，
 * 离开即暂停；系统开启「减少动态效果」时不播放。
 */
export function PetActionGalleryView({
	groups,
	labels,
	playDisabled,
	onPlay,
}: PetActionGalleryViewProps): JSX.Element {
	const entries = groups.flatMap((group) => group.actions.map((action) => ({ action, groupLabel: group.label })));
	const [selectedId, setSelectedId] = useState(
		() => (entries.find((entry) => entry.action.videoUrl) ?? entries[0])?.action.id,
	);
	const [hoverId, setHoverId] = useState<string>();
	const [active, setActive] = useState(false);
	const [playedId, setPlayedId] = useState<string>();
	const videoRef = useRef<HTMLVideoElement>(null);
	const switchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const playedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	const shownId = hoverId ?? selectedId;
	const shown = entries.find((entry) => entry.action.id === shownId) ?? entries[0];
	const selected = entries.find((entry) => entry.action.id === selectedId) ?? entries[0];
	const previewUrl = shown?.action.videoUrl;

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (active && !prefersReducedMotion()) {
			void video.play().catch(() => undefined);
		} else {
			video.pause();
		}
	}, [active, previewUrl]);

	useEffect(
		() => () => {
			clearTimeout(switchTimerRef.current);
			clearTimeout(playedTimerRef.current);
		},
		[],
	);

	const schedulePreview = (actionId: string | undefined): void => {
		clearTimeout(switchTimerRef.current);
		switchTimerRef.current = setTimeout(() => setHoverId(actionId), PREVIEW_SWITCH_DELAY_MS);
	};

	const deactivate = (): void => {
		clearTimeout(switchTimerRef.current);
		setHoverId(undefined);
		setActive(false);
	};

	const handleBlur = (event: FocusEvent<HTMLDivElement>): void => {
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
		deactivate();
	};

	const select = (actionId: string): void => {
		clearTimeout(switchTimerRef.current);
		setSelectedId(actionId);
		setHoverId(undefined);
		setActive(true);
	};

	const play = (): void => {
		if (!selected) return;
		onPlay(selected.action.id);
		setPlayedId(selected.action.id);
		clearTimeout(playedTimerRef.current);
		playedTimerRef.current = setTimeout(() => setPlayedId(undefined), PLAYED_FEEDBACK_MS);
	};

	const justPlayed = playedId !== undefined && playedId === selected?.action.id;

	return (
		<div
			className="grid grid-cols-[148px_minmax(0,1fr)] gap-4 p-4"
			onPointerEnter={() => setActive(true)}
			onPointerLeave={deactivate}
			onFocus={() => setActive(true)}
			onBlur={handleBlur}
		>
			<div
				className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted/60"
				data-testid="pet-action-preview"
			>
				{previewUrl ? (
					<video
						ref={videoRef}
						src={previewUrl}
						className="size-full object-contain"
						muted
						loop
						playsInline
						preload="auto"
						disablePictureInPicture
						aria-label={shown?.action.label}
					/>
				) : (
					<div className="px-3 text-center text-[12px] text-muted-foreground">{labels.videoMissing}</div>
				)}
			</div>

			<div className="flex min-w-0 flex-col gap-3">
				<div className="flex min-h-[60px] items-start gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="truncate text-[14px] font-semibold text-foreground">{shown?.action.label}</span>
							{shown && (
								<span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
									{shown.groupLabel}
								</span>
							)}
						</div>
						<p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
							{playDisabled ? labels.needShowPet : shown?.action.description}
						</p>
					</div>
					<Button
						type="button"
						variant="field"
						size="sm"
						className="shrink-0"
						disabled={playDisabled || !selected?.action.videoUrl}
						aria-label={selected ? `${labels.play} ${selected.action.label}` : labels.play}
						onClick={play}
					>
						<span
							aria-hidden
							className={cn(
								"size-3.5",
								justPlayed ? "icon-[solar--check-circle-linear]" : "icon-[solar--play-linear]",
							)}
						/>
						{justPlayed ? labels.played : labels.play}
					</Button>
				</div>

				<div className="flex flex-wrap gap-1.5" role="group" aria-label={labels.previewHint}>
					{entries.map(({ action }) => {
						const isSelected = action.id === selectedId;
						return (
							<button
								key={action.id}
								type="button"
								aria-pressed={isSelected}
								className={cn(
									"h-7 rounded-lg px-2.5 text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
									isSelected
										? "bg-foreground text-background"
										: "bg-muted text-foreground hover:bg-accent",
									!action.videoUrl && "text-muted-foreground",
								)}
								onPointerEnter={() => schedulePreview(action.id)}
								onPointerLeave={() => schedulePreview(undefined)}
								onFocus={() => schedulePreview(action.id)}
								onBlur={() => schedulePreview(undefined)}
								onClick={() => select(action.id)}
							>
								{action.label}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
