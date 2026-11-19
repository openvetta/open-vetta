import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { useShortcutBindings } from "@shared/hooks/useShortcutBinding";
import { shortcutParts } from "@shared/lib/platform";
import { getEffectiveShortcut } from "@shared/lib/shortcuts";
import { cn } from "@shared/lib/utils";
import {
	MAIN_SPACE,
	MAIN_SPACE_ICON,
	reorderSpace,
	SPACE_ICONS,
	spaceEditorAtom,
	spacesAtom,
} from "@shared/store/spaces";
import type { SpaceIcon } from "@shared/store/spaces";
import { Button } from "@vetta-org/ui/button";
import { ButtonGroup, ButtonGroupItem } from "@vetta-org/ui/button-group";
import { useNavigate } from "@tanstack/react-router";
import { RunningPulseDot, WaitingPulseBadge } from "@vetta-org/theme-ui/sidebar";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpaceNavigation } from "../../hooks/useSpaceNavigation";
import { spaceActivityAtom } from "../../store/space-activity-atom";

/** 一个工作空间在切换列表里的展示数据。 */
interface SpaceListItem {
	id: string;
	name: string;
	icon: SpaceIcon;
}

export function SpaceGlyph({ icon }: { icon: SpaceIcon }): JSX.Element {
	return icon.kind === "emoji" ? <span aria-hidden="true">{icon.value}</span> :
		<span aria-hidden="true" className={cn(SPACE_ICONS[icon.value], "size-4 shrink-0")} />;
}

export function SpaceSwitcher(): JSX.Element {
	const { t } = useTranslation("project");
	const [state, setSpaces] = useAtom(spacesAtom);
	const switchSpace = useSpaceNavigation();
	const editSpace = useSetAtom(spaceEditorAtom);
	const navigate = useNavigate();
	const bindings = useShortcutBindings();
	const row = useRef<HTMLDivElement>(null);
	const [slots, setSlots] = useState(4);
	const [open, setOpen] = useState(false);
	useEffect(() => {
		if (!row.current || typeof ResizeObserver === "undefined") return;
		// Each group item is 32px wide and the group adds 2px of padding on each side.
		const observer = new ResizeObserver(([entry]) => setSlots(Math.max(2, Math.floor((entry.contentRect.width - 4) / 32))));
		observer.observe(row.current);
		return () => observer.disconnect();
	}, []);
	const activity = useAtomValue(spaceActivityAtom);
	// 工作空间全露得出来时，末尾多放一个「新建」；露不全才换成「更多」，新建入口收进它的列表底部。
	// 两者靠是否溢出互斥：溢出时首格给主工作空间、末格给「更多」，中间能摆多少就摆多少。
	const room = Math.max(0, slots - 2);
	const overflow = state.spaces.length > room;
	const directCount = overflow ? Math.min(state.spaces.length, room) : state.spaces.length;
	const items: SpaceListItem[] = [
		{ id: MAIN_SPACE, name: t("spaces.main"), icon: MAIN_SPACE_ICON },
		...state.spaces.map(({ id, name, icon }) => ({ id, name, icon })),
	];
	const hidden = state.spaces.slice(directCount);
	const hiddenSelected = hidden.some(({ id }) => id === state.selected);
	const createSpace = (): void => {
		setOpen(false);
		editSpace({});
	};
	const countLabelOf = (status: "waiting" | "running", count: number): string =>
		status === "waiting" ? t("spaces.activity.waiting", { count }) : t("spaces.activity.running", { count });

	/** 被收纳的空间里是否有人在等 / 在跑：只给「更多」按钮点灯，不额外造一格。 */
	const hiddenActivity = summarize(hidden.map(({ id }) => activity.get(id)));
	const hiddenStatus = statusOf(hiddenActivity);
	const hiddenStatusLabel = statusLabel(hiddenStatus, hiddenActivity, countLabelOf);
	/** 格子与列表行的提示：名称 + 状态 + 数量。 */
	function titledSpaceName(name: string, id: string): string {
		const totals = activity.get(id);
		const label = statusLabel(statusOf(totals), totals, countLabelOf);
		return label ? `${name} · ${label}` : name;
	}
	return (
		<div ref={row} className="flex min-w-0 flex-1 items-center">
			<ButtonGroup blur={false} aria-label={t("spaces.settingsTitle")}>
				<ButtonGroupItem
					active={state.selected === MAIN_SPACE}
					aria-pressed={state.selected === MAIN_SPACE}
					aria-label={titledSpaceName(t("spaces.main"), MAIN_SPACE)}
					title={titledSpaceName(t("spaces.main"), MAIN_SPACE)}
					icon={<SpaceGlyphWithStatus spaceId={MAIN_SPACE} icon={MAIN_SPACE_ICON} />}
					onClick={() => void switchSpace(MAIN_SPACE)}
				/>
				{state.spaces.slice(0, directCount).map((space) => (
					<ButtonGroupItem
						key={space.id}
						active={state.selected === space.id}
						aria-pressed={state.selected === space.id}
						aria-label={titledSpaceName(space.name, space.id)}
						title={titledSpaceName(space.name, space.id)}
						icon={<SpaceGlyphWithStatus spaceId={space.id} icon={space.icon} />}
						draggable
						onDragStart={(event) => event.dataTransfer.setData("application/x-vetta-space", space.id)}
						onDragOver={(event) => event.preventDefault()}
						onDrop={(event) => {
							event.preventDefault();
							const source = event.dataTransfer.getData("application/x-vetta-space");
							setSpaces((current) => reorderSpace(current, source, space.id));
						}}
						onClick={() => void switchSpace(space.id)}
					/>
				))}
				{overflow ? (
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger asChild>
							<ButtonGroupItem
								active={hiddenSelected}
								aria-pressed={hiddenSelected}
								aria-label={hiddenStatusLabel ? `${t("spaces.more")} · ${hiddenStatusLabel}` : t("spaces.more")}
								title={hiddenStatusLabel ? `${t("spaces.more")} · ${hiddenStatusLabel}` : t("spaces.more")}
								icon={<MoreDots hiddenStatus={hiddenStatus} />}
							/>
						</PopoverTrigger>
						<PopoverContent side="top" align="start" className="w-56 gap-1 p-1">
							<div className="flex flex-col">
								{items.map((space, index) => {
									// Ctrl+1..9 对应完整顺序里的前 9 个工作空间，更多的没有快捷键可用。
									const shortcut = index < 9 ? getEffectiveShortcut(`switch-space-${index + 1}`, bindings) : "";
									return (
										<Button
											key={space.id}
											type="button"
											variant={state.selected === space.id ? "secondary" : "ghost"}
											className="w-full justify-start"
											aria-label={titledSpaceName(space.name, space.id)}
											aria-keyshortcuts={shortcut || undefined}
											onClick={() => {
												setOpen(false);
												void switchSpace(space.id);
											}}
										>
											<SpaceGlyphWithStatus spaceId={space.id} icon={space.icon} />
											<span className="truncate">{space.name}</span>
											{shortcut && (
												<span className="ml-auto flex shrink-0 items-center gap-1">
													{shortcutParts(shortcut).map((part) => (
														<kbd
															key={part}
															className="rounded border border-border/60 bg-muted/50 px-1 text-[10px] font-medium leading-4 text-muted-foreground"
														>
															{part}
														</kbd>
													))}
												</span>
											)}
										</Button>
									);
								})}
							</div>
							{/* 列表与底部操作之间靠留白分区，不画分隔线。 */}
							<div className="flex items-center gap-1">
								<SpaceSideAction
									icon="icon-[solar--add-linear]"
									label={t("spaces.new")}
									onClick={createSpace}
								/>
								<SpaceSideAction
									icon="icon-[solar--settings-minimalistic-linear]"
									label={t("spaces.spaceSettings")}
									onClick={() => {
										setOpen(false);
										void navigate({ to: "/settings/$tab", params: { tab: "spaces" } });
									}}
								/>
							</div>
						</PopoverContent>
					</Popover>
				) : (
					<ButtonGroupItem
						aria-label={t("spaces.new")}
						title={t("spaces.new")}
						icon={<span aria-hidden="true" className="icon-[solar--add-linear] size-4" />}
						onClick={createSpace}
					/>
				)}
			</ButtonGroup>
		</div>
	);
}

