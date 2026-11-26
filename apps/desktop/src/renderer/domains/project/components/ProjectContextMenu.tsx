import type { Project } from "@shared/store/atoms";
import { ProjectContextMenuView } from "@vetta-org/theme-ui/project/ProjectContextMenuView";
import type { ContextMenuNode } from "@vetta-org/theme-ui/shared";
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
	/** 由所在面板追加的菜单项，例如默认「对话」区的会话视图设置。 */
	extraItems?: readonly ContextMenuNode[];
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
	extraItems = [],
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
	const items = move ? [...extraItems, move] : extraItems;
	return createPortal(<ProjectContextMenuView {...model} extraItems={items} x={x} y={y} />, document.body);
}
