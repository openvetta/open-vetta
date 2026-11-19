import type { JSX } from "react";
import { ContextMenuView, type ContextMenuNode } from "../shared/ContextMenuView";

export type ProjectContextMenuScope = "conversation" | "claw";

export interface ProjectContextMenuViewLabels {
	openInFolder: string;
	manageSessions: string;
	archiveProject: string;
	removeFromList: string;
	clearConversation: string;
	clearConversationDisabled: string;
	clearClaw: string;
	clearClawDisabled: string;
	clawSettings: string;
}

export interface ProjectContextMenuViewProps {
	canOpenInFolder?: boolean;
	clearClawDisabled?: boolean;
	clearConversationDisabled?: boolean;
	defaultScope?: ProjectContextMenuScope;
	extraItems?: readonly ContextMenuNode[];
	isDefault: boolean;
	labels: ProjectContextMenuViewLabels;
	onArchive: () => void;
	onClearClaw?: () => void;
	onClearConversation?: () => void;
	onClose: () => void;
	onManageSessions?: () => void;
	onOpenClawSettings?: () => void;
	onOpenInFolder: () => void;
	onRemove: () => void;
	x: number;
	y: number;
}

export function ProjectContextMenuView({
	canOpenInFolder = true,
	clearClawDisabled,
	clearConversationDisabled,
	defaultScope,
	extraItems = [],
	isDefault,
	labels,
	onArchive,
	onClearClaw,
	onClearConversation,
	onClose,
	onManageSessions,
	onOpenClawSettings,
	onOpenInFolder,
	onRemove,
	x,
	y,
}: ProjectContextMenuViewProps): JSX.Element {
	const items: ContextMenuNode[] = [];
	if (onManageSessions) items.push({ kind: "item", id: "manage", label: labels.manageSessions, iconClassName: "icon-[solar--checklist-minimalistic-linear]", onSelect: onManageSessions });
	if (!isDefault && canOpenInFolder) items.push({ kind: "item", id: "folder", label: labels.openInFolder, iconClassName: "icon-[solar--folder-open-linear]", onSelect: onOpenInFolder });
	items.push(...extraItems);
	if (isDefault && defaultScope === "conversation" && onClearConversation) items.push({
		kind: "item", id: "clear-conversation", label: labels.clearConversation, title: clearConversationDisabled ? labels.clearConversationDisabled : undefined,
		iconClassName: "icon-[solar--broom-linear]", danger: true, disabled: clearConversationDisabled, onSelect: onClearConversation,
	});
	if (isDefault && defaultScope === "claw") {
		if (onClearClaw) items.push({ kind: "item", id: "clear-claw", label: labels.clearClaw, title: clearClawDisabled ? labels.clearClawDisabled : undefined,
			iconClassName: "icon-[solar--broom-linear]", danger: true, disabled: clearClawDisabled, onSelect: onClearClaw });
		if (onOpenClawSettings) items.push({ kind: "item", id: "claw-settings", label: labels.clawSettings, iconClassName: "icon-[solar--settings-linear]", onSelect: onOpenClawSettings });
	}
	if (!isDefault) {
		if (items.length > 0) items.push({ kind: "separator", id: "project-actions" });
		items.push(
			{ kind: "item", id: "archive", label: labels.archiveProject, iconClassName: "icon-[solar--archive-minimalistic-linear]", onSelect: onArchive },
			{ kind: "item", id: "remove", label: labels.removeFromList, iconClassName: "icon-[solar--list-cross-minimalistic-linear]", onSelect: onRemove },
		);
	}
	return <ContextMenuView items={items} onClose={onClose} x={x} y={y} />;
}