type SpaceStatus = "waiting" | "running" | "idle";

/** 有等待就是等待（画面上的问号优先），其次是运行；两者都没有就是空闲。 */
function statusOf(totals: { running: number; waiting: number } | undefined): SpaceStatus {
	if (!totals) return "idle";
	if (totals.waiting > 0) return "waiting";
	if (totals.running > 0) return "running";
	return "idle";
}

/** 把若干空间的状态收成一个：任何一个在等人就算等待，否则任何一个在跑就算运行。 */
function summarize(totals: readonly ({ running: number; waiting: number } | undefined)[]): {
	running: number;
	waiting: number;
} {
	let running = 0;
	let waiting = 0;
	for (const entry of totals) {
		running += entry?.running ?? 0;
		waiting += entry?.waiting ?? 0;
	}
	return { running, waiting };
}

/** 状态对应的悬停文案；空闲时没有文案。 */
function statusLabel(
	status: SpaceStatus,
	totals: { running: number; waiting: number } | undefined,
	countLabelOf: (status: "waiting" | "running", count: number) => string,
): string | undefined {
	if (status === "waiting") return countLabelOf("waiting", totals?.waiting ?? 0);
	if (status === "running") return countLabelOf("running", totals?.running ?? 0);
	return undefined;
}

/** 空间图标 + 右上角状态角标：问号优先，其次运行点；两者都用与项目行相同的呼吸样式。 */
function SpaceGlyphWithStatus({ spaceId, icon }: { spaceId: string; icon: SpaceIcon }): JSX.Element {
	const totals = useAtomValue(spaceActivityAtom).get(spaceId);
	const status = statusOf(totals);
	if (status === "idle") return <SpaceGlyph icon={icon} />;
	return (
		<span className="relative flex items-center justify-center">
			<SpaceGlyph icon={icon} />
			{status === "waiting" ? <WaitingPulseBadge /> : <RunningPulseDot />}
		</span>
	);
}

/** 「更多」按钮：被收纳的空间里有人在等 / 在跑时同样点灯。 */
function MoreDots({ hiddenStatus }: { hiddenStatus: SpaceStatus }): JSX.Element {
	if (hiddenStatus === "idle") {
		return <span aria-hidden="true" className="icon-[solar--menu-dots-linear] size-4" />;
	}
	return (
		<span className="relative flex items-center justify-center">
			<span aria-hidden="true" className="icon-[solar--menu-dots-linear] size-4" />
			{hiddenStatus === "waiting" ? <WaitingPulseBadge /> : <RunningPulseDot />}
		</span>
	);
}

/** 切换列表底部的一枚图标操作：等宽、带底色的圆角长条，不写文字，靠 aria-label / title 说明。 */
function SpaceSideAction({
	icon,
	label,
	onClick,
}: {
	readonly icon: string;
	readonly label: string;
	readonly onClick: () => void;
}): JSX.Element {
	return (
		<Button
			type="button"
			variant="secondary"
			size="sm"
			className="min-w-0 flex-1 justify-center"
			aria-label={label}
			title={label}
			onClick={onClick}
		>
			<span aria-hidden="true" className={cn(icon, "size-4 shrink-0")} />
		</Button>
	);
}
