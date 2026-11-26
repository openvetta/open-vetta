import { ProjectsPanelMenusView } from "@vetta-org/theme-ui/project/ProjectsPanelMenusView";
import { ConversationTagEditorDialog } from "../../../ConversationTagEditorDialog";
import { ManageSessionsSplash } from "../../../ManageSessionsSplash";
import { useProjectsPanelMenusModel } from "../../../../hooks/useProjectsPanelMenusModel";
import { useSidebarSessionViewMenu } from "../../../../hooks/useSidebarSessionViewMenu";
import { ProjectContextMenu } from "../../../ProjectContextMenu";
import { SessionContextMenu } from "../../../SessionContextMenu";
import type { ProjectsPanelModel } from "./types";

interface ProjectsPanelMenusProps {
	model: ProjectsPanelModel;
	/** 项目区标题不显示时，会话视图设置改由默认「对话」区的更多菜单提供。 */
	conversationMenuOwnsViewSettings: boolean;
}

export function ProjectsPanelMenus({ model, conversationMenuOwnsViewSettings }: ProjectsPanelMenusProps): JSX.Element {
	const menus = useProjectsPanelMenusModel(model);
	const viewSettingsItems = useSidebarSessionViewMenu(menus.actions.closeProjectMenu);

	return (
		<ProjectsPanelMenusView
			dialogs={
				<>
					<ConversationTagEditorDialog />
					<ManageSessionsSplash model={model} />
				</>
			}
			sessionMenu={
				menus.contextMenu ? (
					<SessionContextMenu
						allowMutations={menus.contextMenu.allowMutations}
						canTag={menus.contextMenu.canTag}
						independent={menus.contextMenu.independent}
						x={menus.contextMenu.x}
						y={menus.contextMenu.y}
						session={menus.contextMenu.session}
						onClose={menus.actions.closeSessionMenu}
						onDelete={menus.actions.deleteSession}
					/>
				) : null
			}
			projectMenu={
				menus.projectMenu ? (
					<ProjectContextMenu
						x={menus.projectMenu.x}
						y={menus.projectMenu.y}
						project={menus.projectMenu.project}
						onClose={menus.actions.closeProjectMenu}
						onArchive={menus.actions.archiveProject}
						onRemove={menus.actions.removeProject}
						onManageSessions={menus.actions.manageSessions}
						defaultScope={menus.defaultScope}
						onClearConversation={menus.actions.clearConversation}
						onClearClaw={menus.actions.clearClaw}
						onOpenClawSettings={menus.actions.openClawSettings}
						clearConversationDisabled={menus.clearConversationDisabled}
						clearClawDisabled={menus.clearClawDisabled}
						extraItems={
							conversationMenuOwnsViewSettings && menus.projectMenu.project.isDefault ? viewSettingsItems : undefined
						}
					/>
				) : null
			}
		/>
	);
}
