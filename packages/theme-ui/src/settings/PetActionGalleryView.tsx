import type { JSX } from "react";
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

/** 悬停切换预览前的等待时间：鼠标快速划过多行时不逐个加载视频。 */
const PREVIEW_SWITCH_DELAY_MS = 90;
const PLAYED_FEEDBACK_MS = 1600;

function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * 动作列表 + 单个预览区。
 *
 * 性能约束：整页只有一个 `<video>`，平时停在当前帧，只在指针悬停或键盘聚焦动作时播放，
 * 离开即暂停；系统开启「减少动态效果」时不播放。
 */
export function PetActionGalleryView({
	groups,
	labels,
	playDisabled,
	onPlay,
}: PetActionGalleryViewProps): JSX.Element {
	const actions = groups.flatMap((group) => group.actions);
	const [previewId, setPreviewId] = useState(() => (actions.find((action) => action.videoUrl) ?? actions[0])?.id);
	const [active, setActive] = useState(false);
	const [playedId, setPlayedId] = useState<string>();
	const videoRef = useRef<HTMLVideoElement>(null);
	const switchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const playedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	const preview = actions.find((action) => action.id === previewId) ?? actions[0];
	const previewUrl = preview?.videoUrl;

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

	const schedulePreview = (actionId: string): void => {
		clearTimeout(switchTimerRef.current);
		setActive(true);
		if (actionId === previewId) return;
		switchTimerRef.current = setTimeout(() => setPreviewId(actionId), PREVIEW_SWITCH_DELAY_MS);
	};

	const stopPreview = (): void => {
		clearTimeout(switchTimerRef.current);
		setActive(false);
	};

	const play = (actionId: string): void => {
		clearTimeout(switchTimerRef.current);
		setPreviewId(actionId);
		onPlay(actionId);
		setPlayedId(actionId);
		clearTimeout(playedTimerRef.current);
		playedTimerRef.current = setTimeout(() => setPlayedId(undefined), PLAYED_FEEDBACK_MS);
	};

	return (
		<div className="grid grid-cols-[168px_minmax(0,1fr)] gap-4 p-4">
			<div className="flex flex-col gap-2">
				<div
					className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted/60"
					data-testid="pet-action-preview"
					onPointerEnter={() => setActive(true)}
					onPointerLeave={stopPreview}
				>
					{previewUrl ? (
						<video
							ref={videoRef}
							key="pet-action-preview"
							src={previewUrl}
							className="size-full object-contain"
							muted
							loop
							playsInline
							preload="auto"
							disablePictureInPicture
							aria-label={preview?.label}
						/>
					) : (
						<div className="px-3 text-center text-[12px] text-muted-foreground">{labels.videoMissing}</div>
					)}
				</div>
				<div className="min-w-0 px-0.5">
					<div className="truncate text-[13px] font-medium text-foreground">{preview?.label}</div>
					<div className="text-[11px] text-muted-foreground">
						{playDisabled ? labels.needShowPet : labels.previewHint}
					</div>
				</div>
			</div>

			<div className="flex min-w-0 flex-col gap-3" onPointerLeave={stopPreview}>
				{groups.map((group) => (
					<div key={group.id} className="min-w-0">
						<div className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">{group.label}</div>
						<ul className="flex flex-col">
							{group.actions.map((action) => {
								const selected = action.id === preview?.id;
								const justPlayed = action.id === playedId;
								return (
									<li
										key={action.id}
										className={cn(
											"flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors",
											selected ? "bg-accent/60" : "hover:bg-accent/40",
										)}
										data-selected={selected ? "" : undefined}
										onPointerEnter={() => schedulePreview(action.id)}
										onFocus={() => schedulePreview(action.id)}
										onBlur={stopPreview}
									>
										<div className="min-w-0 flex-1">
											<div className="truncate text-[13px] font-medium text-foreground">{action.label}</div>
											<div className="truncate text-[12px] text-muted-foreground" title={action.description}>
												{action.description}
											</div>
										</div>
										<Button
											type="button"
											variant="field"
											size="sm"
											disabled={playDisabled || !action.videoUrl}
											aria-label={`${labels.play} ${action.label}`}
											onClick={() => play(action.id)}
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
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</div>
		</div>
	);
}
