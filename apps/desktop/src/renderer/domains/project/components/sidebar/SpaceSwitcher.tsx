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
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpaceNavigation } from "../../hooks/useSpaceNavigation";

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
	return (
		<div ref={row} className="flex min-w-0 flex-1 items-center">
			<ButtonGroup blur={false} aria-label={t("spaces.settingsTitle")}>
				<ButtonGroupItem
					active={state.selected === MAIN_SPACE}
					aria-pressed={state.selected === MAIN_SPACE}
					aria-label={t("spaces.main")}
					title={t("spaces.main")}
					icon={<SpaceGlyph icon={MAIN_SPACE_ICON} />}
					onClick={() => void switchSpace(MAIN_SPACE)}
				/>
				{state.spaces.slice(0, directCount).map((space) => (
					<ButtonGroupItem
						key={space.id}
						active={state.selected === space.id}
						aria-pressed={state.selected === space.id}
						aria-label={space.name}
						title={space.name}
						icon={<SpaceGlyph icon={space.icon} />}
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
								aria-label={t("spaces.more")}
								title={t("spaces.more")}
								icon={<span aria-hidden="true" className="icon-[solar--menu-dots-linear] size-4" />}
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
											aria-label={space.name}
											aria-keyshortcuts={shortcut || undefined}
											onClick={() => {
												setOpen(false);
												void switchSpace(space.id);
											}}
										>
											<SpaceGlyph icon={space.icon} />
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
