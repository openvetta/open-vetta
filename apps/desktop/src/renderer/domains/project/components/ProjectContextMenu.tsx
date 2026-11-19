import type { Project } from "@shared/store/atoms";
import { ProjectContextMenuView } from "@vetta-org/theme-ui/project/ProjectContextMenuView";
import { createPortal } from "react-dom";
import { useProjectContextMenuModel } from "../hooks/useProjectContextMenuModel";

import { useMoveSpaceMenu } from "../hooks/useMoveSpaceMenu";

interface ProjectContextMenuProps {
	x: number;
	y: number;
	project: Project;
	onClose: () => void;
	onArchive: (cwd: string) => void;
	onRemove: (cwd: string) => void;
	onManageSessions?: (project: Project) => void;
	defaultScope?: "conversation" | "claw";
	onClearConversation?: (cwd: string) => void;
	onClearClaw?: (cwd: string) => void;
	onOpenClawSettings?: () => void;
	clearConversationDisabled?: boolean;
	clearClawDisabled?: boolean;
}

export function ProjectContextMenu({
	x,
	y,
	project,
	onClose,
	onArchive,
	onRemove,
	onManageSessions,
	defaultScope,
	onClearConversation,
	onClearClaw,
	onOpenClawSettings,
	clearConversationDisabled,
	clearClawDisabled,
}: ProjectContextMenuProps): JSX.Element {
	const model = useProjectContextMenuModel({
		project,
		onClose,
		onArchive,
		onRemove,
		onManageSessions,
		defaultScope,
		onClearConversation,
		onClearClaw,
		onOpenClawSettings,
		clearConversationDisabled,
		clearClawDisabled,
	});
	const move = useMoveSpaceMenu(!project.isDefault && project.type !== "batch" ? { kind: "project", key: project.cwd } : undefined, onClose);
	return createPortal(<ProjectContextMenuView {...model} extraItems={move ? [move] : undefined} x={x} y={y} />, document.body);
}
