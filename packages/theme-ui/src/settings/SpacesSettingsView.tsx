import type { JSX, ReactNode } from "react";
import { Button } from "@vetta-org/ui";
import { SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface SpacesSettingsViewItem {
	readonly id: string;
	readonly name: string;
	readonly icon: ReactNode;
}

export interface SpacesSettingsViewLabels {
	readonly title: string;
	readonly newSpace: string;
	readonly edit: (name: string) => string;
	readonly remove: (name: string) => string;
	/** 主工作空间固定存在，只有名称与图标，没有移动、编辑和移除动作。 */
	readonly main: SpacesSettingsViewItem;
}

export interface SpacesSettingsViewProps {
	readonly labels: SpacesSettingsViewLabels;
	readonly section: SettingSectionMeta;
	readonly spaces: readonly SpacesSettingsViewItem[];
	readonly onCreate: () => void;
	readonly onEdit: (id: string) => void;
	readonly onRemove: (id: string) => void;
	readonly onReorder: (sourceId: string, targetId: string) => void;
}

function SpaceIconBadge({ children }: { children: ReactNode }): JSX.Element {
	return (
		<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
			{children}
		</span>
	);
}

export function SpacesSettingsView({
	labels,
	section,
	spaces,
	onCreate,
	onEdit,
	onRemove,
	onReorder,
}: SpacesSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<div className="mb-6 flex items-center justify-between gap-3">
				<h1 className="text-[20px] font-bold text-foreground">{labels.title}</h1>
				<Button size="sm" onClick={onCreate}>
					<span className="icon-[solar--add-circle-linear] size-4" aria-hidden="true" />
					{labels.newSpace}
				</Button>
			</div>

			<SettingSection section={section} title={null}>
				<div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
					<SpaceIconBadge>{labels.main.icon}</SpaceIconBadge>
					<div className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{labels.main.name}</div>
				</div>
				{spaces.map((space) => (
					<div
						key={space.id}
						className="flex items-center gap-2 border-b border-border px-5 py-3 last:border-b-0"
						draggable
						onDragStart={(event) => event.dataTransfer.setData("application/x-vetta-space", space.id)}
						onDragOver={(event) => event.preventDefault()}
						onDrop={(event) => {
							event.preventDefault();
							onReorder(event.dataTransfer.getData("application/x-vetta-space"), space.id);
						}}
					>
						<span
							aria-hidden="true"
							className="icon-[tabler--grip-vertical] size-4 shrink-0 cursor-grab text-muted-foreground/60"
						/>
						<SpaceIconBadge>{space.icon}</SpaceIconBadge>
						<div className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{space.name}</div>
						<div className="flex shrink-0 items-center gap-0.5">
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label={labels.edit(space.name)}
								title={labels.edit(space.name)}
								onClick={() => onEdit(space.id)}
							>
								<span className="icon-[solar--pen-2-linear] size-3.5" aria-hidden="true" />
							</Button>
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label={labels.remove(space.name)}
								title={labels.remove(space.name)}
								onClick={() => onRemove(space.id)}
							>
								<span className="icon-[solar--trash-bin-minimalistic-linear] size-3.5" aria-hidden="true" />
							</Button>
						</div>
					</div>
				))}
			</SettingSection>
		</div>
	);
}
