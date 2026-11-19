import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { useShortcutBindings } from "@shared/hooks/useShortcutBinding";
import { shortcutParts } from "@shared/lib/platform";
import { getEffectiveShortcut } from "@shared/lib/shortcuts";
import { cn } from "@shared/lib/utils";
import { MAIN_SPACE, MAIN_SPACE_ICON, reorderSpace, SPACE_ICONS, spacesAtom } from "@shared/store/spaces";
import type { SpaceIcon } from "@shared/store/spaces";
import { Button } from "@vetta-org/ui/button";
import { ButtonGroup, ButtonGroupItem } from "@vetta-org/ui/button-group";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
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
	// 末尾固定留给切换列表按钮，剩下的位置放可直接点击的工作空间图标。
	const directCount = Math.min(state.spaces.length, Math.max(0, slots - 2));
	const items: SpaceListItem[] = [
		{ id: MAIN_SPACE, name: t("spaces.main"), icon: MAIN_SPACE_ICON },
		...state.spaces.map(({ id, name, icon }) => ({ id, name, icon })),
	];
	const hidden = state.spaces.slice(directCount);
	const hiddenSelected = hidden.some(({ id }) => id === state.selected);
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
					<PopoverContent side="top" align="start" className="w-56 p-1">
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
						<div className="my-1 h-px bg-border" />
						<Button
							type="button"
							variant="ghost"
							className="w-full justify-start"
							onClick={() => {
								setOpen(false);
								void navigate({ to: "/settings/$tab", params: { tab: "spaces" } });
							}}
						>
							<span aria-hidden="true" className="icon-[solar--settings-minimalistic-linear] size-4 shrink-0" />
							<span className="truncate">{t("spaces.spaceSettings")}</span>
						</Button>
					</PopoverContent>
				</Popover>
			</ButtonGroup>
		</div>
	);
}
